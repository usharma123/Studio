import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(qa_traceability_nodes)
  `;

  if (!columns.some((column) => column.name === "external_id")) {
    yield* sql`
      ALTER TABLE qa_traceability_nodes
      ADD COLUMN external_id TEXT
    `;
  }
});
