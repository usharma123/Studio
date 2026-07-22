#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { loadRepoEnv } from "./lib/public-config.ts";

Object.assign(process.env, loadRepoEnv());

const ALL_PROFILES = ["root", "qa:maker", "qa:approver"];
const PROFILE_SLUGS = {
  root: "root",
  "qa:maker": "qa-maker",
  "qa:approver": "qa-approver",
};
const DEFAULT_SERVER_PORT = 13_773;
const DEFAULT_WEB_PORT = 5_733;
const READINESS_PATH = "/.well-known/t3/environment";
const repoRoot = NodeURL.fileURLToPath(new URL("..", import.meta.url));

export function createQaSharedCredentials(randomBytes = NodeCrypto.randomBytes) {
  return Object.fromEntries(
    ALL_PROFILES.map((profile) => [profile, randomBytes(24).toString("hex")]),
  );
}

export function normalizeQaSharedProfiles(profiles = ALL_PROFILES) {
  const unique = new Set();
  for (const profile of profiles) {
    if (!ALL_PROFILES.includes(profile)) {
      throw new Error(`Unknown QA shared desktop profile: ${profile}`);
    }
    if (unique.has(profile)) {
      throw new Error(`Duplicate QA shared desktop profile: ${profile}`);
    }
    unique.add(profile);
  }
  if (unique.size === 0) {
    throw new Error("At least one QA shared desktop client profile is required.");
  }
  return [...unique];
}

export function resolveQaSharedDevTopology({
  repositoryRoot = repoRoot,
  baseHome = NodePath.join(NodeOS.homedir(), ".codex-studio"),
  backendHome = NodePath.join(baseHome, "profiles", "root"),
  serverPort = DEFAULT_SERVER_PORT,
  webPort = DEFAULT_WEB_PORT,
  profiles = ALL_PROFILES,
  credentials = createQaSharedCredentials(),
  expectedEnvironmentId = "<resolved-after-readiness>",
} = {}) {
  for (const [label, port] of [
    ["server", serverPort],
    ["web", webPort],
  ]) {
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error(`QA shared ${label} port must be an integer between 1 and 65535.`);
    }
  }
  if (serverPort === webPort) {
    throw new Error("QA shared server and web ports must be distinct.");
  }
  const selectedProfiles = normalizeQaSharedProfiles(profiles);
  for (const profile of ALL_PROFILES) {
    if (!/^[0-9a-f]{48}$/.test(credentials[profile] ?? "")) {
      throw new Error(`Missing or invalid QA shared credential for ${profile}.`);
    }
  }
  if (new Set(Object.values(credentials)).size !== ALL_PROFILES.length) {
    throw new Error("QA shared desktop credentials must be pairwise distinct.");
  }

  const desktopOutputDir = NodePath.join(repositoryRoot, "apps", "desktop", "dist-electron-shared");
  const serverOutputDir = NodePath.join(repositoryRoot, "apps", "server", "dist-desktop-shared");
  const backendEntryPath = NodePath.join(serverOutputDir, "bin.mjs");
  const httpBaseUrl = `http://127.0.0.1:${serverPort}/`;
  const webUrl = `http://127.0.0.1:${webPort}/`;
  const sharedArtifactEnv = {
    T3CODE_DESKTOP_OUTPUT_DIR: desktopOutputDir,
    T3CODE_SERVER_OUTPUT_DIR: serverOutputDir,
  };
  const bootstrap = {
    mode: "desktop",
    noBrowser: true,
    port: serverPort,
    t3Home: backendHome,
    host: "127.0.0.1",
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
    version: 2,
    grants: ALL_PROFILES.map((profile) => ({
      profile,
      credential: credentials[profile],
    })),
  };

  return {
    repositoryRoot,
    baseHome,
    backendHome,
    desktopOutputDir,
    serverOutputDir,
    backendEntryPath,
    httpBaseUrl,
    webUrl,
    expectedEnvironmentId,
    profiles: selectedProfiles,
    credentials,
    bootstrap,
    historyPolicy: {
      backend:
        "Reuse the existing root profile backend home to preserve its signing secret, environment ID, provider configuration, and SQLite runtime.",
      clients:
        "Use new per-profile shared-client homes. Existing maker/approver local chat histories are not imported and remain untouched/disposable.",
    },
    buildWatch: {
      command: "vp",
      args: ["run", "--filter=t3", "--filter=@t3tools/desktop", "--parallel", "dev:desktop-shared"],
      env: sharedArtifactEnv,
    },
    web: {
      command: "vp",
      args: ["run", "--filter=@t3tools/web", "dev"],
      env: {
        PORT: String(webPort),
        HOST: "127.0.0.1",
        VITE_DEV_SERVER_URL: webUrl,
        VITE_HTTP_URL: httpBaseUrl,
        VITE_WS_URL: `ws://127.0.0.1:${serverPort}/`,
      },
    },
    backend: {
      command: process.execPath,
      args: [backendEntryPath, "--bootstrap-fd", "3"],
      env: {
        T3CODE_HOME: backendHome,
        VITE_DEV_SERVER_URL: webUrl,
      },
    },
    clients: selectedProfiles.map((profile) => ({
      profile,
      command: process.execPath,
      args: [NodePath.join(repositoryRoot, "apps", "desktop", "scripts", "dev-electron.mjs")],
      env: {
        ...sharedArtifactEnv,
        T3CODE_DESKTOP_BACKEND_ENTRY_PATH: backendEntryPath,
        T3CODE_HOME: NodePath.join(baseHome, "shared-clients", PROFILE_SLUGS[profile]),
        T3CODE_DESKTOP_USER_DATA_PATH: NodePath.join(
          baseHome,
          "shared-clients",
          PROFILE_SLUGS[profile],
          "user-data",
        ),
        T3CODE_DEV_PROFILE: profile,
        T3CODE_DEV_INSTANCE: `desktop-shared-${PROFILE_SLUGS[profile]}`,
        VITE_DEV_SERVER_URL: webUrl,
        VITE_HTTP_URL: httpBaseUrl,
        VITE_WS_URL: `ws://127.0.0.1:${serverPort}/`,
        T3CODE_DESKTOP_ATTACHED_BACKEND_URL: httpBaseUrl,
        T3CODE_DESKTOP_ATTACHED_ENVIRONMENT_ID: expectedEnvironmentId,
        // This is the only grant credential delivered to this client process.
        T3CODE_DESKTOP_ATTACHED_CREDENTIAL: credentials[profile],
      },
    })),
  };
}

