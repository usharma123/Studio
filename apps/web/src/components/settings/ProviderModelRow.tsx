import type { ProviderInstanceId, ServerProviderModel } from "@t3tools/contracts";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface ProviderModelRowProps {
  readonly instanceId: ProviderInstanceId;
  readonly model: ServerProviderModel;
  readonly state: {
    readonly hidden: boolean;
    readonly favorite: boolean;
    readonly canMoveUp: boolean;
    readonly canMoveDown: boolean;
  };
  readonly onToggleHidden: (slug: string) => void;
  readonly onToggleFavorite: (slug: string) => void;
  readonly onMove: (slug: string, direction: -1 | 1) => void;
  readonly onRemove: (slug: string) => void;
}

function modelCapabilityLabels(model: ServerProviderModel): string[] {
  const labels: string[] = [];
  const descriptors = model.capabilities?.optionDescriptors ?? [];
  if (descriptors.some((descriptor) => descriptor.id === "fastMode")) labels.push("Fast mode");
  if (descriptors.some((descriptor) => descriptor.id === "thinking")) labels.push("Thinking");
  if (
    descriptors.some(
      (descriptor) =>
        descriptor.type === "select" &&
        ["reasoningEffort", "effort", "reasoning", "variant"].includes(descriptor.id),
    )
  ) {
    labels.push("Reasoning");
  }
  return labels;
}

export function ProviderModelRow({
  instanceId,
  model,
  state,
  onToggleHidden,
  onToggleFavorite,
  onMove,
  onRemove,
}: ProviderModelRowProps) {
  const { hidden: isHidden, favorite: isFavorite, canMoveUp, canMoveDown } = state;
  const capabilityLabels = modelCapabilityLabels(model);
  const hasDetails = capabilityLabels.length > 0 || model.name !== model.slug;
  return (
    <div
      data-model-key={`${instanceId}:${model.slug}`}
      className={cn(
        "grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1",
        isHidden && "text-muted-foreground",
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            "min-w-0 truncate text-xs",
            isHidden ? "text-muted-foreground line-through" : "text-foreground/90",
          )}
        >
          {model.name}
        </span>
        {hasDetails ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="size-5 rounded-sm p-0 text-muted-foreground/60 hover:text-muted-foreground"
                  aria-label={`Details for ${model.name}`}
                />
              }
            >
              <InfoIcon className="size-3" />
            </TooltipTrigger>
            <TooltipPopup side="top" className="max-w-56">
              <div className="space-y-1">
                <code className="block text-[11px] text-foreground">{model.slug}</code>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {capabilityLabels.map((label) => (
                    <span key={label} className="text-[10px] text-muted-foreground">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </TooltipPopup>
          </Tooltip>
        ) : null}
        {isHidden ? <span className="text-[10px] text-muted-foreground">hidden</span> : null}
        {model.isCustom ? <span className="text-[10px] text-muted-foreground">custom</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                className={cn(
                  "size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground",
                  isFavorite && "text-yellow-500 hover:text-yellow-600",
                )}
                onClick={() => onToggleFavorite(model.slug)}
                aria-label={`${isFavorite ? "Remove" : "Add"} ${model.name} ${isFavorite ? "from" : "to"} favorites`}
              />
            }
          >
            <StarIcon className={cn("size-3", isFavorite && "fill-current")} />
          </TooltipTrigger>
          <TooltipPopup side="top">
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                disabled={!canMoveUp}
                onClick={() => onMove(model.slug, -1)}
                aria-label={`Move ${model.name} up`}
              />
            }
          >
            <ArrowUpIcon className="size-3" />
          </TooltipTrigger>
          <TooltipPopup side="top">Move up</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                disabled={!canMoveDown}
                onClick={() => onMove(model.slug, 1)}
                aria-label={`Move ${model.name} down`}
              />
            }
          >
            <ArrowDownIcon className="size-3" />
          </TooltipTrigger>
          <TooltipPopup side="top">Move down</TooltipPopup>
        </Tooltip>
        {!model.isCustom ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => onToggleHidden(model.slug)}
                  aria-label={`${isHidden ? "Show" : "Hide"} ${model.name}`}
                />
              }
            >
              {isHidden ? <EyeIcon className="size-3" /> : <EyeOffIcon className="size-3" />}
            </TooltipTrigger>
            <TooltipPopup side="top">
              {isHidden ? "Show in picker" : "Hide from picker"}
            </TooltipPopup>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${model.slug}`}
                  onClick={() => onRemove(model.slug)}
                />
              }
            >
              <XIcon className="size-3" />
            </TooltipTrigger>
            <TooltipPopup side="top">Remove custom model</TooltipPopup>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
