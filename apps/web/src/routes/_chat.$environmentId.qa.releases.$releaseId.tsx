import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "~/components/ui/button";
import { QaReleaseRouteSurface } from "~/qa/QaReleaseRouteSurface";
import { resolveQaReleaseRouteRef } from "~/qaReleaseRoutes";
import { SidebarInset } from "~/components/ui/sidebar";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

function QaReleaseRouteView() {
  const releaseRef = Route.useParams({
    select: (params) => resolveQaReleaseRouteRef(params),
  });
  if (!releaseRef) return null;

  return (
    <SidebarInset
      className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh"
      data-qa-release-id={releaseRef.releaseId}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header
          className={cn(
            "workspace-topbar shrink-0 border-b border-border px-3 sm:px-5",
            isElectron && "drag-region",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          <Button
            render={<Link to="/" />}
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 text-muted-foreground [-webkit-app-region:no-drag] hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Release list
          </Button>
          <span className="ml-2 truncate text-xs text-muted-foreground/55">QA release</span>
        </header>
        <QaReleaseRouteSurface releaseRef={releaseRef} />
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/qa/releases/$releaseId")({
  component: QaReleaseRouteView,
});
