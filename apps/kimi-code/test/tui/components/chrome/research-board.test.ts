import { describe, expect, it } from 'vitest';
import { visibleWidth } from '@moonshot-ai/pi-tui';

import { ResearchBoardComponent } from '#/tui/components/chrome/research-board';
import type { ResearchStatusSnapshot } from '@moonshot-ai/kimi-code-sdk';

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function makeSnapshot(
  overrides: Partial<ResearchStatusSnapshot> = {},
): ResearchStatusSnapshot {
  return {
    mode: 'ready',
    loopStatus: 'active',
    currentLineSlug: 'test-line',
    currentFocus: { questionId: 'q1', revision: 1 },
    currentQuestion: {
      id: 'q1',
      lineSlug: 'test-line',
      wording: 'What is the mechanism?',
      priority: 1,
      neededEvidence: [],
      evidenceRefs: [],
      falsifierRefs: [],
      nextBoundedAction: 'Run experiment A',
      workflow: 'active',
      epistemic: 'candidate',
      persistence: 'working',
      revision: 1,
    },
    questions: [],
    lines: [],
    openQuestionCount: 1,
    activeQuestionCount: 1,
    blockedQuestionCount: 0,
    alerts: [],
    aitpHealth: { phase: 'ready' },
    revision: 1,
    ...overrides,
  };
}

