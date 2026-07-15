import { Link } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CircleDotIcon,
  FolderPlusIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { useOpenAddProjectCommandPalette } from "../commandPaletteState";
import { useProjects, useThreadShells } from "../state/entities";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { isElectron } from "../env";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { useEnterpriseModeStore } from "../enterpriseModeStore";

export function NoActiveThreadState() {
  const projects = useProjects();
  const threadShells = useThreadShells();
  const hasProjects = projects.length > 0;
  const openAddProject = useOpenAddProjectCommandPalette();
  const isQaMode = useEnterpriseModeStore((state) => state.mode === "qa");

  if (isQaMode) {
    const projectTitles = new Map(projects.map((project) => [project.id, project.title]));
    const activeReleases = threadShells
      .filter((thread) => thread.archivedAt === null)
      .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const releasesNeedingAttention = activeReleases.filter(
      (thread) => thread.hasPendingApprovals || thread.hasPendingUserInput,
    );
    const runningReleases = activeReleases.filter((thread) => thread.session?.status === "running");

    return (
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <header
            className={cn(
              "workspace-topbar border-b border-border px-5",
              isElectron && "drag-region",
              COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
            )}
          >
            <span className="text-sm font-medium text-muted-foreground/70">QA dashboard</span>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
              <section>
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary">
                    <ShieldCheckIcon className="size-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">QA operations</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Shared release status across your assigned projects. Conversations remain
                      role-specific.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <QaMetric label="Assigned projects" value={projects.length} />
                  <QaMetric label="Active releases" value={activeReleases.length} />
                  <QaMetric
                    label="Needs attention"
                    value={releasesNeedingAttention.length}
                    tone={releasesNeedingAttention.length > 0 ? "attention" : "default"}
                  />
                  <QaMetric label="Running now" value={runningReleases.length} />
                </div>
              </section>

              <section className="rounded-2xl border border-border/70 bg-card/25">
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold">Active releases</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Open a release to review its canonical workflow and launch your assistant.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {activeReleases.length} total
                  </span>
                </div>

                {activeReleases.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <CircleDotIcon className="mx-auto size-6 text-muted-foreground/55" />
                    <p className="mt-3 text-sm font-medium">No active releases</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use New QA release to start one in an assigned project.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/55">
                    {activeReleases.slice(0, 8).map((release) => {
                      const needsAttention =
                        release.hasPendingApprovals || release.hasPendingUserInput;
                      return (
                        <Link
                          key={`${release.environmentId}:${release.id}`}
                          to="/$environmentId/$threadId"
                          params={{
                            environmentId: release.environmentId,
                            threadId: release.id,
                          }}
                          className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/45"
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/70">
                            {needsAttention ? (
                              <AlertCircleIcon className="size-4 text-amber-500" />
                            ) : (
                              <ShieldCheckIcon className="size-4 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{release.title}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {projectTitles.get(release.projectId) ?? "Assigned project"}
                              {needsAttention ? " · Action required" : " · In progress"}
                            </div>
                          </div>
                          <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </main>
        </div>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header
          className={cn(
            "border-b border-border px-3 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5",
            isElectron ? "workspace-topbar drag-region" : "workspace-topbar",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          {isElectron ? (
            <span className="text-xs text-muted-foreground/50 wco:pr-[var(--workspace-native-controls-inset)]">
              No active thread
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
                No active thread
              </span>
            </div>
          )}
        </header>

        <Empty className="flex-1">
          <div className="w-full max-w-lg px-8 py-12">
            <EmptyHeader className="max-w-none">
              {isQaMode ? <ShieldCheckIcon className="mx-auto mb-2 size-8 text-primary" /> : null}
              <EmptyTitle className="text-foreground text-xl">
                {isQaMode
                  ? "QA workspace"
                  : hasProjects
                    ? "Preparing a new task"
                    : "Add a project to get started"}
              </EmptyTitle>
              <EmptyDescription className="mt-2 text-sm text-muted-foreground/78">
                {isQaMode
                  ? hasProjects
                    ? "Choose an assigned project and release from the sidebar to review its QA workflow."
                    : "No QA projects are assigned to this account yet."
                  : hasProjects
                    ? "Opening a fresh Codex workspace for your most recent project."
                    : "Choose a local repository, then ask Codex to explore, build, review, or fix it."}
              </EmptyDescription>
              {!isQaMode && !hasProjects ? (
                <Button className="mt-5" size="sm" onClick={openAddProject}>
                  <FolderPlusIcon className="size-4" />
                  Add project
                </Button>
              ) : null}
            </EmptyHeader>
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}

function QaMetric(props: { label: string; value: number; tone?: "default" | "attention" }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/30 px-4 py-4">
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          props.tone === "attention" && "text-amber-500",
        )}
      >
        {props.value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{props.label}</div>
    </div>
  );
}
