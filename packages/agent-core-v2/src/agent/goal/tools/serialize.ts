import type { GoalSnapshot, GoalToolResult } from '#/agent/goal/types';

export function goalForModel(goal: GoalSnapshot): GoalSnapshot {
  // Explicit decision dependencies need the existing Goal identity, not a guessed ID.
  return { ...goal };
}

export function goalResultForModel(
  result: GoalToolResult,
): { goal: GoalSnapshot | null } {
  return { goal: result.goal === null ? null : goalForModel(result.goal) };
}
