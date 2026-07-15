import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_authored_flows (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      actor TEXT NOT NULL,
      trigger_text TEXT NOT NULL,
      narrative TEXT NOT NULL,
      outcome TEXT NOT NULL,
      legs_json TEXT NOT NULL DEFAULT '[]',
      component_ids_json TEXT NOT NULL DEFAULT '[]',
      component_mentions_json TEXT NOT NULL DEFAULT '[]',
      requirement_ids_json TEXT NOT NULL DEFAULT '[]',
      source_document_id TEXT REFERENCES qa_documents(id) ON DELETE SET NULL,
      review_status TEXT NOT NULL CHECK (review_status IN (
        'pending', 'reviewed', 'manual_override'
      )),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (thread_id, external_id)
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_authored_flows_thread_external
    ON qa_authored_flows(thread_id, external_id)
  `;
});
