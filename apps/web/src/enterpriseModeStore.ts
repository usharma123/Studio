import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "./lib/storage";

export const ENTERPRISE_MODES = [
  {
    id: "qa",
    label: "QA",
    description: "Plan, validate, and approve releases",
    available: true,
  },
  {
    id: "developer",
    label: "Developer",
    description: "Build, debug, and ship software",
    available: true,
  },
  {
    id: "business_analyst",
    label: "Business Analyst",
    description: "Discover and refine business requirements",
    available: true,
  },
] as const;

export type EnterpriseMode = (typeof ENTERPRISE_MODES)[number]["id"];

export const DEFAULT_ENTERPRISE_MODE: EnterpriseMode = "qa";
export const ENTERPRISE_MODE_STORAGE_KEY = "t3code:enterprise-mode:v1";

const ENTERPRISE_MODE_IDS = new Set<EnterpriseMode>(ENTERPRISE_MODES.map((mode) => mode.id));

export function isEnterpriseMode(value: unknown): value is EnterpriseMode {
  return typeof value === "string" && ENTERPRISE_MODE_IDS.has(value as EnterpriseMode);
}

export function getEnterpriseModeDefinition(mode: EnterpriseMode) {
  return ENTERPRISE_MODES.find((candidate) => candidate.id === mode) ?? ENTERPRISE_MODES[0];
}

export function isEnterpriseModeAvailable(mode: EnterpriseMode): boolean {
  return getEnterpriseModeDefinition(mode).available;
}

interface EnterpriseModeStoreState {
  mode: EnterpriseMode;
  selectMode: (mode: EnterpriseMode) => void;
}

export function createEnterpriseModeStore(storage?: StateStorage) {
  return create<EnterpriseModeStoreState>()(
    persist(
      (set) => ({
        mode: DEFAULT_ENTERPRISE_MODE,
        selectMode: (mode) => {
          if (isEnterpriseModeAvailable(mode)) {
            set({ mode });
          }
        },
      }),
      {
        name: ENTERPRISE_MODE_STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(
          () =>
            storage ??
            resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
        ),
        partialize: (state) => ({ mode: state.mode }),
        merge: (persisted, current) => {
          const persistedMode = (persisted as Partial<EnterpriseModeStoreState> | undefined)?.mode;
          return {
            ...current,
            mode:
              isEnterpriseMode(persistedMode) && isEnterpriseModeAvailable(persistedMode)
                ? persistedMode
                : DEFAULT_ENTERPRISE_MODE,
          };
        },
      },
    ),
  );
}

export const useEnterpriseModeStore = createEnterpriseModeStore();

export function getEnterpriseMode(): EnterpriseMode {
  return useEnterpriseModeStore.getState().mode;
}
