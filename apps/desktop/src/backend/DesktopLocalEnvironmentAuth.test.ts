import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { PRIMARY_LOCAL_ENVIRONMENT_ID } from "@t3tools/contracts";

import * as DesktopBackendPool from "./DesktopBackendPool.ts";
import * as DesktopLocalEnvironmentAuth from "./DesktopLocalEnvironmentAuth.ts";

const config = {
  executablePath: "/electron",
  entryPath: "/server/bin.mjs",
  cwd: "/server",
  env: {},
  bootstrap: {
    mode: "desktop",
    noBrowser: true,
    port: 3773,
    t3Home: "/tmp/t3",
    host: "127.0.0.1",
    desktopBootstrapToken: "desktop-bootstrap-token",
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
  },
  httpBaseUrl: new URL("http://127.0.0.1:3773"),
  captureOutput: true,
};

describe("DesktopLocalEnvironmentAuth", () => {
  it.effect("exchanges the desktop bootstrap credential only once", () =>
    Effect.gen(function* () {
      const requestCount = yield* Ref.make(0);
      const httpClientLayer = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Ref.update(requestCount, (count) => count + 1).pipe(
            Effect.as(
              HttpClientResponse.fromWeb(
                request,
                new Response(
                  JSON.stringify({
                    access_token: "desktop-bearer-token",
                    issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
                    token_type: "Bearer",
                    expires_in: 3600,
                    scope: "orchestration:read",
                  }),
                  { status: 200, headers: { "content-type": "application/json" } },
                ),
              ),
            ),
          ),
        ),
      );
      const poolLayer = Layer.succeed(DesktopBackendPool.DesktopBackendPool, {
        list: Effect.succeed([
          {
            id: PRIMARY_LOCAL_ENVIRONMENT_ID,
            label: Effect.succeed("Windows"),
            currentConfig: Effect.succeed(Option.some(config)),
          },
        ]),
      } as unknown as DesktopBackendPool.DesktopBackendPool["Service"]);
      const testLayer = DesktopLocalEnvironmentAuth.layer.pipe(
        Layer.provide(Layer.mergeAll(poolLayer, httpClientLayer)),
      );

      const [first, second] = yield* Effect.gen(function* () {
        const auth = yield* DesktopLocalEnvironmentAuth.DesktopLocalEnvironmentAuth;
        return yield* Effect.all([auth.getBearerToken, auth.getBearerToken]);
      }).pipe(Effect.provide(testLayer));

      assert.strictEqual(first, "desktop-bearer-token");
      assert.strictEqual(second, "desktop-bearer-token");
      assert.strictEqual(yield* Ref.get(requestCount), 1);
    }),
  );

  it.effect("invalidates the bearer cache when environment, endpoint, or credential changes", () =>
    Effect.gen(function* () {
      const requestCount = yield* Ref.make(0);
      const configRef = yield* Ref.make(Option.some(config));
      const httpClientLayer = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Ref.modify(requestCount, (count) => [count + 1, count + 1] as const).pipe(
            Effect.map((count) =>
              HttpClientResponse.fromWeb(
                request,
                new Response(
                  JSON.stringify({
                    access_token: `desktop-bearer-${count}`,
                    issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
                    token_type: "Bearer",
                    expires_in: 3600,
                    scope: "qa:read",
                  }),
                  { status: 200, headers: { "content-type": "application/json" } },
                ),
              ),
            ),
          ),
        ),
      );
      const poolLayer = Layer.succeed(DesktopBackendPool.DesktopBackendPool, {
        list: Effect.succeed([
          {
            id: PRIMARY_LOCAL_ENVIRONMENT_ID,
            label: Effect.succeed("Shared QA backend"),
            currentConfig: Ref.get(configRef),
          },
        ]),
      } as unknown as DesktopBackendPool.DesktopBackendPool["Service"]);
      const testLayer = DesktopLocalEnvironmentAuth.layer.pipe(
        Layer.provide(Layer.mergeAll(poolLayer, httpClientLayer)),
      );

      const [first, cached, environmentSwitched, credentialSwitched] = yield* Effect.gen(
        function* () {
          const auth = yield* DesktopLocalEnvironmentAuth.DesktopLocalEnvironmentAuth;
          const first = yield* auth.getBearerToken;
          const cached = yield* auth.getBearerToken;
          yield* Ref.set(
            configRef,
            Option.some({
              ...config,
              expectedEnvironmentId: "environment-2",
            }),
          );
          const environmentSwitched = yield* auth.getBearerToken;
          yield* Ref.set(
            configRef,
            Option.some({
              ...config,
              httpBaseUrl: new URL("http://127.0.0.1:4773"),
              bootstrap: {
                ...config.bootstrap,
                desktopBootstrapToken: "changed-desktop-bootstrap-token",
              },
              expectedEnvironmentId: "environment-3",
            }),
          );
          return [first, cached, environmentSwitched, yield* auth.getBearerToken] as const;
        },
      ).pipe(Effect.provide(testLayer));

      assert.equal(first, "desktop-bearer-1");
      assert.equal(cached, "desktop-bearer-1");
      assert.equal(environmentSwitched, "desktop-bearer-2");
      assert.equal(credentialSwitched, "desktop-bearer-3");
      assert.equal(yield* Ref.get(requestCount), 3);
    }),
  );

  it.effect(
    "never falls back to raw credential exchange while an attached bearer is unavailable",
    () =>
      Effect.gen(function* () {
        const requestCount = yield* Ref.make(0);
        const httpClientLayer = Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Ref.update(requestCount, (count) => count + 1).pipe(
              Effect.andThen(Effect.die(`unexpected token exchange to ${request.url}`)),
            ),
          ),
        );
        const poolLayer = Layer.succeed(DesktopBackendPool.DesktopBackendPool, {
          list: Effect.succeed([
            {
              id: PRIMARY_LOCAL_ENVIRONMENT_ID,
              label: Effect.succeed("Shared QA backend"),
              currentConfig: Effect.succeed(Option.some(config)),
              currentBearerToken: Effect.succeed(Option.none()),
            },
          ]),
        } as unknown as DesktopBackendPool.DesktopBackendPool["Service"]);
        const testLayer = DesktopLocalEnvironmentAuth.layer.pipe(
          Layer.provide(Layer.mergeAll(poolLayer, httpClientLayer)),
        );

        const error = yield* DesktopLocalEnvironmentAuth.DesktopLocalEnvironmentAuth.pipe(
          Effect.flatMap((auth) => auth.getBearerToken),
          Effect.flip,
          Effect.provide(testLayer),
        );

        assert.equal(error._tag, "DesktopLocalEnvironmentAuthBackendNotConfiguredError");
        assert.equal(yield* Ref.get(requestCount), 0);
      }),
  );
});