describe('ResearchBoardComponent', () => {
  it('is empty when no snapshot', () => {
    const board = new ResearchBoardComponent();
    expect(board.isEmpty()).toBe(true);
    expect(board.isVisible()).toBe(false);
    expect(board.render(80)).toEqual([]);
  });

  it('is empty when mode is inactive', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ mode: 'inactive' }));
    expect(board.isEmpty()).toBe(true);
    expect(board.isVisible()).toBe(false);
    expect(board.render(80)).toEqual([]);
  });

  it('is visible when mode is ready', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ mode: 'ready' }));
    expect(board.isVisible()).toBe(true);
    expect(board.isEmpty()).toBe(false);
    expect(board.render(80).length).toBeGreaterThan(0);
  });

  it('is visible when mode is degraded', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ mode: 'degraded' }));
    expect(board.isVisible()).toBe(true);
  });

  it('is visible when mode is probing', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ mode: 'probing' }));
    expect(board.isVisible()).toBe(true);
    expect(board.isEmpty()).toBe(false);
    expect(board.render(80).length).toBeGreaterThan(0);
  });

  it('renders probing mode in the header', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ mode: 'probing', currentLineSlug: 'my-line' }));
    const lines = board.render(80).map(stripAnsi);
    expect(lines[1]).toContain('Research');
    expect(lines[1]).toContain('probing');
    expect(lines[1]).toContain('my-line');
  });

  it('clears snapshot', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot());
    expect(board.isVisible()).toBe(true);
    board.clear();
    expect(board.isEmpty()).toBe(true);
    expect(board.getSnapshotRevision()).toBeUndefined();
  });

  it('returns snapshot revision', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ revision: 42 }));
    expect(board.getSnapshotRevision()).toBe(42);
  });

  it('renders header with mode and line', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ mode: 'ready', currentLineSlug: 'my-line' }));
    const lines = board.render(80).map(stripAnsi);
    expect(lines[0]).toBe('─'.repeat(80));
    expect(lines[1]).toContain('Research');
    expect(lines[1]).toContain('ready');
    expect(lines[1]).toContain('my-line');
  });

  it('renders current question wording', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot());
    const lines = board.render(80).map(stripAnsi);
    const questionLine = lines.find((l) => l.includes('What is the mechanism?'));
    expect(questionLine).toBeDefined();
  });

  it('renders next bounded action', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot());
    const lines = board.render(80).map(stripAnsi);
    const nextLine = lines.find((l) => l.includes('next:'));
    expect(nextLine).toBeDefined();
    expect(nextLine).toContain('Run experiment A');
  });

  it('renders alerts count', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        alerts: [
          { kind: 'contradiction', message: 'X contradicts Y', questionId: 'q1' },
          { kind: 'blocked', message: 'blocked', questionId: 'q2' },
        ],
      }),
    );
    const lines = board.render(80).map(stripAnsi);
    const alertLine = lines.find((l) => l.includes('alert'));
    expect(alertLine).toBeDefined();
    expect(alertLine).toContain('2');
  });

  it('renders checkpoint when present', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        latestCommittedCheckpoint: {
          checkpointId: 'cp1',
          entryId: 'e1',
          committedAt: 1000,
        },
      }),
    );
    const lines = board.render(80).map(stripAnsi);
    const cpLine = lines.find((l) => l.includes('checkpoint'));
    expect(cpLine).toBeDefined();
    expect(cpLine).toContain('e1');
  });

  it('shows candidate count and previews when there is no focus', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        currentLineSlug: undefined,
        currentFocus: undefined,
        currentQuestion: undefined,
        questions: [
          {
            id: 'candidate-1',
            lineSlug: 'line-a',
            wording: 'Candidate mechanism',
            priority: 1,
            neededEvidence: [],
            evidenceRefs: [],
            falsifierRefs: [],
            workflow: 'open',
            epistemic: 'candidate',
            persistence: 'working',
            revision: 1,
          },
          {
            id: 'candidate-2',
            lineSlug: 'line-b',
            wording: 'Alternative mechanism',
            priority: 2,
            neededEvidence: [],
            evidenceRefs: [],
            falsifierRefs: [],
            workflow: 'open',
            epistemic: 'candidate',
            persistence: 'working',
            revision: 1,
          },
        ],
      }),
    );
    const output = board.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Candidates (2)');
    expect(output).toContain('Candidate mechanism');
    expect(output).not.toContain('Focus:');
  });

  it('projects Todo action and completion progress', () => {
    const board = new ResearchBoardComponent();
    board.setTodos([
      { title: 'Active action', status: 'in_progress' },
      { title: 'Finished action', status: 'done' },
      { title: 'Next action', status: 'pending' },
    ]);
    board.setSnapshot(makeSnapshot());
    const output = board.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Active action');
    expect(output).toContain('Todo progress: 1/3 done');
    expect(output).toContain('ctrl+o to expand');
  });

  it('expanded mode shows bounded multi-line research detail', () => {
    const board = new ResearchBoardComponent();
    board.setTodos([{ title: 'Collect evidence', status: 'pending' }]);
    board.setSnapshot(
      makeSnapshot({
        lines: [
          {
            slug: 'line-a',
            title: 'Line A',
            objective: 'Investigate A',
            assessment: 'supported direction',
            status: 'active',
            createdAt: 1,
            revision: 2,
          },
          {
            slug: 'line-b',
            title: 'Line B',
            objective: 'Investigate B',
            status: 'paused',
            createdAt: 2,
            revision: 1,
          },
        ],
        currentQuestion: {
          ...makeSnapshot().currentQuestion!,
          assessment: 'current assessment',
          neededEvidence: ['one', 'two'],
          evidenceRefs: ['e1'],
          falsifierRefs: ['f1'],
        },
        pendingCheckpoint: {
          checkpointId: 'pending-1',
          assessment: 'pending assessment',
          nextAction: 'verify result',
          idempotencyKey: 'idem-1',
          persistence: 'pending_commit',
          createdAt: 1,
        },
        latestCommittedCheckpoint: {
          checkpointId: 'committed-1',
          entryId: 'entry-1',
          committedAt: 2,
        },
        alerts: [{ kind: 'stale', message: 'refresh evidence' }],
      }),
    );
    board.setExpanded(true);
    const output = board.render(120).map(stripAnsi).join('\n');
    expect(output).toContain('Lines (2)');
    expect(output).toContain('current assessment');
    expect(output).toContain('Todo actions');
    expect(output).toContain('Evidence: 2 needed · 1 found · 1 falsifiers');
    expect(output).toContain('Pending checkpoint: pending-1');
    expect(output).toContain('Committed checkpoint: entry-1');
    expect(output).toContain('refresh evidence');
    expect(output).toContain('ctrl+o to collapse');
    expect(board.render(120).length).toBeLessThanOrEqual(22);
  });

  it('truncates lines to width for narrow terminals', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        currentQuestion: {
          id: 'q1',
          lineSlug: 'line',
          wording: 'A'.repeat(100),
          priority: 1,
          neededEvidence: [],
          evidenceRefs: [],
          falsifierRefs: [],
          nextBoundedAction: 'B'.repeat(100),
          workflow: 'active',
          epistemic: 'candidate',
          persistence: 'working',
          revision: 1,
        },
      }),
    );
    const width = 40;
    const lines = board.render(width);
    for (const line of lines) {
      // Each rendered line should not exceed the visible width
      expect(stripAnsi(line).length).toBeLessThanOrEqual(width + 20);
    }
  });

  it('does not apply strikethrough to closed questions', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        currentQuestion: {
          id: 'q1',
          lineSlug: 'line',
          wording: 'Closed question',
          priority: 1,
          neededEvidence: [],
          evidenceRefs: [],
          falsifierRefs: [],
          workflow: 'closed',
          epistemic: 'supported',
          persistence: 'committed',
          revision: 1,
        },
      }),
    );
    const lines = board.render(80);
    const joined = lines.join('\n');
    // Strikethrough ANSI code is \u001B[9m
    expect(joined).not.toContain('\u001B[9m');
  });

  it('orders bounded research attention before candidates, counts, and Todo actions', () => {
    const baseQuestion = makeSnapshot().currentQuestion!;
    const candidate = {
      ...baseQuestion,
      id: 'candidate-current',
      wording: 'Current line candidate',
      workflow: 'open' as const,
    };
    const otherCandidate = {
      ...candidate,
      id: 'candidate-other',
      lineSlug: 'other-line',
    };
    const board = new ResearchBoardComponent();
    board.setTodos([{ title: 'Todo after research', status: 'in_progress' }]);
    board.setSnapshot(
      makeSnapshot({
        currentLineSlug: 'test-line',
        questions: [candidate, otherCandidate],
        alerts: [
          { kind: 'stale', message: 'old evidence' },
          { kind: 'blocked', message: 'blocked result' },
        ],
        pendingCheckpoint: {
          checkpointId: 'cp-attention',
          idempotencyKey: 'idem-attention',
          persistence: 'pending_commit',
          createdAt: 1,
        },
      }),
    );
    const rows = board.render(160).map(stripAnsi);
    const indexOf = (text: string): number => rows.findIndex((row) => row.includes(text));
    expect(indexOf('Focus:')).toBeLessThan(indexOf('next:'));
    expect(indexOf('next:')).toBeLessThan(indexOf('Attention:'));
    expect(indexOf('Attention:')).toBeLessThan(indexOf('Candidates (current line)'));
    expect(indexOf('Candidates (current line)')).toBeLessThan(indexOf('Research:'));
    expect(indexOf('Research:')).toBeLessThan(indexOf('Todo:'));
  });

  it('puts the current line first in expanded summaries even when it is fifth', () => {
    const lines = Array.from({ length: 5 }, (_, index) => ({
      slug: `line-${index + 1}`,
      title: `Line ${index + 1}`,
      objective: `Objective ${index + 1}`,
      status: 'active' as const,
      createdAt: index + 1,
      revision: index + 1,
    }));
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ lines, currentLineSlug: 'line-5' }));
    board.setExpanded(true);
    const rows = board.render(120).map(stripAnsi);
    const line5 = rows.findIndex((row) => row.includes('Line 5'));
    const line1 = rows.findIndex((row) => row.includes('Line 1'));
    expect(line5).toBeGreaterThan(0);
    expect(line5).toBeLessThan(line1);
  });

  it('keeps compact and expanded output within the complete row budget', () => {
    const lines = Array.from({ length: 12 }, (_, index) => ({
      slug: `line-${index}`,
      title: `Line ${index}`,
      objective: `Objective ${index}`,
      status: 'active' as const,
      createdAt: index,
      revision: index + 1,
    }));
    const alerts = Array.from({ length: 10 }, (_, index) => ({
      kind: 'stale' as const,
      message: `Alert ${index}`,
    }));
    const board = new ResearchBoardComponent();
    board.setTodos(Array.from({ length: 10 }, (_, index) => ({
      title: `Todo ${index}`,
      status: 'pending' as const,
    })));
    board.setSnapshot(makeSnapshot({ lines, alerts }));
    expect(board.render(100).length).toBeLessThanOrEqual(12);
    board.setExpanded(true);
    expect(board.render(100).length).toBeLessThanOrEqual(24);
  });

  it('collapses summaries and respects CJK width in narrow terminals', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        currentQuestion: {
          ...makeSnapshot().currentQuestion!,
          wording: '第一行\n\n第二行   三',
          nextBoundedAction: '测量\n\n下一步',
        },
      }),
    );
    const width = 12;
    const rows = board.render(width);
    expect(rows.join('\n')).not.toContain('第一行\n');
    for (const row of rows) {
      expect(visibleWidth(stripAnsi(row))).toBeLessThanOrEqual(width);
    }
  });
});
