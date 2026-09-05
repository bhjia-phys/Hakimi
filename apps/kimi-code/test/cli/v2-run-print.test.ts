import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IAgentGoalService,
  IAgentLifecycleService,
  IAgentLoopService,
  IAgentPermissionModeService,
  IAgentProfileService,
  IAgentPromptService,
  IAgentTaskService,
  IAuthSummaryService,
  IBootstrapService,
  IConfigService,
  IEventBus,
  IFileSystemStorageService,
  IOAuthToolkit,
  ISessionCronService,
  ISessionIndex,
  ISessionManager,
  ITelemetryService,
  IWireService,
  type BootstrapInput,
  type DomainEvent,
} from '@moonshot-ai/agent-core-v2';

import { runV2Print } from '../../src/cli/v2/run-v2-print';
import type { PromptProcess } from '../../src/cli/run-prompt';
import { PROMPT_CLEANUP_TIMEOUT_MS } from '../../src/constant/app';
import {
  createTestAgent,
  InMemoryWireRecordPersistence,
} from '../../../../packages/agent-core-v2/test/harness';

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  ensureMainAgent: vi.fn(),
  createKimiDefaultHeaders: vi.fn(() => ({})),
  resolveKimiHome: vi.fn((homeDir?: string) => homeDir ?? '/tmp/kimi-code-test-home'),
  createKimiDeviceId: vi.fn(() => 'device-1'),
}));

vi.mock('@moonshot-ai/agent-core-v2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moonshot-ai/agent-core-v2')>();
  return {
    ...actual,
    bootstrap: mocks.bootstrap,
    ensureMainAgent: mocks.ensureMainAgent,
  };
});

vi.mock('@moonshot-ai/kimi-code-oauth', async () => {
  const actual = await vi.importActual<typeof import('@moonshot-ai/kimi-code-oauth')>(
    '@moonshot-ai/kimi-code-oauth',
  );
  return {
    ...actual,
    createKimiDefaultHeaders: mocks.createKimiDefaultHeaders,
    createKimiDeviceId: mocks.createKimiDeviceId,
  };
});

vi.mock('@bhjia-phys/hakimi-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bhjia-phys/hakimi-sdk')>();
  return {
    ...actual,
    resolveKimiHome: mocks.resolveKimiHome,
  };
});

vi.mock('@moonshot-ai/kimi-telemetry', () => ({
  initializeTelemetry: vi.fn(),
  setCrashPhase: vi.fn(),
  shutdownTelemetry: vi.fn(),
  track: vi.fn(),
  setTelemetryContext: vi.fn(),
  withTelemetryContext: vi.fn(() => ({ track: vi.fn() })),
}));

interface FakeScope {
  readonly id: string;
  readonly accessor: { readonly get: (token: unknown) => unknown };
  readonly dispose: ReturnType<typeof vi.fn>;
}

function fakeScope(id: string, services: Map<unknown, unknown>): FakeScope {
  return {
    id,
    accessor: {
      get: (token: unknown) => {
        if (!services.has(token)) throw new Error(`unexpected service request: ${String(token)}`);
        return services.get(token);
      },
    },
    dispose: vi.fn(),
  };
}

