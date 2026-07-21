import { it } from "@effect/vitest";
import type { QaAssignedReleaseDashboard } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { expect } from "vite-plus/test";

import type { QaDashboardQueryShape } from "./QaDashboardQuery.ts";
import { QaIamError, type QaIam } from "./QaIam.ts";
import type { QaReleaseEventBusShape, QaReleaseEventSignal } from "./QaReleaseEventBus.ts";
import { subscribeAssignedReleaseDashboard } from "./QaAssignedReleaseDashboardStream.ts";

const dashboard = (subject: string, revision: number): QaAssignedReleaseDashboard =>
  ({
    releases: [],
    awaitingReviewCount: revision,
    completedSince: "2026-06-17T00:00:00.000Z",
    generatedAt: `2026-07-17T00:00:0${revision}.000Z`,
  }) as QaAssignedReleaseDashboard;

const signal = (threadId: string): QaReleaseEventSignal => ({
  releaseId: threadId,
  threadId,
  revision: 2,
  reason: "proposal_received",
  at: "2026-07-17T00:00:02.000Z",
});

it.effect("a maker release event immediately refreshes root and approver dashboards", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const pubSub = yield* PubSub.unbounded<QaReleaseEventSignal>();
      const initialQueriesReady = yield* Deferred.make<void>();
      const queryCount = yield* Ref.make(0);
      const eventBus: QaReleaseEventBusShape = {
        publish: () => Effect.void,
        events: Stream.fromPubSub(pubSub),
        subscribeEvents: PubSub.subscribe(pubSub),
      };
      const iam = {
        authorizeRelease: ({
          subject,
          releaseThreadId,
        }: {
          subject: string;
          releaseThreadId: string;
        }) =>
          releaseThreadId === "release-maker-event" &&
          (subject === "local:root" || subject === "local:qa:approver")
            ? Effect.succeed({})
            : Effect.fail(
                new QaIamError({
                  code: "project_access_denied",
                  message: "Not assigned to this project.",
                }),
              ),
      } as unknown as QaIam["Service"];
      const dashboardQuery = {
        listAssignedReleases: ({ subject }: { readonly subject: string }) =>
          Ref.updateAndGet(queryCount, (count) => count + 1).pipe(
            Effect.tap((count) =>
              count === 2 ? Deferred.succeed(initialQueriesReady, undefined) : Effect.void,
            ),
            Effect.map((count) => dashboard(subject, count)),
          ),
      } as unknown as QaDashboardQueryShape;

      const collectFor = (subject: string) =>
        subscribeAssignedReleaseDashboard({ subject, dashboardQuery, iam, eventBus }).pipe(
          Stream.take(2),
          Stream.runCollect,
          Effect.forkScoped,
        );
      const root = yield* collectFor("local:root");
      const approver = yield* collectFor("local:qa:approver");

      yield* Deferred.await(initialQueriesReady);
      yield* PubSub.publish(pubSub, signal("release-maker-event"));

      const [rootDashboards, approverDashboards] = yield* Effect.all([
        Fiber.join(root),
        Fiber.join(approver),
      ]);
      expect(rootDashboards.length).toBe(2);
      expect(approverDashboards.length).toBe(2);
      expect(rootDashboards[1]?.awaitingReviewCount).toBeGreaterThan(
        rootDashboards[0]?.awaitingReviewCount ?? 0,
      );
      expect(approverDashboards[1]?.awaitingReviewCount).toBeGreaterThan(
        approverDashboards[0]?.awaitingReviewCount ?? 0,
      );
      expect(yield* Ref.get(queryCount)).toBe(4);
    }),
  ),
);

it.effect("an unauthorized project event neither emits nor refreshes the dashboard query", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const pubSub = yield* PubSub.unbounded<QaReleaseEventSignal>();
      const initialQueryReady = yield* Deferred.make<void>();
      const unauthorizedEventChecked = yield* Deferred.make<void>();
      const queryCount = yield* Ref.make(0);
      const eventBus: QaReleaseEventBusShape = {
        publish: () => Effect.void,
        events: Stream.fromPubSub(pubSub),
        subscribeEvents: PubSub.subscribe(pubSub),
      };
      const iam = {
        authorizeRelease: ({ releaseThreadId }: { releaseThreadId: string }) =>
          releaseThreadId === "release-assigned"
            ? Effect.succeed({})
            : Deferred.succeed(unauthorizedEventChecked, undefined).pipe(
                Effect.andThen(
                  Effect.fail(
                    new QaIamError({
                      code: "project_access_denied",
                      message: "Not assigned to this project.",
                    }),
                  ),
                ),
              ),
      } as unknown as QaIam["Service"];
      const dashboardQuery = {
        listAssignedReleases: ({ subject }: { readonly subject: string }) =>
          Ref.updateAndGet(queryCount, (count) => count + 1).pipe(
            Effect.tap((count) =>
              count === 1 ? Deferred.succeed(initialQueryReady, undefined) : Effect.void,
            ),
            Effect.map((count) => dashboard(subject, count)),
          ),
      } as unknown as QaDashboardQueryShape;

      const collector = yield* subscribeAssignedReleaseDashboard({
        subject: "local:qa:approver",
        dashboardQuery,
        iam,
        eventBus,
      }).pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped);

      yield* Deferred.await(initialQueryReady);
      yield* PubSub.publish(pubSub, signal("release-not-assigned"));
      yield* Deferred.await(unauthorizedEventChecked);
      expect(yield* Ref.get(queryCount)).toBe(1);

      yield* PubSub.publish(pubSub, signal("release-assigned"));
      const dashboards = yield* Fiber.join(collector);
      expect(dashboards.length).toBe(2);
      expect(yield* Ref.get(queryCount)).toBe(2);
    }),
  ),
);

