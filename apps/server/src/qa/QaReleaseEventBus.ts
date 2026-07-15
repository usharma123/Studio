import type { QaReleaseStreamEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

export interface QaReleaseEventBusShape {
  readonly publish: (event: QaReleaseStreamEvent) => Effect.Effect<void>;
  readonly events: Stream.Stream<QaReleaseStreamEvent>;
}

export class QaReleaseEventBus extends Context.Service<QaReleaseEventBus, QaReleaseEventBusShape>()(
  "t3/qa/QaReleaseEventBus",
) {}

const make = Effect.gen(function* () {
  const pubSub = yield* PubSub.unbounded<QaReleaseStreamEvent>();
  return QaReleaseEventBus.of({
    publish: (event) => PubSub.publish(pubSub, event).pipe(Effect.asVoid),
    events: Stream.fromPubSub(pubSub),
  });
});

export const layer = Layer.effect(QaReleaseEventBus, make);
