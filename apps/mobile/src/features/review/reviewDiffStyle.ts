import { Platform } from "react-native";

import { MOBILE_CODE_SURFACE } from "../../lib/typography";

import type { ReviewRenderableLineRow } from "./reviewModel";

export const REVIEW_MONO_FONT_FAMILY = Platform.select({
  ios: "ui-monospace",
  android: "monospace",
  default: "monospace",
});

export const REVIEW_DIFF_LINE_HEIGHT = MOBILE_CODE_SURFACE.rowHeight;

export function renderVisibleWhitespace(value: string): string {
  const expandedTabs = value.replace(/\t/g, "    ");
  return expandedTabs.replace(/^( +)/, (leading) => leading.replaceAll(" ", "\u00A0"));
}

export function changeTone(change: ReviewRenderableLineRow["change"]): string {
  if (change === "add") return "bg-emerald-500/10";
  if (change === "delete") return "bg-rose-500/10";
  return "bg-card";
}

export function changeBarTone(change: ReviewRenderableLineRow["change"]): string {
  if (change === "add") return "bg-emerald-400";
  if (change === "delete") return "bg-rose-400";
  return "bg-border/50";
}
