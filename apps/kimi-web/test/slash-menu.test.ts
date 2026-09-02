import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import type { AppSkill, ResearchStatusSnapshot } from '../src/api/types';
import { useSlashMenu } from '../src/composables/useSlashMenu';
import {
  isResearchIdleOnlyBusy,
  parseResearchSlashCommand,
  planModeToggleResearchDecision,
  researchCommandFromSlash,
  researchCommandResolutionError,
  researchComposerEntryState,
  researchEnterSlashOutcome,
  researchSlashAllowedWhileBusy,
  researchSlashInputToRestore,
  researchSlashNeedsSnapshot,
  researchSlashSessionIsCurrent,
  runResearchModeEnter,
  submitResearchSlashCommand,
} from '../src/lib/researchCommand';
import { parseSlash } from '../src/lib/slashCommands';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

// Public slash-menu contract: matching built-ins and dispatching selected
// commands without coupling tests to component internals.

interface MockTextarea {
  value: string;
  selectionStart: number;
  setSelectionRange: (start: number, end: number) => void;
  focus: () => void;
}

function setup(initialText = '', skills: AppSkill[] = [], researchEnabled?: boolean) {
  const textarea: MockTextarea = {
    value: initialText,
    selectionStart: 0,
    setSelectionRange(start: number) {
      this.selectionStart = start;
    },
    focus: () => {},
  };
  const text = ref(initialText);
  const textareaRef = ref(textarea as unknown as HTMLTextAreaElement) as Ref<HTMLTextAreaElement | null>;
  const emitted: string[] = [];
  const pushed: string[] = [];
  const slash = useSlashMenu({
    text,
    textareaRef,
    autosize: () => {},
    skills: () => skills,
    researchEnabled: () => researchEnabled,
    emitCommand: (cmd) => emitted.push(cmd),
    historyPush: (entry) => pushed.push(entry),
  });
  return { text, textarea, emitted, pushed, slash };
}

describe('useSlashMenu — update', () => {
  it('stays closed for empty text', () => {
    const { slash } = setup('');
    slash.update();
    expect(slash.open.value).toBe(false);
  });

  it('opens and lists commands for a lone slash', () => {
    const { slash } = setup('/');
    slash.update();
    expect(slash.open.value).toBe(true);
    expect(slash.items.value.length).toBeGreaterThan(0);
    expect(slash.active.value).toBe(0);
  });

  it('filters to matching commands', () => {
    const { slash } = setup('/com');
    slash.update();
    expect(slash.open.value).toBe(true);
    expect(slash.items.value.map((i) => i.name)).toContain('/compact');
  });

  it('offers the session export command for an export prefix', () => {
    const { slash } = setup('/exp');
    slash.update();
    expect(slash.items.value.map((item) => item.name)).toContain('/export');
  });

  it('closes when nothing matches', () => {
    const { slash } = setup('/zzzznotacommand');
    slash.update();
    expect(slash.open.value).toBe(false);
  });

  it.each(['/goal some task', '/goal\tsome task', '/goal\nsome task', '/goal\u00A0some task'])(
    'closes once the token contains argument whitespace: %j',
    (value) => {
      const { slash } = setup(value);
      slash.update();
      expect(slash.open.value).toBe(false);
    },
  );

  it('closes for text that does not start with a slash', () => {
    const { slash } = setup('hello');
    slash.update();
    expect(slash.open.value).toBe(false);
  });

  it('includes session skills as /skill:<skill-name>', () => {
    const { slash } = setup('/', [{ name: 'deploy', description: 'deploy stuff', source: 'project' } as AppSkill]);
    slash.update();
    const names = slash.items.value.map((i) => i.name);
    expect(names).toContain('/skill:deploy');
  });

  it('keeps builtin-sourced skills unprefixed', () => {
    const { slash } = setup('/', [{ name: 'update-config', description: 'edit config', source: 'builtin' } as AppSkill]);
    slash.update();
    const names = slash.items.value.map((i) => i.name);
    expect(names).toContain('/update-config');
    expect(names).not.toContain('/skill:update-config');
  });

  it('matches a prefixed skill when filtering by its bare name', () => {
    const { slash } = setup('/depl', [{ name: 'deploy', description: 'deploy stuff', source: 'project' } as AppSkill]);
    slash.update();
    expect(slash.items.value.map((i) => i.name)).toContain('/skill:deploy');
  });
});

