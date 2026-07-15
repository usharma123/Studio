import * as NodeCrypto from "node:crypto";

import type { QaReviewAiCitation, QaSourceCitation } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/unstable/sql/SqlClient";

export type QaReviewArtifactKind = "strategy" | "scenario_plan";

export interface QaSourceChainFingerprint {
  readonly artifactRevision: number;
  readonly sourceChainHash: string;
}

export interface QaGroundedDocumentSection {
  readonly section: string;
  readonly text: string;
}

export interface QaGroundedDocument {
  readonly id: string;
  readonly fileName: string;
  readonly kind: string;
  readonly version: string;
  readonly sha256: string;
  readonly sections: ReadonlyArray<QaGroundedDocumentSection>;
}

export interface QaGroundedRequirement {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly description: string;
  readonly sourceCitation: QaSourceCitation | null;
}

export interface QaGroundedStrategySection {
  readonly id: string;
  readonly title: string;
  readonly content: string;
}

export interface QaGroundedScenario {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly type: string;
  readonly priority: string;
  readonly risk: string;
  readonly expectedOutcome: string;
}

export interface QaGroundedSourcePacket extends QaSourceChainFingerprint {
  readonly threadId: string;
  readonly artifactKind: QaReviewArtifactKind;
  readonly artifactId: string;
  readonly documents: ReadonlyArray<QaGroundedDocument>;
  readonly approvedRequirements: ReadonlyArray<QaGroundedRequirement>;
  readonly strategySections: ReadonlyArray<QaGroundedStrategySection>;
  readonly scenarios: ReadonlyArray<QaGroundedScenario>;
}

type ArtifactRow = {
  readonly id: string;
  readonly revision: number;
};

type DocumentFingerprintRow = {
  readonly id: string;
  readonly fileName: string;
  readonly kind: string;
  readonly version: string;
  readonly sha256: string;
  readonly status: string;
};

type RequirementFingerprintRow = {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly description: string;
  readonly sourceDocumentId: string | null;
  readonly sourceCitation: string | null;
  readonly updatedAt: string;
};

type StrategySectionFingerprintRow = {
  readonly id: string;
  readonly title: string;
  readonly orderIndex: number;
  readonly content: string;
  readonly updatedAt: string;
};

type ScenarioFingerprintRow = {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
  readonly type: string;
  readonly priority: string;
  readonly risk: string;
  readonly expectedOutcome: string;
  readonly updatedAt: string;
};

type DocumentChunkRow = {
  readonly documentId: string;
  readonly sectionPath: string | null;
  readonly textContent: string;
  readonly chunkIndex: number;
};

export class QaSourceChainNotFound extends Schema.TaggedErrorClass<QaSourceChainNotFound>()(
  "QaSourceChainNotFound",
  {
    artifactKind: Schema.Literals(["strategy", "scenario_plan"]),
    threadId: Schema.String,
  },
) {}

const encodeUnknownJson = Schema.encodeUnknownSync(Schema.UnknownFromJsonString);
const decodeUnknownJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);
const canonicalJson = (value: unknown): string => encodeUnknownJson(value);

/**
 * Fingerprints the complete approved source chain used to judge an artifact.
 * Ordering is explicit so SQLite and PostgreSQL produce the same digest.
 */
