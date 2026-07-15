import { SourceControlCloneProtocol, SourceControlRepositoryVisibility } from "@t3tools/contracts";
import { ChevronDownIcon, LockIcon, GlobeIcon } from "lucide-react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup } from "~/components/ui/radio-group";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { Input } from "~/components/ui/input";
import type { PublishRepositoryDialogController } from "./GitActionsControl";
export function PublishRepositoryDetailsStep({
  controller,
}: {
  readonly controller: NonNullable<PublishRepositoryDialogController>;
}) {
  const {
    currentPublishProvider,
    publishAdvancedOpen,
    publishError,
    publishHost,
    publishPathPlaceholder,
    publishProtocol,
    publishProviderLabel,
    publishRemoteName,
    publishRepository,
    publishRepositoryAction,
    publishVisibility,
    publishWizardStep,
    setPublishAdvancedOpen,
    setPublishProtocol,
    setPublishRemoteName,
    setPublishRepositoryOverride,
    setPublishVisibility,
    submitPublishRepository,
  } = controller;
  return (
    <>
      <div className={cn("space-y-5", publishWizardStep !== 1 && "hidden")}>
        <div className="space-y-2">
          <label htmlFor="publish-repository-path" className="text-xs font-medium text-foreground">
            Repository
          </label>
          <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-ring">
            <span className="flex shrink-0 items-center gap-1.5 border-r border-input bg-muted/50 px-2.5 font-mono text-xs text-muted-foreground">
              <currentPublishProvider.Icon className="size-3.5" />
              {publishHost}/
            </span>
            <input
              id="publish-repository-path"
              name="publish-repository-path"
              value={publishRepository}
              onChange={(event) => {
                setPublishRepositoryOverride(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitPublishRepository();
                }
              }}
              placeholder={publishPathPlaceholder}
              disabled={publishRepositoryAction.isPending}
              className="w-full bg-transparent px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <span id="publish-visibility-cards-label" className="text-xs font-medium text-foreground">
            Visibility
          </span>
          <RadioGroup
            value={publishVisibility}
            onValueChange={(value) =>
              setPublishVisibility(value as SourceControlRepositoryVisibility)
            }
            aria-labelledby="publish-visibility-cards-label"
            disabled={publishRepositoryAction.isPending}
            className="grid grid-cols-2 gap-2.5"
          >
            {[
              {
                value: "private" as const,
                label: "Private",
                description: "Only invited people",
                Icon: LockIcon,
              },
              {
                value: "public" as const,
                label: "Public",
                description: "Anyone on the web",
                Icon: GlobeIcon,
              },
            ].map((option) => {
              const isSelected = publishVisibility === option.value;
              return (
                <RadioPrimitive.Root
                  key={option.value}
                  value={option.value}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-[background-color,border-color,box-shadow]",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    isSelected
                      ? "border-primary bg-background shadow-sm ring-2 ring-primary/35"
                      : "border-border bg-background hover:border-foreground/20 hover:bg-muted/50",
                  )}
                >
                  <option.Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </RadioPrimitive.Root>
              );
            })}
          </RadioGroup>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setPublishAdvancedOpen((prev) => !prev)}
            aria-expanded={publishAdvancedOpen}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform",
                publishAdvancedOpen ? "" : "-rotate-90",
              )}
            />
            Advanced
          </button>
          {publishAdvancedOpen ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5" htmlFor="publish-remote-name">
                <span className="text-xs font-medium text-foreground">Remote</span>
                <Input
                  id="publish-remote-name"
                  value={publishRemoteName}
                  onChange={(event) => setPublishRemoteName(event.target.value)}
                  placeholder="origin"
                  disabled={publishRepositoryAction.isPending}
                />
              </label>
              <div className="space-y-1.5">
                <span id="publish-protocol-label" className="text-xs font-medium text-foreground">
                  Protocol
                </span>
                <RadioGroup
                  value={publishProtocol}
                  onValueChange={(value) => setPublishProtocol(value as SourceControlCloneProtocol)}
                  aria-labelledby="publish-protocol-label"
                  disabled={publishRepositoryAction.isPending}
                  className="grid grid-cols-2 gap-2"
                >
                  {(["ssh", "https"] as const).map((value) => {
                    const isSelected = publishProtocol === value;
                    return (
                      <RadioPrimitive.Root
                        key={value}
                        value={value}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-center text-sm font-medium outline-none transition",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                          isSelected
                            ? "border-primary bg-background ring-2 ring-primary/35 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                        )}
                      >
                        {value === "ssh" ? "SSH" : "HTTPS"}
                      </RadioPrimitive.Root>
                    );
                  })}
                </RadioGroup>
              </div>
            </div>
          ) : null}
        </div>

        {publishRepositoryAction.isPending ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            <Spinner className="size-3.5" aria-hidden />
            Publishing repository to {publishProviderLabel}...
          </div>
        ) : null}
        {publishError && !publishRepositoryAction.isPending ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <p className="font-medium">Publish failed</p>
            <p className="mt-0.5 text-destructive/90">{publishError}</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
