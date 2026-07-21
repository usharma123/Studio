import { assert, describe, it } from "vite-plus/test";

import {
  cleanupStaleDevelopmentApps,
  resolveDevelopmentProcessIdentity,
} from "./dev-electron-process.mjs";

function makeJavascriptMatcher(pattern) {
  return new RegExp(pattern.replaceAll("[[:space:]]", "\\s"));
}

describe("electron development process cleanup", () => {
  it("matches only the exact profile, instance, and user-data identity", () => {
    const identity = resolveDevelopmentProcessIdentity({
      desktopRoot: "/repo/apps/desktop",
      userDataPath: "/state/shared/root/user-data",
      developmentProfile: "root",
      developmentInstance: "desktop-shared-root",
    });
    const matches = makeJavascriptMatcher(identity.matchPattern);

    assert.isTrue(
      matches.test(
        "/runtime/Electron.real --user-data-dir=/state/shared/root/user-data " +
          "--t3code-dev-root=/repo/apps/desktop /repo/apps/desktop/main.cjs " +
          "--t3code-dev-profile=root --t3code-dev-instance=desktop-shared-root",
      ),
    );
    assert.isFalse(
      matches.test(
        "/runtime/Electron.real --user-data-dir=/state/legacy/root/user-data " +
          "--t3code-dev-root=/repo/apps/desktop /repo/apps/desktop/main.cjs " +
          "--t3code-dev-profile=root --t3code-dev-instance=desktop-root",
      ),
    );
    assert.isFalse(
      matches.test(
        "/runtime/Electron.real --user-data-dir=/state/shared/root/user-data " +
          "--t3code-dev-root=/repo/apps/desktop /repo/apps/desktop/main.cjs " +
          "--t3code-dev-profile=root --t3code-dev-instance=desktop-parallel-root",
      ),
    );
    assert.isFalse(
      matches.test(
        "/runtime/Electron.real --user-data-dir=/state/shared/root/user-data " +
          "--t3code-dev-root=/repo/apps/desktop /repo/apps/desktop/main.cjs " +
          "--t3code-dev-profile=qa:approver --t3code-dev-instance=desktop-shared-root",
      ),
    );
  });

  it("escapes regex metacharacters in every identity field", () => {
    const identity = resolveDevelopmentProcessIdentity({
      desktopRoot: "/repo/[copy]/desktop+",
      userDataPath: "/state/user.data (1)",
      developmentProfile: "qa:maker",
      developmentInstance: "desktop.shared(root)",
    });
    const matches = makeJavascriptMatcher(identity.matchPattern);

    assert.isTrue(
      matches.test(
        "/runtime/Electron --user-data-dir=/state/user.data (1) " +
          "--t3code-dev-root=/repo/[copy]/desktop+ /repo/main.cjs " +
          "--t3code-dev-profile=qa:maker --t3code-dev-instance=desktop.shared(root)",
      ),
    );
    assert.isFalse(
      matches.test(
        "/runtime/Electron --user-data-dir=/state/userXdata (1) " +
          "--t3code-dev-root=/repo/[copy]/desktop+ /repo/main.cjs " +
          "--t3code-dev-profile=qa:maker --t3code-dev-instance=desktop.shared(root)",
      ),
    );
  });

  it("passes the exact identity matcher to pkill and skips Windows", () => {
    const processIdentity = resolveDevelopmentProcessIdentity({
      desktopRoot: "/repo/apps/desktop",
      userDataPath: "/state/root/user-data",
      developmentProfile: undefined,
      developmentInstance: undefined,
    });
    const calls = [];
    const spawnSync = (...args) => calls.push(args);
    const matches = makeJavascriptMatcher(processIdentity.matchPattern);

    cleanupStaleDevelopmentApps({ hostPlatform: "darwin", processIdentity, spawnSync });
    cleanupStaleDevelopmentApps({ hostPlatform: "win32", processIdentity, spawnSync });

    assert.deepEqual(calls, [
      ["pkill", ["-f", "--", processIdentity.matchPattern], { stdio: "ignore" }],
    ]);
    assert.deepEqual(processIdentity.profileArguments, ["--t3code-dev-profile="]);
    assert.include(processIdentity.instanceArgument, "--t3code-dev-instance=");
    assert.isTrue(
      matches.test(
        "/runtime/Electron --user-data-dir=/state/root/user-data " +
          "--t3code-dev-root=/repo/apps/desktop /repo/main.cjs " +
          "--t3code-dev-profile= --t3code-dev-instance=",
      ),
    );
    assert.isFalse(
      matches.test(
        "/runtime/Electron --user-data-dir=/state/root/user-data " +
          "--t3code-dev-root=/repo/apps/desktop /repo/main.cjs " +
          "--t3code-dev-profile=root --t3code-dev-instance=",
      ),
    );
  });
});
