import type { AgentPhase, TaskItem, ToolCall, ToolStatus } from '../types';
import { parseSwarmResult, type SwarmResult } from './parseSwarmResult';
import { normalizeToolName } from './toolMeta';

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

/**
 * The status an Agent tool card shows, derived from the LIVE task when one is
 * linked to the call, falling back to the message-derived tool status.
 *
 * Live wins over the transcript: a still-running subagent keeps its card in a
 * real running/queued/suspended state even when the message side has no result
 * yet ('running') or was settled to 'unknown' after the main turn went idle
 * (e.g. a background subagent outliving its turn). Terminal task states map to
 * the matching card status; a genuine tool-result error stays 'error' even when
 * the task completed (the result is the authoritative terminal record).
 */
export function agentCardStatus(toolStatus: ToolStatus, task: TaskItem | undefined): ToolStatus {
  if (!task) return toolStatus;
  const status = taskDisplayStatus(task);
  return status === 'ok' && toolStatus === 'error' ? 'error' : status;
}

export function phaseDisplayStatus(phase: AgentPhase): ToolStatus {
  switch (phase) {
    case 'working': return 'running';
    case 'completed': return 'ok';
    case 'failed': return 'error';
    default: return phase;
  }
}

/** Terminal task state wins over stale phase metadata. Unfinished does not
 *  necessarily mean executing: queued/suspended tasks remain cancellable. */
export function taskDisplayStatus(task: Pick<TaskItem, 'state' | 'phase'>): ToolStatus {
  if (task.state === 'done') return 'ok';
  if (task.state === 'fail') return 'error';
  if (task.state === 'cancelled') return 'cancelled';
  return phaseDisplayStatus(task.phase ?? 'working');
}

export function isTaskRunning(task: TaskItem): boolean {
  return taskDisplayStatus(task) === 'running';
}

export function isTaskCancellable(task: TaskItem): boolean {
  const status = taskDisplayStatus(task);
  return status === 'running' || status === 'queued' || status === 'suspended';
}

/** Active work takes precedence; otherwise preserve an incomplete or adverse
 *  outcome instead of reporting success for the entire group. */
export function aggregateToolStatus(statuses: readonly ToolStatus[]): ToolStatus {
  const priority: readonly ToolStatus[] = ['running', 'suspended', 'queued', 'error', 'cancelled', 'unknown'];
  return priority.find((status) => statuses.includes(status)) ?? 'ok';
}

export function swarmCardStatus(
  toolStatus: ToolStatus,
  members: readonly { phase: AgentPhase }[],
  result: SwarmResult | null,
): ToolStatus {
  const live = members.map((member) => phaseDisplayStatus(member.phase));
  const status = aggregateToolStatus(live);
  // A transcript error is not proof that a linked agent has stopped.
  if (live.length > 0 && (status === 'running' || status === 'queued' || status === 'suspended')) return status;
  // Visible tasks may cover only an early batch. Their terminal states do not
  // prove the entire swarm finished while its result is still missing.
  if (!result && (toolStatus === 'running' || toolStatus === 'unknown' || toolStatus === 'queued' || toolStatus === 'suspended')) return toolStatus;
  const outcomes = [...live];
  if (result) {
    if (result.failed > 0) outcomes.push('error');
    if (result.aborted > 0) outcomes.push('cancelled');
    if (result.completed > 0) outcomes.push('ok');
  }
  if (toolStatus === 'error' || toolStatus === 'cancelled') outcomes.push(toolStatus);
  return outcomes.length > 0 ? aggregateToolStatus(outcomes) : toolStatus;
}

/** Shared by tool groups and progress routing; cards use the same Agent/Swarm
 *  resolvers directly. Only exact task links may override transcript status. */
export function effectiveToolStatus(
  tool: ToolCall,
  resolveAgent?: (toolCallId: string) => TaskItem | undefined,
  resolveSwarm?: (toolCallId: string) => readonly { phase: AgentPhase }[] | undefined,
): ToolStatus {
  const name = normalizeToolName(tool.name);
  if (name === 'task') return agentCardStatus(tool.status, resolveAgent?.(tool.id));
  if (name === 'agentswarm') return swarmCardStatus(tool.status, resolveSwarm?.(tool.id) ?? [], parseSwarmResult(tool.output));
  return tool.status;
}
