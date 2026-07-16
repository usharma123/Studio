import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildQaProjectWorkspaceRoot, qaProjectDirectoryName } from "./QaProjectWorkspace.ts";

const joinWith =
  (separator: "/" | "\\") =>
  (...segments: ReadonlyArray<string>) =>
    segments
      .map((segment, index) =>
        index === 0 ? segment.replace(/[\\/]+$/u, "") : segment.replace(/^[\\/]+|[\\/]+$/gu, ""),
      )
      .join(separator);

describe("QA project workspace", () => {
  it("derives a workspace under the server-configured QA directory", () => {
    expect(
      buildQaProjectWorkspaceRoot({
        baseDirectory: "/srv/workspaces",
        projectTitle: "Customer Portal",
        projectId: ProjectId.make("A1B2-C3D4-project"),
        joinPath: joinWith("/"),
      }),
    ).toBe("/srv/workspaces/.t3-qa-projects/customer-portal-a1b2c3d4");
  });

  it("uses the home directory default and the host path separator", () => {
    expect(
      buildQaProjectWorkspaceRoot({
        baseDirectory: "",
        projectTitle: "Payments",
        projectId: ProjectId.make("project-1234"),
        joinPath: joinWith("\\"),
      }),
    ).toBe("~\\.t3-qa-projects\\payments-project1");
  });

  it("falls back to a stable safe directory for titles without ASCII letters", () => {
    expect(qaProjectDirectoryName("支払い 🚀", ProjectId.make("ABC-123"))).toBe(
      "qa-project-abc123",
    );
  });
});
