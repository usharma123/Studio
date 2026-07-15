import type {
  QaReviewAnchor,
  QaReviewAiRun,
  QaReviewSeverity,
  QaReviewThread,
} from "@t3tools/contracts";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  Reply,
  Send,
} from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { reviewThreadRequiresOverride } from "./reviewThreadUi";

export interface QaReviewThreadActions {
  readonly add: (
    anchor: QaReviewAnchor,
    severity: QaReviewSeverity,
    body: string,
  ) => Promise<boolean>;
  readonly reply: (reviewThreadId: string, body: string) => Promise<boolean>;
  readonly runAi: (reviewThreadId: string) => Promise<boolean>;
  readonly resolve: (reviewThreadId: string, overrideReason?: string) => Promise<boolean>;
}

export interface QaReviewThreadPermissions {
  readonly createComment: boolean;
  readonly reply: boolean;
  readonly runAi: boolean;
  readonly resolve: boolean;
}

interface AnchoredReviewThreadsProps {
  readonly anchor: QaReviewAnchor;
  readonly threads: readonly QaReviewThread[];
  readonly permissions: QaReviewThreadPermissions;
  readonly busy: boolean;
  readonly actions: QaReviewThreadActions;
  readonly onJumpToAnchor: (anchor: QaReviewAnchor) => void;
}

export function AnchoredReviewThreads(props: AnchoredReviewThreadsProps) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1 text-left text-xs font-medium hover:text-primary"
          onClick={() => props.onJumpToAnchor(props.anchor)}
        >
          <span className="truncate">{props.anchor.label}</span>
          <ExternalLink className="size-3 shrink-0" />
        </button>
        {props.threads.some((thread) => thread.status === "open") ? (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {props.threads.filter((thread) => thread.status === "open").length} open
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid gap-2">
        {props.threads.map((thread) => (
          <ReviewThreadCard
            key={thread.id}
            thread={thread}
            permissions={props.permissions}
            busy={props.busy}
            actions={props.actions}
          />
        ))}
        {props.permissions.createComment ? (
          <NewReviewComment anchor={props.anchor} busy={props.busy} onAdd={props.actions.add} />
        ) : null}
      </div>
    </div>
  );
}

