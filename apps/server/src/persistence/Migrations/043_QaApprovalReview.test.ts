import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("043_QaApprovalReview", (it) => {
  it.effect("migrates legacy strategy threads as blocking append-only history", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const timestamp = "2026-07-15T12:00:00.000Z";

      yield* runMigrations({ toMigrationInclusive: 42 });
      yield* sql`
        INSERT INTO qa_releases (
          thread_id, project_id, mode, release_number, title, status, phase,
          ingestion_status, ingestion_progress, active_stage, revision, created_at, updated_at
        ) VALUES (
          'legacy-release', 'legacy-project', 'qa', 1, 'Legacy release', 'active', 'ready',
          'completed', 100, 'strategy', 4, ${timestamp}, ${timestamp}
        )
      `;
      yield* sql`
        INSERT INTO qa_strategies (
          thread_id, id, title, revision, generation_status, review_status,
          rejection_note, created_at, updated_at, submitted_at, submitted_by,
          approved_at, approved_by, rejected_at, rejected_by
        ) VALUES (
          'legacy-release', 'legacy-strategy', 'Legacy strategy', 4, 'complete', 'pending_review',
          NULL, ${timestamp}, ${timestamp}, ${timestamp}, 'Maker', NULL, NULL, NULL, NULL
        )
      `;
      yield* sql`
        INSERT INTO qa_strategy_sections (
          id, thread_id, title, order_index, content, created_at, updated_at
        ) VALUES (
          'legacy-section', 'legacy-release', 'Scope', 0, 'Legacy scope.',
          ${timestamp}, ${timestamp}
        )
      `;
      yield* sql`
        INSERT INTO qa_strategy_comments (
          id, thread_id, section_id, quote, body, status, author, created_at,
          resolved_at, resolved_by
        ) VALUES (
          'legacy-comment', 'legacy-release', 'legacy-section', 'Legacy scope.',
          'Clarify scope.', 'resolved', 'Legacy Approver', ${timestamp},
          '2026-07-15T12:02:00.000Z', 'Legacy Approver'
        )
      `;
      yield* sql`
        INSERT INTO qa_strategy_comment_replies (
          id, thread_id, comment_id, author, body, created_at
        ) VALUES (
          'legacy-reply', 'legacy-release', 'legacy-comment', 'Legacy Maker',
          'Scope clarified.', '2026-07-15T12:01:00.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 43 });

      const threads = yield* sql<{
        readonly id: string;
        readonly artifactKind: string;
        readonly severity: string;
        readonly currentStatus: string;
      }>`
        SELECT
          id, artifact_kind AS "artifactKind", severity,
          current_status AS "currentStatus"
        FROM qa_review_threads
      `;
      assert.deepEqual(threads, [
        {
          id: "legacy-comment",
          artifactKind: "strategy",
          severity: "blocking",
          currentStatus: "resolved",
        },
      ]);
      const events = yield* sql<{
        readonly eventKind: string;
        readonly sequenceNo: number;
        readonly actorRole: string;
      }>`
        SELECT
          event_kind AS "eventKind", sequence_no AS "sequenceNo",
          actor_role AS "actorRole"
        FROM qa_review_events
        WHERE review_thread_id = 'legacy-comment'
        ORDER BY sequence_no
      `;
      assert.deepEqual(events, [
        { eventKind: "comment", sequenceNo: 1, actorRole: "qa:approver" },
        { eventKind: "reply", sequenceNo: 2, actorRole: "qa:maker" },
        { eventKind: "resolved", sequenceNo: 3, actorRole: "qa:approver" },
      ]);
    }),
  );
});
