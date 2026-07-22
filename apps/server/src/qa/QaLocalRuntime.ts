import * as NodeCrypto from "node:crypto";

import {
  CommandId,
  DEFAULT_RUNTIME_MODE,
  type EnvironmentId,
  type ModelSelection,
  ProjectId,
  type QaReleaseId,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { ServerConfig } from "../config.ts";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { QaIam } from "./QaIam.ts";

const QA_LOCAL_RUNTIME_DIRECTORY = ".t3-qa-runtime";

export const QaLocalRuntimeErrorCode = Schema.Literals([
  "release_access_failed",
  "binding_failed",
  "projection_failed",
  "workspace_failed",
  "orchestration_failed",
  "identity_collision",
  "stale_runtime",
]);
export type QaLocalRuntimeErrorCode = typeof QaLocalRuntimeErrorCode.Type;

export class QaLocalRuntimeError extends Schema.TaggedErrorClass<QaLocalRuntimeError>()(
  "QaLocalRuntimeError",
  {
    code: QaLocalRuntimeErrorCode,
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export interface QaLocalRuntimeIdentity {
  readonly projectId: ProjectId;
  readonly conversationThreadId: ThreadId;
}

export interface EnsureQaLocalConversationInput {
  readonly subject: string;
  readonly releaseId: QaReleaseId;
  readonly projectTitle: string;
  readonly releaseTitle: string;
  readonly modelSelection: ModelSelection;
}

export interface QaLocalConversation {
  readonly releaseId: QaReleaseId;
  readonly projectId: ProjectId;
  readonly conversationThreadId: ThreadId;
  readonly workspaceRoot: string;
}

type QaLocalRuntimeShape = {
  /**
   * Ensure the caller has one principal-local orchestration conversation for
   * a shared QA release. The PG binding is established before the local
   * project/thread can be used, while all conversation events remain in the
   * current profile's SQLite store.
   */
  readonly ensureConversation: (
    input: EnsureQaLocalConversationInput,
  ) => Effect.Effect<QaLocalConversation, QaLocalRuntimeError>;
};

export class QaLocalRuntime extends Context.Service<QaLocalRuntime, QaLocalRuntimeShape>()(
  "t3/qa/QaLocalRuntime",
) {}

function identityDigest(
  releaseId: QaReleaseId,
  principalId: string,
  environmentId: EnvironmentId,
): string {
  return NodeCrypto.createHash("sha256")
    .update("t3-qa-local-runtime-v2\0")
    .update(releaseId)
    .update("\0")
    .update(principalId)
    .update("\0")
    .update(environmentId)
    .digest("hex");
}

/** Stable across retries and processes; local databases do not need syncing. */
export function qaLocalRuntimeIdentity(input: {
  readonly releaseId: QaReleaseId;
  readonly principalId: string;
  readonly environmentId: EnvironmentId;
}): QaLocalRuntimeIdentity {
  const digest = identityDigest(input.releaseId, input.principalId, input.environmentId);
  return {
    projectId: ProjectId.make(`qa-runtime-project-${digest.slice(0, 32)}`),
    conversationThreadId: ThreadId.make(`qa-runtime-thread-${digest}`),
  };
}

export function qaLocalRuntimeWorkspaceRoot(input: {
  readonly stateDirectory: string;
  readonly projectId: ProjectId;
  readonly joinPath: (...segments: ReadonlyArray<string>) => string;
}): string {
  return input.joinPath(input.stateDirectory, QA_LOCAL_RUNTIME_DIRECTORY, input.projectId);
}

const runtimeError = (
  code: QaLocalRuntimeErrorCode,
  operation: string,
  message: string,
  cause?: unknown,
) =>
  new QaLocalRuntimeError({
    code,
    operation,
    message,
    ...(cause !== undefined ? { cause } : {}),
  });

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const serverEnvironment = yield* ServerEnvironment;
  const environmentId = yield* serverEnvironment.getEnvironmentId;
  const iam = yield* QaIam;
  const orchestration = yield* OrchestrationEngine.OrchestrationEngineService;
  const projections = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const ensureLock = yield* Semaphore.make(1);

  const commandId = (operation: string) =>
    crypto.randomUUIDv4.pipe(
      Effect.map((uuid) => CommandId.make(`server:qa-local-runtime:${operation}:${uuid}`)),
      Effect.mapError((cause) =>
        runtimeError(
          "orchestration_failed",
          `command-id:${operation}`,
          "The local QA runtime command identifier could not be created.",
          cause,
        ),
      ),
    );

  const dispatch = (operation: string, command: Parameters<typeof orchestration.dispatch>[0]) =>
    orchestration
      .dispatch(command)
      .pipe(
        Effect.mapError((cause) =>
          runtimeError(
            "orchestration_failed",
            operation,
            "The local QA conversation state could not be updated.",
            cause,
          ),
        ),
      );

  const removeEmptyWorkspace = (workspaceRoot: string) =>
    fileSystem.readDirectory(workspaceRoot).pipe(
      Effect.flatMap((entries) =>
        entries.length === 0 ? fileSystem.remove(workspaceRoot, { recursive: true }) : Effect.void,
      ),
      Effect.catchCause((cause) =>
        Effect.logWarning("Failed to compensate an unused local QA runtime workspace.", {
          workspaceRoot,
          cause,
        }),
      ),
    );

  const ensureConversation = Effect.fn("QaLocalRuntime.ensureConversation")(function* (
    input: EnsureQaLocalConversationInput,
  ) {
    const access = yield* iam
      .authorizeRelease({
        subject: input.subject,
        releaseThreadId: input.releaseId,
        capability: "qa:chat",
      })
      .pipe(
        Effect.mapError((cause) =>
          runtimeError(
            "release_access_failed",
            "authorize-release",
            "The principal cannot open a local conversation for this QA release.",
            cause,
          ),
        ),
      );
    const identity = qaLocalRuntimeIdentity({
      releaseId: input.releaseId,
      principalId: access.principal.id,
      environmentId,
    });
    const workspaceRoot = qaLocalRuntimeWorkspaceRoot({
      stateDirectory: config.stateDir,
      projectId: identity.projectId,
      joinPath: path.join,
    });

    const readModel = yield* projections
      .getCommandReadModel()
      .pipe(
        Effect.mapError((cause) =>
          runtimeError(
            "projection_failed",
            "read-local-runtime",
            "The local QA conversation state could not be read.",
            cause,
          ),
        ),
      );
    const existingProject = readModel.projects.find((project) => project.id === identity.projectId);
    const existingThread = readModel.threads.find(
      (thread) => thread.id === identity.conversationThreadId,
    );

    if (existingProject !== undefined && existingProject.deletedAt !== null) {
      return yield* runtimeError(
        "stale_runtime",
        "validate-project",
        "The deterministic local QA runtime project was deleted and cannot be reused.",
      );
    }
    if (existingProject && existingProject.workspaceRoot !== workspaceRoot) {
      return yield* runtimeError(
        "identity_collision",
        "validate-project",
        "The deterministic local QA runtime project identifier is already in use.",
      );
    }
    if (existingThread !== undefined && existingThread.deletedAt !== null) {
      return yield* runtimeError(
        "stale_runtime",
        "validate-thread",
        "The deterministic local QA conversation was deleted and cannot be reused.",
      );
    }
    if (existingThread && existingThread.projectId !== identity.projectId) {
      return yield* runtimeError(
        "identity_collision",
        "validate-thread",
        "The deterministic local QA conversation identifier is already in use.",
      );
    }
    if (existingThread && !existingProject) {
      return yield* runtimeError(
        "stale_runtime",
        "validate-thread-project",
        "The local QA conversation references a missing runtime project.",
      );
    }

    // Binding first means a failed or concurrent bind cannot leave an
    // unclaimed local conversation. A subsequent retry safely rolls forward
    // any partial deterministic project/thread creation.
    const binding = yield* iam
      .bindReleaseConversation({
        subject: input.subject,
        releaseThreadId: input.releaseId,
        conversationThreadId: identity.conversationThreadId,
        environmentId,
      })
      .pipe(
        Effect.mapError((cause) =>
          runtimeError(
            "binding_failed",
            "bind-release-conversation",
            "The shared QA release could not be bound to its local conversation.",
            cause,
          ),
        ),
      );
    if (binding.conversationThreadId !== identity.conversationThreadId) {
      return yield* runtimeError(
        "identity_collision",
        "verify-release-conversation",
        "The shared QA release is bound to a different local conversation.",
      );
    }

    const workspaceExisted = yield* fileSystem
      .exists(workspaceRoot)
      .pipe(
        Effect.mapError((cause) =>
          runtimeError(
            "workspace_failed",
            "check-workspace",
            "The local QA runtime workspace could not be checked.",
            cause,
          ),
        ),
      );
    yield* fileSystem
      .makeDirectory(workspaceRoot, { recursive: true })
      .pipe(
        Effect.mapError((cause) =>
          runtimeError(
            "workspace_failed",
            "create-workspace",
            "The local QA runtime workspace could not be created.",
            cause,
          ),
        ),
      );

    if (!existingProject) {
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      yield* commandId("project-create").pipe(
        Effect.flatMap((nextCommandId) =>
          dispatch("create-project", {
            type: "project.create",
            commandId: nextCommandId,
            projectId: identity.projectId,
            title: `QA · ${input.projectTitle.trim() || "Project"}`,
            workspaceRoot,
            createWorkspaceRootIfMissing: false,
            defaultModelSelection: input.modelSelection,
            createdAt,
          }),
        ),
        Effect.tapError(() =>
          workspaceExisted ? Effect.void : removeEmptyWorkspace(workspaceRoot),
        ),
      );
    }

    if (!existingThread) {
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      yield* commandId("thread-create").pipe(
        Effect.flatMap((nextCommandId) =>
          dispatch("create-thread", {
            type: "thread.create",
            commandId: nextCommandId,
            threadId: identity.conversationThreadId,
            projectId: identity.projectId,
            title: input.releaseTitle.trim() || "QA release",
            modelSelection: input.modelSelection,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt,
          }),
        ),
      );
    } else if (existingThread.archivedAt !== null) {
      yield* commandId("thread-unarchive").pipe(
        Effect.flatMap((nextCommandId) =>
          dispatch("unarchive-thread", {
            type: "thread.unarchive",
            commandId: nextCommandId,
            threadId: identity.conversationThreadId,
          }),
        ),
      );
    }

    return {
      releaseId: input.releaseId,
      projectId: identity.projectId,
      conversationThreadId: identity.conversationThreadId,
      workspaceRoot,
    } satisfies QaLocalConversation;
  });

  return QaLocalRuntime.of({
    ensureConversation: (input) => ensureLock.withPermit(ensureConversation(input)),
  });
});

export const layer = Layer.effect(QaLocalRuntime, make);
