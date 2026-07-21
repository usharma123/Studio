import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import { reauthorizeStreamItems } from "./LiveAuthorization.ts";

it.effect("reauthorizeStreamItems fails before emitting an item after access is revoked", () =>
  Effect.gen(function* () {
    const authorized = yield* Ref.make(true);
    const checks = yield* Ref.make(0);
    const emitted: Array<string> = [];

    const failure = yield* Stream.make("first", "second").pipe(
      (stream) =>
        reauthorizeStreamItems(stream, (item) =>
          Ref.updateAndGet(checks, (count) => count + 1).pipe(
            Effect.andThen(Ref.get(authorized)),
            Effect.flatMap((allowed) =>
              allowed ? Effect.void : Effect.fail(`revoked-before-${item}`),
            ),
          ),
        ),
      Stream.tap((item) =>
        Effect.sync(() => emitted.push(item)).pipe(
          Effect.andThen(item === "first" ? Ref.set(authorized, false) : Effect.void),
        ),
      ),
      Stream.runDrain,
      Effect.flip,
    );

    expect(failure).toBe("revoked-before-second");
    expect(emitted).toEqual(["first"]);
    expect(yield* Ref.get(checks)).toBe(2);
  }),
);
