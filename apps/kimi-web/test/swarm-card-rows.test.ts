import { describe, expect, it } from 'vitest';
import type { AgentPhase } from '../src/types';
import type { SwarmMember } from '../src/composables/swarmGroups';
import type { SwarmResult } from '../src/lib/parseSwarmResult';
import { buildSwarmCardRows, swarmMemberActivity } from '../src/lib/swarmCardRows';
import { swarmCardStatus } from '../src/lib/agentTaskResolver';
import { createI18n } from 'vue-i18n';
import enTools from '../src/i18n/locales/en/tools';
import zhTools from '../src/i18n/locales/zh/tools';

function member(
  id: string,
  name: string,
  opts: {
    phase?: AgentPhase;
    subagentType?: string;
    model?: string;
    thinkingEffort?: string;
    text?: string;
    outputLines?: string[];
    summary?: string;
    suspendedReason?: string;
  } = {},
): SwarmMember {
  return {
    id,
    name,
    phase: opts.phase ?? 'working',
    subagentType: opts.subagentType,
    model: opts.model,
    thinkingEffort: opts.thinkingEffort,
    text: opts.text,
    outputLines: opts.outputLines,
    summary: opts.summary,
    suspendedReason: opts.suspendedReason,
    swarmIndex: 0,
  };
}

function result(subagents: SwarmResult['subagents']): SwarmResult {
  return {
    summary: `${subagents.length}`,
    completed: subagents.filter((s) => s.outcome === 'completed').length,
    failed: subagents.filter((s) => s.outcome === 'failed').length,
    aborted: subagents.filter((s) => s.outcome === 'aborted').length,
    total: subagents.length,
    subagents,
  };
}

describe('swarmCardStatus', () => {
  it.each(['running', 'ok', 'unknown', 'error'] as const)('live working overrides transcript %s without terminal evidence', (status) => {
    expect(swarmCardStatus(status, [member('a', 'Worker')], null)).toBe('running');
  });

  it.each([
    ['suspended', 'suspended'], ['queued', 'queued'],
  ] as const)('uses live phase %s instead of the transcript', (phase, expected) => {
    expect(swarmCardStatus('unknown', [member('a', 'Worker', { phase })], null)).toBe(expected);
  });

  it.each(['running', 'unknown'] as const)('preserves %s while visible terminal tasks may be only a partial batch', (status) => {
    for (const phase of ['completed', 'failed', 'cancelled'] as const) {
      // A three-item invocation has only spawned one or two tasks so far.
      const first = member('a', 'First item', { phase });
      const second = member('b', 'Second item', { phase });
      expect(swarmCardStatus(status, [first], null)).toBe(status);
      expect(swarmCardStatus(status, [first, second], null)).toBe(status);
    }
  });

  it('only turns a terminal member collection into batch cancellation with terminal evidence', () => {
    const cancelled = [member('a', 'Worker', { phase: 'cancelled' })];
    expect(swarmCardStatus('unknown', cancelled, null)).toBe('unknown');
    expect(swarmCardStatus('unknown', cancelled, result([{ outcome: 'aborted', body: 'Stopped' }]))).toBe('cancelled');
    expect(swarmCardStatus('cancelled', cancelled, null)).toBe('cancelled');
  });

  it('keeps all-suspended swarms static but mixed working swarms running', () => {
    expect(swarmCardStatus('running', [member('a', 'A', { phase: 'suspended' })], null)).toBe('suspended');
    expect(swarmCardStatus('ok', [member('a', 'A', { phase: 'suspended' }), member('b', 'B')], null)).toBe('running');
  });

  it('uses real result counts, not an assumed success, when no tasks survive', () => {
    expect(swarmCardStatus('unknown', [], null)).toBe('unknown');
    expect(swarmCardStatus('ok', [], result([{ outcome: 'aborted', body: 'Stopped' }]))).toBe('cancelled');
    expect(swarmCardStatus('unknown', [], result([{ outcome: 'failed', body: 'Failed' }]))).toBe('error');
    expect(swarmCardStatus('unknown', [], result([{ outcome: 'completed', body: 'Done' }]))).toBe('ok');
  });

  it('reports cancelled separately from failed in both locale summaries', () => {
    const translator = createI18n({ legacy: false, locale: 'en', messages: { en: enTools, zh: zhTools } });
    const counts = { completed: 1, failed: 0, cancelled: 2 };
    expect(translator.global.t('swarm.doneSub', counts)).toBe('1 completed · 0 failed · 2 cancelled');
    translator.global.locale.value = 'zh';
    expect(translator.global.t('swarm.doneSub', counts)).toBe('完成 1 · 失败 0 · 取消 2');
  });
});

