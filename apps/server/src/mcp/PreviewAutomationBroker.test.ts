import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  PreviewAutomationClientDisconnectedError,
  PreviewAutomationInvalidSelectorError,
  PreviewAutomationMalformedResponseError,
  PreviewAutomationNoAvailableHostError,
  PreviewAutomationUnavailableError,
  PreviewAutomationTargetNotEditableError,
  PreviewTabId,
  ProviderInstanceId,
  ThreadId,
  type PreviewAutomationHost,
  type PreviewAutomationRequest,
  type PreviewAutomationStreamEvent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";

import * as PreviewAutomationBroker from "./PreviewAutomationBroker.ts";
import type { PreviewAccessIdentity } from "../preview/Access.ts";
import * as QaIam from "../qa/QaIam.ts";

const scope = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
  providerSessionId: "provider-session-1",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["preview"] as const),
  principalSubject: "local:root",
  workspaceAdministrator: true,
  issuedAt: 1,
  expiresAt: Number.MAX_SAFE_INTEGER,
};

const rootIdentity: PreviewAccessIdentity = {
  subject: "local:root",
  sessionId: "session-root",
  environmentId: scope.environmentId,
  workspaceAdministrator: true,
};

const qaConversationAccess = (
  subject: string,
  conversationThreadId: ThreadId,
  environmentId: EnvironmentId,
): QaIam.QaConversationAccess => ({
  principal: { id: `principal:${subject}`, subject, displayName: subject },
  organizationId: "organization-1",
  projectId: "project-1",
  projectName: "Project 1",
  role: "qa:maker",
  capabilities: QaIam.capabilitiesForQaProjectRole("qa:maker"),
  releaseThreadId: "release-1",
  conversation: {
    releaseThreadId: "release-1",
    conversationThreadId,
    principalId: `principal:${subject}`,
    environmentId,
  },
});

type AuthorizeConversationInput = Parameters<QaIam.QaIam["Service"]["authorizeConversation"]>[0];

const testQaIam = QaIam.QaIam.of({
  authorizeConversation: (input: AuthorizeConversationInput) =>
    input.subject === "local:qa:maker"
      ? Effect.succeed(
          qaConversationAccess(
            input.subject,
            ThreadId.make(input.conversationThreadId),
            input.environmentId,
          ),
        )
      : Effect.fail(
          new QaIam.QaIamError({
            code: "conversation_not_found",
            message: "No release conversation is bound to this principal.",
          }),
        ),
} as unknown as QaIam.QaIam["Service"]);

const makeBrokerWithQaIam = (qaIam: QaIam.QaIam["Service"]) =>
  PreviewAutomationBroker.make.pipe(
    Effect.map((broker) => ({
      ...broker,
      connect: (host: PreviewAutomationHost, identity?: PreviewAccessIdentity) =>
        broker.connect(host, identity ?? { ...rootIdentity, environmentId: host.environmentId }),
      focusHost: (host: Parameters<typeof broker.focusHost>[0], identity?: PreviewAccessIdentity) =>
        broker.focusHost(host, identity ?? { ...rootIdentity, environmentId: host.environmentId }),
      respond: (response: Parameters<typeof broker.respond>[0], identity = rootIdentity) =>
        broker.respond(response, identity),
    })),
    Effect.provideService(QaIam.QaIam, qaIam),
    Effect.provide(NodeServices.layer),
  );

const makeBroker = makeBrokerWithQaIam(testQaIam);

const makeHost = (overrides: Partial<PreviewAutomationHost> = {}): PreviewAutomationHost => ({
  clientId: "client-1",
  environmentId: scope.environmentId,
  ...overrides,
});

type RoutedRequest = PreviewAutomationRequest & {
  readonly connectionId: PreviewAutomationStreamEvent["connectionId"];
};

const requestsFrom = (
  events: Stream.Stream<PreviewAutomationStreamEvent>,
  onConnected: (connectionId: PreviewAutomationStreamEvent["connectionId"]) => void = () => {},
): Stream.Stream<RoutedRequest> =>
  events.pipe(
    Stream.filterMap((event) => {
      if (event.type === "connected") {
        onConnected(event.connectionId);
        return Result.failVoid;
      }
      return Result.succeed({ ...event.request, connectionId: event.connectionId });
    }),
  );

