import * as NodeCrypto from "node:crypto";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import type { QaPipelineChunk, QaPipelineRequirement } from "./QaIngestionPipeline.ts";

type HelixProperty = [string, { Value: Record<string, unknown> }];

export interface QaHelixIndexResult {
  readonly indexed: boolean;
  readonly message: string;
}

export class QaHelixIndexError extends Schema.TaggedErrorClass<QaHelixIndexError>()(
  "QaHelixIndexError",
  { message: Schema.String },
) {}

const DEFAULT_HELIX_URL = "http://127.0.0.1:18080";
const EMBEDDING_MODEL = "t3code/lexical-feature-hash-v1";

export const indexQaArtifacts = Effect.fn("QaHelixIndexer.indexQaArtifacts")(function* (input: {
  readonly releaseId: string;
  readonly chunks: readonly QaPipelineChunk[];
  readonly requirements: readonly QaPipelineRequirement[];
}) {
  const baseUrl = process.env.T3CODE_QA_HELIX_URL ?? DEFAULT_HELIX_URL;
  const client = yield* HttpClient.HttpClient;
  yield* helixQuery(client, baseUrl, dropReleaseRequest(input.releaseId), "clear_release_graph");
  yield* helixQuery(
    client,
    baseUrl,
    createVectorIndexRequest(),
    "create_source_chunk_vector_index",
  );
  const embeddings = input.chunks.map((chunk) => lexicalEmbedding(chunk.text));
  const chunkWrites = input.chunks.map((chunk, index) => ({
    name: `seed_source_chunk_${index}`,
    label: "SourceChunk",
    properties: compactProperties([
      stringProp("id", stableId("chunk", input.releaseId, chunk.id)),
      stringProp("releaseId", input.releaseId),
      stringProp("documentId", stableId("doc", input.releaseId, chunk.documentId)),
      stringProp("sourceDocumentId", chunk.documentId),
      stringProp("sourceChunkId", chunk.id),
      stringProp("documentTitle", String(chunk.metadata.documentTitle ?? chunk.documentId)),
      stringProp("documentType", String(chunk.metadata.documentType ?? "")),
      stringProp("sectionPath", chunk.sectionPath ?? ""),
      i64Prop("ordinal", chunk.index),
      stringProp("text", chunk.text.slice(0, 8_000)),
      stringProp("embeddingModel", EMBEDDING_MODEL),
      f64ArrayProp("embedding", embeddings[index] ?? lexicalEmbedding(chunk.text)),
    ]),
  }));
  const requirementWrites = input.requirements.map((requirement, index) => ({
    name: `seed_requirement_candidate_${index}`,
    label: "RequirementCandidate",
    properties: [
      stringProp("id", stableId("requirement", input.releaseId, requirement.displayId)),
      stringProp("releaseId", input.releaseId),
      stringProp("displayId", requirement.displayId),
      stringProp("title", requirement.statement.slice(0, 120)),
      stringProp("requirementText", requirement.statement),
      stringProp("sourceDocumentId", requirement.sourceDocumentId),
      stringArrayProp("parentSourceIds", [...requirement.parentIds]),
      stringArrayProp("tags", [...requirement.tags]),
      f64Prop("confidence", requirement.confidence),
      stringProp("reviewStatus", "pending"),
      f64ArrayProp("embedding", lexicalEmbedding(requirement.statement)),
    ],
  }));
  yield* writeBatches(client, baseUrl, chunkWrites);
  yield* writeBatches(client, baseUrl, requirementWrites);
  return {
    indexed: true,
    message: `Indexed ${input.chunks.length} source chunk(s) with standalone local embeddings and ${input.requirements.length} requirement candidate(s).`,
  };
});

function helixQuery(
  client: HttpClient.HttpClient,
  baseUrl: string,
  request: unknown,
  operation: string,
) {
  return HttpClientRequest.post(`${baseUrl.replace(/\/$/, "")}/v1/query`).pipe(
    HttpClientRequest.bodyJson(request),
    Effect.flatMap(client.execute),
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.asVoid,
    Effect.mapError(
      (cause) => new QaHelixIndexError({ message: `Helix ${operation} failed: ${String(cause)}` }),
    ),
  );
}

function writeBatches(
  client: HttpClient.HttpClient,
  baseUrl: string,
  writes: readonly { name: string; label: string; properties: readonly HelixProperty[] }[],
) {
  return Effect.forEach(
    Array.from({ length: Math.ceil(writes.length / 25) }, (_, index) => index * 25),
    (offset) => {
      const batch = writes.slice(offset, offset + 25);
      return helixQuery(
        client,
        baseUrl,
        {
          request_type: "write",
          query: {
            queries: batch.map((entry) => ({
              Query: {
                name: entry.name,
                steps: [{ AddN: { label: entry.label, properties: entry.properties } }],
                condition: null,
              },
            })),
            returns: batch.map((entry) => entry.name),
          },
          parameters: {},
        },
        `write_batch_${offset}`,
      );
    },
    { concurrency: 1, discard: true },
  );
}

function dropReleaseRequest(releaseId: string): unknown {
  const labels = ["SourceChunk", "RequirementCandidate"];
  return {
    request_type: "write",
    query: {
      queries: labels.map((label) => ({
        Query: {
          name: `drop_${label.toLowerCase()}s_for_release`,
          steps: [
            {
              NWhere: {
                And: [
                  { Eq: ["$label", { String: label }] },
                  { Eq: ["releaseId", { String: releaseId }] },
                ],
              },
            },
            "Drop",
          ],
          condition: null,
        },
      })),
      returns: labels.map((label) => `drop_${label.toLowerCase()}s_for_release`),
    },
    parameters: {},
  };
}

function createVectorIndexRequest(): unknown {
  return {
    request_type: "write",
    query: {
      queries: [
        {
          Query: {
            name: "create_vector_index_sourcechunk_embedding",
            steps: [{ CreateVectorIndexNodes: { label: "SourceChunk", property: "embedding" } }],
            condition: null,
          },
        },
      ],
      returns: ["create_vector_index_sourcechunk_embedding"],
    },
    parameters: {},
  };
}

function stringProp(key: string, value: string): HelixProperty {
  return [key, { Value: { String: value } }];
}

function i64Prop(key: string, value: number): HelixProperty {
  return [key, { Value: { I64: Math.trunc(value) } }];
}

function f64Prop(key: string, value: number): HelixProperty {
  return [key, { Value: { F64: value } }];
}

function stringArrayProp(key: string, value: string[]): HelixProperty {
  return [key, { Value: { StringArray: value } }];
}

function f64ArrayProp(key: string, value: number[]): HelixProperty {
  return [key, { Value: { F64Array: value } }];
}

function compactProperties(values: readonly (HelixProperty | null)[]): HelixProperty[] {
  return values.filter((value): value is HelixProperty => value !== null);
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${NodeCrypto.createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 16)}`;
}

/** Dependency-free signed feature hashing for local lexical vector retrieval. */
function lexicalEmbedding(text: string): number[] {
  const values = Array.from({ length: 384 }, () => 0);
  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    for (const feature of [
      token,
      `${tokens[index - 1] ?? ""}:${token}`,
      `${token}:${tokens[index + 1] ?? ""}`,
    ]) {
      const digest = NodeCrypto.createHash("sha1").update(feature).digest();
      const bucket = ((digest[0] ?? 0) * 256 + (digest[1] ?? 0)) % values.length;
      values[bucket] = (values[bucket] ?? 0) + ((digest[2] ?? 0) % 2 === 0 ? 1 : -1);
    }
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => Number((value / norm).toFixed(6)));
}
