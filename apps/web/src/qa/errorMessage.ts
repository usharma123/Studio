const FALLBACK_QA_ERROR =
  "The QA workflow could not complete that action. Retry, then check service health if it continues.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyMessage(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function qaWorkflowErrorMessage(cause: unknown): string {
  const queue: unknown[] = [cause];
  const visited = new Set<object>();
  let firstMessage: string | null = null;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isRecord(current) || visited.has(current)) continue;
    visited.add(current);

    const message = nonEmptyMessage(current.message);
    if (current._tag === "QaOperationError" && message) return message;
    firstMessage ??= message;

    queue.push(current.cause, current.error, current.reason);
  }

  return firstMessage ?? FALLBACK_QA_ERROR;
}
