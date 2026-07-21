import {
  AuthOrchestrationOperateScope,
  AuthPreviewOperateScope,
  AuthQaChatScope,
  AuthQaMakeScope,
  AuthQaReadScope,
  type AuthEnvironmentScope,
  type AuthSessionId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as SessionStore from "../auth/SessionStore.ts";
import * as QaIam from "../qa/QaIam.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";
import * as McpProviderSession from "./McpProviderSession.ts";

export interface McpCredentialRequest {
  readonly threadId: ThreadId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly initiatingSessionId: AuthSessionId;
}

export interface McpIssuedCredential {
  readonly config: McpProviderSession.McpProviderSessionConfig;
  readonly expiresAt: number;
}

export interface McpCurrentThreadAuthorizationRequest {
  readonly threadId: ThreadId;
  readonly initiatingSessionId: AuthSessionId;
}

export class McpSessionRegistryUnavailableError extends Schema.TaggedErrorClass<McpSessionRegistryUnavailableError>()(
  "McpSessionRegistryUnavailableError",
  {
    message: Schema.String,
  },
) {}

export class McpSessionAuthorizationError extends Schema.TaggedErrorClass<McpSessionAuthorizationError>()(
  "McpSessionAuthorizationError",
  {
    message: Schema.String,
    initiatingSessionId: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export type McpActiveCredentialIssueError =
  | QaIam.QaIamError
  | McpSessionAuthorizationError
  | McpSessionRegistryUnavailableError;

export interface McpSessionRegistryShape {
  readonly issue: (
    request: McpCredentialRequest,
  ) => Effect.Effect<McpIssuedCredential, QaIam.QaIamError | McpSessionAuthorizationError>;
  readonly resolve: (
    rawToken: string,
  ) => Effect.Effect<McpInvocationContext.McpInvocationScope | undefined>;
  readonly validateCurrentThreadAuthorization: (
    request: McpCurrentThreadAuthorizationRequest,
  ) => Effect.Effect<boolean>;
  readonly revokeProviderSession: (providerSessionId: string) => Effect.Effect<void>;
  readonly revokeThread: (threadId: ThreadId) => Effect.Effect<void>;
  readonly revokeAll: Effect.Effect<void>;
}

export class McpSessionRegistry extends Context.Service<
  McpSessionRegistry,
  McpSessionRegistryShape
>()("t3/mcp/McpSessionRegistry") {}

interface CredentialRecord {
  readonly tokenHash: string;
  readonly initiatingSessionId: AuthSessionId;
  readonly scope: McpInvocationContext.McpInvocationScope;
  readonly lastUsedAt: number;
}

interface RegistryState {
  readonly records: ReadonlyMap<string, CredentialRecord>;
}

export interface McpSessionRegistryOptions {
  readonly idleTimeoutMs?: number;
  readonly maximumLifetimeMs?: number;
  readonly now?: () => number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
const DEFAULT_MAXIMUM_LIFETIME_MS = 8 * 60 * 60 * 1_000;
const STANDARD_WORKSPACE_ADMINISTRATOR_SUBJECT = "local:root";

const hasScope = (
  scopes: ReadonlyArray<AuthEnvironmentScope>,
  scope: AuthEnvironmentScope,
): boolean => scopes.includes(scope);

const isAuthorizationDenial = (cause: QaIam.QaIamError): boolean =>
  cause.code === "principal_not_found" ||
  cause.code === "project_access_denied" ||
  cause.code === "capability_denied" ||
  cause.code === "release_not_found" ||
  cause.code === "conversation_not_found" ||
  cause.code === "conversation_access_denied";

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const tokenFromBytes = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

const getHttpMcpEndpointHost = (hostname: string): string => {
  const normalized = hostname.toLowerCase();
  const endpointHostname =
    normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]"
      ? "127.0.0.1"
      : hostname;
  return endpointHostname.includes(":") && !endpointHostname.startsWith("[")
    ? `[${endpointHostname}]`
    : endpointHostname;
};

const makeWithOptions = Effect.fn("McpSessionRegistry.make")(function* (
  options: McpSessionRegistryOptions = {},
) {
  const crypto = yield* Crypto.Crypto;
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const qaIam = yield* QaIam.QaIam;
  const sessions = yield* SessionStore.SessionStore;
  const environmentId = yield* environment.getEnvironmentId;
  const httpServer = yield* HttpServer.HttpServer;
  const state = yield* SynchronizedRef.make<RegistryState>({ records: new Map() });
  const currentTimeMillis = options.now ? Effect.sync(options.now) : Clock.currentTimeMillis;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const maximumLifetimeMs = options.maximumLifetimeMs ?? DEFAULT_MAXIMUM_LIFETIME_MS;
  const endpoint =
    httpServer.address._tag === "TcpAddress"
      ? `http://${getHttpMcpEndpointHost(httpServer.address.hostname)}:${httpServer.address.port}/mcp`
      : "http://127.0.0.1/mcp";

  const hashToken = (token: string) =>
    crypto
      .digest("SHA-256", new TextEncoder().encode(token))
      .pipe(Effect.map(bytesToHex), Effect.orDie);

  const pruneExpired = (
    records: ReadonlyMap<string, CredentialRecord>,
    timestamp: number,
  ): ReadonlyMap<string, CredentialRecord> => {
    const next = new Map<string, CredentialRecord>();
    for (const [tokenHash, record] of records) {
      if (timestamp <= record.scope.expiresAt && timestamp - record.lastUsedAt <= idleTimeoutMs) {
        next.set(tokenHash, record);
        continue;
      }
      McpProviderSession.clearMcpProviderSessionIfCurrent(
        record.scope.threadId,
        record.scope.providerSessionId,
      );
    }
    return next.size === records.size ? records : next;
  };

  const removeWhere = (
    records: ReadonlyMap<string, CredentialRecord>,
    predicate: (record: CredentialRecord) => boolean,
  ): ReadonlyMap<string, CredentialRecord> => {
    const next = new Map<string, CredentialRecord>();
    for (const [tokenHash, record] of records) {
      if (predicate(record)) {
        McpProviderSession.clearMcpProviderSessionIfCurrent(
          record.scope.threadId,
          record.scope.providerSessionId,
        );
      } else {
        next.set(tokenHash, record);
      }
    }
    return next;
  };

  const resolveCanonicalAuthorization = Effect.fn(
    "McpSessionRegistry.resolveCanonicalAuthorization",
  )(function* (request: McpCurrentThreadAuthorizationRequest) {
    const initiatingSessionId = request.initiatingSessionId;
    if (initiatingSessionId === undefined) {
      return yield* new McpSessionAuthorizationError({
        message: "Provider credentials require authenticated session provenance.",
      });
    }
    const initiatingSession = yield* sessions.resolveActiveAuthorization(initiatingSessionId).pipe(
      Effect.mapError(
        (cause) =>
          new McpSessionAuthorizationError({
            message: "The authenticated session that initiated this provider turn is inactive.",
            initiatingSessionId,
            cause,
          }),
      ),
    );
    const qaContext = yield* qaIam
      .resolveConversationContext({
        conversationThreadId: request.threadId,
        environmentId,
      })
      .pipe(
        Effect.map(Option.some),
        Effect.catch((cause) =>
          cause.code === "conversation_not_found"
            ? Effect.succeed(Option.none())
            : Effect.fail(cause),
        ),
      );
    const authorizeQaCapability = (capability: "qa:chat" | "qa:read" | "qa:make") =>
      qaIam.authorizeConversation({
        subject: initiatingSession.subject,
        conversationThreadId: request.threadId,
        environmentId,
        capability,
      });

    if (Option.isSome(qaContext)) {
      if (!hasScope(initiatingSession.scopes, AuthQaChatScope)) {
        return yield* new McpSessionAuthorizationError({
          message:
            "The authenticated session lacks the transport scope required to open this QA conversation.",
          initiatingSessionId,
        });
      }
      // A provider can observe the entire conversation even when it receives no QA MCP
      // capabilities. Require principal-specific live conversation access before starting it.
      yield* authorizeQaCapability("qa:chat");
    } else if (!hasScope(initiatingSession.scopes, AuthOrchestrationOperateScope)) {
      return yield* new McpSessionAuthorizationError({
        message:
          "The authenticated session lacks the transport scope required to operate this workspace thread.",
        initiatingSessionId,
      });
    }

    const workspaceAdministrator =
      initiatingSession.subject === STANDARD_WORKSPACE_ADMINISTRATOR_SUBJECT;
    const authorizationContext: McpProviderSession.McpProviderSessionAuthorizationContext =
      Option.match(qaContext, {
        onNone: () => ({
          kind: "standard",
          principalSubject: initiatingSession.subject,
          workspaceAdministrator,
        }),
        onSome: (context) => ({
          kind: "qa-release",
          releaseThreadId: ThreadId.make(context.releaseThreadId),
          principalSubject: initiatingSession.subject,
          workspaceAdministrator,
        }),
      });
    const capabilities = new Set<McpInvocationContext.McpCapability>();
    if (hasScope(initiatingSession.scopes, AuthPreviewOperateScope)) {
      capabilities.add("preview");
    }
    if (Option.isSome(qaContext)) {
      const hasQaCapability = (capability: "qa:read" | "qa:make") =>
        authorizeQaCapability(capability).pipe(
          Effect.as(true),
          Effect.catch((cause) =>
            isAuthorizationDenial(cause) ? Effect.succeed(false) : Effect.fail(cause),
          ),
        );
      if (
        hasScope(initiatingSession.scopes, AuthQaReadScope) &&
        (yield* hasQaCapability("qa:read"))
      ) {
        capabilities.add("qa:read");
      }
      if (
        hasScope(initiatingSession.scopes, AuthQaMakeScope) &&
        (yield* hasQaCapability("qa:make"))
      ) {
        capabilities.add("qa:make");
      }
    }
    return {
      initiatingSession,
      qaContext,
      authorizationContext,
      capabilities,
    } as const;
  });

  const hasSameCapabilities = (
    left: ReadonlySet<McpInvocationContext.McpCapability>,
    right: ReadonlySet<McpInvocationContext.McpCapability>,
  ): boolean =>
    left.size === right.size && Array.from(left).every((capability) => right.has(capability));

  const matchesCanonicalAuthorization = (
    record: CredentialRecord,
    config: McpProviderSession.McpProviderSessionConfig,
    canonical: Effect.Success<ReturnType<typeof resolveCanonicalAuthorization>>,
  ): boolean => {
    const context = canonical.authorizationContext;
    const cachedContext = config.authorizationContext;
    if (
      record.initiatingSessionId !== config.initiatingSessionId ||
      config.environmentId !== environmentId ||
      config.threadId !== record.scope.threadId ||
      config.providerSessionId !== record.scope.providerSessionId ||
      config.providerInstanceId !== record.scope.providerInstanceId ||
      record.scope.environmentId !== environmentId ||
      record.scope.principalSubject !== canonical.initiatingSession.subject ||
      record.scope.workspaceAdministrator !== context.workspaceAdministrator ||
      cachedContext.kind !== context.kind ||
      cachedContext.principalSubject !== context.principalSubject ||
      cachedContext.workspaceAdministrator !== context.workspaceAdministrator ||
      !hasSameCapabilities(record.scope.capabilities, canonical.capabilities)
    ) {
      return false;
    }
    if (context.kind === "standard") {
      return (
        record.scope.qaReleaseThreadId === undefined &&
        record.scope.qaPrincipalSubject === undefined
      );
    }
    return (
      cachedContext.kind === "qa-release" &&
      cachedContext.releaseThreadId === context.releaseThreadId &&
      record.scope.qaReleaseThreadId === context.releaseThreadId &&
      record.scope.qaPrincipalSubject === canonical.initiatingSession.subject
    );
  };

  const issue: McpSessionRegistryShape["issue"] = Effect.fn("McpSessionRegistry.issue")(
    function* (request) {
      const initiatingSessionId = request.initiatingSessionId;
      const canonical = yield* resolveCanonicalAuthorization(request);
      const issuedAt = yield* currentTimeMillis;
      const providerSessionId = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
      const rawToken = yield* crypto.randomBytes(32).pipe(Effect.map(tokenFromBytes), Effect.orDie);
      const tokenHash = yield* hashToken(rawToken);
      const expiresAt = issuedAt + maximumLifetimeMs;
      const scope: McpInvocationContext.McpInvocationScope = {
        environmentId,
        threadId: ThreadId.make(request.threadId),
        providerSessionId,
        providerInstanceId: ProviderInstanceId.make(request.providerInstanceId),
        capabilities: canonical.capabilities,
        principalSubject: canonical.authorizationContext.principalSubject,
        workspaceAdministrator: canonical.authorizationContext.workspaceAdministrator,
        ...(Option.isSome(canonical.qaContext)
          ? {
              qaReleaseThreadId: ThreadId.make(canonical.qaContext.value.releaseThreadId),
              qaPrincipalSubject: canonical.initiatingSession.subject,
            }
          : {}),
        issuedAt,
        expiresAt,
      };
      const config: McpProviderSession.McpProviderSessionConfig = {
        initiatingSessionId,
        environmentId,
        threadId: scope.threadId,
        providerSessionId,
        providerInstanceId: scope.providerInstanceId,
        endpoint,
        authorizationHeader: `Bearer ${rawToken}`,
        authorizationContext: canonical.authorizationContext,
      };
      yield* SynchronizedRef.modifyEffect(state, ({ records }) =>
        Effect.sync(() => {
          const next = new Map(
            removeWhere(
              pruneExpired(records, issuedAt),
              (record) => record.scope.threadId === request.threadId,
            ),
          );
          next.set(tokenHash, {
            tokenHash,
            initiatingSessionId,
            scope,
            lastUsedAt: issuedAt,
          });
          McpProviderSession.setMcpProviderSession(config);
          return [undefined, { records: next }] as const;
        }),
      );
      return {
        config,
        expiresAt,
      };
    },
  );

  const validateCurrentThreadAuthorization: McpSessionRegistryShape["validateCurrentThreadAuthorization"] =
    Effect.fn("McpSessionRegistry.validateCurrentThreadAuthorization")(function* (request) {
      const timestamp = yield* currentTimeMillis;
      return yield* SynchronizedRef.modifyEffect(state, ({ records }) => {
        const current = pruneExpired(records, timestamp);
        const config = McpProviderSession.readMcpProviderSession(request.threadId);
        const entry =
          config === undefined
            ? undefined
            : Array.from(current.entries()).find(
                ([, record]) =>
                  record.scope.threadId === request.threadId &&
                  record.scope.providerSessionId === config.providerSessionId,
              );
        const invalidate = () => {
          const next = removeWhere(current, (record) => record.scope.threadId === request.threadId);
          McpProviderSession.clearMcpProviderSession(request.threadId);
          return [false, { records: next }] as const;
        };
        if (
          config === undefined ||
          entry === undefined ||
          config.initiatingSessionId !== request.initiatingSessionId ||
          entry[1].initiatingSessionId !== request.initiatingSessionId
        ) {
          return Effect.succeed(invalidate());
        }
        return resolveCanonicalAuthorization(request).pipe(
          Effect.option,
          Effect.map((canonical) => {
            if (
              Option.isNone(canonical) ||
              !matchesCanonicalAuthorization(entry[1], config, canonical.value)
            ) {
              return invalidate();
            }
            const next = new Map(current);
            next.set(entry[0], { ...entry[1], lastUsedAt: timestamp });
            return [true, { records: next }] as const;
          }),
        );
      });
    });

  const resolve: McpSessionRegistryShape["resolve"] = Effect.fn("McpSessionRegistry.resolve")(
    function* (rawToken) {
      if (rawToken.length === 0) return undefined;
      const tokenHash = yield* hashToken(rawToken);
      const timestamp = yield* currentTimeMillis;
      const candidate = yield* SynchronizedRef.modify(state, ({ records }) => {
        const current = pruneExpired(records, timestamp);
        return [current.get(tokenHash), { records: current }] as const;
      });
      if (!candidate) return undefined;
      const config = McpProviderSession.readMcpProviderSession(candidate.scope.threadId);
      const canonical = yield* resolveCanonicalAuthorization({
        threadId: candidate.scope.threadId,
        initiatingSessionId: candidate.initiatingSessionId,
      }).pipe(Effect.option);
      if (
        config === undefined ||
        Option.isNone(canonical) ||
        !matchesCanonicalAuthorization(candidate, config, canonical.value)
      ) {
        yield* SynchronizedRef.update(state, ({ records }) => {
          const next = removeWhere(
            records,
            (record) => record.scope.providerSessionId === candidate.scope.providerSessionId,
          );
          return { records: next };
        });
        return undefined;
      }
      return yield* SynchronizedRef.modify(state, ({ records }) => {
        const current = pruneExpired(records, timestamp);
        const record = current.get(tokenHash);
        if (!record) return [undefined, { records: current }] as const;
        const next = new Map(current);
        next.set(tokenHash, { ...record, lastUsedAt: timestamp });
        return [record.scope, { records: next }] as const;
      });
    },
  );

  const revokeWhere = (predicate: (record: CredentialRecord) => boolean) =>
    SynchronizedRef.modifyEffect(state, ({ records }) =>
      Effect.sync(() => {
        const next = new Map<string, CredentialRecord>();
        for (const [tokenHash, record] of records) {
          if (predicate(record)) {
            McpProviderSession.clearMcpProviderSessionIfCurrent(
              record.scope.threadId,
              record.scope.providerSessionId,
            );
          } else {
            next.set(tokenHash, record);
          }
        }
        return [undefined, { records: next }] as const;
      }),
    );

  return McpSessionRegistry.of({
    issue,
    resolve,
    validateCurrentThreadAuthorization,
    revokeProviderSession: Effect.fn("McpSessionRegistry.revokeProviderSession")(
      function* (providerSessionId) {
        yield* revokeWhere((record) => record.scope.providerSessionId === providerSessionId);
      },
    ),
    revokeThread: Effect.fn("McpSessionRegistry.revokeThread")(function* (threadId) {
      yield* revokeWhere((record) => record.scope.threadId === threadId);
    }),
    revokeAll: SynchronizedRef.modifyEffect(state, () =>
      Effect.sync(() => {
        McpProviderSession.clearAllMcpProviderSessions();
        return [undefined, { records: new Map() }] as const;
      }),
    ),
  });
});

let activeMcpSessionRegistry: McpSessionRegistryShape | undefined;

const make = Effect.acquireRelease(
  makeWithOptions().pipe(
    Effect.tap((registry) =>
      Effect.sync(() => {
        activeMcpSessionRegistry = registry;
      }),
    ),
  ),
  (registry) =>
    registry.revokeAll.pipe(
      Effect.andThen(
        Effect.sync(() => {
          if (activeMcpSessionRegistry === registry) {
            activeMcpSessionRegistry = undefined;
          }
        }),
      ),
    ),
);

export const layer = Layer.effect(McpSessionRegistry, make);

export const issueActiveMcpCredential = (
  request: McpCredentialRequest,
): Effect.Effect<McpIssuedCredential, McpActiveCredentialIssueError> =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.issue(request)
    : Effect.fail(
        new McpSessionRegistryUnavailableError({
          message: "The provider MCP session registry is not active.",
        }),
      );

export const validateActiveMcpThreadAuthorization = (
  request: McpCurrentThreadAuthorizationRequest,
): Effect.Effect<boolean> =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.validateCurrentThreadAuthorization(request)
    : Effect.sync(() => {
        McpProviderSession.clearMcpProviderSession(request.threadId);
        return false;
      });

export const revokeActiveMcpThread = (threadId: ThreadId): Effect.Effect<void> =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.revokeThread(threadId)
    : Effect.sync(() => McpProviderSession.clearMcpProviderSession(threadId));

export const revokeActiveMcpProviderSession = (providerSessionId: string): Effect.Effect<void> =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.revokeProviderSession(providerSessionId)
    : Effect.void;

export const revokeAllActiveMcpCredentials = (): Effect.Effect<void> =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.revokeAll
    : Effect.sync(McpProviderSession.clearAllMcpProviderSessions);

/** Exposed for tests. */
export const __testing = {
  make: makeWithOptions,
};
