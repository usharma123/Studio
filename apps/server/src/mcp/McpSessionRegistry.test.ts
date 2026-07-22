import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  AuthQaRootScopes,
  AuthQaMakerScopes,
  AuthStandardClientScopes,
  AuthSessionId,
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type AuthEnvironmentScope,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as SessionStore from "../auth/SessionStore.ts";
import * as QaIam from "../qa/QaIam.ts";
import * as McpProviderSession from "./McpProviderSession.ts";
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
const rootSessionId = AuthSessionId.make("session-root");

interface TestSessionAuthorization {
  readonly sessionId: AuthSessionId;
  readonly subject: string;
  readonly scopes: ReadonlyArray<AuthEnvironmentScope>;
}

const rootAuthorization: TestSessionAuthorization = {
  sessionId: rootSessionId,
  subject: "local:root",
  scopes: AuthQaRootScopes,
};

const makeQaIam = (
  resolveConversationContext: QaIam.QaIam["Service"]["resolveConversationContext"],
  authorizeConversation: QaIam.QaIam["Service"]["authorizeConversation"] = (input) =>
    resolveConversationContext({
      conversationThreadId: input.conversationThreadId,
      environmentId: input.environmentId,
    }),
) =>
  QaIam.QaIam.of({
    getPrincipalBySubject: () => Effect.die("unused"),
    listAssignedProjects: () => Effect.die("unused"),
    resolveProjectAccess: () => Effect.die("unused"),
    authorizeProject: () => Effect.die("unused"),
    registerProject: () => Effect.die("unused"),
    authorizeRelease: () => Effect.die("unused"),
    bindReleaseConversation: () => Effect.die("unused"),
    authorizeConversation,
    appendAuditEvent: () => Effect.die("unused"),
    resolveConversationContext,
  });

const missingConversationQaIam = makeQaIam(() =>
  Effect.fail(
    new QaIam.QaIamError({
      code: "conversation_not_found",
      message: "No QA conversation is bound to this thread.",
    }),
  ),
);

const makeRegistry = (
  now: () => number,
  httpServer = fakeHttpServer,
  qaIam?: QaIam.QaIam["Service"],
  authorization: TestSessionAuthorization = rootAuthorization,
  resolveActiveAuthorization?: SessionStore.SessionStore["Service"]["resolveActiveAuthorization"],
) => {
  const sessionStore = SessionStore.SessionStore.of({
    resolveActiveAuthorization:
      resolveActiveAuthorization ??
      ((sessionId: AuthSessionId) =>
        sessionId === authorization.sessionId
          ? Effect.succeed({
              ...authorization,
              expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
            })
          : Effect.die(`Unknown test session '${sessionId}'.`)),
  } as unknown as SessionStore.SessionStore["Service"]);
  const effect = McpSessionRegistry.__testing
    .make({
      now,
      idleTimeoutMs: 100,
      maximumLifetimeMs: 1_000,
    })
    .pipe(
      Effect.provideService(HttpServer.HttpServer, httpServer),
      Effect.provideService(ServerEnvironment.ServerEnvironment, fakeEnvironment),
      Effect.provideService(QaIam.QaIam, qaIam ?? missingConversationQaIam),
      Effect.provideService(SessionStore.SessionStore, sessionStore),
      Effect.provide(NodeServices.layer),
      Effect.map((registry) => ({
        ...registry,
        issueWithoutDefault: registry.issue,
        issue: (request: Omit<McpSessionRegistry.McpCredentialRequest, "initiatingSessionId">) =>
          registry.issue({ initiatingSessionId: authorization.sessionId, ...request }),
      })),
    );
  return effect;
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
    expect(issued.config.authorizationContext).toEqual({
      kind: "standard",
      principalSubject: "local:root",
      workspaceAdministrator: true,
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    expect(token.length).toBeGreaterThan(20);

    const resolved = yield* registry.resolve(token);
    expect(resolved?.threadId).toBe(threadId);
    expect(McpProviderSession.readMcpProviderSession(threadId)?.providerSessionId).toBe(
      issued.config.providerSessionId,
    );

    yield* registry.revokeThread(threadId);
    expect(yield* registry.resolve(token)).toBeUndefined();
    expect(McpProviderSession.readMcpProviderSession(threadId)).toBeUndefined();

    timestamp += 2_000;
  }),
);

