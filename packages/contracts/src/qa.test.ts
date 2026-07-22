import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { EnvironmentId, ProjectId, ThreadId } from "./baseSchemas.ts";
import {
  EnterpriseMode,
  QaAddReviewCommentInput,
  QaAgentRequirementProposal,
  QaAgentGenerationClaimOwner,
  QaAgentGenerationOwner,
  QaAgentSubmitScenariosInput,
  QaAgentSubmitScriptsInput,
  QaAgentSubmitStrategyInput,
  QaAgentSubmitTestCasesInput,
  QaDocumentKind,
  QaAssignedReleaseDashboard,
  QaCreateProjectInput,
  QaEnsureReleaseConversationInput,
  QaGetReleaseAccessInput,
  QaInitializeReleaseInput,
  QaListAssignedReleasesInput,
  QaListReviewThreadsInput,
  QaMarkReviewReadInput,
  QaReleaseAccess,
  QaReleaseId,
  QaReleaseSnapshot,
  QaReleaseStreamEvent,
  QaStageId,
  QaStageState,
  QaStrategyDocument,
  QaReviewStrategyInput,
  QaReviewAiRun,
  QaReviewScenarioPlanInput,
  QaReviewThread,
  QaReplyReviewCommentInput,
  QaResolveReviewCommentInput,
  QaReadinessDashboard,
  QaReviewReadinessInput,
  QaScenarioPlan,
  QaScriptPlan,
  QaRunReviewCommentAiCheckInput,
  QaStartStageGenerationInput,
  QaTestCasePlan,
  QaUpdateStrategySectionInput,
  QaUpdateScenarioInput,
  QaUpdateScriptInput,
  QaUpdateTestCaseInput,
  QaTraceabilityEdge,
  QaUpdateRequirementInput,
  QaUploadDocumentInput,
} from "./qa.ts";
import { WS_METHODS } from "./rpc.ts";

const decodeEnterpriseMode = Schema.decodeUnknownSync(EnterpriseMode);
const decodeQaAddReviewCommentInput = Schema.decodeUnknownSync(QaAddReviewCommentInput);
const decodeQaAssignedReleaseDashboard = Schema.decodeUnknownSync(QaAssignedReleaseDashboard);
const decodeQaGetReleaseAccessInput = Schema.decodeUnknownSync(QaGetReleaseAccessInput);
const decodeQaCreateProjectInput = Schema.decodeUnknownSync(QaCreateProjectInput);
const decodeQaEnsureReleaseConversationInput = Schema.decodeUnknownSync(
  QaEnsureReleaseConversationInput,
);
const decodeQaListAssignedReleasesInput = Schema.decodeUnknownSync(QaListAssignedReleasesInput);
const decodeQaListReviewThreadsInput = Schema.decodeUnknownSync(QaListReviewThreadsInput);
const decodeQaMarkReviewReadInput = Schema.decodeUnknownSync(QaMarkReviewReadInput);
const decodeQaReleaseAccess = Schema.decodeUnknownSync(QaReleaseAccess);
const decodeQaReplyReviewCommentInput = Schema.decodeUnknownSync(QaReplyReviewCommentInput);
const decodeQaResolveReviewCommentInput = Schema.decodeUnknownSync(QaResolveReviewCommentInput);
const decodeQaReviewAiRun = Schema.decodeUnknownSync(QaReviewAiRun);
const decodeQaReviewScenarioPlanInput = Schema.decodeUnknownSync(QaReviewScenarioPlanInput);
const decodeQaReviewThread = Schema.decodeUnknownSync(QaReviewThread);
const decodeQaRunReviewCommentAiCheckInput = Schema.decodeUnknownSync(
  QaRunReviewCommentAiCheckInput,
);
const decodeQaStartStageGenerationInput = Schema.decodeUnknownSync(QaStartStageGenerationInput);
const decodeQaUploadDocumentInput = Schema.decodeUnknownSync(QaUploadDocumentInput);
const decodeQaInitializeReleaseInput = Schema.decodeUnknownSync(QaInitializeReleaseInput);
const decodeQaReleaseSnapshot = Schema.decodeUnknownSync(QaReleaseSnapshot);
const decodeQaReleaseStreamEvent = Schema.decodeUnknownSync(QaReleaseStreamEvent);
const decodeQaStageId = Schema.decodeUnknownSync(QaStageId);
const decodeQaStageState = Schema.decodeUnknownSync(QaStageState);
const decodeQaDocumentKind = Schema.decodeUnknownSync(QaDocumentKind);
const decodeQaAgentRequirementProposal = Schema.decodeUnknownSync(QaAgentRequirementProposal);
const decodeQaAgentGenerationClaimOwner = Schema.decodeUnknownSync(QaAgentGenerationClaimOwner);
const decodeQaAgentGenerationOwner = Schema.decodeUnknownSync(QaAgentGenerationOwner);
const decodeQaAgentSubmitStrategyInput = Schema.decodeUnknownSync(QaAgentSubmitStrategyInput);
const decodeQaTraceabilityEdge = Schema.decodeUnknownSync(QaTraceabilityEdge);
const decodeQaUpdateRequirementInput = Schema.decodeUnknownSync(QaUpdateRequirementInput);
const decodeQaStrategyDocument = Schema.decodeUnknownSync(QaStrategyDocument);
const decodeQaReviewStrategyInput = Schema.decodeUnknownSync(QaReviewStrategyInput);
const decodeQaUpdateStrategySectionInput = Schema.decodeUnknownSync(QaUpdateStrategySectionInput);
const decodeQaScenarioPlan = Schema.decodeUnknownSync(QaScenarioPlan);
const decodeQaTestCasePlan = Schema.decodeUnknownSync(QaTestCasePlan);
const decodeQaAgentSubmitScenariosInput = Schema.decodeUnknownSync(QaAgentSubmitScenariosInput);
const decodeQaAgentSubmitTestCasesInput = Schema.decodeUnknownSync(QaAgentSubmitTestCasesInput);
const decodeQaUpdateScenarioInput = Schema.decodeUnknownSync(QaUpdateScenarioInput);
const decodeQaUpdateTestCaseInput = Schema.decodeUnknownSync(QaUpdateTestCaseInput);
const decodeQaScriptPlan = Schema.decodeUnknownSync(QaScriptPlan);
const decodeQaReadinessDashboard = Schema.decodeUnknownSync(QaReadinessDashboard);
const decodeQaAgentSubmitScriptsInput = Schema.decodeUnknownSync(QaAgentSubmitScriptsInput);
const decodeQaUpdateScriptInput = Schema.decodeUnknownSync(QaUpdateScriptInput);
const decodeQaReviewReadinessInput = Schema.decodeUnknownSync(QaReviewReadinessInput);

