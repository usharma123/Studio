import {
  NativeHeaderToolbarButton,
  NativeHeaderToolbarLabel,
  NativeHeaderToolbarMenu,
  NativeHeaderToolbarMenuAction,
  NativeHeaderToolbarRoot,
  NativeHeaderToolbarSearchBarSlot,
  NativeHeaderToolbarSpacer,
} from "./StackHeader";

export const NativeHeaderToolbar = Object.assign(NativeHeaderToolbarRoot, {
  Button: NativeHeaderToolbarButton,
  Label: NativeHeaderToolbarLabel,
  Menu: Object.assign(NativeHeaderToolbarMenu, {
    Action: NativeHeaderToolbarMenuAction,
  }),
  MenuAction: NativeHeaderToolbarMenuAction,
  SearchBarSlot: NativeHeaderToolbarSearchBarSlot,
  Spacer: NativeHeaderToolbarSpacer,
});
