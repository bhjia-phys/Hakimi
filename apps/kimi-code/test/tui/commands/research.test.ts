import { describe, expect, it, vi } from 'vitest';

import {
  handleResearchCommand,
  parseResearchCommand,
} from '#/tui/commands/research';
import {
  ResearchEditDialogComponent,
  ResearchManagerComponent,
} from '#/tui/components/dialogs/research-manager';
import type { ResearchStatusSnapshot } from '@bhjia-phys/hakimi-sdk';

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function makeSnapshot(
  overrides: Partial<ResearchStatusSnapshot> = {},
): ResearchStatusSnapshot {
  const line = {
    slug: 'line-a',
    title: 'Line A',
    objective: 'Investigate A',
    status: 'active' as const,
    createdAt: 1,
    revision: 4,
  };
  return {
    mode: 'ready',
    loopStatus: 'active',
    planningPolicy: 'collaborative',
    currentLineSlug: 'line-a',
    questions: [],
    lines: [line],
    openQuestionCount: 0,
    activeQuestionCount: 0,
    blockedQuestionCount: 0,
    alerts: [],
    lineWorkstreamBindings: [],
    aitpHealth: { phase: 'ready' },
    phase: 'action_executing',
    revision: 8,
    ...overrides,
  };
}

function makeResearchHost(snapshot: ResearchStatusSnapshot = makeSnapshot()) {
  let generation = 0;
  const session = {
    getResearch: vi.fn(async () => snapshot),
    commandResearch: vi.fn(async () => ({ snapshot })),
  };
  const researchController = {
    beginRequest: vi.fn(() => ({ session, generation: ++generation })),
    applySnapshot: vi.fn(() => true),
    setSnapshot: vi.fn(),
  };
  const mounted = vi.fn();
  const host = {
    state: {
      appState: { permissionMode: 'auto' },
      researchBoard: {
        getSnapshotRevision: () => snapshot.mode === 'inactive' ? undefined : snapshot.revision,
        getSnapshot: () => snapshot,
      },
      editor: { getText: vi.fn(() => '') },
      editorReplacementMounted: false,
      transcriptContainer: { addChild: vi.fn() },
      ui: { requestRender: vi.fn() },
    },
    session,
    requireSession: () => session,
    researchController,
    mountEditorReplacement: mounted,
    restoreEditor: vi.fn(),
    restoreInputText: vi.fn(),
    sendNormalUserInput: vi.fn(),
    setAppState: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    showNotice: vi.fn(),
    track: vi.fn(),
  } as unknown as Parameters<typeof handleResearchCommand>[0];
  return { host, session, researchController, mounted };
}

