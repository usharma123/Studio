export interface QaStageKickoffContext {
  readonly activeStage: string;
  readonly projectTitle: string;
  readonly releaseLabel: string;
}

export interface QaStrategyKickoffContext {
  readonly projectTitle: string;
  readonly releaseLabel: string;
}

export type QaPlanningKickoffContext = QaStrategyKickoffContext;

/**
 * Starts the strategy stage in the release conversation after the requirements
 * gate is approved. The agent drafts durable content; the dashboard remains the
 * only place where a person can submit, reject, or approve it.
 */
export function buildQaStrategyKickoffPrompt(input: QaStrategyKickoffContext): string {
  return [
    `Begin QA test-strategy planning for ${input.projectTitle} / ${input.releaseLabel}.`,
    "",
    "Call qa_get_active_stage first and confirm that strategy is the active stage. Use the approved business and functional requirements, their source citations, and the persisted traceability graph as the strategy baseline.",
    "",
    "Draft a practical, sectioned strategy covering objectives and scope, test levels and types, risk-based priorities, environments and test data, entry and exit criteria, automation approach, non-functional testing, defect governance, reporting, and delivery risks. Every material section must identify the approved requirement IDs it covers; explicitly list uncovered requirements instead of implying coverage.",
    "",
    "Report meaningful progress with qa_report_stage_progress and submit the durable section set with qa_submit_strategy. The tool may create or replace a draft only; it cannot submit for review, resolve human comments, approve, reject, sign, or advance the release.",
    "",
    "Summarize important assumptions, open decisions, and coverage gaps in this conversation. Leave editing, threaded review, submission, and every approval decision to the live QA dashboard.",
  ].join("\n");
}

export function buildQaScenarioKickoffPrompt(input: QaPlanningKickoffContext): string {
  return [
    `Begin QA scenario planning for ${input.projectTitle} / ${input.releaseLabel}.`,
    "",
    "Call qa_get_active_stage first and confirm that scenarios is the active stage. Use the approved requirements, approved strategy, source citations, and traceability graph as the planning baseline.",
    "",
    "Create a risk-based scenario workbook that covers positive, negative, boundary, exception, and integration behavior where applicable. Each row must have a stable external ID, priority, risk level, preconditions, expected outcome, and explicit approved requirement IDs. Surface uncovered requirements and deliberate exclusions instead of inventing coverage.",
    "",
    "Report progress with qa_report_stage_progress and persist the draft through qa_submit_scenarios. The tool creates a draft only; leave editing, submission, and every approval decision to the live QA dashboard.",
  ].join("\n");
}

export function buildQaTestCaseKickoffPrompt(input: QaPlanningKickoffContext): string {
  return [
    `Begin QA test-case design for ${input.projectTitle} / ${input.releaseLabel}.`,
    "",
    "Call qa_get_active_stage first and confirm that test_cases is the active stage. Use only approved scenarios, approved requirements, source citations, and the approved strategy as durable inputs.",
    "",
    "Create an editable test-case workbook with stable external IDs, linked scenario and requirement IDs, preconditions, priority, automation candidacy, and ordered steps. Every step must separate action, test data, and expected result. Include positive, negative, boundary, and recovery paths required by the approved scenarios; list any uncovered scenarios explicitly.",
    "",
    "Report progress with qa_report_stage_progress and persist the draft through qa_submit_test_cases. The tool creates a draft only; leave editing, submission, and every approval decision to the live QA dashboard.",
  ].join("\n");
}

export function buildQaScriptKickoffPrompt(input: QaPlanningKickoffContext): string {
  return [
    `Begin QA automation-script design for ${input.projectTitle} / ${input.releaseLabel}.`,
    "",
    "Call qa_get_active_stage first and confirm that scripts is the active stage. Use the approved test cases, scenarios, requirements, strategy, and available HLD/LLD implementation context as inputs.",
    "",
    "Create editable automation-script drafts only for approved test cases. Each script must keep stable test-case and requirement links, name its framework and language, use a deterministic file name, and include runnable content appropriate to the repository. Do not fabricate execution results or evidence; surface unsupported cases and environment dependencies explicitly.",
    "",
    "Report progress with qa_report_stage_progress and persist drafts through qa_submit_scripts. The tool cannot approve scripts, mark them executed, fabricate evidence, or sign release readiness; leave those decisions to the live QA dashboard.",
  ].join("\n");
}

/**
 * Returns a prompt only for stages whose draft artifact is intentionally
 * agent-generated. Intake and requirements stay in the deterministic QA
 * runtime and must never start a provider turn as a stage-transition side
 * effect.
 */
export function buildQaStageKickoffPrompt(input: QaStageKickoffContext): string | null {
  const context = {
    projectTitle: input.projectTitle,
    releaseLabel: input.releaseLabel,
  };
  switch (input.activeStage) {
    case "strategy":
      return buildQaStrategyKickoffPrompt(context);
    case "scenarios":
      return buildQaScenarioKickoffPrompt(context);
    case "test_cases":
      return buildQaTestCaseKickoffPrompt(context);
    case "scripts":
      return buildQaScriptKickoffPrompt(context);
    default:
      return null;
  }
}
