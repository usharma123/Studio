import { PgClient } from "@effect/sql-pg";
import { assert, describe, it } from "@effect/vitest";
import * as NodeCrypto from "node:crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";

import { migrateQaDatabase, QA_POSTGRES_MIGRATION_LOCK_KEY } from "./QaDatabaseMigrations.ts";

// Opt in with an administrative scratch URL whose role may CREATE/DROP DATABASE.
// Every test creates an isolated UUID-named database and never migrates the URL's database.
const TEST_ADMIN_URL = process.env.T3CODE_QA_MIGRATION_TEST_ADMIN_URL?.trim() || undefined;

type TestDatabase = {
  readonly databaseName: string;
  readonly databaseUrl: string;
};

class MigrationLockWaitError extends Schema.TaggedErrorClass<MigrationLockWaitError>()(
  "MigrationLockWaitError",
  { applicationName: Schema.String },
) {}

const makePgClient = Effect.fn("QaDatabaseMigrationsTest.makePgClient")(function* (
  databaseUrl: string,
  applicationName: string,
) {
  return yield* PgClient.make({
    url: Redacted.make(databaseUrl),
    applicationName,
    minConnections: 1,
    maxConnections: 1,
  }).pipe(Effect.provide(Reactivity.layer));
});

const databaseUrlFor = (adminUrl: string, databaseName: string) => {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  url.searchParams.set("options", "-c search_path=t3_qa");
  return url.toString();
};

const acquireTestDatabase = Effect.fn("QaDatabaseMigrationsTest.acquireDatabase")(function* (
  admin: PgClient.PgClient,
  adminUrl: string,
) {
  const databaseName = `t3_qa_migration_${NodeCrypto.randomUUID().replaceAll("-", "")}`;
  yield* admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  return {
    databaseName,
    databaseUrl: databaseUrlFor(adminUrl, databaseName),
  } satisfies TestDatabase;
});

const releaseTestDatabase = Effect.fn("QaDatabaseMigrationsTest.releaseDatabase")(function* (
  admin: PgClient.PgClient,
  database: TestDatabase,
) {
  yield* admin.unsafe(`DROP DATABASE "${database.databaseName}" WITH (FORCE)`);
});

const makeTestDatabase = Effect.fn("QaDatabaseMigrationsTest.makeDatabase")(function* (
  admin: PgClient.PgClient,
  adminUrl: string,
) {
  return yield* Effect.acquireRelease(acquireTestDatabase(admin, adminUrl), (database) =>
    releaseTestDatabase(admin, database).pipe(Effect.orDie),
  );
});

