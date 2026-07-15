import type { OrchestrationEvent, ThreadId } from "@t3tools/contracts";

export interface OrchestrationBatchEffects {
  promoteDraftThreadIds: ThreadId[];
  clearDeletedThreadIds: ThreadId[];
  removeTerminalUiStateThreadIds: ThreadId[];
  needsProviderInvalidation: boolean;
}

export function deriveOrchestrationBatchEffects(
  events: readonly OrchestrationEvent[],
): OrchestrationBatchEffects {
  const threadLifecycleEffects = new Map<
    ThreadId,
    {
      clearPromotedDraft: boolean;
      clearDeletedThread: boolean;
      removeTerminalUiState: boolean;
    }
  >();
  let needsProviderInvalidation = false;

  for (const event of events) {
    switch (event.type) {
      case "thread.turn-diff-completed":
      case "thread.reverted": {
        needsProviderInvalidation = true;
        break;
      }

      case "thread.created": {
        const { threadId } = event.payload;
        threadLifecycleEffects.set(threadId, {
          clearPromotedDraft: true,
          clearDeletedThread: false,
          removeTerminalUiState: false,
        });
        break;
      }

      case "thread.deleted": {
        const { threadId } = event.payload;
        threadLifecycleEffects.set(threadId, {
          clearPromotedDraft: false,
          clearDeletedThread: true,
          removeTerminalUiState: true,
        });
        break;
      }

      case "thread.archived": {
        const { threadId } = event.payload;
        threadLifecycleEffects.set(threadId, {
          clearPromotedDraft: false,
          clearDeletedThread: false,
          removeTerminalUiState: true,
        });
        break;
      }

      case "thread.unarchived": {
        const { threadId } = event.payload;
        threadLifecycleEffects.set(threadId, {
          clearPromotedDraft: false,
          clearDeletedThread: false,
          removeTerminalUiState: false,
        });
        break;
      }

      default: {
        break;
      }
    }
  }

  const promoteDraftThreadIds: ThreadId[] = [];
  const clearDeletedThreadIds: ThreadId[] = [];
  const removeTerminalUiStateThreadIds: ThreadId[] = [];
  for (const [threadId, effect] of threadLifecycleEffects) {
    if (effect.clearPromotedDraft) {
      promoteDraftThreadIds.push(threadId);
    }
    if (effect.clearDeletedThread) {
      clearDeletedThreadIds.push(threadId);
    }
    if (effect.removeTerminalUiState) {
      removeTerminalUiStateThreadIds.push(threadId);
    }
  }

  return {
    promoteDraftThreadIds,
    clearDeletedThreadIds,
    removeTerminalUiStateThreadIds,
    needsProviderInvalidation,
  };
}
