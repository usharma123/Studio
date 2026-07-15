import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildQaProjectWorkspaceRoot, qaProjectDirectoryName } from "../qa/projectCreation";

describe("QA project creation", () => {
  it("derives an internal workspace without asking the QA user for a folder", () => {
    expect(
      buildQaProjectWorkspaceRoot({
        baseDirectory: "~/",
        projectTitle: "Customer Portal",
        projectId: ProjectId.make("12345678-abcd-4000-8000-123456789abc"),
      }),
    ).toBe("~/.t3-qa-projects/customer-portal-12345678/");
  });

  it("preserves the environment path separator", () => {
    expect(
      buildQaProjectWorkspaceRoot({
        baseDirectory: "C:\\QA\\",
        projectTitle: "Release readiness",
        projectId: ProjectId.make("abcdef01-abcd-4000-8000-123456789abc"),
      }),
    ).toBe("C:\\QA\\.t3-qa-projects\\release-readiness-abcdef01\\");
  });

  it("uses a stable fallback for project names without ASCII slug characters", () => {
    expect(
      qaProjectDirectoryName("品質保証", ProjectId.make("fedcba98-abcd-4000-8000-123456789abc")),
    ).toBe("qa-project-fedcba98");
  });
});
