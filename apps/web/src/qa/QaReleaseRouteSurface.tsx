import { useEnvironmentQuery } from "~/state/query";

import { qaEnvironment } from "./client";
import { QaWorkbench } from "./QaWorkbench";
import type { QaReleaseRef } from "./releaseRef";

interface QaReleaseRouteSurfaceProps {
  readonly releaseRef: QaReleaseRef;
}

/**
 * PG-backed QA surface. It intentionally resolves no orchestration project or
 * conversation; agent automation is supplied separately and may provision a
 * role-local conversation only when an action actually needs one.
 */
export function QaReleaseRouteSurface(props: QaReleaseRouteSurfaceProps) {
  const assigned = useEnvironmentQuery(
    qaEnvironment.listAssignedReleases({
      environmentId: props.releaseRef.environmentId,
      input: {},
    }),
  );
  const release = assigned.data?.releases.find(
    (candidate) => candidate.releaseId === props.releaseRef.releaseId,
  );

  return (
    <QaWorkbench
      releaseRef={props.releaseRef}
      projectTitle={release?.projectTitle ?? "QA project"}
    />
  );
}
