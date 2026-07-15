import type { TraceabilityEdgeView, TraceabilityNodeView } from "./requirementsModel";

export interface TraceabilityIndex {
  readonly nodeById: ReadonlyMap<string, TraceabilityNodeView>;
  readonly outgoingByNodeId: ReadonlyMap<string, readonly TraceabilityEdgeView[]>;
  readonly incomingByNodeId: ReadonlyMap<string, readonly TraceabilityEdgeView[]>;
  readonly rawOutgoingByNodeId: ReadonlyMap<string, readonly TraceabilityEdgeView[]>;
  readonly rawIncomingByNodeId: ReadonlyMap<string, readonly TraceabilityEdgeView[]>;
  readonly edges: readonly TraceabilityEdgeView[];
}

export interface TraceabilityIncidentEdges {
  readonly outgoing: readonly TraceabilityEdgeView[];
  readonly incoming: readonly TraceabilityEdgeView[];
}

export interface TraceabilityRoots {
  readonly documents: readonly TraceabilityNodeView[];
  readonly unlinked: readonly TraceabilityNodeView[];
  readonly label: "BRD" | "Documents";
}

export interface TraceabilityChild {
  readonly edge: TraceabilityEdgeView;
  readonly node: TraceabilityNodeView;
  readonly directChildren: number;
}

export interface TraceabilityChildGroup {
  readonly kind: string;
  readonly children: readonly TraceabilityChild[];
}

export interface TraceabilityEvidenceStats {
  readonly documents: number;
  readonly requirements: number;
  readonly design: number;
  readonly tests: number;
  readonly coveragePercent: number | null;
}

const REVERSED_EDGE_KINDS = new Set(["realizes"]);
const EDGE_ORDER = new Map([
  ["contains", 0],
  ["extracts", 1],
  ["authors", 2],
  ["parent_of", 3],
  ["realizes", 4],
  ["touches", 5],
  ["writes_to", 6],
  ["reads_from", 7],
  ["bypasses", 8],
  ["depends_on", 9],
  ["trace_to_test", 10],
]);
const NODE_ORDER = new Map([
  ["document", 0],
  ["business_requirement", 1],
  ["control", 2],
  ["functional_requirement", 3],
  ["flow", 4],
  ["component", 5],
  ["interface", 6],
  ["data", 7],
  ["test", 8],
]);
const REQUIREMENT_KINDS = new Set(["business_requirement", "functional_requirement", "control"]);
const DESIGN_KINDS = new Set(["flow", "component", "interface", "data"]);

export function traceabilityNodeDisplayId(node: TraceabilityNodeView): string {
  return node.externalId ?? node.id;
}

export function traceabilityNodeKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    document: "Document",
    business_requirement: "Business requirement",
    functional_requirement: "Functional requirement",
    component: "Component",
    flow: "HLD flow",
    interface: "Interface",
    control: "Control",
    data: "Data",
    test: "Test",
  };
  return labels[kind] ?? kind.replaceAll("_", " ");
}

export function traceabilityEdgeLabel(kind: string): string {
  return (kind === "realizes" ? "realized by" : kind).replaceAll("_", " ").toUpperCase();
}

function upstreamId(edge: TraceabilityEdgeView): string {
  return REVERSED_EDGE_KINDS.has(edge.kind) ? edge.toNodeId : edge.fromNodeId;
}

function downstreamId(edge: TraceabilityEdgeView): string {
  return REVERSED_EDGE_KINDS.has(edge.kind) ? edge.fromNodeId : edge.toNodeId;
}

function compareNodes(left: TraceabilityNodeView, right: TraceabilityNodeView): number {
  return (
    (NODE_ORDER.get(left.kind) ?? 99) - (NODE_ORDER.get(right.kind) ?? 99) ||
    traceabilityNodeDisplayId(left).localeCompare(traceabilityNodeDisplayId(right)) ||
    left.label.localeCompare(right.label)
  );
}

