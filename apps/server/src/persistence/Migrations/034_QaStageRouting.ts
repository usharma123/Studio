import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE qa_releases
    ADD COLUMN active_stage TEXT NOT NULL DEFAULT 'intake'
      CHECK (active_stage IN (
        'intake', 'requirements', 'strategy', 'scenarios', 'test_cases', 'scripts', 'readiness'
      ))
  `;

  yield* sql`
    ALTER TABLE qa_releases
    ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_stage_states (
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK (stage IN (
        'intake', 'requirements', 'strategy', 'scenarios', 'test_cases', 'scripts', 'readiness'
      )),
      ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 7),
      status TEXT NOT NULL CHECK (status IN (
        'locked', 'ready', 'queued', 'running', 'awaiting_review', 'blocked', 'complete', 'stale'
      )),
      progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
      active_job_id TEXT,
      blocked_reason TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, stage),
      UNIQUE (thread_id, ordinal)
    )
  `;

  yield* sql`
    UPDATE qa_releases
    SET active_stage = CASE
      WHEN phase IN ('documents', 'ingestion') THEN 'intake'
      WHEN phase = 'requirements_review' THEN 'requirements'
      ELSE 'strategy'
    END
  `;

  yield* sql`
    INSERT OR IGNORE INTO qa_stage_states (
      thread_id, stage, ordinal, status, progress, active_job_id, blocked_reason, updated_at
    )
    SELECT
      thread_id,
      'intake',
      1,
      CASE
        WHEN phase IN ('requirements_review', 'ready') THEN 'complete'
        WHEN ingestion_status = 'queued' THEN 'queued'
        WHEN ingestion_status = 'processing' THEN 'running'
        WHEN ingestion_status = 'failed' THEN 'blocked'
        ELSE 'ready'
      END,
      CASE
        WHEN phase IN ('requirements_review', 'ready') THEN 100
        ELSE ingestion_progress
      END,
      NULL,
      CASE WHEN ingestion_status = 'failed' THEN 'Document ingestion failed.' ELSE NULL END,
      updated_at
    FROM qa_releases
  `;

  yield* sql`
    INSERT OR IGNORE INTO qa_stage_states (
      thread_id, stage, ordinal, status, progress, active_job_id, blocked_reason, updated_at
    )
    SELECT
      thread_id,
      'requirements',
      2,
      CASE
        WHEN phase = 'ready' THEN 'complete'
        WHEN phase = 'requirements_review' THEN 'awaiting_review'
        ELSE 'locked'
      END,
      CASE WHEN phase = 'ready' THEN 100 ELSE 0 END,
      NULL,
      NULL,
      updated_at
    FROM qa_releases
  `;

  yield* sql`
    INSERT OR IGNORE INTO qa_stage_states (
      thread_id, stage, ordinal, status, progress, active_job_id, blocked_reason, updated_at
    )
    SELECT
      thread_id,
      stage,
      ordinal,
      CASE WHEN phase = 'ready' AND stage = 'strategy' THEN 'ready' ELSE 'locked' END,
      0,
      NULL,
      NULL,
      updated_at
    FROM qa_releases
    CROSS JOIN (
      SELECT 'strategy' AS stage, 3 AS ordinal
      UNION ALL SELECT 'scenarios', 4
      UNION ALL SELECT 'test_cases', 5
      UNION ALL SELECT 'scripts', 6
      UNION ALL SELECT 'readiness', 7
    ) AS future_stages
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_stage_states_thread_ordinal
    ON qa_stage_states(thread_id, ordinal)
  `;
});
