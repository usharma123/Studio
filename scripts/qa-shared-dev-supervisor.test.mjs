import * as NodeChildProcess from "node:child_process";
import * as NodeEvents from "node:events";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { describe, expect, it } from "vitest";

import { resolveDevelopmentUserDataPath } from "../apps/desktop/scripts/electron-launcher.mjs";

import {
  assertQaSharedBackendPortAvailable,
  createQaSharedBackendController,
  createQaSharedShutdownCoordinator,
  mergeQaSharedProcessEnvironment,
  normalizeQaSharedProfiles,
  parseQaSharedDevArgs,
  readQaSharedArtifactGeneration,
  resolveQaSharedDevTopology,
  runQaSharedDevSupervisor,
  summarizeQaSharedDevTopology,
  waitForFreshQaSharedArtifact,
  waitForOwnedQaSharedBackendIdentity,
  waitForOwnedQaSharedViteServer,
} from "./qa-shared-dev-supervisor.mjs";

const credentials = {
  root: "1".repeat(48),
  "qa:maker": "2".repeat(48),
  "qa:approver": "3".repeat(48),
};

class FakeChild extends NodeEvents.EventEmitter {
  kills = [];
  exitCode = null;
  signalCode = null;

  constructor(pid = 12_345) {
    super();
    this.pid = pid;
  }

  kill(signal) {
    this.kills.push(signal);
    return true;
  }
}

class AutoClosingFakeChild extends FakeChild {
  constructor(pid) {
    super(pid);
    this.stdio = [null, null, null, { end: () => undefined }];
  }

  kill(signal) {
    super.kill(signal);
    queueMicrotask(() => {
      this.exitCode = 0;
      this.emit("close", 0, null);
    });
    return true;
  }
}