describe('swarmMemberActivity', () => {
  it('prefers streamed subagent text over outputLines and summary', () => {
    const m = member('a', '子任务', {
      text: 'line 1\nline 2',
      outputLines: ['tool call output'],
      summary: 'final summary',
    });
    expect(swarmMemberActivity(m)).toBe('line 2');
  });

  it('falls back to the last outputLines entry when no text is streaming', () => {
    const m = member('a', '子任务', { outputLines: ['one', 'two'], summary: 'summary' });
    expect(swarmMemberActivity(m)).toBe('two');
  });

  it('falls back to summary', () => {
    expect(swarmMemberActivity(member('a', '子任务', { summary: 'sum' }))).toBe('sum');
  });
});

describe('buildSwarmCardRows', () => {
  it('builds rows from live members when no parsed result exists', () => {
    const rows = buildSwarmCardRows(
      [member('a', '子任务 A', { text: 'streaming' })],
      null,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'a',
      name: '子任务 A',
      activity: 'streaming',
      phase: 'working',
      body: 'streaming',
    });
  });

  it('preserves live member role, model, and thinking effort', () => {
    const [row] = buildSwarmCardRows(
      [
        member('a', '子任务 A', {
          subagentType: 'reviewer',
          model: 'runtime-model',
          thinkingEffort: 'high',
        }),
      ],
      null,
    );
    expect(row).toMatchObject({
      subagentType: 'reviewer',
      model: 'runtime-model',
      thinkingEffort: 'high',
    });
  });

  it('builds rows from result subagents when no members are present', () => {
    const rows = buildSwarmCardRows(
      [],
      result([
        { outcome: 'completed', item: 'A', body: 'A body' },
        { outcome: 'failed', item: 'B', body: 'B body' },
        { outcome: 'aborted', item: 'C', body: 'C body' },
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    expect(rows.map((r) => r.phase)).toEqual(['completed', 'failed', 'cancelled']);
    expect(rows.every((r) => r.subagentType === undefined && r.model === undefined)).toBe(true);
  });

  it('appends result-only aborted not_started rows on top of live members', () => {
    const rows = buildSwarmCardRows(
      [
        member('a1', '子任务 A', { phase: 'completed' }),
        member('a2', '子任务 B', { phase: 'working' }),
      ],
      result([
        { outcome: 'completed', item: 'A', agentId: 'a1', body: 'A body' },
        { outcome: 'completed', item: 'B', agentId: 'a2', body: 'B body' },
        { outcome: 'aborted', item: 'C', state: 'not_started', body: 'C never started' },
      ]),
    );
    expect(rows.map((r) => r.id)).toEqual(['a1', 'a2', 'C']);
    // Aborted is an interruption, not a failure — the row renders as cancelled.
    expect(rows[2]?.phase).toBe('cancelled');
    expect(rows[2]?.body).toBe('C never started');
  });

  it('does not duplicate a result row that a live member already covers', () => {
    const rows = buildSwarmCardRows(
      [member('a1', '子任务 A', { phase: 'failed' })],
      result([{ outcome: 'aborted', item: 'A', agentId: 'a1', body: 'A body' }]),
    );
    expect(rows.map((r) => r.id)).toEqual(['a1']);
    expect(rows[0]?.phase).toBe('failed');
  });

  it('matches by item substring when agent ids disagree', () => {
    const rows = buildSwarmCardRows(
      [member('a1', 'find unused exports in src', { phase: 'completed' })],
      result([{ outcome: 'aborted', item: 'unused exports', state: 'not_started', body: 'x' }]),
    );
    expect(rows.map((r) => r.id)).toEqual(['a1']);
  });
});
