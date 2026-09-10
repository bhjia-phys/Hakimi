import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SubagentHistory } from '../src/transport/ws/v1/subagentHistory';
import { SessionEventJournal, type EventEnvelope } from '../src/transport/ws/v1/sessionEventJournal';

const at = '2026-09-10T04:11:00.000Z';
function event(type: string, fields: Record<string, unknown> = {}): EventEnvelope {
  return { type, seq: 1, session_id: 's', timestamp: at, payload: { type, subagentId: 'a', ...fields } };
}
describe('durable subagent history projection', () => {
  it('accepts the identified new execution but not its delayed predecessor', () => {
    const h = new SubagentHistory('s');
    h.apply(event('subagent.spawned'));
    h.apply(event('subagent.started', { runId: 'old' }));
    h.apply(event('subagent.completed', { runId: 'old' }));
    h.apply(event('subagent.spawned'));
    h.apply(event('subagent.completed', { runId: 'old' }));
    expect(h.get()).toEqual([]);
    h.apply(event('subagent.started', { runId: 'new' }));
    h.apply(event('subagent.failed', { runId: 'old' }));
    h.apply(event('subagent.completed'));
    expect(h.get()).toEqual([]);
    h.apply(event('subagent.completed', { runId: 'new', resultSummary: 'new result' }));
    expect(h.get()).toMatchObject([{ status: 'completed', output_preview: 'new result' }]);
  });
  it('keeps explicit terminal facts across main turns, never restores unfinished work as running', () => {
    const h = new SubagentHistory('s');
    h.apply(event('subagent.spawned', { parentAgentId: 'main', description: 'A' }));
    expect(h.get()).toEqual([]);
    h.apply(event('subagent.completed', { resultSummary: 'done' }));
    h.apply(event('turn.started', { agentId: 'main' }));
    expect(h.get()).toMatchObject([{ status: 'completed', created_at: at, completed_at: at, parent_agent_id: 'main' }]);
    h.apply(event('subagent.spawned'));
    expect(h.get()).toEqual([]);
    h.apply(event('subagent.completed', { resultSummary: 'late old result' }));
    expect(h.get()).toEqual([]);
  });
  it('retains nested ownership and failures without merging sessions or detached tasks', () => {
    const h = new SubagentHistory('s');
    h.apply(event('subagent.spawned', { parentAgentId: 'parent' }));
    h.apply({ ...event('subagent.completed'), session_id: 'other' });
    h.apply({ ...event('subagent.completed'), payload: { type: 'subagent.failed', subagentId: 'a' } });
    expect(h.get()).toEqual([]);
    h.apply(event('subagent.failed', { error: 'failed' }));
    expect(h.get()).toMatchObject([{ status: 'failed', parent_agent_id: 'parent' }]);
    h.apply(event('task.started', { info: { kind: 'agent', agentId: 'a', detached: true } }));
    h.apply(event('subagent.completed'));
    expect(h.get()).toEqual([]);
  });
  it('does not invent a task from a terminal event or malformed/volatile spawn', () => {
    const h = new SubagentHistory('s');
    h.apply(event('subagent.completed'));
    h.apply(event('subagent.spawned', { subagentId: null }));
    h.apply({ ...event('subagent.spawned'), volatile: true });
    h.apply(event('subagent.completed'));
    expect(h.get()).toEqual([]);
  });
  it('rebuilds terminal facts during the existing journal open pass', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'subagent-history-'));
    try {
      const path = join(dir, 'events.jsonl');
      const journal = await SessionEventJournal.open(path);
      for (const e of [event('subagent.spawned', { parentAgentId: 'main' }), event('subagent.completed')]) {
        const seq = journal.nextSeq();
        journal.append(seq, { ...e, seq, epoch: journal.epoch });
      }
      await journal.close();
      const h = new SubagentHistory('s');
      const restored = await SessionEventJournal.open(path, undefined, e => h.apply(e));
      expect(restored.seq).toBe(2);
      expect(h.get()).toMatchObject([{ status: 'completed', completed_at: at }]);
      await restored.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