export function summarizeQaSharedDevTopology(topology) {
  return {
    processes: {
      buildWatcherSets: 1,
      viteServers: 1,
      backends: 1,
      clients: topology.clients.map((client) => client.profile),
    },
    backend: {
      home: topology.backendHome,
      port: Number(new URL(topology.httpBaseUrl).port),
      entryPath: topology.backendEntryPath,
      grants: topology.bootstrap.grants.map((grant) => ({
        profile: grant.profile,
        credential: "<redacted:48-hex>",
      })),
    },
    clientHomes: Object.fromEntries(
      topology.clients.map((client) => [client.profile, client.env.T3CODE_HOME]),
    ),
    artifacts: {
      desktop: topology.desktopOutputDir,
      server: topology.serverOutputDir,
    },
    historyPolicy: topology.historyPolicy,
  };
}

export function parseQaSharedDevArgs(argv) {
  const options = { profiles: [] };
  const readValue = (index, flag) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    return value;
  };
  const readPort = (index, flag) => {
    const raw = readValue(index, flag);
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error(`${flag} must be an integer between 1 and 65535.`);
    }
    return port;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--profile") {
      options.profiles.push(readValue(index, argument));
      index += 1;
    } else if (argument === "--backend-home") {
      options.backendHome = NodePath.resolve(readValue(index, argument));
      index += 1;
    } else if (argument === "--home-dir") {
      options.baseHome = NodePath.resolve(readValue(index, argument));
      index += 1;
    } else if (argument === "--port") {
      options.serverPort = readPort(index, argument);
      index += 1;
    } else if (argument === "--web-port") {
      options.webPort = readPort(index, argument);
      index += 1;
    } else {
      throw new Error(`Unknown QA shared dev option: ${argument}`);
    }
  }
  if (options.profiles.length === 0) delete options.profiles;
  return options;
}

