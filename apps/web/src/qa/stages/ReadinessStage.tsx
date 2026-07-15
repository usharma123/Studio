import type { QaReadinessCoverageMetric, QaReleaseSnapshot } from "@t3tools/contracts";
import { AlertTriangle, Check, CheckCircle2, Circle, ShieldCheck, X, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";

import { isReadinessApprovable } from "../readinessModel";
import type { QaStageTabId } from "../stageRouting";

interface ReadinessStageProps {
  readonly snapshot: QaReleaseSnapshot;
  readonly selectedTab: QaStageTabId;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly onReview: (decision: "approved" | "rejected", note?: string) => Promise<boolean>;
}

export function ReadinessStage(props: ReadinessStageProps) {
  const dashboard = props.snapshot.readinessDashboard;
  if (!dashboard) return <EmptyReadiness />;
  if (props.selectedTab === "gates") return <ReadinessGates snapshot={props.snapshot} />;
  if (props.selectedTab === "approval") return <ReadinessApproval {...props} />;
  return <ReadinessDashboard snapshot={props.snapshot} />;
}

function EmptyReadiness() {
  return (
    <section className="rounded-xl border bg-card px-5 py-10 text-center shadow-sm">
      <ShieldCheck className="mx-auto size-5 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">Readiness is being computed</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        The dashboard appears only when persisted coverage, execution, blockers, and gate checks are
        available.
      </p>
    </section>
  );
}

function ReadinessDashboard({ snapshot }: { readonly snapshot: QaReleaseSnapshot }) {
  const dashboard = snapshot.readinessDashboard;
  if (!dashboard) return null;
  return (
    <div className="grid gap-3">
      <section className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
        {dashboard.overallStatus === "ready" ? (
          <CheckCircle2 className="size-5 text-emerald-500" />
        ) : (
          <AlertTriangle className="size-5 text-amber-500" />
        )}
        <div className="flex-1">
          <h3 className="text-sm font-medium">
            Release is {dashboard.overallStatus.replace("_", " ")}
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Computed {new Date(dashboard.computedAt).toLocaleString()} · revision{" "}
            {dashboard.revision}
          </p>
        </div>
        <Status value={dashboard.reviewStatus} />
      </section>
      <div className="grid grid-cols-2 gap-3">
        <CoverageMetric label="Requirements" metric={dashboard.requirementCoverage} />
        <CoverageMetric label="Scenarios" metric={dashboard.scenarioCoverage} />
        <CoverageMetric label="Test cases" metric={dashboard.testCaseCoverage} />
        <CoverageMetric label="Scripts" metric={dashboard.scriptCoverage} />
      </div>
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-medium">Execution truth</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Passed" value={dashboard.executionPassed} tone="success" />
          <Metric
            label="Failed"
            value={dashboard.executionFailed}
            tone={dashboard.executionFailed ? "danger" : "neutral"}
          />
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <h3 className="border-b px-4 py-3 text-sm font-medium">
          Open blockers · {dashboard.openBlockers.length}
        </h3>
        {dashboard.openBlockers.length ? (
          dashboard.openBlockers.map((blocker) => (
            <div key={blocker.id} className="border-b px-4 py-3 last:border-b-0">
              <div className="flex gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase">
                  {blocker.stage}
                </span>
                <p className="text-xs font-medium">{blocker.title}</p>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{blocker.detail}</p>
            </div>
          ))
        ) : (
          <p className="flex items-center justify-center gap-2 px-4 py-7 text-xs text-emerald-600">
            <CheckCircle2 className="size-4" />
            No open blockers
          </p>
        )}
      </section>
    </div>
  );
}

function ReadinessGates({ snapshot }: { readonly snapshot: QaReleaseSnapshot }) {
  const dashboard = snapshot.readinessDashboard;
  if (!dashboard) return null;
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <h3 className="border-b px-4 py-3 text-sm font-medium">Persisted gate checks</h3>
      {dashboard.gateChecks.map((gate) => (
        <div key={gate.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
          {gate.status === "passed" ? (
            <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" />
          ) : gate.status === "failed" ? (
            <XCircle className="mt-0.5 size-4 text-destructive" />
          ) : (
            <Circle className="mt-0.5 size-4 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">{gate.title}</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{gate.detail}</p>
          </div>
          <Status value={gate.status} />
        </div>
      ))}
    </section>
  );
}

function ReadinessApproval(props: ReadinessStageProps) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const dashboard = props.snapshot.readinessDashboard;
  if (!dashboard) return null;
  const approvable = isReadinessApprovable(dashboard);
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-sm font-medium">Final release approval</h3>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Approval records the final enterprise decision and closes this release. It does not
            fabricate or replace missing evidence.
          </p>
        </div>
        <Status value={dashboard.reviewStatus} />
      </div>
      {dashboard.decisionNote ? (
        <p className="mt-3 rounded border bg-muted/20 p-2 text-[10px]">{dashboard.decisionNote}</p>
      ) : null}
      {!props.readOnly && dashboard.reviewStatus === "pending" ? (
        confirming ? (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-xs font-medium">Confirm final release approval?</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              This closes the release and makes the completed workflow read-only.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                size="xs"
                disabled={props.busy || !approvable}
                onClick={() => void props.onReview("approved")}
              >
                <Check />
                Close and approve release
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-2 border-t pt-4">
            {!approvable ? (
              <p className="text-[10px] text-amber-600">
                Final approval is unavailable until every persisted gate passes and blockers are
                cleared.
              </p>
            ) : null}
            <textarea
              value={note}
              aria-label="Final readiness decision note"
              placeholder="Reason required when rejecting readiness"
              rows={3}
              className="w-full rounded border bg-background p-2 text-xs"
              onChange={(event) => setNote(event.currentTarget.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={props.busy || !note.trim()}
                onClick={() => void props.onReview("rejected", note.trim())}
              >
                <X />
                Reject readiness
              </Button>
              <Button
                size="xs"
                disabled={props.busy || !approvable}
                onClick={() => setConfirming(true)}
              >
                <Check />
                Approve release
              </Button>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}

function CoverageMetric({
  label,
  metric,
}: {
  readonly label: string;
  readonly metric: QaReadinessCoverageMetric;
}) {
  return (
    <section className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-end justify-between">
        <p className="text-xs font-medium">{label}</p>
        <span className="text-lg font-semibold">{metric.percent}%</span>
      </div>
      <p className="mt-1 text-[9px] text-muted-foreground">
        {metric.covered}/{metric.total} covered
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted">
        <div className="h-full bg-primary" style={{ width: `${metric.percent}%` }} />
      </div>
    </section>
  );
}
function Metric({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: "success" | "danger" | "neutral";
}) {
  return (
    <div
      className={`rounded border p-3 ${tone === "success" ? "bg-emerald-500/5" : tone === "danger" ? "bg-destructive/5" : "bg-muted/20"}`}
    >
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
function Status({ value }: { readonly value: string }) {
  return (
    <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[9px] font-medium capitalize text-muted-foreground">
      {value.replaceAll("_", " ")}
    </span>
  );
}
