import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DEFAULT_MODEL,
  EnvironmentId,
  type OrchestrationCommand,
  type OrchestrationReadModel,
  ProviderInstanceId,
  QaReleaseId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import { OrchestrationCommandInvariantError } from "../orchestration/Errors.ts";
import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as QaIam from "./QaIam.ts";
import {
  QaLocalRuntime,
  layer as QaLocalRuntimeLayer,
  qaLocalRuntimeIdentity,
} from "./QaLocalRuntime.ts";

const releaseId = QaReleaseId.make("release-1");
const environmentId = EnvironmentId.make("environment-1");
const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: DEFAULT_MODEL,
} as const;
const timestamp = "2026-07-16T12:00:00.000Z";

function emptyReadModel(): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [],
    updatedAt: timestamp,
  };
}

function applyCommand(
  readModel: OrchestrationReadModel,
  command: OrchestrationCommand,
): OrchestrationReadModel {
  switch (command.type) {
    case "project.create":
      return {
        ...readModel,
        projects: [
          ...readModel.projects,
          {
            id: command.projectId,
            title: command.title,
            workspaceRoot: command.workspaceRoot,
            defaultModelSelection: command.defaultModelSelection ?? null,
            scripts: [],
            createdAt: command.createdAt,
            updatedAt: command.createdAt,
            deletedAt: null,
          },
        ],
      };
    case "thread.create":
      return {
        ...readModel,
        threads: [
          ...readModel.threads,
          {
            id: command.threadId,
            projectId: command.projectId,
            title: command.title,
            modelSelection: command.modelSelection,
            runtimeMode: command.runtimeMode,
            interactionMode: command.interactionMode,
            branch: command.branch,
            worktreePath: command.worktreePath,
            latestTurn: null,
            createdAt: command.createdAt,
            updatedAt: command.createdAt,
            archivedAt: null,
            deletedAt: null,
            messages: [],
            proposedPlans: [],
            activities: [],
            checkpoints: [],
            session: null,
          },
        ],
      };
    case "thread.unarchive":
      return {
        ...readModel,
        threads: readModel.threads.map((thread) =>
          thread.id === command.threadId ? { ...thread, archivedAt: null } : thread,
        ),
      };
    default:
      return readModel;
  }
}

function makeTestLayer(input: {
  readonly baseDirectory: string;
  readonly readModel: Ref.Ref<OrchestrationReadModel>;
  readonly calls: Ref.Ref<ReadonlyArray<string>>;
  readonly dispatchFailure?: OrchestrationCommandInvariantError;
}) {
  return QaLocalRuntimeLayer.pipe(
    Layer.provide(
      Layer.mock(QaIam.QaIam)({
        authorizeRelease: ({ subject, releaseThreadId }) =>
          Effect.succeed({
            principal: {
              id: "principal-1",
              subject,
              displayName: "Maker",
            },
            organizationId: "organization-1",
            projectId: "shared-project-1",
            projectName: "Shared QA Project",
            role: "qa:maker" as const,
            capabilities: ["qa:read", "qa:make", "qa:chat", "qa:test-application"] as const,
            releaseThreadId,
          }),
        bindReleaseConversation: ({
          releaseThreadId,
          conversationThreadId,
          environmentId: bindingEnvironmentId,
        }) =>
          Ref.update(input.calls, (calls) => [...calls, "bind"]).pipe(
            Effect.as({
              releaseThreadId,
              conversationThreadId,
              principalId: "principal-1",
              environmentId: bindingEnvironmentId,
            }),
          ),
      }),
    ),
    Layer.provide(
      Layer.mock(ProjectionSnapshotQuery.ProjectionSnapshotQuery)({
        getCommandReadModel: () => Ref.get(input.readModel),
      }),
    ),
    Layer.provide(
      Layer.mock(OrchestrationEngine.OrchestrationEngineService)({
        dispatch: (command) =>
          Ref.update(input.calls, (calls) => [...calls, command.type]).pipe(
            Effect.andThen(
              input.dispatchFailure && command.type === "project.create"
                ? Effect.fail(input.dispatchFailure)
                : Ref.update(input.readModel, (readModel) => applyCommand(readModel, command)).pipe(
                    Effect.as({ sequence: 1 }),
                  ),
            ),
          ),
      }),
    ),
    Layer.provide(
      Layer.mock(ServerEnvironment.ServerEnvironment)({
        getEnvironmentId: Effect.succeed(environmentId),
        getDescriptor: Effect.die("Unused server environment descriptor in QA runtime test."),
      }),
    ),
    Layer.provide(ServerConfig.layerTest(input.baseDirectory, input.baseDirectory)),
    Layer.provideMerge(NodeServices.layer),
  );
}

const ensureInput = {
  subject: "test:maker",
  releaseId,
  projectTitle: "Shared QA Project",
  releaseTitle: "Release 1",
  modelSelection,
} as const;