export function createQaSharedBackendController({
  spawnBackend,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = clearTimeout,
  restartDelayMs = 500,
}) {
  let child = null;
  let stopped = false;
  let restartRequested = false;
  let restartHandle = null;

  const scheduleRestart = () => {
    if (stopped || restartHandle !== null) return;
    restartHandle = schedule(() => {
      restartHandle = null;
      start();
    }, restartDelayMs);
  };
  const start = () => {
    if (stopped || child !== null || restartHandle !== null) return;
    const started = spawnBackend();
    child = started;
    let terminated = false;
    const onTerminated = () => {
      if (terminated) return;
      terminated = true;
      if (child !== started) return;
      child = null;
      restartRequested = false;
      scheduleRestart();
    };
    // Node guarantees `close` after either `exit` or a failed-spawn `error`,
    // while `exit` itself may be omitted after an error. Merely observing an
    // error is not proof that an already-running process has terminated.
    const onError = () => undefined;
    started.on("error", onError);
    started.once("close", () => {
      started.removeListener("error", onError);
      onTerminated();
    });
  };
  const restart = () => {
    if (stopped) return;
    if (child === null) {
      if (restartHandle === null) start();
      return;
    }
    if (restartRequested) return;
    restartRequested = true;
    child.kill("SIGTERM");
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (restartHandle !== null) cancel(restartHandle);
    restartHandle = null;
    if (child !== null) child.kill("SIGTERM");
  };

  return {
    start,
    restart,
    stop,
    currentChild: () => child,
    // Client launchers are independent leaves. Their exit must never alter
    // backend ownership or trigger supervisor shutdown.
    clientExited: () => undefined,
    snapshot: () => ({
      stopped,
      running: child !== null,
      restartRequested,
      restartScheduled: restartHandle !== null,
    }),
  };
}

export function createQaSharedShutdownCoordinator({
  cleanup,
  addSignalListener = (signal, listener) => process.once(signal, listener),
  removeSignalListener = (signal, listener) => process.removeListener(signal, listener),
}) {
  let installed = false;
  let shutdownStarted = false;
  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  // A programmatic caller may await shutdown() without separately observing
  // completion. Mark the shared deferred rejection as handled either way.
  void completion.catch(() => undefined);

  const removeSignalHandlers = () => {
    if (!installed) return;
    installed = false;
    removeSignalListener("SIGINT", onSignal);
    removeSignalListener("SIGTERM", onSignal);
  };
  const shutdown = (signal = "SIGTERM") => {
    if (shutdownStarted) return completion;
    shutdownStarted = true;
    void (async () => {
      try {
        await cleanup(signal);
        resolveCompletion();
      } catch (error) {
        rejectCompletion(error);
      } finally {
        removeSignalHandlers();
      }
    })();
    return completion;
  };
  const onSignal = () => {
    void shutdown("SIGTERM");
  };
  const install = () => {
    if (installed || shutdownStarted) return;
    installed = true;
    addSignalListener("SIGINT", onSignal);
    addSignalListener("SIGTERM", onSignal);
  };

  return { completion, install, shutdown };
}

export function mergeQaSharedProcessEnvironment(baseEnvironment, patch, { client = false } = {}) {
  const environment = { ...baseEnvironment, ...patch };
  if (client) return environment;

  delete environment.T3CODE_DESKTOP_ATTACHED_CREDENTIAL;
  delete environment.T3CODE_DESKTOP_ATTACHED_BACKEND_URL;
  delete environment.T3CODE_DESKTOP_ATTACHED_ENVIRONMENT_ID;
  delete environment.T3CODE_DEV_PROFILE;
  return environment;
}