const stages = [
  {
    stage: "intake",
    status: "ready",
    progress: 0,
    activeJobId: null,
    blockedReason: null,
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
  ...(["requirements", "strategy", "scenarios", "test_cases", "scripts", "readiness"] as const).map(
    (stage) => ({
      stage,
      status: "locked" as const,
      progress: 0,
      activeJobId: null,
      blockedReason: null,
      updatedAt: "2026-07-12T00:00:00.000Z",
    }),
  ),
];

describe("QA contracts", () => {
  it("decodes claimed conversation and authenticated provider ownership", () => {
    const claimOwner = decodeQaAgentGenerationClaimOwner({
      environmentId: EnvironmentId.make("environment-qa-generation"),
      conversationThreadId: ThreadId.make("conversation-qa-generation"),
    });
    const owner = decodeQaAgentGenerationOwner({
      ...claimOwner,
      providerSessionId: "provider-session-qa-generation",
    });

    expect(owner.environmentId).toBe(claimOwner.environmentId);
    expect(owner.conversationThreadId).toBe(claimOwner.conversationThreadId);
    expect(owner.providerSessionId).toBe("provider-session-qa-generation");
    expect(() => decodeQaAgentGenerationOwner({ ...claimOwner, providerSessionId: "" })).toThrow();
  });

  it("decodes server-owned QA project creation without a client workspace root", () => {
    const releaseId = QaReleaseId.make("release-qa-create");
    const input = decodeQaCreateProjectInput({
      projectId: ProjectId.make("project-qa-create"),
      releaseId,
      projectTitle: "Customer portal",
      releaseTitle: "2.4.0 regression",
    });

    expect(input.releaseId).toBe(releaseId);
    expect(input.projectTitle).toBe("Customer portal");
    expect(input.releaseTitle).toBe("2.4.0 regression");
    expect("threadId" in input).toBe(false);
    expect("workspaceRoot" in input).toBe(false);
  });

  it("accepts a release name when initializing an existing QA project", () => {
    const input = decodeQaInitializeReleaseInput({
      projectId: ProjectId.make("project-qa-contract"),
      threadId: ThreadId.make("thread-qa-contract"),
      releaseTitle: "2.4.0 regression",
    });

    expect(input.releaseTitle).toBe("2.4.0 regression");
  });

  it("keeps lazy local conversation and generation identifiers server-owned", () => {
    const releaseId = QaReleaseId.make("release-qa-runtime");
    expect(decodeQaEnsureReleaseConversationInput({ releaseId })).toEqual({ releaseId });
    expect(decodeQaStartStageGenerationInput({ releaseId, expectedRevision: 7 })).toEqual({
      releaseId,
      expectedRevision: 7,
    });
    expect(
      decodeQaEnsureReleaseConversationInput({
        releaseId,
        conversationThreadId: "client-controlled-thread",
      }),
    ).toEqual({ releaseId });
    expect(
      decodeQaStartStageGenerationInput({
        releaseId,
        expectedRevision: 7,
        model: "client-controlled-model",
      }),
    ).toEqual({ releaseId, expectedRevision: 7 });
  });

  it("keeps enterprise modes and RPC method names stable", () => {
    expect(decodeEnterpriseMode("qa")).toBe("qa");
    expect(decodeEnterpriseMode("developer")).toBe("developer");
    expect(decodeQaDocumentKind("HLD")).toBe("HLD");
    expect(decodeQaStageId("test_cases")).toBe("test_cases");
    expect(WS_METHODS.qaListAssignedReleases).toBe("qa.listAssignedReleases");
    expect(WS_METHODS.qaSubscribeAssignedReleases).toBe("qa.subscribeAssignedReleases");
    expect(WS_METHODS.qaGetReleaseAccess).toBe("qa.getReleaseAccess");
    expect(WS_METHODS.qaGetSnapshot).toBe("qa.getSnapshot");
    expect(WS_METHODS.qaCreateProject).toBe("qa.createProject");
    expect(WS_METHODS.qaEnsureReleaseConversation).toBe("qa.ensureReleaseConversation");
    expect(WS_METHODS.qaStartStageGeneration).toBe("qa.startStageGeneration");
    expect(WS_METHODS.qaInitializeRelease).toBe("qa.initializeRelease");
    expect(WS_METHODS.qaUploadDocument).toBe("qa.uploadDocument");
    expect(WS_METHODS.qaStartIngestion).toBe("qa.startIngestion");
    expect(WS_METHODS.qaReview).toBe("qa.review");
    expect(WS_METHODS.qaSubscribeRelease).toBe("qa.subscribeRelease");
    expect(WS_METHODS.qaUpdateRequirement).toBe("qa.updateRequirement");
    expect(WS_METHODS.qaGetStrategy).toBe("qa.getStrategy");
    expect(WS_METHODS.qaGenerateStrategy).toBe("qa.generateStrategy");
    expect(WS_METHODS.qaUpdateStrategySection).toBe("qa.updateStrategySection");
    expect(WS_METHODS.qaAddStrategyComment).toBe("qa.addStrategyComment");
    expect(WS_METHODS.qaReplyStrategyComment).toBe("qa.replyStrategyComment");
    expect(WS_METHODS.qaResolveStrategyComment).toBe("qa.resolveStrategyComment");
    expect(WS_METHODS.qaSubmitStrategy).toBe("qa.submitStrategy");
    expect(WS_METHODS.qaReviewStrategy).toBe("qa.reviewStrategy");
    expect(WS_METHODS.qaGetScenarioPlan).toBe("qa.getScenarioPlan");
    expect(WS_METHODS.qaUpdateScenario).toBe("qa.updateScenario");
    expect(WS_METHODS.qaSubmitScenarioPlan).toBe("qa.submitScenarioPlan");
    expect(WS_METHODS.qaReviewScenarioPlan).toBe("qa.reviewScenarioPlan");
    expect(WS_METHODS.qaGetTestCasePlan).toBe("qa.getTestCasePlan");
    expect(WS_METHODS.qaUpdateTestCase).toBe("qa.updateTestCase");
    expect(WS_METHODS.qaSubmitTestCasePlan).toBe("qa.submitTestCasePlan");
    expect(WS_METHODS.qaReviewTestCasePlan).toBe("qa.reviewTestCasePlan");
    expect(WS_METHODS.qaGetScriptPlan).toBe("qa.getScriptPlan");
    expect(WS_METHODS.qaUpdateScript).toBe("qa.updateScript");
    expect(WS_METHODS.qaSubmitScriptPlan).toBe("qa.submitScriptPlan");
    expect(WS_METHODS.qaReviewScriptPlan).toBe("qa.reviewScriptPlan");
    expect(WS_METHODS.qaGetReadiness).toBe("qa.getReadiness");
    expect(WS_METHODS.qaReviewReadiness).toBe("qa.reviewReadiness");
    expect(WS_METHODS.qaListReviewThreads).toBe("qa.listReviewThreads");
    expect(WS_METHODS.qaAddReviewComment).toBe("qa.addReviewComment");
    expect(WS_METHODS.qaReplyReviewComment).toBe("qa.replyReviewComment");
    expect(WS_METHODS.qaRunReviewCommentAiCheck).toBe("qa.runReviewCommentAiCheck");
    expect(WS_METHODS.qaResolveReviewComment).toBe("qa.resolveReviewComment");
    expect(WS_METHODS.qaMarkReviewRead).toBe("qa.markReviewRead");
  });

  it("decodes principal-specific release access and the minimal assigned-release dashboard", () => {
    const threadId = ThreadId.make("thread-qa-review-contract");
    const releaseId = QaReleaseId.make(threadId);
    const projectId = ProjectId.make("project-qa-review-contract");
    expect(decodeQaListAssignedReleasesInput({})).toEqual({});
    expect(decodeQaGetReleaseAccessInput({ threadId }).threadId).toBe(threadId);

    const access = decodeQaReleaseAccess({
      releaseId,
      threadId,
      projectId,
      principalId: "principal-root",
      role: "root",
      uiRole: "approver",
      capabilities: ["qa:read", "qa:make", "qa:approve", "qa:chat"],
    });
    expect(access.role).toBe("root");
    expect(access.uiRole).toBe("approver");
    expect(access.capabilities).toContain("qa:approve");

    const dashboard = decodeQaAssignedReleaseDashboard({
      releases: [
        {
          releaseId,
          threadId,
          projectId,
          projectTitle: "Customer portal",
          releaseNumber: 4,
          title: "Release 4",
          activeStage: "strategy",
          bucket: "awaiting_review",
          status: "ready_for_review",
          role: "root",
          uiRole: "approver",
          unresolvedBlockingCommentCount: 1,
          unreadReviewActivityCount: 2,
          updatedAt: "2026-07-15T10:00:00.000Z",
          completedAt: null,
        },
      ],
      awaitingReviewCount: 1,
      completedSince: "2026-06-15T10:00:00.000Z",
      generatedAt: "2026-07-15T10:00:00.000Z",
    });
    expect(dashboard.releases[0]?.bucket).toBe("awaiting_review");
    expect(dashboard.releases[0]?.unresolvedBlockingCommentCount).toBe(1);
  });

  it("decodes anchored review threads, evidence, and revisioned review mutations", () => {
    const threadId = ThreadId.make("thread-qa-review-contract");
    const reviewThreadId = "review-thread-1";
    const approver = {
      principalId: "principal-approver",
      displayName: "QA Approver",
      role: "qa:approver",
    } as const;
    const maker = {
      principalId: "principal-maker",
      displayName: "QA Maker",
      role: "qa:maker",
    } as const;
    const aiRun = decodeQaReviewAiRun({
      id: "ai-run-1",
      reviewThreadId,
      status: "completed",
      requestedBy: approver,
      providerInstanceId: null,
      model: "gpt-5",
      artifactRevision: 7,
      sourceChainHash: "sha256:source-chain-7",
      result: {
        verdict: "agrees",
        rationale: "The maker response brings the strategy back into alignment.",
        citations: [
          {
            citation: {
              documentId: "doc-hld-1",
              documentName: "Payments HLD",
              section: "3.2 Approval boundary",
              location: "page 14",
              excerpt: "A checker must approve every high-value transfer.",
            },
            relationship: "supports",
            explanation: "The revised strategy now covers the checker boundary.",
          },
        ],
      },
      failureMessage: null,
      stale: false,
      createdAt: "2026-07-15T10:00:00.000Z",
      startedAt: "2026-07-15T10:00:01.000Z",
      completedAt: "2026-07-15T10:00:10.000Z",
    });
    expect(aiRun.result?.citations[0]?.citation.documentId).toBe("doc-hld-1");

    const reviewThread = decodeQaReviewThread({
      id: reviewThreadId,
      threadId,
      artifactKind: "strategy",
      artifactId: "strategy-release-4",
      anchor: {
        type: "strategy_section",
        sectionId: "approval-controls",
        label: "Approval controls",
        quote: "High-value transfer validation",
      },
      severity: "blocking",
      status: "open",
      createdArtifactRevision: 6,
      currentArtifactRevision: 7,
      currentSourceChainHash: "sha256:source-chain-7",
      createdBy: approver,
      entries: [
        {
          id: "review-entry-1",
          reviewThreadId,
          kind: "comment",
          body: "Cover the checker boundary for high-value transfers.",
          author: approver,
          correctsEntryId: null,
          createdAt: "2026-07-15T09:00:00.000Z",
        },
        {
          id: "review-entry-2",
          reviewThreadId,
          kind: "reply",
          body: "Addressed in the approval-controls section.",
          author: maker,
          correctsEntryId: null,
          createdAt: "2026-07-15T09:30:00.000Z",
        },
      ],
      latestMakerReplyAt: "2026-07-15T09:30:00.000Z",
      latestAiRun: aiRun,
      canRunAiReview: true,
      canResolve: true,
      unreadCount: 1,
      createdAt: "2026-07-15T09:00:00.000Z",
      updatedAt: "2026-07-15T10:00:10.000Z",
      resolvedAt: null,
      resolvedBy: null,
      resolutionAiRunId: null,
      resolutionOverrideReason: null,
    });
    expect(reviewThread.anchor.type).toBe("strategy_section");
    expect(reviewThread.latestAiRun?.result?.verdict).toBe("agrees");

    const add = decodeQaAddReviewCommentInput({
      threadId,
      artifactKind: "scenario_plan",
      artifactId: "scenario-plan-4",
      expectedRevision: 7,
      anchor: {
        type: "scenario",
        scenarioId: "scenario-12",
        label: "SCN-012 — High-value transfer",
        quote: null,
      },
      severity: "advisory",
      body: "Add a boundary-value example.",
    });
    expect(add.anchor.type).toBe("scenario");
    expect(
      decodeQaListReviewThreadsInput({
        threadId,
        artifactKind: "scenario_plan",
        artifactId: "scenario-plan-4",
      }).artifactKind,
    ).toBe("scenario_plan");
    expect(
      decodeQaReplyReviewCommentInput({
        threadId,
        reviewThreadId,
        expectedRevision: 8,
        body: "Added the boundary example.",
      }).body,
    ).toBe("Added the boundary example.");
    expect(
      decodeQaRunReviewCommentAiCheckInput({
        threadId,
        reviewThreadId,
        expectedRevision: 9,
      }).reviewThreadId,
    ).toBe(reviewThreadId);
    expect(
      decodeQaResolveReviewCommentInput({
        threadId,
        reviewThreadId,
        aiRunId: aiRun.id,
        expectedRevision: 10,
      }).aiRunId,
    ).toBe(aiRun.id);
    expect(
      decodeQaMarkReviewReadInput({
        threadId,
        reviewThreadId,
        throughEntryId: "review-entry-2",
      }).throughEntryId,
    ).toBe("review-entry-2");

    expect(() =>
      decodeQaAddReviewCommentInput({
        ...add,
        artifactKind: "strategy",
      }),
    ).toThrow();
    expect(() =>
      decodeQaReviewAiRun({
        ...aiRun,
        status: "completed",
        result: null,
      }),
    ).toThrow();
  });

  it("round-trips upload bytes and a release snapshot", () => {
    const upload = decodeQaUploadDocumentInput({
      threadId: ThreadId.make("thread-qa-contract"),
      fileName: "requirements.md",
      mediaType: "text/markdown",
      bytes: new TextEncoder().encode("The system must retain audit evidence."),
    });
    expect(upload.bytes.byteLength).toBeGreaterThan(0);

    const snapshot = decodeQaReleaseSnapshot({
      mode: "qa",
      projectId: ProjectId.make("project-qa-contract"),
      releaseId: QaReleaseId.make(upload.threadId),
      threadId: upload.threadId,
      revision: 1,
      releaseNumber: 1,
      title: "Release 1",
      status: "active",
      phase: "documents",
      activeStage: "intake",
      stages,
      ingestionStatus: "idle",
      ingestionProgress: 0,
      documents: [],
      requirements: [],
      traceabilityNodes: [],
      traceabilityEdges: [],
      authoredFlows: [],
      strategy: null,
      scenarioPlan: null,
      testCasePlan: null,
      scriptPlan: null,
      readinessDashboard: null,
      approvalGates: [],
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    });
    expect(snapshot.threadId).toBe(upload.threadId);
    expect(snapshot.activeStage).toBe("intake");
    expect(snapshot.stages).toHaveLength(7);

    const event = decodeQaReleaseStreamEvent({
      type: "snapshot",
      releaseId: snapshot.releaseId,
      threadId: snapshot.threadId,
      revision: snapshot.revision,
      snapshot,
      at: "2026-07-12T00:00:00.000Z",
    });
    expect(event.snapshot.revision).toBe(event.revision);
    expect(event.type).toBe("snapshot");

    const updated = decodeQaReleaseStreamEvent({
      type: "updated",
      releaseId: snapshot.releaseId,
      threadId: snapshot.threadId,
      revision: 2,
      reason: "stage_advanced",
      snapshot: { ...snapshot, revision: 2 },
      at: "2026-07-12T00:01:00.000Z",
    });
    expect(updated.type).toBe("updated");
    if (updated.type === "updated") expect(updated.reason).toBe("stage_advanced");
  });

  it("rejects invalid stage progress and non-positive revisions", () => {
    expect(() => decodeQaStageState({ ...stages[0], progress: 101 })).toThrow();
    expect(() =>
      decodeQaReleaseSnapshot({
        mode: "qa",
        projectId: ProjectId.make("project-qa-contract"),
        releaseId: QaReleaseId.make("release-qa-contract"),
        threadId: ThreadId.make("thread-qa-contract"),
        revision: 0,
        releaseNumber: 1,
        title: "Release 1",
        status: "active",
        phase: "documents",
        activeStage: "intake",
        stages,
        ingestionStatus: "idle",
        ingestionProgress: 0,
        documents: [],
        requirements: [],
        traceabilityNodes: [],
        traceabilityEdges: [],
        strategy: null,
        scenarioPlan: null,
        testCasePlan: null,
        scriptPlan: null,
        readinessDashboard: null,
        approvalGates: [],
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("decodes requirement proposals and governed traceability edges", () => {
    const citation = {
      documentId: "doc-brd-1",
      section: "BRD §2",
      excerpt: "Users must authenticate before accessing trading functions.",
    };
    const proposal = decodeQaAgentRequirementProposal({
      externalId: "BR-001",
      requirementType: "business",
      parentExternalIds: [],
      citation,
      title: "Authenticated access",
      description: "Users must authenticate before accessing protected trading functions.",
      sourceDocumentId: "doc-brd-1",
    });
    expect(proposal.requirementType).toBe("business");
    expect(proposal.citation?.section).toBe("BRD §2");

    const edge = decodeQaTraceabilityEdge({
      id: "edge-brd-br-001",
      threadId: ThreadId.make("thread-qa-contract"),
      fromNodeId: "node-doc-brd-1",
      toNodeId: "node-br-001",
      kind: "contains",
      provenance: "deterministic",
      reviewStatus: "approved",
      citation,
    });
    expect(edge.provenance).toBe("deterministic");
    expect(edge.reviewStatus).toBe("approved");
  });

  it("requires revisioned, non-empty requirement workbook updates", () => {
    const update = decodeQaUpdateRequirementInput({
      threadId: ThreadId.make("thread-qa-contract"),
      requirementId: "requirement-br-001",
      expectedRevision: 4,
      patch: { title: "Authenticated enterprise access" },
    });
    expect(update.patch.title).toBe("Authenticated enterprise access");
    expect(() =>
      decodeQaUpdateRequirementInput({
        threadId: ThreadId.make("thread-qa-contract"),
        requirementId: "requirement-br-001",
        expectedRevision: 4,
        patch: {},
      }),
    ).toThrow();
  });

  it("decodes a durable sectioned strategy with threaded review comments", () => {
    const strategy = decodeQaStrategyDocument({
      id: "strategy-release-1",
      threadId: ThreadId.make("thread-qa-contract"),
      revision: 3,
      title: "Release 1 Test Strategy",
      generationStatus: "complete",
      reviewStatus: "pending_review",
      coverage: {
        totalRequirements: 2,
        coveredRequirements: 1,
        percent: 50,
        uncoveredRequirementIds: ["FR-002"],
      },
      sections: [
        {
          id: "scope",
          title: "Scope",
          order: 0,
          content: "Validate authenticated access and approval controls.",
          sourceRequirementIds: ["BR-001", "FR-001"],
          updatedAt: "2026-07-12T00:02:00.000Z",
        },
      ],
      comments: [
        {
          id: "comment-1",
          sectionId: "scope",
          quote: "approval controls",
          body: "Clarify the segregation-of-duties boundary.",
          status: "open",
          author: "Inputter",
          replies: [
            {
              id: "reply-1",
              body: "Use the checker control from HLD evidence.",
              author: "Approver",
              createdAt: "2026-07-12T00:04:00.000Z",
            },
          ],
          createdAt: "2026-07-12T00:03:00.000Z",
          resolvedAt: null,
          resolvedBy: null,
        },
      ],
      rejectionNote: null,
      createdAt: "2026-07-12T00:01:00.000Z",
      updatedAt: "2026-07-12T00:04:00.000Z",
      submittedAt: "2026-07-12T00:03:30.000Z",
      submittedBy: "Inputter",
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
    });
    expect(strategy.sections[0]?.sourceRequirementIds).toEqual(["BR-001", "FR-001"]);
    expect(strategy.comments[0]?.replies[0]?.author).toBe("Approver");
    expect(strategy.coverage.uncoveredRequirementIds).toEqual(["FR-002"]);
  });

  it("requires revisioned strategy edits and explicit approval decisions", () => {
    const update = decodeQaUpdateStrategySectionInput({
      threadId: ThreadId.make("thread-qa-contract"),
      strategyId: "strategy-release-1",
      sectionId: "scope",
      expectedRevision: 3,
      patch: { content: "Updated release scope." },
    });
    expect(update.patch.content).toBe("Updated release scope.");
    expect(() =>
      decodeQaUpdateStrategySectionInput({
        threadId: ThreadId.make("thread-qa-contract"),
        strategyId: "strategy-release-1",
        sectionId: "scope",
        expectedRevision: 3,
        patch: {},
      }),
    ).toThrow();

    const approval = decodeQaReviewStrategyInput({
      threadId: ThreadId.make("thread-qa-contract"),
      strategyId: "strategy-release-1",
      expectedRevision: 4,
      decision: "approved",
      note: "Approved after comment resolution.",
    });
    expect(approval.decision).toBe("approved");

    const changesRequested = decodeQaReviewStrategyInput({
      threadId: ThreadId.make("thread-qa-contract"),
      strategyId: "strategy-release-1",
      expectedRevision: 5,
      decision: "changes_requested",
      blockingCommentIds: ["review-thread-1"],
      summary: "Address the unresolved approval-boundary comment.",
    });
    expect(changesRequested.blockingCommentIds).toEqual(["review-thread-1"]);
    expect(() =>
      decodeQaReviewStrategyInput({
        threadId: ThreadId.make("thread-qa-contract"),
        strategyId: "strategy-release-1",
        expectedRevision: 5,
        decision: "changes_requested",
      }),
    ).toThrow();

    const scenarioChangesRequested = decodeQaReviewScenarioPlanInput({
      threadId: ThreadId.make("thread-qa-contract"),
      planId: "scenario-plan-release-1",
      expectedRevision: 5,
      decision: "changes_requested",
      blockingCommentIds: ["review-thread-2"],
    });
    expect(scenarioChangesRequested.decision).toBe("changes_requested");
  });

  it("accepts only bounded, draft-only agent strategy proposals", () => {
    const proposal = decodeQaAgentSubmitStrategyInput({
      sections: [
        {
          title: "Scope",
          content: "Validate the approved business and functional requirements.",
          sourceRequirementIds: ["BR-001", "FR-001"],
        },
      ],
    });
    expect(proposal.sections[0]?.title).toBe("Scope");
    expect(proposal.sections[0]?.sourceRequirementIds).toEqual(["BR-001", "FR-001"]);
    expect(() => decodeQaAgentSubmitStrategyInput({ sections: [] })).toThrow();
    expect(() =>
      decodeQaAgentSubmitStrategyInput({
        sections: Array.from({ length: 51 }, (_, index) => ({
          title: `Section ${index + 1}`,
          content: "Draft content",
          sourceRequirementIds: [],
        })),
      }),
    ).toThrow();
  });

  it("decodes revisioned scenario and test case workbooks", () => {
    const audit = {
      createdAt: "2026-07-12T01:00:00.000Z",
      updatedAt: "2026-07-12T01:00:00.000Z",
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
    };
    const scenario = {
      id: "scenario-1",
      externalId: "SCN-001",
      title: "Authenticated maker access",
      type: "positive",
      priority: "high",
      risk: "high",
      requirementIds: ["BR-001", "FR-001"],
      preconditions: ["The maker account exists."],
      expectedOutcome: "The maker reaches the protected trade screen.",
      status: "pending",
      decisionNote: null,
      ...audit,
    } as const;
    const scenarioPlan = decodeQaScenarioPlan({
      id: "scenario-plan-1",
      threadId: ThreadId.make("thread-qa-contract"),
      revision: 1,
      generationStatus: "complete",
      reviewStatus: "draft",
      scenarios: [scenario],
      rejectionNote: null,
      ...audit,
    });
    expect(scenarioPlan.scenarios[0]?.type).toBe("positive");

    const testCasePlan = decodeQaTestCasePlan({
      id: "test-plan-1",
      threadId: ThreadId.make("thread-qa-contract"),
      revision: 1,
      generationStatus: "complete",
      reviewStatus: "draft",
      testCases: [
        {
          id: "test-case-1",
          externalId: "TC-001",
          scenarioIds: ["SCN-001"],
          requirementIds: ["BR-001", "FR-001"],
          title: "Authenticate a valid maker",
          preconditions: ["The maker account exists."],
          steps: [
            {
              order: 1,
              action: "Enter valid maker credentials and submit.",
              testData: "maker_user",
              expectedResult: "The trade screen is displayed.",
            },
          ],
          priority: "high",
          automationCandidate: true,
          status: "pending",
          decisionNote: null,
          ...audit,
        },
      ],
      rejectionNote: null,
      ...audit,
    });
    expect(testCasePlan.testCases[0]?.steps[0]?.order).toBe(1);
    expect(testCasePlan.testCases[0]?.automationCandidate).toBe(true);
  });

  it("keeps agent scenario and test case proposals draft-only and bounded", () => {
    const scenarios = decodeQaAgentSubmitScenariosInput({
      scenarios: [
        {
          externalId: "SCN-001",
          title: "Authenticated maker access",
          type: "positive",
          priority: "high",
          risk: "high",
          requirementIds: ["BR-001", "FR-001"],
          preconditions: ["The maker account exists."],
          expectedOutcome: "The maker reaches the protected trade screen.",
        },
      ],
    });
    expect(scenarios.scenarios[0]?.externalId).toBe("SCN-001");
    expect("status" in (scenarios.scenarios[0] ?? {})).toBe(false);

    const testCases = decodeQaAgentSubmitTestCasesInput({
      testCases: [
        {
          externalId: "TC-001",
          scenarioIds: ["SCN-001"],
          requirementIds: ["FR-001"],
          title: "Authenticate a valid maker",
          preconditions: [],
          steps: [
            {
              order: 1,
              action: "Submit valid credentials.",
              testData: "maker_user",
              expectedResult: "Authentication succeeds.",
            },
          ],
          priority: "high",
          automationCandidate: true,
        },
      ],
    });
    expect(testCases.testCases[0]?.steps).toHaveLength(1);
    expect("status" in (testCases.testCases[0] ?? {})).toBe(false);
    expect(() => decodeQaAgentSubmitScenariosInput({ scenarios: [] })).toThrow();
    expect(() => decodeQaAgentSubmitTestCasesInput({ testCases: [] })).toThrow();
  });

  it("requires non-empty revisioned scenario and test case row patches", () => {
    const base = {
      threadId: ThreadId.make("thread-qa-contract"),
      planId: "plan-1",
      expectedRevision: 2,
    };
    expect(
      decodeQaUpdateScenarioInput({
        ...base,
        scenarioId: "scenario-1",
        patch: { priority: "critical" },
      }).patch.priority,
    ).toBe("critical");
    expect(() =>
      decodeQaUpdateScenarioInput({ ...base, scenarioId: "scenario-1", patch: {} }),
    ).toThrow();
    expect(
      decodeQaUpdateTestCaseInput({
        ...base,
        testCaseId: "test-case-1",
        patch: { automationCandidate: false },
      }).patch.automationCandidate,
    ).toBe(false);
    expect(() =>
      decodeQaUpdateTestCaseInput({ ...base, testCaseId: "test-case-1", patch: {} }),
    ).toThrow();
  });

  it("decodes revisioned scripts with structured evidence", () => {
    const plan = decodeQaScriptPlan({
      id: "script-plan-1",
      threadId: ThreadId.make("thread-qa-contract"),
      revision: 2,
      generationStatus: "complete",
      reviewStatus: "approved",
      scripts: [
        {
          id: "script-1",
          externalId: "SCR-001",
          testCaseIds: ["TC-001"],
          requirementIds: ["FR-001"],
          title: "Authenticate a valid maker",
          framework: "Playwright",
          language: "TypeScript",
          fileName: "tc-001.spec.ts",
          content: "test('valid maker', async () => {});",
          status: "executed",
          executionStatus: "passed",
          lastRunAt: "2026-07-12T02:00:00.000Z",
          evidence: [
            {
              id: "evidence-1",
              kind: "report",
              summary: "Playwright HTML report",
              artifactPath: ".qa/evidence/tc-001/report.html",
              createdAt: "2026-07-12T02:00:00.000Z",
            },
          ],
          createdAt: "2026-07-12T01:00:00.000Z",
          updatedAt: "2026-07-12T02:00:00.000Z",
        },
      ],
      rejectionNote: null,
      createdAt: "2026-07-12T01:00:00.000Z",
      updatedAt: "2026-07-12T02:00:00.000Z",
      submittedAt: "2026-07-12T01:30:00.000Z",
      submittedBy: "Inputter",
      approvedAt: "2026-07-12T01:45:00.000Z",
      approvedBy: "Approver",
      rejectedAt: null,
      rejectedBy: null,
    });
    expect(plan.scripts[0]?.executionStatus).toBe("passed");
    expect(plan.scripts[0]?.evidence[0]?.kind).toBe("report");

    const proposal = decodeQaAgentSubmitScriptsInput({
      scripts: [
        {
          externalId: "SCR-002",
          testCaseIds: ["TC-002"],
          requirementIds: ["FR-002"],
          title: "Reject invalid credentials",
          framework: "Playwright",
          language: "TypeScript",
          fileName: "tc-002.spec.ts",
          content: "test('invalid credentials', async () => {});",
        },
      ],
    });
    expect("status" in (proposal.scripts[0] ?? {})).toBe(false);
    expect(() => decodeQaAgentSubmitScriptsInput({ scripts: [] })).toThrow();
  });

  it("requires revisioned script edits", () => {
    const input = {
      threadId: ThreadId.make("thread-qa-contract"),
      planId: "script-plan-1",
      scriptId: "script-1",
      expectedRevision: 2,
    };
    expect(
      decodeQaUpdateScriptInput({ ...input, patch: { content: "updated script" } }).patch.content,
    ).toBe("updated script");
    expect(() => decodeQaUpdateScriptInput({ ...input, patch: {} })).toThrow();
  });

  it("decodes server-computed readiness and explicit review input", () => {
    const metric = { covered: 2, total: 2, percent: 100 };
    const dashboard = decodeQaReadinessDashboard({
      threadId: ThreadId.make("thread-qa-contract"),
      revision: 5,
      overallStatus: "ready",
      reviewStatus: "pending",
      requirementCoverage: metric,
      scenarioCoverage: metric,
      testCaseCoverage: metric,
      scriptCoverage: metric,
      executionPassed: 2,
      executionFailed: 0,
      openBlockers: [],
      gateChecks: [
        {
          id: "execution",
          title: "Approved scripts passed",
          status: "passed",
          detail: "2/2 scripts passed.",
        },
      ],
      computedAt: "2026-07-12T03:00:00.000Z",
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      decisionNote: null,
    });
    expect(dashboard.overallStatus).toBe("ready");
    expect(dashboard.executionFailed).toBe(0);

    const review = decodeQaReviewReadinessInput({
      threadId: dashboard.threadId,
      expectedRevision: dashboard.revision,
      decision: "approved",
      note: "All gates passed; close the release.",
    });
    expect(review.decision).toBe("approved");
  });
});
