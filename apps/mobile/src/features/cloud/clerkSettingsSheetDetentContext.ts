import { createContext, useContext } from "react";

export interface ClerkSettingsSheetDetentValue {
  collapse: () => void;
  expand: () => void;
  isExpanded: boolean;
}

export const ClerkSettingsSheetDetentContext = createContext<ClerkSettingsSheetDetentValue | null>(
  null,
);

export function useClerkSettingsSheetDetent(): ClerkSettingsSheetDetentValue {
  const value = useContext(ClerkSettingsSheetDetentContext);
  if (!value) {
    throw new Error(
      "useClerkSettingsSheetDetent must be used inside ClerkSettingsSheetDetentProvider",
    );
  }
  return value;
}
