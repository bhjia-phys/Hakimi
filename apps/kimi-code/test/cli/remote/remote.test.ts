import { EventEmitter } from 'node:events';
import { chmodSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  REMOTE_SHARE_ALREADY_ACTIVE_CODE,
  RemoteShareError,
  type RemoteAccessEdgeFactory,
} from '@moonshot-ai/kap-server';

import {
  buildRemoteRootUrl,
  buildRemoteSessionUrl,
  cloudflaredInstallMessage,
  createRemoteToken,
  createSystemctlRunner,
  createTemporaryAuthTokenService,
  createTunnelLogTail,
  createTunnelReadinessMonitor,
  formatRemoteBanner,
  formatServeBanner,
  formatStartBanner,
  formatStopBanner,
  isFreshRemoteState,
  isSystemdUserAvailable,
  loadOrCreateRemoteConfig,
  parseRemoteOptions,
  parseRemoteTtl,
  parseServeLogLevel,
  parseShowOutput,
  pollForStateFile,
  probeTunnelReadiness,
  quoteSystemdArg,
  readPrivateJsonFile,
  readRemoteUnitStatus,
  redactDiagnosticText,
  registerRemoteCommand,
  registerRemoteCommands,
  renderRemoteUnit,
  remoteConfigPath,
  remoteStatePath,
  RemoteConfigSchema,
  RemoteStateSchema,
  resolveCloudflaredPath,
  resolveHakimiLaunchVector,
  runRemoteControl,
  runRemoteServe,
  runRemoteStart,
  runRemoteStatus,
  runRemoteStop,
  startRemoteService,
  stopRemoteService,
  spawnCloudflared,
  systemctlDaemonReload,
  systemctlDisableNow,
  systemctlEnableNow,
  terminateCloudflared,
  waitForMetricsAddress,
  waitForTryCloudflareUrl,
  writePrivateJsonFile,
  type MetricsAddressStatus,
  type RemoteControlDeps,
  type RemoteServeDeps,
  type RemoteStartCliOptions,
  type SystemctlRunner,
  type TunnelUnhealthyDiagnosis,
} from '#/cli/sub/remote/index';
import {
  createRemoteShareManager,
  REMOTE_SHARE_START_FAILED_CODE,
  type RemoteShareManagerDeps,
} from '#/cli/sub/web/remote-share';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: mocks.spawn };
});

type FakeChild = ChildProcess & { readonly stdout: PassThrough; readonly stderr: PassThrough };

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  Object.assign(child, {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: null,
    exitCode: null,
    signalCode: null,
    killed: false,
    kill: vi.fn(() => true),
  });
  return child;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.spawn.mockReset();
  process.exitCode = undefined;
});

describe('remote options', () => {
  it('requires a session and strictly parses port, ttl, cloudflared, and log level', () => {
    expect(() => parseRemoteOptions({})).toThrow('--session <id> is required');
    expect(
      parseRemoteOptions({
        session: ' session-1 ',
        port: '0',
        ttl: '30m',
        cloudflared: '/opt/cloudflared',
        logLevel: 'warn',
      }),
    ).toEqual({
      sessionId: 'session-1',
      port: 0,
      ttlMs: 30 * 60 * 1_000,
      cloudflaredPath: '/opt/cloudflared',
      logLevel: 'warn',
    });
    expect(parseRemoteTtl(undefined)).toBe(8 * 60 * 60 * 1_000);
    expect(parseRemoteTtl('1d')).toBe(24 * 60 * 60 * 1_000);
    expect(() => parseRemoteTtl('25h')).toThrow('maximum supported duration is 24h');
    expect(() => parseRemoteTtl('2d')).toThrow('maximum supported duration is 24h');
    expect(() => parseRemoteTtl('1hour')).toThrow('invalid --ttl');
    expect(() => parseRemoteTtl('0m')).toThrow('invalid --ttl');
    expect(() => parseRemoteOptions({ session: 's', cloudflared: 'cloudflared' })).toThrow(
      'absolute executable path',
    );
  });

  it('resolves explicit path, then env, then the safe PATH resolver', () => {
    const isExecutable = vi.fn(() => true);
    const resolveFromPath = vi.fn(() => '/usr/bin/cloudflared');
    expect(
      resolveCloudflaredPath('/explicit/cloudflared', {
        env: { KIMI_CODE_CLOUDFLARED_PATH: '/env/cloudflared' },
        cwd: '/workspace',
        isExecutable,
        resolveFromPath,
      }),
    ).toBe('/explicit/cloudflared');
    expect(resolveFromPath).not.toHaveBeenCalled();

    expect(
      resolveCloudflaredPath(undefined, {
        env: { KIMI_CODE_CLOUDFLARED_PATH: '/env/cloudflared' },
        cwd: '/workspace',
        isExecutable,
        resolveFromPath,
      }),
    ).toBe('/env/cloudflared');

    expect(
      resolveCloudflaredPath(undefined, {
        env: {},
        cwd: '/workspace',
        isExecutable,
        resolveFromPath,
      }),
    ).toBe('/usr/bin/cloudflared');
    expect(resolveFromPath).toHaveBeenLastCalledWith('cloudflared', '/workspace');
  });

  it('does not fall back from an unsafe env path and gives official install/terms links when missing', () => {
    expect(() =>
      resolveCloudflaredPath(undefined, {
        env: { KIMI_CODE_CLOUDFLARED_PATH: './cloudflared' },
        resolveFromPath: vi.fn(() => '/usr/bin/cloudflared'),
      }),
    ).toThrow('must contain an absolute executable path');

    const message = cloudflaredInstallMessage();
    expect(message).toContain('will not download');
    expect(message).toContain('developers.cloudflare.com');
    expect(message).toContain('cloudflare.com/website-terms');
  });

  it('keeps the takeover CLI entry hidden while registering its required options', () => {
    const program = new Command('hakimi');
    registerRemoteCommand(program);
    const command = program.commands.find((candidate) => candidate.name() === 'remote');
    expect(command).toBeDefined();
    expect((command as typeof command & { _hidden?: boolean })._hidden).toBe(true);
    expect(command!.options.find((option) => option.long === '--session')?.mandatory).toBe(true);
    expect(command!.options.map((option) => option.long)).toEqual([
      '--session',
      '--port',
      '--ttl',
      '--cloudflared',
      '--log-level',
    ]);
  });
});

