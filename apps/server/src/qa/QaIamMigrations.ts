import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";

const IAM_MIGRATION_VERSION = 2026071401;
const IAM_MIGRATION_NAME = "qa_iam_project_authorization";
const RELEASE_CONVERSATION_ENVIRONMENT_MIGRATION_VERSION = 2026071601;
const RELEASE_CONVERSATION_ENVIRONMENT_MIGRATION_NAME =
  "qa_release_conversations_environment_scope";

/** Existing bindings are retained but isolated until a new environment-scoped binding is made. */
export const LEGACY_QA_ENVIRONMENT_ID = "legacy:unscoped";

export const LOCAL_REPRO_ORGANIZATION_ID = "local-repro-org";
export const LOCAL_REPRO_PROJECT_ID = "0d847684-ce8e-438c-894f-76b9f7ef80fb";

export const LOCAL_PRINCIPALS = {
  root: {
    id: "local:root",
    subject: "local:root",
    displayName: "Local Root",
    role: "root",
  },
  maker: {
    id: "local:qa:maker",
    subject: "local:qa:maker",
    displayName: "Local QA Maker",
    role: "qa:maker",
  },
  approver: {
    id: "local:qa:approver",
    subject: "local:qa:approver",
    displayName: "Local QA Approver",
    role: "qa:approver",
  },
} as const;

const applyIamMigration = Effect.fn("QaIamMigrations.applyIamMigration")(function* (
  sql: SqlClient.SqlClient,
) {
  yield* sql`
    CREATE TABLE IF NOT EXISTS application_principals (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      principal_type TEXT NOT NULL DEFAULT 'user'
        CHECK (principal_type IN ('user', 'service')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS organization_memberships (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      principal_id TEXT NOT NULL REFERENCES application_principals(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, principal_id)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_projects (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
      repository_reference TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (id, organization_id),
      UNIQUE (organization_id, slug)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_project_assignments (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('root', 'qa:maker', 'qa:approver')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, principal_id),
      FOREIGN KEY (project_id, organization_id)
        REFERENCES qa_projects(id, organization_id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id, principal_id)
        REFERENCES organization_memberships(organization_id, principal_id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_release_conversations (
      release_thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      principal_id TEXT NOT NULL REFERENCES application_principals(id) ON DELETE CASCADE,
      environment_id TEXT NOT NULL DEFAULT 'legacy:unscoped',
      conversation_thread_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (release_thread_id, principal_id, environment_id)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_audit_events (
      id TEXT PRIMARY KEY,
      occurred_at TEXT NOT NULL,
      principal_id TEXT NOT NULL REFERENCES application_principals(id),
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      project_id TEXT NOT NULL REFERENCES qa_projects(id),
      release_thread_id TEXT REFERENCES qa_releases(thread_id) ON DELETE SET NULL,
      conversation_thread_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_project_assignments_principal
    ON qa_project_assignments(principal_id, project_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_release_conversations_principal
    ON qa_release_conversations(principal_id, release_thread_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_audit_events_project_occurred
    ON qa_audit_events(project_id, occurred_at DESC, id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_audit_events_release_occurred
    ON qa_audit_events(release_thread_id, occurred_at DESC, id)
  `;

  yield* sql`
    CREATE OR REPLACE FUNCTION reject_qa_audit_event_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'qa_audit_events is append-only';
    END;
    $$
  `;
  yield* sql`DROP TRIGGER IF EXISTS qa_audit_events_append_only ON qa_audit_events`;
  yield* sql`
    CREATE TRIGGER qa_audit_events_append_only
    BEFORE UPDATE OR DELETE ON qa_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_qa_audit_event_mutation()
  `;

  const seededAt = "2026-07-14T00:00:00.000Z";
  yield* sql`
    INSERT INTO organizations (id, name, status, created_at, updated_at)
    VALUES (${LOCAL_REPRO_ORGANIZATION_ID}, 'Local Repro Organization', 'active', ${seededAt}, ${seededAt})
    ON CONFLICT (id) DO NOTHING
  `;

  for (const principal of Object.values(LOCAL_PRINCIPALS)) {
    yield* sql`
      INSERT INTO application_principals (
        id, subject, display_name, principal_type, status, created_at, updated_at
      ) VALUES (
        ${principal.id}, ${principal.subject}, ${principal.displayName}, 'user', 'active',
        ${seededAt}, ${seededAt}
      )
      ON CONFLICT (id) DO NOTHING
    `;
    yield* sql`
      INSERT INTO organization_memberships (
        organization_id, principal_id, status, created_at, updated_at
      ) VALUES (
        ${LOCAL_REPRO_ORGANIZATION_ID}, ${principal.id}, 'active', ${seededAt}, ${seededAt}
      )
      ON CONFLICT (organization_id, principal_id) DO NOTHING
    `;
  }

  yield* sql`
    INSERT INTO qa_projects (
      id, organization_id, slug, name, status, repository_reference, created_at, updated_at
    ) VALUES (
      ${LOCAL_REPRO_PROJECT_ID}, ${LOCAL_REPRO_ORGANIZATION_ID}, 'repro', 'Repro', 'active',
      NULL, ${seededAt}, ${seededAt}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  // Existing QA releases predate the project table. Preserve their identifiers
  // and place any non-Repro legacy project in the deterministic local organization.
  yield* sql`
    INSERT INTO qa_projects (
      id, organization_id, slug, name, status, repository_reference, created_at, updated_at
    )
    SELECT DISTINCT
      releases.project_id,
      ${LOCAL_REPRO_ORGANIZATION_ID},
      CONCAT('legacy-', MD5(releases.project_id)),
      CONCAT('Legacy QA project ', releases.project_id),
      'active',
      NULL,
      ${seededAt},
      ${seededAt}
    FROM qa_releases releases
    ON CONFLICT (id) DO NOTHING
  `;

  for (const principal of Object.values(LOCAL_PRINCIPALS)) {
    yield* sql`
      INSERT INTO qa_project_assignments (
        organization_id, project_id, principal_id, role, created_at, updated_at
      ) VALUES (
        ${LOCAL_REPRO_ORGANIZATION_ID}, ${LOCAL_REPRO_PROJECT_ID}, ${principal.id},
        ${principal.role}, ${seededAt}, ${seededAt}
      )
      ON CONFLICT (project_id, principal_id) DO NOTHING
    `;
  }

  // Add the project FK only after compatibility rows exist for every legacy release.
  yield* sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'qa_releases_project_id_fkey'
          AND conrelid = 'qa_releases'::regclass
      ) THEN
        ALTER TABLE qa_releases
        ADD CONSTRAINT qa_releases_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES qa_projects(id) NOT VALID;
      END IF;
    END;
    $$
  `;
  yield* sql`ALTER TABLE qa_releases VALIDATE CONSTRAINT qa_releases_project_id_fkey`;
});

