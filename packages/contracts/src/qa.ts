import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { AuthQaApproveScope, AuthQaChatScope, AuthQaMakeScope, AuthQaReadScope } from "./auth.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const EnterpriseMode = Schema.Literals(["qa", "developer", "business_analyst"]);
export type EnterpriseMode = typeof EnterpriseMode.Type;

/**
 * Stable identifier for a shared QA release. The QA database still stores this
 * value in its legacy `thread_id` columns, but it is not a local conversation
 * thread identifier.
 */
export const QaReleaseId = TrimmedNonEmptyString.pipe(Schema.brand("QaReleaseId"));
export type QaReleaseId = typeof QaReleaseId.Type;

export const QaDocumentStatus = Schema.Literals(["uploaded", "processing", "processed", "failed"]);
export type QaDocumentStatus = typeof QaDocumentStatus.Type;

export const QaDocumentKind = Schema.Literals(["BRD", "FRS", "HLD", "LLD", "OTHER"]);
export type QaDocumentKind = typeof QaDocumentKind.Type;

export const QaReviewStatus = Schema.Literals(["pending", "approved", "rejected"]);
export type QaReviewStatus = typeof QaReviewStatus.Type;

/** `rejected` is retained for compatibility while new artifact loops use changes requested. */
export const QaArtifactReviewDecision = Schema.Literals([
  "approved",
  "changes_requested",
  "rejected",
]);
export type QaArtifactReviewDecision = typeof QaArtifactReviewDecision.Type;

export const QaIngestionStatus = Schema.Literals([
  "idle",
  "queued",
  "processing",
  "completed",
  "failed",
]);
export type QaIngestionStatus = typeof QaIngestionStatus.Type;

export const QaReleasePhase = Schema.Literals([
  "documents",
  "ingestion",
  "requirements_review",
  "ready",
]);
export type QaReleasePhase = typeof QaReleasePhase.Type;

/**
 * Stable, server-owned identifiers for the greenfield QA workflow. The legacy
 * `QaReleasePhase` remains in the snapshot while clients migrate from the
 * coarse ingestion phases to these artifact-oriented stages.
 */
export const QaStageId = Schema.Literals([
  "intake",
  "requirements",
  "strategy",
  "scenarios",
  "test_cases",
  "scripts",
  "readiness",
]);
export type QaStageId = typeof QaStageId.Type;

export const QaStageStatus = Schema.Literals([
  "locked",
  "ready",
  "queued",
  "running",
  "awaiting_review",
  "blocked",
  "complete",
  "stale",
]);
export type QaStageStatus = typeof QaStageStatus.Type;

export const QaStageState = Schema.Struct({
  stage: QaStageId,
  status: QaStageStatus,
  progress: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  activeJobId: Schema.NullOr(TrimmedNonEmptyString),
  blockedReason: Schema.NullOr(TrimmedNonEmptyString),
  updatedAt: IsoDateTime,
});
export type QaStageState = typeof QaStageState.Type;

export const QaDocument = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  fileName: TrimmedNonEmptyString,
  kind: QaDocumentKind,
  version: TrimmedNonEmptyString,
  mediaType: TrimmedNonEmptyString,
  storagePath: TrimmedNonEmptyString,
  byteSize: NonNegativeInt,
  sha256: TrimmedNonEmptyString,
  status: QaDocumentStatus,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type QaDocument = typeof QaDocument.Type;

export const QaRequirementType = Schema.Literals(["business", "functional"]);
export type QaRequirementType = typeof QaRequirementType.Type;

export const QaSourceCitation = Schema.Struct({
  documentId: TrimmedNonEmptyString,
  documentName: Schema.optional(TrimmedNonEmptyString),
  documentType: Schema.optional(TrimmedNonEmptyString),
  section: TrimmedNonEmptyString,
  location: Schema.optional(TrimmedNonEmptyString),
  excerpt: TrimmedNonEmptyString,
});
export type QaSourceCitation = typeof QaSourceCitation.Type;

export const QaProjectRole = Schema.Literals(["root", "qa:maker", "qa:approver"]);
export type QaProjectRole = typeof QaProjectRole.Type;

export const QaUiRole = Schema.Literals(["maker", "approver"]);
export type QaUiRole = typeof QaUiRole.Type;

export const QaReleaseCapability = Schema.Literals([
  AuthQaReadScope,
  AuthQaMakeScope,
  AuthQaApproveScope,
  AuthQaChatScope,
]);
export type QaReleaseCapability = typeof QaReleaseCapability.Type;

/** Principal-specific access is queried separately from the shared release snapshot. */
export const QaReleaseAccess = Schema.Struct({
  releaseId: QaReleaseId,
  /** @deprecated Use `releaseId`; this is the legacy QA database key alias. */
  threadId: ThreadId,
  projectId: ProjectId,
  principalId: TrimmedNonEmptyString,
  role: QaProjectRole,
  uiRole: QaUiRole,
  capabilities: Schema.Array(QaReleaseCapability),
});
export type QaReleaseAccess = typeof QaReleaseAccess.Type;

export const QaAssignedReleaseBucket = Schema.Literals([
  "awaiting_review",
  "in_progress",
  "completed",
]);
export type QaAssignedReleaseBucket = typeof QaAssignedReleaseBucket.Type;

export const QaAssignedReleaseStatus = Schema.Literals([
  "active",
  "ready_for_review",
  "changes_requested",
  "blocked",
  "completed",
]);
export type QaAssignedReleaseStatus = typeof QaAssignedReleaseStatus.Type;

export const QaAssignedReleaseSummary = Schema.Struct({
  releaseId: QaReleaseId,
  /** @deprecated Use `releaseId`; this is the legacy QA database key alias. */
  threadId: ThreadId,
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
  releaseNumber: PositiveInt,
  title: TrimmedNonEmptyString,
  activeStage: QaStageId,
  bucket: QaAssignedReleaseBucket,
  status: QaAssignedReleaseStatus,
  role: QaProjectRole,
  uiRole: QaUiRole,
  unresolvedBlockingCommentCount: NonNegativeInt,
  unreadReviewActivityCount: NonNegativeInt,
  updatedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
});
export type QaAssignedReleaseSummary = typeof QaAssignedReleaseSummary.Type;

export const QaAssignedReleaseDashboard = Schema.Struct({
  releases: Schema.Array(QaAssignedReleaseSummary),
  awaitingReviewCount: NonNegativeInt,
  completedSince: IsoDateTime,
  generatedAt: IsoDateTime,
});
export type QaAssignedReleaseDashboard = typeof QaAssignedReleaseDashboard.Type;

export const QaReviewArtifactKind = Schema.Literals(["strategy", "scenario_plan"]);
export type QaReviewArtifactKind = typeof QaReviewArtifactKind.Type;

export const QaStrategySectionReviewAnchor = Schema.Struct({
  type: Schema.Literal("strategy_section"),
  sectionId: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  quote: Schema.NullOr(Schema.String.check(Schema.isMaxLength(10_000))),
});
export type QaStrategySectionReviewAnchor = typeof QaStrategySectionReviewAnchor.Type;

