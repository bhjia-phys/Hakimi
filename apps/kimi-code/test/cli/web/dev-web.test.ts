/**
 * Tests for the one-command source Web dev session (`pnpm dev` / `./dev`).
 *
 * The orchestration rules are exercised with injected process handles, so no
 * server or Vite process is started, plus one regression test that does spawn a
 * real child through the production launcher to prove the session's shutdown
 * grace is honored (and not cut short by a tsx CLI middle process).
 *
 * Covered: the frontend proxy receives the origin the backend *actually*
 * reported (never the requested port), the dev backend presets stay pinned to
 * that origin, the WSL NAT and free-port fallbacks, the token riding only in
 * the URL fragment, inherited-environment and `.env*` isolation, strict port
 * parsing, and that shutdown or a startup failure cleans up only the children
 * this session created.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildDevWebUrl,
  buildFrontendEnv,
  DEV_WEB_DROPPED_ENV,
  DEV_WEB_LOOPBACK_HOST,
  DEV_WEB_PINNED_ENV,
  parseDevWebArgs,
  resolveFrontendHost,
} from '../../../scripts/dev-web/config';
import { tsxChildEnv, tsxNodeArgs } from '../../../scripts/dev-web/launch-args.mjs';
import {
  startDevWeb,
  type BackendLaunch,
  type BackendReady,
  type DevWebDeps,
  type DevWebOptions,
  type FrontendLaunchOptions,
  type ManagedProcess,
} from '../../../scripts/dev-web/orchestrator';
import { toManagedProcess, waitForBackendReady } from '../../../scripts/dev-web/spawn';

// apps/kimi-code/test/cli/web -> repo root.
const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const ALL_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGKILL'];

const DEFAULT_OPTIONS: DevWebOptions = {
  open: true,
  frontendPort: 5175,
  backendPort: 58627,
};

function first<T>(items: readonly T[]): T {
  const value = items[0];
  if (value === undefined) throw new Error('expected at least one element');
  return value;
}

function flush(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

interface FakeChild extends ManagedProcess {
  signals: NodeJS.Signals[];
  exited: boolean;
  exitNow(code?: number, signal?: NodeJS.Signals | null): void;
  failNow(error: Error): void;
}

/** In-memory stand-in for a spawned child; honors `exitsOn` signal list. */
function makeFakeChild(options: { exitsOn?: readonly NodeJS.Signals[] } = {}): FakeChild {
  const exitsOn = options.exitsOn ?? ALL_SIGNALS;
  const exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];
  const errorListeners: Array<(error: Error) => void> = [];
  const fake: FakeChild = {
    pid: 43_210,
    signals: [],
    exited: false,
    kill(signal) {
      fake.signals.push(signal);
      if (exitsOn.includes(signal)) fake.exitNow(0, signal);
    },
    onExit(listener) {
      exitListeners.push(listener);
    },
    onError(listener) {
      errorListeners.push(listener);
    },
    exitNow(code = 0, signal = null) {
      if (fake.exited) return;
      fake.exited = true;
      for (const listener of exitListeners) listener(code, signal);
    },
    failNow(error) {
      for (const listener of errorListeners) listener(error);
    },
  };
  return fake;
}

interface HarnessOptions {
  frontendPort: number;
  wslHost: string | undefined;
  env: NodeJS.ProcessEnv;
  frontendReadyError: Error | undefined;
  backendChild: FakeChild | undefined;
  frontendChild: FakeChild | undefined;
  /** Keep `pickFrontendPort` pending so a signal can land mid-startup. */
  deferPortPick: boolean;
  /** Swap in a real spawn (with its own ready report) for the backend. */
  backendLaunch: BackendLaunch | undefined;
  /** Use the production shutdown grace instead of the fast test values. */
  useRealGraceMs: boolean;
}

interface Harness {
  deps: DevWebDeps;
  backend: FakeChild;
  frontend: FakeChild;
  backendPorts: number[];
  frontendLaunches: FrontendLaunchOptions[];
  openedUrls: string[];
  exitCodes: number[];
  signalHandlers: Map<NodeJS.Signals, () => void>;
  stdout(): string;
  stderr(): string;
  reportReady(ready: BackendReady): void;
  reportBackendFailure(error: Error): void;
  resolvePortPick(port: number): void;
}

