import { inferCheckpointTurnCountByTurnId } from "../session-logic";
import type { Thread, TurnDiffSummary } from "../types";
export function useTurnDiffSummaries(activeThread: Thread | null | undefined) {
  const turnDiffSummaries = (() => {
    if (!activeThread) {
      return [];
    }
    return activeThread.checkpoints;
  })() as ReadonlyArray<TurnDiffSummary>;
  const inferredCheckpointTurnCountByTurnId = inferCheckpointTurnCountByTurnId(turnDiffSummaries);
  return {
    turnDiffSummaries,
    inferredCheckpointTurnCountByTurnId,
  };
}
