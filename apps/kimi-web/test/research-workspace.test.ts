import { describe, expect, it } from 'vitest';
import type { AppSession, ResearchStatusSnapshot } from '../src/api/types';
import { researchPolicyCommand, researchSessionLinks } from '../src/lib/researchWorkspace';

function snapshot(overrides: Partial<ResearchStatusSnapshot> = {}): ResearchStatusSnapshot {
  return {
    mode: 'ready', loopStatus: 'active', planningPolicy: 'collaborative',
    phase: 'gap_analysis', revision: 8, questions: [], lines: [],
    lineWorkstreamBindings: [], alerts: [], openQuestionCount: 0,
    activeQuestionCount: 0, blockedQuestionCount: 0, aitpHealth: { phase: 'ready' },
    ...overrides,
  };
}
function session(id: string, overrides: Partial<AppSession> = {}): AppSession {
  return {
    id, title: id, cwd: '/research', archived: false, busy: false,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    model: '', messageCount: 0, lastSeq: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
      cacheCreationTokens: 0, totalCostUsd: 0, contextTokens: 0, contextLimit: 0, turnCount: 0 },
    ...overrides,
  };
}

describe('Research workspace navigation projection', () => {
  it('discovers more than four live Research sessions after a browser reload without snapshots', () => {
    const sessions = Array.from({ length: 6 }, (_, i) => session(`research-${i}`, {
      research: { revision: i, mode: 'ready', line: `Project ${i}` },
      busy: i % 2 === 0,
    }));
    const links = researchSessionLinks([...sessions, session('cold')], {});
    expect(links.filter((link) => link.mode === 'ready')).toHaveLength(6);
    expect(links.filter((link) => link.busy)).toHaveLength(3);
    expect(links.at(-1)?.mode).toBeUndefined();
    expect(links.slice(0, 6).map((link) => link.line)).toEqual(
      sessions.map((s) => s.research?.line),
    );
  });
  it('uses newer list facts but never rolls back a newer session snapshot', () => {
    const sessions = [session('a', { research: { revision: 9, mode: 'inactive' } }),
      session('b', { research: { revision: 7, mode: 'inactive' } })];
    const links = researchSessionLinks(sessions, { a: snapshot(), b: snapshot() });
    expect(links.map((link) => link.mode)).toEqual(['inactive', 'ready']);
  });
  it('keeps unread, inactive, enabled and busy distinct without mutating state', () => {
    const sessions = [session('unread'), session('off'), session('enabled'), session('busy', { busy: true })];
    const snapshots = { off: snapshot({ mode: 'inactive' }), enabled: snapshot(), busy: snapshot() };
    const before = structuredClone({ sessions, snapshots });
    const links = researchSessionLinks(sessions, snapshots);
    expect(links.map(({ mode, busy }) => ({ mode, busy }))).toEqual([
      { mode: undefined, busy: false }, { mode: 'inactive', busy: false },
      { mode: 'ready', busy: false }, { mode: 'ready', busy: true },
    ]);
    expect({ sessions, snapshots }).toEqual(before);
  });
  it('never merges sessions or workspaces with identical Line slugs', () => {
    const line = { slug: 'same', title: 'First project', status: 'active' as const, createdAt: 1, revision: 1 };
    const links = researchSessionLinks([session('a'), session('b', { cwd: '/other' })], {
      a: snapshot({ currentLineSlug: 'same', lines: [line] }),
      b: snapshot({ currentLineSlug: 'same', lines: [{ ...line, title: 'Second project' }] }),
    });
    expect(links.map(({ id, workspace, line }) => ({ id, workspace, line }))).toEqual([
      { id: 'a', workspace: '/research', line: 'First project' },
      { id: 'b', workspace: '/other', line: 'Second project' },
    ]);
  });
  it('excludes archived/child sessions and orphaned snapshots, orders by recency', () => {
    const links = researchSessionLinks([
      session('old'), session('archived', { archived: true }), session('child', { parentSessionId: 'old' }),
      session('new', { updatedAt: '2026-09-02T00:00:00Z' }),
    ], { orphan: snapshot() });
    expect(links.map(({ id }) => id)).toEqual(['new', 'old']);
  });
});

describe('Research planning policy control', () => {
  it('uses the observed revision and only changes planning policy', () => {
    expect(researchPolicyCommand(snapshot(), 'dreaming', false)).toEqual({
      kind: 'set_planning_policy', policy: 'dreaming', expectedRevision: 8,
    });
  });
  it.each(['inactive', 'degraded', 'probing'] as const)('does not mutate %s mode', (mode) => {
    expect(researchPolicyCommand(snapshot({ mode }), 'dreaming', false)).toBeNull();
  });
  it('rejects busy, unchanged, unavailable and invalid selections', () => {
    expect(researchPolicyCommand(snapshot(), 'dreaming', true)).toBeNull();
    expect(researchPolicyCommand(snapshot(), 'collaborative', false)).toBeNull();
    expect(researchPolicyCommand(null, 'dreaming', false)).toBeNull();
    expect(researchPolicyCommand(snapshot(), 'auto', false)).toBeNull();
  });
});
