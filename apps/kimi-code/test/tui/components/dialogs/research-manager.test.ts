import { describe, expect, it, vi } from 'vitest';

import {
  ResearchEditDialogComponent,
  ResearchLineEditDialogComponent,
  ResearchManagerComponent,
} from '#/tui/components/dialogs/research-manager';
import type { ResearchStatusSnapshot } from '@bhjia-phys/hakimi-sdk';

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

const ENTER = '\r';
const ESCAPE = '\u001B';

function makeQuestion(
  overrides: Partial<NonNullable<ResearchStatusSnapshot['currentQuestion']>> = {},
) {
  return {
    id: 'q1',
    lineSlug: 'line-a',
    wording: 'Question one',
    priority: 1,
    neededEvidence: ['one'],
    evidenceRefs: [],
    falsifierRefs: [],
    nextBoundedAction: 'Do thing',
    workflow: 'active' as const,
    epistemic: 'candidate' as const,
    persistence: 'working' as const,
    revision: 1,
    ...overrides,
  };
}

function makeLine(
  overrides: Partial<ResearchStatusSnapshot['lines'][number]> = {},
) {
  return {
    slug: 'line-a',
    title: 'Line A',
    objective: 'Investigate A',
    assessment: 'Promising',
    status: 'active' as const,
    createdAt: 1,
    revision: 7,
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<ResearchStatusSnapshot> = {},
): ResearchStatusSnapshot {
  const q1 = makeQuestion();
  return {
    mode: 'ready',
    loopStatus: 'active',
    planningPolicy: 'collaborative',
    currentLineSlug: 'line-a',
    currentFocus: { questionId: 'q1', revision: 1 },
    currentQuestion: q1,
    questions: [
      q1,
      makeQuestion({ id: 'q2', wording: 'Question two' }),
      makeQuestion({ id: 'q3', lineSlug: 'line-b', wording: 'Question three' }),
    ],
    lines: [
      makeLine(),
      makeLine({ slug: 'line-b', title: 'Line B', status: 'paused', revision: 3 }),
      makeLine({ slug: 'line-c', title: 'Line C', assessment: undefined, revision: 2 }),
    ],
    openQuestionCount: 2,
    activeQuestionCount: 1,
    blockedQuestionCount: 0,
    alerts: [],
    lineWorkstreamBindings: [],
    aitpHealth: { phase: 'ready' },
    phase: 'action_executing',
    revision: 9,
    ...overrides,
  };
}

function makeResearchPlanV2(
  status: 'draft' | 'active' | 'completed' | 'discarded' = 'active',
): NonNullable<ResearchStatusSnapshot['researchPlanV2']> {
  return {
    schema: 'hakimi/research-plan-0.2',
    planId: 'research-plan-1',
    revision: 2,
    goalId: 'goal-1',
    programId: 'topic-1',
    programObservedRevision: 1,
    goalRelation: 'goal_milestone_in_program',
    objective: 'Validate one program milestone.',
    completionCriterion: 'The declared checks pass.',
    milestones: [{
      milestoneId: 'm1',
      title: 'Run and validate',
      objective: 'Execute one bounded calculation.',
      completionCriterion: 'The output passes validation.',
      evidenceRequirements: ['Input, output, and validation log'],
    }],
    evidenceRequirements: ['A reproducible result'],
    decisionPoints: [],
    assumptions: [],
    currentMilestoneId: 'm1',
    stopConditions: ['Stop on validation failure.'],
    replanConditions: ['Replan on Program drift.'],
    status,
    createdAt: 1,
    updatedAt: 2,
  };
}

describe('ResearchManagerComponent', () => {
  it('renders line title, slug, status, question counts, assessment, and current marker', () => {
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot(),
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });
    const lines = manager.render(120).map(stripAnsi);
    const line = lines.find((item) => item.includes('Line A'));
    expect(line).toBeDefined();
    expect(line).toContain('line-a');
    expect(line).toContain('active');
    expect(line).toContain('questions 2');
    expect(line).toContain('assessment: Promising');
    expect(line).toContain('← current');
  });

  it('marks the selected line with SELECT_POINTER', () => {
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot(),
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });
    expect(manager.render(100).map(stripAnsi).some((line) => line.includes('❯'))).toBe(true);
  });

  it('enters a line question list and excludes questions from other lines', () => {
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot(),
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });
    manager.handleInput(ENTER);
    const output = manager.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Questions · Line A (line-a)');
    expect(output).toContain('Question one');
    expect(output).toContain('Question two');
    expect(output).not.toContain('Question three');
  });

  it('Esc returns from questions to lines and then closes', () => {
    const onCancel = vi.fn();
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot(),
      onAction: vi.fn(),
      onCancel,
    });
    manager.handleInput(ENTER);
    manager.handleInput(ESCAPE);
    expect(manager.render(100).map(stripAnsi).join('\n')).toContain('Research lines');
    expect(onCancel).not.toHaveBeenCalled();
    manager.handleInput(ESCAPE);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('restores the question layer and selection when initialized from an edit return', () => {
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot(),
      selectedLineSlug: 'line-b',
      selectedQuestionId: 'q3',
      initialView: 'questions',
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });
    const questions = manager.render(100).map(stripAnsi).join('\n');
    expect(questions).toContain('Questions · Line B (line-b)');
    expect(questions).toContain('Question three');
    manager.handleInput(ESCAPE);
    const lines = manager.render(100).map(stripAnsi).join('\n');
    expect(lines).toContain('Research lines');
    expect(lines).toContain('❯ Line B');
  });

  it('supports line S/P/B/C/R/E actions', async () => {
    const onAction = vi.fn();
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot(),
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput('s');
    expect(onAction).toHaveBeenCalledWith({
      kind: 'switch_line',
      lineSlug: 'line-a',
      expectedRevision: 9,
    });
    await Promise.resolve();
    onAction.mockClear();
    manager.handleInput('p');
    expect(onAction).toHaveBeenCalledWith({
      kind: 'pause_loop',
      lineSlug: 'line-a',
      expectedRevision: 9,
    });
    await Promise.resolve();
    onAction.mockClear();
    manager.handleInput('b');
    expect(onAction).toHaveBeenCalledWith({
      kind: 'update_line',
      lineSlug: 'line-a',
      expectedRevision: 7,
      status: 'blocked',
    });
    await Promise.resolve();
    onAction.mockClear();
    manager.handleInput('c');
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'update_line', status: 'completed' }));
    await Promise.resolve();
    onAction.mockClear();
    manager.handleInput('r');
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'update_line', status: 'active' }));
    await Promise.resolve();
    onAction.mockClear();
    manager.handleInput('e');
    expect(onAction).toHaveBeenCalledWith({ kind: 'edit_line', lineSlug: 'line-a' });
  });

  it('uses resume action when the loop is paused', () => {
    const onAction = vi.fn();
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({ loopStatus: 'paused' }),
      onAction,
      onCancel: vi.fn(),
    });
    manager.handleInput('p');
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'resume_loop' }));
  });

  it('opens the multi-loop plan view and sends exact lifecycle revisions', async () => {
    const onAction = vi.fn();
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({ researchPlanV2: makeResearchPlanV2('draft') }),
      onAction,
      onCancel: vi.fn(),
    });
    manager.handleInput('v');
    const output = manager.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Multi-loop Research Plan');
    expect(output).toContain('research-plan-1 · draft · revision 2');
    expect(output).toContain('Run and validate');
    manager.handleInput('a');
    expect(onAction).toHaveBeenCalledWith({
      kind: 'activate_plan_v2',
      planId: 'research-plan-1',
      expectedRevision: 2,
    });
    await Promise.resolve();

    const activeAction = vi.fn();
    const active = new ResearchManagerComponent({
      snapshot: makeSnapshot({ researchPlanV2: makeResearchPlanV2('active') }),
      initialView: 'plan',
      onAction: activeAction,
      onCancel: vi.fn(),
    });
    active.handleInput('c');
    expect(activeAction).toHaveBeenCalledWith({
      kind: 'complete_plan_v2',
      planId: 'research-plan-1',
      expectedRevision: 2,
    });
    await Promise.resolve();
    activeAction.mockClear();
    active.handleInput('d');
    expect(activeAction).toHaveBeenCalledWith({
      kind: 'discard_plan_v2',
      planId: 'research-plan-1',
      expectedRevision: 2,
    });
    await Promise.resolve();
    active.handleInput(ESCAPE);
    expect(active.render(100).map(stripAnsi).join('\n')).toContain('Research lines');
  });

  it('renders and switches the planning policy from the plan view', () => {
    const onAction = vi.fn();
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({ planningPolicy: 'collaborative' }),
      initialView: 'plan',
      onAction,
      onCancel: vi.fn(),
    });
    expect(manager.render(100).map(stripAnsi).join('\n')).toContain(
      'Planning policy: collaborative',
    );
    manager.handleInput('p');
    expect(onAction).toHaveBeenCalledWith({
      kind: 'set_planning_policy',
      policy: 'dreaming',
      expectedRevision: 9,
    });
  });

  it('supports question F/E/D/B/C/R actions inside the selected line', async () => {
    const onAction = vi.fn();
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot(),
      onAction,
      onCancel: vi.fn(),
    });
    manager.handleInput(ENTER);

    manager.handleInput('f');
    expect(onAction).toHaveBeenCalledWith({
      kind: 'focus',
      questionId: 'q1',
      boundedAction: 'Do thing',
    });
    await Promise.resolve();
    onAction.mockClear();
    manager.handleInput('e');
    expect(onAction).toHaveBeenCalledWith({ kind: 'edit', questionId: 'q1' });
    onAction.mockClear();
    manager.handleInput('d');
    expect(onAction).toHaveBeenCalledWith({ kind: 'defer', questionId: 'q1', reason: undefined });
    await Promise.resolve();
    onAction.mockClear();
    manager.handleInput('b');
    expect(onAction).toHaveBeenCalledWith({ kind: 'block', questionId: 'q1', reason: undefined });
    await Promise.resolve();
    onAction.mockClear();
    manager.handleInput('c');
    expect(onAction).toHaveBeenCalledWith({ kind: 'close', questionId: 'q1', reason: undefined });
    await Promise.resolve();
    onAction.mockClear();
    manager.handleInput('r');
    expect(onAction).toHaveBeenCalledWith({ kind: 'reopen', questionId: 'q1', reason: undefined });
  });

  it('starts in attention view, hides identifiers, and resolves a human gate', async () => {
    const gate = {
      gateId: 'gate-1',
      kind: 'decision' as const,
      prompt: 'Choose the next experiment for sample B.',
      createdAt: 10,
    };
    const alert = {
      fingerprint: 'alert-fingerprint',
      kind: 'contradiction' as const,
      message: 'A contradiction needs review.',
      createdAt: 11,
    };
    const onAction = vi.fn(async () => makeSnapshot({
      humanGate: { ...gate, resolvedAt: 12, resolution: 'approved' },
      alerts: [alert],
    }));
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({ humanGate: gate, alerts: [alert] }),
      initialView: 'attention',
      onAction,
      onCancel: vi.fn(),
    });

    const initialOutput = manager.render(100).map(stripAnsi).join('\n');
    expect(initialOutput).toContain('Research attention');
    expect(initialOutput).toContain('Choose the next experiment for sample B.');
    expect(initialOutput).toContain('A contradiction needs review.');
    expect(initialOutput).not.toContain('gate-1');
    expect(initialOutput).not.toContain('alert-fingerprint');

    manager.handleInput('r');
    manager.handleInput('approved');
    manager.handleInput(ENTER);
    const phaseOutput = manager.render(100).map(stripAnsi).join('\n');
    expect(phaseOutput).toContain('Recovery phase:');
    for (const label of ['Idle', 'Gap analysis', 'Action planned', 'Action executing', 'Evaluating']) {
      expect(phaseOutput).toContain(label);
    }
    expect(phaseOutput).not.toContain('awaiting_human');

    manager.handleInput(ENTER);
    await vi.waitFor(() => expect(onAction).toHaveBeenCalledOnce());
    expect(onAction).toHaveBeenCalledWith({
      kind: 'resolve_human_decision',
      gateId: 'gate-1',
      resolution: 'approved',
      nextPhase: 'idle',
    });
  });

  it('acknowledges the selected alert and returns to lines when cleared', async () => {
    const alert = {
      fingerprint: 'alert-fingerprint',
      kind: 'stale' as const,
      message: 'Refresh the stale evidence.',
      createdAt: 11,
    };
    const onAction = vi.fn(async () => makeSnapshot({
      alerts: [{ ...alert, acknowledgedAt: 12 }],
    }));
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({ alerts: [alert] }),
      initialView: 'attention',
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput('a');
    await vi.waitFor(() => expect(onAction).toHaveBeenCalledOnce());
    expect(onAction).toHaveBeenCalledWith({
      kind: 'acknowledge_alert',
      fingerprint: 'alert-fingerprint',
    });
    expect(manager.render(100).map(stripAnsi).join('\n')).toContain('Research lines');
  });

  it('requires an observed Topic and emits an explicit revisioned workstream binding', async () => {
    const onAction = vi.fn(async () => makeSnapshot());
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({
        program: {
          topicId: 'topic-1',
          title: 'Observed AITP Topic',
          goalText: 'Validate one bounded result.',
          goalSource: 'aitp-enter',
          establishedAt: 1,
          observedRevision: 3,
        },
      }),
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput('w');
    const bindingView = manager.render(100).map(stripAnsi).join('\n');
    expect(bindingView).toContain('Observed Topic: topic-1 · Observed AITP Topic · revision 3');
    expect(bindingView).toContain('Matching slugs never imply membership.');
    for (const character of 'abacus-rpa') manager.handleInput(character);
    manager.handleInput(ENTER);

    await vi.waitFor(() => expect(onAction).toHaveBeenCalledOnce());
    expect(onAction).toHaveBeenCalledWith({
      kind: 'confirm_line_workstream_binding',
      lineSlug: 'line-a',
      workstream: 'abacus-rpa',
      expectedRevision: 9,
    });
  });

  it('clears only an existing explicit line binding at the current Research revision', async () => {
    const binding = {
      confirmationId: 'confirmation-line-a-1',
      lineSlug: 'line-a',
      workstream: 'abacus-rpa',
      topicId: 'topic-1',
      observedRevision: 3,
      confirmedBy: 'user' as const,
      confirmedAt: 2,
    };
    const onAction = vi.fn(async () => makeSnapshot());
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({ lineWorkstreamBindings: [binding] }),
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput('x');
    await vi.waitFor(() => expect(onAction).toHaveBeenCalledOnce());
    expect(onAction).toHaveBeenCalledWith({
      kind: 'clear_line_workstream_binding',
      lineSlug: 'line-a',
      expectedConfirmationId: binding.confirmationId,
      expectedRevision: 9,
    });
  });

  it('clears a current conflict binding exposed only by the alignment recovery surface', async () => {
    const malformed = {
      confirmationId: 'confirmation-legacy-1',
      lineSlug: 'line-b',
      workstream: 'legacy-workstream',
      topicId: 'topic-1',
      observedRevision: 3,
      confirmedBy: 'user' as const,
      confirmedAt: 2,
    };
    const onAction = vi.fn(async () => makeSnapshot());
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({
        lineWorkstreamBindings: [],
        currentWorkstreamBinding: {
          lineSlug: 'line-a',
          status: 'conflict',
          reason: 'Persisted map key and embedded Line disagree.',
          binding: malformed,
        },
      }),
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput('x');

    await vi.waitFor(() => expect(onAction).toHaveBeenCalledOnce());
    expect(onAction).toHaveBeenCalledWith({
      kind: 'clear_line_workstream_binding',
      lineSlug: 'line-a',
      expectedConfirmationId: malformed.confirmationId,
      expectedRevision: 9,
    });
  });

  it('derives stale and conflicting bindings for non-current lines', () => {
    const currentBinding = {
      confirmationId: 'confirmation-line-a-1',
      lineSlug: 'line-a',
      workstream: 'current-workstream',
      topicId: 'topic-1',
      observedRevision: 4,
      confirmedBy: 'user' as const,
      confirmedAt: 10,
    };
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({
        program: {
          topicId: 'topic-1',
          title: 'Current Topic',
          goalText: 'Validate the current Topic.',
          goalSource: 'aitp-enter',
          establishedAt: 1,
          observedRevision: 4,
        },
        lineWorkstreamBindings: [
          currentBinding,
          {
            confirmationId: 'confirmation-line-b-1',
            lineSlug: 'line-b',
            workstream: 'stale-workstream',
            topicId: 'topic-1',
            observedRevision: 3,
            confirmedBy: 'main_agent',
            confirmedAt: 11,
          },
          {
            confirmationId: 'confirmation-line-c-1',
            lineSlug: 'line-c',
            workstream: 'conflict-workstream',
            topicId: 'topic-2',
            observedRevision: 4,
            confirmedBy: 'user',
            confirmedAt: 12,
          },
        ],
        currentWorkstreamBinding: {
          lineSlug: 'line-a',
          status: 'conflict',
          reason: 'Keep the coordinator-provided current alignment.',
          binding: currentBinding,
        },
      }),
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });

    const output = manager.render(180).map(stripAnsi).join('\n');
    expect(output).toContain('AITP conflict:current-workstream');
    expect(output).toContain('AITP stale:stale-workstream');
    expect(output).toContain('AITP conflict:conflict-workstream');
    expect(output).not.toContain('AITP confirmed');
  });

  it('shows an empty question state for a line without questions', () => {
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot(),
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });
    manager.handleInput('\u001B[B');
    manager.handleInput('\u001B[B');
    manager.handleInput(ENTER);
    expect(manager.render(100).map(stripAnsi).some((line) => line.includes('No questions for this line.'))).toBe(true);
  });

  it('truncates line rows for a narrow terminal', () => {
    const manager = new ResearchManagerComponent({
      snapshot: makeSnapshot({ lines: [makeLine({ title: 'A'.repeat(120) })] }),
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });
    for (const line of manager.render(24).map(stripAnsi)) {
      expect(line.length).toBeLessThanOrEqual(24);
    }
  });
});

