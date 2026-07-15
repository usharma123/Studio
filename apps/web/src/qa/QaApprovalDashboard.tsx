import type {
  EnvironmentId,
  QaAssignedReleaseDashboard,
  QaAssignedReleaseSummary,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  LoaderCircle,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";

import { cn } from "~/lib/utils";
import { useEnvironmentQuery } from "~/state/query";

import { qaEnvironment } from "./client";

type QaDashboardFilter = "awaiting_review" | "in_progress" | "completed";

interface QaApprovalDashboardProps {
  readonly environmentIds: ReadonlyArray<EnvironmentId>;
  readonly approver: boolean;
}

const FILTERS: ReadonlyArray<{ readonly id: QaDashboardFilter; readonly label: string }> = [
  { id: "awaiting_review", label: "Awaiting review" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed · 30 days" },
];

export function QaApprovalDashboard(props: QaApprovalDashboardProps) {
  const [filter, setFilter] = useState<QaDashboardFilter>(() =>
    props.approver ? "awaiting_review" : "in_progress",
  );
  const filterTouchedRef = useRef(false);
  const [dashboards, setDashboards] = useState<
    ReadonlyMap<EnvironmentId, QaAssignedReleaseDashboard | null>
  >(new Map());
  const environmentIds = useMemo(() => [...new Set(props.environmentIds)], [props.environmentIds]);
  const reportDashboard = useCallback(
    (environmentId: EnvironmentId, dashboard: QaAssignedReleaseDashboard | null) => {
      setDashboards((current) => {
        if (current.get(environmentId) === dashboard) return current;
        const next = new Map(current);
        next.set(environmentId, dashboard);
        return next;
      });
    },
    [],
  );
  const releases = environmentIds
    .flatMap((environmentId) =>
      (dashboards.get(environmentId)?.releases ?? []).map((release) => ({
        environmentId,
        release,
      })),
    )
    .toSorted((left, right) => right.release.updatedAt.localeCompare(left.release.updatedAt));
  const filtered = releases.filter(({ release }) => release.bucket === filter);
  const effectiveApprover =
    props.approver || releases.some(({ release }) => release.uiRole === "approver");
  const awaitingCount = environmentIds.reduce(
    (total, environmentId) => total + (dashboards.get(environmentId)?.awaitingReviewCount ?? 0),
    0,
  );
  const loading = environmentIds.some((environmentId) => !dashboards.has(environmentId));
  useEffect(() => {
    if (effectiveApprover && !filterTouchedRef.current) setFilter("awaiting_review");
  }, [effectiveApprover]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {environmentIds.map((environmentId) => (
        <QaAssignedReleaseDashboardProbe
          key={environmentId}
          environmentId={environmentId}
          onDashboard={reportDashboard}
        />
      ))}

      <header className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/8 text-primary">
          <ShieldCheck className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {effectiveApprover ? "Release review" : "QA releases"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {effectiveApprover
              ? "Review assigned releases and make the final decision."
              : "Track work across your assigned releases."}
          </p>
        </div>
        {effectiveApprover ? (
          <span className="pt-1 text-xs tabular-nums text-muted-foreground">
            {awaitingCount} awaiting review
          </span>
        ) : null}
      </header>

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/25">
        <div className="flex items-center gap-1 border-b border-border/60 px-3 pt-2">
          {FILTERS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={cn(
                "border-b-2 px-3 py-2 text-xs transition-colors",
                candidate.id === filter
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                filterTouchedRef.current = true;
                setFilter(candidate.id);
              }}
            >
              {candidate.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-xs text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Loading assigned releases
          </div>
        ) : filtered.length === 0 ? (
          <DashboardEmpty filter={filter} />
        ) : (
          <div className="divide-y divide-border/55">
            {filtered.map(({ environmentId, release }) => (
              <ReleaseRow
                key={`${environmentId}:${release.threadId}`}
                environmentId={environmentId}
                release={release}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QaAssignedReleaseDashboardProbe(props: {
  readonly environmentId: EnvironmentId;
  readonly onDashboard: (
    environmentId: EnvironmentId,
    dashboard: QaAssignedReleaseDashboard | null,
  ) => void;
}) {
  const query = useEnvironmentQuery(
    qaEnvironment.listAssignedReleases({
      environmentId: props.environmentId,
      input: {},
    }),
  );
  const onDashboard = props.onDashboard;
  useEffect(() => {
    if (query.data) onDashboard(props.environmentId, query.data);
    else if (!query.isPending) onDashboard(props.environmentId, null);
  }, [onDashboard, props.environmentId, query.data, query.isPending]);
  return null;
}

function ReleaseRow(props: {
  readonly environmentId: EnvironmentId;
  readonly release: QaAssignedReleaseSummary;
}) {
  const { release } = props;
  const needsAttention = release.bucket === "awaiting_review";
  return (
    <Link
      to="/$environmentId/$threadId"
      params={{ environmentId: props.environmentId, threadId: release.threadId }}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/45"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/70">
        {release.status === "completed" ? (
          <CheckCircle2 className="size-3.5 text-emerald-500" />
        ) : needsAttention || release.status === "blocked" ? (
          <AlertCircle className="size-3.5 text-amber-500" />
        ) : (
          <ShieldCheck className="size-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{release.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {release.projectTitle} · Release {release.releaseNumber}
        </p>
      </div>
      {release.unreadReviewActivityCount > 0 ? (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <MessageSquare className="size-3" /> {release.unreadReviewActivityCount}
        </span>
      ) : null}
      {release.unresolvedBlockingCommentCount > 0 ? (
        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
          {release.unresolvedBlockingCommentCount} blocking
        </span>
      ) : null}
      <span
        className={cn(
          "text-[11px] capitalize",
          needsAttention
            ? "font-medium text-amber-600 dark:text-amber-400"
            : "text-muted-foreground",
        )}
      >
        {release.status.replaceAll("_", " ")}
      </span>
      <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function DashboardEmpty({ filter }: { readonly filter: QaDashboardFilter }) {
  return (
    <div className="px-5 py-12 text-center">
      <CircleDot className="mx-auto size-5 text-muted-foreground/55" />
      <p className="mt-3 text-sm font-medium">No releases in this view</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {filter === "awaiting_review"
          ? "Submitted work will appear here when it is ready for review."
          : filter === "completed"
            ? "Completed releases remain here for 30 days. Archived keeps the full history."
            : "Active preparation and changes-requested work will appear here."}
      </p>
    </div>
  );
}
