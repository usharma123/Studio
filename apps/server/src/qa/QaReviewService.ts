import * as NodeCrypto from "node:crypto";

import {
  type QaAddReviewCommentInput,
  type QaMarkReviewReadInput,
  type QaProjectRole,
  type QaReplyReviewCommentInput,
  type QaResolveReviewCommentInput,
  type QaReviewActor,
  type QaReviewAiCitation,
  type QaReviewAiResult,
  type QaReviewAiRun,
  type QaReviewReadReceipt,
  QaReviewThread,
  QaReviewThreadList,
  type QaRunReviewCommentAiCheckInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/unstable/sql/SqlClient";

import { QaDatabase } from "./QaDatabase.ts";
import {
  computeQaSourceChain,
  loadQaGroundedSourcePacket,
  type QaGroundedSourcePacket,
  type QaReviewArtifactKind,
  validateQaReviewCitations,
} from "./QaSourceChain.ts";

type ReviewSeverity = "blocking" | "advisory";
type ReviewEventKind =
  | "comment"
  | "reply"
  | "correction"
  | "ai_queued"
  | "ai_started"
  | "ai_completed"
  | "ai_failed"
  | "resolved";

type ThreadRow = {
  readonly id: string;
  readonly threadId: string;
  readonly artifactKind: QaReviewArtifactKind;
  readonly artifactId: string;
  readonly anchorKind: "strategy_section" | "scenario";
  readonly anchorId: string;
  readonly anchorLabel: string;
  readonly anchorQuote: string | null;
  readonly severity: ReviewSeverity;
  readonly createdByActorId: string;
  readonly createdByDisplayName: string;
  readonly createdByRole: QaProjectRole;
  readonly createdAt: string;
  readonly currentStatus: "open" | "resolved";
  readonly resolvedAt: string | null;
  readonly resolvedByActorId: string | null;
  readonly latestEventAt: string;
};

type EventRow = {
  readonly id: string;
  readonly reviewThreadId: string;
  readonly threadId: string;
  readonly sequenceNo: number;
  readonly eventKind: ReviewEventKind;
  readonly actorId: string;
  readonly actorDisplayName: string;
  readonly actorRole: QaProjectRole | "system";
  readonly body: string | null;
  readonly correctsEntryId: string | null;
  readonly payloadJson: string;
  readonly artifactRevision: number;
  readonly sourceChainHash: string | null;
  readonly createdAt: string;
};

export type QaReviewAiRunRecord = {
  readonly id: string;
  readonly reviewThreadId: string;
  readonly threadId: string;
  readonly artifactRevision: number;
  readonly sourceChainHash: string;
  readonly requestedEventSequence: number;
  readonly status: "queued" | "running" | "completed" | "failed";
  readonly requestedByActorId: string;
  readonly requestedByDisplayName: string;
  readonly requestedByRole: "root" | "qa:approver";
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly verdict: "agrees" | "disagrees" | "inconclusive" | null;
  readonly rationale: string | null;
  readonly citationsJson: string;
  readonly model: string | null;
  readonly providerInstanceId: string | null;
  readonly errorMessage: string | null;
};

type ReceiptRow = {
  readonly reviewThreadId: string;
  readonly principalId: string;
  readonly lastReadEntryId: string;
  readonly readAt: string;
};

type AnchorRow = {
  readonly artifactId: string;
  readonly anchorLabel: string;
};

export type QaReviewDecision = "approved" | "changes_requested";

export interface QaReviewDecisionCheck {
  readonly blockingThreadIds: ReadonlyArray<string>;
}

export interface QaClaimedAiReview {
  readonly runId: string;
  readonly reviewThreadId: string;
  readonly projectId: string;
  readonly reviewThread: QaReviewThread;
  readonly packet: QaGroundedSourcePacket;
}

export interface QaAiReviewPacket {
  readonly run: QaReviewAiRunRecord;
  readonly reviewThread: QaReviewThread;
  readonly packet: QaGroundedSourcePacket;
  readonly projectId: string;
}

export class QaReviewError extends Schema.TaggedErrorClass<QaReviewError>()("QaReviewError", {
  code: Schema.Literals([
    "not_found",
    "access_denied",
    "revision_conflict",
    "invalid_state",
    "invalid_anchor",
    "invalid_input",
    "persistence_failed",
  ]),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

const decodeThread = Schema.decodeUnknownEffect(QaReviewThread);
const decodeThreadList = Schema.decodeUnknownEffect(QaReviewThreadList);
const encodeUnknownJson = Schema.encodeUnknownSync(Schema.UnknownFromJsonString);
const decodeUnknownJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);
const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

const reviewError = (code: QaReviewError["code"], message: string) =>
  new QaReviewError({ code, message });
const isQaReviewError = Schema.is(QaReviewError);

function mapReviewFailure<A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, QaReviewError, R> {
  return effect.pipe(
    Effect.mapError((cause) =>
      isQaReviewError(cause)
        ? cause
        : new QaReviewError({
            code: "persistence_failed",
            message: `QA review persistence failed during ${operation}.`,
            cause,
          }),
    ),
  );
}

function parseJson<A>(value: string, fallback: A): A {
  try {
    return decodeUnknownJson(value) as A;
  } catch {
    return fallback;
  }
}

function requireBody(value: string): Effect.Effect<string, QaReviewError> {
  const body = value.trim();
  return body.length > 0
    ? Effect.succeed(body)
    : Effect.fail(reviewError("invalid_input", "Review entries cannot be empty."));
}

function requireApprover(actor: QaReviewActor): Effect.Effect<void, QaReviewError> {
  return actor.role === "root" || actor.role === "qa:approver"
    ? Effect.void
    : Effect.fail(reviewError("access_denied", "Only an approver can perform this action."));
}

function terminalAiRun(run: QaReviewAiRunRecord | undefined): run is QaReviewAiRunRecord {
  return run?.status === "completed" || run?.status === "failed";
}

const assertQaReviewDecisionAllowedRaw = Effect.fn("QaReviewService.assertDecisionAllowedSql")(
  function* (
    sql: SqlClient.SqlClient,
    input: {
      readonly threadId: string;
      readonly artifactKind: QaReviewArtifactKind;
      readonly artifactId: string;
      readonly decision: QaReviewDecision;
      readonly blockingThreadIds?: ReadonlyArray<string>;
    },
  ) {
    const openBlocking = yield* sql<{ readonly id: string }>`
    SELECT id FROM qa_review_threads
    WHERE thread_id = ${input.threadId} AND artifact_kind = ${input.artifactKind}
      AND artifact_id = ${input.artifactId} AND severity = 'blocking'
      AND current_status = 'open'
    ORDER BY created_at, id
  `;
    const ids = openBlocking.map((row) => row.id);
    if (input.decision === "approved" && ids.length > 0) {
      return yield* reviewError(
        "invalid_state",
        "Resolve every blocking review comment before approval.",
      );
    }
    if (input.decision === "changes_requested") {
      if (ids.length === 0) {
        return yield* reviewError(
          "invalid_state",
          "Request Changes requires at least one unresolved blocking comment.",
        );
      }
      const requested = new Set(input.blockingThreadIds ?? []);
      if (requested.size === 0 || ids.some((id) => !requested.has(id))) {
        return yield* reviewError(
          "invalid_input",
          "The decision must reference every unresolved blocking comment.",
        );
      }
    }
    return { blockingThreadIds: ids } satisfies QaReviewDecisionCheck;
  },
);

const recordQaReviewDecisionRaw = Effect.fn("QaReviewService.recordDecisionSql")(function* (
  sql: SqlClient.SqlClient,
  input: {
    readonly threadId: string;
    readonly artifactKind: QaReviewArtifactKind;
    readonly artifactId: string;
    readonly decision: QaReviewDecision;
    readonly blockingThreadIds: ReadonlyArray<string>;
    readonly summary?: string;
    readonly actor: QaReviewActor;
    readonly timestamp?: string;
  },
) {
  yield* requireApprover(input.actor);
  const fingerprint = yield* computeQaSourceChain(sql, {
    threadId: input.threadId,
    artifactKind: input.artifactKind,
  }).pipe(
    Effect.mapError(() => reviewError("invalid_state", "The reviewed artifact is unavailable.")),
  );
  const timestamp = input.timestamp ?? (yield* nowIso);
  const id = NodeCrypto.randomUUID();
  yield* sql`
      INSERT INTO qa_review_decisions (
        id, thread_id, artifact_kind, artifact_id, decision,
        blocking_thread_ids_json, summary, actor_id, actor_display_name, actor_role,
        artifact_revision, source_chain_hash, created_at
      ) VALUES (
        ${id}, ${input.threadId}, ${input.artifactKind}, ${input.artifactId},
        ${input.decision}, ${encodeUnknownJson(input.blockingThreadIds)},
        ${input.summary?.trim() || null}, ${input.actor.principalId},
        ${input.actor.displayName}, ${input.actor.role}, ${fingerprint.artifactRevision},
        ${fingerprint.sourceChainHash}, ${timestamp}
      )
    `;
  return id;
});

export const assertQaReviewDecisionAllowed = (
  sql: SqlClient.SqlClient,
  input: Parameters<typeof assertQaReviewDecisionAllowedRaw>[1],
) => mapReviewFailure("assertDecisionAllowed", assertQaReviewDecisionAllowedRaw(sql, input));

export const recordQaReviewDecision = (
  sql: SqlClient.SqlClient,
  input: Parameters<typeof recordQaReviewDecisionRaw>[1],
) => mapReviewFailure("recordDecision", recordQaReviewDecisionRaw(sql, input));

const make = Effect.gen(function* () {
  const sql = yield* QaDatabase;

  const requireExpectedRevision = Effect.fn("QaReviewService.requireExpectedRevision")(function* (
    threadId: string,
    expectedRevision: number,
  ) {
    const rows = yield* sql<{ readonly revision: number }>`
        SELECT revision FROM qa_releases WHERE thread_id = ${threadId}
      `;
    const revision = rows[0]?.revision;
    if (revision === undefined) return yield* reviewError("not_found", "QA release not found.");
    if (revision !== expectedRevision) {
      return yield* reviewError(
        "revision_conflict",
        "The release changed. Refresh before updating its review.",
      );
    }
  });

  const bumpReleaseRevision = Effect.fn("QaReviewService.bumpReleaseRevision")(function* (
    threadId: string,
    timestamp: string,
  ) {
    yield* sql`
      UPDATE qa_releases
      SET revision = revision + 1, updated_at = ${timestamp}
      WHERE thread_id = ${threadId}
    `;
  });

  const loadThreadRow = Effect.fn("QaReviewService.loadThreadRow")(function* (
    threadId: string,
    reviewThreadId: string,
  ) {
    const rows = yield* sql<ThreadRow>`
      SELECT
        id, thread_id AS "threadId", artifact_kind AS "artifactKind",
        artifact_id AS "artifactId", anchor_kind AS "anchorKind", anchor_id AS "anchorId",
        anchor_label AS "anchorLabel", anchor_quote AS "anchorQuote", severity,
        created_by_actor_id AS "createdByActorId",
        created_by_display_name AS "createdByDisplayName",
        created_by_role AS "createdByRole", created_at AS "createdAt",
        current_status AS "currentStatus", resolved_at AS "resolvedAt",
        resolved_by_actor_id AS "resolvedByActorId", latest_event_at AS "latestEventAt"
      FROM qa_review_threads
      WHERE id = ${reviewThreadId} AND thread_id = ${threadId}
    `;
    const row = rows[0];
    if (!row) return yield* reviewError("not_found", "Review thread not found.");
    return row;
  });

  const appendEvent = Effect.fn("QaReviewService.appendEvent")(function* (input: {
    readonly reviewThread: ThreadRow;
    readonly eventKind: ReviewEventKind;
    readonly actor:
      | QaReviewActor
      | { principalId: "system"; displayName: "System"; role: "system" };
    readonly body?: string | null;
    readonly correctsEntryId?: string | null;
    readonly payload?: unknown;
    readonly fingerprint: { readonly artifactRevision: number; readonly sourceChainHash: string };
    readonly timestamp: string;
  }) {
    // A no-op update locks the thread row before allocating its next sequence.
    yield* sql`
      UPDATE qa_review_threads SET latest_event_at = latest_event_at
      WHERE id = ${input.reviewThread.id}
    `;
    const sequenceRows = yield* sql<{ readonly sequenceNo: number }>`
      SELECT COALESCE(MAX(sequence_no), 0) + 1 AS "sequenceNo"
      FROM qa_review_events
      WHERE review_thread_id = ${input.reviewThread.id}
    `;
    const sequenceNo = sequenceRows[0]?.sequenceNo ?? 1;
    const id = NodeCrypto.randomUUID();
    yield* sql`
      INSERT INTO qa_review_events (
        id, review_thread_id, thread_id, sequence_no, event_kind, actor_id,
        actor_display_name, actor_role, body, corrects_entry_id, payload_json,
        artifact_revision, source_chain_hash, created_at
      ) VALUES (
        ${id}, ${input.reviewThread.id}, ${input.reviewThread.threadId}, ${sequenceNo},
        ${input.eventKind}, ${input.actor.principalId}, ${input.actor.displayName},
        ${input.actor.role}, ${input.body ?? null}, ${input.correctsEntryId ?? null},
        ${encodeUnknownJson(input.payload ?? {})}, ${input.fingerprint.artifactRevision},
        ${input.fingerprint.sourceChainHash}, ${input.timestamp}
      )
    `;
    yield* sql`
      UPDATE qa_review_threads SET latest_event_at = ${input.timestamp}
      WHERE id = ${input.reviewThread.id}
    `;
    return { id, sequenceNo };
  });

  const loadAnchor = Effect.fn("QaReviewService.loadAnchor")(function* (
    input: QaAddReviewCommentInput,
  ) {
    const rows =
      input.artifactKind === "strategy" && input.anchor.type === "strategy_section"
        ? yield* sql<AnchorRow>`
            SELECT strategies.id AS "artifactId", sections.title AS "anchorLabel"
            FROM qa_strategies strategies
            JOIN qa_strategy_sections sections ON sections.thread_id = strategies.thread_id
            WHERE strategies.thread_id = ${input.threadId}
              AND strategies.id = ${input.artifactId}
              AND sections.id = ${input.anchor.sectionId}
          `
        : input.artifactKind === "scenario_plan" && input.anchor.type === "scenario"
          ? yield* sql<AnchorRow>`
              SELECT plans.id AS "artifactId", scenarios.title AS "anchorLabel"
              FROM qa_scenario_plans plans
              JOIN qa_scenarios scenarios ON scenarios.thread_id = plans.thread_id
              WHERE plans.thread_id = ${input.threadId}
                AND plans.id = ${input.artifactId}
                AND scenarios.id = ${input.anchor.scenarioId}
            `
          : [];
    const anchor = rows[0];
    if (!anchor) {
      return yield* reviewError(
        "invalid_anchor",
        "The review anchor does not belong to the current artifact.",
      );
    }
    return anchor;
  });

  const loadRows = Effect.fn("QaReviewService.loadRows")(function* (input: {
    readonly threadId: string;
    readonly artifactKind?: QaReviewArtifactKind;
    readonly artifactId?: string;
  }) {
    const threads = yield* sql<ThreadRow>`
      SELECT
        id, thread_id AS "threadId", artifact_kind AS "artifactKind",
        artifact_id AS "artifactId", anchor_kind AS "anchorKind", anchor_id AS "anchorId",
        anchor_label AS "anchorLabel", anchor_quote AS "anchorQuote", severity,
        created_by_actor_id AS "createdByActorId",
        created_by_display_name AS "createdByDisplayName",
        created_by_role AS "createdByRole", created_at AS "createdAt",
        current_status AS "currentStatus", resolved_at AS "resolvedAt",
        resolved_by_actor_id AS "resolvedByActorId", latest_event_at AS "latestEventAt"
      FROM qa_review_threads
      WHERE thread_id = ${input.threadId}
        AND (${input.artifactKind ?? null} IS NULL OR artifact_kind = ${input.artifactKind ?? null})
        AND (${input.artifactId ?? null} IS NULL OR artifact_id = ${input.artifactId ?? null})
      ORDER BY latest_event_at DESC, id
    `;
    if (threads.length === 0) return { threads, events: [], runs: [] };
    const events = yield* sql<EventRow>`
      SELECT
        id, review_thread_id AS "reviewThreadId", thread_id AS "threadId",
        sequence_no AS "sequenceNo", event_kind AS "eventKind", actor_id AS "actorId",
        actor_display_name AS "actorDisplayName", actor_role AS "actorRole", body,
        corrects_entry_id AS "correctsEntryId", payload_json AS "payloadJson",
        artifact_revision AS "artifactRevision", source_chain_hash AS "sourceChainHash",
        created_at AS "createdAt"
      FROM qa_review_events
      WHERE thread_id = ${input.threadId}
      ORDER BY review_thread_id, sequence_no
    `;
    const runs = yield* sql<QaReviewAiRunRecord>`
      SELECT
        id, review_thread_id AS "reviewThreadId", thread_id AS "threadId",
        artifact_revision AS "artifactRevision", source_chain_hash AS "sourceChainHash",
        requested_event_sequence AS "requestedEventSequence", status,
        requested_by_actor_id AS "requestedByActorId",
        requested_by_display_name AS "requestedByDisplayName",
        requested_by_role AS "requestedByRole", requested_at AS "requestedAt",
        started_at AS "startedAt", completed_at AS "completedAt", verdict, rationale,
        citations_json AS "citationsJson", model,
        provider_instance_id AS "providerInstanceId", error_message AS "errorMessage"
      FROM qa_review_ai_runs
      WHERE thread_id = ${input.threadId}
      ORDER BY requested_at DESC, id DESC
    `;
    return { threads, events, runs };
  });

  const projectThread = Effect.fn("QaReviewService.projectThread")(function* (input: {
    readonly row: ThreadRow;
    readonly events: ReadonlyArray<EventRow>;
    readonly runs: ReadonlyArray<QaReviewAiRunRecord>;
    readonly principalId: string;
    readonly receipt?: ReceiptRow;
  }) {
    const fingerprint = yield* computeQaSourceChain(sql, {
      threadId: input.row.threadId,
      artifactKind: input.row.artifactKind,
    }).pipe(
      Effect.mapError(() =>
        reviewError("invalid_state", "The reviewed artifact no longer exists."),
      ),
    );
    const reviewEvents = input.events.filter((event) => event.reviewThreadId === input.row.id);
    const entries = reviewEvents.filter(
      (event) =>
        event.eventKind === "comment" ||
        event.eventKind === "reply" ||
        event.eventKind === "correction",
    );
    const latestReviewerSequence = entries.reduce(
      (latest, event) =>
        event.actorRole === "qa:approver" || event.actorRole === "root"
          ? Math.max(latest, event.sequenceNo)
          : latest,
      0,
    );
    const makerReplies = entries.filter(
      (event) => event.eventKind === "reply" && event.actorRole === "qa:maker",
    );
    const latestMakerReply = makerReplies.at(-1);
    const latestEntrySequence = entries.at(-1)?.sequenceNo ?? 0;
    const latestRun = input.runs.find((run) => run.reviewThreadId === input.row.id);
    const latestRunIsCurrent =
      latestRun !== undefined &&
      latestRun.artifactRevision === fingerprint.artifactRevision &&
      latestRun.sourceChainHash === fingerprint.sourceChainHash &&
      latestRun.requestedEventSequence > latestEntrySequence;
    const resolutionEvent = [...reviewEvents]
      .toReversed()
      .find((event) => event.eventKind === "resolved");
    const resolution = parseJson<{
      readonly aiRunId?: string;
      readonly overrideReason?: string | null;
    }>(resolutionEvent?.payloadJson ?? "{}", {});
    const receiptSequence = input.receipt
      ? (entries.find((entry) => entry.id === input.receipt?.lastReadEntryId)?.sequenceNo ?? 0)
      : 0;
    const unreadCount = entries.filter(
      (entry) => entry.sequenceNo > receiptSequence && entry.actorId !== input.principalId,
    ).length;
    const aiResult =
      latestRun?.status === "completed" && latestRun.verdict && latestRun.rationale
        ? {
            verdict: latestRun.verdict,
            rationale: latestRun.rationale,
            citations: parseJson<ReadonlyArray<QaReviewAiCitation>>(latestRun.citationsJson, []),
          }
        : null;

    return yield* decodeThread({
      id: input.row.id,
      threadId: input.row.threadId,
      artifactKind: input.row.artifactKind,
      artifactId: input.row.artifactId,
      anchor:
        input.row.anchorKind === "strategy_section"
          ? {
              type: "strategy_section",
              sectionId: input.row.anchorId,
              label: input.row.anchorLabel,
              quote: input.row.anchorQuote,
            }
          : {
              type: "scenario",
              scenarioId: input.row.anchorId,
              label: input.row.anchorLabel,
              quote: input.row.anchorQuote,
            },
      severity: input.row.severity,
      status: input.row.currentStatus,
      createdArtifactRevision: reviewEvents[0]?.artifactRevision ?? fingerprint.artifactRevision,
      currentArtifactRevision: fingerprint.artifactRevision,
      currentSourceChainHash: fingerprint.sourceChainHash,
      createdBy: {
        principalId: input.row.createdByActorId,
        displayName: input.row.createdByDisplayName,
        role: input.row.createdByRole,
      },
      entries: entries.map((entry) => ({
        id: entry.id,
        reviewThreadId: entry.reviewThreadId,
        kind: entry.eventKind,
        body: entry.body,
        author: {
          principalId: entry.actorId,
          displayName: entry.actorDisplayName,
          role: entry.actorRole,
        },
        correctsEntryId: entry.correctsEntryId,
        createdAt: entry.createdAt,
      })),
      latestMakerReplyAt: latestMakerReply?.createdAt ?? null,
      latestAiRun: latestRun
        ? {
            id: latestRun.id,
            reviewThreadId: latestRun.reviewThreadId,
            status: latestRun.status,
            requestedBy: {
              principalId: latestRun.requestedByActorId,
              displayName: latestRun.requestedByDisplayName,
              role: latestRun.requestedByRole,
            },
            providerInstanceId: latestRun.providerInstanceId,
            model: latestRun.model,
            artifactRevision: latestRun.artifactRevision,
            sourceChainHash: latestRun.sourceChainHash,
            result: aiResult,
            failureMessage: latestRun.errorMessage,
            stale: !latestRunIsCurrent,
            createdAt: latestRun.requestedAt,
            startedAt: latestRun.startedAt,
            completedAt: latestRun.completedAt,
          }
        : null,
      canRunAiReview:
        input.row.currentStatus === "open" &&
        latestMakerReply !== undefined &&
        latestMakerReply.sequenceNo > latestReviewerSequence &&
        latestRun?.status !== "queued" &&
        latestRun?.status !== "running",
      canResolve:
        input.row.currentStatus === "open" &&
        latestMakerReply !== undefined &&
        latestMakerReply.sequenceNo > latestReviewerSequence &&
        terminalAiRun(latestRun) &&
        latestRunIsCurrent,
      unreadCount,
      createdAt: input.row.createdAt,
      updatedAt: input.row.latestEventAt,
      resolvedAt: input.row.resolvedAt,
      resolvedBy: resolutionEvent
        ? {
            principalId: resolutionEvent.actorId,
            displayName: resolutionEvent.actorDisplayName,
            role: resolutionEvent.actorRole,
          }
        : null,
      resolutionAiRunId: resolution.aiRunId ?? null,
      resolutionOverrideReason: resolution.overrideReason ?? null,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new QaReviewError({
            code: "persistence_failed",
            message: "Stored QA review data is invalid.",
            cause,
          }),
      ),
    );
  });

  const listThreads = Effect.fn("QaReviewService.listThreads")(function* (input: {
    readonly threadId: string;
    readonly principalId: string;
    readonly artifactKind?: QaReviewArtifactKind;
    readonly artifactId?: string;
  }) {
    const { threads, events, runs } = yield* loadRows(input);
    const receipts = yield* sql<ReceiptRow>`
      SELECT
        review_thread_id AS "reviewThreadId", principal_id AS "principalId",
        last_read_entry_id AS "lastReadEntryId", read_at AS "readAt"
      FROM qa_review_read_receipts
      WHERE principal_id = ${input.principalId}
        AND review_thread_id IN (
          SELECT id FROM qa_review_threads WHERE thread_id = ${input.threadId}
        )
    `;
    const reviewThreads = yield* Effect.forEach(threads, (row) =>
      projectThread({
        row,
        events,
        runs,
        principalId: input.principalId,
        ...(receipts.find((receipt) => receipt.reviewThreadId === row.id) !== undefined
          ? {
              receipt: receipts.find((receipt) => receipt.reviewThreadId === row.id)!,
            }
          : {}),
      }),
    );
    const timestamp = yield* nowIso;
    return yield* decodeThreadList({
      threadId: input.threadId,
      reviewThreads,
      readReceipts: receipts.map((receipt) => ({
        threadId: input.threadId,
        reviewThreadId: receipt.reviewThreadId,
        principalId: receipt.principalId,
        lastReadEntryId: receipt.lastReadEntryId,
        readAt: receipt.readAt,
      })),
      generatedAt: timestamp,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new QaReviewError({
            code: "persistence_failed",
            message: "Stored QA review list data is invalid.",
            cause,
          }),
      ),
    );
  });

  const getProjectedThread = Effect.fn("QaReviewService.getProjectedThread")(function* (
    threadId: string,
    reviewThreadId: string,
    principalId: string,
  ) {
    const result = yield* listThreads({ threadId, principalId });
    const thread = result.reviewThreads.find((candidate) => candidate.id === reviewThreadId);
    if (!thread) return yield* reviewError("not_found", "Review thread not found.");
    return thread;
  });

  const addComment = Effect.fn("QaReviewService.addComment")(function* (
    input: QaAddReviewCommentInput,
    actor: QaReviewActor,
  ) {
    yield* requireApprover(actor);
    const body = yield* requireBody(input.body);
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* requireExpectedRevision(input.threadId, input.expectedRevision);
        const anchor = yield* loadAnchor(input);
        const fingerprint = yield* computeQaSourceChain(sql, {
          threadId: input.threadId,
          artifactKind: input.artifactKind,
        }).pipe(
          Effect.mapError(() =>
            reviewError("invalid_state", "The reviewed artifact is unavailable."),
          ),
        );
        const timestamp = yield* nowIso;
        const id = NodeCrypto.randomUUID();
        const reviewThread: ThreadRow = {
          id,
          threadId: input.threadId,
          artifactKind: input.artifactKind,
          artifactId: anchor.artifactId,
          anchorKind: input.anchor.type,
          anchorId:
            input.anchor.type === "strategy_section"
              ? input.anchor.sectionId
              : input.anchor.scenarioId,
          anchorLabel: input.anchor.label || anchor.anchorLabel,
          anchorQuote: input.anchor.quote,
          severity: input.severity,
          createdByActorId: actor.principalId,
          createdByDisplayName: actor.displayName,
          createdByRole: actor.role,
          createdAt: timestamp,
          currentStatus: "open",
          resolvedAt: null,
          resolvedByActorId: null,
          latestEventAt: timestamp,
        };
        yield* sql`
          INSERT INTO qa_review_threads (
            id, thread_id, artifact_kind, artifact_id, anchor_kind, anchor_id,
            anchor_label, anchor_quote, severity, created_by_actor_id,
            created_by_display_name, created_by_role, created_at, current_status,
            resolved_at, resolved_by_actor_id, latest_event_at
          ) VALUES (
            ${id}, ${input.threadId}, ${input.artifactKind}, ${anchor.artifactId},
            ${input.anchor.type}, ${reviewThread.anchorId}, ${reviewThread.anchorLabel},
            ${input.anchor.quote}, ${input.severity}, ${actor.principalId},
            ${actor.displayName}, ${actor.role}, ${timestamp}, 'open', NULL, NULL, ${timestamp}
          )
        `;
        yield* appendEvent({
          reviewThread,
          eventKind: "comment",
          actor,
          body,
          fingerprint,
          timestamp,
        });
        yield* bumpReleaseRevision(input.threadId, timestamp);
        return yield* getProjectedThread(input.threadId, id, actor.principalId);
      }),
    );
  });

  const reply = Effect.fn("QaReviewService.reply")(function* (
    input: QaReplyReviewCommentInput,
    actor: QaReviewActor,
  ) {
    const body = yield* requireBody(input.body);
    if (actor.role !== "qa:maker" && actor.role !== "root" && actor.role !== "qa:approver") {
      return yield* reviewError("access_denied", "This actor cannot reply to review comments.");
    }
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* requireExpectedRevision(input.threadId, input.expectedRevision);
        const row = yield* loadThreadRow(input.threadId, input.reviewThreadId);
        if (row.currentStatus !== "open") {
          return yield* reviewError("invalid_state", "Resolved review threads are immutable.");
        }
        if (input.correctsEntryId !== undefined) {
          const corrected = yield* sql<EventRow>`
            SELECT
              id, review_thread_id AS "reviewThreadId", thread_id AS "threadId",
              sequence_no AS "sequenceNo", event_kind AS "eventKind", actor_id AS "actorId",
              actor_display_name AS "actorDisplayName", actor_role AS "actorRole", body,
              corrects_entry_id AS "correctsEntryId", payload_json AS "payloadJson",
              artifact_revision AS "artifactRevision", source_chain_hash AS "sourceChainHash",
              created_at AS "createdAt"
            FROM qa_review_events
            WHERE id = ${input.correctsEntryId} AND review_thread_id = ${input.reviewThreadId}
              AND event_kind IN ('comment', 'reply', 'correction')
          `;
          if (corrected[0]?.actorId !== actor.principalId) {
            return yield* reviewError(
              "invalid_input",
              "Corrections may only supersede one of the actor's own entries.",
            );
          }
        }
        const fingerprint = yield* computeQaSourceChain(sql, {
          threadId: input.threadId,
          artifactKind: row.artifactKind,
        }).pipe(
          Effect.mapError(() =>
            reviewError("invalid_state", "The reviewed artifact is unavailable."),
          ),
        );
        const timestamp = yield* nowIso;
        yield* appendEvent({
          reviewThread: row,
          eventKind: input.correctsEntryId === undefined ? "reply" : "correction",
          actor,
          body,
          correctsEntryId: input.correctsEntryId ?? null,
          fingerprint,
          timestamp,
        });
        yield* bumpReleaseRevision(input.threadId, timestamp);
        return yield* getProjectedThread(input.threadId, row.id, actor.principalId);
      }),
    );
  });

  const enqueueAiRun = Effect.fn("QaReviewService.enqueueAiRun")(function* (
    input: QaRunReviewCommentAiCheckInput,
    actor: QaReviewActor,
  ) {
    yield* requireApprover(actor);
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* requireExpectedRevision(input.threadId, input.expectedRevision);
        const row = yield* loadThreadRow(input.threadId, input.reviewThreadId);
        if (row.currentStatus !== "open") {
          return yield* reviewError(
            "invalid_state",
            "Resolved review threads cannot be reviewed again.",
          );
        }
        const latest = yield* sql<{
          readonly latestReviewerSequence: number;
          readonly latestMakerReplySequence: number;
        }>`
          SELECT
            COALESCE(MAX(CASE
              WHEN actor_role IN ('root', 'qa:approver')
                AND event_kind IN ('comment', 'reply', 'correction') THEN sequence_no
              ELSE 0 END), 0) AS "latestReviewerSequence",
            COALESCE(MAX(CASE
              WHEN actor_role = 'qa:maker' AND event_kind = 'reply' THEN sequence_no
              ELSE 0 END), 0) AS "latestMakerReplySequence"
          FROM qa_review_events
          WHERE review_thread_id = ${row.id}
        `;
        if (!latest[0] || latest[0].latestMakerReplySequence <= latest[0].latestReviewerSequence) {
          return yield* reviewError(
            "invalid_state",
            "The maker must reply that the comment was addressed before AI review can run.",
          );
        }
        const fingerprint = yield* computeQaSourceChain(sql, {
          threadId: input.threadId,
          artifactKind: row.artifactKind,
        }).pipe(
          Effect.mapError(() =>
            reviewError("invalid_state", "The reviewed artifact is unavailable."),
          ),
        );
        const timestamp = yield* nowIso;
        const event = yield* appendEvent({
          reviewThread: row,
          eventKind: "ai_queued",
          actor,
          fingerprint,
          timestamp,
        });
        const runId = NodeCrypto.randomUUID();
        yield* sql`
          INSERT INTO qa_review_ai_runs (
            id, review_thread_id, thread_id, artifact_revision, source_chain_hash,
            requested_event_sequence, status, requested_by_actor_id,
            requested_by_display_name, requested_by_role, requested_at, started_at,
            completed_at, verdict, rationale, citations_json, model,
            provider_instance_id, error_message
          ) VALUES (
            ${runId}, ${row.id}, ${row.threadId}, ${fingerprint.artifactRevision},
            ${fingerprint.sourceChainHash}, ${event.sequenceNo}, 'queued',
            ${actor.principalId}, ${actor.displayName}, ${actor.role}, ${timestamp},
            NULL, NULL, NULL, NULL, '[]', NULL, NULL, NULL
          )
        `;
        yield* bumpReleaseRevision(input.threadId, timestamp);
        const projected = yield* getProjectedThread(input.threadId, row.id, actor.principalId);
        if (!projected.latestAiRun) {
          return yield* reviewError("persistence_failed", "Queued AI review was not projected.");
        }
        return projected.latestAiRun satisfies QaReviewAiRun;
      }),
    );
  });

  const loadAiReviewPacket = Effect.fn("QaReviewService.loadAiReviewPacket")(function* (
    runId: string,
  ) {
    const runs = yield* sql<QaReviewAiRunRecord>`
      SELECT
        id, review_thread_id AS "reviewThreadId", thread_id AS "threadId",
        artifact_revision AS "artifactRevision", source_chain_hash AS "sourceChainHash",
        requested_event_sequence AS "requestedEventSequence", status,
        requested_by_actor_id AS "requestedByActorId",
        requested_by_display_name AS "requestedByDisplayName",
        requested_by_role AS "requestedByRole", requested_at AS "requestedAt",
        started_at AS "startedAt", completed_at AS "completedAt", verdict, rationale,
        citations_json AS "citationsJson", model,
        provider_instance_id AS "providerInstanceId", error_message AS "errorMessage"
      FROM qa_review_ai_runs WHERE id = ${runId}
    `;
    const run = runs[0];
    if (!run) return yield* reviewError("not_found", "AI review run not found.");
    const releases = yield* sql<{ readonly projectId: string }>`
      SELECT project_id AS "projectId" FROM qa_releases WHERE thread_id = ${run.threadId}
    `;
    const projectId = releases[0]?.projectId;
    if (!projectId) return yield* reviewError("not_found", "QA release not found.");
    const row = yield* loadThreadRow(run.threadId, run.reviewThreadId);
    const packet = yield* loadQaGroundedSourcePacket(sql, {
      threadId: run.threadId,
      artifactKind: row.artifactKind,
    }).pipe(
      Effect.mapError(() =>
        reviewError("invalid_state", "The grounded source chain is unavailable."),
      ),
    );
    const reviewThread = yield* getProjectedThread(
      run.threadId,
      run.reviewThreadId,
      run.requestedByActorId,
    );
    return { run, reviewThread, packet, projectId } satisfies QaAiReviewPacket;
  });

  const claimNextAiRun = Effect.fn("QaReviewService.claimNextAiRun")(function* () {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const timestamp = yield* nowIso;
        const runs = yield* sql<QaReviewAiRunRecord>`
          UPDATE qa_review_ai_runs
          SET status = 'running', started_at = ${timestamp}
          WHERE id = (
            SELECT id FROM qa_review_ai_runs
            WHERE status = 'queued'
            ORDER BY requested_at, id
            LIMIT 1
          ) AND status = 'queued'
          RETURNING
            id, review_thread_id AS "reviewThreadId", thread_id AS "threadId",
            artifact_revision AS "artifactRevision", source_chain_hash AS "sourceChainHash",
            requested_event_sequence AS "requestedEventSequence", status,
            requested_by_actor_id AS "requestedByActorId",
            requested_by_display_name AS "requestedByDisplayName",
            requested_by_role AS "requestedByRole", requested_at AS "requestedAt",
            started_at AS "startedAt", completed_at AS "completedAt", verdict, rationale,
            citations_json AS "citationsJson", model,
            provider_instance_id AS "providerInstanceId", error_message AS "errorMessage"
        `;
        const run = runs[0];
        if (!run) return null;
        const row = yield* loadThreadRow(run.threadId, run.reviewThreadId);
        yield* appendEvent({
          reviewThread: row,
          eventKind: "ai_started",
          actor: { principalId: "system", displayName: "System", role: "system" },
          payload: { runId: run.id },
          fingerprint: {
            artifactRevision: run.artifactRevision,
            sourceChainHash: run.sourceChainHash,
          },
          timestamp,
        });
        yield* bumpReleaseRevision(run.threadId, timestamp);
        const loaded = yield* loadAiReviewPacket(run.id);
        return {
          runId: run.id,
          reviewThreadId: run.reviewThreadId,
          projectId: loaded.projectId,
          reviewThread: loaded.reviewThread,
          packet: loaded.packet,
        } satisfies QaClaimedAiReview;
      }),
    );
  });

  const requeueInterruptedAiRuns = Effect.fn("QaReviewService.requeueInterruptedAiRuns")(
    function* () {
      return yield* sql.withTransaction(
        Effect.gen(function* () {
          const interrupted = yield* sql<QaReviewAiRunRecord>`
            UPDATE qa_review_ai_runs
            SET status = 'queued', started_at = NULL
            WHERE status = 'running'
            RETURNING
              id, review_thread_id AS "reviewThreadId", thread_id AS "threadId",
              artifact_revision AS "artifactRevision", source_chain_hash AS "sourceChainHash",
              requested_event_sequence AS "requestedEventSequence", status,
              requested_by_actor_id AS "requestedByActorId",
              requested_by_display_name AS "requestedByDisplayName",
              requested_by_role AS "requestedByRole", requested_at AS "requestedAt",
              started_at AS "startedAt", completed_at AS "completedAt", verdict, rationale,
              citations_json AS "citationsJson", model,
              provider_instance_id AS "providerInstanceId", error_message AS "errorMessage"
          `;
          for (const run of interrupted) {
            const timestamp = yield* nowIso;
            const row = yield* loadThreadRow(run.threadId, run.reviewThreadId);
            yield* appendEvent({
              reviewThread: row,
              eventKind: "ai_queued",
              actor: { principalId: "system", displayName: "System", role: "system" },
              payload: { runId: run.id, recoveredAfterRestart: true },
              fingerprint: {
                artifactRevision: run.artifactRevision,
                sourceChainHash: run.sourceChainHash,
              },
              timestamp,
            });
            yield* bumpReleaseRevision(run.threadId, timestamp);
          }
          return interrupted.length;
        }),
      );
    },
  );

  const completeAiRun = Effect.fn("QaReviewService.completeAiRun")(function* (input: {
    readonly runId: string;
    readonly result: QaReviewAiResult;
    readonly providerInstanceId: string;
    readonly model: string;
  }) {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const loaded = yield* loadAiReviewPacket(input.runId);
        if (loaded.run.status !== "running") {
          return yield* reviewError("invalid_state", "Only a running AI review can complete.");
        }
        const validation = validateQaReviewCitations(loaded.packet, input.result.citations);
        const chainChanged =
          loaded.packet.artifactRevision !== loaded.run.artifactRevision ||
          loaded.packet.sourceChainHash !== loaded.run.sourceChainHash;
        const ungroundedAgreement =
          input.result.verdict === "agrees" && validation.valid.length === 0;
        const result: QaReviewAiResult =
          validation.invalid.length === 0 && !chainChanged && !ungroundedAgreement
            ? input.result
            : {
                verdict: "inconclusive",
                rationale: `${input.result.rationale}\n\nGrounding validation: ${
                  chainChanged
                    ? "the artifact or source chain changed while this review was running."
                    : ungroundedAgreement
                      ? "an agreement verdict requires at least one validated citation."
                      : `${validation.invalid.length} citation(s) could not be verified.`
                }`,
                citations: validation.valid,
              };
        const timestamp = yield* nowIso;
        yield* sql`
          UPDATE qa_review_ai_runs
          SET status = 'completed', completed_at = ${timestamp}, verdict = ${result.verdict},
              rationale = ${result.rationale}, citations_json = ${encodeUnknownJson(result.citations)},
              model = ${input.model}, provider_instance_id = ${input.providerInstanceId},
              error_message = NULL
          WHERE id = ${input.runId} AND status = 'running'
        `;
        const row = yield* loadThreadRow(loaded.run.threadId, loaded.run.reviewThreadId);
        yield* appendEvent({
          reviewThread: row,
          eventKind: "ai_completed",
          actor: { principalId: "system", displayName: "System", role: "system" },
          payload: { runId: input.runId, verdict: result.verdict },
          fingerprint: {
            artifactRevision: loaded.run.artifactRevision,
            sourceChainHash: loaded.run.sourceChainHash,
          },
          timestamp,
        });
        yield* bumpReleaseRevision(loaded.run.threadId, timestamp);
        return result;
      }),
    );
  });

  const failAiRun = Effect.fn("QaReviewService.failAiRun")(function* (input: {
    readonly runId: string;
    readonly message: string;
    readonly providerInstanceId?: string;
    readonly model?: string;
  }) {
    const message = yield* requireBody(input.message);
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const loaded = yield* loadAiReviewPacket(input.runId);
        if (loaded.run.status !== "running" && loaded.run.status !== "queued") {
          return yield* reviewError("invalid_state", "This AI review is already terminal.");
        }
        const timestamp = yield* nowIso;
        yield* sql`
          UPDATE qa_review_ai_runs
          SET status = 'failed', started_at = COALESCE(started_at, ${timestamp}),
              completed_at = ${timestamp}, verdict = NULL, rationale = NULL,
              citations_json = '[]', model = ${input.model ?? null},
              provider_instance_id = ${input.providerInstanceId ?? null},
              error_message = ${message}
          WHERE id = ${input.runId} AND status IN ('queued', 'running')
        `;
        const row = yield* loadThreadRow(loaded.run.threadId, loaded.run.reviewThreadId);
        yield* appendEvent({
          reviewThread: row,
          eventKind: "ai_failed",
          actor: { principalId: "system", displayName: "System", role: "system" },
          payload: { runId: input.runId, message },
          fingerprint: {
            artifactRevision: loaded.run.artifactRevision,
            sourceChainHash: loaded.run.sourceChainHash,
          },
          timestamp,
        });
        yield* bumpReleaseRevision(loaded.run.threadId, timestamp);
      }),
    );
  });

  const resolve = Effect.fn("QaReviewService.resolve")(function* (
    input: QaResolveReviewCommentInput,
    actor: QaReviewActor,
  ) {
    yield* requireApprover(actor);
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* requireExpectedRevision(input.threadId, input.expectedRevision);
        const row = yield* loadThreadRow(input.threadId, input.reviewThreadId);
        if (row.currentStatus !== "open") {
          return yield* reviewError("invalid_state", "This review thread is already resolved.");
        }
        const fingerprint = yield* computeQaSourceChain(sql, {
          threadId: row.threadId,
          artifactKind: row.artifactKind,
        }).pipe(
          Effect.mapError(() =>
            reviewError("invalid_state", "The reviewed artifact is unavailable."),
          ),
        );
        const runs = yield* sql<QaReviewAiRunRecord>`
          SELECT
            id, review_thread_id AS "reviewThreadId", thread_id AS "threadId",
            artifact_revision AS "artifactRevision", source_chain_hash AS "sourceChainHash",
            requested_event_sequence AS "requestedEventSequence", status,
            requested_by_actor_id AS "requestedByActorId",
            requested_by_display_name AS "requestedByDisplayName",
            requested_by_role AS "requestedByRole", requested_at AS "requestedAt",
            started_at AS "startedAt", completed_at AS "completedAt", verdict, rationale,
            citations_json AS "citationsJson", model,
            provider_instance_id AS "providerInstanceId", error_message AS "errorMessage"
          FROM qa_review_ai_runs
          WHERE id = ${input.aiRunId} AND review_thread_id = ${row.id}
        `;
        const run = runs[0];
        if (
          !terminalAiRun(run) ||
          run.artifactRevision !== fingerprint.artifactRevision ||
          run.sourceChainHash !== fingerprint.sourceChainHash
        ) {
          return yield* reviewError(
            "invalid_state",
            "Resolve requires a terminal AI review for the current artifact and source chain.",
          );
        }
        const latestEntries = yield* sql<{
          readonly latestReviewerSequence: number;
          readonly latestMakerSequence: number;
          readonly latestEntrySequence: number;
        }>`
          SELECT
            COALESCE(MAX(CASE
              WHEN actor_role IN ('root', 'qa:approver')
                AND event_kind IN ('comment', 'reply', 'correction') THEN sequence_no
              ELSE 0 END), 0) AS "latestReviewerSequence",
            COALESCE(MAX(CASE
              WHEN actor_role = 'qa:maker' AND event_kind = 'reply' THEN sequence_no
              ELSE 0 END), 0) AS "latestMakerSequence",
            COALESCE(MAX(CASE
              WHEN event_kind IN ('comment', 'reply', 'correction') THEN sequence_no
              ELSE 0 END), 0) AS "latestEntrySequence"
          FROM qa_review_events
          WHERE review_thread_id = ${row.id}
        `;
        const latest = latestEntries[0];
        if (
          !latest ||
          latest.latestMakerSequence <= latest.latestReviewerSequence ||
          run.requestedEventSequence <= latest.latestEntrySequence
        ) {
          return yield* reviewError(
            "invalid_state",
            "The maker must reply and the AI review must run after the latest approver entry.",
          );
        }
        const requiresOverride = run.status === "failed" || run.verdict !== "agrees";
        const overrideReason = input.overrideReason?.trim() || null;
        if (requiresOverride && overrideReason === null) {
          return yield* reviewError(
            "invalid_input",
            "An override reason is required when the AI does not agree or fails.",
          );
        }
        const timestamp = yield* nowIso;
        yield* appendEvent({
          reviewThread: row,
          eventKind: "resolved",
          actor,
          payload: { aiRunId: run.id, overrideReason },
          fingerprint,
          timestamp,
        });
        yield* sql`
          UPDATE qa_review_threads
          SET current_status = 'resolved', resolved_at = ${timestamp},
              resolved_by_actor_id = ${actor.principalId}, latest_event_at = ${timestamp}
          WHERE id = ${row.id} AND current_status = 'open'
        `;
        if (row.artifactKind === "strategy") {
          // Migrated legacy comments retain their original id. Keep the compatibility
          // projection in sync while the append-only review event remains authoritative.
          yield* sql`
            UPDATE qa_strategy_comments
            SET status = 'resolved', resolved_at = ${timestamp},
                resolved_by = ${actor.displayName}
            WHERE id = ${row.id} AND thread_id = ${row.threadId} AND status = 'open'
          `;
        }
        yield* bumpReleaseRevision(row.threadId, timestamp);
        return yield* getProjectedThread(row.threadId, row.id, actor.principalId);
      }),
    );
  });

  const markRead = Effect.fn("QaReviewService.markRead")(function* (
    input: QaMarkReviewReadInput,
    actor: QaReviewActor,
  ) {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const row = yield* loadThreadRow(input.threadId, input.reviewThreadId);
        const entries = yield* sql<{ readonly id: string; readonly sequenceNo: number }>`
          SELECT id, sequence_no AS "sequenceNo" FROM qa_review_events
          WHERE id = ${input.throughEntryId} AND review_thread_id = ${row.id}
            AND event_kind IN ('comment', 'reply', 'correction')
        `;
        const target = entries[0];
        if (!target) {
          return yield* reviewError("invalid_input", "Read position is not a review entry.");
        }
        const existing = yield* sql<{
          readonly lastReadEntryId: string;
          readonly readAt: string;
          readonly sequenceNo: number;
        }>`
          SELECT
            receipts.last_read_entry_id AS "lastReadEntryId", receipts.read_at AS "readAt",
            events.sequence_no AS "sequenceNo"
          FROM qa_review_read_receipts receipts
          JOIN qa_review_events events ON events.id = receipts.last_read_entry_id
          WHERE receipts.review_thread_id = ${row.id}
            AND receipts.principal_id = ${actor.principalId}
        `;
        if (existing[0] && existing[0].sequenceNo >= target.sequenceNo) {
          return {
            threadId: input.threadId,
            reviewThreadId: row.id,
            principalId: actor.principalId,
            lastReadEntryId: existing[0].lastReadEntryId,
            readAt: existing[0].readAt,
          } satisfies QaReviewReadReceipt;
        }
        const timestamp = yield* nowIso;
        yield* sql`
          INSERT INTO qa_review_read_receipts (
            review_thread_id, principal_id, last_read_entry_id, read_at, updated_at
          ) VALUES (${row.id}, ${actor.principalId}, ${input.throughEntryId}, ${timestamp}, ${timestamp})
          ON CONFLICT (review_thread_id, principal_id) DO UPDATE SET
            last_read_entry_id = excluded.last_read_entry_id,
            read_at = excluded.read_at,
            updated_at = excluded.updated_at
        `;
        return {
          threadId: input.threadId,
          reviewThreadId: row.id,
          principalId: actor.principalId,
          lastReadEntryId: input.throughEntryId,
          readAt: timestamp,
        } satisfies QaReviewReadReceipt;
      }),
    );
  });

  const assertDecisionAllowed = Effect.fn("QaReviewService.assertDecisionAllowed")(
    function* (input: {
      readonly threadId: string;
      readonly artifactKind: QaReviewArtifactKind;
      readonly artifactId: string;
      readonly decision: QaReviewDecision;
      readonly blockingThreadIds?: ReadonlyArray<string>;
    }) {
      return yield* assertQaReviewDecisionAllowed(sql, input);
    },
  );

  const recordDecision = Effect.fn("QaReviewService.recordDecision")(function* (input: {
    readonly threadId: string;
    readonly artifactKind: QaReviewArtifactKind;
    readonly artifactId: string;
    readonly decision: QaReviewDecision;
    readonly blockingThreadIds: ReadonlyArray<string>;
    readonly summary?: string;
    readonly actor: QaReviewActor;
  }) {
    return yield* recordQaReviewDecision(sql, input);
  });

  return {
    listThreads: (input: Parameters<typeof listThreads>[0]) =>
      mapReviewFailure("listThreads", listThreads(input)),
    addComment: (...args: Parameters<typeof addComment>) =>
      mapReviewFailure("addComment", addComment(...args)),
    reply: (...args: Parameters<typeof reply>) => mapReviewFailure("reply", reply(...args)),
    enqueueAiRun: (...args: Parameters<typeof enqueueAiRun>) =>
      mapReviewFailure("enqueueAiRun", enqueueAiRun(...args)),
    requeueInterruptedAiRuns: () =>
      mapReviewFailure("requeueInterruptedAiRuns", requeueInterruptedAiRuns()),
    claimNextAiRun: () => mapReviewFailure("claimNextAiRun", claimNextAiRun()),
    loadAiReviewPacket: (runId: string) =>
      mapReviewFailure("loadAiReviewPacket", loadAiReviewPacket(runId)),
    completeAiRun: (input: Parameters<typeof completeAiRun>[0]) =>
      mapReviewFailure("completeAiRun", completeAiRun(input)),
    failAiRun: (input: Parameters<typeof failAiRun>[0]) =>
      mapReviewFailure("failAiRun", failAiRun(input)),
    resolve: (...args: Parameters<typeof resolve>) => mapReviewFailure("resolve", resolve(...args)),
    markRead: (...args: Parameters<typeof markRead>) =>
      mapReviewFailure("markRead", markRead(...args)),
    assertDecisionAllowed: (input: Parameters<typeof assertDecisionAllowed>[0]) =>
      mapReviewFailure("assertDecisionAllowed", assertDecisionAllowed(input)),
    recordDecision: (input: Parameters<typeof recordDecision>[0]) =>
      mapReviewFailure("recordDecision", recordDecision(input)),
  };
});

export type QaReviewServiceShape = Effect.Success<typeof make>;

export class QaReviewService extends Context.Service<QaReviewService, QaReviewServiceShape>()(
  "t3/qa/QaReviewService",
) {}

export const layer = Layer.effect(QaReviewService, make);
