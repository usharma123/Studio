import {
  EnvironmentId,
  EventId,
  ProviderDriverKind,
  ThreadId,
  type ProviderRuntimeEvent,
  type QaReleaseSnapshot,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ProviderService } from "../provider/Services/ProviderService.ts";
import { QaIam, QaIamError } from "./QaIam.ts";
import { QaReleaseEventBus, type QaReleaseEventSignal } from "./QaReleaseEventBus.ts";
import { QaWorkflow } from "./QaWorkflow.ts";
import {
  isQaStageGenerationTerminalEvent,
  makeQaStageGenerationReconciler,
} from "./QaStageGenerationReconciler.ts";

const environmentId = EnvironmentId.make("environment-qa-generation-reconciler");
const conversationThreadId = ThreadId.make("conversation-qa-generation-reconciler");
const releaseThreadId = ThreadId.make("release-qa-generation-reconciler");

const eventBase = {
  eventId: EventId.make("event-qa-generation-reconciler"),
  provider: ProviderDriverKind.make("codex"),
  threadId: conversationThreadId,
  createdAt: "2026-07-16T12:00:00.000Z",
} as const;

const snapshot = {
  releaseId: releaseThreadId,
  threadId: releaseThreadId,
  revision: 8,
} as unknown as QaReleaseSnapshot;

function makeHarness(input: { readonly released: boolean; readonly bound?: boolean }) {
  const publish = vi.fn(() => Effect.void);
  const release = vi.fn(() => Effect.succeed({ released: input.released, snapshot }));
  const resolveConversationContext = vi.fn(() =>
    input.bound === false
      ? Effect.fail(
          new QaIamError({
            code: "conversation_not_found",
            message: "No bound QA conversation.",
          }),
        )
      : Effect.succeed({
          releaseThreadId,
          conversation: {
            releaseThreadId,
            conversationThreadId,
            environmentId,
            principalId: "principal-qa-reconciler",
          },
        }),
  );
  const dependencies = Layer.mergeAll(
    Layer.succeed(
      ProviderService,
      ProviderService.of({ streamEvents: Stream.empty } as unknown as Parameters<
        typeof ProviderService.of
      >[0]),
    ),
    Layer.succeed(
      ServerEnvironment,
      ServerEnvironment.of({
        getEnvironmentId: Effect.succeed(environmentId),
      } as Parameters<typeof ServerEnvironment.of>[0]),
    ),
    Layer.succeed(
      QaIam,
      QaIam.of({ resolveConversationContext } as unknown as Parameters<typeof QaIam.of>[0]),
    ),
    Layer.succeed(
      QaWorkflow,
      QaWorkflow.of({
        releaseAgentStageGenerationForOwner: release,
        recoverStaleAgentStageGenerations: () => Effect.succeed([]),
      } as unknown as Parameters<typeof QaWorkflow.of>[0]),
    ),
    Layer.succeed(
      QaReleaseEventBus,
      QaReleaseEventBus.of({
        publish,
        events: Stream.empty,
        subscribeEvents: Effect.flatMap(PubSub.unbounded<QaReleaseEventSignal>(), PubSub.subscribe),
      }),
    ),
  );

  const reconcile = (event: ProviderRuntimeEvent) =>
    makeQaStageGenerationReconciler.pipe(
      Effect.flatMap((reconciler) => reconciler.reconcileEvent(event)),
      Effect.provide(dependencies),
    );

  return { publish, reconcile, release, resolveConversationContext };
}

describe("QaStageGenerationReconciler", () => {
  it("recognizes terminal turn and session outcomes only", () => {
    expect(
      isQaStageGenerationTerminalEvent({
        ...eventBase,
        type: "turn.completed",
        payload: { state: "completed" },
      }),
    ).toBe(true);
    expect(
      isQaStageGenerationTerminalEvent({
        ...eventBase,
        type: "turn.aborted",
        payload: { reason: "interrupted" },
      }),
    ).toBe(true);
    expect(
      isQaStageGenerationTerminalEvent({
        ...eventBase,
        type: "session.state.changed",
        payload: { state: "error" },
      }),
    ).toBe(true);
    expect(
      isQaStageGenerationTerminalEvent({
        ...eventBase,
        type: "session.state.changed",
        payload: { state: "ready" },
      }),
    ).toBe(false);
  });

  it.effect("releases a bound owner claim and publishes the refreshed snapshot", () => {
    const harness = makeHarness({ released: true });
    const event: ProviderRuntimeEvent = {
      ...eventBase,
      type: "turn.completed",
      payload: { state: "completed" },
    };

    return harness.reconcile(event).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(harness.resolveConversationContext).toHaveBeenCalledWith({
            conversationThreadId,
            environmentId,
          });
          expect(harness.release).toHaveBeenCalledWith(releaseThreadId, {
            environmentId,
            conversationThreadId,
          });
          expect(harness.publish).toHaveBeenCalledWith({
            type: "updated",
            releaseId: releaseThreadId,
            threadId: releaseThreadId,
            revision: 8,
            reason: "stage_blocked",
            snapshot,
            at: event.createdAt,
          });
        }),
      ),
    );
  });

  it.effect("does not publish for completed submissions or unbound conversations", () => {
    const completed = makeHarness({ released: false });
    const unbound = makeHarness({ released: true, bound: false });
    const event: ProviderRuntimeEvent = {
      ...eventBase,
      type: "session.exited",
      payload: { exitKind: "graceful" },
    };

    return completed.reconcile(event).pipe(
      Effect.andThen(unbound.reconcile(event)),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(completed.release).toHaveBeenCalledOnce();
          expect(completed.publish).not.toHaveBeenCalled();
          expect(unbound.release).not.toHaveBeenCalled();
          expect(unbound.publish).not.toHaveBeenCalled();
        }),
      ),
    );
  });
});