function createHarness(overrides: Partial<HarnessOptions> = {}): Harness {
  const backend = overrides.backendChild ?? makeFakeChild();
  const frontend = overrides.frontendChild ?? makeFakeChild();
  const frontendPort = overrides.frontendPort ?? 5175;
  const backendPorts: number[] = [];
  const frontendLaunches: FrontendLaunchOptions[] = [];
  const openedUrls: string[] = [];
  const exitCodes: number[] = [];
  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  let out = '';
  let err = '';

  let resolveReady!: (ready: BackendReady) => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<BackendReady>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => {});

  let resolvePortPick!: (port: number) => void;
  const portPick = new Promise<number>((resolve) => {
    resolvePortPick = resolve;
  });

  const deps: DevWebDeps = {
    startBackend(options) {
      backendPorts.push(options.port);
      if (overrides.backendLaunch !== undefined) return overrides.backendLaunch;
      return { process: backend, ready };
    },
    startFrontend(options) {
      frontendLaunches.push(options);
      return frontend;
    },
    waitForFrontend: async () => {
      if (overrides.frontendReadyError !== undefined) throw overrides.frontendReadyError;
    },
    pickFrontendPort: async () => (overrides.deferPortPick === true ? portPick : frontendPort),
    resolveFrontendHost: () => overrides.wslHost,
    openUrl(url) {
      openedUrls.push(url);
    },
    registerSignal(signal, handler) {
      signalHandlers.set(signal, handler);
    },
    exit(code) {
      exitCodes.push(code);
    },
    stdout: {
      write(chunk: string | Uint8Array) {
        out += String(chunk);
        return true;
      },
    },
    stderr: {
      write(chunk: string | Uint8Array) {
        err += String(chunk);
        return true;
      },
    },
    env: overrides.env ?? {},
    shutdownGraceMs: overrides.useRealGraceMs === true ? undefined : 0,
    killGraceMs: overrides.useRealGraceMs === true ? undefined : 0,
  };

  return {
    deps,
    backend,
    frontend,
    backendPorts,
    frontendLaunches,
    openedUrls,
    exitCodes,
    signalHandlers,
    stdout: () => out,
    stderr: () => err,
    reportReady: (value) => {
      resolveReady(value);
    },
    reportBackendFailure: (error) => {
      rejectReady(error);
    },
    resolvePortPick: (port) => {
      resolvePortPick(port);
    },
  };
}

function pressCtrlC(harness: Harness): void {
  const handler = harness.signalHandlers.get('SIGINT');
  if (handler === undefined) throw new Error('no SIGINT handler registered');
  handler();
}

describe('dev session frontend environment', () => {
  it('drops inherited selectors and pins every one the session owns', () => {
    const base: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      HOME: '/home/user',
      KIMI_SERVER_URL: 'http://127.0.0.1:58627',
      VITE_KIMI_SERVER_HTTP_URL: 'http://127.0.0.1:59999',
      KIMI_BACKEND_DEFAULT_URL: 'http://127.0.0.1:58627',
      KIMI_BACKEND_MULTI_URL: 'http://127.0.0.1:58628',
      WEB_PORT: '5175',
      WEB_PREVIEW_PORT: '4175',
      KIMI_WEB_CANONICAL_BUILD: '1',
      KIMI_WEB_BUILD_OUT_DIR: '/tmp/staging',
      KIMI_WEB_DESKTOP: '1',
    };

    const env = buildFrontendEnv(base, {
      backendOrigin: 'http://127.0.0.1:58631',
      frontendPort: 5177,
    });

    // The exact origin reported by the backend's ready hook, and the dev
    // backend switcher's presets pinned to it too, so one click in the Sidebar
    // cannot repoint the proxy at an older instance on 58627/58628.
    expect(env['KIMI_SERVER_URL']).toBe('http://127.0.0.1:58631');
    expect(env['KIMI_BACKEND_DEFAULT_URL']).toBe('http://127.0.0.1:58631');
    expect(env['KIMI_BACKEND_MULTI_URL']).toBe('http://127.0.0.1:58631');
    expect(env['WEB_PORT']).toBe('5177');
    // Empty beats both an inherited value and a stale apps/kimi-web/.env* entry
    // (process env wins over Vite's env files), keeping the client same-origin.
    expect(env['VITE_KIMI_SERVER_HTTP_URL']).toBe('');
    expect(env['KIMI_WEB_DESKTOP']).toBe('0');
    expect(env['PATH']).toBe('/usr/bin');
    expect(env['HOME']).toBe('/home/user');

    // Keys that are dropped and deliberately left unset.
    for (const key of DEV_WEB_DROPPED_ENV) {
      if (DEV_WEB_PINNED_ENV.includes(key)) continue;
      expect(env[key]).toBeUndefined();
    }
    // Every pinned key is also in the drop list, so nothing skipped the reset.
    for (const key of DEV_WEB_PINNED_ENV) {
      expect(DEV_WEB_DROPPED_ENV).toContain(key);
    }

    // The inherited environment is copied, not mutated.
    expect(base['KIMI_SERVER_URL']).toBe('http://127.0.0.1:58627');
    expect(base['WEB_PORT']).toBe('5175');
    expect(base['VITE_KIMI_SERVER_HTTP_URL']).toBe('http://127.0.0.1:59999');
  });

  it('binds the WSL NAT address when detected, loopback otherwise', () => {
    expect(resolveFrontendHost('172.30.98.229')).toBe('172.30.98.229');
    expect(resolveFrontendHost(undefined)).toBe(DEV_WEB_LOOPBACK_HOST);
    expect(resolveFrontendHost('')).toBe(DEV_WEB_LOOPBACK_HOST);
    expect(DEV_WEB_LOOPBACK_HOST).toBe('127.0.0.1');
  });
});

