import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "~/lib/storage";

export type QaAssistantPresentation = "closed" | "open" | "minimized" | "detached";

interface QaAssistantStoreState {
  readonly byThreadKey: Record<string, QaAssistantPresentation>;
  readonly open: (threadRef: ScopedThreadRef) => void;
  readonly minimize: (threadRef: ScopedThreadRef) => void;
  readonly close: (threadRef: ScopedThreadRef) => void;
  readonly markDetached: (threadRef: ScopedThreadRef) => void;
}

export const QA_ASSISTANT_STORAGE_KEY = "t3code:qa-assistant-state:v1";

export function createQaAssistantStore(storage?: StateStorage) {
  return create<QaAssistantStoreState>()(
    persist(
      (set) => ({
        byThreadKey: {},
        open: (threadRef) =>
          set((state) => ({
            byThreadKey: { ...state.byThreadKey, [scopedThreadKey(threadRef)]: "open" },
          })),
        minimize: (threadRef) =>
          set((state) => ({
            byThreadKey: { ...state.byThreadKey, [scopedThreadKey(threadRef)]: "minimized" },
          })),
        close: (threadRef) =>
          set((state) => ({
            byThreadKey: { ...state.byThreadKey, [scopedThreadKey(threadRef)]: "closed" },
          })),
        markDetached: (threadRef) =>
          set((state) => ({
            byThreadKey: { ...state.byThreadKey, [scopedThreadKey(threadRef)]: "detached" },
          })),
      }),
      {
        name: QA_ASSISTANT_STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(
          () =>
            storage ??
            resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
        ),
        partialize: (state) => ({ byThreadKey: state.byThreadKey }),
      },
    ),
  );
}

export const useQaAssistantStore = createQaAssistantStore();

export function selectQaAssistantPresentation(
  byThreadKey: Record<string, QaAssistantPresentation>,
  threadRef: ScopedThreadRef | null | undefined,
): QaAssistantPresentation {
  if (!threadRef) return "closed";
  return byThreadKey[scopedThreadKey(threadRef)] ?? "closed";
}
