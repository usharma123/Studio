// @effect-diagnostics nodeBuiltinImport:off - Desktop configuration validates host-native absolute paths before the runtime is built.
import * as NodePath from "node:path";

import { DesktopDevelopmentProfile } from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const trimNonEmptyOption = (value: string): Option.Option<string> => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
};

const trimmedString = (name: string) =>
  Config.string(name).pipe(Config.option, Config.map(Option.flatMap(trimNonEmptyOption)));

const absolutePath = (name: string) =>
  trimmedString(name).pipe(
    Config.mapOrFail(
      Option.match({
        onNone: () => Effect.succeed(Option.none<string>()),
        onSome: (value) =>
          NodePath.isAbsolute(value)
            ? Effect.succeed(Option.some(NodePath.normalize(value)))
            : Effect.fail(
                new Config.ConfigError(
                  new ConfigProvider.SourceError({
                    message: `${name} must be an absolute path.`,
                    cause: value,
                  }),
                ),
              ),
      }),
    ),
  );

const optionalBoolean = (name: string) =>
  Config.boolean(name).pipe(Config.option, Config.map(Option.getOrElse(() => false)));

const commaSeparatedStrings = (name: string) =>
  trimmedString(name).pipe(
    Config.map(
      Option.match({
        onNone: () => [],
        onSome: (value) =>
          value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
      }),
    ),
  );

const compactEnv = (env: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

const attachedBackendConfig = Config.all({
  httpBaseUrl: Config.url("T3CODE_DESKTOP_ATTACHED_BACKEND_URL").pipe(Config.option),
  expectedEnvironmentId: trimmedString("T3CODE_DESKTOP_ATTACHED_ENVIRONMENT_ID"),
  credential: trimmedString("T3CODE_DESKTOP_ATTACHED_CREDENTIAL"),
  profile: Config.schema(Schema.optional(DesktopDevelopmentProfile), "T3CODE_DEV_PROFILE").pipe(
    Config.map(Option.fromUndefinedOr),
  ),
}).pipe(
  Config.mapOrFail((input) => {
    const attachedFieldCount =
      Number(Option.isSome(input.httpBaseUrl)) +
      Number(Option.isSome(input.expectedEnvironmentId)) +
      Number(Option.isSome(input.credential));
    if (attachedFieldCount === 0) {
      return Effect.succeed(Option.none());
    }
    if (attachedFieldCount !== 3 || Option.isNone(input.profile)) {
      return Effect.fail(
        new Config.ConfigError(
          new ConfigProvider.SourceError({
            message:
              "Attached desktop backend configuration requires URL, environment ID, credential, and profile.",
            cause: "partial attached desktop backend configuration",
          }),
        ),
      );
    }

    const httpBaseUrl = Option.getOrThrow(input.httpBaseUrl);
    const credential = Option.getOrThrow(input.credential);
    const isLoopback =
      httpBaseUrl.hostname === "127.0.0.1" ||
      httpBaseUrl.hostname === "localhost" ||
      httpBaseUrl.hostname === "[::1]";
    if (
      httpBaseUrl.protocol !== "http:" ||
      !isLoopback ||
      httpBaseUrl.username.length > 0 ||
      httpBaseUrl.password.length > 0
    ) {
      return Effect.fail(
        new Config.ConfigError(
          new ConfigProvider.SourceError({
            message: "Attached desktop backend URL must be an unauthenticated loopback HTTP URL.",
            cause: httpBaseUrl.href,
          }),
        ),
      );
    }
    if (!/^[0-9a-f]{48}$/.test(credential)) {
      return Effect.fail(
        new Config.ConfigError(
          new ConfigProvider.SourceError({
            message:
              "Attached desktop backend credential must be 48 lowercase hexadecimal characters.",
            cause: "invalid attached desktop backend credential",
          }),
        ),
      );
    }

    return Effect.succeed(
      Option.some({
        httpBaseUrl,
        expectedEnvironmentId: Option.getOrThrow(input.expectedEnvironmentId),
        credential,
        profile: Option.getOrThrow(input.profile),
      }),
    );
  }),
);

export const DesktopConfig = Config.all({
  appDataDirectory: trimmedString("APPDATA"),
  xdgConfigHome: trimmedString("XDG_CONFIG_HOME"),
  t3Home: trimmedString("T3CODE_HOME"),
  developmentProfile: Config.schema(
    Schema.optional(DesktopDevelopmentProfile),
    "T3CODE_DEV_PROFILE",
  ).pipe(Config.map(Option.fromUndefinedOr)),
  devServerUrl: Config.url("VITE_DEV_SERVER_URL").pipe(Config.option),
  appUserModelIdOverride: trimmedString("T3CODE_DESKTOP_APP_USER_MODEL_ID"),
  devRemoteT3ServerEntryPath: trimmedString("T3CODE_DEV_REMOTE_T3_SERVER_ENTRY_PATH"),
  developmentBackendEntryPath: trimmedString("T3CODE_DESKTOP_BACKEND_ENTRY_PATH"),
  developmentUserDataPath: absolutePath("T3CODE_DESKTOP_USER_DATA_PATH"),
  attachedBackend: attachedBackendConfig,
  configuredBackendPort: Config.port("T3CODE_PORT").pipe(Config.option),
  commitHashOverride: trimmedString("T3CODE_COMMIT_HASH"),
  desktopLanHostOverride: trimmedString("T3CODE_DESKTOP_LAN_HOST"),
  desktopHttpsEndpointUrls: commaSeparatedStrings("T3CODE_DESKTOP_HTTPS_ENDPOINTS"),
  otlpTracesUrl: trimmedString("T3CODE_OTLP_TRACES_URL"),
  otlpExportIntervalMs: Config.int("T3CODE_OTLP_EXPORT_INTERVAL_MS").pipe(
    Config.withDefault(10_000),
  ),
  appImagePath: trimmedString("APPIMAGE"),
  disableAutoUpdate: optionalBoolean("T3CODE_DISABLE_AUTO_UPDATE"),
  mockUpdates: optionalBoolean("T3CODE_DESKTOP_MOCK_UPDATES"),
  mockUpdateServerPort: Config.port("T3CODE_DESKTOP_MOCK_UPDATE_SERVER_PORT").pipe(
    Config.withDefault(3000),
  ),
});

export const layerTest = (env: Readonly<Record<string, string | undefined>>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: compactEnv(env) }));
