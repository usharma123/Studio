import { EnvironmentId, type QaAssignedReleaseDashboard } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { updateAssignedQaReleaseDashboardState } from "./useAssignedQaReleases.logic";

const environmentId = EnvironmentId.make("environment-qa-dashboard");
const dashboard = {
  releases: [],
  awaitingReviewCount: 0,
  completedSince: "2026-06-17T00:00:00.000Z",
  generatedAt: "2026-07-17T00:00:00.000Z",
} as QaAssignedReleaseDashboard;

describe("assigned QA release dashboard state", () => {
  it("records an initial query failure instead of treating it as an empty dashboard", () => {
    const state = updateAssignedQaReleaseDashboardState(
      new Map(),
      environmentId,
      {
        dashboard: null,
        error: "Stored QA dashboard data is invalid.",
      },
      "fallback",
    );

    expect(state.get(environmentId)).toEqual({
      dashboard: null,
      dashboardSource: null,
      error: "Stored QA dashboard data is invalid.",
    });
  });

  it("retains the last successful dashboard when a refresh fails", () => {
    const loaded = updateAssignedQaReleaseDashboardState(
      new Map(),
      environmentId,
      {
        dashboard,
        error: null,
      },
      "subscription",
    );
    const failedRefresh = updateAssignedQaReleaseDashboardState(
      loaded,
      environmentId,
      {
        dashboard: null,
        error: "The environment request failed.",
      },
      "subscription",
    );

    expect(failedRefresh.get(environmentId)).toEqual({
      dashboard,
      dashboardSource: "subscription",
      error: "The environment request failed.",
    });
  });

  it("does not publish a new map when the reported state is unchanged", () => {
    const loaded = updateAssignedQaReleaseDashboardState(
      new Map(),
      environmentId,
      {
        dashboard,
        error: null,
      },
      "subscription",
    );

    expect(
      updateAssignedQaReleaseDashboardState(
        loaded,
        environmentId,
        {
          dashboard,
          error: null,
        },
        "subscription",
      ),
    ).toBe(loaded);
  });

  it("replaces the polling fallback with the latest subscribed dashboard", () => {
    const fallbackDashboard = dashboard;
    const subscribedDashboard = {
      ...dashboard,
      awaitingReviewCount: 1,
      generatedAt: "2026-07-17T00:00:01.000Z",
    } as QaAssignedReleaseDashboard;
    const fallback = updateAssignedQaReleaseDashboardState(
      new Map(),
      environmentId,
      {
        dashboard: fallbackDashboard,
        error: null,
      },
      "fallback",
    );
    const updated = updateAssignedQaReleaseDashboardState(
      fallback,
      environmentId,
      {
        dashboard: subscribedDashboard,
        error: null,
      },
      "subscription",
    );

    expect(updated.get(environmentId)).toEqual({
      dashboard: subscribedDashboard,
      dashboardSource: "subscription",
      error: null,
    });
  });

  it("does not let a stale fallback overwrite a newer subscribed dashboard", () => {
    const subscribedDashboard = {
      ...dashboard,
      awaitingReviewCount: 2,
      generatedAt: "2026-07-17T00:00:02.000Z",
    } as QaAssignedReleaseDashboard;
    const staleFallbackDashboard = {
      ...dashboard,
      generatedAt: "2026-07-17T00:00:01.000Z",
    } as QaAssignedReleaseDashboard;
    const subscribed = updateAssignedQaReleaseDashboardState(
      new Map(),
      environmentId,
      {
        dashboard: subscribedDashboard,
        error: null,
      },
      "subscription",
    );
    const afterFallback = updateAssignedQaReleaseDashboardState(
      subscribed,
      environmentId,
      {
        dashboard: staleFallbackDashboard,
        error: null,
      },
      "fallback",
    );

    expect(afterFallback).toBe(subscribed);
    expect(afterFallback.get(environmentId)?.dashboard).toBe(subscribedDashboard);
  });

  it("accepts a newer fallback after subscribing so revocations and non-event updates converge", () => {
    const subscribedDashboard = {
      ...dashboard,
      awaitingReviewCount: 2,
      generatedAt: "2026-07-17T00:00:02.000Z",
    } as QaAssignedReleaseDashboard;
    const refreshedFallbackDashboard = {
      ...dashboard,
      awaitingReviewCount: 0,
      generatedAt: "2026-07-17T00:00:03.000Z",
    } as QaAssignedReleaseDashboard;
    const subscribed = updateAssignedQaReleaseDashboardState(
      new Map(),
      environmentId,
      {
        dashboard: subscribedDashboard,
        error: null,
      },
      "subscription",
    );
    const refreshed = updateAssignedQaReleaseDashboardState(
      subscribed,
      environmentId,
      {
        dashboard: refreshedFallbackDashboard,
        error: null,
      },
      "fallback",
    );

    expect(refreshed.get(environmentId)).toEqual({
      dashboard: refreshedFallbackDashboard,
      dashboardSource: "fallback",
      error: null,
    });
  });

  it("keeps a subscription snapshot when a fallback with the same timestamp completes later", () => {
    const subscribedDashboard = {
      ...dashboard,
      awaitingReviewCount: 2,
    } as QaAssignedReleaseDashboard;
    const fallbackDashboard = {
      ...dashboard,
      awaitingReviewCount: 0,
    } as QaAssignedReleaseDashboard;
    const subscribed = updateAssignedQaReleaseDashboardState(
      new Map(),
      environmentId,
      {
        dashboard: subscribedDashboard,
        error: null,
      },
      "subscription",
    );
    const afterFallback = updateAssignedQaReleaseDashboardState(
      subscribed,
      environmentId,
      {
        dashboard: fallbackDashboard,
        error: null,
      },
      "fallback",
    );

    expect(afterFallback).toBe(subscribed);
    expect(afterFallback.get(environmentId)?.dashboard).toBe(subscribedDashboard);
  });

  it("recovers from a subscription failure when a reconnect emits a fresh dashboard", () => {
    const loaded = updateAssignedQaReleaseDashboardState(
      new Map(),
      environmentId,
      {
        dashboard,
        error: null,
      },
      "subscription",
    );
    const disconnected = updateAssignedQaReleaseDashboardState(
      loaded,
      environmentId,
      {
        dashboard: null,
        error: "The environment request failed.",
      },
      "subscription",
    );
    const reconnectedDashboard = {
      ...dashboard,
      awaitingReviewCount: 3,
      generatedAt: "2026-07-17T00:00:03.000Z",
    } as QaAssignedReleaseDashboard;
    const reconnected = updateAssignedQaReleaseDashboardState(
      disconnected,
      environmentId,
      {
        dashboard: reconnectedDashboard,
        error: null,
      },
      "subscription",
    );

    expect(reconnected.get(environmentId)).toEqual({
      dashboard: reconnectedDashboard,
      dashboardSource: "subscription",
      error: null,
    });
  });
});
