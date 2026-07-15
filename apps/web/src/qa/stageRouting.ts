import type { QaReleaseSnapshot } from "@t3tools/contracts";

export const QA_STAGE_IDS = [
  "intake",
  "requirements",
  "strategy",
  "scenarios",
  "test_cases",
  "scripts",
  "readiness",
] as const;

export type QaStageId = (typeof QA_STAGE_IDS)[number];
export type QaStageStatus =
  | "locked"
  | "ready"
  | "queued"
  | "running"
  | "awaiting_review"
  | "blocked"
  | "complete"
  | "stale";

export type QaStageTabId =
  | "documents"
  | "progress"
  | "table"
  | "graph"
  | "approvals"
  | "strategy"
  | "scenarios"
  | "test_cases"
  | "coverage"
  | "review"
  | "workbook"
  | "dashboard"
  | "gates"
  | "approval"
  | "overview";

export interface QaStageRoute {
  readonly id: QaStageId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly defaultTab: QaStageTabId;
  readonly tabs: ReadonlyArray<{ readonly id: QaStageTabId; readonly label: string }>;
}

export interface QaResolvedStage {
  readonly id: QaStageId;
  readonly status: QaStageStatus;
  readonly progress: number;
  readonly blockedReason: string | null;
}

export const QA_STAGE_ROUTES: Readonly<Record<QaStageId, QaStageRoute>> = {
  intake: {
    id: "intake",
    label: "Document intake",
    shortLabel: "Intake",
    description: "Collect and process the source material for this release.",
    defaultTab: "documents",
    tabs: [
      { id: "documents", label: "Documents" },
      { id: "progress", label: "Progress" },
    ],
  },
  requirements: {
    id: "requirements",
    label: "Requirements review",
    shortLabel: "Requirements",
    description: "Validate the extracted baseline and its source traceability.",
    defaultTab: "table",
    tabs: [
      { id: "table", label: "Table" },
      { id: "graph", label: "Graph" },
      { id: "approvals", label: "Approvals" },
    ],
  },
  strategy: {
    id: "strategy",
    label: "Test strategy",
    shortLabel: "Strategy",
    description: "Shape, review, and confirm the release test strategy.",
    defaultTab: "strategy",
    tabs: [
      { id: "strategy", label: "Strategy" },
      { id: "coverage", label: "Coverage" },
      { id: "review", label: "Review" },
    ],
  },
  scenarios: {
    id: "scenarios",
    label: "Scenario review",
    shortLabel: "Scenarios",
    description: "Review release scenarios and their approved-requirement coverage.",
    defaultTab: "scenarios",
    tabs: [
      { id: "scenarios", label: "Scenarios" },
      { id: "coverage", label: "Coverage" },
      { id: "review", label: "Review" },
    ],
  },
  test_cases: {
    id: "test_cases",
    label: "Test case review",
    shortLabel: "Test cases",
    description: "Review executable test cases, steps, and traceability coverage.",
    defaultTab: "test_cases",
    tabs: [
      { id: "test_cases", label: "Test Cases" },
      { id: "coverage", label: "Coverage" },
      { id: "review", label: "Review" },
    ],
  },
  scripts: {
    id: "scripts",
    label: "Scripts and evidence",
    shortLabel: "Scripts",
    description: "Review generated scripts, traceability, execution, and evidence.",
    defaultTab: "workbook",
    tabs: [
      { id: "workbook", label: "Workbook" },
      { id: "coverage", label: "Coverage" },
      { id: "review", label: "Review" },
    ],
  },
  readiness: {
    id: "readiness",
    label: "Release readiness",
    shortLabel: "Readiness",
    description: "Evaluate the persisted release evidence and make the final decision.",
    defaultTab: "dashboard",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "gates", label: "Gates" },
      { id: "approval", label: "Approval" },
    ],
  },
};

function isStageId(value: unknown): value is QaStageId {
  return typeof value === "string" && (QA_STAGE_IDS as readonly string[]).includes(value);
}

