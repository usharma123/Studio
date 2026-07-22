import type { QaAssignedReleaseDashboard } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";

import type { QaDashboardQueryShape } from "./QaDashboardQuery.ts";
import type { QaIam } from "./QaIam.ts";
import { QaReviewError } from "./QaReviewService.ts";
import type { QaReleaseEventBusShape } from "./QaReleaseEventBus.ts";

export interface QaAssignedReleaseDashboardStreamInput {
  readonly subject: string;
  readonly completedSince?: string;
  readonly dashboardQuery: QaDashboardQueryShape;
  readonly iam: QaIam["Service"];
  readonly eventBus: QaReleaseEventBusShape;
}

/**
 * Emits the current principal-specific dashboard and refreshes it after release
 * signals that the same principal is still authorized to read. The PubSub
 * subscription is acquired before the initial query, closing the snapshot /
 * subscribe race without exposing unauthorized event activity.
 */
export function subscribeAssignedReleaseDashboard(
  input: QaAssignedReleaseDashboardStreamInput,
): Stream.Stream<QaAssignedReleaseDashboard, QaReviewError> {
  const loadDashboard = () =>
    input.dashboardQuery.listAssignedReleases({
      subject: input.subject,
      ...(input.completedSince === undefined ? {} : { completedSince: input.completedSince }),
    });

  return Stream.unwrap(
    Effect.gen(function* () {
      const releaseEvents = yield* input.eventBus.subscribeEvents;
      const authorizedEvents = Stream.fromSubscription(releaseEvents).pipe(
        Stream.filterMapEffect((event) =>
          input.iam
            .authorizeRelease({
              subject: input.subject,
              releaseThreadId: event.threadId,
              capability: "qa:read",
            })
            .pipe(
              Effect.map(() => Result.succeed(event)),
              Effect.catch((cause) =>
                cause.code === "persistence_error"
                  ? Effect.logWarning(
                      "Skipping a QA dashboard refresh because live authorization failed.",
                      { cause, releaseThreadId: event.threadId, subject: input.subject },
                    ).pipe(Effect.as(Result.failVoid))
                  : Effect.succeed(Result.failVoid),
              ),
            ),
        ),
      );

      return Stream.concat(
        Stream.fromEffect(loadDashboard()),
        authorizedEvents.pipe(Stream.mapEffect(loadDashboard)),
      );
    }),
  );
}
