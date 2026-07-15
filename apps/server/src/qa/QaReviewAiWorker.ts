import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ServerConfig } from "../config.ts";
import { ProviderDetachedReview } from "../provider/Services/ProviderDetachedReview.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { buildQaReviewAiPrompt, parseQaReviewAiOutput } from "./QaReviewAiPrompt.ts";
import { QaReleaseEventBus } from "./QaReleaseEventBus.ts";
import { QaReviewService, type QaClaimedAiReview } from "./QaReviewService.ts";
import { QaWorkflow } from "./QaWorkflow.ts";

const IDLE_POLL_INTERVAL = "1 second";

function failureMessage(cause: unknown): string {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string" &&
    cause.message.trim().length > 0
  ) {
    return cause.message;
  }
  return "The background AI review failed unexpectedly.";
}

export const processClaimedQaReview = Effect.fn("QaReviewAiWorker.processClaimed")(function* (
  claimed: QaClaimedAiReview,
) {
  const reviews = yield* QaReviewService;
  const detachedReview = yield* ProviderDetachedReview;
  const settingsService = yield* ServerSettingsService;
  const config = yield* ServerConfig;

  const settings = yield* settingsService.getSettings;
  const modelSelection = settings.textGenerationModelSelection;
  const review = yield* detachedReview.run({
    cwd: config.cwd,
    modelSelection,
    instructions: buildQaReviewAiPrompt({
      reviewThread: claimed.reviewThread,
      sourcePacket: claimed.packet,
    }),
  });
  const result = yield* parseQaReviewAiOutput(review.output);
  yield* reviews.completeAiRun({
    runId: claimed.runId,
    result,
    providerInstanceId: review.providerInstanceId,
    model: review.model,
  });
});

const make = Effect.gen(function* () {
  const reviews = yield* QaReviewService;
  const detachedReview = yield* ProviderDetachedReview;
  const settingsService = yield* ServerSettingsService;
  const config = yield* ServerConfig;
  const workflow = yield* QaWorkflow;
  const eventBus = yield* QaReleaseEventBus;

  const publishReviewUpdate = (threadId: QaClaimedAiReview["reviewThread"]["threadId"]) =>
    workflow.getSnapshot({ threadId }).pipe(
      Effect.flatMap((snapshot) =>
        snapshot
          ? DateTime.now.pipe(
              Effect.map(DateTime.formatIso),
              Effect.flatMap((at) =>
                eventBus.publish({
                  type: "updated",
                  threadId,
                  revision: snapshot.revision,
                  reason: "review_recorded",
                  snapshot,
                  at,
                }),
              ),
            )
          : Effect.void,
      ),
      Effect.catchCause((cause) =>
        Effect.logWarning("Failed to publish a background QA AI review update.", {
          threadId,
          cause: Cause.pretty(cause),
        }),
      ),
    );

  const recovered = yield* reviews.requeueInterruptedAiRuns();
  if (recovered > 0) {
    yield* Effect.logInfo("Recovered interrupted QA AI review jobs.", { count: recovered });
  }

  const processNext = Effect.gen(function* () {
    const claimed = yield* reviews.claimNextAiRun();
    if (claimed === null) return false;
    yield* publishReviewUpdate(claimed.reviewThread.threadId);

    yield* processClaimedQaReview(claimed).pipe(
      Effect.provideService(QaReviewService, reviews),
      Effect.provideService(ProviderDetachedReview, detachedReview),
      Effect.provideService(ServerSettingsService, settingsService),
      Effect.provideService(ServerConfig, config),
      Effect.catch((error) =>
        reviews
          .failAiRun({
            runId: claimed.runId,
            message: failureMessage(error),
          })
          .pipe(
            Effect.catchCause((persistCause) =>
              Effect.logError("Failed to persist a terminal QA AI review failure.", {
                runId: claimed.runId,
                cause: Cause.pretty(persistCause),
              }),
            ),
          ),
      ),
      Effect.andThen(publishReviewUpdate(claimed.reviewThread.threadId)),
    );
    return true;
  });

  const drain = Effect.gen(function* () {
    while (yield* processNext) {
      // Claim the next durable job immediately; sleep only when the queue is empty.
    }
  });
  const worker = Effect.forever(
    drain.pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logError("QA AI review worker iteration failed.", {
              cause: Cause.pretty(cause),
            }),
      ),
      Effect.andThen(Effect.sleep(IDLE_POLL_INTERVAL)),
    ),
  );
  yield* Effect.forkScoped(worker);
});

/** Starts one scoped, durable worker for explicitly requested comment reviews. */
export const layer = Layer.effectDiscard(make);