const waitForAdvisoryLock = Effect.fn("QaDatabaseMigrationsTest.waitForAdvisoryLock")(
  function* (observer: PgClient.PgClient, applicationName: string) {
    const rows = yield* observer<{ readonly waiting: boolean }>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE application_name = ${applicationName}
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND wait_event = 'advisory'
      ) AS "waiting"
    `;
    if (rows[0]?.waiting !== true) {
      return yield* new MigrationLockWaitError({ applicationName });
    }
  },
  Effect.retry(Schedule.spaced("10 millis")),
  Effect.timeout("5 seconds"),
);

const runConcurrentMigrations = Effect.fn("QaDatabaseMigrationsTest.runConcurrent")(function* (
  databaseUrl: string,
  runName: string,
) {
  const clients = yield* Effect.forEach([0, 1, 2, 3], (index) =>
    makePgClient(databaseUrl, `qa-migration-${runName}-${index}`),
  );
  const start = yield* Deferred.make<void>();
  const fibers = yield* Effect.forEach(clients, (client) =>
    Effect.gen(function* () {
      yield* Deferred.await(start);
      yield* migrateQaDatabase(client);
    }).pipe(Effect.forkScoped),
  );

  yield* Deferred.succeed(start, undefined);
  yield* Effect.forEach(fibers, Fiber.join, { concurrency: "unbounded", discard: true });
});

describe.runIf(TEST_ADMIN_URL !== undefined)("PostgreSQL QA migrations", () => {
  it.live(
    "waits for the pipeline lock before creating the schema",
    () =>
      Effect.gen(function* () {
        const adminUrl = TEST_ADMIN_URL;
        if (adminUrl === undefined) return;

        const admin = yield* makePgClient(adminUrl, "qa-migration-test-admin");
        const database = yield* makeTestDatabase(admin, adminUrl);
        const blocker = yield* makePgClient(database.databaseUrl, "qa-migration-lock-blocker");
        const observer = yield* makePgClient(database.databaseUrl, "qa-migration-lock-observer");
        const migrationApplicationName = "qa-migration-lock-waiter";
        const migrator = yield* makePgClient(database.databaseUrl, migrationApplicationName);
        const lockAcquired = yield* Deferred.make<void>();
        const releaseLock = yield* Deferred.make<void>();

        const blockerFiber = yield* blocker
          .withTransaction(
            Effect.gen(function* () {
              yield* blocker`SELECT pg_advisory_xact_lock(${QA_POSTGRES_MIGRATION_LOCK_KEY})`;
              yield* Deferred.succeed(lockAcquired, undefined);
              yield* Deferred.await(releaseLock);
            }),
          )
          .pipe(Effect.forkScoped);
        yield* Deferred.await(lockAcquired);

        const migrationFiber = yield* migrateQaDatabase(migrator).pipe(Effect.forkScoped);
        yield* waitForAdvisoryLock(observer, migrationApplicationName);

        const namespaces = yield* observer<{ readonly exists: boolean }>`
          SELECT EXISTS (
            SELECT 1 FROM pg_namespace WHERE nspname = 't3_qa'
          ) AS "exists"
        `;
        assert.isFalse(namespaces[0]?.exists ?? true);

        yield* Deferred.succeed(releaseLock, undefined);
        yield* Fiber.join(blockerFiber);
        yield* Fiber.join(migrationFiber);

        const tables = yield* observer<{ readonly exists: boolean }>`
          SELECT to_regclass('t3_qa.qa_releases') IS NOT NULL AS "exists"
        `;
        assert.isTrue(tables[0]?.exists ?? false);
      }).pipe(Effect.scoped),
    30_000,
  );

  it.live(
    "serializes concurrent cold and warm starts without duplicating ledger entries or schema objects",
    () =>
      Effect.gen(function* () {
        const adminUrl = TEST_ADMIN_URL;
        if (adminUrl === undefined) return;

        const admin = yield* makePgClient(adminUrl, "qa-migration-test-admin");
        const database = yield* makeTestDatabase(admin, adminUrl);

        yield* runConcurrentMigrations(database.databaseUrl, "cold");
        const observer = yield* makePgClient(database.databaseUrl, "qa-migration-test-observer");
        const preservedThreadId = "qa-migration-preserved-release";
        const preservedAt = "2026-07-17T12:00:00.000Z";
        yield* observer`
          INSERT INTO qa_releases (
            thread_id, project_id, mode, release_number, title, status, phase,
            ingestion_status, ingestion_progress, active_stage, revision, created_at, updated_at
          ) VALUES (
            ${preservedThreadId}, '0d847684-ce8e-438c-894f-76b9f7ef80fb', 'qa', 99,
            'Preserved migration release', 'active', 'ready', 'completed', 100,
            'readiness', 7, ${preservedAt}, ${preservedAt}
          )
        `;
        yield* observer`
          INSERT INTO qa_review_threads (
            id, thread_id, artifact_kind, artifact_id, anchor_kind, anchor_id,
            anchor_label, anchor_quote, severity, created_by_actor_id,
            created_by_display_name, created_by_role, created_at, current_status,
            resolved_at, resolved_by_actor_id, latest_event_at
          ) VALUES (
            'preserved-review-thread', ${preservedThreadId}, 'strategy',
            'preserved-strategy', 'strategy_section', 'preserved-section',
            'Preserved section', 'Preserved quote', 'blocking', 'local:qa:maker',
            'Local QA Maker', 'qa:maker', ${preservedAt}, 'open', NULL, NULL, ${preservedAt}
          )
        `;
        yield* observer`
          INSERT INTO qa_review_events (
            id, review_thread_id, thread_id, sequence_no, event_kind, actor_id,
            actor_display_name, actor_role, body, corrects_entry_id, payload_json,
            artifact_revision, source_chain_hash, created_at
          ) VALUES (
            'preserved-review-event', 'preserved-review-thread', ${preservedThreadId}, 1,
            'comment', 'local:qa:approver', 'Local QA Approver', 'qa:approver',
            'Preserve this approval discussion.', NULL, '{"preserved":true}', 7,
            'preserved-source-chain', ${preservedAt}
          )
        `;
        yield* observer`
          INSERT INTO qa_review_decisions (
            id, thread_id, artifact_kind, artifact_id, decision,
            blocking_thread_ids_json, summary, actor_id, actor_display_name, actor_role,
            artifact_revision, source_chain_hash, created_at
          ) VALUES (
            'preserved-review-decision', ${preservedThreadId}, 'strategy',
            'preserved-strategy', 'approved', '[]', 'Preserved root approval.',
            'local:root', 'Local Root', 'root', 7, 'preserved-source-chain', ${preservedAt}
          )
        `;
        const readPreservedState = observer<{
          readonly payload: string;
        }>`
          SELECT jsonb_build_object(
            'release', (
              SELECT to_jsonb(release_row)
              FROM qa_releases release_row
              WHERE thread_id = ${preservedThreadId}
            ),
            'assignments', (
              SELECT jsonb_agg(to_jsonb(assignment_row) ORDER BY principal_id)
              FROM qa_project_assignments assignment_row
              WHERE project_id = '0d847684-ce8e-438c-894f-76b9f7ef80fb'
            ),
            'reviewThread', (
              SELECT to_jsonb(review_thread_row)
              FROM qa_review_threads review_thread_row
              WHERE id = 'preserved-review-thread'
            ),
            'reviewEvent', (
              SELECT to_jsonb(review_event_row)
              FROM qa_review_events review_event_row
              WHERE id = 'preserved-review-event'
            ),
            'reviewDecision', (
              SELECT to_jsonb(review_decision_row)
              FROM qa_review_decisions review_decision_row
              WHERE id = 'preserved-review-decision'
            )
          )::TEXT AS "payload"
        `;
        const preservedBeforeWarmStart = yield* readPreservedState;

        yield* runConcurrentMigrations(database.databaseUrl, "warm");

        const preservedAfterWarmStart = yield* readPreservedState;
        assert.deepEqual(preservedAfterWarmStart, preservedBeforeWarmStart);
        const ledger = yield* observer<{
          readonly version: number;
          readonly name: string;
        }>`
          SELECT version, name
          FROM qa_postgres_migrations
          ORDER BY version
        `;
        assert.deepEqual(ledger, [
          { version: 2026071401, name: "qa_iam_project_authorization" },
          { version: 2026071601, name: "qa_release_conversations_environment_scope" },
        ]);

        const constraints = yield* observer<{ readonly count: string }>`
          SELECT COUNT(*)::TEXT AS "count"
          FROM pg_constraint
          WHERE conrelid = 't3_qa.qa_traceability_edges'::regclass
            AND conname = 'qa_traceability_edges_kind_check'
        `;
        assert.equal(constraints[0]?.count, "1");

        const triggers = yield* observer<{ readonly name: string }>`
          SELECT tgname AS "name"
          FROM pg_trigger
          WHERE tgrelid IN (
            't3_qa.qa_review_events'::regclass,
            't3_qa.qa_review_decisions'::regclass,
            't3_qa.qa_review_ai_runs'::regclass
          )
            AND NOT tgisinternal
          ORDER BY tgname
        `;
        assert.deepEqual(triggers, [
          { name: "qa_review_ai_runs_terminal_immutable" },
          { name: "qa_review_decisions_append_only" },
          { name: "qa_review_events_append_only" },
        ]);
      }).pipe(Effect.scoped),
    60_000,
  );
});