export function buildTraceabilityIndex(
  nodes: readonly TraceabilityNodeView[],
  edges: readonly TraceabilityEdgeView[],
): TraceabilityIndex {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, TraceabilityEdgeView[]>();
  const incoming = new Map<string, TraceabilityEdgeView[]>();
  const rawOutgoing = new Map<string, TraceabilityEdgeView[]>();
  const rawIncoming = new Map<string, TraceabilityEdgeView[]>();
  const validEdges: TraceabilityEdgeView[] = [];
  for (const edge of edges) {
    if (!nodeById.has(edge.fromNodeId) || !nodeById.has(edge.toNodeId)) continue;
    validEdges.push(edge);
    const rawFromEdges = rawOutgoing.get(edge.fromNodeId) ?? [];
    rawFromEdges.push(edge);
    rawOutgoing.set(edge.fromNodeId, rawFromEdges);
    const rawToEdges = rawIncoming.get(edge.toNodeId) ?? [];
    rawToEdges.push(edge);
    rawIncoming.set(edge.toNodeId, rawToEdges);
    const from = upstreamId(edge);
    const to = downstreamId(edge);
    const fromEdges = outgoing.get(from) ?? [];
    fromEdges.push(edge);
    outgoing.set(from, fromEdges);
    const toEdges = incoming.get(to) ?? [];
    toEdges.push(edge);
    incoming.set(to, toEdges);
  }
  return {
    nodeById,
    outgoingByNodeId: outgoing,
    incomingByNodeId: incoming,
    rawOutgoingByNodeId: rawOutgoing,
    rawIncomingByNodeId: rawIncoming,
    edges: validEdges,
  };
}

export function traceabilityIncidentEdges(
  index: TraceabilityIndex,
  nodeId: string,
): TraceabilityIncidentEdges {
  return {
    outgoing: index.rawOutgoingByNodeId.get(nodeId) ?? [],
    incoming: index.rawIncomingByNodeId.get(nodeId) ?? [],
  };
}

function downstreamSet(index: TraceabilityIndex, seeds: readonly string[]): Set<string> {
  const visited = new Set(seeds);
  const queue = [...seeds];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    if (!id) continue;
    for (const edge of index.outgoingByNodeId.get(id) ?? []) {
      const childId = downstreamId(edge);
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }
  return visited;
}

function looksLikeBusinessRequirementsDocument(node: TraceabilityNodeView): boolean {
  const value = `${node.label} ${node.externalId ?? ""}`;
  return /(^|\W)brd($|\W)|business[- _]requirements?/i.test(value);
}

export function traceabilityRoots(index: TraceabilityIndex): TraceabilityRoots {
  const documents = [...index.nodeById.values()]
    .filter((node) => node.kind === "document")
    .sort(compareNodes);
  const brdDocuments = documents.filter(looksLikeBusinessRequirementsDocument);
  const roots = brdDocuments.length > 0 ? brdDocuments : documents;
  const reachable = downstreamSet(
    index,
    roots.map((node) => node.id),
  );
  const rootIds = new Set(roots.map((node) => node.id));
  const candidates = [...index.nodeById.values()]
    .filter((node) => {
      if (reachable.has(node.id) || rootIds.has(node.id)) return false;
      if (node.kind !== "document") return true;
      return (index.outgoingByNodeId.get(node.id) ?? []).some(
        (edge) => !reachable.has(downstreamId(edge)),
      );
    })
    .sort(compareNodes);
  const candidateIds = new Set(candidates.map((node) => node.id));
  const unlinked = candidates.filter((node) =>
    (index.incomingByNodeId.get(node.id) ?? []).every(
      (edge) => !candidateIds.has(upstreamId(edge)),
    ),
  );
  return { documents: roots, unlinked, label: brdDocuments.length > 0 ? "BRD" : "Documents" };
}

export function traceabilityChildren(
  index: TraceabilityIndex,
  nodeId: string,
): readonly TraceabilityChild[] {
  return (index.outgoingByNodeId.get(nodeId) ?? [])
    .flatMap<TraceabilityChild>((edge) => {
      const node = index.nodeById.get(downstreamId(edge));
      return node
        ? [{ edge, node, directChildren: index.outgoingByNodeId.get(node.id)?.length ?? 0 }]
        : [];
    })
    .sort(
      (left, right) =>
        (EDGE_ORDER.get(left.edge.kind) ?? 99) - (EDGE_ORDER.get(right.edge.kind) ?? 99) ||
        compareNodes(left.node, right.node),
    );
}

