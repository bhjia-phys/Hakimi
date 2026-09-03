// Scenario: Research Board progressive-disclosure contract.
// Responsibility: compact stays glanceable; expanded preserves the complete research record.
// Wiring: render the public TUI component from protocol-shaped snapshots.
// Run: pnpm --filter @bhjia-phys/hakimi exec vitest run test/tui/components/chrome/research-board.test.ts

import { describe, expect, it } from 'vitest';
import { visibleWidth } from '@moonshot-ai/pi-tui';

import { ResearchBoardComponent } from '#/tui/components/chrome/research-board';
import type { ResearchStatusSnapshot } from '@bhjia-phys/hakimi-sdk';

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function makeSnapshot(
  overrides: Partial<ResearchStatusSnapshot> = {},
): ResearchStatusSnapshot {
  return {
    mode: 'ready',
    loopStatus: 'active',
    planningPolicy: 'collaborative',
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
    lineWorkstreamBindings: [],
    effectiveNextStep: {
      text: 'Run experiment A',
      source: 'question',
      freshness: 'current',
      observedAt: 1,
      derivedFrom: { questionId: 'q1', lineSlug: 'test-line' },
    },
    aitpHealth: { phase: 'ready' },
    phase: 'action_executing',
    revision: 1,
    ...overrides,
  };
}

type AitpMaintenanceReceipt = NonNullable<ResearchStatusSnapshot['aitpMaintenance']>;

