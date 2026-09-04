import { effectScope, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppTurnProgress } from '../src/api/types';
import { useTurnProgress } from '../src/composables/useTurnProgress';
import {
  activeTurnProgressToolId,
  calculateTurnProgress,
  formatTurnProgressElapsed,
  hasActiveForegroundAgentSwarm,
  TURN_PROGRESS_FRAME_INTERVAL_MS,
  TURN_PROGRESS_MAX_PERCENT,
  TURN_PROGRESS_REVEAL_DELAY_MS,
  TURN_PROGRESS_STEP_INCREMENT,
  TURN_PROGRESS_TIME_BASE_PERCENT,
  TURN_PROGRESS_TIME_CONSTANT_MS,
  TURN_PROGRESS_TIME_RANGE_PERCENT,
  TURN_PROGRESS_TOOL_CALL_INCREMENT,
  TURN_PROGRESS_TOOL_RESULT_INCREMENT,
} from '../src/lib/turnProgress';
import type { ChatTurn, TaskItem } from '../src/types';

function progress(overrides: Partial<AppTurnProgress> = {}): AppTurnProgress {
  return {
    turnId: 1,
    active: true,
    startedAt: 0,
    stepCount: 0,
    stepNumbers: [],
    toolCallIds: [],
    completedToolCallIds: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('turn progress heuristic', () => {
  it('uses the CLI reveal, frame, cap, time, and activity constants', () => {
    expect(TURN_PROGRESS_REVEAL_DELAY_MS).toBe(8_000);
    expect(TURN_PROGRESS_FRAME_INTERVAL_MS).toBe(250);
    expect(TURN_PROGRESS_MAX_PERCENT).toBe(90);
    expect(TURN_PROGRESS_TIME_BASE_PERCENT).toBe(8);
    expect(TURN_PROGRESS_TIME_RANGE_PERCENT).toBe(52);
    expect(TURN_PROGRESS_TIME_CONSTANT_MS).toBe(60_000);
    expect(TURN_PROGRESS_STEP_INCREMENT).toBe(4);
    expect(TURN_PROGRESS_TOOL_CALL_INCREMENT).toBe(3);
    expect(TURN_PROGRESS_TOOL_RESULT_INCREMENT).toBe(4);
  });

  it('stays hidden before eight seconds and then applies the exact formula', () => {
    const state = progress({
      stepCount: 2,
      toolCallIds: ['a', 'b'],
      completedToolCallIds: ['a'],
    });
    expect(calculateTurnProgress(state, 7_999)).toBeNull();

    const elapsedMs = 8_000;
    const expected = Math.min(
      90,
      Math.round(
        8 +
          52 * (1 - Math.exp(-elapsedMs / 60_000)) +
          2 * 4 +
          2 * 3 +
          1 * 4,
      ),
    );
    expect(calculateTurnProgress(state, elapsedMs)).toMatchObject({
      percent: expected,
      elapsedSeconds: 8,
      toolCallCount: 2,
      animationFrame: 4,
    });
  });

  it('caps at ninety percent and formats elapsed time like the CLI', () => {
    expect(calculateTurnProgress(
      progress({
        stepCount: 20,
        toolCallIds: ['a', 'b', 'c'],
        completedToolCallIds: ['a', 'b', 'c'],
      }),
      600_000,
    )?.percent).toBe(90);
    expect(formatTurnProgressElapsed(8)).toBe('8s');
    expect(formatTurnProgressElapsed(60)).toBe('1m');
    expect(formatTurnProgressElapsed(65)).toBe('1m 5s');
  });
});

describe('active turn progress tool card', () => {
  it('targets the last running tool in the latest assistant turn across dividers', () => {
    const turns: ChatTurn[] = [
      {
        id: 'old-assistant',
        role: 'assistant',
        no: 1,
        text: '',
        tools: [{ id: 'old-tool', name: 'bash', arg: 'old', status: 'running' }],
      },
      { id: 'user-1', role: 'user', no: 2, text: 'Run the current task' },
      {
        id: 'assistant-1',
        role: 'assistant',
        no: 3,
        text: '',
        blocks: [
          { kind: 'tool', tool: { id: 'tool-1', name: 'read', arg: 'a.ts', status: 'running' } },
        ],
      },
      {
        id: 'compact-1',
        role: 'compaction',
        no: 4,
        text: 'summary',
        compaction: { trigger: 'auto' },
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        no: 5,
        text: '',
        blocks: [
          { kind: 'tool', tool: { id: 'tool-2', name: 'read', arg: 'b.ts', status: 'running' } },
          { kind: 'tool', tool: { id: 'tool-3', name: 'bash', arg: 'sleep 20', status: 'running' } },
        ],
      },
    ];

    expect(activeTurnProgressToolId(turns, true)).toBe('tool-3');
    expect(activeTurnProgressToolId(turns, false)).toBeNull();
  });

  it('does not fall back to an older assistant when the current one has no running tool', () => {
    const turns: ChatTurn[] = [
      { id: 'user-1', role: 'user', no: 1, text: 'Run this' },
      {
        id: 'assistant-1',
        role: 'assistant',
        no: 2,
        text: '',
        tools: [{ id: 'tool-1', name: 'bash', arg: 'sleep 20', status: 'running' }],
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        no: 3,
        text: 'Composing the response…',
      },
    ];

    expect(activeTurnProgressToolId(turns, true)).toBeNull();
  });

  it('recovers the running card from a bounded snapshot without its request trigger', () => {
    const turns: ChatTurn[] = [
      {
        id: 'snapshot-assistant',
        role: 'assistant',
        no: 50,
        text: '',
        blocks: [
          { kind: 'thinking', thinking: 'Continuing…' },
          { kind: 'tool', tool: { id: 'snapshot-tool', name: 'bash', arg: 'sleep 45', status: 'running' } },
        ],
      },
    ];

    expect(activeTurnProgressToolId(turns, true)).toBe('snapshot-tool');
  });
});

describe('useTurnProgress', () => {
  it('only schedules a timer for an active, visible source and disposes it with the scope', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const source = ref<AppTurnProgress | null>(null);
    const paused = ref(false);
    const scope = effectScope();
    const snapshot = scope.run(() => useTurnProgress(source, paused));
    if (snapshot === undefined) throw new Error('expected progress snapshot');

    expect(snapshot.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    source.value = progress({ startedAt: 100_000 });
    expect(vi.getTimerCount()).toBe(1);
    source.value = null;
    expect(vi.getTimerCount()).toBe(0);

    paused.value = true;
    source.value = progress({ startedAt: 100_000 });
    expect(vi.getTimerCount()).toBe(0);
    paused.value = false;
    expect(vi.getTimerCount()).toBe(1);

    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hides and stops its timer for a foreground swarm without subtracting elapsed time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const source = ref<AppTurnProgress | null>(progress({ startedAt: 100_000 }));
    const paused = ref(false);
    const scope = effectScope();
    const snapshot = scope.run(() => useTurnProgress(source, paused));
    if (snapshot === undefined) throw new Error('expected progress snapshot');

    vi.advanceTimersByTime(8_000);
    expect(snapshot.value?.elapsedSeconds).toBe(8);

    paused.value = true;
    expect(snapshot.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5_000);
    paused.value = false;
    expect(snapshot.value?.elapsedSeconds).toBe(13);
    expect(vi.getTimerCount()).toBe(1);

    scope.stop();
  });
});

describe('foreground AgentSwarm ownership', () => {
  const runningSwarm: ChatTurn[] = [
    {
      id: 'turn-1',
      role: 'assistant',
      no: 1,
      text: '',
      tools: [{ id: 'tool-1', name: 'AgentSwarm', arg: '{}', status: 'running' }],
    },
  ];

  it('only suppresses generic progress for a running swarm in the active main turn', () => {
    expect(hasActiveForegroundAgentSwarm(runningSwarm, true)).toBe(true);
    expect(hasActiveForegroundAgentSwarm(runningSwarm, false)).toBe(false);
    expect(hasActiveForegroundAgentSwarm([
      {
        ...runningSwarm[0],
        tools: undefined,
        blocks: [
          { kind: 'tool', tool: { id: 'tool-1', name: 'AgentSwarm', arg: '{}', status: 'running' } },
        ],
      },
    ], true)).toBe(true);
    expect(hasActiveForegroundAgentSwarm([
      {
        ...runningSwarm[0],
        tools: [{ id: 'tool-1', name: 'AgentSwarm', arg: '{}', status: 'ok' }],
      },
    ], true)).toBe(false);
    expect(hasActiveForegroundAgentSwarm([
      ...runningSwarm,
      { id: 'turn-2', role: 'user', no: 2, text: 'next prompt' },
    ], true)).toBe(false);
  });

  it('preserves ownership from linked foreground tasks across a divider', () => {
    const turns: ChatTurn[] = [
      { id: 'user-1', role: 'user', no: 1, text: 'Run this in parallel' },
      {
        id: 'turn-1',
        role: 'assistant',
        no: 2,
        text: '',
        tools: [{ id: 'swarm-1', name: 'AgentSwarm', arg: '{}', status: 'ok' }],
      },
      {
        id: 'compact-1',
        role: 'compaction',
        no: 3,
        text: 'summary',
        compaction: { trigger: 'auto' },
      },
      { id: 'turn-2', role: 'assistant', no: 4, text: 'Continuing…' },
    ];
    const linkedTask: TaskItem = {
      id: 'agent-1',
      name: 'Worker',
      kind: 'subagent',
      state: 'run',
      timing: '10s',
      parentToolCallId: 'swarm-1',
      runInBackground: false,
    };

    expect(hasActiveForegroundAgentSwarm(turns, true, [linkedTask])).toBe(true);
    expect(hasActiveForegroundAgentSwarm(turns, true, [
      { ...linkedTask, runInBackground: true },
    ])).toBe(false);
    expect(hasActiveForegroundAgentSwarm([
      ...turns,
      { id: 'cron-1', role: 'cron', no: 5, text: 'A new scheduled task' },
    ], true, [linkedTask])).toBe(false);
  });
});
