import type { QaReleaseSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  defaultTabForStage,
  isTabForStage,
  isStageReadOnly,
  navigableStages,
  resolveActiveStage,
  resolveStageStates,
} from "./stageRouting";

function snapshot(fields: Record<string, unknown>): QaReleaseSnapshot {
  return fields as unknown as QaReleaseSnapshot;
}

describe("QA stage routing", () => {
  it("provides dedicated strategy workspace tabs", () => {
    expect(defaultTabForStage("strategy")).toBe("strategy");
    expect(isTabForStage("strategy", "coverage")).toBe(true);
    expect(isTabForStage("strategy", "review")).toBe(true);
    expect(isTabForStage("strategy", "table")).toBe(false);
  });

  it("provides scenario workbook, coverage, and review tabs", () => {
    expect(defaultTabForStage("scenarios")).toBe("scenarios");
    expect(isTabForStage("scenarios", "coverage")).toBe(true);
    expect(isTabForStage("scenarios", "review")).toBe(true);
    expect(isTabForStage("scenarios", "strategy")).toBe(false);
  });

  it("provides test case workbook, coverage, and review tabs", () => {
    expect(defaultTabForStage("test_cases")).toBe("test_cases");
    expect(isTabForStage("test_cases", "coverage")).toBe(true);
    expect(isTabForStage("test_cases", "review")).toBe(true);
    expect(isTabForStage("test_cases", "scenarios")).toBe(false);
  });

  it("provides scripts and readiness decision tabs", () => {
    expect(defaultTabForStage("scripts")).toBe("workbook");
    expect(isTabForStage("scripts", "coverage")).toBe(true);
    expect(defaultTabForStage("readiness")).toBe("dashboard");
    expect(isTabForStage("readiness", "gates")).toBe(true);
    expect(isTabForStage("readiness", "approval")).toBe(true);
  });

  it("makes a completed strategy read-only even during an active-stage transition", () => {
    const completed = snapshot({
      activeStage: "strategy",
      stages: [{ stage: "strategy", status: "complete", progress: 100 }],
    });
    expect(isStageReadOnly(completed, "strategy")).toBe(true);
    expect(isStageReadOnly(completed, "requirements")).toBe(true);
  });
  it("maps legacy phases onto stage-specific workspaces", () => {
    const legacy = snapshot({
      phase: "requirements_review",
      ingestionStatus: "completed",
      ingestionProgress: 100,
    });
    expect(resolveActiveStage(legacy)).toBe("requirements");
    expect(navigableStages(legacy).map((stage) => stage.id)).toEqual(["intake", "requirements"]);
  });

  it("prefers the forward-compatible activeStage and stages contract", () => {
    const next = snapshot({
      activeStage: "strategy",
      stages: [
        { stage: "intake", status: "complete", progress: 100 },
        { stage: "requirements", status: "complete", progress: 100 },
        { stage: "strategy", status: "running", progress: 35 },
        { stage: "scripts", status: "locked", progress: 0 },
      ],
    });
    expect(resolveActiveStage(next)).toBe("strategy");
    expect(resolveStageStates(next)).toEqual([
      { id: "intake", status: "complete", progress: 100, blockedReason: null },
      { id: "requirements", status: "complete", progress: 100, blockedReason: null },
      { id: "strategy", status: "running", progress: 35, blockedReason: null },
      { id: "scripts", status: "locked", progress: 0, blockedReason: null },
    ]);
    expect(navigableStages(next).map((stage) => stage.id)).toEqual([
      "intake",
      "requirements",
      "strategy",
    ]);
  });

  it("keeps tabs stage-specific", () => {
    expect(defaultTabForStage("requirements")).toBe("table");
    expect(isTabForStage("requirements", "graph")).toBe(true);
    expect(isTabForStage("intake", "graph")).toBe(false);
  });
});