export const QaScenarioReviewAnchor = Schema.Struct({
  type: Schema.Literal("scenario"),
  scenarioId: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  quote: Schema.NullOr(Schema.String.check(Schema.isMaxLength(10_000))),
});
export type QaScenarioReviewAnchor = typeof QaScenarioReviewAnchor.Type;

export const QaReviewAnchor = Schema.Union([QaStrategySectionReviewAnchor, QaScenarioReviewAnchor]);
export type QaReviewAnchor = typeof QaReviewAnchor.Type;

export const QaReviewSeverity = Schema.Literals(["blocking", "advisory"]);
export type QaReviewSeverity = typeof QaReviewSeverity.Type;

export const QaReviewThreadStatus = Schema.Literals(["open", "resolved"]);
export type QaReviewThreadStatus = typeof QaReviewThreadStatus.Type;

export const QaReviewActor = Schema.Struct({
  principalId: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  role: QaProjectRole,
});
export type QaReviewActor = typeof QaReviewActor.Type;

export const QaReviewEntryKind = Schema.Literals(["comment", "reply", "correction"]);
export type QaReviewEntryKind = typeof QaReviewEntryKind.Type;

/** Review entries are append-only; corrections point at the entry they supersede. */
export const QaReviewEntry = Schema.Struct({
  id: TrimmedNonEmptyString,
  reviewThreadId: TrimmedNonEmptyString,
  kind: QaReviewEntryKind,
  body: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  author: QaReviewActor,
  correctsEntryId: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
}).check(
  Schema.makeFilter(
    (entry) =>
      (entry.kind === "correction") === (entry.correctsEntryId !== null) ||
      "Only correction entries may reference a corrected entry.",
  ),
);
export type QaReviewEntry = typeof QaReviewEntry.Type;

export const QaReviewAiVerdict = Schema.Literals(["agrees", "disagrees", "inconclusive"]);
export type QaReviewAiVerdict = typeof QaReviewAiVerdict.Type;

export const QaReviewAiCitationRelationship = Schema.Literals([
  "supports",
  "contradicts",
  "context",
]);
export type QaReviewAiCitationRelationship = typeof QaReviewAiCitationRelationship.Type;

export const QaReviewAiCitation = Schema.Struct({
  citation: QaSourceCitation,
  relationship: QaReviewAiCitationRelationship,
  explanation: TrimmedNonEmptyString.check(Schema.isMaxLength(4_000)),
});
export type QaReviewAiCitation = typeof QaReviewAiCitation.Type;

export const QaReviewAiResult = Schema.Struct({
  verdict: QaReviewAiVerdict,
  rationale: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  citations: Schema.Array(QaReviewAiCitation),
});
export type QaReviewAiResult = typeof QaReviewAiResult.Type;

export const QaReviewAiRunStatus = Schema.Literals(["queued", "running", "completed", "failed"]);
export type QaReviewAiRunStatus = typeof QaReviewAiRunStatus.Type;

export const QaReviewAiRun = Schema.Struct({
  id: TrimmedNonEmptyString,
  reviewThreadId: TrimmedNonEmptyString,
  status: QaReviewAiRunStatus,
  requestedBy: QaReviewActor,
  providerInstanceId: Schema.NullOr(ProviderInstanceId),
  model: Schema.NullOr(TrimmedNonEmptyString),
  artifactRevision: PositiveInt,
  sourceChainHash: TrimmedNonEmptyString,
  result: Schema.NullOr(QaReviewAiResult),
  failureMessage: Schema.NullOr(Schema.String.check(Schema.isMaxLength(20_000))),
  stale: Schema.Boolean,
  createdAt: IsoDateTime,
  startedAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
}).check(
  Schema.makeFilter((run) => {
    switch (run.status) {
      case "queued":
        return (
          (run.startedAt === null &&
            run.completedAt === null &&
            run.result === null &&
            run.failureMessage === null) ||
          "Queued AI reviews cannot contain execution or terminal result fields."
        );
      case "running":
        return (
          (run.startedAt !== null &&
            run.completedAt === null &&
            run.result === null &&
            run.failureMessage === null) ||
          "Running AI reviews require a start time and cannot contain terminal result fields."
        );
      case "completed":
        return (
          (run.startedAt !== null &&
            run.completedAt !== null &&
            run.result !== null &&
            run.failureMessage === null) ||
          "Completed AI reviews require a result and terminal timestamps."
        );
      case "failed":
        return (
          (run.startedAt !== null &&
            run.completedAt !== null &&
            run.result === null &&
            run.failureMessage !== null) ||
          "Failed AI reviews require a failure message and terminal timestamps."
        );
    }
  }),
);
export type QaReviewAiRun = typeof QaReviewAiRun.Type;

export const QaReviewThread = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  artifactKind: QaReviewArtifactKind,
  artifactId: TrimmedNonEmptyString,
  anchor: QaReviewAnchor,
  severity: QaReviewSeverity,
  status: QaReviewThreadStatus,
  createdArtifactRevision: PositiveInt,
  currentArtifactRevision: PositiveInt,
  currentSourceChainHash: TrimmedNonEmptyString,
  createdBy: QaReviewActor,
  entries: Schema.Array(QaReviewEntry).check(Schema.isMinLength(1)),
  latestMakerReplyAt: Schema.NullOr(IsoDateTime),
  latestAiRun: Schema.NullOr(QaReviewAiRun),
  canRunAiReview: Schema.Boolean,
  canResolve: Schema.Boolean,
  unreadCount: NonNegativeInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
  resolvedBy: Schema.NullOr(QaReviewActor),
  resolutionAiRunId: Schema.NullOr(TrimmedNonEmptyString),
  resolutionOverrideReason: Schema.NullOr(TrimmedNonEmptyString.check(Schema.isMaxLength(4_000))),
}).check(
  Schema.makeFilter(
    (thread) =>
      (thread.artifactKind === "strategy" && thread.anchor.type === "strategy_section") ||
      (thread.artifactKind === "scenario_plan" && thread.anchor.type === "scenario") ||
      "Review thread anchor must match its artifact kind.",
  ),
  Schema.makeFilter(
    (thread) =>
      (thread.status === "open"
        ? thread.resolvedAt === null &&
          thread.resolvedBy === null &&
          thread.resolutionAiRunId === null &&
          thread.resolutionOverrideReason === null
        : thread.resolvedAt !== null &&
          thread.resolvedBy !== null &&
          thread.resolutionAiRunId !== null) ||
      "Review thread resolution fields must match its status.",
  ),
);
export type QaReviewThread = typeof QaReviewThread.Type;

