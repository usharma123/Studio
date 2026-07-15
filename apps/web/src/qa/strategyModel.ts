import type { QaReleaseSnapshot } from "@t3tools/contracts";

export interface StrategySectionView {
  readonly id: string;
  readonly title: string;
  readonly position: number;
  readonly content: string;
  readonly sourceRequirementIds: readonly string[];
  readonly updatedAt: string | null;
}

export interface StrategyCommentView {
  readonly id: string;
  readonly sectionId: string | null;
  readonly parentCommentId: string | null;
  readonly body: string;
  readonly quote: string | null;
  readonly author: string;
  readonly createdAt: string | null;
  readonly resolved: boolean;
}

export interface StrategyCoverageView {
  readonly totalRequirements: number;
  readonly coveredRequirements: number;
  readonly percent: number;
  readonly uncoveredRequirementIds: readonly string[];
}

export interface StrategyDocumentView {
  readonly revision: number;
  readonly generationStatus: string;
  readonly reviewStatus: string;
  readonly sections: readonly StrategySectionView[];
  readonly comments: readonly StrategyCommentView[];
  readonly coverage: StrategyCoverageView;
  readonly updatedAt: string | null;
  readonly approvedAt: string | null;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function strategyDocumentView(snapshot: QaReleaseSnapshot): StrategyDocumentView | null {
  const strategy = record(
    (snapshot as QaReleaseSnapshot & { readonly strategy?: unknown }).strategy,
  );
  if (!strategy) return null;
  const sections = Array.isArray(strategy.sections)
    ? strategy.sections
        .flatMap<StrategySectionView>((value, index) => {
          const section = record(value);
          if (!section || typeof section.id !== "string") return [];
          return [
            {
              id: section.id,
              title: typeof section.title === "string" ? section.title : `Section ${index + 1}`,
              position: finiteNumber(section.order, index),
              content: typeof section.content === "string" ? section.content : "",
              sourceRequirementIds: strings(section.sourceRequirementIds),
              updatedAt: typeof section.updatedAt === "string" ? section.updatedAt : null,
            },
          ];
        })
        .sort((left, right) => left.position - right.position)
    : [];
  const comments = Array.isArray(strategy.comments)
    ? strategy.comments.flatMap((value) => strategyCommentViews(value, null))
    : [];
  const coverage = record(strategy.coverage);
  return {
    revision: finiteNumber(strategy.revision, snapshot.revision),
    generationStatus:
      typeof strategy.generationStatus === "string" ? strategy.generationStatus : "draft",
    reviewStatus: typeof strategy.reviewStatus === "string" ? strategy.reviewStatus : "draft",
    sections,
    comments,
    coverage: {
      totalRequirements: finiteNumber(coverage?.totalRequirements),
      coveredRequirements: finiteNumber(coverage?.coveredRequirements),
      percent: Math.max(0, Math.min(100, finiteNumber(coverage?.percent))),
      uncoveredRequirementIds: strings(coverage?.uncoveredRequirementIds),
    },
    updatedAt: typeof strategy.updatedAt === "string" ? strategy.updatedAt : null,
    approvedAt: typeof strategy.approvedAt === "string" ? strategy.approvedAt : null,
  };
}

function strategyCommentViews(
  value: unknown,
  parentCommentId: string | null,
): readonly StrategyCommentView[] {
  const comment = record(value);
  if (!comment || typeof comment.id !== "string" || typeof comment.body !== "string") return [];
  const commentId = comment.id;
  const root: StrategyCommentView = {
    id: commentId,
    sectionId: typeof comment.sectionId === "string" ? comment.sectionId : null,
    parentCommentId,
    body: comment.body,
    quote: typeof comment.quote === "string" ? comment.quote : null,
    author: typeof comment.author === "string" ? comment.author : "Reviewer",
    createdAt: typeof comment.createdAt === "string" ? comment.createdAt : null,
    resolved: comment.status === "resolved" || typeof comment.resolvedAt === "string",
  };
  const replies = Array.isArray(comment.replies)
    ? comment.replies.flatMap((reply) => strategyCommentViews(reply, commentId))
    : [];
  return [root, ...replies];
}

export function strategyCommentThreads(comments: readonly StrategyCommentView[]): ReadonlyArray<{
  readonly comment: StrategyCommentView;
  readonly replies: readonly StrategyCommentView[];
}> {
  const repliesByParent = new Map<string, StrategyCommentView[]>();
  for (const comment of comments) {
    if (!comment.parentCommentId) continue;
    const replies = repliesByParent.get(comment.parentCommentId);
    if (replies) replies.push(comment);
    else repliesByParent.set(comment.parentCommentId, [comment]);
  }
  const threads: Array<{
    readonly comment: StrategyCommentView;
    readonly replies: readonly StrategyCommentView[];
  }> = [];
  for (const comment of comments) {
    if (!comment.parentCommentId) {
      threads.push({ comment, replies: repliesByParent.get(comment.id) ?? [] });
    }
  }
  return threads;
}
