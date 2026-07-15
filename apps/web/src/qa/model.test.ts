import { describe, expect, it } from "vite-plus/test";

import type { QaReleaseSnapshot } from "@t3tools/contracts";

import {
  canReviewApprovalGates,
  canStartIngestion,
  deriveWorkflow,
  workflowProgress,
  workflowStatusLabel,
} from "./model";

const snapshot = {
  phase: "ingestion",
  ingestionProgress: 64,
  ingestionStatus: "processing",
  documents: [],
} as unknown as QaReleaseSnapshot;

describe("QA dashboard domain logic", () => {
  it("weights live workflow states without presenting queued work as complete", () => {
    expect(workflowProgress(snapshot)).toBe(41);
    expect(deriveWorkflow(snapshot).map((step) => step.status)).toEqual([
      "complete",
      "processing",
      "not-started",
      "not-started",
    ]);
  });

  it("starts ingestion only when every selected document is queued", () => {
    const readySnapshot = {
      ...snapshot,
      ingestionStatus: "idle",
      documents: [{ status: "uploaded" }],
    } as unknown as QaReleaseSnapshot;
    expect(canStartIngestion(readySnapshot)).toBe(true);
    expect(
      canStartIngestion({
        ...readySnapshot,
        documents: [{ status: "processing" }],
      } as unknown as QaReleaseSnapshot),
    ).toBe(false);
  });

  it("reports release readiness after the final approval without rewriting ingestion history", () => {
    const awaitingReview = {
      ...snapshot,
      phase: "requirements_review",
      ingestionStatus: "completed",
      ingestionProgress: 100,
    } as unknown as QaReleaseSnapshot;
    const ready = { ...awaitingReview, phase: "ready" } as unknown as QaReleaseSnapshot;

    expect(workflowStatusLabel(awaitingReview)).toBe("Awaiting review");
    expect(workflowStatusLabel(ready)).toBe("Release ready");
    expect(ready.ingestionStatus).toBe("completed");
  });

  it("unlocks approval gates after every reviewable business requirement is approved", () => {
    const reviewSnapshot = {
      ...snapshot,
      phase: "requirements_review",
      requirements: [
        { status: "approved", requirementType: "business", reviewRequired: true },
        { status: "pending", requirementType: "business", reviewRequired: true },
        { status: "pending", requirementType: "functional", reviewRequired: false },
      ],
    } as unknown as QaReleaseSnapshot;

    expect(canReviewApprovalGates(reviewSnapshot)).toBe(false);
    expect(
      canReviewApprovalGates({
        ...reviewSnapshot,
        requirements: [
          { status: "approved", requirementType: "business", reviewRequired: true },
          { status: "approved", requirementType: "business", reviewRequired: true },
          { status: "pending", requirementType: "functional", reviewRequired: false },
        ],
      } as unknown as QaReleaseSnapshot),
    ).toBe(true);
  });

  it("keeps approval gates locked when there are no reviewable business requirements", () => {
    expect(
      canReviewApprovalGates({
        ...snapshot,
        phase: "requirements_review",
        requirements: [{ status: "pending", requirementType: "functional", reviewRequired: false }],
      } as unknown as QaReleaseSnapshot),
    ).toBe(false);
  });
});
