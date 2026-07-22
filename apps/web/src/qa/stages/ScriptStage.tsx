import type { QaReleaseSnapshot, QaScript } from "@t3tools/contracts";
import {
  Check,
  CheckCircle2,
  Code2,
  FileCheck2,
  LoaderCircle,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";

import { scriptCoverage } from "../scriptModel";
import type { QaStageTabId } from "../stageRouting";
import { WorkbookGrid, type WorkbookColumn } from "../WorkbookGrid";

interface ScriptStageProps {
  readonly snapshot: QaReleaseSnapshot;
  readonly selectedTab: QaStageTabId;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly onSaveScripts: (scripts: readonly QaScript[]) => Promise<void>;
  readonly onSubmit: () => Promise<boolean>;
  readonly onReview: (decision: "approved" | "rejected", note?: string) => Promise<boolean>;
}

const SCRIPT_COLUMNS: readonly WorkbookColumn<QaScript>[] = [
  {
    id: "identity",
    header: "ID / script",
    width: "20%",
    cell: ({ row, readOnly, update }) => (
      <div className="grid gap-1.5">
        <EditableInput
          label="Script ID"
          value={row.externalId}
          readOnly={readOnly}
          mono
          onChange={(externalId) => update({ ...row, externalId })}
        />
        <EditableInput
          label="Script title"
          value={row.title}
          readOnly={readOnly}
          onChange={(title) => update({ ...row, title })}
        />
        <EditableInput
          label="File name"
          value={row.fileName}
          readOnly={readOnly}
          mono
          onChange={(fileName) => update({ ...row, fileName })}
        />
      </div>
    ),
  },
  {
    id: "configuration",
    header: "Framework / links",
    width: "20%",
    cell: ({ row, readOnly, update }) => (
      <div className="grid gap-1.5">
        <EditableInput
          label="Framework"
          value={row.framework}
          readOnly={readOnly}
          onChange={(framework) => update({ ...row, framework })}
        />
        <EditableInput
          label="Language"
          value={row.language}
          readOnly={readOnly}
          onChange={(language) => update({ ...row, language })}
        />
        <EditableInput
          label="Test case IDs"
          value={row.testCaseIds.join(", ")}
          readOnly={readOnly}
          onChange={(value) => update({ ...row, testCaseIds: values(value) })}
        />
        <EditableInput
          label="Requirement IDs"
          value={row.requirementIds.join(", ")}
          readOnly={readOnly}
          onChange={(value) => update({ ...row, requirementIds: values(value) })}
        />
      </div>
    ),
  },
  {
    id: "content",
    header: "Script content",
    width: "42%",
    cell: ({ row, readOnly, update }) =>
      readOnly ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/30 p-2 font-mono text-[9px] leading-4">
          {row.content}
        </pre>
      ) : (
        <textarea
          value={row.content}
          aria-label="Script content"
          rows={12}
          spellCheck={false}
          className="w-full resize-y rounded border bg-background p-2 font-mono text-[9px] leading-4 outline-none focus:border-ring"
          onChange={(event) => update({ ...row, content: event.currentTarget.value })}
        />
      ),
  },
  {
    id: "truth",
    header: "Execution / evidence",
    width: "18%",
    cell: ({ row }) => <ExecutionTruth script={row} />,
  },
];

export function ScriptStage(props: ScriptStageProps) {
  const plan = props.snapshot.scriptPlan;
  if (!plan) return <EmptyScripts />;
  if (props.selectedTab === "coverage") return <ScriptCoverage snapshot={props.snapshot} />;
  if (props.selectedTab === "review") return <ScriptReview {...props} />;
  return (
    <div className="grid gap-3">
      <section className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <Code2 className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Automation scripts</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Revision {plan.revision} · {plan.scripts.length} scripts
          </p>
        </div>
        <Status value={plan.generationStatus} />
        <Status value={plan.reviewStatus} />
      </section>
      <WorkbookGrid
        ariaLabel="Release script workbook"
        rows={plan.scripts}
        columns={SCRIPT_COLUMNS}
        getRowId={(row) => row.id}
        readOnly={props.readOnly}
        onSave={props.onSaveScripts}
        emptyState="The release agent has not produced scripts yet."
      />
    </div>
  );
}

function EmptyScripts() {
  return (
    <section className="rounded-xl border bg-card px-5 py-10 text-center shadow-sm">
      <Code2 className="mx-auto size-5 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">Scripts not generated yet</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        A maker can select Generate above. Generated scripts, real execution state, and persisted
        evidence will appear here.
      </p>
    </section>
  );
}

function ExecutionTruth({ script }: { readonly script: QaScript }) {
  return (
    <div className="grid gap-2">
      <Status value={script.status} />
      <Status value={script.executionStatus} />
      <p className="text-[9px] text-muted-foreground">
        {script.lastRunAt ? `Last run ${new Date(script.lastRunAt).toLocaleString()}` : "Never run"}
      </p>
      {script.evidence.map((evidence) => (
        <div key={evidence.id} className="rounded border bg-muted/20 p-2">
          <p className="text-[9px] font-medium capitalize">{evidence.kind}</p>
          <p className="mt-0.5 text-[9px] leading-3 text-muted-foreground">{evidence.summary}</p>
          <p className="mt-1 break-all font-mono text-[8px] text-muted-foreground">
            {evidence.artifactPath}
          </p>
        </div>
      ))}
      {!script.evidence.length ? (
        <p className="text-[9px] text-muted-foreground">No persisted evidence</p>
      ) : null}
    </div>
  );
}