it.effect("fails closed when provider credential provenance is missing", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const result = yield* registry
      .issueWithoutDefault({
        threadId: ThreadId.make("missing-session-provenance"),
        providerInstanceId: ProviderInstanceId.make("codex"),
      } as unknown as McpSessionRegistry.McpCredentialRequest)
      .pipe(Effect.result);

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("McpSessionAuthorizationError");
    }
  }),
);

it.effect("never substitutes a QA conversation owner for an orchestration-capable non-owner", () =>
  Effect.gen(function* () {
    const makerAccess: QaIam.QaConversationAccess = {
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
      releaseThreadId: "release-maker",
      conversation: {
        releaseThreadId: "release-maker",
        conversationThreadId: "conversation-maker",
        principalId: "principal-maker",
        environmentId,
      },
    };
    const qaIam = makeQaIam(
      () => Effect.succeed(makerAccess),
      () =>
        Effect.fail(
          new QaIam.QaIamError({
            code: "conversation_access_denied",
            message: "The conversation belongs to the maker.",
          }),
        ),
    );
    const attacker = {
      sessionId: AuthSessionId.make("session-standard-attacker"),
      subject: "local:standard-attacker",
      scopes: AuthStandardClientScopes,
    } as const;
    const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam, attacker);
    const result = yield* registry
      .issue({
        threadId: ThreadId.make("conversation-maker"),
        providerInstanceId: ProviderInstanceId.make("codex"),
      })
      .pipe(Effect.result);

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("McpSessionAuthorizationError");
    }
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
    const threadId = ThreadId.make("thread-2");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("claude"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    timestamp += 101;
    expect(
      yield* registry.validateCurrentThreadAuthorization({
        threadId,
        initiatingSessionId: rootSessionId,
      }),
    ).toBe(false);
    expect(yield* registry.resolve(token)).toBeUndefined();
    expect(McpProviderSession.readMcpProviderSession(threadId)).toBeUndefined();
  }),
);

it.effect("expires current thread authorization at its maximum lifetime", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-maximum-lifetime");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });

    timestamp = issued.expiresAt + 1;
    expect(
      yield* registry.validateCurrentThreadAuthorization({
        threadId,
        initiatingSessionId: rootSessionId,
      }),
    ).toBe(false);
    expect(McpProviderSession.readMcpProviderSession(threadId)).toBeUndefined();
    expect(
      yield* registry.resolve(issued.config.authorizationHeader.replace(/^Bearer\s+/, "")),
    ).toBeUndefined();
  }),
);

it.effect(
  "revokes cached provider authorization when its initiating session becomes inactive",
  () =>
    Effect.gen(function* () {
      let active = true;
      const registry = yield* makeRegistry(
        () => 1_000,
        fakeHttpServer,
        missingConversationQaIam,
        rootAuthorization,
        (sessionId) =>
          active
            ? Effect.succeed({
                ...rootAuthorization,
                expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
              })
            : Effect.fail(new SessionStore.UnknownWebSocketSessionError({ sessionId })),
      );
      const threadId = ThreadId.make("thread-inactive-initiating-session");
      const issued = yield* registry.issue({
        threadId,
        providerInstanceId: ProviderInstanceId.make("codex"),
      });

      active = false;
      expect(
        yield* registry.validateCurrentThreadAuthorization({
          threadId,
          initiatingSessionId: rootSessionId,
        }),
      ).toBe(false);
      expect(McpProviderSession.readMcpProviderSession(threadId)).toBeUndefined();
      expect(
        yield* registry.resolve(issued.config.authorizationHeader.replace(/^Bearer\s+/, "")),
      ).toBeUndefined();
    }),
);

