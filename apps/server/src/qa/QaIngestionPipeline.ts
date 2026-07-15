import * as NodeCrypto from "node:crypto";

import mammoth from "mammoth";

import {
  extractQaDesignGraph,
  type QaPipelineAuthoredFlow,
  type QaPipelineDesignEdge,
  type QaPipelineDesignNode,
} from "./QaTraceabilityExtraction.ts";

export interface QaPipelineDocumentInput {
  readonly id: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface QaSourceSection {
  readonly documentType: string;
  readonly sectionRef: string;
  readonly path: string;
  readonly excerpt: string;
}

export interface QaPipelineRequirement {
  readonly id: string;
  readonly displayId: string;
  readonly statement: string;
  readonly description: string | null;
  readonly documentType: string;
  readonly sourceDocumentId: string;
  readonly sourceDocumentName: string;
  readonly sourceBlockIds: readonly string[];
  readonly sourceSections: readonly QaSourceSection[];
  readonly confidence: number;
  readonly parentIds: readonly string[];
  readonly downstreamIds: readonly string[];
  readonly tags: readonly string[];
  readonly extractionMethod: "deterministic_explicit_id";
}

export interface QaPipelineChunk {
  readonly id: string;
  readonly documentId: string;
  readonly index: number;
  readonly text: string;
  readonly byteLength: number;
  readonly requirementId?: string;
  readonly sourceBlockIds: readonly string[];
  readonly sectionPath?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface QaPipelineResult {
  readonly documents: readonly ParsedDocument[];
  readonly requirements: readonly QaPipelineRequirement[];
  readonly chunks: readonly QaPipelineChunk[];
  readonly designNodes: readonly QaPipelineDesignNode[];
  readonly designEdges: readonly QaPipelineDesignEdge[];
  readonly authoredFlows: readonly QaPipelineAuthoredFlow[];
}

export type BlockType = "heading" | "paragraph" | "table_row";

export interface ParsedBlock {
  readonly id: string;
  readonly ordinal: number;
  readonly type: BlockType;
  readonly text: string;
  readonly sectionPath: string;
  readonly citation: string;
}

export interface ParsedDocument {
  readonly documentId: string;
  readonly fileName: string;
  readonly documentType: string;
  readonly sha256: string;
  readonly blocks: readonly ParsedBlock[];
}

const REQUIREMENT_ID_PATTERN =
  /\b(?:REQ(?:-[A-Z0-9]+)+|BR-\d+|BR-PKG-\d+|BRD-[A-Z0-9-]+|FRS-[A-Z0-9-]+|HLD-[A-Z0-9-]+|LLD-[A-Z0-9-]+|CTRL-[A-Z0-9-]+|DATA(?:SET)?-[A-Z0-9-]+|SCN-[A-Z0-9-]+|DEV-\d+|BEP-[A-Z0-9-]+|ADR-[A-Z0-9-]+|RR-\d+)(?:[._-][A-Z0-9]+)*\b/gi;
const CANONICAL_ID_PATTERN = /^(?:BR-\d+|REQ-(?:FR|SEC|NFR)-\d+)$/;
const STRONG_REQUIREMENT_VERB =
  /\b(?:shall|must|required|requires|able to|can ?not|may not|prevents?|restricted(?: to)?|enforces?)\b/i;

export async function runQaIngestionPipeline(
  documents: readonly QaPipelineDocumentInput[],
): Promise<QaPipelineResult> {
  const parsed = await Promise.all(documents.map(parseDocument));
  const requirements = extractRequirements(parsed);
  const designGraph = extractQaDesignGraph(parsed);
  return {
    documents: parsed,
    requirements,
    chunks: [...buildSourceChunks(parsed), ...buildRequirementChunks(requirements, parsed)],
    designNodes: designGraph.nodes,
    designEdges: designGraph.edges,
    authoredFlows: designGraph.authoredFlows,
  };
}

async function parseDocument(input: QaPipelineDocumentInput): Promise<ParsedDocument> {
  const buffer = Buffer.from(input.bytes);
  const result = await mammoth.convertToHtml({ buffer });
  const text = normalizeWhitespace(htmlToStructuredText(result.value));
  const documentType = inferDocumentType(input.fileName, text);
  const parts = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}|\n(?=\s*(?:[A-Z]{2,}-[A-Z0-9-]+|BR-\d+|REQ-[A-Z0-9-]+|FRS-[A-Z0-9-]+)\b)/)
    .map((part) => part.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const blocks: ParsedBlock[] = [];
  let currentSection = input.fileName.replace(/\.[^.]+$/, "");
  for (const part of parts) {
    const type = classifyBlock(part);
    if (type === "heading") currentSection = part.replace(/\s+/g, " ").trim();
    const ordinal = blocks.length;
    blocks.push({
      id: `${input.id}-block-${ordinal + 1}`,
      ordinal,
      type,
      text: part,
      sectionPath: currentSection,
      citation: `${input.fileName}#block-${ordinal + 1}`,
    });
  }
  return {
    documentId: input.id,
    fileName: input.fileName,
    documentType,
    sha256: NodeCrypto.createHash("sha256").update(buffer).digest("hex"),
    blocks,
  };
}

function extractRequirements(documents: readonly ParsedDocument[]): QaPipelineRequirement[] {
  const byDisplayId = new Map<string, QaPipelineRequirement>();
  for (const document of documents) {
    if (!isRequirementDocument(document.documentType)) continue;
    for (const block of document.blocks) {
      if (isNoiseSection(block.sectionPath) || isScaffolding(block.text) || isDiagram(block.text)) {
        continue;
      }
      const ids = idsForBlock(block, document.documentType).filter((id) =>
        CANONICAL_ID_PATTERN.test(id),
      );
      for (const displayId of ids) {
        const parsedRow = block.type === "table_row" ? parseTableRow(block.text) : null;
        const statement = cleanStatement(
          parsedRow?.statement ?? requirementSentenceForId(block.text, displayId) ?? block.text,
        );
        const description = parsedRow?.detail ? cleanStatement(parsedRow.detail) : null;
        const parentIds = parentIdsFor(displayId, block.text);
        const sourceSections = [sourceSection(document, block, statement)];
        const candidate: QaPipelineRequirement = {
          id: displayId,
          displayId,
          statement,
          description,
          documentType: document.documentType,
          sourceDocumentId: document.documentId,
          sourceDocumentName: document.fileName,
          sourceBlockIds: [block.id],
          sourceSections,
          confidence: scoreConfidence({
            displayId,
            statement,
            description,
            documentType: document.documentType,
            blockType: block.type,
            parentIds,
            sourceSections,
          }),
          parentIds,
          downstreamIds: [],
          tags: businessTags(document.documentType, parentIds),
          extractionMethod: "deterministic_explicit_id",
        };
        mergeRequirement(byDisplayId, candidate, block.type);
      }
    }
  }
  const requirements = [...byDisplayId.values()].sort((a, b) =>
    a.displayId.localeCompare(b.displayId, undefined, { numeric: true }),
  );
  const downstreamById = new Map(
    requirements.map((requirement) => [requirement.displayId, [] as string[]]),
  );
  for (const requirement of requirements) {
    for (const parentId of requirement.parentIds)
      downstreamById.get(parentId)?.push(requirement.displayId);
  }
  return requirements.map((requirement) => ({
    ...requirement,
    downstreamIds: downstreamById.get(requirement.displayId)?.sort() ?? [],
  }));
}

function mergeRequirement(
  target: Map<string, QaPipelineRequirement>,
  candidate: QaPipelineRequirement,
  candidateBlockType: BlockType,
): void {
  const existing = target.get(candidate.displayId);
  if (!existing) {
    target.set(candidate.displayId, candidate);
    return;
  }
  const existingIsTable =
    existing.sourceSections[0]?.path.includes("#block-") && existing.description !== null;
  const candidatePreferred = candidateBlockType === "table_row" && !existingIsTable;
  target.set(candidate.displayId, {
    ...existing,
    statement:
      candidatePreferred || candidate.statement.length > existing.statement.length
        ? candidate.statement
        : existing.statement,
    description: existing.description ?? candidate.description,
    sourceBlockIds: [...new Set([...existing.sourceBlockIds, ...candidate.sourceBlockIds])],
    sourceSections: dedupeSections([...existing.sourceSections, ...candidate.sourceSections]),
    parentIds: [...new Set([...existing.parentIds, ...candidate.parentIds])].sort(),
  });
}

function buildSourceChunks(documents: readonly ParsedDocument[]): QaPipelineChunk[] {
  return documents.flatMap((document) =>
    document.blocks
      .filter((block) => !isScaffolding(block.text))
      .map((block) => {
        const text = [
          `Document: ${document.fileName}`,
          `Document type: ${document.documentType}`,
          `Section: ${block.sectionPath}`,
          `Citation: ${block.citation}`,
          "",
          block.text,
        ].join("\n");
        return {
          id: `${document.documentId}-sourcechunk-${block.ordinal + 1}`,
          documentId: document.documentId,
          index: block.ordinal,
          text,
          byteLength: Buffer.byteLength(text),
          sourceBlockIds: [block.id],
          sectionPath: block.sectionPath,
          metadata: {
            chunkStrategy: "source_document",
            documentTitle: document.fileName,
            documentType: document.documentType,
            citation: block.citation,
            blockType: block.type,
          },
        } satisfies QaPipelineChunk;
      }),
  );
}

function buildRequirementChunks(
  requirements: readonly QaPipelineRequirement[],
  documents: readonly ParsedDocument[],
): QaPipelineChunk[] {
  const blocks = new Map(
    documents.flatMap((document) => document.blocks.map((block) => [block.id, block])),
  );
  const ordinalByDocument = new Map<string, number>();
  return requirements.map((requirement) => {
    const sourceBlocks = requirement.sourceBlockIds.flatMap((id) => {
      const block = blocks.get(id);
      return block ? [block] : [];
    });
    const index = ordinalByDocument.get(requirement.sourceDocumentId) ?? 0;
    ordinalByDocument.set(requirement.sourceDocumentId, index + 1);
    const text = [
      `Requirement: ${requirement.displayId}`,
      `Document: ${requirement.sourceDocumentName}`,
      `Section: ${sourceBlocks[0]?.sectionPath ?? "Source document"}`,
      `Statement: ${requirement.statement}`,
      sourceBlocks.length
        ? `Source context:\n${sourceBlocks.map((block) => block.text).join("\n\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return {
      id: `${requirement.sourceDocumentId}-reqchunk-${safeId(requirement.displayId)}`,
      documentId: requirement.sourceDocumentId,
      index,
      text,
      byteLength: Buffer.byteLength(text),
      requirementId: requirement.displayId,
      sourceBlockIds: requirement.sourceBlockIds,
      ...(sourceBlocks[0]?.sectionPath === undefined
        ? {}
        : { sectionPath: sourceBlocks[0].sectionPath }),
      metadata: {
        chunkStrategy: "requirement_scoped",
        displayId: requirement.displayId,
        documentTitle: requirement.sourceDocumentName,
        documentType: requirement.documentType,
        parentIds: requirement.parentIds,
        sourceSections: requirement.sourceSections,
      },
    };
  });
}

function htmlToStructuredText(html: string): string {
  const segments: string[] = [];
  const tablePattern = /<table\b[\s\S]*?<\/table>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(html))) {
    segments.push(htmlFlowToText(html.slice(lastIndex, match.index)));
    segments.push(tableHtmlToRows(match[0]));
    lastIndex = tablePattern.lastIndex;
  }
  segments.push(htmlFlowToText(html.slice(lastIndex)));
  return segments.filter(Boolean).join("\n\n");
}

function htmlFlowToText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|div|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\n{2,}/)
    .map((line) =>
      decodeEntities(line)
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

function tableHtmlToRows(html: string): string {
  const rows: string[] = [];
  for (const row of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const cells = [...row[0].matchAll(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)].map((cell) =>
      decodeEntities(cell[0].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim(),
    );
    const line = cells.filter(Boolean).join(" | ");
    if (line) rows.push(line);
  }
  return rows.join("\n");
}

function parseTableRow(text: string): { statement: string; detail: string | null } | null {
  if (!text.includes("|")) return null;
  const cells = text.split("|").map((cell, index) => ({
    text: cell
      .replace(/^[A-Za-z][A-Za-z /]*:\s*/, "")
      .replace(/\s+/g, " ")
      .trim(),
    index,
  }));
  const prose = cells.filter(
    (cell) => cell.text.replace(REQUIREMENT_ID_PATTERN, "").trim().length >= 8,
  );
  if (!prose.length) return null;
  const statement = prose.find((cell) => STRONG_REQUIREMENT_VERB.test(cell.text)) ?? prose[0]!;
  return {
    statement: statement.text,
    detail: prose.find((cell) => cell.index > statement.index)?.text ?? null,
  };
}

function idsForBlock(block: ParsedBlock, documentType: string): string[] {
  if (block.type === "table_row") {
    const firstCell = block.text.split("|", 1)[0] ?? "";
    const primary = explicitIds(firstCell);
    if (documentType === "BRD") return primary.filter((id) => /^BR-\d+$/.test(id));
    if (documentType === "FRS") return primary.filter((id) => /^REQ-(?:FR|SEC|NFR)-\d+$/.test(id));
    return [];
  }
  const ids = explicitIds(block.text);
  if (documentType === "BRD") return ids.filter((id) => /^BR-\d+$/.test(id));
  if (documentType === "FRS") return ids.filter((id) => /^REQ-(?:FR|SEC|NFR)-\d+$/.test(id));
  return [];
}

function explicitIds(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(REQUIREMENT_ID_PATTERN)].map((match) =>
        match[0]
          .replace(/\s+/g, "-")
          .replace(/(VERSION|REVISION|DRAFT|PAGE|STATUS)$/i, "")
          .toUpperCase(),
      ),
    ),
  ];
}

function requirementSentenceForId(text: string, id: string): string | null {
  const idPattern = new RegExp(`\\b${id.replace(/[-_ ]/g, "[-_ ]?")}\\b`, "i");
  return (
    text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .find((sentence) => sentence.length >= 40 && idPattern.test(sentence)) ?? null
  );
}

function parentIdsFor(displayId: string, text: string): string[] {
  if (!displayId.startsWith("REQ-")) return [];
  return explicitIds(text)
    .filter((id) => /^BR-\d+$/.test(id) && id !== displayId)
    .sort();
}

function sourceSection(
  document: ParsedDocument,
  block: ParsedBlock,
  excerpt: string,
): QaSourceSection {
  return {
    documentType: document.documentType,
    sectionRef: block.sectionPath,
    path: block.citation,
    excerpt: excerpt.slice(0, 500),
  };
}

function businessTags(documentType: string, parentIds: readonly string[]): string[] {
  return [
    `source:${documentType.toLowerCase()}`,
    `type:${documentType === "FRS" ? "functional" : "business"}`,
    "extraction:deterministic",
    parentIds.length ? "lineage:parent-linked" : "lineage:root",
  ];
}

function scoreConfidence(input: {
  displayId: string;
  statement: string;
  description: string | null;
  documentType: string;
  blockType: BlockType;
  parentIds: readonly string[];
  sourceSections: readonly QaSourceSection[];
}): number {
  let score = 0.64;
  if (CANONICAL_ID_PATTERN.test(input.displayId)) score += 0.12;
  if (input.statement.length >= 35) score += 0.07;
  if ((input.description?.length ?? 0) >= 12) score += 0.04;
  if (input.blockType === "table_row") score += 0.06;
  if (input.sourceSections.length) score += 0.04;
  if (input.parentIds.length) score += 0.03;
  return Math.min(0.98, Math.round(score * 100) / 100);
}

function classifyBlock(text: string): BlockType {
  if (text.includes("|") || /^\s*(?:Requirement ID|Business Requirement)\s*:/i.test(text))
    return "table_row";
  if (
    text.length <= 140 &&
    !/[.!?]$/.test(text) &&
    (/^\d+(?:\.\d+)*\.?\s+\S+/.test(text) || /^[A-Z][A-Z0-9 &/()_-]{6,}$/.test(text))
  )
    return "heading";
  return "paragraph";
}

function inferDocumentType(fileName: string, text: string): string {
  const name = fileName.toLowerCase();
  if (/\bbrd\b|business-requirements|01-/.test(name)) return "BRD";
  if (/\bfrs\b|functional-requirements|functional-specification|02-/.test(name)) return "FRS";
  if (/\bhld\b|high-level|03-/.test(name)) return "HLD";
  if (/\blld\b|low-level|04-/.test(name)) return "LLD";
  const start = text.slice(0, 2000).toLowerCase();
  if (/business requirement|\bbrd\b/.test(start)) return "BRD";
  if (/functional requirement|\bfrs\b/.test(start)) return "FRS";
  return "SOURCE";
}

function isRequirementDocument(documentType: string): boolean {
  return documentType === "BRD" || documentType === "FRS";
}

function isNoiseSection(section: string): boolean {
  return /(decomposition|composite|cross[- ]?reference|screen (?:control|package)|exception.*(?:register|ambiguity)|traceability matrix)/i.test(
    section,
  );
}

function isScaffolding(text: string): boolean {
  return /^\s*fixture note\s*:/i.test(text);
}

function isDiagram(text: string): boolean {
  return /-{3,}[>+]|[<+]-{3,}/.test(text);
}

function cleanStatement(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 1200);
}

function dedupeSections(sections: readonly QaSourceSection[]): QaSourceSection[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = `${section.path}:${section.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function safeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
