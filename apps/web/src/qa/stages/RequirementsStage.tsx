import type { QaReleaseSnapshot, QaRequirement } from "@t3tools/contracts";
import { AlertTriangle, Check, FileText, ShieldCheck, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { canReviewApprovalGates } from "../model";
import {
  businessRequirements,
  buildRequirementWorkbookRows,
  requirementConfidence,
  requirementExternalId,
  requirementReviewRequired,
  requirementTags,
  requirementType,
  type RequirementWorkbookRow,
} from "../requirementsModel";
import type { QaStageTabId } from "../stageRouting";
import { QaTraceabilityGraph } from "../QaTraceabilityGraph";
import { WorkbookGrid, type WorkbookColumn } from "../WorkbookGrid";

interface RequirementsStageProps {
  readonly snapshot: QaReleaseSnapshot;
  readonly selectedTab: QaStageTabId;
  readonly readOnly: boolean;
  readonly reviewing: boolean;
  readonly onReview: (
    targetType: "requirement" | "gate",
    targetId: string,
    decision: "approved" | "rejected",
  ) => Promise<void> | void;
}

const REQUIREMENT_COLUMNS: readonly WorkbookColumn<RequirementWorkbookRow>[] = [
  {
    id: "id",
    header: "ID / Type",
    width: "15%",
    cell: ({ row }) => (
      <div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold">
          {requirementType(row.requirement)}
        </span>
        <p className="mt-1.5 break-all font-mono text-[10px] text-foreground">
          {requirementExternalId(row.requirement)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {requirementTags(row.requirement)
            .slice(0, 2)
            .map((tag) => (
              <span
                key={tag}
                className="rounded border px-1 py-0.5 text-[8px] text-muted-foreground"
              >
                {tag.replace(/^[^:]+:/, "")}
              </span>
            ))}
        </div>
      </div>
    ),
  },
  {
    id: "requirement",
    header: "Requirement",
    width: "50%",
    cell: ({ row }) => (
      <div>
        <p className="font-medium leading-5">{row.requirement.title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {row.requirement.description}
        </p>
      </div>
    ),
  },
  {
    id: "functional-requirements",
    header: "Functional requirements",
    width: "23%",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.linkedFunctionalRequirementIds.length ? (
          row.linkedFunctionalRequirementIds.map((id) => (
            <span
              key={id}
              className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-[9px] text-foreground"
            >
              {id}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-muted-foreground">
            No linked functional requirements
          </span>
        )}
      </div>
    ),
  },
  {
    id: "review",
    header: "Review",
    width: "12%",
    cell: ({ row }) => (
      <div className="grid justify-items-start gap-1.5">
        <StatusPill status={row.requirement.status} />
        {requirementConfidence(row.requirement) !== null ? (
          <span className="text-[9px] text-muted-foreground">
            {Math.round(requirementConfidence(row.requirement)! * 100)}% confidence
          </span>
        ) : null}
        {requirementReviewRequired(row.requirement) ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3" />
            Review required
          </span>
        ) : null}
      </div>
    ),
  },
];

export function RequirementsStage(props: RequirementsStageProps) {
  if (props.selectedTab === "graph") return <QaTraceabilityGraph snapshot={props.snapshot} />;
  if (props.selectedTab === "approvals") return <RequirementsApprovals {...props} />;
  const rows = buildRequirementWorkbookRows(props.snapshot.requirements);
  return (
    <WorkbookGrid
      ariaLabel="Release requirements"
      rows={rows}
      columns={REQUIREMENT_COLUMNS}
      getRowId={(row) => row.id}
      readOnly
      emptyState="Requirements appear here after document ingestion."
    />
  );
}

function StatusPill({ status }: { readonly status: QaRequirement["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
        status === "approved" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        status === "rejected" && "border-destructive/30 bg-destructive/10 text-destructive",
        status === "pending" && "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function RequirementsApprovals(props: RequirementsStageProps) {
  const requirements = businessRequirements(props.snapshot.requirements);
  return (
    <div className="grid gap-3">
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <FileText className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Requirement decisions</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {requirements.filter((item) => item.status === "approved").length}/{requirements.length}{" "}
            approved
          </span>
        </div>
        {requirements.map((requirement) => (
          <div
            key={requirement.id}
            className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{requirement.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                {requirement.description}
              </p>
            </div>
            <StatusPill status={requirement.status} />
            {requirement.status === "pending" ? (
              <ReviewButtons
                disabled={props.readOnly || props.reviewing}
                onReview={(decision) => props.onReview("requirement", requirement.id, decision)}
              />
            ) : null}
          </div>
        ))}
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Approval gates</h3>
        </div>
        {props.snapshot.approvalGates.map((gate) => (
          <div key={gate.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/20">
              <ShieldCheck className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{gate.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{gate.description}</p>
            </div>
            <span className="capitalize text-[10px] text-muted-foreground">{gate.status}</span>
            {gate.status === "pending" ? (
              <ReviewButtons
                disabled={
                  props.readOnly || props.reviewing || !canReviewApprovalGates(props.snapshot)
                }
                onReview={(decision) => props.onReview("gate", gate.id, decision)}
              />
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}

function ReviewButtons(props: {
  readonly disabled: boolean;
  readonly onReview: (decision: "approved" | "rejected") => Promise<void> | void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={props.disabled}
        aria-label="Reject"
        onClick={() => void props.onReview("rejected")}
      >
        <X className="text-destructive" />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={props.disabled}
        aria-label="Approve"
        onClick={() => void props.onReview("approved")}
      >
        <Check className="text-emerald-500" />
      </Button>
    </div>
  );
}
