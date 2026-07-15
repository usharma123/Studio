import type { QaReviewThread } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { openBlockingReviewThreadIds, reviewThreadRequiresOverride } from "./reviewThreadUi";

function thread(input: unknown): QaReviewThread {
  return input as QaReviewThread;
}

describe("anchored review thread UI", () => {
  it("only uses unresolved blocking threads to gate approval", () => {
    expect(
      openBlockingReviewThreadIds([
        thread({ id: "blocking", severity: "blocking", status: "open" }),
        thread({ id: "advisory", severity: "advisory", status: "open" }),
        thread({ id: "resolved", severity: "blocking", status: "resolved" }),
      ]),
    ).toEqual(["blocking"]);
  });

  it("requires an override for disagreement, inconclusive, or failure", () => {
    expect(
      reviewThreadRequiresOverride(
        thread({ latestAiRun: { status: "completed", result: { verdict: "agrees" } } }),
      ),
    ).toBe(false);
    expect(
      reviewThreadRequiresOverride(
        thread({ latestAiRun: { status: "completed", result: { verdict: "disagrees" } } }),
      ),
    ).toBe(true);
    expect(
      reviewThreadRequiresOverride(thread({ latestAiRun: { status: "failed", result: null } })),
    ).toBe(true);
  });

  it("does not offer override resolution before a terminal AI attempt", () => {
    expect(
      reviewThreadRequiresOverride(thread({ latestAiRun: { status: "running", result: null } })),
    ).toBe(false);
  });

  it("requires a fresh AI attempt before any resolution path", () => {
    expect(
      reviewThreadRequiresOverride(
        thread({
          latestAiRun: {
            status: "completed",
            stale: true,
            result: { verdict: "disagrees" },
          },
        }),
      ),
    ).toBe(false);
  });
});
