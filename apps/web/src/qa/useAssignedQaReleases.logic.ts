import type { EnvironmentId, QaAssignedReleaseDashboard } from "@t3tools/contracts";

export type AssignedQaReleaseDashboardSource = "fallback" | "subscription";

export interface AssignedQaReleaseDashboardState {
  readonly dashboard: QaAssignedReleaseDashboard | null;
  readonly dashboardSource: AssignedQaReleaseDashboardSource | null;
  readonly error: string | null;
}

export function updateAssignedQaReleaseDashboardState(
  current: ReadonlyMap<EnvironmentId, AssignedQaReleaseDashboardState>,
  environmentId: EnvironmentId,
  result: Pick<AssignedQaReleaseDashboardState, "dashboard" | "error">,
  source: AssignedQaReleaseDashboardSource,
): ReadonlyMap<EnvironmentId, AssignedQaReleaseDashboardState> {
  const previous = current.get(environmentId);
  const staleDashboard =
    result.dashboard !== null &&
    previous?.dashboard !== null &&
    previous?.dashboard !== undefined &&
    (result.dashboard.generatedAt < previous.dashboard.generatedAt ||
      (result.dashboard.generatedAt === previous.dashboard.generatedAt &&
        source === "fallback" &&
        previous.dashboardSource === "subscription"));
  const next = {
    dashboard: staleDashboard
      ? previous.dashboard
      : (result.dashboard ?? previous?.dashboard ?? null),
    dashboardSource: staleDashboard
      ? previous.dashboardSource
      : result.dashboard === null
        ? (previous?.dashboardSource ?? null)
        : source,
    error: staleDashboard ? previous.error : result.error,
  };
  if (
    previous?.dashboard === next.dashboard &&
    previous.dashboardSource === next.dashboardSource &&
    previous.error === next.error
  ) {
    return current;
  }
  const updated = new Map(current);
  updated.set(environmentId, next);
  return updated;
}