it.effect("buffers release events that arrive while the initial dashboard is loading", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const pubSub = yield* PubSub.unbounded<QaReleaseEventSignal>();
      const initialQueryStarted = yield* Deferred.make<void>();
      const releaseInitialQuery = yield* Deferred.make<void>();
      const queryCount = yield* Ref.make(0);
      const eventBus: QaReleaseEventBusShape = {
        publish: () => Effect.void,
        events: Stream.fromPubSub(pubSub),
        subscribeEvents: PubSub.subscribe(pubSub),
      };
      const iam = {
        authorizeRelease: () => Effect.succeed({}),
      } as unknown as QaIam["Service"];
      const dashboardQuery = {
        listAssignedReleases: ({ subject }: { readonly subject: string }) =>
          Ref.updateAndGet(queryCount, (count) => count + 1).pipe(
            Effect.tap((count) =>
              count === 1 ? Deferred.succeed(initialQueryStarted, undefined) : Effect.void,
            ),
            Effect.tap((count) =>
              count === 1 ? Deferred.await(releaseInitialQuery) : Effect.void,
            ),
            Effect.map((count) => dashboard(subject, count)),
          ),
      } as unknown as QaDashboardQueryShape;

      const collector = yield* subscribeAssignedReleaseDashboard({
        subject: "local:qa:approver",
        dashboardQuery,
        iam,
        eventBus,
      }).pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped);

      yield* Deferred.await(initialQueryStarted);
      yield* PubSub.publish(pubSub, signal("release-during-initial-query"));
      yield* Deferred.succeed(releaseInitialQuery, undefined);

      const dashboards = yield* Fiber.join(collector);
      expect(dashboards.length).toBe(2);
      expect(yield* Ref.get(queryCount)).toBe(2);
    }),
  ),
);

it.effect("drops a failed authorization refresh and recovers on the next authorized event", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const pubSub = yield* PubSub.unbounded<QaReleaseEventSignal>();
      const initialQueryReady = yield* Deferred.make<void>();
      const failedAuthorizationChecked = yield* Deferred.make<void>();
      const queryCount = yield* Ref.make(0);
      const eventBus: QaReleaseEventBusShape = {
        publish: () => Effect.void,
        events: Stream.fromPubSub(pubSub),
        subscribeEvents: PubSub.subscribe(pubSub),
      };
      const iam = {
        authorizeRelease: ({ releaseThreadId }: { releaseThreadId: string }) =>
          releaseThreadId === "release-authorization-failed"
            ? Deferred.succeed(failedAuthorizationChecked, undefined).pipe(
                Effect.andThen(
                  Effect.fail(
                    new QaIamError({
                      code: "persistence_error",
                      message: "IAM persistence failed.",
                    }),
                  ),
                ),
              )
            : Effect.succeed({}),
      } as unknown as QaIam["Service"];
      const dashboardQuery = {
        listAssignedReleases: ({ subject }: { readonly subject: string }) =>
          Ref.updateAndGet(queryCount, (count) => count + 1).pipe(
            Effect.tap(() => Deferred.succeed(initialQueryReady, undefined)),
            Effect.map((count) => dashboard(subject, count)),
          ),
      } as unknown as QaDashboardQueryShape;

      const collector = yield* subscribeAssignedReleaseDashboard({
        subject: "local:qa:approver",
        dashboardQuery,
        iam,
        eventBus,
      }).pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped);

      yield* Deferred.await(initialQueryReady);
      yield* PubSub.publish(pubSub, signal("release-authorization-failed"));
      yield* Deferred.await(failedAuthorizationChecked);
      expect(yield* Ref.get(queryCount)).toBe(1);

      yield* PubSub.publish(pubSub, signal("release-authorization-recovered"));
      const dashboards = yield* Fiber.join(collector);
      expect(dashboards.length).toBe(2);
      expect(yield* Ref.get(queryCount)).toBe(2);
    }),
  ),
);
