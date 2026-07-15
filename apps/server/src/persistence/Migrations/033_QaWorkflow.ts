import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_releases (
      thread_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode = 'qa'),
      release_number INTEGER NOT NULL CHECK (release_number > 0),
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
      phase TEXT NOT NULL CHECK (phase IN ('documents', 'ingestion', 'requirements_review', 'ready')),
      ingestion_status TEXT NOT NULL CHECK (ingestion_status IN ('idle', 'queued', 'processing', 'completed', 'failed')),
      ingestion_progress INTEGER NOT NULL CHECK (ingestion_progress BETWEEN 0 AND 100),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_documents (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
      sha256 TEXT NOT NULL,
      content_blob BLOB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('uploaded', 'processing', 'processed', 'failed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_requirements (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      source_document_id TEXT REFERENCES qa_documents(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      decision_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_approval_gates (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('requirements_review', 'release_readiness')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      decision_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_documents_thread_created
    ON qa_documents(thread_id, created_at, id)
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_releases_project_number
    ON qa_releases(project_id, release_number)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_requirements_thread_created
    ON qa_requirements(thread_id, created_at, id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_approval_gates_thread_created
    ON qa_approval_gates(thread_id, created_at, id)
  `;
});
