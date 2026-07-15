import type { QaReadinessDashboard } from "@t3tools/contracts";

export function isReadinessApprovable(dashboard: QaReadinessDashboard): boolean {
  return (
    dashboard.overallStatus === "ready" &&
    dashboard.openBlockers.length === 0 &&
    dashboard.gateChecks.every((gate) => gate.status === "passed")
  );
}
