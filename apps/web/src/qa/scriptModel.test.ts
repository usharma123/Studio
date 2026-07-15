import type { QaReleaseSnapshot, QaScript } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { scriptCoverage } from "./scriptModel";

describe("QA script coverage", () => {
  it("reports approved test case and requirement gaps without inventing evidence", () => {
    const snapshot = {
      testCasePlan: {
        testCases: [
          { id: "tc-1", status: "approved" },
          { id: "tc-2", status: "approved" },
        ],
      },
      requirements: [
        { id: "req-1", status: "approved" },
        { id: "req-2", status: "approved" },
      ],
    } as unknown as QaReleaseSnapshot;
    const script = { testCaseIds: ["tc-1"], requirementIds: ["req-1"] } as unknown as QaScript;
    expect(scriptCoverage(snapshot, [script])).toEqual({
      approvedTestCases: { total: 2, covered: 1, percent: 50, gapIds: ["tc-2"] },
      approvedRequirements: { total: 2, covered: 1, percent: 50, gapIds: ["req-2"] },
    });
  });
});
