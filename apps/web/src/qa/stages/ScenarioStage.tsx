import type { QaReleaseSnapshot, QaReviewThread } from "@t3tools/contracts";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Send,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";

import {
  scenarioCoverage,
  scenarioPlanView,
  type ScenarioPlanView,
  type ScenarioRowView,
} from "../scenarioModel";
import type { QaStageTabId } from "../stageRouting";
import { WorkbookGrid, type WorkbookColumn } from "../WorkbookGrid";
import {
  AnchoredReviewThreads,
  type QaReviewThreadActions,
  type QaReviewThreadPermissions,
} from "../AnchoredReviewThreads";
import { openBlockingReviewThreadIds } from "../reviewThreadUi";

interface ScenarioStageProps {
  readonly snapshot: QaReleaseSnapshot;
  readonly selectedTab: QaStageTabId;
  readonly artifactReadOnly: boolean;
  readonly canSubmit: boolean;
  readonly canReview: boolean;
  readonly reviewThreads: readonly QaReviewThread[];
  readonly reviewActions: QaReviewThreadActions;
  readonly reviewPermissions: QaReviewThreadPermissions;
  readonly busy: boolean;
  readonly onSaveScenarios: (scenarios: readonly ScenarioRowView[]) => Promise<void>;
  readonly onSubmit: () => Promise<boolean>;
  readonly onReview: (
    decision: "approved" | "changes_requested",
    summary?: string,
    blockingCommentIds?: readonly string[],
  ) => Promise<boolean>;
  readonly onJumpToScenario: (scenarioId: string) => void;
}

