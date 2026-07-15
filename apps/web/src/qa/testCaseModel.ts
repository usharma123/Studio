import type { QaReleaseSnapshot, QaTestCase, QaTestCaseStep } from "@t3tools/contracts";

export interface TestCaseCoverageView {
  readonly approvedScenarios: {
    readonly total: number;
    readonly covered: number;
    readonly percent: number;
    readonly gapIds: readonly string[];
  };
  readonly approvedRequirements: {
    readonly total: number;
    readonly covered: number;
    readonly percent: number;
    readonly gapIds: readonly string[];
  };
}

export function normalizeTestCaseSteps(
  steps: readonly QaTestCaseStep[],
): readonly QaTestCaseStep[] {
  return steps.map((step, index) => ({ ...step, order: index + 1 }));
}

export function updateTestCaseStep(
  steps: readonly QaTestCaseStep[],
  index: number,
  patch: Partial<Pick<QaTestCaseStep, "action" | "testData" | "expectedResult">>,
): readonly QaTestCaseStep[] {
  return normalizeTestCaseSteps(
    steps.map((step, candidate) => (candidate === index ? { ...step, ...patch } : step)),
  );
}

export function moveTestCaseStep(
  steps: readonly QaTestCaseStep[],
  from: number,
  to: number,
): readonly QaTestCaseStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return steps;
  const reordered = [...steps];
  const [moved] = reordered.splice(from, 1);
  if (!moved) return steps;
  reordered.splice(to, 0, moved);
  return normalizeTestCaseSteps(reordered);
}

export function appendTestCaseStep(steps: readonly QaTestCaseStep[]): readonly QaTestCaseStep[] {
  return [
    ...normalizeTestCaseSteps(steps),
    {
      order: steps.length + 1,
      action: "New action",
      testData: "",
      expectedResult: "Expected result",
    },
  ];
}

export function removeTestCaseStep(
  steps: readonly QaTestCaseStep[],
  index: number,
): readonly QaTestCaseStep[] {
  if (steps.length <= 1) return steps;
  return normalizeTestCaseSteps(steps.filter((_step, candidate) => candidate !== index));
}

export function testCaseCoverage(
  snapshot: QaReleaseSnapshot,
  testCases: readonly QaTestCase[],
): TestCaseCoverageView {
  const approvedScenarioIds: string[] = [];
  for (const scenario of snapshot.scenarioPlan?.scenarios ?? []) {
    if (scenario.status === "approved") approvedScenarioIds.push(scenario.id);
  }
  const approvedRequirementIds: string[] = [];
  for (const requirement of snapshot.requirements) {
    if (requirement.status === "approved") approvedRequirementIds.push(requirement.id);
  }
  const linkedScenarioIds = new Set<string>();
  const linkedRequirementIds = new Set<string>();
  for (const testCase of testCases) {
    for (const id of testCase.scenarioIds) linkedScenarioIds.add(id);
    for (const id of testCase.requirementIds) linkedRequirementIds.add(id);
  }
  return {
    approvedScenarios: coverageGroup(approvedScenarioIds, linkedScenarioIds),
    approvedRequirements: coverageGroup(approvedRequirementIds, linkedRequirementIds),
  };
}

function coverageGroup(
  approvedIds: readonly string[],
  linkedIds: ReadonlySet<string>,
): TestCaseCoverageView["approvedScenarios"] {
  const gapIds = approvedIds.filter((id) => !linkedIds.has(id));
  const covered = approvedIds.length - gapIds.length;
  return {
    total: approvedIds.length,
    covered,
    percent: approvedIds.length ? Math.round((covered / approvedIds.length) * 100) : 0,
    gapIds,
  };
}
