import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ProjectId, ThreadId } from "./baseSchemas.ts";
import {
  EnterpriseMode,
  QaAgentRequirementProposal,
  QaAgentSubmitScenariosInput,
  QaAgentSubmitScriptsInput,
  QaAgentSubmitStrategyInput,
  QaAgentSubmitTestCasesInput,
  QaDocumentKind,
  QaInitializeReleaseInput,
  QaReleaseSnapshot,
  QaReleaseStreamEvent,
  QaStageId,
  QaStageState,
  QaStrategyDocument,
  QaReviewStrategyInput,
  QaReadinessDashboard,
  QaReviewReadinessInput,
  QaScenarioPlan,
  QaScriptPlan,
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
const decodeQaUploadDocumentInput = Schema.decodeUnknownSync(QaUploadDocumentInput);
const decodeQaInitializeReleaseInput = Schema.decodeUnknownSync(QaInitializeReleaseInput);
const decodeQaReleaseSnapshot = Schema.decodeUnknownSync(QaReleaseSnapshot);
const decodeQaReleaseStreamEvent = Schema.decodeUnknownSync(QaReleaseStreamEvent);
const decodeQaStageId = Schema.decodeUnknownSync(QaStageId);
const decodeQaStageState = Schema.decodeUnknownSync(QaStageState);
const decodeQaDocumentKind = Schema.decodeUnknownSync(QaDocumentKind);
const decodeQaAgentRequirementProposal = Schema.decodeUnknownSync(QaAgentRequirementProposal);
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
  it("accepts user-facing names when initializing a QA project release", () => {
    const input = decodeQaInitializeReleaseInput({
      projectId: ProjectId.make("project-qa-contract"),
      threadId: ThreadId.make("thread-qa-contract"),
      projectTitle: "Customer portal",
      releaseTitle: "2.4.0 regression",
    });

    expect(input.projectTitle).toBe("Customer portal");
    expect(input.releaseTitle).toBe("2.4.0 regression");
  });

  it("keeps enterprise modes and RPC method names stable", () => {
    expect(decodeEnterpriseMode("qa")).toBe("qa");
    expect(decodeEnterpriseMode("developer")).toBe("developer");
    expect(decodeQaDocumentKind("HLD")).toBe("HLD");
    expect(decodeQaStageId("test_cases")).toBe("test_cases");
    expect(WS_METHODS.qaGetSnapshot).toBe("qa.getSnapshot");
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
      threadId: snapshot.threadId,
      revision: snapshot.revision,
      snapshot,
      at: "2026-07-12T00:00:00.000Z",
    });
    expect(event.snapshot.revision).toBe(event.revision);
    expect(event.type).toBe("snapshot");

    const updated = decodeQaReleaseStreamEvent({
      type: "updated",
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