const SCENARIO_COLUMNS: readonly WorkbookColumn<ScenarioRowView>[] = [
  {
    id: "identity",
    header: "ID / classification",
    width: "18%",
    cell: ({ row, readOnly, update }) => (
      <div className="grid gap-1.5">
        <EditableInput
          label="Scenario ID"
          value={row.externalId}
          readOnly={readOnly}
          className="font-mono"
          onChange={(externalId) => update({ ...row, externalId })}
        />
        <div className="grid grid-cols-2 gap-1">
          <EditableSelect
            label="Scenario type"
            value={row.type}
            values={["positive", "negative", "boundary", "exception", "integration"]}
            readOnly={readOnly}
            onChange={(type) => update({ ...row, type })}
          />
          <EditableSelect
            label="Priority"
            value={row.priority}
            values={["critical", "high", "medium", "low"]}
            readOnly={readOnly}
            onChange={(priority) => update({ ...row, priority })}
          />
        </div>
        <EditableSelect
          label="Risk"
          value={row.risk}
          values={["critical", "high", "medium", "low"]}
          readOnly={readOnly}
          onChange={(risk) => update({ ...row, risk })}
        />
      </div>
    ),
  },
  {
    id: "scenario",
    header: "Scenario",
    width: "25%",
    cell: ({ row, readOnly, update }) => (
      <div className="grid gap-1.5">
        <EditableInput
          label="Scenario title"
          value={row.title}
          readOnly={readOnly}
          className="font-medium"
          onChange={(title) => update({ ...row, title })}
        />
        <EditableTextArea
          label="Preconditions"
          value={row.preconditions.join("\n")}
          readOnly={readOnly}
          onChange={(value) =>
            update({
              ...row,
              preconditions: value
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
    ),
  },
  {
    id: "requirements",
    header: "Approved requirements",
    width: "20%",
    cell: ({ row, readOnly, update }) => (
      <EditableInput
        label="Requirement IDs"
        value={row.requirementIds.join(", ")}
        readOnly={readOnly}
        onChange={(value) =>
          update({
            ...row,
            requirementIds: value
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean),
          })
        }
      />
    ),
  },
  {
    id: "outcome",
    header: "Expected outcome",
    width: "25%",
    cell: ({ row, readOnly, update }) => (
      <EditableTextArea
        label="Expected outcome"
        value={row.expectedOutcome}
        readOnly={readOnly}
        onChange={(expectedOutcome) => update({ ...row, expectedOutcome })}
      />
    ),
  },
  {
    id: "status",
    header: "Review",
    width: "12%",
    cell: ({ row }) => (
      <div>
        <StatusPill value={row.status} />
        {row.decisionNote ? (
          <p className="mt-1.5 text-[9px] leading-3 text-muted-foreground">{row.decisionNote}</p>
        ) : null}
      </div>
    ),
  },
];

export function ScenarioStage(props: ScenarioStageProps) {
  const plan = scenarioPlanView(props.snapshot);
  if (!plan) return <EmptyScenarios />;
  if (props.selectedTab === "coverage") {
    return <ScenarioCoverage snapshot={props.snapshot} plan={plan} />;
  }
  if (props.selectedTab === "review") {
    return <ScenarioReview {...props} plan={plan} />;
  }
  return (
    <div className="grid gap-3">
      <section className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <ClipboardList className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Release scenarios</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Revision {plan.revision} · {plan.scenarios.length} scenarios
          </p>
        </div>
        <StatusPill value={plan.generationStatus} />
        <StatusPill value={plan.reviewStatus} />
      </section>
      <WorkbookGrid
        ariaLabel="Release scenario workbook"
        rows={plan.scenarios}
        columns={SCENARIO_COLUMNS}
        getRowId={(row) => row.id}
        readOnly={props.artifactReadOnly}
        onSave={props.onSaveScenarios}
        emptyState="The release agent has not produced scenarios yet."
      />
    </div>
  );
}

function EmptyScenarios() {
  return (
    <section className="rounded-xl border bg-card px-5 py-10 text-center shadow-sm">
      <ClipboardList className="mx-auto size-5 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">Scenarios not generated yet</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        A maker can select Generate above. The release agent runs in the background and saves the
        scenarios here for review.
      </p>
    </section>
  );
}

function ScenarioCoverage(props: {
  readonly snapshot: QaReleaseSnapshot;
  readonly plan: ScenarioPlanView;
}) {
  const coverage = scenarioCoverage(props.snapshot, props.plan.scenarios);
  const requirementById = new Map(
    props.snapshot.requirements.map((requirement) => [requirement.id, requirement]),
  );
  return (
    <div className="grid gap-3">
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Approved requirement coverage</h3>
          <span className="ml-auto text-lg font-semibold tabular-nums">{coverage.percent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${coverage.percent}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Approved" value={coverage.totalApprovedRequirements} />
          <Metric label="Covered" value={coverage.coveredApprovedRequirements} />
          <Metric label="Gaps" value={coverage.uncoveredRequirementIds.length} />
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <AlertTriangle className="size-4 text-amber-500" />
          <h3 className="text-sm font-medium">Uncovered approved requirements</h3>
        </div>
        {coverage.uncoveredRequirementIds.length ? (
          coverage.uncoveredRequirementIds.map((id) => (
            <div key={id} className="flex gap-3 border-b px-4 py-3 last:border-b-0">
              <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
              <span className="text-xs">
                {requirementById.get(id)?.title ?? "Unresolved requirement"}
              </span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            Every approved requirement is covered by at least one scenario.
          </div>
        )}
      </section>
    </div>
  );
}

function ScenarioReview(props: ScenarioStageProps & { readonly plan: ScenarioPlanView }) {
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [changesSummary, setChangesSummary] = useState("");
  const coverage = scenarioCoverage(props.snapshot, props.plan.scenarios);
  const openBlockingIds = openBlockingReviewThreadIds(props.reviewThreads);
  return (
    <div className="grid gap-3">
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <ClipboardList className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Scenario review set</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {props.plan.scenarios.length} scenarios · {coverage.percent}% approved coverage
          </span>
        </div>
        {props.plan.scenarios.map((scenario) => (
          <AnchoredReviewThreads
            key={scenario.id}
            anchor={{
              type: "scenario",
              scenarioId: scenario.id,
              label: `${scenario.externalId} · ${scenario.title}`,
              quote: scenario.expectedOutcome.slice(0, 10_000) || null,
            }}
            threads={props.reviewThreads.filter(
              (thread) =>
                thread.anchor.type === "scenario" && thread.anchor.scenarioId === scenario.id,
            )}
            permissions={props.reviewPermissions}
            busy={props.busy}
            actions={props.reviewActions}
            onJumpToAnchor={(anchor) => {
              if (anchor.type === "scenario") props.onJumpToScenario(anchor.scenarioId);
            }}
          />
        ))}
      </section>
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">Scenario-plan approval</h3>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Approval freezes this workbook revision and advances the release workflow.
            </p>
          </div>
          <StatusPill value={props.plan.reviewStatus} />
        </div>
        {props.plan.rejectionNote ? (
          <p className="mt-3 border-l-2 border-amber-500/40 bg-amber-500/5 py-2 pl-2.5 pr-2 text-[10px] text-amber-700 dark:text-amber-300">
            {props.plan.rejectionNote}
          </p>
        ) : null}
        {props.canSubmit &&
        (props.plan.reviewStatus === "draft" || props.plan.reviewStatus === "rejected") ? (
          <div className="mt-4 flex justify-end">
            <Button size="sm" disabled={props.busy} onClick={() => void props.onSubmit()}>
              {props.busy ? <LoaderCircle className="animate-spin" /> : <Send />}
              {props.plan.reviewStatus === "rejected"
                ? "Re-submit scenario plan"
                : "Submit scenario plan"}
            </Button>
          </div>
        ) : null}
        {props.canReview && props.plan.reviewStatus === "pending_review" ? (
          <div className="mt-4 border-t pt-4">
            {confirmingApproval ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs font-medium">Confirm scenario-plan approval?</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  This makes the completed workbook read-only and advances the release.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="xs" variant="ghost" onClick={() => setConfirmingApproval(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    disabled={props.busy || openBlockingIds.length > 0}
                    onClick={() => void props.onReview("approved")}
                  >
                    <Check /> Confirm approval
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <textarea
                  value={changesSummary}
                  aria-label="Scenario-plan changes summary"
                  placeholder="Optional summary"
                  rows={2}
                  className="w-full resize-y rounded-md border bg-background px-3 py-2 text-xs outline-none focus:border-ring"
                  onChange={(event) => setChangesSummary(event.currentTarget.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={props.busy || openBlockingIds.length === 0}
                    onClick={() =>
                      void props.onReview(
                        "changes_requested",
                        changesSummary.trim() || undefined,
                        openBlockingIds,
                      )
                    }
                  >
                    <X /> Request changes
                  </Button>
                  <Button
                    size="xs"
                    disabled={props.busy || openBlockingIds.length > 0}
                    onClick={() => setConfirmingApproval(true)}
                  >
                    <Check /> Approve scenario plan
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function EditableInput(props: {
  readonly label: string;
  readonly value: string;
  readonly readOnly: boolean;
  readonly className?: string;
  readonly onChange: (value: string) => void;
}) {
  if (props.readOnly)
    return <p className={`text-[10px] ${props.className ?? ""}`}>{props.value}</p>;
  return (
    <input
      value={props.value}
      aria-label={props.label}
      className={`w-full rounded border bg-background px-1.5 py-1 text-[10px] outline-none focus:border-ring ${props.className ?? ""}`}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    />
  );
}

function EditableTextArea(props: {
  readonly label: string;
  readonly value: string;
  readonly readOnly: boolean;
  readonly onChange: (value: string) => void;
}) {
  if (props.readOnly)
    return <p className="whitespace-pre-wrap text-[10px] leading-4">{props.value}</p>;
  return (
    <textarea
      value={props.value}
      aria-label={props.label}
      rows={3}
      className="w-full resize-y rounded border bg-background px-1.5 py-1 text-[10px] leading-4 outline-none focus:border-ring"
      onChange={(event) => props.onChange(event.currentTarget.value)}
    />
  );
}

function EditableSelect<const Value extends string>(props: {
  readonly label: string;
  readonly value: Value;
  readonly values: readonly Value[];
  readonly readOnly: boolean;
  readonly onChange: (value: Value) => void;
}) {
  if (props.readOnly) return <p className="text-[10px] capitalize">{props.value}</p>;
  return (
    <select
      value={props.value}
      aria-label={props.label}
      className="w-full rounded border bg-background px-1.5 py-1 text-[10px] capitalize outline-none focus:border-ring"
      onChange={(event) => props.onChange(event.currentTarget.value as Value)}
    >
      {props.values.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </select>
  );
}

function StatusPill({ value }: { readonly value: string }) {
  const label = value === "rejected" ? "Changes requested" : value.replaceAll("_", " ");
  return (
    <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[9px] font-medium capitalize text-muted-foreground">
      {label}
    </span>
  );
}

function Metric(props: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-lg font-semibold tabular-nums">{props.value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{props.label}</p>
    </div>
  );
}