it.effect("atomically registers a connected host and correlates its response", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(requests, (request) =>
        broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: { available: true },
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const result = yield* broker.invoke<{ available: boolean }>({
        scope,
        operation: "open",
        input: {},
      });

      expect(result).toEqual({ available: true });
    }),
  ),
);

it.effect("targets multiple tabs explicitly while retaining a default tab", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const appTabId = PreviewTabId.make("tab-web-app");
      const simulatorTabId = PreviewTabId.make("tab-ios-simulator");
      const openedTabIds = [appTabId, simulatorTabId];
      let openIndex = 0;
      const routedRequests: RoutedRequest[] = [];
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(requests, (request) => {
        routedRequests.push(request);
        return broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result:
            request.operation === "open"
              ? { available: true, tabId: openedTabIds[openIndex++] }
              : { url: "http://localhost:3200" },
        });
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      yield* broker.invoke({ scope, operation: "open", input: { reuseExistingTab: false } });
      yield* broker.invoke({ scope, operation: "open", input: { reuseExistingTab: false } });
      yield* broker.invoke({ scope, operation: "snapshot", input: {} });
      yield* broker.invoke({ scope, operation: "snapshot", input: {}, tabId: appTabId });
      yield* broker.invoke({ scope, operation: "snapshot", input: {} });

      expect(routedRequests).toHaveLength(5);
      expect(routedRequests[0]?.tabId).toBeUndefined();
      expect(routedRequests[1]?.tabId).toBe(appTabId);
      expect(routedRequests[2]?.tabId).toBe(simulatorTabId);
      expect(routedRequests[2]?.tabIdExplicit).toBe(false);
      expect(routedRequests[3]?.tabId).toBe(appTabId);
      expect(routedRequests[3]?.tabIdExplicit).toBe(true);
      expect(routedRequests[4]?.tabId).toBe(appTabId);
    }),
  ),
);

it.effect("does not let an older response replace a newer explicit tab target", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const olderTabId = PreviewTabId.make("tab-older-request");
      const newerTabId = PreviewTabId.make("tab-newer-request");
      const releaseOlderResponse = yield* Deferred.make<void>();
      const routedRequests: RoutedRequest[] = [];
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(requests, (request) => {
        routedRequests.push(request);
        const response = Effect.gen(function* () {
          if (request.tabId === olderTabId) {
            yield* Deferred.await(releaseOlderResponse);
          }
          yield* broker.respond({
            clientId: "client-1",
            connectionId: request.connectionId,
            requestId: request.requestId,
            ok: true,
            result: { url: "http://localhost:3200" },
          });
          if (request.tabId === newerTabId) {
            yield* Deferred.succeed(releaseOlderResponse, undefined);
          }
        });
        return response.pipe(Effect.forkScoped, Effect.asVoid);
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const older = yield* broker
        .invoke({ scope, operation: "snapshot", input: {}, tabId: olderTabId })
        .pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      const newer = yield* broker
        .invoke({ scope, operation: "snapshot", input: {}, tabId: newerTabId })
        .pipe(Effect.forkScoped);
      yield* Fiber.join(newer);
      yield* Fiber.join(older);
      yield* broker.invoke({ scope, operation: "snapshot", input: {} });

      expect(routedRequests.at(-1)?.tabId).toBe(newerTabId);
    }),
  ),
);

it.effect("does not replace the default tab with a globally stopped recording tab", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const browsingTabId = PreviewTabId.make("tab-session-b");
      const recordingTabId = PreviewTabId.make("tab-session-a-recording");
      const routedRequests: RoutedRequest[] = [];
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(requests, (request) => {
        routedRequests.push(request);
        return broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result:
            request.operation === "open"
              ? { available: true, tabId: browsingTabId }
              : request.operation === "recordingStop"
                ? { id: "recording-1", tabId: recordingTabId }
                : { url: "http://localhost:3200" },
        });
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      yield* broker.invoke({ scope, operation: "open", input: {} });
      yield* broker.invoke({ scope, operation: "recordingStop", input: {} });
      yield* broker.invoke({ scope, operation: "snapshot", input: {} });

      expect(routedRequests.at(-1)?.tabId).toBe(browsingTabId);
    }),
  ),
);

