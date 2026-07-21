import { AuthQaMakerScopes, PRIMARY_LOCAL_ENVIRONMENT_ID } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import * as DesktopAttachedBackend from "./DesktopAttachedBackend.ts";
import * as DesktopBackendManager from "./DesktopBackendManager.ts";

const CREDENTIAL = "a".repeat(48);

const attachedConfig = {
  executablePath: "",
  args: [],
  entryPath: "",
  cwd: "/repo",
  env: {},
  extendEnv: false,
  bootstrap: {
    mode: "desktop",
    noBrowser: true,
    port: 13_773,
    host: "127.0.0.1",
    desktopBootstrapToken: CREDENTIAL,
    developmentProfile: "qa:maker",
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
  },
  bootstrapDelivery: "fd3",
  httpBaseUrl: new URL("http://127.0.0.1:13773"),
  captureOutput: false,
  preflightFailure: Option.none(),
} satisfies DesktopBackendManager.DesktopBackendStartConfig;

const descriptor = (environmentId: string) => ({
  environmentId,
  label: "Shared QA backend",
  platform: { os: "darwin", arch: "arm64" },
  serverVersion: "0.0.0-test",
  capabilities: { repositoryIdentity: true },
});

const session = (subject = "local:qa:maker") => ({
  authenticated: true,
  auth: {
    policy: "desktop-managed-local",
    bootstrapMethods: ["desktop-bootstrap"],
    sessionMethods: ["bearer-access-token"],
    sessionCookieName: "t3_session",
  },
  subject,
  scopes: AuthQaMakerScopes,
  sessionMethod: "bearer-access-token",
  expiresAt: "2026-07-17T12:00:00.000Z",
});

