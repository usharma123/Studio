import { describe, expect, it } from "vite-plus/test";

import { createMemoryStorage } from "./lib/storage";
import {
  createEnterpriseModeStore,
  DEFAULT_ENTERPRISE_MODE,
  ENTERPRISE_MODES,
  ENTERPRISE_MODE_STORAGE_KEY,
  getEnterpriseMode,
  getEnterpriseModeDefinition,
  isEnterpriseMode,
  isEnterpriseModeAvailable,
} from "./enterpriseModeStore";

describe("enterpriseModeStore", () => {
  it("exposes each enterprise mode as available", () => {
    expect(getEnterpriseModeDefinition("qa").label).toBe("QA");
    expect(ENTERPRISE_MODES.filter((mode) => mode.available).map((mode) => mode.id)).toEqual([
      "qa",
      "developer",
      "business_analyst",
    ]);
    expect(isEnterpriseModeAvailable("developer")).toBe(true);
    expect(isEnterpriseMode("business_analyst")).toBe(true);
    expect(isEnterpriseMode("unknown")).toBe(false);
  });

  it("persists the selected available mode", () => {
    const storage = createMemoryStorage();
    const store = createEnterpriseModeStore(storage);

    store.getState().selectMode("developer");

    expect(storage.getItem(ENTERPRISE_MODE_STORAGE_KEY)).toContain('"mode":"developer"');
    const restored = createEnterpriseModeStore(storage);
    expect(restored.getState().mode).toBe("developer");
    expect(getEnterpriseMode()).toBe(DEFAULT_ENTERPRISE_MODE);
  });

  it("does not activate stale persisted modes", () => {
    const storage = createMemoryStorage();

    storage.setItem(
      ENTERPRISE_MODE_STORAGE_KEY,
      JSON.stringify({ state: { mode: "retired_mode" }, version: 1 }),
    );
    const restored = createEnterpriseModeStore(storage);
    expect(restored.getState().mode).toBe(DEFAULT_ENTERPRISE_MODE);
  });
});
