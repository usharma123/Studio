import type { QaReleaseSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { strategyCommentThreads, strategyDocumentView } from "./strategyModel";

describe("QA strategy views", () => {
  it("sorts persisted sections and preserves bounded coverage", () => {
    const snapshot = {
      revision: 7,
      strategy: {
        revision: 3,
        generationStatus: "complete",
        reviewStatus: "pending",
        sections: [
          {
            id: "risks",
            title: "Risks",
            order: 2,
            content: "Risk based",
            sourceRequirementIds: [],
          },
          {
            id: "scope",
            title: "Scope",
            order: 1,
            content: "Release scope",
            sourceRequirementIds: ["br-1"],
          },
        ],
        comments: [],
        coverage: {
          totalRequirements: 4,
          coveredRequirements: 3,
          percent: 75,
          uncoveredRequirementIds: ["br-4"],
        },
      },
    } as unknown as QaReleaseSnapshot;
    const view = strategyDocumentView(snapshot);
    expect(view?.sections.map((section) => section.id)).toEqual(["scope", "risks"]);
    expect(view?.coverage).toMatchObject({ percent: 75, uncoveredRequirementIds: ["br-4"] });
  });

  it("groups replies under their persisted parent comment", () => {
    const view = strategyDocumentView({
      revision: 1,
      strategy: {
        comments: [
          {
            id: "root",
            body: "Clarify risk",
            author: "BA",
            replies: [{ id: "reply", body: "Updated", author: "QA" }],
          },
        ],
      },
    } as unknown as QaReleaseSnapshot);
    expect(strategyCommentThreads(view?.comments ?? [])[0]).toMatchObject({
      comment: { id: "root" },
      replies: [{ id: "reply" }],
    });
  });
});
