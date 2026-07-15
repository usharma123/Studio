import { FolderPlusIcon, ShieldCheckIcon } from "lucide-react";

import { useOpenAddProjectCommandPalette } from "../commandPaletteState";
import { useProjects } from "../state/entities";
import { useEnvironments } from "../state/environments";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { isElectron } from "../env";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { useEnterpriseModeStore } from "../enterpriseModeStore";
import { QaApprovalDashboard } from "../qa/QaApprovalDashboard";
import { isQaApproverDesktopProfile } from "../qa/qaRole";
import { DESKTOP_DEVELOPMENT_PROFILE } from "../branding";

export function NoActiveThreadState() {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const hasProjects = projects.length > 0;
  const openAddProject = useOpenAddProjectCommandPalette();
  const isQaMode = useEnterpriseModeStore((state) => state.mode === "qa");

  if (isQaMode) {
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
            <QaApprovalDashboard
              environmentIds={environments.map((environment) => environment.environmentId)}
              approver={isQaApproverDesktopProfile(DESKTOP_DEVELOPMENT_PROFILE)}
            />
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
