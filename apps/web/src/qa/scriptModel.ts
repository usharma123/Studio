import type { QaReleaseSnapshot, QaScript } from "@t3tools/contracts";

export interface ScriptCoverageView {
  readonly approvedTestCases: CoverageGroup;
  readonly approvedRequirements: CoverageGroup;
}

interface CoverageGroup {
  readonly total: number;
  readonly covered: number;
  readonly percent: number;
  readonly gapIds: readonly string[];
}

export function scriptCoverage(
  snapshot: QaReleaseSnapshot,
  scripts: readonly QaScript[],
): ScriptCoverageView {
  const approvedTestCaseIds: string[] = [];
  for (const testCase of snapshot.testCasePlan?.testCases ?? []) {
    if (testCase.status === "approved") approvedTestCaseIds.push(testCase.id);
  }
  const approvedRequirementIds: string[] = [];
  for (const requirement of snapshot.requirements) {
    if (requirement.status === "approved") approvedRequirementIds.push(requirement.id);
  }
  const linkedTestCases = new Set<string>();
  const linkedRequirements = new Set<string>();
  for (const script of scripts) {
    for (const id of script.testCaseIds) linkedTestCases.add(id);
    for (const id of script.requirementIds) linkedRequirements.add(id);
  }
  return {
    approvedTestCases: coverageGroup(approvedTestCaseIds, linkedTestCases),
    approvedRequirements: coverageGroup(approvedRequirementIds, linkedRequirements),
  };
}

function coverageGroup(ids: readonly string[], linked: ReadonlySet<string>): CoverageGroup {
  const gapIds = ids.filter((id) => !linked.has(id));
  const covered = ids.length - gapIds.length;
  return {
    total: ids.length,
    covered,
    percent: ids.length ? Math.round((covered / ids.length) * 100) : 0,
    gapIds,
  };
}