describe("DesktopAttachedBackend", () => {
  it.effect("checks descriptor identity before exchanging and reconnects without a process", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const environmentId = yield* Ref.make("unexpected-environment");
        const requestPaths = yield* Ref.make<readonly string[]>([]);
        const tokenExchangeCount = yield* Ref.make(0);
        const readyCount = yield* Ref.make(0);
        const notReadyCount = yield* Ref.make(0);
        const httpLayer = Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Effect.gen(function* () {
              const url = new URL(request.url);
              yield* Ref.update(requestPaths, (paths) => [...paths, url.pathname]);
              const response =
                url.pathname === "/.well-known/t3/environment"
                  ? Response.json(descriptor(yield* Ref.get(environmentId)))
                  : url.pathname === "/oauth/token"
                    ? Response.json({
                        access_token: `maker-bearer-${yield* Ref.updateAndGet(
                          tokenExchangeCount,
                          (count) => count + 1,
                        )}`,
                        issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
                        token_type: "Bearer",
                        expires_in: 3600,
                        scope: AuthQaMakerScopes.join(" "),
                      })
                    : Response.json(session());
              return HttpClientResponse.fromWeb(request, response);
            }),
          ),
        );

        const instance = yield* DesktopAttachedBackend.makeAttachedBackendInstance({
          id: DesktopBackendManager.BackendInstanceId(PRIMARY_LOCAL_ENVIRONMENT_ID),
          label: Effect.succeed("Shared QA backend"),
          configResolve: Effect.succeed(attachedConfig),
          expectedEnvironmentId: "expected-environment",
          pollInterval: Duration.millis(5),
          requestTimeoutMs: 100,
          onReady: () => Ref.update(readyCount, (count) => count + 1),
          onShutdown: () => Ref.update(notReadyCount, (count) => count + 1),
        }).pipe(Effect.provide(httpLayer));

        yield* instance.start;
        yield* TestClock.adjust(Duration.millis(30));
        assert.isFalse((yield* instance.snapshot).ready);
        assert.isTrue(Option.isNone((yield* instance.snapshot).activePid));
        assert.notInclude(yield* Ref.get(requestPaths), "/oauth/token");

        yield* Ref.set(environmentId, "expected-environment");
        yield* TestClock.adjust(Duration.millis(100));
        assert.isTrue((yield* instance.snapshot).ready);
        assert.include(yield* Ref.get(requestPaths), "/oauth/token");
        assert.include(yield* Ref.get(requestPaths), "/api/auth/session");
        const currentBearerToken = instance.currentBearerToken;
        if (currentBearerToken === undefined) assert.fail("expected attached bearer token state");
        assert.deepEqual(yield* currentBearerToken, Option.some("maker-bearer-1"));
        assert.equal(yield* Ref.get(tokenExchangeCount), 1);
        assert.equal(yield* Ref.get(readyCount), 1);

        yield* Ref.set(environmentId, "unexpected-environment");
        yield* TestClock.adjust(Duration.millis(30));
        assert.isFalse((yield* instance.snapshot).ready);
        assert.isTrue(Option.isNone((yield* instance.snapshot).activePid));
        assert.deepEqual(yield* currentBearerToken, Option.none());
        assert.equal(yield* Ref.get(notReadyCount), 1);

        yield* Ref.set(environmentId, "expected-environment");
        yield* TestClock.adjust(Duration.millis(100));
        assert.isTrue((yield* instance.snapshot).ready);
        assert.isTrue(Option.isNone((yield* instance.snapshot).activePid));
        assert.deepEqual(yield* currentBearerToken, Option.some("maker-bearer-2"));
        assert.equal(yield* Ref.get(tokenExchangeCount), 2);
        assert.equal(yield* Ref.get(readyCount), 2);
        assert.equal(yield* Ref.get(notReadyCount), 1);

        yield* instance.stop();
        assert.isFalse((yield* instance.snapshot).desiredRunning);
        assert.isTrue(Option.isNone((yield* instance.snapshot).activePid));
        assert.deepEqual(yield* currentBearerToken, Option.none());
        assert.equal(yield* Ref.get(notReadyCount), 2);
      }).pipe(Effect.provide(TestClock.layer())),
    ),
  );

  it.effect("fails closed when the authenticated subject does not match the client profile", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const httpLayer = Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) => {
            const pathname = new URL(request.url).pathname;
            const response =
              pathname === "/.well-known/t3/environment"
                ? Response.json(descriptor("expected-environment"))
                : pathname === "/oauth/token"
                  ? Response.json({
                      access_token: "wrong-bearer",
                      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
                      token_type: "Bearer",
                      expires_in: 3600,
                      scope: AuthQaMakerScopes.join(" "),
                    })
                  : Response.json(session("local:root"));
            return Effect.succeed(HttpClientResponse.fromWeb(request, response));
          }),
        );
        const instance = yield* DesktopAttachedBackend.makeAttachedBackendInstance({
          id: DesktopBackendManager.BackendInstanceId(PRIMARY_LOCAL_ENVIRONMENT_ID),
          label: Effect.succeed("Shared QA backend"),
          configResolve: Effect.succeed(attachedConfig),
          expectedEnvironmentId: "expected-environment",
          pollInterval: Duration.millis(5),
          requestTimeoutMs: 100,
        }).pipe(Effect.provide(httpLayer));

        yield* instance.start;
        yield* TestClock.adjust(Duration.millis(40));
        assert.isFalse((yield* instance.snapshot).ready);
        const currentBearerToken = instance.currentBearerToken;
        if (currentBearerToken === undefined) assert.fail("expected attached bearer token state");
        assert.deepEqual(yield* currentBearerToken, Option.none());
      }).pipe(Effect.provide(TestClock.layer())),
    ),
  );

  it.effect("revalidates and replaces a revoked bearer while attached", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstBearerRevoked = yield* Ref.make(false);
        const tokenExchangeCount = yield* Ref.make(0);
        const sessionCheckCount = yield* Ref.make(0);
        const readyCount = yield* Ref.make(0);
        const notReadyCount = yield* Ref.make(0);
        const httpLayer = Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Effect.gen(function* () {
              const pathname = new URL(request.url).pathname;
              const response =
                pathname === "/.well-known/t3/environment"
                  ? Response.json(descriptor("expected-environment"))
                  : pathname === "/oauth/token"
                    ? Response.json({
                        access_token: `maker-bearer-${yield* Ref.updateAndGet(
                          tokenExchangeCount,
                          (count) => count + 1,
                        )}`,
                        issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
                        token_type: "Bearer",
                        expires_in: 3600,
                        scope: AuthQaMakerScopes.join(" "),
                      })
                    : yield* Effect.gen(function* () {
                        yield* Ref.update(sessionCheckCount, (count) => count + 1);
                        const bearer = request.headers.authorization;
                        if (
                          bearer === "Bearer maker-bearer-1" &&
                          (yield* Ref.get(firstBearerRevoked))
                        ) {
                          return Response.json({
                            authenticated: false,
                            auth: session().auth,
                          });
                        }
                        return Response.json(session());
                      });
              return HttpClientResponse.fromWeb(request, response);
            }),
          ),
        );

        const instance = yield* DesktopAttachedBackend.makeAttachedBackendInstance({
          id: DesktopBackendManager.BackendInstanceId(PRIMARY_LOCAL_ENVIRONMENT_ID),
          label: Effect.succeed("Shared QA backend"),
          configResolve: Effect.succeed(attachedConfig),
          expectedEnvironmentId: "expected-environment",
          pollInterval: Duration.millis(5),
          requestTimeoutMs: 100,
          onReady: () => Ref.update(readyCount, (count) => count + 1),
          onShutdown: () => Ref.update(notReadyCount, (count) => count + 1),
        }).pipe(Effect.provide(httpLayer));

        yield* instance.start;
        yield* TestClock.adjust(Duration.millis(30));
        assert.isTrue((yield* instance.snapshot).ready);
        const currentBearerToken = instance.currentBearerToken;
        if (currentBearerToken === undefined) assert.fail("expected attached bearer token state");
        assert.deepEqual(yield* currentBearerToken, Option.some("maker-bearer-1"));
        const checksBeforeRevocation = yield* Ref.get(sessionCheckCount);
        assert.isAbove(checksBeforeRevocation, 0);

        yield* Ref.set(firstBearerRevoked, true);
        yield* TestClock.adjust(Duration.millis(50));

        assert.isTrue((yield* instance.snapshot).ready);
        assert.deepEqual(yield* currentBearerToken, Option.some("maker-bearer-2"));
        assert.equal(yield* Ref.get(tokenExchangeCount), 2);
        assert.isAbove(yield* Ref.get(sessionCheckCount), checksBeforeRevocation);
        assert.equal(yield* Ref.get(notReadyCount), 1);
        assert.equal(yield* Ref.get(readyCount), 2);
      }).pipe(Effect.provide(TestClock.layer())),
    ),
  );
});
