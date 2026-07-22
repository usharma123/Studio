import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import {
  DEFAULT_MODEL,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_AUTOMATIC_GIT_FETCH_INTERVAL,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthPreviewOperateScope,
  AuthQaApproveScope,
  AuthQaChatScope,
  AuthQaMakeScope,
  AuthQaReadScope,
  AuthReviewWriteScope,
  AuthRelayWriteScope,
  AuthTerminalOperateScope,
  AuthAccessReadScope,
  AuthAccessStreamError,
  type AuthAccessStreamEvent,
  type AuthEnvironmentScope,
  AuthSessionId,
  CommandId,
  type DiscoveredLocalServerList,
  EventId,
  MessageId,
  type OrchestrationCommand,
  type GitActionProgressEvent,
  type GitManagerServiceError,
  OrchestrationDispatchCommandError,
  type OrchestrationEvent,
  type OrchestrationShellStreamEvent,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
  QaOperationError,
  ProjectId,
  QaReleaseId,
  type QaReviewActor,
  type QaReleaseSnapshot,
  OrchestrationGetFullThreadDiffError,
  OrchestrationGetSnapshotError,
  OrchestrationGetTurnDiffError,
  ORCHESTRATION_WS_METHODS,
  type ProjectEntriesFailure,
  type ProjectFileFailure,
  type ProjectFileOperation,
  ProjectListEntriesError,
  ProjectReadFileError,
  ProjectSearchEntriesError,
  ProjectWriteFileError,
  ProviderInstanceId,
  RelayClientInstallFailedError,
  type RelayClientInstallProgressEvent,
  OrchestrationReplayEventsError,
  type FilesystemBrowseFailure,
  FilesystemBrowseError,
  AssetWorkspaceContextNotFoundError,
  AssetWorkspaceContextResolutionError,
  EnvironmentAuthorizationError,
  ThreadId,
  type TerminalAttachStreamEvent,
  type TerminalError,
  type TerminalEvent,
  type TerminalMetadataStreamEvent,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import { clamp } from "effect/Number";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import * as CheckpointDiffQuery from "./checkpointing/CheckpointDiffQuery.ts";
import * as ServerConfig from "./config.ts";
import * as Keybindings from "./keybindings.ts";
import * as ExternalLauncher from "./process/externalLauncher.ts";
import { normalizeDispatchCommand } from "./orchestration/Normalizer.ts";
import * as OrchestrationEngine from "./orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  observeRpcEffect as instrumentRpcEffect,
  observeRpcStream as instrumentRpcStream,
  observeRpcStreamEffect as instrumentRpcStreamEffect,
} from "./observability/RpcInstrumentation.ts";
import * as ProviderRegistry from "./provider/Services/ProviderRegistry.ts";
import * as ProviderMaintenanceRunner from "./provider/providerMaintenanceRunner.ts";
import * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import * as ServerRuntimeStartup from "./serverRuntimeStartup.ts";
import * as ServerSettings from "./serverSettings.ts";
import * as TerminalManager from "./terminal/Manager.ts";
import * as PreviewAutomationBroker from "./mcp/PreviewAutomationBroker.ts";
import * as PreviewManager from "./preview/Manager.ts";
import { makePreviewAuthorization } from "./preview/Authorization.ts";
import type { PreviewAccessIdentity } from "./preview/Access.ts";
import { issueAssetUrl } from "./assets/AssetAccess.ts";
import * as PortScanner from "./preview/PortScanner.ts";
import * as WorkspaceEntries from "./workspace/WorkspaceEntries.ts";
import * as WorkspaceFileSystem from "./workspace/WorkspaceFileSystem.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";
import * as VcsStatusBroadcaster from "./vcs/VcsStatusBroadcaster.ts";
import * as VcsProvisioningService from "./vcs/VcsProvisioningService.ts";
import * as GitWorkflowService from "./git/GitWorkflowService.ts";
import * as ReviewService from "./review/ReviewService.ts";
import * as ProjectSetupScriptRunner from "./project/ProjectSetupScriptRunner.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import * as ProcessDiagnostics from "./diagnostics/ProcessDiagnostics.ts";
import * as ProcessResourceMonitor from "./diagnostics/ProcessResourceMonitor.ts";
import * as TraceDiagnostics from "./diagnostics/TraceDiagnostics.ts";
import * as SourceControlDiscovery from "./sourceControl/SourceControlDiscovery.ts";
import * as SourceControlRepositoryService from "./sourceControl/SourceControlRepositoryService.ts";
import * as AzureDevOpsCli from "./sourceControl/AzureDevOpsCli.ts";
import * as BitbucketApi from "./sourceControl/BitbucketApi.ts";
import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import * as GitLabCli from "./sourceControl/GitLabCli.ts";
import * as SourceControlProviderRegistry from "./sourceControl/SourceControlProviderRegistry.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "./vcs/VcsDriverRegistry.ts";
import * as VcsProjectConfig from "./vcs/VcsProjectConfig.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";
import * as PairingGrantStore from "./auth/PairingGrantStore.ts";
import * as SessionStore from "./auth/SessionStore.ts";
import { reauthorizeStreamItems } from "./auth/LiveAuthorization.ts";
import { failEnvironmentAuthInvalid, failEnvironmentInternal } from "./auth/http.ts";
import * as RelayClient from "@t3tools/shared/relayClient";
import { buildQaStageKickoffPrompt } from "@t3tools/shared/qaOrchestration";
import * as QaWorkflow from "./qa/QaWorkflow.ts";
import * as QaDashboardQuery from "./qa/QaDashboardQuery.ts";
import * as QaIam from "./qa/QaIam.ts";
import * as QaDatabase from "./qa/QaDatabase.ts";
import * as QaReleaseEventBus from "./qa/QaReleaseEventBus.ts";
import { subscribeAssignedReleaseDashboard } from "./qa/QaAssignedReleaseDashboardStream.ts";
import * as QaReviewService from "./qa/QaReviewService.ts";
import * as QaLocalRuntime from "./qa/QaLocalRuntime.ts";
const isOrchestrationDispatchCommandError = Schema.is(OrchestrationDispatchCommandError);
const isEnvironmentAuthorizationError = Schema.is(EnvironmentAuthorizationError);
const isQaOperationError = Schema.is(QaOperationError);

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

function unexpectedCompatibilityError(error: never): never {
  throw new Error(`Unhandled compatibility error: ${String(error)}`);
}

function mapQaReviewError(error: QaReviewService.QaReviewError): QaOperationError {
  switch (error.code) {
    case "not_found":
      return new QaOperationError({ code: "review_thread_not_found", message: error.message });
    case "revision_conflict":
      return new QaOperationError({ code: "release_conflict", message: error.message });
    case "invalid_anchor":
      return new QaOperationError({ code: "review_anchor_not_found", message: error.message });
    case "persistence_failed":
      return new QaOperationError({ code: "persistence_failed", message: error.message });
    case "access_denied":
    case "invalid_input":
    case "invalid_state":
      return new QaOperationError({ code: "invalid_workflow_state", message: error.message });
  }
}

/** Preserve the setup runner's broader pre-refactor message normalization. */
function legacySetupFailureDescription(cause: unknown): string {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return cause.message;
  }
  return String(cause);
}

function projectEntriesFailureContext(error: WorkspaceEntries.WorkspaceEntriesError): {
  readonly failure: ProjectEntriesFailure;
  readonly normalizedCwd?: string;
  readonly timeout?: string;
  readonly detail?: string;
} {
  switch (error._tag) {
    case "WorkspaceRootNotExistsError":
      return {
        failure: "workspace_root_not_found",
        normalizedCwd: error.normalizedWorkspaceRoot,
      };
    case "WorkspaceRootCreateFailedError":
      return {
        failure: "workspace_root_create_failed",
        normalizedCwd: error.normalizedWorkspaceRoot,
      };
    case "WorkspaceRootStatFailedError":
      return {
        failure: "workspace_root_stat_failed",
        normalizedCwd: error.normalizedWorkspaceRoot,
        detail: error.phase,
      };
    case "WorkspaceRootNotDirectoryError":
      return {
        failure: "workspace_root_not_directory",
        normalizedCwd: error.normalizedWorkspaceRoot,
      };
    case "WorkspaceSearchIndexCreateFailed":
      return {
        failure: "search_index_create_failed",
        normalizedCwd: error.cwd,
        detail: error.reason,
      };
    case "WorkspaceSearchIndexScanTimedOut":
      return {
        failure: "search_index_scan_timed_out",
        normalizedCwd: error.cwd,
        timeout: error.timeout,
      };
    case "WorkspaceSearchIndexSearchFailed":
      return {
        failure: "search_index_search_failed",
        normalizedCwd: error.cwd,
        detail: error.reason,
      };
    default:
      return unexpectedCompatibilityError(error);
  }
}

function filesystemBrowseFailureContext(error: WorkspaceEntries.WorkspaceEntriesBrowseError): {
  readonly failure: FilesystemBrowseFailure;
  readonly parentPath?: string;
  readonly platform?: string;
} {
  switch (error._tag) {
    case "WorkspaceEntriesWindowsPathUnsupportedError":
      return { failure: "windows_path_unsupported", platform: error.platform };
    case "WorkspaceEntriesCurrentProjectRequiredError":
      return { failure: "current_project_required" };
    case "WorkspaceEntriesReadDirectoryError":
      return { failure: "read_directory_failed", parentPath: error.parentPath };
    default:
      return unexpectedCompatibilityError(error);
  }
}

function projectFileFailureContext(
  error:
    | WorkspaceFileSystem.WorkspaceFileSystemError
    | WorkspacePaths.WorkspacePathOutsideRootError,
): {
  readonly failure: ProjectFileFailure;
  readonly resolvedPath?: string;
  readonly resolvedWorkspaceRoot?: string;
  readonly operation?: ProjectFileOperation;
  readonly operationPath?: string;
} {
  switch (error._tag) {
    case "WorkspacePathOutsideRootError":
      return { failure: "workspace_path_outside_root" };
    case "WorkspaceFileSystemOperationError":
      return {
        failure: "operation_failed",
        resolvedPath: error.resolvedPath,
        operation: error.operation,
        operationPath: error.operationPath,
      };
    case "WorkspaceFilePathEscapeError":
      return {
        failure: "resolved_path_outside_root",
        resolvedPath: error.resolvedPath,
        resolvedWorkspaceRoot: error.resolvedWorkspaceRoot,
      };
    case "WorkspacePathNotFileError":
      return { failure: "path_not_file", resolvedPath: error.resolvedPath };
    case "WorkspaceBinaryFileError":
      return { failure: "binary_file", resolvedPath: error.resolvedPath };
    default:
      return unexpectedCompatibilityError(error);
  }
}

function projectSetupScriptCompatibilityDetail(
  error: ProjectSetupScriptRunner.ProjectSetupScriptRunnerError,
): string {
  switch (error._tag) {
    case "ProjectSetupScriptOperationError":
      return legacySetupFailureDescription(error.cause);
    case "ProjectSetupScriptProjectNotFoundError":
      return "Project was not found for setup script execution.";
    default:
      return unexpectedCompatibilityError(error);
  }
}

function isThreadDetailEvent(event: OrchestrationEvent): event is Extract<
  OrchestrationEvent,
  {
    type:
      | "thread.message-sent"
      | "thread.proposed-plan-upserted"
      | "thread.activity-appended"
      | "thread.turn-diff-completed"
      | "thread.reverted"
      | "thread.session-set";
  }
> {
  return (
    event.type === "thread.message-sent" ||
    event.type === "thread.proposed-plan-upserted" ||
    event.type === "thread.activity-appended" ||
    event.type === "thread.turn-diff-completed" ||
    event.type === "thread.reverted" ||
    event.type === "thread.session-set"
  );
}

const PROVIDER_STATUS_DEBOUNCE_MS = 200;

type RpcRequiredScope = AuthEnvironmentScope | ReadonlyArray<AuthEnvironmentScope>;

