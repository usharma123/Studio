import type { QaPriority, QaReleaseSnapshot, QaTestCase } from "@t3tools/contracts";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";

import type { QaStageTabId } from "../stageRouting";
import {
  appendTestCaseStep,
  moveTestCaseStep,
  removeTestCaseStep,
  testCaseCoverage,
  updateTestCaseStep,
} from "../testCaseModel";
import { WorkbookGrid, type WorkbookColumn } from "../WorkbookGrid";

interface TestCaseStageProps {
  readonly snapshot: QaReleaseSnapshot;
  readonly selectedTab: QaStageTabId;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly onSaveTestCases: (testCases: readonly QaTestCase[]) => Promise<void>;
  readonly onSubmit: () => Promise<boolean>;
  readonly onReview: (decision: "approved" | "rejected", note?: string) => Promise<boolean>;
}

const TEST_CASE_COLUMNS: readonly WorkbookColumn<QaTestCase>[] = [
  {
    id: "identity",
    header: "ID / test case",
    width: "22%",
    cell: ({ row, readOnly, update }) => (
      <div className="grid gap-1.5">
        <EditableInput
          label="Test case ID"
          value={row.externalId}
          readOnly={readOnly}
          className="font-mono"
          onChange={(externalId) => update({ ...row, externalId })}
        />
        <EditableInput
          label="Test case title"
          value={row.title}
          readOnly={readOnly}
          className="font-medium"
          onChange={(title) => update({ ...row, title })}
        />
        <div className="grid grid-cols-2 gap-1">
          <PrioritySelect
            value={row.priority}
            readOnly={readOnly}
            onChange={(priority) => update({ ...row, priority })}
          />
          <label className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-[9px]">
            <input
              type="checkbox"
              checked={row.automationCandidate}
              disabled={readOnly}
              onChange={(event) =>
                update({ ...row, automationCandidate: event.currentTarget.checked })
              }
            />
            Automation
          </label>
        </div>
      </div>
    ),
  },
  {
    id: "traceability",
    header: "Traceability / setup",
    width: "22%",
    cell: ({ row, readOnly, update }) => (
      <div className="grid gap-1.5">
        <EditableInput
          label="Scenario IDs"
          value={row.scenarioIds.join(", ")}
          readOnly={readOnly}
          onChange={(value) => update({ ...row, scenarioIds: commaSeparatedValues(value) })}
        />
        <EditableInput
          label="Requirement IDs"
          value={row.requirementIds.join(", ")}
          readOnly={readOnly}
          onChange={(value) => update({ ...row, requirementIds: commaSeparatedValues(value) })}
        />
        <EditableTextArea
          label="Preconditions"
          value={row.preconditions.join("\n")}
          readOnly={readOnly}
          rows={2}
          onChange={(value) => update({ ...row, preconditions: lineSeparatedValues(value) })}
        />
      </div>
    ),
  },
  {
    id: "steps",
    header: "Ordered steps",
    width: "46%",
    cell: ({ row, readOnly, update }) => (
      <StepsEditor testCase={row} readOnly={readOnly} update={update} />
    ),
  },
  {
    id: "review",
    header: "Review",
    width: "10%",
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

export function TestCaseStage(props: TestCaseStageProps) {
  const plan = props.snapshot.testCasePlan;
  if (!plan) return <EmptyTestCases />;
  if (props.selectedTab === "coverage") return <TestCaseCoverage snapshot={props.snapshot} />;
  if (props.selectedTab === "review") return <TestCaseReview {...props} />;
  return (
    <div className="grid gap-3">
      <section className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <ClipboardCheck className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Release test cases</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Revision {plan.revision} · {plan.testCases.length} test cases
          </p>
        </div>
        <StatusPill value={plan.generationStatus} />
        <StatusPill value={plan.reviewStatus} />
      </section>
      <WorkbookGrid
        ariaLabel="Release test case workbook"
        rows={plan.testCases}
        columns={TEST_CASE_COLUMNS}
        getRowId={(row) => row.id}
        readOnly={props.readOnly}
        onSave={props.onSaveTestCases}
        emptyState="The release agent has not produced test cases yet."
      />
    </div>
  );
}

function EmptyTestCases() {
  return (
    <section className="rounded-xl border bg-card px-5 py-10 text-center shadow-sm">
      <ClipboardCheck className="mx-auto size-5 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">Test case generation is coordinated from chat</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        The release agent remains the main driver. Executable, traceable test cases appear here for
        workbook review.
      </p>
    </section>
  );
}

function StepsEditor(props: {
  readonly testCase: QaTestCase;
  readonly readOnly: boolean;
  readonly update: (testCase: QaTestCase) => void;
}) {
  return (
    <div className="grid gap-2">
      {props.testCase.steps.map((step, index) => (
        <div key={step.order} className="rounded border bg-muted/10 p-2">
          <div className="flex items-center gap-1.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[9px] font-semibold">
              {index + 1}
            </span>
            <EditableInput
              label={`Step ${index + 1} action`}
              value={step.action}
              readOnly={props.readOnly}
              className="font-medium"
              onChange={(action) =>
                props.update({
                  ...props.testCase,
                  steps: updateTestCaseStep(props.testCase.steps, index, { action }),
                })
              }
            />
            {!props.readOnly ? (
              <StepControls
                index={index}
                count={props.testCase.steps.length}
                onMove={(to) =>
                  props.update({
                    ...props.testCase,
                    steps: moveTestCaseStep(props.testCase.steps, index, to),
                  })
                }
                onRemove={() =>
                  props.update({
                    ...props.testCase,
                    steps: removeTestCaseStep(props.testCase.steps, index),
                  })
                }
              />
            ) : null}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <EditableTextArea
              label={`Step ${index + 1} test data`}
              value={step.testData}
              readOnly={props.readOnly}
              rows={2}
              placeholder="Test data"
              onChange={(testData) =>
                props.update({
                  ...props.testCase,
                  steps: updateTestCaseStep(props.testCase.steps, index, { testData }),
                })
              }
            />
            <EditableTextArea
              label={`Step ${index + 1} expected result`}
              value={step.expectedResult}
              readOnly={props.readOnly}
              rows={2}
              placeholder="Expected result"
              onChange={(expectedResult) =>
                props.update({
                  ...props.testCase,
                  steps: updateTestCaseStep(props.testCase.steps, index, { expectedResult }),
                })
              }
            />
          </div>
        </div>
      ))}
      {!props.readOnly ? (
        <Button
          className="justify-self-start"
          size="xs"
          variant="ghost"
          onClick={() =>
            props.update({ ...props.testCase, steps: appendTestCaseStep(props.testCase.steps) })
          }
        >
          <Plus /> Add step
        </Button>
      ) : null}
    </div>
  );
}

function StepControls(props: {
  readonly index: number;
  readonly count: number;
  readonly onMove: (to: number) => void;
  readonly onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0">
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={props.index === 0}
        aria-label="Move step up"
        onClick={() => props.onMove(props.index - 1)}
      >
        <ArrowUp />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={props.index === props.count - 1}
        aria-label="Move step down"
        onClick={() => props.onMove(props.index + 1)}
      >
        <ArrowDown />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={props.count === 1}
        aria-label="Remove step"
        onClick={props.onRemove}
      >
        <Trash2 className="text-destructive" />
      </Button>
    </div>
  );
}

function TestCaseCoverage({ snapshot }: { readonly snapshot: QaReleaseSnapshot }) {
  const plan = snapshot.testCasePlan;
  if (!plan) return null;
  const coverage = testCaseCoverage(snapshot, plan.testCases);
  const scenarioById = new Map(
    (snapshot.scenarioPlan?.scenarios ?? []).map((scenario) => [scenario.id, scenario]),
  );
  const requirementById = new Map(
    snapshot.requirements.map((requirement) => [requirement.id, requirement]),
  );
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <CoverageCard label="Approved scenarios" coverage={coverage.approvedScenarios} />
        <CoverageCard label="Approved requirements" coverage={coverage.approvedRequirements} />
      </div>
      <CoverageGaps
        label="Scenario gaps"
        ids={coverage.approvedScenarios.gapIds}
        title={(id) => scenarioById.get(id)?.title ?? "Unresolved scenario"}
      />
      <CoverageGaps
        label="Requirement gaps"
        ids={coverage.approvedRequirements.gapIds}
        title={(id) => requirementById.get(id)?.title ?? "Unresolved requirement"}
      />
    </div>
  );
}

function CoverageCard(props: {
  readonly label: string;
  readonly coverage: { readonly total: number; readonly covered: number; readonly percent: number };
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium">{props.label}</p>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-[10px] text-muted-foreground">
          {props.coverage.covered}/{props.coverage.total} covered
        </span>
        <span className="text-lg font-semibold tabular-nums">{props.coverage.percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${props.coverage.percent}%` }}
        />
      </div>
    </section>
  );
}

function CoverageGaps(props: {
  readonly label: string;
  readonly ids: readonly string[];
  readonly title: (id: string) => string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3 text-sm font-medium">{props.label}</div>
      {props.ids.length ? (
        props.ids.map((id) => (
          <div key={id} className="flex gap-3 border-b px-4 py-3 text-xs last:border-b-0">
            <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
            <span>{props.title(id)}</span>
          </div>
        ))
      ) : (
        <div className="flex items-center justify-center gap-2 px-4 py-7 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> No approved-item gaps.
        </div>
      )}
    </section>
  );
}

function TestCaseReview(props: TestCaseStageProps) {
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [rejectionNote, setRejectionNote] = useState("");
  const plan = props.snapshot.testCasePlan;
  if (!plan) return null;
  return (
    <div className="grid gap-3">
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Test case review set</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {plan.testCases.length} cases ·{" "}
            {plan.testCases.reduce((sum, item) => sum + item.steps.length, 0)} steps
          </span>
        </div>
        {plan.testCases.map((testCase) => (
          <div
            key={testCase.id}
            className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <span className="font-mono text-[10px] text-muted-foreground">
              {testCase.externalId}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{testCase.title}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {testCase.steps.length} steps · {testCase.scenarioIds.length} scenarios
                {testCase.automationCandidate ? " · automation candidate" : ""}
              </p>
            </div>
            <StatusPill value={testCase.status} />
          </div>
        ))}
      </section>
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">Test-case-plan approval</h3>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Approval freezes these cases and hands the release to script generation.
            </p>
          </div>
          <StatusPill value={plan.reviewStatus} />
        </div>
        {plan.rejectionNote ? (
          <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-[10px] text-destructive">
            {plan.rejectionNote}
          </p>
        ) : null}
        {!props.readOnly && plan.reviewStatus === "draft" ? (
          <div className="mt-4 flex justify-end">
            <Button size="sm" disabled={props.busy} onClick={() => void props.onSubmit()}>
              {props.busy ? <LoaderCircle className="animate-spin" /> : <Send />}
              Submit test cases
            </Button>
          </div>
        ) : null}
        {!props.readOnly && plan.reviewStatus === "pending_review" ? (
          <div className="mt-4 border-t pt-4">
            {confirmingApproval ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs font-medium">Confirm test-case-plan approval?</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  This makes the workbook read-only and starts the Scripts stage through chat.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="xs" variant="ghost" onClick={() => setConfirmingApproval(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    disabled={props.busy}
                    onClick={() => void props.onReview("approved")}
                  >
                    <Check /> Confirm approval
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <textarea
                  value={rejectionNote}
                  aria-label="Test-case-plan rejection note"
                  placeholder="Reason required when requesting changes"
                  rows={2}
                  className="w-full resize-y rounded-md border bg-background px-3 py-2 text-xs outline-none focus:border-ring"
                  onChange={(event) => setRejectionNote(event.currentTarget.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={props.busy || !rejectionNote.trim()}
                    onClick={() => void props.onReview("rejected", rejectionNote.trim())}
                  >
                    <X /> Request changes
                  </Button>
                  <Button
                    size="xs"
                    disabled={props.busy}
                    onClick={() => setConfirmingApproval(true)}
                  >
                    <Check /> Approve test cases
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
  readonly rows: number;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}) {
  if (props.readOnly)
    return <p className="whitespace-pre-wrap text-[10px] leading-4">{props.value}</p>;
  return (
    <textarea
      value={props.value}
      aria-label={props.label}
      rows={props.rows}
      placeholder={props.placeholder}
      className="w-full resize-y rounded border bg-background px-1.5 py-1 text-[10px] leading-4 outline-none focus:border-ring"
      onChange={(event) => props.onChange(event.currentTarget.value)}
    />
  );
}

function PrioritySelect(props: {
  readonly value: QaPriority;
  readonly readOnly: boolean;
  readonly onChange: (value: QaPriority) => void;
}) {
  if (props.readOnly) return <p className="text-[10px] capitalize">{props.value}</p>;
  return (
    <select
      value={props.value}
      aria-label="Priority"
      className="w-full rounded border bg-background px-1.5 py-1 text-[10px] capitalize outline-none focus:border-ring"
      onChange={(event) => props.onChange(event.currentTarget.value as QaPriority)}
    >
      {(["critical", "high", "medium", "low"] as const).map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </select>
  );
}

function commaSeparatedValues(value: string): readonly string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function lineSeparatedValues(value: string): readonly string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function StatusPill({ value }: { readonly value: string }) {
  return (
    <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[9px] font-medium capitalize text-muted-foreground">
      {value.replaceAll("_", " ")}
    </span>
  );
}
