import type {
  ProjectId,
  QaReleaseSnapshot,
  QaScript,
  QaTestCase,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { AlertCircle, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
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
  const addStrategyComment = useAtomCommand(qaEnvironment.addStrategyComment, {
    reportFailure: false,
  });
  const replyStrategyComment = useAtomCommand(qaEnvironment.replyStrategyComment, {
    reportFailure: false,
  });
  const resolveStrategyComment = useAtomCommand(qaEnvironment.resolveStrategyComment, {
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
          expectedRevision: strategy.revision,
          patch: {
            content,
          },
        },
      }),
    );
    return next !== null;
  };
  const handleAddStrategyComment = async (sectionId: string, body: string) => {
    const strategy = snapshot?.strategy;
    if (!strategy) return false;
    const next = await runStrategyMutation(() =>
      addStrategyComment({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
          strategyId: strategy.id,
          sectionId,
          expectedRevision: strategy.revision,
          body,
        },
      }),
    );
    return next !== null;
  };
  const handleReplyStrategyComment = async (commentId: string, body: string) => {
    const strategy = snapshot?.strategy;
    if (!strategy) return false;
    const next = await runStrategyMutation(() =>
      replyStrategyComment({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
          strategyId: strategy.id,
          commentId,
          expectedRevision: strategy.revision,
          body,
        },
      }),
    );
    return next !== null;
  };
  const handleResolveStrategyComment = async (commentId: string) => {
    const strategy = snapshot?.strategy;
    if (!strategy) return false;
    const next = await runStrategyMutation(() =>
      resolveStrategyComment({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
          strategyId: strategy.id,
          commentId,
          expectedRevision: strategy.revision,
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
          expectedRevision: strategy.revision,
        },
      }),
    );
    return next !== null;
  };
  const handleReviewStrategy = async (decision: "approved" | "rejected", note?: string) => {
    const strategy = snapshot?.strategy;
    if (!strategy) return false;
    const next = await runStrategyMutation(() =>
      reviewStrategy({
        environmentId: props.threadRef.environmentId,
        input: {
          threadId: props.threadRef.threadId,
          strategyId: strategy.id,
          expectedRevision: strategy.revision,
          decision,
          ...(note
            ? {
                note,
              }
            : {}),
        },
      }),
    );
    if (next && decision === "approved") await props.onKickoffAgent(next);
    return next !== null;
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
          <Button className="mt-4" size="sm" disabled={busy !== null} onClick={handleInitialize}>
            {busy === "initialize" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            Create release workspace
          </Button>
          {query.error || error ? (
            <p className="mt-3 text-xs text-destructive">{query.error ?? error}</p>
          ) : null}
        </div>
      </div>
    );
  }
  const readOnly = isStageReadOnly(snapshot, viewedStage);
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
          readOnly={readOnly}
          busy={busy}
          onFiles={handleFiles}
          onStartIngestion={handleStartIngestion}
          onReview={handleReview}
          onSaveStrategySection={handleSaveStrategySection}
          onAddStrategyComment={handleAddStrategyComment}
          onReplyStrategyComment={handleReplyStrategyComment}
          onResolveStrategyComment={handleResolveStrategyComment}
          onSubmitStrategy={handleSubmitStrategy}
          onReviewStrategy={handleReviewStrategy}
          onSaveScenarios={scenarioActions.saveScenarios}
          onSubmitScenarioPlan={scenarioActions.submit}
          onReviewScenarioPlan={scenarioActions.review}
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
  readonly readOnly: boolean;
  readonly busy: BusyAction;
  readonly onFiles: (files: FileList | null) => Promise<void> | void;
  readonly onStartIngestion: () => Promise<void> | void;
  readonly onReview: (
    targetType: "requirement" | "gate",
    targetId: string,
    decision: "approved" | "rejected",
  ) => Promise<void> | void;
  readonly onSaveStrategySection: (sectionId: string, content: string) => Promise<boolean>;
  readonly onAddStrategyComment: (sectionId: string, body: string) => Promise<boolean>;
  readonly onReplyStrategyComment: (commentId: string, body: string) => Promise<boolean>;
  readonly onResolveStrategyComment: (commentId: string) => Promise<boolean>;
  readonly onSubmitStrategy: () => Promise<boolean>;
  readonly onReviewStrategy: (decision: "approved" | "rejected", note?: string) => Promise<boolean>;
  readonly onSaveScenarios: (
    scenarios: readonly import("./scenarioModel").ScenarioRowView[],
  ) => Promise<void>;
  readonly onSubmitScenarioPlan: () => Promise<boolean>;
  readonly onReviewScenarioPlan: (
    decision: "approved" | "rejected",
    note?: string,
  ) => Promise<boolean>;
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
  if (props.stage === "intake") {
    return (
      <IntakeStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        readOnly={props.readOnly}
        busy={props.busy}
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
        readOnly={props.readOnly}
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
        readOnly={props.readOnly}
        busy={props.busy === "strategy"}
        onSaveSection={props.onSaveStrategySection}
        onAddComment={props.onAddStrategyComment}
        onReplyComment={props.onReplyStrategyComment}
        onResolveComment={props.onResolveStrategyComment}
        onSubmit={props.onSubmitStrategy}
        onReview={props.onReviewStrategy}
      />
    );
  }
  if (props.stage === "scenarios") {
    return (
      <ScenarioStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        readOnly={props.readOnly}
        busy={props.busy === "scenario"}
        onSaveScenarios={props.onSaveScenarios}
        onSubmit={props.onSubmitScenarioPlan}
        onReview={props.onReviewScenarioPlan}
      />
    );
  }
  if (props.stage === "test_cases") {
    return (
      <TestCaseStage
        snapshot={props.snapshot}
        selectedTab={props.selectedTab}
        readOnly={props.readOnly}
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
        readOnly={props.readOnly}
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
        readOnly={props.readOnly}
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
