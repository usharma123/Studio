import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "vite-plus/test";

import {
  makeDevelopmentLauncherScript,
  resolveDevelopmentArtifactPaths,
  resolveDevelopmentLauncherIdentity,
  resolveDevelopmentWatchTargets,
  resolveDevelopmentUserDataPath,
  resolveElectronBinaryPath,
} from "./electron-launcher.mjs";

describe("electron development launcher", () => {
  it("resolves isolated bundle and backend artifacts for the selected profile", () => {
    const sharedArtifacts = resolveDevelopmentArtifactPaths({
      desktopRoot: "/repo/apps/desktop",
      environment: {
        T3CODE_DESKTOP_OUTPUT_DIR: "/repo/apps/desktop/dist-electron-shared",
        T3CODE_DESKTOP_BACKEND_ENTRY_PATH: "/repo/apps/server/dist-desktop-shared/bin.mjs",
      },
    });
    assert.deepEqual(sharedArtifacts, {
      desktopOutputDir: "/repo/apps/desktop/dist-electron-shared",
      mainEntryPath: "/repo/apps/desktop/dist-electron-shared/main.cjs",
      preloadPath: "/repo/apps/desktop/dist-electron-shared/preload.cjs",
      previewPickPreloadPath: "/repo/apps/desktop/dist-electron-shared/preview-pick-preload.cjs",
      backendEntryPath: "/repo/apps/server/dist-desktop-shared/bin.mjs",
    });

    const [desktopWatch, backendWatch] = resolveDevelopmentWatchTargets(sharedArtifacts);
    assert.equal(desktopWatch.directory, "/repo/apps/desktop/dist-electron-shared");
    assert.deepEqual([...desktopWatch.files], ["main.cjs", "preload.cjs"]);
    assert.equal(backendWatch.directory, "/repo/apps/server/dist-desktop-shared");
    assert.deepEqual([...backendWatch.files], ["bin.mjs"]);

    assert.deepEqual(
      resolveDevelopmentArtifactPaths({
        desktopRoot: "/repo/apps/desktop",
        environment: {
          T3CODE_DESKTOP_OUTPUT_DIR: "/repo/apps/desktop/dist-electron-qa-maker",
          T3CODE_DESKTOP_BACKEND_ENTRY_PATH: "/repo/apps/server/dist-desktop-qa-maker/bin.mjs",
        },
      }),
      {
        desktopOutputDir: "/repo/apps/desktop/dist-electron-qa-maker",
        mainEntryPath: "/repo/apps/desktop/dist-electron-qa-maker/main.cjs",
        preloadPath: "/repo/apps/desktop/dist-electron-qa-maker/preload.cjs",
        previewPickPreloadPath:
          "/repo/apps/desktop/dist-electron-qa-maker/preview-pick-preload.cjs",
        backendEntryPath: "/repo/apps/server/dist-desktop-qa-maker/bin.mjs",
      },
    );

    assert.deepEqual(
      resolveDevelopmentArtifactPaths({
        desktopRoot: "/repo/apps/desktop",
        environment: {},
      }),
      {
        desktopOutputDir: "/repo/apps/desktop/dist-electron",
        mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
        preloadPath: "/repo/apps/desktop/dist-electron/preload.cjs",
        previewPickPreloadPath: "/repo/apps/desktop/dist-electron/preview-pick-preload.cjs",
        backendEntryPath: "/repo/apps/server/dist/bin.mjs",
      },
    );
  });

  it("uses pairwise-distinct macOS runtime and bundle identities per profile", () => {
    const input = {
      desktopRoot: "/repo/apps/desktop",
      repositoryRoot: "/repo",
    };
    const root = resolveDevelopmentLauncherIdentity({
      ...input,
      environment: {
        T3CODE_DEV_PROFILE: "root",
        T3CODE_DEV_INSTANCE: "desktop-root",
      },
    });
    const maker = resolveDevelopmentLauncherIdentity({
      ...input,
      environment: {
        T3CODE_DEV_PROFILE: "qa:maker",
        T3CODE_DEV_INSTANCE: "desktop-qa-maker",
      },
    });
    const approver = resolveDevelopmentLauncherIdentity({
      ...input,
      environment: {
        T3CODE_DEV_PROFILE: "qa:approver",
        T3CODE_DEV_INSTANCE: "desktop-qa-approver",
      },
    });

    assert.equal(root.runtimeDir, "/repo/apps/desktop/.electron-runtime/root");
    assert.equal(maker.runtimeDir, "/repo/apps/desktop/.electron-runtime/qa-maker");
    assert.equal(approver.runtimeDir, "/repo/apps/desktop/.electron-runtime/qa-approver");
    assert.equal(
      new Set([root.appBundlePath, maker.appBundlePath, approver.appBundlePath]).size,
      3,
    );
    assert.equal(new Set([root.metadataPath, maker.metadataPath, approver.metadataPath]).size, 3);
    assert.equal(new Set([root.bundleId, maker.bundleId, approver.bundleId]).size, 3);
    assert.deepEqual(root.protocolSchemes, ["codex-studio-dev"]);
    assert.deepEqual(maker.protocolSchemes, []);
    assert.deepEqual(approver.protocolSchemes, []);
  });

  it("isolates a nondefault dev instance from legacy macOS launcher identities", () => {
    const input = {
      desktopRoot: "/repo/apps/desktop",
      repositoryRoot: "/repo",
    };
    const legacyRoot = resolveDevelopmentLauncherIdentity({
      ...input,
      environment: {
        T3CODE_DEV_PROFILE: "root",
        T3CODE_DEV_INSTANCE: "desktop-root",
      },
    });
    const sharedRoot = resolveDevelopmentLauncherIdentity({
      ...input,
      environment: {
        T3CODE_DEV_PROFILE: "root",
        T3CODE_DEV_INSTANCE: "desktop-shared-root",
      },
    });
    const sharedMaker = resolveDevelopmentLauncherIdentity({
      ...input,
      environment: {
        T3CODE_DEV_PROFILE: "qa:maker",
        T3CODE_DEV_INSTANCE: "desktop-shared-qa-maker",
      },
    });

    assert.equal(legacyRoot.bundleId, "com.codexstudio.desktop.dev.repo");
    assert.match(sharedRoot.instanceSlug, /^desktop-shared-root-[a-f0-9]{64}$/);
    assert.match(sharedMaker.instanceSlug, /^desktop-shared-qa-maker-[a-f0-9]{64}$/);
    assert.equal(
      sharedRoot.bundleId,
      `com.codexstudio.desktop.dev.repo.${sharedRoot.instanceSlug}`,
    );
    assert.equal(
      sharedMaker.bundleId,
      `com.codexstudio.desktop.dev.repo.qa-maker.${sharedMaker.instanceSlug}`,
    );
    assert.equal(
      sharedRoot.runtimeDir,
      `/repo/apps/desktop/.electron-runtime/root/instances/${sharedRoot.instanceSlug}`,
    );
    assert.equal(sharedRoot.appDisplayName, `Studio (${sharedRoot.instanceSlug})`);
    assert.equal(
      sharedRoot.appBundlePath,
      `${sharedRoot.runtimeDir}/${sharedRoot.appDisplayName}.app`,
    );
    assert.notEqual(sharedRoot.bundleId, legacyRoot.bundleId);
    assert.notEqual(sharedRoot.appBundlePath, legacyRoot.appBundlePath);
    assert.notEqual(sharedMaker.bundleId, sharedRoot.bundleId);
    assert.deepEqual(sharedRoot.protocolSchemes, []);
  });

  it("keeps colliding custom instance normalizations pairwise distinct", () => {
    const rawInstances = ["branch/a", "branch a", "branch-a", "BRANCH-A"];
    const identities = rawInstances.map((developmentInstance) =>
      resolveDevelopmentLauncherIdentity({
        desktopRoot: "/repo/apps/desktop",
        repositoryRoot: "/repo",
        environment: {
          T3CODE_DEV_PROFILE: "root",
          T3CODE_DEV_INSTANCE: developmentInstance,
        },
      }),
    );

    for (const identity of identities) {
      assert.match(identity.instanceSlug, /^branch-a-[a-f0-9]{64}$/);
      assert.match(identity.bundleId, /^[a-z0-9.-]+$/);
      assert.deepEqual(
        identity,
        resolveDevelopmentLauncherIdentity({
          desktopRoot: "/repo/apps/desktop",
          repositoryRoot: "/repo",
          environment: {
            T3CODE_DEV_PROFILE: "root",
            T3CODE_DEV_INSTANCE: identity.developmentInstance,
          },
        }),
      );
    }

    assert.equal(new Set(identities.map(({ instanceSlug }) => instanceSlug)).size, 4);
    assert.equal(new Set(identities.map(({ runtimeDir }) => runtimeDir.toLowerCase())).size, 4);
    assert.equal(
      new Set(identities.map(({ appBundlePath }) => appBundlePath.toLowerCase())).size,
      4,
    );
    assert.equal(new Set(identities.map(({ bundleId }) => bundleId.toLowerCase())).size, 4);
  });

  it("retains the unprofiled macOS runtime and protocol identity as rollback", () => {
    const identity = resolveDevelopmentLauncherIdentity({
      desktopRoot: "/repo/apps/desktop",
      repositoryRoot: "/repo",
      environment: {},
    });

    assert.equal(identity.runtimeDir, "/repo/apps/desktop/.electron-runtime");
    assert.equal(identity.appBundlePath, "/repo/apps/desktop/.electron-runtime/Studio.app");
    assert.equal(identity.bundleId, "com.codexstudio.desktop.dev.repo");
    assert.deepEqual(identity.protocolSchemes, ["codex-studio-dev"]);
  });

  it("rejects unknown runtime profiles instead of sharing the legacy wrapper", () => {
    assert.throws(
      () =>
        resolveDevelopmentLauncherIdentity({
          desktopRoot: "/repo/apps/desktop",
          repositoryRoot: "/repo",
          environment: { T3CODE_DEV_PROFILE: "qa:unknown" },
        }),
      /Invalid T3CODE_DEV_PROFILE/,
    );
    assert.throws(
      () =>
        resolveDevelopmentLauncherIdentity({
          desktopRoot: "/repo/apps/desktop",
          repositoryRoot: "/repo",
          environment: { T3CODE_DEV_INSTANCE: "---" },
        }),
      /Invalid T3CODE_DEV_INSTANCE/,
    );
  });

  it("persists only non-secret fallbacks for a live runner environment", () => {
    const credential = "a".repeat(48);
    const script = makeDevelopmentLauncherScript({
      electronBinaryPath: "/repo/node_modules/electron/Electron",
      mainEntryPath: "/repo/apps/desktop/dist-electron-shared/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      userDataPath: "/state/shared-clients/qa-maker/user-data",
      environment: {
        VITE_DEV_SERVER_URL: "http://127.0.0.1:8526",
        VITE_HTTP_URL: "http://127.0.0.1:16566/",
        VITE_WS_URL: "ws://127.0.0.1:16566/",
        T3CODE_PORT: "16566",
        T3CODE_HOME: "/tmp/t3",
        T3CODE_DEV_PROFILE: "qa:maker",
        T3CODE_DEV_INSTANCE: "desktop-shared-qa-maker",
        T3CODE_DESKTOP_OUTPUT_DIR: "/repo/apps/desktop/dist-electron-shared",
        T3CODE_DESKTOP_BACKEND_ENTRY_PATH: "/repo/apps/server/dist-desktop-shared/bin.mjs",
        T3CODE_DESKTOP_USER_DATA_PATH: "/state/shared-clients/qa-maker/user-data",
        T3CODE_DESKTOP_ATTACHED_BACKEND_URL: "http://127.0.0.1:16566/",
        T3CODE_DESKTOP_ATTACHED_ENVIRONMENT_ID: "environment-shared",
        T3CODE_DESKTOP_ATTACHED_CREDENTIAL: credential,
        T3CODE_TEST_CLIENT_SECRET: "must-never-be-written",
      },
    });

    assert.include(
      script,
      "if [ -z \"${VITE_DEV_SERVER_URL:-}\" ]; then export VITE_DEV_SERVER_URL='http://127.0.0.1:8526'; fi",
    );
    assert.notInclude(script, "\nexport VITE_DEV_SERVER_URL=");
    assert.include(script, "export T3CODE_DEV_PROFILE='qa:maker'");
    assert.include(script, "export T3CODE_DEV_INSTANCE='desktop-shared-qa-maker'");
    assert.include(
      script,
      "export T3CODE_DESKTOP_OUTPUT_DIR='/repo/apps/desktop/dist-electron-shared'",
    );
    assert.include(
      script,
      "export T3CODE_DESKTOP_BACKEND_ENTRY_PATH='/repo/apps/server/dist-desktop-shared/bin.mjs'",
    );
    assert.include(script, "export T3CODE_DESKTOP_ATTACHED_ENVIRONMENT_ID='environment-shared'");
    assert.notInclude(script, "T3CODE_DESKTOP_ATTACHED_CREDENTIAL");
    assert.notInclude(script, credential);
    assert.notInclude(script, "must-never-be-written");
    assert.include(
      script,
      "exec '/repo/node_modules/electron/Electron' '--user-data-dir=/state/shared-clients/qa-maker/user-data' --t3code-dev-root='/repo/apps/desktop' '/repo/apps/desktop/dist-electron-shared/main.cjs' \"$@\"",
    );
  });

  // oxlint-disable-next-line t3code/no-global-process-runtime -- POSIX wrapper execution is not portable to Windows.
  it.runIf(NodeOS.platform() !== "win32")(
    "delivers each client's exact credential through direct launch and inherited relaunch",
    () => {
      const tempDirectory = NodeFS.mkdtempSync(
        NodePath.join(NodeOS.tmpdir(), "t3code-electron-launcher-"),
      );
      const runtimePath = NodePath.join(tempDirectory, "Electron.real");

      try {
        NodeFS.writeFileSync(
          runtimePath,
          [
            "#!/bin/sh",
            'if [ "${T3CODE_TEST_RELAUNCHED:-}" != "1" ]; then',
            "  export T3CODE_TEST_RELAUNCHED=1",
            '  exec "$T3CODE_TEST_WRAPPER"',
            "fi",
            'printf \'%s|%s\' "$T3CODE_DEV_PROFILE" "$T3CODE_DESKTOP_ATTACHED_CREDENTIAL"',
            "",
          ].join("\n"),
          { mode: 0o700 },
        );

        const clients = [
          { profile: "qa:maker", credential: "b".repeat(48) },
          { profile: "qa:approver", credential: "c".repeat(48) },
        ];

        for (const { profile, credential } of clients) {
          const wrapperPath = NodePath.join(tempDirectory, `Electron-${profile.replace(":", "-")}`);
          const script = makeDevelopmentLauncherScript({
            electronBinaryPath: runtimePath,
            mainEntryPath: "/repo/apps/desktop/dist-electron-shared/main.cjs",
            desktopRoot: "/repo/apps/desktop",
            userDataPath: `/state/shared-clients/${profile}/user-data`,
            environment: {
              VITE_DEV_SERVER_URL: "http://127.0.0.1:8526",
              T3CODE_DEV_PROFILE: profile,
              T3CODE_DESKTOP_ATTACHED_CREDENTIAL: credential,
            },
          });

          assert.notInclude(script, "T3CODE_DESKTOP_ATTACHED_CREDENTIAL");
          assert.notInclude(script, credential);
          NodeFS.writeFileSync(wrapperPath, script, { mode: 0o700 });

          const result = NodeChildProcess.spawnSync(wrapperPath, [], {
            encoding: "utf8",
            env: {
              T3CODE_DESKTOP_ATTACHED_CREDENTIAL: credential,
              T3CODE_TEST_WRAPPER: wrapperPath,
            },
          });

          assert.equal(result.status, 0, result.stderr);
          assert.equal(result.stdout, `${profile}|${credential}`);
        }
      } finally {
        NodeFS.rmSync(tempDirectory, { recursive: true, force: true });
      }
    },
  );

  it("resolves isolated profile data roots on every desktop platform", () => {
    const legacyRootPath = resolveDevelopmentUserDataPath({
      environment: { T3CODE_DEV_PROFILE: "root" },
      homeDirectory: "/Users/alice",
      platform: "darwin",
    });
    const explicitSharedPath = resolveDevelopmentUserDataPath({
      environment: {
        T3CODE_DEV_PROFILE: "root",
        T3CODE_DESKTOP_USER_DATA_PATH: "/state/shared-clients/root/user-data",
      },
      homeDirectory: "/Users/alice",
      platform: "darwin",
    });
    assert.equal(explicitSharedPath, "/state/shared-clients/root/user-data");
    assert.notEqual(explicitSharedPath, legacyRootPath);
    assert.equal(legacyRootPath, "/Users/alice/Library/Application Support/codex-studio-dev-root");
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
    assert.throws(
      () =>
        resolveDevelopmentUserDataPath({
          environment: { T3CODE_DESKTOP_USER_DATA_PATH: "relative/user-data" },
          platform: "darwin",
        }),
      /must be absolute/,
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
