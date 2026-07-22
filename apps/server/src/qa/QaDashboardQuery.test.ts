import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as QaDatabase from "./QaDatabase.ts";
import { QaDashboardQuery, layer as QaDashboardQueryLayer } from "./QaDashboardQuery.ts";

const PersistenceTest = QaDatabase.layerFromSqlClient.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const layer = it.layer(QaDashboardQueryLayer.pipe(Layer.provideMerge(PersistenceTest)));

layer("QaDashboardQuery", (it) => {
  it.effect("classifies decision-ready, changes-requested, and recent completed releases", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const dashboard = yield* QaDashboardQuery;
      const timestamp = "2026-07-15T12:00:00.000Z";

      yield* sql`CREATE TABLE application_principals (id TEXT PRIMARY KEY, subject TEXT NOT NULL, display_name TEXT NOT NULL, principal_type TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`;
      yield* sql`CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`;
      yield* sql`CREATE TABLE organization_memberships (organization_id TEXT NOT NULL, principal_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(organization_id, principal_id))`;
      yield* sql`CREATE TABLE qa_projects (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, repository_reference TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`;
      yield* sql`CREATE TABLE qa_project_assignments (organization_id TEXT NOT NULL, project_id TEXT NOT NULL, principal_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id, principal_id))`;

      yield* sql`INSERT INTO application_principals VALUES ('approver', 'test:approver', 'Approver', 'user', 'active', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO application_principals VALUES ('root', 'test:root', 'Root', 'user', 'active', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO organizations VALUES ('org', 'Organization', 'active', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO organization_memberships VALUES ('org', 'approver', 'active', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO organization_memberships VALUES ('org', 'root', 'active', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO qa_projects VALUES ('project', 'org', 'project', 'QA Project', 'active', NULL, ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO qa_project_assignments VALUES ('org', 'project', 'approver', 'qa:approver', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO qa_project_assignments VALUES ('org', 'project', 'root', 'root', ${timestamp}, ${timestamp})`;

      const releases = [
        {
          id: "awaiting",
          number: 1,
          status: "active",
          activeStage: "strategy",
          updated: timestamp,
        },
        {
          id: "requirements",
          number: 2,
          status: "active",
          activeStage: "requirements",
          updated: timestamp,
        },
        { id: "changes", number: 3, status: "active", activeStage: "strategy", updated: timestamp },
        {
          id: "completed",
          number: 4,
          status: "closed",
          activeStage: "readiness",
          updated: "2026-07-01T12:00:00.000Z",
        },
      ] as const;
      for (const release of releases) {
        yield* sql`
          INSERT INTO qa_releases (
            thread_id, project_id, mode, release_number, title, status, phase,
            ingestion_status, ingestion_progress, active_stage, revision, created_at, updated_at
          ) VALUES (
            ${release.id}, 'project', 'qa', ${release.number}, ${release.id}, ${release.status},
            'ready', 'completed', 100, ${release.activeStage}, 1, ${timestamp}, ${release.updated}
          )
        `;
        yield* sql`
          INSERT INTO qa_stage_states (
            thread_id, stage, ordinal, status, progress, active_job_id, blocked_reason, updated_at
          ) VALUES (
            ${release.id}, ${release.activeStage},
            ${release.activeStage === "requirements" ? 2 : release.activeStage === "strategy" ? 3 : 7},
            ${release.status === "closed" ? "complete" : "awaiting_review"},
            100, NULL, NULL, ${release.updated}
          )
        `;
      }
      yield* sql`
        INSERT INTO qa_approval_gates (
          id, thread_id, kind, title, description, status, decision_note, created_at, updated_at
        ) VALUES (
          'requirements-gate', 'requirements', 'requirements_review', 'Requirements approval',
          'Approve the requirements baseline.', 'pending', NULL, ${timestamp}, ${timestamp}
        )
      `;
      for (const [threadId, reviewStatus] of [
        ["awaiting", "pending_review"],
        ["changes", "rejected"],
      ] as const) {
        yield* sql`
          INSERT INTO qa_strategies (
            thread_id, id, title, revision, generation_status, review_status,
            rejection_note, created_at, updated_at, submitted_at, submitted_by,
            approved_at, approved_by, rejected_at, rejected_by
          ) VALUES (
            ${threadId}, ${`strategy-${threadId}`}, 'Strategy', 1, 'complete', ${reviewStatus},
            NULL, ${timestamp}, ${timestamp}, ${timestamp}, 'Maker', NULL, NULL, NULL, NULL
          )
        `;
      }
      yield* sql`
        INSERT INTO qa_review_threads (
          id, thread_id, artifact_kind, artifact_id, anchor_kind, anchor_id,
          anchor_label, anchor_quote, severity, created_by_actor_id,
          created_by_display_name, created_by_role, created_at, current_status,
          resolved_at, resolved_by_actor_id, latest_event_at
        ) VALUES (
          'review-1', 'awaiting', 'strategy', 'strategy-awaiting', 'strategy_section',
          'section', 'Scope', NULL, 'blocking', 'approver', 'Approver', 'qa:approver',
          ${timestamp}, 'open', NULL, NULL, ${timestamp}
        )
      `;
      yield* sql`
        INSERT INTO qa_review_events (
          id, review_thread_id, thread_id, sequence_no, event_kind, actor_id,
          actor_display_name, actor_role, body, corrects_entry_id, payload_json,
          artifact_revision, source_chain_hash, created_at
        ) VALUES (
          'entry-1', 'review-1', 'awaiting', 1, 'reply', 'maker', 'Maker', 'qa:maker',
          'Addressed.', NULL, '{}', 1, 'hash', ${timestamp}
        )
      `;

      const result = yield* dashboard.listAssignedReleases({
        subject: "test:approver",
        completedSince: "2026-06-15T00:00:00.000Z",
      });
      assert.equal(result.awaitingReviewCount, 2);
      assert.equal(
        result.releases.find((release) => release.threadId === "awaiting")?.bucket,
        "awaiting_review",
      );
      assert.equal(
        result.releases.find((release) => release.threadId === "awaiting")
          ?.unresolvedBlockingCommentCount,
        1,
      );
      assert.equal(
        result.releases.find((release) => release.threadId === "awaiting")
          ?.unreadReviewActivityCount,
        1,
      );
      assert.equal(
        result.releases.find((release) => release.threadId === "requirements")?.status,
        "ready_for_review",
      );
      assert.equal(
        result.releases.find((release) => release.threadId === "requirements")?.bucket,
        "awaiting_review",
      );
      assert.equal(
        result.releases.find((release) => release.threadId === "changes")?.status,
        "changes_requested",
      );
      assert.equal(
        result.releases.find((release) => release.threadId === "completed")?.bucket,
        "completed",
      );

      const rootResult = yield* dashboard.listAssignedReleases({
        subject: "test:root",
        completedSince: "2026-06-15T00:00:00.000Z",
      });
      const rootRequirements = rootResult.releases.find(
        (release) => release.threadId === "requirements",
      );
      assert.equal(rootResult.awaitingReviewCount, 2);
      assert.equal(rootRequirements?.releaseId, "requirements");
      assert.equal(rootRequirements?.activeStage, "requirements");
      assert.equal(rootRequirements?.role, "root");
      assert.equal(rootRequirements?.uiRole, "approver");
    }),
  );
});
