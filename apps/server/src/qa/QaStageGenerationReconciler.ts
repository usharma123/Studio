import {
  ThreadId,
  type ProviderRuntimeEvent,
  type QaOperationError,
  type QaReleaseSnapshot,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ProviderService } from "../provider/Services/ProviderService.ts";
import { QaIam, type QaIamError } from "./QaIam.ts";
import { QaReleaseEventBus } from "./QaReleaseEventBus.ts";
import { QaWorkflow } from "./QaWorkflow.ts";

export const QA_STAGE_GENERATION_LEASE_MINUTES = 30;
export const QA_STAGE_GENERATION_SWEEP_INTERVAL = Duration.minutes(5);

export function isQaStageGenerationTerminalEvent(event: ProviderRuntimeEvent): boolean {
  switch (event.type) {
    case "turn.completed":
    case "turn.aborted":
    case "session.exited":
      return true;
    case "session.state.changed":
      return event.payload.state === "stopped" || event.payload.state === "error";
    default:
      return false;
  }
}

function logReconciliationFailure<E>(
  message: string,
  cause: Cause.Cause<E>,
  annotations: Readonly<Record<string, unknown>> = {},
): Effect.Effect<void> {
  if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
  return Effect.logWarning(message, { ...annotations, cause: Cause.pretty(cause) });
}

export interface QaStageGenerationReconcilerShape {
  readonly reconcileEvent: (
    event: ProviderRuntimeEvent,
  ) => Effect.Effect<void, QaIamError | QaOperationError>;
  readonly recoverStaleClaims: Effect.Effect<void, QaOperationError>;
  readonly start: Effect.Effect<void, never, Scope.Scope>;
}

export const makeQaStageGenerationReconciler = Effect.gen(function* () {
  const providerService = yield* ProviderService;
  const serverEnvironment = yield* ServerEnvironment;
  const iam = yield* QaIam;
  const workflow = yield* QaWorkflow;
  const eventBus = yield* QaReleaseEventBus;
  const environmentId = yield* serverEnvironment.getEnvironmentId;

  const publishRecoveredSnapshot = (snapshot: QaReleaseSnapshot, at: string): Effect.Effect<void> =>
    eventBus.publish({
      type: "updated",
      releaseId: snapshot.releaseId,
      threadId: snapshot.threadId,
      revision: snapshot.revision,
      reason: "stage_blocked",
      snapshot,
      at,
    });

  const reconcileEvent = Effect.fn("QaStageGenerationReconciler.reconcileEvent")(function* (
    event: ProviderRuntimeEvent,
  ) {
    if (!isQaStageGenerationTerminalEvent(event)) return;

    const conversation = yield* iam
      .resolveConversationContext({
        conversationThreadId: event.threadId,
        environmentId,
      })
      .pipe(
        Effect.map((access) => access as typeof access | null),
        Effect.catch((error) =>
          error.code === "conversation_not_found" ? Effect.succeed(null) : Effect.fail(error),
        ),
      );
    if (conversation === null) return;

    const result = yield* workflow.releaseAgentStageGenerationForOwner(
      ThreadId.make(conversation.releaseThreadId),
      {
        environmentId,
        conversationThreadId: event.threadId,
      },
    );
    if (!result.released) return;
    yield* publishRecoveredSnapshot(result.snapshot, event.createdAt);
  });

  const recoverStaleClaims = Effect.gen(function* () {
    const now = yield* DateTime.now;
    const updatedBefore = DateTime.formatIso(
      DateTime.subtract(now, { minutes: QA_STAGE_GENERATION_LEASE_MINUTES }),
    );
    const snapshots = yield* workflow.recoverStaleAgentStageGenerations({
      environmentId,
      updatedBefore,
    });
    const at = DateTime.formatIso(now);
    yield* Effect.forEach(snapshots, (snapshot) => publishRecoveredSnapshot(snapshot, at), {
      concurrency: 1,
      discard: true,
    });
    if (snapshots.length > 0) {
      yield* Effect.logInfo("Recovered stale QA stage generation claims.", {
        environmentId,
        count: snapshots.length,
      });
    }
  });

  const reconcileEventSafely = (event: ProviderRuntimeEvent) =>
    reconcileEvent(event).pipe(
      Effect.catchCause((cause) =>
        logReconciliationFailure("Failed to reconcile a terminal QA provider event.", cause, {
          environmentId,
          eventType: event.type,
          conversationThreadId: event.threadId,
        }),
      ),
    );

  const recoverStaleClaimsSafely = recoverStaleClaims.pipe(
    Effect.catchCause((cause) =>
      logReconciliationFailure("Failed to recover stale QA stage generation claims.", cause, {
        environmentId,
      }),
    ),
  );

  const start = Effect.gen(function* () {
    yield* recoverStaleClaimsSafely;
    yield* Stream.runForEach(providerService.streamEvents, reconcileEventSafely).pipe(
      Effect.forkScoped,
    );
    yield* Effect.forever(
      Effect.sleep(QA_STAGE_GENERATION_SWEEP_INTERVAL).pipe(
        Effect.andThen(recoverStaleClaimsSafely),
      ),
    ).pipe(Effect.forkScoped);
  });

  return {
    reconcileEvent,
    recoverStaleClaims,
    start,
  } satisfies QaStageGenerationReconcilerShape;
});

/** Starts terminal-event reconciliation and the durable stale-claim lease sweep. */
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const reconciler = yield* makeQaStageGenerationReconciler;
    yield* reconciler.start;
  }),
);
