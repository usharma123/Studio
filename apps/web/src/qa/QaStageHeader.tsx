import { Check, ChevronRight, CircleDot, LockKeyhole, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import { QA_STAGE_ROUTES, type QaResolvedStage, type QaStageId } from "./stageRouting";

interface QaStageHeaderProps {
  readonly projectTitle: string;
  readonly releaseTitle: string;
  readonly releaseNumber: number;
  readonly activeStage: QaStageId;
  readonly viewedStage: QaStageId;
  readonly stages: readonly QaResolvedStage[];
  readonly onViewStage: (stage: QaStageId) => void;
  readonly action?: ReactNode;
}

function StageStatusIcon({ stage }: { stage: QaResolvedStage }) {
  if (stage.status === "complete") return <Check className="size-3" />;
  if (stage.status === "locked") return <LockKeyhole className="size-3" />;
  return <CircleDot className="size-3" />;
}

export function QaStageHeader(props: QaStageHeaderProps) {
  const route = QA_STAGE_ROUTES[props.viewedStage];
  const viewingHistory = props.viewedStage !== props.activeStage;
  return (
    <header className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{props.releaseTitle}</h1>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              Release {props.releaseNumber}
            </span>
            {viewingHistory ? (
              <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                Completed · read only
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{props.projectTitle}</p>
        </div>
      </div>
      <nav
        aria-label="QA release stages"
        className="flex items-center gap-1 border-y bg-muted/20 px-3 py-2"
      >
        {props.stages.map((stage, index) => {
          const selected = stage.id === props.viewedStage;
          return (
            <div key={stage.id} className="flex min-w-0 items-center">
              {index > 0 ? (
                <ChevronRight className="mx-0.5 size-3 shrink-0 text-muted-foreground/50" />
              ) : null}
              <button
                type="button"
                onClick={() => props.onViewStage(stage.id)}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium",
                  selected
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <StageStatusIcon stage={stage} />
                <span className="truncate">{QA_STAGE_ROUTES[stage.id].shortLabel}</span>
              </button>
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">{route.label}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{route.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {props.action}
            {!viewingHistory ? (
              <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                Active stage
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
