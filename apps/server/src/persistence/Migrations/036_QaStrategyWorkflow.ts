import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_strategies (
      thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      generation_status TEXT NOT NULL CHECK (generation_status IN (
        'queued', 'generating', 'complete', 'failed', 'stale'
      )),
      review_status TEXT NOT NULL CHECK (review_status IN (
        'draft', 'pending_review', 'approved', 'rejected'
      )),
      rejection_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT,
      submitted_by TEXT,
      approved_at TEXT,
      approved_by TEXT,
      rejected_at TEXT,
      rejected_by TEXT
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_strategy_sections (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_strategies(thread_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL CHECK (order_index >= 0),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (thread_id, order_index)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_strategy_section_requirements (
      thread_id TEXT NOT NULL REFERENCES qa_strategies(thread_id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES qa_strategy_sections(id) ON DELETE CASCADE,
      requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, section_id, requirement_id)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_strategy_comments (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_strategies(thread_id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES qa_strategy_sections(id) ON DELETE CASCADE,
      quote TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
      author TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_strategy_comment_replies (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_strategies(thread_id) ON DELETE CASCADE,
      comment_id TEXT NOT NULL REFERENCES qa_strategy_comments(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_strategy_sections_thread_order
    ON qa_strategy_sections(thread_id, order_index)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_strategy_comments_thread_created
    ON qa_strategy_comments(thread_id, created_at, id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_strategy_comment_replies_comment_created
    ON qa_strategy_comment_replies(comment_id, created_at, id)
  `;
});
