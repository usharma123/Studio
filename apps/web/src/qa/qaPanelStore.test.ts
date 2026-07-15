import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { createMemoryStorage } from "~/lib/storage";

import { createQaPanelStore, selectQaThreadPanelState, selectedQaStageTab } from "./qaPanelStore";

const refA = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-a"));
const refB = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-b"));

describe("qaPanelStore", () => {
  const store = createQaPanelStore(createMemoryStorage());

  beforeEach(() => store.setState({ byThreadKey: {} }));

  it("automatically follows a newly active stage", () => {
    store.getState().syncActiveStage(refA, "intake");
    store.getState().viewStage(refA, "intake");
    store.getState().syncActiveStage(refA, "requirements");
    const panel = Object.values(store.getState().byThreadKey)[0]!;
    expect(panel.viewedStage).toBe("requirements");
    expect(selectedQaStageTab(panel)).toBe("table");
  });

  it("remembers a tab independently for each stage and thread", () => {
    store.getState().syncActiveStage(refA, "requirements");
    store.getState().selectTab(refA, "requirements", "graph");
    store.getState().viewStage(refA, "intake");
    store.getState().selectTab(refA, "intake", "progress");
    store.getState().viewStage(refA, "requirements");
    store.getState().syncActiveStage(refB, "requirements");

    const [panelA, panelB] = Object.values(store.getState().byThreadKey);
    expect(selectedQaStageTab(panelA!)).toBe("graph");
    expect(selectedQaStageTab(panelB!)).toBe("table");
  });

  it("ignores tabs that do not belong to the target stage", () => {
    store.getState().syncActiveStage(refA, "intake");
    store.getState().selectTab(refA, "intake", "graph");
    const panel = Object.values(store.getState().byThreadKey)[0]!;
    expect(selectedQaStageTab(panel)).toBe("documents");
  });

  it("returns a stable fallback while a new release has no persisted panel state", () => {
    const byThreadKey = {};

    expect(selectQaThreadPanelState(byThreadKey, refA, "intake")).toBe(
      selectQaThreadPanelState(byThreadKey, refA, "intake"),
    );
  });
});
