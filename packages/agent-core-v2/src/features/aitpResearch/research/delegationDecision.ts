/**
 * `aitpResearch` domain — explicit decision dependencies for delegated work.
 *
 * Reads existing Goal dependency declarations without inferring scientific
 * relationships from a Line, prompt or task label. No decision is resolved here.
 */

export function researchDelegationBlocker(
  gate: { readonly resolvedAt?: unknown; readonly dependentGoalIds?: readonly string[] } | null,
  taskGoals: readonly string[] | undefined,
): string | undefined {
  if (gate === null || gate.resolvedAt !== undefined || taskGoals?.length === 0) return undefined;
  if (taskGoals === undefined) {
    return 'A human decision is pending and this task dependency is unknown. Declare goal_dependencies for this new task, or [] only for genuinely independent work; do not answer the decision yourself.';
  }
  if (gate.dependentGoalIds === undefined || gate.dependentGoalIds.length === 0) {
    return 'A human decision has unknown Goal dependencies. Keep dependent work waiting; do not infer a resolution from the selected Line.';
  }
  return taskGoals.some(id => gate.dependentGoalIds!.includes(id))
    ? 'This task explicitly depends on a Goal awaiting a human decision. Independent work and existing running tasks are unaffected.'
    : undefined;
}
