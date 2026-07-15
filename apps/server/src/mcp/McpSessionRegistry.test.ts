import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as QaIam from "../qa/QaIam.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";

const environmentId = EnvironmentId.make("environment-1");
const makeFakeHttpServer = (hostname: string, port = 43123) =>
  HttpServer.HttpServer.of({
    address: { _tag: "TcpAddress", hostname, port },
    serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
  });
const fakeHttpServer = makeFakeHttpServer("127.0.0.1");
const fakeEnvironment = ServerEnvironment.ServerEnvironment.of({
  getEnvironmentId: Effect.succeed(environmentId),
  getDescriptor: Effect.die("unused"),
});

const makeRegistry = (
  now: () => number,
  httpServer = fakeHttpServer,
  qaIam?: QaIam.QaIam["Service"],
) => {
  const effect = McpSessionRegistry.__testing
    .make({
      now,
      idleTimeoutMs: 100,
      maximumLifetimeMs: 1_000,
    })
    .pipe(
      Effect.provideService(HttpServer.HttpServer, httpServer),
      Effect.provideService(ServerEnvironment.ServerEnvironment, fakeEnvironment),
      Effect.provide(NodeServices.layer),
    );
  return qaIam ? effect.pipe(Effect.provideService(QaIam.QaIam, qaIam)) : effect;
};

it.effect("stores only a token hash, resolves the bearer token, and revokes by thread", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-1");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    expect(issued.config.endpoint).toBe("http://127.0.0.1:43123/mcp");
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    expect(token.length).toBeGreaterThan(20);

    const resolved = yield* registry.resolve(token);
    expect(resolved?.threadId).toBe(threadId);

    yield* registry.revokeThread(threadId);
    expect(yield* registry.resolve(token)).toBeUndefined();

    timestamp += 2_000;
  }),
);

it.effect("builds MCP endpoints from the bound server host", () =>
  Effect.gen(function* () {
    const cases = [
      ["100.64.0.40", "http://100.64.0.40:43123/mcp"],
      ["0.0.0.0", "http://127.0.0.1:43123/mcp"],
      ["localhost", "http://localhost:43123/mcp"],
      ["127.0.0.1", "http://127.0.0.1:43123/mcp"],
    ] as const;

    for (const [hostname, expectedEndpoint] of cases) {
      const registry = yield* makeRegistry(() => 1_000, makeFakeHttpServer(hostname));
      const issued = yield* registry.issue({
        threadId: ThreadId.make(`thread-${hostname}`),
        providerInstanceId: ProviderInstanceId.make("codex"),
      });
      expect(issued.config.endpoint).toBe(expectedEndpoint);
    }
  }),
);

it.effect("expires credentials after inactivity", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("thread-2"),
      providerInstanceId: ProviderInstanceId.make("claude"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    timestamp += 101;
    expect(yield* registry.resolve(token)).toBeUndefined();
  }),
);

it.effect("derives QA MCP capabilities and canonical release from the conversation binding", () =>
  Effect.gen(function* () {
    const qaIam = QaIam.QaIam.of({
      getPrincipalBySubject: () => Effect.die("unused"),
      listAssignedProjects: () => Effect.die("unused"),
      resolveProjectAccess: () => Effect.die("unused"),
      authorizeProject: () => Effect.die("unused"),
      registerProject: () => Effect.die("unused"),
      authorizeRelease: () => Effect.die("unused"),
      bindReleaseConversation: () => Effect.die("unused"),
      authorizeConversation: () => Effect.die("unused"),
      appendAuditEvent: () => Effect.die("unused"),
      resolveConversationContext: (conversationThreadId) =>
        Effect.succeed({
          principal: {
            id: "principal-maker",
            subject: "local:qa:maker",
            displayName: "Local QA Maker",
          },
          organizationId: "local-repro-org",
          projectId: "project-repro",
          projectName: "Repro",
          role: "qa:maker",
          capabilities: ["qa:read", "qa:make", "qa:chat", "qa:test-application"],
          releaseThreadId: "release-2",
          conversation: {
            releaseThreadId: "release-2",
            conversationThreadId,
            principalId: "principal-maker",
          },
        }),
    });
    const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam);
    const conversationThreadId = ThreadId.make("conversation-maker-release-2");
    const issued = yield* registry.issue({
      threadId: conversationThreadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const resolved = yield* registry.resolve(token);

    expect(resolved?.threadId).toBe(conversationThreadId);
    expect(resolved?.qaReleaseThreadId).toBe(ThreadId.make("release-2"));
    expect(resolved?.qaPrincipalSubject).toBe("local:qa:maker");
    expect(Array.from(resolved?.capabilities ?? [])).toEqual(["preview", "qa:read", "qa:make"]);
  }),
);
