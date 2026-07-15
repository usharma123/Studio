import type { QaReleaseSnapshot, QaReviewThread } from "@t3tools/contracts";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Save,
  Send,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";

import {
  strategyDocumentView,
  type StrategyDocumentView,
  type StrategySectionView,
} from "../strategyModel";
import type { QaStageTabId } from "../stageRouting";
import {
  AnchoredReviewThreads,
  type QaReviewThreadActions,
  type QaReviewThreadPermissions,
} from "../AnchoredReviewThreads";
import { openBlockingReviewThreadIds } from "../reviewThreadUi";

interface StrategyStageProps {
  readonly snapshot: QaReleaseSnapshot;
  readonly selectedTab: QaStageTabId;
  readonly artifactReadOnly: boolean;
  readonly canSubmit: boolean;
  readonly canReview: boolean;
  readonly reviewThreads: readonly QaReviewThread[];
  readonly reviewActions: QaReviewThreadActions;
  readonly reviewPermissions: QaReviewThreadPermissions;
  readonly busy: boolean;
  readonly onSaveSection: (sectionId: string, content: string) => Promise<boolean>;
  readonly onSubmit: () => Promise<boolean>;
  readonly onReview: (
    decision: "approved" | "changes_requested",
    summary?: string,
    blockingCommentIds?: readonly string[],
  ) => Promise<boolean>;
  readonly onJumpToSection: (sectionId: string) => void;
}

export function StrategyStage(props: StrategyStageProps) {
  const strategy = strategyDocumentView(props.snapshot);
  if (!strategy) return <EmptyStrategy />;
  if (props.selectedTab === "coverage") {
    return <StrategyCoverage snapshot={props.snapshot} strategy={strategy} />;
  }
  if (props.selectedTab === "review") {
    return <StrategyReview {...props} strategy={strategy} />;
  }
  return <StrategyDocument {...props} strategy={strategy} />;
}

function EmptyStrategy() {
  return (
    <section className="rounded-xl border bg-card px-5 py-10 text-center shadow-sm">
      <FileText className="mx-auto size-5 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">Strategy generation is coordinated from chat</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        Keep working with the release agent. Its structured strategy will appear here as durable,
        reviewable sections.
      </p>
    </section>
  );
}

function StrategyDocument(props: StrategyStageProps & { readonly strategy: StrategyDocumentView }) {
  return (
    <div className="grid gap-3">
      <section className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <FileText className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Release test strategy</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Revision {props.strategy.revision} · {props.strategy.sections.length} sections
          </p>
        </div>
        <StatusPill value={props.strategy.generationStatus} />
        <StatusPill value={props.strategy.reviewStatus} />
      </section>
      {props.strategy.sections.map((section) => (
        <StrategySectionEditor
          key={`${section.id}:${section.updatedAt ?? "initial"}`}
          section={section}
          readOnly={props.artifactReadOnly}
          busy={props.busy}
          onSave={props.onSaveSection}
        />
      ))}
      {props.strategy.sections.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">
          The agent has not produced strategy sections yet.
        </p>
      ) : null}
    </div>
  );
}

