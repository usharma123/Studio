import type { QaReviewThread } from "@t3tools/contracts";

export function openBlockingReviewThreadIds(threads: readonly QaReviewThread[]): readonly string[] {
  return threads
    .filter((thread) => thread.status === "open" && thread.severity === "blocking")
    .map((thread) => thread.id);
}

export function reviewThreadRequiresOverride(thread: QaReviewThread): boolean {
  const run = thread.latestAiRun;
  if (run?.status !== "completed" && run?.status !== "failed") return false;
  if (run.stale) return false;
  return run.status === "failed" || run.result?.verdict !== "agrees";
}
