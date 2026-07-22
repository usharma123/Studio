import type { QaReleaseSnapshot, QaScript } from "@t3tools/contracts";
import { useAtomCommand } from "~/state/use-atom-command";
import { qaEnvironment } from "./client";
import { legacyQaThreadId, type QaReleaseRef } from "./releaseRef";
interface Options {
  readonly releaseRef: QaReleaseRef;
  readonly snapshot: QaReleaseSnapshot | null;
  readonly setBusy: (busy: "script" | "readiness" | null) => void;
  readonly setError: (error: string | null) => void;
  readonly setLatestSnapshot: (snapshot: QaReleaseSnapshot) => void;
}
export function useFinalStageActions(options: Options) {
  const threadId = legacyQaThreadId(options.releaseRef.releaseId);
  const updateScript = useAtomCommand(qaEnvironment.updateScript, {
    reportFailure: false,
  });
  const submitScriptPlan = useAtomCommand(qaEnvironment.submitScriptPlan, {
    reportFailure: false,
  });
  const reviewScriptPlan = useAtomCommand(qaEnvironment.reviewScriptPlan, {
    reportFailure: false,
  });
  const reviewReadinessCommand = useAtomCommand(qaEnvironment.reviewReadiness, {
    reportFailure: false,
  });
  const saveScripts = async (scripts: readonly QaScript[]) => {
    const plan = options.snapshot?.scriptPlan;
    if (!plan) return;
    options.setBusy("script");
    options.setError(null);
    let revision = plan.revision;
    for (const script of scripts) {
      const result = await updateScript({
        environmentId: options.releaseRef.environmentId,
        input: {
          threadId,
          planId: plan.id,
          scriptId: script.id,
          expectedRevision: revision,
          patch: {
            externalId: script.externalId,
            testCaseIds: [...script.testCaseIds],
            requirementIds: [...script.requirementIds],
            title: script.title,
            framework: script.framework,
            language: script.language,
            fileName: script.fileName,
            content: script.content,
          },
        },
      });
      if (result._tag !== "Success") {
        options.setBusy(null);
        options.setError("The script edits could not all be saved. Refresh before retrying.");
        return Promise.reject(new Error("Script update failed"));
      }
      revision = result.value.scriptPlan.revision;
      options.setLatestSnapshot(result.value.snapshot);
    }
    options.setBusy(null);
  };
  const submitScripts = async () => {
    const plan = options.snapshot?.scriptPlan;
    if (!plan) return false;
    const next = await run(options, "script", () =>
      submitScriptPlan({
        environmentId: options.releaseRef.environmentId,
        input: {
          threadId,
          planId: plan.id,
          expectedRevision: plan.revision,
        },
      }),
    );
    return next !== null;
  };
  const reviewScripts = async (decision: "approved" | "rejected", note?: string) => {
    const plan = options.snapshot?.scriptPlan;
    if (!plan) return false;
    const next = await run(options, "script", () =>
      reviewScriptPlan({
        environmentId: options.releaseRef.environmentId,
        input: {
          threadId,
          planId: plan.id,
          expectedRevision: plan.revision,
          decision,
          ...(note
            ? {
                note,
              }
            : {}),
        },
      }),
    );
    return next !== null;
  };
  const reviewReadiness = async (decision: "approved" | "rejected", note?: string) => {
    const dashboard = options.snapshot?.readinessDashboard;
    if (!dashboard) return false;
    const next = await run(options, "readiness", () =>
      reviewReadinessCommand({
        environmentId: options.releaseRef.environmentId,
        input: {
          threadId,
          expectedRevision: dashboard.revision,
          decision,
          ...(note
            ? {
                note,
              }
            : {}),
        },
      }),
    );
    return next !== null;
  };
  return {
    saveScripts,
    submitScripts,
    reviewScripts,
    reviewReadiness,
  };
}
async function run(
  options: Options,
  busy: "script" | "readiness",
  execute: () => Promise<{
    readonly _tag: string;
    readonly value?: {
      readonly snapshot: QaReleaseSnapshot;
    };
  }>,
): Promise<QaReleaseSnapshot | null> {
  options.setBusy(busy);
  options.setError(null);
  const result = await execute();
  options.setBusy(null);
  if (result._tag !== "Success" || !result.value) {
    options.setError(`The ${busy} decision could not be saved. Refresh the release and try again.`);
    return null;
  }
  options.setLatestSnapshot(result.value.snapshot);
  return result.value.snapshot;
}
