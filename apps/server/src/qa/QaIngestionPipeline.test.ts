// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";

import { describe, expect, it } from "vite-plus/test";

import { runQaIngestionPipeline } from "./QaIngestionPipeline.ts";

const fixtureDirectory = new URL("../../../../fixtures/qa/test-doc/v1/", import.meta.url);
const fixtureFiles = [
  "01-business-requirements-document.docx",
  "02-functional-requirements-specification.docx",
  "03-high-level-design.docx",
  "04-low-level-design.docx",
] as const;

describe("standalone QA V1 ingestion", () => {
  it("matches the React MVP requirement and design graph baseline", async () => {
    const documents = await Promise.all(
      fixtureFiles.map(async (fileName, index) => ({
        id: `fixture-document-${index + 1}`,
        fileName,
        bytes: await NodeFSP.readFile(new URL(fileName, fixtureDirectory)),
      })),
    );

    const result = await runQaIngestionPipeline(documents);

    expect(result.documents).toHaveLength(4);
    expect(result.requirements.filter((item) => item.documentType === "BRD")).toHaveLength(16);
    expect(result.requirements.filter((item) => item.documentType === "FRS")).toHaveLength(32);
    expect(result.designNodes).toHaveLength(11);
    expect(result.authoredFlows).toHaveLength(5);
    expect(result.authoredFlows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: "HLD-FLOW-101",
          name: "Maker trade entry from UI",
          actor: "Maker",
          trigger: "Maker submits a valid trade from the browser UI.",
          componentExternalIds: ["HLD-COMP-001", "HLD-COMP-010"],
          requirementExternalIds: expect.arrayContaining(["BR-001", "REQ-FR-041"]),
          outcome:
            "Pending approval trade exists; submit audit evidence exists; approval queue can display the trade.",
        }),
      ]),
    );
    expect(countBy(result.designNodes, (node) => node.kind)).toEqual({
      component: 3,
      data: 3,
      flow: 5,
    });
    expect(result.designNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: "DATA-TRADE-001",
          label: "Trade — Captured trading instruction and lifecycle state.",
          sourceDocumentId: "fixture-document-4",
        }),
      ]),
    );
    expect(result.designEdges).toHaveLength(110);
    expect(countBy(result.designEdges, (edge) => edge.kind)).toEqual({
      reads_from: 2,
      realizes: 91,
      represents: 3,
      touches: 12,
      writes_to: 2,
    });
    expect(result.designEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromExternalId: "HLD-FLOW-101",
          kind: "realizes",
          toExternalId: "BR-001",
        }),
        expect.objectContaining({
          fromExternalId: "HLD-FLOW-101",
          kind: "touches",
          toExternalId: "HLD-COMP-001",
        }),
        expect.objectContaining({
          fromExternalId: "HLD-COMP-001",
          kind: "writes_to",
          toExternalId: "HLD-COMP-010",
        }),
        expect.objectContaining({
          fromExternalId: "HLD-COMP-010",
          kind: "represents",
          toExternalId: "DATA-TRADE-001",
        }),
      ]),
    );
  });
});

function countBy<T>(values: readonly T[], keyOf: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyOf(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