describe("qa shared dev supervisor", () => {
  it("fails closed before spawning or delivering grants when the backend port is occupied", async () => {
    const occupiedPortProbe = () => {
      const probe = new NodeEvents.EventEmitter();
      probe.listen = () => {
        queueMicrotask(() => {
          probe.emit(
            "error",
            Object.assign(new Error("address already in use"), { code: "EADDRINUSE" }),
          );
        });
      };
      probe.close = () => {
        throw new Error("An occupied port probe must not reach close.");
      };
      return probe;
    };
    const assertBackendPortAvailable = (httpBaseUrl) =>
      assertQaSharedBackendPortAvailable(httpBaseUrl, { createServer: occupiedPortProbe });

    const spawned = [];
    const baseHome = NodePath.join(
      NodeOS.tmpdir(),
      `qa-shared-first-run-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const topology = resolveQaSharedDevTopology({
      repositoryRoot: "/repo",
      baseHome,
      serverPort: 14_773,
      credentials,
    });

    await expect(assertBackendPortAvailable(topology.httpBaseUrl)).rejects.toThrow(
      /already in use.*refusing to send bootstrap grants or attach clients/i,
    );
    await expect(
      runQaSharedDevSupervisor(topology, {
        assertBackendPortAvailable,
        spawnProcess: (...input) => {
          spawned.push(input);
          throw new Error("A process must not spawn while the configured port is occupied.");
        },
      }),
    ).rejects.toThrow(/already in use/);
    expect(spawned).toEqual([]);
    expect(NodeFS.existsSync(NodePath.join(topology.backendHome, "dev", "environment-id"))).toBe(
      false,
    );
  });

  it("preflights an occupied web/Vite port before spawning any child or delivering grants", async () => {
    const spawned = [];
    const checkedPorts = [];
    const topology = resolveQaSharedDevTopology({
      repositoryRoot: "/repo",
      baseHome: "/state",
      serverPort: 14_773,
      webPort: 6_733,
      credentials,
    });

    await expect(
      runQaSharedDevSupervisor(topology, {
        assertPortAvailable: async (url, options) => {
          checkedPorts.push({ url, serviceLabel: options.serviceLabel });
          if (url === topology.webUrl) {
            throw new Error(
              "Shared web/Vite port 127.0.0.1:6733 is already in use; refusing to send bootstrap grants or attach clients.",
            );
          }
        },
        spawnProcess: (...input) => {
          spawned.push(input);
          throw new Error("No process may spawn while the configured Vite port is occupied.");
        },
      }),
    ).rejects.toThrow(/web\/Vite port.*already in use/i);

    expect(checkedPorts).toEqual([
      { url: topology.httpBaseUrl, serviceLabel: "Shared backend" },
      { url: topology.webUrl, serviceLabel: "Shared web/Vite" },
    ]);
    expect(spawned).toEqual([]);
  });

  it("does not accept an HTTP responder without the exact live owned Vite child", async () => {
    const viteChild = new FakeChild(4_141);
    let fetchCount = 0;
    const fetchImpl = async () => {
      fetchCount += 1;
      return new Response("ready", { status: 200 });
    };

    await expect(
      waitForOwnedQaSharedViteServer({
        webUrl: "http://127.0.0.1:6733/",
        viteChild,
        isCurrent: () => false,
        timeoutMs: 5,
        pollIntervalMs: 1,
        fetchImpl,
      }),
    ).rejects.toThrow(/owned shared Vite server exited/);
    expect(fetchCount).toBe(0);

    await expect(
      waitForOwnedQaSharedViteServer({
        webUrl: "http://127.0.0.1:6733/",
        viteChild,
        isCurrent: () => true,
        timeoutMs: 20,
        pollIntervalMs: 1,
        fetchImpl,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(fetchCount).toBe(1);

    viteChild.exitCode = 1;
    await expect(
      waitForOwnedQaSharedViteServer({
        webUrl: "http://127.0.0.1:6733/",
        viteChild,
        isCurrent: () => true,
        timeoutMs: 5,
        pollIntervalMs: 1,
        fetchImpl,
      }),
    ).rejects.toThrow(/owned shared Vite server exited/);
    expect(fetchCount).toBe(1);
  });

  it("cleans the watcher and launches no backend or client when Vite exits early", async () => {
    const topology = resolveQaSharedDevTopology({
      repositoryRoot: "/repo",
      baseHome: "/state",
      credentials,
    });
    const spawned = [];

    await expect(
      runQaSharedDevSupervisor(topology, {
        assertPortAvailable: async () => undefined,
        waitForArtifact: async () => undefined,
        waitForOwnedViteServer: (input) =>
          waitForOwnedQaSharedViteServer({
            ...input,
            timeoutMs: 20,
            pollIntervalMs: 1,
            fetchImpl: async () => {
              await new Promise((resolve) => setTimeout(resolve, 0));
              return new Response("preexisting responder", { status: 200 });
            },
          }),
        spawnProcess: (spec) => {
          const child = new AutoClosingFakeChild(4_200 + spawned.length);
          spawned.push({ child, spec });
          if (spec === topology.web) {
            queueMicrotask(() => {
              child.exitCode = 1;
              child.emit("close", 1, null);
            });
          }
          return child;
        },
      }),
    ).rejects.toThrow(/owned shared Vite server exited/);

    expect(spawned.map(({ spec }) => spec)).toEqual([topology.buildWatch, topology.web]);
    expect(spawned[0].child.kills).toEqual(["SIGTERM"]);
    expect(spawned[1].child.kills).toEqual([]);
  });

  it("stops owned startup processes and launches no clients when Vite exits during backend readiness", async () => {
    const topology = resolveQaSharedDevTopology({
      repositoryRoot: "/repo",
      baseHome: "/state",
      credentials,
    });
    const spawned = [];
    let viteChild;

    await expect(
      runQaSharedDevSupervisor(topology, {
        assertPortAvailable: async () => undefined,
        waitForArtifact: async () => undefined,
        waitForOwnedViteServer: async ({ viteChild: ownedViteChild, isCurrent }) => {
          expect(isCurrent()).toBe(true);
          viteChild = ownedViteChild;
        },
        waitForOwnedBackendIdentity: async () => {
          viteChild.exitCode = 1;
          viteChild.emit("close", 1, null);
          return "owned-environment";
        },
        waitForBackendDescriptor: async (_url, expectedEnvironmentId, assertOwnership) => {
          assertOwnership();
          return { environmentId: expectedEnvironmentId };
        },
        spawnProcess: (spec) => {
          const child = new AutoClosingFakeChild(4_300 + spawned.length);
          spawned.push({ child, spec });
          return child;
        },
      }),
    ).rejects.toThrow(/owned shared Vite server exited/);

    expect(spawned.map(({ spec }) => spec)).toEqual([
      topology.buildWatch,
      topology.web,
      topology.backend,
    ]);
    expect(spawned[0].child.kills).toEqual(["SIGTERM"]);
    expect(spawned[1].child.kills).toEqual([]);
    expect(spawned[2].child.kills).toEqual(["SIGTERM"]);
  });

  it("accepts backend identity only for the exact child that bound the configured port", async () => {
    const baseHome = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "qa-shared-identity-"));
    const topology = resolveQaSharedDevTopology({
      repositoryRoot: "/repo",
      baseHome,
      serverPort: 14_773,
      credentials,
    });
    const stateDirectory = NodePath.join(topology.backendHome, "dev");
    const environmentIdPath = NodePath.join(stateDirectory, "environment-id");
    const runtimeStatePath = NodePath.join(stateDirectory, "server-runtime.json");
    const backendChild = new FakeChild(4_242);
    const startedAtMs = Date.now() - 1_000;
    NodeFS.mkdirSync(stateDirectory, { recursive: true });
    NodeFS.writeFileSync(environmentIdPath, "owned-environment\n");
    NodeFS.writeFileSync(
      runtimeStatePath,
      `${JSON.stringify({
        version: 1,
        pid: 9_999,
        port: 14_773,
        origin: "http://127.0.0.1:14773",
        startedAt: new Date(startedAtMs + 500).toISOString(),
      })}\n`,
    );

    try {
      await expect(
        waitForOwnedQaSharedBackendIdentity({
          topology,
          backendChild,
          isCurrent: () => true,
          startedAtMs,
          timeoutMs: 5,
          pollIntervalMs: 1,
        }),
      ).rejects.toThrow(/Timed out verifying owned shared backend identity/);

      NodeFS.writeFileSync(
        runtimeStatePath,
        `${JSON.stringify({
          version: 1,
          pid: backendChild.pid,
          port: 14_773,
          origin: "http://127.0.0.1:14773",
          startedAt: new Date(startedAtMs + 500).toISOString(),
        })}\n`,
      );
      NodeFS.writeFileSync(environmentIdPath, "\n");
      await expect(
        waitForOwnedQaSharedBackendIdentity({
          topology,
          backendChild,
          isCurrent: () => true,
          startedAtMs,
          timeoutMs: 5,
          pollIntervalMs: 1,
        }),
      ).rejects.toThrow(/Timed out verifying owned shared backend identity/);

      NodeFS.writeFileSync(environmentIdPath, "owned-environment\n");
      await expect(
        waitForOwnedQaSharedBackendIdentity({
          topology,
          backendChild,
          isCurrent: () => true,
          startedAtMs,
          timeoutMs: 50,
          pollIntervalMs: 1,
        }),
      ).resolves.toBe("owned-environment");
    } finally {
      NodeFS.rmSync(baseHome, { force: true, recursive: true });
    }
  });

  it("stops every owned process and launches no clients when backend ownership fails", async () => {
    const topology = resolveQaSharedDevTopology({
      repositoryRoot: "/repo",
      baseHome: "/state",
      credentials,
    });
    const spawned = [];

    await expect(
      runQaSharedDevSupervisor(topology, {
        assertBackendPortAvailable: async () => undefined,
        waitForArtifact: async () => undefined,
        waitForOwnedViteServer: async ({ isCurrent }) => expect(isCurrent()).toBe(true),
        waitForOwnedBackendIdentity: async () => {
          throw new Error("owned backend identity mismatch");
        },
        spawnProcess: (spec) => {
          const child = new AutoClosingFakeChild(5_000 + spawned.length);
          spawned.push({ child, spec });
          return child;
        },
      }),
    ).rejects.toThrow(/owned backend identity mismatch/);

    expect(spawned.map(({ spec }) => spec)).toEqual([
      topology.buildWatch,
      topology.web,
      topology.backend,
    ]);
    expect(spawned.every(({ child }) => child.kills.includes("SIGTERM"))).toBe(true);
  });

  it("waits for fresh build outputs before starting the backend or clients", async () => {
    const repositoryRoot = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "qa-shared-artifacts-"),
    );
    const topology = resolveQaSharedDevTopology({
      repositoryRoot,
      baseHome: NodePath.join(repositoryRoot, "state"),
      credentials,
    });
    const artifactPaths = [
      topology.backendEntryPath,
      NodePath.join(topology.desktopOutputDir, "main.cjs"),
      NodePath.join(topology.desktopOutputDir, "preload.cjs"),
    ];
    for (const path of artifactPaths) {
      NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
      NodeFS.writeFileSync(path, `stale:${NodePath.basename(path)}\n`);
    }
    const staleGenerations = artifactPaths.map(readQaSharedArtifactGeneration);
    const waitForArtifact = (path, generation) =>
      waitForFreshQaSharedArtifact(path, generation, 10, 1);

    try {
      const staleSpawned = [];
      await expect(
        runQaSharedDevSupervisor(topology, {
          assertBackendPortAvailable: async () => undefined,
          waitForArtifact,
          waitForOwnedViteServer: async ({ isCurrent }) => expect(isCurrent()).toBe(true),
          spawnProcess: (spec, options) => {
            const child = new AutoClosingFakeChild(6_000 + staleSpawned.length);
            staleSpawned.push({ child, options, spec });
            return child;
          },
        }),
      ).rejects.toThrow(/fresh shared development artifact/);
      expect(staleSpawned.map(({ spec }) => spec)).toEqual([topology.buildWatch, topology.web]);
      expect(staleSpawned.some(({ options }) => options?.bootstrap || options?.client)).toBe(false);

      const freshSpawned = [];
      const readinessOrder = [];
      const supervisor = await runQaSharedDevSupervisor(topology, {
        assertBackendPortAvailable: async () => undefined,
        waitForArtifact: (path, generation) =>
          waitForFreshQaSharedArtifact(path, generation, 100, 1),
        waitForOwnedBackendIdentity: async () => "owned-environment",
        waitForOwnedViteServer: async ({ isCurrent }) => {
          expect(isCurrent()).toBe(true);
          readinessOrder.push("vite-ready");
        },
        waitForBackendDescriptor: async (_url, expectedEnvironmentId, assertOwnership) => {
          assertOwnership();
          return { environmentId: expectedEnvironmentId };
        },
        watchServerOutput: () => ({ close: () => undefined }),
        spawnProcess: (spec, options) => {
          if (spec === topology.backend) {
            expect(readinessOrder).toEqual(["vite-ready"]);
          }
          const child = new AutoClosingFakeChild(7_000 + freshSpawned.length);
          freshSpawned.push({ child, options, spec });
          if (spec === topology.buildWatch) {
            queueMicrotask(() => {
              for (const path of artifactPaths) {
                NodeFS.writeFileSync(path, `fresh:${NodePath.basename(path)}:${Date.now()}\n`);
              }
            });
          }
          return child;
        },
      });

      expect(artifactPaths.map(readQaSharedArtifactGeneration)).not.toEqual(staleGenerations);
      expect(readinessOrder).toEqual(["vite-ready"]);
      expect(freshSpawned.map(({ options }) => options)).toEqual([
        undefined,
        undefined,
        { bootstrap: true },
        { client: true },
        { client: true },
        { client: true },
      ]);
      await supervisor.shutdown();
    } finally {
      NodeFS.rmSync(repositoryRoot, { force: true, recursive: true });
    }
  });

  it("preserves repository configuration while stripping client credentials from shared processes", () => {
    const baseEnvironment = {
      T3CODE_QA_DATABASE_URL: "postgresql://qa.example/shared",
      OPENAI_API_KEY: "provider-key",
      T3CODE_DESKTOP_ATTACHED_CREDENTIAL: "stale-client-credential",
    };
    const shared = mergeQaSharedProcessEnvironment(baseEnvironment, { PORT: "5733" });
    const client = mergeQaSharedProcessEnvironment(
      baseEnvironment,
      { T3CODE_DESKTOP_ATTACHED_CREDENTIAL: credentials.root },
      { client: true },
    );

    expect(shared).toMatchObject({
      T3CODE_QA_DATABASE_URL: "postgresql://qa.example/shared",
      OPENAI_API_KEY: "provider-key",
      PORT: "5733",
    });
    expect(shared).not.toHaveProperty("T3CODE_DESKTOP_ATTACHED_CREDENTIAL");
    expect(client).toMatchObject({
      T3CODE_QA_DATABASE_URL: "postgresql://qa.example/shared",
      OPENAI_API_KEY: "provider-key",
      T3CODE_DESKTOP_ATTACHED_CREDENTIAL: credentials.root,
    });
  });

  it("prints a runnable redacted dry-run topology without spawning children", () => {
    const scriptPath = NodePath.join(
      NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
      "qa-shared-dev-supervisor.mjs",
    );
    const result = NodeChildProcess.spawnSync(
      process.execPath,
      [scriptPath, "--dry-run", "--home-dir", "/tmp/qa-shared-dry-run"],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.processes).toEqual({
      buildWatcherSets: 1,
      viteServers: 1,
      backends: 1,
      clients: ["root", "qa:maker", "qa:approver"],
    });
    expect(summary.backend.home).toBe("/tmp/qa-shared-dry-run/profiles/root");
    expect(summary.backend.grants.every((grant) => grant.credential.includes("redacted"))).toBe(
      true,
    );
  });

  it("resolves one shared backend/watcher/Vite topology and one credential per client", () => {
    const topology = resolveQaSharedDevTopology({
      repositoryRoot: "/repo",
      baseHome: "/state",
      credentials,
      expectedEnvironmentId: "environment-shared",
    });
    const summary = summarizeQaSharedDevTopology(topology);

    expect(summary.processes).toEqual({
      buildWatcherSets: 1,
      viteServers: 1,
      backends: 1,
      clients: ["root", "qa:maker", "qa:approver"],
    });
    expect(topology.backendHome).toBe("/state/profiles/root");
    expect(topology.bootstrap).toMatchObject({ version: 2, grants: expect.any(Array) });
    expect(topology.bootstrap.grants).toHaveLength(3);
    expect(new Set(topology.bootstrap.grants.map((grant) => grant.credential)).size).toBe(3);
    expect(topology.buildWatch.env).not.toHaveProperty("T3CODE_DESKTOP_ATTACHED_CREDENTIAL");
    expect(topology.web.env).not.toHaveProperty("T3CODE_DESKTOP_ATTACHED_CREDENTIAL");
    expect(topology.backend.env).not.toHaveProperty("T3CODE_DESKTOP_ATTACHED_CREDENTIAL");

    const sharedUserDataPaths = topology.clients.map(
      (client) => client.env.T3CODE_DESKTOP_USER_DATA_PATH,
    );
    expect(new Set(sharedUserDataPaths).size).toBe(3);

    for (const client of topology.clients) {
      expect(client.env.T3CODE_DESKTOP_ATTACHED_CREDENTIAL).toBe(credentials[client.profile]);
      expect(
        Object.values(credentials).filter((credential) =>
          Object.values(client.env).includes(credential),
        ),
      ).toEqual([credentials[client.profile]]);
      expect(client.env.T3CODE_DESKTOP_ATTACHED_ENVIRONMENT_ID).toBe("environment-shared");
      expect(client.env.T3CODE_HOME).not.toBe(topology.backendHome);
      const legacyUserDataPath = resolveDevelopmentUserDataPath({
        environment: { T3CODE_DEV_PROFILE: client.profile },
        homeDirectory: "/Users/alice",
        platform: "darwin",
      });
      expect(client.env.T3CODE_DESKTOP_USER_DATA_PATH).not.toBe(legacyUserDataPath);
      expect(client.env.T3CODE_DESKTOP_USER_DATA_PATH).toBe(`${client.env.T3CODE_HOME}/user-data`);
    }
    expect(summary.historyPolicy.clients).toContain("not imported");
    expect(JSON.stringify(summary)).not.toContain(credentials.root);
  });

  it("supports an explicit subset of clients while always provisioning all three server grants", () => {
    const topology = resolveQaSharedDevTopology({
      repositoryRoot: "/repo",
      baseHome: "/state",
      profiles: ["qa:maker"],
      credentials,
    });

    expect(topology.clients.map((client) => client.profile)).toEqual(["qa:maker"]);
    expect(topology.bootstrap.grants.map((grant) => grant.profile)).toEqual([
      "root",
      "qa:maker",
      "qa:approver",
    ]);
    expect(() => normalizeQaSharedProfiles(["qa:maker", "qa:maker"])).toThrow(/Duplicate/);
    expect(() => normalizeQaSharedProfiles(["qa:unknown"])).toThrow(/Unknown/);
  });

  it("rejects missing and invalid port flag values", () => {
    expect(() => parseQaSharedDevArgs(["--port"])).toThrow(/requires a value/);
    expect(() => parseQaSharedDevArgs(["--port", "NaN"])).toThrow(/between 1 and 65535/);
    expect(() => parseQaSharedDevArgs(["--web-port", "65536"])).toThrow(/between 1 and 65535/);
    expect(parseQaSharedDevArgs(["--port", "14000", "--web-port", "6000"])).toMatchObject({
      serverPort: 14_000,
      webPort: 6_000,
    });
  });

  it("restarts only the owned backend and stops without scheduling another start", () => {
    const children = [];
    const scheduled = [];
    const cancelled = [];
    const controller = createQaSharedBackendController({
      spawnBackend: () => {
        const child = new FakeChild();
        children.push(child);
        return child;
      },
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancel: (handle) => cancelled.push(handle),
    });

    controller.start();
    expect(children).toHaveLength(1);
    controller.clientExited("qa:maker");
    expect(children[0].kills).toEqual([]);
    expect(controller.snapshot().running).toBe(true);
    controller.restart();
    expect(children[0].kills).toEqual(["SIGTERM"]);
    controller.restart();
    expect(children[0].kills).toEqual(["SIGTERM"]);
    children[0].emit("close", 0, null);
    expect(controller.snapshot().restartScheduled).toBe(true);
    controller.restart();
    expect(children).toHaveLength(1);
    scheduled.shift()();
    expect(children).toHaveLength(2);

    controller.stop();
    expect(children[1].kills).toEqual(["SIGTERM"]);
    children[1].emit("close", 0, null);
    expect(controller.snapshot()).toMatchObject({
      stopped: true,
      running: false,
      restartScheduled: false,
    });
    expect(cancelled).toEqual([]);
  });

  it("waits for close after a spawn error even when exit is absent", () => {
    const children = [];
    const scheduled = [];
    const controller = createQaSharedBackendController({
      spawnBackend: () => {
        const child = new FakeChild();
        children.push(child);
        return child;
      },
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
    });

    controller.start();
    children[0].emit("error", new Error("spawn failed after child creation"));
    expect(scheduled).toHaveLength(0);
    expect(controller.snapshot().running).toBe(true);
    children[0].emit("close", -2, null);
    expect(scheduled).toHaveLength(1);
    expect(controller.snapshot()).toMatchObject({
      running: false,
      restartScheduled: true,
    });

    controller.restart();
    expect(children).toHaveLength(1);
    scheduled[0]();
    expect(children).toHaveLength(2);
  });

  it("settles shutdown completion once and removes both signal handlers", async () => {
    const listeners = new Map();
    const cleanupSignals = [];
    let finishCleanup;
    const cleanupBarrier = new Promise((resolve) => {
      finishCleanup = resolve;
    });
    const coordinator = createQaSharedShutdownCoordinator({
      cleanup: async (signal) => {
        cleanupSignals.push(signal);
        await cleanupBarrier;
      },
      addSignalListener: (signal, listener) => listeners.set(signal, listener),
      removeSignalListener: (signal, listener) => {
        if (listeners.get(signal) === listener) listeners.delete(signal);
      },
    });

    coordinator.install();
    expect([...listeners.keys()].sort()).toEqual(["SIGINT", "SIGTERM"]);
    listeners.get("SIGINT")();
    listeners.get("SIGTERM")();
    expect(cleanupSignals).toEqual(["SIGTERM"]);

    let completed = false;
    void coordinator.completion.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    finishCleanup();
    await coordinator.completion;
    expect(completed).toBe(true);
    expect(listeners.size).toBe(0);
    expect(coordinator.shutdown()).toBe(coordinator.completion);
    expect(cleanupSignals).toEqual(["SIGTERM"]);
  });
});
