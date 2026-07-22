import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  AuthAdministrativeScopes,
  AuthQaApproverScopes,
  AuthQaMakerScopes,
  AuthQaRootScopes,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as PairingGrantStore from "./PairingGrantStore.ts";
import * as EnvironmentAuth from "./EnvironmentAuth.ts";

import * as ServerSecretStore from "./ServerSecretStore.ts";

const makeServerConfigLayer = (overrides?: Partial<ServerConfig.ServerConfig["Service"]>) =>
  Layer.effect(
    ServerConfig.ServerConfig,
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      return {
        ...config,
        ...overrides,
      } satisfies ServerConfig.ServerConfig["Service"];
    }),
  ).pipe(Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-auth-server-test-" })));

const makeEnvironmentAuthLayer = (overrides?: Partial<ServerConfig.ServerConfig["Service"]>) =>
  EnvironmentAuth.layer.pipe(
    Layer.provide(SqlitePersistenceMemory),
    Layer.provide(ServerSecretStore.layer),
    Layer.provide(makeServerConfigLayer(overrides)),
  );

const makeCookieRequest = (
  sessionToken: string,
): Parameters<EnvironmentAuth.EnvironmentAuth["Service"]["authenticateHttpRequest"]>[0] =>
  ({
    cookies: {
      t3_session: sessionToken,
    },
    headers: {},
  }) as unknown as Parameters<
    EnvironmentAuth.EnvironmentAuth["Service"]["authenticateHttpRequest"]
  >[0];

const makeBearerRequest = (
  accessToken: string,
): Parameters<EnvironmentAuth.EnvironmentAuth["Service"]["authenticateHttpRequest"]>[0] =>
  ({
    cookies: {},
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  }) as unknown as Parameters<
    EnvironmentAuth.EnvironmentAuth["Service"]["authenticateHttpRequest"]
  >[0];

const ROOT_DESKTOP_CREDENTIAL = "1".repeat(48);
const MAKER_DESKTOP_CREDENTIAL = "2".repeat(48);
const APPROVER_DESKTOP_CREDENTIAL = "3".repeat(48);
const DESKTOP_BOOTSTRAP_GRANTS = [
  { profile: "root", credential: ROOT_DESKTOP_CREDENTIAL },
  { profile: "qa:maker", credential: MAKER_DESKTOP_CREDENTIAL },
  { profile: "qa:approver", credential: APPROVER_DESKTOP_CREDENTIAL },
] as const;

const requestMetadata = {
  deviceType: "desktop" as const,
  os: "macOS",
  browser: "Chrome",
  ipAddress: "192.168.1.23",
};

it.layer(NodeServices.layer)("EnvironmentAuth.layer", (it) => {
  it.effect("classifies invalid bootstrap credential failures for the HTTP boundary", () =>
    Effect.sync(() => {
      const error = EnvironmentAuth.toBootstrapExchangeError(
        new PairingGrantStore.UnknownBootstrapCredentialError({}),
      );

      expect(error._tag).toBe("ServerAuthInvalidCredentialError");
    }),
  );

  it.effect("maps unexpected bootstrap failures to 500", () =>
    Effect.sync(() => {
      const cause = new PairingGrantStore.BootstrapCredentialConsumeError({
        cause: new Error("sqlite is unavailable"),
      });
      const error = EnvironmentAuth.toBootstrapExchangeError(cause);

      expect(error._tag).toBe("ServerAuthBootstrapCredentialValidationError");
      expect(error.message).toBe("Failed to validate bootstrap credential.");
      if (error._tag === "ServerAuthBootstrapCredentialValidationError") {
        expect(error.cause).toBe(cause);
      }
    }),
  );

  it.effect("issues standard pairing credentials by default", () =>
    Effect.gen(function* () {
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;

      const pairingCredential = yield* serverAuth.issuePairingCredential();
      const exchanged = yield* serverAuth.createBrowserSession(
        pairingCredential.credential,
        requestMetadata,
      );
      const verified = yield* serverAuth.authenticateHttpRequest(
        makeCookieRequest(exchanged.sessionToken),
      );

      expect(verified.sessionId.length).toBeGreaterThan(0);
      expect(verified.scopes).toEqual([
        "orchestration:read",
        "orchestration:operate",
        "terminal:operate",
        "review:write",
        "relay:read",
      ]);
      expect(verified.subject).toBe("one-time-token");
    }).pipe(Effect.provide(makeEnvironmentAuthLayer())),
  );

  it.effect("does not exchange ordinary pairing grants for administrative access tokens", () =>
    Effect.gen(function* () {
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const pairingCredential = yield* serverAuth.issuePairingCredential();

      const error = yield* serverAuth
        .exchangeBootstrapCredentialForAccessToken(
          pairingCredential.credential,
          ["orchestration:read", "access:write"],
          requestMetadata,
        )
        .pipe(Effect.flip);

      expect(error._tag).toBe("ServerAuthScopeNotGrantedError");
    }).pipe(Effect.provide(makeEnvironmentAuthLayer())),
  );

  it.effect("inherits a constrained pairing grant when token exchange omits scope", () =>
    Effect.gen(function* () {
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const pairingCredential = yield* serverAuth.issuePairingCredential({
        scopes: ["orchestration:read"],
      });

      const token = yield* serverAuth.exchangeBootstrapCredentialForAccessToken(
        pairingCredential.credential,
        undefined,
        requestMetadata,
      );

      expect(token.scope).toBe("orchestration:read");
    }).pipe(Effect.provide(makeEnvironmentAuthLayer())),
  );

  it.effect("creates simultaneous sessions for each canonical desktop v2 grant", () =>
    Effect.gen(function* () {
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const exchanges = yield* Effect.all(
        [ROOT_DESKTOP_CREDENTIAL, MAKER_DESKTOP_CREDENTIAL, APPROVER_DESKTOP_CREDENTIAL].map(
          (credential) => serverAuth.createBrowserSession(credential, requestMetadata),
        ),
        { concurrency: "unbounded" },
      );
      const sessions = yield* Effect.all(
        exchanges.map((exchange) =>
          serverAuth.authenticateHttpRequest(makeCookieRequest(exchange.sessionToken)),
        ),
        { concurrency: "unbounded" },
      );

      expect(sessions.map(({ subject }) => subject)).toEqual([
        "local:root",
        "local:qa:maker",
        "local:qa:approver",
      ]);
      expect(sessions[0]?.scopes).toEqual(AuthQaRootScopes);
      expect(sessions[1]?.scopes).toEqual(AuthQaMakerScopes);
      expect(sessions[2]?.scopes).toEqual(AuthQaApproverScopes);
    }).pipe(
      Effect.provide(
        makeEnvironmentAuthLayer({ desktopBootstrapGrants: DESKTOP_BOOTSTRAP_GRANTS }),
      ),
    ),
  );

  it.effect("enforces each desktop v2 grant's exact token-exchange scope ceiling", () =>
    Effect.gen(function* () {
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const tokens = yield* Effect.all(
        {
          root: serverAuth.exchangeBootstrapCredentialForAccessToken(
            ROOT_DESKTOP_CREDENTIAL,
            undefined,
            requestMetadata,
          ),
          maker: serverAuth.exchangeBootstrapCredentialForAccessToken(
            MAKER_DESKTOP_CREDENTIAL,
            undefined,
            requestMetadata,
          ),
          approver: serverAuth.exchangeBootstrapCredentialForAccessToken(
            APPROVER_DESKTOP_CREDENTIAL,
            undefined,
            requestMetadata,
          ),
        },
        { concurrency: "unbounded" },
      );

      expect(tokens.root.scope).toBe(AuthQaRootScopes.join(" "));
      expect(tokens.maker.scope).toBe(AuthQaMakerScopes.join(" "));
      expect(tokens.approver.scope).toBe(AuthQaApproverScopes.join(" "));

      const sessions = yield* Effect.all(
        {
          root: serverAuth.authenticateHttpRequest(makeBearerRequest(tokens.root.access_token)),
          maker: serverAuth.authenticateHttpRequest(makeBearerRequest(tokens.maker.access_token)),
          approver: serverAuth.authenticateHttpRequest(
            makeBearerRequest(tokens.approver.access_token),
          ),
        },
        { concurrency: "unbounded" },
      );
      expect(sessions.root.subject).toBe("local:root");
      expect(sessions.maker.subject).toBe("local:qa:maker");
      expect(sessions.approver.subject).toBe("local:qa:approver");

      const narrowedMakerToken = yield* serverAuth.exchangeBootstrapCredentialForAccessToken(
        MAKER_DESKTOP_CREDENTIAL,
        ["qa:read"],
        requestMetadata,
      );
      expect(narrowedMakerToken.scope).toBe("qa:read");

      const errors = yield* Effect.all(
        {
          makerApproval: serverAuth
            .exchangeBootstrapCredentialForAccessToken(
              MAKER_DESKTOP_CREDENTIAL,
              ["qa:approve"],
              requestMetadata,
            )
            .pipe(Effect.flip),
          makerWorkspace: serverAuth
            .exchangeBootstrapCredentialForAccessToken(
              MAKER_DESKTOP_CREDENTIAL,
              ["orchestration:read"],
              requestMetadata,
            )
            .pipe(Effect.flip),
          approverMutation: serverAuth
            .exchangeBootstrapCredentialForAccessToken(
              APPROVER_DESKTOP_CREDENTIAL,
              ["qa:make"],
              requestMetadata,
            )
            .pipe(Effect.flip),
        },
        { concurrency: "unbounded" },
      );
      expect(errors.makerApproval._tag).toBe("ServerAuthScopeNotGrantedError");
      expect(errors.makerWorkspace._tag).toBe("ServerAuthScopeNotGrantedError");
      expect(errors.approverMutation._tag).toBe("ServerAuthScopeNotGrantedError");
    }).pipe(
      Effect.provide(
        makeEnvironmentAuthLayer({ desktopBootstrapGrants: DESKTOP_BOOTSTRAP_GRANTS }),
      ),
    ),
  );

  it.effect("keeps user-issued administrative pairing links manageable", () =>
    Effect.gen(function* () {
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const pairingCredential = yield* serverAuth.issuePairingCredential({
        scopes: AuthAdministrativeScopes,
      });
      const listedPairingLinks = yield* serverAuth.listPairingLinks();

      expect(
        listedPairingLinks.find((pairingLink) => pairingLink.id === pairingCredential.id)?.subject,
      ).toBe("one-time-token");
    }).pipe(Effect.provide(makeEnvironmentAuthLayer())),
  );

  it.effect("issues startup pairing URLs that bootstrap administrative sessions", () =>
    Effect.gen(function* () {
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;

      const pairingUrl = yield* serverAuth.issueStartupPairingUrl("http://127.0.0.1:3773");
      const token = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
      const listedPairingLinks = yield* serverAuth.listPairingLinks();
      expect(token).toBeTruthy();
      expect(
        listedPairingLinks.some(
          (pairingLink) => pairingLink.subject === "administrative-bootstrap",
        ),
      ).toBe(false);

      const exchanged = yield* serverAuth.createBrowserSession(token ?? "", requestMetadata);
      const verified = yield* serverAuth.authenticateHttpRequest(
        makeCookieRequest(exchanged.sessionToken),
      );

      expect(verified.scopes).toEqual([
        "orchestration:read",
        "orchestration:operate",
        "terminal:operate",
        "review:write",
        "relay:read",
        "access:read",
        "access:write",
        "relay:write",
      ]);
      expect(verified.subject).toBe("administrative-bootstrap");
    }).pipe(Effect.provide(makeEnvironmentAuthLayer())),
  );

  it.effect(
    "lists pairing links and revokes other sessions while keeping the administrative session",
    () =>
      Effect.gen(function* () {
        const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;

        const administrativeExchange = yield* serverAuth.createBrowserSession(
          "desktop-bootstrap-token",
          requestMetadata,
        );
        const administrativeSession = yield* serverAuth.authenticateHttpRequest(
          makeCookieRequest(administrativeExchange.sessionToken),
        );
        const pairingCredential = yield* serverAuth.issuePairingCredential({
          label: "Julius iPhone",
        });
        const listedPairingLinks = yield* serverAuth.listPairingLinks();
        const clientExchange = yield* serverAuth.createBrowserSession(
          pairingCredential.credential,
          {
            ...requestMetadata,
            deviceType: "mobile",
            os: "iOS",
            browser: "Safari",
            ipAddress: "192.168.1.88",
          },
        );
        const clientSession = yield* serverAuth.authenticateHttpRequest(
          makeCookieRequest(clientExchange.sessionToken),
        );
        const clientsBeforeRevoke = yield* serverAuth.listClientSessions(
          administrativeSession.sessionId,
        );
        const revokedCount = yield* serverAuth.revokeOtherClientSessions(
          administrativeSession.sessionId,
        );
        const clientsAfterRevoke = yield* serverAuth.listClientSessions(
          administrativeSession.sessionId,
        );

        expect(listedPairingLinks.map((entry) => entry.id)).toContain(pairingCredential.id);
        expect(listedPairingLinks.find((entry) => entry.id === pairingCredential.id)?.label).toBe(
          "Julius iPhone",
        );
        expect(clientsBeforeRevoke).toHaveLength(2);
        expect(
          clientsBeforeRevoke.find((entry) => entry.sessionId === administrativeSession.sessionId)
            ?.current,
        ).toBe(true);
        expect(
          clientsBeforeRevoke.find((entry) => entry.sessionId === clientSession.sessionId)?.current,
        ).toBe(false);
        expect(
          clientsBeforeRevoke.find((entry) => entry.sessionId === clientSession.sessionId)?.client
            .label,
        ).toBe("Julius iPhone");
        expect(
          clientsBeforeRevoke.find((entry) => entry.sessionId === clientSession.sessionId)?.client
            .deviceType,
        ).toBe("mobile");
        expect(revokedCount).toBe(1);
        expect(clientsAfterRevoke).toHaveLength(1);
        expect(clientsAfterRevoke[0]?.sessionId).toBe(administrativeSession.sessionId);
      }).pipe(
        Effect.provide(
          makeEnvironmentAuthLayer({
            desktopBootstrapToken: "desktop-bootstrap-token",
            desktopDevelopmentProfile: "root",
          }),
        ),
      ),
  );
});