function makeMaintenance(
  overrides: Partial<AitpMaintenanceReceipt> = {},
): AitpMaintenanceReceipt {
  return {
    status: 'ready',
    refreshedAt: 1_700_000_000_000,
    memoryStatus: 'available',
    latestWorkingNoteAt: 1_699_999_000_000,
    activeNewerThanWorkingNote: false,
    unresolvedFailureCount: 0,
    unresolvedFailures: [],
    warningSummaries: [],
    check: {
      status: 'clean',
      counts: { entries: 2, notes: 1, errors: 0, warnings: 0 },
      findingCodes: [],
    },
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

  it('surfaces explicit binding provenance and otherwise marks scoped persistence unavailable', () => {
    const binding = {
      confirmationId: 'confirmation-test-line-1',
      lineSlug: 'test-line',
      workstream: 'abacus-rpa',
      topicId: 'topic-1',
      observedRevision: 3,
      confirmedBy: 'user' as const,
      confirmedAt: 1_700_000_000_000,
    };
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      lineWorkstreamBindings: [binding],
      currentWorkstreamBinding: {
        lineSlug: 'test-line',
        status: 'bound',
        reason: 'Exact Topic observation and explicit confirmation match.',
        binding,
      },
    }));
    expect(board.render(120).map(stripAnsi).join('\n')).not.toContain('Workstream: abacus-rpa');

    board.setExpanded(true);
    const expanded = board.render(120).map(stripAnsi).join('\n');
    expect(expanded).toContain('AITP workstream: abacus-rpa');
    expect(expanded).toContain('Binding provenance: Topic topic-1 revision 3 · user');

    board.setExpanded(false);
    board.setSnapshot(makeSnapshot({
      currentWorkstreamBinding: {
        lineSlug: 'test-line',
        status: 'unbound',
        reason: 'Confirm an explicit Line-to-workstream binding.',
      },
    }));
    expect(board.render(120).map(stripAnsi).join('\n')).toContain(
      'Scoped AITP persistence unavailable',
    );
  });

  it('derives stale and conflicting bindings for non-current lines', () => {
    const currentBinding = {
      confirmationId: 'confirmation-test-line-1',
      lineSlug: 'test-line',
      workstream: 'current-workstream',
      topicId: 'topic-1',
      observedRevision: 4,
      confirmedBy: 'user' as const,
      confirmedAt: 10,
    };
    const staleBinding = {
      confirmationId: 'confirmation-stale-line-1',
      lineSlug: 'stale-line',
      workstream: 'stale-workstream',
      topicId: 'topic-1',
      observedRevision: 3,
      confirmedBy: 'main_agent' as const,
      confirmedAt: 11,
    };
    const conflictBinding = {
      confirmationId: 'confirmation-conflict-line-1',
      lineSlug: 'conflict-line',
      workstream: 'conflict-workstream',
      topicId: 'topic-2',
      observedRevision: 4,
      confirmedBy: 'user' as const,
      confirmedAt: 12,
    };
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      program: {
        topicId: 'topic-1',
        title: 'Current Topic',
        goalText: 'Validate the current Topic.',
        goalSource: 'aitp-enter',
        establishedAt: 1,
        observedRevision: 4,
      },
      lines: [
        { slug: 'test-line', title: 'Current line', status: 'active', createdAt: 1, revision: 4 },
        { slug: 'stale-line', title: 'Stale line', status: 'paused', createdAt: 2, revision: 2 },
        { slug: 'conflict-line', title: 'Conflict line', status: 'paused', createdAt: 3, revision: 2 },
      ],
      lineWorkstreamBindings: [currentBinding, staleBinding, conflictBinding],
      currentWorkstreamBinding: {
        lineSlug: 'test-line',
        status: 'conflict',
        reason: 'Keep the coordinator-provided current alignment.',
        binding: currentBinding,
      },
    }));
    board.setExpanded(true);

    const output = board.render(140).map(stripAnsi).join('\n');
    expect(output).toContain('AITP workstream: current-workstream · conflict');
    expect(output).toContain('AITP workstream: stale-workstream · stale');
    expect(output).toContain('AITP workstream: conflict-workstream · conflict');
    expect(output).not.toContain('stale-workstream · bound');
    expect(output).not.toContain('conflict-workstream · bound');
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
    const lines = board.render(140).map(stripAnsi);
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

  it.each([
    ['idle', 'next / ready'],
    ['orienting', 'frame / hypothesis'],
    ['gap_analysis', 'frame / hypothesis'],
    ['action_planned', 'test / action'],
    ['action_executing', 'test / action'],
    ['evaluating', 'evaluate'],
    ['state_updated', 'record'],
    ['checkpoint_pending', 'record'],
  ] as const)('maps phase %s to compact stage %s', (phase, stage) => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ phase }));
    expect(board.render(180).map(stripAnsi).join('\n')).toContain(`Current cycle: ${stage}`);
  });

  it('keeps another Line alert out of compact and expanded current attention', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      alerts: [{
        fingerprint: 'current-line-alert',
        kind: 'contradiction',
        lineSlug: 'test-line',
        message: 'Current Line needs review',
        createdAt: 1,
      }, {
        fingerprint: 'other-line-alert',
        kind: 'blocked',
        lineSlug: 'other-line',
        message: 'Other Line failure',
        createdAt: 2,
      }],
    }));

    const compact = board.render(160).map(stripAnsi).join('\n');
    expect(compact).toContain('Current Line needs review');
    expect(compact).not.toContain('Other Line failure');
    board.setExpanded(true);
    const expanded = board.render(160).map(stripAnsi).join('\n');
    expect(expanded).toContain('Current Line needs review');
    expect(expanded).not.toContain('Other Line failure');
  });

  it('renders current question wording', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot());
    const lines = board.render(180).map(stripAnsi);
    const questionLine = lines.find((l) => l.includes('What is the mechanism?'));
    expect(questionLine).toBeDefined();
  });

  it('renders the single effective next step', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot());
    const lines = board.render(80).map(stripAnsi);
    const nextLine = lines.find((l) => l.includes('Next:'));
    expect(nextLine).toBeDefined();
    expect(nextLine).toContain('Run experiment A');
  });

  it('keeps the research plan in expanded scientific detail', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      researchPlan: {
        planId: 'plan-1',
        researchRevision: 2,
        objective: 'Compare symmetry-on and symmetry-off energies',
        steps: ['Run both calculations', 'Compare converged energies'],
        expectedEvidence: ['Energy difference and tolerance'],
        stopCondition: 'Stop after both calculations converge',
        status: 'finalized',
      },
    }));
    const compactOutput = board.render(140).map(stripAnsi).join('\\n');
    expect(compactOutput).not.toContain('Compare symmetry-on and symmetry-off energies');
    expect(compactOutput).not.toContain('finalized');
    board.setExpanded(true);
    const expandedOutput = board.render(140).map(stripAnsi).join('\\n');
    expect(expandedOutput).toContain('Action plan');
    expect(expandedOutput).toContain('plan-1');
    expect(expandedOutput).toContain('1. Run both calculations');
    expect(expandedOutput).toContain('Energy difference and tolerance');
  });

  it('renders alerts count', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        alerts: [
          {
            fingerprint: 'research.alert.contradiction.q1',
            kind: 'contradiction',
            message: 'X contradicts Y',
            questionId: 'q1',
            createdAt: 1,
          },
          {
            fingerprint: 'research.alert.blocked.q2',
            kind: 'blocked',
            message: 'blocked',
            questionId: 'q2',
            createdAt: 2,
          },
        ],
      }),
    );
    const lines = board.render(80).map(stripAnsi);
    const alertLine = lines.find((l) => l.includes('alert'));
    expect(alertLine).toBeDefined();
    expect(alertLine).toContain('2');
  });

  it('shows only active attention when compact and all alert states when expanded', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        alerts: [
          {
            fingerprint: 'acknowledged-fingerprint',
            kind: 'blocked',
            message: 'resolved blocked evidence',
            createdAt: 1,
            acknowledgedAt: 2,
          },
          {
            fingerprint: 'active-fingerprint',
            kind: 'contradiction',
            message: 'active contradiction needs review',
            createdAt: 3,
          },
        ],
      }),
    );

    const compactOutput = board.render(120).map(stripAnsi).join('\\n');
    expect(compactOutput).toContain('active contradiction needs review');
    expect(compactOutput).not.toContain('resolved blocked evidence');
    expect(compactOutput).not.toContain('acknowledged-fingerprint');
    expect(compactOutput).not.toContain('active-fingerprint');

    board.setExpanded(true);
    const expandedOutput = board.render(120).map(stripAnsi).join('\\n');
    expect(expandedOutput).toContain('active contradiction needs review');
    expect(expandedOutput).toContain('resolved blocked evidence');
    expect(expandedOutput).toContain('acknowledged');
    expect(expandedOutput).toContain('acknowledged-fingerprint');
    expect(expandedOutput).toContain('active-fingerprint');
  });

  it('renders checkpoint in expanded mode, not compact', () => {
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
    // Compact: checkpoint engineering IDs are hidden.
    const compactOutput = board.render(80).map(stripAnsi).join('\n');
    expect(compactOutput).not.toContain('checkpoint');
    // Expanded: checkpoint details are visible.
    board.setExpanded(true);
    const expandedOutput = board.render(80).map(stripAnsi).join('\n');
    expect(expandedOutput).toContain('Latest committed: cp1 · entry e1');
  });

  it('shows unavailable distillation attention compactly and preserves either receipt when expanded', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      distillationAttention: {
        schema: 'hakimi/research-distillation-attention-0.1',
        status: 'handoff_unavailable',
        checkpointId: 'cp-distill',
        entryId: 'entry-distill',
        reason: 'The external Skill is hidden.',
        recordedAt: 1_700_000_000_000,
      },
    }));
    const compact = board.render(140).map(stripAnsi).join('\n');
    expect(compact).toContain(
      'Attention: Method review handoff unavailable for Entry entry-distill: The external Skill is hidden.',
    );

    board.setExpanded(true);
    const expanded = board.render(140).map(stripAnsi).join('\n');
    expect(expanded).toContain('Method review handoff handoff unavailable · The external Skill is hidden.');
    expect(expanded).toContain('checkpoint cp-distill · Entry entry-distill');

    board.setSnapshot(makeSnapshot({
      distillationAttention: {
        schema: 'hakimi/research-distillation-attention-0.1',
        status: 'review_requested',
        checkpointId: 'cp-requested',
        entryId: 'entry-requested',
        recordedAt: 1_700_000_000_000,
      },
    }));
    const requested = board.render(140).map(stripAnsi).join('\n');
    expect(requested).toContain('Method review handoff review requested');
    expect(requested).toContain('checkpoint cp-requested · Entry entry-requested');
  });

  it('preserves the real S9 ABACUS Entry, exact workstream, and review handoff together', () => {
    const entryId = 'entry-a071eb42792548f685520d4492615a63';
    const checkpointId = 'checkpoint-hakimi-s9-abacus-union-audit-job1097';
    const workstream = 'hakimi-s9-abacus-union-audit';
    const binding = {
      confirmationId: 'confirmation-hakimi-s9-abacus-union-audit',
      lineSlug: workstream,
      workstream,
      topicId: 'gw-librpa',
      observedRevision: 1,
      confirmedBy: 'main_agent' as const,
      confirmedAt: 1_788_266_317_851,
    };
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      currentLineSlug: workstream,
      currentWorkstreamBinding: {
        lineSlug: workstream,
        status: 'bound',
        reason: 'The main agent explicitly confirmed this bounded S9 workstream.',
        binding,
      },
      lineWorkstreamBindings: [binding],
      latestCommittedCheckpoint: {
        checkpointId,
        entryId,
        committedAt: 1_788_266_317_853,
      },
      distillationAttention: {
        schema: 'hakimi/research-distillation-attention-0.1',
        status: 'review_requested',
        checkpointId,
        entryId,
        recordedAt: 1_788_266_317_855,
      },
      phase: 'state_updated',
      revision: 9,
    }));

    board.setExpanded(true);
    const expanded = board.render(180).map(stripAnsi).join('\n');
    expect(expanded).toContain(workstream);
    expect(expanded).toContain(`Latest committed: ${checkpointId} · entry ${entryId}`);
    expect(expanded).toContain('Method review handoff review requested');
    expect(expanded).toContain(`checkpoint ${checkpointId} · Entry ${entryId}`);
  });

  it('defers candidate previews until expanded', () => {
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
    const compactOutput = board.render(100).map(stripAnsi).join('\n');
    expect(compactOutput).not.toContain('Candidate mechanism');
    board.setExpanded(true);
    const expandedOutput = board.render(100).map(stripAnsi).join('\n');
    expect(expandedOutput).toContain('Questions (2)');
    expect(expandedOutput).toContain('Candidate mechanism');
    expect(expandedOutput).toContain('Alternative mechanism');
  });

  it('defers external Todo actions until expanded', () => {
    const board = new ResearchBoardComponent();
    board.setTodos([
      { title: 'Active action', status: 'in_progress' },
      { title: 'Finished action', status: 'done' },
      { title: 'Next action', status: 'pending' },
    ]);
    board.setSnapshot(makeSnapshot());
    const compactOutput = board.render(100).map(stripAnsi).join('\n');
    expect(compactOutput).not.toContain('Active action');
    board.setExpanded(true);
    const expandedOutput = board.render(100).map(stripAnsi).join('\n');
    expect(expandedOutput).toContain('External Todo actions (1/3 done)');
    expect(expandedOutput).toContain('Active action');
    expect(expandedOutput).toContain('Finished action');
    expect(expandedOutput).toContain('Next action');
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
        alerts: [{
          fingerprint: 'research.alert.stale.line-a',
          kind: 'stale',
          message: 'refresh evidence',
          createdAt: 3,
        }],
      }),
    );
    board.setExpanded(true);
    const output = board.render(120).map(stripAnsi).join('\n');
    expect(output).toContain('Lines (2)');
    expect(output).toContain('current assessment');
    expect(output).toContain('Todo actions');
    expect(output).toContain('Focused-question evidence 2 needed · 1 found · 1 falsifiers');
    expect(output).toContain('Pending: pending-1');
    expect(output).toContain('entry-1');
    expect(output).toContain('refresh evidence');
    expect(output).not.toContain('…');
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
      expect(visibleWidth(stripAnsi(line))).toBeLessThanOrEqual(width);
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

  it('orders the compact semantic slots within the TUI five-slot budget', () => {
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
        goalSummary: {
          objective: 'Finish the current stage',
          status: 'active',
          remainingTurns: 3,
        },
        questions: [candidate, otherCandidate],
        alerts: [
          {
            fingerprint: 'research.alert.stale.test-line',
            kind: 'stale',
            message: 'old evidence',
            createdAt: 4,
          },
          {
            fingerprint: 'research.alert.blocked.test-line',
            kind: 'blocked',
            message: 'blocked result',
            createdAt: 5,
          },
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
    expect(indexOf('Project:')).toBeLessThan(indexOf('Current cycle:'));
    expect(indexOf('Current cycle:')).toBeLessThan(indexOf('Attention:'));
    expect(indexOf('Attention:')).toBeLessThan(indexOf('Next:'));
    expect(rows.slice(2)).toHaveLength(4);
    expect(rows.join('\n')).not.toContain('Current line candidate');
    expect(rows.join('\n')).not.toContain('Todo after research');
  });

  it.each(['unavailable', 'confirmation_required', 'stale', 'conflict'] as const)(
    'prioritizes an unresolved human gate over Goal alignment blocker (%s)',
    (status) => {
      const board = new ResearchBoardComponent();
      board.setSnapshot(makeSnapshot({
        goalSummary: { objective: 'Finish the current stage', status: 'active' },
        goalAlignment: {
          status,
          reason: `alignment ${status} needs review`,
        },
        humanGate: {
          gateId: 'gate-alignment',
          kind: 'approval',
          prompt: 'Approve the next experiment',
          createdAt: 1,
        },
        alerts: [{
          fingerprint: 'active-alert',
          kind: 'blocked',
          message: 'another active alert',
          createdAt: 2,
        }],
        aitpMaintenance: makeMaintenance({
          status: 'degraded',
          degradedReason: 'stale_generation',
        }),
        aitpHealth: { phase: 'degraded', lastError: 'adapter probe failed' },
      }));

      const rows = board.render(160).map(stripAnsi);
      const attentionIndex = rows.findIndex((row) => row.includes('Attention:'));
      expect(attentionIndex).toBeGreaterThanOrEqual(0);
      expect(rows[attentionIndex]).toContain('Approval needed');
      expect(rows[attentionIndex]).toContain('Approve the next experiment');
      expect(rows[attentionIndex]).toContain('+4 more');
      expect(rows[attentionIndex]).not.toContain(`Goal alignment: ${status.replaceAll('_', ' ')}`);
      expect(rows[attentionIndex]).not.toContain('another active alert');
      expect(rows.join('\n')).not.toContain('Alignment:');
      expect(rows.slice(2)).toHaveLength(4);

      for (const row of board.render(48)) {
        expect(visibleWidth(stripAnsi(row))).toBeLessThanOrEqual(48);
      }
    },
  );

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

  it('renders every research collection item when expanded', () => {
    const lines = Array.from({ length: 12 }, (_, index) => ({
      slug: `line-${index}`,
      title: `Line ${index}`,
      objective: `Objective ${index}`,
      status: 'active' as const,
      createdAt: index,
      revision: index + 1,
    }));
    const alerts = Array.from({ length: 10 }, (_, index) => ({
      fingerprint: `research.alert.stale.${index}`,
      kind: 'stale' as const,
      message: `Alert ${index}`,
      createdAt: index,
    }));
    const board = new ResearchBoardComponent();
    board.setTodos(Array.from({ length: 10 }, (_, index) => ({
      title: `Todo ${index}`,
      status: 'pending' as const,
    })));
    board.setSnapshot(makeSnapshot({ lines, alerts }));
    board.setExpanded(true);
    const output = board.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Line 11');
    expect(output).toContain('Todo 9');
    expect(output).toContain('Alert 9');
    expect(output).not.toContain('additional lines');
    expect(output).not.toContain('additional Todo actions');
    expect(output).not.toContain('additional alerts');
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

  // ── Scientific progress (phase / latestProgress / currentAction / humanGate) ──

  it('compact combines the scientific stage and progress in Current cycle', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        phase: 'evaluating',
        latestProgress: {
          headline: 'Measured Hall conductivity matches prediction',
          motivation: 'Test the topological hypothesis',
          workPerformed: 'Ran transport simulation',
          result: 'σ_xy ≈ e²/h within 2%',
          mainlineImpact: 'Supports the topological origin',
          uncertainties: ['edge state coupling unverified'],
          nextAction: 'Check edge state localization',
          recordedAt: 100,
        },
        effectiveNextStep: {
          text: 'Check edge state localization',
          source: 'question',
          freshness: 'current',
          observedAt: 100,
          derivedFrom: { questionId: 'q1', lineSlug: 'test-line' },
        },
      }),
    );
    const output = board.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Current cycle: evaluate');
    expect(output).toContain('Measured Hall conductivity');
    expect(output).toContain('Check edge state localization');
    expect(output).not.toContain('Supports the topological origin');
  });

  it('compact falls back to the current question when no progress is recorded', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ phase: 'orienting', latestProgress: undefined }));
    const output = board.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Current cycle: frame / hypothesis');
    expect(output).toContain('What is the mecha');
    expect(output).not.toContain('No progress recorded for this cycle.');
  });

  it('compact exposes Project and Current cycle and bypasses a stranded action', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      phase: 'gap_analysis',
      period: {
        id: 'period-debug',
        lineSlug: 'test-line',
        startedAt: 1,
        loopCount: 6,
      },
      goalSummary: {
        goalId: 'goal-debug',
        objective: 'Validate the current bounded QSGW comparison.',
        status: 'active',
      },
      goalAlignment: {
        status: 'confirmation_required',
        reason: 'Confirm the Goal and observed Research Program relationship.',
      },
      currentWorkstreamBinding: {
        lineSlug: 'test-line',
        status: 'unbound',
        reason: 'Explicit binding is required.',
      },
      currentAction: {
        actionId: 'action-stale',
        kind: 'other',
        purpose: 'Commit an obsolete file set.',
        expectedEvidence: [],
        stopCondition: 'The obsolete commit is classified.',
        allowedToolKinds: [],
        status: 'in_progress',
        createdAt: 10,
        requiresHumanApproval: false,
      },
      latestProgress: {
        headline: 'The newer reciprocal-space cause is localized',
        motivation: 'The current evidence moved beyond the old action.',
        workPerformed: 'Checked the newer diagnostic.',
        result: 'The current cause is localized.',
        mainlineImpact: 'The next action should use the current evidence.',
        uncertainties: [],
        recordedAt: 20,
      },
      pendingCheckpoint: {
        checkpointId: 'checkpoint-stale',
        idempotencyKey: 'checkpoint-stale-key',
        persistence: 'pending_commit',
        createdAt: 5,
      },
      effectiveNextStep: {
        text: 'Recover action action-stale: it is in_progress while the Research phase is gap_analysis; conclude or abandon it before starting another action.',
        source: 'research_action',
        freshness: 'blocked',
        observedAt: 10,
        derivedFrom: { actionId: 'action-stale' },
      },
      status: {
        currentLineSlug: 'test-line',
        currentQuestionId: 'q1',
        currentActionId: 'action-stale',
        phase: 'gap_analysis',
        nextStep: 'Recover action action-stale: it is in_progress while the Research phase is gap_analysis; conclude or abandon it before starting another action.',
        health: 'blocked',
        attention: [
          'Recover action action-stale before continuing.',
          'Checkpoint checkpoint-stale is pending durable commit.',
          'Goal alignment is confirmation_required.',
        ],
      },
    }));

    const output = board.render(180).map(stripAnsi).join('\n');
    expect(output).toContain('mode ready · workflow blocked');
    expect(output).toContain('Project: Goal active');
    expect(output).not.toContain('Validate the current bounded QSGW comparison.');
    expect(output).toContain('Plan not established');
    expect(output).toContain('Current cycle: frame / hypothesis · 6 Research turns · action recovery required');
    expect(output).toContain('Action/phase recovery required');
    expect(output).toContain('+2 more');
    expect(output).toContain('The newer reciprocal-space cause is localized');
    expect(output).not.toContain('Commit an obsolete file set.');
    expect(output).toContain('Next: Recover action action-stale: it is in_progress while the Research phase is gap_analysis; conclude or abandon it before starting another action.');

    board.setExpanded(true);
    const expanded = board.render(180).map(stripAnsi).join('\n');
    expect(expanded).toContain('research action / blocked');
    expect(expanded).toContain('Next provenance:');
    expect(expanded).toContain('action action-stale');
  });

  it('compact shows an action-bound scheduler observation', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      currentRun: {
        actionId: 'action-1',
        campaign: 'campaign-r2',
        jobId: '3128781',
        stage: 'scf',
        schedulerState: 'running',
        lastObservedAt: 1_000,
        nextCheckAt: 2_000,
        artifactRefs: ['scf.log'],
      },
    }));
    const output = board.render(120).map(stripAnsi).join('\n');
    expect(output).toContain('Current cycle: test / action');
    expect(output).toContain('job 3128781');
    expect(output).toContain('running / scf');
    expect(output).not.toContain('next check');
    expect(output).not.toContain('campaign-r2');
    expect(output).not.toContain('action-1');
  });

  it('compact shows human gate at the top when unresolved', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        phase: 'awaiting_human',
        humanGate: {
          gateId: 'gate-1',
          kind: 'approval',
          prompt: 'Approve the destructive test on sample B?',
          createdAt: 50,
        },
      }),
    );
    const rows = board.render(100).map(stripAnsi);
    // The human gate occupies Attention between Current cycle and Next.
    const gateIdx = rows.findIndex((r) => r.includes('Approval needed'));
    const nextIdx = rows.findIndex((r) => r.includes('Next:'));
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeLessThan(nextIdx);
    expect(rows[gateIdx]).toContain('Approve the destructive test on sample B?');
  });

  it('compact does not show resolved human gate', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        humanGate: {
          gateId: 'gate-1',
          kind: 'review',
          prompt: 'Review the derivation',
          resolvedAt: 100,
          resolution: 'approved',
          createdAt: 50,
        },
      }),
    );
    const output = board.render(100).map(stripAnsi).join('\n');
    expect(output).not.toContain('Review needed');
    expect(output).not.toContain('Review the derivation');
  });

  it('compact does not show audit identifiers as main content', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        phase: 'action_executing',
        latestProgress: {
          headline: 'Experiment completed',
          motivation: 'm',
          workPerformed: 'w',
          result: 'r',
          mainlineImpact: 'i',
          uncertainties: [],
          recordedAt: 1,
        },
        latestCommittedCheckpoint: {
          checkpointId: 'cp-audit-1',
          entryId: 'entry-audit-1',
          committedAt: 2,
        },
        pendingCheckpoint: {
          checkpointId: 'pending-audit-1',
          idempotencyKey: 'idem-1',
          persistence: 'pending_commit',
          createdAt: 3,
        },
      }),
    );
    const output = board.render(100).map(stripAnsi).join('\n');
    // Audit plumbing should not appear in compact.
    expect(output).not.toContain('checkpoint:');
    // Scientific content should.
    expect(output).toContain('Experiment completed');
  });

  it('expanded shows full progress detail fields', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        phase: 'state_updated',
        latestProgress: {
          headline: 'Confirmed symmetry breaking',
          motivation: 'Determine order parameter',
          workPerformed: 'Mean-field analysis on lattice',
          result: 'Order parameter nonzero below T_c',
          mainlineImpact: 'Establishes the phase transition',
          uncertainties: ['finite-size effects', 'disorder unaccounted'],
          nextAction: 'Finite-size scaling',
          phaseChange: { from: 'evaluating', to: 'state_updated' },
          recordedAt: 100,
        },
        currentAction: {
          actionId: 'a1',
          kind: 'simulation',
          purpose: 'Verify scaling exponent',
          expectedEvidence: ['ν ≈ 0.63', 'β ≈ 0.33'],
          stopCondition: 'χ² < 2',
          allowedToolKinds: ['simulation'],
          status: 'in_progress',
          requiresHumanApproval: false,
          createdAt: 90,
        },
        currentRun: {
          actionId: 'a1',
          campaign: 'bi2se3-r2',
          jobId: '3128781',
          stage: 'scf',
          schedulerState: 'running',
          lastObservedAt: 100,
          nextCheckAt: 200,
          artifactRefs: ['scf.log'],
        },
      }),
    );
    board.setExpanded(true);
    const output = board.render(140).map(stripAnsi).join('\n');
    // Progress fields
    expect(output).toContain('Latest progress');
    expect(output).toContain('Confirmed symmetry breaking');
    expect(output).toContain('Determine order parameter');
    expect(output).toContain('Mean-field analysis on lattice');
    expect(output).toContain('Order parameter nonzero below T_c');
    expect(output).toContain('Establishes the phase transition');
    expect(output).toContain('finite-size effects');
    // Phase change
    expect(output).toContain('Phase change:');
    expect(output).toContain('evaluating');
    expect(output).toContain('state updated');
    // Current action detail
    expect(output).toContain('Current action');
    expect(output).toContain('simulation');
    expect(output).toContain('Verify scaling exponent');
    expect(output).toContain('Expected evidence:');
    expect(output).toContain('Stop condition:');
    expect(output).toContain('χ² < 2');
    expect(output).toContain('Current run');
    expect(output).toContain('bi2se3-r2');
    expect(output).toContain('3128781');
    expect(output).toContain('running');
    expect(output).toContain('scf');
    expect(output).toContain('scf.log');
  });

  it('expanded shows no-progress message when latestProgress is absent', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ phase: 'orienting', latestProgress: undefined }));
    board.setExpanded(true);
    const output = board.render(120).map(stripAnsi).join('\n');
    expect(output).toContain('No progress recorded for this cycle.');
  });

  it('expanded shows unresolved human gate', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        phase: 'awaiting_human',
        humanGate: {
          gateId: 'gate-2',
          kind: 'decision',
          prompt: 'Which branch to pursue?',
          createdAt: 50,
        },
      }),
    );
    board.setExpanded(true);
    const output = board.render(120).map(stripAnsi).join('\n');
    expect(output).toContain('Human gate:');
    expect(output).toContain('decision / open');
    expect(output).toContain('Which branch to pursue?');
    expect(output.match(/Which branch to pursue\?/gu)).toHaveLength(1);
  });

  it('expanded renders all selected scientific detail without a physical row cap', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        phase: 'state_updated',
        latestProgress: {
          headline: 'Result confirmed',
          motivation: 'Verify prediction',
          workPerformed: 'Ran 3 simulations',
          result: 'Matches theory',
          mainlineImpact: 'Confirms main hypothesis',
          uncertainties: Array.from({ length: 10 }, (_, i) => `uncertainty ${i}`),
          nextAction: 'Publish',
          recordedAt: 1,
        },
        currentAction: {
          actionId: 'a1',
          kind: 'simulation',
          purpose: 'Final check',
          expectedEvidence: ['e1', 'e2'],
          stopCondition: 'done',
          allowedToolKinds: ['simulation'],
          status: 'in_progress',
          requiresHumanApproval: false,
          createdAt: 1,
        },
        humanGate: {
          gateId: 'g1',
          kind: 'approval',
          prompt: 'Approve publication?',
          createdAt: 2,
        },
        lines: Array.from({ length: 8 }, (_, i) => ({
          slug: `line-${i}`,
          title: `Line ${i}`,
          objective: `Objective ${i}`,
          status: 'active' as const,
          createdAt: i,
          revision: i + 1,
        })),
        alerts: Array.from({ length: 5 }, (_, i) => ({
          fingerprint: `research.alert.stale.scientific.${i}`,
          kind: 'stale' as const,
          message: `Alert ${i}`,
          createdAt: i,
        })),
      }),
    );
    board.setExpanded(true);
    const output = board.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Result confirmed');
    expect(output).toContain('Confirms main hypothesis');
    expect(output).toContain('Approve publication?');
  });

  it('expanded restores action-run and checkpoint receipt provenance', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      currentAction: {
        actionId: 'action-receipt',
        questionId: 'q1',
        lineSlug: 'test-line',
        kind: 'experiment',
        purpose: 'Run the bounded provenance check',
        expectedEvidence: ['A complete receipt'],
        stopCondition: 'The receipt is verified',
        allowedToolKinds: ['test'],
        status: 'completed',
        createdAt: 10,
        completedAt: 20,
        requiresHumanApproval: false,
        run: {
          actionId: 'action-receipt',
          campaign: 'campaign-receipt',
          jobId: 'job-receipt',
          stage: 'completed',
          schedulerState: 'completed',
          lastObservedAt: 20,
          terminalState: 'completed',
          artifactRefs: ['artifact-receipt'],
        },
      },
      pendingCheckpoint: {
        checkpointId: 'checkpoint-receipt',
        committedEntryId: 'entry-committed',
        questionId: 'q1',
        questionRevision: 3,
        lineSlug: 'test-line',
        commitCandidate: {
          sourceActionId: 'action-receipt',
          progressRecordedAt: 20,
          entryKind: 'result',
          authority: 'agent',
          provenance: 'agent_verification',
          rationale: 'The checked receipt result is durable.',
        },
        idempotencyKey: 'idempotency-receipt',
        persistence: 'pending_commit',
        createdAt: 30,
        receipt: {
          prepare: {
            status: 'prepared',
            id: 'draft-receipt',
            path: '/example/draft',
            idempotencyKey: 'prepare-idempotency',
            workstreams: ['example-workstream'],
          },
          save: {
            status: 'saved',
            draftPath: '/example/draft',
            path: '/example/entry',
            source: 'record_save',
          },
          postSaveCheck: {
            status: 'findings',
            errors: 1,
            warnings: 2,
            findingFingerprints: ['finding-1'],
            errorFindingFingerprints: ['error-1'],
            newErrorFindingFingerprints: ['new-error-1'],
            preExistingErrorFindingFingerprints: ['existing-error-1'],
            checkedAt: 40,
          },
        },
      },
    }));

    const compact = board.render(140).map(stripAnsi).join('\n');
    expect(compact).not.toContain('idempotency-receipt');
    expect(compact).not.toContain('job-receipt');

    board.setExpanded(true);
    const expanded = board.render(140).map(stripAnsi).join('\n');
    expect(expanded).toContain('Action references: question q1 · line test-line');
    expect(expanded).toContain('job-receipt');
    expect(expanded).toContain('Action ID: action-receipt');
    expect(expanded).toContain('Commit candidate: result · agent · agent_verification');
    expect(expanded).toContain('Candidate rationale: The checked receipt result is durable.');
    expect(expanded).toContain('Idempotency key: idempotency-receipt');
    expect(expanded).toContain('Prepare receipt: prepared · path /example/draft');
    expect(expanded).toContain('Post-save check: findings · errors 1 · warnings 2');
    expect(expanded).toContain('New error fingerprints: new-error-1');
  });

  it('compact shows one derived stale Working Note next step', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        effectiveNextStep: {
          text: 'Review active entries newer than the latest Working Note',
          source: 'aitp_maintenance',
          freshness: 'stale',
          observedAt: 10,
          derivedFrom: { lineSlug: 'test-line' },
        },
        aitpMaintenance: makeMaintenance({
          activeNewerThanWorkingNote: true,
          nextAction: 'refresh the Working Note',
        }),
      }),
    );
    const output = board.render(120).map(stripAnsi).join('\n');
    expect(output).toContain('Next: Review active entries newer than the latest Working Note');
    expect(output).not.toContain('Research reminder:');
    expect(output).not.toContain('refresh the Working Note');
  });

  it('compact surfaces historical failures as attention without audit identifiers', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        alerts: [{
          fingerprint: 'research.alert.blocked.aitp-failure.failure-1',
          kind: 'blocked',
          classification: 'historical_unresolved',
          source: 'aitp_failure',
          state: 'active',
          message: 'A historical failed attempt still needs review.',
          relatedEntryId: 'failure-1',
          workstream: 'audit-workstream',
          createdAt: 1,
        }],
        aitpMaintenance: makeMaintenance({
          status: 'degraded',
          activeNewerThanWorkingNote: true,
          unresolvedFailureCount: 1,
          nextAction: 'inspect the failure handoff',
        }),
      }),
    );
    const output = board.render(120).map(stripAnsi).join('\n');
    expect(output).toContain('A historical failed attempt still needs review.');
    expect(output).not.toContain('failure-1');
    expect(output).not.toContain('audit-workstream');
    expect(output).not.toContain('inspect the failure handoff');
  });

  it('compact shows only the primary attention item and counts the hidden remainder', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      humanGate: {
        gateId: 'gate-1',
        kind: 'approval',
        prompt: 'Approve the bounded experiment.',
        createdAt: 1,
      },
      alerts: [{
        fingerprint: 'active-blocker',
        kind: 'blocked',
        classification: 'active_blocker',
        state: 'active',
        message: 'The current experiment is blocked.',
        createdAt: 2,
      }],
      aitpMaintenance: makeMaintenance({
        status: 'degraded',
        degradedReason: 'stale_generation',
      }),
      aitpHealth: { phase: 'degraded', lastError: 'Adapter unavailable.' },
    }));

    const output = board.render(120).map(stripAnsi).join('\n');

    expect(output).toContain('Attention: Approval needed · Approve the bounded experiment. · +3 more');
    expect(output).not.toContain('The current experiment is blocked.');
    expect(output).not.toContain('Adapter unavailable.');
  });

  it('compact prioritizes a current warning over a historical unresolved alert', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      alerts: [{
        fingerprint: 'historical-alert',
        kind: 'blocked',
        classification: 'historical_unresolved',
        state: 'active',
        message: 'An earlier attempt remains unresolved.',
        createdAt: 1,
      }, {
        fingerprint: 'current-warning',
        kind: 'contradiction',
        classification: 'warning',
        state: 'active',
        message: 'The current evidence needs review.',
        createdAt: 2,
      }],
    }));

    const output = board.render(120).map(stripAnsi).join('\n');

    expect(output).toContain('Attention: The current evidence needs review. · +1 more');
    expect(output).not.toContain('An earlier attempt remains unresolved.');
  });

  it('keeps degraded maintenance detail out of compact view', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        aitpMaintenance: makeMaintenance({ status: 'degraded' }),
      }),
    );
    const compact = board.render(120).map(stripAnsi).join('\n');
    expect(compact).not.toContain('AITP maintenance degraded');
    board.setExpanded(true);
    expect(board.render(120).map(stripAnsi).join('\n')).toContain('Status: degraded');
  });

  it('compact shows an AITP handoff only through the effective next step', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        effectiveNextStep: {
          text: 'Review the latest handoff',
          source: 'aitp_maintenance',
          freshness: 'current',
          observedAt: 10,
          derivedFrom: { entryId: 'entry-hidden' },
        },
        aitpMaintenance: makeMaintenance({ nextAction: 'review the latest handoff' }),
      }),
    );
    const output = board.render(120).map(stripAnsi).join('\n');
    expect(output).toContain('Next: Review the latest handoff');
    expect(output).not.toContain('entry-hidden');
    expect(output).not.toContain('Research reminder:');
  });

  it('expanded explains the scope of a clean maintenance check', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ aitpMaintenance: makeMaintenance() }));
    board.setExpanded(true);
    const output = board.render(140).map(stripAnsi).join('\n');
    expect(output).toContain('AITP maintenance handoff');
    expect(output).toContain('Structural consistency only');
    expect(output).toContain('not a physical conclusion');
    expect(output).toContain('does not resolve historical failures');
    expect(output).toContain('Status: ready');
    expect(output).toContain('Memory: available');
    expect(output).toMatch(/Working Note: current · latest \d{4}-\d{2}-\d{2}/u);
    expect(output).toContain('Historical unresolved failures: 0');
    expect(output).toContain('Recorded handoff next: none recorded');
    expect(output).toContain('Structural check: clean · entries 2 · notes 1 · errors 0 · warnings 0');
    expect(output).not.toContain('1700000000000');
  });

  it('expanded shows historical failure identities and structural findings', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        aitpMaintenance: makeMaintenance({
          status: 'degraded',
          memoryStatus: 'partial',
          activeNewerThanWorkingNote: true,
          unresolvedFailureCount: 3,
          unresolvedFailures: [{
            entryId: 'failure-entry-1',
            kind: 'failure',
            summary: 'The first run failed before producing evidence.',
            source: '.aitp/topic/entries/failure-entry-1.md',
            authority: 'agent',
            workstream: 'example-workstream',
          }],
          nextAction: 'repair the AITP handoff',
          warningSummaries: [
            { level: 'warning', code: 'stale_working_note' },
            { level: 'warning', code: 'legacy_entry' },
          ],
          check: {
            status: 'findings',
            counts: { entries: 4, notes: 1, errors: 2, warnings: 3 },
            findingCodes: ['missing_note', 'unresolved_entry'],
          },
        }),
      }),
    );
    board.setExpanded(true);
    const output = board.render(140).map(stripAnsi).join('\n');
    expect(output).toContain('Status: degraded');
    expect(output).toContain('Memory: partial');
    expect(output).toContain('Working Note: stale — active entries are newer');
    expect(output).toContain('Historical unresolved failures: 3');
    expect(output).toContain('failure-entry-1');
    expect(output).toContain('workstream example-workstream');
    expect(output).toContain('Recorded handoff next: repair the AITP handoff');
    expect(output).toContain('Structural check: findings · entries 4 · notes 1 · errors 2 · warnings 3');
    expect(output).toContain('Warnings: stale_working_note, legacy_entry');
    expect(output).toContain('Finding codes: missing_note, unresolved_entry');
  });

  it('expanded distinguishes active blockers from historical failures', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      alerts: [{
        fingerprint: 'active-blocker',
        kind: 'blocked',
        classification: 'active_blocker',
        source: 'question',
        state: 'active',
        message: 'A current decision blocks the next experiment.',
        createdAt: 1,
      }, {
        fingerprint: 'historical-failure',
        kind: 'blocked',
        classification: 'historical_unresolved',
        source: 'aitp_failure',
        state: 'active',
        message: 'An earlier failed attempt remains open.',
        relatedEntryId: 'failure-entry-2',
        workstream: 'example-workstream',
        createdAt: 2,
      }],
    }));
    board.setExpanded(true);
    const output = board.render(140).map(stripAnsi).join('\n');
    expect(output).toContain('active blocker · A current decision blocks the next experiment.');
    expect(output).toContain('historical unresolved · An earlier failed attempt remains open.');
    expect(output).toContain('entry failure-entry-2 · workstream example-workstream');
  });

  it('truncates the Goal milestone when compact and restores every field when expanded', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      goalSummary: {
        objective: 'Determine the long-range mechanism for the crystalline response without dropping the final qualification.',
        completionCriterion: 'A converged result agrees with the stated uncertainty bound.',
        status: 'blocked',
        turnBudget: 4,
        remainingTurns: 0,
        terminalReason: 'The current evidence is insufficient.',
        waitingFor: { taskIds: ['task-a', 'task-b'], policy: 'all' },
      },
      aitpMaintenance: makeMaintenance({ status: 'degraded', degradedReason: 'stale_generation' }),
    }));
    const compactOutput = board.render(48).map(stripAnsi).join('\n');
    expect(compactOutput).toContain('Project:');
    expect(compactOutput).toContain('Goal blocked');
    expect(compactOutput).toContain('…');
    for (const row of board.render(48)) expect(visibleWidth(stripAnsi(row))).toBeLessThanOrEqual(48);

    board.setExpanded(true);
    const expandedOutput = board.render(48).map(stripAnsi).join('\n');
    const normalizedOutput = expandedOutput.replaceAll(/\s+/gu, ' ');
    expect(normalizedOutput).toContain(
      'Determine the long-range mechanism for the crystalline response without dropping the final qualification.',
    );
    expect(expandedOutput).toContain('0 turns remaining');
    expect(expandedOutput).toContain('Completion criterion:');
    expect(expandedOutput).toContain('Terminal reason:');
    expect(expandedOutput).toContain('Waiting task IDs: task-a · task-b');
    expect(expandedOutput).toContain('Degraded reason: stale generation');
  });

  it('renders the specialized Research Goal scope and persistence blockers', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      researchGoal: {
        schema: 'hakimi/research-goal-0.1',
        goalId: 'goal-research-1',
        objective: 'Validate the bounded response.',
        completionCriterion: 'The response passes the declared checks.',
        scope: {
          programTopicId: 'topic-example',
          lineSlug: 'test-line',
          questionId: 'q1',
        },
        nonGoals: [],
        budget: {
          tokenBudget: null,
          turnBudget: 4,
          wallClockBudgetMs: null,
          remainingTokens: null,
          remainingTurns: 3,
          remainingWallClockMs: null,
          tokenBudgetReached: false,
          turnBudgetReached: false,
          wallClockBudgetReached: false,
          overBudget: false,
        },
        stopConditions: [{
          code: 'research.checkpoint.pending',
          reached: true,
          reason: 'A research checkpoint is pending commit.',
        }],
        status: 'active',
        continuation: {
          state: 'held',
          owner: 'aitpResearch',
          reason: 'A research checkpoint is pending commit.',
        },
        programRelation: {
          status: 'aligned',
          reason: 'Confirmed as goal_parent_of_program.',
        },
        humanGates: [],
        persistenceGuards: [{
          code: 'research.checkpoint.pending',
          status: 'blocked',
          reason: 'A research checkpoint is pending commit.',
        }],
        researchRevision: 7,
      },
    }));

    const compactOutput = board.render(120).map(stripAnsi).join('\n');
    expect(compactOutput).toContain('Project: Goal active · continuation held');
    expect(compactOutput).not.toContain('Validate the bounded response.');
    expect(compactOutput).toContain('Continuation held by aitpResearch · A research checkpoint is pending commit.');

    board.setExpanded(true);
    const expandedOutput = board.render(120).map(stripAnsi).join('\n');
    expect(expandedOutput).toContain('Hakimi Research Goal: Validate the bounded response.');
    expect(expandedOutput).toContain('Goal status: active · continuation held');
    expect(expandedOutput).toContain('Continuation: held by aitpResearch · A research checkpoint is pending commit.');
    expect(expandedOutput).toContain('Research scope: program topic-example · line test-line · question q1');
    expect(expandedOutput).toContain('Persistence blockers:');
    expect(expandedOutput).toContain('A research checkpoint is pending commit.');
  });

  it('labels an active legacy Goal without continuation instead of inventing a state', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      goalSummary: {
        goalId: 'legacy-goal',
        objective: 'Resume the legacy bounded goal.',
        status: 'active',
      },
    }));

    const compact = board.render(160).map(stripAnsi).join('\n');
    expect(compact).toContain('Goal active · continuation unavailable (legacy snapshot)');
    expect(compact).not.toContain('continuation held');
    expect(compact).not.toContain('continuation running');

    board.setExpanded(true);
    const expanded = board.render(160).map(stripAnsi).join('\n');
    expect(expanded).toContain('Continuation: unavailable (legacy snapshot)');
  });

  it('keeps another Line action, run, gate, and next step out of compact output', () => {
    const board = new ResearchBoardComponent();
    const currentQuestion = makeSnapshot().currentQuestion!;
    board.setSnapshot(makeSnapshot({
      lines: [
        { slug: 'test-line', title: 'Current Line', status: 'active', createdAt: 1, revision: 1 },
        { slug: 'other-line', title: 'Other Line', status: 'active', createdAt: 2, revision: 1 },
      ],
      questions: [
        currentQuestion,
        { ...currentQuestion, id: 'q-other', lineSlug: 'other-line', wording: 'Other Line question' },
      ],
      currentAction: {
        actionId: 'action-other',
        questionId: 'q-other',
        lineSlug: 'other-line',
        kind: 'experiment',
        purpose: 'Other Line action',
        expectedEvidence: [],
        stopCondition: 'Other Line stop',
        allowedToolKinds: [],
        status: 'in_progress',
        createdAt: 2,
        requiresHumanApproval: false,
      },
      currentRun: {
        actionId: 'action-other',
        campaign: 'other-campaign',
        jobId: 'job-other',
        stage: 'running',
        schedulerState: 'running',
        lastObservedAt: 2,
        artifactRefs: [],
      },
      humanGate: {
        gateId: 'gate-other',
        kind: 'decision',
        questionId: 'q-other',
        actionId: 'action-other',
        prompt: 'Other Line gate',
        createdAt: 2,
      },
      effectiveNextStep: {
        text: 'Other Line next',
        source: 'research_action',
        freshness: 'current',
        observedAt: 2,
        derivedFrom: { lineSlug: 'other-line', questionId: 'q-other', actionId: 'action-other' },
      },
      currentWorkstreamBinding: {
        lineSlug: 'test-line',
        status: 'bound',
        reason: 'Explicit current Line binding.',
        binding: {
          confirmationId: 'binding-current',
          lineSlug: 'test-line',
          workstream: 'current-workstream',
          topicId: 'topic',
          observedRevision: 1,
          confirmedBy: 'user',
          confirmedAt: 1,
        },
      },
    }));

    const compact = board.render(180).map(stripAnsi).join('\n');
    expect(compact).toContain('no live action');
    expect(compact).toContain('What is the mechanism?');
    expect(compact).toContain('Next: Run experiment A');
    expect(compact).not.toContain('Other Line action');
    expect(compact).not.toContain('job-other');
    expect(compact).not.toContain('Other Line gate');
    expect(compact).not.toContain('Other Line next');
  });

  it('renders a normalized recovered action as evidence-resolution work', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      lines: [{ slug: 'test-line', title: 'Current Line', status: 'active', createdAt: 1, revision: 1 }],
      phase: 'action_executing',
      currentAction: {
        actionId: 'action-recovered',
        lineSlug: 'test-line',
        kind: 'experiment',
        purpose: 'Recovered bounded diagnostic',
        expectedEvidence: [],
        stopCondition: 'A checked terminal result exists.',
        allowedToolKinds: [],
        status: 'in_progress',
        createdAt: 1,
        requiresHumanApproval: false,
      },
      effectiveNextStep: {
        text: 'Resolve recovered action action-recovered from its recorded evidence.',
        source: 'research_action',
        freshness: 'blocked',
        observedAt: 2,
        derivedFrom: { actionId: 'action-recovered', lineSlug: 'test-line' },
      },
    }));

    const output = board.render(180).map(stripAnsi).join('\n');
    expect(output).toContain('action recovery required');
    expect(output).toContain('Action/phase recovery required');
    expect(output).toContain('Resolve recovered action action-recovered from its recorded evidence.');
  });

  it('renders both planning layers and their exact action bindings', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      researchPlanV2: {
        schema: 'hakimi/research-plan-0.2',
        planId: 'research-plan-1',
        revision: 2,
        goalId: 'goal-1',
        programId: 'topic-1',
        programObservedRevision: 1,
        goalRelation: 'goal_milestone_in_program',
        objective: 'Validate the milestone.',
        completionCriterion: 'Checks pass.',
        milestones: [{
          milestoneId: 'm1',
          title: 'Run and validate',
          objective: 'Run one calculation.',
          completionCriterion: 'Validation passes.',
          evidenceRequirements: ['Input, output, and log'],
        }],
        evidenceRequirements: ['Reproducible result'],
        decisionPoints: [],
        assumptions: ['Fixture is representative.'],
        currentMilestoneId: 'm1',
        stopConditions: ['Stop on validation failure.'],
        replanConditions: ['Replan on Program drift.'],
        status: 'active',
        createdAt: 1,
        updatedAt: 2,
      },
      researchPlan: {
        planId: 'action-plan-1',
        researchRevision: 7,
        objective: 'Run the bounded action.',
        steps: ['Run', 'Validate'],
        expectedEvidence: ['Output and log'],
        stopCondition: 'Stop after validation.',
        status: 'finalized',
        resolution: { planId: 'action-plan-1', planRevision: 1, outcome: 'approved' },
      },
      currentAction: {
        actionId: 'action-1',
        kind: 'simulation',
        purpose: 'Run the reviewed calculation.',
        expectedEvidence: ['Output and log'],
        stopCondition: 'Stop after validation.',
        allowedToolKinds: [],
        status: 'in_progress',
        createdAt: 3,
        requiresHumanApproval: false,
        researchPlanBinding: {
          planId: 'research-plan-1',
          planRevision: 2,
          milestoneId: 'm1',
        },
        actionPlanBinding: {
          schema: 'hakimi/action-plan-binding-0.1',
          kind: 'reviewed_plan',
          planId: 'action-plan-1',
          planRevision: 1,
        },
      },
    }));
    board.setExpanded(true);
    const output = board.render(140).map(stripAnsi).join('\n');
    expect(output).toContain('Multi-loop Research Plan · active · revision 2');
    expect(output).toContain('Planning policy: collaborative');
    expect(output).toContain('Action plan · finalized');
    expect(output).toContain('Research Plan binding: research-plan-1@2 · milestone m1');
    expect(output).toContain('Action Plan binding: action-plan-1@1 · reviewed_plan');
  });

  it('renders the established Research goal in compact and expanded views', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      program: {
        topicId: 'topic-example',
        title: 'Example research program',
        goalText: 'Establish a reproducible result with bounded uncertainty.',
        goalSource: 'aitp-enter',
        establishedAt: 1_700_000_000_000,
        observedRevision: 1,
      },
      goalAlignment: {
        status: 'aligned',
        reason: 'Confirmed as goal_parent_of_program.',
        binding: {
          relation: 'goal_parent_of_program',
          goalId: 'goal-example',
          topicId: 'topic-example',
          observedRevision: 1,
          confirmedAt: 1_700_000_000_001,
        },
      },
    }));

    board.setExpanded(false);
    const compactOutput = board.render(100).map(stripAnsi).join('\n');
    expect(compactOutput).not.toContain('AITP Research Goal (observed):');
    expect(compactOutput).not.toContain('Alignment: aligned');

    board.setExpanded(true);
    const expandedOutput = board.render(100).map(stripAnsi).join('\n');
    expect(expandedOutput).toContain('AITP Research Goal (observed): Establish a reproducible result with bounded uncertainty.');
    expect(expandedOutput).toContain('Goal alignment: aligned');
    expect(expandedOutput).toContain('Alignment reason: Confirmed as goal_parent_of_program.');
    expect(expandedOutput).toContain('Program provenance:');
  });

  it('keeps the absent observed Program goal out of the compact Board', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      aitpMaintenance: makeMaintenance({ memoryStatus: 'not_established' }),
    }));
    expect(board.render(100).map(stripAnsi).join('\n')).not.toContain(
      'AITP Research Goal (observed):',
    );

    board.setSnapshot(makeSnapshot());
    expect(board.render(100).map(stripAnsi).join('\n')).not.toContain(
      'AITP Research Goal (observed):',
    );
  });

  it('truncates a long milestone when compact and restores it when expanded', () => {
    const board = new ResearchBoardComponent();
    const objective = Array.from({ length: 30 }, (_, index) => `objective-${index}`).join(' ');
    board.setSnapshot(makeSnapshot({ goalSummary: { objective, status: 'active' } }));
    const compactOutput = board.render(40).map(stripAnsi).join('\n');
    expect(compactOutput).toContain('Project:');
    expect(compactOutput).toContain('…');
    expect(compactOutput).not.toContain('objective-29');

    board.setExpanded(true);
    const output = board.render(40).map(stripAnsi).join('\n');
    for (let index = 0; index < 30; index++) {
      expect(output).toContain(`objective-${index}`);
    }
    expect(output).not.toContain('…');
  });

  it('keeps zero and one-width renders within their requested width', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({
      goalSummary: { objective: '中文🧪目标', status: 'paused', remainingTurns: 0 },
    }));
    for (const width of [0, 1]) {
      for (const row of board.render(width)) {
        expect(visibleWidth(stripAnsi(row))).toBeLessThanOrEqual(width);
      }
    }
  });

  it('compact does not expose maintenance audit fields or check counts JSON', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(
      makeSnapshot({
        alerts: [{
          fingerprint: 'historical-audit-alert',
          kind: 'blocked',
          classification: 'historical_unresolved',
          source: 'aitp_failure',
          state: 'active',
          message: 'A historical failed attempt needs review.',
          relatedEntryId: 'audit-entry-id',
          workstream: 'audit-workstream',
          createdAt: 1,
        }],
        aitpMaintenance: makeMaintenance({
          refreshedAt: 1_700_123_456_789,
          workstream: 'audit-workstream',
          latestWorkingNoteAt: 1_700_123_000_000,
          activeNewerThanWorkingNote: true,
          unresolvedFailureCount: 1,
          nextAction: 'inspect audit-entry-id',
          warningSummaries: [{ level: 'warning', code: 'warning-code' }],
          check: {
            status: 'findings',
            counts: { entries: 99, notes: 88, errors: 1, warnings: 2 },
            findingCodes: ['finding-code'],
          },
        }),
      }),
    );
    const output = board.render(140).map(stripAnsi).join('\n');
    expect(output).toContain('A historical failed attempt needs review.');
    expect(output).not.toContain('1700123456789');
    expect(output).not.toContain('audit-workstream');
    expect(output).not.toContain('audit-entry-id');
    expect(output).not.toContain('warning-code');
    expect(output).not.toContain('finding-code');
    expect(output).not.toContain('counts');
  });
});
