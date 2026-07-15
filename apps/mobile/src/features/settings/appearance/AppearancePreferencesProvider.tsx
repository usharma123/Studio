import { useCallback, useEffect, useMemo, type ReactNode } from "react";

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";

import { Uniwind } from "uniwind";

import {
  resolveAppearance,
  resolveAppearancePreferences,
  resolveTextScaleVariables,
  type AppearancePreferences,
} from "../../../lib/appearancePreferences";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../state/preferences";
import { cacheTerminalFontSize } from "../../terminal/terminalUiState";

import {
  AppearancePreferencesContext,
  type AppearancePreferencesContextValue,
} from "./appearancePreferencesContext";

/**
 * Injects the scaled `--text-*` variables into Uniwind so every
 * className-based text size (`text-sm`, `text-base`, ...) re-resolves live.
 * Updates the current theme last so the active stylesheet settles correctly.
 */
function applyTextScaleVariables(baseFontSize: number) {
  const variables = resolveTextScaleVariables(baseFontSize);
  const currentTheme = Uniwind.currentTheme;

  for (const theme of ["light", "dark"] as const) {
    if (theme !== currentTheme) {
      Uniwind.updateCSSVariables(theme, variables);
    }
  }
  Uniwind.updateCSSVariables(currentTheme, variables);
}

export function AppearancePreferencesProvider(props: { readonly children: ReactNode }) {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useMemo(
    () =>
      resolveAppearancePreferences(
        AsyncResult.isSuccess(preferencesResult) ? preferencesResult.value : null,
      ),
    [preferencesResult],
  );
  const isReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;

  useEffect(() => {
    applyTextScaleVariables(preferences.baseFontSize);
    cacheTerminalFontSize(resolveAppearance(preferences).terminalFontSize);
  }, [preferences]);

  const updatePreferences = useCallback(
    (patch: Partial<AppearancePreferences>) => {
      savePreferences(patch);
    },
    [savePreferences],
  );

  const setBaseFontSize = useCallback(
    (value: number) => {
      updatePreferences({ baseFontSize: value });
    },
    [updatePreferences],
  );

  const setTerminalFontSize = useCallback(
    (value: number | null) => {
      updatePreferences({ terminalFontSize: value });
    },
    [updatePreferences],
  );

  const setCodeFontSize = useCallback(
    (value: number | null) => {
      updatePreferences({ codeFontSize: value });
    },
    [updatePreferences],
  );

  const setCodeWordBreak = useCallback(
    (value: boolean) => {
      updatePreferences({ codeWordBreak: value });
    },
    [updatePreferences],
  );

  const value = useMemo(
    (): AppearancePreferencesContextValue => ({
      appearance: resolveAppearance(preferences),
      isReady,
      setBaseFontSize,
      setTerminalFontSize,
      setCodeFontSize,
      setCodeWordBreak,
    }),
    [preferences, isReady, setBaseFontSize, setTerminalFontSize, setCodeFontSize, setCodeWordBreak],
  );

  return (
    <AppearancePreferencesContext.Provider value={value}>
      {props.children}
    </AppearancePreferencesContext.Provider>
  );
}