const applyReleaseConversationEnvironmentMigration = Effect.fn(
  "QaIamMigrations.applyReleaseConversationEnvironmentMigration",
)(function* (sql: SqlClient.SqlClient) {
  yield* sql`
    ALTER TABLE qa_release_conversations
    ADD COLUMN IF NOT EXISTS environment_id TEXT
  `;
  yield* sql`
    UPDATE qa_release_conversations
    SET environment_id = ${LEGACY_QA_ENVIRONMENT_ID}
    WHERE environment_id IS NULL
  `;
  yield* sql`
    ALTER TABLE qa_release_conversations
    ALTER COLUMN environment_id SET NOT NULL
  `;
  yield* sql`
    ALTER TABLE qa_release_conversations
    ALTER COLUMN environment_id SET DEFAULT 'legacy:unscoped'
  `;
  yield* sql`
    ALTER TABLE qa_release_conversations
    DROP CONSTRAINT IF EXISTS qa_release_conversations_pkey
  `;
  yield* sql`
    ALTER TABLE qa_release_conversations
    ADD CONSTRAINT qa_release_conversations_pkey
    PRIMARY KEY (release_thread_id, principal_id, environment_id)
  `;
});

/** Applies ledgered IAM migrations inside the caller's QA migration lock and transaction. */
export const migrateQaIamDatabaseUnderLock = Effect.fn("QaIamMigrations.migrateUnderLock")(
  function* (sql: SqlClient.SqlClient) {
    yield* sql`
    CREATE TABLE IF NOT EXISTS qa_postgres_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL
    )
  `;

    const applied = yield* sql<{ readonly version: number }>`
    SELECT version
    FROM qa_postgres_migrations
    WHERE version IN (
      ${IAM_MIGRATION_VERSION},
      ${RELEASE_CONVERSATION_ENVIRONMENT_MIGRATION_VERSION}
    )
  `;
    const appliedVersions = new Set(applied.map((migration) => migration.version));

    if (!appliedVersions.has(IAM_MIGRATION_VERSION)) {
      yield* applyIamMigration(sql);
      yield* sql`
      INSERT INTO qa_postgres_migrations (version, name, applied_at)
      VALUES (${IAM_MIGRATION_VERSION}, ${IAM_MIGRATION_NAME}, CURRENT_TIMESTAMP)
    `;
    }

    if (!appliedVersions.has(RELEASE_CONVERSATION_ENVIRONMENT_MIGRATION_VERSION)) {
      yield* applyReleaseConversationEnvironmentMigration(sql);
      yield* sql`
      INSERT INTO qa_postgres_migrations (version, name, applied_at)
      VALUES (
        ${RELEASE_CONVERSATION_ENVIRONMENT_MIGRATION_VERSION},
        ${RELEASE_CONVERSATION_ENVIRONMENT_MIGRATION_NAME},
        CURRENT_TIMESTAMP
      )
    `;
    }
  },
);
