import { assert, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as QaDatabase from "./QaDatabase.ts";
import { QaIam, layer as QaIamLayer } from "./QaIam.ts";
import { LEGACY_QA_ENVIRONMENT_ID } from "./QaIamMigrations.ts";

const ORGANIZATION_ID = "test-org";
const PROJECT_ID = "test-project";
const RELEASE_THREAD_ID = "test-release";
const NOW = "2026-07-14T00:00:00.000Z";
const ENVIRONMENT_ID = EnvironmentId.make("test-environment");
const OTHER_ENVIRONMENT_ID = EnvironmentId.make("other-test-environment");
const decodeUnknownJsonString = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);

const setupIamSchema = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`
      CREATE TABLE application_principals (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        principal_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE organization_memberships (
        organization_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (organization_id, principal_id)
      )
    `;
    yield* sql`
      CREATE TABLE qa_projects (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        repository_reference TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE qa_project_assignments (
        organization_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, principal_id)
      )
    `;
    yield* sql`
      CREATE TABLE qa_release_conversations (
        release_thread_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        conversation_thread_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (release_thread_id, principal_id, environment_id)
      )
    `;
    yield* sql`
      CREATE TABLE qa_audit_events (
        id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        release_thread_id TEXT,
        conversation_thread_id TEXT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      )
    `;

    yield* sql`
      INSERT INTO organizations (id, name, status, created_at, updated_at)
      VALUES (${ORGANIZATION_ID}, 'Test Organization', 'active', ${NOW}, ${NOW})
    `;
    yield* sql`
      INSERT INTO qa_projects (
        id, organization_id, slug, name, status, repository_reference, created_at, updated_at
      ) VALUES (
        ${PROJECT_ID}, ${ORGANIZATION_ID}, 'test-project', 'Test Project', 'active', NULL,
        ${NOW}, ${NOW}
      )
    `;

    const principals = [
      { id: "principal-root", subject: "test:root", role: "root" },
      { id: "principal-maker", subject: "test:maker", role: "qa:maker" },
      { id: "principal-approver", subject: "test:approver", role: "qa:approver" },
    ] as const;
    for (const principal of principals) {
      yield* sql`
        INSERT INTO application_principals (
          id, subject, display_name, principal_type, status, created_at, updated_at
        ) VALUES (
          ${principal.id}, ${principal.subject}, ${principal.subject}, 'user', 'active',
          ${NOW}, ${NOW}
        )
      `;
      yield* sql`
        INSERT INTO organization_memberships (
          organization_id, principal_id, status, created_at, updated_at
        ) VALUES (${ORGANIZATION_ID}, ${principal.id}, 'active', ${NOW}, ${NOW})
      `;
      yield* sql`
        INSERT INTO qa_project_assignments (
          organization_id, project_id, principal_id, role, created_at, updated_at
        ) VALUES (
          ${ORGANIZATION_ID}, ${PROJECT_ID}, ${principal.id}, ${principal.role}, ${NOW}, ${NOW}
        )
      `;
    }

    yield* sql`
      INSERT INTO qa_releases (
        thread_id, project_id, mode, release_number, title, status, phase,
        ingestion_status, ingestion_progress, created_at, updated_at
      ) VALUES (
        ${RELEASE_THREAD_ID}, ${PROJECT_ID}, 'qa', 1, 'Release 1', 'active', 'documents',
        'idle', 0, ${NOW}, ${NOW}
      )
    `;
  }),
);

const QaPersistenceTest = QaDatabase.layerFromSqlClient.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);

const layer = it.layer(
  Layer.merge(QaIamLayer, setupIamSchema).pipe(Layer.provideMerge(QaPersistenceTest)),
);