it.effect("does not let a no-tab response suppress an earlier tab decision", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const initialTabId = PreviewTabId.make("tab-initial");
      const openedTabId = PreviewTabId.make("tab-opened-late");
      const releaseOpenResponse = yield* Deferred.make<void>();
      const routedRequests: RoutedRequest[] = [];
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(requests, (request) => {
        routedRequests.push(request);
        const marker =
          typeof request.input === "object" && request.input !== null && "marker" in request.input
            ? request.input.marker
            : undefined;
        const response = Effect.gen(function* () {
          if (marker === "older") {
            yield* Deferred.await(releaseOpenResponse);
          }
          yield* broker.respond({
            clientId: "client-1",
            connectionId: request.connectionId,
            requestId: request.requestId,
            ok: true,
            result:
              request.operation === "open"
                ? { available: true, tabId: marker === "older" ? openedTabId : initialTabId }
                : { url: "http://localhost:3200" },
          });
          if (marker === "newer") {
            yield* Deferred.succeed(releaseOpenResponse, undefined);
          }
        });
        return response.pipe(Effect.forkScoped, Effect.asVoid);
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      yield* broker.invoke({ scope, operation: "open", input: {} });
      const older = yield* broker
        .invoke({
          scope,
          operation: "open",
          input: { marker: "older", reuseExistingTab: false },
        })
        .pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      const newer = yield* broker
        .invoke({ scope, operation: "snapshot", input: { marker: "newer" } })
        .pipe(Effect.forkScoped);
      yield* Fiber.join(newer);
      yield* Fiber.join(older);
      yield* broker.invoke({ scope, operation: "snapshot", input: {} });

      expect(routedRequests.at(-1)?.tabId).toBe(openedTabId);
    }),
  ),
);

it.effect("announces a live replacement stream before delivering requests", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const events = yield* broker.connect(makeHost());
      const receivedTypes: PreviewAutomationStreamEvent["type"][] = [];
      const consumer = yield* events.pipe(
        Stream.take(2),
        Stream.runForEach((event) => {
          receivedTypes.push(event.type);
          return event.type === "connected"
            ? Effect.void
            : broker.respond({
                clientId: "client-1",
                connectionId: event.connectionId,
                requestId: event.request.requestId,
                ok: true,
                result: "ready",
              });
        }),
        Effect.forkScoped,
      );
      yield* Effect.yieldNow;

      const result = yield* broker.invoke<string>({ scope, operation: "status", input: {} });
      yield* Fiber.join(consumer);

      expect(receivedTypes).toEqual(["connected", "request"]);
      expect(result).toBe("ready");
    }),
  ),
);

it.effect("preserves bounded request and remote selector diagnostics", () => {
  const locator = "role=button[name='request-secret']";
  const remoteMessage = "Unexpected token near remote-secret.";
  const remoteError = {
    _tag: "PreviewAutomationInvalidSelectorError",
    message: remoteMessage,
    detail: { selector: "role=button[name='remote-secret']" },
  } as const;

  return Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(requests, (request) =>
        broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: false,
          error: remoteError,
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const error = yield* broker
        .invoke<void>({
          scope,
          operation: "click",
          input: { locator },
          tabId: PreviewTabId.make("tab-1"),
          timeoutMs: 1_234,
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(PreviewAutomationInvalidSelectorError);
      expect(error).toMatchObject({
        operation: "click",
        environmentId: scope.environmentId,
        threadId: scope.threadId,
        providerSessionId: scope.providerSessionId,
        providerInstanceId: scope.providerInstanceId,
        clientId: "client-1",
        requestId: "preview-0",
        tabId: "tab-1",
        timeoutMs: 1_234,
        selectorKind: "locator",
        selectorLength: locator.length,
        remoteTag: "PreviewAutomationInvalidSelectorError",
        remoteMessageLength: remoteMessage.length,
        remoteDetailKind: "object",
      });
      expect(error.message).toBe(
        `Preview automation click received an invalid locator (${locator.length} characters).`,
      );
      expect(error.message).not.toContain("secret");
      expect(error.cause).toBe(remoteError);
      expect("selector" in error).toBe(false);
      expect("remoteMessage" in error).toBe(false);
      expect("remoteDetail" in error).toBe(false);
    }),
  );
});

