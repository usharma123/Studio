import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_script_plans (
      thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      id TEXT NOT NULL UNIQUE,
      revision INTEGER NOT NULL CHECK (revision > 0),
      generation_status TEXT NOT NULL CHECK (generation_status IN ('queued','generating','complete','failed','stale')),
      review_status TEXT NOT NULL CHECK (review_status IN ('draft','pending_review','approved','rejected')),
      rejection_note TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      submitted_at TEXT, submitted_by TEXT,
      approved_at TEXT, approved_by TEXT,
      rejected_at TEXT, rejected_by TEXT
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_scripts (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_script_plans(thread_id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      framework TEXT NOT NULL,
      language TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft','ready','executed','failed')),
      execution_status TEXT NOT NULL CHECK (execution_status IN ('not_run','queued','running','passed','failed')),
      last_run_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (thread_id, external_id),
      UNIQUE (thread_id, file_name)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_script_test_cases (
      thread_id TEXT NOT NULL REFERENCES qa_script_plans(thread_id) ON DELETE CASCADE,
      script_id TEXT NOT NULL REFERENCES qa_scripts(id) ON DELETE CASCADE,
      test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,
      PRIMARY KEY (thread_id, script_id, test_case_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_script_requirements (
      thread_id TEXT NOT NULL REFERENCES qa_script_plans(thread_id) ON DELETE CASCADE,
      script_id TEXT NOT NULL REFERENCES qa_scripts(id) ON DELETE CASCADE,
      requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,
      PRIMARY KEY (thread_id, script_id, requirement_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_script_evidence (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL REFERENCES qa_scripts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('log','report','screenshot','other')),
      summary TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_readiness_reviews (
      thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      review_status TEXT NOT NULL CHECK (review_status IN ('pending','approved','rejected')),
      decision_note TEXT,
      computed_at TEXT NOT NULL,
      approved_at TEXT, approved_by TEXT,
      rejected_at TEXT, rejected_by TEXT
    )
  `;
});
