import type { QaDocument } from "@t3tools/contracts";

export const QA_DOCUMENT_KINDS = ["BRD", "FRS", "HLD", "LLD"] as const;
export type QaDocumentKind = (typeof QA_DOCUMENT_KINDS)[number];

export interface QaDocumentKindStatus {
  readonly kind: QaDocumentKind;
  readonly status: "classified" | "suggested" | "missing";
  readonly documents: readonly QaDocument[];
}

function isDocumentKind(value: unknown): value is QaDocumentKind {
  return (
    typeof value === "string" &&
    (QA_DOCUMENT_KINDS as readonly string[]).includes(value.toUpperCase())
  );
}

export function persistedDocumentKind(document: QaDocument): QaDocumentKind | null {
  const kind = (document as QaDocument & { readonly kind?: unknown }).kind;
  return isDocumentKind(kind) ? (kind.toUpperCase() as QaDocumentKind) : null;
}

export function suggestedDocumentKind(document: QaDocument): QaDocumentKind | null {
  const normalized = document.fileName.toUpperCase().replace(/[^A-Z0-9]+/gu, " ");
  return (
    QA_DOCUMENT_KINDS.find((kind) => new RegExp(`(^| )${kind}( |$)`, "u").test(normalized)) ?? null
  );
}

export function documentVersion(document: QaDocument): string | null {
  const version = (document as QaDocument & { readonly version?: unknown }).version;
  return typeof version === "string" && version.trim() ? version.trim() : null;
}

export function documentKindChecklist(
  documents: readonly QaDocument[],
): readonly QaDocumentKindStatus[] {
  return QA_DOCUMENT_KINDS.map((kind) => {
    const classified = documents.filter((document) => persistedDocumentKind(document) === kind);
    if (classified.length) return { kind, status: "classified" as const, documents: classified };
    const suggested = documents.filter((document) => suggestedDocumentKind(document) === kind);
    return {
      kind,
      status: suggested.length ? ("suggested" as const) : ("missing" as const),
      documents: suggested,
    };
  });
}
