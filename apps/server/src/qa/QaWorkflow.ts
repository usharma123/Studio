import * as NodeCrypto from "node:crypto";

import {
  type QaAddStrategyCommentInput,
  QaAuthoredFlowLeg,
  type QaAgentGenerationClaimOwner,
  type QaAgentGenerationOwner,
  type QaAgentStageProgressInput,
  type QaAgentSubmitStrategyInput,
  type QaAgentSubmitScenariosInput,
  type QaAgentSubmitTestCasesInput,
  type QaAgentSubmitRequirementsInput,
  type QaAgentSubmitScriptsInput,
  type QaGenerateStrategyInput,
  type QaGetSnapshotInput,
  type QaGetScenarioPlanInput,
  type QaGetReadinessInput,
  type QaGetScriptPlanInput,
  type QaGetStrategyInput,
  type QaGetTestCasePlanInput,
  type QaInitializeReleaseInput,
  QaOperationError,
  QaReleaseSnapshot,
  QaReadinessDashboard,
  type QaReadinessReviewResult,
  type QaReviewReadinessInput,
  type QaReviewScenarioPlanInput,
  type QaReviewActor,
  type QaReviewScriptPlanInput,
  type QaReplyStrategyCommentInput,
  type QaResolveStrategyCommentInput,
  type QaReviewStrategyInput,
  type QaReviewTestCasePlanInput,
  QaScenarioPlan,
  type QaScenarioPlanApprovalResult,
  type QaScenarioPlanMutationResult,
  QaScriptPlan,
  type QaScriptPlanApprovalResult,
  type QaScriptPlanMutationResult,
  QaSourceCitation,
  type QaSourceCitation as QaSourceCitationValue,
  type QaStrategyApprovalResult,
  QaStrategyDocument,
  type QaStrategyMutationResult,
  type QaSubmitStrategyInput,
  type QaSubmitScenarioPlanInput,
  type QaSubmitScriptPlanInput,
  type QaSubmitTestCasePlanInput,
  type QaReviewInput,
  type QaStartIngestionInput,
  type QaUpdateRequirementInput,
  type QaUpdateStrategySectionInput,
  type QaUpdateScenarioInput,
  type QaUpdateScriptInput,
  type QaUpdateTestCaseInput,
  QaTestCasePlan,
  type QaTestCasePlanApprovalResult,
  type QaTestCasePlanMutationResult,
  type QaUploadDocumentInput,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { QaDatabase } from "./QaDatabase.ts";
import { QaIngestionGateway } from "./QaIngestionGateway.ts";
import {
  assertQaReviewDecisionAllowed,
  recordQaReviewDecision,
  type QaReviewError,
} from "./QaReviewService.ts";

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const REQUIREMENTS_GATE_KIND = "requirements_review" as const;

export interface QaAgentStageGenerationReleaseResult {
  readonly released: boolean;
  readonly snapshot: QaReleaseSnapshot;
}

type QaWorkflowShape = {
  readonly getSnapshot: (
    input: QaGetSnapshotInput,
  ) => Effect.Effect<QaReleaseSnapshot | null, QaOperationError>;
  readonly initializeRelease: (
    input: QaInitializeReleaseInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly uploadDocument: (
    input: QaUploadDocumentInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly startIngestion: (
    input: QaStartIngestionInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly review: (input: QaReviewInput) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly claimAgentStageGeneration: (
    threadId: QaGetSnapshotInput["threadId"],
    expectedRevision: number,
    jobId: string,
    owner: QaAgentGenerationClaimOwner,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly releaseAgentStageGeneration: (
    threadId: QaGetSnapshotInput["threadId"],
    jobId: string,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly releaseAgentStageGenerationForOwner: (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationClaimOwner,
  ) => Effect.Effect<QaAgentStageGenerationReleaseResult, QaOperationError>;
  readonly recoverStaleAgentStageGenerations: (input: {
    readonly environmentId: QaAgentGenerationClaimOwner["environmentId"];
    readonly updatedBefore: string;
  }) => Effect.Effect<ReadonlyArray<QaReleaseSnapshot>, QaOperationError>;
  readonly reportAgentStageProgress: (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentStageProgressInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly submitAgentRequirements: (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitRequirementsInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly submitAgentStrategy: (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitStrategyInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly updateRequirement: (
    input: QaUpdateRequirementInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly getStrategy: (
    input: QaGetStrategyInput,
  ) => Effect.Effect<QaStrategyDocument | null, QaOperationError>;
  readonly generateStrategy: (
    input: QaGenerateStrategyInput,
  ) => Effect.Effect<QaStrategyMutationResult, QaOperationError>;
  readonly updateStrategySection: (
    input: QaUpdateStrategySectionInput,
  ) => Effect.Effect<QaStrategyMutationResult, QaOperationError>;
  readonly addStrategyComment: (
    input: QaAddStrategyCommentInput,
  ) => Effect.Effect<QaStrategyMutationResult, QaOperationError>;
  readonly replyStrategyComment: (
    input: QaReplyStrategyCommentInput,
  ) => Effect.Effect<QaStrategyMutationResult, QaOperationError>;
  readonly resolveStrategyComment: (
    input: QaResolveStrategyCommentInput,
  ) => Effect.Effect<QaStrategyMutationResult, QaOperationError>;
  readonly submitStrategy: (
    input: QaSubmitStrategyInput,
  ) => Effect.Effect<QaStrategyMutationResult, QaOperationError>;
  readonly reviewStrategy: (
    input: QaReviewStrategyInput,
    actor?: QaReviewActor,
  ) => Effect.Effect<QaStrategyApprovalResult, QaOperationError>;
  readonly getScenarioPlan: (
    input: QaGetScenarioPlanInput,
  ) => Effect.Effect<QaScenarioPlan | null, QaOperationError>;
  readonly updateScenario: (
    input: QaUpdateScenarioInput,
  ) => Effect.Effect<QaScenarioPlanMutationResult, QaOperationError>;
  readonly submitScenarioPlan: (
    input: QaSubmitScenarioPlanInput,
  ) => Effect.Effect<QaScenarioPlanMutationResult, QaOperationError>;
  readonly reviewScenarioPlan: (
    input: QaReviewScenarioPlanInput,
    actor?: QaReviewActor,
  ) => Effect.Effect<QaScenarioPlanApprovalResult, QaOperationError>;
  readonly submitAgentScenarios: (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitScenariosInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly getTestCasePlan: (
    input: QaGetTestCasePlanInput,
  ) => Effect.Effect<QaTestCasePlan | null, QaOperationError>;
  readonly updateTestCase: (
    input: QaUpdateTestCaseInput,
  ) => Effect.Effect<QaTestCasePlanMutationResult, QaOperationError>;
  readonly submitTestCasePlan: (
    input: QaSubmitTestCasePlanInput,
  ) => Effect.Effect<QaTestCasePlanMutationResult, QaOperationError>;
  readonly reviewTestCasePlan: (
    input: QaReviewTestCasePlanInput,
  ) => Effect.Effect<QaTestCasePlanApprovalResult, QaOperationError>;
  readonly submitAgentTestCases: (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitTestCasesInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly getScriptPlan: (
    input: QaGetScriptPlanInput,
  ) => Effect.Effect<QaScriptPlan | null, QaOperationError>;
  readonly updateScript: (
    input: QaUpdateScriptInput,
  ) => Effect.Effect<QaScriptPlanMutationResult, QaOperationError>;
  readonly submitScriptPlan: (
    input: QaSubmitScriptPlanInput,
  ) => Effect.Effect<QaScriptPlanMutationResult, QaOperationError>;
  readonly reviewScriptPlan: (
    input: QaReviewScriptPlanInput,
  ) => Effect.Effect<QaScriptPlanApprovalResult, QaOperationError>;
  readonly submitAgentScripts: (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitScriptsInput,
  ) => Effect.Effect<QaReleaseSnapshot, QaOperationError>;
  readonly getReadiness: (
    input: QaGetReadinessInput,
  ) => Effect.Effect<QaReadinessDashboard | null, QaOperationError>;
  readonly reviewReadiness: (
    input: QaReviewReadinessInput,
  ) => Effect.Effect<QaReadinessReviewResult, QaOperationError>;
};

export class QaWorkflow extends Context.Service<QaWorkflow, QaWorkflowShape>()(
  "t3/qa/QaWorkflow",
) {}

type ReleaseRow = {
  readonly projectId: string;
  readonly threadId: string;
  readonly mode: string;
  readonly releaseNumber: number;
  readonly title: string;
  readonly status: string;
  readonly phase: string;
  readonly ingestionStatus: string;
  readonly ingestionProgress: number;
  readonly activeStage: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type StageRow = {
  readonly stage: string;
  readonly status: string;
  readonly progress: number;
  readonly activeJobId: string | null;
  readonly blockedReason: string | null;
  readonly updatedAt: string;
};

const QA_STAGES = [
  "intake",
  "requirements",
  "strategy",
  "scenarios",
  "test_cases",
  "scripts",
  "readiness",
] as const;

type DocumentRow = {
  readonly id: string;
  readonly threadId: string;
  readonly fileName: string;
  readonly kind: string;
  readonly version: string;
  readonly mediaType: string;
  readonly storagePath: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type StoredDocumentRow = DocumentRow & { readonly contentBlob: Uint8Array };

type RequirementRow = {
  readonly id: string;
  readonly threadId: string;
  readonly sourceDocumentId: string | null;
  readonly externalId: string;
  readonly requirementType: string;
  readonly reviewRequired: number | boolean;
  readonly sourceCitation: string | null;
  readonly sourceDocumentName: string | null;
  readonly confidence: number;
  readonly tagsJson: string;
  readonly extractionMethod: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly decisionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type RequirementLinkRow = {
  readonly parentRequirementId: string;
  readonly childRequirementId: string;
};

type TraceabilityNodeRow = {
  readonly id: string;
  readonly threadId: string;
  readonly kind: string;
  readonly label: string;
  readonly externalId: string | null;
  readonly sourceDocumentId: string | null;
};

type AuthoredFlowRow = {
  readonly id: string;
  readonly threadId: string;
  readonly externalId: string;
  readonly name: string;
  readonly actor: string;
  readonly trigger: string;
  readonly narrative: string;
  readonly outcome: string;
  readonly legsJson: string;
  readonly componentIdsJson: string;
  readonly componentMentionsJson: string;
  readonly requirementIdsJson: string;
  readonly sourceDocumentId: string | null;
  readonly reviewStatus: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type TraceabilityEdgeRow = {
  readonly id: string;
  readonly threadId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: string;
  readonly citation: string | null;
  readonly provenance: string;
  readonly reviewStatus: string;
};

type GateRow = {
  readonly id: string;
  readonly threadId: string;
  readonly kind: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly decisionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type StrategyRow = {
  readonly id: string;
  readonly threadId: string;
  readonly title: string;
  readonly revision: number;
  readonly generationStatus: string;
  readonly reviewStatus: string;
  readonly rejectionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
  readonly submittedBy: string | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly rejectedAt: string | null;
  readonly rejectedBy: string | null;
};

type StrategySectionRow = {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly content: string;
  readonly updatedAt: string;
};

type StrategySectionRequirementRow = {
  readonly sectionId: string;
  readonly requirementId: string;
};

type StrategyCommentRow = {
  readonly id: string;
  readonly sectionId: string;
  readonly quote: string | null;
  readonly body: string;
  readonly status: string;
  readonly author: string;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
};

type StrategyCommentReplyRow = {
  readonly id: string;
  readonly commentId: string;
  readonly body: string;
  readonly author: string;
  readonly createdAt: string;
};

type PlanRow = {
  readonly id: string;
  readonly threadId: string;
  readonly revision: number;
  readonly generationStatus: string;
  readonly reviewStatus: string;
  readonly rejectionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
  readonly submittedBy: string | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly rejectedAt: string | null;
  readonly rejectedBy: string | null;
};
type ScenarioRow = {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly type: string;
  readonly priority: string;
  readonly risk: string;
  readonly expectedOutcome: string;
  readonly status: string;
  readonly decisionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
  readonly submittedBy: string | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly rejectedAt: string | null;
  readonly rejectedBy: string | null;
};
type IdLinkRow = { readonly ownerId: string; readonly linkedId: string };
type PositionedValueRow = {
  readonly ownerId: string;
  readonly position: number;
  readonly value: string;
};
type TestCaseRow = {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly priority: string;
  readonly automationCandidate: number | boolean;
  readonly status: string;
  readonly decisionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
  readonly submittedBy: string | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly rejectedAt: string | null;
  readonly rejectedBy: string | null;
};
type TestStepRow = {
  readonly ownerId: string;
  readonly order: number;
  readonly action: string;
  readonly testData: string;
  readonly expectedResult: string;
};
type ScriptRow = {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly framework: string;
  readonly language: string;
  readonly fileName: string;
  readonly content: string;
  readonly status: string;
  readonly executionStatus: string;
  readonly lastRunAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};
type ScriptEvidenceRow = {
  readonly ownerId: string;
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly artifactPath: string;
  readonly createdAt: string;
};
type ReadinessReviewRow = {
  readonly reviewStatus: string;
  readonly decisionNote: string | null;
  readonly computedAt: string;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly rejectedAt: string | null;
  readonly rejectedBy: string | null;
};

const decodeSnapshot = Schema.decodeUnknownEffect(QaReleaseSnapshot);
const decodeStrategy = Schema.decodeUnknownEffect(QaStrategyDocument);
const decodeScenarioPlan = Schema.decodeUnknownEffect(QaScenarioPlan);
const decodeTestCasePlan = Schema.decodeUnknownEffect(QaTestCasePlan);
const decodeScriptPlan = Schema.decodeUnknownEffect(QaScriptPlan);
const decodeReadiness = Schema.decodeUnknownEffect(QaReadinessDashboard);
const isQaOperationError = Schema.is(QaOperationError);
const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

function operationError(code: QaOperationError["code"], message: string): QaOperationError {
  return new QaOperationError({ code, message });
}

function persistenceError(operation: string): QaOperationError {
  return operationError(
    "persistence_failed",
    `QA workflow persistence failed during ${operation}.`,
  );
}

const DEFAULT_APPROVER_ACTOR: QaReviewActor = {
  principalId: "qa-approver",
  displayName: "QA Approver",
  role: "qa:approver",
};

function mapReviewDecisionError(error: QaReviewError): QaOperationError {
  switch (error.code) {
    case "revision_conflict":
      return operationError("release_conflict", error.message);
    case "not_found":
      return operationError("review_target_not_found", error.message);
    case "persistence_failed":
      return operationError("persistence_failed", error.message);
    case "access_denied":
    case "invalid_anchor":
    case "invalid_input":
    case "invalid_state":
      return operationError("invalid_workflow_state", error.message);
  }
}

function mapQaFailure<A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, QaOperationError, R> {
  return effect.pipe(
    Effect.tapError((cause) =>
      isQaOperationError(cause)
        ? Effect.void
        : Effect.logError("QA workflow operation failed", { operation, cause }),
    ),
    Effect.mapError((cause) => (isQaOperationError(cause) ? cause : persistenceError(operation))),
  );
}

function safeDocumentName(fileName: string): string | null {
  const normalized = fileName.normalize("NFKC").trim();
  const hasControlCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    hasControlCharacter
  ) {
    return null;
  }
  const safe = normalized
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/^-+/u, "")
    .slice(0, 120);
  return safe.length > 0 ? safe : null;
}

function isSupportedDocumentType(mediaType: string): boolean {
  const normalized = mediaType.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  return (
    normalized.startsWith("text/") ||
    normalized === "application/pdf" ||
    normalized === "application/json" ||
    normalized === "application/xml" ||
    normalized === "application/msword" ||
    normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalized === "application/vnd.ms-excel" ||
    normalized === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

const DOCUMENT_MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xml": "application/xml",
};

function resolveDocumentMediaType(fileName: string, mediaType: string): string | null {
  const normalized = mediaType.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  if (normalized !== "" && normalized !== "application/octet-stream") {
    return isSupportedDocumentType(normalized) ? normalized : null;
  }
  const extensionIndex = fileName.lastIndexOf(".");
  const extension = extensionIndex < 0 ? "" : fileName.slice(extensionIndex).toLowerCase();
  return DOCUMENT_MEDIA_TYPES_BY_EXTENSION[extension] ?? null;
}

type QaDocumentKindValue = "BRD" | "FRS" | "HLD" | "LLD" | "OTHER";

function classifyDocumentKind(fileName: string): QaDocumentKindValue {
  const normalized = fileName.normalize("NFKC").toLowerCase();
  if (/(?:^|[^a-z])brd(?:[^a-z]|$)|business[-_ ]*requirements?|^01[-_ ]/u.test(normalized)) {
    return "BRD";
  }
  if (
    /(?:^|[^a-z])frs(?:[^a-z]|$)|functional[-_ ]*(?:requirements?|specification)|^02[-_ ]/u.test(
      normalized,
    )
  ) {
    return "FRS";
  }
  if (/(?:^|[^a-z])hld(?:[^a-z]|$)|high[-_ ]*level|^03[-_ ]/u.test(normalized)) {
    return "HLD";
  }
  if (/(?:^|[^a-z])lld(?:[^a-z]|$)|low[-_ ]*level|^04[-_ ]/u.test(normalized)) {
    return "LLD";
  }
  return "OTHER";
}

function inferDocumentVersion(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/u, "");
  const labelled = baseName.match(/(?:^|[-_ ])(?:version[-_ ]*|v)(\d+(?:\.\d+){0,3})(?:$|[-_ ])/iu);
  return labelled?.[1] ?? "1";
}

function documentNodeId(documentId: string): string {
  return `qa-node:document:${documentId}`;
}

function requirementNodeId(requirementId: string): string {
  return `qa-node:requirement:${requirementId}`;
}

function artifactNodeId(threadId: string, kind: string, externalId: string): string {
  const stableId = NodeCrypto.createHash("sha256")
    .update(`${threadId}:${kind}:${externalId}`)
    .digest("hex")
    .slice(0, 24);
  return `qa-node:${kind}:${stableId}`;
}

function testCaseNodeId(testCaseId: string): string {
  return `qa-node:test:${testCaseId}`;
}

const storedCitationSchema = Schema.fromJsonString(QaSourceCitation);
const decodeStoredCitation = Schema.decodeUnknownSync(storedCitationSchema);
const encodeStoredCitation = Schema.encodeSync(storedCitationSchema);
const decodeAuthoredFlowLegs = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(QaAuthoredFlowLeg)),
);

function parseCitation(value: string | null): QaSourceCitationValue | null {
  if (value === null) return null;
  try {
    return decodeStoredCitation(value);
  } catch {
    // Legacy citation strings are intentionally omitted from the structured snapshot.
  }
  return null;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseAuthoredFlowLegs(value: string) {
  try {
    return decodeAuthoredFlowLegs(value);
  } catch {
    return [];
  }
}

const make = Effect.gen(function* () {
  const sql = yield* QaDatabase;
  const ingestionGateway = yield* QaIngestionGateway;
  const encodeJson = Schema.encodeEffect(Schema.UnknownFromJsonString);
  const crypto = yield* Crypto.Crypto;

  const loadStrategy = Effect.fn("QaWorkflow.loadStrategy")(function* (
    threadId: QaGetSnapshotInput["threadId"],
  ) {
    const strategyRows = yield* sql<StrategyRow>`
      SELECT
        id,
        thread_id AS "threadId",
        title,
        revision,
        generation_status AS "generationStatus",
        review_status AS "reviewStatus",
        rejection_note AS "rejectionNote",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        submitted_at AS "submittedAt",
        submitted_by AS "submittedBy",
        approved_at AS "approvedAt",
        approved_by AS "approvedBy",
        rejected_at AS "rejectedAt",
        rejected_by AS "rejectedBy"
      FROM qa_strategies
      WHERE thread_id = ${threadId}
    `;
    const strategy = strategyRows[0];
    if (strategy === undefined) return null;

    const [sectionRows, sectionRequirementRows, commentRows, replyRows, coveredRequirementRows] =
      yield* Effect.all([
        sql<StrategySectionRow>`
          SELECT id, title, order_index AS "order", content, updated_at AS "updatedAt"
          FROM qa_strategy_sections
          WHERE thread_id = ${threadId}
          ORDER BY order_index, id
        `,
        sql<StrategySectionRequirementRow>`
          SELECT section_id AS "sectionId", requirement_id AS "requirementId"
          FROM qa_strategy_section_requirements
          WHERE thread_id = ${threadId}
          ORDER BY section_id, requirement_id
        `,
        sql<StrategyCommentRow>`
          SELECT
            id, section_id AS "sectionId", quote, body, status, author,
            created_at AS "createdAt", resolved_at AS "resolvedAt", resolved_by AS "resolvedBy"
          FROM qa_strategy_comments
          WHERE thread_id = ${threadId}
          ORDER BY created_at, id
        `,
        sql<StrategyCommentReplyRow>`
          SELECT
            id, comment_id AS "commentId", body, author, created_at AS "createdAt"
          FROM qa_strategy_comment_replies
          WHERE thread_id = ${threadId}
          ORDER BY created_at, id
        `,
        sql<{ readonly id: string }>`
          SELECT id
          FROM qa_requirements
          WHERE thread_id = ${threadId}
            AND requirement_type = 'business'
            AND review_required = 1
            AND status = 'approved'
          ORDER BY id
        `,
      ]);

    const requirementIdsBySectionId = new Map<string, string[]>();
    for (const row of sectionRequirementRows) {
      const requirementIds = requirementIdsBySectionId.get(row.sectionId) ?? [];
      requirementIds.push(row.requirementId);
      requirementIdsBySectionId.set(row.sectionId, requirementIds);
    }
    const repliesByCommentId = new Map<string, StrategyCommentReplyRow[]>();
    for (const reply of replyRows) {
      const replies = repliesByCommentId.get(reply.commentId) ?? [];
      replies.push(reply);
      repliesByCommentId.set(reply.commentId, replies);
    }
    const sections = sectionRows.map((section) => ({
      ...section,
      sourceRequirementIds: requirementIdsBySectionId.get(section.id) ?? [],
    }));
    const comments = commentRows.map((comment) => ({
      ...comment,
      replies: (repliesByCommentId.get(comment.id) ?? []).map(
        ({ commentId: _, ...reply }) => reply,
      ),
    }));
    const totalRequirementIds = coveredRequirementRows.map((requirement) => requirement.id);
    const coveredIds = new Set(sectionRequirementRows.map((row) => row.requirementId));
    const uncoveredRequirementIds = totalRequirementIds.filter(
      (requirementId) => !coveredIds.has(requirementId),
    );
    const totalRequirements = totalRequirementIds.length;
    const coveredRequirements = totalRequirements - uncoveredRequirementIds.length;

    return yield* decodeStrategy({
      ...strategy,
      sections,
      comments,
      coverage: {
        totalRequirements,
        coveredRequirements,
        percent: totalRequirements === 0 ? 0 : (coveredRequirements / totalRequirements) * 100,
        uncoveredRequirementIds,
      },
    });
  });

  const loadScenarioPlan = Effect.fn("QaWorkflow.loadScenarioPlan")(function* (
    threadId: QaGetSnapshotInput["threadId"],
  ) {
    const plans = yield* sql<PlanRow>`SELECT id, thread_id AS "threadId", revision,
      generation_status AS "generationStatus", review_status AS "reviewStatus",
      rejection_note AS "rejectionNote", created_at AS "createdAt", updated_at AS "updatedAt",
      submitted_at AS "submittedAt", submitted_by AS "submittedBy", approved_at AS "approvedAt",
      approved_by AS "approvedBy", rejected_at AS "rejectedAt", rejected_by AS "rejectedBy"
      FROM qa_scenario_plans WHERE thread_id = ${threadId}`;
    const plan = plans[0];
    if (plan === undefined) return null;
    const [rows, requirements, preconditions] = yield* Effect.all([
      sql<ScenarioRow>`SELECT id, external_id AS "externalId", title, type, priority, risk,
        expected_outcome AS "expectedOutcome", status, decision_note AS "decisionNote",
        created_at AS "createdAt", updated_at AS "updatedAt", submitted_at AS "submittedAt",
        submitted_by AS "submittedBy", approved_at AS "approvedAt", approved_by AS "approvedBy",
        rejected_at AS "rejectedAt", rejected_by AS "rejectedBy"
        FROM qa_scenarios WHERE thread_id = ${threadId} ORDER BY external_id, id`,
      sql<IdLinkRow>`SELECT scenario_id AS "ownerId", requirement_id AS "linkedId"
        FROM qa_scenario_requirements WHERE thread_id = ${threadId} ORDER BY scenario_id, requirement_id`,
      sql<PositionedValueRow>`SELECT p.scenario_id AS "ownerId", p.position, p.value
        FROM qa_scenario_preconditions p JOIN qa_scenarios s ON s.id=p.scenario_id
        WHERE s.thread_id=${threadId} ORDER BY p.scenario_id,p.position`,
    ]);
    const ids = (ownerId: string, links: ReadonlyArray<IdLinkRow>) =>
      links.filter((x) => x.ownerId === ownerId).map((x) => x.linkedId);
    return yield* decodeScenarioPlan({
      ...plan,
      scenarios: rows.map((row) => ({
        ...row,
        requirementIds: ids(row.id, requirements),
        preconditions: preconditions.filter((x) => x.ownerId === row.id).map((x) => x.value),
      })),
    });
  });

  const loadTestCasePlan = Effect.fn("QaWorkflow.loadTestCasePlan")(function* (
    threadId: QaGetSnapshotInput["threadId"],
  ) {
    const plans = yield* sql<PlanRow>`SELECT id, thread_id AS "threadId", revision,
      generation_status AS "generationStatus", review_status AS "reviewStatus",
      rejection_note AS "rejectionNote", created_at AS "createdAt", updated_at AS "updatedAt",
      submitted_at AS "submittedAt", submitted_by AS "submittedBy", approved_at AS "approvedAt",
      approved_by AS "approvedBy", rejected_at AS "rejectedAt", rejected_by AS "rejectedBy"
      FROM qa_test_case_plans WHERE thread_id = ${threadId}`;
    const plan = plans[0];
    if (plan === undefined) return null;
    const [rows, scenarios, requirements, preconditions, steps] = yield* Effect.all([
      sql<TestCaseRow>`SELECT id, external_id AS "externalId", title, priority,
        automation_candidate AS "automationCandidate", status, decision_note AS "decisionNote",
        created_at AS "createdAt", updated_at AS "updatedAt", submitted_at AS "submittedAt",
        submitted_by AS "submittedBy", approved_at AS "approvedAt", approved_by AS "approvedBy",
        rejected_at AS "rejectedAt", rejected_by AS "rejectedBy"
        FROM qa_test_cases WHERE thread_id=${threadId} ORDER BY external_id,id`,
      sql<IdLinkRow>`SELECT test_case_id AS "ownerId", scenario_id AS "linkedId"
        FROM qa_test_case_scenarios WHERE thread_id=${threadId} ORDER BY test_case_id,scenario_id`,
      sql<IdLinkRow>`SELECT test_case_id AS "ownerId", requirement_id AS "linkedId"
        FROM qa_test_case_requirements WHERE thread_id=${threadId} ORDER BY test_case_id,requirement_id`,
      sql<PositionedValueRow>`SELECT p.test_case_id AS "ownerId",p.position,p.value
        FROM qa_test_case_preconditions p JOIN qa_test_cases t ON t.id=p.test_case_id
        WHERE t.thread_id=${threadId} ORDER BY p.test_case_id,p.position`,
      sql<TestStepRow>`SELECT s.test_case_id AS "ownerId",s.step_order AS "order",s.action,
        s.test_data AS "testData",s.expected_result AS "expectedResult"
        FROM qa_test_case_steps s JOIN qa_test_cases t ON t.id=s.test_case_id
        WHERE t.thread_id=${threadId} ORDER BY s.test_case_id,s.step_order`,
    ]);
    const ids = (ownerId: string, links: ReadonlyArray<IdLinkRow>) =>
      links.filter((x) => x.ownerId === ownerId).map((x) => x.linkedId);
    return yield* decodeTestCasePlan({
      ...plan,
      testCases: rows.map((row) => ({
        ...row,
        automationCandidate: Boolean(row.automationCandidate),
        scenarioIds: ids(row.id, scenarios),
        requirementIds: ids(row.id, requirements),
        preconditions: preconditions.filter((x) => x.ownerId === row.id).map((x) => x.value),
        steps: steps.filter((x) => x.ownerId === row.id).map(({ ownerId: _, ...step }) => step),
      })),
    });
  });

  const loadScriptPlan = Effect.fn("QaWorkflow.loadScriptPlan")(function* (
    threadId: QaGetSnapshotInput["threadId"],
  ) {
    const plans = yield* sql<PlanRow>`SELECT id, thread_id AS "threadId", revision,
      generation_status AS "generationStatus", review_status AS "reviewStatus",
      rejection_note AS "rejectionNote", created_at AS "createdAt", updated_at AS "updatedAt",
      submitted_at AS "submittedAt", submitted_by AS "submittedBy", approved_at AS "approvedAt",
      approved_by AS "approvedBy", rejected_at AS "rejectedAt", rejected_by AS "rejectedBy"
      FROM qa_script_plans WHERE thread_id=${threadId}`;
    const plan = plans[0];
    if (plan === undefined) return null;
    const [rows, testCases, requirements, evidence] = yield* Effect.all([
      sql<ScriptRow>`SELECT id,external_id AS "externalId",title,framework,language,
        file_name AS "fileName",content,status,execution_status AS "executionStatus",
        last_run_at AS "lastRunAt",created_at AS "createdAt",updated_at AS "updatedAt"
        FROM qa_scripts WHERE thread_id=${threadId} ORDER BY external_id,id`,
      sql<IdLinkRow>`SELECT script_id AS "ownerId",test_case_id AS "linkedId"
        FROM qa_script_test_cases WHERE thread_id=${threadId} ORDER BY script_id,test_case_id`,
      sql<IdLinkRow>`SELECT script_id AS "ownerId",requirement_id AS "linkedId"
        FROM qa_script_requirements WHERE thread_id=${threadId} ORDER BY script_id,requirement_id`,
      sql<ScriptEvidenceRow>`SELECT e.script_id AS "ownerId",e.id,e.kind,e.summary,
        e.artifact_path AS "artifactPath",e.created_at AS "createdAt"
        FROM qa_script_evidence e JOIN qa_scripts s ON s.id=e.script_id
        WHERE s.thread_id=${threadId} ORDER BY e.script_id,e.created_at,e.id`,
    ]);
    const ids = (ownerId: string, links: ReadonlyArray<IdLinkRow>) =>
      links.filter((link) => link.ownerId === ownerId).map((link) => link.linkedId);
    return yield* decodeScriptPlan({
      ...plan,
      scripts: rows.map((row) => ({
        ...row,
        testCaseIds: ids(row.id, testCases),
        requirementIds: ids(row.id, requirements),
        evidence: evidence
          .filter((item) => item.ownerId === row.id)
          .map(({ ownerId: _, ...item }) => item),
      })),
    });
  });

  const loadReadinessReview = Effect.fn("QaWorkflow.loadReadinessReview")(function* (
    threadId: QaGetSnapshotInput["threadId"],
  ) {
    const rows = yield* sql<ReadinessReviewRow>`SELECT review_status AS "reviewStatus",
      decision_note AS "decisionNote",computed_at AS "computedAt",approved_at AS "approvedAt",
      approved_by AS "approvedBy",rejected_at AS "rejectedAt",rejected_by AS "rejectedBy"
      FROM qa_readiness_reviews WHERE thread_id=${threadId}`;
    return rows[0] ?? null;
  });

  const computeReadiness = Effect.fn("QaWorkflow.computeReadiness")(function* (
    threadId: QaGetSnapshotInput["threadId"],
    revision: number,
    requirements: ReadonlyArray<{ readonly id: string; readonly status: string }>,
    scenarioPlan: QaScenarioPlan | null,
    testCasePlan: QaTestCasePlan | null,
    scriptPlan: QaScriptPlan | null,
    review: ReadinessReviewRow | null,
    computedAt: string,
  ) {
    const approvedRequirements = requirements.filter((item) => item.status === "approved");
    const approvedScenarios =
      scenarioPlan?.scenarios.filter((item) => item.status === "approved") ?? [];
    const approvedTestCases =
      testCasePlan?.testCases.filter((item) => item.status === "approved") ?? [];
    const scripts = scriptPlan?.scripts ?? [];
    const metric = (covered: number, total: number) => ({
      covered,
      total,
      percent: total === 0 ? 0 : Math.round((covered / total) * 10_000) / 100,
    });
    const requirementIds = new Set(
      approvedScenarios.flatMap((scenario) => scenario.requirementIds),
    );
    const scenarioIds = new Set(approvedTestCases.flatMap((testCase) => testCase.scenarioIds));
    const testCaseIds = new Set(scripts.flatMap((script) => script.testCaseIds));
    const evidencedScripts = scripts.filter(
      (script) => script.executionStatus === "passed" && script.evidence.length > 0,
    );
    const requirementCoverage = metric(
      approvedRequirements.filter((item) => requirementIds.has(item.id)).length,
      approvedRequirements.length,
    );
    const scenarioCoverage = metric(
      approvedScenarios.filter((item) => scenarioIds.has(item.id)).length,
      approvedScenarios.length,
    );
    const testCaseCoverage = metric(
      approvedTestCases.filter((item) => testCaseIds.has(item.id)).length,
      approvedTestCases.length,
    );
    const scriptCoverage = metric(evidencedScripts.length, scripts.length);
    const executionPassed = scripts.filter((item) => item.executionStatus === "passed").length;
    const executionFailed = scripts.filter((item) => item.executionStatus === "failed").length;
    const checks = [
      {
        id: "requirements-covered",
        title: "Approved requirements covered",
        passed: approvedRequirements.length > 0 && requirementCoverage.percent === 100,
        detail: `${requirementCoverage.covered} of ${requirementCoverage.total} approved requirements have scenario coverage.`,
        stage: "scenarios" as const,
      },
      {
        id: "scenarios-covered",
        title: "Approved scenarios covered",
        passed:
          scenarioPlan?.reviewStatus === "approved" &&
          approvedScenarios.length > 0 &&
          scenarioCoverage.percent === 100,
        detail: `${scenarioCoverage.covered} of ${scenarioCoverage.total} approved scenarios have test-case coverage.`,
        stage: "test_cases" as const,
      },
      {
        id: "test-cases-covered",
        title: "Approved test cases covered",
        passed:
          testCasePlan?.reviewStatus === "approved" &&
          approvedTestCases.length > 0 &&
          testCaseCoverage.percent === 100,
        detail: `${testCaseCoverage.covered} of ${testCaseCoverage.total} approved test cases have script coverage.`,
        stage: "scripts" as const,
      },
      {
        id: "scripts-approved",
        title: "Script plan approved",
        passed: scriptPlan?.reviewStatus === "approved" && scripts.length > 0,
        detail:
          scriptPlan?.reviewStatus === "approved"
            ? "The script plan is approved."
            : "The script plan still requires approval.",
        stage: "scripts" as const,
      },
      {
        id: "execution-evidence",
        title: "Execution evidence complete",
        passed: scripts.length > 0 && scriptCoverage.percent === 100 && executionFailed === 0,
        detail: `${executionPassed} passed, ${executionFailed} failed, and ${evidencedScripts.length} have persisted evidence.`,
        stage: "readiness" as const,
      },
    ];
    const gateChecks = checks.map((check) => ({
      id: check.id,
      title: check.title,
      status: check.passed ? ("passed" as const) : ("failed" as const),
      detail: check.detail,
    }));
    const openBlockers = checks
      .filter((check) => !check.passed)
      .map((check) => ({
        id: `blocker:${check.id}`,
        title: check.title,
        detail: check.detail,
        stage: check.stage,
      }));
    return yield* decodeReadiness({
      threadId,
      revision,
      overallStatus: openBlockers.length === 0 ? "ready" : "not_ready",
      reviewStatus: review?.reviewStatus ?? "pending",
      requirementCoverage,
      scenarioCoverage,
      testCaseCoverage,
      scriptCoverage,
      executionPassed,
      executionFailed,
      openBlockers,
      gateChecks,
      computedAt,
      approvedAt: review?.approvedAt ?? null,
      approvedBy: review?.approvedBy ?? null,
      rejectedAt: review?.rejectedAt ?? null,
      rejectedBy: review?.rejectedBy ?? null,
      decisionNote: review?.decisionNote ?? null,
    });
  });

  const getSnapshot = (input: QaGetSnapshotInput) =>
    mapQaFailure(
      "getSnapshot",
      Effect.gen(function* () {
        const releases = yield* sql<ReleaseRow>`
          SELECT
            project_id AS "projectId",
            thread_id AS "threadId",
            mode,
            release_number AS "releaseNumber",
            title,
            status,
            phase,
            ingestion_status AS "ingestionStatus",
            ingestion_progress AS "ingestionProgress",
            active_stage AS "activeStage",
            revision,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM qa_releases
          WHERE thread_id = ${input.threadId}
        `;
        const release = releases[0];
        if (release === undefined) return null;

        const [
          documents,
          requirementRows,
          requirementLinks,
          authoredFlowRows,
          traceabilityNodeRows,
          traceabilityEdgeRows,
          approvalGates,
          stages,
          strategy,
          scenarioPlan,
          testCasePlan,
          scriptPlan,
          readinessReview,
        ] = yield* Effect.all([
          sql<DocumentRow>`
            SELECT
              id,
              thread_id AS "threadId",
              file_name AS "fileName",
              kind,
              version,
              media_type AS "mediaType",
              storage_path AS "storagePath",
              byte_size AS "byteSize",
              sha256,
              status,
              created_at AS "createdAt",
              updated_at AS "updatedAt"
            FROM qa_documents
            WHERE thread_id = ${input.threadId}
            ORDER BY created_at, id
          `,
          sql<RequirementRow>`
            SELECT
              id,
              thread_id AS "threadId",
              source_document_id AS "sourceDocumentId",
              external_id AS "externalId",
              requirement_type AS "requirementType",
              review_required AS "reviewRequired",
              source_citation AS "sourceCitation",
              source_document_name AS "sourceDocumentName",
              confidence,
              tags_json AS "tagsJson",
              extraction_method AS "extractionMethod",
              title,
              description,
              status,
              decision_note AS "decisionNote",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
            FROM qa_requirements
            WHERE thread_id = ${input.threadId}
            ORDER BY created_at, id
          `,
          sql<RequirementLinkRow>`
            SELECT
              parent_requirement_id AS "parentRequirementId",
              child_requirement_id AS "childRequirementId"
            FROM qa_requirement_links
            WHERE thread_id = ${input.threadId}
            ORDER BY parent_requirement_id, child_requirement_id
          `,
          sql<AuthoredFlowRow>`
            SELECT
              id,
              thread_id AS "threadId",
              external_id AS "externalId",
              name,
              actor,
              trigger_text AS "trigger",
              narrative,
              outcome,
              legs_json AS "legsJson",
              component_ids_json AS "componentIdsJson",
              component_mentions_json AS "componentMentionsJson",
              requirement_ids_json AS "requirementIdsJson",
              source_document_id AS "sourceDocumentId",
              review_status AS "reviewStatus",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
            FROM qa_authored_flows
            WHERE thread_id = ${input.threadId}
            ORDER BY external_id, id
          `,
          sql<TraceabilityNodeRow>`
            SELECT
              n.id,
              n.thread_id AS "threadId",
              n.kind,
              COALESCE(r.title, n.label) AS label,
              COALESCE(r.external_id, n.external_id, d.file_name) AS "externalId",
              COALESCE(n.document_id, r.source_document_id) AS "sourceDocumentId"
            FROM qa_traceability_nodes n
            LEFT JOIN qa_documents d ON d.id = n.document_id
            LEFT JOIN qa_requirements r ON r.id = n.requirement_id
            WHERE n.thread_id = ${input.threadId}
            ORDER BY n.kind, n.label, n.id
          `,
          sql<TraceabilityEdgeRow>`
            SELECT
              id,
              thread_id AS "threadId",
              from_id AS "fromNodeId",
              to_id AS "toNodeId",
              kind,
              citation,
              provenance,
              review_status AS "reviewStatus"
            FROM qa_traceability_edges
            WHERE thread_id = ${input.threadId}
            ORDER BY kind, from_id, to_id, id
          `,
          sql<GateRow>`
            SELECT
              id,
              thread_id AS "threadId",
              kind,
              title,
              description,
              status,
              decision_note AS "decisionNote",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
            FROM qa_approval_gates
            WHERE thread_id = ${input.threadId}
            ORDER BY created_at, id
          `,
          sql<StageRow>`
            SELECT
              stage,
              status,
              progress,
              active_job_id AS "activeJobId",
              blocked_reason AS "blockedReason",
              updated_at AS "updatedAt"
            FROM qa_stage_states
            WHERE thread_id = ${input.threadId}
            ORDER BY ordinal
          `,
          loadStrategy(input.threadId),
          loadScenarioPlan(input.threadId),
          loadTestCasePlan(input.threadId),
          loadScriptPlan(input.threadId),
          loadReadinessReview(input.threadId),
        ]);

        const parentsByRequirementId = new Map<string, string[]>();
        for (const link of requirementLinks) {
          const parents = parentsByRequirementId.get(link.childRequirementId) ?? [];
          parents.push(link.parentRequirementId);
          parentsByRequirementId.set(link.childRequirementId, parents);
        }
        const externalIdByRequirementId = new Map(
          requirementRows.map((requirement) => [requirement.id, requirement.externalId]),
        );
        const requirements = requirementRows.map((requirement) => {
          const citation = parseCitation(requirement.sourceCitation);
          const { sourceDocumentName, tagsJson, ...storedRequirement } = requirement;
          return {
            ...storedRequirement,
            ...(sourceDocumentName === null ? {} : { sourceDocumentName }),
            reviewRequired: Boolean(requirement.reviewRequired),
            parentRequirementIds: (parentsByRequirementId.get(requirement.id) ?? []).map(
              (parentId) => externalIdByRequirementId.get(parentId) ?? parentId,
            ),
            sourceCitations: citation === null ? [] : [citation],
            tags: parseStringArray(tagsJson),
          };
        });
        const traceabilityEdges = traceabilityEdgeRows.map((edge) => ({
          ...edge,
          citation: parseCitation(edge.citation),
        }));
        const authoredFlows = authoredFlowRows.map((flow) => ({
          id: flow.id,
          threadId: flow.threadId,
          externalId: flow.externalId,
          name: flow.name,
          actor: flow.actor,
          trigger: flow.trigger,
          narrative: flow.narrative,
          outcome: flow.outcome,
          legs: parseAuthoredFlowLegs(flow.legsJson),
          componentExternalIds: parseStringArray(flow.componentIdsJson),
          componentMentions: parseStringArray(flow.componentMentionsJson),
          requirementExternalIds: parseStringArray(flow.requirementIdsJson),
          sourceDocumentId: flow.sourceDocumentId,
          reviewStatus: flow.reviewStatus,
          createdAt: flow.createdAt,
          updatedAt: flow.updatedAt,
        }));
        const readinessDashboard =
          scriptPlan === null
            ? null
            : yield* computeReadiness(
                input.threadId,
                release.revision,
                requirements,
                scenarioPlan,
                testCasePlan,
                scriptPlan,
                readinessReview,
                release.updatedAt,
              );

        return yield* decodeSnapshot({
          ...release,
          releaseId: release.threadId,
          documents,
          requirements,
          authoredFlows,
          traceabilityNodes: traceabilityNodeRows,
          traceabilityEdges,
          strategy,
          scenarioPlan,
          testCasePlan,
          scriptPlan,
          readinessDashboard,
          approvalGates,
          activeStage: release.activeStage,
          revision: release.revision,
          stages,
        });
      }),
    );

  const requireSnapshot = (threadId: QaGetSnapshotInput["threadId"]) =>
    getSnapshot({ threadId }).pipe(
      Effect.flatMap((snapshot) =>
        snapshot === null
          ? Effect.fail(
              operationError("release_not_found", "Initialize QA mode for this release first."),
            )
          : Effect.succeed(snapshot),
      ),
    );

  const requireStrategy = Effect.fn("QaWorkflow.requireStrategy")(function* (
    threadId: QaGetSnapshotInput["threadId"],
    strategyId?: string,
  ) {
    const strategy = yield* loadStrategy(threadId);
    if (strategy === null || (strategyId !== undefined && strategy.id !== strategyId)) {
      return yield* operationError(
        "invalid_workflow_state",
        "Generate the QA strategy before performing this action.",
      );
    }
    return strategy;
  });

  const requireExpectedRevision = (
    snapshot: QaReleaseSnapshot,
    expectedRevision: number,
  ): Effect.Effect<void, QaOperationError> =>
    snapshot.revision === expectedRevision
      ? Effect.void
      : Effect.fail(
          operationError(
            "invalid_workflow_state",
            `QA release revision changed from ${expectedRevision} to ${snapshot.revision}; refresh before saving.`,
          ),
        );

  const strategyMutationResult = Effect.fn("QaWorkflow.strategyMutationResult")(function* (
    threadId: QaGetSnapshotInput["threadId"],
  ) {
    const snapshot = yield* requireSnapshot(threadId);
    const strategy = yield* requireStrategy(threadId);
    return { strategy, snapshot } satisfies QaStrategyMutationResult;
  });
  const scenarioMutationResult = Effect.fn("QaWorkflow.scenarioMutationResult")(function* (
    threadId: QaGetSnapshotInput["threadId"],
  ) {
    const snapshot = yield* requireSnapshot(threadId);
    const scenarioPlan = yield* loadScenarioPlan(threadId);
    if (scenarioPlan === null)
      return yield* operationError("invalid_workflow_state", "Generate scenarios first.");
    return { scenarioPlan, snapshot } satisfies QaScenarioPlanMutationResult;
  });
  const testCaseMutationResult = Effect.fn("QaWorkflow.testCaseMutationResult")(function* (
    threadId: QaGetSnapshotInput["threadId"],
  ) {
    const snapshot = yield* requireSnapshot(threadId);
    const testCasePlan = yield* loadTestCasePlan(threadId);
    if (testCasePlan === null)
      return yield* operationError("invalid_workflow_state", "Generate test cases first.");
    return { testCasePlan, snapshot } satisfies QaTestCasePlanMutationResult;
  });
  const scriptMutationResult = Effect.fn("QaWorkflow.scriptMutationResult")(function* (
    threadId: QaGetSnapshotInput["threadId"],
  ) {
    const snapshot = yield* requireSnapshot(threadId);
    const scriptPlan = yield* loadScriptPlan(threadId);
    if (scriptPlan === null)
      return yield* operationError("invalid_workflow_state", "Generate scripts first.");
    return { scriptPlan, snapshot } satisfies QaScriptPlanMutationResult;
  });

  const initializeRelease = (input: QaInitializeReleaseInput) =>
    mapQaFailure(
      "initializeRelease",
      sql.withTransaction(
        Effect.gen(function* () {
          const existing = yield* getSnapshot({ threadId: input.threadId });
          if (existing !== null) {
            if (existing.projectId !== input.projectId) {
              return yield* operationError(
                "release_conflict",
                "This release thread is already associated with a different project.",
              );
            }
            return existing;
          }

          const timestamp = yield* nowIso;
          const releaseNumberRows = yield* sql<{ readonly releaseNumber: number }>`
            SELECT COALESCE(MAX(release_number), 0) + 1 AS "releaseNumber"
            FROM qa_releases
            WHERE project_id = ${input.projectId}
          `;
          const releaseNumber = releaseNumberRows[0]?.releaseNumber ?? 1;
          const releaseTitle = input.releaseTitle ?? `Release ${releaseNumber}`;
          yield* sql`
            INSERT INTO qa_releases (
              thread_id, project_id, mode, release_number, title, status, phase,
              ingestion_status, ingestion_progress, active_stage, revision, created_at, updated_at
            ) VALUES (
              ${input.threadId}, ${input.projectId}, 'qa', ${releaseNumber}, ${releaseTitle},
              'active', 'documents',
              'idle', 0, 'intake', 1, ${timestamp}, ${timestamp}
            )
          `;
          for (const [index, stage] of QA_STAGES.entries()) {
            yield* sql`
              INSERT INTO qa_stage_states (
                thread_id, stage, ordinal, status, progress, active_job_id, blocked_reason, updated_at
              ) VALUES (
                ${input.threadId}, ${stage}, ${index + 1},
                ${stage === "intake" ? "ready" : "locked"}, 0, NULL, NULL, ${timestamp}
              )
            `;
          }
          yield* sql`
            INSERT INTO qa_approval_gates (
              id, thread_id, kind, title, description, status, decision_note, created_at, updated_at
            ) VALUES (
              ${`qa-gate:${input.threadId}:requirements-review`},
              ${input.threadId},
              ${REQUIREMENTS_GATE_KIND},
              'Requirements approval',
              'Approve the requirements baseline before QA planning continues.',
              'pending',
              NULL,
              ${timestamp},
              ${timestamp}
            )
          `;
          return yield* requireSnapshot(input.threadId);
        }),
      ),
    );

  const uploadDocument = (input: QaUploadDocumentInput) =>
    mapQaFailure(
      "uploadDocument",
      Effect.gen(function* () {
        yield* requireSnapshot(input.threadId);
        const safeName = safeDocumentName(input.fileName);
        if (safeName === null) {
          return yield* operationError(
            "document_name_invalid",
            "Document name must be a plain file name.",
          );
        }
        if (input.bytes.byteLength === 0) {
          return yield* operationError("document_empty", "Document is empty.");
        }
        if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
          return yield* operationError(
            "document_too_large",
            "Document exceeds the 20 MB upload limit.",
          );
        }
        const resolvedMediaType = resolveDocumentMediaType(input.fileName, input.mediaType);
        if (resolvedMediaType === null) {
          return yield* operationError(
            "document_type_unsupported",
            "Document type is not supported.",
          );
        }

        const documentId = yield* crypto.randomUUIDv4.pipe(
          Effect.mapError(() => persistenceError("generateDocumentId")),
        );
        // The document bytes are canonical in Postgres (`content_blob`). This
        // logical key is stable metadata, not a path in any principal's local
        // orchestration workspace.
        const storagePath = `qa-db/releases/${input.threadId}/documents/${documentId}/${safeName}`;
        const timestamp = yield* nowIso;
        const sha256 = NodeCrypto.createHash("sha256").update(input.bytes).digest("hex");
        const documentKind = classifyDocumentKind(input.fileName);
        const documentVersion = inferDocumentVersion(input.fileName);

        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`
                DELETE FROM qa_documents
                WHERE thread_id = ${input.threadId} AND file_name = ${input.fileName.trim()}
              `;
            yield* sql`
                INSERT INTO qa_documents (
                  id, thread_id, file_name, kind, version, media_type, storage_path, byte_size, sha256,
                  content_blob, status, created_at, updated_at
                ) VALUES (
                  ${documentId}, ${input.threadId}, ${input.fileName.trim()}, ${documentKind},
                  ${documentVersion}, ${resolvedMediaType},
                  ${storagePath}, ${input.bytes.byteLength}, ${sha256}, ${input.bytes}, 'uploaded',
                  ${timestamp}, ${timestamp}
                )
              `;
            yield* sql`
                DELETE FROM qa_requirements WHERE thread_id = ${input.threadId}
              `;
            yield* sql`
                DELETE FROM qa_traceability_nodes
                WHERE thread_id = ${input.threadId} AND kind != 'document'
              `;
            yield* sql`
                UPDATE qa_approval_gates
                SET status = 'pending', decision_note = NULL, updated_at = ${timestamp}
                WHERE thread_id = ${input.threadId} AND kind = ${REQUIREMENTS_GATE_KIND}
              `;
            yield* sql`
                UPDATE qa_releases
                SET phase = 'documents', ingestion_status = 'idle', ingestion_progress = 0,
                    active_stage = 'intake', revision = revision + 1, updated_at = ${timestamp}
                WHERE thread_id = ${input.threadId}
              `;
            yield* sql`
                UPDATE qa_stage_states
                SET status = CASE WHEN stage = 'intake' THEN 'ready' ELSE 'locked' END,
                    progress = 0, active_job_id = NULL, active_environment_id = NULL,
                    active_conversation_thread_id = NULL, active_provider_session_id = NULL,
                    blocked_reason = NULL,
                    updated_at = ${timestamp}
                WHERE thread_id = ${input.threadId}
              `;
            yield* sql`
                INSERT INTO qa_traceability_nodes (
                  id, thread_id, kind, label, document_id, requirement_id, created_at, updated_at
                ) VALUES (
                  ${documentNodeId(documentId)}, ${input.threadId}, 'document',
                  ${input.fileName.trim()}, ${documentId}, NULL, ${timestamp}, ${timestamp}
                )
              `;
          }),
        );

        return yield* requireSnapshot(input.threadId);
      }),
    );

  const startIngestion = (input: QaStartIngestionInput) =>
    mapQaFailure(
      "startIngestion",
      Effect.gen(function* () {
        const release = yield* requireSnapshot(input.threadId);
        const documents = yield* sql<StoredDocumentRow>`
          SELECT id, thread_id AS "threadId", file_name AS "fileName", kind, version,
            media_type AS "mediaType", storage_path AS "storagePath", byte_size AS "byteSize",
            sha256, content_blob AS "contentBlob", status,
            created_at AS "createdAt", updated_at AS "updatedAt"
          FROM qa_documents
          WHERE thread_id = ${input.threadId}
          ORDER BY created_at, id
        `;
        if (documents.length === 0) {
          return yield* operationError(
            "document_required",
            "Upload at least one document before ingestion.",
          );
        }

        const jobId = `qa-ingestion:${yield* crypto.randomUUIDv4}`;
        const startedAt = yield* nowIso;
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`
              INSERT INTO qa_ingestion_jobs (
                id, thread_id, provider, provider_job_id, status, stage, progress,
                message, last_error, started_at, completed_at, updated_at
              ) VALUES (
                ${jobId}, ${input.threadId}, 't3code-standalone', NULL, 'processing', 'parsing', 10,
                'Parsing release documents in the standalone QA runtime.',
                NULL, ${startedAt}, NULL, ${startedAt}
              )
            `;
            yield* sql`
              UPDATE qa_releases
              SET phase = 'ingestion', ingestion_status = 'processing', ingestion_progress = 10,
                  updated_at = ${startedAt}
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              UPDATE qa_stage_states
              SET status = 'running', progress = 10, active_job_id = ${jobId},
                  active_environment_id = NULL, active_conversation_thread_id = NULL,
                  active_provider_session_id = NULL,
                  blocked_reason = NULL, updated_at = ${startedAt}
              WHERE thread_id = ${input.threadId} AND stage = 'intake'
            `;
            yield* sql`
              UPDATE qa_documents SET status = 'processing', updated_at = ${startedAt}
              WHERE thread_id = ${input.threadId}
            `;
          }),
        );

        const externalReleaseId = `t3-${release.projectId}-release-${release.releaseNumber}-${input.threadId}`;
        const result = yield* ingestionGateway
          .ingest({
            projectId: release.projectId,
            releaseId: externalReleaseId,
            documents: documents.map((document) => ({
              id: document.id,
              fileName: document.fileName,
              mediaType: document.mediaType,
              bytes: document.contentBlob,
            })),
          })
          .pipe(
            Effect.catchTag("QaIngestionGatewayError", (error) =>
              Effect.gen(function* () {
                const failedAt = yield* nowIso;
                yield* sql.withTransaction(
                  Effect.gen(function* () {
                    yield* sql`
                      UPDATE qa_ingestion_jobs
                      SET status = 'failed', stage = 'failed', progress = 100,
                          message = ${error.message}, last_error = ${error.message},
                          completed_at = ${failedAt}, updated_at = ${failedAt}
                      WHERE id = ${jobId}
                    `;
                    yield* sql`
                      UPDATE qa_releases
                      SET ingestion_status = 'failed', ingestion_progress = 100,
                          updated_at = ${failedAt}
                      WHERE thread_id = ${input.threadId}
                    `;
                    yield* sql`
                      UPDATE qa_stage_states
                      SET status = 'blocked', progress = 100, active_job_id = ${jobId},
                          active_environment_id = NULL, active_conversation_thread_id = NULL,
                          active_provider_session_id = NULL,
                          blocked_reason = ${error.message}, updated_at = ${failedAt}
                      WHERE thread_id = ${input.threadId} AND stage = 'intake'
                    `;
                    yield* sql`
                      UPDATE qa_documents SET status = 'failed', updated_at = ${failedAt}
                      WHERE thread_id = ${input.threadId}
                    `;
                  }),
                );
                return yield* operationError("ingestion_failed", error.message);
              }),
            ),
          );

        const completedAt = yield* nowIso;
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM qa_requirement_links WHERE thread_id = ${input.threadId}`;
            yield* sql`DELETE FROM qa_document_chunks WHERE thread_id = ${input.threadId}`;
            yield* sql`
              DELETE FROM qa_traceability_edges WHERE thread_id = ${input.threadId}
            `;
            yield* sql`DELETE FROM qa_authored_flows WHERE thread_id = ${input.threadId}`;
            yield* sql`
              DELETE FROM qa_traceability_nodes
              WHERE thread_id = ${input.threadId} AND kind != 'document'
            `;
            yield* sql`DELETE FROM qa_requirements WHERE thread_id = ${input.threadId}`;

            const localDocumentByGatewayId = new Map<string, StoredDocumentRow>();
            for (const parsedDocument of result.documents) {
              const localDocument = documents.find(
                (document) =>
                  document.sha256 === parsedDocument.sha256 ||
                  document.fileName === parsedDocument.fileName,
              );
              if (localDocument)
                localDocumentByGatewayId.set(parsedDocument.documentId, localDocument);
            }
            const requirementIdByExternalId = new Map<string, string>();
            const nodeIdByExternalId = new Map<string, string>();
            const citationByExternalId = new Map<string, string>();
            for (const requirement of result.requirements) {
              const localDocument = localDocumentByGatewayId.get(requirement.sourceDocumentId);
              if (!localDocument) continue;
              const requirementId = `qa-requirement:${input.threadId}:${requirement.displayId}`;
              requirementIdByExternalId.set(requirement.displayId, requirementId);
              nodeIdByExternalId.set(requirement.displayId, requirementNodeId(requirementId));
              const requirementType = requirement.documentType.toUpperCase().includes("FRS")
                ? "functional"
                : "business";
              const sourceSection = requirement.sourceSections[0];
              const citation = encodeStoredCitation({
                documentId: localDocument.id,
                documentName: localDocument.fileName,
                documentType: requirement.documentType,
                section: sourceSection?.sectionRef ?? "Source requirement",
                location: sourceSection?.path ?? `${localDocument.fileName}#source`,
                excerpt: sourceSection?.excerpt ?? requirement.statement.slice(0, 500),
              });
              citationByExternalId.set(requirement.displayId, citation);
              const tagsJson = yield* encodeJson(requirement.tags);
              yield* sql`
                INSERT INTO qa_requirements (
                  id, thread_id, source_document_id, external_id, requirement_type,
                  review_required, source_citation, source_document_name, confidence,
                  tags_json, extraction_method, title, description, status,
                  decision_note, created_at, updated_at
                ) VALUES (
                  ${requirementId}, ${input.threadId}, ${localDocument.id},
                  ${requirement.displayId}, ${requirementType},
                  ${requirementType === "business" ? 1 : 0}, ${citation},
                  ${localDocument.fileName}, ${requirement.confidence}, ${tagsJson},
                  ${requirement.extractionMethod},
                  ${requirement.statement.slice(0, 500)},
                  ${requirement.description ?? requirement.statement}, 'pending', NULL,
                  ${completedAt}, ${completedAt}
                )
              `;
              yield* sql`
                INSERT INTO qa_traceability_nodes (
                  id, thread_id, kind, label, document_id, requirement_id, created_at, updated_at
                ) VALUES (
                  ${requirementNodeId(requirementId)}, ${input.threadId},
                  ${requirementType === "business" ? "business_requirement" : "functional_requirement"},
                  ${requirement.displayId}, NULL, ${requirementId}, ${completedAt}, ${completedAt}
                )
              `;
              yield* sql`
                INSERT INTO qa_traceability_edges (
                  id, thread_id, from_id, to_id, kind, citation, provenance,
                  review_status, created_at, updated_at
                ) VALUES (
                  ${`qa-edge:document-requirement:${localDocument.id}:${requirementId}`},
                  ${input.threadId}, ${documentNodeId(localDocument.id)},
                  ${requirementNodeId(requirementId)}, 'contains', ${citation},
                  'deterministic', 'approved', ${completedAt}, ${completedAt}
                )
              `;
            }
            for (const requirement of result.requirements) {
              const childId = requirementIdByExternalId.get(requirement.displayId);
              if (!childId) continue;
              for (const parentExternalId of requirement.parentIds) {
                const parentId = requirementIdByExternalId.get(parentExternalId);
                if (!parentId || parentId === childId) continue;
                yield* sql`
                  INSERT INTO qa_requirement_links (
                    thread_id, parent_requirement_id, child_requirement_id, kind,
                    created_at, updated_at
                  ) VALUES (
                    ${input.threadId}, ${parentId}, ${childId}, 'parent',
                    ${completedAt}, ${completedAt}
                  ) ON CONFLICT DO NOTHING
                `;
                yield* sql`
                  INSERT INTO qa_traceability_edges (
                    id, thread_id, from_id, to_id, kind, citation, provenance,
                    review_status, created_at, updated_at
                  ) VALUES (
                    ${`qa-edge:requirement-parent:${parentId}:${childId}`},
                    ${input.threadId}, ${requirementNodeId(parentId)},
                    ${requirementNodeId(childId)}, 'parent_of',
                    ${citationByExternalId.get(requirement.displayId) ?? null},
                    'deterministic', 'pending', ${completedAt}, ${completedAt}
                  ) ON CONFLICT DO NOTHING
                `;
              }
            }
            for (const node of result.designNodes) {
              const localDocument = localDocumentByGatewayId.get(node.sourceDocumentId);
              if (!localDocument) continue;
              const nodeId = artifactNodeId(input.threadId, node.kind, node.externalId);
              nodeIdByExternalId.set(node.externalId, nodeId);
              yield* sql`
                INSERT INTO qa_traceability_nodes (
                  id, thread_id, kind, label, external_id, document_id, requirement_id,
                  created_at, updated_at
                ) VALUES (
                  ${nodeId}, ${input.threadId}, ${node.kind}, ${node.label}, ${node.externalId},
                  ${localDocument.id}, NULL, ${completedAt}, ${completedAt}
                ) ON CONFLICT(id) DO UPDATE SET
                  label = excluded.label,
                  external_id = excluded.external_id,
                  document_id = excluded.document_id,
                  updated_at = excluded.updated_at
              `;
              if (node.kind === "flow") {
                yield* sql`
                  INSERT INTO qa_traceability_edges (
                    id, thread_id, from_id, to_id, kind, citation, provenance,
                    review_status, created_at, updated_at
                  ) VALUES (
                    ${`qa-edge:document-authors:${localDocument.id}:${nodeId}`},
                    ${input.threadId}, ${documentNodeId(localDocument.id)}, ${nodeId}, 'authors',
                    NULL, 'deterministic', 'pending', ${completedAt}, ${completedAt}
                  ) ON CONFLICT DO NOTHING
                `;
              }
            }
            for (const flow of result.authoredFlows) {
              const localDocument = localDocumentByGatewayId.get(flow.sourceDocumentId);
              if (!localDocument) continue;
              const legsJson = yield* encodeJson(flow.legs);
              const componentIdsJson = yield* encodeJson(flow.componentExternalIds);
              const componentMentionsJson = yield* encodeJson(flow.componentMentions);
              const requirementIdsJson = yield* encodeJson(flow.requirementExternalIds);
              yield* sql`
                INSERT INTO qa_authored_flows (
                  id, thread_id, external_id, name, actor, trigger_text, narrative,
                  outcome, legs_json, component_ids_json, component_mentions_json,
                  requirement_ids_json, source_document_id, review_status,
                  created_at, updated_at
                ) VALUES (
                  ${`qa-authored-flow:${input.threadId}:${flow.externalId}`},
                  ${input.threadId}, ${flow.externalId}, ${flow.name}, ${flow.actor},
                  ${flow.trigger}, ${flow.narrative}, ${flow.outcome}, ${legsJson},
                  ${componentIdsJson}, ${componentMentionsJson}, ${requirementIdsJson},
                  ${localDocument.id}, 'pending', ${completedAt}, ${completedAt}
                ) ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  actor = excluded.actor,
                  trigger_text = excluded.trigger_text,
                  narrative = excluded.narrative,
                  outcome = excluded.outcome,
                  legs_json = excluded.legs_json,
                  component_ids_json = excluded.component_ids_json,
                  component_mentions_json = excluded.component_mentions_json,
                  requirement_ids_json = excluded.requirement_ids_json,
                  source_document_id = excluded.source_document_id,
                  updated_at = excluded.updated_at
              `;
            }
            for (const edge of result.designEdges) {
              const fromNodeId = nodeIdByExternalId.get(edge.fromExternalId);
              const toNodeId = nodeIdByExternalId.get(edge.toExternalId);
              if (!fromNodeId || !toNodeId) continue;
              yield* sql`
                INSERT INTO qa_traceability_edges (
                  id, thread_id, from_id, to_id, kind, citation, provenance,
                  review_status, created_at, updated_at
                ) VALUES (
                  ${`qa-edge:design:${edge.fromExternalId}:${edge.kind}:${edge.toExternalId}`},
                  ${input.threadId}, ${fromNodeId}, ${toNodeId}, ${edge.kind}, NULL,
                  'deterministic', 'pending', ${completedAt}, ${completedAt}
                ) ON CONFLICT DO NOTHING
              `;
            }
            for (const chunk of result.chunks) {
              const localDocument = localDocumentByGatewayId.get(chunk.documentId);
              if (!localDocument) continue;
              const sourceBlockIdsJson = yield* encodeJson(chunk.sourceBlockIds ?? []);
              const metadataJson = yield* encodeJson(chunk.metadata ?? {});
              yield* sql`
                INSERT INTO qa_document_chunks (
                  id, thread_id, document_id, requirement_external_id, chunk_index,
                  text_content, byte_length, section_path, source_block_ids_json,
                  metadata_json, created_at, updated_at
                ) VALUES (
                  ${`qa-chunk:${input.threadId}:${chunk.id}`}, ${input.threadId}, ${localDocument.id},
                  ${chunk.requirementId ?? null}, ${chunk.index}, ${chunk.text},
                  ${chunk.byteLength}, ${chunk.sectionPath ?? null},
                  ${sourceBlockIdsJson}, ${metadataJson}, ${completedAt}, ${completedAt}
                )
              `;
            }
            yield* sql`
              UPDATE qa_documents SET status = 'processed', updated_at = ${completedAt}
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              UPDATE qa_ingestion_jobs
              SET status = 'completed', stage = 'completed', progress = 100,
                  message = ${result.helix.message}, last_error = NULL,
                  completed_at = ${completedAt}, updated_at = ${completedAt}
              WHERE id = ${jobId}
            `;
            yield* sql`
              UPDATE qa_releases
              SET phase = 'requirements_review', ingestion_status = 'completed',
                  ingestion_progress = 100, active_stage = 'requirements',
                  revision = revision + 1, updated_at = ${completedAt}
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              UPDATE qa_stage_states
              SET status = 'complete', progress = 100, active_job_id = ${jobId},
                  active_environment_id = NULL, active_conversation_thread_id = NULL,
                  active_provider_session_id = NULL,
                  blocked_reason = NULL, updated_at = ${completedAt}
              WHERE thread_id = ${input.threadId} AND stage = 'intake'
            `;
            yield* sql`
              UPDATE qa_stage_states
              SET status = 'awaiting_review', progress = 0, active_job_id = NULL,
                  active_environment_id = NULL, active_conversation_thread_id = NULL,
                  active_provider_session_id = NULL,
                  blocked_reason = NULL, updated_at = ${completedAt}
              WHERE thread_id = ${input.threadId} AND stage = 'requirements'
            `;
          }),
        );
        return yield* requireSnapshot(input.threadId);
      }),
    );

  const review = (input: QaReviewInput) =>
    mapQaFailure(
      "review",
      sql.withTransaction(
        Effect.gen(function* () {
          yield* requireSnapshot(input.threadId);
          const timestamp = yield* nowIso;
          const note = input.note?.trim() || null;
          const existing =
            input.targetType === "requirement"
              ? yield* sql<{ readonly id: string; readonly reviewRequired: number }>`
                  SELECT id, review_required AS "reviewRequired" FROM qa_requirements
                  WHERE id = ${input.targetId} AND thread_id = ${input.threadId}
                `
              : yield* sql<{ readonly id: string; readonly reviewRequired: number }>`
                  SELECT id, 1 AS "reviewRequired" FROM qa_approval_gates
                  WHERE id = ${input.targetId} AND thread_id = ${input.threadId}
                `;
          if (existing.length === 0) {
            return yield* operationError(
              "review_target_not_found",
              "The QA review target was not found.",
            );
          }
          if (input.targetType === "requirement" && !existing[0]?.reviewRequired) {
            return yield* operationError(
              "invalid_workflow_state",
              "Functional requirements are reviewed through their parent business requirement.",
            );
          }

          if (input.targetType === "gate" && input.decision === "approved") {
            const businessRequirements = yield* sql<{
              readonly total: number;
              readonly pending: number;
              readonly missingFrs: number;
            }>`
              SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN r.status != 'approved' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN NOT EXISTS (
                  SELECT 1
                  FROM qa_requirement_links l
                  JOIN qa_requirements child ON child.id = l.child_requirement_id
                  WHERE l.thread_id = r.thread_id
                    AND l.parent_requirement_id = r.id
                    AND child.requirement_type = 'functional'
                ) THEN 1 ELSE 0 END) AS "missingFrs"
              FROM qa_requirements r
              WHERE r.thread_id = ${input.threadId}
                AND r.requirement_type = 'business'
                AND r.review_required = 1
            `;
            const businessSummary = businessRequirements[0];
            if ((businessSummary?.total ?? 0) === 0) {
              return yield* operationError(
                "invalid_workflow_state",
                "At least one business requirement is required before approving the requirements gate.",
              );
            }
            if ((businessSummary?.missingFrs ?? 0) > 0) {
              return yield* operationError(
                "invalid_workflow_state",
                "Every business requirement must link to at least one functional requirement.",
              );
            }
            if ((businessSummary?.pending ?? 0) > 0) {
              return yield* operationError(
                "invalid_workflow_state",
                "Approve every review-required business requirement before approving the requirements gate.",
              );
            }
          }

          if (input.targetType === "requirement") {
            yield* sql`
              UPDATE qa_requirements
              SET status = ${input.decision}, decision_note = ${note}, updated_at = ${timestamp}
              WHERE id = ${input.targetId} AND thread_id = ${input.threadId}
            `;
          } else {
            yield* sql`
              UPDATE qa_approval_gates
              SET status = ${input.decision}, decision_note = ${note}, updated_at = ${timestamp}
              WHERE id = ${input.targetId} AND thread_id = ${input.threadId}
            `;
          }

          const pending = yield* sql<{ readonly count: number }>`
            SELECT CAST((
              (SELECT COUNT(*) FROM qa_requirements
                WHERE thread_id = ${input.threadId} AND requirement_type = 'business'
                  AND review_required = 1 AND status != 'approved') +
              (SELECT COUNT(*) FROM qa_approval_gates
                WHERE thread_id = ${input.threadId} AND status != 'approved')
            ) AS INTEGER) AS count
          `;
          const reviewProgressRows = yield* sql<{ readonly progress: number }>`
            SELECT CAST(
              100.0 * approved_count /
                CASE WHEN total_count < 1 THEN 1 ELSE total_count END AS INTEGER
            ) AS progress
            FROM (
              SELECT
                (SELECT COUNT(*) FROM qa_requirements
                  WHERE thread_id = ${input.threadId} AND requirement_type = 'business'
                    AND review_required = 1 AND status = 'approved') +
                (SELECT COUNT(*) FROM qa_approval_gates
                  WHERE thread_id = ${input.threadId} AND status = 'approved') AS approved_count,
                (SELECT COUNT(*) FROM qa_requirements
                  WHERE thread_id = ${input.threadId} AND requirement_type = 'business'
                    AND review_required = 1) +
                (SELECT COUNT(*) FROM qa_approval_gates
                  WHERE thread_id = ${input.threadId}) AS total_count
            ) review_counts
          `;
          const requirementsComplete = (pending[0]?.count ?? 1) === 0;
          const requirementsProgress = requirementsComplete
            ? 100
            : (reviewProgressRows[0]?.progress ?? 0);
          const nextPhase = requirementsComplete ? "ready" : "requirements_review";
          const nextActiveStage = requirementsComplete ? "strategy" : "requirements";
          yield* sql`
            UPDATE qa_releases
            SET phase = ${nextPhase}, active_stage = ${nextActiveStage},
                revision = revision + 1, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          yield* sql`
            UPDATE qa_stage_states
            SET status = ${requirementsComplete ? "complete" : "awaiting_review"},
                progress = ${requirementsProgress},
                active_job_id = NULL, active_environment_id = NULL,
                active_conversation_thread_id = NULL, active_provider_session_id = NULL,
                blocked_reason = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId} AND stage = 'requirements'
          `;
          if (requirementsComplete) {
            yield* sql`
              UPDATE qa_stage_states
              SET status = 'ready', progress = 0, active_job_id = NULL,
                  active_environment_id = NULL, active_conversation_thread_id = NULL,
                  active_provider_session_id = NULL,
                  blocked_reason = NULL, updated_at = ${timestamp}
              WHERE thread_id = ${input.threadId} AND stage = 'strategy'
            `;
          }
          return yield* requireSnapshot(input.threadId);
        }),
      ),
    );

  const requireAgentStageOwnership = Effect.fn("QaWorkflow.requireAgentStageOwnership")(function* (
    threadId: QaGetSnapshotInput["threadId"],
    stage: QaAgentStageProgressInput["stage"],
    owner: QaAgentGenerationOwner,
  ) {
    const owned = yield* sql<{ readonly activeJobId: string }>`
        UPDATE qa_stage_states
        SET active_provider_session_id = COALESCE(
          active_provider_session_id,
          ${owner.providerSessionId}
        )
        WHERE thread_id = ${threadId}
          AND stage = ${stage}
          AND status IN ('queued', 'running')
          AND active_job_id IS NOT NULL
          AND active_environment_id = ${owner.environmentId}
          AND active_conversation_thread_id = ${owner.conversationThreadId}
          AND (
            active_provider_session_id IS NULL
            OR active_provider_session_id = ${owner.providerSessionId}
          )
        RETURNING active_job_id AS "activeJobId"
      `;
    if (owned.length === 0) {
      return yield* operationError(
        "invalid_workflow_state",
        `The ${stage} generation job is not active for this agent session.`,
      );
    }
    return owned[0]!.activeJobId;
  });

  const reportAgentStageProgress = (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentStageProgressInput,
  ) =>
    mapQaFailure(
      "reportAgentStageProgress",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(threadId);
          if (snapshot.activeStage !== input.stage) {
            return yield* operationError(
              "invalid_workflow_state",
              `The active QA stage is ${snapshot.activeStage}, not ${input.stage}.`,
            );
          }
          yield* requireAgentStageOwnership(threadId, input.stage, owner);
          const timestamp = yield* nowIso;
          yield* sql`
            UPDATE qa_stage_states
            SET status = 'running', progress = ${input.progress}, blocked_reason = NULL,
                updated_at = ${timestamp}
            WHERE thread_id = ${threadId} AND stage = ${input.stage}
          `;
          if (input.stage === "strategy") {
            yield* sql`
              UPDATE qa_strategies
              SET generation_status = 'generating', revision = ${snapshot.revision + 1},
                  updated_at = ${timestamp}
              WHERE thread_id = ${threadId}
                AND generation_status IN ('queued', 'generating')
            `;
          }
          if (input.stage === "scenarios") {
            yield* sql`
              UPDATE qa_scenario_plans
              SET generation_status = 'generating', revision = ${snapshot.revision + 1},
                  updated_at = ${timestamp}
              WHERE thread_id = ${threadId}
                AND generation_status IN ('queued', 'generating')
            `;
          }
          if (input.stage === "test_cases") {
            yield* sql`
              UPDATE qa_test_case_plans
              SET generation_status = 'generating', revision = ${snapshot.revision + 1},
                  updated_at = ${timestamp}
              WHERE thread_id = ${threadId}
                AND generation_status IN ('queued', 'generating')
            `;
          }
          if (input.stage === "scripts") {
            yield* sql`
              UPDATE qa_script_plans
              SET generation_status = 'generating', revision = ${snapshot.revision + 1},
                  updated_at = ${timestamp}
              WHERE thread_id = ${threadId}
                AND generation_status IN ('queued', 'generating')
            `;
          }
          yield* sql`
            UPDATE qa_releases
            SET revision = revision + 1, updated_at = ${timestamp}
            WHERE thread_id = ${threadId}
          `;
          return yield* requireSnapshot(threadId);
        }),
      ),
    );

  const claimAgentStageGeneration = (
    threadId: QaGetSnapshotInput["threadId"],
    expectedRevision: number,
    jobId: string,
    owner: QaAgentGenerationClaimOwner,
  ) =>
    mapQaFailure(
      "claimAgentStageGeneration",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(threadId);
          yield* requireExpectedRevision(snapshot, expectedRevision);
          const stage = snapshot.activeStage;
          if (
            stage !== "strategy" &&
            stage !== "scenarios" &&
            stage !== "test_cases" &&
            stage !== "scripts"
          ) {
            return yield* operationError(
              "invalid_workflow_state",
              `The ${stage} stage is not generated by the release agent.`,
            );
          }
          const artifactExists =
            (stage === "strategy" && snapshot.strategy !== null) ||
            (stage === "scenarios" && snapshot.scenarioPlan !== null) ||
            (stage === "test_cases" && snapshot.testCasePlan !== null) ||
            (stage === "scripts" && snapshot.scriptPlan !== null);
          if (artifactExists) {
            return yield* operationError(
              "invalid_workflow_state",
              `The ${stage} artifact already exists and must be revised in place.`,
            );
          }

          const timestamp = yield* nowIso;
          const claimed = yield* sql<{ readonly threadId: string }>`
            UPDATE qa_stage_states
            SET status = 'queued', progress = 0, active_job_id = ${jobId},
                active_environment_id = ${owner.environmentId},
                active_conversation_thread_id = ${owner.conversationThreadId},
                active_provider_session_id = NULL,
                blocked_reason = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${threadId}
              AND stage = ${stage}
              AND status = 'ready'
              AND active_job_id IS NULL
            RETURNING thread_id AS "threadId"
          `;
          if (claimed.length === 0) {
            return yield* operationError(
              "invalid_workflow_state",
              `The ${stage} stage is not ready for generation or already has an active job.`,
            );
          }
          yield* sql`
            UPDATE qa_releases
            SET revision = revision + 1, updated_at = ${timestamp}
            WHERE thread_id = ${threadId}
          `;
          return yield* requireSnapshot(threadId);
        }),
      ),
    );

  const releaseAgentStageGeneration = (threadId: QaGetSnapshotInput["threadId"], jobId: string) =>
    mapQaFailure(
      "releaseAgentStageGeneration",
      sql.withTransaction(
        Effect.gen(function* () {
          const timestamp = yield* nowIso;
          const released = yield* sql<{ readonly threadId: string }>`
            UPDATE qa_stage_states
            SET status = 'ready', progress = 0, active_job_id = NULL,
                active_environment_id = NULL, active_conversation_thread_id = NULL,
                active_provider_session_id = NULL,
                blocked_reason = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${threadId}
              AND active_job_id = ${jobId}
              AND status IN ('queued', 'running')
            RETURNING thread_id AS "threadId"
          `;
          if (released.length > 0) {
            yield* sql`
              UPDATE qa_releases
              SET revision = revision + 1, updated_at = ${timestamp}
              WHERE thread_id = ${threadId}
            `;
          }
          return yield* requireSnapshot(threadId);
        }),
      ),
    );

  const releaseAgentStageGenerationForOwner = (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationClaimOwner,
  ) =>
    mapQaFailure(
      "releaseAgentStageGenerationForOwner",
      sql.withTransaction(
        Effect.gen(function* () {
          const timestamp = yield* nowIso;
          const released = yield* sql<{ readonly threadId: string }>`
            UPDATE qa_stage_states
            SET status = 'ready', progress = 0, active_job_id = NULL,
                active_environment_id = NULL, active_conversation_thread_id = NULL,
                active_provider_session_id = NULL,
                blocked_reason = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${threadId}
              AND active_environment_id = ${owner.environmentId}
              AND active_conversation_thread_id = ${owner.conversationThreadId}
              AND active_job_id IS NOT NULL
              AND status IN ('queued', 'running')
            RETURNING thread_id AS "threadId"
          `;
          if (released.length > 0) {
            yield* sql`
              UPDATE qa_releases
              SET revision = revision + 1, updated_at = ${timestamp}
              WHERE thread_id = ${threadId}
            `;
          }
          return {
            released: released.length > 0,
            snapshot: yield* requireSnapshot(threadId),
          } satisfies QaAgentStageGenerationReleaseResult;
        }),
      ),
    );

  const recoverStaleAgentStageGenerations = (input: {
    readonly environmentId: QaAgentGenerationClaimOwner["environmentId"];
    readonly updatedBefore: string;
  }) =>
    mapQaFailure(
      "recoverStaleAgentStageGenerations",
      sql.withTransaction(
        Effect.gen(function* () {
          const timestamp = yield* nowIso;
          const released = yield* sql<{ readonly threadId: string }>`
            UPDATE qa_stage_states
            SET status = 'ready', progress = 0, active_job_id = NULL,
                active_environment_id = NULL, active_conversation_thread_id = NULL,
                active_provider_session_id = NULL,
                blocked_reason = NULL, updated_at = ${timestamp}
            WHERE active_environment_id = ${input.environmentId}
              AND active_job_id IS NOT NULL
              AND status IN ('queued', 'running')
              AND updated_at < ${input.updatedBefore}
            RETURNING thread_id AS "threadId"
          `;
          const threadIds = [...new Set(released.map((row) => ThreadId.make(row.threadId)))];
          for (const threadId of threadIds) {
            yield* sql`
              UPDATE qa_releases
              SET revision = revision + 1, updated_at = ${timestamp}
              WHERE thread_id = ${threadId}
            `;
          }
          return yield* Effect.forEach(threadIds, (threadId) => requireSnapshot(threadId), {
            concurrency: 1,
          });
        }),
      ),
    );

  const submitAgentRequirements = (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitRequirementsInput,
  ) =>
    mapQaFailure(
      "submitAgentRequirements",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(threadId);
          if (snapshot.activeStage !== "requirements") {
            return yield* operationError(
              "invalid_workflow_state",
              `Requirement proposals are only accepted during the requirements stage; current stage is ${snapshot.activeStage}.`,
            );
          }
          yield* requireAgentStageOwnership(threadId, "requirements", owner);
          const documentIds = new Set(snapshot.documents.map((document) => document.id));
          const invalidSource = input.requirements.find((requirement) => {
            const sourceDocumentId =
              requirement.citation?.documentId ?? requirement.sourceDocumentId;
            return sourceDocumentId != null && !documentIds.has(sourceDocumentId);
          });
          const invalidSourceDocumentId =
            invalidSource?.citation?.documentId ?? invalidSource?.sourceDocumentId;
          if (invalidSourceDocumentId) {
            return yield* operationError(
              "invalid_workflow_state",
              `Requirement proposal references an unknown release document: ${invalidSourceDocumentId}.`,
            );
          }
          const mismatchedSource = input.requirements.find(
            (requirement) =>
              requirement.sourceDocumentId != null &&
              requirement.citation !== undefined &&
              requirement.sourceDocumentId !== requirement.citation.documentId,
          );
          if (mismatchedSource) {
            return yield* operationError(
              "invalid_workflow_state",
              "A requirement sourceDocumentId must match its citation documentId.",
            );
          }

          const proposedExternalIds = input.requirements.map(
            (requirement, index) =>
              requirement.externalId?.trim() ||
              `${requirement.requirementType === "business" ? "BR" : "FR"}-${String(index + 1).padStart(3, "0")}`,
          );
          if (new Set(proposedExternalIds).size !== proposedExternalIds.length) {
            return yield* operationError(
              "invalid_workflow_state",
              "Requirement external IDs must be unique within a release.",
            );
          }
          if (
            input.requirements.some(
              (requirement) =>
                requirement.requirementType === "business" &&
                requirement.parentExternalIds.length > 0,
            )
          ) {
            return yield* operationError(
              "invalid_workflow_state",
              "Business requirements cannot have requirement parents.",
            );
          }
          const proposalByExternalId = new Map(
            input.requirements.map((requirement, index) => [
              proposedExternalIds[index] ?? "",
              requirement,
            ]),
          );
          const invalidParent = input.requirements
            .flatMap((requirement) => requirement.parentExternalIds)
            .find((parentExternalId) => {
              const parent = proposalByExternalId.get(parentExternalId);
              return parent === undefined || parent.requirementType !== "business";
            });
          if (invalidParent !== undefined) {
            return yield* operationError(
              "invalid_workflow_state",
              `Functional requirement parent must reference a proposed business requirement: ${invalidParent}.`,
            );
          }

          const timestamp = yield* nowIso;
          yield* sql`DELETE FROM qa_requirements WHERE thread_id = ${threadId}`;
          const requirementIdByExternalId = new Map<string, string>();
          for (const [index, requirement] of input.requirements.entries()) {
            const externalId = proposedExternalIds[index] ?? String(index + 1);
            const stableId = NodeCrypto.createHash("sha256")
              .update(`${threadId}:${externalId}`)
              .digest("hex")
              .slice(0, 24);
            const requirementId = `qa-agent-requirement:${stableId}`;
            requirementIdByExternalId.set(externalId, requirementId);
            const sourceDocumentId =
              requirement.citation?.documentId ?? requirement.sourceDocumentId ?? null;
            const citation =
              requirement.citation === undefined
                ? null
                : encodeStoredCitation(requirement.citation);
            yield* sql`
              INSERT INTO qa_requirements (
                id, thread_id, source_document_id, external_id, requirement_type, review_required,
                source_citation, title, description, status, decision_note,
                created_at, updated_at
              ) VALUES (
                ${requirementId}, ${threadId}, ${sourceDocumentId}, ${externalId},
                ${requirement.requirementType},
                ${requirement.requirementType === "business" ? 1 : 0}, ${citation},
                ${requirement.title.trim()}, ${requirement.description.trim()}, 'pending', NULL,
                ${timestamp}, ${timestamp}
              )
            `;
            yield* sql`
              INSERT INTO qa_traceability_nodes (
                id, thread_id, kind, label, document_id, requirement_id, created_at, updated_at
              ) VALUES (
                ${requirementNodeId(requirementId)}, ${threadId},
                ${requirement.requirementType === "business" ? "business_requirement" : "functional_requirement"},
                ${externalId}, NULL, ${requirementId}, ${timestamp}, ${timestamp}
              )
            `;
            if (sourceDocumentId !== null) {
              yield* sql`
                INSERT INTO qa_traceability_edges (
                  id, thread_id, from_id, to_id, kind, citation, provenance, review_status,
                  created_at, updated_at
                ) VALUES (
                  ${`qa-edge:document-requirement:${sourceDocumentId}:${requirementId}`},
                  ${threadId}, ${documentNodeId(sourceDocumentId)},
                  ${requirementNodeId(requirementId)}, 'contains', ${citation}, 'agent',
                  'pending', ${timestamp}, ${timestamp}
                )
              `;
            }
          }
          for (const [index, requirement] of input.requirements.entries()) {
            const childExternalId = proposedExternalIds[index] ?? "";
            const childRequirementId = requirementIdByExternalId.get(childExternalId);
            if (childRequirementId === undefined) continue;
            const citation =
              requirement.citation === undefined
                ? null
                : encodeStoredCitation(requirement.citation);
            for (const parentExternalId of requirement.parentExternalIds) {
              const parentRequirementId = requirementIdByExternalId.get(parentExternalId);
              if (parentRequirementId === undefined) continue;
              yield* sql`
                INSERT INTO qa_requirement_links (
                  thread_id, parent_requirement_id, child_requirement_id, kind,
                  created_at, updated_at
                ) VALUES (
                  ${threadId}, ${parentRequirementId}, ${childRequirementId}, 'parent',
                  ${timestamp}, ${timestamp}
                )
              `;
              yield* sql`
                INSERT INTO qa_traceability_edges (
                  id, thread_id, from_id, to_id, kind, citation, provenance, review_status,
                  created_at, updated_at
                ) VALUES (
                  ${`qa-edge:requirement-parent:${parentRequirementId}:${childRequirementId}`},
                  ${threadId}, ${requirementNodeId(parentRequirementId)},
                  ${requirementNodeId(childRequirementId)}, 'parent_of', ${citation}, 'agent',
                  'pending', ${timestamp}, ${timestamp}
                )
              `;
            }
          }
          yield* sql`
            UPDATE qa_approval_gates
            SET status = 'pending', decision_note = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${threadId} AND kind = ${REQUIREMENTS_GATE_KIND}
          `;
          yield* sql`
            UPDATE qa_stage_states
            SET status = 'awaiting_review', progress = 0, active_job_id = NULL,
                active_environment_id = NULL, active_conversation_thread_id = NULL,
                active_provider_session_id = NULL,
                blocked_reason = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${threadId} AND stage = 'requirements'
          `;
          yield* sql`
            UPDATE qa_releases
            SET phase = 'requirements_review', active_stage = 'requirements',
                revision = revision + 1, updated_at = ${timestamp}
            WHERE thread_id = ${threadId}
          `;
          return yield* requireSnapshot(threadId);
        }),
      ),
    );

  const updateRequirement = (input: QaUpdateRequirementInput) =>
    mapQaFailure(
      "updateRequirement",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          if (snapshot.revision !== input.expectedRevision) {
            return yield* operationError(
              "invalid_workflow_state",
              `QA release revision changed from ${input.expectedRevision} to ${snapshot.revision}; refresh before saving.`,
            );
          }
          const current = snapshot.requirements.find(
            (requirement) => requirement.id === input.requirementId,
          );
          if (current === undefined) {
            return yield* operationError(
              "review_target_not_found",
              "The QA requirement was not found.",
            );
          }
          const nextExternalId = input.patch.externalId?.trim() ?? current.externalId;
          const nextTitle = input.patch.title?.trim() ?? current.title;
          const nextDescription = input.patch.description?.trim() ?? current.description;
          const nextParentRequirementIds =
            input.patch.parentRequirementIds ?? current.parentRequirementIds;
          if (current.requirementType === "business" && nextParentRequirementIds.length > 0) {
            return yield* operationError(
              "invalid_workflow_state",
              "Business requirements cannot have requirement parents.",
            );
          }
          if (nextParentRequirementIds.includes(current.id)) {
            return yield* operationError(
              "invalid_workflow_state",
              "A requirement cannot be its own parent.",
            );
          }
          let uniqueParentIds = [...new Set(nextParentRequirementIds)];
          if (uniqueParentIds.length > 0) {
            const validParents = yield* sql<{
              readonly id: string;
              readonly externalId: string;
            }>`
              SELECT id, external_id AS "externalId"
              FROM qa_requirements
              WHERE thread_id = ${input.threadId}
                AND requirement_type = 'business'
            `;
            const parentIdByReference = new Map(
              validParents.flatMap((parent) => [
                [parent.id, parent.id] as const,
                [parent.externalId, parent.id] as const,
              ]),
            );
            const resolvedParentIds = uniqueParentIds.map((parentId) =>
              parentIdByReference.get(parentId),
            );
            if (resolvedParentIds.some((parentId) => parentId === undefined)) {
              return yield* operationError(
                "invalid_workflow_state",
                "Requirement parents must reference business requirements in this release.",
              );
            }
            uniqueParentIds = resolvedParentIds.filter(
              (parentId): parentId is string => parentId !== undefined,
            );
          }
          const duplicateExternalId = yield* sql<{ readonly id: string }>`
            SELECT id FROM qa_requirements
            WHERE thread_id = ${input.threadId}
              AND external_id = ${nextExternalId}
              AND id != ${current.id}
          `;
          if (duplicateExternalId.length > 0) {
            return yield* operationError(
              "invalid_workflow_state",
              `Requirement external ID already exists: ${nextExternalId}.`,
            );
          }

          const timestamp = yield* nowIso;
          yield* sql`
            UPDATE qa_requirements
            SET external_id = ${nextExternalId}, title = ${nextTitle},
                description = ${nextDescription},
                status = CASE WHEN review_required = 1 THEN 'pending' ELSE status END,
                decision_note = CASE WHEN review_required = 1 THEN NULL ELSE decision_note END,
                updated_at = ${timestamp}
            WHERE id = ${current.id} AND thread_id = ${input.threadId}
          `;
          yield* sql`
            UPDATE qa_traceability_nodes
            SET label = ${nextExternalId}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId} AND requirement_id = ${current.id}
          `;
          yield* sql`
            DELETE FROM qa_requirement_links
            WHERE thread_id = ${input.threadId} AND child_requirement_id = ${current.id}
          `;
          yield* sql`
            DELETE FROM qa_traceability_edges
            WHERE thread_id = ${input.threadId}
              AND to_id = ${requirementNodeId(current.id)}
              AND kind = 'parent_of'
          `;
          const sourceCitation = current.sourceCitations[0];
          const citation =
            sourceCitation === undefined ? null : encodeStoredCitation(sourceCitation);
          for (const parentRequirementId of uniqueParentIds) {
            yield* sql`
              INSERT INTO qa_requirement_links (
                thread_id, parent_requirement_id, child_requirement_id, kind,
                created_at, updated_at
              ) VALUES (
                ${input.threadId}, ${parentRequirementId}, ${current.id}, 'parent',
                ${timestamp}, ${timestamp}
              )
            `;
            yield* sql`
              INSERT INTO qa_traceability_edges (
                id, thread_id, from_id, to_id, kind, citation, provenance, review_status,
                created_at, updated_at
              ) VALUES (
                ${`qa-edge:requirement-parent:${parentRequirementId}:${current.id}`},
                ${input.threadId}, ${requirementNodeId(parentRequirementId)},
                ${requirementNodeId(current.id)}, 'parent_of', ${citation}, 'agent',
                'pending', ${timestamp}, ${timestamp}
              )
            `;
          }
          yield* sql`
            UPDATE qa_approval_gates
            SET status = 'pending', decision_note = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId} AND kind = ${REQUIREMENTS_GATE_KIND}
          `;
          yield* sql`
            UPDATE qa_stage_states
            SET status = CASE
                  WHEN stage = 'requirements' THEN 'awaiting_review'
                  WHEN stage = 'strategy' THEN 'locked'
                  ELSE status
                END,
                progress = CASE WHEN stage IN ('requirements', 'strategy') THEN 0 ELSE progress END,
                updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
              AND stage IN ('requirements', 'strategy')
          `;
          yield* sql`
            UPDATE qa_releases
            SET phase = 'requirements_review', active_stage = 'requirements',
                revision = revision + 1, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          return yield* requireSnapshot(input.threadId);
        }),
      ),
    );

  const getStrategy = (input: QaGetStrategyInput) =>
    mapQaFailure("getStrategy", loadStrategy(input.threadId));

  const generateStrategy = (input: QaGenerateStrategyInput) =>
    mapQaFailure(
      "generateStrategy",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "strategy") {
            return yield* operationError(
              "invalid_workflow_state",
              `Strategy generation requires the active strategy stage; current stage is ${snapshot.activeStage}.`,
            );
          }
          const existing = yield* loadStrategy(input.threadId);
          if (existing?.reviewStatus === "approved") {
            return yield* operationError(
              "invalid_workflow_state",
              "The approved strategy is frozen.",
            );
          }
          if (existing?.reviewStatus === "pending_review") {
            return yield* operationError(
              "invalid_workflow_state",
              "The strategy is awaiting review and cannot be regenerated.",
            );
          }
          const approvedRequirements = snapshot.requirements.filter(
            (requirement) => requirement.reviewRequired && requirement.status === "approved",
          );
          if (approvedRequirements.length === 0) {
            return yield* operationError(
              "invalid_workflow_state",
              "Approve at least one business requirement before generating strategy.",
            );
          }

          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          const strategyId = existing?.id ?? `qa-strategy:${input.threadId}`;
          yield* sql`
            INSERT INTO qa_strategies (
              thread_id, id, title, revision, generation_status, review_status,
              rejection_note, created_at, updated_at, submitted_at, submitted_by,
              approved_at, approved_by, rejected_at, rejected_by
            ) VALUES (
              ${input.threadId}, ${strategyId}, ${`Test Strategy - ${snapshot.title}`},
              ${nextRevision}, 'queued', 'draft', NULL, ${timestamp}, ${timestamp},
              NULL, NULL, NULL, NULL, NULL, NULL
            )
            ON CONFLICT(thread_id) DO UPDATE SET
              title = excluded.title,
              revision = excluded.revision,
              generation_status = 'queued',
              review_status = 'draft',
              rejection_note = NULL,
              updated_at = excluded.updated_at,
              submitted_at = NULL,
              submitted_by = NULL,
              approved_at = NULL,
              approved_by = NULL,
              rejected_at = NULL,
              rejected_by = NULL
          `;
          yield* sql`DELETE FROM qa_strategy_sections WHERE thread_id = ${input.threadId}`;
          yield* sql`
            UPDATE qa_stage_states
            SET status = 'queued', progress = 0, blocked_reason = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId} AND stage = 'strategy'
          `;
          yield* sql`
            UPDATE qa_releases
            SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          return yield* strategyMutationResult(input.threadId);
        }),
      ),
    );

  const submitAgentStrategy = (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitStrategyInput,
  ) =>
    mapQaFailure(
      "submitAgentStrategy",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(threadId);
          if (snapshot.activeStage !== "strategy") {
            return yield* operationError(
              "invalid_workflow_state",
              `Strategy proposals are only accepted during the strategy stage; current stage is ${snapshot.activeStage}.`,
            );
          }
          yield* requireAgentStageOwnership(threadId, "strategy", owner);
          const existingStrategy = yield* loadStrategy(threadId);
          if (
            existingStrategy?.reviewStatus === "approved" ||
            existingStrategy?.reviewStatus === "pending_review"
          ) {
            return yield* operationError(
              "invalid_workflow_state",
              "Strategy proposals cannot replace a submitted or approved strategy.",
            );
          }
          const approvedRequirementIds = new Set(
            snapshot.requirements
              .filter((requirement) => requirement.status === "approved")
              .map((requirement) => requirement.id),
          );
          const invalidRequirementId = input.sections
            .flatMap((section) => section.sourceRequirementIds)
            .find((requirementId) => !approvedRequirementIds.has(requirementId));
          if (invalidRequirementId !== undefined) {
            return yield* operationError(
              "invalid_workflow_state",
              `Strategy section references an unapproved release requirement: ${invalidRequirementId}.`,
            );
          }

          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          const strategyId = existingStrategy?.id ?? `qa-strategy:${threadId}`;
          if (existingStrategy === null) {
            yield* sql`
              INSERT INTO qa_strategies (
                thread_id, id, title, revision, generation_status, review_status,
                rejection_note, created_at, updated_at, submitted_at, submitted_by,
                approved_at, approved_by, rejected_at, rejected_by
              ) VALUES (
                ${threadId}, ${strategyId}, ${`Test Strategy - ${snapshot.title}`},
                ${snapshot.revision}, 'queued', 'draft', NULL, ${timestamp}, ${timestamp},
                NULL, NULL, NULL, NULL, NULL, NULL
              )
            `;
          }
          yield* sql`DELETE FROM qa_strategy_sections WHERE thread_id = ${threadId}`;
          for (const [order, section] of input.sections.entries()) {
            const sectionId = `qa-strategy-section:${NodeCrypto.createHash("sha256")
              .update(`${strategyId}:${order}:${section.title}`)
              .digest("hex")
              .slice(0, 24)}`;
            yield* sql`
              INSERT INTO qa_strategy_sections (
                id, thread_id, title, order_index, content, created_at, updated_at
              ) VALUES (
                ${sectionId}, ${threadId}, ${section.title.trim()}, ${order},
                ${section.content.trim()}, ${timestamp}, ${timestamp}
              )
            `;
            for (const requirementId of new Set(section.sourceRequirementIds)) {
              yield* sql`
                INSERT INTO qa_strategy_section_requirements (
                  thread_id, section_id, requirement_id, created_at
                ) VALUES (${threadId}, ${sectionId}, ${requirementId}, ${timestamp})
              `;
            }
          }
          yield* sql`
            UPDATE qa_strategies
            SET revision = ${nextRevision}, generation_status = 'complete', review_status = 'draft',
                rejection_note = NULL, updated_at = ${timestamp}, submitted_at = NULL,
                submitted_by = NULL, approved_at = NULL, approved_by = NULL,
                rejected_at = NULL, rejected_by = NULL
            WHERE thread_id = ${threadId}
          `;
          yield* sql`
            UPDATE qa_stage_states
            SET status = 'awaiting_review', progress = 100, active_job_id = NULL,
                active_environment_id = NULL, active_conversation_thread_id = NULL,
                active_provider_session_id = NULL,
                blocked_reason = NULL,
                updated_at = ${timestamp}
            WHERE thread_id = ${threadId} AND stage = 'strategy'
          `;
          yield* sql`
            UPDATE qa_releases SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${threadId}
          `;
          return yield* requireSnapshot(threadId);
        }),
      ),
    );

  const updateStrategySection = (input: QaUpdateStrategySectionInput) =>
    mapQaFailure(
      "updateStrategySection",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          const strategy = yield* requireStrategy(input.threadId, input.strategyId);
          if (strategy.reviewStatus === "approved") {
            return yield* operationError(
              "invalid_workflow_state",
              "The approved strategy is frozen.",
            );
          }
          if (strategy.generationStatus !== "complete") {
            return yield* operationError(
              "invalid_workflow_state",
              "Wait for strategy generation to complete before editing sections.",
            );
          }
          const sectionRows = yield* sql<{ readonly id: string }>`
            SELECT id FROM qa_strategy_sections
            WHERE id = ${input.sectionId} AND thread_id = ${input.threadId}
          `;
          if (sectionRows.length === 0) {
            return yield* operationError(
              "review_target_not_found",
              "The strategy section was not found.",
            );
          }
          if (input.patch.sourceRequirementIds !== undefined) {
            const approvedIds = new Set(
              snapshot.requirements
                .filter((requirement) => requirement.status === "approved")
                .map((requirement) => requirement.id),
            );
            const invalidId = input.patch.sourceRequirementIds.find(
              (requirementId) => !approvedIds.has(requirementId),
            );
            if (invalidId !== undefined) {
              return yield* operationError(
                "invalid_workflow_state",
                `Strategy section references an unapproved release requirement: ${invalidId}.`,
              );
            }
          }

          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          yield* sql`
            UPDATE qa_strategy_sections
            SET title = COALESCE(${input.patch.title ?? null}, title),
                content = COALESCE(${input.patch.content ?? null}, content),
                updated_at = ${timestamp}
            WHERE id = ${input.sectionId} AND thread_id = ${input.threadId}
          `;
          if (input.patch.sourceRequirementIds !== undefined) {
            yield* sql`
              DELETE FROM qa_strategy_section_requirements
              WHERE thread_id = ${input.threadId} AND section_id = ${input.sectionId}
            `;
            for (const requirementId of new Set(input.patch.sourceRequirementIds)) {
              yield* sql`
                INSERT INTO qa_strategy_section_requirements (
                  thread_id, section_id, requirement_id, created_at
                ) VALUES (${input.threadId}, ${input.sectionId}, ${requirementId}, ${timestamp})
              `;
            }
          }
          yield* sql`
            UPDATE qa_strategies
            SET revision = ${nextRevision}, review_status = 'draft', rejection_note = NULL,
                updated_at = ${timestamp}, submitted_at = NULL, submitted_by = NULL,
                rejected_at = NULL, rejected_by = NULL
            WHERE thread_id = ${input.threadId}
          `;
          yield* sql`
            UPDATE qa_stage_states
            SET status = 'awaiting_review', updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId} AND stage = 'strategy'
          `;
          yield* sql`
            UPDATE qa_releases SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          return yield* strategyMutationResult(input.threadId);
        }),
      ),
    );

  const addStrategyComment = (input: QaAddStrategyCommentInput) =>
    mapQaFailure(
      "addStrategyComment",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          const strategy = yield* requireStrategy(input.threadId, input.strategyId);
          if (strategy.reviewStatus === "approved") {
            return yield* operationError(
              "invalid_workflow_state",
              "The approved strategy is frozen.",
            );
          }
          const section = strategy.sections.find((candidate) => candidate.id === input.sectionId);
          if (section === undefined) {
            return yield* operationError(
              "review_target_not_found",
              "The strategy section was not found.",
            );
          }
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          const commentId = `qa-strategy-comment:${NodeCrypto.createHash("sha256")
            .update(`${strategy.id}:${input.sectionId}:${timestamp}:${input.body}`)
            .digest("hex")
            .slice(0, 24)}`;
          yield* sql`
            INSERT INTO qa_strategy_comments (
              id, thread_id, section_id, quote, body, status, author, created_at,
              resolved_at, resolved_by
            ) VALUES (
              ${commentId}, ${input.threadId}, ${input.sectionId}, ${input.quote ?? null},
              ${input.body.trim()}, 'open', 'QA User', ${timestamp}, NULL, NULL
            )
          `;
          yield* sql`
            UPDATE qa_strategies SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          yield* sql`
            UPDATE qa_releases SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          return yield* strategyMutationResult(input.threadId);
        }),
      ),
    );

  const replyStrategyComment = (input: QaReplyStrategyCommentInput) =>
    mapQaFailure(
      "replyStrategyComment",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          const strategy = yield* requireStrategy(input.threadId, input.strategyId);
          if (strategy.reviewStatus === "approved") {
            return yield* operationError(
              "invalid_workflow_state",
              "The approved strategy is frozen.",
            );
          }
          const comment = strategy.comments.find((candidate) => candidate.id === input.commentId);
          if (comment === undefined || comment.status !== "open") {
            return yield* operationError(
              "review_target_not_found",
              "The open strategy comment was not found.",
            );
          }
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          const replyId = `qa-strategy-reply:${NodeCrypto.createHash("sha256")
            .update(`${comment.id}:${timestamp}:${input.body}`)
            .digest("hex")
            .slice(0, 24)}`;
          yield* sql`
            INSERT INTO qa_strategy_comment_replies (
              id, thread_id, comment_id, author, body, created_at
            ) VALUES (
              ${replyId}, ${input.threadId}, ${comment.id}, 'QA User',
              ${input.body.trim()}, ${timestamp}
            )
          `;
          yield* sql`
            UPDATE qa_strategies SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          yield* sql`
            UPDATE qa_releases SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          return yield* strategyMutationResult(input.threadId);
        }),
      ),
    );

  const resolveStrategyComment = (input: QaResolveStrategyCommentInput) =>
    mapQaFailure(
      "resolveStrategyComment",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          const strategy = yield* requireStrategy(input.threadId, input.strategyId);
          if (strategy.reviewStatus === "approved") {
            return yield* operationError(
              "invalid_workflow_state",
              "The approved strategy is frozen.",
            );
          }
          const comment = strategy.comments.find((candidate) => candidate.id === input.commentId);
          if (comment === undefined) {
            return yield* operationError(
              "review_target_not_found",
              "The strategy comment was not found.",
            );
          }
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          yield* sql`
            UPDATE qa_strategy_comments
            SET status = 'resolved', resolved_at = ${timestamp}, resolved_by = 'QA Approver'
            WHERE id = ${input.commentId} AND thread_id = ${input.threadId}
          `;
          yield* sql`
            UPDATE qa_strategies SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          yield* sql`
            UPDATE qa_releases SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          return yield* strategyMutationResult(input.threadId);
        }),
      ),
    );

  const submitStrategy = (input: QaSubmitStrategyInput) =>
    mapQaFailure(
      "submitStrategy",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          const strategy = yield* requireStrategy(input.threadId, input.strategyId);
          if (strategy.generationStatus !== "complete" || strategy.sections.length === 0) {
            return yield* operationError(
              "invalid_workflow_state",
              "Complete strategy generation before submitting for approval.",
            );
          }
          if (strategy.reviewStatus === "approved") {
            return yield* operationError(
              "invalid_workflow_state",
              "The strategy is already approved.",
            );
          }
          if (strategy.reviewStatus === "pending_review") {
            return yield* operationError(
              "invalid_workflow_state",
              "The strategy is already awaiting review.",
            );
          }
          if (strategy.coverage.totalRequirements === 0 || strategy.coverage.percent < 100) {
            return yield* operationError(
              "invalid_workflow_state",
              "Every approved business requirement must be covered by the strategy before submission.",
            );
          }
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          yield* sql`
            UPDATE qa_strategies
            SET revision = ${nextRevision}, review_status = 'pending_review',
                rejection_note = NULL, submitted_at = ${timestamp}, submitted_by = 'QA Inputter',
                rejected_at = NULL, rejected_by = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          yield* sql`
            UPDATE qa_stage_states
            SET status = 'awaiting_review', progress = 100, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId} AND stage = 'strategy'
          `;
          yield* sql`
            UPDATE qa_releases SET revision = ${nextRevision}, updated_at = ${timestamp}
            WHERE thread_id = ${input.threadId}
          `;
          return yield* strategyMutationResult(input.threadId);
        }),
      ),
    );

  const reviewStrategy = (
    input: QaReviewStrategyInput,
    approverActor: QaReviewActor = DEFAULT_APPROVER_ACTOR,
  ) =>
    mapQaFailure(
      "reviewStrategy",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          const strategy = yield* requireStrategy(input.threadId, input.strategyId);
          if (strategy.reviewStatus !== "pending_review") {
            return yield* operationError(
              "invalid_workflow_state",
              "Submit the strategy before recording an approval decision.",
            );
          }
          const durableDecision =
            input.decision === "approved" || input.decision === "changes_requested"
              ? input.decision
              : null;
          const decisionCheck = durableDecision
            ? yield* assertQaReviewDecisionAllowed(sql, {
                threadId: input.threadId,
                artifactKind: "strategy",
                artifactId: strategy.id,
                decision: durableDecision,
                ...(input.blockingCommentIds
                  ? { blockingThreadIds: input.blockingCommentIds }
                  : {}),
              }).pipe(Effect.mapError(mapReviewDecisionError))
            : null;
          if (
            input.decision === "approved" &&
            strategy.comments.some((comment) => comment.status === "open")
          ) {
            return yield* operationError(
              "invalid_workflow_state",
              "Resolve every open strategy comment before approval.",
            );
          }
          if (
            input.decision === "approved" &&
            (strategy.coverage.totalRequirements === 0 || strategy.coverage.percent < 100)
          ) {
            return yield* operationError(
              "invalid_workflow_state",
              "Strategy approval requires complete approved-requirement coverage.",
            );
          }
          const reviewedAt = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          if (input.decision === "approved") {
            yield* sql`
              UPDATE qa_strategies
              SET revision = ${nextRevision}, review_status = 'approved', rejection_note = NULL,
                  approved_at = ${reviewedAt}, approved_by = ${approverActor.displayName},
                  rejected_at = NULL, rejected_by = NULL, updated_at = ${reviewedAt}
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              UPDATE qa_stage_states
              SET status = 'complete', progress = 100, updated_at = ${reviewedAt}
              WHERE thread_id = ${input.threadId} AND stage = 'strategy'
            `;
            yield* sql`
              UPDATE qa_stage_states
              SET status = 'ready', progress = 0, blocked_reason = NULL, updated_at = ${reviewedAt}
              WHERE thread_id = ${input.threadId} AND stage = 'scenarios'
            `;
            yield* sql`
              UPDATE qa_releases
              SET active_stage = 'scenarios', revision = ${nextRevision}, updated_at = ${reviewedAt}
              WHERE thread_id = ${input.threadId}
            `;
          } else {
            const note =
              input.summary?.trim() || input.note?.trim() || "Changes requested by QA approver.";
            yield* sql`
              UPDATE qa_strategies
              SET revision = ${nextRevision}, review_status = 'rejected',
                  rejection_note = ${note}, rejected_at = ${reviewedAt},
                  rejected_by = ${approverActor.displayName}, approved_at = NULL, approved_by = NULL,
                  updated_at = ${reviewedAt}
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              UPDATE qa_stage_states
              SET status = 'awaiting_review', progress = 100, updated_at = ${reviewedAt}
              WHERE thread_id = ${input.threadId} AND stage = 'strategy'
            `;
            yield* sql`
              UPDATE qa_releases
              SET active_stage = 'strategy', revision = ${nextRevision}, updated_at = ${reviewedAt}
              WHERE thread_id = ${input.threadId}
            `;
          }
          if (durableDecision && decisionCheck) {
            yield* recordQaReviewDecision(sql, {
              threadId: input.threadId,
              artifactKind: "strategy",
              artifactId: strategy.id,
              decision: durableDecision,
              blockingThreadIds: decisionCheck.blockingThreadIds,
              ...(input.summary ? { summary: input.summary } : {}),
              actor: approverActor,
              timestamp: reviewedAt,
            }).pipe(Effect.mapError(mapReviewDecisionError));
          }
          const result = yield* strategyMutationResult(input.threadId);
          return {
            decision: input.decision,
            reviewedAt,
            ...result,
          } satisfies QaStrategyApprovalResult;
        }),
      ),
    );

  const getScenarioPlan = (input: QaGetScenarioPlanInput) =>
    mapQaFailure("getScenarioPlan", loadScenarioPlan(input.threadId));
  const submitAgentScenarios = (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitScenariosInput,
  ) =>
    mapQaFailure(
      "submitAgentScenarios",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(threadId);
          if (
            snapshot.activeStage !== "scenarios" ||
            snapshot.strategy?.reviewStatus !== "approved"
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Scenario proposals require an approved strategy and active scenarios stage.",
            );
          yield* requireAgentStageOwnership(threadId, "scenarios", owner);
          if (snapshot.scenarioPlan?.reviewStatus === "pending_review")
            return yield* operationError(
              "invalid_workflow_state",
              "The submitted scenario plan is frozen until QA review is complete.",
            );
          const approvedIds = new Set(
            snapshot.requirements.filter((r) => r.status === "approved").map((r) => r.id),
          );
          const invalid = input.scenarios
            .flatMap((s) => s.requirementIds)
            .find((id) => !approvedIds.has(id));
          if (invalid)
            return yield* operationError(
              "invalid_workflow_state",
              `Scenario references an unapproved requirement: ${invalid}.`,
            );
          if (new Set(input.scenarios.map((s) => s.externalId)).size !== input.scenarios.length)
            return yield* operationError(
              "invalid_workflow_state",
              "Scenario external IDs must be unique.",
            );
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          const planId = `qa-scenario-plan:${threadId}`;
          yield* sql`INSERT INTO qa_scenario_plans (thread_id,id,revision,generation_status,review_status,rejection_note,created_at,updated_at,submitted_at,submitted_by,approved_at,approved_by,rejected_at,rejected_by)
        VALUES (${threadId},${planId},${nextRevision},'complete','draft',NULL,${timestamp},${timestamp},NULL,NULL,NULL,NULL,NULL,NULL)
        ON CONFLICT(thread_id) DO UPDATE SET revision=excluded.revision,generation_status='complete',review_status='draft',rejection_note=NULL,updated_at=excluded.updated_at,submitted_at=NULL,submitted_by=NULL,approved_at=NULL,approved_by=NULL,rejected_at=NULL,rejected_by=NULL`;
          yield* sql`DELETE FROM qa_scenarios WHERE thread_id=${threadId}`;
          for (const scenario of input.scenarios) {
            const id = `qa-scenario:${NodeCrypto.createHash("sha256").update(`${threadId}:${scenario.externalId}`).digest("hex").slice(0, 24)}`;
            yield* sql`INSERT INTO qa_scenarios (id,thread_id,external_id,title,type,priority,risk,expected_outcome,status,decision_note,created_at,updated_at,submitted_at,submitted_by,approved_at,approved_by,rejected_at,rejected_by)
          VALUES (${id},${threadId},${scenario.externalId},${scenario.title},${scenario.type},${scenario.priority},${scenario.risk},${scenario.expectedOutcome},'pending',NULL,${timestamp},${timestamp},NULL,NULL,NULL,NULL,NULL,NULL)`;
            for (const requirementId of new Set(scenario.requirementIds))
              yield* sql`INSERT INTO qa_scenario_requirements (thread_id,scenario_id,requirement_id) VALUES (${threadId},${id},${requirementId})`;
            for (const [position, value] of scenario.preconditions.entries())
              yield* sql`INSERT INTO qa_scenario_preconditions (scenario_id,position,value) VALUES (${id},${position},${value})`;
          }
          yield* sql`
            UPDATE qa_stage_states
            SET status = 'awaiting_review', progress = 100, active_job_id = NULL,
                active_environment_id = NULL, active_conversation_thread_id = NULL,
                active_provider_session_id = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${threadId} AND stage = 'scenarios'
          `;
          yield* sql`UPDATE qa_releases SET revision=${nextRevision},updated_at=${timestamp} WHERE thread_id=${threadId}`;
          return yield* requireSnapshot(threadId);
        }),
      ),
    );

  const updateScenario = (input: QaUpdateScenarioInput) =>
    mapQaFailure(
      "updateScenario",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "scenarios")
            return yield* operationError(
              "invalid_workflow_state",
              "Scenario edits are only allowed during the active scenarios stage.",
            );
          const plan = yield* loadScenarioPlan(input.threadId);
          if (
            plan === null ||
            plan.id !== input.planId ||
            plan.reviewStatus === "approved" ||
            plan.reviewStatus === "pending_review"
          )
            return yield* operationError(
              "invalid_workflow_state",
              "The editable scenario plan was not found.",
            );
          const current = plan.scenarios.find((s) => s.id === input.scenarioId);
          if (!current)
            return yield* operationError("review_target_not_found", "Scenario not found.");
          const requirementIds = input.patch.requirementIds ?? current.requirementIds;
          const approved = new Set(
            snapshot.requirements.filter((r) => r.status === "approved").map((r) => r.id),
          );
          const invalid = requirementIds.find((id) => !approved.has(id));
          if (invalid)
            return yield* operationError(
              "invalid_workflow_state",
              `Scenario references an unapproved requirement: ${invalid}.`,
            );
          const timestamp = yield* nowIso;
          const next = snapshot.revision + 1;
          yield* sql`UPDATE qa_scenarios SET external_id=${input.patch.externalId ?? current.externalId},title=${input.patch.title ?? current.title},type=${input.patch.type ?? current.type},priority=${input.patch.priority ?? current.priority},risk=${input.patch.risk ?? current.risk},expected_outcome=${input.patch.expectedOutcome ?? current.expectedOutcome},status='pending',decision_note=NULL,updated_at=${timestamp} WHERE id=${current.id}`;
          if (input.patch.requirementIds) {
            yield* sql`DELETE FROM qa_scenario_requirements WHERE scenario_id=${current.id}`;
            for (const id of new Set(requirementIds))
              yield* sql`INSERT INTO qa_scenario_requirements(thread_id,scenario_id,requirement_id)VALUES(${input.threadId},${current.id},${id})`;
          }
          if (input.patch.preconditions) {
            yield* sql`DELETE FROM qa_scenario_preconditions WHERE scenario_id=${current.id}`;
            for (const [p, v] of input.patch.preconditions.entries())
              yield* sql`INSERT INTO qa_scenario_preconditions(scenario_id,position,value)VALUES(${current.id},${p},${v})`;
          }
          yield* sql`UPDATE qa_scenario_plans SET revision=${next},review_status='draft',rejection_note=NULL,updated_at=${timestamp},submitted_at=NULL,submitted_by=NULL,rejected_at=NULL,rejected_by=NULL WHERE thread_id=${input.threadId}`;
          yield* sql`UPDATE qa_releases SET revision=${next},updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
          return yield* scenarioMutationResult(input.threadId);
        }),
      ),
    );

  const submitScenarioPlan = (input: QaSubmitScenarioPlanInput) =>
    mapQaFailure(
      "submitScenarioPlan",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "scenarios")
            return yield* operationError(
              "invalid_workflow_state",
              "Scenario submission requires the active scenarios stage.",
            );
          const plan = yield* loadScenarioPlan(input.threadId);
          if (
            !plan ||
            plan.id !== input.planId ||
            plan.generationStatus !== "complete" ||
            plan.reviewStatus === "pending_review" ||
            plan.reviewStatus === "approved" ||
            !plan.scenarios.length
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Complete scenario generation before submission.",
            );
          const required = snapshot.requirements
            .filter((r) => r.reviewRequired && r.status === "approved")
            .map((r) => r.id);
          const covered = new Set(plan.scenarios.flatMap((s) => s.requirementIds));
          if (required.some((id) => !covered.has(id)))
            return yield* operationError(
              "invalid_workflow_state",
              "Every approved business requirement must have scenario coverage.",
            );
          const t = yield* nowIso;
          const next = snapshot.revision + 1;
          yield* sql`UPDATE qa_scenario_plans SET revision=${next},review_status='pending_review',submitted_at=${t},submitted_by='QA Inputter',updated_at=${t} WHERE thread_id=${input.threadId}`;
          yield* sql`UPDATE qa_scenarios SET submitted_at=${t},submitted_by='QA Inputter',updated_at=${t} WHERE thread_id=${input.threadId}`;
          yield* sql`UPDATE qa_releases SET revision=${next},updated_at=${t} WHERE thread_id=${input.threadId}`;
          return yield* scenarioMutationResult(input.threadId);
        }),
      ),
    );
  const reviewScenarioPlan = (
    input: QaReviewScenarioPlanInput,
    approverActor: QaReviewActor = DEFAULT_APPROVER_ACTOR,
  ) =>
    mapQaFailure(
      "reviewScenarioPlan",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "scenarios")
            return yield* operationError(
              "invalid_workflow_state",
              "Scenario review requires the active scenarios stage.",
            );
          const plan = yield* loadScenarioPlan(input.threadId);
          if (!plan || plan.id !== input.planId || plan.reviewStatus !== "pending_review")
            return yield* operationError(
              "invalid_workflow_state",
              "Submit the scenario plan before review.",
            );
          const durableDecision =
            input.decision === "approved" || input.decision === "changes_requested"
              ? input.decision
              : null;
          const decisionCheck = durableDecision
            ? yield* assertQaReviewDecisionAllowed(sql, {
                threadId: input.threadId,
                artifactKind: "scenario_plan",
                artifactId: plan.id,
                decision: durableDecision,
                ...(input.blockingCommentIds
                  ? { blockingThreadIds: input.blockingCommentIds }
                  : {}),
              }).pipe(Effect.mapError(mapReviewDecisionError))
            : null;
          const t = yield* nowIso;
          const next = snapshot.revision + 1;
          if (input.decision === "approved") {
            yield* sql`UPDATE qa_scenario_plans SET revision=${next},review_status='approved',approved_at=${t},approved_by=${approverActor.displayName},updated_at=${t} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_scenarios SET status='approved',approved_at=${t},approved_by=${approverActor.displayName},updated_at=${t} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_stage_states SET status='complete',progress=100,updated_at=${t} WHERE thread_id=${input.threadId} AND stage='scenarios'`;
            yield* sql`UPDATE qa_stage_states SET status='ready',progress=0,updated_at=${t} WHERE thread_id=${input.threadId} AND stage='test_cases'`;
            yield* sql`UPDATE qa_releases SET active_stage='test_cases',revision=${next},updated_at=${t} WHERE thread_id=${input.threadId}`;
          } else {
            const note =
              input.summary?.trim() || input.note?.trim() || "Changes requested by QA approver.";
            yield* sql`UPDATE qa_scenario_plans SET revision=${next},review_status='rejected',rejection_note=${note},rejected_at=${t},rejected_by=${approverActor.displayName},updated_at=${t} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_scenarios SET status='rejected',decision_note=${note},rejected_at=${t},rejected_by=${approverActor.displayName},updated_at=${t} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_releases SET revision=${next},updated_at=${t} WHERE thread_id=${input.threadId}`;
          }
          if (durableDecision && decisionCheck) {
            yield* recordQaReviewDecision(sql, {
              threadId: input.threadId,
              artifactKind: "scenario_plan",
              artifactId: plan.id,
              decision: durableDecision,
              blockingThreadIds: decisionCheck.blockingThreadIds,
              ...(input.summary ? { summary: input.summary } : {}),
              actor: approverActor,
              timestamp: t,
            }).pipe(Effect.mapError(mapReviewDecisionError));
          }
          const result = yield* scenarioMutationResult(input.threadId);
          return {
            decision: input.decision,
            reviewedAt: t,
            ...result,
          } satisfies QaScenarioPlanApprovalResult;
        }),
      ),
    );

  const getTestCasePlan = (input: QaGetTestCasePlanInput) =>
    mapQaFailure("getTestCasePlan", loadTestCasePlan(input.threadId));
  const submitAgentTestCases = (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitTestCasesInput,
  ) =>
    mapQaFailure(
      "submitAgentTestCases",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(threadId);
          if (
            snapshot.activeStage !== "test_cases" ||
            snapshot.scenarioPlan?.reviewStatus !== "approved"
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Test case proposals require an approved scenario plan and active test case stage.",
            );
          yield* requireAgentStageOwnership(threadId, "test_cases", owner);
          if (snapshot.testCasePlan?.reviewStatus === "pending_review")
            return yield* operationError(
              "invalid_workflow_state",
              "The submitted test case plan is frozen until QA review is complete.",
            );
          const scenarioIds = new Set(
            snapshot.scenarioPlan.scenarios.filter((s) => s.status === "approved").map((s) => s.id),
          );
          const requirementIds = new Set(
            snapshot.requirements.filter((r) => r.status === "approved").map((r) => r.id),
          );
          const invalidScenario = input.testCases
            .flatMap((t) => t.scenarioIds)
            .find((id) => !scenarioIds.has(id));
          const invalidRequirement = input.testCases
            .flatMap((t) => t.requirementIds)
            .find((id) => !requirementIds.has(id));
          if (invalidScenario)
            return yield* operationError(
              "invalid_workflow_state",
              `Test case references an unapproved scenario: ${invalidScenario}.`,
            );
          if (invalidRequirement)
            return yield* operationError(
              "invalid_workflow_state",
              `Test case references an unapproved requirement: ${invalidRequirement}.`,
            );
          if (
            new Set(input.testCases.map((testCase) => testCase.externalId)).size !==
            input.testCases.length
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Test case external IDs must be unique.",
            );
          const ts = yield* nowIso;
          const next = snapshot.revision + 1;
          const planId = `qa-test-case-plan:${threadId}`;
          yield* sql`INSERT INTO qa_test_case_plans(thread_id,id,revision,generation_status,review_status,rejection_note,created_at,updated_at,submitted_at,submitted_by,approved_at,approved_by,rejected_at,rejected_by)VALUES(${threadId},${planId},${next},'complete','draft',NULL,${ts},${ts},NULL,NULL,NULL,NULL,NULL,NULL)ON CONFLICT(thread_id)DO UPDATE SET revision=excluded.revision,generation_status='complete',review_status='draft',rejection_note=NULL,updated_at=excluded.updated_at,submitted_at=NULL,submitted_by=NULL,approved_at=NULL,approved_by=NULL,rejected_at=NULL,rejected_by=NULL`;
          yield* sql`DELETE FROM qa_traceability_nodes WHERE thread_id=${threadId} AND kind='test'`;
          yield* sql`DELETE FROM qa_test_cases WHERE thread_id=${threadId}`;
          for (const tc of input.testCases) {
            const id = `qa-test-case:${NodeCrypto.createHash("sha256").update(`${threadId}:${tc.externalId}`).digest("hex").slice(0, 24)}`;
            yield* sql`INSERT INTO qa_test_cases(id,thread_id,external_id,title,priority,automation_candidate,status,decision_note,created_at,updated_at,submitted_at,submitted_by,approved_at,approved_by,rejected_at,rejected_by)VALUES(${id},${threadId},${tc.externalId},${tc.title},${tc.priority},${tc.automationCandidate ? 1 : 0},'pending',NULL,${ts},${ts},NULL,NULL,NULL,NULL,NULL,NULL)`;
            const graphNodeId = testCaseNodeId(id);
            yield* sql`INSERT INTO qa_traceability_nodes(id,thread_id,kind,label,external_id,document_id,requirement_id,created_at,updated_at)VALUES(${graphNodeId},${threadId},'test',${tc.title},${tc.externalId},NULL,NULL,${ts},${ts})`;
            for (const sid of new Set(tc.scenarioIds))
              yield* sql`INSERT INTO qa_test_case_scenarios(thread_id,test_case_id,scenario_id)VALUES(${threadId},${id},${sid})`;
            for (const rid of new Set(tc.requirementIds)) {
              yield* sql`INSERT INTO qa_test_case_requirements(thread_id,test_case_id,requirement_id)VALUES(${threadId},${id},${rid})`;
              yield* sql`INSERT INTO qa_traceability_edges(id,thread_id,from_id,to_id,kind,citation,provenance,review_status,created_at,updated_at)VALUES(${`qa-edge:requirement-test:${rid}:${id}`},${threadId},${requirementNodeId(rid)},${graphNodeId},'trace_to_test',NULL,'agent','pending',${ts},${ts})`;
            }
            for (const [p, v] of tc.preconditions.entries())
              yield* sql`INSERT INTO qa_test_case_preconditions(test_case_id,position,value)VALUES(${id},${p},${v})`;
            for (const step of tc.steps)
              yield* sql`INSERT INTO qa_test_case_steps(test_case_id,step_order,action,test_data,expected_result)VALUES(${id},${step.order},${step.action},${step.testData},${step.expectedResult})`;
          }
          yield* sql`
            UPDATE qa_stage_states
            SET status = 'awaiting_review', progress = 100, active_job_id = NULL,
                active_environment_id = NULL, active_conversation_thread_id = NULL,
                active_provider_session_id = NULL, updated_at = ${ts}
            WHERE thread_id = ${threadId} AND stage = 'test_cases'
          `;
          yield* sql`UPDATE qa_releases SET revision=${next},updated_at=${ts} WHERE thread_id=${threadId}`;
          return yield* requireSnapshot(threadId);
        }),
      ),
    );
  const updateTestCase = (input: QaUpdateTestCaseInput) =>
    mapQaFailure(
      "updateTestCase",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "test_cases")
            return yield* operationError(
              "invalid_workflow_state",
              "Test case edits are only allowed during the active test case stage.",
            );
          const plan = yield* loadTestCasePlan(input.threadId);
          if (
            !plan ||
            plan.id !== input.planId ||
            plan.reviewStatus === "approved" ||
            plan.reviewStatus === "pending_review"
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Editable test case plan not found.",
            );
          const current = plan.testCases.find((t) => t.id === input.testCaseId);
          if (!current)
            return yield* operationError("review_target_not_found", "Test case not found.");
          const scenarioIds = input.patch.scenarioIds ?? current.scenarioIds;
          const requirementIds = input.patch.requirementIds ?? current.requirementIds;
          const validScenarios = new Set(
            snapshot.scenarioPlan?.scenarios
              .filter((s) => s.status === "approved")
              .map((s) => s.id) ?? [],
          );
          const validRequirements = new Set(
            snapshot.requirements.filter((r) => r.status === "approved").map((r) => r.id),
          );
          if (
            scenarioIds.some((id) => !validScenarios.has(id)) ||
            requirementIds.some((id) => !validRequirements.has(id))
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Test case links must reference approved scenarios and requirements.",
            );
          const ts = yield* nowIso;
          const next = snapshot.revision + 1;
          yield* sql`UPDATE qa_test_cases SET external_id=${input.patch.externalId ?? current.externalId},title=${input.patch.title ?? current.title},priority=${input.patch.priority ?? current.priority},automation_candidate=${(input.patch.automationCandidate ?? current.automationCandidate) ? 1 : 0},status='pending',decision_note=NULL,updated_at=${ts} WHERE id=${current.id}`;
          const graphNodeId = testCaseNodeId(current.id);
          yield* sql`UPDATE qa_traceability_nodes SET label=${input.patch.title ?? current.title},external_id=${input.patch.externalId ?? current.externalId},updated_at=${ts} WHERE id=${graphNodeId}`;
          if (input.patch.scenarioIds) {
            yield* sql`DELETE FROM qa_test_case_scenarios WHERE test_case_id=${current.id}`;
            for (const id of new Set(scenarioIds))
              yield* sql`INSERT INTO qa_test_case_scenarios(thread_id,test_case_id,scenario_id)VALUES(${input.threadId},${current.id},${id})`;
          }
          if (input.patch.requirementIds) {
            yield* sql`DELETE FROM qa_test_case_requirements WHERE test_case_id=${current.id}`;
            yield* sql`DELETE FROM qa_traceability_edges WHERE thread_id=${input.threadId} AND to_id=${graphNodeId} AND kind='trace_to_test'`;
            for (const id of new Set(requirementIds)) {
              yield* sql`INSERT INTO qa_test_case_requirements(thread_id,test_case_id,requirement_id)VALUES(${input.threadId},${current.id},${id})`;
              yield* sql`INSERT INTO qa_traceability_edges(id,thread_id,from_id,to_id,kind,citation,provenance,review_status,created_at,updated_at)VALUES(${`qa-edge:requirement-test:${id}:${current.id}`},${input.threadId},${requirementNodeId(id)},${graphNodeId},'trace_to_test',NULL,'agent','pending',${ts},${ts})`;
            }
          }
          if (input.patch.preconditions) {
            yield* sql`DELETE FROM qa_test_case_preconditions WHERE test_case_id=${current.id}`;
            for (const [p, v] of input.patch.preconditions.entries())
              yield* sql`INSERT INTO qa_test_case_preconditions(test_case_id,position,value)VALUES(${current.id},${p},${v})`;
          }
          if (input.patch.steps) {
            yield* sql`DELETE FROM qa_test_case_steps WHERE test_case_id=${current.id}`;
            for (const step of input.patch.steps)
              yield* sql`INSERT INTO qa_test_case_steps(test_case_id,step_order,action,test_data,expected_result)VALUES(${current.id},${step.order},${step.action},${step.testData},${step.expectedResult})`;
          }
          yield* sql`UPDATE qa_test_case_plans SET revision=${next},review_status='draft',updated_at=${ts},submitted_at=NULL,submitted_by=NULL WHERE thread_id=${input.threadId}`;
          yield* sql`UPDATE qa_releases SET revision=${next},updated_at=${ts} WHERE thread_id=${input.threadId}`;
          return yield* testCaseMutationResult(input.threadId);
        }),
      ),
    );
  const submitTestCasePlan = (input: QaSubmitTestCasePlanInput) =>
    mapQaFailure(
      "submitTestCasePlan",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "test_cases")
            return yield* operationError(
              "invalid_workflow_state",
              "Test case submission requires the active test case stage.",
            );
          const plan = yield* loadTestCasePlan(input.threadId);
          if (
            !plan ||
            plan.id !== input.planId ||
            plan.generationStatus !== "complete" ||
            plan.reviewStatus === "pending_review" ||
            plan.reviewStatus === "approved" ||
            !plan.testCases.length
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Complete test case generation before submission.",
            );
          const scenarioIds =
            snapshot.scenarioPlan?.scenarios
              .filter((s) => s.status === "approved")
              .map((s) => s.id) ?? [];
          const covered = new Set(plan.testCases.flatMap((t) => t.scenarioIds));
          if (scenarioIds.some((id) => !covered.has(id)))
            return yield* operationError(
              "invalid_workflow_state",
              "Every approved scenario must have test case coverage.",
            );
          const ts = yield* nowIso;
          const next = snapshot.revision + 1;
          yield* sql`UPDATE qa_test_case_plans SET revision=${next},review_status='pending_review',submitted_at=${ts},submitted_by='QA Inputter',updated_at=${ts} WHERE thread_id=${input.threadId}`;
          yield* sql`UPDATE qa_test_cases SET submitted_at=${ts},submitted_by='QA Inputter',updated_at=${ts} WHERE thread_id=${input.threadId}`;
          yield* sql`UPDATE qa_releases SET revision=${next},updated_at=${ts} WHERE thread_id=${input.threadId}`;
          return yield* testCaseMutationResult(input.threadId);
        }),
      ),
    );
  const reviewTestCasePlan = (input: QaReviewTestCasePlanInput) =>
    mapQaFailure(
      "reviewTestCasePlan",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "test_cases")
            return yield* operationError(
              "invalid_workflow_state",
              "Test case review requires the active test case stage.",
            );
          const plan = yield* loadTestCasePlan(input.threadId);
          if (!plan || plan.id !== input.planId || plan.reviewStatus !== "pending_review")
            return yield* operationError(
              "invalid_workflow_state",
              "Submit the test case plan before review.",
            );
          const ts = yield* nowIso;
          const next = snapshot.revision + 1;
          if (input.decision === "approved") {
            yield* sql`UPDATE qa_test_case_plans SET revision=${next},review_status='approved',approved_at=${ts},approved_by='QA Approver',updated_at=${ts} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_test_cases SET status='approved',approved_at=${ts},approved_by='QA Approver',updated_at=${ts} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_traceability_edges SET review_status='approved',updated_at=${ts} WHERE thread_id=${input.threadId} AND kind='trace_to_test'`;
            yield* sql`UPDATE qa_stage_states SET status='complete',progress=100,updated_at=${ts} WHERE thread_id=${input.threadId} AND stage='test_cases'`;
            yield* sql`UPDATE qa_stage_states SET status='ready',progress=0,updated_at=${ts} WHERE thread_id=${input.threadId} AND stage='scripts'`;
            yield* sql`UPDATE qa_releases SET active_stage='scripts',revision=${next},updated_at=${ts} WHERE thread_id=${input.threadId}`;
          } else {
            const note = input.note?.trim() || "Test case plan rejected.";
            yield* sql`UPDATE qa_test_case_plans SET revision=${next},review_status='rejected',rejection_note=${note},rejected_at=${ts},rejected_by='QA Approver',updated_at=${ts} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_test_cases SET status='rejected',decision_note=${note},rejected_at=${ts},rejected_by='QA Approver',updated_at=${ts} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_traceability_edges SET review_status='rejected',updated_at=${ts} WHERE thread_id=${input.threadId} AND kind='trace_to_test'`;
            yield* sql`UPDATE qa_releases SET revision=${next},updated_at=${ts} WHERE thread_id=${input.threadId}`;
          }
          const result = yield* testCaseMutationResult(input.threadId);
          return {
            decision: input.decision,
            reviewedAt: ts,
            ...result,
          } satisfies QaTestCasePlanApprovalResult;
        }),
      ),
    );

  const getScriptPlan = (input: QaGetScriptPlanInput) =>
    mapQaFailure("getScriptPlan", loadScriptPlan(input.threadId));
  const submitAgentScripts = (
    threadId: QaGetSnapshotInput["threadId"],
    owner: QaAgentGenerationOwner,
    input: QaAgentSubmitScriptsInput,
  ) =>
    mapQaFailure(
      "submitAgentScripts",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(threadId);
          if (
            snapshot.activeStage !== "scripts" ||
            snapshot.testCasePlan?.reviewStatus !== "approved"
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Script proposals require an approved test-case plan and active scripts stage.",
            );
          yield* requireAgentStageOwnership(threadId, "scripts", owner);
          if (snapshot.scriptPlan?.reviewStatus === "pending_review")
            return yield* operationError(
              "invalid_workflow_state",
              "The submitted script plan is frozen until QA review is complete.",
            );
          const validTestCases = new Set(
            snapshot.testCasePlan.testCases
              .filter((item) => item.status === "approved")
              .map((item) => item.id),
          );
          const validRequirements = new Set(
            snapshot.requirements
              .filter((item) => item.status === "approved")
              .map((item) => item.id),
          );
          const invalidTestCase = input.scripts
            .flatMap((item) => item.testCaseIds)
            .find((id) => !validTestCases.has(id));
          const invalidRequirement = input.scripts
            .flatMap((item) => item.requirementIds)
            .find((id) => !validRequirements.has(id));
          if (invalidTestCase || invalidRequirement)
            return yield* operationError(
              "invalid_workflow_state",
              "Scripts must link only to approved test cases and requirements.",
            );
          if (
            new Set(input.scripts.map((item) => item.externalId)).size !== input.scripts.length ||
            new Set(input.scripts.map((item) => item.fileName)).size !== input.scripts.length
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Script external IDs and file names must be unique.",
            );
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          const planId = `qa-script-plan:${threadId}`;
          yield* sql`INSERT INTO qa_script_plans(thread_id,id,revision,generation_status,review_status,rejection_note,created_at,updated_at,submitted_at,submitted_by,approved_at,approved_by,rejected_at,rejected_by)
            VALUES(${threadId},${planId},${nextRevision},'complete','draft',NULL,${timestamp},${timestamp},NULL,NULL,NULL,NULL,NULL,NULL)
            ON CONFLICT(thread_id) DO UPDATE SET revision=excluded.revision,generation_status='complete',review_status='draft',rejection_note=NULL,updated_at=excluded.updated_at,submitted_at=NULL,submitted_by=NULL,approved_at=NULL,approved_by=NULL,rejected_at=NULL,rejected_by=NULL`;
          yield* sql`DELETE FROM qa_scripts WHERE thread_id=${threadId}`;
          for (const script of input.scripts) {
            const id = `qa-script:${NodeCrypto.createHash("sha256").update(`${threadId}:${script.externalId}`).digest("hex").slice(0, 24)}`;
            yield* sql`INSERT INTO qa_scripts(id,thread_id,external_id,title,framework,language,file_name,content,status,execution_status,last_run_at,created_at,updated_at)
              VALUES(${id},${threadId},${script.externalId},${script.title},${script.framework},${script.language},${script.fileName},${script.content},'draft','not_run',NULL,${timestamp},${timestamp})`;
            for (const testCaseId of new Set(script.testCaseIds))
              yield* sql`INSERT INTO qa_script_test_cases(thread_id,script_id,test_case_id) VALUES(${threadId},${id},${testCaseId})`;
            for (const requirementId of new Set(script.requirementIds))
              yield* sql`INSERT INTO qa_script_requirements(thread_id,script_id,requirement_id) VALUES(${threadId},${id},${requirementId})`;
          }
          yield* sql`
            UPDATE qa_stage_states
            SET status = 'awaiting_review', progress = 100, active_job_id = NULL,
                active_environment_id = NULL, active_conversation_thread_id = NULL,
                active_provider_session_id = NULL, updated_at = ${timestamp}
            WHERE thread_id = ${threadId} AND stage = 'scripts'
          `;
          yield* sql`UPDATE qa_releases SET revision=${nextRevision},updated_at=${timestamp} WHERE thread_id=${threadId}`;
          return yield* requireSnapshot(threadId);
        }),
      ),
    );

  const updateScript = (input: QaUpdateScriptInput) =>
    mapQaFailure(
      "updateScript",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "scripts")
            return yield* operationError(
              "invalid_workflow_state",
              "Script edits are only allowed during the active scripts stage.",
            );
          const plan = yield* loadScriptPlan(input.threadId);
          if (
            !plan ||
            plan.id !== input.planId ||
            plan.reviewStatus === "pending_review" ||
            plan.reviewStatus === "approved"
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Editable script plan not found.",
            );
          const current = plan.scripts.find((item) => item.id === input.scriptId);
          if (!current)
            return yield* operationError("review_target_not_found", "Script not found.");
          const testCaseIds = input.patch.testCaseIds ?? current.testCaseIds;
          const requirementIds = input.patch.requirementIds ?? current.requirementIds;
          const validTestCases = new Set(
            snapshot.testCasePlan?.testCases
              .filter((item) => item.status === "approved")
              .map((item) => item.id) ?? [],
          );
          const validRequirements = new Set(
            snapshot.requirements
              .filter((item) => item.status === "approved")
              .map((item) => item.id),
          );
          if (
            testCaseIds.some((id) => !validTestCases.has(id)) ||
            requirementIds.some((id) => !validRequirements.has(id))
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Script links must reference approved test cases and requirements.",
            );
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          yield* sql`UPDATE qa_scripts SET external_id=${input.patch.externalId ?? current.externalId},title=${input.patch.title ?? current.title},framework=${input.patch.framework ?? current.framework},language=${input.patch.language ?? current.language},file_name=${input.patch.fileName ?? current.fileName},content=${input.patch.content ?? current.content},status='draft',execution_status='not_run',last_run_at=NULL,updated_at=${timestamp} WHERE id=${current.id}`;
          yield* sql`DELETE FROM qa_script_evidence WHERE script_id=${current.id}`;
          if (input.patch.testCaseIds) {
            yield* sql`DELETE FROM qa_script_test_cases WHERE script_id=${current.id}`;
            for (const id of new Set(testCaseIds))
              yield* sql`INSERT INTO qa_script_test_cases(thread_id,script_id,test_case_id) VALUES(${input.threadId},${current.id},${id})`;
          }
          if (input.patch.requirementIds) {
            yield* sql`DELETE FROM qa_script_requirements WHERE script_id=${current.id}`;
            for (const id of new Set(requirementIds))
              yield* sql`INSERT INTO qa_script_requirements(thread_id,script_id,requirement_id) VALUES(${input.threadId},${current.id},${id})`;
          }
          yield* sql`UPDATE qa_script_plans SET revision=${nextRevision},review_status='draft',rejection_note=NULL,submitted_at=NULL,submitted_by=NULL,rejected_at=NULL,rejected_by=NULL,updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
          yield* sql`UPDATE qa_releases SET revision=${nextRevision},updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
          return yield* scriptMutationResult(input.threadId);
        }),
      ),
    );

  const submitScriptPlan = (input: QaSubmitScriptPlanInput) =>
    mapQaFailure(
      "submitScriptPlan",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "scripts")
            return yield* operationError(
              "invalid_workflow_state",
              "Script submission requires the active scripts stage.",
            );
          const plan = yield* loadScriptPlan(input.threadId);
          if (
            !plan ||
            plan.id !== input.planId ||
            plan.generationStatus !== "complete" ||
            plan.reviewStatus === "pending_review" ||
            plan.reviewStatus === "approved" ||
            !plan.scripts.length
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Complete script generation before submission.",
            );
          const approvedTestCaseIds =
            snapshot.testCasePlan?.testCases
              .filter((item) => item.status === "approved")
              .map((item) => item.id) ?? [];
          const covered = new Set(plan.scripts.flatMap((item) => item.testCaseIds));
          if (approvedTestCaseIds.some((id) => !covered.has(id)))
            return yield* operationError(
              "invalid_workflow_state",
              "Every approved test case must have script coverage.",
            );
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          yield* sql`UPDATE qa_script_plans SET revision=${nextRevision},review_status='pending_review',submitted_at=${timestamp},submitted_by='QA Inputter',updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
          yield* sql`UPDATE qa_releases SET revision=${nextRevision},updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
          return yield* scriptMutationResult(input.threadId);
        }),
      ),
    );

  const reviewScriptPlan = (input: QaReviewScriptPlanInput) =>
    mapQaFailure(
      "reviewScriptPlan",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "scripts")
            return yield* operationError(
              "invalid_workflow_state",
              "Script review requires the active scripts stage.",
            );
          const plan = yield* loadScriptPlan(input.threadId);
          if (!plan || plan.id !== input.planId || plan.reviewStatus !== "pending_review")
            return yield* operationError(
              "invalid_workflow_state",
              "Submit the script plan before review.",
            );
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          if (input.decision === "approved") {
            yield* sql`UPDATE qa_script_plans SET revision=${nextRevision},review_status='approved',rejection_note=NULL,approved_at=${timestamp},approved_by='QA Approver',updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_scripts SET status='ready',updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_stage_states SET status='complete',progress=100,updated_at=${timestamp} WHERE thread_id=${input.threadId} AND stage='scripts'`;
            yield* sql`UPDATE qa_stage_states SET status='ready',progress=0,updated_at=${timestamp} WHERE thread_id=${input.threadId} AND stage='readiness'`;
            yield* sql`INSERT INTO qa_approval_gates(id,thread_id,kind,title,description,status,decision_note,created_at,updated_at)
              VALUES(${`qa-gate:release-readiness:${input.threadId}`},${input.threadId},'release_readiness','Release readiness','Approve only after server-computed coverage, execution, evidence, and blocker checks pass.','pending',NULL,${timestamp},${timestamp})
              ON CONFLICT(id) DO UPDATE SET status='pending',decision_note=NULL,updated_at=excluded.updated_at`;
            yield* sql`INSERT INTO qa_readiness_reviews(thread_id,review_status,decision_note,computed_at,approved_at,approved_by,rejected_at,rejected_by) VALUES(${input.threadId},'pending',NULL,${timestamp},NULL,NULL,NULL,NULL) ON CONFLICT(thread_id) DO UPDATE SET review_status='pending',decision_note=NULL,computed_at=excluded.computed_at,approved_at=NULL,approved_by=NULL,rejected_at=NULL,rejected_by=NULL`;
            yield* sql`UPDATE qa_releases SET active_stage='readiness',revision=${nextRevision},updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
          } else {
            const note = input.note?.trim() || "Script plan rejected.";
            yield* sql`UPDATE qa_script_plans SET revision=${nextRevision},review_status='rejected',rejection_note=${note},rejected_at=${timestamp},rejected_by='QA Approver',updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_releases SET revision=${nextRevision},updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
          }
          const result = yield* scriptMutationResult(input.threadId);
          return {
            decision: input.decision,
            reviewedAt: timestamp,
            ...result,
          } satisfies QaScriptPlanApprovalResult;
        }),
      ),
    );

  const getReadiness = (input: QaGetReadinessInput) =>
    mapQaFailure(
      "getReadiness",
      getSnapshot({ threadId: input.threadId }).pipe(
        Effect.map((snapshot) => snapshot?.readinessDashboard ?? null),
      ),
    );

  const reviewReadiness = (input: QaReviewReadinessInput) =>
    mapQaFailure(
      "reviewReadiness",
      sql.withTransaction(
        Effect.gen(function* () {
          const snapshot = yield* requireSnapshot(input.threadId);
          yield* requireExpectedRevision(snapshot, input.expectedRevision);
          if (snapshot.activeStage !== "readiness" || snapshot.readinessDashboard === null)
            return yield* operationError(
              "invalid_workflow_state",
              "Release readiness review requires the active readiness stage.",
            );
          if (
            input.decision === "approved" &&
            (snapshot.readinessDashboard.overallStatus !== "ready" ||
              snapshot.readinessDashboard.gateChecks.some((check) => check.status !== "passed"))
          )
            return yield* operationError(
              "invalid_workflow_state",
              "Release readiness cannot be approved while gates or evidence are incomplete.",
            );
          const timestamp = yield* nowIso;
          const nextRevision = snapshot.revision + 1;
          const note = input.note?.trim() || null;
          if (input.decision === "approved") {
            yield* sql`UPDATE qa_readiness_reviews SET review_status='approved',decision_note=${note},computed_at=${timestamp},approved_at=${timestamp},approved_by='QA Approver',rejected_at=NULL,rejected_by=NULL WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_stage_states SET status='complete',progress=100,updated_at=${timestamp} WHERE thread_id=${input.threadId} AND stage='readiness'`;
            yield* sql`UPDATE qa_approval_gates SET status='approved',decision_note=${note},updated_at=${timestamp} WHERE thread_id=${input.threadId} AND kind='release_readiness'`;
            yield* sql`UPDATE qa_releases SET status='closed',phase='ready',revision=${nextRevision},updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
          } else {
            const rejectionNote = note ?? "Release readiness rejected.";
            yield* sql`UPDATE qa_readiness_reviews SET review_status='rejected',decision_note=${rejectionNote},computed_at=${timestamp},rejected_at=${timestamp},rejected_by='QA Approver',approved_at=NULL,approved_by=NULL WHERE thread_id=${input.threadId}`;
            yield* sql`UPDATE qa_releases SET revision=${nextRevision},updated_at=${timestamp} WHERE thread_id=${input.threadId}`;
          }
          const resultSnapshot = yield* requireSnapshot(input.threadId);
          const readinessDashboard = resultSnapshot.readinessDashboard;
          if (readinessDashboard === null)
            return yield* operationError(
              "invalid_workflow_state",
              "Readiness dashboard is unavailable.",
            );
          return {
            decision: input.decision,
            reviewedAt: timestamp,
            readinessDashboard,
            snapshot: resultSnapshot,
          } satisfies QaReadinessReviewResult;
        }),
      ),
    );

  return {
    getSnapshot,
    initializeRelease,
    uploadDocument,
    startIngestion,
    review,
    claimAgentStageGeneration,
    releaseAgentStageGeneration,
    releaseAgentStageGenerationForOwner,
    recoverStaleAgentStageGenerations,
    reportAgentStageProgress,
    submitAgentRequirements,
    submitAgentStrategy,
    updateRequirement,
    getStrategy,
    generateStrategy,
    updateStrategySection,
    addStrategyComment,
    replyStrategyComment,
    resolveStrategyComment,
    submitStrategy,
    reviewStrategy,
    getScenarioPlan,
    updateScenario,
    submitScenarioPlan,
    reviewScenarioPlan,
    submitAgentScenarios,
    getTestCasePlan,
    updateTestCase,
    submitTestCasePlan,
    reviewTestCasePlan,
    submitAgentTestCases,
    getScriptPlan,
    updateScript,
    submitScriptPlan,
    reviewScriptPlan,
    submitAgentScripts,
    getReadiness,
    reviewReadiness,
  } satisfies QaWorkflowShape;
});

export const layer = Layer.effect(QaWorkflow, make);
