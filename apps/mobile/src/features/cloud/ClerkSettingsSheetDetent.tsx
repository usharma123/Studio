import { type PropsWithChildren, useCallback, useMemo, useState } from "react";

import { ClerkSettingsSheetDetentContext } from "./clerkSettingsSheetDetentContext";

interface ClerkSettingsSheetDetentProviderProps extends PropsWithChildren {
  initiallyExpanded: boolean;
}

export function ClerkSettingsSheetDetentProvider({
  children,
  initiallyExpanded,
}: ClerkSettingsSheetDetentProviderProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const collapse = useCallback(() => setIsExpanded(false), []);
  const expand = useCallback(() => setIsExpanded(true), []);
  const value = useMemo(() => ({ collapse, expand, isExpanded }), [collapse, expand, isExpanded]);

  return (
    <ClerkSettingsSheetDetentContext value={value}>{children}</ClerkSettingsSheetDetentContext>
  );
}