function writer() {
  let text = '';
  return {
    write: vi.fn((chunk: string) => {
      text += chunk;
      return true;
    }),
    text: () => text,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function opts(overrides: Record<string, unknown> = {}) {
  return {
    session: undefined,
    continue: false,
    yolo: false,
    auto: false,
    plan: false,
    model: undefined,
    outputFormat: undefined,
    prompt: 'say hello',
    skillsDirs: [],
    agent: undefined,
    agentFiles: [],
    addDirs: [],
    ...overrides,
  } as const;
}

function makeFakeHarness() {
  // Native event listeners registered on the main agent's IEventBus; the turn
  // emits a streaming assistant delta before completing.
  const eventListeners = new Set<(event: DomainEvent) => void>();
  const profileState: { profileName: string | undefined } = { profileName: undefined };

  const agentServices = new Map<unknown, unknown>([
    [
      IAgentProfileService,
      {
        bind: vi.fn(async () => {}),
        setModel: vi.fn(async () => ({ model: 'k2' })),
        getModel: () => 'k2',
        data: () => ({ profileName: profileState.profileName }),
      },
    ],
    [IAgentPermissionModeService, { mode: 'auto', setMode: vi.fn() }],
    [IAuthSummaryService, { ensureReady: vi.fn(async () => {}) }],
    [
      IEventBus,
      {
        subscribe: vi.fn((handler: (event: DomainEvent) => void) => {
          eventListeners.add(handler);
          return { dispose: () => eventListeners.delete(handler) };
        }),
      },
    ],
    [
      IAgentPromptService,
      {
        clear: vi.fn(),
        enqueue: vi.fn(async () => {
          // Emit a native assistant delta on the main agent bus, then complete.
          for (const listener of [...eventListeners]) {
            listener({ type: 'assistant.delta', turnId: 1, delta: 'hello world' } as DomainEvent);
          }
          return {
            launched: Promise.resolve({
              id: 1,
              result: Promise.resolve({ type: 'completed' }),
            }),
          };
        }),
      },
    ],
    [IAgentTaskService, { list: vi.fn(() => []) }],
    [IAgentGoalService, { createGoal: vi.fn(), getGoal: vi.fn(() => ({ goal: null })), pauseGoal: vi.fn() }],
    [IAgentLoopService, {
      status: vi.fn(() => ({ pendingTurnIds: [] })),
      cancel: vi.fn(),
      settled: vi.fn(async () => {}),
    }],
    [IWireService, { flush: vi.fn(async () => {}) }],
  ]);
  const agent = fakeScope('main', agentServices);

  const sessionServices = new Map<unknown, unknown>([
    // drain enumerates agents; empty 閳?no background work to wait on.
    [IAgentLifecycleService, { list: vi.fn(() => []) }],
    // No scheduled cron tasks → no future fire time to wait on.
    [ISessionCronService, { getNextFireTime: vi.fn(() => null) }],
  ]);
  const session = fakeScope('ses_v2', sessionServices);

  const appServices = new Map<unknown, unknown>([
    [
      IConfigService,
      {
        ready: Promise.resolve(),
        get: vi.fn((section: string) => (section === 'defaultModel' ? 'k2' : undefined)),
        // `applyPrintModeConfigDefaults` inspects each section and fills unset
        // keys via the memory layer; an empty section means everything is unset.
        inspect: vi.fn(() => ({ value: {} })),
        set: vi.fn(async () => {}),
        diagnostics: vi.fn(() => []),
      },
    ],
    [
      ISessionManager,
      {
        create: vi.fn(async () => session),
        resume: vi.fn(async () => session),
        get: vi.fn(() => session),
        list: vi.fn(() => [session]),
      } as unknown as ISessionManager,
    ],
    [
      ISessionIndex,
      {
        list: vi.fn(async () => ({ items: [] })),
        get: vi.fn(async (id: string) => ({
          id,
          workspaceId: 'wd_v2',
          cwd: process.cwd(),
          createdAt: 1,
          updatedAt: 1,
          archived: false,
        })),
      },
    ],
    [ISessionIndex, { get: vi.fn(async () => undefined), listRecent: vi.fn(async () => ({ items: [] })) }],
    [
      IBootstrapService,
      {
        platform: 'linux',
        arch: 'x64',
        clientIdentity: {
          productName: 'test-product',
          version: '1.2.3-test',
          platform: 'test_platform',
        },
        osHomeDir: '/home/test',
        getEnv: () => undefined,
      },
    ],
    [IOAuthToolkit, { getCachedAccessToken: vi.fn(async () => undefined) }],
    [IFileSystemStorageService, {}],
    [
      ITelemetryService,
      (() => {
        const svc = {
          setAppender: vi.fn(),
          setContext: vi.fn(),
          track: vi.fn(),
          track2: vi.fn(),
          shutdown: vi.fn(async () => {}),
          withContext: vi.fn(() => svc),
        };
        return svc;
      })(),
    ],
  ]);
  const app = fakeScope('app', appServices);
  return { app, agent, session, agentServices, appServices, profileState };
}

describe('runV2Print', () => {
  beforeEach(() => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_FLAG', '1');
    vi.stubEnv('KIMI_MODEL_OUTPUT_FORMAT', '');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('persists interruption before cold restore with the real Goal, prompt, loop and wire services', async () => {
    const persistence = new InMemoryWireRecordPersistence();
    const generating = deferred<void>();
    const ctx = createTestAgent({
      persistence,
      generate: async (_provider, _systemPrompt, _tools, _history, _callbacks, options) => {
        const signal = options?.signal;
        if (signal === undefined) throw new Error('Expected generation cancellation signal');
        options?.onRequestStart?.();
        generating.resolve();
        return new Promise((_resolve, reject) => {
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener('abort', () => { reject(signal.reason); }, { once: true });
        });
      },
    });
    const restored = createTestAgent();
    try {
      const goals = ctx.get(IAgentGoalService);
      await goals.createGoal({ objective: 'Complete the bounded test' });
      const { app, agent, agentServices } = makeFakeHarness();
      agentServices.set(IAgentGoalService, goals);
      agentServices.set(IAgentPromptService, ctx.get(IAgentPromptService));
      agentServices.set(IAgentLoopService, ctx.get(IAgentLoopService));
      agentServices.set(IWireService, ctx.wire);
      agentServices.set(IEventBus, ctx.get(IEventBus));
      mocks.bootstrap.mockReturnValue({ app });
      mocks.ensureMainAgent.mockResolvedValue(agent);
      const callbacks = new Map<NodeJS.Signals, () => Promise<void>>();
      const promptProcess: PromptProcess = {
        once: (name, callback) => callbacks.set(name, callback),
        off: (name) => callbacks.delete(name),
        exit: vi.fn(),
      };
      const run = runV2Print(opts() as never, '1.2.3-test', {
        stdout: writer(), stderr: writer(), process: promptProcess,
      }).catch((error: unknown) => error);
      await Promise.race([generating.promise, run.then((error: unknown) => { throw error; })]);
      await callbacks.get('SIGINT')!();
      expect(await run).toBeInstanceOf(Error);
      const paused = goals.getGoal().goal;
      expect(paused).toMatchObject({ status: 'paused', terminalReason: 'Paused when print mode exited' });
      expect(persistence.records.findLast((record) => record.type === 'goal.update')).toMatchObject({
        status: 'paused', reason: 'Paused when print mode exited', actor: 'system',
      });
      expect(persistence.records).toContainEqual(expect.objectContaining({ type: 'turn.ended', reason: 'cancelled' }));
      expect(promptProcess.exit).toHaveBeenCalledExactlyOnceWith(130);
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_600_000);
      const restoredGoals = restored.get(IAgentGoalService);
      await restored.restore(persistence.records);
      expect(restoredGoals.getGoal().goal).toMatchObject({
        status: 'paused', terminalReason: 'Paused when print mode exited', wallClockMs: paused?.wallClockMs,
      });
      expect(restored.llmCalls).toHaveLength(0);
    } finally {
      vi.restoreAllMocks();
      await ctx.dispose();
      await restored.dispose();
    }
  });

  it.each(['missing', 'paused', 'blocked', 'complete'] as const)(
    'does not rewrite a %s Goal during normal cleanup', async (status) => {
      const ctx = createTestAgent();
      try {
        const goals = ctx.get(IAgentGoalService);
        if (status !== 'missing') {
          await goals.createGoal({ objective: 'Bounded task' });
          if (status === 'paused') await goals.pauseGoal({ reason: 'User paused' });
          if (status === 'blocked') await goals.markBlocked({ reason: 'Explicit dependency' });
          if (status === 'complete') await goals.markComplete({ reason: 'Evidence accepted' });
        }
        const before = goals.getGoal();
        const { app, agent, agentServices } = makeFakeHarness();
        agentServices.set(IAgentGoalService, goals);
        agentServices.set(IWireService, ctx.wire);
        mocks.bootstrap.mockReturnValue({ app });
        mocks.ensureMainAgent.mockResolvedValue(agent);
        await runV2Print(opts() as never, '1.2.3-test', { stdout: writer(), stderr: writer() });
        expect(goals.getGoal()).toEqual(before);
        expect(app.dispose).toHaveBeenCalledOnce();
      } finally {
        await ctx.dispose();
      }
    },
  );

  it('flushes the pause before a wedged loop reaches the existing cleanup time limit', async () => {
    vi.useFakeTimers();
    const { app, agent, agentServices } = makeFakeHarness();
    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);
    const settled = deferred<void>();
    const loop = agentServices.get(IAgentLoopService) as IAgentLoopService;
    vi.mocked(loop.settled).mockReturnValue(settled.promise);
    const wire = agentServices.get(IWireService) as IWireService;
    const run = runV2Print(opts() as never, '1.2.3-test', { stdout: writer(), stderr: writer() });
    await vi.advanceTimersByTimeAsync(0);
    expect(wire.flush).toHaveBeenCalledOnce();
    expect(app.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PROMPT_CLEANUP_TIMEOUT_MS);
    await run;
    settled.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(wire.flush).toHaveBeenCalledTimes(2);
    expect(app.dispose).toHaveBeenCalledOnce();
  });

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const)('settles and flushes the active goal before %s exits', async (signal, code) => {
    const { app, agent, agentServices } = makeFakeHarness();
    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);
    const events: string[] = [];
    const result = deferred<{ type: 'cancelled'; steps: number; reason: Error }>();
    const flushed = deferred<void>();
    const callbacks = new Map<NodeJS.Signals, () => Promise<void>>();
    const promptProcess: PromptProcess = {
      once: (name, callback) => callbacks.set(name, callback),
      off: (name) => callbacks.delete(name),
      exit: vi.fn(() => { events.push('exit'); }),
    };
    const goals = agentServices.get(IAgentGoalService) as IAgentGoalService;
    vi.mocked(goals.getGoal).mockReturnValue({ goal: { status: 'active' } } as ReturnType<IAgentGoalService['getGoal']>);
    vi.mocked(goals.pauseGoal).mockImplementation(async () => {
      events.push('pause');
      return { status: 'paused' } as Awaited<ReturnType<IAgentGoalService['pauseGoal']>>;
    });
    const prompts = agentServices.get(IAgentPromptService) as IAgentPromptService;
    vi.mocked(prompts.enqueue).mockResolvedValue({
      launched: Promise.resolve({ id: 1, result: result.promise }),
    } as Awaited<ReturnType<IAgentPromptService['enqueue']>>);
    vi.mocked(prompts.clear).mockImplementation(() => { events.push('clear'); });
    const loop = agentServices.get(IAgentLoopService) as IAgentLoopService;
    vi.mocked(loop.status).mockReturnValue({ state: 'running', hasPendingRequests: true, pendingTurnIds: [2] });
    vi.mocked(loop.cancel).mockImplementation((turnId) => {
      events.push(`cancel:${turnId ?? 'active'}`);
      if (turnId === undefined) {
        result.resolve({ type: 'cancelled', steps: 1, reason: new Error('interrupted') });
      }
      return true;
    });
    vi.mocked(loop.settled).mockImplementation(async () => { events.push('settled'); });
    const wire = agentServices.get(IWireService) as IWireService;
    vi.mocked(wire.flush)
      .mockImplementationOnce(async () => { events.push('flush:pause'); await flushed.promise; })
      .mockImplementationOnce(async () => { events.push('flush:turn'); });
    app.dispose.mockImplementation(() => { events.push('dispose'); });

    const run = runV2Print(opts() as never, '1.2.3-test', {
      stdout: writer(), stderr: writer(), process: promptProcess,
    }).catch((error: unknown) => error);
    await vi.waitFor(() => { expect(prompts.enqueue).toHaveBeenCalledOnce(); });
    const terminate = callbacks.get(signal)!;
    const stopping = terminate();
    await vi.waitFor(() => { expect(events).toContain('flush:pause'); });
    expect(promptProcess.exit).not.toHaveBeenCalled();
    expect(app.dispose).not.toHaveBeenCalled();
    await terminate();
    flushed.resolve();
    await stopping;
    expect(await run).toBeInstanceOf(Error);
    expect(goals.pauseGoal).toHaveBeenCalledExactlyOnceWith(
      { reason: 'Paused when print mode exited' }, 'system',
    );
    expect(events).toEqual([
      'pause', 'clear', 'cancel:2', 'cancel:active', 'flush:pause',
      'settled', 'flush:turn', 'dispose', 'exit',
    ]);
    expect(promptProcess.exit).toHaveBeenCalledExactlyOnceWith(code);
  });

  it('submits a prompt, renders native events, awaits completion, and drains', async () => {
    const stdout = writer();
    const stderr = writer();
    const { app, agent, agentServices } = makeFakeHarness();

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await runV2Print(opts() as never, '1.2.3-test', { stdout, stderr });

    const promptService = agentServices.get(IAgentPromptService) as { enqueue: ReturnType<typeof vi.fn> };
    expect(promptService.enqueue).toHaveBeenCalledWith({
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'say hello' }],
        toolCalls: [],
        origin: { kind: 'user' },
      },
    });
    // Version banner is first, then the rendered assistant output.
    expect(stderr.write).toHaveBeenNthCalledWith(1, 'hakimi version 1.2.3-test\n');
    expect(stdout.text()).toContain('hello world');
    expect(app.dispose).toHaveBeenCalled();
  });

  it('passes explicit skill dirs from --skillsDir into bootstrap args', async () => {
    const stdout = writer();
    const stderr = writer();
    const { app, agent } = makeFakeHarness();

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await runV2Print(opts({ skillsDirs: ['/skills'] }) as never, '1.2.3-test', {
      stdout,
      stderr,
    });

    const input = mocks.bootstrap.mock.calls[0]?.[0] as BootstrapInput;
    expect(input.args?.skillDirs).toEqual(['/skills']);
  });

  it('leaves the skill dirs arg unset when --skillsDir is empty', async () => {
    const stdout = writer();
    const stderr = writer();
    const { app, agent } = makeFakeHarness();

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await runV2Print(opts() as never, '1.2.3-test', { stdout, stderr });

    const input = mocks.bootstrap.mock.calls[0]?.[0] as BootstrapInput;
    expect(input.args?.skillDirs ?? []).toEqual([]);
  });

  it('seeds explicit agent files from --agentFile and binds the --agent profile', async () => {
    const stdout = writer();
    const stderr = writer();
    const { app, agent, appServices, agentServices } = makeFakeHarness();

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await runV2Print(
      opts({ agent: 'reviewer', agentFiles: ['/agents/reviewer.md'] }) as never,
      '1.2.3-test',
      { stdout, stderr },
    );

    const input = mocks.bootstrap.mock.calls[0]?.[0] as BootstrapInput;
    expect(input.args?.agentFiles).toEqual(['/agents/reviewer.md']);

    const sessions = appServices.get(ISessionManager) as { create: ReturnType<typeof vi.fn> };
    expect(sessions.create).toHaveBeenCalledWith({
      workDir: process.cwd(),
      additionalDirs: undefined,
      mainAgentBinding: { profile: 'reviewer', model: 'k2' },
    });
    const profile = agentServices.get(IAgentProfileService) as { bind: ReturnType<typeof vi.fn> };
    expect(profile.bind).not.toHaveBeenCalled();
  });

  it('binds the profile named by --agent-file when --agent is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimi-agent-file-'));
    const agentFile = join(dir, 'reviewer.md');
    await writeFile(
      agentFile,
      '---\nname: file-reviewer\ndescription: Reviews code.\n---\n\nYou review code.\n',
    );
    const stdout = writer();
    const stderr = writer();
    const { app, agent, appServices, agentServices } = makeFakeHarness();

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await runV2Print(opts({ agentFiles: [agentFile] }) as never, '1.2.3-test', {
      stdout,
      stderr,
    });

    const input = mocks.bootstrap.mock.calls[0]?.[0] as BootstrapInput;
    expect(input.args?.agentFiles).toEqual([agentFile]);

    const sessions = appServices.get(ISessionManager) as { create: ReturnType<typeof vi.fn> };
    expect(sessions.create).toHaveBeenCalledWith({
      workDir: process.cwd(),
      additionalDirs: undefined,
      mainAgentBinding: { profile: 'file-reviewer', model: 'k2' },
    });
    const profile = agentServices.get(IAgentProfileService) as { bind: ReturnType<typeof vi.fn> };
    expect(profile.bind).not.toHaveBeenCalled();
  });

  it('does not materialize a main agent after fresh profile binding fails', async () => {
    const stdout = writer();
    const stderr = writer();
    const { app, appServices } = makeFakeHarness();
    const sessions = appServices.get(ISessionManager) as { create: ReturnType<typeof vi.fn> };
    sessions.create.mockRejectedValueOnce(new Error('Unknown agent profile'));
    mocks.bootstrap.mockReturnValue({ app });

    await expect(
      runV2Print(opts({ agent: 'missing' }) as never, '1.2.3-test', { stdout, stderr }),
    ).rejects.toThrow('Unknown agent profile');

    expect(mocks.ensureMainAgent).not.toHaveBeenCalled();
  });

  it('fails before any turn when --agent-file is invalid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimi-agent-file-'));
    const agentFile = join(dir, 'broken.md');
    await writeFile(agentFile, '---\nname: broken\n---\n\nbody\n');
    const stdout = writer();
    const stderr = writer();
    const { app, agent, agentServices } = makeFakeHarness();

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await expect(
      runV2Print(opts({ agentFiles: [agentFile] }) as never, '1.2.3-test', { stdout, stderr }),
    ).rejects.toThrow(/Invalid agent file/);

    const profile = agentServices.get(IAgentProfileService) as {
      bind: ReturnType<typeof vi.fn>;
    };
    expect(profile.bind).not.toHaveBeenCalled();
  });

  it('leaves the agent files arg unset when --agentFile is empty', async () => {
    const stdout = writer();
    const stderr = writer();
    const { app, agent } = makeFakeHarness();

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await runV2Print(opts() as never, '1.2.3-test', { stdout, stderr });

    const input = mocks.bootstrap.mock.calls[0]?.[0] as BootstrapInput;
    expect(input.args?.agentFiles ?? []).toEqual([]);
  });

  it('passes --agent-file paths through unresolved so the engine can expand ~', async () => {
    const stdout = writer();
    const stderr = writer();
    const { app, agent } = makeFakeHarness();

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await runV2Print(
      opts({ agent: 'reviewer', agentFiles: ['~/agents/reviewer.md'] }) as never,
      '1.2.3-test',
      { stdout, stderr },
    );

    const input = mocks.bootstrap.mock.calls[0]?.[0] as BootstrapInput;
    expect(input.args?.agentFiles).toEqual(['~/agents/reviewer.md']);
  });

  it('treats re-selecting the already-bound profile on resume as a no-op', async () => {
    const stdout = writer();
    const stderr = writer();
    const { app, agent, agentServices, appServices, profileState } = makeFakeHarness();
    profileState.profileName = 'reviewer';

    const index = appServices.get(ISessionIndex) as { get: ReturnType<typeof vi.fn> };
    index.get.mockResolvedValue({ id: 'ses_1', cwd: process.cwd() });

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await runV2Print(opts({ session: 'ses_1', agent: 'reviewer' }) as never, '1.2.3-test', {
      stdout,
      stderr,
    });

    const profile = agentServices.get(IAgentProfileService) as {
      bind: ReturnType<typeof vi.fn>;
      setModel: ReturnType<typeof vi.fn>;
    };
    expect(profile.bind).not.toHaveBeenCalled();
    expect(profile.setModel).not.toHaveBeenCalled();
  });

  it('switches the model when resuming with the already-bound profile and an explicit model', async () => {
    const stdout = writer();
    const stderr = writer();
    const { app, agent, agentServices, appServices, profileState } = makeFakeHarness();
    profileState.profileName = 'reviewer';

    const index = appServices.get(ISessionIndex) as { get: ReturnType<typeof vi.fn> };
    index.get.mockResolvedValue({ id: 'ses_1', cwd: process.cwd() });

    mocks.bootstrap.mockReturnValue({ app });
    mocks.ensureMainAgent.mockResolvedValue(agent);

    await runV2Print(
      opts({ session: 'ses_1', agent: 'reviewer', model: 'new-model' }) as never,
      '1.2.3-test',
      { stdout, stderr },
    );

    const profile = agentServices.get(IAgentProfileService) as {
      bind: ReturnType<typeof vi.fn>;
      setModel: ReturnType<typeof vi.fn>;
    };
    expect(profile.bind).not.toHaveBeenCalled();
    expect(profile.setModel).toHaveBeenCalledWith('new-model');
  });
});