it.effect("classifies a remote non-editable target without collapsing it to execution", () => {
  const remoteError = {
    _tag: "PreviewAutomationTargetNotEditableError",
    message: "remote target details",
    detail: { selectorKind: "focused-element" },
  } as const;

  return Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(requests, (request) =>
        broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: false,
          error: remoteError,
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const error = yield* broker
        .invoke<void>({
          scope,
          operation: "type",
          input: { text: "hello" },
          tabId: PreviewTabId.make("tab-1"),
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(PreviewAutomationTargetNotEditableError);
      expect(error).toMatchObject({
        operation: "type",
        tabId: "tab-1",
        selectorKind: "focused-element",
        remoteTag: "PreviewAutomationTargetNotEditableError",
      });
      expect(error.message).toBe("Preview automation type requires an editable focused element.");
    }),
  );
});

it.effect("distinguishes malformed remote failures", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(requests, (request) =>
        broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: false,
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const error = yield* broker
        .invoke<void>({ scope, operation: "status", input: {}, timeoutMs: 2_000 })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(PreviewAutomationMalformedResponseError);
      expect(error).toMatchObject({
        operation: "status",
        environmentId: scope.environmentId,
        threadId: scope.threadId,
        providerSessionId: scope.providerSessionId,
        providerInstanceId: scope.providerInstanceId,
        clientId: "client-1",
        requestId: "preview-0",
        timeoutMs: 2_000,
      });
    }),
  ),
);

it.effect("rejects calls when no connected host exists", () =>
  Effect.gen(function* () {
    const broker = yield* makeBroker;
    const error = yield* broker
      .invoke<void>({ scope, operation: "status", input: {} })
      .pipe(Effect.flip);

    expect(error).toBeInstanceOf(PreviewAutomationNoAvailableHostError);
    expect(error).toMatchObject({
      operation: "status",
      environmentId: scope.environmentId,
      threadId: scope.threadId,
      providerSessionId: scope.providerSessionId,
      providerInstanceId: scope.providerInstanceId,
    });
  }),
);

it.effect("does not create host state from focus updates without a live stream", () =>
  Effect.gen(function* () {
    const broker = yield* makeBroker;
    yield* broker.focusHost({
      clientId: "client-1",
      environmentId: scope.environmentId,
      connectionId: "connection-missing",
      focused: true,
    });

    const error = yield* broker
      .invoke<void>({ scope, operation: "status", input: {} })
      .pipe(Effect.flip);
    expect(error).toBeInstanceOf(PreviewAutomationNoAvailableHostError);
  }),
);

it.effect("removes host availability when the authoritative request stream disconnects", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      const beforeAcquisition = yield* broker
        .invoke<void>({ scope, operation: "status", input: {} })
        .pipe(Effect.flip);
      expect(beforeAcquisition).toBeInstanceOf(PreviewAutomationNoAvailableHostError);

      const consumer = yield* Stream.runDrain(requests).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(consumer);

      const error = yield* broker
        .invoke<void>({ scope, operation: "status", input: {} })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(PreviewAutomationNoAvailableHostError);
    }),
  ),
);

it.effect("routes requests for background threads through an environment-level host", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const backgroundThreadId = ThreadId.make("thread-background");
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      let routedThreadId: string | undefined;
      yield* Stream.runForEach(requests, (request) => {
        routedThreadId = request.threadId;
        return broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "background",
        });
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const result = yield* broker.invoke<string>({
        scope: {
          ...scope,
          threadId: backgroundThreadId,
          providerSessionId: "provider-session-background",
        },
        operation: "status",
        input: {},
      });

      expect(result).toBe("background");
      expect(routedThreadId).toBe(backgroundThreadId);
    }),
  ),
);

it.effect("never routes a provider session to a host from another environment", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const matchingRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "client-matching" })),
      );
      const foreignRequests = requestsFrom(
        yield* broker.connect(
          makeHost({
            clientId: "client-foreign",
            environmentId: EnvironmentId.make("environment-foreign"),
          }),
        ),
      );
      yield* Stream.runForEach(matchingRequests, (request) =>
        broker.respond({
          clientId: "client-matching",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "matching",
        }),
      ).pipe(Effect.forkScoped);
      yield* Stream.runForEach(foreignRequests, (request) =>
        broker.respond({
          clientId: "client-foreign",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "foreign",
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      expect(yield* broker.invoke<string>({ scope, operation: "status", input: {} })).toBe(
        "matching",
      );
    }),
  ),
);

