import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "~/lib/storage";

import {
  defaultTabForStage,
  isTabForStage,
  type QaStageId,
  type QaStageTabId,
} from "./stageRouting";

export interface QaThreadPanelState {
  readonly lastActiveStage: QaStageId;
  readonly viewedStage: QaStageId;
  readonly selectedTabByStage: Partial<Record<QaStageId, QaStageTabId>>;
}

interface QaPanelStoreState {
  readonly byThreadKey: Record<string, QaThreadPanelState>;
  readonly syncActiveStage: (ref: ScopedThreadRef, stage: QaStageId) => void;
  readonly viewStage: (ref: ScopedThreadRef, stage: QaStageId) => void;
  readonly selectTab: (ref: ScopedThreadRef, stage: QaStageId, tab: QaStageTabId) => void;
  readonly removeThread: (ref: ScopedThreadRef) => void;
}

const STORAGE_KEY = "t3code:qa-panel:v1";
const initialThreadStates = new Map<QaStageId, QaThreadPanelState>();

function initialThreadState(stage: QaStageId): QaThreadPanelState {
  const existing = initialThreadStates.get(stage);
  if (existing) return existing;

  const initial = {
    lastActiveStage: stage,
    viewedStage: stage,
    selectedTabByStage: { [stage]: defaultTabForStage(stage) },
  };
  initialThreadStates.set(stage, initial);
  return initial;
}

export function createQaPanelStore(storage?: StateStorage) {
  return create<QaPanelStoreState>()(
    persist(
      (set) => ({
        byThreadKey: {},
        syncActiveStage: (ref, stage) =>
          set((state) => {
            const key = scopedThreadKey(ref);
            const current = state.byThreadKey[key];
            if (!current) {
              return { byThreadKey: { ...state.byThreadKey, [key]: initialThreadState(stage) } };
            }
            if (current.lastActiveStage === stage) return state;
            return {
              byThreadKey: {
                ...state.byThreadKey,
                [key]: {
                  ...current,
                  lastActiveStage: stage,
                  viewedStage: stage,
                  selectedTabByStage: {
                    ...current.selectedTabByStage,
                    [stage]: current.selectedTabByStage[stage] ?? defaultTabForStage(stage),
                  },
                },
              },
            };
          }),
        viewStage: (ref, stage) =>
          set((state) => {
            const key = scopedThreadKey(ref);
            const current = state.byThreadKey[key] ?? initialThreadState(stage);
            if (current.viewedStage === stage) return state;
            return {
              byThreadKey: {
                ...state.byThreadKey,
                [key]: {
                  ...current,
                  viewedStage: stage,
                  selectedTabByStage: {
                    ...current.selectedTabByStage,
                    [stage]: current.selectedTabByStage[stage] ?? defaultTabForStage(stage),
                  },
                },
              },
            };
          }),
        selectTab: (ref, stage, tab) =>
          set((state) => {
            if (!isTabForStage(stage, tab)) return state;
            const key = scopedThreadKey(ref);
            const current = state.byThreadKey[key] ?? initialThreadState(stage);
            if (current.selectedTabByStage[stage] === tab) return state;
            return {
              byThreadKey: {
                ...state.byThreadKey,
                [key]: {
                  ...current,
                  selectedTabByStage: { ...current.selectedTabByStage, [stage]: tab },
                },
              },
            };
          }),
        removeThread: (ref) =>
          set((state) => {
            const key = scopedThreadKey(ref);
            if (!(key in state.byThreadKey)) return state;
            const { [key]: _removed, ...rest } = state.byThreadKey;
            return { byThreadKey: rest };
          }),
      }),
      {
        name: STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(
          () =>
            storage ??
            resolveStorage(typeof window === "undefined" ? undefined : window.localStorage),
        ),
        partialize: (state) => ({ byThreadKey: state.byThreadKey }),
      },
    ),
  );
}

export const useQaPanelStore = createQaPanelStore();

export function selectQaThreadPanelState(
  byThreadKey: Record<string, QaThreadPanelState>,
  ref: ScopedThreadRef,
  activeStage: QaStageId,
): QaThreadPanelState {
  return byThreadKey[scopedThreadKey(ref)] ?? initialThreadState(activeStage);
}

export function selectedQaStageTab(state: QaThreadPanelState): QaStageTabId {
  const selected = state.selectedTabByStage[state.viewedStage];
  return selected && isTabForStage(state.viewedStage, selected)
    ? selected
    : defaultTabForStage(state.viewedStage);
}
