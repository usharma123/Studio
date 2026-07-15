import type { QaReleaseSnapshot, QaRequirement } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { RequirementsStage } from "./RequirementsStage";

function requirement(id: string, status: QaRequirement["status"]): QaRequirement {
  return {
    id,
    externalId: id.toUpperCase(),
    requirementType: "business",
    reviewRequired: true,
    title: `${status} requirement`,
    description: `${status} requirement description`,
    status,
  } as unknown as QaRequirement;
}

function renderApprovals(snapshot: QaReleaseSnapshot): string {
  return renderToStaticMarkup(
    <RequirementsStage
      snapshot={snapshot}
      selectedTab="approvals"
      readOnly={false}
      reviewing={false}
      onReview={() => undefined}
    />,
  );
}

describe("RequirementsStage approvals", () => {
  it("shows decision controls only for pending requirements", () => {
    const markup = renderApprovals({
      activeStage: "requirements",
      requirements: [
        requirement("approved", "approved"),
        requirement("rejected", "rejected"),
        requirement("pending", "pending"),
      ],
      approvalGates: [],
    } as unknown as QaReleaseSnapshot);

    expect(markup.match(/aria-label="Reject"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="Approve"/g)).toHaveLength(1);
  });

  it("shows decision controls only for pending approval gates", () => {
    const markup = renderApprovals({
      activeStage: "requirements",
      requirements: [requirement("approved", "approved")],
      approvalGates: [
        {
          id: "approved-gate",
          title: "Approved gate",
          description: "Already approved",
          status: "approved",
        },
        {
          id: "pending-gate",
          title: "Pending gate",
          description: "Needs a decision",
          status: "pending",
        },
      ],
    } as unknown as QaReleaseSnapshot);

    expect(markup.match(/aria-label="Reject"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="Approve"/g)).toHaveLength(1);
  });
});