it.effect("revokes a standard credential when its thread becomes QA-bound", () =>
  Effect.gen(function* () {
    let qaBound = false;
    const qaAccess: QaIam.QaConversationAccess = {
      principal: {
        id: "principal-root",
        subject: "local:root",
        displayName: "Local Root",
      },
      organizationId: "local-repro-org",
      projectId: "project-repro",
      projectName: "Repro",
      role: "root",
      capabilities: ["qa:read", "qa:make", "qa:approve", "qa:chat", "qa:test-application"],
      releaseThreadId: "release-rebound",
      conversation: {
        releaseThreadId: "release-rebound",
        conversationThreadId: "thread-newly-qa-bound",
        principalId: "principal-root",
        environmentId,
      },
    };
    const qaIam = makeQaIam(() =>
      qaBound
        ? Effect.succeed(qaAccess)
        : Effect.fail(
            new QaIam.QaIamError({
              code: "conversation_not_found",
              message: "This is still an ordinary coding thread.",
            }),
          ),
    );
    const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam);
    const threadId = ThreadId.make("thread-newly-qa-bound");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    expect(issued.config.authorizationContext.kind).toBe("standard");

    qaBound = true;
    expect(
      yield* registry.validateCurrentThreadAuthorization({
        threadId,
        initiatingSessionId: rootSessionId,
      }),
    ).toBe(false);
    expect(McpProviderSession.readMcpProviderSession(threadId)).toBeUndefined();
    expect(
      yield* registry.resolve(issued.config.authorizationHeader.replace(/^Bearer\s+/, "")),
    ).toBeUndefined();
  }),
);

it.effect("derives QA MCP capabilities and canonical release from the conversation binding", () =>
  Effect.gen(function* () {
    const qaIam = makeQaIam((input) =>
      Effect.sync(() => {
        expect(input.environmentId).toBe(environmentId);
        return {
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
            conversationThreadId: input.conversationThreadId,
            principalId: "principal-maker",
            environmentId: input.environmentId,
          },
        };
      }),
    );
    const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam, {
      sessionId: AuthSessionId.make("session-maker"),
      subject: "local:qa:maker",
      scopes: AuthQaMakerScopes,
    });
    const conversationThreadId = ThreadId.make("conversation-maker-release-2");
    const issued = yield* registry.issue({
      threadId: conversationThreadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const resolved = yield* registry.resolve(token);

    expect(issued.config.authorizationContext).toEqual({
      kind: "qa-release",
      releaseThreadId: ThreadId.make("release-2"),
      principalSubject: "local:qa:maker",
      workspaceAdministrator: false,
    });
    expect(resolved?.threadId).toBe(conversationThreadId);
    expect(resolved?.qaReleaseThreadId).toBe(ThreadId.make("release-2"));
    expect(resolved?.qaPrincipalSubject).toBe("local:qa:maker");
    expect(resolved?.principalSubject).toBe("local:qa:maker");
    expect(resolved?.workspaceAdministrator).toBe(false);
    expect(Array.from(resolved?.capabilities ?? [])).toEqual(["preview", "qa:read", "qa:make"]);
  }),
);