function ReviewThreadCard(props: {
  readonly thread: QaReviewThread;
  readonly permissions: QaReviewThreadPermissions;
  readonly busy: boolean;
  readonly actions: QaReviewThreadActions;
}) {
  const { thread } = props;
  const aiRun = thread.latestAiRun;
  const requiresOverride = reviewThreadRequiresOverride(thread);
  const aiRunning = aiRun?.status === "queued" || aiRun?.status === "running";
  const canShowDirectResolve =
    aiRun?.status === "completed" && aiRun.result?.verdict === "agrees" && !aiRun.stale;
  const [overrideReason, setOverrideReason] = useState("");
  return (
    <article
      className={cn(
        "border-l-2 border-border py-2 pl-3",
        thread.severity === "blocking" && "border-l-amber-500/60",
        thread.status === "resolved" && "opacity-65",
      )}
    >
      <div className="flex items-center gap-2">
        <SeverityPill severity={thread.severity} />
        {thread.unreadCount > 0 ? (
          <span className="text-[9px] font-medium text-primary">{thread.unreadCount} new</span>
        ) : null}
        <span className="ml-auto text-[9px] capitalize text-muted-foreground">{thread.status}</span>
      </div>

      <div className="mt-2 grid gap-2">
        {thread.entries.map((entry, index) => (
          <div key={entry.id} className={cn(index > 0 && "ml-4 border-l pl-3")}>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
              <span className="font-medium text-foreground">{entry.author.displayName}</span>
              <span>{entry.author.role === "qa:maker" ? "Maker" : "Approver"}</span>
              {entry.kind === "correction" ? <span>Correction</span> : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-4">{entry.body}</p>
          </div>
        ))}
      </div>

      {aiRun ? <AiReviewEvidence run={aiRun} /> : null}
      {thread.resolutionOverrideReason ? (
        <p className="mt-2 border-l-2 border-amber-500/40 pl-2 text-[10px] text-muted-foreground">
          Approver override: {thread.resolutionOverrideReason}
        </p>
      ) : null}

      {thread.status === "open" && props.permissions.reply ? (
        <div className="mt-3 border-t pt-2">
          <CommentComposer
            compact
            placeholder="Reply when addressed"
            disabled={props.busy}
            onSend={(body) => props.actions.reply(thread.id, body)}
          />
        </div>
      ) : null}

      {thread.status === "open" && (props.permissions.runAi || props.permissions.resolve) ? (
        <div className="mt-3 grid gap-2 border-t pt-2">
          <div className="flex justify-end gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={props.busy || !props.permissions.runAi || !thread.canRunAiReview}
              title={
                aiRunning
                  ? "The AI review is running in the background"
                  : thread.canRunAiReview
                    ? "Adversarially compare this comment with the source chain"
                    : "The maker must reply before AI review can run"
              }
              onClick={() => void props.actions.runAi(thread.id)}
            >
              {aiRunning ? <LoaderCircle className="animate-spin" /> : <Bot />}
              {aiRun?.stale ? "Run again" : "Run AI review"}
            </Button>
            {canShowDirectResolve ? (
              <Button
                size="xs"
                disabled={props.busy || !props.permissions.resolve || !thread.canResolve}
                onClick={() => void props.actions.resolve(thread.id)}
              >
                <CheckCircle2 /> Resolve
              </Button>
            ) : null}
          </div>
          {requiresOverride ? (
            <div className="grid gap-2 border-l-2 border-amber-500/40 bg-amber-500/5 py-2 pl-2.5 pr-2">
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                The AI did not agree. You still have the final say; record why you are overriding
                it.
              </p>
              <textarea
                value={overrideReason}
                rows={2}
                aria-label="AI review override reason"
                placeholder="Override reason"
                className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-[11px] outline-none focus:border-ring"
                onChange={(event) => setOverrideReason(event.currentTarget.value)}
              />
              <Button
                className="justify-self-end"
                size="xs"
                disabled={
                  props.busy ||
                  !props.permissions.resolve ||
                  !thread.canResolve ||
                  !overrideReason.trim()
                }
                onClick={() => void props.actions.resolve(thread.id, overrideReason.trim())}
              >
                <CheckCircle2 /> Resolve with override
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function AiReviewEvidence({ run }: { readonly run: QaReviewAiRun }) {
  const result = run.result;
  return (
    <div className="mt-3 border-l-2 bg-muted/15 py-2 pl-2.5 pr-2">
      <div className="flex items-center gap-2 text-[10px]">
        <Bot className="size-3.5 text-muted-foreground" />
        <span className="font-medium">AI review</span>
        <span className="capitalize text-muted-foreground">{result?.verdict ?? run.status}</span>
        {run.model ? <span className="text-muted-foreground">· {run.model}</span> : null}
        {run.stale ? (
          <span className="ml-auto font-medium text-amber-600 dark:text-amber-400">Stale</span>
        ) : null}
      </div>
      {result ? (
        <>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{result.rationale}</p>
          {result.citations.length > 0 ? (
            <div className="mt-2 grid gap-1">
              {result.citations.map(({ citation, relationship, explanation }) => (
                <div
                  key={`${citation.documentId}:${citation.section}:${relationship}:${explanation}`}
                  className="border-l pl-2"
                >
                  <p className="text-[9px] font-medium">
                    {citation.documentName ?? citation.documentId} · {citation.section}
                    {citation.location ? ` · ${citation.location}` : ""}
                  </p>
                  <p className="mt-0.5 text-[9px] capitalize text-muted-foreground">
                    {relationship} · {explanation}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : run.failureMessage ? (
        <p className="mt-1.5 text-[10px] text-destructive">{run.failureMessage}</p>
      ) : (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          The check is running in the background.
        </p>
      )}
    </div>
  );
}

function SeverityPill({ severity }: { readonly severity: QaReviewSeverity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium capitalize",
        severity === "blocking"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "text-muted-foreground",
      )}
    >
      {severity === "blocking" ? (
        <AlertTriangle className="size-2.5" />
      ) : (
        <MessageSquare className="size-2.5" />
      )}
      {severity}
    </span>
  );
}

function NewReviewComment(props: {
  readonly anchor: QaReviewAnchor;
  readonly busy: boolean;
  readonly onAdd: (
    anchor: QaReviewAnchor,
    severity: QaReviewSeverity,
    body: string,
  ) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<QaReviewSeverity>("blocking");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        size="xs"
        variant="ghost"
        className="justify-self-start"
        onClick={() => setOpen(true)}
      >
        <MessageSquare /> Comment
      </Button>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="flex items-end gap-2">
        <select
          value={severity}
          aria-label="Comment severity"
          className="h-8 rounded-md border bg-background px-2 text-[10px] outline-none focus:border-ring"
          onChange={(event) => setSeverity(event.currentTarget.value as QaReviewSeverity)}
        >
          <option value="blocking">Blocking</option>
          <option value="advisory">Advisory</option>
        </select>
        <textarea
          value={body}
          rows={2}
          placeholder="Add an anchored comment"
          aria-label="Add an anchored comment"
          className="min-h-8 flex-1 resize-y rounded-md border bg-background px-2 py-1.5 text-[11px] outline-none focus:border-ring"
          onChange={(event) => setBody(event.currentTarget.value)}
        />
        <Button
          size="icon-xs"
          variant="outline"
          disabled={props.busy || !body.trim()}
          aria-label="Send anchored comment"
          onClick={() => {
            void props.onAdd(props.anchor, severity, body.trim()).then((saved) => {
              if (saved) {
                setBody("");
                setOpen(false);
              }
            });
          }}
        >
          <Send />
        </Button>
      </div>
      <button
        type="button"
        className="justify-self-start text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(false)}
      >
        Cancel
      </button>
    </div>
  );
}

function CommentComposer(props: {
  readonly placeholder: string;
  readonly compact?: boolean;
  readonly disabled: boolean;
  readonly onSend: (body: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  return (
    <div className="flex items-end gap-2">
      <textarea
        value={body}
        rows={props.compact ? 1 : 2}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        className="min-h-8 flex-1 resize-y rounded-md border bg-background px-2 py-1.5 text-[11px] outline-none focus:border-ring"
        onChange={(event) => setBody(event.currentTarget.value)}
      />
      <Button
        size="icon-xs"
        variant="outline"
        disabled={props.disabled || !body.trim()}
        aria-label={`Send ${props.placeholder.toLowerCase()}`}
        onClick={() => {
          void props.onSend(body.trim()).then((saved) => {
            if (saved) setBody("");
          });
        }}
      >
        {props.compact ? <Reply /> : <Send />}
      </Button>
    </div>
  );
}