export const QaReviewReadReceipt = Schema.Struct({
  threadId: ThreadId,
  reviewThreadId: TrimmedNonEmptyString,
  principalId: TrimmedNonEmptyString,
  lastReadEntryId: Schema.NullOr(TrimmedNonEmptyString),
  readAt: IsoDateTime,
});
export type QaReviewReadReceipt = typeof QaReviewReadReceipt.Type;

export const QaReviewThreadList = Schema.Struct({
  threadId: ThreadId,
  reviewThreads: Schema.Array(QaReviewThread),
  readReceipts: Schema.Array(QaReviewReadReceipt),
  generatedAt: IsoDateTime,
});
export type QaReviewThreadList = typeof QaReviewThreadList.Type;

export const QaRequirement = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  externalId: TrimmedNonEmptyString,
  requirementType: QaRequirementType,
  reviewRequired: Schema.Boolean,
  parentRequirementIds: Schema.Array(TrimmedNonEmptyString),
  sourceCitations: Schema.Array(QaSourceCitation),
  sourceDocumentId: Schema.NullOr(TrimmedNonEmptyString),
  sourceDocumentName: Schema.optional(TrimmedNonEmptyString),
  title: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  confidence: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  tags: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  extractionMethod: Schema.optional(TrimmedNonEmptyString),
  status: QaReviewStatus,
  decisionNote: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type QaRequirement = typeof QaRequirement.Type;

export const QaTraceabilityNodeKind = Schema.Literals([
  "document",
  "business_requirement",
  "functional_requirement",
  "component",
  "flow",
  "interface",
  "control",
  "data",
  "test",
]);
export type QaTraceabilityNodeKind = typeof QaTraceabilityNodeKind.Type;

export const QaTraceabilityNode = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  kind: QaTraceabilityNodeKind,
  label: TrimmedNonEmptyString,
  externalId: Schema.NullOr(TrimmedNonEmptyString),
  sourceDocumentId: Schema.NullOr(TrimmedNonEmptyString),
});
export type QaTraceabilityNode = typeof QaTraceabilityNode.Type;

export const QaAuthoredFlowLegRole = Schema.Literals(["origin", "intermediate", "terminal"]);
export type QaAuthoredFlowLegRole = typeof QaAuthoredFlowLegRole.Type;

export const QaAuthoredFlowLeg = Schema.Struct({
  position: NonNegativeInt,
  role: QaAuthoredFlowLegRole,
  mention: TrimmedNonEmptyString,
  componentExternalId: Schema.NullOr(TrimmedNonEmptyString),
  componentName: Schema.NullOr(TrimmedNonEmptyString),
});
export type QaAuthoredFlowLeg = typeof QaAuthoredFlowLeg.Type;

export const QaAuthoredFlowReviewStatus = Schema.Literals([
  "pending",
  "reviewed",
  "manual_override",
]);
export type QaAuthoredFlowReviewStatus = typeof QaAuthoredFlowReviewStatus.Type;

/**
 * A read-only business flow authored in the HLD system-flow table. This is
 * persisted separately from its graph projection so business context is not
 * lost when the graph is rebuilt.
 */
export const QaAuthoredFlow = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  externalId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  actor: Schema.String,
  trigger: Schema.String,
  narrative: Schema.String,
  outcome: Schema.String,
  legs: Schema.Array(QaAuthoredFlowLeg),
  componentExternalIds: Schema.Array(TrimmedNonEmptyString),
  componentMentions: Schema.Array(TrimmedNonEmptyString),
  requirementExternalIds: Schema.Array(TrimmedNonEmptyString),
  sourceDocumentId: Schema.NullOr(TrimmedNonEmptyString),
  reviewStatus: QaAuthoredFlowReviewStatus,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type QaAuthoredFlow = typeof QaAuthoredFlow.Type;

export const QaTraceabilityEdgeKind = Schema.Literals([
  "contains",
  "extracts",
  "authors",
  "parent_of",
  "realizes",
  "touches",
  "writes_to",
  "reads_from",
  "represents",
  "bypasses",
  "depends_on",
  "trace_to_test",
]);
export type QaTraceabilityEdgeKind = typeof QaTraceabilityEdgeKind.Type;

export const QaTraceabilityEdge = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  fromNodeId: TrimmedNonEmptyString,
  toNodeId: TrimmedNonEmptyString,
  kind: QaTraceabilityEdgeKind,
  provenance: Schema.Literals(["deterministic", "agent"]),
  reviewStatus: QaReviewStatus,
  citation: Schema.NullOr(QaSourceCitation),
});
export type QaTraceabilityEdge = typeof QaTraceabilityEdge.Type;

export const QaApprovalGate = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  kind: Schema.Literals(["requirements_review", "release_readiness"]),
  title: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  status: QaReviewStatus,
  decisionNote: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type QaApprovalGate = typeof QaApprovalGate.Type;

export const QaStrategyGenerationStatus = Schema.Literals([
  "queued",
  "generating",
  "complete",
  "failed",
  "stale",
]);
export type QaStrategyGenerationStatus = typeof QaStrategyGenerationStatus.Type;

export const QaStrategyReviewStatus = Schema.Literals([
  "draft",
  "pending_review",
  "approved",
  "rejected",
]);
export type QaStrategyReviewStatus = typeof QaStrategyReviewStatus.Type;

export const QaStrategySection = Schema.Struct({
  id: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  order: NonNegativeInt,
  content: Schema.String,
  sourceRequirementIds: Schema.Array(TrimmedNonEmptyString),
  updatedAt: IsoDateTime,
});
export type QaStrategySection = typeof QaStrategySection.Type;

export const QaStrategyCommentReply = Schema.Struct({
  id: TrimmedNonEmptyString,
  body: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  author: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
});
export type QaStrategyCommentReply = typeof QaStrategyCommentReply.Type;

export const QaStrategyComment = Schema.Struct({
  id: TrimmedNonEmptyString,
  sectionId: TrimmedNonEmptyString,
  quote: Schema.NullOr(Schema.String),
  body: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  status: Schema.Literals(["open", "resolved"]),
  author: TrimmedNonEmptyString,
  replies: Schema.Array(QaStrategyCommentReply),
  createdAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
  resolvedBy: Schema.NullOr(TrimmedNonEmptyString),
});
export type QaStrategyComment = typeof QaStrategyComment.Type;

export const QaStrategyCoverage = Schema.Struct({
  totalRequirements: NonNegativeInt,
  coveredRequirements: NonNegativeInt,
  percent: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  uncoveredRequirementIds: Schema.Array(TrimmedNonEmptyString),
});
export type QaStrategyCoverage = typeof QaStrategyCoverage.Type;

export const QaStrategyDocument = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  revision: PositiveInt,
  title: TrimmedNonEmptyString,
  generationStatus: QaStrategyGenerationStatus,
  reviewStatus: QaStrategyReviewStatus,
  coverage: QaStrategyCoverage,
  sections: Schema.Array(QaStrategySection),
  comments: Schema.Array(QaStrategyComment),
  rejectionNote: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  submittedAt: Schema.NullOr(IsoDateTime),
  submittedBy: Schema.NullOr(TrimmedNonEmptyString),
  approvedAt: Schema.NullOr(IsoDateTime),
  approvedBy: Schema.NullOr(TrimmedNonEmptyString),
  rejectedAt: Schema.NullOr(IsoDateTime),
  rejectedBy: Schema.NullOr(TrimmedNonEmptyString),
});
export type QaStrategyDocument = typeof QaStrategyDocument.Type;

