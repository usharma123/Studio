import { ExternalLink, Maximize2, MessageCircle, Minus, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

import type { QaAssistantPresentation } from "./qaAssistantStore";

export function QaAssistantHeader(props: {
  readonly presentation: QaAssistantPresentation;
  readonly releaseTitle: string;
  readonly projectTitle: string;
  readonly detached?: boolean;
  readonly canDetach?: boolean;
  readonly onOpen: () => void;
  readonly onMinimize: () => void;
  readonly onClose: () => void;
  readonly onDetach?: () => void;
}) {
  const minimized = props.presentation === "minimized";
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <MessageCircle className="size-3.5" />
      </div>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={minimized ? props.onOpen : undefined}
      >
        <div className="truncate text-sm font-medium">Release assistant</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {props.projectTitle} · {props.releaseTitle}
        </div>
      </button>
      {!props.detached ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Detach release assistant"
                disabled={!props.canDetach}
                onClick={props.onDetach}
              >
                <ExternalLink className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup>
            {props.canDetach
              ? "Open the release assistant in its own window."
              : "Detaching is available in the desktop app."}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={minimized ? "Expand release assistant" : "Minimize release assistant"}
        onClick={minimized ? props.onOpen : props.onMinimize}
      >
        {minimized ? <Maximize2 className="size-3.5" /> : <Minus className="size-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Close release assistant"
        onClick={props.onClose}
      >
        <X className="size-3.5" />
      </Button>
    </header>
  );
}
