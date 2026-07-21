import * as NodeChildProcess from "node:child_process";

function escapeExtendedRegularExpression(value) {
  return value.replaceAll(/[\\.^$|?*+()[\]{}]/g, "\\$&");
}

function exactOrderedArgumentsPattern(argumentsInProcessOrder) {
  const [firstArgument, ...remainingArguments] = argumentsInProcessOrder;
  const betweenArguments = "[[:space:]](.*[[:space:]])?";
  return (
    `(^|[[:space:]])${escapeExtendedRegularExpression(firstArgument)}` +
    remainingArguments
      .map((argument) => `${betweenArguments}${escapeExtendedRegularExpression(argument)}`)
      .join("") +
    "([[:space:]]|$)"
  );
}

export function resolveDevelopmentProcessIdentity({
  desktopRoot,
  userDataPath,
  developmentProfile,
  developmentInstance,
}) {
  const userDataArgument = `--user-data-dir=${userDataPath}`;
  const desktopRootArgument = `--t3code-dev-root=${desktopRoot}`;
  // Keep persona and instance markers present even when their values are
  // empty. Cleanup can then prove the complete identity without relying on
  // unsupported negative regex matching.
  const profileArguments = [`--t3code-dev-profile=${developmentProfile ?? ""}`];
  const instanceArgument = `--t3code-dev-instance=${developmentInstance ?? ""}`;
  const argumentsInProcessOrder = [
    userDataArgument,
    desktopRootArgument,
    ...profileArguments,
    instanceArgument,
  ];

  return {
    userDataArgument,
    desktopRootArgument,
    profileArguments,
    instanceArgument,
    matchPattern: exactOrderedArgumentsPattern(argumentsInProcessOrder),
  };
}

export function cleanupStaleDevelopmentApps({
  hostPlatform,
  processIdentity,
  spawnSync = NodeChildProcess.spawnSync,
}) {
  if (hostPlatform === "win32") {
    return;
  }

  spawnSync("pkill", ["-f", "--", processIdentity.matchPattern], {
    stdio: "ignore",
  });
}