export const QaPriority = Schema.Literals(["critical", "high", "medium", "low"]);
export type QaPriority = typeof QaPriority.Type;

export const QaRiskLevel = Schema.Literals(["critical", "high", "medium", "low"]);
export type QaRiskLevel = typeof QaRiskLevel.Type;

export const QaPlanGenerationStatus = Schema.Literals([
  "queued",
  "generating",
  "complete",
  "failed",
  "stale",
]);
export type QaPlanGenerationStatus = typeof QaPlanGenerationStatus.Type;

export const QaScenarioType = Schema.Literals([
  "positive",
  "negative",
  "boundary",
  "exception",
  "integration",
]);
export type QaScenarioType = typeof QaScenarioType.Type;

export const QaScenario = Schema.Struct({
  id: TrimmedNonEmptyString,
  externalId: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  type: QaScenarioType,
  priority: QaPriority,
  risk: QaRiskLevel,
  requirementIds: Schema.Array(TrimmedNonEmptyString),
  preconditions: Schema.Array(TrimmedNonEmptyString),
  expectedOutcome: TrimmedNonEmptyString,
  status: QaReviewStatus,
  decisionNote: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  submittedAt: Schema.NullOr(IsoDateTime),
  submittedBy: Schema.NullOr(TrimmedNonEmptyString),
  approvedAt: Schema.NullOr(IsoDateTime),
  approvedBy: Schema.NullOr(TrimmedNonEmptyString),
  rejectedAt: Schema.NullOr(IsoDateTime),
  rejectedBy: Schema.NullOr(TrimmedNonEmptyString),
});
export type QaScenario = typeof QaScenario.Type;

export const QaScenarioPlan = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  revision: PositiveInt,
  generationStatus: QaPlanGenerationStatus,
  reviewStatus: QaStrategyReviewStatus,
  scenarios: Schema.Array(QaScenario),
  rejectionNote: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  submittedAt: Schema.NullOr(IsoDateTime),
  submittedBy: Schema.NullOr(TrimmedNonEmptyString),
  approvedAt: Schema.NullOr(IsoDateTime),
  approvedBy: Schema.NullOr(TrimmedNonEmptyString),
  rejectedAt: Schema.NullOr(IsoDateTime),
  rejectedBy: Schema.NullOr(TrimmedNonEmptyString),
});
export type QaScenarioPlan = typeof QaScenarioPlan.Type;

export const QaTestCaseStep = Schema.Struct({
  order: PositiveInt,
  action: TrimmedNonEmptyString,
  testData: Schema.String,
  expectedResult: TrimmedNonEmptyString,
});
export type QaTestCaseStep = typeof QaTestCaseStep.Type;

export const QaTestCase = Schema.Struct({
  id: TrimmedNonEmptyString,
  externalId: TrimmedNonEmptyString,
  scenarioIds: Schema.Array(TrimmedNonEmptyString),
  requirementIds: Schema.Array(TrimmedNonEmptyString),
  title: TrimmedNonEmptyString,
  preconditions: Schema.Array(TrimmedNonEmptyString),
  steps: Schema.Array(QaTestCaseStep).check(Schema.isMinLength(1)),
  priority: QaPriority,
  automationCandidate: Schema.Boolean,
  status: QaReviewStatus,
  decisionNote: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  submittedAt: Schema.NullOr(IsoDateTime),
  submittedBy: Schema.NullOr(TrimmedNonEmptyString),
  approvedAt: Schema.NullOr(IsoDateTime),
  approvedBy: Schema.NullOr(TrimmedNonEmptyString),
  rejectedAt: Schema.NullOr(IsoDateTime),
  rejectedBy: Schema.NullOr(TrimmedNonEmptyString),
});
export type QaTestCase = typeof QaTestCase.Type;

export const QaTestCasePlan = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  revision: PositiveInt,
  generationStatus: QaPlanGenerationStatus,
  reviewStatus: QaStrategyReviewStatus,
  testCases: Schema.Array(QaTestCase),
  rejectionNote: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  submittedAt: Schema.NullOr(IsoDateTime),
  submittedBy: Schema.NullOr(TrimmedNonEmptyString),
  approvedAt: Schema.NullOr(IsoDateTime),
  approvedBy: Schema.NullOr(TrimmedNonEmptyString),
  rejectedAt: Schema.NullOr(IsoDateTime),
  rejectedBy: Schema.NullOr(TrimmedNonEmptyString),
});
export type QaTestCasePlan = typeof QaTestCasePlan.Type;

export const QaScriptStatus = Schema.Literals(["draft", "ready", "executed", "failed"]);
export type QaScriptStatus = typeof QaScriptStatus.Type;

export const QaScriptExecutionStatus = Schema.Literals([
  "not_run",
  "queued",
  "running",
  "passed",
  "failed",
]);
export type QaScriptExecutionStatus = typeof QaScriptExecutionStatus.Type;

export const QaScriptEvidenceKind = Schema.Literals(["log", "report", "screenshot", "other"]);
export type QaScriptEvidenceKind = typeof QaScriptEvidenceKind.Type;

export const QaScriptEvidence = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: QaScriptEvidenceKind,
  summary: TrimmedNonEmptyString,
  artifactPath: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
});
export type QaScriptEvidence = typeof QaScriptEvidence.Type;

export const QaScript = Schema.Struct({
  id: TrimmedNonEmptyString,
  externalId: TrimmedNonEmptyString,
  testCaseIds: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1)),
  requirementIds: Schema.Array(TrimmedNonEmptyString),
  title: TrimmedNonEmptyString,
  framework: TrimmedNonEmptyString,
  language: TrimmedNonEmptyString,
  fileName: TrimmedNonEmptyString,
  content: Schema.String,
  status: QaScriptStatus,
  executionStatus: QaScriptExecutionStatus,
  lastRunAt: Schema.NullOr(IsoDateTime),
  evidence: Schema.Array(QaScriptEvidence),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type QaScript = typeof QaScript.Type;

export const QaScriptPlan = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  revision: PositiveInt,
  generationStatus: QaPlanGenerationStatus,
  reviewStatus: QaStrategyReviewStatus,
  scripts: Schema.Array(QaScript),
  rejectionNote: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  submittedAt: Schema.NullOr(IsoDateTime),
  submittedBy: Schema.NullOr(TrimmedNonEmptyString),
  approvedAt: Schema.NullOr(IsoDateTime),
  approvedBy: Schema.NullOr(TrimmedNonEmptyString),
  rejectedAt: Schema.NullOr(IsoDateTime),
  rejectedBy: Schema.NullOr(TrimmedNonEmptyString),
});
export type QaScriptPlan = typeof QaScriptPlan.Type;

