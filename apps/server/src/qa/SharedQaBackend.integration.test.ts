import { PgClient } from "@effect/sql-pg";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentId, ProjectId, ThreadId, type QaReviewInput } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as NodeCrypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";

import { QaDashboardQuery, layer as QaDashboardQueryLayer } from "./QaDashboardQuery.ts";
import { QaDatabase } from "./QaDatabase.ts";
import { migrateQaDatabase } from "./QaDatabaseMigrations.ts";
import { QaIam, layer as QaIamLayer } from "./QaIam.ts";
import { LOCAL_PRINCIPALS, LOCAL_REPRO_PROJECT_ID } from "./QaIamMigrations.ts";
import * as QaIngestionGateway from "./QaIngestionGateway.ts";
import { QaWorkflow, layer as QaWorkflowLayer } from "./QaWorkflow.ts";

// Opt in with the same administrative scratch URL used by the migration integration test.
// The role must be allowed to CREATE/DROP DATABASE. The configured database is never migrated.
const TEST_ADMIN_URL = process.env.T3CODE_QA_MIGRATION_TEST_ADMIN_URL?.trim() || undefined;

type TestDatabase = {
  readonly databaseName: string;
  readonly databaseUrl: string;
};

const makePgClient = Effect.fn("SharedQaBackendTest.makePgClient")(function* (
  databaseUrl: string,
  applicationName: string,
) {
  return yield* PgClient.make({
    url: Redacted.make(databaseUrl),
    applicationName,
    minConnections: 1,
    maxConnections: 4,
  }).pipe(Effect.provide(Reactivity.layer));
});

const databaseUrlFor = (adminUrl: string, databaseName: string) => {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  url.searchParams.set("options", "-c search_path=t3_qa");
  return url.toString();
};

const acquireTestDatabase = Effect.fn("SharedQaBackendTest.acquireDatabase")(function* (
  admin: PgClient.PgClient,
  adminUrl: string,
) {
  const databaseName = `t3_qa_shared_${NodeCrypto.randomUUID().replaceAll("-", "")}`;
  yield* admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  return {
    databaseName,
    databaseUrl: databaseUrlFor(adminUrl, databaseName),
  } satisfies TestDatabase;
});

const releaseTestDatabase = Effect.fn("SharedQaBackendTest.releaseDatabase")(function* (
  admin: PgClient.PgClient,
  database: TestDatabase,
) {
  yield* admin.unsafe(`DROP DATABASE "${database.databaseName}" WITH (FORCE)`);
});

const makeTestDatabase = Effect.fn("SharedQaBackendTest.makeDatabase")(function* (
  admin: PgClient.PgClient,
  adminUrl: string,
) {
  return yield* Effect.acquireRelease(acquireTestDatabase(admin, adminUrl), (database) =>
    releaseTestDatabase(admin, database).pipe(Effect.orDie),
  );
});

const serviceLayer = (sql: PgClient.PgClient) =>
  Layer.mergeAll(QaIamLayer, QaDashboardQueryLayer, QaWorkflowLayer).pipe(
    Layer.provideMerge(Layer.succeed(QaDatabase, sql)),
    Layer.provideMerge(QaIngestionGateway.layerTest),
    Layer.provideMerge(NodeServices.layer),
  );

