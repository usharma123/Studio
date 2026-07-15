import type { SelectableMarkdownTextProps } from "@t3tools/mobile-markdown-text/renderer";

type MobileSelectableMarkdownTextProps = Omit<SelectableMarkdownTextProps, "highlightCode">;

export type {
  NativeMarkdownTextStyle,
  SelectableMarkdownSkill,
} from "@t3tools/mobile-markdown-text/types";

export function SelectableMarkdownText(_props: MobileSelectableMarkdownTextProps) {
  return null;
}