export const computeQaSourceChain = Effect.fn("QaSourceChain.compute")(function* (
  sql: SqlClient.SqlClient,
  input: {
    readonly threadId: string;
    readonly artifactKind: QaReviewArtifactKind;
  },
) {
  const artifacts =
    input.artifactKind === "strategy"
      ? yield* sql<ArtifactRow>`
          SELECT id, revision
          FROM qa_strategies
          WHERE thread_id = ${input.threadId}
        `
      : yield* sql<ArtifactRow>`
          SELECT id, revision
          FROM qa_scenario_plans
          WHERE thread_id = ${input.threadId}
        `;
  const artifact = artifacts[0];
  if (!artifact) {
    return yield* new QaSourceChainNotFound({
      artifactKind: input.artifactKind,
      threadId: input.threadId,
    });
  }

  const documents = yield* sql<DocumentFingerprintRow>`
    SELECT
      id,
      file_name AS "fileName",
      kind,
      version,
      sha256,
      status
    FROM qa_documents
    WHERE thread_id = ${input.threadId}
    ORDER BY id
  `;
  const requirements = yield* sql<RequirementFingerprintRow>`
    SELECT
      id,
      external_id AS "externalId",
      title,
      description,
      source_document_id AS "sourceDocumentId",
      source_citation AS "sourceCitation",
      updated_at AS "updatedAt"
    FROM qa_requirements
    WHERE thread_id = ${input.threadId} AND status = 'approved'
    ORDER BY external_id, id
  `;
  const strategySections = yield* sql<StrategySectionFingerprintRow>`
    SELECT
      id,
      title,
      order_index AS "orderIndex",
      content,
      updated_at AS "updatedAt"
    FROM qa_strategy_sections
    WHERE thread_id = ${input.threadId}
    ORDER BY order_index, id
  `;
  const scenarios =
    input.artifactKind === "scenario_plan"
      ? yield* sql<ScenarioFingerprintRow>`
          SELECT
            id,
            external_id AS "externalId",
            title,
            type,
            priority,
            risk,
            expected_outcome AS "expectedOutcome",
            updated_at AS "updatedAt"
          FROM qa_scenarios
          WHERE thread_id = ${input.threadId}
          ORDER BY external_id, id
        `
      : [];

  const sourceChainHash = NodeCrypto.createHash("sha256")
    .update(
      canonicalJson({
        artifactKind: input.artifactKind,
        artifactId: artifact.id,
        artifactRevision: artifact.revision,
        documents,
        requirements,
        strategySections,
        scenarios,
      }),
    )
    .digest("hex");

  return {
    artifactRevision: artifact.revision,
    sourceChainHash,
  } satisfies QaSourceChainFingerprint;
});

function parseStoredCitation(value: string | null): QaSourceCitation | null {
  if (value === null) return null;
  try {
    const parsed = decodeUnknownJson(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { documentId?: unknown }).documentId !== "string" ||
      typeof (parsed as { section?: unknown }).section !== "string" ||
      typeof (parsed as { excerpt?: unknown }).excerpt !== "string"
    ) {
      return null;
    }
    return parsed as QaSourceCitation;
  } catch {
    return null;
  }
}