export const QaReadinessCoverageMetric = Schema.Struct({
  covered: NonNegativeInt,
  total: NonNegativeInt,
  percent: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
});
export type QaReadinessCoverageMetric = typeof QaReadinessCoverageMetric.Type;

export const QaReadinessBlocker = Schema.Struct({
  id: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  detail: TrimmedNonEmptyString,
  stage: QaStageId,
});
export type QaReadinessBlocker = typeof QaReadinessBlocker.Type;

export const QaReadinessGateCheck = Schema.Struct({
  id: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  status: Schema.Literals(["passed", "failed", "pending"]),
  detail: TrimmedNonEmptyString,
});
export type QaReadinessGateCheck = typeof QaReadinessGateCheck.Type;

export const QaReadinessDashboard = Schema.Struct({
  threadId: ThreadId,
  revision: PositiveInt,
  overallStatus: Schema.Literals(["ready", "not_ready"]),
  reviewStatus: QaReviewStatus,
  requirementCoverage: QaReadinessCoverageMetric,
  scenarioCoverage: QaReadinessCoverageMetric,
  testCaseCoverage: QaReadinessCoverageMetric,
  scriptCoverage: QaReadinessCoverageMetric,
  executionPassed: NonNegativeInt,
  executionFailed: NonNegativeInt,
  openBlockers: Schema.Array(QaReadinessBlocker),
  gateChecks: Schema.Array(QaReadinessGateCheck),
  computedAt: IsoDateTime,
  approvedAt: Schema.NullOr(IsoDateTime),
  approvedBy: Schema.NullOr(TrimmedNonEmptyString),
  rejectedAt: Schema.NullOr(IsoDateTime),
  rejectedBy: Schema.NullOr(TrimmedNonEmptyString),
  decisionNote: Schema.NullOr(Schema.String),
});
export type QaReadinessDashboard = typeof QaReadinessDashboard.Type;

export const QaReleaseSnapshot = Schema.Struct({
  mode: EnterpriseMode,
  projectId: ProjectId,
  releaseId: QaReleaseId,
  /** @deprecated Use `releaseId`; this is the legacy QA database key alias. */
  threadId: ThreadId,
  revision: PositiveInt,
  releaseNumber: PositiveInt,
  title: TrimmedNonEmptyString,
  status: Schema.Literals(["active", "closed"]),
  phase: QaReleasePhase,
  activeStage: QaStageId,
  stages: Schema.Array(QaStageState),
  ingestionStatus: QaIngestionStatus,
  ingestionProgress: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  documents: Schema.Array(QaDocument),
  requirements: Schema.Array(QaRequirement),
  authoredFlows: Schema.Array(QaAuthoredFlow),
  traceabilityNodes: Schema.Array(QaTraceabilityNode),
  traceabilityEdges: Schema.Array(QaTraceabilityEdge),
  strategy: Schema.NullOr(QaStrategyDocument),
  scenarioPlan: Schema.NullOr(QaScenarioPlan),
  testCasePlan: Schema.NullOr(QaTestCasePlan),
  scriptPlan: Schema.NullOr(QaScriptPlan),
  readinessDashboard: Schema.NullOr(QaReadinessDashboard),
  approvalGates: Schema.Array(QaApprovalGate),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type QaReleaseSnapshot = typeof QaReleaseSnapshot.Type;

/**
 * Full-snapshot stream events keep reconnect and out-of-order handling simple:
 * clients accept only events whose revision is newer than their current
 * snapshot and never attempt to merge server state locally.
 */
const QaReleaseSnapshotStreamEvent = Schema.Struct({
  type: Schema.Literal("snapshot"),
  releaseId: QaReleaseId,
  /** @deprecated Use `releaseId`; this is the legacy QA database key alias. */
  threadId: ThreadId,
  revision: PositiveInt,
  snapshot: QaReleaseSnapshot,
  at: IsoDateTime,
});

const QaReleaseUpdatedStreamEvent = Schema.Struct({
  type: Schema.Literal("updated"),
  releaseId: QaReleaseId,
  /** @deprecated Use `releaseId`; this is the legacy QA database key alias. */
  threadId: ThreadId,
  revision: PositiveInt,
  reason: Schema.Literals([
    "stage_started",
    "progress",
    "proposal_received",
    "review_recorded",
    "stage_advanced",
    "stage_blocked",
  ]),
  snapshot: QaReleaseSnapshot,
  at: IsoDateTime,
});

export const QaReleaseStreamEvent = Schema.Union([
  QaReleaseSnapshotStreamEvent,
  QaReleaseUpdatedStreamEvent,
]);
export type QaReleaseStreamEvent = typeof QaReleaseStreamEvent.Type;

export const QaGetSnapshotInput = Schema.Struct({ threadId: ThreadId });
export type QaGetSnapshotInput = typeof QaGetSnapshotInput.Type;

export const QaListAssignedReleasesInput = Schema.Struct({
  completedSince: Schema.optional(IsoDateTime),
});
export type QaListAssignedReleasesInput = typeof QaListAssignedReleasesInput.Type;

export const QaGetReleaseAccessInput = Schema.Struct({ threadId: ThreadId });
export type QaGetReleaseAccessInput = typeof QaGetReleaseAccessInput.Type;

export const QaListReviewThreadsInput = Schema.Struct({
  threadId: ThreadId,
  artifactKind: Schema.optional(QaReviewArtifactKind),
  artifactId: Schema.optional(TrimmedNonEmptyString),
});
export type QaListReviewThreadsInput = typeof QaListReviewThreadsInput.Type;

export const QaAddReviewCommentInput = Schema.Struct({
  threadId: ThreadId,
  artifactKind: QaReviewArtifactKind,
  artifactId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  anchor: QaReviewAnchor,
  severity: QaReviewSeverity,
  body: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
}).check(
  Schema.makeFilter(
    (input) =>
      (input.artifactKind === "strategy" && input.anchor.type === "strategy_section") ||
      (input.artifactKind === "scenario_plan" && input.anchor.type === "scenario") ||
      "Review comment anchor must match its artifact kind.",
  ),
);
export type QaAddReviewCommentInput = typeof QaAddReviewCommentInput.Type;

export const QaReplyReviewCommentInput = Schema.Struct({
  threadId: ThreadId,
  reviewThreadId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  body: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  correctsEntryId: Schema.optional(TrimmedNonEmptyString),
});
export type QaReplyReviewCommentInput = typeof QaReplyReviewCommentInput.Type;

export const QaRunReviewCommentAiCheckInput = Schema.Struct({
  threadId: ThreadId,
  reviewThreadId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
});
export type QaRunReviewCommentAiCheckInput = typeof QaRunReviewCommentAiCheckInput.Type;

export const QaResolveReviewCommentInput = Schema.Struct({
  threadId: ThreadId,
  reviewThreadId: TrimmedNonEmptyString,
  aiRunId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  overrideReason: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(4_000))),
});
export type QaResolveReviewCommentInput = typeof QaResolveReviewCommentInput.Type;

