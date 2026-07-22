import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE qa_stage_states
    ADD COLUMN active_environment_id TEXT
  `;
  yield* sql`
    ALTER TABLE qa_stage_states
    ADD COLUMN active_conversation_thread_id TEXT
  `;
  yield* sql`
    ALTER TABLE qa_stage_states
    ADD COLUMN active_provider_session_id TEXT
  `;
});