export const loadQaGroundedSourcePacket = Effect.fn("QaSourceChain.loadGroundedPacket")(function* (
  sql: SqlClient.SqlClient,
  input: {
    readonly threadId: string;
    readonly artifactKind: QaReviewArtifactKind;
  },
) {
  const fingerprint = yield* computeQaSourceChain(sql, input);
  const artifactRows =
    input.artifactKind === "strategy"
      ? yield* sql<ArtifactRow>`SELECT id, revision FROM qa_strategies WHERE thread_id = ${input.threadId}`
      : yield* sql<ArtifactRow>`SELECT id, revision FROM qa_scenario_plans WHERE thread_id = ${input.threadId}`;
  const artifact = artifactRows[0];
  if (!artifact) {
    return yield* new QaSourceChainNotFound({
      artifactKind: input.artifactKind,
      threadId: input.threadId,
    });
  }

  const documentRows = yield* sql<DocumentFingerprintRow>`
      SELECT id, file_name AS "fileName", kind, version, sha256, status
      FROM qa_documents
      WHERE thread_id = ${input.threadId}
      ORDER BY id
    `;
  const chunkRows = yield* sql<DocumentChunkRow>`
      SELECT
        document_id AS "documentId",
        section_path AS "sectionPath",
        text_content AS "textContent",
        chunk_index AS "chunkIndex"
      FROM qa_document_chunks
      WHERE thread_id = ${input.threadId}
      ORDER BY document_id, chunk_index
    `;
  const requirementRows = yield* sql<RequirementFingerprintRow>`
      SELECT
        id, external_id AS "externalId", title, description,
        source_document_id AS "sourceDocumentId", source_citation AS "sourceCitation",
        updated_at AS "updatedAt"
      FROM qa_requirements
      WHERE thread_id = ${input.threadId} AND status = 'approved'
      ORDER BY external_id, id
    `;
  const sectionRows = yield* sql<StrategySectionFingerprintRow>`
      SELECT id, title, order_index AS "orderIndex", content, updated_at AS "updatedAt"
      FROM qa_strategy_sections
      WHERE thread_id = ${input.threadId}
      ORDER BY order_index, id
    `;
  const scenarioRows =
    input.artifactKind === "scenario_plan"
      ? yield* sql<ScenarioFingerprintRow>`
            SELECT
              id, external_id AS "externalId", title, type, priority, risk,
              expected_outcome AS "expectedOutcome", updated_at AS "updatedAt"
            FROM qa_scenarios
            WHERE thread_id = ${input.threadId}
            ORDER BY external_id, id
          `
      : [];

  return {
    threadId: input.threadId,
    artifactKind: input.artifactKind,
    artifactId: artifact.id,
    ...fingerprint,
    documents: documentRows.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      kind: document.kind,
      version: document.version,
      sha256: document.sha256,
      sections: chunkRows
        .filter((chunk) => chunk.documentId === document.id)
        .map((chunk) => ({
          section: chunk.sectionPath ?? `chunk ${chunk.chunkIndex + 1}`,
          text: chunk.textContent,
        })),
    })),
    approvedRequirements: requirementRows.map((requirement) => ({
      id: requirement.id,
      externalId: requirement.externalId,
      title: requirement.title,
      description: requirement.description,
      sourceCitation: parseStoredCitation(requirement.sourceCitation),
    })),
    strategySections: sectionRows.map((section) => ({
      id: section.id,
      title: section.title,
      content: section.content,
    })),
    scenarios: scenarioRows.map((scenario) => ({
      id: scenario.id,
      externalId: scenario.externalId,
      title: scenario.title,
      type: scenario.type,
      priority: scenario.priority,
      risk: scenario.risk,
      expectedOutcome: scenario.expectedOutcome,
    })),
  } satisfies QaGroundedSourcePacket;
});

const normalizeEvidence = (value: string) =>
  value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");

export interface QaCitationValidationResult {
  readonly valid: ReadonlyArray<QaReviewAiCitation>;
  readonly invalid: ReadonlyArray<{
    readonly citation: QaReviewAiCitation;
    readonly reason: string;
  }>;
}

/** Validates that every quoted excerpt exists in the referenced stored document. */
export function validateQaReviewCitations(
  packet: QaGroundedSourcePacket,
  citations: ReadonlyArray<QaReviewAiCitation>,
): QaCitationValidationResult {
  const valid: QaReviewAiCitation[] = [];
  const invalid: Array<{ citation: QaReviewAiCitation; reason: string }> = [];
  for (const citation of citations) {
    const document = packet.documents.find(
      (candidate) => candidate.id === citation.citation.documentId,
    );
    if (!document) {
      invalid.push({ citation, reason: "Referenced document is not in the source chain." });
      continue;
    }
    if (
      citation.citation.documentName !== undefined &&
      citation.citation.documentName !== document.fileName
    ) {
      invalid.push({
        citation,
        reason: "Referenced document name does not match stored evidence.",
      });
      continue;
    }
    const citedSection = normalizeEvidence(citation.citation.section);
    const section = document.sections.find(
      (candidate) => normalizeEvidence(candidate.section) === citedSection,
    );
    if (!section) {
      invalid.push({ citation, reason: "Cited section does not match stored evidence." });
      continue;
    }
    const excerpt = normalizeEvidence(citation.citation.excerpt);
    const isQuoted = normalizeEvidence(section.text).includes(excerpt);
    if (!isQuoted) {
      invalid.push({
        citation,
        reason: "Quoted excerpt was not found in the referenced document.",
      });
      continue;
    }
    valid.push(citation);
  }
  return { valid, invalid };
}
