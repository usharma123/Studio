import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as QaDatabase from "./QaDatabase.ts";
import * as QaIngestionGateway from "./QaIngestionGateway.ts";
import { QaWorkflow, layer as QaWorkflowLayer } from "./QaWorkflow.ts";

const QaPersistenceTest = QaDatabase.layerFromSqlClient.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);

const layer = it.layer(
  QaWorkflowLayer.pipe(
    Layer.provideMerge(QaPersistenceTest),
    Layer.provideMerge(QaIngestionGateway.layerTest),
    Layer.provideMerge(NodeServices.layer),
  ),
);

const generationClaimOwner = {
  environmentId: EnvironmentId.make("environment-qa-workflow"),
  conversationThreadId: ThreadId.make("conversation-qa-workflow"),
};

const generationOwner = {
  ...generationClaimOwner,
  providerSessionId: "provider-session-qa-workflow",
};

layer("QaWorkflow", (it) => {
  it.effect("persists a release, Postgres document, requirements, and approval gate", () =>
    Effect.gen(function* () {
      const qa = yield* QaWorkflow;
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("project-qa-workflow");
      const threadId = ThreadId.make("thread-qa-release-1");
      const claimStage = (
        stage: "requirements" | "strategy" | "scenarios" | "test_cases" | "scripts",
      ) => sql`
        UPDATE qa_stage_states
        SET status = 'queued', active_job_id = ${`qa-generation:${stage}`},
            active_environment_id = ${generationClaimOwner.environmentId},
            active_conversation_thread_id = ${generationClaimOwner.conversationThreadId},
            active_provider_session_id = NULL
        WHERE thread_id = ${threadId} AND stage = ${stage}
      `;

      const initialized = yield* qa.initializeRelease({
        projectId,
        threadId,
        releaseTitle: "2.4.0 regression",
      });
      assert.equal(initialized.title, "2.4.0 regression");
      assert.equal(initialized.approvalGates.length, 1);
      assert.equal(initialized.activeStage, "intake");
      assert.equal(initialized.revision, 1);
      assert.equal(initialized.stages.length, 7);
      const initializedRouting = yield* sql<{
        readonly activeStage: string;
        readonly revision: number;
      }>`
        SELECT active_stage AS "activeStage", revision
        FROM qa_releases
        WHERE thread_id = ${threadId}
      `;
      assert.equal(initializedRouting[0]?.activeStage, "intake");
      assert.equal(initializedRouting[0]?.revision, 1);
      const initializedStages = yield* sql<{
        readonly stage: string;
        readonly status: string;
        readonly progress: number;
      }>`
        SELECT stage, status, progress
        FROM qa_stage_states
        WHERE thread_id = ${threadId}
        ORDER BY ordinal
      `;
      assert.deepEqual(
        initializedStages.map(({ stage, status, progress }) => ({ stage, status, progress })),
        [
          { stage: "intake", status: "ready", progress: 0 },
          { stage: "requirements", status: "locked", progress: 0 },
          { stage: "strategy", status: "locked", progress: 0 },
          { stage: "scenarios", status: "locked", progress: 0 },
          { stage: "test_cases", status: "locked", progress: 0 },
          { stage: "scripts", status: "locked", progress: 0 },
          { stage: "readiness", status: "locked", progress: 0 },
        ],
      );

      const uploaded = yield* qa.uploadDocument({
        threadId,
        fileName: "01-business-requirements-v1.md",
        mediaType: "application/octet-stream",
        bytes: new TextEncoder().encode("# Audit evidence\nThe system must retain audit evidence."),
      });
      const document = uploaded.documents[0];
      assert.equal(uploaded.activeStage, "intake");
      assert.equal(uploaded.revision, 2);
      assert.isDefined(document);
      assert.equal(document.kind, "BRD");
      assert.equal(document.version, "1");
      assert.equal(document.mediaType, "text/markdown");
      assert.match(document.storagePath, new RegExp(`^qa-db/releases/${threadId}/documents/`, "u"));
      const storedDocuments = yield* sql<{
        readonly contentBlob: Uint8Array;
        readonly storagePath: string;
      }>`
        SELECT content_blob AS "contentBlob", storage_path AS "storagePath"
        FROM qa_documents
        WHERE id = ${document.id}
      `;
      assert.deepEqual(
        Array.from(storedDocuments[0]?.contentBlob ?? []),
        Array.from(
          new TextEncoder().encode("# Audit evidence\nThe system must retain audit evidence."),
        ),
      );
      assert.equal(storedDocuments[0]?.storagePath, document.storagePath);
      const uploadedRevision = yield* sql<{ readonly revision: number }>`
        SELECT revision FROM qa_releases WHERE thread_id = ${threadId}
      `;
      assert.equal(uploadedRevision[0]?.revision, 2);

      const withDesign = yield* qa.uploadDocument({
        threadId,
        fileName: "03-high-level-design.md",
        mediaType: "text/markdown",
        bytes: new TextEncoder().encode("# Architecture\nThe audit service writes evidence."),
      });
      assert.equal(withDesign.revision, 3);
      assert.equal(
        withDesign.documents.find((candidate) => candidate.fileName === "03-high-level-design.md")
          ?.kind,
        "HLD",
      );

      const ingested = yield* qa.startIngestion({ threadId });
      assert.equal(ingested.ingestionProgress, 100);
      assert.equal(ingested.phase, "requirements_review");
      assert.equal(ingested.activeStage, "requirements");
      assert.equal(ingested.revision, 4);
      assert.equal(ingested.requirements.length, 1);
      assert.equal(ingested.requirements[0]?.title, "Audit evidence");
      const ingestedRouting = yield* sql<{
        readonly activeStage: string;
        readonly revision: number;
      }>`
        SELECT active_stage AS "activeStage", revision
        FROM qa_releases
        WHERE thread_id = ${threadId}
      `;
      assert.equal(ingestedRouting[0]?.activeStage, "requirements");
      assert.equal(ingestedRouting[0]?.revision, 4);
      const reviewStages = yield* sql<{
        readonly stage: string;
        readonly status: string;
        readonly progress: number;
      }>`
        SELECT stage, status, progress
        FROM qa_stage_states
        WHERE thread_id = ${threadId} AND stage IN ('intake', 'requirements', 'strategy')
        ORDER BY ordinal
      `;
      assert.deepEqual(
        reviewStages.map(({ stage, status, progress }) => ({ stage, status, progress })),
        [
          { stage: "intake", status: "complete", progress: 100 },
          { stage: "requirements", status: "awaiting_review", progress: 0 },
          { stage: "strategy", status: "locked", progress: 0 },
        ],
      );

      yield* claimStage("requirements");
      const progress = yield* qa.reportAgentStageProgress(threadId, generationOwner, {
        stage: "requirements",
        progress: 60,
        message: "Extracting BRD and FRS relationships",
      });
      assert.equal(progress.revision, 5);
      assert.equal(
        progress.stages.find((stage) => stage.stage === "requirements")?.status,
        "running",
      );

      const proposed = yield* qa.submitAgentRequirements(threadId, generationOwner, {
        requirements: [
          {
            externalId: "BR-001",
            requirementType: "business",
            parentExternalIds: [],
            title: "Retain audit evidence",
            description: "The system must retain traceable audit evidence.",
            sourceDocumentId: document.id,
            citation: {
              documentId: document.id,
              section: "BRD 6",
              excerpt: "Controlled actions must leave reviewable audit evidence.",
            },
          },
          {
            externalId: "FR-001",
            requirementType: "functional",
            parentExternalIds: ["BR-001"],
            title: "Record controlled actions",
            description: "The system records actor, action, and timestamp.",
            sourceDocumentId: document.id,
            citation: {
              documentId: document.id,
              section: "FRS 7",
              excerpt: "Audit rows include event, actor, role, and details.",
            },
          },
        ],
      });
      assert.equal(proposed.revision, 6);
      const proposedBusiness = proposed.requirements.find(
        (requirement) => requirement.externalId === "BR-001",
      );
      const proposedFunctional = proposed.requirements.find(
        (requirement) => requirement.externalId === "FR-001",
      );
      assert.isDefined(proposedBusiness);
      assert.isDefined(proposedFunctional);
      assert.equal(proposedBusiness.title, "Retain audit evidence");
      assert.equal(proposedBusiness.status, "pending");
      assert.isTrue(proposedBusiness.reviewRequired);
      assert.isFalse(proposedFunctional.reviewRequired);
      assert.deepEqual(proposedFunctional.parentRequirementIds, [proposedBusiness.externalId]);
      assert.equal(proposed.traceabilityNodes.length, 4);
      assert.equal(proposed.traceabilityEdges.length, 3);

      const updated = yield* qa.updateRequirement({
        threadId,
        requirementId: proposedFunctional.id,
        expectedRevision: proposed.revision,
        patch: { title: "Persist controlled-action evidence" },
      });
      assert.equal(updated.revision, 7);
      assert.equal(
        updated.requirements.find((requirement) => requirement.id === proposedFunctional.id)?.title,
        "Persist controlled-action evidence",
      );

      const requirement = updated.requirements.find(
        (candidate) => candidate.externalId === "BR-001",
      );
      const gate = updated.approvalGates[0];
      assert.isDefined(requirement);
      assert.isDefined(gate);
      const reviewedRequirement = yield* qa.review({
        threadId,
        targetType: "requirement",
        targetId: requirement.id,
        decision: "approved",
      });
      assert.equal(reviewedRequirement.revision, 8);
      assert.equal(
        reviewedRequirement.stages.find((stage) => stage.stage === "requirements")?.progress,
        50,
      );
      const ready = yield* qa.review({
        threadId,
        targetType: "gate",
        targetId: gate.id,
        decision: "approved",
      });
      assert.equal(ready.phase, "ready");
      assert.equal(ready.ingestionStatus, "completed");
      assert.equal(ready.activeStage, "strategy");
      assert.equal(ready.revision, 9);
      const readyRouting = yield* sql<{
        readonly activeStage: string;
        readonly revision: number;
      }>`
        SELECT active_stage AS "activeStage", revision
        FROM qa_releases
        WHERE thread_id = ${threadId}
      `;
      assert.equal(readyRouting[0]?.activeStage, "strategy");
      assert.equal(readyRouting[0]?.revision, 9);
      const readyStages = yield* sql<{
        readonly stage: string;
        readonly status: string;
        readonly progress: number;
      }>`
        SELECT stage, status, progress
        FROM qa_stage_states
        WHERE thread_id = ${threadId} AND stage IN ('requirements', 'strategy', 'scenarios')
        ORDER BY ordinal
      `;
      assert.deepEqual(
        readyStages.map(({ stage, status, progress }) => ({ stage, status, progress })),
        [
          { stage: "requirements", status: "complete", progress: 100 },
          { stage: "strategy", status: "ready", progress: 0 },
          { stage: "scenarios", status: "locked", progress: 0 },
        ],
      );

      const generation = yield* qa.generateStrategy({
        threadId,
        expectedRevision: ready.revision,
      });
      assert.equal(generation.snapshot.revision, 10);
      assert.equal(generation.strategy.generationStatus, "queued");
      assert.equal(generation.strategy.reviewStatus, "draft");
      assert.equal(generation.strategy.sections.length, 0);

      yield* claimStage("strategy");
      const generating = yield* qa.reportAgentStageProgress(threadId, generationOwner, {
        stage: "strategy",
        progress: 40,
        message: "Drafting source-bounded strategy sections",
      });
      assert.equal(generating.revision, 11);
      assert.equal(generating.strategy?.generationStatus, "generating");

      const proposedStrategy = yield* qa.submitAgentStrategy(threadId, generationOwner, {
        sections: [
          {
            title: "Scope and objectives",
            content: "Validate audit evidence retention and controlled-action traceability.",
            sourceRequirementIds: [requirement.id],
          },
        ],
      });
      assert.equal(proposedStrategy.revision, 12);
      assert.equal(proposedStrategy.strategy?.generationStatus, "complete");
      assert.equal(proposedStrategy.strategy?.coverage.percent, 100);
      const strategy = proposedStrategy.strategy;
      const section = strategy?.sections[0];
      assert.isDefined(strategy);
      assert.isDefined(section);
      if (strategy === null || section === undefined) {
        return yield* Effect.die(new Error("Expected generated strategy and section"));
      }

      const editedStrategy = yield* qa.updateStrategySection({
        threadId,
        strategyId: strategy.id,
        sectionId: section.id,
        expectedRevision: proposedStrategy.revision,
        patch: { content: `${section.content}\n\nHuman-reviewed scope.` },
      });
      assert.equal(editedStrategy.snapshot.revision, 13);
      assert.match(editedStrategy.strategy.sections[0]?.content ?? "", /Human-reviewed/u);

      const commented = yield* qa.addStrategyComment({
        threadId,
        strategyId: strategy.id,
        sectionId: section.id,
        expectedRevision: editedStrategy.snapshot.revision,
        body: "Clarify the evidence retention boundary.",
      });
      assert.equal(commented.snapshot.revision, 14);
      assert.equal(commented.strategy.comments[0]?.quote, null);
      const comment = commented.strategy.comments[0];
      assert.isDefined(comment);

      const replied = yield* qa.replyStrategyComment({
        threadId,
        strategyId: strategy.id,
        commentId: comment.id,
        expectedRevision: commented.snapshot.revision,
        body: "The boundary is the active release evidence set.",
      });
      assert.equal(replied.snapshot.revision, 15);
      assert.equal(replied.strategy.comments[0]?.replies.length, 1);

      const submittedStrategy = yield* qa.submitStrategy({
        threadId,
        strategyId: strategy.id,
        expectedRevision: replied.snapshot.revision,
      });
      assert.equal(submittedStrategy.snapshot.revision, 16);
      assert.equal(submittedStrategy.strategy.reviewStatus, "pending_review");
      const blockedApproval = yield* qa
        .reviewStrategy({
          threadId,
          strategyId: strategy.id,
          expectedRevision: submittedStrategy.snapshot.revision,
          decision: "approved",
        })
        .pipe(Effect.flip);
      assert.match(blockedApproval.message, /Resolve every open strategy comment/u);

      const resolved = yield* qa.resolveStrategyComment({
        threadId,
        strategyId: strategy.id,
        commentId: comment.id,
        expectedRevision: submittedStrategy.snapshot.revision,
      });
      assert.equal(resolved.snapshot.revision, 17);
      assert.equal(resolved.strategy.comments[0]?.status, "resolved");

      const approvedStrategy = yield* qa.reviewStrategy({
        threadId,
        strategyId: strategy.id,
        expectedRevision: resolved.snapshot.revision,
        decision: "approved",
      });
      assert.equal(approvedStrategy.snapshot.revision, 18);
      assert.equal(approvedStrategy.strategy.reviewStatus, "approved");
      assert.equal(approvedStrategy.snapshot.activeStage, "scenarios");
      assert.equal(
        approvedStrategy.snapshot.stages.find((stage) => stage.stage === "scenarios")?.status,
        "ready",
      );

      yield* claimStage("scenarios");
      const proposedScenarios = yield* qa.submitAgentScenarios(threadId, generationOwner, {
        scenarios: [
          {
            externalId: "SC-001",
            title: "Retain controlled-action audit evidence",
            type: "positive",
            priority: "high",
            risk: "high",
            requirementIds: [requirement.id],
            preconditions: ["An authorized user performs a controlled action."],
            expectedOutcome: "The action is retained as traceable audit evidence.",
          },
        ],
      });
      assert.equal(proposedScenarios.revision, 19);
      assert.equal(proposedScenarios.scenarioPlan?.generationStatus, "complete");
      const scenarioPlan = proposedScenarios.scenarioPlan;
      const scenario = scenarioPlan?.scenarios[0];
      assert.isDefined(scenarioPlan);
      assert.isDefined(scenario);
      if (scenarioPlan === null || scenario === undefined) {
        return yield* Effect.die(new Error("Expected generated scenario plan"));
      }

      const editedScenario = yield* qa.updateScenario({
        threadId,
        planId: scenarioPlan.id,
        scenarioId: scenario.id,
        expectedRevision: proposedScenarios.revision,
        patch: { title: "Retain reviewable controlled-action audit evidence" },
      });
      assert.equal(editedScenario.snapshot.revision, 20);
      const submittedScenarios = yield* qa.submitScenarioPlan({
        threadId,
        planId: scenarioPlan.id,
        expectedRevision: editedScenario.snapshot.revision,
      });
      assert.equal(submittedScenarios.snapshot.revision, 21);
      assert.equal(submittedScenarios.scenarioPlan.reviewStatus, "pending_review");

      const frozenScenarioEdit = yield* qa
        .updateScenario({
          threadId,
          planId: scenarioPlan.id,
          scenarioId: scenario.id,
          expectedRevision: submittedScenarios.snapshot.revision,
          patch: { priority: "critical" },
        })
        .pipe(Effect.flip);
      assert.match(frozenScenarioEdit.message, /frozen|editable/u);

      const approvedScenarios = yield* qa.reviewScenarioPlan({
        threadId,
        planId: scenarioPlan.id,
        expectedRevision: submittedScenarios.snapshot.revision,
        decision: "approved",
      });
      assert.equal(approvedScenarios.snapshot.revision, 22);
      assert.equal(approvedScenarios.snapshot.activeStage, "test_cases");

      yield* claimStage("test_cases");
      const proposedTestCases = yield* qa.submitAgentTestCases(threadId, generationOwner, {
        testCases: [
          {
            externalId: "TC-001",
            scenarioIds: [scenario.id],
            requirementIds: [requirement.id],
            title: "Verify retained controlled-action evidence",
            preconditions: ["Audit evidence storage is available."],
            steps: [
              {
                order: 1,
                action: "Perform an authorized controlled action.",
                testData: "actor=qa-reviewer",
                expectedResult: "A traceable audit record is retained.",
              },
            ],
            priority: "high",
            automationCandidate: false,
          },
        ],
      });
      assert.equal(proposedTestCases.revision, 23);
      const testCasePlan = proposedTestCases.testCasePlan;
      const testCase = testCasePlan?.testCases[0];
      assert.isDefined(testCasePlan);
      assert.isDefined(testCase);
      if (testCasePlan === null || testCase === undefined) {
        return yield* Effect.die(new Error("Expected generated test case plan"));
      }

      const editedTestCase = yield* qa.updateTestCase({
        threadId,
        planId: testCasePlan.id,
        testCaseId: testCase.id,
        expectedRevision: proposedTestCases.revision,
        patch: { automationCandidate: true },
      });
      assert.equal(editedTestCase.snapshot.revision, 24);
      const submittedTestCases = yield* qa.submitTestCasePlan({
        threadId,
        planId: testCasePlan.id,
        expectedRevision: editedTestCase.snapshot.revision,
      });
      assert.equal(submittedTestCases.snapshot.revision, 25);
      assert.equal(submittedTestCases.testCasePlan.reviewStatus, "pending_review");
      const approvedTestCases = yield* qa.reviewTestCasePlan({
        threadId,
        planId: testCasePlan.id,
        expectedRevision: submittedTestCases.snapshot.revision,
        decision: "approved",
      });
      assert.equal(approvedTestCases.snapshot.revision, 26);
      assert.equal(approvedTestCases.snapshot.activeStage, "scripts");
      assert.equal(approvedTestCases.testCasePlan.testCases[0]?.status, "approved");

      yield* claimStage("scripts");
      const proposedScripts = yield* qa.submitAgentScripts(threadId, generationOwner, {
        scripts: [
          {
            externalId: "AUT-001",
            testCaseIds: [testCase.id],
            requirementIds: [requirement.id],
            title: "Automate controlled-action evidence retention",
            framework: "Playwright",
            language: "TypeScript",
            fileName: "audit-evidence.spec.ts",
            content: "test('retains evidence', async () => { /* generated draft */ });",
          },
        ],
      });
      assert.equal(proposedScripts.revision, 27);
      const scriptPlan = proposedScripts.scriptPlan;
      const script = scriptPlan?.scripts[0];
      assert.isDefined(scriptPlan);
      assert.isDefined(script);
      if (scriptPlan === null || script === undefined) {
        return yield* Effect.die(new Error("Expected generated script plan"));
      }
      assert.equal(script.executionStatus, "not_run");
      assert.deepEqual(script.evidence, []);

      const editedScript = yield* qa.updateScript({
        threadId,
        planId: scriptPlan.id,
        scriptId: script.id,
        expectedRevision: proposedScripts.revision,
        patch: { content: "test('retains evidence', async () => { /* reviewed draft */ });" },
      });
      assert.equal(editedScript.snapshot.revision, 28);
      const submittedScripts = yield* qa.submitScriptPlan({
        threadId,
        planId: scriptPlan.id,
        expectedRevision: editedScript.snapshot.revision,
      });
      assert.equal(submittedScripts.snapshot.revision, 29);
      const approvedScripts = yield* qa.reviewScriptPlan({
        threadId,
        planId: scriptPlan.id,
        expectedRevision: submittedScripts.snapshot.revision,
        decision: "approved",
      });
      assert.equal(approvedScripts.snapshot.revision, 30);
      assert.equal(approvedScripts.snapshot.activeStage, "readiness");
      assert.equal(approvedScripts.snapshot.readinessDashboard?.overallStatus, "not_ready");

      const blockedReadiness = yield* qa
        .reviewReadiness({
          threadId,
          expectedRevision: approvedScripts.snapshot.revision,
          decision: "approved",
        })
        .pipe(Effect.flip);
      assert.match(blockedReadiness.message, /gates or evidence are incomplete/u);

      const executedAt = "2026-07-12T12:00:00.000Z";
      yield* sql`UPDATE qa_scripts SET status='executed',execution_status='passed',last_run_at=${executedAt},updated_at=${executedAt} WHERE id=${script.id}`;
      yield* sql`INSERT INTO qa_script_evidence(id,script_id,kind,summary,artifact_path,created_at)
        VALUES('evidence:AUT-001',${script.id},'report','Playwright run passed with retained audit evidence.','.qa/evidence/audit-evidence-report.html',${executedAt})`;
      yield* sql`UPDATE qa_releases SET revision=31,updated_at=${executedAt} WHERE thread_id=${threadId}`;

      const readyDashboard = yield* qa.getReadiness({ threadId });
      assert.equal(readyDashboard?.overallStatus, "ready");
      assert.equal(readyDashboard?.executionPassed, 1);
      assert.equal(readyDashboard?.scriptCoverage.percent, 100);
      const closed = yield* qa.reviewReadiness({
        threadId,
        expectedRevision: 31,
        decision: "approved",
      });
      assert.equal(closed.snapshot.revision, 32);
      assert.equal(closed.snapshot.status, "closed");
      assert.equal(closed.readinessDashboard.reviewStatus, "approved");
      assert.equal(
        closed.snapshot.stages.find((item) => item.stage === "readiness")?.status,
        "complete",
      );

      const release2 = yield* qa.initializeRelease({
        projectId,
        threadId: ThreadId.make("thread-qa-release-2"),
      });
      assert.equal(release2.releaseNumber, 2);
      assert.equal(release2.title, "Release 2");
    }),
  );

  it.effect("claims a generative stage once and releases a failed dispatch for retry", () =>
    Effect.gen(function* () {
      const qa = yield* QaWorkflow;
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("project-qa-generation-claim");
      const threadId = ThreadId.make("release-qa-generation-claim");
      yield* qa.initializeRelease({ projectId, threadId });
      yield* sql`
        UPDATE qa_releases
        SET active_stage = 'strategy', revision = 2
        WHERE thread_id = ${threadId}
      `;
      yield* sql`
        UPDATE qa_stage_states
        SET status = 'ready', progress = 0, active_job_id = NULL
        WHERE thread_id = ${threadId} AND stage = 'strategy'
      `;

      const claimed = yield* qa.claimAgentStageGeneration(
        threadId,
        2,
        "qa-generation:test",
        generationClaimOwner,
      );
      assert.equal(claimed.revision, 3);
      assert.equal(claimed.stages.find((stage) => stage.stage === "strategy")?.status, "queued");
      assert.equal(
        claimed.stages.find((stage) => stage.stage === "strategy")?.activeJobId,
        "qa-generation:test",
      );
      const persistedOwner = yield* sql<{
        readonly activeEnvironmentId: string | null;
        readonly activeConversationThreadId: string | null;
        readonly activeProviderSessionId: string | null;
      }>`
        SELECT active_environment_id AS "activeEnvironmentId",
          active_conversation_thread_id AS "activeConversationThreadId",
          active_provider_session_id AS "activeProviderSessionId"
        FROM qa_stage_states
        WHERE thread_id = ${threadId} AND stage = 'strategy'
      `;
      assert.equal(persistedOwner[0]?.activeEnvironmentId, generationClaimOwner.environmentId);
      assert.equal(
        persistedOwner[0]?.activeConversationThreadId,
        generationClaimOwner.conversationThreadId,
      );
      assert.isNull(persistedOwner[0]?.activeProviderSessionId ?? null);

      const duplicate = yield* qa
        .claimAgentStageGeneration(threadId, 2, "qa-generation:duplicate", generationClaimOwner)
        .pipe(Effect.flip);
      assert.equal(duplicate.code, "invalid_workflow_state");
      assert.match(duplicate.message, /revision changed/u);

      const ignoredUnboundRelease = yield* qa.releaseAgentStageGenerationForOwner(
        threadId,
        generationOwner,
      );
      assert.isFalse(ignoredUnboundRelease.released);
      assert.equal(ignoredUnboundRelease.snapshot.revision, 3);

      const running = yield* qa.reportAgentStageProgress(threadId, generationOwner, {
        stage: "strategy",
        progress: 10,
      });
      assert.equal(running.revision, 4);

      const ignoredRelease = yield* qa.releaseAgentStageGenerationForOwner(threadId, {
        ...generationOwner,
        conversationThreadId: ThreadId.make("conversation-not-the-owner"),
      });
      assert.isFalse(ignoredRelease.released);
      assert.equal(ignoredRelease.snapshot.revision, 4);
      assert.equal(
        ignoredRelease.snapshot.stages.find((stage) => stage.stage === "strategy")?.status,
        "running",
      );

      const releasedByOwner = yield* qa.releaseAgentStageGenerationForOwner(
        threadId,
        generationOwner,
      );
      assert.isTrue(releasedByOwner.released);
      assert.equal(releasedByOwner.snapshot.revision, 5);
      assert.equal(
        releasedByOwner.snapshot.stages.find((stage) => stage.stage === "strategy")?.status,
        "ready",
      );

      yield* qa.claimAgentStageGeneration(threadId, 5, "qa-generation:retry", generationClaimOwner);
      const released = yield* qa.releaseAgentStageGeneration(threadId, "qa-generation:retry");
      assert.equal(released.revision, 7);
      assert.equal(released.stages.find((stage) => stage.stage === "strategy")?.status, "ready");
      assert.isNull(
        released.stages.find((stage) => stage.stage === "strategy")?.activeJobId ?? null,
      );
    }),
  );

  it.effect("does not release a newer generation claim for an older terminal event", () =>
    Effect.gen(function* () {
      const qa = yield* QaWorkflow;
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("project-qa-generation-terminal-race");
      const threadId = ThreadId.make("release-qa-generation-terminal-race");
      yield* qa.initializeRelease({ projectId, threadId });
      yield* sql`
        UPDATE qa_releases
        SET active_stage = 'strategy', revision = 2
        WHERE thread_id = ${threadId}
      `;
      yield* sql`
        UPDATE qa_stage_states
        SET status = 'ready', progress = 0, active_job_id = NULL
        WHERE thread_id = ${threadId} AND stage = 'strategy'
      `;

      const oldOwner = {
        ...generationClaimOwner,
        providerSessionId: "provider-session-generation-old",
      };
      const newOwner = {
        ...generationClaimOwner,
        providerSessionId: "provider-session-generation-new",
      };

      yield* qa.claimAgentStageGeneration(threadId, 2, "qa-generation:old", generationClaimOwner);
      yield* qa.reportAgentStageProgress(threadId, oldOwner, {
        stage: "strategy",
        progress: 10,
      });
      yield* qa.releaseAgentStageGeneration(threadId, "qa-generation:old");
      yield* qa.claimAgentStageGeneration(threadId, 5, "qa-generation:new", generationClaimOwner);
      yield* qa.reportAgentStageProgress(threadId, newOwner, {
        stage: "strategy",
        progress: 20,
      });

      const ignored = yield* qa.releaseAgentStageGenerationForOwner(threadId, oldOwner);
      assert.isFalse(ignored.released);
      assert.equal(ignored.snapshot.revision, 7);
      assert.equal(
        ignored.snapshot.stages.find((stage) => stage.stage === "strategy")?.activeJobId,
        "qa-generation:new",
      );
      assert.equal(
        ignored.snapshot.stages.find((stage) => stage.stage === "strategy")?.status,
        "running",
      );

      const released = yield* qa.releaseAgentStageGenerationForOwner(threadId, newOwner);
      assert.isTrue(released.released);
      assert.equal(released.snapshot.revision, 8);
      assert.equal(
        released.snapshot.stages.find((stage) => stage.stage === "strategy")?.status,
        "ready",
      );
      assert.isNull(
        released.snapshot.stages.find((stage) => stage.stage === "strategy")?.activeJobId ?? null,
      );
    }),
  );

  it.effect("recovers only stale generation claims owned by this server environment", () =>
    Effect.gen(function* () {
      const qa = yield* QaWorkflow;
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("project-qa-generation-lease");
      const environmentId = EnvironmentId.make("environment-generation-lease");
      const otherEnvironmentId = EnvironmentId.make("environment-generation-lease-other");
      const staleThreadId = ThreadId.make("release-generation-lease-stale");
      const recentThreadId = ThreadId.make("release-generation-lease-recent");
      const otherEnvironmentThreadId = ThreadId.make("release-generation-lease-other-env");

      for (const threadId of [staleThreadId, recentThreadId, otherEnvironmentThreadId]) {
        yield* qa.initializeRelease({ projectId, threadId });
        yield* sql`
          UPDATE qa_releases
          SET active_stage = 'strategy', revision = 2
          WHERE thread_id = ${threadId}
        `;
        yield* sql`
          UPDATE qa_stage_states
          SET status = 'ready', progress = 0, active_job_id = NULL
          WHERE thread_id = ${threadId} AND stage = 'strategy'
        `;
      }

      const ownerFor = (threadId: ThreadId, ownerEnvironmentId: EnvironmentId) => ({
        environmentId: ownerEnvironmentId,
        conversationThreadId: ThreadId.make(`conversation-${threadId}`),
      });
      yield* qa.claimAgentStageGeneration(
        staleThreadId,
        2,
        "qa-generation:stale",
        ownerFor(staleThreadId, environmentId),
      );
      yield* qa.claimAgentStageGeneration(
        recentThreadId,
        2,
        "qa-generation:recent",
        ownerFor(recentThreadId, environmentId),
      );
      yield* qa.claimAgentStageGeneration(
        otherEnvironmentThreadId,
        2,
        "qa-generation:other-environment",
        ownerFor(otherEnvironmentThreadId, otherEnvironmentId),
      );
      yield* sql`
        UPDATE qa_stage_states
        SET updated_at = '2026-01-01T00:00:00.000Z'
        WHERE thread_id IN (${staleThreadId}, ${otherEnvironmentThreadId})
          AND stage = 'strategy'
      `;
      yield* sql`
        UPDATE qa_stage_states
        SET updated_at = '2026-03-01T00:00:00.000Z'
        WHERE thread_id = ${recentThreadId} AND stage = 'strategy'
      `;

      const recovered = yield* qa.recoverStaleAgentStageGenerations({
        environmentId,
        updatedBefore: "2026-02-01T00:00:00.000Z",
      });
      assert.deepEqual(
        recovered.map((snapshot) => snapshot.threadId),
        [staleThreadId],
      );
      assert.equal(recovered[0]?.revision, 4);
      assert.equal(
        recovered[0]?.stages.find((stage) => stage.stage === "strategy")?.status,
        "ready",
      );

      const rows = yield* sql<{
        readonly threadId: string;
        readonly status: string;
        readonly activeJobId: string | null;
        readonly activeEnvironmentId: string | null;
        readonly activeConversationThreadId: string | null;
      }>`
        SELECT thread_id AS "threadId", status, active_job_id AS "activeJobId",
          active_environment_id AS "activeEnvironmentId",
          active_conversation_thread_id AS "activeConversationThreadId"
        FROM qa_stage_states
        WHERE thread_id IN (${staleThreadId}, ${recentThreadId}, ${otherEnvironmentThreadId})
          AND stage = 'strategy'
        ORDER BY thread_id
      `;
      const byThreadId = new Map(rows.map((row) => [row.threadId, row]));
      assert.equal(byThreadId.get(staleThreadId)?.status, "ready");
      assert.isNull(byThreadId.get(staleThreadId)?.activeJobId ?? null);
      assert.isNull(byThreadId.get(staleThreadId)?.activeEnvironmentId ?? null);
      assert.isNull(byThreadId.get(staleThreadId)?.activeConversationThreadId ?? null);
      assert.equal(byThreadId.get(recentThreadId)?.status, "queued");
      assert.equal(byThreadId.get(otherEnvironmentThreadId)?.status, "queued");
    }),
  );

  it.effect(
    "rejects different conversations and stale provider sessions without reviving reviewed output",
    () =>
      Effect.gen(function* () {
        const qa = yield* QaWorkflow;
        const sql = yield* SqlClient.SqlClient;
        const projectId = ProjectId.make("project-qa-generation-owner");
        const threadId = ThreadId.make("release-qa-generation-owner");
        const claimOwner = {
          environmentId: EnvironmentId.make("environment-generation-owner"),
          conversationThreadId: ThreadId.make("conversation-generation-owner"),
        };
        const owner = {
          ...claimOwner,
          providerSessionId: "provider-session-current",
        };
        yield* qa.initializeRelease({ projectId, threadId });
        yield* sql`
          UPDATE qa_releases
          SET active_stage = 'strategy', revision = 2
          WHERE thread_id = ${threadId}
        `;
        yield* sql`
          UPDATE qa_stage_states
          SET status = 'ready', progress = 0, active_job_id = NULL,
              active_environment_id = NULL, active_conversation_thread_id = NULL,
              active_provider_session_id = NULL
          WHERE thread_id = ${threadId} AND stage = 'strategy'
        `;
        yield* qa.claimAgentStageGeneration(threadId, 2, "qa-generation:owned", claimOwner);

        const wrongConversation = yield* qa
          .submitAgentStrategy(
            threadId,
            {
              ...owner,
              conversationThreadId: ThreadId.make("conversation-generation-other"),
            },
            {
              sections: [
                {
                  title: "Unowned strategy",
                  content: "This conversation must not be able to persist the strategy.",
                  sourceRequirementIds: [],
                },
              ],
            },
          )
          .pipe(Effect.flip);
        assert.equal(wrongConversation.code, "invalid_workflow_state");

        const wrongEnvironment = yield* qa
          .reportAgentStageProgress(
            threadId,
            {
              ...owner,
              environmentId: EnvironmentId.make("environment-generation-other"),
            },
            { stage: "strategy", progress: 10 },
          )
          .pipe(Effect.flip);
        assert.equal(wrongEnvironment.code, "invalid_workflow_state");

        const running = yield* qa.reportAgentStageProgress(threadId, owner, {
          stage: "strategy",
          progress: 40,
        });
        assert.equal(running.revision, 4);
        assert.equal(running.stages.find((stage) => stage.stage === "strategy")?.status, "running");

        const staleProvider = yield* qa
          .reportAgentStageProgress(
            threadId,
            { ...owner, providerSessionId: "provider-session-replaced" },
            { stage: "strategy", progress: 80 },
          )
          .pipe(Effect.flip);
        assert.equal(staleProvider.code, "invalid_workflow_state");

        const submitted = yield* qa.submitAgentStrategy(threadId, owner, {
          sections: [
            {
              title: "Owned strategy",
              content: "Only the claimed conversation and bound provider session may persist this.",
              sourceRequirementIds: [],
            },
          ],
        });
        assert.equal(submitted.revision, 5);
        assert.equal(
          submitted.stages.find((stage) => stage.stage === "strategy")?.status,
          "awaiting_review",
        );

        const lateProgress = yield* qa
          .reportAgentStageProgress(threadId, owner, {
            stage: "strategy",
            progress: 100,
          })
          .pipe(Effect.flip);
        assert.equal(lateProgress.code, "invalid_workflow_state");
        const afterLateProgress = yield* qa.getSnapshot({ threadId });
        assert.isNotNull(afterLateProgress);
        assert.equal(afterLateProgress.revision, 5);
        assert.equal(
          afterLateProgress.stages.find((stage) => stage.stage === "strategy")?.status,
          "awaiting_review",
        );

        const persistedClaim = yield* sql<{
          readonly activeJobId: string | null;
          readonly activeEnvironmentId: string | null;
          readonly activeConversationThreadId: string | null;
          readonly activeProviderSessionId: string | null;
        }>`
          SELECT active_job_id AS "activeJobId",
            active_environment_id AS "activeEnvironmentId",
            active_conversation_thread_id AS "activeConversationThreadId",
            active_provider_session_id AS "activeProviderSessionId"
          FROM qa_stage_states
          WHERE thread_id = ${threadId} AND stage = 'strategy'
        `;
        assert.isNull(persistedClaim[0]?.activeJobId ?? null);
        assert.isNull(persistedClaim[0]?.activeEnvironmentId ?? null);
        assert.isNull(persistedClaim[0]?.activeConversationThreadId ?? null);
        assert.isNull(persistedClaim[0]?.activeProviderSessionId ?? null);
      }),
  );

  it.effect("blocks the requirements gate when a business requirement has no linked FRS", () =>
    Effect.gen(function* () {
      const qa = yield* QaWorkflow;
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("project-qa-lineage-gate");
      const threadId = ThreadId.make("thread-qa-lineage-gate");
      yield* qa.initializeRelease({ projectId, threadId });
      const uploaded = yield* qa.uploadDocument({
        threadId,
        fileName: "01-business-requirements.docx",
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: new TextEncoder().encode("BRD source"),
      });
      const document = uploaded.documents[0];
      assert.isDefined(document);
      yield* qa.startIngestion({ threadId });
      yield* sql`
        UPDATE qa_stage_states
        SET status = 'queued', active_job_id = 'qa-generation:requirements-lineage',
            active_environment_id = ${generationClaimOwner.environmentId},
            active_conversation_thread_id = ${generationClaimOwner.conversationThreadId},
            active_provider_session_id = NULL
        WHERE thread_id = ${threadId} AND stage = 'requirements'
      `;
      const proposed = yield* qa.submitAgentRequirements(threadId, generationOwner, {
        requirements: [
          {
            externalId: "BR-ONLY",
            requirementType: "business",
            parentExternalIds: [],
            title: "Business requirement without FRS",
            description: "This row must remain blocked until an FRS is linked.",
            sourceDocumentId: document.id,
          },
        ],
      });
      const business = proposed.requirements[0];
      const gate = proposed.approvalGates[0];
      assert.isDefined(business);
      assert.isDefined(gate);
      const reviewed = yield* qa.review({
        threadId,
        targetType: "requirement",
        targetId: business.id,
        decision: "approved",
      });
      const error = yield* qa
        .review({
          threadId,
          targetType: "gate",
          targetId: gate.id,
          decision: "approved",
        })
        .pipe(Effect.flip);
      assert.equal(error.code, "invalid_workflow_state");
      assert.match(error.message, /link to at least one functional requirement/u);
      assert.equal(reviewed.activeStage, "requirements");
    }),
  );
});