it.effect("routes QA automation only to a host owned by the invocation principal", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const makerIdentity: PreviewAccessIdentity = {
        ...rootIdentity,
        subject: "local:qa:maker",
        sessionId: "session-maker",
        workspaceAdministrator: false,
      };
      const approverIdentity: PreviewAccessIdentity = {
        ...rootIdentity,
        subject: "local:qa:approver",
        sessionId: "session-approver",
        workspaceAdministrator: false,
      };
      let approverRequests = 0;
      const makerRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "shared-client-id" }), makerIdentity),
      );
      const approverRequestsStream = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "shared-client-id" }), approverIdentity),
      );
      yield* Stream.runForEach(makerRequests, (request) =>
        broker.respond(
          {
            clientId: "shared-client-id",
            connectionId: request.connectionId,
            requestId: request.requestId,
            ok: true,
            result: "maker",
          },
          makerIdentity,
        ),
      ).pipe(Effect.forkScoped);
      yield* Stream.runForEach(approverRequestsStream, (request) => {
        approverRequests += 1;
        return broker.respond(
          {
            clientId: "shared-client-id",
            connectionId: request.connectionId,
            requestId: request.requestId,
            ok: true,
            result: "approver",
          },
          approverIdentity,
        );
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const result = yield* broker.invoke<string>({
        scope: {
          ...scope,
          principalSubject: makerIdentity.subject,
          workspaceAdministrator: false,
          qaPrincipalSubject: makerIdentity.subject,
          qaReleaseThreadId: ThreadId.make("release-1"),
          providerSessionId: "provider-session-maker",
        },
        operation: "status",
        input: {},
      });

      expect(result).toBe("maker");
      expect(approverRequests).toBe(0);
    }),
  ),
);

it.effect("denies a generic non-administrator MCP principal instead of treating it as root", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      yield* Stream.runDrain(yield* broker.connect(makeHost())).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const result = yield* broker
        .invoke<void>({
          scope: {
            ...scope,
            principalSubject: "local:generic-user",
            workspaceAdministrator: false,
            providerSessionId: "provider-session-generic-user",
          },
          operation: "status",
          input: {},
        })
        .pipe(Effect.result);

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(PreviewAutomationUnavailableError);
      }
    }),
  ),
);

it.effect("rechecks live QA release access on every automation invocation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const makerIdentity: PreviewAccessIdentity = {
        ...rootIdentity,
        subject: "local:qa:maker",
        sessionId: "session-maker-live-authorization",
        workspaceAdministrator: false,
      };
      let releaseAccessActive = true;
      const liveQaIam = QaIam.QaIam.of({
        authorizeConversation: (input: AuthorizeConversationInput) =>
          Effect.suspend(() =>
            releaseAccessActive
              ? Effect.succeed(
                  qaConversationAccess(
                    input.subject,
                    ThreadId.make(input.conversationThreadId),
                    input.environmentId,
                  ),
                )
              : Effect.fail(
                  new QaIam.QaIamError({
                    code: "project_access_denied",
                    message: "The principal is no longer assigned to this QA project.",
                  }),
                ),
          ),
      } as unknown as QaIam.QaIam["Service"]);
      const broker = yield* makeBrokerWithQaIam(liveQaIam);
      const requests = requestsFrom(yield* broker.connect(makeHost(), makerIdentity));
      let routedRequests = 0;
      yield* Stream.runForEach(requests, (request) => {
        routedRequests += 1;
        return broker.respond(
          {
            clientId: "client-1",
            connectionId: request.connectionId,
            requestId: request.requestId,
            ok: true,
            result: "authorized",
          },
          makerIdentity,
        );
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const qaScope = {
        ...scope,
        principalSubject: makerIdentity.subject,
        workspaceAdministrator: false,
        qaPrincipalSubject: makerIdentity.subject,
        qaReleaseThreadId: ThreadId.make("release-1"),
        providerSessionId: "provider-session-live-authorization",
      };
      expect(yield* broker.invoke<string>({ scope: qaScope, operation: "status", input: {} })).toBe(
        "authorized",
      );

      releaseAccessActive = false;
      const result = yield* broker
        .invoke<void>({ scope: qaScope, operation: "status", input: {} })
        .pipe(Effect.result);

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(PreviewAutomationUnavailableError);
      }
      expect(routedRequests).toBe(1);
    }),
  ),
);

