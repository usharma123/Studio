import { EnvironmentId, QaReleaseId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { createMemoryStorage } from "~/lib/storage";

import { createQaPanelStore, selectQaReleasePanelState, selectedQaStageTab } from "./qaPanelStore";

const refA = {
  environmentId: "env-1" as EnvironmentId,
  releaseId: QaReleaseId.make("release-a"),
};
const refB = {
  environmentId: "env-1" as EnvironmentId,
  releaseId: QaReleaseId.make("release-b"),
};

describe("qaPanelStore", () => {
  const store = createQaPanelStore(createMemoryStorage());

  beforeEach(() => store.setState({ byReleaseKey: {} }));

  it("automatically follows a newly active stage", () => {
    store.getState().syncActiveStage(refA, "intake");
    store.getState().viewStage(refA, "intake");
    store.getState().syncActiveStage(refA, "requirements");
    const panel = Object.values(store.getState().byReleaseKey)[0]!;
    expect(panel.viewedStage).toBe("requirements");
    expect(selectedQaStageTab(panel)).toBe("table");
  });

  it("remembers a tab independently for each stage and release", () => {
    store.getState().syncActiveStage(refA, "requirements");
    store.getState().selectTab(refA, "requirements", "graph");
    store.getState().viewStage(refA, "intake");
    store.getState().selectTab(refA, "intake", "progress");
    store.getState().viewStage(refA, "requirements");
    store.getState().syncActiveStage(refB, "requirements");

    const [panelA, panelB] = Object.values(store.getState().byReleaseKey);
    expect(selectedQaStageTab(panelA!)).toBe("graph");
    expect(selectedQaStageTab(panelB!)).toBe("table");
  });

  it("ignores tabs that do not belong to the target stage", () => {
    store.getState().syncActiveStage(refA, "intake");
    store.getState().selectTab(refA, "intake", "graph");
    const panel = Object.values(store.getState().byReleaseKey)[0]!;
    expect(selectedQaStageTab(panel)).toBe("documents");
  });

  it("returns a stable fallback while a new release has no persisted panel state", () => {
    const byReleaseKey = {};

    expect(selectQaReleasePanelState(byReleaseKey, refA, "intake")).toBe(
      selectQaReleasePanelState(byReleaseKey, refA, "intake"),
    );
  });
});
