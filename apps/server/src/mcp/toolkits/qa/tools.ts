import {
  QaAgentStageProgressInput,
  QaAgentSubmitRequirementsInput,
  QaAgentSubmitScenariosInput,
  QaAgentSubmitScriptsInput,
  QaAgentSubmitStrategyInput,
  QaAgentSubmitTestCasesInput,
  QaOperationError,
  QaReleaseSnapshot,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as QaReleaseEventBus from "../../../qa/QaReleaseEventBus.ts";
import * as QaWorkflow from "../../../qa/QaWorkflow.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  QaWorkflow.QaWorkflow,
  QaReleaseEventBus.QaReleaseEventBus,
];

export const QaGetActiveStageTool = Tool.make("qa_get_active_stage", {
  description:
    "Read the structured QA release state for this conversation, including the active stage, live progress, documents, requirements, and approval gates.",
  parameters: Schema.Struct({
    includeCompletedStages: Schema.optional(
      Schema.Boolean.annotate({
        description:
          "Include completed stage summaries in the returned snapshot. Full snapshots currently always include them.",
      }),
    ),
  }),
  success: QaReleaseSnapshot,
  failure: QaOperationError,
  dependencies,
})
  .annotate(Tool.Title, "Get active QA stage")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const QaReportStageProgressTool = Tool.make("qa_report_stage_progress", {
  description:
    "Report progress for the active QA stage. This updates live workflow status only; it cannot approve artifacts or advance a human approval gate.",
  parameters: QaAgentStageProgressInput,
  success: QaReleaseSnapshot,
  failure: QaOperationError,
  dependencies,
})
  .annotate(Tool.Title, "Report QA stage progress")
  .annotate(Tool.Destructive, false);

export const QaSubmitRequirementsTool = Tool.make("qa_submit_requirements", {
  description:
    "Submit a proposed requirements set extracted from the release documents. Proposals enter pending review in the UI; this tool cannot approve them.",
  parameters: QaAgentSubmitRequirementsInput,
  success: QaReleaseSnapshot,
  failure: QaOperationError,
  dependencies,
})
  .annotate(Tool.Title, "Propose QA requirements")
  .annotate(Tool.Destructive, false);

export const QaSubmitStrategyTool = Tool.make("qa_submit_strategy", {
  description:
    "Submit a sectioned test-strategy draft with explicit approved-requirement coverage. The draft remains editable and requires human review in the UI; this tool cannot submit, approve, or advance the release.",
  parameters: QaAgentSubmitStrategyInput,
  success: QaReleaseSnapshot,
  failure: QaOperationError,
  dependencies,
})
  .annotate(Tool.Title, "Propose QA test strategy")
  .annotate(Tool.Destructive, false);

export const QaSubmitScenariosTool = Tool.make("qa_submit_scenarios", {
  description:
    "Submit a requirement-linked, risk-based scenario workbook draft. The proposal remains editable and requires human review in the UI; this tool cannot submit, approve, or advance the release.",
  parameters: QaAgentSubmitScenariosInput,
  success: QaReleaseSnapshot,
  failure: QaOperationError,
  dependencies,
})
  .annotate(Tool.Title, "Propose QA scenarios")
  .annotate(Tool.Destructive, false);

export const QaSubmitTestCasesTool = Tool.make("qa_submit_test_cases", {
  description:
    "Submit an executable test-case workbook draft with scenario links, requirement links, ordered steps, test data, and expected results. This tool cannot submit, approve, or advance the release.",
  parameters: QaAgentSubmitTestCasesInput,
  success: QaReleaseSnapshot,
  failure: QaOperationError,
  dependencies,
})
  .annotate(Tool.Title, "Propose QA test cases")
  .annotate(Tool.Destructive, false);

export const QaSubmitScriptsTool = Tool.make("qa_submit_scripts", {
  description:
    "Submit editable automation-script drafts linked to approved test cases and requirements. This tool cannot approve scripts, mark execution results, create evidence, or sign release readiness.",
  parameters: QaAgentSubmitScriptsInput,
  success: QaReleaseSnapshot,
  failure: QaOperationError,
  dependencies,
})
  .annotate(Tool.Title, "Propose QA automation scripts")
  .annotate(Tool.Destructive, false);

export const QaToolkit = Toolkit.make(
  QaGetActiveStageTool,
  QaReportStageProgressTool,
  QaSubmitRequirementsTool,
  QaSubmitStrategyTool,
  QaSubmitScenariosTool,
  QaSubmitTestCasesTool,
  QaSubmitScriptsTool,
);