describe('parseResearchCommand', () => {
  it('requires an explicit result and Line for local-conclusion adoption', () => {
    expect(parseResearchCommand('adopt-conclusion result-1 line-a')).toEqual({
      kind: 'adopt_conclusion', localConclusionId: 'result-1', lineSlug: 'line-a', questionId: undefined,
    });
    expect(parseResearchCommand('adopt-conclusion result-1 line-a q-1')).toEqual({
      kind: 'adopt_conclusion', localConclusionId: 'result-1', lineSlug: 'line-a', questionId: 'q-1',
    });
    for (const text of ['adopt-conclusion', 'adopt-conclusion result-1', 'adopt-conclusion r l q extra']) {
      expect(parseResearchCommand(text)).toMatchObject({ kind: 'error', restoreInput: true });
    }
  });
  it('parses empty args as a mode toggle', () => {
    expect(parseResearchCommand('')).toEqual({ kind: 'toggle' });
    expect(parseResearchCommand('   ')).toEqual({ kind: 'toggle' });
  });

  it('parses explicit status', () => {
    expect(parseResearchCommand('status')).toEqual({ kind: 'status' });
  });

  it('parses explicit Goal alignment confirmation and clearing', () => {
    expect(parseResearchCommand('align goal_parent_of_program')).toEqual({
      kind: 'align',
      relation: 'goal_parent_of_program',
    });
    expect(parseResearchCommand('align clear')).toEqual({ kind: 'clear_alignment' });
  });

  it('rejects Goal alignment without an explicit relation', () => {
    const result = parseResearchCommand('align');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.restoreInput).toBe(true);
  });

  it('parses on without line slug', () => {
    expect(parseResearchCommand('on')).toEqual({ kind: 'on' });
  });

  it('parses on with line slug via --', () => {
    expect(parseResearchCommand('on -- my-line')).toEqual({
      kind: 'on',
      lineSlug: 'my-line',
    });
  });

  it('parses on with empty line slug as undefined', () => {
    expect(parseResearchCommand('on --')).toEqual({
      kind: 'on',
      lineSlug: undefined,
    });
  });

  it('returns error for unexpected arguments after on', () => {
    const result = parseResearchCommand('on garbage');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.restoreInput).toBe(true);
  });

  it('parses off', () => {
    expect(parseResearchCommand('off')).toEqual({ kind: 'off' });
  });

  it('parses pause', () => {
    expect(parseResearchCommand('pause')).toEqual({ kind: 'pause' });
  });

  it('parses resume', () => {
    expect(parseResearchCommand('resume')).toEqual({ kind: 'resume' });
  });

  it('parses manage', () => {
    expect(parseResearchCommand('manage')).toEqual({ kind: 'manage' });
  });

  it('parses a historical checkpoint discard with its exact id', () => {
    expect(parseResearchCommand('discard-checkpoint checkpoint-123')).toEqual({
      kind: 'discard_checkpoint',
      checkpointId: 'checkpoint-123',
    });
  });

  it('rejects a checkpoint discard without exactly one id', () => {
    expect(parseResearchCommand('discard-checkpoint').kind).toBe('error');
    expect(parseResearchCommand('discard-checkpoint one two').kind).toBe('error');
  });

  it('parses line with slug', () => {
    expect(parseResearchCommand('line my-line')).toEqual({
      kind: 'line',
      slug: 'my-line',
    });
  });

  it('parses line with multi-word slug', () => {
    expect(parseResearchCommand('line my multi slug')).toEqual({
      kind: 'line',
      slug: 'my multi slug',
    });
  });

  it('returns hint error for line without slug', () => {
    const result = parseResearchCommand('line');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.severity).toBe('hint');
  });

  it('parses edit with questionId and wording', () => {
    expect(parseResearchCommand('edit q1 -- new wording')).toEqual({
      kind: 'edit',
      questionId: 'q1',
      wording: 'new wording',
    });
  });

  it('parses edit with multi-word wording', () => {
    expect(parseResearchCommand('edit q1 -- some long wording text')).toEqual({
      kind: 'edit',
      questionId: 'q1',
      wording: 'some long wording text',
    });
  });

  it('returns error for edit without --', () => {
    const result = parseResearchCommand('edit q1 new wording');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.restoreInput).toBe(true);
  });

  it('returns a restorable error for edit without questionId', () => {
    const result = parseResearchCommand('edit -- new wording');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.severity).toBe('hint');
      expect(result.restoreInput).toBe(true);
    }
  });

  it('parses focus with questionId and bounded action', () => {
    expect(parseResearchCommand('focus q1 -- investigate X')).toEqual({
      kind: 'focus',
      questionId: 'q1',
      boundedAction: 'investigate X',
    });
  });

  it('returns error for focus without --', () => {
    const result = parseResearchCommand('focus q1 investigate X');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.restoreInput).toBe(true);
  });

  it('rejects tokens between the question ID and -- for every question action', () => {
    for (const subcommand of ['edit', 'focus', 'defer', 'block', 'close', 'reopen']) {
      const result = parseResearchCommand(`${subcommand} q1 unexpected -- text`);
      expect(result.kind).toBe('error');
      if (result.kind === 'error') expect(result.restoreInput).toBe(true);
    }
  });

  it('rejects extra reason tokens without -- for question state actions', () => {
    for (const subcommand of ['defer', 'block', 'close', 'reopen']) {
      const result = parseResearchCommand(`${subcommand} q1 unexpected`);
      expect(result.kind).toBe('error');
      if (result.kind === 'error') expect(result.restoreInput).toBe(true);
    }
  });

  it('parses defer with reason', () => {
    expect(parseResearchCommand('defer q1 -- waiting on data')).toEqual({
      kind: 'defer',
      questionId: 'q1',
      reason: 'waiting on data',
    });
  });

  it('parses defer without reason (no --)', () => {
    expect(parseResearchCommand('defer q1')).toEqual({
      kind: 'defer',
      questionId: 'q1',
      reason: undefined,
    });
  });

  it('parses block with reason', () => {
    expect(parseResearchCommand('block q1 -- contradiction found')).toEqual({
      kind: 'block',
      questionId: 'q1',
      reason: 'contradiction found',
    });
  });

  it('parses close with reason', () => {
    expect(parseResearchCommand('close q1 -- resolved')).toEqual({
      kind: 'close',
      questionId: 'q1',
      reason: 'resolved',
    });
  });

  it('parses close without reason', () => {
    expect(parseResearchCommand('close q1')).toEqual({
      kind: 'close',
      questionId: 'q1',
      reason: undefined,
    });
  });

  it('parses reopen with reason', () => {
    expect(parseResearchCommand('reopen q1 -- new evidence')).toEqual({
      kind: 'reopen',
      questionId: 'q1',
      reason: 'new evidence',
    });
  });

  it('parses reopen without reason', () => {
    expect(parseResearchCommand('reopen q1')).toEqual({
      kind: 'reopen',
      questionId: 'q1',
      reason: undefined,
    });
  });

  it('returns a restorable error for defer/block/close/reopen without questionId', () => {
    for (const sub of ['defer', 'block', 'close', 'reopen']) {
      const result = parseResearchCommand(sub);
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.severity).toBe('hint');
        expect(result.restoreInput).toBe(true);
      }
    }
  });

  it('returns error for unknown subcommand', () => {
    const result = parseResearchCommand('foobar');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.restoreInput).toBe(true);
  });

  it('returns error for edit with empty text after --', () => {
    const result = parseResearchCommand('edit q1 --');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.restoreInput).toBe(true);
  });

  it('returns error for focus with empty text after --', () => {
    const result = parseResearchCommand('focus q1 --');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.restoreInput).toBe(true);
  });
});

