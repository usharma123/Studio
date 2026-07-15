import type { QaReleaseSnapshot, QaRequirement } from "@t3tools/contracts";

export interface RequirementCitationView {
  readonly documentId: string;
  readonly documentName?: string;
  readonly documentType?: string;
  readonly section: string;
  readonly location?: string;
  readonly excerpt: string;
}

export interface RequirementWorkbookRow {
  readonly id: string;
  readonly requirement: QaRequirement;
  readonly linkedFunctionalRequirementIds: readonly string[];
}

export interface TraceabilityNodeView {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly externalId: string | null;
  readonly sourceDocumentId: string | null;
  readonly detail: string | null;
}

export interface TraceabilityEdgeView {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: string;
  readonly provenance: string;
  readonly reviewStatus: string;
  readonly citation: RequirementCitationView | null;
}

type RichRequirement = QaRequirement & {
  readonly externalId?: string;
  readonly requirementType?: string;
  readonly reviewRequired?: boolean;
  readonly parentRequirementIds?: readonly string[];
  readonly sourceCitations?: readonly RequirementCitationView[];
  readonly sourceDocumentName?: string;
  readonly confidence?: number;
  readonly tags?: readonly string[];
  readonly extractionMethod?: string;
};

export function requirementExternalId(requirement: QaRequirement): string {
  return (requirement as RichRequirement).externalId?.trim() || requirement.id;
}

export function requirementType(requirement: QaRequirement): string {
  return (requirement as RichRequirement).requirementType?.trim().toUpperCase() || "REQUIREMENT";
}

export function requirementReviewRequired(requirement: QaRequirement): boolean {
  return (requirement as RichRequirement).reviewRequired ?? false;
}

export function requirementParentIds(requirement: QaRequirement): readonly string[] {
  return (requirement as RichRequirement).parentRequirementIds ?? [];
}

export function requirementCitations(
  requirement: QaRequirement,
): readonly RequirementCitationView[] {
  return (requirement as RichRequirement).sourceCitations ?? [];
}

export function requirementTags(requirement: QaRequirement): readonly string[] {
  return (requirement as RichRequirement).tags ?? [];
}

export function requirementConfidence(requirement: QaRequirement): number | null {
  const value = (requirement as RichRequirement).confidence;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isBusinessRequirement(requirement: QaRequirement): boolean {
  return ["BR", "BRD", "BUSINESS"].includes(requirementType(requirement));
}

function isFunctionalRequirement(requirement: QaRequirement): boolean {
  return ["FR", "FRS", "FUNCTIONAL"].includes(requirementType(requirement));
}

export function businessRequirements(
  requirements: readonly QaRequirement[],
): readonly QaRequirement[] {
  return requirements.filter(isBusinessRequirement);
}

export function buildRequirementWorkbookRows(
  requirements: readonly QaRequirement[],
): readonly RequirementWorkbookRow[] {
  const functionalByParent = new Map<string, string[]>();
  for (const requirement of requirements) {
    if (!isFunctionalRequirement(requirement)) continue;
    for (const parentId of requirementParentIds(requirement)) {
      const ids = functionalByParent.get(parentId) ?? [];
      const externalId = requirementExternalId(requirement);
      if (!ids.includes(externalId)) ids.push(externalId);
      functionalByParent.set(parentId, ids);
    }
  }

  return businessRequirements(requirements).map((requirement) => {
    const linkedFunctionalRequirementIds = [
      ...(functionalByParent.get(requirement.id) ?? []),
      ...(functionalByParent.get(requirementExternalId(requirement)) ?? []),
    ].filter((id, index, ids) => ids.indexOf(id) === index);
    return {
      id: requirement.id,
      requirement,
      linkedFunctionalRequirementIds,
    };
  });
}

export function traceabilityView(snapshot: QaReleaseSnapshot): {
  readonly nodes: readonly TraceabilityNodeView[];
  readonly edges: readonly TraceabilityEdgeView[];
} {
  const rich = snapshot as QaReleaseSnapshot & {
    readonly traceabilityNodes?: ReadonlyArray<Record<string, unknown>>;
    readonly traceabilityEdges?: ReadonlyArray<Record<string, unknown>>;
  };
  const nodes = (rich.traceabilityNodes ?? []).flatMap<TraceabilityNodeView>((node) => {
    if (typeof node.id !== "string") return [];
    const detail =
      typeof node.externalId === "string"
        ? node.externalId
        : typeof node.sourceDocumentId === "string"
          ? node.sourceDocumentId
          : null;
    return [
      {
        id: node.id,
        kind: typeof node.kind === "string" ? node.kind : "unknown",
        label: typeof node.label === "string" ? node.label : node.id,
        externalId: typeof node.externalId === "string" ? node.externalId : null,
        sourceDocumentId: typeof node.sourceDocumentId === "string" ? node.sourceDocumentId : null,
        detail,
      },
    ];
  });
  const edges = (rich.traceabilityEdges ?? []).flatMap<TraceabilityEdgeView>((edge) => {
    const fromNodeId = typeof edge.fromNodeId === "string" ? edge.fromNodeId : null;
    const toNodeId = typeof edge.toNodeId === "string" ? edge.toNodeId : null;
    if (
      typeof edge.id !== "string" ||
      typeof fromNodeId !== "string" ||
      typeof toNodeId !== "string"
    )
      return [];
    const citation =
      edge.citation &&
      typeof edge.citation === "object" &&
      typeof (edge.citation as Record<string, unknown>).documentId === "string" &&
      typeof (edge.citation as Record<string, unknown>).section === "string" &&
      typeof (edge.citation as Record<string, unknown>).excerpt === "string"
        ? (edge.citation as unknown as RequirementCitationView)
        : null;
    return [
      {
        id: edge.id,
        fromNodeId,
        toNodeId,
        kind: typeof edge.kind === "string" ? edge.kind : "related",
        provenance: typeof edge.provenance === "string" ? edge.provenance : "unknown",
        reviewStatus: typeof edge.reviewStatus === "string" ? edge.reviewStatus : "pending",
        citation,
      },
    ];
  });
  return { nodes, edges };
}