export const QaMarkReviewReadInput = Schema.Struct({
  threadId: ThreadId,
  reviewThreadId: TrimmedNonEmptyString,
  throughEntryId: TrimmedNonEmptyString,
});
export type QaMarkReviewReadInput = typeof QaMarkReviewReadInput.Type;

export const QaReviewMutationResult = Schema.Struct({
  reviewThread: QaReviewThread,
  snapshot: QaReleaseSnapshot,
});
export type QaReviewMutationResult = typeof QaReviewMutationResult.Type;

/** Creates a shared QA project and its first release in the QA database. */
export const QaCreateProjectInput = Schema.Struct({
  projectId: ProjectId,
  releaseId: QaReleaseId,
  projectTitle: TrimmedNonEmptyString.check(Schema.isMaxLength(160)),
  releaseTitle: TrimmedNonEmptyString.check(Schema.isMaxLength(160)),
});
export type QaCreateProjectInput = typeof QaCreateProjectInput.Type;

/**
 * Lazily provisions the caller's local agent runtime for a shared release.
 * Runtime identifiers are always server-owned.
 */
export const QaEnsureReleaseConversationInput = Schema.Struct({
  releaseId: QaReleaseId,
});
export type QaEnsureReleaseConversationInput = typeof QaEnsureReleaseConversationInput.Type;

export const QaReleaseConversation = Schema.Struct({
  releaseId: QaReleaseId,
  runtimeProjectId: ProjectId,
  conversationThreadId: ThreadId,
});
export type QaReleaseConversation = typeof QaReleaseConversation.Type;

/** Starts the active maker-owned planning stage in the local agent runtime. */
export const QaStartStageGenerationInput = Schema.Struct({
  releaseId: QaReleaseId,
  expectedRevision: PositiveInt,
});
export type QaStartStageGenerationInput = typeof QaStartStageGenerationInput.Type;

export const QaStageGenerationReceipt = Schema.Struct({
  releaseId: QaReleaseId,
  conversationThreadId: ThreadId,
  stage: QaStageId,
  revision: PositiveInt,
  acceptedAt: IsoDateTime,
});
export type QaStageGenerationReceipt = typeof QaStageGenerationReceipt.Type;

export const QaInitializeReleaseInput = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  releaseTitle: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(160))),
});
export type QaInitializeReleaseInput = typeof QaInitializeReleaseInput.Type;

export const QaUploadDocumentInput = Schema.Struct({
  threadId: ThreadId,
  fileName: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  mediaType: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  bytes: Schema.Uint8Array,
});
export type QaUploadDocumentInput = typeof QaUploadDocumentInput.Type;

export const QaStartIngestionInput = Schema.Struct({ threadId: ThreadId });
export type QaStartIngestionInput = typeof QaStartIngestionInput.Type;

export const QaReviewInput = Schema.Struct({
  threadId: ThreadId,
  targetType: Schema.Literals(["requirement", "gate"]),
  targetId: TrimmedNonEmptyString,
  decision: Schema.Literals(["approved", "rejected"]),
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
});
export type QaReviewInput = typeof QaReviewInput.Type;

const QaRequirementPatch = Schema.Struct({
  externalId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(160))),
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(500))),
  description: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(20_000))),
  parentRequirementIds: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
}).check(
  Schema.makeFilter(
    (patch) =>
      patch.externalId !== undefined ||
      patch.title !== undefined ||
      patch.description !== undefined ||
      patch.parentRequirementIds !== undefined ||
      "Requirement patch must include at least one field.",
  ),
);

export const QaUpdateRequirementInput = Schema.Struct({
  threadId: ThreadId,
  requirementId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  patch: QaRequirementPatch,
});
export type QaUpdateRequirementInput = typeof QaUpdateRequirementInput.Type;

export const QaGetStrategyInput = Schema.Struct({ threadId: ThreadId });
export type QaGetStrategyInput = typeof QaGetStrategyInput.Type;

export const QaGenerateStrategyInput = Schema.Struct({
  threadId: ThreadId,
  expectedRevision: PositiveInt,
});
export type QaGenerateStrategyInput = typeof QaGenerateStrategyInput.Type;

const QaStrategySectionPatch = Schema.Struct({
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(500))),
  content: Schema.optional(Schema.String.check(Schema.isMaxLength(200_000))),
  sourceRequirementIds: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
}).check(
  Schema.makeFilter(
    (patch) =>
      patch.title !== undefined ||
      patch.content !== undefined ||
      patch.sourceRequirementIds !== undefined ||
      "Strategy section patch must include at least one field.",
  ),
);

export const QaUpdateStrategySectionInput = Schema.Struct({
  threadId: ThreadId,
  strategyId: TrimmedNonEmptyString,
  sectionId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  patch: QaStrategySectionPatch,
});
export type QaUpdateStrategySectionInput = typeof QaUpdateStrategySectionInput.Type;

export const QaAddStrategyCommentInput = Schema.Struct({
  threadId: ThreadId,
  strategyId: TrimmedNonEmptyString,
  sectionId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  quote: Schema.optional(Schema.String.check(Schema.isMaxLength(10_000))),
  body: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
});
export type QaAddStrategyCommentInput = typeof QaAddStrategyCommentInput.Type;

export const QaReplyStrategyCommentInput = Schema.Struct({
  threadId: ThreadId,
  strategyId: TrimmedNonEmptyString,
  commentId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  body: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
});
export type QaReplyStrategyCommentInput = typeof QaReplyStrategyCommentInput.Type;

export const QaResolveStrategyCommentInput = Schema.Struct({
  threadId: ThreadId,
  strategyId: TrimmedNonEmptyString,
  commentId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
});
export type QaResolveStrategyCommentInput = typeof QaResolveStrategyCommentInput.Type;

export const QaSubmitStrategyInput = Schema.Struct({
  threadId: ThreadId,
  strategyId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
});
export type QaSubmitStrategyInput = typeof QaSubmitStrategyInput.Type;

export const QaReviewStrategyInput = Schema.Struct({
  threadId: ThreadId,
  strategyId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  decision: QaArtifactReviewDecision,
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
  blockingCommentIds: Schema.optional(
    Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1)),
  ),
  summary: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
}).check(
  Schema.makeFilter(
    (input) =>
      input.decision !== "changes_requested" ||
      input.blockingCommentIds !== undefined ||
      "Changes requested decisions must reference at least one blocking comment.",
  ),
);
export type QaReviewStrategyInput = typeof QaReviewStrategyInput.Type;

export const QaStrategyMutationResult = Schema.Struct({
  strategy: QaStrategyDocument,
  snapshot: QaReleaseSnapshot,
});
export type QaStrategyMutationResult = typeof QaStrategyMutationResult.Type;