it.effect("marks a canonically bound QA root as the workspace administrator", () =>
  Effect.gen(function* () {
    const qaIam = makeQaIam((input) =>
      Effect.succeed({
        principal: {
          id: "principal-root",
          subject: "local:root",
          displayName: "Local Root",
        },
        organizationId: "local-repro-org",
        projectId: "project-repro",
        projectName: "Repro",
        role: "root",
        capabilities: ["qa:read", "qa:make", "qa:approve", "qa:chat", "qa:test-application"],
        releaseThreadId: "release-root",
        conversation: {
          releaseThreadId: "release-root",
          conversationThreadId: input.conversationThreadId,
          principalId: "principal-root",
          environmentId: input.environmentId,
        },
      }),
    );
    const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("conversation-root-release"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const resolved = yield* registry.resolve(token);

    expect(issued.config.authorizationContext).toEqual({
      kind: "qa-release",
      releaseThreadId: ThreadId.make("release-root"),
      principalSubject: "local:root",
      workspaceAdministrator: true,
    });
    expect(resolved?.principalSubject).toBe("local:root");
    expect(resolved?.workspaceAdministrator).toBe(true);
  }),
);

it.effect("does not grant workspace administration from a noncanonical project root role", () =>
  Effect.gen(function* () {
    const qaIam = makeQaIam((input) =>
      Effect.succeed({
        principal: {
          id: "principal-project-root",
          subject: "tenant:project-root",
          displayName: "Project Root",
        },
        organizationId: "tenant-org",
        projectId: "tenant-project",
        projectName: "Tenant Project",
        role: "root",
        capabilities: ["qa:read", "qa:make", "qa:approve", "qa:chat", "qa:test-application"],
        releaseThreadId: "release-project-root",
        conversation: {
          releaseThreadId: "release-project-root",
          conversationThreadId: input.conversationThreadId,
          principalId: "principal-project-root",
          environmentId: input.environmentId,
        },
      }),
    );
    const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam, {
      sessionId: AuthSessionId.make("session-project-root"),
      subject: "tenant:project-root",
      scopes: AuthQaRootScopes,
    });
    const issued = yield* registry.issue({
      threadId: ThreadId.make("conversation-noncanonical-root"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    });

    expect(issued.config.authorizationContext.principalSubject).toBe("tenant:project-root");
    expect(issued.config.authorizationContext.workspaceAdministrator).toBe(false);
  }),
);

it.effect("treats only a missing QA conversation as a standard provider session", () =>
  Effect.gen(function* () {
    const qaIam = makeQaIam(() =>
      Effect.fail(
        new QaIam.QaIamError({
          code: "conversation_not_found",
          message: "No QA conversation is bound to this thread.",
        }),
      ),
    );
    const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("ordinary-coding-thread"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    });

    expect(issued.config.authorizationContext).toEqual({
      kind: "standard",
      principalSubject: "local:root",
      workspaceAdministrator: true,
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const resolved = yield* registry.resolve(token);
    expect(Array.from(resolved?.capabilities ?? [])).toEqual(["preview"]);
    expect(resolved?.qaReleaseThreadId).toBeUndefined();
    expect(resolved?.qaPrincipalSubject).toBeUndefined();
    expect(resolved?.principalSubject).toBe("local:root");
    expect(resolved?.workspaceAdministrator).toBe(true);
  }),
);

it.effect("maps an unbound standard session to the explicit trusted workspace administrator", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("ordinary-root-coding-thread"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const resolved = yield* registry.resolve(token);

    expect(resolved?.principalSubject).toBe("local:root");
    expect(resolved?.workspaceAdministrator).toBe(true);
    expect(resolved?.qaPrincipalSubject).toBeUndefined();
  }),
);

it.effect("fails closed when canonical QA context resolution fails", () =>
  Effect.gen(function* () {
    const qaIam = makeQaIam(() =>
      Effect.fail(
        new QaIam.QaIamError({
          code: "persistence_error",
          operation: "resolveConversationContext",
          message: "QA IAM is unavailable.",
        }),
      ),
    );
    const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam);
    const result = yield* registry
      .issue({
        threadId: ThreadId.make("possibly-restricted-thread"),
        providerInstanceId: ProviderInstanceId.make("codex"),
      })
      .pipe(Effect.result);

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure" && result.failure._tag === "QaIamError") {
      expect(result.failure.code).toBe("persistence_error");
      expect(result.failure.operation).toBe("resolveConversationContext");
    }
  }),
);

