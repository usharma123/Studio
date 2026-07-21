import type { QaReleaseSnapshot, QaTestCase } from "@t3tools/contracts";
import { useAtomCommand } from "~/state/use-atom-command";
import { qaEnvironment } from "./client";
import { legacyQaThreadId, type QaReleaseRef } from "./releaseRef";
interface UseTestCaseActionsOptions {
  readonly releaseRef: QaReleaseRef;
  readonly snapshot: QaReleaseSnapshot | null;
  readonly setBusy: (busy: "test-case" | null) => void;
  readonly setError: (error: string | null) => void;
  readonly setLatestSnapshot: (snapshot: QaReleaseSnapshot) => void;
}
export function useTestCaseActions(options: UseTestCaseActionsOptions) {
  const threadId = legacyQaThreadId(options.releaseRef.releaseId);
  const updateTestCase = useAtomCommand(qaEnvironment.updateTestCase, {
    reportFailure: false,
  });
  const submitTestCasePlan = useAtomCommand(qaEnvironment.submitTestCasePlan, {
    reportFailure: false,
  });
  const reviewTestCasePlan = useAtomCommand(qaEnvironment.reviewTestCasePlan, {
    reportFailure: false,
  });
  const saveTestCases = async (testCases: readonly QaTestCase[]) => {
    const plan = options.snapshot?.testCasePlan;
    if (!plan) return;
    options.setBusy("test-case");
    options.setError(null);
    const saved = await saveTestCaseRowsSequentially(
      testCases,
      plan.revision,
      async (testCase, expectedRevision) => {
        const result = await updateTestCase({
          environmentId: options.releaseRef.environmentId,
          input: {
            threadId,
            planId: plan.id,
            testCaseId: testCase.id,
            expectedRevision,
            patch: {
              externalId: testCase.externalId,
              scenarioIds: [...testCase.scenarioIds],
              requirementIds: [...testCase.requirementIds],
              title: testCase.title,
              preconditions: [...testCase.preconditions],
              steps: testCase.steps.map((step) => ({
                ...step,
              })),
              priority: testCase.priority,
              automationCandidate: testCase.automationCandidate,
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
        "The test case edits could not all be saved. Your drafts remain in the workbook; refresh before retrying.",
      );
      return Promise.reject(new Error("Test case update failed"));
    }
  };
  const submit = async () => {
    const plan = options.snapshot?.testCasePlan;
    if (!plan) return false;
    const next = await runTestCaseMutation(options, () =>
      submitTestCasePlan({
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
  const review = async (decision: "approved" | "rejected", note?: string) => {
    const plan = options.snapshot?.testCasePlan;
    if (!plan) return false;
    const next = await runTestCaseMutation(options, () =>
      reviewTestCasePlan({
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
  return {
    saveTestCases,
    submit,
    review,
  };
}
async function runTestCaseMutation(
  options: UseTestCaseActionsOptions,
  execute: () => Promise<{
    readonly _tag: string;
    readonly value?: {
      readonly snapshot: QaReleaseSnapshot;
    };
  }>,
): Promise<QaReleaseSnapshot | null> {
  options.setBusy("test-case");
  options.setError(null);
  const result = await execute();
  options.setBusy(null);
  if (result._tag !== "Success" || !result.value) {
    options.setError("The test case action could not be saved. Refresh the release and try again.");
    return null;
  }
  options.setLatestSnapshot(result.value.snapshot);
  return result.value.snapshot;
}
async function saveTestCaseRowsSequentially(
  testCases: readonly QaTestCase[],
  startingRevision: number,
  save: (
    testCase: QaTestCase,
    expectedRevision: number,
  ) => Promise<{
    readonly testCasePlan: {
      readonly revision: number;
    };
    readonly snapshot: QaReleaseSnapshot;
  } | null>,
  onSaved: (snapshot: QaReleaseSnapshot) => void,
): Promise<boolean> {
  let expectedRevision = startingRevision;
  for (const testCase of testCases) {
    const next = await save(testCase, expectedRevision);
    if (!next) return false;
    expectedRevision = next.testCasePlan.revision;
    onSaved(next.snapshot);
  }
  return true;
}
