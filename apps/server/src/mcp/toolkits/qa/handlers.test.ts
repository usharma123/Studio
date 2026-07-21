import { assert, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as QaIam from "../../../qa/QaIam.ts";
import * as QaReleaseEventBus from "../../../qa/QaReleaseEventBus.ts";
import * as QaWorkflow from "../../../qa/QaWorkflow.ts";
import { QaToolkitHandlersLive } from "./handlers.ts";
import { QaToolkit } from "./tools.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-qa-toolkit-test");
const CONVERSATION_THREAD_ID = ThreadId.make("conversation-qa-toolkit-test");
const RELEASE_THREAD_ID = ThreadId.make("release-qa-toolkit-test");

const invocation = (
  capabilities: ReadonlyArray<McpInvocationContext.McpCapability>,
): McpInvocationContext.McpInvocationScope => ({
  environmentId: ENVIRONMENT_ID,
  threadId: CONVERSATION_THREAD_ID,
  providerSessionId: "provider-session-qa-toolkit-test",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(capabilities),
  principalSubject: "test:maker",
  workspaceAdministrator: false,
  qaReleaseThreadId: RELEASE_THREAD_ID,
  qaPrincipalSubject: "test:maker",
  issuedAt: 1,
  expiresAt: Number.MAX_SAFE_INTEGER,
});

const runGetActiveStage = (scope: McpInvocationContext.McpInvocationScope) =>
  Effect.gen(function* () {
    const toolkit = yield* QaToolkit;
    const stream = yield* toolkit.handle("qa_get_active_stage", {});
    return yield* stream.pipe(Stream.run(Sink.last()), Effect.flatMap(Effect.fromOption));
  }).pipe(Effect.provideService(McpInvocationContext.McpInvocationContext, scope));

const runReportProgress = (scope: McpInvocationContext.McpInvocationScope) =>
  Effect.gen(function* () {
    const toolkit = yield* QaToolkit;
    const stream = yield* toolkit.handle("qa_report_stage_progress", {
      stage: "requirements",
      progress: 10,
    });
    return yield* stream.pipe(Stream.run(Sink.last()), Effect.flatMap(Effect.fromOption));
  }).pipe(Effect.provideService(McpInvocationContext.McpInvocationContext, scope));

const makeTestLayer = (authorizeConversation: QaIam.QaIam["Service"]["authorizeConversation"]) => {
  const dependencies = Layer.mergeAll(
    Layer.mock(QaIam.QaIam)({ authorizeConversation }),
    Layer.mock(QaWorkflow.QaWorkflow)({
      getSnapshot: () => Effect.die("QA workflow must not run before live authorization."),
      reportAgentStageProgress: () =>
        Effect.die("QA workflow must not run before live authorization."),
    }),
    Layer.succeed(
      QaReleaseEventBus.QaReleaseEventBus,
      QaReleaseEventBus.QaReleaseEventBus.of({
        publish: () => Effect.void,
        events: Stream.empty,
        subscribeEvents: Effect.flatMap(
          PubSub.unbounded<QaReleaseEventBus.QaReleaseEventSignal>(),
          PubSub.subscribe,
        ),
      }),
    ),
  );
  return QaToolkitHandlersLive.pipe(Layer.provideMerge(dependencies));
};

it.effect("checks the issued MCP capability ceiling before live IAM", () =>
  Effect.gen(function* () {
    let authorizeCalls = 0;
    const failure = yield* runReportProgress(invocation(["qa:read"])).pipe(
      Effect.flip,
      Effect.provide(
        makeTestLayer(() => {
          authorizeCalls += 1;
          return Effect.die("Live IAM must not run when the issued ceiling denies access.");
        }),
      ),
    );

    assert.equal(failure._tag, "QaOperationError");
    assert.equal(authorizeCalls, 0);
  }),
);

it.effect("live-authorizes every read and mutation against the exact conversation identity", () =>
  Effect.gen(function* () {
    const requests: Array<{
      readonly subject: string;
      readonly conversationThreadId: string;
      readonly environmentId: string;
      readonly capability: QaIam.QaIamCapability;
    }> = [];
    const layer = makeTestLayer((input) => {
      requests.push(input);
      return Effect.fail(
        new QaIam.QaIamError({
          code: "capability_denied",
          message: "Live project role no longer grants this capability.",
        }),
      );
    });

    const readFailure = yield* runGetActiveStage(invocation(["qa:read"])).pipe(
      Effect.flip,
      Effect.provide(layer),
    );
    const mutationFailure = yield* runReportProgress(invocation(["qa:read", "qa:make"])).pipe(
      Effect.flip,
      Effect.provide(layer),
    );

    assert.equal(readFailure._tag, "QaOperationError");
    assert.equal(mutationFailure._tag, "QaOperationError");
    assert.deepEqual(requests, [
      {
        subject: "test:maker",
        conversationThreadId: CONVERSATION_THREAD_ID,
        environmentId: ENVIRONMENT_ID,
        capability: "qa:read",
      },
      {
        subject: "test:maker",
        conversationThreadId: CONVERSATION_THREAD_ID,
        environmentId: ENVIRONMENT_ID,
        capability: "qa:make",
      },
    ]);
  }),
);

it.effect("rejects a live conversation that resolves to a different release", () =>
  Effect.gen(function* () {
    const failure = yield* runGetActiveStage(invocation(["qa:read"])).pipe(
      Effect.flip,
      Effect.provide(
        makeTestLayer((input) =>
          Effect.succeed({
            principal: {
              id: "principal-maker",
              subject: input.subject,
              displayName: "Test Maker",
            },
            organizationId: "test-org",
            projectId: "test-project",
            projectName: "Test Project",
            role: "qa:maker",
            capabilities: ["qa:read", "qa:make", "qa:chat", "qa:test-application"],
            releaseThreadId: "different-release",
            conversation: {
              releaseThreadId: "different-release",
              conversationThreadId: input.conversationThreadId,
              principalId: "principal-maker",
              environmentId: input.environmentId,
            },
          }),
        ),
      ),
    );

    assert.equal(failure._tag, "QaOperationError");
  }),
);
