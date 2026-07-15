import type { QaReleaseSnapshot } from "@t3tools/contracts";

import { businessRequirements, requirementReviewRequired } from "./requirementsModel";
import { resolveActiveStage } from "./stageRouting";

export type QaWorkflowStatus = "not-started" | "queued" | "processing" | "blocked" | "complete";

export interface QaWorkflowStep {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly status: QaWorkflowStatus;
}

const INGESTION_STATUS_LABELS = {
  idle: "Waiting for documents",
  queued: "Queued",
  processing: "Processing",
  completed: "Awaiting review",
  failed: "Needs attention",
} as const;

/** Release readiness is broader than the ingestion sub-process status. */
export function workflowStatusLabel(snapshot: QaReleaseSnapshot): string {
  return resolveActiveStage(snapshot) === "readiness"
    ? "Release ready"
    : INGESTION_STATUS_LABELS[snapshot.ingestionStatus];
}

const WORKFLOW_STEPS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly description: string;
}> = [
  {
    id: "documents",
    label: "Document intake",
    description: "Add source material for this release.",
  },
  { id: "ingestion", label: "Ingestion", description: "Extract and index release context." },
  {
    id: "requirements_review",
    label: "Requirements review",
    description: "Validate traceable business requirements.",
  },
  { id: "ready", label: "Release ready", description: "Clear gates and publish evidence." },
];

export function deriveWorkflow(snapshot: QaReleaseSnapshot | null): readonly QaWorkflowStep[] {
  const phase = snapshot
    ? (snapshot as unknown as { readonly phase?: unknown }).phase
    : "documents";
  const legacyPhase =
    typeof phase === "string"
      ? phase
      : snapshot
        ? resolveActiveStage(snapshot) === "requirements"
          ? "requirements_review"
          : resolveActiveStage(snapshot) === "readiness"
            ? "ready"
            : "documents"
        : "documents";
  const activeIndex = WORKFLOW_STEPS.findIndex((step) => step.id === legacyPhase);
  return WORKFLOW_STEPS.map((step, index) => {
    let status: QaWorkflowStatus = "not-started";
    if (snapshot) {
      if (index < activeIndex || legacyPhase === "ready") status = "complete";
      else if (index === activeIndex) {
        status =
          snapshot.ingestionStatus === "failed"
            ? "blocked"
            : snapshot.ingestionStatus === "queued"
              ? "queued"
              : snapshot.ingestionStatus === "processing"
                ? "processing"
                : "processing";
      }
    }
    return { ...step, status };
  });
}

export function workflowProgress(snapshot: QaReleaseSnapshot | null): number {
  if (!snapshot) return 0;
  const phase = (snapshot as unknown as { readonly phase?: unknown }).phase;
  if (phase === undefined) {
    const stage = resolveActiveStage(snapshot);
    const stageIndex = [
      "intake",
      "requirements",
      "strategy",
      "scenarios",
      "test_cases",
      "scripts",
      "readiness",
    ].indexOf(stage);
    return stage === "readiness" ? 100 : Math.max(0, Math.round((stageIndex / 6) * 100));
  }
  const phaseIndex = WORKFLOW_STEPS.findIndex((step) => step.id === phase);
  if (phase === "ready") return 100;
  const base = Math.max(phaseIndex, 0) * 25;
  const phaseProgress = phase === "ingestion" ? snapshot.ingestionProgress / 4 : 5;
  return Math.min(99, Math.round(base + phaseProgress));
}

export function canStartIngestion(snapshot: QaReleaseSnapshot): boolean {
  return (
    snapshot.documents.length > 0 &&
    snapshot.documents.every((document) => document.status === "uploaded") &&
    snapshot.ingestionStatus === "idle"
  );
}

export function canReviewApprovalGates(snapshot: QaReleaseSnapshot): boolean {
  const reviewableBusinessRequirements = businessRequirements(snapshot.requirements).filter(
    requirementReviewRequired,
  );
  return (
    resolveActiveStage(snapshot) === "requirements" &&
    reviewableBusinessRequirements.length > 0 &&
    reviewableBusinessRequirements.every((requirement) => requirement.status === "approved")
  );
}
