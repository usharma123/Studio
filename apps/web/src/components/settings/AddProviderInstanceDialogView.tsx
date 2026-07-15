import { CheckIcon } from "lucide-react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { ProviderDriverKind } from "@t3tools/contracts";
import { cn } from "../../lib/utils";
import { normalizeProviderAccentColor } from "../../providerInstances";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { RadioGroup } from "../ui/radio-group";
import { DRIVER_OPTIONS } from "./providerDriverMeta";
import { ProviderSettingsForm } from "./ProviderSettingsForm";
import { AnimatedHeight } from "../AnimatedHeight";
export function AddProviderInstanceDialogView({
  controller,
}: {
  readonly controller: AddProviderInstanceDialogController;
}) {
  const {
    COMING_SOON_DRIVER_OPTIONS,
    PROVIDER_ACCENT_SWATCHES,
    accentColor,
    configDraft,
    driver,
    driverOption,
    driverSettingsFields,
    handleSave,
    instanceId,
    instanceIdError,
    label,
    onOpenChange,
    open,
    setAccentColor,
    setConfigDraft,
    setDriver,
    setInstanceIdOverride,
    setLabel,
    setWizardStep,
    showInstanceIdError,
    wizardStep,
    wizardStepSummaries,
    wizardSteps,
  } = controller;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl overflow-hidden">
        <div className="flex min-h-0 flex-col overflow-hidden border-foreground/10 bg-background shadow-2xl">
          <DialogHeader className="border-b border-border/70 bg-background">
            <DialogTitle>Add provider instance</DialogTitle>
            <DialogDescription>
              Configure an additional provider instance — for example, a second Codex install
              pointed at a different workspace.
            </DialogDescription>
            <div className="grid grid-cols-3 gap-2">
              {wizardSteps.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  className={cn(
                    "grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2 rounded-lg border px-3 py-2 text-left",
                    index === wizardStep
                      ? "border-primary bg-primary/10 ring-1 ring-primary/25"
                      : index < wizardStep
                        ? "border-border bg-background"
                        : "border-border bg-muted/40",
                  )}
                  onClick={() => setWizardStep(index)}
                >
                  <span
                    className={cn(
                      "row-span-2 mt-0.5 grid size-4 place-items-center rounded-full border",
                      index < wizardStep
                        ? "border-primary bg-primary text-primary-foreground"
                        : index === wizardStep
                          ? "border-primary bg-background"
                          : "border-muted-foreground/35 bg-background",
                    )}
                    aria-hidden
                  >
                    {index < wizardStep ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">
                    Step {index + 1}
                  </span>
                  <span className="truncate text-xs font-semibold text-foreground">
                    {step}
                    {index < wizardStep && wizardStepSummaries[index]
                      ? `: ${wizardStepSummaries[index]}`
                      : ""}
                  </span>
                </button>
              ))}
            </div>
          </DialogHeader>

          <div
            data-slot="dialog-panel"
            className="space-y-4 border-b border-border/70 bg-muted/20 px-6 py-5"
          >
            <AnimatedHeight>
              <div className={cn("grid gap-2", wizardStep !== 0 && "hidden")}>
                <span
                  id="add-instance-driver-label"
                  className="text-xs font-medium text-foreground"
                >
                  Driver
                </span>
                <RadioGroup
                  value={driver}
                  onValueChange={(value) => setDriver(ProviderDriverKind.make(value))}
                  aria-labelledby="add-instance-driver-label"
                  className="grid grid-cols-2 gap-2.5"
                >
                  {DRIVER_OPTIONS.map((option) => {
                    const IconComponent = option.icon;
                    const isSelected = option.value === driver;
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
                        <IconComponent className="size-5 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        {option.badgeLabel ? (
                          <Badge variant="warning" size="sm">
                            {option.badgeLabel}
                          </Badge>
                        ) : null}
                      </RadioPrimitive.Root>
                    );
                  })}
                  {COMING_SOON_DRIVER_OPTIONS.map((option) => {
                    const IconComponent = option.icon;
                    return (
                      <RadioPrimitive.Root
                        key={option.value}
                        value={option.value}
                        disabled
                        className={cn(
                          "relative flex cursor-not-allowed items-center gap-3 rounded-lg border border-border bg-background px-3 py-3 text-left opacity-55 outline-none",
                        )}
                      >
                        <IconComponent
                          className="size-5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        <Badge variant="warning" size="sm">
                          Coming Soon
                        </Badge>
                      </RadioPrimitive.Root>
                    );
                  })}
                </RadioGroup>
              </div>

              <label className={cn("grid gap-2", wizardStep !== 1 && "hidden")}>
                <span className="text-xs font-medium text-foreground">Label</span>
                <Input
                  className="bg-background"
                  placeholder="e.g. Work"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
                <span className="text-[11px] text-muted-foreground">
                  Shown in the provider list. Optional.
                </span>
              </label>

              <label className={cn("grid gap-2", wizardStep !== 1 && "hidden")}>
                <span className="text-xs font-medium text-foreground">Instance ID</span>
                <Input
                  className="bg-background"
                  placeholder={`${driver}_work`}
                  value={instanceId}
                  onChange={(event) => {
                    setInstanceIdOverride(event.target.value);
                  }}
                  aria-invalid={showInstanceIdError}
                />
                {showInstanceIdError ? (
                  <span className="text-[11px] text-destructive">{instanceIdError}</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    Routing key used by threads and sessions. Letters, digits, '-', or '_'.
                  </span>
                )}
              </label>

              <div className={cn("grid gap-2", wizardStep !== 1 && "hidden")}>
                <span className="text-xs font-medium text-foreground">Accent color</span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={normalizeProviderAccentColor(accentColor) ?? PROVIDER_ACCENT_SWATCHES[0]}
                    onChange={(event) => setAccentColor(event.target.value)}
                    aria-label="Provider instance accent color"
                    className="h-8 w-10 cursor-pointer rounded-xl border border-input bg-background p-0.5"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {PROVIDER_ACCENT_SWATCHES.map((swatch) => {
                      const selected = accentColor.toLowerCase() === swatch;
                      return (
                        <button
                          key={swatch}
                          type="button"
                          className={cn(
                            "size-6 cursor-pointer rounded-full border transition",
                            selected
                              ? "scale-110 border-foreground ring-2 ring-ring ring-offset-1 ring-offset-background"
                              : "border-black/10 hover:scale-105 dark:border-white/20",
                          )}
                          style={{
                            backgroundColor: swatch,
                          }}
                          onClick={() => setAccentColor(swatch)}
                          aria-label={`Use ${swatch} accent`}
                        />
                      );
                    })}
                  </div>
                  {accentColor ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => setAccentColor("")}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Optional marker shown in the picker.
                </span>
              </div>

              {driverSettingsFields.length > 0 ? (
                <div className={cn("grid gap-4", wizardStep !== 2 && "hidden")}>
                  <ProviderSettingsForm
                    definition={driverOption}
                    value={configDraft}
                    idPrefix={`add-provider-${driver}`}
                    variant="dialog"
                    onChange={setConfigDraft}
                  />
                </div>
              ) : wizardStep === 2 ? (
                <div className="grid gap-2">
                  <p className="text-sm text-muted-foreground">
                    This driver has no required configuration. You can add the instance now.
                  </p>
                </div>
              ) : null}
            </AnimatedHeight>
          </div>

          <DialogFooter className="border-t bg-background">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (wizardStep === 0) {
                  onOpenChange(false);
                  return;
                }
                setWizardStep((step) => Math.max(0, step - 1));
              }}
            >
              {wizardStep === 0 ? "Cancel" : "Back"}
            </Button>
            {wizardStep < wizardSteps.length - 1 ? (
              <Button size="sm" onClick={() => setWizardStep((step) => Math.min(2, step + 1))}>
                Next
              </Button>
            ) : (
              <Button size="sm" onClick={handleSave}>
                Add instance
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
import type { AddProviderInstanceDialogController } from "./AddProviderInstanceDialog";
