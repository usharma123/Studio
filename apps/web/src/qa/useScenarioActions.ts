import type { QaReleaseSnapshot, ScopedThreadRef } from "@t3tools/contracts";
import { useAtomCommand } from "~/state/use-atom-command";
import { qaEnvironment } from "./client";
import type { ScenarioRowView } from "./scenarioModel";
interface UseScenarioActionsOptions {
  readonly threadRef: ScopedThreadRef;
  readonly snapshot: QaReleaseSnapshot | null;
  readonly setBusy: (busy: "scenario" | null) => void;
  readonly setError: (error: string | null) => void;
  readonly setLatestSnapshot: (snapshot: QaReleaseSnapshot) => void;
  readonly onKickoffAgent: (snapshot: QaReleaseSnapshot) => Promise<void> | void;
}
export function useScenarioActions(options: UseScenarioActionsOptions) {
  const updateScenario = useAtomCommand(qaEnvironment.updateScenario, {
    reportFailure: false,
  });
  const submitScenarioPlan = useAtomCommand(qaEnvironment.submitScenarioPlan, {
    reportFailure: false,
  });
  const reviewScenarioPlan = useAtomCommand(qaEnvironment.reviewScenarioPlan, {
    reportFailure: false,
  });
  const saveScenarios = async (scenarios: readonly ScenarioRowView[]) => {
    const plan = options.snapshot?.scenarioPlan;
    if (!plan) return;
    options.setBusy("scenario");
    options.setError(null);
    const saved = await saveScenarioRowsSequentially(
      scenarios,
      plan.revision,
      async (scenario, expectedRevision) => {
        const result = await updateScenario({
          environmentId: options.threadRef.environmentId,
          input: {
            threadId: options.threadRef.threadId,
            planId: plan.id,
            scenarioId: scenario.id,
            expectedRevision,
            patch: {
              externalId: scenario.externalId,
              title: scenario.title,
              type: scenario.type,
              priority: scenario.priority,
              risk: scenario.risk,
              requirementIds: [...scenario.requirementIds],
              preconditions: [...scenario.preconditions],
              expectedOutcome: scenario.expectedOutcome,
            },
          },
        });
        return result._tag === "Success" ? result.value : null;
      },
      options.setLatestSnapshot,
    );
    options.setBusy(null);
    if (!saved) {
      options.setError(
        "The scenario edits could not all be saved. Your drafts remain in the workbook; refresh before retrying.",
      );
      return Promise.reject(new Error("Scenario update failed"));
    }
  };
  const submit = async () => {
    const plan = options.snapshot?.scenarioPlan;
    if (!plan) return false;
    const next = await runScenarioMutation(options, () =>
      submitScenarioPlan({
        environmentId: options.threadRef.environmentId,
        input: {
          threadId: options.threadRef.threadId,
          planId: plan.id,
          expectedRevision: plan.revision,
        },
      }),
    );
    return next !== null;
  };
  const review = async (decision: "approved" | "rejected", note?: string) => {
    const plan = options.snapshot?.scenarioPlan;
    if (!plan) return false;
    const next = await runScenarioMutation(options, () =>
      reviewScenarioPlan({
        environmentId: options.threadRef.environmentId,
        input: {
          threadId: options.threadRef.threadId,
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
    if (next && decision === "approved") await options.onKickoffAgent(next);
    return next !== null;
  };
  return {
    saveScenarios,
    submit,
    review,
  };
}
async function runScenarioMutation(
  options: UseScenarioActionsOptions,
  execute: () => Promise<{
    readonly _tag: string;
    readonly value?: {
      readonly snapshot: QaReleaseSnapshot;
    };
  }>,
): Promise<QaReleaseSnapshot | null> {
  options.setBusy("scenario");
  options.setError(null);
  const result = await execute();
  options.setBusy(null);
  if (result._tag !== "Success" || !result.value) {
    options.setError("The scenario action could not be saved. Refresh the release and try again.");
    return null;
  }
  options.setLatestSnapshot(result.value.snapshot);
  return result.value.snapshot;
}
async function saveScenarioRowsSequentially(
  scenarios: readonly ScenarioRowView[],
  startingRevision: number,
  save: (
    scenario: ScenarioRowView,
    expectedRevision: number,
  ) => Promise<{
    readonly scenarioPlan: {
      readonly revision: number;
    };
    readonly snapshot: QaReleaseSnapshot;
  } | null>,
  onSaved: (snapshot: QaReleaseSnapshot) => void,
): Promise<boolean> {
  let expectedRevision = startingRevision;
  for (const scenario of scenarios) {
    const next = await save(scenario, expectedRevision);
    if (!next) return false;
    expectedRevision = next.scenarioPlan.revision;
    onSaved(next.snapshot);
  }
  return true;
}
