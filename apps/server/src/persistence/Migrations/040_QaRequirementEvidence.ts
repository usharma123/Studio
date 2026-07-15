import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE qa_requirements ADD COLUMN source_document_name TEXT`;
  yield* sql`ALTER TABLE qa_requirements ADD COLUMN confidence REAL NOT NULL DEFAULT 0`;
  yield* sql`ALTER TABLE qa_requirements ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE qa_requirements ADD COLUMN extraction_method TEXT NOT NULL DEFAULT 'unknown'`;
});
