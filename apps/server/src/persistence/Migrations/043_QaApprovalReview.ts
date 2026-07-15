import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_review_threads (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('strategy', 'scenario_plan')),
      artifact_id TEXT NOT NULL,
      anchor_kind TEXT NOT NULL CHECK (anchor_kind IN ('strategy_section', 'scenario')),
      anchor_id TEXT NOT NULL,
      anchor_label TEXT NOT NULL,
      anchor_quote TEXT,
      severity TEXT NOT NULL CHECK (severity IN ('blocking', 'advisory')),
      created_by_actor_id TEXT NOT NULL,
      created_by_display_name TEXT NOT NULL,
      created_by_role TEXT NOT NULL CHECK (created_by_role IN (
        'root', 'qa:maker', 'qa:approver', 'system'
      )),
      created_at TEXT NOT NULL,
      current_status TEXT NOT NULL CHECK (current_status IN ('open', 'resolved')),
      resolved_at TEXT,
      resolved_by_actor_id TEXT,
      latest_event_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_review_events (
      id TEXT PRIMARY KEY,
      review_thread_id TEXT NOT NULL REFERENCES qa_review_threads(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
      event_kind TEXT NOT NULL CHECK (event_kind IN (
        'comment', 'reply', 'correction', 'ai_queued', 'ai_started',
        'ai_completed', 'ai_failed', 'resolved'
      )),
      actor_id TEXT NOT NULL,
      actor_display_name TEXT NOT NULL,
      actor_role TEXT NOT NULL CHECK (actor_role IN (
        'root', 'qa:maker', 'qa:approver', 'system'
      )),
      body TEXT,
      corrects_entry_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      artifact_revision INTEGER NOT NULL CHECK (artifact_revision > 0),
      source_chain_hash TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (review_thread_id, sequence_no)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_review_ai_runs (
      id TEXT PRIMARY KEY,
      review_thread_id TEXT NOT NULL REFERENCES qa_review_threads(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      artifact_revision INTEGER NOT NULL CHECK (artifact_revision > 0),
      source_chain_hash TEXT NOT NULL,
      requested_event_sequence INTEGER NOT NULL CHECK (requested_event_sequence > 0),
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
      requested_by_actor_id TEXT NOT NULL,
      requested_by_display_name TEXT NOT NULL,
      requested_by_role TEXT NOT NULL CHECK (requested_by_role IN ('root', 'qa:approver')),
      requested_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      verdict TEXT CHECK (verdict IN ('agrees', 'disagrees', 'inconclusive')),
      rationale TEXT,
      citations_json TEXT NOT NULL DEFAULT '[]',
      model TEXT,
      provider_instance_id TEXT,
      error_message TEXT
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_review_decisions (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('strategy', 'scenario_plan')),
      artifact_id TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
      blocking_thread_ids_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT,
      actor_id TEXT NOT NULL,
      actor_display_name TEXT NOT NULL,
      actor_role TEXT NOT NULL CHECK (actor_role IN ('root', 'qa:approver')),
      artifact_revision INTEGER NOT NULL CHECK (artifact_revision > 0),
      source_chain_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_review_read_receipts (
      review_thread_id TEXT NOT NULL REFERENCES qa_review_threads(id) ON DELETE CASCADE,
      principal_id TEXT NOT NULL,
      last_read_entry_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (review_thread_id, principal_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_review_threads_release_artifact
    ON qa_review_threads(thread_id, artifact_kind, artifact_id, current_status, latest_event_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_review_events_thread_created
    ON qa_review_events(review_thread_id, created_at, id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_review_ai_runs_thread_requested
    ON qa_review_ai_runs(review_thread_id, requested_at DESC, id)
  `;
  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_review_ai_runs_one_active
    ON qa_review_ai_runs(review_thread_id)
    WHERE status IN ('queued', 'running')
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_review_decisions_release_created
    ON qa_review_decisions(thread_id, created_at DESC, id)
  `;

  // Preserve the stricter legacy behavior: every existing strategy comment
  // blocked approval, so migrated threads are blocking unless explicitly
  // recreated as advisory in the new review model.
  yield* sql`
    INSERT INTO qa_review_threads (
      id, thread_id, artifact_kind, artifact_id, anchor_kind, anchor_id,
      anchor_label, anchor_quote, severity, created_by_actor_id, created_by_display_name,
      created_by_role,
      created_at, current_status, resolved_at, resolved_by_actor_id, latest_event_at
    )
    SELECT
      comments.id,
      comments.thread_id,
      'strategy',
      strategies.id,
      'strategy_section',
      comments.section_id,
      sections.title,
      comments.quote,
      'blocking',
      comments.author,
      comments.author,
      'qa:approver',
      comments.created_at,
      comments.status,
      comments.resolved_at,
      comments.resolved_by,
      COALESCE(
        comments.resolved_at,
        (SELECT MAX(replies.created_at)
         FROM qa_strategy_comment_replies replies
         WHERE replies.comment_id = comments.id),
        comments.created_at
      )
    FROM qa_strategy_comments comments
    JOIN qa_strategies strategies ON strategies.thread_id = comments.thread_id
    JOIN qa_strategy_sections sections ON sections.id = comments.section_id
    ON CONFLICT (id) DO NOTHING
  `;

  yield* sql`
    INSERT INTO qa_review_events (
      id, review_thread_id, thread_id, sequence_no, event_kind, actor_id,
      actor_display_name, actor_role, body,
      payload_json, artifact_revision, source_chain_hash, created_at
    )
    SELECT
      'legacy-comment:' || comments.id,
      comments.id,
      comments.thread_id,
      1,
      'comment',
      comments.author,
      comments.author,
      'qa:approver',
      comments.body,
      '{"legacy":true}',
      strategies.revision,
      NULL,
      comments.created_at
    FROM qa_strategy_comments comments
    JOIN qa_strategies strategies ON strategies.thread_id = comments.thread_id
    ON CONFLICT (id) DO NOTHING
  `;

  yield* sql`
    INSERT INTO qa_review_events (
      id, review_thread_id, thread_id, sequence_no, event_kind, actor_id,
      actor_display_name, actor_role, body,
      payload_json, artifact_revision, source_chain_hash, created_at
    )
    SELECT
      'legacy-reply:' || replies.id,
      replies.comment_id,
      replies.thread_id,
      1 + ROW_NUMBER() OVER (
        PARTITION BY replies.comment_id ORDER BY replies.created_at, replies.id
      ),
      'reply',
      replies.author,
      replies.author,
      'qa:maker',
      replies.body,
      '{"legacy":true}',
      strategies.revision,
      NULL,
      replies.created_at
    FROM qa_strategy_comment_replies replies
    JOIN qa_strategies strategies ON strategies.thread_id = replies.thread_id
    ON CONFLICT (id) DO NOTHING
  `;

  yield* sql`
    INSERT INTO qa_review_events (
      id, review_thread_id, thread_id, sequence_no, event_kind, actor_id,
      actor_display_name, actor_role, body,
      payload_json, artifact_revision, source_chain_hash, created_at
    )
    SELECT
      'legacy-resolved:' || comments.id,
      comments.id,
      comments.thread_id,
      2 + (
        SELECT COUNT(*) FROM qa_strategy_comment_replies replies
        WHERE replies.comment_id = comments.id
      ),
      'resolved',
      COALESCE(comments.resolved_by, 'QA Approver'),
      COALESCE(comments.resolved_by, 'QA Approver'),
      'qa:approver',
      NULL,
      '{"legacy":true,"aiRunId":"legacy:no-ai-review"}',
      strategies.revision,
      NULL,
      COALESCE(comments.resolved_at, comments.created_at)
    FROM qa_strategy_comments comments
    JOIN qa_strategies strategies ON strategies.thread_id = comments.thread_id
    WHERE comments.status = 'resolved'
    ON CONFLICT (id) DO NOTHING
  `;

  yield* sql`
    CREATE TRIGGER IF NOT EXISTS qa_review_events_no_update
    BEFORE UPDATE ON qa_review_events
    BEGIN
      SELECT RAISE(ABORT, 'qa_review_events is append-only');
    END
  `;
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS qa_review_events_no_delete
    BEFORE DELETE ON qa_review_events
    BEGIN
      SELECT RAISE(ABORT, 'qa_review_events is append-only');
    END
  `;
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS qa_review_decisions_no_update
    BEFORE UPDATE ON qa_review_decisions
    BEGIN
      SELECT RAISE(ABORT, 'qa_review_decisions is append-only');
    END
  `;
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS qa_review_decisions_no_delete
    BEFORE DELETE ON qa_review_decisions
    BEGIN
      SELECT RAISE(ABORT, 'qa_review_decisions is append-only');
    END
  `;
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS qa_review_ai_runs_terminal_no_update
    BEFORE UPDATE ON qa_review_ai_runs
    WHEN OLD.status IN ('completed', 'failed')
    BEGIN
      SELECT RAISE(ABORT, 'terminal qa_review_ai_runs rows are immutable');
    END
  `;
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS qa_review_ai_runs_no_delete
    BEFORE DELETE ON qa_review_ai_runs
    BEGIN
      SELECT RAISE(ABORT, 'qa_review_ai_runs cannot be deleted');
    END
  `;
});
