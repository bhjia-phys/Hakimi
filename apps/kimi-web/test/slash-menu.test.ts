import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import type { AppSkill, ResearchModeSnapshot } from '../src/api/types';
import { useSlashMenu } from '../src/composables/useSlashMenu';
import {
  parseResearchSlashCommand,
  researchComposerEntryState,
  researchEnterSlashOutcome,
  researchSlashInputToRestore,
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
  const snapshot: ResearchModeSnapshot = { enabled: true, skillsAvailable: true };
  const inactiveSnapshot: ResearchModeSnapshot = { enabled: false, skillsAvailable: true };

  it('hides the Composer entry when disabled and toggles from the mode state', () => {
    expect(researchComposerEntryState(false, undefined)).toBe('hidden');
    expect(researchComposerEntryState(false, true)).toBe('hidden');
    expect(researchComposerEntryState(true, undefined)).toBe('start');
    expect(researchComposerEntryState(true, null)).toBe('start');
    expect(researchComposerEntryState(true, false)).toBe('start');
    expect(researchComposerEntryState(true, true)).toBe('stop');
  });

  it('rejects local entry guards before refreshing Research', async () => {
    const state = {
      researchEnabled: true,
      activeSessionId: 'session-a',
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

    expect(refreshResearch).not.toHaveBeenCalled();
    expect(commandResearch).not.toHaveBeenCalled();
  });

  it('returns an authoritative enabled snapshot without sending enter_mode', async () => {
    const commandResearch = vi.fn(async () => snapshot);
    const result = await runResearchModeEnter({
      sessionId: 'session-a',
      pending: new Set<string>(),
      getState: () => ({
        researchEnabled: true,
        activeSessionId: 'session-a',
      }),
      refreshResearch: async () => snapshot,
      commandResearch,
    });

    expect(result).toEqual({ kind: 'already-active', snapshot });
    expect(commandResearch).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent enter calls from different UI entry points', async () => {
    const refresh = deferred<ResearchModeSnapshot | null>();
    const pending = new Set<string>();
    const commandResearch = vi.fn(async () => snapshot);
    const options = {
      sessionId: 'session-a',
      pending,
      getState: () => ({
        researchEnabled: true,
        activeSessionId: 'session-a',
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
    });
    expect(pending.has('session-a')).toBe(false);
  });

  it('restores /research on only when enter was rejected or the session changed', () => {
    expect(researchEnterSlashOutcome({ kind: 'ignored', reason: 'pending' })).toBe('handled');
    expect(researchEnterSlashOutcome({ kind: 'ignored', reason: 'session_changed' })).toBe('rejected');
    expect(researchEnterSlashOutcome({ kind: 'rejected', reason: 'disabled' })).toBe('rejected');
    expect(researchEnterSlashOutcome({ kind: 'entered', snapshot })).toBe('handled');
  });

  it('does not POST enter_mode when the session switches during refresh', async () => {
    const state = {
      researchEnabled: true,
      activeSessionId: 'session-a',
    };
    const refresh = deferred<ResearchModeSnapshot | null>();
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
    };
    const postStarted = deferred<void>();
    const postResponse = deferred<ResearchModeSnapshot | null>();
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

  it('parses only the mode toggle grammar', () => {
    expect(parseResearchSlashCommand('')).toEqual({ kind: 'toggle' });
    expect(parseResearchSlashCommand('on')).toEqual({ kind: 'on' });
    expect(parseResearchSlashCommand('off')).toEqual({ kind: 'off' });
    expect(parseResearchSlashCommand('status')).toEqual({ kind: 'status' });
  });

  it('parses retired executor subcommands as explicitly unsupported', () => {
    for (const name of [
      'pause',
      'resume',
      'manage',
      'align',
      'line',
      'edit',
      'focus',
      'defer',
      'block',
      'close',
      'reopen',
      'discard-checkpoint',
      'adopt-conclusion',
    ]) {
      expect(parseResearchSlashCommand(name)).toEqual({ kind: 'unsupported', subcommand: name });
      expect(parseResearchSlashCommand(`${name} with args`)).toEqual({
        kind: 'unsupported', subcommand: name,
      });
    }
  });

  it('rejects unexpected arguments and unknown subcommands', () => {
    expect(parseResearchSlashCommand('on -- line-a')).toEqual({
      kind: 'error', code: 'unexpected_arguments',
    });
    expect(parseResearchSlashCommand('status please')).toEqual({
      kind: 'error', code: 'unexpected_arguments',
    });
    expect(parseResearchSlashCommand('frobnicate')).toEqual({
      kind: 'error', code: 'unknown_subcommand',
    });
  });

  it('parses Research arguments separated by Unicode whitespace', () => {
    expect(parseResearchSlashCommand('off\t')).toEqual({ kind: 'off' });
    expect(parseResearchSlashCommand('on\u00A0now')).toEqual({
      kind: 'error', code: 'unexpected_arguments',
    });
  });

  it('restores the original slash spelling only for rejected execution', () => {
    const original = '/research\tstatus';
    expect(researchSlashInputToRestore(original, 'rejected')).toBe(original);
    expect(researchSlashInputToRestore(original, 'handled')).toBeNull();
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
    let resolvePost!: (value: ResearchModeSnapshot) => void;
    const postResponse = new Promise<ResearchModeSnapshot>((resolve) => {
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
    expect(researchSlashInputToRestore('/research off', await outcome)).toBeNull();
  });
});
