import type { QaAssignedReleaseStatus } from "@t3tools/contracts";
import { Link, useParams } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, CircleDot, ListChecks, LoaderCircle } from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";
import { useEnvironments } from "~/state/environments";
import { qaReleaseRouteTarget, resolveQaReleaseRouteRef } from "~/qaReleaseRoutes";

import { QaAssignedReleaseDashboardProbes, useAssignedQaReleases } from "./useAssignedQaReleases";

/** PG-backed release navigation used only in QA mode. */
export function QaSidebarNavigation() {
  const { environments } = useEnvironments();
  const assigned = useAssignedQaReleases(
    environments.map((environment) => environment.environmentId),
  );
  const activeReleaseRef = useParams({
    strict: false,
    select: (params) => resolveQaReleaseRouteRef(params),
  });
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      <QaAssignedReleaseDashboardProbes
        environmentIds={assigned.environmentIds}
        onDashboard={assigned.reportDashboard}
      />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<Link to="/" onClick={closeMobileSidebar} />}
            size="sm"
            isActive={activeReleaseRef === null}
            className="gap-2 px-2 py-1.5"
          >
            <ListChecks className="size-3.5 text-muted-foreground" />
            <span>Release list</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {assigned.releases.map(({ environmentId, release }) => {
          const active =
            activeReleaseRef?.environmentId === environmentId &&
            activeReleaseRef.releaseId === release.releaseId;
          return (
            <SidebarMenuItem key={`${environmentId}:${release.releaseId}`}>
              <SidebarMenuButton
                render={
                  <Link
                    {...qaReleaseRouteTarget({ environmentId, releaseId: release.releaseId })}
                    onClick={closeMobileSidebar}
                  />
                }
                size="sm"
                isActive={active}
                className="h-auto min-h-9 items-start gap-2 px-2 py-1.5"
                tooltip={`${release.projectTitle} · ${release.title}`}
              >
                <ReleaseStatusIcon
                  status={release.status}
                  needsAttention={release.bucket === "awaiting_review"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground/90">{release.title}</span>
                  <span className="block truncate text-[10px] text-muted-foreground/65">
                    {release.projectTitle}
                  </span>
                </span>
                {release.unresolvedBlockingCommentCount > 0 ? (
                  <span className="mt-0.5 text-[9px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
                    {release.unresolvedBlockingCommentCount}
                  </span>
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
      {assigned.loading ? (
        <div className="flex items-center gap-2 px-2 pt-3 text-[11px] text-muted-foreground/65">
          <LoaderCircle className="size-3 animate-spin" /> Loading releases
        </div>
      ) : null}
      {assigned.errors.length > 0 ? (
        <p
          role="alert"
          title={assigned.errors[0]?.message}
          className="flex items-start gap-1.5 px-2 pt-3 text-[11px] text-destructive"
        >
          <AlertCircle className="mt-0.5 size-3 shrink-0" /> Unable to load QA releases
        </p>
      ) : !assigned.loading && assigned.releases.length === 0 ? (
        <p className="px-2 pt-3 text-center text-xs text-muted-foreground/60">
          No assigned releases yet
        </p>
      ) : null}
    </>
  );
}

function ReleaseStatusIcon(props: {
  readonly status: QaAssignedReleaseStatus;
  readonly needsAttention: boolean;
}) {
  if (props.status === "completed") {
    return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />;
  }
  if (props.needsAttention || props.status === "blocked") {
    return <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />;
  }
  return <CircleDot className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />;
}