describe('ResearchEditDialogComponent', () => {
  it('renders and pre-fills question assessment', () => {
    const question = makeQuestion({ wording: 'My wording', assessment: 'Needs data', priority: 5 });
    const dialog = new ResearchEditDialogComponent({ question, onDone: vi.fn() });
    const output = dialog.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Edit question q1');
    expect(output).toContain('My wording');
    expect(output).toContain('Needs data');
    expect(output).toContain('5');
  });

  it('cancels on Esc', () => {
    const onDone = vi.fn();
    const dialog = new ResearchEditDialogComponent({ question: makeQuestion(), onDone });
    dialog.handleInput(ESCAPE);
    expect(onDone).toHaveBeenCalledWith({
      kind: 'cancel',
      questionId: 'q1',
      lineSlug: 'line-a',
    });
  });

  it('ignores an unhandled CSI key instead of inserting it into wording', () => {
    const onDone = vi.fn();
    const dialog = new ResearchEditDialogComponent({
      question: makeQuestion({ wording: '' }),
      onDone,
    });
    dialog.handleInput('\u001B[999~');
    expect(dialog.render(80).map(stripAnsi).join('\n')).not.toContain('999');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('validates empty wording and strict integer priority', () => {
    const onDone = vi.fn();
    const dialog = new ResearchEditDialogComponent({
      question: makeQuestion({ wording: '' }),
      onDone,
    });
    for (let index = 0; index < 3; index++) dialog.handleInput('\t');
    dialog.handleInput(ENTER);
    expect(dialog.render(80).map(stripAnsi).join('\n')).toContain('Wording must not be empty.');

    const priorityDialog = new ResearchEditDialogComponent({
      question: makeQuestion(),
      onDone,
    });
    priorityDialog.handleInput('\t');
    priorityDialog.handleInput('\t');
    priorityDialog.handleInput('\b');
    priorityDialog.handleInput('1');
    priorityDialog.handleInput('.');
    priorityDialog.handleInput('5');
    priorityDialog.handleInput('\t');
    priorityDialog.handleInput(ENTER);
    expect(priorityDialog.render(80).map(stripAnsi).join('\n')).toContain(
      'Priority must be a finite integer.',
    );
  });

  it('keeps fields editable after an async save failure and allows cancel', async () => {
    const save = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce(undefined);
    const dialog = new ResearchEditDialogComponent({
      question: makeQuestion(),
      onDone: () => save(),
    });
    for (let index = 0; index < 3; index++) dialog.handleInput('\t');
    dialog.handleInput(ENTER);
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledOnce();
    });
    expect(dialog.render(80).map(stripAnsi).join('\n')).toContain('save failed');
    dialog.handleInput(ESCAPE);
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ResearchLineEditDialogComponent', () => {
  it('renders line fields and cancels on Esc', () => {
    const onDone = vi.fn();
    const dialog = new ResearchLineEditDialogComponent({ line: makeLine(), onDone });
    const output = dialog.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Edit line line-a');
    expect(output).toContain('Investigate A');
    expect(output).toContain('Promising');
    dialog.handleInput(ESCAPE);
    expect(onDone).toHaveBeenCalledWith({ kind: 'cancel', lineSlug: 'line-a' });
  });
});