export const QaStrategyApprovalResult = Schema.Struct({
  decision: QaArtifactReviewDecision,
  reviewedAt: IsoDateTime,
  strategy: QaStrategyDocument,
  snapshot: QaReleaseSnapshot,
});
export type QaStrategyApprovalResult = typeof QaStrategyApprovalResult.Type;

export const QaGetScenarioPlanInput = Schema.Struct({ threadId: ThreadId });
export type QaGetScenarioPlanInput = typeof QaGetScenarioPlanInput.Type;

const QaScenarioPatch = Schema.Struct({
  externalId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(160))),
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(500))),
  type: Schema.optional(QaScenarioType),
  priority: Schema.optional(QaPriority),
  risk: Schema.optional(QaRiskLevel),
  requirementIds: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  preconditions: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  expectedOutcome: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(20_000))),
}).check(
  Schema.makeFilter(
    (patch) =>
      patch.externalId !== undefined ||
      patch.title !== undefined ||
      patch.type !== undefined ||
      patch.priority !== undefined ||
      patch.risk !== undefined ||
      patch.requirementIds !== undefined ||
      patch.preconditions !== undefined ||
      patch.expectedOutcome !== undefined ||
      "Scenario patch must include at least one field.",
  ),
);

export const QaUpdateScenarioInput = Schema.Struct({
  threadId: ThreadId,
  planId: TrimmedNonEmptyString,
  scenarioId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  patch: QaScenarioPatch,
});
export type QaUpdateScenarioInput = typeof QaUpdateScenarioInput.Type;

export const QaSubmitScenarioPlanInput = Schema.Struct({
  threadId: ThreadId,
  planId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
});
export type QaSubmitScenarioPlanInput = typeof QaSubmitScenarioPlanInput.Type;

export const QaReviewScenarioPlanInput = Schema.Struct({
  threadId: ThreadId,
  planId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  decision: QaArtifactReviewDecision,
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
  blockingCommentIds: Schema.optional(
    Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1)),
  ),
  summary: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
}).check(
  Schema.makeFilter(
    (input) =>
      input.decision !== "changes_requested" ||
      input.blockingCommentIds !== undefined ||
      "Changes requested decisions must reference at least one blocking comment.",
  ),
);
export type QaReviewScenarioPlanInput = typeof QaReviewScenarioPlanInput.Type;

export const QaScenarioPlanMutationResult = Schema.Struct({
  scenarioPlan: QaScenarioPlan,
  snapshot: QaReleaseSnapshot,
});
export type QaScenarioPlanMutationResult = typeof QaScenarioPlanMutationResult.Type;

export const QaScenarioPlanApprovalResult = Schema.Struct({
  decision: QaArtifactReviewDecision,
  reviewedAt: IsoDateTime,
  scenarioPlan: QaScenarioPlan,
  snapshot: QaReleaseSnapshot,
});
export type QaScenarioPlanApprovalResult = typeof QaScenarioPlanApprovalResult.Type;

export const QaGetTestCasePlanInput = Schema.Struct({ threadId: ThreadId });
export type QaGetTestCasePlanInput = typeof QaGetTestCasePlanInput.Type;

const QaTestCasePatch = Schema.Struct({
  externalId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(160))),
  scenarioIds: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  requirementIds: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(500))),
  preconditions: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  steps: Schema.optional(
    Schema.Array(QaTestCaseStep).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  ),
  priority: Schema.optional(QaPriority),
  automationCandidate: Schema.optional(Schema.Boolean),
}).check(
  Schema.makeFilter(
    (patch) =>
      patch.externalId !== undefined ||
      patch.scenarioIds !== undefined ||
      patch.requirementIds !== undefined ||
      patch.title !== undefined ||
      patch.preconditions !== undefined ||
      patch.steps !== undefined ||
      patch.priority !== undefined ||
      patch.automationCandidate !== undefined ||
      "Test case patch must include at least one field.",
  ),
);

export const QaUpdateTestCaseInput = Schema.Struct({
  threadId: ThreadId,
  planId: TrimmedNonEmptyString,
  testCaseId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  patch: QaTestCasePatch,
});
export type QaUpdateTestCaseInput = typeof QaUpdateTestCaseInput.Type;

export const QaSubmitTestCasePlanInput = Schema.Struct({
  threadId: ThreadId,
  planId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
});
export type QaSubmitTestCasePlanInput = typeof QaSubmitTestCasePlanInput.Type;

export const QaReviewTestCasePlanInput = Schema.Struct({
  threadId: ThreadId,
  planId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  decision: Schema.Literals(["approved", "rejected"]),
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
});
export type QaReviewTestCasePlanInput = typeof QaReviewTestCasePlanInput.Type;

export const QaTestCasePlanMutationResult = Schema.Struct({
  testCasePlan: QaTestCasePlan,
  snapshot: QaReleaseSnapshot,
});
export type QaTestCasePlanMutationResult = typeof QaTestCasePlanMutationResult.Type;

export const QaTestCasePlanApprovalResult = Schema.Struct({
  decision: Schema.Literals(["approved", "rejected"]),
  reviewedAt: IsoDateTime,
  testCasePlan: QaTestCasePlan,
  snapshot: QaReleaseSnapshot,
});
export type QaTestCasePlanApprovalResult = typeof QaTestCasePlanApprovalResult.Type;

export const QaGetScriptPlanInput = Schema.Struct({ threadId: ThreadId });
export type QaGetScriptPlanInput = typeof QaGetScriptPlanInput.Type;

const QaScriptPatch = Schema.Struct({
  externalId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(160))),
  testCaseIds: Schema.optional(Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1))),
  requirementIds: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(500))),
  framework: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(160))),
  language: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(160))),
  fileName: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(255))),
  content: Schema.optional(Schema.String.check(Schema.isMaxLength(1_000_000))),
}).check(
  Schema.makeFilter(
    (patch) =>
      patch.externalId !== undefined ||
      patch.testCaseIds !== undefined ||
      patch.requirementIds !== undefined ||
      patch.title !== undefined ||
      patch.framework !== undefined ||
      patch.language !== undefined ||
      patch.fileName !== undefined ||
      patch.content !== undefined ||
      "Script patch must include at least one field.",
  ),
);

export const QaUpdateScriptInput = Schema.Struct({
  threadId: ThreadId,
  planId: TrimmedNonEmptyString,
  scriptId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  patch: QaScriptPatch,
});
export type QaUpdateScriptInput = typeof QaUpdateScriptInput.Type;

export const QaSubmitScriptPlanInput = Schema.Struct({
  threadId: ThreadId,
  planId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
});
export type QaSubmitScriptPlanInput = typeof QaSubmitScriptPlanInput.Type;

export const QaReviewScriptPlanInput = Schema.Struct({
  threadId: ThreadId,
  planId: TrimmedNonEmptyString,
  expectedRevision: PositiveInt,
  decision: Schema.Literals(["approved", "rejected"]),
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
});
export type QaReviewScriptPlanInput = typeof QaReviewScriptPlanInput.Type;

