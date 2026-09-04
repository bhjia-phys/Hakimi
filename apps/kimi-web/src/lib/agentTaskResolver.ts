import type { TaskItem } from '../types';

/**
 * Resolve identity metadata only from a task that is explicitly linked to this
 * Agent tool call. An unrelated unique unmapped task must never label a card.
 */
export function resolveExactAgentTask(
  tasks: readonly TaskItem[],
  toolCallId: string,
): TaskItem | undefined {
  return tasks.find(
    (task) =>
      task.kind === 'subagent' &&
      (task.id === toolCallId || task.parentToolCallId === toolCallId),
  );
}

/**
 * Resolve the detail-panel target. The legacy unique-unmapped fallback remains
 * here only so a late-subscribed task can still be opened; callers must not use
 * this result as role/model metadata for an Agent card.
 */
export function resolveAgentTaskForDetail(
  tasks: readonly TaskItem[],
  toolCallId: string,
): TaskItem | undefined {
  const exact = resolveExactAgentTask(tasks, toolCallId);
  if (exact) return exact;
  const unmapped = tasks.filter(
    (task) => task.kind === 'subagent' && !task.parentToolCallId,
  );
  return unmapped.length === 1 ? unmapped[0] : undefined;
}
