import type {
  ProjectId,
  QaReleaseSnapshot,
  QaReviewAnchor,
  QaReviewSeverity,
  QaReviewThread,
  QaUiRole,
  QaScript,
  QaTestCase,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { AuthQaApproveScope, AuthQaMakeScope } from "@t3tools/contracts";
import { AlertCircle, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { DESKTOP_DEVELOPMENT_PROFILE } from "~/branding";
import { qaEnvironment } from "./client";
import { qaWorkflowErrorMessage } from "./errorMessage";
import { QaStageHeader } from "./QaStageHeader";
import { QaStageTabs } from "./QaStageTabs";
import { selectQaThreadPanelState, selectedQaStageTab, useQaPanelStore } from "./qaPanelStore";
import {
  navigableStages,
  isStageReadOnly,
  resolveActiveStage,
  type QaStageId,
  type QaStageTabId,
} from "./stageRouting";
import { qaUiRoleFromDesktopProfile } from "./qaRole";
import type { QaReviewThreadActions, QaReviewThreadPermissions } from "./AnchoredReviewThreads";
import { IntakeStage } from "./stages/IntakeStage";
import { RequirementsStage } from "./stages/RequirementsStage";
import { ReadinessStage } from "./stages/ReadinessStage";
import { ScenarioStage } from "./stages/ScenarioStage";
import { ScriptStage } from "./stages/ScriptStage";
import { StrategyStage } from "./stages/StrategyStage";
import { TestCaseStage } from "./stages/TestCaseStage";
import { useScenarioActions } from "./useScenarioActions";
import { useFinalStageActions } from "./useFinalStageActions";
import { useTestCaseActions } from "./useTestCaseActions";
interface QaWorkbenchProps {
  readonly threadRef: ScopedThreadRef;
  readonly projectId: ProjectId;
  readonly projectTitle: string;
  readonly onKickoffAgent: (snapshot: QaReleaseSnapshot) => Promise<void> | void;
  readonly onInitialized: (snapshot: QaReleaseSnapshot) => Promise<void> | void;
}
type BusyAction =
  | "initialize"
  | "upload"
  | "ingestion"
  | "save"
  | "review"
  | "strategy"
  | "scenario"
  | "test-case"
  | "script"
  | "readiness"
  | "review-thread"
  | null;
export function QaWorkbench(props: QaWorkbenchProps) {
  return (
    <QaThreadWorkbench
      key={`${props.threadRef.environmentId}:${props.threadRef.threadId}`}
      {...props}
    />
  );
}
function useQaThreadWorkbenchContent(props: QaWorkbenchProps) {
  const queryAtom = qaEnvironment.snapshot({
    environmentId: props.threadRef.environmentId,
    input: {
      threadId: props.threadRef.threadId,
    },
  });
  const query = useEnvironmentQuery(queryAtom);
  const access = useEnvironmentQuery(
    qaEnvironment.releaseAccess({
      environmentId: props.threadRef.environmentId,
      input: { threadId: props.threadRef.threadId },
    }),
  );
  const [latestSnapshot, setLatestSnapshot] = useState<QaReleaseSnapshot | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const releaseInitialized =
    latestSnapshot?.threadId === props.threadRef.threadId ||
    query.data?.threadId === props.threadRef.threadId;
  const eventsAtom = releaseInitialized
    ? qaEnvironment.events({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
        },
      })
    : null;
  const events = useEnvironmentQuery(eventsAtom);
  const initialize = useAtomCommand(qaEnvironment.initialize, {
    reportFailure: false,
  });
  const uploadDocument = useAtomCommand(qaEnvironment.uploadDocument, {
    reportFailure: false,
  });
  const startIngestion = useAtomCommand(qaEnvironment.startIngestion, {
    reportFailure: false,
  });
  const updateStrategySection = useAtomCommand(qaEnvironment.updateStrategySection, {
    reportFailure: false,
  });
  const submitStrategy = useAtomCommand(qaEnvironment.submitStrategy, {
    reportFailure: false,
  });
  const reviewStrategy = useAtomCommand(qaEnvironment.reviewStrategy, {
    reportFailure: false,
  });
  const review = useAtomCommand(qaEnvironment.review, {
    reportFailure: false,
  });
  const addReviewComment = useAtomCommand(qaEnvironment.addReviewComment, {
    reportFailure: false,
  });
  const replyReviewComment = useAtomCommand(qaEnvironment.replyReviewComment, {
    reportFailure: false,
  });
  const runReviewCommentAiCheck = useAtomCommand(qaEnvironment.runReviewCommentAiCheck, {
    reportFailure: false,
  });
  const resolveReviewComment = useAtomCommand(qaEnvironment.resolveReviewComment, {
    reportFailure: false,
  });
  const markReviewRead = useAtomCommand(qaEnvironment.markReviewRead, {
    reportFailure: false,
  });
  const snapshot = newestSnapshot(
    props.threadRef.threadId,
    latestSnapshot,
    query.data,
    events.data?.snapshot ?? null,
  );
  const activeStage = snapshot ? resolveActiveStage(snapshot) : "intake";
  const panelState = useQaPanelStore((state) =>
    selectQaThreadPanelState(state.byThreadKey, props.threadRef, activeStage),
  );
  const syncActiveStage = useQaPanelStore((state) => state.syncActiveStage);
  const viewStage = useQaPanelStore((state) => state.viewStage);
  const selectTab = useQaPanelStore((state) => state.selectTab);
  const scenarioActions = useScenarioActions({
    threadRef: props.threadRef,
    snapshot,
    setBusy,
    setError,
    setLatestSnapshot,
    onKickoffAgent: props.onKickoffAgent,
  });
  const testCaseActions = useTestCaseActions({
    threadRef: props.threadRef,
    snapshot,
    setBusy,
    setError,
    setLatestSnapshot,
    onKickoffAgent: props.onKickoffAgent,
  });
  const finalStageActions = useFinalStageActions({
    threadRef: props.threadRef,
    snapshot,
    setBusy,
    setError,
    setLatestSnapshot,
    onKickoffAgent: props.onKickoffAgent,
  });
  useEffect(() => {
    syncActiveStage(props.threadRef, activeStage);
  }, [activeStage, props.threadRef, syncActiveStage]);
  const stages = snapshot ? navigableStages(snapshot) : [];
  const viewedStage = stages.some((stage) => stage.id === panelState.viewedStage)
    ? panelState.viewedStage
    : activeStage;
  const selectedTab =
    viewedStage === panelState.viewedStage
      ? selectedQaStageTab(panelState)
      : selectedQaStageTab({
          ...panelState,
          viewedStage,
        });
  const fallbackUiRole = qaUiRoleFromDesktopProfile(DESKTOP_DEVELOPMENT_PROFILE);
  const uiRole: QaUiRole = access.data?.uiRole ?? fallbackUiRole;
  const canMake =
    uiRole === "maker" &&
    (access.data
      ? access.data.capabilities.includes(AuthQaMakeScope)
      : DESKTOP_DEVELOPMENT_PROFILE === "qa:maker");
  const canApprove =
    uiRole === "approver" &&
    (access.data
      ? access.data.capabilities.includes(AuthQaApproveScope)
      : DESKTOP_DEVELOPMENT_PROFILE === "qa:approver" || DESKTOP_DEVELOPMENT_PROFILE === "root");
  const stageHistoryReadOnly = snapshot ? isStageReadOnly(snapshot, viewedStage) : true;
  const reviewArtifact =
    viewedStage === "strategy" && snapshot?.strategy
      ? { kind: "strategy" as const, id: snapshot.strategy.id }
      : viewedStage === "scenarios" && snapshot?.scenarioPlan
        ? {
            kind: "scenario_plan" as const,
            id: snapshot.scenarioPlan.id,
          }
        : null;
  const reviewThreads = useEnvironmentQuery(
    reviewArtifact
      ? qaEnvironment.reviewThreads({
          environmentId: props.threadRef.environmentId,
          input: {
            threadId: props.threadRef.threadId,
            artifactKind: reviewArtifact.kind,
            artifactId: reviewArtifact.id,
          },
        })
      : null,
  );
  const approverDefaultRef = useRef<string | null>(null);
  useEffect(() => {
    if (uiRole !== "approver" || (viewedStage !== "strategy" && viewedStage !== "scenarios")) {
      return;
    }
    const key = `${props.threadRef.environmentId}:${props.threadRef.threadId}:${viewedStage}`;
    if (approverDefaultRef.current === key) return;
    approverDefaultRef.current = key;
    selectTab(props.threadRef, viewedStage, "review");
  }, [props.threadRef, selectTab, uiRole, viewedStage]);
  const activeAiRun = reviewThreads.data?.reviewThreads.some(
    (thread) => thread.latestAiRun?.status === "queued" || thread.latestAiRun?.status === "running",
  );
  useEffect(() => {
    if (!activeAiRun) return;
    const interval = window.setInterval(() => {
      reviewThreads.refresh();
      query.refresh();
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [activeAiRun, query.refresh, reviewThreads.refresh]);
  const terminalAiRunMarker = reviewThreads.data?.reviewThreads
    .map((thread) => thread.latestAiRun)
    .flatMap((run) =>
      run?.status === "completed" || run?.status === "failed"
        ? [`${run.id}:${run.status}:${run.completedAt ?? "terminal"}`]
        : [],
    )
    .join("|");
  useEffect(() => {
    if (terminalAiRunMarker) query.refresh();
  }, [query.refresh, terminalAiRunMarker]);
  const markingReadRef = useRef(new Set<string>());
  useEffect(() => {
    if (selectedTab !== "review" || !reviewThreads.data) return;
    for (const thread of reviewThreads.data.reviewThreads) {
      const latestEntry = thread.entries.at(-1);
      if (!latestEntry) continue;
      const marker = `${thread.id}:${latestEntry.id}`;
      if (thread.unreadCount === 0 || markingReadRef.current.has(marker)) continue;
      const throughEntryId = latestEntry.id;
      markingReadRef.current.add(marker);
      void markReviewRead({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
          reviewThreadId: thread.id,
          throughEntryId,
        },
      }).then((result) => {
        if (result._tag === "Success") reviewThreads.refresh();
        else markingReadRef.current.delete(marker);
      });
    }
  }, [
    markReviewRead,
    props.threadRef.environmentId,
    props.threadRef.threadId,
    reviewThreads.data,
    reviewThreads.refresh,
    selectedTab,
  ]);
  const runMutation = async (
    kind: NonNullable<BusyAction>,
    execute: () => Promise<AtomCommandResult<QaReleaseSnapshot, unknown>>,
  ): Promise<QaReleaseSnapshot | null> => {
    setBusy(kind);
    setError(null);
    const result = await execute();
    setBusy(null);
    if (result._tag !== "Success" || !result.value) {
      const cause = result._tag === "Failure" ? squashAtomCommandFailure(result) : null;
      setError(qaWorkflowErrorMessage(cause));
      return null;
    }
    setLatestSnapshot(result.value);
    return result.value;
  };
  const handleInitialize = async () => {
    const initialized = await runMutation("initialize", () =>
      initialize({
        environmentId: props.threadRef.environmentId,
        input: {
          projectId: props.projectId,
          threadId: props.threadRef.threadId,
        },
      }),
    );
    if (initialized) await props.onInitialized(initialized);
  };
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const next = await runMutation("upload", () =>
        uploadDocument({
          environmentId: props.threadRef.environmentId,
          input: {
            threadId: props.threadRef.threadId,
            fileName: file.name,
            mediaType: file.type || "application/octet-stream",
            bytes,
          },
        }),
      );
      if (!next) break;
    }
  };
  const handleStartIngestion = async () => {
    await runMutation("ingestion", () =>
      startIngestion({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
        },
      }),
    );
  };
  const handleReview = async (
    targetType: "requirement" | "gate",
    targetId: string,
    decision: "approved" | "rejected",
  ) => {
    const next = await runMutation("review", () =>
      review({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
          targetType,
          targetId,
          decision,
        },
      }),
    );
    if (
      next &&
      snapshot &&
      resolveActiveStage(snapshot) === "requirements" &&
      resolveActiveStage(next) === "strategy"
    ) {
      await props.onKickoffAgent(next);
    }
  };
  const runStrategyMutation = async (
    execute: () => Promise<{
      readonly _tag: string;
      readonly value?: {
        readonly snapshot: QaReleaseSnapshot;
      };
    }>,
  ): Promise<QaReleaseSnapshot | null> => {
    setBusy("strategy");
    setError(null);
    const result = await execute();
    setBusy(null);
    if (result._tag !== "Success" || !result.value) {
      setError("The strategy action could not be saved. Refresh the release state and try again.");
      return null;
    }
    setLatestSnapshot(result.value.snapshot);
    return result.value.snapshot;
  };
  const handleSaveStrategySection = async (sectionId: string, content: string) => {
    const strategy = snapshot?.strategy;
    if (!strategy) return false;
    const next = await runStrategyMutation(() =>
      updateStrategySection({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
          strategyId: strategy.id,
          sectionId,
          expectedRevision: snapshot.revision,
          patch: {
            content,
          },
        },
      }),
    );
    return next !== null;
  };
  const handleSubmitStrategy = async () => {
    const strategy = snapshot?.strategy;
    if (!strategy) return false;
    const next = await runStrategyMutation(() =>
      submitStrategy({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
          strategyId: strategy.id,
          expectedRevision: snapshot.revision,
        },
      }),
    );
    return next !== null;
  };
  const handleReviewStrategy = async (
    decision: "approved" | "changes_requested",
    summary?: string,
    blockingCommentIds?: readonly string[],
  ) => {
    const strategy = snapshot?.strategy;
    if (!strategy) return false;
    const next = await runStrategyMutation(() =>
      reviewStrategy({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
          strategyId: strategy.id,
          expectedRevision: snapshot.revision,
          decision,
          ...(decision === "changes_requested" && blockingCommentIds
            ? { blockingCommentIds: [...blockingCommentIds] }
            : {}),
          ...(summary ? { summary } : {}),
        },
      }),
    );
    if (next && decision === "approved") await props.onKickoffAgent(next);
    return next !== null;
  };
  const reviewThreadById = (reviewThreadId: string): QaReviewThread | null =>
    reviewThreads.data?.reviewThreads.find((thread) => thread.id === reviewThreadId) ?? null;
  const runReviewThreadMutation = async (
    execute: () => Promise<{ readonly _tag: string; readonly value?: unknown }>,
  ): Promise<boolean> => {
    setBusy("review-thread");
    setError(null);
    const result = await execute();
    setBusy(null);
    if (result._tag !== "Success" || !result.value) {
      setError("The review-thread action could not be saved. Refresh and try again.");
      return false;
    }
    const mutationSnapshot = (result.value as { readonly snapshot?: QaReleaseSnapshot }).snapshot;
    if (mutationSnapshot) setLatestSnapshot(mutationSnapshot);
    else query.refresh();
    reviewThreads.refresh();
    return true;
  };
  const reviewThreadActions: QaReviewThreadActions = {
    add: async (anchor: QaReviewAnchor, severity: QaReviewSeverity, body: string) => {
      if (!reviewArtifact || !snapshot) return false;
      return runReviewThreadMutation(() =>
        addReviewComment({
          environmentId: props.threadRef.environmentId,
          input: {
            threadId: props.threadRef.threadId,
            artifactKind: reviewArtifact.kind,
            artifactId: reviewArtifact.id,
            expectedRevision: snapshot.revision,
            anchor,
            severity,
            body,
          },
        }),
      );
    },
    reply: async (reviewThreadId, body) => {
      const thread = reviewThreadById(reviewThreadId);
      if (!thread || !snapshot) return false;
      return runReviewThreadMutation(() =>
        replyReviewComment({
          environmentId: props.threadRef.environmentId,
          input: {
            threadId: props.threadRef.threadId,
            reviewThreadId,
            expectedRevision: snapshot.revision,
            body,
          },
        }),
      );
    },
    runAi: async (reviewThreadId) => {
      const thread = reviewThreadById(reviewThreadId);
      if (!thread || !snapshot) return false;
      return runReviewThreadMutation(() =>
        runReviewCommentAiCheck({
          environmentId: props.threadRef.environmentId,
          input: {
            threadId: props.threadRef.threadId,
            reviewThreadId,
            expectedRevision: snapshot.revision,
          },
        }),
      );
    },
    resolve: async (reviewThreadId, overrideReason) => {
      const thread = reviewThreadById(reviewThreadId);
      if (!thread?.latestAiRun || !snapshot) return false;
      return runReviewThreadMutation(() =>
        resolveReviewComment({
          environmentId: props.threadRef.environmentId,
          input: {
            threadId: props.threadRef.threadId,
            reviewThreadId,
            aiRunId: thread.latestAiRun!.id,
            expectedRevision: snapshot.revision,
            ...(overrideReason ? { overrideReason } : {}),
          },
        }),
      );
    },
  };
  if (query.isPending && !snapshot) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-label="Loading QA release" />
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl border bg-muted/30">
            <ShieldCheck className="size-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-sm font-medium">Set up this QA release</h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Create a durable release workspace that follows the active QA stage alongside this
            conversation.
          </p>
          {canMake ? (
            <Button className="mt-4" size="sm" disabled={busy !== null} onClick={handleInitialize}>
              {busy === "initialize" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              Create release workspace
            </Button>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              The maker has not initialized this release yet.
            </p>
          )}
          {query.error || error ? (
            <p className="mt-3 text-xs text-destructive">{query.error ?? error}</p>
          ) : null}
        </div>
      </div>
    );
  }
  const jumpToArtifact = (tab: QaStageTabId, selector: string) => {
    selectTab(props.threadRef, viewedStage, tab);
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("ring-2", "ring-primary/40");
      window.setTimeout(() => target.classList.remove("ring-2", "ring-primary/40"), 1_500);
    }, 0);
  };
  return (
    <ScrollArea className="min-h-0 flex-1 bg-muted/10">
      <div className="mx-auto grid w-full max-w-4xl gap-3 p-3 sm:p-4">
        <QaStageHeader
          projectTitle={props.projectTitle}
          releaseTitle={snapshot.title}
          releaseNumber={snapshot.releaseNumber}
          activeStage={activeStage}
          viewedStage={viewedStage}
          stages={stages}
          onViewStage={(stage) => viewStage(props.threadRef, stage)}
        />
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </div>
        ) : null}
        <QaStageTabs
          stage={viewedStage}
          selectedTab={selectedTab}
          onSelect={(tab) => selectTab(props.threadRef, viewedStage, tab)}
        />
        <QaStageContent
          stage={viewedStage}
          selectedTab={selectedTab}
          snapshot={snapshot}
          permissions={{
            stageHistoryReadOnly,
            canMake,
            canApprove,
          }}
          reviewThreads={reviewThreads.data?.reviewThreads ?? []}
          reviewThreadsReady={reviewThreads.data !== null && !reviewThreads.isPending}
          reviewThreadActions={reviewThreadActions}
          reviewThreadPermissions={{
            createComment: !stageHistoryReadOnly && canApprove,
            reply: !stageHistoryReadOnly && canMake,
            runAi: !stageHistoryReadOnly && canApprove,
            resolve: !stageHistoryReadOnly && canApprove,
          }}
          busy={busy}
          onFiles={handleFiles}
          onStartIngestion={handleStartIngestion}
          onReview={handleReview}
          onSaveStrategySection={handleSaveStrategySection}
          onSubmitStrategy={handleSubmitStrategy}
          onReviewStrategy={handleReviewStrategy}
          onJumpToStrategySection={(sectionId) =>
            jumpToArtifact("strategy", `[data-qa-strategy-section-id="${CSS.escape(sectionId)}"]`)
          }
          onSaveScenarios={scenarioActions.saveScenarios}
          onSubmitScenarioPlan={scenarioActions.submit}
          onReviewScenarioPlan={scenarioActions.review}
          onJumpToScenario={(scenarioId) =>
            jumpToArtifact("scenarios", `[data-qa-workbook-row-id="${CSS.escape(scenarioId)}"]`)
          }
          onSaveTestCases={testCaseActions.saveTestCases}
          onSubmitTestCasePlan={testCaseActions.submit}
          onReviewTestCasePlan={testCaseActions.review}
          onSaveScripts={finalStageActions.saveScripts}
          onSubmitScriptPlan={finalStageActions.submitScripts}
          onReviewScriptPlan={finalStageActions.reviewScripts}
          onReviewReadiness={finalStageActions.reviewReadiness}
        />
      </div>
    </ScrollArea>
  );
}
function QaThreadWorkbench(props: QaWorkbenchProps) {
  return useQaThreadWorkbenchContent(props);
}
function newestSnapshot(
  threadId: ScopedThreadRef["threadId"],
  ...snapshots: ReadonlyArray<QaReleaseSnapshot | null>
): QaReleaseSnapshot | null {
  return snapshots.reduce<QaReleaseSnapshot | null>(
    (latest, candidate) =>
      candidate?.threadId === threadId && (!latest || candidate.revision > latest.revision)
        ? candidate
        : latest,
    null,
  );
}
interface QaStageContentProps {
  readonly stage: QaStageId;
  readonly selectedTab: QaStageTabId;
  readonly snapshot: QaReleaseSnapshot;
  readonly permissions: {
    readonly stageHistoryReadOnly: boolean;
    readonly canMake: boolean;
    readonly canApprove: boolean;
  };
  readonly reviewThreads: readonly QaReviewThread[];
  readonly reviewThreadsReady: boolean;
  readonly reviewThreadActions: QaReviewThreadActions;
  readonly reviewThreadPermissions: QaReviewThreadPermissions;
  readonly busy: BusyAction;
  readonly onFiles: (files: FileList | null) => Promise<void> | void;
  readonly onStartIngestion: () => Promise<void> | void;
  readonly onReview: (
    targetType: "requirement" | "gate",
    targetId: string,
    decision: "approved" | "rejected",
  ) => Promise<void> | void;
  readonly onSaveStrategySection: (sectionId: string, content: string) => Promise<boolean>;
  readonly onSubmitStrategy: () => Promise<boolean>;
  readonly onReviewStrategy: (
    decision: "approved" | "changes_requested",
    summary?: string,
    blockingCommentIds?: readonly string[],
  ) => Promise<boolean>;
  readonly onJumpToStrategySection: (sectionId: string) => void;
  readonly onSaveScenarios: (
    scenarios: readonly import("./scenarioModel").ScenarioRowView[],
  ) => Promise<void>;
  readonly onSubmitScenarioPlan: () => Promise<boolean>;
  readonly onReviewScenarioPlan: (
    decision: "approved" | "changes_requested",
    summary?: string,
    blockingCommentIds?: readonly string[],
  ) => Promise<boolean>;
  readonly onJumpToScenario: (scenarioId: string) => void;
  readonly onSaveTestCases: (testCases: readonly QaTestCase[]) => Promise<void>;
  readonly onSubmitTestCasePlan: () => Promise<boolean>;
  readonly onReviewTestCasePlan: (
    decision: "approved" | "rejected",
    note?: string,
  ) => Promise<boolean>;
  readonly onSaveScripts: (scripts: readonly QaScript[]) => Promise<void>;
  readonly onSubmitScriptPlan: () => Promise<boolean>;
  readonly onReviewScriptPlan: (
    decision: "approved" | "rejected",
    note?: string,
  ) => Promise<boolean>;
  readonly onReviewReadiness: (
    decision: "approved" | "rejected",
    note?: string,
  ) => Promise<boolean>;
}
function QaStageContent(props: QaStageContentProps) {
  const makerReadOnly = props.permissions.stageHistoryReadOnly || !props.permissions.canMake;
  const approverReadOnly = props.permissions.stageHistoryReadOnly || !props.permissions.canApprove;
  if (props.stage === "intake") {
    return (
      <IntakeStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        readOnly={makerReadOnly}
        busy={props.busy === "review-thread" ? null : props.busy}
        onFiles={props.onFiles}
        onStartIngestion={props.onStartIngestion}
      />
    );
  }
  if (props.stage === "requirements") {
    return (
      <RequirementsStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        readOnly={approverReadOnly}
        reviewing={props.busy === "review"}
        onReview={props.onReview}
      />
    );
  }
  if (props.stage === "strategy") {
    return (
      <StrategyStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        artifactReadOnly={makerReadOnly}
        canSubmit={!props.permissions.stageHistoryReadOnly && props.permissions.canMake}
        canReview={
          !props.permissions.stageHistoryReadOnly &&
          props.permissions.canApprove &&
          props.reviewThreadsReady
        }
        reviewThreads={props.reviewThreads}
        reviewActions={props.reviewThreadActions}
        reviewPermissions={props.reviewThreadPermissions}
        busy={props.busy === "strategy" || props.busy === "review-thread"}
        onSaveSection={props.onSaveStrategySection}
        onSubmit={props.onSubmitStrategy}
        onReview={props.onReviewStrategy}
        onJumpToSection={props.onJumpToStrategySection}
      />
    );
  }
  if (props.stage === "scenarios") {
    return (
      <ScenarioStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        artifactReadOnly={makerReadOnly}
        canSubmit={!props.permissions.stageHistoryReadOnly && props.permissions.canMake}
        canReview={
          !props.permissions.stageHistoryReadOnly &&
          props.permissions.canApprove &&
          props.reviewThreadsReady
        }
        reviewThreads={props.reviewThreads}
        reviewActions={props.reviewThreadActions}
        reviewPermissions={props.reviewThreadPermissions}
        busy={props.busy === "scenario" || props.busy === "review-thread"}
        onSaveScenarios={props.onSaveScenarios}
        onSubmit={props.onSubmitScenarioPlan}
        onReview={props.onReviewScenarioPlan}
        onJumpToScenario={props.onJumpToScenario}
      />
    );
  }
  if (props.stage === "test_cases") {
    return (
      <TestCaseStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        readOnly={props.selectedTab === "review" ? approverReadOnly : makerReadOnly}
        busy={props.busy === "test-case"}
        onSaveTestCases={props.onSaveTestCases}
        onSubmit={props.onSubmitTestCasePlan}
        onReview={props.onReviewTestCasePlan}
      />
    );
  }
  if (props.stage === "scripts") {
    return (
      <ScriptStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        readOnly={props.selectedTab === "review" ? approverReadOnly : makerReadOnly}
        busy={props.busy === "script"}
        onSaveScripts={props.onSaveScripts}
        onSubmit={props.onSubmitScriptPlan}
        onReview={props.onReviewScriptPlan}
      />
    );
  }
  if (props.stage === "readiness") {
    return (
      <ReadinessStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        readOnly={approverReadOnly}
        busy={props.busy === "readiness"}
        onReview={props.onReviewReadiness}
      />
    );
  }
  return (
    <section className="rounded-xl border bg-card px-5 py-10 text-center shadow-sm">
      <Sparkles className="mx-auto size-5 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">This stage is coordinated from chat</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
        Its structured workspace will appear here as the release agent produces durable output.
      </p>
    </section>
  );
}