function spawnPersistent(spec, options = {}) {
  return NodeChildProcess.spawn(spec.command, spec.args, {
    cwd: repoRoot,
    env: mergeQaSharedProcessEnvironment(process.env, spec.env, {
      client: options.client === true,
    }),
    stdio: options.bootstrap ? ["inherit", "inherit", "inherit", "pipe"] : "inherit",
    detached: false,
  });
}

export async function assertQaSharedPortAvailable(
  httpBaseUrl,
  { createServer = NodeNet.createServer, serviceLabel = "QA shared service" } = {},
) {
  const url = new URL(httpBaseUrl);
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${serviceLabel} URL must contain an explicit valid port: ${httpBaseUrl}`);
  }

  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        reject(
          new Error(
            `${serviceLabel} port ${url.hostname}:${port} is already in use; refusing to send bootstrap grants or attach clients.`,
            { cause: error },
          ),
        );
        return;
      }
      reject(error);
    });
    probe.listen({ host: url.hostname, port, exclusive: true }, () => {
      probe.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
}

// Retain the narrower export for callers using the original backend-only
// preflight API while the supervisor itself verifies every owned listener.
export function assertQaSharedBackendPortAvailable(httpBaseUrl, options = {}) {
  return assertQaSharedPortAvailable(httpBaseUrl, {
    serviceLabel: "Shared backend",
    ...options,
  });
}

export function readQaSharedArtifactGeneration(path) {
  try {
    const stats = NodeFS.statSync(path, { bigint: true });
    if (!stats.isFile()) return undefined;
    return [stats.dev, stats.ino, stats.size, stats.mtimeNs, stats.ctimeNs].join(":");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function waitForFreshQaSharedArtifact(
  path,
  previousGeneration,
  timeoutMs = 60_000,
  pollIntervalMs = 100,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const generation = readQaSharedArtifactGeneration(path);
    if (generation !== undefined && generation !== previousGeneration) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Timed out waiting for a fresh shared development artifact: ${path}`);
}

function assertOwnedBackendIsCurrent(backendChild, isCurrent) {
  if (!isCurrent() || backendChild.exitCode !== null || backendChild.signalCode !== null) {
    throw new Error("The owned shared backend exited before readiness could be verified.");
  }
}

function assertOwnedViteIsCurrent(viteChild, isCurrent) {
  if (!isCurrent() || viteChild.exitCode !== null || viteChild.signalCode !== null) {
    throw new Error("The owned shared Vite server exited before readiness could be verified.");
  }
}

export async function waitForOwnedQaSharedViteServer({
  webUrl,
  viteChild,
  isCurrent,
  timeoutMs = 60_000,
  pollIntervalMs = 100,
  fetchImpl = fetch,
}) {
  if (!Number.isInteger(viteChild.pid) || viteChild.pid < 1) {
    throw new Error("The owned shared Vite server did not expose a valid process ID.");
  }

  const url = new URL(webUrl);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    assertOwnedViteIsCurrent(viteChild, isCurrent);
    let response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(1_000) });
    } catch {
      // Vite may not have bound the port yet. Ownership is checked again
      // outside this catch so a child exit can never be mistaken for retryable
      // network startup latency.
    }
    assertOwnedViteIsCurrent(viteChild, isCurrent);
    if (response?.ok) return response;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for the owned shared Vite server at ${url.href}.`);
}

export async function waitForOwnedQaSharedBackendIdentity({
  topology,
  backendChild,
  isCurrent,
  startedAtMs,
  timeoutMs = 60_000,
  pollIntervalMs = 100,
}) {
  if (!Number.isInteger(backendChild.pid) || backendChild.pid < 1) {
    throw new Error("The owned shared backend did not expose a valid process ID.");
  }

  const environmentIdPath = NodePath.join(topology.backendHome, "dev", "environment-id");
  const runtimeStatePath = NodePath.join(topology.backendHome, "dev", "server-runtime.json");
  const expectedUrl = new URL(topology.httpBaseUrl);
  const expectedPort = Number(expectedUrl.port);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    assertOwnedBackendIsCurrent(backendChild, isCurrent);
    try {
      const environmentId = NodeFS.readFileSync(environmentIdPath, "utf8").trim();
      const runtimeState = JSON.parse(NodeFS.readFileSync(runtimeStatePath, "utf8"));
      const runtimeStartedAtMs = Date.parse(runtimeState?.startedAt ?? "");
      if (
        environmentId.length > 0 &&
        runtimeState?.version === 1 &&
        runtimeState.pid === backendChild.pid &&
        runtimeState.port === expectedPort &&
        runtimeState.origin === expectedUrl.origin &&
        Number.isFinite(runtimeStartedAtMs) &&
        runtimeStartedAtMs >= startedAtMs
      ) {
        assertOwnedBackendIsCurrent(backendChild, isCurrent);
        return environmentId;
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Timed out verifying owned shared backend identity for PID ${backendChild.pid} at ${expectedUrl.origin}.`,
  );
}