export function traceabilityChildGroups(
  index: TraceabilityIndex,
  nodeId: string,
): readonly TraceabilityChildGroup[] {
  const groups: Array<{ kind: string; children: TraceabilityChild[] }> = [];
  for (const child of traceabilityChildren(index, nodeId)) {
    const group = groups.find((candidate) => candidate.kind === child.edge.kind);
    if (group) group.children.push(child);
    else groups.push({ kind: child.edge.kind, children: [child] });
  }
  return groups;
}

export function traceabilityParents(
  index: TraceabilityIndex,
  nodeId: string,
): readonly TraceabilityChild[] {
  return (index.incomingByNodeId.get(nodeId) ?? [])
    .flatMap<TraceabilityChild>((edge) => {
      const node = index.nodeById.get(upstreamId(edge));
      return node
        ? [{ edge, node, directChildren: index.outgoingByNodeId.get(node.id)?.length ?? 0 }]
        : [];
    })
    .sort(
      (left, right) =>
        (EDGE_ORDER.get(left.edge.kind) ?? 99) - (EDGE_ORDER.get(right.edge.kind) ?? 99) ||
        compareNodes(left.node, right.node),
    );
}

export function traceabilityReach(index: TraceabilityIndex, nodeId: string): number {
  const reached = downstreamSet(index, [nodeId]);
  reached.delete(nodeId);
  return reached.size;
}

export function traceabilityTrailTo(
  index: TraceabilityIndex,
  roots: TraceabilityRoots,
  targetId: string,
): readonly string[] {
  if (!index.nodeById.has(targetId)) return [];
  const parents = new Map<string, string | null>();
  const queue: string[] = [];
  for (const node of [...roots.documents, ...roots.unlinked]) {
    if (parents.has(node.id)) continue;
    parents.set(node.id, null);
    queue.push(node.id);
  }
  for (let cursor = 0; cursor < queue.length && !parents.has(targetId); cursor += 1) {
    const id = queue[cursor];
    if (!id) continue;
    for (const child of traceabilityChildren(index, id)) {
      const childId = child.node.id;
      if (parents.has(childId)) continue;
      parents.set(childId, id);
      queue.push(childId);
    }
  }
  if (!parents.has(targetId)) return [targetId];
  const trail: string[] = [];
  for (let id: string | null = targetId; id !== null; id = parents.get(id) ?? null) {
    trail.unshift(id);
  }
  return trail;
}

export function searchTraceabilityNodes(
  index: TraceabilityIndex,
  query: string,
  limit = 8,
): readonly TraceabilityNodeView[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return [...index.nodeById.values()]
    .flatMap((node) => {
      const displayId = traceabilityNodeDisplayId(node).toLocaleLowerCase();
      const label = node.label.toLocaleLowerCase();
      const score =
        displayId === needle
          ? 0
          : displayId.startsWith(needle)
            ? 1
            : displayId.includes(needle)
              ? 2
              : label.includes(needle)
                ? 3
                : null;
      return score === null ? [] : [{ node, score }];
    })
    .sort((left, right) => left.score - right.score || compareNodes(left.node, right.node))
    .slice(0, limit)
    .map(({ node }) => node);
}

export function traceabilityEvidence(
  index: TraceabilityIndex,
  roots: TraceabilityRoots,
  focusId: string | null,
): TraceabilityEvidenceStats {
  const seeds = focusId === null ? [] : [focusId];
  if (focusId === null) {
    for (const node of roots.documents) seeds.push(node.id);
    for (const node of roots.unlinked) seeds.push(node.id);
  }
  const scope = downstreamSet(index, seeds);
  let documents = 0;
  let requirements = 0;
  let design = 0;
  let tests = 0;
  let requirementsWithTests = 0;
  for (const id of scope) {
    const node = index.nodeById.get(id);
    if (!node) continue;
    if (node.kind === "document") documents += 1;
    else if (REQUIREMENT_KINDS.has(node.kind)) {
      requirements += 1;
      if ((index.outgoingByNodeId.get(id) ?? []).some((edge) => edge.kind === "trace_to_test")) {
        requirementsWithTests += 1;
      }
    } else if (DESIGN_KINDS.has(node.kind)) design += 1;
    else if (node.kind === "test") tests += 1;
  }
  return {
    documents,
    requirements,
    design,
    tests,
    coveragePercent:
      requirements === 0 ? null : Math.round((requirementsWithTests * 100) / requirements),
  };
}
