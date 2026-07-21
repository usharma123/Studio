import type {
  AuthSessionId,
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";

export type McpProviderSessionAuthorizationContext =
  | {
      readonly kind: "standard";
      readonly principalSubject: string;
      readonly workspaceAdministrator: boolean;
    }
  | {
      readonly kind: "qa-release";
      readonly releaseThreadId: ThreadId;
      readonly principalSubject: string;
      readonly workspaceAdministrator: boolean;
    };

export interface McpProviderSessionConfig {
  readonly initiatingSessionId: AuthSessionId;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly endpoint: string;
  readonly authorizationHeader: string;
  readonly authorizationContext: McpProviderSessionAuthorizationContext;
}

const sessionsByThread = new Map<ThreadId, McpProviderSessionConfig>();

export function setMcpProviderSession(config: McpProviderSessionConfig): void {
  sessionsByThread.set(config.threadId, config);
}

export function readMcpProviderSession(threadId: ThreadId): McpProviderSessionConfig | undefined {
  return sessionsByThread.get(threadId);
}

export function clearMcpProviderSession(threadId: ThreadId): void {
  sessionsByThread.delete(threadId);
}

export function clearMcpProviderSessionIfCurrent(
  threadId: ThreadId,
  providerSessionId: string,
): boolean {
  if (sessionsByThread.get(threadId)?.providerSessionId !== providerSessionId) {
    return false;
  }
  sessionsByThread.delete(threadId);
  return true;
}

export function clearAllMcpProviderSessions(): void {
  sessionsByThread.clear();
}
