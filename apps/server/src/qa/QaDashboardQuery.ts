import { QaAssignedReleaseDashboard } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { QaDatabase } from "./QaDatabase.ts";
import { QaReviewError } from "./QaReviewService.ts";

type AssignedReleaseRow = {
  readonly threadId: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly releaseNumber: number;
  readonly title: string;
  readonly releaseStatus: "active" | "closed";
  readonly activeStage: string;
  readonly stageStatus: string;
  readonly activeReviewStatus: string | null;
  readonly role: "root" | "qa:maker" | "qa:approver";
  readonly unresolvedBlockingCommentCount: number;
  readonly unreadReviewActivityCount: number;
  readonly updatedAt: string;
};

const decodeDashboard = Schema.decodeUnknownEffect(QaAssignedReleaseDashboard);
const isQaReviewError = Schema.is(QaReviewError);
const make = Effect.gen(function* () {
  const sql = yield* QaDatabase;

  const listAssignedReleases = Effect.fn("QaDashboardQuery.listAssignedReleases")(
    function* (input: { readonly subject: string; readonly completedSince?: string }) {
      const now = yield* DateTime.now;
      const generatedAt = DateTime.formatIso(now);
      const completedSince =
        input.completedSince ?? DateTime.formatIso(DateTime.subtract(now, { days: 30 }));
      const rows = yield* sql<AssignedReleaseRow>`
      SELECT
        releases.thread_id AS "threadId",
        releases.project_id AS "projectId",
        projects.name AS "projectTitle",
        releases.release_number AS "releaseNumber",
        releases.title,
        releases.status AS "releaseStatus",
        releases.active_stage AS "activeStage",
        stages.status AS "stageStatus",
        CASE releases.active_stage
          WHEN 'requirements' THEN requirements_gate.status
          WHEN 'strategy' THEN strategies.review_status
          WHEN 'scenarios' THEN scenario_plans.review_status
          WHEN 'test_cases' THEN test_case_plans.review_status
          WHEN 'scripts' THEN script_plans.review_status
          WHEN 'readiness' THEN readiness.review_status
          ELSE NULL
        END AS "activeReviewStatus",
        assignments.role,
        -- PostgreSQL COUNT returns int8, which node-postgres preserves as a string.
        -- These dashboard counts are contractually bounded JavaScript integers.
        (
          SELECT CAST(COUNT(*) AS INTEGER) FROM qa_review_threads review_threads
          WHERE review_threads.thread_id = releases.thread_id
            AND review_threads.severity = 'blocking'
            AND review_threads.current_status = 'open'
        ) AS "unresolvedBlockingCommentCount",
        (
          SELECT CAST(COUNT(*) AS INTEGER) FROM qa_review_events review_events
          WHERE review_events.thread_id = releases.thread_id
            AND review_events.event_kind IN ('comment', 'reply', 'correction')
            AND review_events.actor_id <> principals.id
            AND review_events.sequence_no > COALESCE((
              SELECT read_event.sequence_no
              FROM qa_review_read_receipts receipts
              JOIN qa_review_events read_event ON read_event.id = receipts.last_read_entry_id
              WHERE receipts.review_thread_id = review_events.review_thread_id
                AND receipts.principal_id = principals.id
            ), 0)
        ) AS "unreadReviewActivityCount",
        releases.updated_at AS "updatedAt"
      FROM application_principals principals
      JOIN qa_project_assignments assignments ON assignments.principal_id = principals.id
      JOIN organization_memberships memberships
        ON memberships.organization_id = assignments.organization_id
        AND memberships.principal_id = principals.id
      JOIN organizations
        ON organizations.id = assignments.organization_id
      JOIN qa_projects projects ON projects.id = assignments.project_id
      JOIN qa_releases releases ON releases.project_id = assignments.project_id
      JOIN qa_stage_states stages
        ON stages.thread_id = releases.thread_id AND stages.stage = releases.active_stage
      LEFT JOIN qa_approval_gates requirements_gate
        ON requirements_gate.thread_id = releases.thread_id
        AND requirements_gate.kind = 'requirements_review'
      LEFT JOIN qa_strategies strategies ON strategies.thread_id = releases.thread_id
      LEFT JOIN qa_scenario_plans scenario_plans ON scenario_plans.thread_id = releases.thread_id
      LEFT JOIN qa_test_case_plans test_case_plans ON test_case_plans.thread_id = releases.thread_id
      LEFT JOIN qa_script_plans script_plans ON script_plans.thread_id = releases.thread_id
      LEFT JOIN qa_readiness_reviews readiness ON readiness.thread_id = releases.thread_id
      WHERE principals.subject = ${input.subject}
        AND principals.status = 'active'
        AND memberships.status = 'active'
        AND organizations.status = 'active'
        AND projects.status = 'active'
        AND (releases.status = 'active' OR releases.updated_at >= ${completedSince})
      ORDER BY
        CASE WHEN releases.status = 'active' AND stages.status = 'awaiting_review' THEN 0
             WHEN releases.status = 'active' THEN 1 ELSE 2 END,
        releases.updated_at DESC,
        releases.thread_id
    `;
      const releases = rows.map((row) => {
        const completed = row.releaseStatus === "closed";
        const changesRequested = row.activeReviewStatus === "rejected";
        const decisionReady =
          !completed &&
          row.stageStatus === "awaiting_review" &&
          (row.activeReviewStatus === "pending" || row.activeReviewStatus === "pending_review");
        const bucket = completed ? "completed" : decisionReady ? "awaiting_review" : "in_progress";
        const status = completed
          ? "completed"
          : changesRequested
            ? "changes_requested"
            : row.stageStatus === "blocked"
              ? "blocked"
              : decisionReady
                ? "ready_for_review"
                : "active";
        return {
          releaseId: row.threadId,
          threadId: row.threadId,
          projectId: row.projectId,
          projectTitle: row.projectTitle,
          releaseNumber: row.releaseNumber,
          title: row.title,
          activeStage: row.activeStage,
          bucket,
          status,
          role: row.role,
          uiRole: row.role === "qa:maker" ? "maker" : "approver",
          unresolvedBlockingCommentCount: row.unresolvedBlockingCommentCount,
          unreadReviewActivityCount: row.unreadReviewActivityCount,
          updatedAt: row.updatedAt,
          completedAt: completed ? row.updatedAt : null,
        };
      });
      return yield* decodeDashboard({
        releases,
        awaitingReviewCount: releases.filter((release) => release.bucket === "awaiting_review")
          .length,
        completedSince,
        generatedAt,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new QaReviewError({
              code: "persistence_failed",
              message: "Stored QA dashboard data is invalid.",
              cause,
            }),
        ),
      );
    },
  );

  return {
    listAssignedReleases: (input: Parameters<typeof listAssignedReleases>[0]) =>
      listAssignedReleases(input).pipe(
        Effect.mapError((cause) =>
          isQaReviewError(cause)
            ? cause
            : new QaReviewError({
                code: "persistence_failed",
                message: "QA dashboard persistence failed.",
                cause,
              }),
        ),
      ),
  };
});

export type QaDashboardQueryShape = Effect.Success<typeof make>;

export class QaDashboardQuery extends Context.Service<QaDashboardQuery, QaDashboardQueryShape>()(
  "t3/qa/QaDashboardQuery",
) {}

export const layer = Layer.effect(QaDashboardQuery, make);
