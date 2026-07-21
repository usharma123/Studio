import * as NodeCrypto from "node:crypto";

import { PgClient } from "@effect/sql-pg";
import type { QaReleaseStreamEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Result from "effect/Result";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

const QA_RELEASE_NOTIFICATION_CHANNEL = "t3_qa_release_events_v1";

type QaReleaseUpdatedEvent = Extract<QaReleaseStreamEvent, { readonly type: "updated" }>;

const QaReleaseEventReason = Schema.Literals([
  "stage_started",
  "progress",
  "proposal_received",
  "review_recorded",
  "stage_advanced",
  "stage_blocked",
]);

const QaReleaseNotification = Schema.Struct({
  origin: Schema.String,
  releaseId: Schema.String,
  threadId: Schema.String,
  revision: Schema.Number,
  reason: QaReleaseEventReason,
  at: Schema.String,
});
type QaReleaseNotification = typeof QaReleaseNotification.Type;

export type QaReleaseEventSignal = Omit<QaReleaseNotification, "origin">;

export interface QaReleaseEventBusShape {
  readonly publish: (event: QaReleaseUpdatedEvent) => Effect.Effect<void>;
  readonly events: Stream.Stream<QaReleaseEventSignal>;
  /** Acquire before reading a snapshot so no release update can land in between. */
  readonly subscribeEvents: Effect.Effect<
    PubSub.Subscription<QaReleaseEventSignal>,
    never,
    Scope.Scope
  >;
}

export class QaReleaseEventBus extends Context.Service<QaReleaseEventBus, QaReleaseEventBusShape>()(
  "t3/qa/QaReleaseEventBus",
) {}

const signalFromEvent = (event: QaReleaseUpdatedEvent): QaReleaseEventSignal => ({
  releaseId: event.releaseId,
  threadId: event.threadId,
  revision: event.revision,
  reason: event.reason,
  at: event.at,
});

const decodeNotification = Schema.decodeUnknownSync(QaReleaseNotification);

function parseNotification(payload: string): QaReleaseNotification | null {
  try {
    return decodeNotification(JSON.parse(payload));
  } catch {
    return null;
  }
}

const makeLocal = Effect.gen(function* () {
  const pubSub = yield* PubSub.unbounded<QaReleaseEventSignal>();
  return QaReleaseEventBus.of({
    publish: (event) => PubSub.publish(pubSub, signalFromEvent(event)).pipe(Effect.asVoid),
    events: Stream.fromPubSub(pubSub),
    subscribeEvents: PubSub.subscribe(pubSub),
  });
});

const makePostgres = Effect.gen(function* () {
  const postgres = yield* PgClient.PgClient;
  const origin = NodeCrypto.randomUUID();
  const pubSub = yield* PubSub.unbounded<QaReleaseEventSignal>();
  const remoteEvents = postgres.listen(QA_RELEASE_NOTIFICATION_CHANNEL).pipe(
    Stream.retry(
      Schedule.exponential(Duration.seconds(1)).pipe(
        Schedule.modifyDelay((_attempt, delay) =>
          Effect.succeed(Duration.min(delay, Duration.seconds(30))),
        ),
      ),
    ),
    Stream.filterMap((payload) => {
      const notification = parseNotification(payload);
      if (notification === null || notification.origin === origin) return Result.failVoid;
      const { origin: _origin, ...signal } = notification;
      return Result.succeed(signal);
    }),
    Stream.catchCause((cause) =>
      Stream.fromEffect(
        Effect.logError("QA release notification listener stopped.", { cause }),
      ).pipe(Stream.drain),
    ),
  );
  // PgClient LISTEN owns one connection and its finalizer issues UNLISTEN for
  // the whole channel. Keep exactly one listener for this app-server layer;
  // individual WebSocket subscriptions fan out only from the local PubSub.
  yield* Stream.runForEach(remoteEvents, (signal) => PubSub.publish(pubSub, signal)).pipe(
    Effect.forkScoped,
  );

  return QaReleaseEventBus.of({
    publish: (event) => {
      const signal = signalFromEvent(event);
      const payload = JSON.stringify({ ...signal, origin } satisfies QaReleaseNotification);
      return PubSub.publish(pubSub, signal).pipe(
        Effect.andThen(
          postgres
            .notify(QA_RELEASE_NOTIFICATION_CHANNEL, payload)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("Failed to notify other QA desktop processes.", { cause }),
              ),
            ),
        ),
        Effect.asVoid,
      );
    },
    events: Stream.fromPubSub(pubSub),
    subscribeEvents: PubSub.subscribe(pubSub),
  });
});

/** In-process adapter for unit tests and non-PostgreSQL harnesses. */
export const layer = Layer.effect(QaReleaseEventBus, makeLocal);

/** Live adapter: local fan-out plus PostgreSQL LISTEN/NOTIFY across app servers. */
export const layerPostgres = Layer.effect(QaReleaseEventBus, makePostgres);
