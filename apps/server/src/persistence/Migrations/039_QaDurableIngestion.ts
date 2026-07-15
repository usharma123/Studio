import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_document_chunks (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES qa_documents(id) ON DELETE CASCADE,
      requirement_external_id TEXT,
      chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
      text_content TEXT NOT NULL,
      byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
      section_path TEXT,
      source_block_ids_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_ingestion_jobs (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_job_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
      stage TEXT NOT NULL,
      progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
      message TEXT NOT NULL,
      last_error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_document_chunks_thread_document
    ON qa_document_chunks(thread_id, document_id, chunk_index)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_ingestion_jobs_thread_started
    ON qa_ingestion_jobs(thread_id, started_at)
  `;
});