it.effect("rejects stale QA release bindings before routing automation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const makerIdentity: PreviewAccessIdentity = {
        ...rootIdentity,
        subject: "local:qa:maker",
        sessionId: "session-maker-stale-binding",
        workspaceAdministrator: false,
      };
      let routedRequests = 0;
      const requests = requestsFrom(yield* broker.connect(makeHost(), makerIdentity));
      yield* Stream.runForEach(requests, () => {
        routedRequests += 1;
        return Effect.void;
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const result = yield* broker
        .invoke<void>({
          scope: {
            ...scope,
            principalSubject: makerIdentity.subject,
            workspaceAdministrator: false,
            qaPrincipalSubject: makerIdentity.subject,
            qaReleaseThreadId: ThreadId.make("release-stale"),
            providerSessionId: "provider-session-stale-binding",
          },
          operation: "status",
          input: {},
        })
        .pipe(Effect.result);

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(PreviewAutomationUnavailableError);
      }
      expect(routedRequests).toBe(0);
    }),
  ),
);

it.effect("ignores automation responses from a different authenticated session", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const events = requestsFrom(yield* broker.connect(makeHost(), rootIdentity));
      yield* Stream.runForEach(events, (request) =>
        broker
          .respond(
            {
              clientId: "client-1",
              connectionId: request.connectionId,
              requestId: request.requestId,
              ok: true,
              result: "forged",
            },
            { ...rootIdentity, sessionId: "session-foreign" },
          )
          .pipe(
            Effect.andThen(
              broker.respond(
                {
                  clientId: "client-1",
                  connectionId: request.connectionId,
                  requestId: request.requestId,
                  ok: true,
                  result: "owner",
                },
                rootIdentity,
              ),
            ),
          ),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      expect(yield* broker.invoke<string>({ scope, operation: "status", input: {} })).toBe("owner");
    }),
  ),
);

it.effect("pins a provider session to its initial host despite later focus changes", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      let firstConnectionId = "";
      let secondConnectionId = "";
      const firstRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "client-first" })),
        (connectionId) => {
          firstConnectionId = connectionId;
        },
      );
      const secondRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "client-second" })),
        (connectionId) => {
          secondConnectionId = connectionId;
        },
      );
      yield* Stream.runForEach(firstRequests, (request) =>
        broker.respond({
          clientId: "client-first",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "first",
        }),
      ).pipe(Effect.forkScoped);
      yield* Stream.runForEach(secondRequests, (request) =>
        broker.respond({
          clientId: "client-second",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "second",
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      yield* broker.focusHost({
        clientId: "client-first",
        environmentId: scope.environmentId,
        connectionId: "connection-stale",
        focused: true,
      });
      expect(yield* broker.invoke<string>({ scope, operation: "status", input: {} })).toBe(
        "second",
      );
      yield* broker.focusHost({
        clientId: "client-first",
        environmentId: scope.environmentId,
        connectionId: firstConnectionId,
        focused: true,
      });

      const firstPinnedScope = {
        ...scope,
        providerSessionId: "provider-session-first-pinned",
      };
      expect(
        yield* broker.invoke<string>({ scope: firstPinnedScope, operation: "status", input: {} }),
      ).toBe("first");

      yield* broker.focusHost({
        clientId: "client-second",
        environmentId: scope.environmentId,
        connectionId: secondConnectionId,
        focused: true,
      });

      expect(
        yield* broker.invoke<string>({ scope: firstPinnedScope, operation: "status", input: {} }),
      ).toBe("first");
      expect(
        yield* broker.invoke<string>({
          scope: { ...scope, providerSessionId: "provider-session-second-pinned" },
          operation: "status",
          input: {},
        }),
      ).toBe("second");
    }),
  ),
);