it("derives stable principal-and-environment-scoped local runtime identifiers", () => {
  const first = qaLocalRuntimeIdentity({ releaseId, principalId: "principal-1", environmentId });
  const retry = qaLocalRuntimeIdentity({ releaseId, principalId: "principal-1", environmentId });
  const otherPrincipal = qaLocalRuntimeIdentity({
    releaseId,
    principalId: "principal-2",
    environmentId,
  });
  const otherEnvironment = qaLocalRuntimeIdentity({
    releaseId,
    principalId: "principal-1",
    environmentId: EnvironmentId.make("environment-2"),
  });

  assert.deepStrictEqual(first, retry);
  assert.notEqual(first.projectId, otherPrincipal.projectId);
  assert.notEqual(first.conversationThreadId, otherPrincipal.conversationThreadId);
  assert.notEqual(first.projectId, otherEnvironment.projectId);
  assert.notEqual(first.conversationThreadId, otherEnvironment.conversationThreadId);
});

it.effect("binds before creating local state and converges on retries", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const baseDirectory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "t3-qa-local-runtime-",
    });
    const readModel = yield* Ref.make(emptyReadModel());
    const calls = yield* Ref.make<ReadonlyArray<string>>([]);
    const testLayer = makeTestLayer({ baseDirectory, readModel, calls });

    const first = yield* Effect.gen(function* () {
      const runtime = yield* QaLocalRuntime;
      return yield* runtime.ensureConversation(ensureInput);
    }).pipe(Effect.provide(testLayer));
    const second = yield* Effect.gen(function* () {
      const runtime = yield* QaLocalRuntime;
      return yield* runtime.ensureConversation(ensureInput);
    }).pipe(Effect.provide(testLayer));

    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(yield* Ref.get(calls), [
      "bind",
      "project.create",
      "thread.create",
      "bind",
    ]);
    assert.equal(yield* fileSystem.exists(first.workspaceRoot), true);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("restores an archived local conversation and rejects a deleted one", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const baseDirectory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "t3-qa-local-runtime-stale-",
    });
    const readModel = yield* Ref.make(emptyReadModel());
    const calls = yield* Ref.make<ReadonlyArray<string>>([]);
    const testLayer = makeTestLayer({ baseDirectory, readModel, calls });

    const conversation = yield* Effect.gen(function* () {
      const runtime = yield* QaLocalRuntime;
      return yield* runtime.ensureConversation(ensureInput);
    }).pipe(Effect.provide(testLayer));
    yield* Ref.update(readModel, (current) => ({
      ...current,
      threads: current.threads.map((thread) =>
        thread.id === conversation.conversationThreadId
          ? { ...thread, archivedAt: timestamp }
          : thread,
      ),
    }));

    yield* Effect.gen(function* () {
      const runtime = yield* QaLocalRuntime;
      return yield* runtime.ensureConversation(ensureInput);
    }).pipe(Effect.provide(testLayer));
    assert.equal((yield* Ref.get(readModel)).threads[0]?.archivedAt, null);

    yield* Ref.update(readModel, (current) => ({
      ...current,
      threads: current.threads.map((thread) =>
        thread.id === conversation.conversationThreadId
          ? { ...thread, deletedAt: timestamp }
          : thread,
      ),
    }));
    const error = yield* Effect.gen(function* () {
      const runtime = yield* QaLocalRuntime;
      return yield* runtime.ensureConversation(ensureInput);
    }).pipe(Effect.provide(testLayer), Effect.flip);

    assert.equal(error._tag, "QaLocalRuntimeError");
    if (error._tag !== "QaLocalRuntimeError") return;
    assert.equal(error.code, "stale_runtime");
    assert.equal(error.operation, "validate-thread");
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("removes a newly-created empty workspace when project creation fails", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDirectory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "t3-qa-local-runtime-rollback-",
    });
    const readModel = yield* Ref.make(emptyReadModel());
    const calls = yield* Ref.make<ReadonlyArray<string>>([]);
    const dispatchFailure = new OrchestrationCommandInvariantError({
      commandType: "project.create",
      detail: "test failure",
    });
    const testLayer = makeTestLayer({
      baseDirectory,
      readModel,
      calls,
      dispatchFailure,
    });
    const identity = qaLocalRuntimeIdentity({
      releaseId,
      principalId: "principal-1",
      environmentId,
    });
    const expectedWorkspaceRoot = path.join(
      baseDirectory,
      "userdata",
      ".t3-qa-runtime",
      identity.projectId,
    );

    const error = yield* Effect.gen(function* () {
      const runtime = yield* QaLocalRuntime;
      return yield* runtime.ensureConversation(ensureInput);
    }).pipe(Effect.provide(testLayer), Effect.flip);

    assert.equal(error._tag, "QaLocalRuntimeError");
    if (error._tag !== "QaLocalRuntimeError") return;
    assert.equal(error.code, "orchestration_failed");
    assert.deepStrictEqual(yield* Ref.get(calls), ["bind", "project.create"]);
    assert.equal(yield* fileSystem.exists(expectedWorkspaceRoot), false);
  }).pipe(Effect.provide(NodeServices.layer)),
);