describe('useSlashMenu — select', () => {
  it('non-acceptsInput: clears text, pushes history, emits the command', () => {
    const { text, emitted, pushed, slash } = setup('/new');
    slash.select({ name: '/new', desc: '' });
    expect(text.value).toBe('');
    expect(pushed).toEqual(['/new']);
    expect(emitted).toEqual(['/new']);
    expect(slash.open.value).toBe(false);
  });

  it('acceptsInput: keeps the command in the box and does not emit yet', async () => {
    const { text, emitted, pushed, slash } = setup('/goal');
    slash.select({ name: '/goal', desc: '', acceptsInput: true });
    expect(text.value).toBe('/goal ');
    expect(emitted).toEqual([]);
    expect(pushed).toEqual([]);
    expect(slash.open.value).toBe(false);
    await nextTick();
  });
});

describe('parseSlash', () => {
  it.each([
    ['/research\tstatus', 'status'],
    ['/research\nstatus', 'status'],
    ['/research\u00A0status', 'status'],
  ])('keeps Unicode-whitespace arguments on the /research command path', (input, arg) => {
    expect(parseSlash(input)).toEqual({ cmd: '/research', arg });
  });
});

describe('Research slash command', () => {
  const snapshot: ResearchStatusSnapshot = {
    mode: 'ready',
    loopStatus: 'active',
    planningPolicy: 'collaborative',
    lineWorkstreamBindings: [],
    currentLineSlug: 'line-a',
    questions: [
      {
        id: 'q_1',
        lineSlug: 'line-a',
        wording: 'Old wording',
        priority: 1,
        neededEvidence: [],
        evidenceRefs: [],
        falsifierRefs: [],
        workflow: 'active',
        epistemic: 'candidate',
        persistence: 'working',
        revision: 7,
      },
    ],
    lines: [
      {
        slug: 'line-a',
        title: 'Line A',
        status: 'active',
        createdAt: 1,
        revision: 5,
      },
      {
        slug: 'line-b',
        title: 'Line B',
        status: 'active',
        createdAt: 2,
        revision: 6,
      },
    ],
    openQuestionCount: 1,
    activeQuestionCount: 1,
    blockedQuestionCount: 0,
    alerts: [],
    aitpHealth: { phase: 'ready' },
    revision: 13,
  };
  const inactiveSnapshot: ResearchStatusSnapshot = {
    ...snapshot,
    mode: 'inactive',
    aitpHealth: { phase: 'inactive' },
  };
  const alignmentSnapshot: ResearchStatusSnapshot = {
    ...snapshot,
    researchGoal: {
      schema: 'hakimi/research-goal-0.1',
      goalId: 'goal-1',
      objective: 'Finish the Goal',
      scope: {
        programTopicId: 'topic-1',
        lineSlug: 'line-a',
        questionId: 'q_1',
      },
      nonGoals: [],
      budget: {
        tokenBudget: null,
        turnBudget: null,
        wallClockBudgetMs: null,
        remainingTokens: null,
        remainingTurns: null,
        remainingWallClockMs: null,
        tokenBudgetReached: false,
        turnBudgetReached: false,
        wallClockBudgetReached: false,
        overBudget: false,
      },
      stopConditions: [],
      status: 'active',
      programRelation: {
        status: 'aligned',
        reason: 'Confirmed as goal_parent_of_program.',
      },
      humanGates: [],
      persistenceGuards: [],
      researchRevision: 13,
    },
    program: {
      topicId: 'topic-1',
      title: 'Observed topic',
      goalText: 'Resolve the bounded problem',
      goalSource: 'TOPIC.md',
      establishedAt: 1,
      observedRevision: 4,
    },
  };

  it('hides the Composer entry when disabled and starts from missing or inactive state', () => {
    expect(researchComposerEntryState(false, undefined)).toBe('hidden');
    expect(researchComposerEntryState(false, 'ready')).toBe('hidden');
    expect(researchComposerEntryState(true, undefined)).toBe('start');
    expect(researchComposerEntryState(true, null)).toBe('start');
    expect(researchComposerEntryState(true, 'inactive')).toBe('start');
  });

  it('rejects local entry guards before refreshing Research', async () => {
    const state = {
      researchEnabled: true,
      activeSessionId: 'session-a',
      busy: false,
      planMode: false,
    };
    const pending = new Set<string>();
    const refreshResearch = vi.fn(async () => inactiveSnapshot);
    const commandResearch = vi.fn(async () => snapshot);
    const run = (sessionId: string | undefined) => runResearchModeEnter({
      sessionId,
      pending,
      getState: () => state,
      refreshResearch,
      commandResearch,
    });

    await expect(run(undefined)).resolves.toEqual({
      kind: 'rejected', reason: 'snapshot_unavailable',
    });
    state.activeSessionId = 'session-b';
    await expect(run('session-a')).resolves.toEqual({
      kind: 'ignored', reason: 'session_changed',
    });
    state.activeSessionId = 'session-a';
    state.researchEnabled = false;
    await expect(run('session-a')).resolves.toEqual({ kind: 'rejected', reason: 'disabled' });
    state.researchEnabled = true;
    state.busy = true;
    await expect(run('session-a')).resolves.toEqual({ kind: 'rejected', reason: 'busy' });
    state.busy = false;
    state.planMode = true;
    await expect(run('session-a')).resolves.toEqual({
      kind: 'rejected', reason: 'plan_conflict',
    });

    expect(refreshResearch).not.toHaveBeenCalled();
    expect(commandResearch).not.toHaveBeenCalled();
  });

  it('returns an authoritative active snapshot without sending enter_mode', async () => {
    const commandResearch = vi.fn(async () => snapshot);
    const result = await runResearchModeEnter({
      sessionId: 'session-a',
      pending: new Set<string>(),
      getState: () => ({
        researchEnabled: true,
        activeSessionId: 'session-a',
        busy: false,
        planMode: false,
      }),
      refreshResearch: async () => snapshot,
      commandResearch,
    });

    expect(result).toEqual({ kind: 'already-active', snapshot });
    expect(commandResearch).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent enter calls from different UI entry points', async () => {
    const refresh = deferred<ResearchStatusSnapshot | null>();
    const pending = new Set<string>();
    const commandResearch = vi.fn(async () => snapshot);
    const options = {
      sessionId: 'session-a',
      lineSlug: 'new-line',
      pending,
      getState: () => ({
        researchEnabled: true,
        activeSessionId: 'session-a',
        busy: false,
        planMode: false,
      }),
      refreshResearch: vi.fn(() => refresh.promise),
      commandResearch,
    };

    const first = runResearchModeEnter(options);
    expect(pending.has('session-a')).toBe(true);
    await expect(runResearchModeEnter(options)).resolves.toEqual({
      kind: 'ignored', reason: 'pending',
    });

    refresh.resolve(inactiveSnapshot);
    await expect(first).resolves.toEqual({ kind: 'entered', snapshot });
    expect(commandResearch).toHaveBeenCalledTimes(1);
    expect(commandResearch).toHaveBeenCalledWith('session-a', {
      kind: 'enter_mode',
      actor: 'user',
      lineSlug: 'new-line',
    });
    expect(pending.has('session-a')).toBe(false);
  });

  it('restores /research on only when enter was rejected or the session changed', () => {
    expect(researchEnterSlashOutcome({ kind: 'ignored', reason: 'pending' })).toBe('handled');
    expect(researchEnterSlashOutcome({ kind: 'ignored', reason: 'session_changed' })).toBe('rejected');
    expect(researchEnterSlashOutcome({ kind: 'rejected', reason: 'disabled' })).toBe('rejected');
    expect(researchEnterSlashOutcome({ kind: 'entered', snapshot })).toBe('handled');
  });

  it('blocks enabling Plan while the current session has a pending Research enter', () => {
    expect(planModeToggleResearchDecision(false, 'inactive', true)).toBe('plan_conflict');
    expect(planModeToggleResearchDecision(false, 'ready', false)).toBe('plan_conflict');
    expect(planModeToggleResearchDecision(false, 'inactive', false)).toBe('allow');
    expect(planModeToggleResearchDecision(true, 'ready', true)).toBe('allow');
  });

  it('does not POST enter_mode when the session switches during refresh', async () => {
    const state = {
      researchEnabled: true,
      activeSessionId: 'session-a',
      busy: false,
      planMode: false,
    };
    const refresh = deferred<ResearchStatusSnapshot | null>();
    const pending = new Set<string>();
    const commandResearch = vi.fn(async () => snapshot);
    const result = runResearchModeEnter({
      sessionId: 'session-a',
      pending,
      getState: () => state,
      refreshResearch: () => refresh.promise,
      commandResearch,
    });

    state.activeSessionId = 'session-b';
    refresh.resolve(inactiveSnapshot);

    await expect(result).resolves.toEqual({ kind: 'ignored', reason: 'session_changed' });
    expect(commandResearch).not.toHaveBeenCalled();
    expect(pending.has('session-a')).toBe(false);
  });

  it('keeps a successful enter result when the session switches after POST', async () => {
    const state = {
      researchEnabled: true,
      activeSessionId: 'session-a',
      busy: false,
      planMode: false,
    };
    const postStarted = deferred<void>();
    const postResponse = deferred<ResearchStatusSnapshot | null>();
    const pending = new Set<string>();
    const commandResearch = vi.fn(() => {
      postStarted.resolve(undefined);
      return postResponse.promise;
    });
    const result = runResearchModeEnter({
      sessionId: 'session-a',
      pending,
      getState: () => state,
      refreshResearch: async () => inactiveSnapshot,
      commandResearch,
    });

    await postStarted.promise;
    state.activeSessionId = 'session-b';
    postResponse.resolve(snapshot);

    await expect(result).resolves.toEqual({ kind: 'entered', snapshot });
    expect(commandResearch).toHaveBeenCalledTimes(1);
    expect(pending.has('session-a')).toBe(false);
  });

  it('leaves a null GET response for App to report', async () => {
    await expect(runResearchModeEnter({
      sessionId: 'session-a',
      pending: new Set<string>(),
      getState: () => ({
        researchEnabled: true,
        activeSessionId: 'session-a',
        busy: false,
        planMode: false,
      }),
      refreshResearch: async () => null,
      commandResearch: async () => snapshot,
    })).resolves.toEqual({
      kind: 'rejected',
      reason: 'snapshot_unavailable',
    });
  });

  it('marks a null enter POST response as already reported by the client', async () => {
    await expect(runResearchModeEnter({
      sessionId: 'session-a',
      pending: new Set<string>(),
      getState: () => ({
        researchEnabled: true,
        activeSessionId: 'session-a',
        busy: false,
        planMode: false,
      }),
      refreshResearch: async () => inactiveSnapshot,
      commandResearch: async () => null,
    })).resolves.toEqual({
      kind: 'rejected',
      reason: 'snapshot_unavailable',
      clientReported: true,
    });
  });

  it('shows /research when the connected backend supports Research', () => {
    const { slash } = setup('/res', [], true);
    slash.update();
    expect(slash.items.value.map((item) => item.name)).toContain('/research');
  });

  it.each([undefined, false])('hides /research when backend availability is %s', (enabled) => {
    const { slash } = setup('/res', [], enabled);
    slash.update();
    expect(slash.items.value.map((item) => item.name)).not.toContain('/research');
  });

  it('parses control, line, edit, focus, and workflow actions', () => {
    expect(parseResearchSlashCommand('')).toEqual({ kind: 'status' });
    expect(parseResearchSlashCommand('on -- line-a')).toEqual({ kind: 'on', lineSlug: 'line-a' });
    expect(parseResearchSlashCommand('off')).toEqual({ kind: 'off' });
    expect(parseResearchSlashCommand('pause')).toEqual({ kind: 'pause' });
    expect(parseResearchSlashCommand('resume')).toEqual({ kind: 'resume' });
    expect(parseResearchSlashCommand('manage')).toEqual({ kind: 'manage' });
    expect(parseResearchSlashCommand('align same_program_goal')).toEqual({
      kind: 'align', relation: 'same_program_goal',
    });
    expect(parseResearchSlashCommand('align clear')).toEqual({ kind: 'clear_alignment' });
    expect(parseResearchSlashCommand('line line-b')).toEqual({ kind: 'line', lineSlug: 'line-b' });
    expect(parseResearchSlashCommand('edit q_1 -- New wording')).toEqual({
      kind: 'edit', questionId: 'q_1', wording: 'New wording',
    });
    expect(parseResearchSlashCommand('focus q_1 -- Check the archive')).toEqual({
      kind: 'focus', questionId: 'q_1', boundedAction: 'Check the archive',
    });
    expect(parseResearchSlashCommand('block q_1 -- Missing source')).toEqual({
      kind: 'block', questionId: 'q_1', reason: 'Missing source',
    });
  });

  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])('treats main-turn work=%s and compaction=%s as idle-only busy=%s', (working, compacting, busy) => {
    expect(isResearchIdleOnlyBusy(working, compacting)).toBe(busy);
  });

  it.each([
    ['', true],
    ['status', true],
    ['pause', true],
    ['resume', true],
    ['on', false],
    ['off', false],
    ['manage', false],
    ['align same_program_goal', false],
    ['align clear', false],
    ['line line-b', false],
    ['edit q_1 -- New wording', false],
    ['focus q_1 -- Read', false],
    ['defer q_1', false],
    ['block q_1', false],
    ['close q_1', false],
    ['reopen q_1', false],
    ['unknown', false],
  ])('allows only status, pause, and resume while idle-only commands are busy: %j', (args, allowed) => {
    expect(researchSlashAllowedWhileBusy(parseResearchSlashCommand(args))).toBe(allowed);
  });

  it('parses Research arguments separated by Unicode whitespace', () => {
    expect(parseResearchSlashCommand('line\tline-b')).toEqual({ kind: 'line', lineSlug: 'line-b' });
    expect(parseResearchSlashCommand('edit\nq_1\u00A0--\tNew wording')).toEqual({
      kind: 'edit', questionId: 'q_1', wording: 'New wording',
    });
  });

  it('rejects malformed or overlong free text', () => {
    expect(parseResearchSlashCommand('edit q_1')).toEqual({ kind: 'error', code: 'missing_separator' });
    expect(parseResearchSlashCommand('focus q_1 --')).toEqual({ kind: 'error', code: 'missing_text' });
    expect(parseResearchSlashCommand(`edit q_1 -- ${'x'.repeat(2001)}`)).toEqual({
      kind: 'error', code: 'text_too_long',
    });
  });

  it.each([
    '/research close q-1 accidental',
    '/research block q-1 ignored-text -- Missing source',
    '/research edit q-1 ignored-text -- New wording',
    '/research focus q-1 ignored-text -- Check the archive',
  ])('rejects question arguments before the documented separator: %s', (input) => {
    const parsed = parseSlash(input);
    expect(parsed.cmd).toBe('/research');
    expect(parseResearchSlashCommand(parsed.arg ?? '')).toEqual({
      kind: 'error', code: 'unexpected_arguments',
    });
  });

  it('allows enter_mode to create an explicit line without a snapshot', () => {
    const parsed = parseResearchSlashCommand('on -- new-line');

    expect(researchSlashNeedsSnapshot(parsed)).toBe(false);
    expect(researchCommandResolutionError(parsed, null)).toBeNull();
    expect(researchCommandFromSlash(parsed, null)).toEqual({
      kind: 'enter_mode', actor: 'user', lineSlug: 'new-line',
    });
  });

  it('restores the original slash spelling only for rejected execution', () => {
    const original = '/research\tedit q_missing -- New wording';
    expect(researchSlashInputToRestore(original, 'rejected')).toBe(original);
    expect(researchSlashInputToRestore(original, 'handled')).toBeNull();
  });

  it('reports unavailable snapshots and missing command targets', () => {
    expect(researchCommandResolutionError(parseResearchSlashCommand('pause'), null)).toBe(
      'snapshot_unavailable',
    );
    expect(
      researchCommandResolutionError(parseResearchSlashCommand('edit q_missing -- New'), snapshot),
    ).toBe('question_not_found');
    expect(
      researchCommandResolutionError(parseResearchSlashCommand('line missing-line'), snapshot),
    ).toBe('line_not_found');
    expect(
      researchCommandResolutionError(parseResearchSlashCommand('align same_program_goal'), snapshot),
    ).toBe('goal_alignment_unavailable');
    expect(
      researchCommandResolutionError(parseResearchSlashCommand('align same_program_goal'), alignmentSnapshot),
    ).toBeNull();
  });

  it('uses the authoritative snapshot revision and identities for Goal alignment commands', () => {
    expect(researchSlashNeedsSnapshot(parseResearchSlashCommand('align same_program_goal'))).toBe(true);
    expect(researchSlashNeedsSnapshot(parseResearchSlashCommand('align clear'))).toBe(true);
    expect(researchCommandFromSlash(
      parseResearchSlashCommand('align goal_parent_of_program'),
      alignmentSnapshot,
    )).toEqual({
      kind: 'confirm_goal_alignment',
      relation: 'goal_parent_of_program',
      expectedRevision: 13,
      goalId: 'goal-1',
      topicId: 'topic-1',
      observedRevision: 4,
    });
    expect(researchCommandFromSlash(
      parseResearchSlashCommand('align clear'),
      alignmentSnapshot,
    )).toEqual({
      kind: 'clear_goal_alignment',
      expectedRevision: 13,
      goalId: 'goal-1',
      topicId: 'topic-1',
      observedRevision: 4,
    });
  });

  it('uses question revision for edits and snapshot revision for steering', () => {
    expect(researchCommandFromSlash(parseResearchSlashCommand('edit q_1 -- New'), snapshot)).toEqual({
      kind: 'update_question', questionId: 'q_1', expectedRevision: 7, wording: 'New',
    });
    expect(researchCommandFromSlash(parseResearchSlashCommand('focus q_1 -- Read'), snapshot)).toEqual({
      kind: 'set_focus', questionId: 'q_1', expectedRevision: 13, boundedAction: 'Read',
    });
    expect(researchCommandFromSlash(parseResearchSlashCommand('line line-b'), snapshot)).toEqual({
      kind: 'switch_line', lineSlug: 'line-b', expectedRevision: 13,
    });
    expect(researchCommandFromSlash(parseResearchSlashCommand('defer q_1'), snapshot)).toEqual({
      kind: 'defer_question', questionId: 'q_1', expectedRevision: 13, reason: undefined,
    });
  });

  it('invalidates the submitted session when an awaited refresh switches sessions', async () => {
    const activeSessionId = ref<string | undefined>('session-a');
    const submittedSessionId = activeSessionId.value;
    let resolveRefresh!: () => void;
    const refresh = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const guardedRefresh = async () => {
      await refresh;
      return researchSlashSessionIsCurrent(submittedSessionId, activeSessionId.value);
    };

    const result = guardedRefresh();
    activeSessionId.value = 'session-b';
    resolveRefresh();

    await expect(result).resolves.toBe(false);
    expect(researchSlashSessionIsCurrent(undefined, undefined)).toBe(false);
  });

  it('does not restore input when a successful POST resolves after switching sessions', async () => {
    const activeSessionId = ref<string | undefined>('session-a');
    let resolvePost!: (value: ResearchStatusSnapshot) => void;
    const postResponse = new Promise<ResearchStatusSnapshot>((resolve) => {
      resolvePost = resolve;
    });
    let postSent = false;

    const outcome = submitResearchSlashCommand(
      'session-a',
      () => activeSessionId.value,
      () => {
        postSent = true;
        return postResponse;
      },
    );
    expect(postSent).toBe(true);

    activeSessionId.value = 'session-b';
    resolvePost(snapshot);

    await expect(outcome).resolves.toBe('handled');
    expect(researchSlashInputToRestore('/research pause', await outcome)).toBeNull();
  });
});