async function waitForDescriptor(
  httpBaseUrl,
  expectedEnvironmentId,
  assertBackendOwnership,
  timeoutMs = 60_000,
) {
  if (typeof expectedEnvironmentId !== "string" || expectedEnvironmentId.length === 0) {
    throw new Error("Shared backend readiness requires a nonempty expected environment ID.");
  }
  const started = Date.now();
  const url = new URL(READINESS_PATH, httpBaseUrl);
  while (Date.now() - started < timeoutMs) {
    assertBackendOwnership();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      const descriptor = await response.json();
      if (
        response.ok &&
        typeof descriptor?.environmentId === "string" &&
        descriptor.environmentId.length > 0
      ) {
        if (descriptor.environmentId !== expectedEnvironmentId) {
          throw new Error(
            `Shared backend environment mismatch: expected ${expectedEnvironmentId}, received ${descriptor.environmentId}.`,
          );
        }
        assertBackendOwnership();
        return descriptor;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Shared backend environment mismatch")
      ) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for shared backend descriptor at ${url.href}`);
}

export async function runQaSharedDevSupervisor(topology, dependencies = {}) {
  const {
    spawnProcess = spawnPersistent,
    waitForArtifact = waitForFreshQaSharedArtifact,
    waitForOwnedViteServer = waitForOwnedQaSharedViteServer,
    waitForOwnedBackendIdentity = waitForOwnedQaSharedBackendIdentity,
    waitForBackendDescriptor = waitForDescriptor,
    watchServerOutput = NodeFS.watch,
  } = dependencies;
  // `assertBackendPortAvailable` is accepted for compatibility with the
  // original backend-only dependency seam. It now preflights both listeners.
  const assertPortAvailable =
    dependencies.assertPortAvailable ??
    dependencies.assertBackendPortAvailable ??
    assertQaSharedPortAvailable;

  // Vite's checked-in configuration uses server.strictPort=true. Proving both
  // ports are free before any spawn, then requiring the exact spawned Vite
  // child to remain alive through HTTP readiness, prevents a preexisting
  // listener (or Vite's usual next-port fallback) from being accepted.
  await assertPortAvailable(topology.httpBaseUrl, { serviceLabel: "Shared backend" });
  await assertPortAvailable(topology.webUrl, { serviceLabel: "Shared web/Vite" });

  const children = new Set();
  const failedChildren = new WeakSet();
  let shuttingDown = false;
  let restartDebounce = null;
  let watcher = null;

  const track = (child) => {
    children.add(child);
    const onError = () => failedChildren.add(child);
    child.on("error", onError);
    child.once("close", () => {
      child.removeListener("error", onError);
      children.delete(child);
    });
    return child;
  };
  const backendController = createQaSharedBackendController({
    spawnBackend: () => {
      const child = track(spawnProcess(topology.backend, { bootstrap: true }));
      child.stdio[3].end(`${JSON.stringify(topology.bootstrap)}\n`);
      return child;
    },
  });

  const stopTrackedChildren = async (signal) => {
    const trackedChildren = [...children];
    const closePromises = trackedChildren.map((child) =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => child.once("close", resolve)),
    );
    const backendChild = backendController.currentChild();
    backendController.stop();
    for (const child of trackedChildren) {
      if (child !== backendChild) child.kill(signal);
    }
    await Promise.all(closePromises);
  };

  let descriptor;
  try {
    const artifactPaths = [
      topology.backendEntryPath,
      NodePath.join(topology.desktopOutputDir, "main.cjs"),
      NodePath.join(topology.desktopOutputDir, "preload.cjs"),
    ];
    const artifactGenerations = new Map(
      artifactPaths.map((path) => [path, readQaSharedArtifactGeneration(path)]),
    );
    track(spawnProcess(topology.buildWatch));
    const viteChild = track(spawnProcess(topology.web));
    const assertViteOwnership = () =>
      assertOwnedViteIsCurrent(
        viteChild,
        () => children.has(viteChild) && !failedChildren.has(viteChild),
      );
    await Promise.all([
      ...artifactPaths.map((path) => waitForArtifact(path, artifactGenerations.get(path))),
      waitForOwnedViteServer({
        webUrl: topology.webUrl,
        viteChild,
        isCurrent: () => children.has(viteChild) && !failedChildren.has(viteChild),
      }),
    ]);
    assertViteOwnership();
    const backendStartedAtMs = Date.now();
    backendController.start();
    const ownedBackendChild = backendController.currentChild();
    if (ownedBackendChild === null) {
      throw new Error("The shared backend failed to start.");
    }
    const assertBackendOwnership = () =>
      assertOwnedBackendIsCurrent(
        ownedBackendChild,
        () => backendController.currentChild() === ownedBackendChild,
      );
    const expectedEnvironmentId = await waitForOwnedBackendIdentity({
      topology,
      backendChild: ownedBackendChild,
      isCurrent: () => backendController.currentChild() === ownedBackendChild,
      startedAtMs: backendStartedAtMs,
    });
    descriptor = await waitForBackendDescriptor(
      topology.httpBaseUrl,
      expectedEnvironmentId,
      assertBackendOwnership,
    );
    const connectedTopology = resolveQaSharedDevTopology({
      repositoryRoot: topology.repositoryRoot,
      baseHome: topology.baseHome,
      backendHome: topology.backendHome,
      serverPort: Number(new URL(topology.httpBaseUrl).port),
      webPort: Number(new URL(topology.webUrl).port),
      profiles: topology.profiles,
      credentials: topology.credentials,
      expectedEnvironmentId: descriptor.environmentId,
    });
    assertViteOwnership();
    for (const client of connectedTopology.clients) {
      track(spawnProcess(client, { client: true }));
    }

    watcher = watchServerOutput(topology.serverOutputDir, (_event, filename) => {
      if (shuttingDown || filename !== NodePath.basename(topology.backendEntryPath)) return;
      clearTimeout(restartDebounce);
      restartDebounce = setTimeout(() => {
        restartDebounce = null;
        backendController.restart();
      }, 150);
    });
  } catch (error) {
    shuttingDown = true;
    watcher?.close();
    watcher = null;
    clearTimeout(restartDebounce);
    restartDebounce = null;
    await stopTrackedChildren("SIGTERM");
    throw error;
  }

  const coordinator = createQaSharedShutdownCoordinator({
    cleanup: async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      watcher?.close();
      watcher = null;
      clearTimeout(restartDebounce);
      restartDebounce = null;

      await stopTrackedChildren(signal);
    },
  });
  coordinator.install();
  return {
    descriptor,
    shutdown: coordinator.shutdown,
    completion: coordinator.completion,
  };
}

if (import.meta.main) {
  const options = parseQaSharedDevArgs(process.argv.slice(2));
  const topology = resolveQaSharedDevTopology(options);
  console.log(JSON.stringify(summarizeQaSharedDevTopology(topology), null, 2));
  if (!options.dryRun) {
    const supervisor = await runQaSharedDevSupervisor(topology);
    await supervisor.completion;
  }
}
