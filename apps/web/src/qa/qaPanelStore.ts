import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "~/lib/storage";

import {
  defaultTabForStage,
  isTabForStage,
  type QaStageId,
  type QaStageTabId,
} from "./stageRouting";
import { qaReleaseKey, type QaReleaseRef } from "./releaseRef";

export interface QaReleasePanelState {
  readonly lastActiveStage: QaStageId;
  readonly viewedStage: QaStageId;
  readonly selectedTabByStage: Partial<Record<QaStageId, QaStageTabId>>;
}

interface QaPanelStoreState {
  readonly byReleaseKey: Record<string, QaReleasePanelState>;
  readonly syncActiveStage: (ref: QaReleaseRef, stage: QaStageId) => void;
  readonly viewStage: (ref: QaReleaseRef, stage: QaStageId) => void;
  readonly selectTab: (ref: QaReleaseRef, stage: QaStageId, tab: QaStageTabId) => void;
  readonly removeRelease: (ref: QaReleaseRef) => void;
}

const STORAGE_KEY = "t3code:qa-panel:v2";
const initialReleaseStates = new Map<QaStageId, QaReleasePanelState>();

function initialReleaseState(stage: QaStageId): QaReleasePanelState {
  const existing = initialReleaseStates.get(stage);
  if (existing) return existing;

  const initial = {
    lastActiveStage: stage,
    viewedStage: stage,
    selectedTabByStage: { [stage]: defaultTabForStage(stage) },
  };
  initialReleaseStates.set(stage, initial);
  return initial;
}

export function createQaPanelStore(storage?: StateStorage) {
  return create<QaPanelStoreState>()(
    persist(
      (set) => ({
        byReleaseKey: {},
        syncActiveStage: (ref, stage) =>
          set((state) => {
            const key = qaReleaseKey(ref);
            const current = state.byReleaseKey[key];
            if (!current) {
              return {
                byReleaseKey: { ...state.byReleaseKey, [key]: initialReleaseState(stage) },
              };
            }
            if (current.lastActiveStage === stage) return state;
            return {
              byReleaseKey: {
                ...state.byReleaseKey,
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
            const key = qaReleaseKey(ref);
            const current = state.byReleaseKey[key] ?? initialReleaseState(stage);
            if (current.viewedStage === stage) return state;
            return {
              byReleaseKey: {
                ...state.byReleaseKey,
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
            const key = qaReleaseKey(ref);
            const current = state.byReleaseKey[key] ?? initialReleaseState(stage);
            if (current.selectedTabByStage[stage] === tab) return state;
            return {
              byReleaseKey: {
                ...state.byReleaseKey,
                [key]: {
                  ...current,
                  selectedTabByStage: { ...current.selectedTabByStage, [stage]: tab },
                },
              },
            };
          }),
        removeRelease: (ref) =>
          set((state) => {
            const key = qaReleaseKey(ref);
            if (!(key in state.byReleaseKey)) return state;
            const { [key]: _removed, ...rest } = state.byReleaseKey;
            return { byReleaseKey: rest };
          }),
      }),
      {
        name: STORAGE_KEY,
        version: 2,
        storage: createJSONStorage(
          () =>
            storage ??
            resolveStorage(typeof window === "undefined" ? undefined : window.localStorage),
        ),
        partialize: (state) => ({ byReleaseKey: state.byReleaseKey }),
      },
    ),
  );
}

export const useQaPanelStore = createQaPanelStore();

export function selectQaReleasePanelState(
  byReleaseKey: Record<string, QaReleasePanelState>,
  ref: QaReleaseRef,
  activeStage: QaStageId,
): QaReleasePanelState {
  return byReleaseKey[qaReleaseKey(ref)] ?? initialReleaseState(activeStage);
}

export function selectedQaStageTab(state: QaReleasePanelState): QaStageTabId {
  const selected = state.selectedTabByStage[state.viewedStage];
  return selected && isTabForStage(state.viewedStage, selected)
    ? selected
    : defaultTabForStage(state.viewedStage);
}