it.effect("never downgrades wrong-environment or inactive QA conversations to standard", () =>
  Effect.gen(function* () {
    for (const reason of ["wrong environment", "inactive principal"] as const) {
      const qaIam = makeQaIam(() =>
        Effect.fail(
          new QaIam.QaIamError({
            code: "conversation_access_denied",
            message: `The QA conversation has a ${reason}.`,
          }),
        ),
      );
      const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam);
      const result = yield* registry
        .issue({
          threadId: ThreadId.make(`restricted-${reason.replace(" ", "-")}`),
          providerInstanceId: ProviderInstanceId.make("codex"),
        })
        .pipe(Effect.result);

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure" && result.failure._tag === "QaIamError") {
        expect(result.failure.code).toBe("conversation_access_denied");
      }
    }
  }),
);

it.effect("replaces a thread credential atomically after canonical context resolves", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const request = {
      threadId: ThreadId.make("credential-replacement-thread"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    };
    const first = yield* registry.issue(request);
    const second = yield* registry.issue(request);
    const firstToken = first.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const secondToken = second.config.authorizationHeader.replace(/^Bearer\s+/, "");

    expect(yield* registry.resolve(firstToken)).toBeUndefined();
    expect(yield* registry.resolve(secondToken)).toBeDefined();
  }),
);

it.effect(
  "preserves replacement atomicity but fails closed on the next live authorization check",
  () =>
    Effect.gen(function* () {
      let resolutionCount = 0;
      const qaIam = makeQaIam(() =>
        Effect.suspend(() => {
          resolutionCount += 1;
          return resolutionCount === 1
            ? Effect.fail(
                new QaIam.QaIamError({
                  code: "conversation_not_found",
                  message: "This is an ordinary coding thread.",
                }),
              )
            : Effect.fail(
                new QaIam.QaIamError({
                  code: "persistence_error",
                  operation: "resolveConversationContext",
                  message: "QA IAM is temporarily unavailable.",
                }),
              );
        }),
      );
      const registry = yield* makeRegistry(() => 1_000, fakeHttpServer, qaIam);
      const request = {
        threadId: ThreadId.make("failed-credential-replacement-thread"),
        providerInstanceId: ProviderInstanceId.make("codex"),
      };
      const current = yield* registry.issue(request);
      const replacement = yield* registry.issue(request).pipe(Effect.result);
      const currentToken = current.config.authorizationHeader.replace(/^Bearer\s+/, "");

      expect(replacement._tag).toBe("Failure");
      expect(McpProviderSession.readMcpProviderSession(request.threadId)?.providerSessionId).toBe(
        current.config.providerSessionId,
      );
      expect(yield* registry.resolve(currentToken)).toBeUndefined();
      expect(McpProviderSession.readMcpProviderSession(request.threadId)).toBeUndefined();
    }),
);

it.effect("keeps only one credential valid across concurrent replacements", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const request = {
      threadId: ThreadId.make("concurrent-credential-replacement-thread"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    };
    const issued = yield* Effect.all([registry.issue(request), registry.issue(request)], {
      concurrency: "unbounded",
    });
    const resolved = yield* Effect.all(
      issued.map((credential) =>
        registry.resolve(credential.config.authorizationHeader.replace(/^Bearer\s+/, "")),
      ),
      { concurrency: "unbounded" },
    );

    const validScopes = resolved.filter((scope) => scope !== undefined);
    expect(validScopes).toHaveLength(1);
    expect(McpProviderSession.readMcpProviderSession(request.threadId)?.providerSessionId).toBe(
      validScopes[0]?.providerSessionId,
    );
  }),
);

it.effect("fails closed when the active MCP registry is unavailable", () =>
  Effect.gen(function* () {
    const result = yield* McpSessionRegistry.issueActiveMcpCredential({
      threadId: ThreadId.make("registry-unavailable-thread"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      initiatingSessionId: rootSessionId,
    }).pipe(Effect.result);

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("McpSessionRegistryUnavailableError");
    }
  }),
);
