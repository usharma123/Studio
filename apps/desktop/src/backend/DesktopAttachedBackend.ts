import {
  bootstrapRemoteBearerSession,
  fetchRemoteSessionState,
} from "@t3tools/client-runtime/authorization";
import { fetchRemoteEnvironmentDescriptor } from "@t3tools/client-runtime/environment";
import {
  AuthQaApproverScopes,
  AuthQaMakerScopes,
  AuthQaRootScopes,
  type DesktopDevelopmentProfile,
} from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import { HttpClient } from "effect/unstable/http";

import type {
  BackendInstanceSpec,
  DesktopBackendStartConfig,
  DesktopBackendInstance,
  DesktopBackendSnapshot,
} from "./DesktopBackendManager.ts";
import * as DesktopObservability from "../app/DesktopObservability.ts";

const DEFAULT_ATTACHED_POLL_INTERVAL = Duration.millis(250);
const DEFAULT_ATTACHED_REQUEST_TIMEOUT_MS = 1_000;

interface AttachedBackendState {
  readonly desiredRunning: boolean;
  readonly ready: boolean;
  readonly monitorFiber: Option.Option<Fiber.Fiber<void, never>>;
}

export interface AttachedBackendInstanceSpec extends BackendInstanceSpec {
  readonly expectedEnvironmentId: string;
  readonly pollInterval?: Duration.Duration;
  readonly requestTimeoutMs?: number;
}

const initialState: AttachedBackendState = {
  desiredRunning: false,
  ready: false,
  monitorFiber: Option.none(),
};

/**
 * Builds a primary backend facade for an externally-owned process. The facade
 * owns only a descriptor monitor. It never spawns, terminates, or restarts the
 * backend represented by the configured endpoint.
 */