describe('dev session browser URL', () => {
  it('carries the token only in the fragment', () => {
    const url = buildDevWebUrl('127.0.0.1', 5175, 'tok-123');
    expect(url).toBe('http://127.0.0.1:5175/#token=tok-123');
    const parsed = new URL(url);
    expect(parsed.hash).toBe('#token=tok-123');
    expect(parsed.pathname).toBe('/');
    expect(parsed.search).toBe('');
    expect(`${parsed.pathname}${parsed.search}`).not.toContain('tok-123');
  });

  it('omits the fragment when no token was resolved', () => {
    expect(buildDevWebUrl('127.0.0.1', 5175, undefined)).toBe('http://127.0.0.1:5175/');
  });
});

describe('dev session arguments', () => {
  it('defaults to opening the browser on the canonical ports', () => {
    expect(parseDevWebArgs([])).toEqual({
      help: false,
      options: { open: true, frontendPort: 5175, backendPort: 58627 },
    });
  });

  it('accepts --no-open, --port and --backend-port', () => {
    expect(parseDevWebArgs(['--no-open', '--port', '5300', '--backend-port', '6001'])).toEqual({
      help: false,
      options: { open: false, frontendPort: 5300, backendPort: 6001 },
    });
  });

  it('accepts --help without starting anything', () => {
    expect(parseDevWebArgs(['--help']).help).toBe(true);
    expect(parseDevWebArgs(['-h']).help).toBe(true);
  });

  it('rejects unknown options and missing values', () => {
    expect(() => parseDevWebArgs(['--bogus'])).toThrow(/unknown option/);
    expect(() => parseDevWebArgs(['--port'])).toThrow(/--port requires a value/);
    expect(() => parseDevWebArgs(['--backend-port'])).toThrow(/requires a value/);
  });

  it('accepts only whole port numbers', () => {
    // `Number.parseInt` would silently accept every one of these.
    for (const bad of ['5175garbage', '1.5', '0', '-1', '', ' 5175', '5175 ', '0x1234', '1e3']) {
      expect(() => parseDevWebArgs(['--port', bad])).toThrow(/invalid --port/);
      expect(() => parseDevWebArgs(['--backend-port', bad])).toThrow(/invalid --backend-port/);
    }
    expect(() => parseDevWebArgs(['--port', '70000'])).toThrow(/invalid --port/);
    expect(parseDevWebArgs(['--port', '65535']).options.frontendPort).toBe(65_535);
    expect(parseDevWebArgs(['--port', '1']).options.frontendPort).toBe(1);
  });
});

