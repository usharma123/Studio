import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup } from "~/components/ui/radio-group";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { PublishProviderKind, PublishRepositoryDialogController } from "./GitActionsControl";
export function PublishRepositoryProviderStep({
  controller,
}: {
  readonly controller: NonNullable<PublishRepositoryDialogController>;
}) {
  const {
    openSourceControlSettings,
    publishProvider,
    publishProviderReadiness,
    publishWizardStep,
    setPublishRepositoryOverride,
    setSelectedPublishProvider,
    sortedPublishProviderOptions,
  } = controller;
  return (
    <>
      <div className={cn("space-y-2", publishWizardStep !== 0 && "hidden")}>
        <span id="publish-provider-cards-label" className="text-xs font-medium text-foreground">
          Provider
        </span>
        <RadioGroup
          value={publishProvider}
          onValueChange={(value) => {
            setSelectedPublishProvider(value as PublishProviderKind);
            setPublishRepositoryOverride(null);
          }}
          aria-labelledby="publish-provider-cards-label"
          className="grid grid-cols-2 gap-2.5"
        >
          {sortedPublishProviderOptions.map((option) => {
            const readiness = publishProviderReadiness[option.value];
            const isSelected = publishProvider === option.value && readiness.ready;
            if (!readiness.ready) {
              return (
                <div
                  key={option.value}
                  className="relative flex cursor-not-allowed items-center gap-3 rounded-lg border border-border bg-background px-3 py-3 text-left opacity-55"
                >
                  <option.Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="outline"
                          size="xs"
                          className="h-5 rounded-[.25rem] px-1.5 text-[10px] text-warning-foreground"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openSourceControlSettings();
                          }}
                        >
                          Setup Required
                        </Button>
                      }
                    />
                    <TooltipPopup side="top" align="end" className="max-w-72">
                      {readiness.hint ??
                        "Open Settings -> Source Control to configure this provider."}
                    </TooltipPopup>
                  </Tooltip>
                </div>
              );
            }
            return (
              <RadioPrimitive.Root
                key={option.value}
                value={option.value}
                className={cn(
                  "relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-left outline-none transition-[background-color,border-color,box-shadow]",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  isSelected
                    ? "border-primary bg-background shadow-sm ring-2 ring-primary/35"
                    : "border-border bg-background hover:border-foreground/20 hover:bg-muted/50",
                )}
              >
                <option.Icon className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {option.label}
                </span>
              </RadioPrimitive.Root>
            );
          })}
        </RadioGroup>
      </div>
    </>
  );
}