export const makeAttachedBackendInstance = Effect.fn("desktop.attachedBackend.make")(function* (
  spec: AttachedBackendInstanceSpec,
): Effect.fn.Return<DesktopBackendInstance, never, HttpClient.HttpClient | Scope.Scope> {
  const parentScope = yield* Scope.Scope;
  const httpClient = yield* HttpClient.HttpClient;
  const state = yield* Ref.make(initialState);
  const configRef = yield* Ref.make(Option.none<DesktopBackendStartConfig>());
  const bearerTokenRef = yield* Ref.make(Option.none<string>());
  const mutex = yield* Semaphore.make(1);
  const { logWarning } = DesktopObservability.makeComponentLogger(
    `desktop-attached-backend:${spec.id}`,
  );

  const transitionReady = (ready: boolean) =>
    Ref.modify(
      state,
      (current) =>
        [
          current.ready !== ready,
          current.ready === ready ? current : { ...current, ready },
        ] as const,
    ).pipe(
      Effect.flatMap((changed) => {
        if (!changed) return Effect.void;
        if (ready) {
          return Ref.get(configRef).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.void,
                onSome: (config) => spec.onReady?.(config.httpBaseUrl) ?? Effect.void,
              }),
            ),
            Effect.ignore,
          );
        }
        return (spec.onShutdown?.() ?? Effect.void).pipe(Effect.ignore);
      }),
    );

  const probe = Effect.gen(function* () {
    const config = yield* Ref.get(configRef);
    if (Option.isNone(config)) return;

    const descriptor = yield* fetchRemoteEnvironmentDescriptor({
      httpBaseUrl: config.value.httpBaseUrl.href,
      timeoutMs: spec.requestTimeoutMs ?? DEFAULT_ATTACHED_REQUEST_TIMEOUT_MS,
    }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.option);
    const descriptorMatches =
      Option.isSome(descriptor) && descriptor.value.environmentId === spec.expectedEnvironmentId;
    if (Option.isSome(descriptor) && !descriptorMatches) {
      yield* logWarning("attached backend environment id mismatch", {
        expectedEnvironmentId: spec.expectedEnvironmentId,
        actualEnvironmentId: descriptor.value.environmentId,
        endpoint: config.value.httpBaseUrl.href,
      });
    }
    if (!descriptorMatches) {
      yield* Ref.set(bearerTokenRef, Option.none());
      yield* transitionReady(false);
      return;
    }

    const credential = config.value.bootstrap.desktopBootstrapToken;
    const profile = config.value.bootstrap.developmentProfile;
    if (credential === undefined || profile === undefined) {
      yield* Ref.set(bearerTokenRef, Option.none());
      yield* transitionReady(false);
      return;
    }
    const expectedAuthorization = expectedProfileAuthorization(profile);
    const existingBearer = yield* Ref.get(bearerTokenRef);
    const bearer = yield* Option.match(existingBearer, {
      onSome: Effect.succeed,
      onNone: () =>
        bootstrapRemoteBearerSession({
          httpBaseUrl: config.value.httpBaseUrl.href,
          credential,
          clientMetadata: {
            label: `T3 Code Desktop (${profile})`,
            deviceType: "desktop",
          },
          timeoutMs: spec.requestTimeoutMs ?? DEFAULT_ATTACHED_REQUEST_TIMEOUT_MS,
        }).pipe(
          Effect.provideService(HttpClient.HttpClient, httpClient),
          Effect.map((session) => session.access_token),
        ),
    }).pipe(Effect.option);
    if (Option.isNone(bearer)) {
      yield* Ref.set(bearerTokenRef, Option.none());
      yield* transitionReady(false);
      return;
    }
    const session = yield* fetchRemoteSessionState({
      httpBaseUrl: config.value.httpBaseUrl.href,
      bearerToken: bearer.value,
      timeoutMs: spec.requestTimeoutMs ?? DEFAULT_ATTACHED_REQUEST_TIMEOUT_MS,
    }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.option);
    const sessionMatches =
      Option.isSome(session) &&
      session.value.authenticated &&
      session.value.subject === expectedAuthorization.subject &&
      scopesEqual(session.value.scopes ?? [], expectedAuthorization.scopes);
    if (!sessionMatches) {
      yield* Ref.set(bearerTokenRef, Option.none());
      yield* transitionReady(false);
      return;
    }
    yield* Ref.set(bearerTokenRef, bearer);
    yield* transitionReady(true);
  });

  const monitor = probe.pipe(
    Effect.andThen(Effect.sleep(spec.pollInterval ?? DEFAULT_ATTACHED_POLL_INTERVAL)),
    Effect.forever,
    Effect.ensuring(transitionReady(false)),
  );

  const start = mutex.withPermits(1)(
    Effect.gen(function* () {
      const current = yield* Ref.get(state);
      if (current.desiredRunning) return;

      const config = yield* spec.configResolve.pipe(Effect.option);
      if (Option.isNone(config)) return;
      yield* Ref.set(configRef, config);
      yield* Ref.set(state, {
        desiredRunning: true,
        ready: false,
        monitorFiber: Option.none(),
      });
      const fiber = yield* monitor.pipe(Effect.forkIn(parentScope));
      yield* Ref.update(state, (latest) => ({
        ...latest,
        monitorFiber: Option.some(fiber),
      }));
    }),
  );

  const stop = () =>
    mutex.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* Ref.getAndSet(state, initialState);
        yield* Ref.set(bearerTokenRef, Option.none());
        yield* Option.match(current.monitorFiber, {
          onNone: () => Effect.void,
          onSome: (fiber) => Fiber.interrupt(fiber).pipe(Effect.asVoid),
        });
        if (current.ready) {
          yield* spec.onShutdown?.() ?? Effect.void;
        }
      }).pipe(Effect.ignore),
    );

  const snapshot = Ref.get(state).pipe(
    Effect.map(
      (current): DesktopBackendSnapshot => ({
        desiredRunning: current.desiredRunning,
        ready: current.ready,
        activePid: Option.none(),
        restartAttempt: 0,
        restartScheduled: false,
      }),
    ),
  );
  const waitForReady = (timeout: Duration.Duration): Effect.Effect<boolean> =>
    Ref.get(state).pipe(
      Effect.map((current) => ({
        done: current.ready || !current.desiredRunning,
        ready: current.ready,
      })),
      Effect.repeat({
        until: (status) => status.done,
        schedule: Schedule.spaced(Duration.millis(50)),
      }),
      Effect.map((status) => status.ready),
      Effect.timeoutOption(timeout),
      Effect.map(Option.getOrElse(() => false)),
    );

  yield* Effect.addFinalizer(() => stop());

  return {
    id: spec.id,
    label: spec.label,
    start,
    stop,
    currentConfig: Ref.get(configRef),
    currentBearerToken: Ref.get(bearerTokenRef),
    snapshot,
    waitForReady,
  } satisfies DesktopBackendInstance;
});

function expectedProfileAuthorization(profile: DesktopDevelopmentProfile) {
  switch (profile) {
    case "root":
      return { subject: "local:root", scopes: AuthQaRootScopes } as const;
    case "qa:maker":
      return { subject: "local:qa:maker", scopes: AuthQaMakerScopes } as const;
    case "qa:approver":
      return { subject: "local:qa:approver", scopes: AuthQaApproverScopes } as const;
  }
}

function scopesEqual(actual: ReadonlyArray<string>, expected: ReadonlyArray<string>): boolean {
  return actual.length === expected.length && expected.every((scope) => actual.includes(scope));
}
