import { EnvironmentId, QaReleaseId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildQaReleaseRouteParams,
  qaReleaseRouteTarget,
  resolveQaReleaseRouteRef,
} from "./qaReleaseRoutes";

describe("QA release routes", () => {
  it("builds a route from the canonical release identity", () => {
    expect(
      buildQaReleaseRouteParams({
        environmentId: EnvironmentId.make("env-1"),
        releaseId: QaReleaseId.make("release-1"),
      }),
    ).toEqual({ environmentId: "env-1", releaseId: "release-1" });
  });

  it("targets the dedicated release route from every release entry point", () => {
    expect(
      qaReleaseRouteTarget({
        environmentId: EnvironmentId.make("env-1"),
        releaseId: QaReleaseId.make("release-1"),
      }),
    ).toEqual({
      to: "/$environmentId/qa/releases/$releaseId",
      params: { environmentId: "env-1", releaseId: "release-1" },
    });
  });

  it("does not interpret a thread-only route as a QA release", () => {
    const threadRouteParams: Record<string, string> = {
      environmentId: "env-1",
      threadId: "thread-1",
    };
    expect(resolveQaReleaseRouteRef(threadRouteParams)).toBeNull();
  });

  it("resolves canonical release route params", () => {
    expect(resolveQaReleaseRouteRef({ environmentId: "env-1", releaseId: "release-1" })).toEqual({
      environmentId: "env-1",
      releaseId: "release-1",
    });
  });
});
