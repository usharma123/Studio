import { WS_METHODS } from "@t3tools/contracts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "~/connection/runtime";

const qaMutationScheduler = createAtomCommandScheduler();
const releaseSerialConcurrency = {
  mode: "serial" as const,
  key: ({ environmentId, input }: { environmentId: string; input: { threadId: string } }) =>
    `${environmentId}:${input.threadId}`,
};

/** Typed client boundary for the durable QA control plane. */
export const qaEnvironment = {
  snapshot: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "environment-data:qa:snapshot",
    tag: WS_METHODS.qaGetSnapshot,
    staleTimeMs: 2_000,
  }),
  events: createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
    label: "environment-data:qa:events",
    tag: WS_METHODS.qaSubscribeRelease,
    idleTtlMs: 30_000,
  }),
  initialize: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:initialize",
    tag: WS_METHODS.qaInitializeRelease,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  uploadDocument: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:upload-document",
    tag: WS_METHODS.qaUploadDocument,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  startIngestion: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:start-ingestion",
    tag: WS_METHODS.qaStartIngestion,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  updateRequirement: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:update-requirement",
    tag: WS_METHODS.qaUpdateRequirement,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  updateStrategySection: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:update-strategy-section",
    tag: WS_METHODS.qaUpdateStrategySection,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  addStrategyComment: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:add-strategy-comment",
    tag: WS_METHODS.qaAddStrategyComment,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  replyStrategyComment: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:reply-strategy-comment",
    tag: WS_METHODS.qaReplyStrategyComment,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  resolveStrategyComment: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:resolve-strategy-comment",
    tag: WS_METHODS.qaResolveStrategyComment,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  submitStrategy: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:submit-strategy",
    tag: WS_METHODS.qaSubmitStrategy,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  reviewStrategy: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:review-strategy",
    tag: WS_METHODS.qaReviewStrategy,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  updateScenario: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:update-scenario",
    tag: WS_METHODS.qaUpdateScenario,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  submitScenarioPlan: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:submit-scenario-plan",
    tag: WS_METHODS.qaSubmitScenarioPlan,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  reviewScenarioPlan: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:review-scenario-plan",
    tag: WS_METHODS.qaReviewScenarioPlan,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  updateTestCase: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:update-test-case",
    tag: WS_METHODS.qaUpdateTestCase,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  submitTestCasePlan: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:submit-test-case-plan",
    tag: WS_METHODS.qaSubmitTestCasePlan,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  reviewTestCasePlan: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:review-test-case-plan",
    tag: WS_METHODS.qaReviewTestCasePlan,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  updateScript: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:update-script",
    tag: WS_METHODS.qaUpdateScript,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  submitScriptPlan: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:submit-script-plan",
    tag: WS_METHODS.qaSubmitScriptPlan,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  reviewScriptPlan: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:review-script-plan",
    tag: WS_METHODS.qaReviewScriptPlan,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  reviewReadiness: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:review-readiness",
    tag: WS_METHODS.qaReviewReadiness,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  review: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:review",
    tag: WS_METHODS.qaReview,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
};
