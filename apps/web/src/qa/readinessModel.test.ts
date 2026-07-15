import type { QaReadinessDashboard } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { isReadinessApprovable } from "./readinessModel";

const dashboard = (fields: Record<string, unknown>) => fields as unknown as QaReadinessDashboard;

describe("QA readiness decisions", () => {
  it("requires ready status, no blockers, and every persisted gate to pass", () => {
    expect(
      isReadinessApprovable(
        dashboard({ overallStatus: "ready", openBlockers: [], gateChecks: [{ status: "passed" }] }),
      ),
    ).toBe(true);
    expect(
      isReadinessApprovable(
        dashboard({
          overallStatus: "ready",
          openBlockers: [{ id: "blocker" }],
          gateChecks: [{ status: "passed" }],
        }),
      ),
    ).toBe(false);
    expect(
      isReadinessApprovable(
        dashboard({ overallStatus: "not_ready", openBlockers: [], gateChecks: [] }),
      ),
    ).toBe(false);
  });
});
