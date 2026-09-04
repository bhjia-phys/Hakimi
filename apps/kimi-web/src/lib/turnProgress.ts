import type { AppTurnProgress } from '../api/types';
import type { ChatTurn, TaskItem, ToolCall } from '../types';
import { normalizeToolName } from './toolMeta';

export const TURN_PROGRESS_REVEAL_DELAY_MS = 8_000;
export const TURN_PROGRESS_FRAME_INTERVAL_MS = 250;
export const TURN_PROGRESS_MAX_PERCENT = 90;

export const TURN_PROGRESS_TIME_BASE_PERCENT = 8;
export const TURN_PROGRESS_TIME_RANGE_PERCENT = 52;
export const TURN_PROGRESS_TIME_CONSTANT_MS = 60_000;
export const TURN_PROGRESS_STEP_INCREMENT = 4;
export const TURN_PROGRESS_TOOL_CALL_INCREMENT = 3;
export const TURN_PROGRESS_TOOL_RESULT_INCREMENT = 4;

const TURN_PROGRESS_FRAME_COUNT = 7;

export interface TurnProgressSnapshot {
  percent: number;
  visualPercent: number;
  elapsedSeconds: number;
  toolCallCount: number;
  animationFrame: number;
}

function turnTools(turn: ChatTurn): ToolCall[] {
  if (turn.blocks !== undefined) {
    return turn.blocks.flatMap((block) => (block.kind === 'tool' ? [block.tool] : []));
  }
  return turn.tools ?? [];
}

/** CLI-parity heuristic: time asymptotically contributes 8…60 points, while
 *  observed main-turn steps/tool calls/results add discrete activity points. */
export function calculateTurnProgress(
  progress: AppTurnProgress,
  elapsedMs: number,
): TurnProgressSnapshot | null {
  if (!progress.active || elapsedMs < TURN_PROGRESS_REVEAL_DELAY_MS) return null;

  const safeElapsedMs = Math.max(0, elapsedMs);
  const timePercent =
    TURN_PROGRESS_TIME_BASE_PERCENT +
    TURN_PROGRESS_TIME_RANGE_PERCENT *
      (1 - Math.exp(-safeElapsedMs / TURN_PROGRESS_TIME_CONSTANT_MS));
  const eventPercent =
    progress.stepCount * TURN_PROGRESS_STEP_INCREMENT +
    progress.toolCallIds.length * TURN_PROGRESS_TOOL_CALL_INCREMENT +
    progress.completedToolCallIds.length * TURN_PROGRESS_TOOL_RESULT_INCREMENT;
  const visualPercent = Math.min(TURN_PROGRESS_MAX_PERCENT, timePercent + eventPercent);

  return {
    percent: Math.min(TURN_PROGRESS_MAX_PERCENT, Math.round(visualPercent)),
    visualPercent,
    elapsedSeconds: Math.floor(safeElapsedMs / 1_000),
    toolCallCount: progress.toolCallIds.length,
    animationFrame:
      Math.floor(safeElapsedMs / TURN_PROGRESS_FRAME_INTERVAL_MS) %
      TURN_PROGRESS_FRAME_COUNT,
  };
}

export function formatTurnProgressElapsed(elapsedSeconds: number): string {
  const total = Math.max(0, Math.floor(elapsedSeconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/** Find the running tool card that owns the active turn's generic progress.
 *  Only the latest assistant turn in the current request segment is eligible;
 *  when a bounded snapshot no longer contains its user/cron trigger, the latest
 *  assistant turn in the loaded page is the recovery fallback. */
export function activeTurnProgressToolId(
  turns: readonly ChatTurn[],
  turnActive: boolean,
): string | null {
  if (!turnActive) return null;

  let triggerIndex = -1;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const role = turns[index]?.role;
    if (role === 'user' || role === 'cron') {
      triggerIndex = index;
      break;
    }
  }

  for (let index = turns.length - 1; index > triggerIndex; index -= 1) {
    const turn = turns[index];
    if (turn?.role !== 'assistant') continue;

    const tools = turnTools(turn);
    for (let toolIndex = tools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const tool = tools[toolIndex];
      if (tool?.status === 'running') return tool.id;
    }
    return null;
  }

  return null;
}

/** The inline AgentSwarm card owns foreground swarm progress. Hide the generic
 *  turn indicator while its tool call or one of its linked foreground tasks is
 *  still running. Linked tasks keep this stable when a compaction divider has
 *  settled the earlier tool card visually. Stop at the latest user/cron trigger
 *  so stale state from an older main turn cannot suppress a new indicator. */
export function hasActiveForegroundAgentSwarm(
  turns: readonly ChatTurn[],
  turnActive: boolean,
  tasks: readonly TaskItem[] = [],
): boolean {
  if (!turnActive) return false;

  const swarmToolIds = new Set<string>();
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.role === 'user' || turn?.role === 'cron') break;
    if (turn?.role !== 'assistant') continue;

    for (const tool of turnTools(turn)) {
      if (normalizeToolName(tool.name) !== 'agentswarm') continue;
      if (tool.status === 'running') return true;
      swarmToolIds.add(tool.id);
    }
  }

  return tasks.some(
    (task) =>
      task.kind === 'subagent' &&
      task.state === 'run' &&
      !task.runInBackground &&
      task.parentToolCallId !== undefined &&
      swarmToolIds.has(task.parentToolCallId),
  );
}
