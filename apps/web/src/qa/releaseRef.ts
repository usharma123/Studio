import type { EnvironmentId, QaReleaseId } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";

/** Canonical client identity for a shared QA release. */
export interface QaReleaseRef {
  readonly environmentId: EnvironmentId;
  readonly releaseId: QaReleaseId;
}

export function qaReleaseKey(ref: QaReleaseRef): string {
  return `${ref.environmentId}:qa-release:${ref.releaseId}`;
}

/**
 * QA RPCs still address the Postgres release row through its legacy
 * `thread_id` column. Keep that compatibility conversion at the transport
 * boundary so UI state never treats a release as a local conversation.
 */
export function legacyQaThreadId(releaseId: QaReleaseId): ThreadId {
  return ThreadId.make(releaseId);
}
