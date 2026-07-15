import { cn } from "~/lib/utils";

import { QA_STAGE_ROUTES, type QaStageId, type QaStageTabId } from "./stageRouting";

interface QaStageTabsProps {
  readonly stage: QaStageId;
  readonly selectedTab: QaStageTabId;
  readonly onSelect: (tab: QaStageTabId) => void;
}

export function QaStageTabs(props: QaStageTabsProps) {
  const route = QA_STAGE_ROUTES[props.stage];
  if (route.tabs.length <= 1) return null;
  return (
    <div
      role="tablist"
      aria-label={`${route.label} views`}
      className="flex items-center gap-1 rounded-lg border bg-muted/20 p-1"
    >
      {route.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={props.selectedTab === tab.id}
          onClick={() => props.onSelect(tab.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium",
            props.selectedTab === tab.id
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
