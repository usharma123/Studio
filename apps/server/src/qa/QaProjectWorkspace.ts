import type { ProjectId } from "@t3tools/contracts";

const QA_PROJECTS_DIRECTORY = ".t3-qa-projects";

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
  readonly joinPath: (...segments: ReadonlyArray<string>) => string;
}): string {
  const baseDirectory = input.baseDirectory?.trim() || "~/";
  return input.joinPath(
    baseDirectory,
    QA_PROJECTS_DIRECTORY,
    qaProjectDirectoryName(input.projectTitle, input.projectId),
  );
}
