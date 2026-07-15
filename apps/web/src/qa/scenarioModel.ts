import type {
  QaPriority,
  QaReleaseSnapshot,
  QaReviewStatus,
  QaRiskLevel,
  QaScenarioType,
} from "@t3tools/contracts";

export interface ScenarioRowView {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly type: QaScenarioType;
  readonly priority: QaPriority;
  readonly risk: QaRiskLevel;
  readonly requirementIds: readonly string[];
  readonly preconditions: readonly string[];
  readonly expectedOutcome: string;
  readonly status: QaReviewStatus;
  readonly decisionNote: string | null;
  readonly updatedAt: string | null;
}

export interface ScenarioPlanView {
  readonly id: string;
  readonly revision: number;
  readonly generationStatus: string;
  readonly reviewStatus: string;
  readonly scenarios: readonly ScenarioRowView[];
  readonly rejectionNote: string | null;
}

export interface ScenarioCoverageView {
  readonly totalApprovedRequirements: number;
  readonly coveredApprovedRequirements: number;
  readonly percent: number;
  readonly uncoveredRequirementIds: readonly string[];
}

export function scenarioPlanView(snapshot: QaReleaseSnapshot): ScenarioPlanView | null {
  const plan = snapshot.scenarioPlan;
  if (!plan) return null;
  const scenarios: readonly ScenarioRowView[] = plan.scenarios.map((scenario) => ({
    id: scenario.id,
    externalId: scenario.externalId,
    title: scenario.title,
    type: scenario.type,
    priority: scenario.priority,
    risk: scenario.risk,
    requirementIds: scenario.requirementIds,
    preconditions: scenario.preconditions,
    expectedOutcome: scenario.expectedOutcome,
    status: scenario.status,
    decisionNote: scenario.decisionNote,
    updatedAt: scenario.updatedAt,
  }));
  return {
    id: plan.id,
    revision: plan.revision,
    generationStatus: plan.generationStatus,
    reviewStatus: plan.reviewStatus,
    scenarios,
    rejectionNote: plan.rejectionNote,
  };
}

export function scenarioCoverage(
  snapshot: QaReleaseSnapshot,
  scenarios: readonly ScenarioRowView[],
): ScenarioCoverageView {
  const approvedRequirementIds: string[] = [];
  for (const requirement of snapshot.requirements) {
    if (requirement.status === "approved") approvedRequirementIds.push(requirement.id);
  }
  const covered = new Set<string>();
  for (const scenario of scenarios) {
    for (const requirementId of scenario.requirementIds) covered.add(requirementId);
  }
  const uncoveredRequirementIds = approvedRequirementIds.filter((id) => !covered.has(id));
  const coveredApprovedRequirements =
    approvedRequirementIds.length - uncoveredRequirementIds.length;
  return {
    totalApprovedRequirements: approvedRequirementIds.length,
    coveredApprovedRequirements,
    percent: approvedRequirementIds.length
      ? Math.round((coveredApprovedRequirements / approvedRequirementIds.length) * 100)
      : 0,
    uncoveredRequirementIds,
  };
}
