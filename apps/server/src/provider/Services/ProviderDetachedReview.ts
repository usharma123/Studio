import type { ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import type { ProviderInstance } from "../ProviderDriver.ts";
import { ProviderInstanceRegistry } from "./ProviderInstanceRegistry.ts";

export interface ProviderDetachedReviewInput {
  readonly cwd: string;
  readonly instructions: string;
  readonly modelSelection: ModelSelection;
}

export interface ProviderDetachedReviewResult {
  readonly providerInstanceId: ProviderInstanceId;
  readonly reviewThreadId: string;
  readonly turnId: string;
  readonly model: string;
  readonly output: string;
  readonly completedAt: number | null;
}

export class ProviderDetachedReviewError extends Schema.TaggedErrorClass<ProviderDetachedReviewError>()(
  "ProviderDetachedReviewError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export interface ProviderDetachedReviewEngine {
  readonly run: (
    input: ProviderDetachedReviewInput,
  ) => Effect.Effect<ProviderDetachedReviewResult, ProviderDetachedReviewError>;
}

export class ProviderDetachedReview extends Context.Service<
  ProviderDetachedReview,
  ProviderDetachedReviewEngine
>()("t3/provider/Services/ProviderDetachedReview") {}

function requireEngine(
  instance: ProviderInstance | undefined,
  instanceId: ProviderInstanceId,
): Effect.Effect<ProviderDetachedReviewEngine, ProviderDetachedReviewError> {
  if (!instance) {
    return Effect.fail(
      new ProviderDetachedReviewError({
        detail: `No provider instance is registered for '${instanceId}'.`,
      }),
    );
  }
  if (!instance.detachedReview) {
    return Effect.fail(
      new ProviderDetachedReviewError({
        detail: `Provider instance '${instanceId}' does not support detached app-server reviews.`,
      }),
    );
  }
  return Effect.succeed(instance.detachedReview);
}

export const make = Effect.gen(function* () {
  const registry = yield* ProviderInstanceRegistry;
  return ProviderDetachedReview.of({
    run: Effect.fn("ProviderDetachedReview.run")(function* (input) {
      const instance = yield* registry.getInstance(input.modelSelection.instanceId);
      const engine = yield* requireEngine(instance, input.modelSelection.instanceId);
      return yield* engine.run(input);
    }),
  });
});

export const layer = Layer.effect(ProviderDetachedReview, make);