it.effect("does not route new operations to legacy hosts that did not advertise support", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const legacyEvents = yield* broker.connect(makeHost());
      yield* Stream.runDrain(legacyEvents).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const error = yield* broker
        .invoke<void>({ scope, operation: "resize", input: { mode: "fill" } })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(PreviewAutomationNoAvailableHostError);
      expect(error).toMatchObject({ operation: "resize", environmentId: scope.environmentId });
    }),
  ),
);

it.effect("routes resize to a capable host instead of a newer legacy connection", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const capableRequests = requestsFrom(
        yield* broker.connect(
          makeHost({ clientId: "client-capable", supportedOperations: ["resize"] }),
        ),
      );
      const legacyRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "client-legacy" })),
      );
      yield* Stream.runForEach(capableRequests, (request) =>
        broker.respond({
          clientId: "client-capable",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "capable",
        }),
      ).pipe(Effect.forkScoped);
      yield* Stream.runForEach(legacyRequests, (request) =>
        broker.respond({
          clientId: "client-legacy",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "legacy",
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      expect(
        yield* broker.invoke<string>({ scope, operation: "resize", input: { mode: "fill" } }),
      ).toBe("capable");
    }),
  ),
);

it.effect("does not move a live legacy assignment to another runtime for resize", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const legacyRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "client-legacy" })),
      );
      yield* Stream.runForEach(legacyRequests, (request) =>
        broker.respond({
          clientId: "client-legacy",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "legacy",
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      expect(yield* broker.invoke<string>({ scope, operation: "status", input: {} })).toBe(
        "legacy",
      );

      const capableRequests = requestsFrom(
        yield* broker.connect(
          makeHost({ clientId: "client-capable", supportedOperations: ["resize"] }),
        ),
      );
      yield* Stream.runForEach(capableRequests, (request) =>
        broker.respond({
          clientId: "client-capable",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "capable",
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const error = yield* broker
        .invoke<void>({ scope, operation: "resize", input: { mode: "fill" } })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(PreviewAutomationNoAvailableHostError);
      expect(yield* broker.invoke<string>({ scope, operation: "status", input: {} })).toBe(
        "legacy",
      );
    }),
  ),
);

it.effect("ignores stale focus updates for a different environment", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      let firstConnectionId = "";
      const firstRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "client-first" })),
        (connectionId) => {
          firstConnectionId = connectionId;
        },
      );
      const secondRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "client-second" })),
      );
      yield* Stream.runForEach(firstRequests, (request) =>
        broker.respond({
          clientId: "client-first",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "first",
        }),
      ).pipe(Effect.forkScoped);
      yield* Stream.runForEach(secondRequests, (request) =>
        broker.respond({
          clientId: "client-second",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "second",
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      yield* broker.focusHost({
        clientId: "client-first",
        environmentId: EnvironmentId.make("environment-stale"),
        connectionId: firstConnectionId,
        focused: true,
      });

      expect(yield* broker.invoke<string>({ scope, operation: "status", input: {} })).toBe(
        "second",
      );
    }),
  ),
);

it.effect("fails over a pinned provider session only after its host disconnects", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const firstTabId = PreviewTabId.make("tab-on-first-host");
      let firstConnectionId = "";
      let secondRoutedTabId: PreviewTabId | undefined;
      const firstRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "client-first" })),
        (connectionId) => {
          firstConnectionId = connectionId;
        },
      );
      const secondRequests = requestsFrom(
        yield* broker.connect(makeHost({ clientId: "client-second" })),
      );
      const firstConsumer = yield* Stream.runForEach(firstRequests, (request) =>
        broker.respond({
          clientId: "client-first",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: request.operation === "open" ? { host: "first", tabId: firstTabId } : "first",
        }),
      ).pipe(Effect.forkScoped);
      yield* Stream.runForEach(secondRequests, (request) => {
        secondRoutedTabId = request.tabId;
        return broker.respond({
          clientId: "client-second",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "second",
        });
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      yield* broker.focusHost({
        clientId: "client-first",
        environmentId: scope.environmentId,
        connectionId: firstConnectionId,
        focused: true,
      });
      expect(yield* broker.invoke({ scope, operation: "open", input: {} })).toEqual({
        host: "first",
        tabId: firstTabId,
      });

      yield* Fiber.interrupt(firstConsumer);
      yield* Effect.yieldNow;

      expect(yield* broker.invoke<string>({ scope, operation: "status", input: {} })).toBe(
        "second",
      );
      expect(secondRoutedTabId).toBeUndefined();
    }),
  ),
);

