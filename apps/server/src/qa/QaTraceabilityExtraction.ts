import type { ParsedDocument } from "./QaIngestionPipeline.ts";

export type QaPipelineDesignNodeKind = "component" | "flow" | "data";

export interface QaPipelineDesignNode {
  readonly externalId: string;
  readonly kind: QaPipelineDesignNodeKind;
  readonly label: string;
  readonly sourceDocumentId: string;
}

export type QaPipelineDesignEdgeKind =
  | "realizes"
  | "touches"
  | "writes_to"
  | "reads_from"
  | "represents";

export interface QaPipelineDesignEdge {
  readonly fromExternalId: string;
  readonly toExternalId: string;
  readonly kind: QaPipelineDesignEdgeKind;
  readonly citation: string | null;
}

export interface QaPipelineAuthoredFlowLeg {
  readonly position: number;
  readonly role: "origin" | "intermediate" | "terminal";
  readonly mention: string;
  readonly componentExternalId: string | null;
  readonly componentName: string | null;
}

export interface QaPipelineAuthoredFlow {
  readonly id: string;
  readonly externalId: string;
  readonly name: string;
  readonly actor: string;
  readonly trigger: string;
  readonly narrative: string;
  readonly outcome: string;
  readonly legs: readonly QaPipelineAuthoredFlowLeg[];
  readonly componentExternalIds: readonly string[];
  readonly componentMentions: readonly string[];
  readonly requirementExternalIds: readonly string[];
  readonly sourceDocumentId: string;
}

export interface QaPipelineDesignGraph {
  readonly nodes: readonly QaPipelineDesignNode[];
  readonly edges: readonly QaPipelineDesignEdge[];
  readonly authoredFlows: readonly QaPipelineAuthoredFlow[];
}

const COMPONENT_ID = /^HLD-COMP-\d+$/u;
const FLOW_ID = /^HLD-FLOW-\d+$/u;
const DATA_ID = /^DATA-[A-Z0-9-]+$/u;
const TRACEABLE_ID = /\b(?:BR-\d+|REQ-(?:FR|SEC|NFR)-\d+|DATA-[A-Z0-9-]+)\b/gu;
const REQUIREMENT_RANGE =
  /\b((?:BR|REQ-(?:FR|SEC|NFR))-)(\d+)\s+to\s+(?:(?:BR|REQ-(?:FR|SEC|NFR))-)?(\d+)\b/giu;

export function extractQaDesignGraph(documents: readonly ParsedDocument[]): QaPipelineDesignGraph {
  const hldDocuments = documents.filter((document) => document.documentType === "HLD");
  const lldDocuments = documents.filter((document) => document.documentType === "LLD");
  const nodes = new Map<string, QaPipelineDesignNode>();
  const edges = new Map<string, QaPipelineDesignEdge>();
  const authoredFlows = new Map<string, QaPipelineAuthoredFlow>();
  const componentIdByName = new Map<string, string>();
  const componentNameById = new Map<string, string>();
  const flowComponents = new Map<string, ReadonlySet<string>>();
  const citationByFlow = new Map<string, string>();

  const addNode = (node: QaPipelineDesignNode): void => {
    const existing = nodes.get(node.externalId);
    if (existing === undefined || existing.label === existing.externalId) {
      nodes.set(node.externalId, node);
    }
  };
  const addEdge = (edge: QaPipelineDesignEdge): void => {
    const key = `${edge.fromExternalId}|${edge.kind}|${edge.toExternalId}`;
    if (!edges.has(key)) edges.set(key, edge);
  };

  for (const document of hldDocuments) {
    for (const block of document.blocks) {
      const cells = tableCells(block.text);
      const externalId = cells[0]?.toUpperCase() ?? "";
      if (!COMPONENT_ID.test(externalId) || cells.length < 4) continue;
      const label = cells[1] ?? externalId;
      addNode({ externalId, kind: "component", label, sourceDocumentId: document.documentId });
      componentNameById.set(externalId, label);
      componentIdByName.set(normalizeName(label), externalId);
      componentIdByName.set(normalizeName(externalId), externalId);
      for (const targetId of traceableIds(cells[3] ?? "")) {
        if (targetId.startsWith("DATA-")) {
          addNode({
            externalId: targetId,
            kind: "data",
            label: targetId,
            sourceDocumentId: document.documentId,
          });
          addEdge({
            fromExternalId: externalId,
            toExternalId: targetId,
            kind: "represents",
            citation: block.citation,
          });
        } else {
          addEdge({
            fromExternalId: externalId,
            toExternalId: targetId,
            kind: "realizes",
            citation: block.citation,
          });
        }
      }
    }
  }

  for (const document of lldDocuments) {
    for (const block of document.blocks) {
      const cells = tableCells(block.text);
      const externalId = cells[0]?.toUpperCase() ?? "";
      if (!DATA_ID.test(externalId) || cells.length < 3) continue;
      if (nodes.get(externalId)?.kind !== "data") continue;
      const entityName = cells[1] ?? externalId;
      const description = cells[2];
      addNode({
        externalId,
        kind: "data",
        label: description ? `${entityName} — ${description}` : entityName,
        sourceDocumentId: document.documentId,
      });
    }
  }

  for (const document of hldDocuments) {
    for (const block of document.blocks) {
      const cells = tableCells(block.text);
      const externalId = cells[0]?.toUpperCase() ?? "";
      if (!FLOW_ID.test(externalId) || cells.length < 8) continue;
      const label = cells[1] ?? externalId;
      const actor = cells[2] ?? "";
      const trigger = cells[3] ?? "";
      const narrative = cells[4] ?? "";
      const componentMentions = (cells[5] ?? "")
        .split(/[;,]/u)
        .map((name) => name.trim())
        .filter(Boolean);
      const requirementExternalIds = traceableIds(cells[6] ?? "");
      const outcome = cells[7] ?? "";
      addNode({ externalId, kind: "flow", label, sourceDocumentId: document.documentId });
      const componentIds = new Set(
        componentMentions
          .map((name) => componentIdByName.get(normalizeName(name)))
          .filter((id): id is string => id !== undefined),
      );
      const orderedComponentIds = [...componentIds];
      authoredFlows.set(externalId, {
        id: `authored-flow:${externalId}`,
        externalId,
        name: label,
        actor,
        trigger,
        narrative,
        outcome,
        legs: orderedComponentIds.map((componentId, position) => ({
          position,
          role:
            position === 0
              ? "origin"
              : position === orderedComponentIds.length - 1
                ? "terminal"
                : "intermediate",
          mention: componentNameById.get(componentId) ?? componentId,
          componentExternalId: componentId,
          componentName: componentNameById.get(componentId) ?? null,
        })),
        componentExternalIds: orderedComponentIds,
        componentMentions,
        requirementExternalIds,
        sourceDocumentId: document.documentId,
      });
      flowComponents.set(externalId, componentIds);
      citationByFlow.set(externalId, block.citation);
      for (const targetId of requirementExternalIds) {
        addEdge({
          fromExternalId: externalId,
          toExternalId: targetId,
          kind: "realizes",
          citation: block.citation,
        });
      }
      for (const componentId of componentIds) {
        addEdge({
          fromExternalId: externalId,
          toExternalId: componentId,
          kind: "touches",
          citation: block.citation,
        });
      }
    }
  }

  addV1OperationalEdges({
    nodes,
    edges,
    flowComponents,
    citationByFlow,
  });

  return {
    nodes: [...nodes.values()].sort(compareNodes),
    edges: [...edges.values()].sort(compareEdges),
    authoredFlows: [...authoredFlows.values()].sort((left, right) =>
      left.externalId.localeCompare(right.externalId, undefined, { numeric: true }),
    ),
  };
}

