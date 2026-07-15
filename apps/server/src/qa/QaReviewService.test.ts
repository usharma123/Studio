import { ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as QaDatabase from "./QaDatabase.ts";
import { QaReviewService, layer as QaReviewServiceLayer } from "./QaReviewService.ts";
import { validateQaReviewCitations } from "./QaSourceChain.ts";

const PersistenceTest = QaDatabase.layerFromSqlClient.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);

const layer = it.layer(QaReviewServiceLayer.pipe(Layer.provideMerge(PersistenceTest)));

const APPROVER = {
  principalId: "principal-approver",
  displayName: "QA Approver",
  role: "qa:approver",
} as const;
const MAKER = {
  principalId: "principal-maker",
  displayName: "QA Maker",
  role: "qa:maker",
} as const;

layer("QaReviewService", (it) => {
  it.effect("requires maker reply, a current AI attempt, and an override for disagreement", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const reviews = yield* QaReviewService;
      const threadId = ThreadId.make("qa-review-release");
      const timestamp = "2026-07-15T12:00:00.000Z";

      yield* sql`
        INSERT INTO qa_releases (
          thread_id, project_id, mode, release_number, title, status, phase,
          ingestion_status, ingestion_progress, active_stage, revision, created_at, updated_at
        ) VALUES (
          ${threadId}, 'qa-project', 'qa', 1, 'Approval workflow', 'active', 'ready',
          'completed', 100, 'strategy', 5, ${timestamp}, ${timestamp}
        )
      `;
      yield* sql`
        INSERT INTO qa_strategies (
          thread_id, id, title, revision, generation_status, review_status,
          rejection_note, created_at, updated_at, submitted_at, submitted_by,
          approved_at, approved_by, rejected_at, rejected_by
        ) VALUES (
          ${threadId}, 'strategy-1', 'Regression strategy', 5, 'complete', 'draft',
          NULL, ${timestamp}, ${timestamp}, NULL, NULL, NULL, NULL, NULL, NULL
        )
      `;
      yield* sql`
        INSERT INTO qa_strategy_sections (
          id, thread_id, title, order_index, content, created_at, updated_at
        ) VALUES (
          'section-1', ${threadId}, 'Scope', 0, 'Cover the audit workflow.',
          ${timestamp}, ${timestamp}
        )
      `;

      const comment = yield* reviews.addComment(
        {
          threadId,
          artifactKind: "strategy",
          artifactId: "strategy-1",
          expectedRevision: 5,
          anchor: {
            type: "strategy_section",
            sectionId: "section-1",
            label: "Scope",
            quote: "Cover the audit workflow.",
          },
          severity: "blocking",
          body: "Show how this scope follows the approved source chain.",
        },
        APPROVER,
      );
      assert.equal(comment.status, "open");
      assert.isFalse(comment.canRunAiReview);
      // A migrated legacy comment shares its id with the new review thread.
      yield* sql`
        INSERT INTO qa_strategy_comments (
          id, thread_id, section_id, quote, body, status, author, created_at,
          resolved_at, resolved_by
        ) VALUES (
          ${comment.id}, ${threadId}, 'section-1', NULL,
          'Show how this scope follows the approved source chain.', 'open',
          'QA Approver', ${timestamp}, NULL, NULL
        )
      `;

      const prematureAi = yield* reviews
        .enqueueAiRun(
          {
            threadId,
            reviewThreadId: comment.id,
            expectedRevision: 6,
          },
          APPROVER,
        )
        .pipe(Effect.flip);
      assert.equal(prematureAi.code, "invalid_state");

      const replied = yield* reviews.reply(
        {
          threadId,
          reviewThreadId: comment.id,
          expectedRevision: 6,
          body: "Addressed by tracing the scope to the audit requirement.",
        },
        MAKER,
      );
      assert.isTrue(replied.canRunAiReview);

      const queued = yield* reviews.enqueueAiRun(
        {
          threadId,
          reviewThreadId: comment.id,
          expectedRevision: 7,
        },
        APPROVER,
      );
      assert.equal(queued.status, "queued");

      const claimed = yield* reviews.claimNextAiRun();
      assert.isNotNull(claimed);
      assert.equal(claimed.reviewThreadId, comment.id);
      const result = yield* reviews.completeAiRun({
        runId: claimed.runId,
        result: {
          verdict: "disagrees",
          rationale: "The strategy still lacks the required grounding.",
          citations: [],
        },
        providerInstanceId: "provider-test",
        model: "test-model",
      });
      assert.equal(result.verdict, "disagrees");

      const revisionRows = yield* sql<{ readonly revision: number }>`
        SELECT revision FROM qa_releases WHERE thread_id = ${threadId}
      `;
      const withoutOverride = yield* reviews
        .resolve(
          {
            threadId,
            reviewThreadId: comment.id,
            aiRunId: claimed.runId,
            expectedRevision: revisionRows[0]!.revision,
          },
          APPROVER,
        )
        .pipe(Effect.flip);
      assert.equal(withoutOverride.code, "invalid_input");

      const resolved = yield* reviews.resolve(
        {
          threadId,
          reviewThreadId: comment.id,
          aiRunId: claimed.runId,
          expectedRevision: revisionRows[0]!.revision,
          overrideReason: "The approver accepts the maker's evidence despite the AI assessment.",
        },
        APPROVER,
      );
      assert.equal(resolved.status, "resolved");
      assert.equal(resolved.resolutionAiRunId, claimed.runId);
      assert.match(resolved.resolutionOverrideReason ?? "", /approver accepts/u);
      const legacyProjection = yield* sql<{
        readonly status: string;
        readonly resolvedBy: string | null;
      }>`
        SELECT status, resolved_by AS "resolvedBy"
        FROM qa_strategy_comments WHERE id = ${comment.id}
      `;
      assert.equal(legacyProjection[0]?.status, "resolved");
      assert.equal(legacyProjection[0]?.resolvedBy, APPROVER.displayName);

      const immutableEvents = yield* sql<{ readonly id: string }>`
        SELECT id FROM qa_review_events WHERE review_thread_id = ${comment.id} ORDER BY sequence_no
      `;
      const immutableUpdate = yield* sql`
        UPDATE qa_review_events SET body = 'rewritten' WHERE id = ${immutableEvents[0]!.id}
      `.pipe(Effect.flip);
      assert.isDefined(immutableUpdate);

      const terminalRunUpdate = yield* sql`
        UPDATE qa_review_ai_runs SET rationale = 'rewritten' WHERE id = ${claimed.runId}
      `.pipe(Effect.flip);
      assert.isDefined(terminalRunUpdate);
    }),
  );

  it("validates both the cited document section and its excerpt", () => {
    const packet = {
      threadId: "release",
      artifactKind: "strategy" as const,
      artifactId: "strategy",
      artifactRevision: 1,
      sourceChainHash: "hash",
      documents: [
        {
          id: "doc-1",
          fileName: "BRD.md",
          kind: "BRD",
          version: "1",
          sha256: "sha",
          sections: [
            { section: "Audit / Retention", text: "Evidence is retained for seven years." },
          ],
        },
      ],
      approvedRequirements: [],
      strategySections: [],
      scenarios: [],
    };
    const citation = {
      citation: {
        documentId: "doc-1",
        documentName: "BRD.md",
        section: "Audit / Retention",
        excerpt: "retained for seven years",
      },
      relationship: "supports" as const,
      explanation: "Direct source requirement.",
    };
    assert.lengthOf(validateQaReviewCitations(packet, [citation]).valid, 1);
    assert.lengthOf(
      validateQaReviewCitations(packet, [
        { ...citation, citation: { ...citation.citation, section: "Other" } },
      ]).invalid,
      1,
    );
  });
});
