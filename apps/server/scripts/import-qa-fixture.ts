#!/usr/bin/env node
import * as NodeCrypto from "node:crypto";
import * as NodeURL from "node:url";

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ThreadId } from "@t3tools/contracts";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { FetchHttpClient } from "effect/unstable/http";

import { makeSqlitePersistenceLive } from "../src/persistence/Layers/Sqlite.ts";
import * as QaDatabase from "../src/qa/QaDatabase.ts";
import * as QaIngestionGateway from "../src/qa/QaIngestionGateway.ts";
import { QaWorkflow, layer as QaWorkflowLayer } from "../src/qa/QaWorkflow.ts";

const fixtureFileNames = [
  "01-business-requirements-document.docx",
  "02-functional-requirements-specification.docx",
  "03-high-level-design.docx",
  "04-low-level-design.docx",
] as const;

const defaultFixtureDirectory = NodeURL.fileURLToPath(
  new URL("../../../fixtures/qa/test-doc/v1/", import.meta.url),
);

class QaFixtureImportError extends Schema.TaggedErrorClass<QaFixtureImportError>()(
  "QaFixtureImportError",
  { message: Schema.String },
) {}

const main = Effect.fn("importQaFixture")(function* () {
  const arguments_ = process.argv.slice(2).filter((argument) => argument !== "--");
  const [threadIdValue, stateDatabasePath, fixtureDirectory = defaultFixtureDirectory] = arguments_;

  if (!threadIdValue || !stateDatabasePath) {
    return yield* new QaFixtureImportError({
      message: "Usage: pnpm qa:import-fixture -- <thread-id> <state.sqlite> [fixture-directory]",
    });
  }

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const threadId = ThreadId.make(threadIdValue);
  const qa = yield* QaWorkflow;
  const initial = yield* qa.getSnapshot({ threadId });
  if (initial === null) {
    return yield* new QaFixtureImportError({
      message: `QA release not found for thread ${threadIdValue}.`,
    });
  }

  const imported: string[] = [];
  for (const fileName of fixtureFileNames) {
    const bytes = yield* fs.readFile(path.join(fixtureDirectory, fileName));
    const sha256 = NodeCrypto.createHash("sha256").update(bytes).digest("hex");
    if (
      initial.documents.some(
        (document) => document.fileName === fileName && document.sha256 === sha256,
      )
    ) {
      continue;
    }
    yield* qa.uploadDocument({
      threadId,
      fileName,
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes,
    });
    imported.push(fileName);
  }

  const snapshot = yield* qa.startIngestion({ threadId });
  yield* Console.log({
    threadId,
    imported,
    documents: snapshot.documents.length,
    requirements: snapshot.requirements.length,
    authoredFlows: snapshot.authoredFlows.length,
    graphNodes: snapshot.traceabilityNodes.length,
    graphEdges: snapshot.traceabilityEdges.length,
    phase: snapshot.phase,
    activeStage: snapshot.activeStage,
  });
});

const stateDatabasePath = process.argv.slice(2).filter((argument) => argument !== "--")[1];
const persistence = makeSqlitePersistenceLive(stateDatabasePath ?? ":memory:");
const qaPersistence = QaDatabase.layer.pipe(Layer.provideMerge(persistence));
const live = QaWorkflowLayer.pipe(
  Layer.provideMerge(qaPersistence),
  Layer.provideMerge(QaIngestionGateway.layer),
  Layer.provideMerge(FetchHttpClient.layer),
  Layer.provideMerge(NodeServices.layer),
);

main().pipe(Effect.provide(live), Effect.scoped, NodeRuntime.runMain);