const RPC_REQUIRED_SCOPE = new Map<string, RpcRequiredScope>([
  [ORCHESTRATION_WS_METHODS.dispatchCommand, [AuthOrchestrationOperateScope, AuthQaChatScope]],
  [ORCHESTRATION_WS_METHODS.getTurnDiff, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.getFullThreadDiff, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.replayEvents, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.subscribeShell, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.subscribeThread, [AuthOrchestrationReadScope, AuthQaChatScope]],
  [WS_METHODS.serverGetConfig, [AuthOrchestrationReadScope, AuthQaReadScope]],
  [WS_METHODS.serverRefreshProviders, AuthOrchestrationOperateScope],
  [WS_METHODS.serverUpdateProvider, AuthOrchestrationOperateScope],
  [WS_METHODS.serverUpsertKeybinding, AuthOrchestrationOperateScope],
  [WS_METHODS.serverRemoveKeybinding, AuthOrchestrationOperateScope],
  [WS_METHODS.serverGetSettings, [AuthOrchestrationReadScope, AuthQaReadScope]],
  [WS_METHODS.serverUpdateSettings, AuthOrchestrationOperateScope],
  [WS_METHODS.serverDiscoverSourceControl, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetTraceDiagnostics, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetProcessDiagnostics, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetProcessResourceHistory, AuthOrchestrationReadScope],
  [WS_METHODS.serverSignalProcess, AuthOrchestrationOperateScope],
  [WS_METHODS.cloudGetRelayClientStatus, AuthRelayWriteScope],
  [WS_METHODS.cloudInstallRelayClient, AuthRelayWriteScope],
  [WS_METHODS.sourceControlLookupRepository, AuthOrchestrationReadScope],
  [WS_METHODS.sourceControlCloneRepository, AuthOrchestrationOperateScope],
  [WS_METHODS.sourceControlPublishRepository, AuthOrchestrationOperateScope],
  [WS_METHODS.qaListAssignedReleases, AuthQaReadScope],
  [WS_METHODS.qaSubscribeAssignedReleases, AuthQaReadScope],
  [WS_METHODS.qaGetReleaseAccess, AuthQaReadScope],
  [WS_METHODS.qaGetSnapshot, AuthQaReadScope],
  [WS_METHODS.qaCreateProject, AuthQaMakeScope],
  [WS_METHODS.qaEnsureReleaseConversation, AuthQaChatScope],
  [WS_METHODS.qaStartStageGeneration, AuthQaMakeScope],
  [WS_METHODS.qaInitializeRelease, AuthQaMakeScope],
  [WS_METHODS.qaUploadDocument, AuthQaMakeScope],
  [WS_METHODS.qaStartIngestion, AuthQaMakeScope],
  [WS_METHODS.qaReview, AuthQaApproveScope],
  [WS_METHODS.qaSubscribeRelease, AuthQaReadScope],
  [WS_METHODS.qaUpdateRequirement, AuthQaMakeScope],
  [WS_METHODS.qaGetStrategy, AuthQaReadScope],
  [WS_METHODS.qaGenerateStrategy, AuthQaMakeScope],
  [WS_METHODS.qaUpdateStrategySection, AuthQaMakeScope],
  [WS_METHODS.qaAddStrategyComment, AuthQaApproveScope],
  [WS_METHODS.qaReplyStrategyComment, AuthQaMakeScope],
  [WS_METHODS.qaResolveStrategyComment, AuthQaApproveScope],
  [WS_METHODS.qaSubmitStrategy, AuthQaMakeScope],
  [WS_METHODS.qaReviewStrategy, AuthQaApproveScope],
  [WS_METHODS.qaGetScenarioPlan, AuthQaReadScope],
  [WS_METHODS.qaUpdateScenario, AuthQaMakeScope],
  [WS_METHODS.qaSubmitScenarioPlan, AuthQaMakeScope],
  [WS_METHODS.qaReviewScenarioPlan, AuthQaApproveScope],
  [WS_METHODS.qaGetTestCasePlan, AuthQaReadScope],
  [WS_METHODS.qaUpdateTestCase, AuthQaMakeScope],
  [WS_METHODS.qaSubmitTestCasePlan, AuthQaMakeScope],
  [WS_METHODS.qaReviewTestCasePlan, AuthQaApproveScope],
  [WS_METHODS.qaGetScriptPlan, AuthQaReadScope],
  [WS_METHODS.qaUpdateScript, AuthQaMakeScope],
  [WS_METHODS.qaSubmitScriptPlan, AuthQaMakeScope],
  [WS_METHODS.qaReviewScriptPlan, AuthQaApproveScope],
  [WS_METHODS.qaGetReadiness, AuthQaReadScope],
  [WS_METHODS.qaReviewReadiness, AuthQaApproveScope],
  [WS_METHODS.qaListReviewThreads, AuthQaReadScope],
  [WS_METHODS.qaAddReviewComment, AuthQaApproveScope],
  [WS_METHODS.qaReplyReviewComment, AuthQaMakeScope],
  [WS_METHODS.qaRunReviewCommentAiCheck, AuthQaApproveScope],
  [WS_METHODS.qaResolveReviewComment, AuthQaApproveScope],
  [WS_METHODS.qaMarkReviewRead, AuthQaReadScope],
  [WS_METHODS.projectsListEntries, AuthOrchestrationReadScope],
  [WS_METHODS.projectsReadFile, AuthOrchestrationReadScope],
  [WS_METHODS.projectsSearchEntries, AuthOrchestrationReadScope],
  [WS_METHODS.projectsWriteFile, AuthOrchestrationOperateScope],
  [WS_METHODS.shellOpenInEditor, AuthOrchestrationOperateScope],
  [WS_METHODS.filesystemBrowse, AuthOrchestrationReadScope],
  [WS_METHODS.assetsCreateUrl, AuthOrchestrationReadScope],
  [WS_METHODS.subscribeVcsStatus, AuthOrchestrationReadScope],
  [WS_METHODS.vcsRefreshStatus, AuthOrchestrationReadScope],
  [WS_METHODS.vcsPull, AuthOrchestrationOperateScope],
  [WS_METHODS.gitRunStackedAction, AuthOrchestrationOperateScope],
  [WS_METHODS.gitResolvePullRequest, AuthOrchestrationOperateScope],
  [WS_METHODS.gitPreparePullRequestThread, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsListRefs, AuthOrchestrationReadScope],
  [WS_METHODS.vcsCreateWorktree, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsRemoveWorktree, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsCreateRef, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsSwitchRef, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsInit, AuthOrchestrationOperateScope],
  [WS_METHODS.reviewGetDiffPreview, AuthReviewWriteScope],
  [WS_METHODS.terminalOpen, AuthTerminalOperateScope],
  [WS_METHODS.terminalAttach, AuthTerminalOperateScope],
  [WS_METHODS.terminalWrite, AuthTerminalOperateScope],
  [WS_METHODS.terminalResize, AuthTerminalOperateScope],
  [WS_METHODS.terminalClear, AuthTerminalOperateScope],
  [WS_METHODS.terminalRestart, AuthTerminalOperateScope],
  [WS_METHODS.terminalClose, AuthTerminalOperateScope],
  [WS_METHODS.subscribeTerminalEvents, AuthTerminalOperateScope],
  [WS_METHODS.subscribeTerminalMetadata, AuthTerminalOperateScope],
  [WS_METHODS.previewOpen, AuthPreviewOperateScope],
  [WS_METHODS.previewNavigate, AuthPreviewOperateScope],
  [WS_METHODS.previewResize, AuthPreviewOperateScope],
  [WS_METHODS.previewRefresh, AuthPreviewOperateScope],
  [WS_METHODS.previewClose, AuthPreviewOperateScope],
  [WS_METHODS.previewList, AuthPreviewOperateScope],
  [WS_METHODS.previewReportStatus, AuthPreviewOperateScope],
  [WS_METHODS.previewAutomationConnect, AuthPreviewOperateScope],
  [WS_METHODS.previewAutomationRespond, AuthPreviewOperateScope],
  [WS_METHODS.previewAutomationFocusHost, AuthPreviewOperateScope],
  [WS_METHODS.subscribePreviewEvents, AuthPreviewOperateScope],
  [WS_METHODS.subscribeDiscoveredLocalServers, AuthOrchestrationReadScope],
  [WS_METHODS.subscribeServerConfig, [AuthOrchestrationReadScope, AuthQaReadScope]],
  [WS_METHODS.subscribeServerLifecycle, [AuthOrchestrationReadScope, AuthQaReadScope]],
  [WS_METHODS.subscribeAuthAccess, AuthAccessReadScope],
]);

export const requiredScopesForRpcMethod = (method: string): ReadonlyArray<AuthEnvironmentScope> => {
  const requiredScope = RPC_REQUIRED_SCOPE.get(method);
  if (requiredScope === undefined) {
    throw new Error(`RPC method ${method} has no declared authorization scope.`);
  }
  return typeof requiredScope === "string" ? [requiredScope] : requiredScope;
};

export const redactServerConfigPathForScopes = (
  scopes: ReadonlyArray<AuthEnvironmentScope>,
  path: string,
  redactedLabel: "workspace" | "settings" | "logs",
): string => (scopes.includes(AuthOrchestrationReadScope) ? path : redactedLabel);

function toAuthAccessStreamEvent(
  change: PairingGrantStore.BootstrapCredentialChange | SessionStore.SessionCredentialChange,
  revision: number,
  currentSessionId: AuthSessionId,
): AuthAccessStreamEvent {
  switch (change.type) {
    case "pairingLinkUpserted":
      return {
        version: 1,
        revision,
        type: "pairingLinkUpserted",
        payload: change.pairingLink,
      };
    case "pairingLinkRemoved":
      return {
        version: 1,
        revision,
        type: "pairingLinkRemoved",
        payload: { id: change.id },
      };
    case "clientUpserted":
      return {
        version: 1,
        revision,
        type: "clientUpserted",
        payload: {
          ...change.clientSession,
          current: change.clientSession.sessionId === currentSessionId,
        },
      };
    case "clientRemoved":
      return {
        version: 1,
        revision,
        type: "clientRemoved",
        payload: { sessionId: change.sessionId },
      };
  }
}