export const QaScriptPlanMutationResult = Schema.Struct({
  scriptPlan: QaScriptPlan,
  snapshot: QaReleaseSnapshot,
});
export type QaScriptPlanMutationResult = typeof QaScriptPlanMutationResult.Type;

export const QaScriptPlanApprovalResult = Schema.Struct({
  decision: Schema.Literals(["approved", "rejected"]),
  reviewedAt: IsoDateTime,
  scriptPlan: QaScriptPlan,
  snapshot: QaReleaseSnapshot,
});
export type QaScriptPlanApprovalResult = typeof QaScriptPlanApprovalResult.Type;

export const QaGetReadinessInput = Schema.Struct({ threadId: ThreadId });
export type QaGetReadinessInput = typeof QaGetReadinessInput.Type;

export const QaReviewReadinessInput = Schema.Struct({
  threadId: ThreadId,
  expectedRevision: PositiveInt,
  decision: Schema.Literals(["approved", "rejected"]),
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
});
export type QaReviewReadinessInput = typeof QaReviewReadinessInput.Type;

export const QaReadinessReviewResult = Schema.Struct({
  decision: Schema.Literals(["approved", "rejected"]),
  reviewedAt: IsoDateTime,
  readinessDashboard: QaReadinessDashboard,
  snapshot: QaReleaseSnapshot,
});
export type QaReadinessReviewResult = typeof QaReadinessReviewResult.Type;

/**
 * Authenticated app-server identity for a single agent-generated QA stage.
 * The conversation is fixed when the stage job is claimed; the provider
 * session is bound on its first mutation so replaced sessions cannot write.
 */
export const QaAgentGenerationClaimOwner = Schema.Struct({
  environmentId: EnvironmentId,
  conversationThreadId: ThreadId,
});
export type QaAgentGenerationClaimOwner = typeof QaAgentGenerationClaimOwner.Type;

export const QaAgentGenerationOwner = Schema.Struct({
  ...QaAgentGenerationClaimOwner.fields,
  providerSessionId: TrimmedNonEmptyString,
});
export type QaAgentGenerationOwner = typeof QaAgentGenerationOwner.Type;

/** Proposal-only inputs available to the thread-scoped app-server QA toolkit. */
export const QaAgentStageProgressInput = Schema.Struct({
  stage: QaStageId,
  progress: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  message: Schema.optional(Schema.String.check(Schema.isMaxLength(2_000))),
});
export type QaAgentStageProgressInput = typeof QaAgentStageProgressInput.Type;

export const QaAgentRequirementProposal = Schema.Struct({
  externalId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(160))),
  requirementType: QaRequirementType,
  parentExternalIds: Schema.Array(TrimmedNonEmptyString),
  citation: Schema.optional(QaSourceCitation),
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(500)),
  description: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  sourceDocumentId: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type QaAgentRequirementProposal = typeof QaAgentRequirementProposal.Type;

export const QaAgentSubmitRequirementsInput = Schema.Struct({
  requirements: Schema.Array(QaAgentRequirementProposal).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(500),
  ),
});
export type QaAgentSubmitRequirementsInput = typeof QaAgentSubmitRequirementsInput.Type;

export const QaAgentStrategySectionProposal = Schema.Struct({
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(500)),
  content: TrimmedNonEmptyString.check(Schema.isMaxLength(200_000)),
  sourceRequirementIds: Schema.Array(TrimmedNonEmptyString),
});
export type QaAgentStrategySectionProposal = typeof QaAgentStrategySectionProposal.Type;

/** Draft-only strategy proposal. Human review state is owned by explicit UI RPCs. */
export const QaAgentSubmitStrategyInput = Schema.Struct({
  sections: Schema.Array(QaAgentStrategySectionProposal).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(50),
  ),
});
export type QaAgentSubmitStrategyInput = typeof QaAgentSubmitStrategyInput.Type;

export const QaAgentScenarioProposal = Schema.Struct({
  externalId: TrimmedNonEmptyString.check(Schema.isMaxLength(160)),
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(500)),
  type: QaScenarioType,
  priority: QaPriority,
  risk: QaRiskLevel,
  requirementIds: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1)),
  preconditions: Schema.Array(TrimmedNonEmptyString),
  expectedOutcome: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
});
export type QaAgentScenarioProposal = typeof QaAgentScenarioProposal.Type;

export const QaAgentSubmitScenariosInput = Schema.Struct({
  scenarios: Schema.Array(QaAgentScenarioProposal).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(500),
  ),
});
export type QaAgentSubmitScenariosInput = typeof QaAgentSubmitScenariosInput.Type;

export const QaAgentTestCaseProposal = Schema.Struct({
  externalId: TrimmedNonEmptyString.check(Schema.isMaxLength(160)),
  scenarioIds: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1)),
  requirementIds: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1)),
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(500)),
  preconditions: Schema.Array(TrimmedNonEmptyString),
  steps: Schema.Array(QaTestCaseStep).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  priority: QaPriority,
  automationCandidate: Schema.Boolean,
});
export type QaAgentTestCaseProposal = typeof QaAgentTestCaseProposal.Type;

export const QaAgentSubmitTestCasesInput = Schema.Struct({
  testCases: Schema.Array(QaAgentTestCaseProposal).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(500),
  ),
});
export type QaAgentSubmitTestCasesInput = typeof QaAgentSubmitTestCasesInput.Type;

export const QaAgentScriptProposal = Schema.Struct({
  externalId: TrimmedNonEmptyString.check(Schema.isMaxLength(160)),
  testCaseIds: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1)),
  requirementIds: Schema.Array(TrimmedNonEmptyString),
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(500)),
  framework: TrimmedNonEmptyString.check(Schema.isMaxLength(160)),
  language: TrimmedNonEmptyString.check(Schema.isMaxLength(160)),
  fileName: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  content: Schema.String.check(Schema.isMaxLength(1_000_000)),
});
export type QaAgentScriptProposal = typeof QaAgentScriptProposal.Type;

export const QaAgentSubmitScriptsInput = Schema.Struct({
  scripts: Schema.Array(QaAgentScriptProposal).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(500),
  ),
});
export type QaAgentSubmitScriptsInput = typeof QaAgentSubmitScriptsInput.Type;

export class QaOperationError extends Schema.TaggedErrorClass<QaOperationError>()(
  "QaOperationError",
  {
    code: Schema.Literals([
      "release_not_found",
      "release_conflict",
      "document_required",
      "document_empty",
      "document_too_large",
      "document_type_unsupported",
      "document_name_invalid",
      "review_target_not_found",
      "review_thread_not_found",
      "review_anchor_not_found",
      "review_ai_run_not_found",
      "review_ai_check_unavailable",
      "invalid_workflow_state",
      "ingestion_failed",
      "persistence_failed",
    ]),
    message: Schema.String,
  },
) {}
