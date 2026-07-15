import { assert, describe, it } from "vite-plus/test";

import {
  makeDevelopmentLauncherScript,
  resolveDevelopmentUserDataPath,
  resolveElectronBinaryPath,
} from "./electron-launcher.mjs";

describe("electron development launcher", () => {
  it("uses captured values only as fallbacks for a live runner environment", () => {
    const script = makeDevelopmentLauncherScript({
      electronBinaryPath: "/repo/node_modules/electron/Electron",
      mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      userDataPath: "/Users/alice/Library/Application Support/codex-studio-dev-qa-maker",
      environment: {
        VITE_DEV_SERVER_URL: "http://127.0.0.1:8526",
        T3CODE_PORT: "16566",
        T3CODE_HOME: "/tmp/t3",
        T3CODE_DEV_PROFILE: "qa:maker",
        T3CODE_DEV_INSTANCE: "desktop-qa-maker",
      },
    });

    assert.include(
      script,
      "if [ -z \"${VITE_DEV_SERVER_URL:-}\" ]; then export VITE_DEV_SERVER_URL='http://127.0.0.1:8526'; fi",
    );
    assert.notInclude(script, "\nexport VITE_DEV_SERVER_URL=");
    assert.include(script, "export T3CODE_DEV_PROFILE='qa:maker'");
    assert.include(script, "export T3CODE_DEV_INSTANCE='desktop-qa-maker'");
    assert.include(
      script,
      "exec '/repo/node_modules/electron/Electron' '--user-data-dir=/Users/alice/Library/Application Support/codex-studio-dev-qa-maker' --t3code-dev-root='/repo/apps/desktop' '/repo/apps/desktop/dist-electron/main.cjs' \"$@\"",
    );
  });

  it("resolves isolated profile data roots on every desktop platform", () => {
    assert.equal(
      resolveDevelopmentUserDataPath({
        environment: { T3CODE_DEV_PROFILE: "root" },
        homeDirectory: "/Users/alice",
        platform: "darwin",
      }),
      "/Users/alice/Library/Application Support/codex-studio-dev-root",
    );
    assert.equal(
      resolveDevelopmentUserDataPath({
        environment: { T3CODE_DEV_PROFILE: "qa:approver", APPDATA: "C:\\Profiles\\alice" },
        homeDirectory: "C:\\Users\\alice",
        platform: "win32",
      }),
      "C:\\Profiles\\alice\\codex-studio-dev-qa-approver",
    );
    assert.equal(
      resolveDevelopmentUserDataPath({
        environment: { XDG_CONFIG_HOME: "/var/config" },
        homeDirectory: "/home/alice",
        platform: "linux",
      }),
      "/var/config/codex-studio-dev",
    );
  });

  it("repairs Electron before loading the package entrypoint", () => {
    const calls = [];
    const electronPath = resolveElectronBinaryPath({
      ensureRuntime: () => {
        calls.push("ensure");
      },
      createRequire: () => (specifier) => {
        calls.push(`require:${specifier}`);
        return "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron";
      },
      moduleUrl: import.meta.url,
    });

    assert.equal(
      electronPath,
      "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
    assert.deepEqual(calls, ["ensure", "require:electron"]);
  });
});
