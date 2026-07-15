import type { QaReleaseSnapshot, QaRequirement } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  businessRequirements,
  buildRequirementWorkbookRows,
  requirementCitations,
  requirementReviewRequired,
  traceabilityView,
} from "./requirementsModel";

const requirement = (fields: Record<string, unknown>) => fields as unknown as QaRequirement;

describe("QA requirement views", () => {
  it("shows only business requirements in the requirements workbook", () => {
    const br = requirement({ id: "br-1", externalId: "BR-001", requirementType: "BRD" });
    const fr = requirement({
      id: "fr-1",
      externalId: "REQ-FR-001",
      requirementType: "FRS",
      parentRequirementIds: ["BR-001"],
    });
    const rows = buildRequirementWorkbookRows([fr, br]);
    expect(rows).toEqual([
      {
        id: "br-1",
        requirement: br,
        linkedFunctionalRequirementIds: ["REQ-FR-001"],
      },
    ]);
    expect(businessRequirements([fr, br])).toEqual([br]);
  });

  it("does not fall back to functional requirements when a release has no BRs", () => {
    const fr = requirement({ id: "fr-1", requirementType: "functional" });
    expect(buildRequirementWorkbookRows([fr])).toEqual([]);
  });

  it("preserves citations and review-required state", () => {
    const row = requirement({
      id: "br-1",
      reviewRequired: true,
      sourceCitations: [{ documentId: "doc-1", section: "2.1", excerpt: "Must settle" }],
    });
    expect(requirementReviewRequired(row)).toBe(true);
    expect(requirementCitations(row)[0]?.section).toBe("2.1");
  });

  it("builds drilldown data only from persisted traceability nodes and edges", () => {
    const snapshot = {
      traceabilityNodes: [
        { id: "br-1", kind: "requirement", label: "Checkout", externalId: "BR-1" },
      ],
      traceabilityEdges: [
        {
          id: "edge-1",
          fromNodeId: "doc-1",
          toNodeId: "br-1",
          kind: "sources",
          provenance: "agent",
          reviewStatus: "pending",
          citation: { documentId: "doc-1", section: "2.1", excerpt: "Checkout requirement" },
        },
      ],
    } as unknown as QaReleaseSnapshot;
    expect(traceabilityView(snapshot)).toEqual({
      nodes: [
        {
          id: "br-1",
          kind: "requirement",
          label: "Checkout",
          externalId: "BR-1",
          sourceDocumentId: null,
          detail: "BR-1",
        },
      ],
      edges: [
        {
          id: "edge-1",
          fromNodeId: "doc-1",
          toNodeId: "br-1",
          kind: "sources",
          provenance: "agent",
          reviewStatus: "pending",
          citation: { documentId: "doc-1", section: "2.1", excerpt: "Checkout requirement" },
        },
      ],
    });
  });
});