describe.runIf(TEST_ADMIN_URL !== undefined)("shared PostgreSQL QA backend", () => {
  it.live(
    "shares release workflow state while enforcing live project roles and conversation ownership",
    () =>
      Effect.gen(function* () {
        const adminUrl = TEST_ADMIN_URL;
        if (adminUrl === undefined) return;

        const admin = yield* makePgClient(adminUrl, "shared-qa-acceptance-admin");
        const database = yield* makeTestDatabase(admin, adminUrl);
        const sql = yield* makePgClient(database.databaseUrl, "shared-qa-acceptance-backend");
        yield* migrateQaDatabase(sql);

        yield* Effect.gen(function* () {
          const iam = yield* QaIam;
          const workflow = yield* QaWorkflow;
          const dashboard = yield* QaDashboardQuery;
          const projectId = ProjectId.make(LOCAL_REPRO_PROJECT_ID);
          const releaseThreadId = ThreadId.make(`shared-release-${NodeCrypto.randomUUID()}`);
          const rootReleaseThreadId = ThreadId.make(`root-release-${NodeCrypto.randomUUID()}`);
          const environmentId = EnvironmentId.make(`shared-environment-${NodeCrypto.randomUUID()}`);

          const expectedAssignments = [
            {
              subject: LOCAL_PRINCIPALS.approver.subject,
              role: "qa:approver",
              capabilities: ["qa:read", "qa:approve", "qa:chat", "qa:test-application"],
            },
            {
              subject: LOCAL_PRINCIPALS.maker.subject,
              role: "qa:maker",
              capabilities: ["qa:read", "qa:make", "qa:chat", "qa:test-application"],
            },
            {
              subject: LOCAL_PRINCIPALS.root.subject,
              role: "root",
              capabilities: ["qa:read", "qa:make", "qa:approve", "qa:chat", "qa:test-application"],
            },
          ] as const;
          const assignments = yield* Effect.forEach(expectedAssignments, (expected) =>
            Effect.gen(function* () {
              const [assignment] = yield* iam.listAssignedProjects(expected.subject);
              assert.isDefined(assignment);
              return {
                subject: assignment.principal.subject,
                role: assignment.role,
                capabilities: assignment.capabilities,
              };
            }),
          );
          assert.equal(assignments.length, expectedAssignments.length);
          for (const [index, assignment] of assignments.entries()) {
            const expected = expectedAssignments[index];
            assert.isDefined(expected);
            assert.equal(assignment.subject, expected.subject);
            assert.equal(assignment.role, expected.role);
            assert.deepEqual([...assignment.capabilities], [...expected.capabilities]);
          }

          const initializeReleaseAs = Effect.fn("SharedQaBackendTest.initializeReleaseAs")(
            function* (subject: string, threadId: ThreadId, title: string) {
              yield* iam.authorizeProject({ subject, projectId, capability: "qa:make" });
              return yield* workflow.initializeRelease({
                projectId,
                threadId,
                releaseTitle: title,
              });
            },
          );
          const reviewAs = Effect.fn("SharedQaBackendTest.reviewAs")(function* (
            subject: string,
            input: QaReviewInput,
          ) {
            yield* iam.authorizeRelease({
              subject,
              releaseThreadId: input.threadId,
              capability: "qa:approve",
            });
            return yield* workflow.review(input);
          });

          yield* initializeReleaseAs(
            LOCAL_PRINCIPALS.maker.subject,
            releaseThreadId,
            "Shared maker submission",
          );
          yield* workflow.uploadDocument({
            threadId: releaseThreadId,
            fileName: "01-business-requirements.md",
            mediaType: "text/markdown",
            bytes: new TextEncoder().encode(
              "# Shared acceptance requirement\nThe service must share submitted QA state.",
            ),
          });
          const submitted = yield* iam
            .authorizeRelease({
              subject: LOCAL_PRINCIPALS.maker.subject,
              releaseThreadId,
              capability: "qa:make",
            })
            .pipe(Effect.andThen(workflow.startIngestion({ threadId: releaseThreadId })));
          assert.equal(submitted.activeStage, "requirements");
          assert.equal(
            submitted.stages.find((stage) => stage.stage === "requirements")?.status,
            "awaiting_review",
          );

          const [rootDashboard, approverDashboard] = yield* Effect.all([
            dashboard.listAssignedReleases({ subject: LOCAL_PRINCIPALS.root.subject }),
            dashboard.listAssignedReleases({ subject: LOCAL_PRINCIPALS.approver.subject }),
          ]);
          assert.equal(rootDashboard.releases[0]?.threadId, releaseThreadId);
          assert.equal(rootDashboard.releases[0]?.role, "root");
          assert.equal(rootDashboard.releases[0]?.status, "ready_for_review");
          assert.equal(approverDashboard.releases[0]?.threadId, releaseThreadId);
          assert.equal(approverDashboard.releases[0]?.role, "qa:approver");
          assert.equal(approverDashboard.releases[0]?.status, "ready_for_review");

          const reviewableRequirement = submitted.requirements.find(
            (requirement) => requirement.reviewRequired,
          );
          assert.isDefined(reviewableRequirement);
          const makerApprovalError = yield* reviewAs(LOCAL_PRINCIPALS.maker.subject, {
            threadId: releaseThreadId,
            targetType: "requirement",
            targetId: reviewableRequirement.id,
            decision: "approved",
          }).pipe(Effect.flip);
          assert.equal(makerApprovalError.code, "capability_denied");

          const approverMutationError = yield* initializeReleaseAs(
            LOCAL_PRINCIPALS.approver.subject,
            ThreadId.make(`approver-release-${NodeCrypto.randomUUID()}`),
            "Forbidden approver mutation",
          ).pipe(Effect.flip);
          assert.equal(approverMutationError.code, "capability_denied");

          const approverReviewed = yield* reviewAs(LOCAL_PRINCIPALS.approver.subject, {
            threadId: releaseThreadId,
            targetType: "requirement",
            targetId: reviewableRequirement.id,
            decision: "approved",
          });
          assert.equal(
            approverReviewed.requirements.find(
              (requirement) => requirement.id === reviewableRequirement.id,
            )?.status,
            "approved",
          );

          const rootCreated = yield* initializeReleaseAs(
            LOCAL_PRINCIPALS.root.subject,
            rootReleaseThreadId,
            "Root administrator release",
          );
          assert.equal(rootCreated.threadId, rootReleaseThreadId);
          const rootApproved = yield* reviewAs(LOCAL_PRINCIPALS.root.subject, {
            threadId: releaseThreadId,
            targetType: "requirement",
            targetId: reviewableRequirement.id,
            decision: "approved",
          });
          assert.equal(
            rootApproved.requirements.find(
              (requirement) => requirement.id === reviewableRequirement.id,
            )?.status,
            "approved",
          );

          const makerConversationThreadId = ThreadId.make(
            `maker-conversation-${NodeCrypto.randomUUID()}`,
          );
          const approverConversationThreadId = ThreadId.make(
            `approver-conversation-${NodeCrypto.randomUUID()}`,
          );
          yield* iam.bindReleaseConversation({
            subject: LOCAL_PRINCIPALS.maker.subject,
            releaseThreadId,
            conversationThreadId: makerConversationThreadId,
            environmentId,
          });
          yield* iam.bindReleaseConversation({
            subject: LOCAL_PRINCIPALS.approver.subject,
            releaseThreadId,
            conversationThreadId: approverConversationThreadId,
            environmentId,
          });

          const makerCrossPrincipalError = yield* iam
            .authorizeConversation({
              subject: LOCAL_PRINCIPALS.maker.subject,
              conversationThreadId: approverConversationThreadId,
              environmentId,
              capability: "qa:chat",
            })
            .pipe(Effect.flip);
          assert.equal(makerCrossPrincipalError.code, "conversation_not_found");
          const rootCrossPrincipalError = yield* iam
            .authorizeConversation({
              subject: LOCAL_PRINCIPALS.root.subject,
              conversationThreadId: makerConversationThreadId,
              environmentId,
              capability: "qa:chat",
            })
            .pipe(Effect.flip);
          assert.equal(rootCrossPrincipalError.code, "conversation_not_found");
        }).pipe(Effect.provide(serviceLayer(sql)));
      }).pipe(Effect.scoped),
    60_000,
  );
});