describe('dev session startup', () => {
  it('proxies the frontend at the actual origin and opens the token URL', async () => {
    const harness = createHarness({ frontendPort: 5176 });
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
    harness.reportReady({ origin: 'http://127.0.0.1:58631', token: 'tok-abc' });

    const ready = await session.ready;

    // 5175 was taken, so the fallback port is what gets announced and served.
    expect(ready.frontendPort).toBe(5176);
    expect(ready.appUrl).toBe('http://127.0.0.1:5176/#token=tok-abc');
    expect(harness.backendPorts).toEqual([58627]);

    const launch = first(harness.frontendLaunches);
    expect(launch.port).toBe(5176);
    expect(launch.host).toBe(DEV_WEB_LOOPBACK_HOST);
    // The requested 58627 is ignored in favor of the reported origin.
    expect(launch.env['KIMI_SERVER_URL']).toBe('http://127.0.0.1:58631');
    expect(launch.env['WEB_PORT']).toBe('5176');

    expect(harness.openedUrls).toEqual(['http://127.0.0.1:5176/#token=tok-abc']);
    expect(harness.stdout()).toContain('http://127.0.0.1:5176/#token=tok-abc');
    expect(harness.stdout()).toContain('http://127.0.0.1:58631');
    expect(harness.stdout()).toContain('HMR');
    expect(harness.stdout()).toContain('Ctrl+C');
  });

  it('binds the WSL NAT address for the frontend and keeps the backend loopback', async () => {
    const harness = createHarness({ wslHost: '172.30.98.229' });
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
    harness.reportReady({ origin: 'http://127.0.0.1:58627', token: undefined });

    const ready = await session.ready;

    expect(ready.appUrl).toBe('http://172.30.98.229:5175/');
    expect(first(harness.frontendLaunches).host).toBe('172.30.98.229');
    expect(harness.openedUrls).toEqual(['http://172.30.98.229:5175/']);
    // Only the frontend host changes; the API is never given the NAT address.
    expect(harness.backendPorts).toEqual([58627]);
  });

  it('does not open a browser with --no-open', async () => {
    const harness = createHarness();
    const session = startDevWeb({ ...DEFAULT_OPTIONS, open: false }, harness.deps);
    harness.reportReady({ origin: 'http://127.0.0.1:58627', token: 'tok' });

    await session.ready;

    expect(harness.openedUrls).toEqual([]);
    expect(harness.stdout()).toContain('#token=tok');
  });
});

