import { SymbolView } from "expo-symbols";
import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";

import { markdownFileIconSource } from "@t3tools/mobile-markdown-text/file-icons";
import { resolveMarkdownFileIcon } from "@t3tools/mobile-markdown-text/links";

export function PierreEntryIcon(props: {
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly size?: number;
  readonly style?: StyleProp<ImageStyle>;
}) {
  const size = props.size ?? 16;
  if (props.kind === "directory") {
    return <SymbolView name="folder" size={size} tintColor="#a1a1aa" type="monochrome" />;
  }

  return (
    <Image
      source={markdownFileIconSource(resolveMarkdownFileIcon(props.path))}
      contentFit="contain"
      style={[{ width: size, height: size }, props.style]}
    />
  );
}
