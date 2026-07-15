import { CheckIcon } from "lucide-react";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { AnimatedHeight } from "./AnimatedHeight";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import type { PublishRepositoryDialogController } from "./GitActionsControl";
import { PublishRepositorySuccessStep } from "./PublishRepositorySuccessStep";
import { PublishRepositoryDetailsStep } from "./PublishRepositoryDetailsStep";
import { PublishRepositoryProviderStep } from "./PublishRepositoryProviderStep";
export function PublishRepositoryDialogView({
  controller,
}: {
  readonly controller: NonNullable<PublishRepositoryDialogController>;
}) {
  const {
    canSubmitPublishRepository,
    handleOpenChange,
    hasReadyPublishProvider,
    props,
    publishRepositoryAction,
    publishWizardStep,
    publishWizardStepSummaries,
    publishWizardSteps,
    selectedPublishProviderReadiness,
    setPublishWizardStep,
    submitPublishRepository,
  } = controller;
  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogPopup className="max-w-xl overflow-hidden">
        <div className="flex min-h-0 flex-col overflow-hidden border-foreground/10 bg-background shadow-2xl">
          <DialogHeader className="border-b border-border/70 bg-background">
            <DialogTitle>Publish repository</DialogTitle>
            <DialogDescription>
              Pick where to host it, then point us at a repo to push to.
            </DialogDescription>
            <div className="grid grid-cols-3 gap-2">
              {publishWizardSteps.map((label, index) => {
                const isComplete = index < publishWizardStep;
                const isClickable =
                  publishWizardStep !== 2 &&
                  index < publishWizardSteps.length - 1 &&
                  index <= publishWizardStep;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={isClickable ? () => setPublishWizardStep(index) : undefined}
                    disabled={!isClickable}
                    className={cn(
                      "grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2 rounded-lg border px-3 py-2 text-left",
                      index === publishWizardStep
                        ? "border-primary bg-primary/10 ring-1 ring-primary/25"
                        : isComplete
                          ? "border-border bg-background"
                          : "border-border bg-muted/40",
                      !isClickable && "cursor-default",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "row-span-2 mt-0.5 grid size-4 place-items-center rounded-full border",
                        isComplete
                          ? "border-primary bg-primary text-primary-foreground"
                          : index === publishWizardStep
                            ? "border-primary bg-background"
                            : "border-muted-foreground/35 bg-background",
                      )}
                    >
                      {isComplete ? <CheckIcon className="size-3" /> : null}
                    </span>
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">
                      Step {index + 1}
                    </span>
                    <span className="truncate text-xs font-semibold text-foreground">
                      {label}
                      {isComplete && publishWizardStepSummaries[index]
                        ? `: ${publishWizardStepSummaries[index]}`
                        : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </DialogHeader>

          <DialogPanel className="space-y-5 border-b border-border/70 bg-muted/20 px-6 py-5">
            <AnimatedHeight>
              <PublishRepositoryProviderStep controller={controller} />
              <PublishRepositoryDetailsStep controller={controller} />
              <PublishRepositorySuccessStep controller={controller} />
            </AnimatedHeight>
          </DialogPanel>

          <DialogFooter>
            {publishWizardStep === 2 ? (
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={publishRepositoryAction.isPending}
                  onClick={() => {
                    if (publishWizardStep === 0) {
                      handleOpenChange(false);
                      return;
                    }
                    setPublishWizardStep((step) => Math.max(0, step - 1));
                  }}
                >
                  {publishWizardStep === 0 ? "Cancel" : "Back"}
                </Button>
                {publishWizardStep < 1 ? (
                  <Button
                    size="sm"
                    disabled={!hasReadyPublishProvider || !selectedPublishProviderReadiness.ready}
                    onClick={() => setPublishWizardStep((step) => Math.min(1, step + 1))}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={!canSubmitPublishRepository}
                    onClick={submitPublishRepository}
                  >
                    {publishRepositoryAction.isPending ? (
                      <>
                        <Spinner className="size-3.5" aria-hidden />
                        Publishing...
                      </>
                    ) : (
                      "Publish"
                    )}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
