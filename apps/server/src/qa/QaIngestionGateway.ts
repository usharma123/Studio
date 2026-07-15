import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/unstable/http";

import { indexQaArtifacts } from "./QaHelixIndexer.ts";
import {
  runQaIngestionPipeline,
  type QaPipelineChunk,
  type QaPipelineRequirement,
} from "./QaIngestionPipeline.ts";
import type {
  QaPipelineAuthoredFlow,
  QaPipelineDesignEdge,
  QaPipelineDesignNode,
} from "./QaTraceabilityExtraction.ts";

export interface QaIngestionDocument {
  readonly id: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface QaIngestionResult {
  readonly projectId: string;
  readonly releaseId: string;
  readonly documents: ReadonlyArray<{
    readonly documentId: string;
    readonly fileName: string;
    readonly documentType: string;
    readonly sha256: string;
  }>;
  readonly requirements: readonly QaPipelineRequirement[];
  readonly chunks: readonly QaPipelineChunk[];
  readonly designNodes: readonly QaPipelineDesignNode[];
  readonly designEdges: readonly QaPipelineDesignEdge[];
  readonly authoredFlows: readonly QaPipelineAuthoredFlow[];
  readonly helix: { readonly indexed: boolean; readonly message: string };
}

export class QaIngestionGatewayError extends Schema.TaggedErrorClass<QaIngestionGatewayError>()(
  "QaIngestionGatewayError",
  { message: Schema.String, retryable: Schema.Boolean },
) {}

type QaIngestionGatewayShape = {
  readonly ingest: (input: {
    readonly projectId: string;
    readonly releaseId: string;
    readonly documents: ReadonlyArray<QaIngestionDocument>;
  }) => Effect.Effect<QaIngestionResult, QaIngestionGatewayError>;
};

export class QaIngestionGateway extends Context.Service<
  QaIngestionGateway,
  QaIngestionGatewayShape
>()("t3/qa/QaIngestionGateway") {}

export const layer = Layer.effect(
  QaIngestionGateway,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    return QaIngestionGateway.of({
      ingest: (input) =>
        Effect.gen(function* () {
          const pipeline = yield* Effect.tryPromise({
            try: async () => {
              return await runQaIngestionPipeline(input.documents);
            },
            catch: (cause) =>
              new QaIngestionGatewayError({
                message: cause instanceof Error ? cause.message : "Standalone ingestion failed.",
                retryable: true,
              }),
          });
          const helix = yield* indexQaArtifacts({
            releaseId: input.releaseId,
            chunks: pipeline.chunks,
            requirements: pipeline.requirements,
          }).pipe(
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.mapError(
              (cause) =>
                new QaIngestionGatewayError({
                  message:
                    cause instanceof Error ? cause.message : "Standalone Helix indexing failed.",
                  retryable: true,
                }),
            ),
          );
          return {
            projectId: input.projectId,
            releaseId: input.releaseId,
            documents: pipeline.documents.map((document) => ({
              documentId: document.documentId,
              fileName: document.fileName,
              documentType: document.documentType,
              sha256: document.sha256,
            })),
            requirements: pipeline.requirements,
            chunks: pipeline.chunks,
            designNodes: pipeline.designNodes,
            designEdges: pipeline.designEdges,
            authoredFlows: pipeline.authoredFlows,
            helix,
          };
        }),
    });
  }),
);

export const layerTest = Layer.succeed(
  QaIngestionGateway,
  QaIngestionGateway.of({
    ingest: (input) => {
      const documents = input.documents.map((document) => ({
        documentId: document.id,
        fileName: document.fileName,
        documentType: /high-level|hld/iu.test(document.fileName)
          ? "HLD"
          : /functional|frs/iu.test(document.fileName)
            ? "FRS"
            : "BRD",
        sha256: "test-sha256",
      }));
      const requirements = documents.flatMap((document, index) => {
        if (document.documentType !== "BRD" && document.documentType !== "FRS") return [];
        const source = input.documents.find((candidate) => candidate.id === document.documentId);
        const title = source
          ? (Buffer.from(source.bytes)
              .toString("utf8")
              .split("\n")
              .map((line) => line.replace(/^#+\s*/u, "").trim())
              .find(Boolean) ?? `Review ${document.fileName}`)
          : `Review ${document.fileName}`;
        return [
          {
            id: `${document.documentType}-${index + 1}`,
            displayId: `${document.documentType === "FRS" ? "REQ-FR" : "BR"}-${String(index + 1).padStart(3, "0")}`,
            statement: title,
            description: `Requirements extracted from ${document.fileName}.`,
            documentType: document.documentType,
            sourceDocumentId: document.documentId,
            sourceDocumentName: document.fileName,
            sourceBlockIds: [`${document.documentId}-block-1`],
            sourceSections: [
              {
                documentType: document.documentType,
                sectionRef: "Test source",
                path: `${document.fileName}#block-1`,
                excerpt: title,
              },
            ],
            confidence: 1,
            parentIds: [],
            downstreamIds: [],
            tags: [`source:${document.documentType.toLowerCase()}`],
            extractionMethod: "deterministic_explicit_id" as const,
          },
        ];
      });
      return Effect.succeed({
        projectId: input.projectId,
        releaseId: input.releaseId,
        documents,
        requirements,
        chunks: [],
        designNodes: [],
        designEdges: [],
        authoredFlows: [],
        helix: { indexed: true, message: "Test Helix index complete." },
      });
    },
  }),
);