it.effect("lets the browser host resolve an active tab locally", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      let routedTabId: string | undefined;
      yield* Stream.runForEach(requests, (request) => {
        routedTabId = request.tabId;
        return broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
        });
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      yield* broker.invoke<void>({ scope, operation: "click", input: { x: 10, y: 10 } });

      expect(routedTabId).toBeUndefined();
    }),
  ),
);

it.effect("keeps a replacement stream authoritative when the old stream finalizes", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      let firstConnectionId = "";
      let replacementConnectionId = "";
      const firstRequests = requestsFrom(yield* broker.connect(makeHost()), (connectionId) => {
        firstConnectionId = connectionId;
      });
      yield* Stream.runDrain(firstRequests).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const replacementRequests = requestsFrom(
        yield* broker.connect(makeHost()),
        (connectionId) => {
          replacementConnectionId = connectionId;
        },
      );
      yield* Stream.runForEach(replacementRequests, (request) =>
        broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "replacement",
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      expect(replacementConnectionId).not.toBe(firstConnectionId);
      const result = yield* broker.invoke<string>({ scope, operation: "status", input: {} });
      expect(result).toBe("replacement");
    }),
  ),
);

it.effect("does not carry a tab id across a replacement automation stream", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const openedTabId = PreviewTabId.make("tab-first-webcontents");
      const firstRequests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(firstRequests, (request) =>
        broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result:
            request.operation === "open"
              ? { host: "first", tabId: openedTabId }
              : { host: "first" },
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      expect(yield* broker.invoke({ scope, operation: "open", input: {} })).toEqual({
        host: "first",
        tabId: openedTabId,
      });

      const routedRequests: RoutedRequest[] = [];
      const replacementRequests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(replacementRequests, (request) => {
        routedRequests.push(request);
        return broker.respond({
          clientId: "client-1",
          connectionId: request.connectionId,
          requestId: request.requestId,
          ok: true,
          result: "replacement",
        });
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      expect(yield* broker.invoke<string>({ scope, operation: "status", input: {} })).toBe(
        "replacement",
      );
      expect(routedRequests.at(-1)?.tabId).toBeUndefined();
    }),
  ),
);

it.effect("fails requests assigned to the stream that is replaced", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runDrain(requests).pipe(Effect.forkScoped);
      const pending = yield* broker
        .invoke<void>({ scope, operation: "status", input: {} })
        .pipe(Effect.flip, Effect.forkScoped);
      yield* Effect.yieldNow;

      const replacementRequests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runDrain(replacementRequests).pipe(Effect.forkScoped);

      const error = yield* Fiber.join(pending);
      expect(error).toBeInstanceOf(PreviewAutomationClientDisconnectedError);
      expect(error).toMatchObject({
        operation: "status",
        environmentId: scope.environmentId,
        threadId: scope.threadId,
        providerSessionId: scope.providerSessionId,
        providerInstanceId: scope.providerInstanceId,
        clientId: "client-1",
        requestId: "preview-0",
        timeoutMs: 15_000,
      });
    }),
  ),
);

it.effect("accepts responses only from the host that received the request", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const requests = requestsFrom(yield* broker.connect(makeHost()));
      yield* Stream.runForEach(requests, (request) =>
        Effect.gen(function* () {
          yield* broker.respond({
            clientId: "client-foreign",
            connectionId: request.connectionId,
            requestId: request.requestId,
            ok: true,
            result: "foreign",
          });
          yield* broker.respond({
            clientId: "client-1",
            connectionId: "connection-stale",
            requestId: request.requestId,
            ok: true,
            result: "stale",
          });
          yield* broker.respond({
            clientId: "client-1",
            connectionId: request.connectionId,
            requestId: request.requestId,
            ok: true,
            result: "owner",
          });
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const result = yield* broker.invoke<string>({ scope, operation: "status", input: {} });
      expect(result).toBe("owner");
    }),
  ),
);