function ScriptCoverage({ snapshot }: { readonly snapshot: QaReleaseSnapshot }) {
  const plan = snapshot.scriptPlan;
  if (!plan) return null;
  const coverage = scriptCoverage(snapshot, plan.scripts);
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <CoverageCard label="Approved test cases" value={coverage.approvedTestCases} />
        <CoverageCard label="Approved requirements" value={coverage.approvedRequirements} />
      </div>
      <GapList label="Unscripted test cases" ids={coverage.approvedTestCases.gapIds} />
      <GapList label="Unlinked requirements" ids={coverage.approvedRequirements.gapIds} />
    </div>
  );
}

function CoverageCard(props: {
  readonly label: string;
  readonly value: { readonly total: number; readonly covered: number; readonly percent: number };
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium">{props.label}</p>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-[10px] text-muted-foreground">
          {props.value.covered}/{props.value.total}
        </span>
        <span className="text-lg font-semibold">{props.value.percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${props.value.percent}%` }}
        />
      </div>
    </section>
  );
}

function GapList({ label, ids }: { readonly label: string; readonly ids: readonly string[] }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <h3 className="border-b px-4 py-3 text-sm font-medium">{label}</h3>
      {ids.length ? (
        ids.map((id) => (
          <p key={id} className="border-b px-4 py-2 font-mono text-[10px] last:border-b-0">
            {id}
          </p>
        ))
      ) : (
        <p className="flex items-center justify-center gap-2 px-4 py-7 text-xs text-emerald-600">
          <CheckCircle2 className="size-4" />
          No gaps
        </p>
      )}
    </section>
  );
}

function ScriptReview(props: ScriptStageProps) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const plan = props.snapshot.scriptPlan;
  if (!plan) return null;
  return (
    <div className="grid gap-3">
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <h3 className="border-b px-4 py-3 text-sm font-medium">Script review set</h3>
        {plan.scripts.map((script) => (
          <div
            key={script.id}
            className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <FileCheck2 className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{script.title}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {script.framework} · {script.fileName} · {script.evidence.length} evidence items
              </p>
            </div>
            <Status value={script.executionStatus} />
          </div>
        ))}
      </section>
      <ApprovalPanel
        title="Script-plan approval"
        description="Approval freezes script edits and advances the persisted release to Readiness."
        reviewStatus={plan.reviewStatus}
        rejectionNote={plan.rejectionNote}
        readOnly={props.readOnly}
        busy={props.busy}
        confirming={confirming}
        note={note}
        onNote={setNote}
        onConfirming={setConfirming}
        onSubmit={props.onSubmit}
        onReview={props.onReview}
      />
    </div>
  );
}

function ApprovalPanel(props: {
  readonly title: string;
  readonly description: string;
  readonly reviewStatus: string;
  readonly rejectionNote: string | null;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly confirming: boolean;
  readonly note: string;
  readonly onNote: (note: string) => void;
  readonly onConfirming: (value: boolean) => void;
  readonly onSubmit: () => Promise<boolean>;
  readonly onReview: (decision: "approved" | "rejected", note?: string) => Promise<boolean>;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-4 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-sm font-medium">{props.title}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{props.description}</p>
        </div>
        <Status value={props.reviewStatus} />
      </div>
      {props.rejectionNote ? (
        <p className="mt-3 rounded border border-destructive/20 bg-destructive/5 p-2 text-[10px] text-destructive">
          {props.rejectionNote}
        </p>
      ) : null}
      {!props.readOnly && props.reviewStatus === "draft" ? (
        <div className="mt-4 flex justify-end">
          <Button size="sm" disabled={props.busy} onClick={() => void props.onSubmit()}>
            {props.busy ? <LoaderCircle className="animate-spin" /> : <Send />}Submit scripts
          </Button>
        </div>
      ) : null}
      {!props.readOnly && props.reviewStatus === "pending_review" ? (
        props.confirming ? (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-xs font-medium">Confirm script-plan approval?</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              This action advances the release to Readiness.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="xs" variant="ghost" onClick={() => props.onConfirming(false)}>
                Cancel
              </Button>
              <Button
                size="xs"
                disabled={props.busy}
                onClick={() => void props.onReview("approved")}
              >
                <Check />
                Confirm approval
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-2 border-t pt-4">
            <textarea
              value={props.note}
              aria-label="Script-plan rejection note"
              placeholder="Reason required when requesting changes"
              rows={2}
              className="w-full rounded border bg-background p-2 text-xs"
              onChange={(event) => props.onNote(event.currentTarget.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={props.busy || !props.note.trim()}
                onClick={() => void props.onReview("rejected", props.note.trim())}
              >
                <X />
                Request changes
              </Button>
              <Button size="xs" disabled={props.busy} onClick={() => props.onConfirming(true)}>
                <Check />
                Approve scripts
              </Button>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}

function EditableInput(props: {
  readonly label: string;
  readonly value: string;
  readonly readOnly: boolean;
  readonly mono?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const className = props.mono ? "font-mono" : "";
  if (props.readOnly) return <p className={`text-[10px] ${className}`}>{props.value}</p>;
  return (
    <input
      value={props.value}
      aria-label={props.label}
      className={`w-full rounded border bg-background px-1.5 py-1 text-[10px] outline-none focus:border-ring ${className}`}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    />
  );
}

function values(value: string): readonly string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function Status({ value }: { readonly value: string }) {
  return (
    <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[9px] font-medium capitalize text-muted-foreground">
      {value.replaceAll("_", " ")}
    </span>
  );
}
