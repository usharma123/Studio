import type {
  EnvironmentId,
  QaAssignedReleaseDashboard,
  QaAssignedReleaseSummary,
} from "@t3tools/contracts";
import { useCallback, useEffect, useState } from "react";

import { useEnvironmentQuery } from "~/state/query";

import { qaEnvironment } from "./client";
import {
  type AssignedQaReleaseDashboardSource,
  type AssignedQaReleaseDashboardState,
  updateAssignedQaReleaseDashboardState,
} from "./useAssignedQaReleases.logic";

export interface AssignedQaRelease {
  readonly environmentId: EnvironmentId;
  readonly release: QaAssignedReleaseSummary;
}

export interface AssignedQaReleaseDashboardError {
  readonly environmentId: EnvironmentId;
  readonly message: string;
}

/** Shared aggregation for PG-backed QA release navigation surfaces. */
export function useAssignedQaReleases(environmentIdsInput: ReadonlyArray<EnvironmentId>) {
  const environmentIds = [...new Set(environmentIdsInput)];
  const [dashboardStates, setDashboardStates] = useState<
    ReadonlyMap<EnvironmentId, AssignedQaReleaseDashboardState>
  >(new Map());
  const reportDashboard = useCallback(
    (
      environmentId: EnvironmentId,
      dashboard: QaAssignedReleaseDashboard | null,
      error: string | null,
      source: AssignedQaReleaseDashboardSource,
    ) => {
      setDashboardStates((current) =>
        updateAssignedQaReleaseDashboardState(current, environmentId, { dashboard, error }, source),
      );
    },
    [],
  );
  const releases: ReadonlyArray<AssignedQaRelease> = environmentIds
    .flatMap((environmentId) =>
      (dashboardStates.get(environmentId)?.dashboard?.releases ?? []).map((release) => ({
        environmentId,
        release,
      })),
    )
    .toSorted((left, right) => right.release.updatedAt.localeCompare(left.release.updatedAt));
  const awaitingReviewCount = environmentIds.reduce(
    (total, environmentId) =>
      total + (dashboardStates.get(environmentId)?.dashboard?.awaitingReviewCount ?? 0),
    0,
  );
  const errors: ReadonlyArray<AssignedQaReleaseDashboardError> = environmentIds.flatMap(
    (environmentId) => {
      const message = dashboardStates.get(environmentId)?.error;
      return message ? [{ environmentId, message }] : [];
    },
  );

  return {
    awaitingReviewCount,
    errors,
    environmentIds,
    loading: environmentIds.some((environmentId) => !dashboardStates.has(environmentId)),
    releases,
    reportDashboard,
  } as const;
}

export function QaAssignedReleaseDashboardProbes(props: {
  readonly environmentIds: ReadonlyArray<EnvironmentId>;
  readonly onDashboard: (
    environmentId: EnvironmentId,
    dashboard: QaAssignedReleaseDashboard | null,
    error: string | null,
    source: AssignedQaReleaseDashboardSource,
  ) => void;
}) {
  return props.environmentIds.map((environmentId) => (
    <QaAssignedReleaseDashboardProbe
      key={environmentId}
      environmentId={environmentId}
      onDashboard={props.onDashboard}
    />
  ));
}

function QaAssignedReleaseDashboardProbe(props: {
  readonly environmentId: EnvironmentId;
  readonly onDashboard: (
    environmentId: EnvironmentId,
    dashboard: QaAssignedReleaseDashboard | null,
    error: string | null,
    source: AssignedQaReleaseDashboardSource,
  ) => void;
}) {
  const fallbackQuery = useEnvironmentQuery(
    qaEnvironment.listAssignedReleases({
      environmentId: props.environmentId,
      input: {},
    }),
  );
  const subscription = useEnvironmentQuery(
    qaEnvironment.assignedReleaseDashboards({
      environmentId: props.environmentId,
      input: {},
    }),
  );
  const onDashboard = props.onDashboard;
  useEffect(() => {
    if (fallbackQuery.data !== null || fallbackQuery.error !== null) {
      onDashboard(props.environmentId, fallbackQuery.data, fallbackQuery.error, "fallback");
    }
  }, [fallbackQuery.data, fallbackQuery.error, onDashboard, props.environmentId]);
  useEffect(() => {
    if (subscription.data !== null || subscription.error !== null) {
      onDashboard(props.environmentId, subscription.data, subscription.error, "subscription");
    }
  }, [onDashboard, props.environmentId, subscription.data, subscription.error]);
  return null;
}
