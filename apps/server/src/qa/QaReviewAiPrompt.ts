import { QaReviewAiResult, type QaReviewThread } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { QaGroundedSourcePacket } from "./QaSourceChain.ts";

export class QaReviewAiOutputError extends Schema.TaggedErrorClass<QaReviewAiOutputError>()(
  "QaReviewAiOutputError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

const decodeReviewResult = Schema.decodeUnknownEffect(QaReviewAiResult);
const decodeUnknownJson = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString);

function jsonPayload(output: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(output)?.[1]?.trim();
  if (fenced) return fenced;

  const firstBrace = output.indexOf("{");
  const lastBrace = output.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return output.slice(firstBrace, lastBrace + 1);
  }
  return output.trim();
}

export const parseQaReviewAiOutput = Effect.fn("QaReviewAiPrompt.parseOutput")(function* (
  output: string,
) {
  const payload = jsonPayload(output);
  const parsed = yield* decodeUnknownJson(payload).pipe(
    Effect.mapError(
      (cause) =>
        new QaReviewAiOutputError({
          detail: "The AI review did not return valid JSON.",
          cause,
        }),
    ),
  );
  return yield* decodeReviewResult(parsed).pipe(
    Effect.mapError(
      (cause) =>
        new QaReviewAiOutputError({
          detail: "The AI review JSON did not match the required result schema.",
          cause,
        }),
    ),
  );
});

export function buildQaReviewAiPrompt(input: {
  readonly reviewThread: QaReviewThread;
  readonly sourcePacket: QaGroundedSourcePacket;
}): string {
  const thread = input.reviewThread;
  const reviewTarget = {
    artifactKind: thread.artifactKind,
    artifactId: thread.artifactId,
    anchor: thread.anchor,
    severity: thread.severity,
    entries: thread.entries.map((entry) => ({
      kind: entry.kind,
      body: entry.body,
      authorRole: entry.author.role,
      createdAt: entry.createdAt,
      correctsEntryId: entry.correctsEntryId,
    })),
  };

  return [
    "You are performing an adversarial QA approval review of one specific anchored reviewer comment.",
    "Judge whether the maker's latest response and the current strategy or scenario actually address that comment and align with the complete supplied knowledge-base source chain.",
    "Look for contradictions, unsupported assumptions, missing coverage, and misleading claims. Do not evaluate unrelated comments and do not make the approval decision; the human approver always has final say.",
    "Use only the supplied source packet as evidence. Every citation must name an exact supplied documentId and section, and its excerpt must appear in that section. If the evidence is absent or ambiguous, return inconclusive.",
    "Return JSON only, with this exact shape:",
    JSON.stringify({
      verdict: "agrees | disagrees | inconclusive",
      rationale: "concise adversarial explanation",
      citations: [
        {
          citation: {
            documentId: "exact supplied id",
            documentName: "optional supplied filename",
            documentType: "optional supplied kind",
            section: "exact supplied section",
            location: "optional location within section",
            excerpt: "exact text from supplied section",
          },
          relationship: "supports | contradicts | context",
          explanation: "why this evidence matters",
        },
      ],
    }),
    "SPECIFIC REVIEW THREAD:",
    JSON.stringify(reviewTarget),
    "COMPLETE GROUNDED SOURCE CHAIN:",
    JSON.stringify(input.sourcePacket),
  ].join("\n\n");
}
