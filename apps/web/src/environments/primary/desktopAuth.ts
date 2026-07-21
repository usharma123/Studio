export function readDesktopPrimaryBearerToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  const bridge = window.desktopBridge;
  if (!bridge) {
    return Promise.resolve(null);
  }

  // The desktop main process caches by backend endpoint and bootstrap
  // credential. Always cross the IPC boundary so an in-place credential or
  // subject switch cannot reuse a renderer-global bearer promise.
  return bridge.getLocalEnvironmentBearerToken();
}

export function __resetDesktopPrimaryAuthForTests(): void {
  // Kept for compatibility with existing tests. There is no renderer cache.
}
