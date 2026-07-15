import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { readLocalApi } from "~/localApi";
import type { PublishRepositoryDialogController } from "./GitActionsControl";
export function PublishRepositorySuccessStep({
  controller,
}: {
  readonly controller: NonNullable<PublishRepositoryDialogController>;
}) {
  const { currentPublishProvider, publishProviderLabel, publishResult, publishWizardStep } =
    controller;
  return (
    <>
      <div className={cn("space-y-4", publishWizardStep !== 2 && "hidden")}>
        {publishResult ? (
          <>
            <div className="flex flex-col items-center gap-2 py-1 text-center">
              <span className="grid size-8 place-items-center rounded-full bg-success/15 text-success">
                <CheckIcon className="size-4" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold text-foreground">
                {publishResult.status === "pushed" ? "Repository published" : "Repository created"}
              </h3>
              <p className="max-w-xs text-pretty text-xs text-muted-foreground">
                {publishResult.status === "pushed"
                  ? `${publishResult.branch} is now live on ${publishProviderLabel}.`
                  : `Remote "${publishResult.remoteName}" is set up. Make a commit and push it to share your code.`}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/40 px-3 py-2">
              <currentPublishProvider.Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                {publishResult.repository.nameWithOwner}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const api = readLocalApi();
                if (!api) return;
                void api.shell.openExternal(publishResult.repository.url);
              }}
            >
              <ExternalLinkIcon className="size-3.5" aria-hidden />
              Open on {publishProviderLabel}
            </Button>
          </>
        ) : (
          <div className="rounded-md border border-input bg-background px-3 py-2 text-xs text-muted-foreground">
            Publish result unavailable.
          </div>
        )}
      </div>
    </>
  );
}