function addV1OperationalEdges(input: {
  readonly nodes: ReadonlyMap<string, QaPipelineDesignNode>;
  readonly edges: Map<string, QaPipelineDesignEdge>;
  readonly flowComponents: ReadonlyMap<string, ReadonlySet<string>>;
  readonly citationByFlow: ReadonlyMap<string, string>;
}): void {
  const add = (
    fromExternalId: string,
    toExternalId: string,
    kind: "writes_to" | "reads_from",
    flowId: string,
  ): void => {
    if (!input.nodes.has(fromExternalId) || !input.nodes.has(toExternalId)) return;
    const key = `${fromExternalId}|${kind}|${toExternalId}`;
    if (input.edges.has(key)) return;
    input.edges.set(key, {
      fromExternalId,
      toExternalId,
      kind,
      citation: input.citationByFlow.get(flowId) ?? null,
    });
  };

  const makerEntry = input.flowComponents.get("HLD-FLOW-101");
  if (makerEntry?.has("HLD-COMP-001") && makerEntry.has("HLD-COMP-010")) {
    add("HLD-COMP-001", "HLD-COMP-010", "writes_to", "HLD-FLOW-101");
  }
  const checkerApproval = input.flowComponents.get("HLD-FLOW-102");
  if (checkerApproval?.has("HLD-COMP-001") && checkerApproval.has("HLD-COMP-010")) {
    add("HLD-COMP-001", "HLD-COMP-010", "reads_from", "HLD-FLOW-102");
  }
  if (checkerApproval?.has("HLD-COMP-001") && checkerApproval.has("HLD-COMP-005")) {
    add("HLD-COMP-001", "HLD-COMP-005", "writes_to", "HLD-FLOW-102");
  }
  if (checkerApproval?.has("HLD-COMP-005") && checkerApproval.has("HLD-COMP-010")) {
    add("HLD-COMP-005", "HLD-COMP-010", "reads_from", "HLD-FLOW-102");
  }
}

function traceableIds(value: string): string[] {
  const expanded = new Set<string>();
  for (const match of value.matchAll(REQUIREMENT_RANGE)) {
    const prefix = match[1]?.toUpperCase();
    const fromText = match[2];
    const toText = match[3];
    if (prefix === undefined || fromText === undefined || toText === undefined) continue;
    const from = Number(fromText);
    const to = Number(toText);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from || to - from > 100) {
      continue;
    }
    const width = Math.max(fromText.length, toText.length);
    for (let value = from; value <= to; value += 1) {
      expanded.add(`${prefix}${String(value).padStart(width, "0")}`);
    }
  }
  for (const match of value.toUpperCase().matchAll(TRACEABLE_ID)) {
    if (match[0] !== undefined) expanded.add(match[0]);
  }
  return [...expanded].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

function tableCells(text: string): string[] {
  if (!text.includes("|")) return [];
  return text
    .split("|")
    .map((cell) => cell.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function compareNodes(left: QaPipelineDesignNode, right: QaPipelineDesignNode): number {
  return left.kind.localeCompare(right.kind) || left.externalId.localeCompare(right.externalId);
}

function compareEdges(left: QaPipelineDesignEdge, right: QaPipelineDesignEdge): number {
  return (
    left.fromExternalId.localeCompare(right.fromExternalId) ||
    left.kind.localeCompare(right.kind) ||
    left.toExternalId.localeCompare(right.toExternalId)
  );
}