function isStageStatus(value: unknown): value is QaStageStatus {
  return (
    typeof value === "string" &&
    [
      "locked",
      "ready",
      "queued",
      "running",
      "awaiting_review",
      "blocked",
      "complete",
      "stale",
    ].includes(value)
  );
}

function clampedProgress(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 0;
}

function legacyActiveStage(snapshot: QaReleaseSnapshot): QaStageId {
  const phase = (snapshot as unknown as { readonly phase?: unknown }).phase;
  if (phase === "documents" || phase === "ingestion") return "intake";
  if (phase === "requirements_review") return "requirements";
  if (phase === "ready") return "readiness";
  return isStageId(phase) ? phase : "intake";
}

export function resolveActiveStage(snapshot: QaReleaseSnapshot): QaStageId {
  const activeStage = (snapshot as unknown as { readonly activeStage?: unknown }).activeStage;
  return isStageId(activeStage) ? activeStage : legacyActiveStage(snapshot);
}

export function resolveStageStates(snapshot: QaReleaseSnapshot): readonly QaResolvedStage[] {
  const stageAware = snapshot as unknown as {
    readonly stages?: ReadonlyArray<{
      readonly stage?: unknown;
      readonly id?: unknown;
      readonly status?: unknown;
      readonly progress?: unknown;
      readonly blockedReason?: unknown;
    }>;
  };
  const explicit = stageAware.stages?.flatMap<QaResolvedStage>((stage) => {
    const id = isStageId(stage.stage) ? stage.stage : isStageId(stage.id) ? stage.id : null;
    if (!id || !isStageStatus(stage.status)) return [];
    return [
      {
        id,
        status: stage.status,
        progress: clampedProgress(stage.progress),
        blockedReason: typeof stage.blockedReason === "string" ? stage.blockedReason : null,
      },
    ];
  });
  if (explicit?.length) return explicit;

  const active = legacyActiveStage(snapshot);
  const activeIndex = QA_STAGE_IDS.indexOf(active);
  const legacyPhase = (snapshot as unknown as { readonly phase?: unknown }).phase;
  const ingestionStatus = (snapshot as unknown as { readonly ingestionStatus?: unknown })
    .ingestionStatus;
  const ingestionProgress = (snapshot as unknown as { readonly ingestionProgress?: unknown })
    .ingestionProgress;
  const visibleIds: readonly QaStageId[] =
    active === "readiness" ? ["intake", "requirements", "readiness"] : ["intake", "requirements"];

  return visibleIds.map((id) => {
    const index = QA_STAGE_IDS.indexOf(id);
    const status: QaStageStatus =
      index < activeIndex
        ? "complete"
        : id !== active
          ? "locked"
          : ingestionStatus === "failed"
            ? "blocked"
            : legacyPhase === "ingestion" || ingestionStatus === "processing"
              ? "running"
              : id === "requirements"
                ? "awaiting_review"
                : id === "readiness"
                  ? "complete"
                  : "ready";
    return {
      id,
      status,
      progress:
        id === "intake" && typeof ingestionProgress === "number"
          ? clampedProgress(ingestionProgress)
          : status === "complete"
            ? 100
            : 0,
      blockedReason: null,
    };
  });
}

export function navigableStages(snapshot: QaReleaseSnapshot): readonly QaResolvedStage[] {
  const active = resolveActiveStage(snapshot);
  return resolveStageStates(snapshot).filter(
    (stage) => stage.id === active || stage.status === "complete",
  );
}

export function isStageReadOnly(snapshot: QaReleaseSnapshot, viewedStage: QaStageId): boolean {
  if (viewedStage !== resolveActiveStage(snapshot)) return true;
  return resolveStageStates(snapshot).some(
    (stage) => stage.id === viewedStage && stage.status === "complete",
  );
}

export function defaultTabForStage(stage: QaStageId): QaStageTabId {
  return QA_STAGE_ROUTES[stage].defaultTab;
}

export function isTabForStage(stage: QaStageId, tab: unknown): tab is QaStageTabId {
  return QA_STAGE_ROUTES[stage].tabs.some((candidate) => candidate.id === tab);
}
