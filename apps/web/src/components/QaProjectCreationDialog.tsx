import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { QaReleaseId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useEnvironments, usePrimaryEnvironment } from "../state/environments";
import { useAtomCommand } from "../state/use-atom-command";
import { qaEnvironment, refreshQaAssignedReleases } from "../qa/client";
import { qaReleaseRouteTarget } from "../qaReleaseRoutes";
import { newProjectId, randomUUID } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toastManager } from "./ui/toast";
import { cn } from "~/lib/utils";

function failureMessage(
  result: Parameters<typeof squashAtomCommandFailure>[0],
  fallback: string,
): string {
  const failure = squashAtomCommandFailure(result);
  return failure instanceof Error ? failure.message : fallback;
}

export function QaProjectCreationDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const environment = primaryEnvironment ?? environments[0] ?? null;
  const createProject = useAtomCommand(qaEnvironment.createProject, { reportFailure: false });
  const [step, setStep] = useState<"project" | "release">("project");
  const [projectTitle, setProjectTitle] = useState("");
  const [releaseTitle, setReleaseTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setStep("project");
    setProjectTitle("");
    setReleaseTitle("");
    setIsCreating(false);
    setError(null);
  };

  const trimmedProjectTitle = projectTitle.trim();
  const trimmedReleaseTitle = releaseTitle.trim();
  const canContinue = trimmedProjectTitle.length > 0;
  const canCreate = trimmedReleaseTitle.length > 0 && environment !== null && !isCreating;

  const close = () => {
    if (isCreating) return;
    resetForm();
    props.onOpenChange(false);
  };

  const createQaProject = async () => {
    if (!canCreate || !environment) return;
    setIsCreating(true);
    setError(null);

    const projectId = newProjectId();
    const releaseId = QaReleaseId.make(randomUUID());
    const environmentId = environment.environmentId;

    const projectResult = await createProject({
      environmentId,
      input: {
        projectId,
        releaseId,
        projectTitle: trimmedProjectTitle,
        releaseTitle: trimmedReleaseTitle,
      },
    });
    if (projectResult._tag === "Failure") {
      setError(failureMessage(projectResult, "The QA project and release could not be created."));
      setIsCreating(false);
      return;
    }

    const createdReleaseId = projectResult.value.releaseId;
    refreshQaAssignedReleases(environmentId);
    resetForm();
    props.onOpenChange(false);
    await navigate(
      qaReleaseRouteTarget({
        environmentId,
        releaseId: createdReleaseId,
      }),
    );
    toastManager.add({
      type: "success",
      title: `${trimmedProjectTitle} · ${trimmedReleaseTitle} created`,
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === "project") {
      if (!canContinue) return;
      setError(null);
      setStep("release");
      return;
    }
    void createQaProject();
  };

  return (
    <Dialog open={props.open} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogPopup
        className="max-w-[30rem] overflow-hidden rounded-[20px] max-sm:rounded-t-[20px] [&_[aria-label=Close]]:rounded-[10px]"
        showCloseButton={!isCreating}
      >
        <form onSubmit={submit}>
          <DialogHeader className="gap-1.5 px-6 pb-4 pt-6">
            <div className="flex items-center gap-1.5 text-primary">
              <ShieldCheckIcon className="size-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
                QA workspace
              </span>
            </div>
            <DialogTitle className="mt-1 text-xl tracking-[-0.025em]">
              {step === "project" ? "Create QA project" : "Name the first release"}
            </DialogTitle>
            <DialogDescription className="leading-5">
              {step === "project"
                ? "Start by naming the product or system your QA team is validating."
                : "Every QA workflow is scoped to a release. Name the release you are testing now."}
            </DialogDescription>
            <div className="pt-4" aria-label="QA project setup progress">
              <div className="h-1 overflow-hidden rounded-full bg-muted-foreground/20">
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none",
                    step === "project" ? "w-1/2" : "w-full",
                  )}
                />
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span className="font-medium text-foreground">
                  {step === "project" ? "Project" : "Release"}
                </span>
                <span className="text-muted-foreground">{step === "project" ? "1" : "2"} of 2</span>
              </div>
            </div>
          </DialogHeader>

          <DialogPanel className="space-y-4 px-6 pb-5 pt-1" scrollFade={false}>
            {step === "project" ? (
              <div className="grid gap-2">
                <Label htmlFor="qa-project-title">Project name</Label>
                <Input
                  id="qa-project-title"
                  autoFocus
                  className="rounded-[10px]"
                  maxLength={160}
                  placeholder="e.g. Customer portal"
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                />
                <p className="text-xs leading-4 text-muted-foreground">
                  Releases, requirements, test plans, scripts, and evidence will be organized under
                  this QA project.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="text-muted-foreground">QA project</span>
                  <span className="font-medium text-foreground">{trimmedProjectTitle}</span>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="qa-release-title">Release name</Label>
                  <Input
                    id="qa-release-title"
                    autoFocus
                    className="rounded-[10px]"
                    maxLength={160}
                    placeholder="e.g. 2.4.0 or July regression"
                    value={releaseTitle}
                    onChange={(event) => setReleaseTitle(event.target.value)}
                  />
                  <p className="text-xs leading-4 text-muted-foreground">
                    This becomes the durable release workspace for document intake and QA approval
                    stages.
                  </p>
                </div>
              </div>
            )}
            {environment === null ? (
              <p className="text-xs text-destructive">
                Connect an environment before creating a QA project.
              </p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </DialogPanel>

          <DialogFooter className="border-t border-border/70 bg-transparent px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-[10px]"
              disabled={isCreating}
              onClick={() => {
                if (step === "release") {
                  setError(null);
                  setStep("project");
                } else {
                  close();
                }
              }}
            >
              {step === "release" ? "Back" : "Cancel"}
            </Button>
            <Button
              type="submit"
              className="rounded-[10px]"
              disabled={step === "project" ? !canContinue : !canCreate}
            >
              {isCreating ? <LoaderCircleIcon className="animate-spin" /> : null}
              {step === "project" ? "Continue" : "Create QA project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
