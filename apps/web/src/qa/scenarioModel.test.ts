import type { QaReleaseSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { scenarioCoverage, scenarioPlanView, type ScenarioRowView } from "./scenarioModel";

describe("QA scenario views", () => {
  it("reads persisted workbook rows", () => {
    const plan = scenarioPlanView({
      revision: 8,
      scenarioPlan: {
        id: "plan-1",
        revision: 3,
        generationStatus: "complete",
        reviewStatus: "draft",
        scenarios: [
          {
            id: "scenario-1",
            externalId: "SCN-1",
            title: "Successful payment",
            type: "positive",
            priority: "high",
            risk: "high",
            requirementIds: ["req-1"],
            preconditions: ["Cart has items"],
            expectedOutcome: "Order is created",
            status: "draft",
          },
        ],
      },
    } as unknown as QaReleaseSnapshot);
    expect(plan).toMatchObject({
      id: "plan-1",
      revision: 3,
      scenarios: [{ externalId: "SCN-1", requirementIds: ["req-1"] }],
    });
  });

  it("measures coverage against approved requirements only", () => {
    const snapshot = {
      requirements: [
        { id: "req-1", status: "approved" },
        { id: "req-2", status: "approved" },
        { id: "req-3", status: "pending" },
      ],
    } as unknown as QaReleaseSnapshot;
    expect(
      scenarioCoverage(snapshot, [
        { requirementIds: ["req-1", "req-3"] } as unknown as ScenarioRowView,
      ]),
    ).toEqual({
      totalApprovedRequirements: 2,
      coveredApprovedRequirements: 1,
      percent: 50,
      uncoveredRequirementIds: ["req-2"],
    });
  });
});
