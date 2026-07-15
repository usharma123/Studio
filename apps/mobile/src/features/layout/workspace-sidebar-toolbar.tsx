import { NativeHeaderToolbar } from "../../native/nativeHeaderToolbar";
import type { ReactNode } from "react";

import { useAdaptiveWorkspaceLayout } from "./adaptiveWorkspaceContext";

export function WorkspaceSidebarToolbar(
  props: {
    readonly children?: ReactNode;
    readonly afterSidebarButton?: ReactNode;
  } = {},
) {
  const { layout, panes, togglePrimarySidebar } = useAdaptiveWorkspaceLayout();

  if (!layout.usesSplitView) {
    return null;
  }

  return (
    <NativeHeaderToolbar placement="left">
      {props.children}
      <NativeHeaderToolbar.Button
        accessibilityLabel={
          panes.primarySidebarVisible ? "Maximize content" : "Show thread sidebar"
        }
        icon={panes.primarySidebarVisible ? "arrow.up.left.and.arrow.down.right" : "sidebar.left"}
        onPress={togglePrimarySidebar}
      />
      {props.afterSidebarButton}
    </NativeHeaderToolbar>
  );
}
