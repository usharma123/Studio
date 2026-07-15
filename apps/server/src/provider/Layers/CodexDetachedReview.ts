import * as NodeCrypto from "node:crypto";

import { ThreadId, type CodexSettings, type ProviderInstanceId } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import { ChildProcessSpawner } from "effect/unstable/process";

import type { ProviderDetachedReviewEngine } from "../Services/ProviderDetachedReview.ts";
import { ProviderDetachedReviewError } from "../Services/ProviderDetachedReview.ts";
import { makeCodexSessionRuntime } from "./CodexSessionRuntime.ts";

export const makeCodexDetachedReview = Effect.fn("makeCodexDetachedReview")(function* (
  config: CodexSettings,
  providerInstanceId: ProviderInstanceId,
  environment?: NodeJS.ProcessEnv,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const crypto = yield* Crypto.Crypto;

  const run: ProviderDetachedReviewEngine["run"] = Effect.fn("CodexDetachedReview.run")(
    function* (input) {
      const runtimeScope = yield* Scope.make("sequential");
      return yield* Effect.gen(function* () {
        const internalThreadId = ThreadId.make(`qa-review:${NodeCrypto.randomUUID()}`);
        const runtime = yield* makeCodexSessionRuntime({
          threadId: internalThreadId,
          providerInstanceId,
          binaryPath: config.binaryPath,
          ...(environment ? { environment } : {}),
          ...(config.homePath ? { homePath: config.homePath } : {}),
          cwd: input.cwd,
          runtimeMode: "approval-required",
          model: input.modelSelection.model,
        }).pipe(
          Effect.provideService(Scope.Scope, runtimeScope),
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provideService(Crypto.Crypto, crypto),
        );

        return yield* Effect.gen(function* () {
          yield* runtime.start();
          const result = yield* runtime.runDetachedReview(input.instructions);
          return {
            providerInstanceId,
            reviewThreadId: result.reviewThreadId,
            turnId: result.turnId,
            model: input.modelSelection.model,
            output: result.output,
            completedAt: result.completedAt,
          };
        }).pipe(
          Effect.ensuring(
            runtime.close.pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("Failed to close detached Codex review runtime.", { cause }),
              ),
            ),
          ),
        );
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDetachedReviewError({
              detail: cause.message,
              cause,
            }),
        ),
        Effect.ensuring(Scope.close(runtimeScope, Exit.void)),
      );
    },
  );

  return { run } satisfies ProviderDetachedReviewEngine;
});
