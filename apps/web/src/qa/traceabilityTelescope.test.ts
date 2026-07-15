import { describe, expect, it } from "vite-plus/test";

import type { TraceabilityEdgeView, TraceabilityNodeView } from "./requirementsModel";
import {
  buildTraceabilityIndex,
  searchTraceabilityNodes,
  traceabilityChildGroups,
  traceabilityEvidence,
  traceabilityIncidentEdges,
  traceabilityParents,
  traceabilityReach,
  traceabilityRoots,
  traceabilityTrailTo,
} from "./traceabilityTelescope";

const node = (
  id: string,
  kind: string,
  externalId: string,
  label = externalId,
): TraceabilityNodeView => ({
  id,
  kind,
  label,
  externalId,
  sourceDocumentId: null,
  detail: externalId,
});

const edge = (
  id: string,
  fromNodeId: string,
  toNodeId: string,
  kind: string,
): TraceabilityEdgeView => ({
  id,
  fromNodeId,
  toNodeId,
  kind,
  provenance: "deterministic",
  reviewStatus: "approved",
  citation: null,
});

const nodes = [
  node("doc-brd", "document", "01-business-requirements-document.docx"),
  node("doc-frs", "document", "02-functional-requirements-specification.docx"),
  node("br-1", "business_requirement", "BR-001", "Users must authenticate."),
  node("fr-1", "functional_requirement", "REQ-FR-001", "Show login controls."),
  node("flow-1", "flow", "HLD-FLOW-001", "Authenticate user"),
  node("test-1", "test", "TC-001", "Valid login"),
];
const edges = [
  edge("e1", "doc-brd", "br-1", "extracts"),
  edge("e2", "doc-frs", "fr-1", "extracts"),
  edge("e3", "br-1", "fr-1", "parent_of"),
  edge("e4", "flow-1", "fr-1", "realizes"),
  edge("e5", "br-1", "test-1", "trace_to_test"),
];

describe("QA traceability telescope", () => {
  it("uses the BRD as the root and derives a deterministic trail", () => {
    const index = buildTraceabilityIndex(nodes, edges);
    const roots = traceabilityRoots(index);
    expect(roots.label).toBe("BRD");
    expect(roots.documents.map((item) => item.id)).toEqual(["doc-brd"]);
    expect(roots.unlinked).toEqual([]);
    expect(traceabilityTrailTo(index, roots, "flow-1")).toEqual([
      "doc-brd",
      "br-1",
      "fr-1",
      "flow-1",
    ]);
  });

  it("groups downstream children and reverses realizes edges for business navigation", () => {
    const index = buildTraceabilityIndex(nodes, edges);
    expect(traceabilityChildGroups(index, "br-1").map((group) => group.kind)).toEqual([
      "parent_of",
      "trace_to_test",
    ]);
    expect(traceabilityChildGroups(index, "fr-1")[0]?.children[0]?.node.id).toBe("flow-1");
    expect(traceabilityParents(index, "flow-1")[0]?.node.id).toBe("fr-1");
    expect(traceabilityReach(index, "br-1")).toBe(3);
  });

  it("indexes raw incident edges without rescanning the graph", () => {
    const index = buildTraceabilityIndex(nodes, edges);
    expect(traceabilityIncidentEdges(index, "fr-1")).toEqual({
      outgoing: [],
      incoming: [edges[1], edges[2], edges[3]],
    });
    expect(traceabilityIncidentEdges(index, "flow-1")).toEqual({
      outgoing: [edges[3]],
      incoming: [],
    });
  });

  it("searches IDs and labels with exact IDs ranked first", () => {
    const index = buildTraceabilityIndex(nodes, edges);
    expect(searchTraceabilityNodes(index, "REQ-FR-001")[0]?.id).toBe("fr-1");
    expect(searchTraceabilityNodes(index, "authenticate").map((item) => item.id)).toEqual([
      "br-1",
      "flow-1",
    ]);
  });

  it("scopes root evidence to the actual BRD roots and their downstream graph", () => {
    const index = buildTraceabilityIndex(nodes, edges);
    const roots = traceabilityRoots(index);
    expect(traceabilityEvidence(index, roots, null)).toEqual({
      documents: 1,
      requirements: 2,
      design: 1,
      tests: 1,
      coveragePercent: 50,
    });
  });
});
