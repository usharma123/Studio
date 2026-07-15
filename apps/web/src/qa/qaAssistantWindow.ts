const QA_ASSISTANT_WINDOW_PARAM = "qaAssistant";
const QA_ASSISTANT_WINDOW_VALUE = "detached";

export function isDetachedQaAssistantWindow(url: URL): boolean {
  return url.searchParams.get(QA_ASSISTANT_WINDOW_PARAM) === QA_ASSISTANT_WINDOW_VALUE;
}

export function isCurrentWindowDetachedQaAssistant(): boolean {
  return (
    typeof window !== "undefined" && isDetachedQaAssistantWindow(new URL(window.location.href))
  );
}
