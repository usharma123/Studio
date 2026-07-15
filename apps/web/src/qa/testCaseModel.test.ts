import type { QaReleaseSnapshot, QaTestCase, QaTestCaseStep } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { moveTestCaseStep, removeTestCaseStep, testCaseCoverage } from "./testCaseModel";

const step = (order: number, action: string): QaTestCaseStep => ({
  order,
  action,
  testData: "",
  expectedResult: `${action} result`,
});

describe("QA test case views", () => {
  it("keeps ordered steps contiguous when moved or removed", () => {
    const moved = moveTestCaseStep([step(1, "First"), step(2, "Second")], 1, 0);
    expect(moved.map((item) => [item.order, item.action])).toEqual([
      [1, "Second"],
      [2, "First"],
    ]);
    expect(removeTestCaseStep(moved, 0)).toEqual([step(1, "First")]);
  });

  it("reports approved scenario and requirement gaps independently", () => {
    const snapshot = {
      scenarioPlan: {
        scenarios: [
          { id: "scn-1", status: "approved" },
          { id: "scn-2", status: "approved" },
          { id: "scn-3", status: "pending" },
        ],
      },
      requirements: [
        { id: "req-1", status: "approved" },
        { id: "req-2", status: "approved" },
      ],
    } as unknown as QaReleaseSnapshot;
    const testCase = {
      scenarioIds: ["scn-1", "scn-3"],
      requirementIds: ["req-1"],
    } as unknown as QaTestCase;
    expect(testCaseCoverage(snapshot, [testCase])).toEqual({
      approvedScenarios: { total: 2, covered: 1, percent: 50, gapIds: ["scn-2"] },
      approvedRequirements: { total: 2, covered: 1, percent: 50, gapIds: ["req-2"] },
    });
  });
});
