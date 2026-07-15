import type { QaAuthoredFlow, QaReleaseSnapshot } from "@t3tools/contracts";
import { ChevronLeft, Network, Search } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useDeferredValue, useId, useState } from "react";
import { cn } from "~/lib/utils";
import {
  traceabilityView,
  type TraceabilityEdgeView,
  type TraceabilityNodeView,
} from "./requirementsModel";
import {
  buildTraceabilityIndex,
  searchTraceabilityNodes,
  traceabilityChildGroups,
  traceabilityEdgeLabel,
  traceabilityEvidence,
  traceabilityIncidentEdges,
  traceabilityNodeDisplayId,
  traceabilityNodeKindLabel,
  traceabilityParents,
  traceabilityReach,
  traceabilityRoots,
  traceabilityTrailTo,
  type TraceabilityChild,
  type TraceabilityChildGroup,
  type TraceabilityIndex,
  type TraceabilityRoots,
} from "./traceabilityTelescope";
const VISIBLE_CHILDREN = 8;
const NODE_COLORS: Record<string, string> = {
  document: "#64748b",
  business_requirement: "#3b82f6",
  functional_requirement: "#818cf8",
  control: "#a78bfa",
  flow: "#f59e0b",
  component: "#14b8a6",
  interface: "#06b6d4",
  data: "#8b5cf6",
  test: "#22c55e",
};
export function QaTraceabilityGraph({ snapshot }: { readonly snapshot: QaReleaseSnapshot }) {
  const graph = traceabilityView(snapshot);
  const index = buildTraceabilityIndex(graph.nodes, graph.edges);
  const roots = traceabilityRoots(index);
  const authoredFlowByExternalId = new Map(
    snapshot.authoredFlows.map((flow) => [flow.externalId, flow]),
  );
  const [path, setPath] = useState<readonly string[]>([]);
  const safePath = path.filter((id) => index.nodeById.has(id));
  const trailIds = new Set(safePath);
  const focusId = safePath.at(-1) ?? null;
  const focus = focusId ? (index.nodeById.get(focusId) ?? null) : null;
  const evidence = traceabilityEvidence(index, roots, focusId);
  const drill = (nodeId: string) => {
    const previousIndex = safePath.indexOf(nodeId);
    setPath(previousIndex >= 0 ? safePath.slice(0, previousIndex + 1) : [...safePath, nodeId]);
  };
  const focusUpstream = (nodeId: string) => {
    const previousIndex = safePath.indexOf(nodeId);
    setPath(previousIndex >= 0 ? safePath.slice(0, previousIndex + 1) : [nodeId]);
  };
  if (graph.nodes.length === 0) {
    return (
      <div className="rounded-xl border px-4 py-10 text-center text-xs text-muted-foreground">
        No persisted traceability graph is available for this release yet.
      </div>
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Traceability graph</h3>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </span>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Drill from document to requirement, design, component, data, and test. Read-only.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-3 border-b bg-muted/10 px-4 py-3">
        <TelescopeSearch index={index} roots={roots} onNavigate={setPath} />
        <GraphLegend nodes={graph.nodes} />
      </div>

      <TelescopeTrail
        index={index}
        roots={roots}
        path={safePath}
        onJump={(pathIndex) => setPath(pathIndex < 0 ? [] : safePath.slice(0, pathIndex + 1))}
      />

      <div className="grid min-h-[26rem] gap-4 overflow-x-auto p-4 lg:grid-cols-[minmax(15rem,.85fr)_minmax(17rem,1.15fr)]">
        {focus ? (
          <FocusedNodeCard
            node={focus}
            index={index}
            authoredFlow={
              focus.externalId ? (authoredFlowByExternalId.get(focus.externalId) ?? null) : null
            }
            trailIds={trailIds}
            onFocusUpstream={focusUpstream}
          />
        ) : (
          <ReleaseRootCard index={index} roots={roots} />
        )}
        <ChildFan
          focusId={focusId}
          groups={focus ? traceabilityChildGroups(index, focus.id) : rootGroups(index, roots)}
          trailIds={trailIds}
          onDrill={drill}
        />
      </div>

      <EvidenceStrip stats={evidence} scoped={focusId !== null} />
    </section>
  );
}
function TelescopeSearch({
  index,
  roots,
  onNavigate,
}: {
  readonly index: TraceabilityIndex;
  readonly roots: TraceabilityRoots;
  readonly onNavigate: (path: readonly string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const deferredQuery = useDeferredValue(query);
  const matches = searchTraceabilityNodes(index, deferredQuery);
  const select = (node: TraceabilityNodeView) => {
    onNavigate(traceabilityTrailTo(index, roots, node.id));
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) => Math.min(value + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const match = matches[Math.min(activeIndex, matches.length - 1)];
      if (match) select(match);
    }
  };
  const expanded = open && query.trim().length > 0;
  return (
    <div className="relative min-w-56 flex-1 lg:max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
      <input
        type="search"
        role="combobox"
        aria-label="Search traceability graph nodes"
        aria-controls={listId}
        aria-expanded={expanded}
        aria-activedescendant={
          expanded && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined
        }
        value={query}
        placeholder="Jump to requirement, component, or test…"
        className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {expanded ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Matching nodes"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {matches.length ? (
            matches.map((node, indexValue) => (
              <button
                id={`${listId}-${indexValue}`}
                key={node.id}
                type="button"
                role="option"
                aria-selected={indexValue === activeIndex}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[10px]",
                  indexValue === activeIndex && "bg-muted",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(node);
                }}
                onMouseEnter={() => setActiveIndex(indexValue)}
              >
                <NodeDot kind={node.kind} />
                <span className="font-mono">{traceabilityNodeDisplayId(node)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{node.label}</span>
              </button>
            ))
          ) : (
            <p className="px-2 py-4 text-center text-[10px] text-muted-foreground">
              No matching nodes
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
function GraphLegend({ nodes }: { readonly nodes: readonly TraceabilityNodeView[] }) {
  const kinds = [...new Set(nodes.map((node) => node.kind))].sort();
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Traceability graph color key">
      {kinds.map((kind) => (
        <span
          key={kind}
          className="inline-flex items-center gap-1 text-[9px] text-muted-foreground"
        >
          <NodeDot kind={kind} />
          {traceabilityNodeKindLabel(kind)}
        </span>
      ))}
    </div>
  );
}
function TelescopeTrail({
  index,
  roots,
  path,
  onJump,
}: {
  readonly index: TraceabilityIndex;
  readonly roots: TraceabilityRoots;
  readonly path: readonly string[];
  readonly onJump: (index: number) => void;
}) {
  return (
    <nav
      aria-label="Drill-down path"
      className="flex items-center gap-1 overflow-x-auto border-b px-4 py-2"
    >
      <button
        type="button"
        disabled={path.length === 0}
        className="shrink-0 rounded-md border bg-muted/30 px-2 py-1 text-[9px] font-semibold disabled:opacity-100"
        onClick={() => onJump(-1)}
      >
        {roots.label}
      </button>
      {path.map((id, indexValue) => {
        const node = index.nodeById.get(id);
        if (!node) return null;
        const current = indexValue === path.length - 1;
        return (
          <span key={id} className="flex shrink-0 items-center gap-1">
            <ChevronLeft className="size-3 rotate-180 text-muted-foreground" />
            <button
              type="button"
              disabled={current}
              className="max-w-52 truncate rounded-md border bg-background px-2 py-1 text-[9px] disabled:border-primary/30 disabled:bg-primary/5 disabled:opacity-100"
              onClick={() => onJump(indexValue)}
            >
              {traceabilityNodeDisplayId(node)}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
function FocusedNodeCard({
  node,
  index,
  authoredFlow,
  trailIds,
  onFocusUpstream,
}: {
  readonly node: TraceabilityNodeView;
  readonly index: TraceabilityIndex;
  readonly authoredFlow: QaAuthoredFlow | null;
  readonly trailIds: ReadonlySet<string>;
  readonly onFocusUpstream: (nodeId: string) => void;
}) {
  const parents = traceabilityParents(index, node.id);
  const downstreamCount = traceabilityReach(index, node.id);
  const displayId = traceabilityNodeDisplayId(node);
  return (
    <article
      aria-label={`Focused node ${displayId}`}
      className="self-center rounded-xl border-l-4 bg-background p-4 shadow-sm"
      style={{
        borderLeftColor: NODE_COLORS[node.kind] ?? "#94a3b8",
      }}
    >
      <p className="font-mono text-[10px] font-semibold">{displayId}</p>
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {traceabilityNodeKindLabel(node.kind)}
      </p>
      {node.label !== displayId ? <p className="mt-3 text-xs leading-5">{node.label}</p> : null}
      {authoredFlow ? <SystemFlowDetails flow={authoredFlow} /> : null}
      <p className="mt-3 text-[10px] text-muted-foreground">
        {parents.length} upstream · {downstreamCount} downstream
      </p>
      {parents.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {parents.slice(0, 4).map((parent) => (
            <button
              key={parent.edge.id}
              type="button"
              className={cn(
                "rounded-full border px-2 py-1 text-[9px]",
                trailIds.has(parent.node.id) && "border-primary/40 bg-primary/5",
              )}
              title={`${traceabilityEdgeLabel(parent.edge.kind)} from ${parent.node.label}`}
              onClick={() => onFocusUpstream(parent.node.id)}
            >
              ↖ {traceabilityNodeDisplayId(parent.node)}
            </button>
          ))}
          {parents.length > 4 ? (
            <span className="px-1 py-1 text-[9px] text-muted-foreground">
              +{parents.length - 4} more in all edges
            </span>
          ) : null}
        </div>
      ) : null}
      <AllEdges node={node} index={index} />
    </article>
  );
}
function SystemFlowDetails({ flow }: { readonly flow: QaAuthoredFlow }) {
  return (
    <section aria-label={`System flow details ${flow.externalId}`} className="mt-4 border-t pt-3">
      <div className="grid gap-3 text-[10px]">
        <FlowDetail label="Actor / system" value={flow.actor} />
        <FlowDetail label="Trigger" value={flow.trigger} />
        <FlowDetail label="Flow narrative" value={flow.narrative} />
        <FlowDetail label="Observable outcome" value={flow.outcome} />
      </div>
      {flow.legs.length > 0 ? (
        <div className="mt-4">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Component path
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {flow.legs.map((leg, indexValue) => (
              <span key={`${leg.position}:${leg.mention}`} className="contents">
                {indexValue > 0 ? <span className="text-muted-foreground">→</span> : null}
                <span className="rounded-md border bg-muted/20 px-2 py-1">
                  <span className="font-medium">{leg.componentName ?? leg.mention}</span>
                  <span className="ml-1 text-[8px] uppercase text-muted-foreground">
                    {leg.role}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {flow.requirementExternalIds.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Requirements realized ({flow.requirementExternalIds.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-1">
            {flow.requirementExternalIds.map((requirementId) => (
              <span
                key={requirementId}
                className="rounded-full border bg-primary/5 px-2 py-1 font-mono text-[8px]"
              >
                {requirementId}
              </span>
            ))}
          </div>
        </details>
      ) : null}
      <p className="mt-3 text-[8px] uppercase tracking-wide text-muted-foreground">
        Read-only authored HLD flow · {flow.reviewStatus.replaceAll("_", " ")}
      </p>
    </section>
  );
}
function FlowDetail({ label, value }: { readonly label: string; readonly value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 leading-4">{value}</p>
    </div>
  );
}
function ReleaseRootCard({
  index,
  roots,
}: {
  readonly index: TraceabilityIndex;
  readonly roots: TraceabilityRoots;
}) {
  return (
    <article aria-label="Release overview" className="self-center rounded-xl border p-4 shadow-sm">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        Release baseline
      </p>
      <p className="mt-2 font-mono text-[10px]">
        {index.nodeById.size} nodes · {index.edges.length} edges
      </p>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {roots.documents.length} {roots.label === "BRD" ? "business requirements" : "source"}{" "}
        document
        {roots.documents.length === 1 ? "" : "s"}. Telescope downstream through requirements,
        design, components, data, and tests.
      </p>
    </article>
  );
}
function ChildFan({
  focusId,
  groups,
  trailIds,
  onDrill,
}: {
  readonly focusId: string | null;
  readonly groups: readonly TraceabilityChildGroup[];
  readonly trailIds: ReadonlySet<string>;
  readonly onDrill: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState<{
    readonly focus: string;
    readonly groups: Set<string>;
  }>({
    focus: "",
    groups: new Set(),
  });
  const focusKey = focusId ?? "root";
  const expandedGroups = expanded.focus === focusKey ? expanded.groups : new Set<string>();
  if (groups.length === 0) {
    return (
      <div className="self-center rounded-xl border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">
        This node has no downstream traceability edges.
      </div>
    );
  }
  return (
    <div className="relative self-center border-l border-primary/20 pl-5">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.kind);
        const children = isExpanded ? group.children : group.children.slice(0, VISIBLE_CHILDREN);
        const hidden = group.children.length - children.length;
        return (
          <section key={group.kind} className="mb-4 last:mb-0">
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              {traceabilityEdgeLabel(group.kind)} · {group.children.length}
            </p>
            <div className="grid gap-2">
              {children.map((child) => (
                <button
                  key={child.edge.id}
                  type="button"
                  className={cn(
                    "relative rounded-lg border bg-background px-3 py-2 text-left shadow-xs transition-colors before:absolute before:-left-5 before:top-1/2 before:h-px before:w-5 before:bg-primary/20 hover:border-primary/40 hover:bg-muted/20",
                    trailIds.has(child.node.id) && "border-primary/40 bg-primary/5",
                  )}
                  onClick={() => onDrill(child.node.id)}
                >
                  <span className="flex items-center gap-2">
                    <NodeDot kind={child.node.kind} />
                    <span className="font-mono text-[10px] font-medium">
                      {traceabilityNodeDisplayId(child.node)}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground">
                    <span>{traceabilityNodeKindLabel(child.node.kind)}</span>
                    <span className="ml-auto">{child.directChildren} downstream</span>
                  </span>
                </button>
              ))}
              {hidden > 0 || isExpanded ? (
                <button
                  type="button"
                  className="rounded-md border border-dashed px-2 py-1.5 text-[9px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const next = new Set(expandedGroups);
                    if (isExpanded) next.delete(group.kind);
                    else next.add(group.kind);
                    setExpanded({
                      focus: focusKey,
                      groups: next,
                    });
                  }}
                >
                  {isExpanded ? "Show less" : `+ ${hidden} more…`}
                </button>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
function AllEdges({
  node,
  index,
}: {
  readonly node: TraceabilityNodeView;
  readonly index: TraceabilityIndex;
}) {
  const { outgoing, incoming } = traceabilityIncidentEdges(index, node.id);
  if (outgoing.length === 0 && incoming.length === 0) return null;
  return (
    <details className="mt-3 border-t pt-2 text-[9px]">
      <summary className="cursor-pointer font-medium uppercase tracking-wide text-muted-foreground">
        All edges ({outgoing.length + incoming.length})
      </summary>
      <EdgeList title="Outgoing" edges={outgoing} peer="to" index={index} />
      <EdgeList title="Incoming" edges={incoming} peer="from" index={index} />
    </details>
  );
}
function EdgeList({
  title,
  edges,
  peer,
  index,
}: {
  readonly title: string;
  readonly edges: readonly TraceabilityEdgeView[];
  readonly peer: "from" | "to";
  readonly index: TraceabilityIndex;
}) {
  if (edges.length === 0) return null;
  return (
    <div className="mt-2 grid gap-1">
      <p className="font-semibold text-muted-foreground">
        {title} ({edges.length})
      </p>
      {edges.map((edge) => {
        const node = index.nodeById.get(peer === "to" ? edge.toNodeId : edge.fromNodeId);
        return (
          <div key={edge.id} className="flex gap-2 rounded bg-muted/30 px-2 py-1">
            <span className="font-mono">{edge.kind.toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate">
              {node ? traceabilityNodeDisplayId(node) : "Unknown node"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
function EvidenceStrip({
  stats,
  scoped,
}: {
  readonly stats: ReturnType<typeof traceabilityEvidence>;
  readonly scoped: boolean;
}) {
  const stages = [
    ["Documents", stats.documents],
    ["Requirements", stats.requirements],
    ["Design", stats.design],
    ["Tests", stats.tests],
  ] as const;
  return (
    <div
      aria-label="Evidence chain summary"
      className="flex flex-wrap items-center gap-2 border-t bg-muted/10 px-4 py-3 text-[9px]"
    >
      {stages.map(([label, value], index) => (
        <span key={label} className="inline-flex items-center gap-1">
          {index > 0 ? <span className="text-muted-foreground">→</span> : null}
          {label} <strong>{value}</strong>
        </span>
      ))}
      <span className="ml-auto text-muted-foreground">
        {stats.coveragePercent === null
          ? `No requirements${scoped ? " in focus" : ""}`
          : `${stats.coveragePercent}% requirements test-linked${scoped ? " in focus" : ""}`}
      </span>
    </div>
  );
}
function NodeDot({ kind }: { readonly kind: string }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={
        {
          backgroundColor: NODE_COLORS[kind] ?? "#94a3b8",
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}
function rootGroups(
  index: TraceabilityIndex,
  roots: TraceabilityRoots,
): readonly TraceabilityChildGroup[] {
  const child = (node: TraceabilityNodeView, kind: string): TraceabilityChild => ({
    node,
    directChildren: index.outgoingByNodeId.get(node.id)?.length ?? 0,
    edge: {
      id: `root:${node.id}`,
      fromNodeId: "root",
      toNodeId: node.id,
      kind,
      provenance: "deterministic",
      reviewStatus: "approved",
      citation: null,
    },
  });
  return [
    ...(roots.documents.length
      ? [
          {
            kind: roots.label,
            children: roots.documents.map((node) => child(node, roots.label)),
          },
        ]
      : []),
    ...(roots.unlinked.length
      ? [
          {
            kind: "unlinked",
            children: roots.unlinked.map((node) => child(node, "unlinked")),
          },
        ]
      : []),
  ];
}
