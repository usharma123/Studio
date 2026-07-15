import { createContext, use } from "react";

import type { ResolvedAppearance } from "../../../lib/appearancePreferences";

export interface AppearancePreferencesContextValue {
  readonly appearance: ResolvedAppearance;
  readonly isReady: boolean;
  readonly setBaseFontSize: (value: number) => void;
  readonly setTerminalFontSize: (value: number | null) => void;
  readonly setCodeFontSize: (value: number | null) => void;
  readonly setCodeWordBreak: (value: boolean) => void;
}

export const AppearancePreferencesContext = createContext<AppearancePreferencesContextValue | null>(
  null,
);

export function useAppearancePreferences(): AppearancePreferencesContextValue {
  const context = use(AppearancePreferencesContext);
  if (!context) {
    throw new Error("useAppearancePreferences must be used within AppearancePreferencesProvider");
  }
  return context;
}
