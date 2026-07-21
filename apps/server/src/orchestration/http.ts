import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthQaChatScope,
  EnvironmentAuthenticatedPrincipal,
  EnvironmentHttpApi,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import { normalizeDispatchCommand } from "./Normalizer.ts";
import {
  annotateEnvironmentRequest,
  failEnvironmentInternal,
  failEnvironmentInvalidRequest,
  failEnvironmentNotFound,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as QaIam from "../qa/QaIam.ts";

export const orchestrationHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "orchestration",
  Effect.fnUntraced(function* (handlers) {
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const orchestrationEngine = yield* OrchestrationEngineService;
    const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
    const environmentId = yield* serverEnvironment.getEnvironmentId;
    const qaIam = yield* QaIam.QaIam;
    const requireQaConversationAccessIfBound = (input: {
      readonly subject: string;
      readonly threadId: import("@t3tools/contracts").ThreadId;
    }) =>
      qaIam
        .resolveConversationContext({
          conversationThreadId: input.threadId,
          environmentId,
        })
        .pipe(
          Effect.map(Option.some),
          Effect.catch((cause) =>
            cause.code === "conversation_not_found"
              ? Effect.succeed(Option.none<QaIam.QaConversationAccess>())
              : failEnvironmentNotFound("thread_not_found"),
          ),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: () =>
                qaIam
                  .authorizeConversation({
                    subject: input.subject,
                    conversationThreadId: input.threadId,
                    environmentId,
                    capability: "qa:chat",
                  })
                  .pipe(
                    Effect.asVoid,
                    Effect.catch(() => failEnvironmentNotFound("thread_not_found")),
                  ),
            }),
          ),
        );

    return handlers
      .handle(
        "snapshot",
        Effect.fn("environment.orchestration.snapshot")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* projectionSnapshotQuery
            .getSnapshot()
            .pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_snapshot_failed", cause),
              ),
            );
        }),
      )
      .handle(
        "shellSnapshot",
        Effect.fn("environment.orchestration.shellSnapshot")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* projectionSnapshotQuery
            .getShellSnapshot()
            .pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_snapshot_failed", cause),
              ),
            );
        }),
      )
      .handle(
        "threadSnapshot",
        Effect.fn("environment.orchestration.threadSnapshot")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          const principal = yield* EnvironmentAuthenticatedPrincipal;
          if (!principal.scopes.has(AuthOrchestrationReadScope)) {
            if (!principal.scopes.has(AuthQaChatScope)) {
              yield* requireEnvironmentScope(AuthOrchestrationReadScope);
            }
          }
          yield* requireQaConversationAccessIfBound({
            subject: principal.subject,
            threadId: args.params.threadId,
          });
          const snapshot = yield* projectionSnapshotQuery
            .getThreadDetailSnapshot(args.params.threadId)
            .pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_thread_snapshot_failed", cause),
              ),
            );
          if (Option.isNone(snapshot)) {
            return yield* failEnvironmentNotFound("thread_not_found");
          }
          return snapshot.value;
        }),
      )
      .handle(
        "dispatch",
        Effect.fn("environment.orchestration.dispatch")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          const principal = yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          const normalizedCommand = yield* normalizeDispatchCommand(args.payload).pipe(
            Effect.catch(() => failEnvironmentInvalidRequest("invalid_command")),
          );
          const authenticatedCommand =
            normalizedCommand.type === "thread.turn.start"
              ? {
                  ...normalizedCommand,
                  // Client input cannot choose credential identity. Bind the
                  // asynchronous provider turn to this authenticated session.
                  initiatingSessionId: principal.sessionId,
                }
              : normalizedCommand;
          if ("threadId" in authenticatedCommand) {
            yield* requireQaConversationAccessIfBound({
              subject: principal.subject,
              threadId: authenticatedCommand.threadId,
            });
          }
          return yield* orchestrationEngine
            .dispatch(authenticatedCommand)
            .pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_dispatch_failed", cause),
              ),
            );
        }),
      );
  }),
);
