import type { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";

export function menuItemIconName(
  icon: "commit" | "push" | "pr",
): ComponentProps<typeof SymbolView>["name"] {
  if (icon === "commit") return "checkmark.circle";
  if (icon === "push") return "arrow.up.circle";
  return "arrow.up.right.circle";
}

export function statusSummary(
  gitStatus: {
    readonly isRepo?: boolean;
    readonly hasWorkingTreeChanges?: boolean;
    readonly workingTree?: { readonly files: readonly { readonly path: string }[] };
    readonly aheadCount?: number;
    readonly behindCount?: number;
    readonly pr?: { readonly state?: string; readonly number?: number } | null;
  } | null,
): string {
  if (!gitStatus) return "Loading branch status\u2026";
  if (!gitStatus.isRepo) return "Not a git repository";

  const parts: string[] = [];
  if (gitStatus.hasWorkingTreeChanges) {
    const fileCount = gitStatus.workingTree?.files.length ?? 0;
    parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"} changed`);
  } else {
    parts.push("Clean");
  }
  if ((gitStatus.aheadCount ?? 0) > 0) parts.push(`${gitStatus.aheadCount} ahead`);
  if ((gitStatus.behindCount ?? 0) > 0) parts.push(`${gitStatus.behindCount} behind`);
  if (gitStatus.pr?.state === "open") parts.push(`PR #${gitStatus.pr.number} open`);
  return parts.join(" \u00b7 ");
}