const makeWsRpcLayer = (
  currentSession: EnvironmentAuth.AuthenticatedSession,
  previewAutomationBroker: PreviewAutomationBroker.PreviewAutomationBroker["Service"],
  qaReleaseEventBus: QaReleaseEventBus.QaReleaseEventBus["Service"],
) =>
  WsRpcGroup.toLayer(
    Effect.gen(function* () {
      const currentSessionId = currentSession.sessionId;
      const crypto = yield* Crypto.Crypto;
      const projectionSnapshotQuery = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
      const orchestrationEngine = yield* OrchestrationEngine.OrchestrationEngineService;
      const checkpointDiffQuery = yield* CheckpointDiffQuery.CheckpointDiffQuery;
      const keybindings = yield* Keybindings.Keybindings;
      const externalLauncher = yield* ExternalLauncher.ExternalLauncher;
      const gitWorkflow = yield* GitWorkflowService.GitWorkflowService;
      const review = yield* ReviewService.ReviewService;
      const vcsProvisioning = yield* VcsProvisioningService.VcsProvisioningService;
      const vcsStatusBroadcaster = yield* VcsStatusBroadcaster.VcsStatusBroadcaster;
      const terminalManager = yield* TerminalManager.TerminalManager;
      const previewManager = yield* PreviewManager.PreviewManager;
      const portDiscovery = yield* PortScanner.PortDiscovery;
      const providerRegistry = yield* ProviderRegistry.ProviderRegistry;
      const providerMaintenanceRunner = yield* ProviderMaintenanceRunner.ProviderMaintenanceRunner;
      const config = yield* ServerConfig.ServerConfig;
      const lifecycleEvents = yield* ServerLifecycleEvents.ServerLifecycleEvents;
      const serverSettings = yield* ServerSettings.ServerSettingsService;
      const startup = yield* ServerRuntimeStartup.ServerRuntimeStartup;
      const workspaceEntries = yield* WorkspaceEntries.WorkspaceEntries;
      const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
      const projectSetupScriptRunner = yield* ProjectSetupScriptRunner.ProjectSetupScriptRunner;
      const repositoryIdentityResolver =
        yield* RepositoryIdentityResolver.RepositoryIdentityResolver;
      const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
      const environmentId = yield* serverEnvironment.getEnvironmentId;
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const sourceControlDiscovery = yield* SourceControlDiscovery.SourceControlDiscovery;
      const automaticGitFetchInterval = serverSettings.getSettings.pipe(
        Effect.map((settings) => settings.automaticGitFetchInterval),
        Effect.catch((cause) =>
          Effect.logWarning("Failed to read automatic Git fetch interval setting", {
            detail: cause.message,
          }).pipe(Effect.as(DEFAULT_AUTOMATIC_GIT_FETCH_INTERVAL)),
        ),
      );
      const sourceControlRepositories =
        yield* SourceControlRepositoryService.SourceControlRepositoryService;
      const bootstrapCredentials = yield* PairingGrantStore.PairingGrantStore;
      const sessions = yield* SessionStore.SessionStore;
      const processDiagnostics = yield* ProcessDiagnostics.ProcessDiagnostics;
      const processResourceMonitor = yield* ProcessResourceMonitor.ProcessResourceMonitor;
      const relayClient = yield* RelayClient.RelayClient;
      const qaWorkflow = yield* QaWorkflow.QaWorkflow;
      const qaDashboardQuery = yield* QaDashboardQuery.QaDashboardQuery;
      const qaReviewService = yield* QaReviewService.QaReviewService;
      const qaIam = yield* QaIam.QaIam;
      const qaDatabase = yield* QaDatabase.QaDatabase;
      const previewIdentity: PreviewAccessIdentity = {
        subject: currentSession.subject,
        sessionId: currentSession.sessionId,
        environmentId,
        workspaceAdministrator: currentSession.subject === "local:root",
      };
      const previewAuthorization = makePreviewAuthorization({
        identity: previewIdentity,
        iam: qaIam,
        manager: previewManager,
      });
      const qaLocalRuntime = yield* QaLocalRuntime.QaLocalRuntime;
      const qaAgentModelSelection = {
        instanceId: ProviderInstanceId.make("codex"),
        model: DEFAULT_MODEL,
      } as const;
      const publishQaSnapshot = (
        reason:
          | "stage_started"
          | "progress"
          | "proposal_received"
          | "review_recorded"
          | "stage_advanced"
          | "stage_blocked",
        snapshot: QaReleaseSnapshot,
      ) =>
        nowIso.pipe(
          Effect.flatMap((at) =>
            qaReleaseEventBus.publish({
              type: "updated",
              releaseId: snapshot.releaseId,
              threadId: snapshot.threadId,
              revision: snapshot.revision,
              reason,
              snapshot,
              at,
            }),
          ),
          Effect.as(snapshot),
        );
      const loadCurrentQaSnapshot = (threadId: ThreadId) =>
        qaWorkflow.getSnapshot({ threadId }).pipe(
          Effect.flatMap((snapshot) =>
            snapshot
              ? Effect.succeed(snapshot)
              : Effect.fail(
                  new QaOperationError({
                    code: "release_not_found",
                    message: "The QA release was not found.",
                  }),
                ),
          ),
        );
      const mapQaLocalRuntimeError = (cause: QaLocalRuntime.QaLocalRuntimeError) =>
        new QaOperationError({
          code:
            cause.code === "identity_collision" || cause.code === "stale_runtime"
              ? "invalid_workflow_state"
              : "persistence_failed",
          message: cause.message,
        });
      const publishReviewMutation = <A, R>(
        threadId: ThreadId,
        effect: Effect.Effect<A, QaReviewService.QaReviewError, R>,
      ) =>
        effect.pipe(
          Effect.mapError(mapQaReviewError),
          Effect.flatMap((reviewThread) =>
            loadCurrentQaSnapshot(threadId).pipe(
              Effect.flatMap((snapshot) => publishQaSnapshot("review_recorded", snapshot)),
              Effect.map((snapshot) => ({ reviewThread, snapshot })),
            ),
          ),
        );
      const authorizationError = (requiredScope: AuthEnvironmentScope) =>
        new EnvironmentAuthorizationError({
          message: `The authenticated token is missing required scope: ${requiredScope}.`,
          requiredScope,
        });
      const inactiveSessionAuthorizationError = (requiredScope: AuthEnvironmentScope) =>
        new EnvironmentAuthorizationError({
          message: "The authenticated session is no longer active.",
          requiredScope,
        });
      const hasRequiredScope = (requiredScope: RpcRequiredScope) =>
        typeof requiredScope === "string"
          ? currentSession.scopes.includes(requiredScope)
          : requiredScope.some((scope) => currentSession.scopes.includes(scope));
      const firstRequiredScope = (requiredScope: RpcRequiredScope) =>
        typeof requiredScope === "string" ? requiredScope : requiredScope[0]!;
      const assertCurrentSessionActive = (requiredScope: RpcRequiredScope) =>
        sessions
          .assertActive(currentSessionId)
          .pipe(
            Effect.mapError(() =>
              inactiveSessionAuthorizationError(firstRequiredScope(requiredScope)),
            ),
          );
      const isQaChatOnlySession =
        currentSession.scopes.includes(AuthQaChatScope) &&
        !currentSession.scopes.includes(AuthOrchestrationOperateScope);
      const requireQaConversationAccessIfBound = (threadId: ThreadId) =>
        isQaChatOnlySession
          ? qaIam
              .authorizeConversation({
                subject: currentSession.subject,
                conversationThreadId: threadId,
                environmentId,
                capability: "qa:chat",
              })
              .pipe(Effect.as(true))
          : qaIam
              .resolveConversationContext({
                conversationThreadId: threadId,
                environmentId,
              })
              .pipe(
                Effect.map(Option.some),
                Effect.catch((cause) =>
                  cause.code === "conversation_not_found"
                    ? Effect.succeed(Option.none<QaIam.QaConversationAccess>())
                    : Effect.fail(cause),
                ),
                Effect.flatMap(
                  Option.match({
                    onNone: () => Effect.succeed(false),
                    onSome: () =>
                      qaIam
                        .authorizeConversation({
                          subject: currentSession.subject,
                          conversationThreadId: threadId,
                          environmentId,
                          capability: "qa:chat",
                        })
                        .pipe(Effect.as(true)),
                  }),
                ),
              );
      const authorizeQaConversationThread = (threadId: ThreadId) =>
        requireQaConversationAccessIfBound(threadId).pipe(
          Effect.mapError(
            (cause) =>
              new OrchestrationDispatchCommandError({
                message: "The authenticated QA principal cannot access this release conversation.",
                cause,
              }),
          ),
        );
      const authorizeQaConversationSubscription = (threadId: ThreadId) =>
        requireQaConversationAccessIfBound(threadId).pipe(
          Effect.mapError(() => authorizationError(AuthQaChatScope)),
        );
      const mapQaProjectRegistrationError = (cause: QaIam.QaIamError) =>
        cause.code === "project_access_denied" || cause.code === "capability_denied"
          ? authorizationError(AuthQaMakeScope)
          : new QaOperationError({
              code: "persistence_failed",
              message: "The QA project could not be registered.",
            });
      const qaCapabilityScope = (capability: QaIam.QaIamCapability): AuthEnvironmentScope => {
        switch (capability) {
          case "qa:make":
            return AuthQaMakeScope;
          case "qa:approve":
            return AuthQaApproveScope;
          case "qa:chat":
            return AuthQaChatScope;
          case "qa:read":
          case "qa:test-application":
          default:
            return AuthQaReadScope;
        }
      };
      const authorizeQaReleaseEffect = <A, E, R>(
        threadId: ThreadId,
        capability: QaIam.QaIamCapability,
        effect: Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | QaOperationError | EnvironmentAuthorizationError, R> =>
        qaIam
          .authorizeRelease({
            subject: currentSession.subject,
            releaseThreadId: threadId,
            capability,
          })
          .pipe(
            Effect.mapError((cause) =>
              cause.code === "release_not_found"
                ? new QaOperationError({
                    code: "release_not_found",
                    message: "The QA release was not found.",
                  })
                : authorizationError(qaCapabilityScope(capability)),
            ),
            Effect.andThen(effect),
          );
      const withQaReleaseAccess = <A, E, R>(
        threadId: ThreadId,
        capability: QaIam.QaIamCapability,
        use: (access: QaIam.QaReleaseAccess) => Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | QaOperationError | EnvironmentAuthorizationError, R> =>
        qaIam
          .authorizeRelease({
            subject: currentSession.subject,
            releaseThreadId: threadId,
            capability,
          })
          .pipe(
            Effect.mapError((cause) =>
              cause.code === "release_not_found"
                ? new QaOperationError({
                    code: "release_not_found",
                    message: "The QA release was not found.",
                  })
                : authorizationError(qaCapabilityScope(capability)),
            ),
            Effect.flatMap(use),
          );
      const ensureQaReleaseConversation = (
        releaseId: QaReleaseId,
        capability: QaIam.QaIamCapability,
      ) => {
        const releaseThreadId = ThreadId.make(releaseId);
        return withQaReleaseAccess(releaseThreadId, capability, (access) =>
          loadCurrentQaSnapshot(releaseThreadId).pipe(
            Effect.flatMap((snapshot) =>
              qaLocalRuntime
                .ensureConversation({
                  subject: currentSession.subject,
                  releaseId,
                  projectTitle: access.projectName,
                  releaseTitle: snapshot.title,
                  modelSelection: qaAgentModelSelection,
                })
                .pipe(
                  Effect.mapError(mapQaLocalRuntimeError),
                  Effect.map((conversation) => ({ access, conversation, snapshot })),
                ),
            ),
          ),
        );
      };
      const reviewActor = (access: QaIam.QaReleaseAccess): QaReviewActor => ({
        principalId: access.principal.id,
        displayName: access.principal.displayName,
        role: access.role,
      });
      const authorizeEffect = <A, E, R>(
        requiredScope: RpcRequiredScope,
        effect: Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | EnvironmentAuthorizationError, R> =>
        assertCurrentSessionActive(requiredScope).pipe(
          Effect.flatMap(
            (): Effect.Effect<A, E | EnvironmentAuthorizationError, R> =>
              hasRequiredScope(requiredScope)
                ? effect
                : Effect.fail(authorizationError(firstRequiredScope(requiredScope))),
          ),
        );
      const authorizeStream = <A, E, R>(
        requiredScope: RpcRequiredScope,
        stream: Stream.Stream<A, E, R>,
      ): Stream.Stream<A, E | EnvironmentAuthorizationError, R> =>
        Stream.unwrap(
          authorizeEffect(
            requiredScope,
            Effect.succeed(
              reauthorizeStreamItems(stream, () => assertCurrentSessionActive(requiredScope)),
            ),
          ),
        );
      const requiredScopeForMethod = (method: string): RpcRequiredScope => {
        const requiredScopes = requiredScopesForRpcMethod(method);
        return requiredScopes.length === 1 ? requiredScopes[0]! : requiredScopes;
      };
      const observeRpcEffect = <A, E, R>(
        method: string,
        effect: Effect.Effect<A, E, R>,
        traceAttributes?: Readonly<Record<string, unknown>>,
      ) =>
        instrumentRpcEffect(
          method,
          authorizeEffect(requiredScopeForMethod(method), effect),
          traceAttributes,
        );
      const observeQaReleaseRpcEffect = <A, E, R>(
        method: string,
        threadId: ThreadId,
        capability: QaIam.QaIamCapability,
        effect: Effect.Effect<A, E, R>,
      ) =>
        observeRpcEffect(method, authorizeQaReleaseEffect(threadId, capability, effect), {
          "rpc.aggregate": "qa",
        });
      const observeRpcStream = <A, E, R>(
        method: string,
        stream: Stream.Stream<A, E, R>,
        traceAttributes?: Readonly<Record<string, unknown>>,
      ) =>
        instrumentRpcStream(
          method,
          authorizeStream(requiredScopeForMethod(method), stream),
          traceAttributes,
        );
      const observeQaReleaseRpcStream = <A, E, R>(
        method: string,
        threadId: ThreadId,
        capability: QaIam.QaIamCapability,
        stream: Stream.Stream<A, E, R>,
      ) =>
        observeRpcStream(
          method,
          Stream.unwrap(
            authorizeQaReleaseEffect(
              threadId,
              capability,
              Effect.succeed(
                reauthorizeStreamItems(stream, () =>
                  authorizeQaReleaseEffect(threadId, capability, Effect.void),
                ),
              ),
            ),
          ),
          { "rpc.aggregate": "qa" },
        );
      const authorizeQaConversationStream = <A, E, R>(
        threadId: ThreadId,
        qaBound: boolean,
        stream: Stream.Stream<A, E, R>,
      ): Stream.Stream<A, E | EnvironmentAuthorizationError, R> =>
        qaBound
          ? reauthorizeStreamItems(stream, () => authorizeQaConversationSubscription(threadId))
          : stream;
      const withPreviewAccess = <A, E, R>(
        threadId: ThreadId,
        use: (access: import("./preview/Access.ts").PreviewAccessGrant) => Effect.Effect<A, E, R>,
      ) => previewAuthorization.authorizeThread(threadId).pipe(Effect.flatMap(use));
      const authorizedPreviewEvents = previewManager.events.pipe(
        Stream.filterEffect((envelope) =>
          previewAuthorization.authorizeDescriptor(envelope.access).pipe(
            Effect.as(true),
            Effect.orElseSucceed(() => false),
          ),
        ),
        Stream.map((envelope) => envelope.event),
      );
      const observeRpcStreamEffect = <A, StreamError, StreamContext, EffectError, EffectContext>(
        method: string,
        effect: Effect.Effect<
          Stream.Stream<A, StreamError, StreamContext>,
          EffectError,
          EffectContext
        >,
        traceAttributes?: Readonly<Record<string, unknown>>,
      ) =>
        instrumentRpcStreamEffect(
          method,
          authorizeEffect(requiredScopeForMethod(method), effect).pipe(
            Effect.map((stream) =>
              reauthorizeStreamItems(stream, () =>
                assertCurrentSessionActive(requiredScopeForMethod(method)),
              ),
            ),
          ),
          traceAttributes,
        );
      const toDispatchCommandError = (cause: unknown, fallbackMessage: string) =>
        isOrchestrationDispatchCommandError(cause)
          ? cause
          : new OrchestrationDispatchCommandError({
              message: cause instanceof Error ? cause.message : fallbackMessage,
              cause,
            });
      const randomUUID = crypto.randomUUIDv4.pipe(
        Effect.mapError((cause) =>
          toDispatchCommandError(cause, "Failed to generate orchestration command identifier."),
        ),
      );
      const serverEventId = randomUUID.pipe(Effect.map(EventId.make));
      const serverCommandId = (tag: string) =>
        randomUUID.pipe(Effect.map((uuid) => CommandId.make(`server:${tag}:${uuid}`)));

      const loadAuthAccessSnapshot = () =>
        Effect.all({
          pairingLinks: serverAuth.listPairingLinks(),
          clientSessions: serverAuth.listClientSessions(currentSessionId),
        }).pipe(
          Effect.mapError(
            (error) =>
              new AuthAccessStreamError({
                message: error.message,
              }),
          ),
        );

      const appendSetupScriptActivity = (input: {
        readonly threadId: ThreadId;
        readonly kind: "setup-script.requested" | "setup-script.started" | "setup-script.failed";
        readonly summary: string;
        readonly createdAt: string;
        readonly payload: Record<string, unknown>;
        readonly tone: "info" | "error";
      }) =>
        Effect.all({
          commandId: serverCommandId("setup-script-activity"),
          activityId: serverEventId,
        }).pipe(
          Effect.flatMap(({ commandId, activityId }) =>
            orchestrationEngine.dispatch({
              type: "thread.activity.append",
              commandId,
              threadId: input.threadId,
              activity: {
                id: activityId,
                tone: input.tone,
                kind: input.kind,
                summary: input.summary,
                payload: input.payload,
                turnId: null,
                createdAt: input.createdAt,
              },
              createdAt: input.createdAt,
            }),
          ),
        );

      const toBootstrapDispatchCommandCauseError = (cause: Cause.Cause<unknown>) => {
        const error = Cause.squash(cause);
        return isOrchestrationDispatchCommandError(error)
          ? error
          : new OrchestrationDispatchCommandError({
              message:
                error instanceof Error ? error.message : "Failed to bootstrap thread turn start.",
              cause,
            });
      };

      const enrichProjectEvent = (
        event: OrchestrationEvent,
      ): Effect.Effect<OrchestrationEvent, never, never> => {
        switch (event.type) {
          case "project.created":
            return repositoryIdentityResolver.resolve(event.payload.workspaceRoot).pipe(
              Effect.map((repositoryIdentity) => ({
                ...event,
                payload: {
                  ...event.payload,
                  repositoryIdentity,
                },
              })),
            );
          case "project.meta-updated":
            return Effect.gen(function* () {
              const workspaceRoot =
                event.payload.workspaceRoot ??
                Option.match(
                  yield* projectionSnapshotQuery.getProjectShellById(event.payload.projectId),
                  {
                    onNone: () => null,
                    onSome: (project) => project.workspaceRoot,
                  },
                ) ??
                null;
              if (workspaceRoot === null) {
                return event;
              }

              const repositoryIdentity = yield* repositoryIdentityResolver.resolve(workspaceRoot);
              return {
                ...event,
                payload: {
                  ...event.payload,
                  repositoryIdentity,
                },
              } satisfies OrchestrationEvent;
            }).pipe(Effect.orElseSucceed(() => event));
          default:
            return Effect.succeed(event);
        }
      };

      const enrichOrchestrationEvents = (events: ReadonlyArray<OrchestrationEvent>) =>
        Effect.forEach(events, enrichProjectEvent, { concurrency: 4 });

      const toShellStreamEvent = (
        event: OrchestrationEvent,
      ): Effect.Effect<Option.Option<OrchestrationShellStreamEvent>, never, never> => {
        switch (event.type) {
          case "project.created":
          case "project.meta-updated":
            return projectionSnapshotQuery.getProjectShellById(event.payload.projectId).pipe(
              Effect.map((project) =>
                Option.map(project, (nextProject) => ({
                  kind: "project-upserted" as const,
                  sequence: event.sequence,
                  project: nextProject,
                })),
              ),
              Effect.orElseSucceed(() => Option.none()),
            );
          case "project.deleted":
            return Effect.succeed(
              Option.some({
                kind: "project-removed" as const,
                sequence: event.sequence,
                projectId: event.payload.projectId,
              }),
            );
          case "thread.deleted":
          case "thread.archived":
            return Effect.succeed(
              Option.some({
                kind: "thread-removed" as const,
                sequence: event.sequence,
                threadId: event.payload.threadId,
              }),
            );
          case "thread.unarchived":
            return projectionSnapshotQuery.getThreadShellById(event.payload.threadId).pipe(
              Effect.map((thread) =>
                Option.map(thread, (nextThread) => ({
                  kind: "thread-upserted" as const,
                  sequence: event.sequence,
                  thread: nextThread,
                })),
              ),
              Effect.orElseSucceed(() => Option.none()),
            );
          default:
            if (event.aggregateKind !== "thread") {
              return Effect.succeed(Option.none());
            }
            return projectionSnapshotQuery
              .getThreadShellById(ThreadId.make(event.aggregateId))
              .pipe(
                Effect.map((thread) =>
                  Option.map(thread, (nextThread) => ({
                    kind: "thread-upserted" as const,
                    sequence: event.sequence,
                    thread: nextThread,
                  })),
                ),
                Effect.orElseSucceed(() => Option.none()),
              );
        }
      };

      const dispatchBootstrapTurnStart = (
        command: Extract<OrchestrationCommand, { type: "thread.turn.start" }>,
      ): Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchCommandError> =>
        Effect.gen(function* () {
          const bootstrap = command.bootstrap;
          const { bootstrap: _bootstrap, ...finalTurnStartCommand } = command;
          let createdThread = false;
          let targetProjectId = bootstrap?.createThread?.projectId;
          let targetProjectCwd = bootstrap?.prepareWorktree?.projectCwd;
          let targetWorktreePath = bootstrap?.createThread?.worktreePath ?? null;

          const cleanupCreatedThread = () =>
            createdThread
              ? serverCommandId("bootstrap-thread-delete").pipe(
                  Effect.flatMap((commandId) =>
                    orchestrationEngine.dispatch({
                      type: "thread.delete",
                      commandId,
                      threadId: command.threadId,
                    }),
                  ),
                  Effect.ignoreCause({ log: true }),
                )
              : Effect.void;

          const recordSetupScriptLaunchFailure = (input: {
            readonly error: ProjectSetupScriptRunner.ProjectSetupScriptRunnerError;
            readonly requestedAt: string;
            readonly worktreePath: string;
          }) => {
            const detail = projectSetupScriptCompatibilityDetail(input.error);
            return appendSetupScriptActivity({
              threadId: command.threadId,
              kind: "setup-script.failed",
              summary: "Setup script failed to start",
              createdAt: input.requestedAt,
              payload: {
                detail,
                worktreePath: input.worktreePath,
              },
              tone: "error",
            }).pipe(
              Effect.ignoreCause({ log: false }),
              Effect.flatMap(() =>
                Effect.logWarning("bootstrap turn start failed to launch setup script", {
                  threadId: command.threadId,
                  worktreePath: input.worktreePath,
                  detail,
                }),
              ),
            );
          };

          const recordSetupScriptStarted = (input: {
            readonly requestedAt: string;
            readonly worktreePath: string;
            readonly scriptId: string;
            readonly scriptName: string;
            readonly terminalId: string;
          }) =>
            Effect.gen(function* () {
              const startedAt = yield* nowIso;
              const payload = {
                scriptId: input.scriptId,
                scriptName: input.scriptName,
                terminalId: input.terminalId,
                worktreePath: input.worktreePath,
              };
              yield* Effect.all([
                appendSetupScriptActivity({
                  threadId: command.threadId,
                  kind: "setup-script.requested",
                  summary: "Starting setup script",
                  createdAt: input.requestedAt,
                  payload,
                  tone: "info",
                }),
                appendSetupScriptActivity({
                  threadId: command.threadId,
                  kind: "setup-script.started",
                  summary: "Setup script started",
                  createdAt: startedAt,
                  payload,
                  tone: "info",
                }),
              ]).pipe(
                Effect.asVoid,
                Effect.catch((error) =>
                  Effect.logWarning(
                    "bootstrap turn start launched setup script but failed to record setup activity",
                    {
                      threadId: command.threadId,
                      worktreePath: input.worktreePath,
                      scriptId: input.scriptId,
                      terminalId: input.terminalId,
                      detail: error.message,
                    },
                  ),
                ),
              );
            });

          const runSetupProgram = () =>
            Effect.gen(function* () {
              if (!bootstrap?.runSetupScript || !targetWorktreePath) {
                return;
              }
              const worktreePath = targetWorktreePath;
              const requestedAt = yield* nowIso;
              yield* projectSetupScriptRunner
                .runForThread({
                  threadId: command.threadId,
                  ...(targetProjectId ? { projectId: targetProjectId } : {}),
                  ...(targetProjectCwd ? { projectCwd: targetProjectCwd } : {}),
                  worktreePath,
                })
                .pipe(
                  Effect.matchEffect({
                    onFailure: (error) =>
                      recordSetupScriptLaunchFailure({
                        error,
                        requestedAt,
                        worktreePath,
                      }),
                    onSuccess: (setupResult) => {
                      if (setupResult.status !== "started") {
                        return Effect.void;
                      }
                      return recordSetupScriptStarted({
                        requestedAt,
                        worktreePath,
                        scriptId: setupResult.scriptId,
                        scriptName: setupResult.scriptName,
                        terminalId: setupResult.terminalId,
                      });
                    },
                  }),
                );
            });

          const bootstrapProgram = Effect.gen(function* () {
            if (bootstrap?.createThread) {
              yield* orchestrationEngine.dispatch({
                type: "thread.create",
                commandId: yield* serverCommandId("bootstrap-thread-create"),
                threadId: command.threadId,
                projectId: bootstrap.createThread.projectId,
                title: bootstrap.createThread.title,
                modelSelection: bootstrap.createThread.modelSelection,
                runtimeMode: bootstrap.createThread.runtimeMode,
                interactionMode: bootstrap.createThread.interactionMode,
                branch: bootstrap.createThread.branch,
                worktreePath: bootstrap.createThread.worktreePath,
                createdAt: bootstrap.createThread.createdAt,
              });
              createdThread = true;
            }

            if (bootstrap?.prepareWorktree) {
              let worktreeBaseRef = bootstrap.prepareWorktree.baseBranch;
              if (bootstrap.prepareWorktree.startFromOrigin) {
                yield* gitWorkflow.fetchRemote({
                  cwd: bootstrap.prepareWorktree.projectCwd,
                  remoteName: "origin",
                });
                const resolvedRemoteBase = yield* gitWorkflow.resolveRemoteTrackingCommit({
                  cwd: bootstrap.prepareWorktree.projectCwd,
                  refName: bootstrap.prepareWorktree.baseBranch,
                  fallbackRemoteName: "origin",
                });
                worktreeBaseRef = resolvedRemoteBase.commitSha;
              }
              const worktree = yield* gitWorkflow.createWorktree({
                cwd: bootstrap.prepareWorktree.projectCwd,
                refName: worktreeBaseRef,
                newRefName: bootstrap.prepareWorktree.branch,
                baseRefName: bootstrap.prepareWorktree.baseBranch,
                path: null,
              });
              targetWorktreePath = worktree.worktree.path;
              yield* orchestrationEngine.dispatch({
                type: "thread.meta.update",
                commandId: yield* serverCommandId("bootstrap-thread-meta-update"),
                threadId: command.threadId,
                branch: worktree.worktree.refName,
                worktreePath: targetWorktreePath,
              });
              yield* refreshGitStatus(targetWorktreePath);
            }

            yield* runSetupProgram();

            return yield* orchestrationEngine.dispatch(finalTurnStartCommand);
          });

          return yield* bootstrapProgram.pipe(
            Effect.catchCause((cause) => {
              const dispatchError = toBootstrapDispatchCommandCauseError(cause);
              if (Cause.hasInterruptsOnly(cause)) {
                return Effect.fail(dispatchError);
              }
              return cleanupCreatedThread().pipe(Effect.flatMap(() => Effect.fail(dispatchError)));
            }),
          );
        });

      const dispatchNormalizedCommand = (
        normalizedCommand: OrchestrationCommand,
      ): Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchCommandError> => {
        const authenticatedCommand: OrchestrationCommand =
          normalizedCommand.type === "thread.turn.start"
            ? {
                ...normalizedCommand,
                // Never preserve authorization provenance supplied by a normal
                // RPC payload. Bind the command to this authenticated transport.
                initiatingSessionId: currentSessionId,
              }
            : normalizedCommand;
        const dispatchEffect =
          authenticatedCommand.type === "thread.turn.start" && authenticatedCommand.bootstrap
            ? dispatchBootstrapTurnStart(authenticatedCommand)
            : orchestrationEngine
                .dispatch(authenticatedCommand)
                .pipe(
                  Effect.mapError((cause) =>
                    toDispatchCommandError(cause, "Failed to dispatch orchestration command"),
                  ),
                );

        return startup
          .enqueueCommand(dispatchEffect)
          .pipe(
            Effect.mapError((cause) =>
              toDispatchCommandError(cause, "Failed to dispatch orchestration command"),
            ),
          );
      };

      const createQaProject = (input: {
        readonly projectId: ProjectId;
        readonly releaseId: QaReleaseId;
        readonly projectTitle: string;
        readonly releaseTitle: string;
      }) =>
        qaDatabase
          .withTransaction(
            qaIam
              .registerProject({
                subject: currentSession.subject,
                projectId: input.projectId,
                projectName: input.projectTitle,
              })
              .pipe(
                Effect.mapError(mapQaProjectRegistrationError),
                Effect.flatMap(() =>
                  qaWorkflow.initializeRelease({
                    projectId: input.projectId,
                    // `thread_id` is the legacy QA database column name. This
                    // value is a shared release id, never a local conversation id.
                    threadId: ThreadId.make(input.releaseId),
                    releaseTitle: input.releaseTitle,
                  }),
                ),
              ),
          )
          // The QA SQL transaction is the only write boundary. Local
          // orchestration projects and conversation threads are created lazily
          // by the principal who chooses to open Chat for this release.
          .pipe(
            Effect.mapError((cause) =>
              isEnvironmentAuthorizationError(cause) || isQaOperationError(cause)
                ? cause
                : new QaOperationError({
                    code: "persistence_failed",
                    message: "The QA project and first release could not be created.",
                  }),
            ),
          );

      const startQaStageGeneration = (input: {
        readonly releaseId: QaReleaseId;
        readonly expectedRevision: number;
      }) => {
        const releaseThreadId = ThreadId.make(input.releaseId);
        let claimedJobId: string | null = null;
        let dispatchAccepted = false;
        return Effect.gen(function* () {
          const { access, conversation, snapshot } = yield* ensureQaReleaseConversation(
            input.releaseId,
            "qa:make",
          );
          const prompt = buildQaStageKickoffPrompt({
            activeStage: snapshot.activeStage,
            projectTitle: access.projectName,
            releaseLabel: `Release ${snapshot.releaseNumber}: ${snapshot.title}`,
          });
          if (prompt === null) {
            return yield* new QaOperationError({
              code: "invalid_workflow_state",
              message: `The ${snapshot.activeStage} stage does not support agent generation.`,
            });
          }

          const jobUuid = yield* crypto.randomUUIDv4.pipe(
            Effect.mapError(
              () =>
                new QaOperationError({
                  code: "persistence_failed",
                  message: "The stage generation job could not be created.",
                }),
            ),
          );
          const jobId = `qa-stage-generation:${jobUuid}`;
          const claimed = yield* qaWorkflow.claimAgentStageGeneration(
            releaseThreadId,
            input.expectedRevision,
            jobId,
            {
              environmentId,
              conversationThreadId: conversation.conversationThreadId,
            },
          );
          claimedJobId = jobId;
          yield* publishQaSnapshot("stage_started", claimed);

          const acceptedAt = yield* nowIso;
          const messageId = MessageId.make(`${jobId}:message`);
          yield* dispatchNormalizedCommand({
            type: "thread.turn.start",
            commandId: yield* serverCommandId("qa-stage-generation"),
            threadId: conversation.conversationThreadId,
            message: {
              messageId,
              role: "user",
              text: prompt,
              attachments: [],
            },
            modelSelection: qaAgentModelSelection,
            titleSeed: `${snapshot.title} · ${snapshot.activeStage.replaceAll("_", " ")}`,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: "default",
            createdAt: acceptedAt,
          }).pipe(
            Effect.mapError(
              () =>
                new QaOperationError({
                  code: "persistence_failed",
                  message: "The release agent could not start this stage in the background.",
                }),
            ),
          );
          dispatchAccepted = true;
          return {
            releaseId: input.releaseId,
            conversationThreadId: conversation.conversationThreadId,
            stage: snapshot.activeStage,
            revision: claimed.revision,
            acceptedAt,
          } as const;
        }).pipe(
          Effect.mapError((cause) =>
            isOrchestrationDispatchCommandError(cause)
              ? new QaOperationError({
                  code: "persistence_failed",
                  message: "The release agent could not start this stage in the background.",
                })
              : cause,
          ),
          Effect.onExit((exit) =>
            Exit.isFailure(exit) && claimedJobId !== null && !dispatchAccepted
              ? Effect.uninterruptible(
                  qaWorkflow.releaseAgentStageGeneration(releaseThreadId, claimedJobId).pipe(
                    Effect.flatMap((released) => publishQaSnapshot("stage_blocked", released)),
                    Effect.ignore,
                  ),
                )
              : Effect.void,
          ),
        );
      };

      const loadServerConfig = Effect.gen(function* () {
        const keybindingsConfig = yield* keybindings.loadConfigState;
        const providers = yield* providerRegistry.getProviders;
        const settings = ServerSettings.redactServerSettingsForClient(
          yield* serverSettings.getSettings,
        );
        const environment = yield* serverEnvironment.getDescriptor;
        const auth = yield* serverAuth.getDescriptor();

        return {
          environment,
          auth,
          cwd: redactServerConfigPathForScopes(currentSession.scopes, config.cwd, "workspace"),
          keybindingsConfigPath: redactServerConfigPathForScopes(
            currentSession.scopes,
            config.keybindingsConfigPath,
            "settings",
          ),
          keybindings: keybindingsConfig.keybindings,
          issues: keybindingsConfig.issues,
          providers,
          availableEditors: yield* externalLauncher.resolveAvailableEditors(),
          observability: {
            logsDirectoryPath: redactServerConfigPathForScopes(
              currentSession.scopes,
              config.logsDir,
              "logs",
            ),
            localTracingEnabled: true,
            ...(config.otlpTracesUrl !== undefined ? { otlpTracesUrl: config.otlpTracesUrl } : {}),
            otlpTracesEnabled: config.otlpTracesUrl !== undefined,
            ...(config.otlpMetricsUrl !== undefined
              ? { otlpMetricsUrl: config.otlpMetricsUrl }
              : {}),
            otlpMetricsEnabled: config.otlpMetricsUrl !== undefined,
          },
          settings,
        };
      });

      const refreshGitStatus = (cwd: string) =>
        vcsStatusBroadcaster
          .refreshStatus(cwd)
          .pipe(Effect.ignoreCause({ log: true }), Effect.forkDetach, Effect.asVoid);

      return WsRpcGroup.of({
        [WS_METHODS.qaListAssignedReleases]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaListAssignedReleases,
            qaDashboardQuery
              .listAssignedReleases({
                subject: currentSession.subject,
                ...(input.completedSince ? { completedSince: input.completedSince } : {}),
              })
              .pipe(Effect.mapError(mapQaReviewError)),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaSubscribeAssignedReleases]: (input) =>
          observeRpcStream(
            WS_METHODS.qaSubscribeAssignedReleases,
            subscribeAssignedReleaseDashboard({
              subject: currentSession.subject,
              ...(input.completedSince === undefined
                ? {}
                : { completedSince: input.completedSince }),
              dashboardQuery: qaDashboardQuery,
              iam: qaIam,
              eventBus: qaReleaseEventBus,
            }).pipe(Stream.mapError(mapQaReviewError)),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaGetReleaseAccess]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaGetReleaseAccess,
            withQaReleaseAccess(input.threadId, "qa:read", (access) =>
              Effect.succeed({
                releaseId: QaReleaseId.make(input.threadId),
                threadId: input.threadId,
                projectId: ProjectId.make(access.projectId),
                principalId: access.principal.id,
                role: access.role,
                uiRole: access.role === "qa:maker" ? ("maker" as const) : ("approver" as const),
                capabilities: access.capabilities.filter(
                  (capability) => capability !== "qa:test-application",
                ),
              }),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaListReviewThreads]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaListReviewThreads,
            withQaReleaseAccess(input.threadId, "qa:read", (access) =>
              qaReviewService
                .listThreads({
                  threadId: input.threadId,
                  principalId: access.principal.id,
                  ...(input.artifactKind ? { artifactKind: input.artifactKind } : {}),
                  ...(input.artifactId ? { artifactId: input.artifactId } : {}),
                })
                .pipe(Effect.mapError(mapQaReviewError)),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaAddReviewComment]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaAddReviewComment,
            withQaReleaseAccess(input.threadId, "qa:approve", (access) =>
              publishReviewMutation(
                input.threadId,
                qaReviewService.addComment(input, reviewActor(access)),
              ),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaReplyReviewComment]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaReplyReviewComment,
            withQaReleaseAccess(input.threadId, "qa:make", (access) =>
              publishReviewMutation(
                input.threadId,
                qaReviewService.reply(input, reviewActor(access)),
              ),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaRunReviewCommentAiCheck]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaRunReviewCommentAiCheck,
            withQaReleaseAccess(input.threadId, "qa:approve", (access) =>
              qaReviewService.enqueueAiRun(input, reviewActor(access)).pipe(
                Effect.mapError(mapQaReviewError),
                Effect.flatMap((run) =>
                  loadCurrentQaSnapshot(input.threadId).pipe(
                    Effect.flatMap((snapshot) => publishQaSnapshot("review_recorded", snapshot)),
                    Effect.as(run),
                  ),
                ),
              ),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaResolveReviewComment]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaResolveReviewComment,
            withQaReleaseAccess(input.threadId, "qa:approve", (access) =>
              publishReviewMutation(
                input.threadId,
                qaReviewService.resolve(input, reviewActor(access)),
              ),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaMarkReviewRead]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaMarkReviewRead,
            withQaReleaseAccess(input.threadId, "qa:read", (access) =>
              qaReviewService
                .markRead(input, reviewActor(access))
                .pipe(Effect.mapError(mapQaReviewError)),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaGetSnapshot]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaGetSnapshot,
            input.threadId,
            "qa:read",
            qaWorkflow.getSnapshot(input),
          ),
        [WS_METHODS.qaCreateProject]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaCreateProject,
            createQaProject(input).pipe(
              Effect.flatMap((snapshot) => publishQaSnapshot("stage_started", snapshot)),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaEnsureReleaseConversation]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaEnsureReleaseConversation,
            ensureQaReleaseConversation(input.releaseId, "qa:chat").pipe(
              Effect.map(({ conversation }) => ({
                releaseId: input.releaseId,
                runtimeProjectId: conversation.projectId,
                conversationThreadId: conversation.conversationThreadId,
              })),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaStartStageGeneration]: (input) =>
          observeRpcEffect(WS_METHODS.qaStartStageGeneration, startQaStageGeneration(input), {
            "rpc.aggregate": "qa",
          }),
        [WS_METHODS.qaInitializeRelease]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaInitializeRelease,
            qaIam
              .authorizeProject({
                subject: currentSession.subject,
                projectId: input.projectId,
                capability: "qa:make",
              })
              .pipe(
                Effect.mapError(mapQaProjectRegistrationError),
                Effect.andThen(qaWorkflow.initializeRelease(input)),
                Effect.flatMap((snapshot) => publishQaSnapshot("stage_started", snapshot)),
              ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaUploadDocument]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaUploadDocument,
            input.threadId,
            "qa:make",
            qaWorkflow
              .uploadDocument(input)
              .pipe(Effect.flatMap((snapshot) => publishQaSnapshot("progress", snapshot))),
          ),
        [WS_METHODS.qaStartIngestion]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaStartIngestion,
            input.threadId,
            "qa:make",
            qaWorkflow
              .startIngestion(input)
              .pipe(Effect.flatMap((snapshot) => publishQaSnapshot("stage_advanced", snapshot))),
          ),
        [WS_METHODS.qaReview]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaReview,
            input.threadId,
            "qa:approve",
            qaWorkflow
              .review(input)
              .pipe(
                Effect.flatMap((snapshot) =>
                  publishQaSnapshot(
                    snapshot.activeStage === "strategy" ? "stage_advanced" : "review_recorded",
                    snapshot,
                  ),
                ),
              ),
          ),
        [WS_METHODS.qaSubscribeRelease]: (input) =>
          observeQaReleaseRpcStream(
            WS_METHODS.qaSubscribeRelease,
            input.threadId,
            "qa:read",
            Stream.concat(
              Stream.fromEffect(
                qaWorkflow.getSnapshot(input).pipe(
                  Effect.flatMap((snapshot) =>
                    snapshot
                      ? nowIso.pipe(
                          Effect.map((at) => ({
                            type: "snapshot" as const,
                            releaseId: snapshot.releaseId,
                            threadId: snapshot.threadId,
                            revision: snapshot.revision,
                            snapshot,
                            at,
                          })),
                        )
                      : Effect.fail(
                          new QaOperationError({
                            code: "release_not_found",
                            message: "Initialize QA mode for this release first.",
                          }),
                        ),
                  ),
                ),
              ),
              qaReleaseEventBus.events.pipe(
                Stream.filter((event) => event.threadId === input.threadId),
                Stream.mapEffect((event) =>
                  qaWorkflow.getSnapshot(input).pipe(
                    Effect.flatMap((snapshot) =>
                      snapshot
                        ? Effect.succeed({
                            type: "updated" as const,
                            releaseId: snapshot.releaseId,
                            threadId: snapshot.threadId,
                            revision: snapshot.revision,
                            reason: event.reason,
                            snapshot,
                            at: event.at,
                          })
                        : Effect.fail(
                            new QaOperationError({
                              code: "release_not_found",
                              message: "The QA release was removed.",
                            }),
                          ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        [WS_METHODS.qaUpdateRequirement]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaUpdateRequirement,
            input.threadId,
            "qa:make",
            qaWorkflow
              .updateRequirement(input)
              .pipe(Effect.flatMap((snapshot) => publishQaSnapshot("proposal_received", snapshot))),
          ),
        [WS_METHODS.qaGetStrategy]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaGetStrategy,
            input.threadId,
            "qa:read",
            qaWorkflow.getStrategy(input),
          ),
        [WS_METHODS.qaGenerateStrategy]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaGenerateStrategy,
            input.threadId,
            "qa:make",
            qaWorkflow
              .generateStrategy(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("stage_started", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaUpdateStrategySection]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaUpdateStrategySection,
            input.threadId,
            "qa:make",
            qaWorkflow
              .updateStrategySection(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("proposal_received", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaAddStrategyComment]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaAddStrategyComment,
            input.threadId,
            "qa:approve",
            qaWorkflow
              .addStrategyComment(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("review_recorded", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaReplyStrategyComment]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaReplyStrategyComment,
            input.threadId,
            "qa:make",
            qaWorkflow
              .replyStrategyComment(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("review_recorded", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaResolveStrategyComment]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaResolveStrategyComment,
            input.threadId,
            "qa:approve",
            qaWorkflow
              .resolveStrategyComment(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("review_recorded", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaSubmitStrategy]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaSubmitStrategy,
            input.threadId,
            "qa:make",
            qaWorkflow
              .submitStrategy(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("review_recorded", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaReviewStrategy]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaReviewStrategy,
            withQaReleaseAccess(input.threadId, "qa:approve", (access) =>
              qaWorkflow
                .reviewStrategy(input, reviewActor(access))
                .pipe(
                  Effect.flatMap((result) =>
                    publishQaSnapshot(
                      result.decision === "approved" ? "stage_advanced" : "review_recorded",
                      result.snapshot,
                    ).pipe(Effect.as(result)),
                  ),
                ),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaGetScenarioPlan]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaGetScenarioPlan,
            input.threadId,
            "qa:read",
            qaWorkflow.getScenarioPlan(input),
          ),
        [WS_METHODS.qaUpdateScenario]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaUpdateScenario,
            input.threadId,
            "qa:make",
            qaWorkflow
              .updateScenario(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("proposal_received", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaSubmitScenarioPlan]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaSubmitScenarioPlan,
            input.threadId,
            "qa:make",
            qaWorkflow
              .submitScenarioPlan(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("review_recorded", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaReviewScenarioPlan]: (input) =>
          observeRpcEffect(
            WS_METHODS.qaReviewScenarioPlan,
            withQaReleaseAccess(input.threadId, "qa:approve", (access) =>
              qaWorkflow
                .reviewScenarioPlan(input, reviewActor(access))
                .pipe(
                  Effect.flatMap((result) =>
                    publishQaSnapshot(
                      result.decision === "approved" ? "stage_advanced" : "review_recorded",
                      result.snapshot,
                    ).pipe(Effect.as(result)),
                  ),
                ),
            ),
            { "rpc.aggregate": "qa" },
          ),
        [WS_METHODS.qaGetTestCasePlan]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaGetTestCasePlan,
            input.threadId,
            "qa:read",
            qaWorkflow.getTestCasePlan(input),
          ),
        [WS_METHODS.qaUpdateTestCase]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaUpdateTestCase,
            input.threadId,
            "qa:make",
            qaWorkflow
              .updateTestCase(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("proposal_received", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaSubmitTestCasePlan]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaSubmitTestCasePlan,
            input.threadId,
            "qa:make",
            qaWorkflow
              .submitTestCasePlan(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("review_recorded", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaReviewTestCasePlan]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaReviewTestCasePlan,
            input.threadId,
            "qa:approve",
            qaWorkflow
              .reviewTestCasePlan(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot(
                    result.decision === "approved" ? "stage_advanced" : "review_recorded",
                    result.snapshot,
                  ).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaGetScriptPlan]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaGetScriptPlan,
            input.threadId,
            "qa:read",
            qaWorkflow.getScriptPlan(input),
          ),
        [WS_METHODS.qaUpdateScript]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaUpdateScript,
            input.threadId,
            "qa:make",
            qaWorkflow
              .updateScript(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("proposal_received", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaSubmitScriptPlan]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaSubmitScriptPlan,
            input.threadId,
            "qa:make",
            qaWorkflow
              .submitScriptPlan(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot("review_recorded", result.snapshot).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaReviewScriptPlan]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaReviewScriptPlan,
            input.threadId,
            "qa:approve",
            qaWorkflow
              .reviewScriptPlan(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot(
                    result.decision === "approved" ? "stage_advanced" : "review_recorded",
                    result.snapshot,
                  ).pipe(Effect.as(result)),
                ),
              ),
          ),
        [WS_METHODS.qaGetReadiness]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaGetReadiness,
            input.threadId,
            "qa:read",
            qaWorkflow.getReadiness(input),
          ),
        [WS_METHODS.qaReviewReadiness]: (input) =>
          observeQaReleaseRpcEffect(
            WS_METHODS.qaReviewReadiness,
            input.threadId,
            "qa:approve",
            qaWorkflow
              .reviewReadiness(input)
              .pipe(
                Effect.flatMap((result) =>
                  publishQaSnapshot(
                    result.decision === "approved" ? "stage_advanced" : "review_recorded",
                    result.snapshot,
                  ).pipe(Effect.as(result)),
                ),
              ),
          ),
        [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.dispatchCommand,
            Effect.gen(function* () {
              const normalizedCommand = yield* normalizeDispatchCommand(command);
              if (isQaChatOnlySession) {
                if (
                  !(
                    normalizedCommand.type === "thread.turn.start" ||
                    normalizedCommand.type === "thread.turn.interrupt" ||
                    normalizedCommand.type === "thread.user-input.respond" ||
                    normalizedCommand.type === "thread.session.stop"
                  ) ||
                  (normalizedCommand.type === "thread.turn.start" &&
                    normalizedCommand.bootstrap !== undefined)
                ) {
                  return yield* new OrchestrationDispatchCommandError({
                    message:
                      "QA chat sessions may only send, interrupt, answer, or stop turns in their bound release conversation.",
                  });
                }
              }
              if ("threadId" in normalizedCommand) {
                yield* authorizeQaConversationThread(normalizedCommand.threadId);
              }
              const shouldStopSessionAfterArchive =
                normalizedCommand.type === "thread.archive"
                  ? yield* projectionSnapshotQuery
                      .getThreadShellById(normalizedCommand.threadId)
                      .pipe(
                        Effect.map(
                          Option.match({
                            onNone: () => false,
                            onSome: (thread) =>
                              thread.session !== null && thread.session.status !== "stopped",
                          }),
                        ),
                        Effect.orElseSucceed(() => false),
                      )
                  : false;
              const result = yield* dispatchNormalizedCommand(normalizedCommand);
              if (normalizedCommand.type === "thread.archive") {
                if (shouldStopSessionAfterArchive) {
                  yield* Effect.gen(function* () {
                    const stopCommand = yield* normalizeDispatchCommand({
                      type: "thread.session.stop",
                      commandId: CommandId.make(
                        `session-stop-for-archive:${normalizedCommand.commandId}`,
                      ),
                      threadId: normalizedCommand.threadId,
                      createdAt: yield* nowIso,
                    });

                    yield* dispatchNormalizedCommand(stopCommand);
                  }).pipe(
                    Effect.catchCause((cause) =>
                      Effect.logWarning("failed to stop provider session during archive", {
                        threadId: normalizedCommand.threadId,
                        cause,
                      }),
                    ),
                  );
                }

                yield* terminalManager.close({ threadId: normalizedCommand.threadId }).pipe(
                  Effect.catch((error) =>
                    Effect.logWarning("failed to close thread terminals after archive", {
                      threadId: normalizedCommand.threadId,
                      error: error.message,
                    }),
                  ),
                );
              }
              return result;
            }).pipe(
              Effect.mapError((cause) =>
                isOrchestrationDispatchCommandError(cause)
                  ? cause
                  : new OrchestrationDispatchCommandError({
                      message: "Failed to dispatch orchestration command",
                      cause,
                    }),
              ),
            ),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.getTurnDiff]: (input) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.getTurnDiff,
            authorizeQaConversationSubscription(input.threadId).pipe(
              Effect.andThen(
                checkpointDiffQuery.getTurnDiff(input).pipe(
                  Effect.mapError(
                    (cause) =>
                      new OrchestrationGetTurnDiffError({
                        message: "Failed to load turn diff",
                        cause,
                      }),
                  ),
                ),
              ),
            ),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.getFullThreadDiff]: (input) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.getFullThreadDiff,
            authorizeQaConversationSubscription(input.threadId).pipe(
              Effect.andThen(
                checkpointDiffQuery.getFullThreadDiff(input).pipe(
                  Effect.mapError(
                    (cause) =>
                      new OrchestrationGetFullThreadDiffError({
                        message: "Failed to load full thread diff",
                        cause,
                      }),
                  ),
                ),
              ),
            ),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.replayEvents]: (input) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.replayEvents,
            Stream.runCollect(
              orchestrationEngine.readEvents(
                clamp(input.fromSequenceExclusive, {
                  maximum: Number.MAX_SAFE_INTEGER,
                  minimum: 0,
                }),
              ),
            ).pipe(
              Effect.map((events) => Array.from(events)),
              Effect.flatMap(enrichOrchestrationEvents),
              Effect.mapError(
                (cause) =>
                  new OrchestrationReplayEventsError({
                    message: "Failed to replay orchestration events",
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.subscribeShell]: (input) =>
          observeRpcStreamEffect(
            ORCHESTRATION_WS_METHODS.subscribeShell,
            Effect.gen(function* () {
              const liveStream = orchestrationEngine.streamDomainEvents.pipe(
                Stream.mapEffect(toShellStreamEvent),
                Stream.flatMap((event) =>
                  Option.isSome(event) ? Stream.succeed(event.value) : Stream.empty,
                ),
              );

              // When the client already holds a shell snapshot (cached, or loaded
              // over HTTP) it passes that snapshot's sequence, and we resume by
              // replaying shell events after it instead of re-sending the whole
              // projects/threads list over the socket. As in the thread path, the
              // live subscription is attached (into a scope-bound buffer) before
              // draining the catch-up replay so no event published during the
              // replay window is lost; overlapping events are deduped by sequence
              // on the client. The full range is read (not the store's default
              // page limit) since the shell filter runs after reading.
              if (input.afterSequence !== undefined) {
                const afterSequence = input.afterSequence;
                return Stream.unwrap(
                  Effect.gen(function* () {
                    const liveBuffer = yield* Queue.unbounded<OrchestrationShellStreamItem>();
                    yield* Effect.forkScoped(
                      liveStream.pipe(Stream.runForEach((item) => Queue.offer(liveBuffer, item))),
                    );
                    const catchUpStream = orchestrationEngine
                      .readEvents(afterSequence, Number.MAX_SAFE_INTEGER)
                      .pipe(
                        Stream.mapEffect(toShellStreamEvent),
                        Stream.flatMap((event) =>
                          Option.isSome(event) ? Stream.succeed(event.value) : Stream.empty,
                        ),
                        Stream.mapError(
                          (cause) =>
                            new OrchestrationGetSnapshotError({
                              message: "Failed to replay orchestration shell events",
                              cause,
                            }),
                        ),
                      );
                    return Stream.concat(catchUpStream, Stream.fromQueue(liveBuffer));
                  }),
                );
              }

              const snapshot = yield* projectionSnapshotQuery.getShellSnapshot().pipe(
                Effect.tapError((cause) =>
                  Effect.logError("orchestration shell snapshot load failed", { cause }),
                ),
                Effect.mapError(
                  (cause) =>
                    new OrchestrationGetSnapshotError({
                      message: "Failed to load orchestration shell snapshot",
                      cause,
                    }),
                ),
              );

              return Stream.concat(
                Stream.make({
                  kind: "snapshot" as const,
                  snapshot,
                }),
                liveStream,
              );
            }),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot]: (_input) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot,
            projectionSnapshotQuery.getArchivedShellSnapshot().pipe(
              Effect.tapError((cause) =>
                Effect.logError("orchestration archived shell snapshot load failed", { cause }),
              ),
              Effect.mapError(
                (cause) =>
                  new OrchestrationGetSnapshotError({
                    message: "Failed to load archived orchestration shell snapshot",
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.subscribeThread]: (input) =>
          observeRpcStreamEffect(
            ORCHESTRATION_WS_METHODS.subscribeThread,
            Effect.gen(function* () {
              const qaBound = yield* authorizeQaConversationSubscription(input.threadId);
              const isThisThreadDetailEvent = (event: OrchestrationEvent) =>
                event.aggregateKind === "thread" &&
                event.aggregateId === input.threadId &&
                isThreadDetailEvent(event);

              const liveStream = orchestrationEngine.streamDomainEvents.pipe(
                Stream.filter(isThisThreadDetailEvent),
                Stream.map((event) => ({
                  kind: "event" as const,
                  event,
                })),
              );

              // When the client already loaded the snapshot over HTTP it passes
              // that snapshot's sequence, and we resume the live subscription by
              // replaying persisted events after it instead of re-sending the
              // (potentially multi-KB) snapshot frame over the socket.
              //
              // The live PubSub subscription must be attached *before* draining
              // the catch-up replay, otherwise events published during the replay
              // window are dropped (they are past the persisted tail the replay
              // read, but the live stream is not yet subscribed). So fork the
              // live stream into a buffer bound to this stream's scope, then emit
              // catch-up followed by the buffered/ongoing live events. Overlapping
              // events are deduped by sequence on the client.
              //
              // Read the full range after the cursor (not the store's default
              // page-bounded limit): the range is normally tiny (a fresh HTTP
              // snapshot sequence) and the per-thread filter runs after reading,
              // so a global cap could otherwise omit this thread's events.
              if (input.afterSequence !== undefined) {
                const afterSequence = input.afterSequence;
                return authorizeQaConversationStream(
                  input.threadId,
                  qaBound,
                  Stream.unwrap(
                    Effect.gen(function* () {
                      const liveBuffer = yield* Queue.unbounded<OrchestrationThreadStreamItem>();
                      yield* Effect.forkScoped(
                        liveStream.pipe(Stream.runForEach((item) => Queue.offer(liveBuffer, item))),
                      );
                      const catchUpStream = orchestrationEngine
                        .readEvents(afterSequence, Number.MAX_SAFE_INTEGER)
                        .pipe(
                          Stream.filter(isThisThreadDetailEvent),
                          Stream.map((event) => ({ kind: "event" as const, event })),
                          Stream.mapError(
                            (cause) =>
                              new OrchestrationGetSnapshotError({
                                message: `Failed to replay thread ${input.threadId} events`,
                                cause,
                              }),
                          ),
                        );
                      return Stream.concat(catchUpStream, Stream.fromQueue(liveBuffer));
                    }),
                  ),
                );
              }

              const snapshot = yield* projectionSnapshotQuery
                .getThreadDetailSnapshot(input.threadId)
                .pipe(
                  Effect.mapError(
                    (cause) =>
                      new OrchestrationGetSnapshotError({
                        message: `Failed to load thread ${input.threadId}`,
                        cause,
                      }),
                  ),
                );

              if (Option.isNone(snapshot)) {
                return yield* new OrchestrationGetSnapshotError({
                  message: `Thread ${input.threadId} was not found`,
                  cause: input.threadId,
                });
              }

              return authorizeQaConversationStream(
                input.threadId,
                qaBound,
                Stream.concat(
                  Stream.make({
                    kind: "snapshot" as const,
                    snapshot: snapshot.value,
                  }),
                  liveStream,
                ),
              );
            }),
            { "rpc.aggregate": "orchestration" },
          ),
        [WS_METHODS.serverGetConfig]: (_input) =>
          observeRpcEffect(WS_METHODS.serverGetConfig, loadServerConfig, {
            "rpc.aggregate": "server",
          }),
        [WS_METHODS.serverRefreshProviders]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverRefreshProviders,
            (input.instanceId !== undefined
              ? providerRegistry.refreshInstance(input.instanceId)
              : providerRegistry.refresh()
            ).pipe(Effect.map((providers) => ({ providers }))),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverUpdateProvider]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverUpdateProvider,
            providerMaintenanceRunner.updateProvider(input),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverUpsertKeybinding]: (rule) =>
          observeRpcEffect(
            WS_METHODS.serverUpsertKeybinding,
            Effect.gen(function* () {
              const keybindingsConfig = yield* keybindings.upsertKeybindingRule(rule);
              return { keybindings: keybindingsConfig, issues: [] };
            }),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverRemoveKeybinding]: (rule) =>
          observeRpcEffect(
            WS_METHODS.serverRemoveKeybinding,
            Effect.gen(function* () {
              const keybindingsConfig = yield* keybindings.removeKeybindingRule(rule);
              return { keybindings: keybindingsConfig, issues: [] };
            }),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverGetSettings]: (_input) =>
          observeRpcEffect(
            WS_METHODS.serverGetSettings,
            serverSettings.getSettings.pipe(
              Effect.map(ServerSettings.redactServerSettingsForClient),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverUpdateSettings]: ({ patch }) =>
          observeRpcEffect(
            WS_METHODS.serverUpdateSettings,
            serverSettings
              .updateSettings(patch)
              .pipe(Effect.map(ServerSettings.redactServerSettingsForClient)),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverDiscoverSourceControl]: (_input) =>
          observeRpcEffect(
            WS_METHODS.serverDiscoverSourceControl,
            sourceControlDiscovery.discover,
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetTraceDiagnostics]: (_input) =>
          observeRpcEffect(
            WS_METHODS.serverGetTraceDiagnostics,
            TraceDiagnostics.readTraceDiagnostics({
              traceFilePath: config.serverTracePath,
              maxFiles: config.traceMaxFiles,
            }),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetProcessDiagnostics]: (_input) =>
          observeRpcEffect(WS_METHODS.serverGetProcessDiagnostics, processDiagnostics.read, {
            "rpc.aggregate": "server",
          }),
        [WS_METHODS.serverGetProcessResourceHistory]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverGetProcessResourceHistory,
            processResourceMonitor.readHistory(input),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverSignalProcess]: (input) =>
          observeRpcEffect(WS_METHODS.serverSignalProcess, processDiagnostics.signal(input), {
            "rpc.aggregate": "server",
          }),
        [WS_METHODS.cloudGetRelayClientStatus]: (_input) =>
          observeRpcEffect(WS_METHODS.cloudGetRelayClientStatus, relayClient.resolve, {
            "rpc.aggregate": "cloud",
          }),
        [WS_METHODS.cloudInstallRelayClient]: (_input) =>
          observeRpcStream(
            WS_METHODS.cloudInstallRelayClient,
            Stream.callback<RelayClientInstallProgressEvent, RelayClientInstallFailedError>(
              (queue) =>
                relayClient
                  .installWithProgress((event) => Queue.offer(queue, event).pipe(Effect.asVoid))
                  .pipe(
                    Effect.flatMap((status) =>
                      Queue.offer(queue, {
                        type: "complete",
                        status,
                      }),
                    ),
                    Effect.catchTag("RelayClientInstallError", (error) =>
                      Queue.fail(
                        queue,
                        new RelayClientInstallFailedError({
                          reason: error.reason,
                          message: error.message,
                        }),
                      ),
                    ),
                    Effect.andThen(Queue.end(queue)),
                    Effect.forkScoped,
                  ),
            ),
            { "rpc.aggregate": "cloud" },
          ),
        [WS_METHODS.sourceControlLookupRepository]: (input) =>
          observeRpcEffect(
            WS_METHODS.sourceControlLookupRepository,
            sourceControlRepositories.lookupRepository(input),
            {
              "rpc.aggregate": "source-control",
            },
          ),
        [WS_METHODS.sourceControlCloneRepository]: (input) =>
          observeRpcEffect(
            WS_METHODS.sourceControlCloneRepository,
            sourceControlRepositories.cloneRepository(input),
            {
              "rpc.aggregate": "source-control",
            },
          ),
        [WS_METHODS.sourceControlPublishRepository]: (input) =>
          observeRpcEffect(
            WS_METHODS.sourceControlPublishRepository,
            sourceControlRepositories
              .publishRepository(input)
              .pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            {
              "rpc.aggregate": "source-control",
            },
          ),
        [WS_METHODS.projectsSearchEntries]: (input) =>
          observeRpcEffect(
            WS_METHODS.projectsSearchEntries,
            workspaceEntries.search(input).pipe(
              Effect.mapError(
                (cause) =>
                  new ProjectSearchEntriesError({
                    cwd: input.cwd,
                    queryLength: input.query.length,
                    limit: input.limit,
                    ...projectEntriesFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.projectsListEntries]: (input) =>
          observeRpcEffect(
            WS_METHODS.projectsListEntries,
            workspaceEntries.list(input).pipe(
              Effect.mapError(
                (cause) =>
                  new ProjectListEntriesError({
                    ...input,
                    ...projectEntriesFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.projectsReadFile]: (input) =>
          observeRpcEffect(
            WS_METHODS.projectsReadFile,
            workspaceFileSystem.readFile(input).pipe(
              Effect.mapError(
                (cause) =>
                  new ProjectReadFileError({
                    ...input,
                    ...projectFileFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.projectsWriteFile]: (input) =>
          observeRpcEffect(
            WS_METHODS.projectsWriteFile,
            workspaceFileSystem.writeFile(input).pipe(
              Effect.mapError(
                (cause) =>
                  new ProjectWriteFileError({
                    cwd: input.cwd,
                    relativePath: input.relativePath,
                    ...projectFileFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.shellOpenInEditor]: (input) =>
          observeRpcEffect(WS_METHODS.shellOpenInEditor, externalLauncher.launchEditor(input), {
            "rpc.aggregate": "workspace",
          }),
        [WS_METHODS.filesystemBrowse]: (input) =>
          observeRpcEffect(
            WS_METHODS.filesystemBrowse,
            workspaceEntries.browse(input).pipe(
              Effect.mapError(
                (cause) =>
                  new FilesystemBrowseError({
                    ...input,
                    ...filesystemBrowseFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.assetsCreateUrl]: (input) =>
          observeRpcEffect(
            WS_METHODS.assetsCreateUrl,
            Effect.gen(function* () {
              if (input.resource._tag !== "workspace-file") {
                return yield* issueAssetUrl({ resource: input.resource });
              }
              const thread = yield* projectionSnapshotQuery
                .getThreadShellById(input.resource.threadId)
                .pipe(
                  Effect.mapError(
                    (cause) =>
                      new AssetWorkspaceContextResolutionError({
                        resource: input.resource,
                        cause,
                      }),
                  ),
                );
              if (Option.isNone(thread)) {
                return yield* new AssetWorkspaceContextNotFoundError({
                  resource: input.resource,
                });
              }
              const project = yield* projectionSnapshotQuery
                .getProjectShellById(thread.value.projectId)
                .pipe(
                  Effect.mapError(
                    (cause) =>
                      new AssetWorkspaceContextResolutionError({
                        resource: input.resource,
                        cause,
                      }),
                  ),
                );
              if (Option.isNone(project)) {
                return yield* new AssetWorkspaceContextNotFoundError({
                  resource: input.resource,
                });
              }
              return yield* issueAssetUrl({
                resource: input.resource,
                workspaceRoot: thread.value.worktreePath ?? project.value.workspaceRoot,
              });
            }),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.subscribeVcsStatus]: (input) =>
          observeRpcStream(
            WS_METHODS.subscribeVcsStatus,
            vcsStatusBroadcaster.streamStatus(input, {
              automaticRemoteRefreshInterval: automaticGitFetchInterval,
            }),
            {
              "rpc.aggregate": "vcs",
            },
          ),
        [WS_METHODS.vcsRefreshStatus]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsRefreshStatus,
            vcsStatusBroadcaster.refreshStatus(input.cwd),
            {
              "rpc.aggregate": "vcs",
            },
          ),
        [WS_METHODS.vcsPull]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsPull,
            gitWorkflow.pullCurrentBranch(input.cwd).pipe(
              Effect.matchCauseEffect({
                onFailure: (cause) => Effect.failCause(cause),
                onSuccess: (result) =>
                  refreshGitStatus(input.cwd).pipe(Effect.ignore({ log: true }), Effect.as(result)),
              }),
            ),
            { "rpc.aggregate": "git" },
          ),
        [WS_METHODS.gitRunStackedAction]: (input) =>
          observeRpcStream(
            WS_METHODS.gitRunStackedAction,
            Stream.callback<GitActionProgressEvent, GitManagerServiceError>((queue) =>
              gitWorkflow
                .runStackedAction(input, {
                  actionId: input.actionId,
                  progressReporter: {
                    publish: (event) => Queue.offer(queue, event).pipe(Effect.asVoid),
                  },
                })
                .pipe(
                  Effect.matchCauseEffect({
                    onFailure: (cause) => Queue.failCause(queue, cause),
                    onSuccess: () =>
                      refreshGitStatus(input.cwd).pipe(
                        Effect.andThen(Queue.end(queue).pipe(Effect.asVoid)),
                      ),
                  }),
                ),
            ),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.gitResolvePullRequest]: (input) =>
          observeRpcEffect(
            WS_METHODS.gitResolvePullRequest,
            gitWorkflow.resolvePullRequest(input),
            {
              "rpc.aggregate": "git",
            },
          ),
        [WS_METHODS.gitPreparePullRequestThread]: (input) =>
          observeRpcEffect(
            WS_METHODS.gitPreparePullRequestThread,
            gitWorkflow
              .preparePullRequestThread(input)
              .pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "git" },
          ),
        [WS_METHODS.vcsListRefs]: (input) =>
          observeRpcEffect(WS_METHODS.vcsListRefs, gitWorkflow.listRefs(input), {
            "rpc.aggregate": "vcs",
          }),
        [WS_METHODS.vcsCreateWorktree]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsCreateWorktree,
            gitWorkflow.createWorktree(input).pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.vcsRemoveWorktree]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsRemoveWorktree,
            gitWorkflow.removeWorktree(input).pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.vcsCreateRef]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsCreateRef,
            gitWorkflow.createRef(input).pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.vcsSwitchRef]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsSwitchRef,
            gitWorkflow.switchRef(input).pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.vcsInit]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsInit,
            vcsProvisioning
              .initRepository(input)
              .pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.reviewGetDiffPreview]: (input) =>
          observeRpcEffect(WS_METHODS.reviewGetDiffPreview, review.getDiffPreview(input), {
            "rpc.aggregate": "review",
          }),
        [WS_METHODS.terminalOpen]: (input) =>
          observeRpcEffect(WS_METHODS.terminalOpen, terminalManager.open(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalAttach]: (input) =>
          observeRpcStream(
            WS_METHODS.terminalAttach,
            Stream.callback<TerminalAttachStreamEvent, TerminalError>((queue) =>
              Effect.acquireRelease(
                terminalManager.attachStream(input, (event) => Queue.offer(queue, event)),
                (unsubscribe) => Effect.sync(unsubscribe),
              ),
            ),
            { "rpc.aggregate": "terminal" },
          ),
        [WS_METHODS.terminalWrite]: (input) =>
          observeRpcEffect(WS_METHODS.terminalWrite, terminalManager.write(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalResize]: (input) =>
          observeRpcEffect(WS_METHODS.terminalResize, terminalManager.resize(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalClear]: (input) =>
          observeRpcEffect(WS_METHODS.terminalClear, terminalManager.clear(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalRestart]: (input) =>
          observeRpcEffect(WS_METHODS.terminalRestart, terminalManager.restart(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalClose]: (input) =>
          observeRpcEffect(WS_METHODS.terminalClose, terminalManager.close(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.subscribeTerminalEvents]: (_input) =>
          observeRpcStream(
            WS_METHODS.subscribeTerminalEvents,
            Stream.callback<TerminalEvent>((queue) =>
              Effect.acquireRelease(
                terminalManager.subscribe((event) => Queue.offer(queue, event)),
                (unsubscribe) => Effect.sync(unsubscribe),
              ),
            ),
            { "rpc.aggregate": "terminal" },
          ),
        [WS_METHODS.subscribeTerminalMetadata]: (_input) =>
          observeRpcStream(
            WS_METHODS.subscribeTerminalMetadata,
            Stream.callback<TerminalMetadataStreamEvent>((queue) =>
              Effect.acquireRelease(
                terminalManager.subscribeMetadata((event) => Queue.offer(queue, event)),
                (unsubscribe) => Effect.sync(unsubscribe),
              ),
            ),
            { "rpc.aggregate": "terminal" },
          ),
        [WS_METHODS.previewOpen]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewOpen,
            withPreviewAccess(input.threadId, (access) => previewManager.open(input, access)),
            {
              "rpc.aggregate": "preview",
            },
          ),
        [WS_METHODS.previewNavigate]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewNavigate,
            withPreviewAccess(input.threadId, (access) => previewManager.navigate(input, access)),
            {
              "rpc.aggregate": "preview",
            },
          ),
        [WS_METHODS.previewResize]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewResize,
            withPreviewAccess(input.threadId, (access) => previewManager.resize(input, access)),
            {
              "rpc.aggregate": "preview",
            },
          ),
        [WS_METHODS.previewRefresh]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewRefresh,
            withPreviewAccess(input.threadId, (access) => previewManager.refresh(input, access)),
            {
              "rpc.aggregate": "preview",
            },
          ),
        [WS_METHODS.previewClose]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewClose,
            withPreviewAccess(input.threadId, (access) => previewManager.close(input, access)),
            {
              "rpc.aggregate": "preview",
            },
          ),
        [WS_METHODS.previewList]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewList,
            withPreviewAccess(input.threadId, (access) => previewManager.list(input, access)),
            {
              "rpc.aggregate": "preview",
            },
          ),
        [WS_METHODS.previewReportStatus]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewReportStatus,
            withPreviewAccess(input.threadId, (access) =>
              previewManager.reportStatus(input, access),
            ),
            {
              "rpc.aggregate": "preview",
            },
          ),
        [WS_METHODS.previewAutomationConnect]: (input) =>
          observeRpcStreamEffect(
            WS_METHODS.previewAutomationConnect,
            previewAutomationBroker.connect(input, previewIdentity),
            { "rpc.aggregate": "preview-automation" },
          ),
        [WS_METHODS.previewAutomationRespond]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewAutomationRespond,
            previewAutomationBroker.respond(input, previewIdentity),
            { "rpc.aggregate": "preview-automation" },
          ),
        [WS_METHODS.previewAutomationFocusHost]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewAutomationFocusHost,
            previewAutomationBroker.focusHost(input, previewIdentity),
            { "rpc.aggregate": "preview-automation" },
          ),
        [WS_METHODS.subscribePreviewEvents]: (_input) =>
          observeRpcStream(WS_METHODS.subscribePreviewEvents, authorizedPreviewEvents, {
            "rpc.aggregate": "preview",
          }),
        [WS_METHODS.subscribeDiscoveredLocalServers]: (_input) =>
          observeRpcStream(
            WS_METHODS.subscribeDiscoveredLocalServers,
            Stream.callback<DiscoveredLocalServerList>((queue) =>
              Effect.gen(function* () {
                yield* portDiscovery.retain;
                const initial = yield* portDiscovery.scan();
                const initialScannedAt = DateTime.formatIso(yield* DateTime.now);
                yield* Queue.offer(queue, {
                  servers: initial,
                  scannedAt: initialScannedAt,
                });
                yield* portDiscovery.subscribe((servers) =>
                  Effect.gen(function* () {
                    const scannedAt = DateTime.formatIso(yield* DateTime.now);
                    yield* Queue.offer(queue, { servers, scannedAt });
                  }),
                );
              }),
            ),
            { "rpc.aggregate": "preview" },
          ),
        [WS_METHODS.subscribeServerConfig]: (_input) =>
          observeRpcStreamEffect(
            WS_METHODS.subscribeServerConfig,
            Effect.gen(function* () {
              const keybindingsUpdates = keybindings.streamChanges.pipe(
                Stream.map((event) => ({
                  version: 1 as const,
                  type: "keybindingsUpdated" as const,
                  payload: {
                    keybindings: event.keybindings,
                    issues: event.issues,
                  },
                })),
              );
              const providerStatuses = providerRegistry.streamChanges.pipe(
                Stream.map((providers) => ({
                  version: 1 as const,
                  type: "providerStatuses" as const,
                  payload: { providers },
                })),
                Stream.debounce(Duration.millis(PROVIDER_STATUS_DEBOUNCE_MS)),
              );
              const settingsUpdates = serverSettings.streamChanges.pipe(
                Stream.map((settings) => ServerSettings.redactServerSettingsForClient(settings)),
                Stream.map((settings) => ({
                  version: 1 as const,
                  type: "settingsUpdated" as const,
                  payload: { settings },
                })),
              );

              yield* providerRegistry
                .refresh()
                .pipe(Effect.ignoreCause({ log: true }), Effect.forkScoped);

              const liveUpdates = Stream.merge(
                keybindingsUpdates,
                Stream.merge(providerStatuses, settingsUpdates),
              );

              return Stream.concat(
                Stream.make({
                  version: 1 as const,
                  type: "snapshot" as const,
                  config: yield* loadServerConfig,
                }),
                liveUpdates,
              );
            }),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.subscribeServerLifecycle]: (_input) =>
          observeRpcStreamEffect(
            WS_METHODS.subscribeServerLifecycle,
            Effect.gen(function* () {
              const snapshot = yield* lifecycleEvents.snapshot;
              const snapshotEvents = Array.from(snapshot.events).toSorted(
                (left, right) => left.sequence - right.sequence,
              );
              const liveEvents = lifecycleEvents.stream.pipe(
                Stream.filter((event) => event.sequence > snapshot.sequence),
              );
              return Stream.concat(Stream.fromIterable(snapshotEvents), liveEvents);
            }),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.subscribeAuthAccess]: (_input) =>
          observeRpcStreamEffect(
            WS_METHODS.subscribeAuthAccess,
            Effect.gen(function* () {
              const initialSnapshot = yield* loadAuthAccessSnapshot();
              const revisionRef = yield* Ref.make(1);
              const accessChanges: Stream.Stream<
                PairingGrantStore.BootstrapCredentialChange | SessionStore.SessionCredentialChange
              > = Stream.merge(bootstrapCredentials.streamChanges, sessions.streamChanges);

              const liveEvents: Stream.Stream<AuthAccessStreamEvent> = accessChanges.pipe(
                Stream.mapEffect((change) =>
                  Ref.updateAndGet(revisionRef, (revision) => revision + 1).pipe(
                    Effect.map((revision) =>
                      toAuthAccessStreamEvent(change, revision, currentSessionId),
                    ),
                  ),
                ),
              );

              return Stream.concat(
                Stream.make({
                  version: 1 as const,
                  revision: 1,
                  type: "snapshot" as const,
                  payload: initialSnapshot,
                }),
                liveEvents,
              );
            }),
            { "rpc.aggregate": "auth" },
          ),
      });
    }),
  );

export const websocketRpcRouteLayer = Layer.unwrap(
  Effect.gen(function* () {
    const previewAutomationBroker = yield* PreviewAutomationBroker.PreviewAutomationBroker;
    const qaReleaseEventBus = yield* QaReleaseEventBus.QaReleaseEventBus;
    return HttpRouter.add(
      "GET",
      "/ws",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
        const sessions = yield* SessionStore.SessionStore;
        const session = yield* serverAuth.authenticateWebSocketUpgrade(request).pipe(
          Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
            failEnvironmentAuthInvalid(EnvironmentAuth.serverAuthCredentialReason(error)),
          ),
          Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
            failEnvironmentInternal("internal_error", error),
          ),
        );
        const rpcWebSocketHttpEffect = yield* RpcServer.toHttpEffectWebsocket(WsRpcGroup, {
          disableTracing: true,
        }).pipe(
          Effect.provide(
            makeWsRpcLayer(session, previewAutomationBroker, qaReleaseEventBus).pipe(
              Layer.provideMerge(RpcSerialization.layerJson),
              Layer.provide(ProviderMaintenanceRunner.layer),
              Layer.provide(
                SourceControlDiscovery.layer.pipe(
                  Layer.provide(
                    SourceControlProviderRegistry.layer.pipe(
                      Layer.provide(
                        Layer.mergeAll(
                          AzureDevOpsCli.layer,
                          BitbucketApi.layer,
                          GitHubCli.layer,
                          GitLabCli.layer,
                        ),
                      ),
                      Layer.provideMerge(GitVcsDriver.layer),
                      Layer.provide(
                        VcsDriverRegistry.layer.pipe(Layer.provide(VcsProjectConfig.layer)),
                      ),
                    ),
                  ),
                  Layer.provide(VcsProcess.layer),
                ),
              ),
            ),
          ),
        );
        return yield* Effect.acquireUseRelease(
          sessions.markConnected(session.sessionId),
          () =>
            Effect.raceFirst(
              rpcWebSocketHttpEffect,
              sessions
                .awaitInvalidation(session.sessionId)
                .pipe(Effect.as(HttpServerResponse.empty())),
            ),
          () => sessions.markDisconnected(session.sessionId),
        );
      }).pipe(
        Effect.catchTags({
          EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
          EnvironmentInternalError: HttpServerRespondable.toResponse,
        }),
      ),
    );
  }),
);
