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

  it('renders the single effective next step', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot());
    const lines = board.render(80).map(stripAnsi);
    const nextLine = lines.find((l) => l.includes('Next:'));
    expect(nextLine).toBeDefined();
    expect(nextLine).toContain('Run experiment A');
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

  it('hides acknowledged alerts while showing active attention without fingerprints', () => {
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
    expect(expandedOutput).not.toContain('resolved blocked evidence');
    expect(expandedOutput).toContain('acknowledged alerts: 1');
    expect(expandedOutput).not.toContain('acknowledged-fingerprint');
    expect(expandedOutput).not.toContain('active-fingerprint');
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
    const cpLine = expandedOutput.split('\n').find((l) => l.includes('checkpoint'));
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
    expect(output).toContain('Evidence: 2 needed · 1 found · 1 falsifiers');
    expect(output).toContain('Pending checkpoint: pending-1');
    expect(output).toContain('entry-1');
    expect(output).toContain('refresh evidence');
    expect(output).toContain('ctrl+o to collapse');
    expect(board.render(120).length).toBeLessThanOrEqual(36);
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

  it('orders active attention before the effective next step and summaries', () => {
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
    expect(indexOf('Focus:')).toBeLessThan(indexOf('Attention:'));
    expect(indexOf('Attention:')).toBeLessThan(indexOf('Next:'));
    expect(indexOf('Next:')).toBeLessThan(indexOf('Candidates (current line)'));
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
    expect(board.render(100).length).toBeLessThanOrEqual(14);
    board.setExpanded(true);
    expect(board.render(100).length).toBeLessThanOrEqual(36);
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

  it('compact shows phase and progress headline', () => {
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
    expect(output).toContain('Phase:');
    expect(output).toContain('evaluating');
    expect(output).toContain('Progress:');
    expect(output).toContain('Measured Hall conductivity matches prediction');
    expect(output).toContain('Impact:');
    expect(output).toContain('Supports the topological origin');
    expect(output).toContain('Next:');
    expect(output).toContain('Check edge state localization');
  });

  it('compact shows “本轮没有记录进展” when there is no progress', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ phase: 'orienting', latestProgress: undefined }));
    const output = board.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Phase:');
    expect(output).toContain('orienting');
    expect(output).toContain('Progress:');
    expect(output).toContain('本轮没有记录进展');
    // Impact and Next should NOT appear when there is no progress.
    expect(output).not.toContain('Impact:');
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
    expect(output).toContain('Run: job 3128781');
    expect(output).toContain('running / scf');
    expect(output).toContain('next check');
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
    // The human gate row should appear before the Focus line.
    const gateIdx = rows.findIndex((r) => r.includes('Approval needed'));
    const focusIdx = rows.findIndex((r) => r.includes('Focus:'));
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeLessThan(focusIdx);
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
    expect(output).toContain('本轮没有记录进展');
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
    expect(output).toContain('Decision needed');
    expect(output).toContain('Which branch to pursue?');
  });

  it('expanded respects row budget with full scientific detail', () => {
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
    expect(board.render(100).length).toBeLessThanOrEqual(36);
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
    expect(output).toContain('Structural check: clean · errors 0 · warnings 0');
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
            workstream: 'magnetic-symmetry',
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
    expect(output).toContain('workstream magnetic-symmetry');
    expect(output).toContain('Recorded handoff next: repair the AITP handoff');
    expect(output).toContain('Structural check: findings · errors 2 · warnings 3');
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
        workstream: 'magnetic-symmetry',
        createdAt: 2,
      }],
    }));
    board.setExpanded(true);
    const output = board.render(140).map(stripAnsi).join('\n');
    expect(output).toContain('active blocker · A current decision blocks the next experiment.');
    expect(output).toContain('historical unresolved · An earlier failed attempt remains open.');
    expect(output).toContain('entry failure-entry-2 · workstream magnetic-symmetry');
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
