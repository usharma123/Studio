import type { EnvironmentId, QaReleaseId } from "@t3tools/contracts";

import type { QaReleaseRef } from "./qa/releaseRef";

export const QA_RELEASE_ROUTE = "/$environmentId/qa/releases/$releaseId" as const;

export function buildQaReleaseRouteParams(ref: QaReleaseRef): {
  readonly environmentId: EnvironmentId;
  readonly releaseId: QaReleaseId;
} {
  return ref;
}

/** One navigation target for every entry point into a shared QA release. */
export function qaReleaseRouteTarget(ref: QaReleaseRef) {
  return {
    to: QA_RELEASE_ROUTE,
    params: buildQaReleaseRouteParams(ref),
  } as const;
}

export function resolveQaReleaseRouteRef(
  params: Partial<Record<"environmentId" | "releaseId", string | undefined>>,
): QaReleaseRef | null {
  if (!params.environmentId || !params.releaseId) return null;
  return {
    environmentId: params.environmentId as EnvironmentId,
    releaseId: params.releaseId as QaReleaseId,
  };
}
