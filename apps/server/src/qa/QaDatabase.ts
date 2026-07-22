import { PgClient } from "@effect/sql-pg";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { migrateQaDatabase } from "./QaDatabaseMigrations.ts";

const DEFAULT_QA_DATABASE_URL =
  "postgres://t3code_qa:t3code_qa@127.0.0.1:55433/t3code_qa?options=-c%20search_path%3Dt3_qa";

export class QaDatabase extends Context.Service<QaDatabase, SqlClient.SqlClient>()(
  "t3/qa/QaDatabase",
) {}

const liveConfig = Config.all({
  databaseUrl: Config.string("T3CODE_QA_DATABASE_URL").pipe(
    Config.withDefault(DEFAULT_QA_DATABASE_URL),
  ),
});

/** Shared PostgreSQL pool for QA persistence and cross-process notifications. */
export const postgresLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* liveConfig;
    return PgClient.layer({
      url: Redacted.make(config.databaseUrl),
      applicationName: "t3-qa-workflow",
      maxConnections: 8,
      minConnections: 1,
      connectTimeout: "5 seconds",
      idleTimeout: "30 seconds",
      spanAttributes: {
        "db.namespace": "t3_qa",
        "service.name": "t3-server",
      },
    });
  }),
);

export const layer = Layer.effect(
  QaDatabase,
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;
    yield* migrateQaDatabase(sql);
    return sql;
  }),
).pipe(Layer.provide(postgresLayer));

/** Test adapter: QA and orchestration share the in-memory SQLite client. */
export const layerFromSqlClient = Layer.effect(
  QaDatabase,
  Effect.map(SqlClient.SqlClient, (sql) => sql),
);
