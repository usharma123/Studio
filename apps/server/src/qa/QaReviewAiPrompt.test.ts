import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { parseQaReviewAiOutput } from "./QaReviewAiPrompt.ts";

it.effect("decodes a fenced grounded review result", () =>
  Effect.gen(function* () {
    const result = yield* parseQaReviewAiOutput(`\`\`\`json
        {
          "verdict": "agrees",
          "rationale": "The response is supported.",
          "citations": [{
            "citation": {
              "documentId": "doc-1",
              "section": "Payments",
              "excerpt": "Transfers require approval."
            },
            "relationship": "supports",
            "explanation": "This is the controlling requirement."
          }]
        }
      \`\`\``);

    assert.strictEqual(result.verdict, "agrees");
    assert.strictEqual(result.citations[0]?.citation.documentId, "doc-1");
  }),
);

it.effect("rejects prose without a valid result", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(parseQaReviewAiOutput("No structured result."));
    assert.strictEqual(error._tag, "QaReviewAiOutputError");
  }),
);