layer("QaIam", (it) => {
  it.effect("resolves project-scoped role capabilities", () =>
    Effect.gen(function* () {
      const iam = yield* QaIam;

      const root = yield* iam.authorizeProject({
        subject: "test:root",
        projectId: PROJECT_ID,
        capability: "qa:approve",
      });
      assert.equal(root.role, "root");

      const maker = yield* iam.authorizeProject({
        subject: "test:maker",
        projectId: PROJECT_ID,
        capability: "qa:make",
      });
      assert.equal(maker.role, "qa:maker");

      const makerApprovalError = yield* iam
        .authorizeProject({
          subject: "test:maker",
          projectId: PROJECT_ID,
          capability: "qa:approve",
        })
        .pipe(Effect.flip);
      assert.equal(makerApprovalError.code, "capability_denied");

      const approverMakeError = yield* iam
        .authorizeProject({
          subject: "test:approver",
          projectId: PROJECT_ID,
          capability: "qa:make",
        })
        .pipe(Effect.flip);
      assert.equal(approverMakeError.code, "capability_denied");
    }),
  );

  it.effect("registers a named QA project for the existing project team", () =>
    Effect.gen(function* () {
      const iam = yield* QaIam;
      const sql = yield* SqlClient.SqlClient;

      const access = yield* iam.registerProject({
        subject: "test:maker",
        projectId: "customer-portal",
        projectName: "Customer portal",
      });

      assert.equal(access.projectName, "Customer portal");
      assert.equal(access.role, "qa:maker");
      const rows = yield* sql<{
        readonly name: string;
        readonly subject: string;
        readonly role: string;
      }>`
        SELECT projects.name, principals.subject, assignments.role
        FROM qa_projects projects
        JOIN qa_project_assignments assignments ON assignments.project_id = projects.id
        JOIN application_principals principals ON principals.id = assignments.principal_id
        WHERE projects.id = 'customer-portal'
        ORDER BY principals.subject
      `;
      assert.deepEqual(rows, [
        { name: "Customer portal", subject: "test:approver", role: "qa:approver" },
        { name: "Customer portal", subject: "test:maker", role: "qa:maker" },
        { name: "Customer portal", subject: "test:root", role: "root" },
      ]);

      const maker = yield* iam.authorizeProject({
        subject: "test:maker",
        projectId: "customer-portal",
        capability: "qa:make",
      });
      assert.equal(maker.role, "qa:maker");

      const approver = yield* iam.authorizeProject({
        subject: "test:approver",
        projectId: "customer-portal",
        capability: "qa:approve",
      });
      assert.equal(approver.role, "qa:approver");

      const makerApprovalError = yield* iam
        .authorizeProject({
          subject: "test:maker",
          projectId: "customer-portal",
          capability: "qa:approve",
        })
        .pipe(Effect.flip);
      assert.equal(makerApprovalError.code, "capability_denied");

      const approverMakeError = yield* iam
        .authorizeProject({
          subject: "test:approver",
          projectId: "customer-portal",
          capability: "qa:make",
        })
        .pipe(Effect.flip);
      assert.equal(approverMakeError.code, "capability_denied");

      yield* sql`
        INSERT INTO qa_releases (
          thread_id, project_id, mode, release_number, title, status, phase,
          ingestion_status, ingestion_progress, created_at, updated_at
        ) VALUES (
          'customer-portal-release', 'customer-portal', 'qa', 1, 'Release 1', 'active',
          'documents', 'idle', 0, ${NOW}, ${NOW}
        )
      `;
      const releaseApprover = yield* iam.authorizeRelease({
        subject: "test:approver",
        releaseThreadId: "customer-portal-release",
        capability: "qa:approve",
      });
      assert.equal(releaseApprover.role, "qa:approver");
    }),
  );

  it.effect("requires live maker capability when registering an existing project", () =>
    Effect.gen(function* () {
      const iam = yield* QaIam;

      const denied = yield* iam
        .registerProject({
          subject: "test:approver",
          projectId: PROJECT_ID,
          projectName: "Ignored existing project name",
        })
        .pipe(Effect.flip);

      assert.equal(denied.code, "capability_denied");
    }),
  );

  it.effect("requires live maker capability before creating a new project", () =>
    Effect.gen(function* () {
      const iam = yield* QaIam;
      const sql = yield* SqlClient.SqlClient;
      const projectId = "approver-forbidden-project";

      const denied = yield* iam
        .registerProject({
          subject: "test:approver",
          projectId,
          projectName: "Approver forbidden project",
        })
        .pipe(Effect.flip);

      assert.equal(denied.code, "capability_denied");
      const rows = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM qa_projects WHERE id = ${projectId}
      `;
      assert.equal(rows[0]?.count, 0);
    }),
  );

  it.effect("keeps one durable release conversation per principal and environment", () =>
    Effect.gen(function* () {
      const iam = yield* QaIam;
      const makerBinding = yield* iam.bindReleaseConversation({
        subject: "test:maker",
        releaseThreadId: RELEASE_THREAD_ID,
        conversationThreadId: "conversation-maker",
        environmentId: ENVIRONMENT_ID,
      });
      const makerOtherEnvironmentBinding = yield* iam.bindReleaseConversation({
        subject: "test:maker",
        releaseThreadId: RELEASE_THREAD_ID,
        conversationThreadId: "conversation-maker-other-environment",
        environmentId: OTHER_ENVIRONMENT_ID,
      });
      const approverBinding = yield* iam.bindReleaseConversation({
        subject: "test:approver",
        releaseThreadId: RELEASE_THREAD_ID,
        conversationThreadId: "conversation-approver",
        environmentId: ENVIRONMENT_ID,
      });
      assert.equal(makerBinding.principalId, "principal-maker");
      assert.equal(makerBinding.environmentId, ENVIRONMENT_ID);
      assert.equal(makerOtherEnvironmentBinding.environmentId, OTHER_ENVIRONMENT_ID);
      assert.equal(approverBinding.principalId, "principal-approver");

      const canonical = yield* iam.resolveConversationContext({
        conversationThreadId: "conversation-maker",
        environmentId: ENVIRONMENT_ID,
      });
      assert.equal(canonical.releaseThreadId, RELEASE_THREAD_ID);
      assert.equal(canonical.principal.subject, "test:maker");

      const otherEnvironmentDenied = yield* iam
        .resolveConversationContext({
          conversationThreadId: "conversation-maker",
          environmentId: OTHER_ENVIRONMENT_ID,
        })
        .pipe(Effect.flip);
      assert.equal(otherEnvironmentDenied.code, "conversation_access_denied");

      const denied = yield* iam
        .authorizeConversation({
          subject: "test:maker",
          conversationThreadId: "conversation-approver",
          environmentId: ENVIRONMENT_ID,
          capability: "qa:chat",
        })
        .pipe(Effect.flip);
      assert.equal(denied.code, "conversation_not_found");

      const conflict = yield* iam
        .bindReleaseConversation({
          subject: "test:maker",
          releaseThreadId: RELEASE_THREAD_ID,
          conversationThreadId: "conversation-maker-replacement",
          environmentId: ENVIRONMENT_ID,
        })
        .pipe(Effect.flip);
      assert.equal(conflict.code, "conversation_conflict");
    }),
  );

  it.effect(
    "preserves migrated legacy bindings without authorizing them in a live environment",
    () =>
      Effect.gen(function* () {
        const iam = yield* QaIam;
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
        DELETE FROM qa_release_conversations
        WHERE release_thread_id = ${RELEASE_THREAD_ID}
          AND principal_id = 'principal-maker'
      `;
        yield* sql`
        INSERT INTO qa_release_conversations (
          release_thread_id, principal_id, environment_id, conversation_thread_id,
          created_at, updated_at
        ) VALUES (
          ${RELEASE_THREAD_ID}, 'principal-maker', ${LEGACY_QA_ENVIRONMENT_ID},
          'conversation-maker-legacy', ${NOW}, ${NOW}
        )
      `;

        const current = yield* iam.bindReleaseConversation({
          subject: "test:maker",
          releaseThreadId: RELEASE_THREAD_ID,
          conversationThreadId: "conversation-maker-current",
          environmentId: ENVIRONMENT_ID,
        });
        assert.equal(current.environmentId, ENVIRONMENT_ID);

        const rows = yield* sql<{
          readonly conversationThreadId: string;
          readonly environmentId: string;
        }>`
        SELECT
          conversation_thread_id AS "conversationThreadId",
          environment_id AS "environmentId"
        FROM qa_release_conversations
        WHERE release_thread_id = ${RELEASE_THREAD_ID}
          AND principal_id = 'principal-maker'
        ORDER BY environment_id
      `;
        assert.deepEqual(rows, [
          {
            conversationThreadId: "conversation-maker-legacy",
            environmentId: LEGACY_QA_ENVIRONMENT_ID,
          },
          {
            conversationThreadId: "conversation-maker-current",
            environmentId: ENVIRONMENT_ID,
          },
        ]);

        const legacyDenied = yield* iam
          .resolveConversationContext({
            conversationThreadId: "conversation-maker-legacy",
            environmentId: ENVIRONMENT_ID,
          })
          .pipe(Effect.flip);
        assert.equal(legacyDenied.code, "conversation_access_denied");
      }),
  );

  it.effect("records actor and scoped release context in an audit event", () =>
    Effect.gen(function* () {
      const iam = yield* QaIam;
      const sql = yield* SqlClient.SqlClient;
      yield* iam.bindReleaseConversation({
        subject: "test:root",
        releaseThreadId: RELEASE_THREAD_ID,
        conversationThreadId: "conversation-root",
        environmentId: ENVIRONMENT_ID,
      });
      const receipt = yield* iam.appendAuditEvent({
        subject: "test:root",
        projectId: PROJECT_ID,
        releaseThreadId: RELEASE_THREAD_ID,
        conversationThreadId: "conversation-root",
        environmentId: ENVIRONMENT_ID,
        action: "release.opened",
        targetType: "release",
        targetId: RELEASE_THREAD_ID,
        metadata: { source: "qa-dashboard" },
      });

      const rows = yield* sql<{
        readonly id: string;
        readonly principalId: string;
        readonly projectId: string;
        readonly releaseThreadId: string;
        readonly conversationThreadId: string;
        readonly metadataJson: string;
      }>`
        SELECT
          id,
          principal_id AS "principalId",
          project_id AS "projectId",
          release_thread_id AS "releaseThreadId",
          conversation_thread_id AS "conversationThreadId",
          metadata_json AS "metadataJson"
        FROM qa_audit_events
        WHERE id = ${receipt.id}
      `;
      assert.equal(rows[0]?.principalId, "principal-root");
      assert.equal(rows[0]?.projectId, PROJECT_ID);
      assert.equal(rows[0]?.releaseThreadId, RELEASE_THREAD_ID);
      assert.equal(rows[0]?.conversationThreadId, "conversation-root");
      assert.deepEqual(decodeUnknownJsonString(rows[0]?.metadataJson ?? "{}"), {
        source: "qa-dashboard",
      });
    }),
  );
});
