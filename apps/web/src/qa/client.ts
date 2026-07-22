import { WS_METHODS, type EnvironmentId } from "@t3tools/contracts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "~/connection/runtime";
import { appAtomRegistry } from "~/rpc/atomRegistry";

const qaMutationScheduler = createAtomCommandScheduler();
const releaseSerialConcurrency = {
  mode: "serial" as const,
  key: ({
    environmentId,
    input,
  }: {
    environmentId: string;
    input: { readonly threadId?: string; readonly releaseId?: string };
  }) => `${environmentId}:${input.releaseId ?? input.threadId ?? "unknown-release"}`,
};

/** Typed client boundary for the durable QA control plane. */
export const qaEnvironment = {
  listAssignedReleases: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "environment-data:qa:assigned-releases",
    tag: WS_METHODS.qaListAssignedReleases,
    staleTimeMs: 10_000,
    // The authorized subscription is the immediate path. Keep this lightweight
    // PG query as a rollout fallback and periodic reconnect safety net.
    refreshIntervalMs: 5_000,
  }),
  assignedReleaseDashboards: createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
    label: "environment-data:qa:assigned-release-dashboards",
    tag: WS_METHODS.qaSubscribeAssignedReleases,
    idleTtlMs: 30_000,
  }),
  releaseAccess: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "environment-data:qa:release-access",
    tag: WS_METHODS.qaGetReleaseAccess,
    staleTimeMs: 10_000,
  }),
  snapshot: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "environment-data:qa:snapshot",
    tag: WS_METHODS.qaGetSnapshot,
    staleTimeMs: 2_000,
    // LISTEN/NOTIFY is the fast path; periodic reads close startup and
    // reconnect races without syncing any local conversation state.
    refreshIntervalMs: 5_000,
  }),
  events: createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
    label: "environment-data:qa:events",
    tag: WS_METHODS.qaSubscribeRelease,
    idleTtlMs: 30_000,
  }),
  createProject: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:create-project",
    tag: WS_METHODS.qaCreateProject,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  ensureReleaseConversation: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:ensure-release-conversation",
    tag: WS_METHODS.qaEnsureReleaseConversation,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  startStageGeneration: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:start-stage-generation",
    tag: WS_METHODS.qaStartStageGeneration,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
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
  reviewThreads: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "environment-data:qa:review-threads",
    tag: WS_METHODS.qaListReviewThreads,
    staleTimeMs: 1_000,
  }),
  addReviewComment: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:add-review-comment",
    tag: WS_METHODS.qaAddReviewComment,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  replyReviewComment: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:reply-review-comment",
    tag: WS_METHODS.qaReplyReviewComment,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  runReviewCommentAiCheck: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:run-review-comment-ai-check",
    tag: WS_METHODS.qaRunReviewCommentAiCheck,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  resolveReviewComment: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:resolve-review-comment",
    tag: WS_METHODS.qaResolveReviewComment,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
  markReviewRead: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:qa:mark-review-read",
    tag: WS_METHODS.qaMarkReviewRead,
    scheduler: qaMutationScheduler,
    concurrency: releaseSerialConcurrency,
  }),
};

/** Revalidate the shared Postgres-backed release list after a QA mutation. */
export function refreshQaAssignedReleases(environmentId: EnvironmentId): void {
  appAtomRegistry.refresh(
    qaEnvironment.listAssignedReleases({
      environmentId,
      input: {},
    }),
  );
}
