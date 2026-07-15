import { describe, expect, it } from "@effect/vitest";

import {
  buildQaScenarioKickoffPrompt,
  buildQaScriptKickoffPrompt,
  buildQaStageKickoffPrompt,
  buildQaStrategyKickoffPrompt,
  buildQaTestCaseKickoffPrompt,
} from "./qaOrchestration.ts";

describe("buildQaStageKickoffPrompt", () => {
  it.each(["intake", "requirements", "readiness"])(
    "does not start an agent for the %s stage",
    (activeStage) => {
      expect(
        buildQaStageKickoffPrompt({
          activeStage,
          projectTitle: "Payments",
          releaseLabel: "Release 1",
        }),
      ).toBeNull();
    },
  );

  it("starts agent generation only after requirements are approved", () => {
    expect(
      buildQaStageKickoffPrompt({
        activeStage: "strategy",
        projectTitle: "Payments",
        releaseLabel: "Release 1",
      }),
    ).toContain("qa_submit_strategy");
  });
});

describe("buildQaStrategyKickoffPrompt", () => {
  it("keeps strategy generation in chat and governance in the dashboard", () => {
    const prompt = buildQaStrategyKickoffPrompt({
      projectTitle: "Payments",
      releaseLabel: "Release 1",
    });

    expect(prompt).toContain("Payments / Release 1");
    expect(prompt).toContain("qa_get_active_stage");
    expect(prompt).toContain("qa_report_stage_progress");
    expect(prompt).toContain("qa_submit_strategy");
    expect(prompt).toContain("explicitly list uncovered requirements");
    expect(prompt).toContain("approval decision to the live QA dashboard");
  });
});

describe("downstream QA planning prompts", () => {
  it("keeps scenario and test-case proposals agent-driven but approvals human-driven", () => {
    const context = { projectTitle: "Payments", releaseLabel: "Release 1" };
    const scenarios = buildQaScenarioKickoffPrompt(context);
    const testCases = buildQaTestCaseKickoffPrompt(context);
    const scripts = buildQaScriptKickoffPrompt(context);

    expect(scenarios).toContain("qa_submit_scenarios");
    expect(scenarios).toContain("positive, negative, boundary, exception, and integration");
    expect(testCases).toContain("qa_submit_test_cases");
    expect(testCases).toContain("action, test data, and expected result");
    expect(scripts).toContain("qa_submit_scripts");
    expect(scripts).toContain("Do not fabricate execution results or evidence");
    expect(`${scenarios}\n${testCases}`).toContain(
      "every approval decision to the live QA dashboard",
    );
  });
});
