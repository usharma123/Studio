import { Platform } from "react-native";

export function hasNativeSelectableMarkdownText(): boolean {
  return Platform.OS === "ios";
}