describe('handleResearchCommand manager actions', () => {
  it('uses bare /research to enter an inactive mode', async () => {
    const snapshot = makeSnapshot({ mode: 'inactive', aitpHealth: { phase: 'inactive' } });
    const { host, session } = makeResearchHost(snapshot);

    await handleResearchCommand(host, '');

    expect(session.getResearch).toHaveBeenCalledOnce();
    expect(session.commandResearch).toHaveBeenCalledWith({
      kind: 'enter_mode',
      actor: 'user',
    });
  });

  it('uses bare /research to exit an active mode', async () => {
    const snapshot = makeSnapshot({ mode: 'ready' });
    const { host, session } = makeResearchHost(snapshot);

    await handleResearchCommand(host, '');

    expect(session.getResearch).toHaveBeenCalledOnce();
    expect(session.commandResearch).toHaveBeenCalledWith({ kind: 'exit_mode' });
  });

  it('sends a historical checkpoint discard with the current snapshot revision', async () => {
    const snapshot = makeSnapshot({ revision: 13 });
    const { host, session } = makeResearchHost(snapshot);

    await handleResearchCommand(host, 'discard-checkpoint checkpoint-123');

    expect(session.commandResearch).toHaveBeenCalledWith({
      kind: 'discard_historical_checkpoint',
      checkpointId: 'checkpoint-123',
      expectedRevision: 13,
    });
    expect(host.showStatus).toHaveBeenCalledWith(
      'Historical checkpoint proposal checkpoint-123 discarded; AITP was unchanged.',
    );
  });

  it('sends explicit ownership adoption at the freshly observed revision, without rewriting the result', async () => {
    const { host, session } = makeResearchHost(makeSnapshot({ revision: 13 }));
    await handleResearchCommand(host, 'adopt-conclusion result-1 line-a q-1');
    expect(session.getResearch).toHaveBeenCalledOnce();
    expect(session.commandResearch).toHaveBeenCalledExactlyOnceWith({
      kind: 'propose_checkpoint', localConclusionId: 'result-1', confirmedBy: 'user',
      lineSlug: 'line-a', questionId: 'q-1', expectedRevision: 13,
    });
    expect(host.showStatus).toHaveBeenCalledWith(
      'Local conclusion adopted into a scoped checkpoint; AITP has not been written yet.',
    );
  });

  it('does not report adoption success or retry when the server rejects stale ownership', async () => {
    const { host, session } = makeResearchHost();
    session.commandResearch.mockRejectedValueOnce(new Error('Stale captured Question revision'));
    await handleResearchCommand(host, 'adopt-conclusion result-1 line-a');
    expect(session.commandResearch).toHaveBeenCalledOnce();
    expect(host.showStatus).not.toHaveBeenCalled();
    expect(host.showError).toHaveBeenCalledWith(expect.stringContaining('Stale captured Question revision'));
  });

  it('does not adopt after the snapshot response belongs to an obsolete session request', async () => {
    const { host, session, researchController } = makeResearchHost();
    researchController.applySnapshot.mockReturnValueOnce(false);
    await handleResearchCommand(host, 'adopt-conclusion result-1 line-a');
    expect(session.commandResearch).not.toHaveBeenCalled();
    expect(host.showStatus).not.toHaveBeenCalled();
  });

  it('sends explicit Goal alignment commands with checkpoint identities', async () => {
    const snapshot = makeSnapshot({
      goalSummary: { goalId: 'goal-1', objective: 'Parent goal', status: 'active' },
      program: {
        topicId: 'topic-1',
        title: 'Observed topic',
        goalText: 'Bounded research goal',
        goalSource: 'aitp-enter',
        establishedAt: 1,
        observedRevision: 3,
      },
    });
    const { host, session } = makeResearchHost(snapshot);

    await handleResearchCommand(host, 'align goal_parent_of_program');
    expect(session.commandResearch).toHaveBeenNthCalledWith(1, {
      kind: 'confirm_goal_alignment',
      relation: 'goal_parent_of_program',
      expectedRevision: snapshot.revision,
      goalId: 'goal-1',
      topicId: 'topic-1',
      observedRevision: 3,
    });

    await handleResearchCommand(host, 'align clear');
    expect(session.commandResearch).toHaveBeenNthCalledWith(2, {
      kind: 'clear_goal_alignment',
      expectedRevision: snapshot.revision,
      goalId: 'goal-1',
      topicId: 'topic-1',
      observedRevision: 3,
    });
  });

  it('restores malformed question action input without sending a command', async () => {
    const { host, session } = makeResearchHost();

    await handleResearchCommand(host, 'defer q1 extra -- reason');

    expect(host.showError).toHaveBeenCalled();
    expect(host.restoreInputText).toHaveBeenCalledWith(
      '/research defer q1 extra -- reason',
    );
    expect(session.commandResearch).not.toHaveBeenCalled();
  });

  it('sends typed switch_line and update_line commands', async () => {
    const snapshot = makeSnapshot();
    const commandResearch = vi.fn(async () => ({ snapshot }));
    const mounted = vi.fn();
    const session = {
      getResearch: vi.fn(async () => snapshot),
      commandResearch,
    };
    let generation = 0;
    const host = {
      state: {
        appState: { permissionMode: 'auto' },
        researchBoard: {
          getSnapshotRevision: () => snapshot.revision,
          getSnapshot: () => snapshot,
        },
      },
      session,
      requireSession: () => session,
      researchController: {
        beginRequest: vi.fn(() => ({ session, generation: ++generation })),
        applySnapshot: vi.fn(() => true),
        setSnapshot: vi.fn(),
      },
      mountEditorReplacement: mounted,
      restoreEditor: vi.fn(),
      showError: vi.fn(),
      showStatus: vi.fn(),
      showNotice: vi.fn(),
      track: vi.fn(),
    } as unknown as Parameters<typeof handleResearchCommand>[0];

    await handleResearchCommand(host, 'manage');
    expect(mounted).toHaveBeenCalledOnce();
    const manager = mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    expect(manager).toBeInstanceOf(ResearchManagerComponent);
    manager.handleInput('s');
    await vi.waitFor(() => {
      expect(commandResearch).toHaveBeenCalledTimes(1);
    });
    expect(commandResearch).toHaveBeenNthCalledWith(1, {
      kind: 'switch_line',
      lineSlug: 'line-a',
      expectedRevision: snapshot.revision,
    });

    await handleResearchCommand(host, 'manage');
    const refreshedManager = mounted.mock.calls[1]?.[0] as ResearchManagerComponent;
    refreshedManager.handleInput('b');
    await vi.waitFor(() => {
      expect(commandResearch).toHaveBeenCalledTimes(2);
    });
    expect(commandResearch).toHaveBeenNthCalledWith(2, {
      kind: 'update_line',
      lineSlug: 'line-a',
      expectedRevision: 4,
      title: undefined,
      objective: undefined,
      status: 'blocked',
      assessment: undefined,
      reason: undefined,
    });
  });

  it('routes explicit workstream confirmation and clearing without provenance fields', async () => {
    const program = {
      topicId: 'topic-1',
      title: 'Observed Topic',
      goalText: 'Validate one result.',
      goalSource: 'aitp-enter',
      establishedAt: 1,
      observedRevision: 3,
    };
    const snapshot = makeSnapshot({ program, revision: 12 });
    const { host, session, mounted } = makeResearchHost(snapshot);

    await handleResearchCommand(host, 'manage');
    const manager = mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    manager.handleInput('w');
    for (const character of 'abacus-rpa') manager.handleInput(character);
    manager.handleInput('\r');
    await vi.waitFor(() => expect(session.commandResearch).toHaveBeenCalledOnce());
    expect(session.commandResearch).toHaveBeenCalledWith({
      kind: 'confirm_line_workstream_binding',
      lineSlug: 'line-a',
      workstream: 'abacus-rpa',
      expectedRevision: 12,
    });

    const binding = {
      confirmationId: 'confirmation-line-a-1',
      lineSlug: 'line-a',
      workstream: 'abacus-rpa',
      topicId: 'topic-1',
      observedRevision: 3,
      confirmedBy: 'user' as const,
      confirmedAt: 2,
    };
    const boundSnapshot = makeSnapshot({
      program,
      revision: 13,
      lineWorkstreamBindings: [binding],
    });
    const bound = makeResearchHost(boundSnapshot);
    await handleResearchCommand(bound.host, 'manage');
    const boundManager = bound.mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    boundManager.handleInput('x');
    await vi.waitFor(() => expect(bound.session.commandResearch).toHaveBeenCalledOnce());
    expect(bound.session.commandResearch).toHaveBeenCalledWith({
      kind: 'clear_line_workstream_binding',
      lineSlug: 'line-a',
      expectedConfirmationId: binding.confirmationId,
      expectedRevision: 13,
    });
  });

  it('keeps a failed workstream confirmation editable in the binding dialog', async () => {
    const snapshot = makeSnapshot({
      program: {
        topicId: 'topic-1',
        title: 'Observed Topic',
        goalText: 'Validate one result.',
        goalSource: 'aitp-enter',
        establishedAt: 1,
        observedRevision: 3,
      },
    });
    const { host, session, mounted } = makeResearchHost(snapshot);
    session.commandResearch.mockRejectedValueOnce(new Error('adapter not ready'));

    await handleResearchCommand(host, 'manage');
    const manager = mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    manager.handleInput('w');
    for (const character of 'abacus-rpa') manager.handleInput(character);
    manager.handleInput('\r');

    await vi.waitFor(() => {
      expect(manager.render(100).map(stripAnsi).join('\n')).toContain('adapter not ready');
    });
    const output = manager.render(100).map(stripAnsi).join('\n');
    expect(output).toContain('Confirm AITP workstream binding');
    expect(output).toContain('abacus-rpa');
    expect(host.showError).not.toHaveBeenCalled();
  });

  it('keeps Research Plan v2 lifecycle commands in the plan manager view', async () => {
    const snapshot = makeSnapshot({
      researchPlanV2: {
        schema: 'hakimi/research-plan-0.2',
        planId: 'research-plan-1',
        revision: 2,
        goalId: 'goal-1',
        programId: 'topic-1',
        programObservedRevision: 1,
        goalRelation: 'goal_milestone_in_program',
        objective: 'Validate one milestone.',
        completionCriterion: 'The checks pass.',
        milestones: [{
          milestoneId: 'm1',
          title: 'Run and validate',
          objective: 'Run one calculation.',
          completionCriterion: 'Validation passes.',
          evidenceRequirements: ['Output and log'],
        }],
        evidenceRequirements: ['Reproducible result'],
        decisionPoints: [],
        assumptions: [],
        currentMilestoneId: 'm1',
        stopConditions: ['Stop on validation failure.'],
        replanConditions: ['Replan on Program drift.'],
        status: 'draft',
        createdAt: 1,
        updatedAt: 2,
      },
    });
    const { host, session, mounted } = makeResearchHost(snapshot);
    await handleResearchCommand(host, 'manage');
    const manager = mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    manager.handleInput('v');
    manager.handleInput('a');
    await vi.waitFor(() => expect(session.commandResearch).toHaveBeenCalledOnce());
    expect(session.commandResearch).toHaveBeenCalledWith({
      kind: 'activate_plan_v2',
      planId: 'research-plan-1',
      expectedRevision: 2,
    });
    expect(mounted).toHaveBeenCalledOnce();
    expect(manager.render(100).map(stripAnsi).join('\n')).toContain('Multi-loop Research Plan');
  });

  it('routes planning policy changes through the revisioned Research command', async () => {
    const snapshot = makeSnapshot({ planningPolicy: 'collaborative', revision: 12 });
    const { host, session, mounted } = makeResearchHost(snapshot);
    await handleResearchCommand(host, 'manage');
    const manager = mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    manager.handleInput('v');
    manager.handleInput('p');
    await vi.waitFor(() => expect(session.commandResearch).toHaveBeenCalledOnce());
    expect(session.commandResearch).toHaveBeenCalledWith({
      kind: 'set_planning_policy',
      policy: 'dreaming',
      expectedRevision: 12,
    });
    expect(mounted).toHaveBeenCalledOnce();
  });

  it('sends boundedAction with the typed manager focus command', async () => {
    const question = {
      id: 'q1',
      lineSlug: 'line-a',
      wording: 'Question',
      priority: 1,
      neededEvidence: [],
      evidenceRefs: [],
      falsifierRefs: [],
      nextBoundedAction: 'Measure bounded result',
      workflow: 'active' as const,
      epistemic: 'candidate' as const,
      persistence: 'working' as const,
      revision: 2,
    };
    const snapshot = makeSnapshot({
      currentFocus: { questionId: 'q1', revision: 2 },
      currentQuestion: question,
      questions: [question],
    });
    const { host, session, mounted } = makeResearchHost(snapshot);
    await handleResearchCommand(host, 'manage');
    const manager = mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    manager.handleInput('\r');
    manager.handleInput('f');
    await vi.waitFor(() => {
      expect(session.commandResearch).toHaveBeenCalledOnce();
    });
    expect(session.commandResearch).toHaveBeenCalledWith({
      kind: 'set_focus',
      questionId: 'q1',
      expectedRevision: snapshot.revision,
      boundedAction: 'Measure bounded result',
    });
  });

  it('opens attention by default and routes human decisions and alerts through the controller', async () => {
    const gate = {
      gateId: 'gate-1',
      kind: 'decision' as const,
      prompt: 'Choose the next experiment.',
      createdAt: 10,
    };
    const alert = {
      fingerprint: 'alert-fingerprint',
      kind: 'stale' as const,
      message: 'Refresh stale evidence.',
      createdAt: 11,
    };
    const snapshot = makeSnapshot({ humanGate: gate, alerts: [alert] });
    const { host, session, researchController, mounted } = makeResearchHost(snapshot);

    await handleResearchCommand(host, 'manage');
    const manager = mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    expect(manager.render(100).map(stripAnsi).join('\n')).toContain('Research attention');

    manager.handleInput('r');
    manager.handleInput('approved');
    manager.handleInput('\r');
    manager.handleInput('\r');
    await vi.waitFor(() => expect(session.commandResearch).toHaveBeenCalledOnce());
    expect(session.commandResearch).toHaveBeenCalledWith({
      kind: 'resolve_decision',
      gateId: 'gate-1',
      resolution: 'approved',
      nextPhase: 'idle',
    });
    expect(researchController.applySnapshot).toHaveBeenCalledTimes(2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    manager.handleInput('\u001B[B');
    manager.handleInput('a');
    await vi.waitFor(() => expect(session.commandResearch).toHaveBeenCalledTimes(2));
    expect(session.commandResearch).toHaveBeenNthCalledWith(2, {
      kind: 'acknowledge_alert',
      fingerprint: 'alert-fingerprint',
    });
    expect(researchController.applySnapshot).toHaveBeenCalledTimes(3);
  });

  it('returns from question editing to the same manager layer on cancel and save', async () => {
    const question = {
      id: 'q1',
      lineSlug: 'line-a',
      wording: 'Question',
      priority: 1,
      neededEvidence: [],
      evidenceRefs: [],
      falsifierRefs: [],
      nextBoundedAction: 'Measure bounded result',
      workflow: 'active' as const,
      epistemic: 'candidate' as const,
      persistence: 'working' as const,
      revision: 2,
    };
    const snapshot = makeSnapshot({
      currentFocus: { questionId: 'q1', revision: 2 },
      currentQuestion: question,
      questions: [question],
    });
    const { host, session, mounted } = makeResearchHost(snapshot);

    await handleResearchCommand(host, 'manage');
    const manager = mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    manager.handleInput('\r');
    manager.handleInput('e');
    await vi.waitFor(() => {
      expect(mounted).toHaveBeenCalledTimes(2);
    });
    expect(mounted.mock.calls[1]?.[0]).toBeInstanceOf(ResearchEditDialogComponent);

    const cancelDialog = mounted.mock.calls[1]?.[0] as ResearchEditDialogComponent;
    cancelDialog.handleInput('\u001B');
    await vi.waitFor(() => {
      expect(mounted).toHaveBeenCalledTimes(3);
    });
    const cancelManager = mounted.mock.calls[2]?.[0] as ResearchManagerComponent;
    const cancelOutput = cancelManager.render(100).map(stripAnsi).join('\n');
    expect(cancelOutput).toContain('Questions · Line A (line-a)');
    expect(cancelOutput).toContain('❯ Question');

    cancelManager.handleInput('e');
    await vi.waitFor(() => {
      expect(mounted).toHaveBeenCalledTimes(4);
    });
    const saveDialog = mounted.mock.calls[3]?.[0] as ResearchEditDialogComponent;
    saveDialog.handleInput('!');
    for (let index = 0; index < 3; index++) saveDialog.handleInput('\t');
    saveDialog.handleInput('\r');
    await vi.waitFor(() => {
      expect(session.commandResearch).toHaveBeenCalledWith({
        kind: 'update_question',
        questionId: 'q1',
        expectedRevision: 2,
        wording: 'Question!',
        assessment: undefined,
        priority: undefined,
        nextBoundedAction: undefined,
      });
    });
    await vi.waitFor(() => {
      expect(mounted).toHaveBeenCalledTimes(5);
    });
    const saveManager = mounted.mock.calls[4]?.[0] as ResearchManagerComponent;
    const saveOutput = saveManager.render(100).map(stripAnsi).join('\n');
    expect(saveOutput).toContain('Questions · Line A (line-a)');
    expect(saveOutput).toContain('❯ Question');
  });

  it('does not send mutations while the snapshot is inactive', async () => {
    const { host, session } = makeResearchHost(makeSnapshot({ mode: 'inactive' }));
    await handleResearchCommand(host, 'pause');
    await handleResearchCommand(host, 'off');
    expect(session.commandResearch).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalled();
  });

  it('recognizes an inactive code-shaped error without KimiError instanceof', async () => {
    const { host, session } = makeResearchHost();
    session.commandResearch.mockRejectedValueOnce(
      Object.assign(new Error('inactive'), { code: 'aitp.mode_inactive' }),
    );
    await handleResearchCommand(host, 'pause');
    expect(host.showStatus).toHaveBeenCalledWith('No active research loop to pause.');
    expect(host.showError).not.toHaveBeenCalled();
  });

  it('refreshes the manager for a code-shaped stale revision error', async () => {
    const { host, session, mounted } = makeResearchHost();
    session.commandResearch.mockRejectedValueOnce(
      Object.assign(new Error('stale'), { code: 'research.revision_stale' }),
    );
    await handleResearchCommand(host, 'manage');
    const manager = mounted.mock.calls[0]?.[0] as ResearchManagerComponent;
    manager.handleInput('s');
    await vi.waitFor(() => {
      expect(mounted).toHaveBeenCalledTimes(2);
    });
    expect(host.showStatus).toHaveBeenCalledWith(
      'Research state changed by the agent. Refreshing — please retry.',
    );
  });

  it('does not show success when a command response is superseded', async () => {
    const { host, session, researchController } = makeResearchHost();
    let resolveCommand!: (response: { snapshot: ResearchStatusSnapshot }) => void;
    session.commandResearch.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCommand = resolve; }),
    );
    const request = handleResearchCommand(host, 'line line-a');
    researchController.applySnapshot.mockReturnValue(false);
    resolveCommand({ snapshot: makeSnapshot({ revision: 99 }) });
    await request;
    expect(host.showStatus).not.toHaveBeenCalledWith('Switched to research line: line-a');
  });
});