describe('cloudflared process boundary', () => {
  it('spawns the exact quick-tunnel command without http-host-header', () => {
    const child = makeChild();
    mocks.spawn.mockReturnValue(child);

    expect(spawnCloudflared('/usr/bin/cloudflared', 60001)).toBe(child);
    expect(mocks.spawn).toHaveBeenCalledWith(
      '/usr/bin/cloudflared',
      [
        'tunnel',
        '--no-autoupdate',
        '--output',
        'json',
        '--url',
        'http://127.0.0.1:60001',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    expect(mocks.spawn.mock.calls[0]![1]).not.toContain('http-host-header');
  });

  it('extracts a trycloudflare URL only from parsed JSON log fields', async () => {
    const child = makeChild();
    const pending = waitForTryCloudflareUrl(child, { timeoutMs: 1_000 });
    child.stderr.write('https://ignored.trycloudflare.com\n');
    child.stdout.write(
      `${JSON.stringify({ level: 'info', message: 'Visit https://valid-name.trycloudflare.com now' })}\n`,
    );

    await expect(pending).resolves.toBe('https://valid-name.trycloudflare.com');
  });

  it('fails on early exit and on the bounded pre-ready log buffer', async () => {
    const exited = makeChild();
    const early = waitForTryCloudflareUrl(exited, { timeoutMs: 1_000 });
    exited.emit('close', 1, null);
    await expect(early).rejects.toThrow('exited before publishing');

    const noisy = makeChild();
    const overflow = waitForTryCloudflareUrl(noisy, {
      timeoutMs: 1_000,
      maxBufferBytes: 16,
    });
    noisy.stderr.write('x'.repeat(17));
    await expect(overflow).rejects.toThrow('buffer exceeded');
  });

  it('escalates cloudflared shutdown from SIGTERM to SIGKILL after the timeout', async () => {
    const child = makeChild();

    await terminateCloudflared(child, 1, 1);

    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });

  it('appends only an opt-in metrics bind without changing the base command', () => {
    const child = makeChild();
    mocks.spawn.mockReturnValue(child);

    expect(spawnCloudflared('/usr/bin/cloudflared', 60001, { metrics: '127.0.0.1:0' })).toBe(child);
    expect(mocks.spawn).toHaveBeenCalledWith(
      '/usr/bin/cloudflared',
      [
        'tunnel',
        '--no-autoupdate',
        '--output',
        'json',
        '--url',
        'http://127.0.0.1:60001',
        '--metrics',
        '127.0.0.1:0',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
  });

  it('parses the loopback metrics address from cloudflared JSON logs across chunks', async () => {
    const child = makeChild();
    const pending = waitForMetricsAddress(child, { timeoutMs: 1_000 });
    child.stdout.write('{"level":"info","mess');
    child.stdout.write('age":"Starting metrics server on 127.0.0.1:42221/metrics"}\n');

    await expect(pending).resolves.toEqual({ host: '127.0.0.1', port: 42221 });
  });

  it('rejects the IPv6 loopback form because serve binds and probes IPv4', async () => {
    const child = makeChild();
    const pending = waitForMetricsAddress(child, { timeoutMs: 50 });
    child.stdout.write(
      `${JSON.stringify({ level: 'info', message: 'Starting metrics server on [::1]:43333/metrics' })}\n`,
    );

    await expect(pending).rejects.toThrow('timed out');
  });

  it('refuses non-loopback, malformed, or illegal metrics addresses', async () => {
    const cases = [
      'Starting metrics server on 0.0.0.0:42221/metrics',
      'Starting metrics server on 192.168.1.10:42221/metrics',
      'Starting metrics server on localhost:42221/metrics',
      'Starting metrics server on 127.0.0.1:0/metrics',
      'Starting metrics server on 127.0.0.1:99999/metrics',
      'Starting metrics server on 127.0.0.1:42221', // missing /metrics suffix
      'Starting metrics server on 127.0.0.1:42221/other',
      'Metrics listening at http://127.0.0.1:42221/metrics', // wrong message shape
      'not json at all',
    ];
    for (const message of cases) {
      const child = makeChild();
      const pending = waitForMetricsAddress(child, { timeoutMs: 50 });
      child.stdout.write(`${JSON.stringify({ level: 'info', message })}\n`);
      await expect(pending).rejects.toThrow('timed out');
    }
  });

  it('fails on early exit before publishing a metrics address', async () => {
    const child = makeChild();
    const pending = waitForMetricsAddress(child, { timeoutMs: 1_000 });
    child.emit('close', 1, null);

    await expect(pending).rejects.toThrow('exited before publishing a metrics address');
  });

  it('probes /ready on loopback without auth, releasing the body and refusing redirects', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      expect(init?.headers).not.toHaveProperty('authorization');
      return new Response(JSON.stringify({ status: 200, readyConnections: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeTunnelReadiness(42221)).resolves.toEqual({
      ok: true,
      detail: 'readyConnections 1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:42221/ready',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('reports /ready failure states and network errors without echoing the body', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"status":503,"readyConnections":0}', { status: 503 }));
    expect(await probeTunnelReadiness(42221)).toEqual({
      ok: false,
      detail: 'ready 503, readyConnections 0',
    });

    vi.stubGlobal('fetch', async () => new Response('{"status":200,"readyConnections":0}', { status: 200 }));
    expect(await probeTunnelReadiness(42221)).toEqual({
      ok: false,
      detail: 'readyConnections 0',
    });

    vi.stubGlobal('fetch', async () => new Response('not json', { status: 200 }));
    expect(await probeTunnelReadiness(42221)).toEqual({
      ok: false,
      detail: 'ready body lacks a numeric readyConnections',
    });

    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await probeTunnelReadiness(42221)).toEqual({
      ok: false,
      detail: 'probe failed: ECONNREFUSED',
    });
  });

  it('never reads or echoes more than a bounded /ready body', async () => {
    const huge = JSON.stringify({ status: 200, readyConnections: 1, pad: 'y'.repeat(4096) });
    vi.stubGlobal('fetch', async () => new Response(huge, { status: 200 }));
    const result = await probeTunnelReadiness(42221);
    expect(result.detail.length).toBeLessThan(256);
    expect(result.detail).not.toContain('y'.repeat(16));
  });

  it('retains only the byte cap from one huge body chunk and handles multibyte JSON', async () => {
    const huge = new Uint8Array(1024 * 1024);
    huge.fill(120); // ASCII `x`
    const originalSubarray = huge.subarray.bind(huge);
    const subarray = vi.fn((start: number, end: number) => originalSubarray(start, end));
    Object.defineProperty(huge, 'subarray', { value: subarray });
    const cancel = vi.fn(async () => {});
    const read = vi.fn(async () => ({ done: false as const, value: huge }));
    const response = {
      ok: true,
      status: 200,
      body: { getReader: () => ({ read, cancel }) },
    } as unknown as Response;
    vi.stubGlobal('fetch', async () => response);

    expect((await probeTunnelReadiness(42221)).ok).toBe(false);
    expect(subarray).toHaveBeenCalledWith(0, 256);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);

    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ readyConnections: 1, note: '你好😀' }), { status: 200 }),
    );
    await expect(probeTunnelReadiness(42221)).resolves.toEqual({
      ok: true,
      detail: 'readyConnections 1',
    });
  });

  it('does not call fetch for a pre-aborted readiness probe', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeTunnelReadiness(42221, { signal: controller.signal })).resolves.toEqual({
      ok: false,
      detail: 'probe aborted before start',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts a hanging /ready probe on its timeout', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const result = await probeTunnelReadiness(42221, { timeoutMs: 20 });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('probe aborted');
  });

  it('keeps the log tail bounded and drops pathological lines', () => {
    const tail = createTunnelLogTail({ limitBytes: 64 });
    for (let index = 0; index < 20; index += 1) {
      tail.onChunk(`line-${index} ${'x'.repeat(10)}\n`);
    }
    const dump = tail.dump();
    expect(Buffer.byteLength(dump)).toBeLessThanOrEqual(64);
    expect(dump).not.toContain('line-0');
    expect(dump).toContain('line-19');

    // A single oversized line is dropped whole (never sliced) with a marker.
    const pathological = createTunnelLogTail({ limitBytes: 64 });
    pathological.onChunk(`${'a'.repeat(200)}\n`);
    const clipped = pathological.dump();
    expect(Buffer.byteLength(clipped)).toBeLessThanOrEqual(64);
    expect(clipped).toContain('[truncated log line]');
    expect(clipped).not.toContain('a'.repeat(100));

    // Incomplete lines are never included in diagnostics, even if they contain
    // an otherwise recognizable credential.
    const unfinished = createTunnelLogTail({ limitBytes: 128, redact: redactDiagnosticText });
    unfinished.onChunk('Authorization: Bearer TOP_SECRET');
    expect(unfinished.dump()).toBe('');

    // Once a partial line exceeds the limit, discard its later chunks through
    // the next newline; only the fixed marker and following safe line survive.
    const partial = createTunnelLogTail({ limitBytes: 64, redact: redactDiagnosticText });
    partial.onChunk(`Authorization: Bearer ${'x'.repeat(80)}`);
    partial.onChunk('SECRET_TAIL\nnext-safe\n');
    const partialDump = partial.dump();
    expect(partialDump).toContain('[truncated log line]');
    expect(partialDump).not.toContain('SECRET_TAIL');
    expect(partialDump).toContain('next-safe');

    // Markers that do not fit are dropped; dump honours maxBytes per line and
    // in total.
    const tiny = createTunnelLogTail({ limitBytes: 4 });
    tiny.onChunk(`${'x'.repeat(20)}\n`);
    expect(tiny.dump()).toBe('');
    const sized = createTunnelLogTail({ limitBytes: 64 });
    sized.onChunk('line-one\n');
    sized.onChunk('another-long-line\n');
    const small = sized.dump({ maxBytes: 8 });
    expect(Buffer.byteLength(small)).toBeLessThanOrEqual(8);
    const medium = sized.dump({ maxBytes: 20 });
    expect(Buffer.byteLength(medium)).toBeLessThanOrEqual(20);
  });

  it('enforces UTF-8 byte budgets and never splits a redaction boundary', () => {
    const tail = createTunnelLogTail({ limitBytes: 32, redact: redactDiagnosticText });
    tail.onChunk(`你好 ${'密'.repeat(40)}\n`); // multibyte far beyond the budget
    const dump = tail.dump();
    expect(Buffer.byteLength(dump)).toBeLessThanOrEqual(32);
    expect(dump).toContain('[truncated'); // whole line dropped, no sliced surrogates

    const utf = createTunnelLogTail({ limitBytes: 64 });
    utf.onChunk('mid😀line\n');
    expect(utf.dump()).toContain('mid😀line');
    expect(Buffer.byteLength(utf.dump())).toBeLessThanOrEqual(64);

    // A redacted line that still fits is kept; the secret never survives.
    const fits = createTunnelLogTail({ limitBytes: 200, redact: redactDiagnosticText });
    fits.onChunk(`msg token=${fixedToken()} end\n`);
    const fitted = fits.dump();
    expect(fitted).toContain('token=[REDACTED]');
    expect(fitted).not.toContain(fixedToken());

    // An oversized line whose CONTENT is a secret is dropped whole, so no
    // half-redacted slice (e.g. `#token=` without the value) can leak.
    const secretLine = `#token=${fixedToken()} ${'z'.repeat(200)}`;
    const secretTail = createTunnelLogTail({ limitBytes: 64, redact: redactDiagnosticText });
    secretTail.onChunk(`${secretLine}\n`);
    const secretDump = secretTail.dump();
    expect(secretDump).not.toContain(fixedToken());
    expect(secretDump).not.toContain('#token=');
    expect(secretDump).toContain('[truncated');
  });

  it('redacts credentials in every context, including JSON values and bare tokens', () => {
    expect(redactDiagnosticText('url#token=ABC123XYZ end')).toBe('url#token=[REDACTED] end');
    expect(redactDiagnosticText('#access_token=abc')).toBe('#access_token=[REDACTED]');
    expect(
      redactDiagnosticText('?access_token=abc&refresh_token=def&client_secret=ghi'),
    ).toBe('?access_token=[REDACTED]&refresh_token=[REDACTED]&client_secret=[REDACTED]');
    expect(redactDiagnosticText('Authorization: Bearer AAAA.BBBB.CCCC')).toContain(
      'Bearer [REDACTED]',
    );
    expect(redactDiagnosticText('https://user:pass@example.test/path')).toBe(
      'https://[REDACTED]@example.test/path',
    );
    expect(redactDiagnosticText('{"access_token":"AAAA","refresh_token":"BBBB"}')).toBe(
      '{"access_token":"[REDACTED]","refresh_token":"[REDACTED]"}',
    );
    // Token-shaped fallback covers ordinary 43-char base64url values.
    expect(redactDiagnosticText(`say ${fixedToken()} stop`)).toBe('say [REDACTED] stop');
    expect(redactDiagnosticText(`{"token":"${fixedToken()}"}`)).toBe(
      '{"token":"[REDACTED]"}',
    );
    // The known-token path is exact: leading/trailing '-' and arbitrary
    // adjacent characters cannot defeat it through regex boundary behavior.
    const knownToken = `-${'A'.repeat(41)}-`;
    expect(knownToken).toHaveLength(43);
    expect(redactDiagnosticText(`x${knownToken}y`, knownToken)).toBe('x[REDACTED]y');
  });
});

describe('tunnel readiness monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('probes immediately and clears the startup deadline on the first ok', async () => {
    const probe = vi.fn(async () => ({ ok: true, detail: 'readyConnections 1' }));
    const onUnhealthy = vi.fn();
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => ({ state: 'known', host: '127.0.0.1', port: 42221 }),
      probe,
      onUnhealthy,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1); // probes immediately
    await vi.advanceTimersByTimeAsync(5 * 5_000);
    expect(probe).toHaveBeenCalledTimes(6);
    // The startup deadline was cleared by the first ok, so 60s passes quietly.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(onUnhealthy).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('recovers after a transient failure once the startup deadline is cleared', async () => {
    const answers = [
      { ok: true, detail: 'ok' }, // t0: deadline cleared
      { ok: false, detail: 'down' }, // t5: fail 1
      { ok: false, detail: 'down' }, // t10: fail 2
      { ok: true, detail: 'ok' }, // t15: counter cleared
      { ok: false, detail: 'down' }, // t20: fail 1
      { ok: false, detail: 'down' }, // t25: fail 2
      { ok: false, detail: 'down' }, // t30: fail 3 → unhealthy
    ];
    const probe = vi.fn(async () => answers.shift() ?? { ok: true, detail: 'ok' });
    const onUnhealthy = vi.fn();
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => ({ state: 'known', host: '127.0.0.1', port: 42221 }),
      probe,
      onUnhealthy,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2 * 5_000);
    expect(onUnhealthy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000); // ok — counter cleared
    await vi.advanceTimersByTimeAsync(2 * 5_000);
    expect(onUnhealthy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000); // fail 3 → unhealthy
    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledTimes(7);
  });

  it('with the deadline cleared, three consecutive failures fire exactly once', async () => {
    const probe = vi.fn(async () => ({ ok: false, detail: 'readyConnections 0' }));
    let diagnosis: TunnelUnhealthyDiagnosis | undefined;
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => ({ state: 'known', host: '127.0.0.1', port: 42221 }),
      probe,
      onUnhealthy: (d) => {
        diagnosis = d;
      },
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(0); // t0: fail during the deadline phase (no counting)
    const ok = vi.fn(async () => ({ ok: true, detail: 'ok' }));
    probe.mockImplementation(ok);
    await vi.advanceTimersByTimeAsync(5_000); // t5: ok — deadline cleared, counter reset
    probe.mockImplementation(async () => ({ ok: false, detail: 'readyConnections 0' }));
    await vi.advanceTimersByTimeAsync(3 * 5_000); // t10, t15, t20: fail 1..3 → unhealthy
    expect(probe).toHaveBeenCalledTimes(5);
    expect(diagnosis).toMatchObject({
      metrics: { state: 'known', host: '127.0.0.1', port: 42221 },
      lastOkAt: expect.any(Number),
    });
    expect(diagnosis?.failures).toHaveLength(3);
    expect(diagnosis?.failures[0]?.detail).toBe('readyConnections 0');

    const calls = probe.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000); // stopped → nothing more
    expect(probe).toHaveBeenCalledTimes(calls);
  });

  it('never ok: fires once at the startup deadline despite repeated failures', async () => {
    const probe = vi.fn(async () => ({ ok: false, detail: 'readyConnections 0' }));
    let diagnosis: TunnelUnhealthyDiagnosis | undefined;
    const onUnhealthy = vi.fn((d: TunnelUnhealthyDiagnosis) => {
      diagnosis = d;
    });
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => ({ state: 'known', host: '127.0.0.1', port: 42221 }),
      probe,
      onUnhealthy,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    expect(diagnosis?.lastOkAt).toBeNull();
    expect(diagnosis?.failures.some((f) => f.detail.includes('never became ready'))).toBe(true);
    expect(probe).toHaveBeenCalledTimes(12); // every 5s from 0s to 55s

    await vi.advanceTimersByTimeAsync(120_000); // stopped → nothing more
    expect(probe).toHaveBeenCalledTimes(12);
  });

  it('waits for a late metrics address and probes once it appears', async () => {
    let status: MetricsAddressStatus = { state: 'pending' };
    const probe = vi.fn(async () => ({ ok: true, detail: 'ok' }));
    const onUnhealthy = vi.fn();
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => status,
      probe,
      onUnhealthy,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(0); // pending → keep waiting
    status = { state: 'known', host: '127.0.0.1', port: 42221 };
    await vi.advanceTimersByTimeAsync(2 * 5_000); // next tick probes and clears the deadline
    await vi.advanceTimersByTimeAsync(120_000);
    expect(onUnhealthy).not.toHaveBeenCalled();
    expect(probe.mock.calls.length).toBeGreaterThan(0);
  });

  it('reports unhealthy at the deadline when the metrics address never resolves', async () => {
    let status: MetricsAddressStatus = { state: 'pending' };
    const probe = vi.fn(async () => ({ ok: true, detail: 'ok' }));
    let diagnosis: TunnelUnhealthyDiagnosis | undefined;
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => status,
      probe,
      onUnhealthy: (d) => {
        diagnosis = d;
      },
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(0); // pending → wait, no probe
    await vi.advanceTimersByTimeAsync(60_000); // deadline fires
    expect(diagnosis?.metrics.state).toBe('pending');
    expect(diagnosis?.failures.some((f) => f.detail.includes('never became ready'))).toBe(true);
    expect(probe).not.toHaveBeenCalled();

    // A late resolution cannot resurrect a stopped monitor.
    status = { state: 'known', host: '127.0.0.1', port: 42221 };
    await vi.advanceTimersByTimeAsync(120_000);
    expect(probe).not.toHaveBeenCalled();
  });

  it('keeps a failed metrics discovery under the same 60s startup deadline', async () => {
    const probe = vi.fn(async () => ({ ok: true, detail: 'ok' }));
    const onUnhealthy = vi.fn();
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => ({ state: 'failed' }),
      probe,
      onUnhealthy,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(59_999);
    expect(onUnhealthy).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    expect(probe).not.toHaveBeenCalled();
  });

  it('counts a metrics-state regression after the first ok as a normal failure', async () => {
    let status: MetricsAddressStatus = { state: 'known', host: '127.0.0.1', port: 42221 };
    const probe = vi.fn(async () => ({ ok: true, detail: 'ok' }));
    let diagnosis: TunnelUnhealthyDiagnosis | undefined;
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => status,
      probe,
      onUnhealthy: (value) => {
        diagnosis = value;
      },
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(0); // first OK clears startup deadline
    status = { state: 'pending' };
    await vi.advanceTimersByTimeAsync(3 * 5_000);
    expect(diagnosis?.failures).toHaveLength(3);
    expect(diagnosis?.failures.every((failure) => failure.detail === 'metrics address pending')).toBe(
      true,
    );
  });

  it('aborts a hanging probe at the startup deadline', async () => {
    let probeSignal: AbortSignal | undefined;
    const probe = vi.fn(
      async (_port: number, signal: AbortSignal) =>
        new Promise<{ ok: boolean; detail: string }>((_resolve, reject) => {
          probeSignal = signal;
          signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const onUnhealthy = vi.fn();
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => ({ state: 'known', host: '127.0.0.1', port: 42221 }),
      probe,
      onUnhealthy,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(probeSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000); // deadline aborts the hanging probe
    expect(probeSignal?.aborted).toBe(true);
    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('never starts against an already-aborted signal', async () => {
    const external = new AbortController();
    external.abort();
    const probe = vi.fn(async () => ({ ok: true, detail: 'ok' }));
    const onUnhealthy = vi.fn();
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => ({ state: 'known', host: '127.0.0.1', port: 42221 }),
      probe,
      signal: external.signal,
      onUnhealthy,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(probe).not.toHaveBeenCalled();
    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  it('never overlaps probes, tolerates a duplicate start, and stops on the external signal', async () => {
    let resolveProbe!: (result: { ok: boolean; detail: string }) => void;
    const probe = vi.fn(
      async () =>
        new Promise<{ ok: boolean; detail: string }>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const onUnhealthy = vi.fn();
    const external = new AbortController();
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => ({ state: 'known', host: '127.0.0.1', port: 42221 }),
      probe,
      signal: external.signal,
      onUnhealthy,
    });
    monitor.start();
    monitor.start(); // idempotent

    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1); // one in-flight probe
    await vi.advanceTimersByTimeAsync(20_000); // still hanging → no overlap
    expect(probe).toHaveBeenCalledTimes(1);

    resolveProbe({ ok: true, detail: 'ok' });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(probe).toHaveBeenCalledTimes(2);

    external.abort();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  it('a throwing onUnhealthy callback cannot surface an unhandled rejection', async () => {
    const probe = vi.fn(async () => ({ ok: true, detail: 'ok' }));
    const onUnhealthy = vi.fn(() => {
      throw new Error('logger exploded');
    });
    const monitor = createTunnelReadinessMonitor({
      metricsAddress: () => ({ state: 'known', host: '127.0.0.1', port: 42221 }),
      probe,
      onUnhealthy,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(0); // ok clears the deadline
    probe.mockImplementation(async () => ({ ok: false, detail: 'down' }));
    await vi.advanceTimersByTimeAsync(3 * 5_000); // threshold → callback throws inside fire()
    expect(probe).toHaveBeenCalledTimes(4);
    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(probe).toHaveBeenCalledTimes(4); // stopped, no further calls
  });
});

describe('remote runner', () => {
  it('uses an ephemeral constant-time auth service and builds the remote deep link', async () => {
    const token = createRemoteToken((size) => Buffer.alloc(size, 7));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const auth = createTemporaryAuthTokenService(token);
    await expect(auth.isValid(token)).resolves.toBe(true);
    await expect(auth.isValid(`${token.slice(0, -1)}x`)).resolves.toBe(false);
    await expect(auth.isValid('short')).resolves.toBe(false);

    expect(buildRemoteSessionUrl('https://name.trycloudflare.com', 'a/b c', token)).toBe(
      `https://name.trycloudflare.com/sessions/a%2Fb%20c?remote=1#token=${token}`,
    );
    const banner = formatRemoteBanner('https://example.test/#token=secret', 60_000, 'QR');
    expect(banner).toContain('QR');
    expect(banner).toContain('Copy URL:');
    expect(banner).toContain('Risk:');
    expect(banner).toContain('Stop:  Ctrl+C');
    expect(banner).not.toContain('Token:');
  });

  it('starts the full loopback server, tunnels the actual port, then closes tunnel before server', async () => {
    const child = makeChild();
    const cleanupOrder: string[] = [];
    let serverOptions: Record<string, unknown> | undefined;
    const close = vi.fn(async () => {
      cleanupOrder.push('server');
    });
    const startServer = vi.fn(async (options) => {
      serverOptions = options as Record<string, unknown>;
      return {
        host: '127.0.0.1',
        port: 60001,
        close,
      } as never;
    });
    const spawnTunnel = vi.fn(() => child);
    const terminateTunnel = vi.fn(async () => {
      cleanupOrder.push('cloudflared');
    });
    const signalSource = new EventEmitter();
    let output = '';

    await runRemoteControl(
      {
        sessionId: 'session-1',
        port: 58627,
        ttlMs: 20,
        cloudflaredPath: '/opt/cloudflared',
        logLevel: 'silent',
      },
      {
        env: {},
        startServer,
        spawnCloudflared: spawnTunnel,
        waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
        terminateCloudflared: terminateTunnel,
        resolveCloudflaredPath: () => '/opt/cloudflared',
        generateToken: () => 'temporary-token',
        generateQrCode: async () => 'QR-CODE',
        signalSource,
        stdout: {
          write(chunk) {
            output += String(chunk);
            return true;
          },
        },
      },
    );

    expect(serverOptions).toMatchObject({
      host: '127.0.0.1',
      port: 58627,
      bindClass: 'public',
      insecureNoTls: true,
      allowedHosts: ['.trycloudflare.com'],
      debugEndpoints: false,
      allowRemoteShutdown: false,
      allowRemoteTerminals: false,
    });
    expect(serverOptions).not.toHaveProperty('remoteAccess');
    expect(serverOptions?.['webAssetsDir']).toEqual(expect.any(String));
    expect(spawnTunnel).toHaveBeenCalledWith('/opt/cloudflared', 60001);
    expect(cleanupOrder).toEqual(['cloudflared', 'server']);
    expect(output).toContain('QR-CODE');
    expect(output).toContain(
      'https://public-name.trycloudflare.com/sessions/session-1?remote=1#token=temporary-token',
    );
    expect(output).not.toContain('Token:');
  });

  it('keeps signal listeners attached through teardown and swallows a second signal', async () => {
    const child = makeChild();
    const order: string[] = [];
    const signalSource = new EventEmitter();
    let releaseTunnel!: () => void;
    const tunnelGate = new Promise<void>((resolve) => {
      releaseTunnel = resolve;
    });
    let output = '';
    const pending = runRemoteControl(
      {
        sessionId: 'session-1',
        port: 58627,
        ttlMs: 60_000,
        cloudflaredPath: '/opt/cloudflared',
        logLevel: 'silent',
      },
      {
        env: {},
        startServer: vi.fn(async () => ({
          host: '127.0.0.1',
          port: 60001,
          close: vi.fn(async () => {
            order.push('server');
          }),
        }) as never),
        spawnCloudflared: vi.fn(() => child),
        waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
        terminateCloudflared: vi.fn(async () => {
          order.push('cloudflared');
          await tunnelGate;
        }),
        resolveCloudflaredPath: () => '/opt/cloudflared',
        generateToken: () => 'temporary-token',
        generateQrCode: async () => 'QR',
        signalSource,
        stdout: {
          write(chunk: string) {
            output += chunk;
            return true;
          },
        },
      },
    );

    await vi.waitFor(() => {
      expect(output).toContain('QR');
    });
    signalSource.emit('SIGTERM');
    await vi.waitFor(() => {
      expect(order).toContain('cloudflared');
    });
    expect(signalSource.listenerCount('SIGTERM')).toBe(1);
    signalSource.emit('SIGTERM');
    releaseTunnel();
    await pending;
    expect(order).toEqual(['cloudflared', 'server']);
    expect(signalSource.listenerCount('SIGTERM')).toBe(0);
    expect(signalSource.listenerCount('SIGINT')).toBe(0);
  });
});

describe('web remote share manager', () => {
  const TUNNEL_URL = 'https://share-name.trycloudflare.com';

  function makeManager(overrides: Partial<RemoteShareManagerDeps> = {},) {
    const cleanupOrder: string[] = [];
    const spawnTunnel =
      overrides.spawnCloudflared ??
      vi.fn(() => {
        return makeChild();
      });
    const terminateTunnel =
      overrides.terminateCloudflared ??
      vi.fn(async () => {
        cleanupOrder.push('cloudflared');
      });
    const manager = createRemoteShareManager({
      env: overrides.env ?? {},
      generateToken: overrides.generateToken ?? (() => 'manager-token'),
      resolveCloudflaredPath:
        overrides.resolveCloudflaredPath ?? (() => '/opt/cloudflared'),
      spawnCloudflared: spawnTunnel,
      waitForTunnelUrl: overrides.waitForTunnelUrl ?? (async () => TUNNEL_URL),
      terminateCloudflared: terminateTunnel,
      logger: overrides.logger,
    });
    return { manager, cleanupOrder, spawnTunnel, terminateTunnel };
  }

  function edgeFactory(cleanupOrder: string[]): RemoteAccessEdgeFactory {
    return async (args) => ({
      sessionId: args.sessionId,
      host: '127.0.0.1',
      port: 60222,
      close: async () => {
        cleanupOrder.push('edge');
      },
    });
  }

  it('starts a share end-to-end: edge first, tunnel on the edge port, full fragment URL, double start rejected, stop in cloudflared→edge order', async () => {
    const { manager, cleanupOrder, spawnTunnel } = makeManager();
    const factory = vi.fn(edgeFactory(cleanupOrder));

    const result = await manager.start({ sessionId: 'session-9' }, factory);
    expect(result).toMatchObject({
      active: true,
      session_id: 'session-9',
      host: '127.0.0.1',
      port: 60222,
      ttl_seconds: 8 * 60 * 60,
      started_at: expect.any(String),
      expires_at: expect.any(String),
      url: `https://share-name.trycloudflare.com/sessions/session-9?remote=1#token=manager-token`,
    });
    expect(result.token).toBe('manager-token');
    expect(factory).toHaveBeenCalledWith({
      sessionId: 'session-9',
      authTokenService: expect.objectContaining({ _serviceBrand: undefined }),
    });
    expect(spawnTunnel).toHaveBeenCalledWith('/opt/cloudflared', 60222);

    // status keeps reporting the same URL (and never the token).
    expect(manager.status()).toMatchObject({
      active: true,
      port: 60222,
      url: `https://share-name.trycloudflare.com/sessions/session-9?remote=1#token=manager-token`,
    });
    expect(manager.status()).not.toHaveProperty('token');

    // A second share while one is running is a dedicated conflict.
    await expect(manager.start({ sessionId: 'other' }, factory)).rejects.toMatchObject({
      name: 'RemoteShareError',
      code: REMOTE_SHARE_ALREADY_ACTIVE_CODE,
    });

    await expect(manager.stop()).resolves.toMatchObject({ active: false });
    expect(cleanupOrder).toEqual(['cloudflared', 'edge']);
    expect(manager.status()).toEqual({
      active: false,
      session_id: null,
      host: null,
      port: null,
      url: null,
      ttl_seconds: null,
      started_at: null,
      expires_at: null,
    });
    // Stopping an already-stopped manager is a no-op.
    await expect(manager.stop()).resolves.toMatchObject({ active: false });
  });

  it('rejects a start while one is starting and stops mid-start by aborting the tunnel wait', async () => {
    const child = makeChild();
    const cleanupOrder: string[] = [];
    let waitSettled: ((error: Error) => void) | undefined;
    let waitCalls = 0;
    const waitForTunnelUrl = vi.fn(
      (_candidate: unknown, options: { signal: AbortSignal }) => {
        waitCalls += 1;
        // First start's wait stays pending until aborted; a later restart
        // resolves normally so the "back to idle" path is exercised too.
        if (waitCalls > 1) {
          return Promise.resolve('https://restart-name.trycloudflare.com');
        }
        return new Promise<string>((_resolve, reject) => {
          waitSettled = reject;
          options.signal.addEventListener('abort', () => {
            reject(new Error('cloudflared startup was cancelled'));
          });
        });
      },
    );
    const { manager } = makeManager({
      spawnCloudflared: vi.fn(() => child),
      waitForTunnelUrl,
      terminateCloudflared: vi.fn(async () => {
        cleanupOrder.push('cloudflared');
      }),
    });
    const factory = edgeFactory(cleanupOrder);

    const starting = manager.start({ sessionId: 'session-a' }, factory);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Single-flight while `starting`.
    await expect(manager.start({ sessionId: 'session-b' }, factory)).rejects.toMatchObject({
      code: REMOTE_SHARE_ALREADY_ACTIVE_CODE,
    });

    await expect(manager.stop()).resolves.toMatchObject({ active: false });
    await expect(starting).resolves.toMatchObject({ active: false });
    expect(waitSettled).toBeDefined();
    expect(cleanupOrder).toEqual(['cloudflared', 'edge']);

    // The manager returns to idle and can host a fresh share.
    const restart = await manager.start({ sessionId: 'session-c' }, factory);
    expect(restart).toMatchObject({ active: true, session_id: 'session-c' });
    await manager.stop();
    expect(cleanupOrder).toEqual(['cloudflared', 'edge', 'cloudflared', 'edge']);
  });

  it('auto-stops the share when the TTL elapses', async () => {
    const cleanupOrder: string[] = [];
    const { manager } = makeManager({
      terminateCloudflared: vi.fn(async () => {
        cleanupOrder.push('cloudflared');
      }),
    });

    await manager.start({ sessionId: 'session-ttl', ttlSeconds: 0.05 }, edgeFactory(cleanupOrder));
    expect(manager.status().active).toBe(true);

    const deadline = Date.now() + 2_000;
    while (manager.status().active && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(manager.status().active).toBe(false);
    expect(cleanupOrder).toEqual(['cloudflared', 'edge']);
  });

  it('ends the share when the tunnel exits while running', async () => {
    const child = makeChild();
    const cleanupOrder: string[] = [];
    const { manager } = makeManager({
      spawnCloudflared: vi.fn(() => child),
      terminateCloudflared: vi.fn(async () => {
        cleanupOrder.push('cloudflared');
      }),
    });

    await manager.start({ sessionId: 'session-exit' }, edgeFactory(cleanupOrder));
    expect(manager.status().active).toBe(true);

    child.emit('close', 1, null);
    const deadline = Date.now() + 2_000;
    while (manager.status().active && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(manager.status().active).toBe(false);
    expect(cleanupOrder).toEqual(['cloudflared', 'edge']);
  });

  it('maps expected start failures to a stable RemoteShareError, cleans the edge, and never logs URL/token', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const logger = {
      info: (obj: Record<string, unknown>, msg: string) => {
        logs.push({ ...obj, msg });
      },
      warn: (obj: Record<string, unknown>, msg: string) => {
        logs.push({ ...obj, msg });
      },
    };

    // cloudflared resolution failure.
    const missingOrder: string[] = [];
    const missing = makeManager({
      resolveCloudflaredPath: () => {
        throw new Error('cloudflared was not found; install it first');
      },
      logger,
    });
    const missingError = await missing.manager
      .start({ sessionId: 'session-missing' }, edgeFactory(missingOrder))
      .catch((error: unknown) => error);
    expect(missingError).toBeInstanceOf(RemoteShareError);
    expect((missingError as RemoteShareError).code).toBe(REMOTE_SHARE_START_FAILED_CODE);
    expect((missingError as RemoteShareError).message).toContain('cloudflared was not found');
    expect(missing.manager.status()).toMatchObject({ active: false });

    // Tunnel wait failure after the edge was created → edge reclaimed.
    const timeoutOrder: string[] = [];
    const tunnelFailure = makeManager({
      waitForTunnelUrl: vi.fn(async () => {
        throw new Error('timed out waiting for a trycloudflare.com URL');
      }),
      terminateCloudflared: vi.fn(async () => {
        timeoutOrder.push('cloudflared');
      }),
      logger,
    });
    const timeoutError = await tunnelFailure.manager
      .start({ sessionId: 'session-timeout' }, edgeFactory(timeoutOrder))
      .catch((error: unknown) => error);
    expect(timeoutError).toBeInstanceOf(RemoteShareError);
    expect((timeoutError as RemoteShareError).code).toBe(REMOTE_SHARE_START_FAILED_CODE);
    expect(tunnelFailure.manager.status()).toMatchObject({ active: false });
    expect(timeoutOrder).toEqual(['cloudflared', 'edge']);

    for (const entry of logs) {
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain('trycloudflare.com');
      expect(serialized).not.toContain('manager-token');
      expect(serialized).not.toContain('token=');
    }
  });

  it('close() reclaims the tunnel and edge like a stop and stays idempotent', async () => {
    const cleanupOrder: string[] = [];
    const { manager } = makeManager({
      terminateCloudflared: vi.fn(async () => {
        cleanupOrder.push('cloudflared');
      }),
    });
    const factory = edgeFactory(cleanupOrder);

    await manager.start({ sessionId: 'session-close' }, factory);
    expect(manager.status().active).toBe(true);
    await manager.close();
    expect(manager.status()).toMatchObject({ active: false });
    expect(cleanupOrder).toEqual(['cloudflared', 'edge']);

    await manager.close();
    expect(manager.status()).toMatchObject({ active: false });
  });
});

function fixedToken(): string {
  return 'A'.repeat(43);
}

describe('remote persistent store', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'hakimi-remote-store-'));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  });

  it('writes config/state with private permissions and validates them on read', () => {
    const config = {
      version: 1,
      homeDir: home,
      cloudflaredPath: '/opt/cloudflared',
      token: fixedToken(),
    };
    writePrivateJsonFile(remoteConfigPath(home), config);

    const configStat = statSync(remoteConfigPath(home));
    expect(configStat.mode & 0o077).toBe(0);
    expect(statSync(join(home, 'remote')).mode & 0o077).toBe(0);

    expect(readPrivateJsonFile(remoteConfigPath(home), RemoteConfigSchema)).toEqual(config);
    // A missing file reads as undefined, not an error.
    expect(readPrivateJsonFile(remoteStatePath(home), RemoteStateSchema)).toBeUndefined();

    // Schema violations fail loudly (unknown version is never reinterpreted).
    writePrivateJsonFile(remoteStatePath(home), {
      version: 9,
      pid: 1,
      port: 2,
      origin: 'https://name.trycloudflare.com',
      startedAt: 3,
    });
    expect(() => readPrivateJsonFile(remoteStatePath(home), RemoteStateSchema)).toThrow(
      'invalid remote state file',
    );
  });

  it('reads older state without metricsPort and rejects illegal metrics ports', () => {
    const path = remoteStatePath(home);
    writePrivateJsonFile(path, {
      version: 1,
      pid: 1,
      port: 2,
      origin: 'https://name.trycloudflare.com',
      startedAt: 3,
    });
    const legacy = readPrivateJsonFile(path, RemoteStateSchema);
    expect(legacy?.metricsPort).toBeUndefined();

    writePrivateJsonFile(path, {
      version: 1,
      pid: 1,
      port: 2,
      origin: 'https://name.trycloudflare.com',
      startedAt: 3,
      metricsPort: 42221,
    });
    const current = readPrivateJsonFile(path, RemoteStateSchema);
    expect(current?.metricsPort).toBe(42221);

    for (const metricsPort of [0, 65_536, '42221', 42.5]) {
      writePrivateJsonFile(path, {
        version: 1,
        pid: 1,
        port: 2,
        origin: 'https://name.trycloudflare.com',
        startedAt: 3,
        metricsPort,
      });
      expect(() => readPrivateJsonFile(path, RemoteStateSchema)).toThrow(
        'invalid remote state file',
      );
    }
  });

  it('refuses to read config files with group/other permissions', () => {
    const path = remoteConfigPath(home);
    writePrivateJsonFile(path, {
      version: 1,
      homeDir: home,
      cloudflaredPath: '/opt/cloudflared',
      token: fixedToken(),
    });
    chmodSync(path, 0o644);
    expect(() => readPrivateJsonFile(path, RemoteConfigSchema)).toThrow('too open');
  });

  it('keeps the fixed token across starts and persists the refreshed cloudflared path', () => {
    const first = loadOrCreateRemoteConfig(home, '/opt/cloudflared', {
      generateToken: () => fixedToken(),
    });
    expect(first.created).toBe(true);
    expect(first.config.token).toBe(fixedToken());

    const second = loadOrCreateRemoteConfig(home, '/usr/local/bin/cloudflared');
    expect(second.created).toBe(false);
    expect(second.config.token).toBe(fixedToken());
    expect(second.config.cloudflaredPath).toBe('/usr/local/bin/cloudflared');
    expect(second.config.homeDir).toBe(home);

    // The refreshed values are persisted atomically — a later read (e.g. by
    // the systemd `remote serve`) sees the same config.
    expect(readPrivateJsonFile(remoteConfigPath(home), RemoteConfigSchema)).toEqual({
      version: 1,
      homeDir: home,
      cloudflaredPath: '/usr/local/bin/cloudflared',
      token: fixedToken(),
    });
  });
});

describe('systemd user unit and runner', () => {
  it('renders a network-ordered, restart-bounded login service', () => {
    const unit = renderRemoteUnit([
      '/usr/bin/node',
      '/opt/hakimi/dist/main.mjs',
      'remote',
      'serve',
      '--config',
      '/home/u/.hakimi/remote/config.json',
    ]);
    expect(unit).toContain('After=network-online.target');
    expect(unit).toContain('Wants=network-online.target');
    expect(unit).toContain('Restart=on-failure');
    expect(unit).toContain('RestartSec=2s');
    expect(unit).toContain('WantedBy=default.target');
    expect(unit).toContain(
      'ExecStart=/usr/bin/node /opt/hakimi/dist/main.mjs remote serve --config /home/u/.hakimi/remote/config.json',
    );
  });

  it('quotes and escapes ExecStart arguments including unit-level percent signs', () => {
    expect(quoteSystemdArg('/usr/bin/node')).toBe('/usr/bin/node');
    expect(quoteSystemdArg('/opt/hakimi app/dist/main.mjs')).toBe(
      '"/opt/hakimi app/dist/main.mjs"',
    );
    expect(quoteSystemdArg('/opt/x$y`z"w')).toBe('"/opt/x\\$y\\`z\\"w"');
    expect(quoteSystemdArg('')).toBe('""');

    const unit = renderRemoteUnit([
      '/usr/bin/hakimi',
      'remote',
      'serve',
      '--config',
      '/home/u/.hakimi/100%/remote/config.json',
    ]);
    expect(unit).toContain(
      'ExecStart=/usr/bin/hakimi remote serve --config /home/u/.hakimi/100%%/remote/config.json',
    );
  });

  it('runs systemctl --user with structured results and fails commands loudly', async () => {
    const calls: string[][] = [];
    const execFileFn = vi.fn(
      (
        _cmd: string,
        args: string[],
        _opts: unknown,
        cb: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        calls.push(args);
        if (args.includes('is-system-running')) cb(null, 'running', '');
        else if (args.includes('daemon-reload')) cb(null, '', '');
        else cb(new Error('operation failed'), '', '');
      },
    ) as unknown as typeof import('node:child_process').execFile;

    const runner = createSystemctlRunner({ execFileFn });
    expect(await isSystemdUserAvailable(runner)).toBe(true);
    await systemctlDaemonReload(runner);
    await expect(systemctlEnableNow(runner)).rejects.toThrow('enable --now hakimi-remote.service');
    await expect(systemctlDisableNow(runner)).rejects.toThrow('disable --now hakimi-remote.service');

    expect(calls[0]).toEqual(['--user', 'is-system-running']);
    expect(calls[1]).toEqual(['--user', 'daemon-reload']);
    expect(calls[2]).toEqual(['--user', 'enable', '--now', 'hakimi-remote.service']);
    expect(calls[3]).toEqual(['--user', 'disable', '--now', 'hakimi-remote.service']);
  });

  it('reports the systemd user session unavailable when systemctl cannot run', async () => {
    const execFileFn = vi.fn(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (error: NodeJS.ErrnoException, stdout: string, stderr: string) => void,
      ) => {
        const error = new Error('spawn systemctl ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        cb(error, '', '');
      },
    ) as unknown as typeof import('node:child_process').execFile;
    const runner = createSystemctlRunner({ execFileFn });
    expect(await isSystemdUserAvailable(runner)).toBe(false);
  });

  it('treats a degraded systemd user session as available', async () => {
    const degraded = (vi.fn(async () => ({
      code: 1,
      stdout: 'degraded',
      stderr: '',
    })) as unknown) as SystemctlRunner;
    expect(await isSystemdUserAvailable(degraded)).toBe(true);

    const offline = (vi.fn(async () => ({
      code: 1,
      stdout: 'offline',
      stderr: '',
    })) as unknown) as SystemctlRunner;
    expect(await isSystemdUserAvailable(offline)).toBe(false);
  });

  it('treats disable of a never-installed unit as idempotent success', async () => {
    const missing = (vi.fn(async (args: string[]) => {
      if (args[0] === 'disable') {
        return { code: 1, stdout: '', stderr: 'Unit hakimi-remote.service not found.' };
      }
      return { code: 0, stdout: '', stderr: '' };
    }) as unknown) as SystemctlRunner;
    await expect(systemctlDisableNow(missing)).resolves.toBeUndefined();

    const otherFailure = (vi.fn(async () => ({
      code: 1,
      stdout: '',
      stderr: 'Failed to connect to bus',
    })) as unknown) as SystemctlRunner;
    await expect(systemctlDisableNow(otherFailure)).rejects.toThrow(
      'disable --now hakimi-remote.service failed',
    );
  });

  it('parses systemctl show output and maps failures to a not-found unit', async () => {
    expect(
      parseShowOutput('LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=4242\n'),
    ).toEqual({ loadState: 'loaded', activeState: 'active', subState: 'running', mainPid: 4242 });

    const missing = vi.fn(async () => ({
      code: 4,
      stdout: '',
      stderr: 'Unit hakimi-remote.service not found.',
    })) as unknown as SystemctlRunner;
    expect(await readRemoteUnitStatus(missing)).toEqual({
      loadState: 'not-found',
      activeState: 'inactive',
      subState: 'dead',
      mainPid: null,
    });
  });
});

describe('remote serve (persistent all-sessions)', () => {
  it('starts the full all-sessions server with no TTL, publishes state, then runs until a signal', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-'));
    try {
      const order: string[] = [];
      const child = makeChild();
      let serverOptions: Record<string, unknown> | undefined;
      const startServer = vi.fn(async (options) => {
        serverOptions = options as Record<string, unknown>;
        return {
          host: '127.0.0.1',
          port: 61234,
          close: vi.fn(async () => {
            order.push('server');
          }),
        } as never;
      });
      const terminateTunnel = vi.fn(async () => {
        order.push('cloudflared');
      });
      const removeState = vi.fn(() => {
        order.push('state');
      });
      const writes: unknown[] = [];
      const signalSource = new EventEmitter();
      let output = '';
      const spawnTunnel = vi.fn(() => child);

      const pending = runRemoteServe(
        { configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' },
        {
          pid: 777,
          startServer,
          spawnCloudflared: spawnTunnel,
          waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
          terminateCloudflared: terminateTunnel,
          signalSource,
          stdout: {
            write(chunk: string) {
              output += chunk;
              return true;
            },
          },
          generateQrCode: async () => 'QR-SERVE',
          now: () => 12_345,
          readConfig: () => ({
            version: 1,
            homeDir: home,
            cloudflaredPath: '/opt/cloudflared',
            token: fixedToken(),
          }),
          writeState: vi.fn((_path, state) => {
            writes.push(state);
          }),
          readState: vi.fn(() => ({
            version: 1,
            pid: 777,
            port: 61234,
            origin: 'https://public-name.trycloudflare.com',
            startedAt: 12_345,
          } as const)),
          removeState,
        },
      );

      await vi.waitFor(() => {
        expect(writes).toHaveLength(1);
      });
      expect(writes[0]).toMatchObject({
        version: 1,
        pid: 777,
        port: 61234,
        origin: 'https://public-name.trycloudflare.com',
        startedAt: 12_345,
      });
      // The injected child never announces a metrics address, so no port is
      // recorded (older state stays readable and equivalent).
      expect((writes[0] as Record<string, unknown>)['metricsPort']).toBeUndefined();
      // The serve-only spawn adds the loopback metrics bind.
      expect(spawnTunnel).toHaveBeenCalledWith('/opt/cloudflared', 61234, {
        metrics: '127.0.0.1:0',
      });
      expect(serverOptions).toMatchObject({
        host: '127.0.0.1',
        port: 0,
        bindClass: 'public',
        insecureNoTls: true,
        allowedHosts: ['.trycloudflare.com'],
        debugEndpoints: false,
        allowRemoteShutdown: false,
        allowRemoteTerminals: false,
      });
      expect(serverOptions).not.toHaveProperty('remoteAccess');
      expect(serverOptions).not.toHaveProperty('remoteShareController');
      expect(serverOptions).not.toHaveProperty('ttl');
      expect(output).toContain(
        `https://public-name.trycloudflare.com/?remote=1#token=${fixedToken()}`,
      );
      expect(output).toContain('QR-SERVE');
      expect(output).not.toContain('TTL:');

      signalSource.emit('SIGTERM');
      await pending;
      expect(order).toEqual(['cloudflared', 'server', 'state']);
      expect(child.stdout.listenerCount('data')).toBe(0);
      expect(child.stderr.listenerCount('data')).toBe(0);
      expect(signalSource.listenerCount('SIGTERM')).toBe(0);
      expect(signalSource.listenerCount('SIGINT')).toBe(0);
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('exits non-zero on an unexpected tunnel close after tearing down in order', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-'));
    try {
      const order: string[] = [];
      const child = makeChild();
      const writes: unknown[] = [];
      const pending = runRemoteServe(
        { configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' },
        {
          pid: 777,
          startServer: vi.fn(async () => ({
            host: '127.0.0.1',
            port: 61234,
            close: vi.fn(async () => {
              order.push('server');
            }),
          }) as never),
          spawnCloudflared: vi.fn(() => child),
          waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
          terminateCloudflared: vi.fn(async () => {
            order.push('cloudflared');
          }),
          signalSource: new EventEmitter(),
          readConfig: () => ({
            version: 1,
            homeDir: home,
            cloudflaredPath: '/opt/cloudflared',
            token: fixedToken(),
          }),
          writeState: vi.fn((_path, state) => {
            writes.push(state);
          }),
          readState: vi.fn(() => ({
            version: 1,
            pid: 777,
            port: 61234,
            origin: 'https://public-name.trycloudflare.com',
            startedAt: 1,
          } as const)),
          removeState: () => {
            order.push('state');
          },
          now: () => 1,
        },
      );

      await vi.waitFor(() => {
        expect(writes).toHaveLength(1);
      });
      child.emit('close', 1, null);
      await expect(pending).rejects.toThrow('cloudflared tunnel closed unexpectedly');
      expect(order).toEqual(['cloudflared', 'server', 'state']);
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('never deletes a state file owned by a different pid', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-'));
    try {
      const order: string[] = [];
      const child = makeChild();
      const removeState = vi.fn(() => {
        order.push('state');
      });
      const writes: unknown[] = [];
      const pending = runRemoteServe(
        { configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' },
        {
          pid: 777,
          startServer: vi.fn(async () => ({
            host: '127.0.0.1',
            port: 61234,
            close: vi.fn(async () => {
              order.push('server');
            }),
          }) as never),
          spawnCloudflared: vi.fn(() => child),
          waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
          terminateCloudflared: vi.fn(async () => {
            order.push('cloudflared');
          }),
          signalSource: new EventEmitter(),
          readConfig: () => ({
            version: 1,
            homeDir: home,
            cloudflaredPath: '/opt/cloudflared',
            token: fixedToken(),
          }),
          writeState: vi.fn((_path, state) => {
            writes.push(state);
          }),
          // A newer serve process (pid 999) already replaced the state.
          readState: vi.fn(() => ({
            version: 1,
            pid: 999,
            port: 61234,
            origin: 'https://public-name.trycloudflare.com',
            startedAt: 1,
          } as const)),
          removeState,
        },
      );

      await vi.waitFor(() => {
        expect(writes).toHaveLength(1);
      });
      child.emit('close', 1, null);
      await expect(pending).rejects.toThrow('cloudflared tunnel closed unexpectedly');
      expect(removeState).not.toHaveBeenCalled();
      expect(order).toEqual(['cloudflared', 'server']);
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('swallows a second signal during teardown instead of re-throwing it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-'));
    try {
      const order: string[] = [];
      const child = makeChild();
      const writes: unknown[] = [];
      const signalSource = new EventEmitter();
      let releaseTunnel!: () => void;
      const tunnelGate = new Promise<void>((resolve) => {
        releaseTunnel = resolve;
      });
      const pending = runRemoteServe(
        { configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' },
        {
          pid: 777,
          startServer: vi.fn(async () => ({
            host: '127.0.0.1',
            port: 61234,
            close: vi.fn(async () => {
              order.push('server');
            }),
          }) as never),
          spawnCloudflared: vi.fn(() => child),
          waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
          terminateCloudflared: vi.fn(async () => {
            order.push('cloudflared');
            // Block the teardown so the signal window is observable.
            await tunnelGate;
          }),
          signalSource,
          readConfig: () => ({
            version: 1,
            homeDir: home,
            cloudflaredPath: '/opt/cloudflared',
            token: fixedToken(),
          }),
          writeState: vi.fn((_path, state) => {
            writes.push(state);
          }),
          readState: vi.fn(() => ({
            version: 1,
            pid: 777,
            port: 61234,
            origin: 'https://public-name.trycloudflare.com',
            startedAt: 1,
          } as const)),
          removeState: () => {
            order.push('state');
          },
          now: () => 1,
        },
      );

      await vi.waitFor(() => {
        expect(writes).toHaveLength(1);
      });
      signalSource.emit('SIGTERM');

      // The first signal starts the teardown; the listeners STAY attached
      // through it, so a second SIGTERM (or SIGINT) is swallowed instead of
      // re-raising the default signal death mid-cleanup.
      await vi.waitFor(() => {
        expect(order).toContain('cloudflared');
      });
      expect(signalSource.listenerCount('SIGTERM')).toBe(1);
      expect(signalSource.listenerCount('SIGINT')).toBe(1);
      signalSource.emit('SIGTERM');
      signalSource.emit('SIGINT');

      releaseTunnel();
      await pending;
      expect(order).toEqual(['cloudflared', 'server', 'state']);
      // After the teardown the listeners are detached again.
      expect(signalSource.listenerCount('SIGTERM')).toBe(0);
      expect(signalSource.listenerCount('SIGINT')).toBe(0);
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('detaches tail and signal listeners even when cleanup throws', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-cleanup-error-'));
    try {
      const child = makeChild();
      const signalSource = new EventEmitter();
      const writes: unknown[] = [];
      const closeServer = vi.fn(async () => {});
      const pending = runRemoteServe(
        { configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' },
        {
          pid: 777,
          startServer: vi.fn(async () => ({
            host: '127.0.0.1',
            port: 61234,
            close: closeServer,
          }) as never),
          spawnCloudflared: vi.fn(() => child),
          waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
          waitForMetricsAddress: async () => ({ host: '127.0.0.1', port: 42221 }),
          probeTunnelReadiness: vi.fn(async () => ({ ok: true, detail: 'readyConnections 1' })) as never,
          terminateCloudflared: vi.fn(async () => {
            throw new Error('cleanup exploded');
          }),
          signalSource,
          stdout: { write: () => true },
          readConfig: () => ({
            version: 1,
            homeDir: home,
            cloudflaredPath: '/opt/cloudflared',
            token: fixedToken(),
          }),
          writeState: vi.fn((_path, state) => {
            writes.push(state);
          }),
          readState: vi.fn(() => ({
            version: 1,
            pid: 777,
            port: 61234,
            origin: 'https://public-name.trycloudflare.com',
            startedAt: 1,
          } as const)),
          removeState: vi.fn(),
          generateQrCode: async () => 'QR',
          now: () => 1,
        },
      );

      await vi.waitFor(() => {
        expect(writes.length).toBeGreaterThan(0);
      });
      expect(child.stdout.listenerCount('data')).toBeGreaterThan(0);
      expect(child.stderr.listenerCount('data')).toBeGreaterThan(0);
      const outcome = pending.then(
        () => undefined,
        (error: unknown) => error,
      );
      signalSource.emit('SIGTERM');
      const settled = await outcome;
      expect(settled).toBeInstanceOf(Error);
      expect((settled as Error).message).toContain('cleanup exploded');
      expect(closeServer).toHaveBeenCalledTimes(1);
      expect(child.stdout.listenerCount('data')).toBe(0);
      expect(child.stderr.listenerCount('data')).toBe(0);
      expect(signalSource.listenerCount('SIGTERM')).toBe(0);
      expect(signalSource.listenerCount('SIGINT')).toBe(0);
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('fails fast when the config file is missing or unreadable', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-'));
    try {
      await expect(
        runRemoteServe({ configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' }),
      ).rejects.toThrow('remote config not found');

      // Unsafe permissions are refused on the way in.
      writeFileSync(
        join(home, 'config.json'),
        JSON.stringify({ version: 1, homeDir: home, cloudflaredPath: '/opt/cloudflared', token: fixedToken() }),
        { mode: 0o644 },
      );
      await expect(
        runRemoteServe({
          configPath: join(home, 'config.json'),
          logLevel: 'silent',
        }),
      ).rejects.toThrow('too open');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('self-heals via the readiness monitor: non-zero exit, cleanups in order, metrics port merged into state', async () => {
    vi.useFakeTimers();
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-health-'));
    try {
      const order: string[] = [];
      const child = makeChild();
      const writes: unknown[] = [];
      let output = '';
      const probe = vi.fn(async () => ({ ok: false, detail: 'readyConnections 0' }));
      const pending = runRemoteServe(
        { configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' },
        {
          pid: 777,
          startServer: vi.fn(async () => ({
            host: '127.0.0.1',
            port: 61234,
            close: vi.fn(async () => {
              order.push('server');
            }),
          }) as never),
          spawnCloudflared: vi.fn(() => child),
          waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
          waitForMetricsAddress: async () => ({ host: '127.0.0.1', port: 42221 }),
          probeTunnelReadiness: probe as never,
          terminateCloudflared: vi.fn(async () => {
            order.push('cloudflared');
          }),
          signalSource: new EventEmitter(),
          stdout: {
            write(chunk: string) {
              output += chunk;
              return true;
            },
          },
          readConfig: () => ({
            version: 1,
            homeDir: home,
            cloudflaredPath: '/opt/cloudflared',
            token: fixedToken(),
          }),
          writeState: vi.fn((_path, state) => {
            writes.push(state);
          }),
          readState: vi.fn(() => ({
            version: 1,
            pid: 777,
            port: 61234,
            origin: 'https://public-name.trycloudflare.com',
            startedAt: 12_345,
          } as const)),
          removeState: () => {
            order.push('state');
          },
          generateQrCode: async () => 'QR-HEALTH',
          now: () => 12_345,
        },
      );

      // Flush the whole async startup (server + URL publish + metrics parse).
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(writes.length).toBeGreaterThanOrEqual(1);
      expect(writes[0]).toMatchObject({
        version: 1,
        pid: 777,
        port: 61234,
        origin: 'https://public-name.trycloudflare.com',
        startedAt: 12_345,
      });
      // The injected metrics parse resolves before the URL publish, so the
      // first state write already carries the port; the PID-guarded merge is
      // idempotent.
      expect(writes.some((w) => (w as Record<string, unknown>)['metricsPort'] === 42221)).toBe(true);
      // The URL publish flow (banner, fixed-token link) is unchanged.
      expect(output).toContain(
        `https://public-name.trycloudflare.com/?remote=1#token=${fixedToken()}`,
      );

      // Attach the settlement handler BEFORE the monitor fires so the rejection
      // is never observed as unhandled within the timer callback chain.
      const outcome = pending.then(
        () => undefined,
        (error: unknown) => error,
      );
      // Never-ready: the monitor probes every 5s but only the 60s startup
      // deadline fires the unhealthy exit (first-ok failures are not counted).
      await vi.advanceTimersByTimeAsync(60_000);
      const settled = await outcome;
      expect(settled).toBeInstanceOf(Error);
      expect((settled as Error).message).toContain('cloudflared tunnel became unhealthy');
      expect(probe).toHaveBeenCalledTimes(12); // 0s..55s on the 5s cadence
      await vi.advanceTimersByTimeAsync(3 * 5_000); // stopped → no further probes
      expect(probe).toHaveBeenCalledTimes(12);
      expect(order).toEqual(['cloudflared', 'server', 'state']);
    } finally {
      vi.useRealTimers();
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('still cleans up and exits non-zero when the unhealthy diagnostic throws', async () => {
    vi.useFakeTimers();
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-report-'));
    try {
      const order: string[] = [];
      const child = makeChild();
      const reportTunnelUnhealthy = vi.fn(
        (diagnosis: TunnelUnhealthyDiagnosis, recentLogs: string) => {
          expect(diagnosis.failures).toHaveLength(3);
          for (const failure of diagnosis.failures) {
            expect(failure.detail).not.toContain(fixedToken());
            expect(failure.detail.length).toBeLessThanOrEqual(512);
          }
          expect(recentLogs).toContain('x[REDACTED]y');
          expect(recentLogs).not.toContain(fixedToken());
          throw new Error('logger exploded');
        },
      );
      let probeCount = 0;
      const probe = vi.fn(async () => {
        probeCount += 1;
        return probeCount === 1
          ? { ok: true, detail: 'readyConnections 1' }
          : { ok: false, detail: `x${fixedToken()}y ${'z'.repeat(600)}` };
      });
      const pending = runRemoteServe(
        { configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' },
        {
          pid: 777,
          startServer: vi.fn(async () => ({
            host: '127.0.0.1',
            port: 61234,
            close: vi.fn(async () => {
              order.push('server');
            }),
          }) as never),
          spawnCloudflared: vi.fn(() => child),
          waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
          waitForMetricsAddress: async () => ({ host: '127.0.0.1', port: 42221 }),
          probeTunnelReadiness: probe as never,
          reportTunnelUnhealthy,
          terminateCloudflared: vi.fn(async () => {
            order.push('cloudflared');
          }),
          signalSource: new EventEmitter(),
          stdout: {
            write() {
              return true;
            },
          },
          readConfig: () => ({
            version: 1,
            homeDir: home,
            cloudflaredPath: '/opt/cloudflared',
            token: fixedToken(),
          }),
          writeState: vi.fn(),
          readState: vi.fn(() => ({
            version: 1,
            pid: 777,
            port: 61234,
            origin: 'https://public-name.trycloudflare.com',
            startedAt: 12_345,
          } as const)),
          removeState: () => {
            order.push('state');
          },
          generateQrCode: async () => 'QR',
          now: () => 12_345,
        },
      );

      const outcome = pending.then(
        () => undefined,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(0); // first probe OK
      child.stdout.write(`x${fixedToken()}y\n`);
      await vi.advanceTimersByTimeAsync(3 * 5_000); // three post-ready failures
      const settled = await outcome;
      expect(settled).toBeInstanceOf(Error);
      expect((settled as Error).message).toContain('cloudflared tunnel became unhealthy');
      // The failing diagnostic hook ran but the restart path still completed.
      expect(reportTunnelUnhealthy).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['cloudflared', 'server', 'state']);
    } finally {
      vi.useRealTimers();
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('still cleans up and exits non-zero when diagnostic tail dumping throws', async () => {
    vi.useFakeTimers();
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-tail-'));
    try {
      const order: string[] = [];
      const child = makeChild();
      const signalSource = new EventEmitter();
      const makeTail = vi.fn(() => ({
        onChunk: vi.fn(),
        dump: vi.fn(() => {
          throw new Error('tail exploded');
        }),
      }));
      const reportTunnelUnhealthy = vi.fn();
      let probeCount = 0;
      const pending = runRemoteServe(
        { configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' },
        {
          pid: 777,
          startServer: vi.fn(async () => ({
            host: '127.0.0.1',
            port: 61234,
            close: vi.fn(async () => {
              order.push('server');
            }),
          }) as never),
          spawnCloudflared: vi.fn(() => child),
          waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
          waitForMetricsAddress: async () => ({ host: '127.0.0.1', port: 42221 }),
          probeTunnelReadiness: vi.fn(async () => {
            probeCount += 1;
            return probeCount === 1
              ? { ok: true, detail: 'readyConnections 1' }
              : { ok: false, detail: 'readyConnections 0' };
          }) as never,
          createTunnelLogTail: makeTail,
          reportTunnelUnhealthy,
          terminateCloudflared: vi.fn(async () => {
            order.push('cloudflared');
          }),
          signalSource,
          stdout: { write: () => true },
          readConfig: () => ({
            version: 1,
            homeDir: home,
            cloudflaredPath: '/opt/cloudflared',
            token: fixedToken(),
          }),
          writeState: vi.fn(),
          readState: vi.fn(() => ({
            version: 1,
            pid: 777,
            port: 61234,
            origin: 'https://public-name.trycloudflare.com',
            startedAt: 12_345,
          } as const)),
          removeState: () => {
            order.push('state');
          },
          generateQrCode: async () => 'QR',
          now: () => 12_345,
        },
      );

      const outcome = pending.then(
        () => undefined,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(0); // first probe OK
      await vi.advanceTimersByTimeAsync(3 * 5_000); // tail dump throws on unhealthy
      const settled = await outcome;
      expect(settled).toBeInstanceOf(Error);
      expect((settled as Error).message).toContain('cloudflared tunnel became unhealthy');
      expect(makeTail).toHaveBeenCalledTimes(2);
      expect(reportTunnelUnhealthy).not.toHaveBeenCalled();
      expect(order).toEqual(['cloudflared', 'server', 'state']);
      expect(child.stdout.listenerCount('data')).toBe(0);
      expect(child.stderr.listenerCount('data')).toBe(0);
      expect(signalSource.listenerCount('SIGTERM')).toBe(0);
      expect(signalSource.listenerCount('SIGINT')).toBe(0);
    } finally {
      vi.useRealTimers();
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('never merges a metrics port into state owned by a newer serve process', async () => {
    vi.useFakeTimers();
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-serve-metrics-pid-'));
    try {
      const order: string[] = [];
      const child = makeChild();
      const writes: unknown[] = [];
      const signalSource = new EventEmitter();
      const pending = runRemoteServe(
        { configPath: join(home, 'remote', 'config.json'), logLevel: 'silent' },
        {
          pid: 777,
          startServer: vi.fn(async () => ({
            host: '127.0.0.1',
            port: 61234,
            close: vi.fn(async () => {
              order.push('server');
            }),
          }) as never),
          spawnCloudflared: vi.fn(() => child),
          waitForTunnelUrl: async () => 'https://public-name.trycloudflare.com',
          waitForMetricsAddress: async () => ({ host: '127.0.0.1', port: 42221 }),
          terminateCloudflared: vi.fn(async () => {
            order.push('cloudflared');
          }),
          signalSource,
          stdout: {
            write() {
              return true;
            },
          },
          readConfig: () => ({
            version: 1,
            homeDir: home,
            cloudflaredPath: '/opt/cloudflared',
            token: fixedToken(),
          }),
          writeState: vi.fn((_path, state) => {
            writes.push(state);
          }),
          // A newer serve process (pid 999) already replaced the state file.
          readState: vi.fn(() => ({
            version: 1,
            pid: 999,
            port: 61234,
            origin: 'https://public-name.trycloudflare.com',
            startedAt: 12_345,
          } as const)),
          removeState: () => {
            order.push('state');
          },
          generateQrCode: async () => 'QR',
          now: () => 12_345,
        },
      );

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      // Only the URL-publish write lands (metrics resolved before it), the
      // PID-guarded merge is refused, so there is exactly one write.
      expect(writes).toHaveLength(1);
      expect((writes[0] as Record<string, unknown>)['metricsPort']).toBe(42221);

      signalSource.emit('SIGTERM');
      await pending;
      // Cleanup keeps the guard too: the newer pid's state is untouched.
      expect(order).toEqual(['cloudflared', 'server']);
    } finally {
      vi.useRealTimers();
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });
});

describe('remote start/status/stop control', () => {
  function fakeSystemctlRunner(calls: string[]): SystemctlRunner {
    return vi.fn(async (args) => {
      calls.push(args.join(' '));
      if (args[0] === 'is-system-running') return { code: 0, stdout: 'running', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    }) as unknown as SystemctlRunner;
  }

  function captureStdout(): { stdout: { write(chunk: string): boolean }; text(): string } {
    const chunks: string[] = [];
    return {
      stdout: {
        write(chunk: string) {
          chunks.push(chunk);
          return true;
        },
      },
      text: () => chunks.join(''),
    };
  }

  it('start installs the unit with the fixed token and prints the URL + QR', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      const calls: string[] = [];
      const unitPath = join(home, 'hakimi-remote.service');
      const configPath = remoteConfigPath(home);
      const state = {
        version: 1 as const,
        pid: 4242,
        port: 61234,
        origin: 'https://name.trycloudflare.com',
        startedAt: 1111,
      };
      // The real default polling path is exercised: state.json is on disk with
      // the pid systemd reports as MainPID, so freshness accepts it immediately.
      writePrivateJsonFile(remoteStatePath(home), state);
      const runner = (vi.fn(async (args: string[]) => {
        calls.push(args.join(' '));
        if (args[0] === 'is-system-running') return { code: 0, stdout: 'running', stderr: '' };
        return {
          code: 0,
          stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=4242\n',
          stderr: '',
        };
      }) as unknown) as SystemctlRunner;
      const captured = captureStdout();
      const resolveCloudflared = vi.fn(
        (explicit: string | undefined) => explicit ?? '/fallback/cloudflared',
      );
      const deps: RemoteControlDeps = {
        platform: 'linux',
        homeDir: home,
        runner,
        resolveCloudflaredPath: resolveCloudflared,
        resolveLaunchVector: () => ['/usr/bin/hakimi-native'],
        unitPath,
        generateToken: () => fixedToken(),
        generateQrCode: async () => 'QR-START',
        statePollMs: 40,
        stdout: captured.stdout,
      };

      await runRemoteStart({ cloudflared: '/opt/cloudflared' }, deps);

      const config = readPrivateJsonFile(configPath, RemoteConfigSchema);
      expect(config).toEqual({
        version: 1,
        homeDir: home,
        cloudflaredPath: '/opt/cloudflared',
        token: fixedToken(),
      });
      expect(statSync(configPath).mode & 0o077).toBe(0);
      expect(readFileSync(unitPath, 'utf-8')).toContain(
        `ExecStart=/usr/bin/hakimi-native remote serve --config ${configPath}`,
      );
      expect(calls).toEqual([
        'is-system-running',
        'daemon-reload',
        'enable --now hakimi-remote.service',
        'show hakimi-remote.service --property=LoadState,ActiveState,SubState,MainPID',
      ]);

      expect(captured.text()).toContain(buildRemoteRootUrl(state.origin, fixedToken()));
      expect(captured.text()).toContain('QR-START');
      expect(captured.text()).toContain('(newly created');

      // A second start reuses both the fixed token and the saved absolute
      // cloudflared path instead of falling back to PATH resolution.
      await runRemoteStart({}, deps);
      expect(readPrivateJsonFile(configPath, RemoteConfigSchema)?.token).toBe(fixedToken());
      expect(resolveCloudflared).toHaveBeenLastCalledWith('/opt/cloudflared');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('start refuses a leftover state and times out instead of accepting it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      // A STALE state from a previous run: old startedAt and a pid systemd
      // does not know (MainPID is still 0 right after enable).
      writePrivateJsonFile(remoteStatePath(home), {
        version: 1,
        pid: 999,
        port: 61234,
        origin: 'https://stale-old-run.trycloudflare.com',
        startedAt: Date.now() - 60_000,
      });
      const runner = (vi.fn(async (args: string[]) => {
        if (args[0] === 'is-system-running') return { code: 0, stdout: 'running', stderr: '' };
        if (args[0] === 'show') return { code: 0, stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=0\n', stderr: '' };
        return { code: 0, stdout: '', stderr: '' };
      }) as unknown) as SystemctlRunner;
      const captured = captureStdout();
      await expect(
        runRemoteStart(
          {},
          {
            platform: 'linux',
            homeDir: home,
            runner,
            resolveCloudflaredPath: () => '/opt/cloudflared',
            resolveLaunchVector: () => ['/usr/bin/hakimi-native'],
            // Temp unit path so the test never writes the real user config.
            unitPath: join(home, 'hakimi-remote.service'),
            stateTimeoutMs: 600,
            statePollMs: 40,
            stdout: captured.stdout,
          },
        ),
      ).rejects.toThrow('timed out waiting for the remote service');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('start skips a stale pid-mismatched state and accepts the fresh one mid-poll', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      writePrivateJsonFile(remoteStatePath(home), {
        version: 1,
        pid: 111,
        port: 61234,
        origin: 'https://stale.trycloudflare.com',
        startedAt: Date.now() - 60_000,
      });
      const captured = captureStdout();
      const pending = runRemoteStart(
        {},
        {
          platform: 'linux',
          homeDir: home,
          runner: (vi.fn(async (args: string[]) => {
            if (args[0] === 'is-system-running') return { code: 0, stdout: 'running', stderr: '' };
            if (args[0] === 'show') return { code: 0, stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=4242\n', stderr: '' };
            return { code: 0, stdout: '', stderr: '' };
          }) as unknown) as SystemctlRunner,
          resolveCloudflaredPath: () => '/opt/cloudflared',
          resolveLaunchVector: () => ['/usr/bin/hakimi-native'],
          unitPath: join(home, 'hakimi-remote.service'),
          stateTimeoutMs: 4_000,
          statePollMs: 50,
          generateQrCode: async () => 'QR',
          stdout: captured.stdout,
        },
      );
      // The real service publishes its state shortly after `start` began.
      await new Promise((resolve) => setTimeout(resolve, 250));
      writePrivateJsonFile(remoteStatePath(home), {
        version: 1,
        pid: 4242,
        port: 61235,
        origin: 'https://fresh.trycloudflare.com',
        startedAt: Date.now(),
      });
      await expect(pending).resolves.toBeUndefined();
      expect(captured.text()).toContain('https://fresh.trycloudflare.com/?remote=1');
      expect(captured.text()).not.toContain('https://stale.trycloudflare.com');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('isFreshRemoteState accepts the systemd MainPID or any state from this start window', () => {
    const state = {
      version: 1 as const,
      pid: 42,
      port: 1,
      origin: 'https://x.trycloudflare.com',
      startedAt: 1_000,
    };
    // Captured MainPID matches → accepted regardless of startedAt.
    expect(isFreshRemoteState(state, 42, 2_000)).toBe(true);
    // PID differs but the state is fresh → accepted: a post-enable
    // systemd auto-restart may have replaced the captured MainPID.
    expect(isFreshRemoteState(state, 43, 999)).toBe(true);
    // PID differs AND stale → rejected (leftover from a previous run).
    expect(isFreshRemoteState(state, 43, 1_001)).toBe(false);
    // Unknown MainPID → freshness decides.
    expect(isFreshRemoteState(state, null, 1_000)).toBe(true);
    expect(isFreshRemoteState(state, null, 1_001)).toBe(false);
  });

  it('start accepts a state from a systemd auto-restarted process (fresh pid)', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      const captured = captureStdout();
      const pending = runRemoteStart(
        {},
        {
          platform: 'linux',
          homeDir: home,
          runner: (vi.fn(async (args: string[]) => {
            if (args[0] === 'is-system-running') return { code: 0, stdout: 'running', stderr: '' };
            if (args[0] === 'show') return { code: 0, stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=4242\n', stderr: '' };
            return { code: 0, stdout: '', stderr: '' };
          }) as unknown) as SystemctlRunner,
          resolveCloudflaredPath: () => '/opt/cloudflared',
          resolveLaunchVector: () => ['/usr/bin/hakimi-native'],
          unitPath: join(home, 'hakimi-remote.service'),
          stateTimeoutMs: 4_000,
          statePollMs: 50,
          generateQrCode: async () => 'QR',
          stdout: captured.stdout,
        },
      );
      // The captured MainPID (4242) crashed and systemd restarted the service
      // under a NEW pid within the same start window: the state is fresh even
      // though its pid does not match the captured MainPID.
      await new Promise((resolve) => setTimeout(resolve, 200));
      writePrivateJsonFile(remoteStatePath(home), {
        version: 1,
        pid: 5150,
        port: 61236,
        origin: 'https://restarted.trycloudflare.com',
        startedAt: Date.now(),
      });
      await expect(pending).resolves.toBeUndefined();
      expect(captured.text()).toContain('https://restarted.trycloudflare.com/?remote=1');
      expect(captured.text()).not.toContain('https://stale.trycloudflare.com');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('refuses start/stop on non-Linux and without a systemd user session', async () => {
    await expect(runRemoteStart({}, { platform: 'darwin' })).rejects.toThrow(
      'only supported on Linux',
    );
    await expect(runRemoteStop({ platform: 'darwin' })).rejects.toThrow('only supported on Linux');

    const noBus = vi.fn(async () => ({
      code: 1,
      stdout: '',
      stderr: 'Failed to connect to bus',
    })) as unknown as SystemctlRunner;
    await expect(runRemoteStart({}, { platform: 'linux', runner: noBus })).rejects.toThrow(
      'systemd user session',
    );
    await expect(runRemoteStop({ platform: 'linux', runner: noBus })).rejects.toThrow(
      'systemd user session',
    );
  });

  it('stop disables the unit and keeps the config/token', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      const calls: string[] = [];
      const captured = captureStdout();
      loadOrCreateRemoteConfig(home, '/opt/cloudflared', {
        generateToken: () => fixedToken(),
      });
      await runRemoteStop({
        platform: 'linux',
        homeDir: home,
        runner: fakeSystemctlRunner(calls),
        stdout: captured.stdout,
      });
      expect(calls).toEqual([
        'is-system-running',
        'disable --now hakimi-remote.service',
      ]);
      const config = readPrivateJsonFile(remoteConfigPath(home), RemoteConfigSchema);
      expect(config?.token).toBe(fixedToken());
      expect(captured.text()).toContain('token is kept');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('stop before any start is idempotent success (unit not found)', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      const calls: string[] = [];
      const runner = (vi.fn(async (args: string[]) => {
        calls.push(args.join(' '));
        if (args[0] === 'is-system-running') return { code: 0, stdout: 'running', stderr: '' };
        return { code: 1, stdout: '', stderr: 'Unit hakimi-remote.service not found.' };
      }) as unknown) as SystemctlRunner;
      const captured = captureStdout();
      await runRemoteStop({ platform: 'linux', homeDir: home, runner, stdout: captured.stdout });
      expect(calls).toEqual(['is-system-running', 'disable --now hakimi-remote.service']);
      expect(captured.text()).toContain('stopped');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('status renders the live unit, tunnel URL, QR, port, and health', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      writePrivateJsonFile(remoteConfigPath(home), {
        version: 1,
        homeDir: home,
        cloudflaredPath: '/opt/cloudflared',
        token: fixedToken(),
      });
      writePrivateJsonFile(remoteStatePath(home), {
        version: 1,
        pid: 4242,
        port: 61234,
        origin: 'https://name.trycloudflare.com',
        startedAt: 1111,
      });
      const calls: string[] = [];
      const runner = (vi.fn(async (args: string[]) => {
        calls.push(args.join(' '));
        if (args[0] === 'is-system-running') {
          return { code: 0, stdout: 'running', stderr: '' };
        }
        return {
          code: 0,
          stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=4242\n',
          stderr: '',
        };
      }) as unknown) as SystemctlRunner;
      const captured = captureStdout();
      await runRemoteStatus({
        platform: 'linux',
        homeDir: home,
        runner,
        probeHealth: async () => true,
        generateQrCode: async () => 'QR-STATUS',
        stdout: captured.stdout,
      });

      const text = captured.text();
      expect(text).toContain('active/running');
      expect(text).toContain(`https://name.trycloudflare.com/?remote=1#token=${fixedToken()}`);
      expect(text).toContain('QR-STATUS');
      expect(text).toContain('127.0.0.1:61234');
      expect(text).toContain('Health:   ok');
      // Older state without a metrics port reports the tunnel as unknown.
      expect(text).toContain('Tunnel health: unknown');
      expect(calls).toContain('show hakimi-remote.service --property=LoadState,ActiveState,SubState,MainPID');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('status reports tunnel health from the loopback /ready probe, distinct from local health', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      writePrivateJsonFile(remoteConfigPath(home), {
        version: 1,
        homeDir: home,
        cloudflaredPath: '/opt/cloudflared',
        token: fixedToken(),
      });
      writePrivateJsonFile(remoteStatePath(home), {
        version: 1,
        pid: 4242,
        port: 61234,
        origin: 'https://name.trycloudflare.com',
        startedAt: 1111,
        metricsPort: 42221,
      });
      const runner = (vi.fn(async (args: string[]) => {
        if (args[0] === 'is-system-running') {
          return { code: 0, stdout: 'running', stderr: '' };
        }
        return {
          code: 0,
          stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=4242\n',
          stderr: '',
        };
      }) as unknown) as SystemctlRunner;

      const okProbe = vi.fn(async () => ({ ok: true, detail: 'readyConnections 1' }));
      let captured = captureStdout();
      await runRemoteStatus({
        platform: 'linux',
        homeDir: home,
        runner,
        probeHealth: async () => true,
        probeTunnelHealth: okProbe as never,
        generateQrCode: async () => 'QR',
        stdout: captured.stdout,
      });
      expect(captured.text()).toContain('Tunnel health: ok');
      expect(okProbe).toHaveBeenCalledWith(42221, expect.objectContaining({ timeoutMs: expect.any(Number) }));

      const downProbe = vi.fn(async () => ({ ok: false, detail: 'readyConnections 0' }));
      captured = captureStdout();
      await runRemoteStatus({
        platform: 'linux',
        homeDir: home,
        runner,
        probeHealth: async () => true,
        probeTunnelHealth: downProbe as never,
        generateQrCode: async () => 'QR',
        stdout: captured.stdout,
      });
      // Correctly down even though the LOCAL listener is healthy.
      expect(captured.text()).toContain('Health:   ok');
      expect(captured.text()).toContain('Tunnel health: down');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('status never probes tunnel health from stale or unsupported state', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      writePrivateJsonFile(remoteConfigPath(home), {
        version: 1,
        homeDir: home,
        cloudflaredPath: '/opt/cloudflared',
        token: fixedToken(),
      });
      writePrivateJsonFile(remoteStatePath(home), {
        version: 1,
        pid: 4242,
        port: 61234,
        origin: 'https://name.trycloudflare.com',
        startedAt: 1111,
        metricsPort: 42221,
      });

      // Stale: systemd restarted the service (MainPID differs from state.pid),
      // so the leftover metrics port must NOT be probed — it could belong to a
      // completely different process now.
      const staleRunner = (vi.fn(async (args: string[]) => {
        if (args[0] === 'is-system-running') return { code: 0, stdout: 'running', stderr: '' };
        return {
          code: 0,
          stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=9999\n',
          stderr: '',
        };
      }) as unknown) as SystemctlRunner;
      const noProbe = vi.fn();
      let captured = captureStdout();
      await runRemoteStatus({
        platform: 'linux',
        homeDir: home,
        runner: staleRunner,
        probeHealth: async () => true,
        probeTunnelHealth: noProbe as never,
        generateQrCode: async () => 'QR',
        stdout: captured.stdout,
      });
      expect(noProbe).not.toHaveBeenCalled();
      expect(captured.text()).toContain('Tunnel health: unknown');

      // Unsupported: no usable systemd user session at all (unit unknown) —
      // the state is not live, so nothing is probed.
      const unsupportedRunner = (vi.fn(async (args: string[]) => {
        if (args[0] === 'is-system-running') return { code: 1, stdout: 'offline', stderr: '' };
        return { code: 1, stdout: '', stderr: 'no bus' };
      }) as unknown) as SystemctlRunner;
      captured = captureStdout();
      await runRemoteStatus({
        platform: 'linux',
        homeDir: home,
        runner: unsupportedRunner,
        probeHealth: async () => true,
        probeTunnelHealth: noProbe as never,
        generateQrCode: async () => 'QR',
        stdout: captured.stdout,
      });
      expect(noProbe).not.toHaveBeenCalled();
      expect(captured.text()).toContain('Tunnel health: unknown');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('status hints when the service was never started', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      const runner = (vi.fn(async (args: string[]) => {
        if (args[0] === 'is-system-running') return { code: 0, stdout: 'running', stderr: '' };
        return { code: 4, stdout: '', stderr: 'Unit hakimi-remote.service not found.' };
      }) as unknown) as SystemctlRunner;
      const captured = captureStdout();
      await runRemoteStatus({
        platform: 'linux',
        homeDir: home,
        runner,
        generateQrCode: async () => 'QR',
        stdout: captured.stdout,
      });
      expect(captured.text()).toContain("not started yet — run 'hakimi remote start'");
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('pollForStateFile resolves when state appears and times out otherwise', async () => {
    const state = {
      version: 1 as const,
      pid: 1,
      port: 2,
      origin: 'https://name.trycloudflare.com',
      startedAt: 3,
    };
    let reads = 0;
    const appearing = vi.fn(() => {
      reads += 1;
      return reads >= 3 ? state : undefined;
    });
    await expect(pollForStateFile('/x/state.json', 1_000, appearing, 5)).resolves.toEqual(state);

    const never = vi.fn(() => undefined);
    await expect(pollForStateFile('/x/state.json', 10, never, 5)).rejects.toThrow(
      'timed out waiting',
    );
  });

  it('programmatic startRemoteService/stopRemoteService write no stdout and no QR', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      const calls: string[] = [];
      const unitPath = join(home, 'hakimi-remote.service');
      writePrivateJsonFile(remoteStatePath(home), {
        version: 1,
        pid: 4242,
        port: 61234,
        origin: 'https://name.trycloudflare.com',
        startedAt: 1111,
      });
      const runner = (vi.fn(async (args: string[]) => {
        calls.push(args.join(' '));
        if (args[0] === 'is-system-running') return { code: 0, stdout: 'running', stderr: '' };
        return {
          code: 0,
          stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=4242\n',
          stderr: '',
        };
      }) as unknown) as SystemctlRunner;
      const captured = captureStdout();
      const deps: RemoteControlDeps = {
        platform: 'linux',
        homeDir: home,
        runner,
        resolveCloudflaredPath: (explicit) => explicit ?? '/opt/cloudflared',
        resolveLaunchVector: () => ['/usr/bin/hakimi-native'],
        unitPath,
        generateToken: () => fixedToken(),
        statePollMs: 40,
        stdout: captured.stdout,
      };

      const result = await startRemoteService({ cloudflared: '/opt/cloudflared' }, deps);

      // Programmatic start never writes stdout, never renders a QR.
      expect(captured.text()).toBe('');
      expect(result.created).toBe(true);
      expect(result.config.token).toBe(fixedToken());
      expect(result.url).toBe(`https://name.trycloudflare.com/?remote=1#token=${fixedToken()}`);
      expect(calls).toEqual([
        'is-system-running',
        'daemon-reload',
        'enable --now hakimi-remote.service',
        'show hakimi-remote.service --property=LoadState,ActiveState,SubState,MainPID',
      ]);

      await stopRemoteService(deps);
      // Programmatic stop writes no stdout and disables the unit.
      expect(captured.text()).toBe('');
      expect(calls).toContain('disable --now hakimi-remote.service');
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('re-reads the persisted config before returning the first-start URL', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hakimi-remote-control-'));
    try {
      const persistedToken = 'B'.repeat(43);
      const state = {
        version: 1 as const,
        pid: 4242,
        port: 61234,
        origin: 'https://name.trycloudflare.com',
        startedAt: Date.now(),
      };
      const runner = (vi.fn(async (args: string[]) => {
        if (args[0] === 'is-system-running') {
          return { code: 0, stdout: 'running', stderr: '' };
        }
        return {
          code: 0,
          stdout: 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=4242\n',
          stderr: '',
        };
      }) as unknown) as SystemctlRunner;

      const result = await startRemoteService(
        {},
        {
          platform: 'linux',
          homeDir: home,
          runner,
          resolveCloudflaredPath: () => '/opt/cloudflared',
          resolveLaunchVector: () => ['/usr/bin/hakimi-native'],
          unitPath: join(home, 'hakimi-remote.service'),
          generateToken: () => fixedToken(),
          waitForState: async () => {
            // Model a concurrent first starter winning the atomic config
            // replacement after this invocation minted its candidate token.
            writePrivateJsonFile(remoteConfigPath(home), {
              version: 1,
              homeDir: home,
              cloudflaredPath: '/opt/cloudflared',
              token: persistedToken,
            });
            return state;
          },
        },
      );

      expect(result.created).toBe(true);
      expect(result.config.token).toBe(persistedToken);
      expect(result.url).toBe(
        `https://name.trycloudflare.com/?remote=1#token=${persistedToken}`,
      );
      expect(readPrivateJsonFile(remoteConfigPath(home), RemoteConfigSchema)?.token).toBe(
        persistedToken,
      );
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    }
  });

  it('programmatic startRemoteService is still gated on Linux + systemd', async () => {
    await expect(startRemoteService({}, { platform: 'darwin' })).rejects.toThrow(
      'only supported on Linux',
    );
    const unsupportedRunner = (vi.fn(async (args: string[]) => {
      if (args[0] === 'is-system-running') return { code: 4, stdout: 'offline', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    }) as unknown) as SystemctlRunner;
    await expect(
      startRemoteService({}, { platform: 'linux', runner: unsupportedRunner }),
    ).rejects.toThrow('needs a systemd user session');
    await expect(
      stopRemoteService({ platform: 'darwin' }),
    ).rejects.toThrow('only supported on Linux');
  });
});

describe('remote command group registration', () => {
  it('registers start/status/stop and a hidden serve with a required config', () => {
    const program = new Command('hakimi');
    registerRemoteCommands(program);
    const remote = program.commands.find((candidate) => candidate.name() === 'remote');
    expect(remote).toBeDefined();
    expect(remote!.commands.map((candidate) => candidate.name())).toEqual([
      'start',
      'status',
      'stop',
      'serve',
    ]);
    const serve = remote!.commands.find((candidate) => candidate.name() === 'serve') as
      | typeof remote
      | undefined;
    expect((serve as typeof serve & { _hidden?: boolean })._hidden).toBe(true);
    expect(
      (serve as typeof serve & { options: Array<{ long: string; mandatory?: boolean }> }).options.find(
        (option) => option.long === '--config',
      )?.mandatory,
    ).toBe(true);
    const start = remote!.commands.find((candidate) => candidate.name() === 'start');
    expect(start!.options.map((option) => option.long)).toContain('--cloudflared');
  });

  it('parseServeLogLevel defaults to info and rejects invalid levels', () => {
    expect(parseServeLogLevel(undefined)).toBe('info');
    expect(parseServeLogLevel('silent')).toBe('silent');
    expect(parseServeLogLevel('debug')).toBe('debug');
    expect(() => parseServeLogLevel('bogus')).toThrow('invalid --log-level value');
  });

  it('reports an invalid serve --log-level through the action catch (exit 1, no unhandled rejection)', () => {
    const program = new Command('hakimi');
    registerRemoteCommands(program);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stderrChunks: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
    try {
      program.parse([
        'node',
        'hakimi',
        'remote',
        'serve',
        '--config',
        '/tmp/nonexistent.json',
        '--log-level',
        'bogus',
      ]);
      // The invalid level is caught inside the action: reported on stderr and
      // exited 1 — it never escapes as an unhandled action rejection.
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(stderrChunks.join('')).toContain('invalid --log-level value');
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

describe('hakimi launch vector', () => {
  it('points at the absolute executable plus the running entry', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const vector = resolveHakimiLaunchVector();
    expect(vector[0]).toBe(process.execPath);
    for (const part of vector) expect(part.startsWith('/')).toBe(true);
    // When the Node bundle exists next to this package, the vector restarts
    // exactly that bundle; otherwise the running entry (dev/source) is used.
    const packageRoot = join(__dirname, '..', '..', '..');
    const bundle = join(packageRoot, 'dist', 'main.mjs');
    if (existsSync(bundle)) {
      expect(vector).toEqual([process.execPath, bundle]);
    } else {
      expect(vector).toEqual([process.execPath, process.argv[1]]);
    }
  });
});
