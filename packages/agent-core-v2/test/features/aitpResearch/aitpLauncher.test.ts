import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IHostProcess, IHostProcessService } from '#/os/interface/hostProcess';
import { AitpLauncher } from '#/features/aitpResearch/adapter/aitpLauncher';
import { AitpResearchError, AitpResearchErrors } from '#/features/aitpResearch/errors';

const MAX_STDOUT_BYTES = 1_000_000;
const MAX_STDERR_BYTES = 200_000;
const LAUNCHER_SCRIPT = '/plugin/scripts/aitp.py';
const CWD = '/workspace';

const CLEAN_CHECK = {
  schema: 'aitp/check-report-0.1',
  root: '/workspace',
  status: 'clean',
  counts: { entries: 0, notes: 0, errors: 0, warnings: 0 },
  findings: [],
};

const FINDINGS_CHECK = {
  schema: 'aitp/check-report-0.1',
  root: '/workspace',
  status: 'findings',
  counts: { entries: 1, notes: 0, errors: 0, warnings: 1 },
  findings: [{
    level: 'warning',
    code: 'empty_topic_goal',
    path: '.aitp/topic/TOPIC.md',
    message: 'Research Goal is not established',
  }],
};

function completedProcess(
  stdoutText: string | Uint8Array = '',
  exitCode = 0,
  stderrText: string | Uint8Array = '',
): IHostProcess {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.end(stdoutText);
  stderr.end(stderrText);
  return {
    _serviceBrand: undefined,
    pid: 1,
    exitCode,
    stdin,
    stdout,
    stderr,
    wait: async () => exitCode,
    kill: async () => {},
    dispose: () => {},
  };
}

function makeLauncher(
  spawn: IHostProcessService['spawn'],
  options?: { readonly pythonPath?: string; readonly timeoutMs?: number },
): AitpLauncher {
  return new AitpLauncher(
    { _serviceBrand: undefined, spawn },
    {
      launcherScript: LAUNCHER_SCRIPT,
      cwd: CWD,
      pythonPath: options?.pythonPath,
      timeoutMs: options?.timeoutMs,
    },
  );
}

function expectCodedError(error: unknown, code: string): AitpResearchError {
  expect(error).toBeInstanceOf(AitpResearchError);
  expect((error as AitpResearchError).code).toBe(code);
  return error as AitpResearchError;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AitpLauncher Python probing', () => {
  it('falls back across spawn failure, insufficient version, and malformed version', async () => {
    const candidates = ['python3.13', 'python3.12', 'python3.11', 'python3'];
    const spawn = vi.fn<IHostProcessService['spawn']>(async (command) => {
      if (command === 'python3.13') throw new Error('not found');
      if (command === 'python3.12') return completedProcess('(3, 10, 9)\n');
      if (command === 'python3.11') return completedProcess('Python 3.11.0\n');
      return completedProcess('(3, 11, 0)\n');
    });
    const launcher = makeLauncher(spawn);

    await expect(launcher.probePython()).resolves.toBe('python3');
    expect(spawn.mock.calls.map(([command]) => command)).toEqual(candidates);
  });

  it('returns null after every Python candidate fails to spawn', async () => {
    const spawn = vi.fn<IHostProcessService['spawn']>(async () => {
      throw new Error('python unavailable');
    });
    const launcher = makeLauncher(spawn);

    await expect(launcher.probePython()).resolves.toBeNull();
    expect(spawn).toHaveBeenCalledTimes(4);
  });

  it('surfaces an explicit configured-Python spawn failure as a coded error', async () => {
    const spawn = vi.fn<IHostProcessService['spawn']>(async () => {
      throw new Error('executable missing');
    });
    const launcher = makeLauncher(spawn, { pythonPath: 'python3' });

    const error = await launcher.check().catch((error: unknown) => error);
    expectCodedError(error, AitpResearchErrors.codes.AITP_ADAPTER_SPAWN_FAILED);
    expect((error as Error).message).toContain('executable missing');
  });
});

describe('AitpLauncher check exit codes', () => {
  it.each([
    [0, CLEAN_CHECK],
    [1, FINDINGS_CHECK],
  ] as const)('accepts check exit %i as a transport result', async (exitCode, payload) => {
    const spawn = vi.fn<IHostProcessService['spawn']>(async () => completedProcess(JSON.stringify(payload), exitCode));
    const launcher = makeLauncher(spawn, { pythonPath: 'python3' });

    await expect(launcher.check()).resolves.toMatchObject({ exitCode, data: payload });
  });

  it('rejects check exit 2 as a coded AITP command failure', async () => {
    const spawn = vi.fn<IHostProcessService['spawn']>(async () => completedProcess(JSON.stringify({
      status: 'error',
      code: 'not_initialized',
      message: 'workspace is not initialized',
    }), 2));
    const launcher = makeLauncher(spawn, { pythonPath: 'python3' });

    const error = await launcher.check().catch((error: unknown) => error);
    expectCodedError(error, AitpResearchErrors.codes.AITP_ADAPTER_NOT_INITIALIZED);
    expect((error as Error).message).toContain('not_initialized');
  });
});