function StrategySectionEditor(props: {
  readonly section: StrategySectionView;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly onSave: (sectionId: string, content: string) => Promise<boolean>;
}) {
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const content = draftContent ?? props.section.content;
  const changed = draftContent !== null && draftContent !== props.section.content;
  return (
    <section
      data-qa-strategy-section-id={props.section.id}
      className="scroll-mt-4 overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="flex items-center gap-2 border-b bg-muted/10 px-4 py-2.5">
        <span className="flex size-5 items-center justify-center rounded bg-muted text-[9px] font-semibold">
          {props.section.position + 1}
        </span>
        <h4 className="text-xs font-medium">{props.section.title}</h4>
        <span className="ml-auto text-[9px] text-muted-foreground">
          {props.section.sourceRequirementIds.length} linked requirements
        </span>
      </div>
      {props.readOnly ? (
        <div className="whitespace-pre-wrap px-4 py-3 text-xs leading-5">{content}</div>
      ) : (
        <>
          <textarea
            value={content}
            aria-label={`${props.section.title} content`}
            rows={Math.max(5, Math.min(14, content.split("\n").length + 2))}
            className="block w-full resize-y border-0 bg-transparent px-4 py-3 text-xs leading-5 outline-none"
            onChange={(event) => setDraftContent(event.currentTarget.value)}
          />
          <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-2">
            <p className="text-[9px] text-muted-foreground">
              Save updates only this section and preserves the rest of the strategy.
            </p>
            <Button
              size="xs"
              variant="outline"
              disabled={!changed || props.busy}
              onClick={() => void props.onSave(props.section.id, content)}
            >
              {props.busy ? <LoaderCircle className="animate-spin" /> : <Save />}
              Save section
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function StrategyCoverage(props: {
  readonly snapshot: QaReleaseSnapshot;
  readonly strategy: StrategyDocumentView;
}) {
  const coverage = props.strategy.coverage;
  const requirementById = new Map(
    props.snapshot.requirements.map((requirement) => [requirement.id, requirement]),
  );
  return (
    <div className="grid gap-3">
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Requirement coverage</h3>
          <span className="ml-auto text-lg font-semibold tabular-nums">{coverage.percent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${coverage.percent}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Requirements" value={coverage.totalRequirements} />
          <Metric label="Covered" value={coverage.coveredRequirements} />
          <Metric label="Uncovered" value={coverage.uncoveredRequirementIds.length} />
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <AlertTriangle className="size-4 text-amber-500" />
          <h3 className="text-sm font-medium">Coverage gaps</h3>
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
            Every persisted requirement is represented in the strategy.
          </div>
        )}
      </section>
    </div>
  );
}

function StrategyReview(props: StrategyStageProps & { readonly strategy: StrategyDocumentView }) {
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [changesSummary, setChangesSummary] = useState("");
  const openBlockingIds = openBlockingReviewThreadIds(props.reviewThreads);
  return (
    <div className="grid gap-3">
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Review comments</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {props.reviewThreads.filter((thread) => thread.status === "open").length} open
          </span>
        </div>
        {props.strategy.sections.map((section) => (
          <AnchoredReviewThreads
            key={section.id}
            anchor={{
              type: "strategy_section",
              sectionId: section.id,
              label: section.title,
              quote: section.content.slice(0, 10_000) || null,
            }}
            threads={props.reviewThreads.filter(
              (thread) =>
                thread.anchor.type === "strategy_section" && thread.anchor.sectionId === section.id,
            )}
            permissions={props.reviewPermissions}
            busy={props.busy}
            actions={props.reviewActions}
            onJumpToAnchor={(anchor) => {
              if (anchor.type === "strategy_section") props.onJumpToSection(anchor.sectionId);
            }}
          />
        ))}
      </section>
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">Strategy approval</h3>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Approval closes this strategy revision and advances the release workflow.
            </p>
          </div>
          <StatusPill value={props.strategy.reviewStatus} />
        </div>
        {props.strategy.rejectionNote ? (
          <p className="mt-3 border-l-2 border-amber-500/40 bg-amber-500/5 py-2 pl-2.5 pr-2 text-[10px] text-amber-700 dark:text-amber-300">
            {props.strategy.rejectionNote}
          </p>
        ) : null}
        {props.canSubmit &&
        (props.strategy.reviewStatus === "draft" || props.strategy.reviewStatus === "rejected") ? (
          <div className="mt-4 flex justify-end">
            <Button size="sm" disabled={props.busy} onClick={() => void props.onSubmit()}>
              <Send />
              {props.strategy.reviewStatus === "rejected"
                ? "Re-submit for review"
                : "Submit for review"}
            </Button>
          </div>
        ) : null}
        {props.canReview && props.strategy.reviewStatus === "pending_review" ? (
          <div className="mt-4 border-t pt-4">
            {confirmingApproval ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs font-medium">Confirm strategy approval?</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  This advances the release and makes the completed strategy read-only.
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
                  aria-label="Strategy changes summary"
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
                    <Check /> Approve strategy
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