describe('dev session failure cleanup', () => {
  it('tears down and exits 1 when the backend dies before it is ready', async () => {
    const harness = createHarness();
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
    await flush();

    harness.reportBackendFailure(new Error('the source server exited before it was ready'));
    harness.backend.exitNow(1, null);

    expect(await session.done).toBe(1);
    // Vite never started, and nothing outside this session was signalled.
    expect(harness.frontendLaunches).toEqual([]);
    expect(harness.frontend.signals).toEqual([]);
    expect(harness.exitCodes).toEqual([1]);
    expect(harness.stderr()).toContain('exited unexpectedly');
  });

  it('tears down both children when the frontend never becomes ready', async () => {
    const harness = createHarness({ frontendReadyError: new Error('ECONNREFUSED') });
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
    harness.reportReady({ origin: 'http://127.0.0.1:58627', token: 'tok' });

    expect(await session.done).toBe(1);
    expect(harness.backend.signals).toEqual(['SIGTERM']);
    expect(harness.frontend.signals).toEqual(['SIGTERM']);
    expect(harness.exitCodes).toEqual([1]);
    expect(harness.stderr()).toContain('ECONNREFUSED');
  });

  it('stops the backend when the frontend dies after startup', async () => {
    const harness = createHarness();
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
    harness.reportReady({ origin: 'http://127.0.0.1:58627', token: 'tok' });
    await session.ready;

    harness.frontend.exitNow(1, null);

    expect(await session.done).toBe(1);
    expect(harness.backend.signals).toEqual(['SIGTERM']);
    expect(harness.exitCodes).toEqual([1]);
    expect(harness.stderr()).toContain('the Vite dev server exited unexpectedly (exit code 1)');
  });

  it('joins failure cleanup when signals arrive before a stubborn child exits', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const stubborn = makeFakeChild({ exitsOn: [] });
      const harness = createHarness({ backendChild: stubborn, useRealGraceMs: true });
      const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
      harness.reportReady({ origin: 'http://127.0.0.1:58627', token: 'tok' });
      await session.ready;

      harness.frontend.exitNow(1, null);
      expect(stubborn.signals).toEqual(['SIGTERM']);
      pressCtrlC(harness);
      const stopped = session.stop('SIGTERM');
      let stopResolved = false;
      void stopped.then(() => { stopResolved = true; });
      await flush();
      expect(harness.exitCodes).toEqual([]);
      expect(stopResolved).toBe(false);

      await vi.advanceTimersByTimeAsync(5_000);
      expect(stubborn.signals).toEqual(['SIGTERM', 'SIGKILL']);
      pressCtrlC(harness);
      await flush();
      expect(harness.exitCodes).toEqual([]);
      expect(stopResolved).toBe(false);

      stubborn.exitNow(0, 'SIGKILL');
      await stopped;
      expect(await session.done).toBe(1);
      expect(harness.exitCodes).toEqual([1]);
      expect(stubborn.signals).toEqual(['SIGTERM', 'SIGKILL']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('escalates to SIGKILL for a child that ignores the stop signal', async () => {
    const stubborn = makeFakeChild({ exitsOn: ['SIGKILL'] });
    const harness = createHarness({ backendChild: stubborn });
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
    harness.reportReady({ origin: 'http://127.0.0.1:58627', token: 'tok' });
    await session.ready;

    pressCtrlC(harness);

    expect(await session.done).toBe(0);
    expect(stubborn.signals).toEqual(['SIGINT', 'SIGKILL']);
  });
});

describe('dev session shutdown', () => {
  it('signals both children exactly once on Ctrl+C', async () => {
    const harness = createHarness();
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
    harness.reportReady({ origin: 'http://127.0.0.1:58627', token: 'tok' });
    await session.ready;

    pressCtrlC(harness);
    expect(await session.done).toBe(0);

    expect(harness.backend.signals).toEqual(['SIGINT']);
    expect(harness.frontend.signals).toEqual(['SIGINT']);
    expect(harness.exitCodes).toEqual([0]);
  });

  it('kills an already-spawned backend when Ctrl+C lands mid-startup', async () => {
    const harness = createHarness();
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
    await flush();

    pressCtrlC(harness);

    expect(await session.done).toBe(0);
    expect(harness.backend.signals).toEqual(['SIGINT']);
    expect(harness.frontendLaunches).toEqual([]);
    expect(harness.exitCodes).toEqual([0]);
  });

  it('starts nothing when Ctrl+C lands before the backend is spawned', async () => {
    const harness = createHarness({ deferPortPick: true });
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);

    pressCtrlC(harness);
    expect(await session.done).toBe(0);

    harness.resolvePortPick(5175);
    await flush();

    expect(harness.backendPorts).toEqual([]);
    expect(harness.frontendLaunches).toEqual([]);
    await expect(session.ready).rejects.toThrow(/stopped before it finished starting/);
  });

  it('is idempotent when signals arrive twice', async () => {
    const harness = createHarness();
    const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
    harness.reportReady({ origin: 'http://127.0.0.1:58627', token: 'tok' });
    await session.ready;

    pressCtrlC(harness);
    pressCtrlC(harness);

    expect(await session.done).toBe(0);
    expect(harness.backend.signals).toEqual(['SIGINT']);
    expect(harness.frontend.signals).toEqual(['SIGINT']);
    expect(harness.exitCodes).toEqual([0]);
  });
});

/**
 * Fixture for the grace regression test (see the test below). The parameter
 * decorator is the same shape as agent-core's DI decorators: it only compiles
 * when tsx picks up the tsconfig handed over through `TSX_TSCONFIG_PATH`, so a
 * broken handoff fails here instead of at `pnpm dev` runtime.
 */
const GRACE_FIXTURE_SOURCE = `
import { writeFileSync } from 'node:fs';

function inject(target: object, key: string | symbol | undefined, index: number): void {
  void target;
  void key;
  void index;
}

class Probe {
  constructor(@inject private readonly dep: string) {
    void this.dep;
  }
}

const [markerPath, delayRaw] = process.argv.slice(2);
const delayMs = Number(delayRaw);

// Same readiness contract as scripts/dev-web/backend.ts.
process.send?.({ type: 'ready', origin: 'http://127.0.0.1:1' });

// Mirrors kap-server's graceful shutdown: flush, then exit. An intermediate tsx
// CLI relay would SIGKILL us ~100ms in, so this would never run.
process.once('SIGINT', () => {
  setTimeout(() => {
    writeFileSync(String(markerPath), 'clean-shutdown');
    process.exit(0);
  }, delayMs);
});
`;

/**
 * The launcher contract. tsx must run as an in-process ESM loader hook: an
 * intermediate `tsx` CLI process relays SIGINT/SIGTERM by SIGKILLing the real
 * child after ~100ms, which would truncate the session's shutdown grace below.
 */
describe('source dev launcher', () => {
  it('runs TypeScript entries through the in-process loader, not the tsx CLI', () => {
    const args = tsxNodeArgs('/tmp/entry.ts', ['--no-open']);

    expect(args.filter((arg) => arg === '--import')).toHaveLength(2);
    const [tsxLoader, rawTextLoader] = args.filter((arg) => arg !== '--import');
    expect(String(tsxLoader)).toContain('/tsx/dist/loader.mjs');
    expect(String(rawTextLoader)).toMatch(/register-raw-text-loader\.mjs$/);
    // tsx's CLI entry is the thing whose signal relay we must not go through.
    expect(args.join(' ')).not.toContain('tsx/dist/cli');
    expect(args.slice(-2)).toEqual(['/tmp/entry.ts', '--no-open']);

    const env = tsxChildEnv(
      { PATH: '/usr/bin', TSX_TSCONFIG_PATH: '/stale/tsconfig.json' },
      { KIMI_CODE_DEV_SERVER: '1' },
    );
    // The dev tsconfig has no CLI flag to travel by; it must be absolute.
    expect(env['TSX_TSCONFIG_PATH']).toMatch(/[/\\]apps[/\\]kimi-code[/\\]tsconfig\.dev\.json$/);
    expect(env['PATH']).toBe('/usr/bin');
    expect(env['KIMI_CODE_DEV_SERVER']).toBe('1');
  });

  it('has the root dev wrapper use the same in-process launcher', () => {
    const source = readFileSync(join(REPO_ROOT, 'dev'), 'utf8');
    expect(source).toContain('tsxNodeArgs(');
    expect(source).toContain('tsxChildEnv(');
    expect(source).not.toContain('tsx/cli');
  });

  /**
   * Real child, real launcher: it reports readiness over the IPC channel (as
   * backend.ts does) and takes 400ms to flush after SIGINT. A tsx CLI middle
   * process would hard-kill it at ~100ms — the marker would never appear and the
   * session would come back in ~100ms instead of waiting out the grace.
   */
  it('waits out a real child that needs more than 100ms to shut down', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hakimi-dev-web-grace-'));
    const fixture = join(dir, 'grace-fixture.ts');
    const marker = join(dir, 'grace-marker.txt');
    const graceMs = 400;
    writeFileSync(fixture, GRACE_FIXTURE_SOURCE);
    // tsx only applies a tsconfig to files that tsconfig's `include` matches (the
    // same reason apps/kimi-code/tsconfig.dev.json lists the app's sources), so
    // the fixture carries its own — otherwise the decorator below cannot compile.
    const tsconfig = join(dir, 'tsconfig.json');
    writeFileSync(
      tsconfig,
      JSON.stringify({
        compilerOptions: { experimentalDecorators: true, strict: true },
        include: ['./grace-fixture.ts'],
      }),
    );

    const child = spawn(
      process.execPath,
      tsxNodeArgs(fixture, [marker, String(graceMs)]),
      {
        cwd: REPO_ROOT,
        // Same env-var tsconfig handoff the session uses for the real backend.
        env: tsxChildEnv(process.env, { TSX_TSCONFIG_PATH: tsconfig }),
        // The session's backend reports its readiness over this IPC channel.
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    );
    const launch: BackendLaunch = {
      process: toManagedProcess(child),
      ready: waitForBackendReady(child, 20_000),
    };
    const harness = createHarness({ backendLaunch: launch, useRealGraceMs: true });

    try {
      const session = startDevWeb(DEFAULT_OPTIONS, harness.deps);
      // Wait for the real child's ready report before stopping it.
      await launch.ready;

      const startedAt = Date.now();
      pressCtrlC(harness);
      expect(await session.done).toBe(0);
      const elapsedMs = Date.now() - startedAt;

      // The child's delayed cleanup completed instead of being hard-killed...
      expect(readFileSync(marker, 'utf8')).toBe('clean-shutdown');
      // ...and the session waited for it rather than returning in ~100ms.
      expect(elapsedMs).toBeGreaterThanOrEqual(300);
      // Nothing was left behind.
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
