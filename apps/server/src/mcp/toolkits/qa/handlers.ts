import { QaOperationError } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as QaReleaseEventBus from "../../../qa/QaReleaseEventBus.ts";
import * as QaWorkflow from "../../../qa/QaWorkflow.ts";
import { QaToolkit } from "./tools.ts";

const requireQaScope = Effect.fn("QaToolkit.requireScope")(function* (
  capability: Extract<McpInvocationContext.McpCapability, "qa:read" | "qa:make">,
) {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  if (
    !scope.capabilities.has(capability) ||
    scope.qaReleaseThreadId === undefined ||
    scope.qaPrincipalSubject === undefined
  ) {
    return yield* new QaOperationError({
      code: "invalid_workflow_state",
      message: "This app-server session does not have QA workflow access.",
    });
  }
  return {
    scope,
    releaseThreadId: scope.qaReleaseThreadId,
    principalSubject: scope.qaPrincipalSubject,
  };
});

const publish = Effect.fn("QaToolkit.publish")(function* (
  reason: "progress" | "proposal_received",
  snapshot: import("@t3tools/contracts").QaReleaseSnapshot,
) {
  const eventBus = yield* QaReleaseEventBus.QaReleaseEventBus;
  const at = DateTime.formatIso(yield* DateTime.now);
  yield* eventBus.publish({
    type: "updated",
    threadId: snapshot.threadId,
    revision: snapshot.revision,
    reason,
    snapshot,
    at,
  });
  return snapshot;
});

const handlers = {
  qa_get_active_stage: () =>
    Effect.gen(function* () {
      const { releaseThreadId } = yield* requireQaScope("qa:read");
      const workflow = yield* QaWorkflow.QaWorkflow;
      const snapshot = yield* workflow.getSnapshot({ threadId: releaseThreadId });
      if (!snapshot) {
        return yield* new QaOperationError({
          code: "release_not_found",
          message: "Initialize QA mode for this release first.",
        });
      }
      return snapshot;
    }),
  qa_report_stage_progress: (input) =>
    Effect.gen(function* () {
      const { releaseThreadId } = yield* requireQaScope("qa:make");
      const workflow = yield* QaWorkflow.QaWorkflow;
      const snapshot = yield* workflow.reportAgentStageProgress(releaseThreadId, input);
      return yield* publish("progress", snapshot);
    }),
  qa_submit_requirements: (input) =>
    Effect.gen(function* () {
      const { releaseThreadId } = yield* requireQaScope("qa:make");
      const workflow = yield* QaWorkflow.QaWorkflow;
      const snapshot = yield* workflow.submitAgentRequirements(releaseThreadId, input);
      return yield* publish("proposal_received", snapshot);
    }),
  qa_submit_strategy: (input) =>
    Effect.gen(function* () {
      const { releaseThreadId } = yield* requireQaScope("qa:make");
      const workflow = yield* QaWorkflow.QaWorkflow;
      const snapshot = yield* workflow.submitAgentStrategy(releaseThreadId, input);
      return yield* publish("proposal_received", snapshot);
    }),
  qa_submit_scenarios: (input) =>
    Effect.gen(function* () {
      const { releaseThreadId } = yield* requireQaScope("qa:make");
      const workflow = yield* QaWorkflow.QaWorkflow;
      const snapshot = yield* workflow.submitAgentScenarios(releaseThreadId, input);
      return yield* publish("proposal_received", snapshot);
    }),
  qa_submit_test_cases: (input) =>
    Effect.gen(function* () {
      const { releaseThreadId } = yield* requireQaScope("qa:make");
      const workflow = yield* QaWorkflow.QaWorkflow;
      const snapshot = yield* workflow.submitAgentTestCases(releaseThreadId, input);
      return yield* publish("proposal_received", snapshot);
    }),
  qa_submit_scripts: (input) =>
    Effect.gen(function* () {
      const { releaseThreadId } = yield* requireQaScope("qa:make");
      const workflow = yield* QaWorkflow.QaWorkflow;
      const snapshot = yield* workflow.submitAgentScripts(releaseThreadId, input);
      return yield* publish("proposal_received", snapshot);
    }),
} satisfies Parameters<typeof QaToolkit.toLayer>[0];

export const QaToolkitHandlersLive = QaToolkit.toLayer(handlers);
