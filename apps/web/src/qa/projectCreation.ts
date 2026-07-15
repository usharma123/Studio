import type { ProjectId } from "@t3tools/contracts";

import { appendBrowsePathSegment, ensureBrowseDirectoryPath } from "../lib/projectPaths";

const QA_PROJECT_DIRECTORY = ".t3-qa-projects";

export function qaProjectDirectoryName(projectTitle: string, projectId: ProjectId): string {
  const slug = projectTitle
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  const suffix = projectId
    .replace(/[^a-z0-9]/giu, "")
    .slice(0, 8)
    .toLowerCase();
  return `${slug || "qa-project"}-${suffix}`;
}

export function buildQaProjectWorkspaceRoot(input: {
  readonly baseDirectory: string | null | undefined;
  readonly projectTitle: string;
  readonly projectId: ProjectId;
}): string {
  const baseDirectory = ensureBrowseDirectoryPath(input.baseDirectory?.trim() || "~/");
  const qaProjectsDirectory = appendBrowsePathSegment(baseDirectory, QA_PROJECT_DIRECTORY);
  return appendBrowsePathSegment(
    qaProjectsDirectory,
    qaProjectDirectoryName(input.projectTitle, input.projectId),
  );
}
