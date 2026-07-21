import { QaOperationError, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as QaIam from "../../../qa/QaIam.ts";
import * as QaReleaseEventBus from "../../../qa/QaReleaseEventBus.ts";
import * as QaWorkflow from "../../../qa/QaWorkflow.ts";
import { QaToolkit } from "./tools.ts";

const qaAccessDenied = () =>
  new QaOperationError({
    code: "invalid_workflow_state",
    message: "This app-server session does not have live QA workflow access.",
  });

const agentGenerationOwner = (scope: McpInvocationContext.McpInvocationScope) => ({
  environmentId: scope.environmentId,
  conversationThreadId: scope.threadId,
  providerSessionId: scope.providerSessionId,
});

const publish = Effect.fn("QaToolkit.publish")(function* (
  reason: "progress" | "proposal_received",
  snapshot: import("@t3tools/contracts").QaReleaseSnapshot,
) {
  const eventBus = yield* QaReleaseEventBus.QaReleaseEventBus;
  const at = DateTime.formatIso(yield* DateTime.now);
  yield* eventBus.publish({
    type: "updated",
    releaseId: snapshot.releaseId,
    threadId: snapshot.threadId,
    revision: snapshot.revision,
    reason,
    snapshot,
    at,
  });
  return snapshot;
});

const makeHandlers = (qaIam: QaIam.QaIam["Service"]) => {
  const requireQaScope = Effect.fn("QaToolkit.requireScope")(function* (
    capability: Extract<McpInvocationContext.McpCapability, "qa:read" | "qa:make">,
  ) {
    const scope = yield* McpInvocationContext.McpInvocationContext;
    if (
      !scope.capabilities.has(capability) ||
      scope.qaReleaseThreadId === undefined ||
      scope.qaPrincipalSubject === undefined
    ) {
      return yield* qaAccessDenied();
    }

    const access = yield* qaIam
      .authorizeConversation({
        subject: scope.qaPrincipalSubject,
        conversationThreadId: scope.threadId,
        environmentId: scope.environmentId,
        capability,
      })
      .pipe(Effect.mapError(qaAccessDenied));
    const releaseThreadId = ThreadId.make(access.releaseThreadId);
    if (releaseThreadId !== scope.qaReleaseThreadId) {
      return yield* qaAccessDenied();
    }

    return {
      scope,
      releaseThreadId,
    };
  });

  return {
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
        const { releaseThreadId, scope } = yield* requireQaScope("qa:make");
        const workflow = yield* QaWorkflow.QaWorkflow;
        const snapshot = yield* workflow.reportAgentStageProgress(
          releaseThreadId,
          agentGenerationOwner(scope),
          input,
        );
        return yield* publish("progress", snapshot);
      }),
    qa_submit_requirements: (input) =>
      Effect.gen(function* () {
        const { releaseThreadId, scope } = yield* requireQaScope("qa:make");
        const workflow = yield* QaWorkflow.QaWorkflow;
        const snapshot = yield* workflow.submitAgentRequirements(
          releaseThreadId,
          agentGenerationOwner(scope),
          input,
        );
        return yield* publish("proposal_received", snapshot);
      }),
    qa_submit_strategy: (input) =>
      Effect.gen(function* () {
        const { releaseThreadId, scope } = yield* requireQaScope("qa:make");
        const workflow = yield* QaWorkflow.QaWorkflow;
        const snapshot = yield* workflow.submitAgentStrategy(
          releaseThreadId,
          agentGenerationOwner(scope),
          input,
        );
        return yield* publish("proposal_received", snapshot);
      }),
    qa_submit_scenarios: (input) =>
      Effect.gen(function* () {
        const { releaseThreadId, scope } = yield* requireQaScope("qa:make");
        const workflow = yield* QaWorkflow.QaWorkflow;
        const snapshot = yield* workflow.submitAgentScenarios(
          releaseThreadId,
          agentGenerationOwner(scope),
          input,
        );
        return yield* publish("proposal_received", snapshot);
      }),
    qa_submit_test_cases: (input) =>
      Effect.gen(function* () {
        const { releaseThreadId, scope } = yield* requireQaScope("qa:make");
        const workflow = yield* QaWorkflow.QaWorkflow;
        const snapshot = yield* workflow.submitAgentTestCases(
          releaseThreadId,
          agentGenerationOwner(scope),
          input,
        );
        return yield* publish("proposal_received", snapshot);
      }),
    qa_submit_scripts: (input) =>
      Effect.gen(function* () {
        const { releaseThreadId, scope } = yield* requireQaScope("qa:make");
        const workflow = yield* QaWorkflow.QaWorkflow;
        const snapshot = yield* workflow.submitAgentScripts(
          releaseThreadId,
          agentGenerationOwner(scope),
          input,
        );
        return yield* publish("proposal_received", snapshot);
      }),
  } satisfies Parameters<typeof QaToolkit.toLayer>[0];
};

export const QaToolkitHandlersLive = QaToolkit.toLayer(
  Effect.gen(function* () {
    return makeHandlers(yield* QaIam.QaIam);
  }),
);