describe('AitpLauncher output limits', () => {
  it('accepts stdout exactly at the byte limit', async () => {
    const base = JSON.stringify({ ...CLEAN_CHECK, root: '' });
    const rootLength = MAX_STDOUT_BYTES - Buffer.byteLength(base);
    const payload = JSON.stringify({ ...CLEAN_CHECK, root: 'x'.repeat(rootLength) });
    expect(Buffer.byteLength(payload)).toBe(MAX_STDOUT_BYTES);

    const spawn = vi.fn<IHostProcessService['spawn']>(async () => completedProcess(payload));
    const launcher = makeLauncher(spawn, { pythonPath: 'python3' });

    await expect(launcher.check()).resolves.toMatchObject({ data: { status: 'clean' } });
  });

  it('fails closed on stdout overflow without putting the payload in the error', async () => {
    const sentinel = 'stdout-secret-payload';
    const stdout = Buffer.concat([
      Buffer.alloc(MAX_STDOUT_BYTES, 0x78),
      Buffer.from(sentinel),
    ]);
    const dispose = vi.fn();
    const process = completedProcess(stdout);
    process.dispose = dispose;
    const spawn = vi.fn<IHostProcessService['spawn']>(async () => process);
    const launcher = makeLauncher(spawn, { pythonPath: 'python3' });

    const error = await launcher.check().catch((error: unknown) => error);
    expectCodedError(error, AitpResearchErrors.codes.AITP_ADAPTER_OUTPUT_LIMIT);
    expect((error as Error).message).not.toContain(sentinel);
    expect((error as AitpResearchError).details).toMatchObject({
      stream: 'stdout',
      limitBytes: MAX_STDOUT_BYTES,
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('fails closed on stderr overflow without parsing stdout', async () => {
    const sentinel = 'stderr-secret-payload';
    const dispose = vi.fn();
    const process = completedProcess(JSON.stringify(CLEAN_CHECK), 0, `${'e'.repeat(MAX_STDERR_BYTES)}${sentinel}`);
    process.dispose = dispose;
    const spawn = vi.fn<IHostProcessService['spawn']>(async () => process);
    const launcher = makeLauncher(spawn, { pythonPath: 'python3' });

    const error = await launcher.check().catch((error: unknown) => error);
    expectCodedError(error, AitpResearchErrors.codes.AITP_ADAPTER_OUTPUT_LIMIT);
    expect((error as Error).message).not.toContain(sentinel);
    expect((error as AitpResearchError).details).toMatchObject({
      stream: 'stderr',
      limitBytes: MAX_STDERR_BYTES,
    });
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe('AitpLauncher process termination', () => {
  it('uses SIGTERM, then SIGKILL after grace, and disposes on timeout', async () => {
    vi.useFakeTimers();
    let resolveWait!: (exitCode: number) => void;
    const waitPromise = new Promise<number>((resolve) => {
      resolveWait = resolve;
    });
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const kill = vi.fn(async (signal?: NodeJS.Signals) => {
      if (signal === 'SIGKILL') resolveWait(137);
    });
    const dispose = vi.fn();
    const process: IHostProcess = {
      _serviceBrand: undefined,
      pid: 42,
      exitCode: null,
      stdin: new PassThrough(),
      stdout,
      stderr,
      wait: () => waitPromise,
      kill,
      dispose,
    };
    const spawn = vi.fn<IHostProcessService['spawn']>(async () => process);
    const launcher = makeLauncher(spawn, { pythonPath: 'python3', timeoutMs: 10 });

    const pending = expect(launcher.check()).rejects.toMatchObject({ code: AitpResearchErrors.codes.AITP_ADAPTER_TIMEOUT });
    await vi.advanceTimersByTimeAsync(10);
    expect(kill).toHaveBeenCalledWith('SIGTERM');
    expect(kill).not.toHaveBeenCalledWith('SIGKILL');

    await vi.advanceTimersByTimeAsync(2_999);
    expect(kill).not.toHaveBeenCalledWith('SIGKILL');
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
    expect(dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes and translates a process wait rejection without leaking it', async () => {
    const dispose = vi.fn();
    const process: IHostProcess = {
      ...completedProcess(),
      wait: async () => { throw new Error('wait failed'); },
      dispose,
    };
    const spawn = vi.fn<IHostProcessService['spawn']>(async () => process);
    const launcher = makeLauncher(spawn, { pythonPath: 'python3' });

    const error = await launcher.check().catch((error: unknown) => error);
    expectCodedError(error, AitpResearchErrors.codes.AITP_ADAPTER_SPAWN_FAILED);
    expect((error as Error).message).toContain('wait failed');
    expect(dispose).toHaveBeenCalledOnce();
  });
});
