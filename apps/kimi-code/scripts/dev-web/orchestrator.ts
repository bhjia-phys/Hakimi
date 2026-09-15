/**
 * Lifecycle for the one-command source Web dev session (`pnpm dev` / `./dev`).
 *
 * The session starts the source server (a child process that reports the origin
 * it actually bound over IPC) and the Vite dev server for apps/kimi-web, prints
 * the real dev URL, and owns exactly the two children it created: on Ctrl+C, on
 * a startup failure, or when either child dies it terminates only those PIDs —
 * never another Hakimi or Vite process the user already has running.
 *
 * Every side effect (spawning, port probing, browser opening, exiting) is
 * injected, so these rules are testable without starting anything.
 */

import {
  buildDevWebUrl,
  buildFrontendEnv,
  resolveFrontendHost,
} from './config';

/** Grace period before a stop signal is escalated to SIGKILL. */
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
const DEFAULT_KILL_GRACE_MS = 2_000;

/** Thrown internally when a signal arrived before the session finished coming up. */
class DevWebAbortedError extends Error {
  constructor() {
    super('the source dev session was stopped before it finished starting');
    this.name = 'DevWebAbortedError';
  }
}

export interface ManagedProcess {
  readonly pid: number | undefined;
  /** Send a signal to this child only; never a process group. */
  kill(signal: NodeJS.Signals): void;
  onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  onError(listener: (error: Error) => void): void;
}

export interface BackendReady {
  /** Origin the server actually bound, e.g. `http://127.0.0.1:58628`. */
  origin: string;
  /** Persistent bearer token, or `undefined` when it could not be read. */
  token: string | undefined;
}

export interface BackendLaunch {
  process: ManagedProcess;
  /** Resolves with the actual origin once listening; rejects when it fails. */
  ready: Promise<BackendReady>;
}

export interface FrontendLaunchOptions {
  port: number;
  host: string;
  /** Isolated environment (see `buildFrontendEnv`). */
  env: NodeJS.ProcessEnv;
}

export interface DevWebOptions {
  open: boolean;
  frontendPort: number;
  backendPort: number;
}

export interface DevWebDeps {
  startBackend(options: { port: number }): BackendLaunch;
  startFrontend(options: FrontendLaunchOptions): ManagedProcess;
  /** Resolve once the Vite dev server answers on `origin`. */
  waitForFrontend(origin: string): Promise<void>;
  /** First free port at or above `preferred` on `host`. */
  pickFrontendPort(host: string, preferred: number): Promise<number>;
  /** WSL2 NAT address a Windows browser can reach, when there is one. */
  resolveFrontendHost(): string | undefined;
  openUrl(url: string): void;
  /** Register a shutdown signal handler (the session keeps it idempotent). */
  registerSignal(signal: NodeJS.Signals, handler: () => void): void;
  exit(code: number): void;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
  env: NodeJS.ProcessEnv;
  shutdownGraceMs?: number;
  killGraceMs?: number;
}

export interface DevWebReady {
  /** Web UI URL, carrying the token fragment when a token was resolved. */
  appUrl: string;
  /** Actual backend origin the frontend proxies to. */
  backendOrigin: string;
  frontendPort: number;
}

export interface DevWebSession {
  /** Resolves once the frontend is serving and the URL has been announced. */
  ready: Promise<DevWebReady>;
  /** Stop everything this session started. Idempotent. */
  stop(signal: NodeJS.Signals): Promise<void>;
  /** Exit code once the session has fully shut down. */
  done: Promise<number>;
}

interface TrackedProcess {
  readonly process: ManagedProcess;
  readonly label: string;
  exited: boolean;
  readonly waiters: Array<() => void>;
}

class DevWebSessionImpl implements DevWebSession {
  readonly ready: Promise<DevWebReady>;
  readonly done: Promise<number>;

  private readonly options: DevWebOptions;
  private readonly deps: DevWebDeps;
  private backend: TrackedProcess | undefined;
  private frontend: TrackedProcess | undefined;
  private stopping = false;
  private settled = false;
  private resolveDone!: (code: number) => void;

  constructor(options: DevWebOptions, deps: DevWebDeps) {
    this.options = options;
    this.deps = deps;
    this.done = new Promise<number>((resolve) => {
      this.resolveDone = resolve;
    });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      // `on` (not `once`): the handler is idempotent, so a signal delivered
      // both directly and forwarded by the wrapper cannot skip child cleanup.
      deps.registerSignal(signal, () => {
        void this.stop(signal);
      });
    }
    this.ready = this.run();
    // The failure path already reports the error and shuts down; keep the
    // rejection from surfacing as an unhandled rejection for callers that only
    // await `done`.
    void this.ready.catch(() => {});
  }

  private async run(): Promise<DevWebReady> {
    try {
      return await this.start();
    } catch (error) {
      if (!(error instanceof DevWebAbortedError)) {
        await this.fail(startErrorMessage(error));
      }
      throw error;
    }
  }

  private async start(): Promise<DevWebReady> {
    const host = resolveFrontendHost(this.deps.resolveFrontendHost());
    const frontendPort = await this.deps.pickFrontendPort(host, this.options.frontendPort);
    if (this.stopping) throw new DevWebAbortedError();

    const launch = this.deps.startBackend({ port: this.options.backendPort });
    this.backend = this.track(launch.process, 'the source server');
    const { origin, token } = await launch.ready;
    if (this.stopping) throw new DevWebAbortedError();

    const env = buildFrontendEnv(this.deps.env, { backendOrigin: origin, frontendPort });
    const frontend = this.deps.startFrontend({ port: frontendPort, host, env });
    this.frontend = this.track(frontend, 'the Vite dev server');
    await this.deps.waitForFrontend(`http://${host}:${frontendPort}`);
    if (this.stopping) throw new DevWebAbortedError();

    const ready: DevWebReady = {
      appUrl: buildDevWebUrl(host, frontendPort, token),
      backendOrigin: origin,
      frontendPort,
    };
    this.announce(ready);
    return ready;
  }

  async stop(signal: NodeJS.Signals): Promise<void> {
    if (this.stopping) {
      await this.done;
      return;
    }
    this.stopping = true;
    this.deps.stderr.write(`\nStopping the source dev session (${signal})…\n`);
    await this.terminateAll(signal);
    this.finish(0);
    await this.done;
  }

  private track(process: ManagedProcess, label: string): TrackedProcess {
    const tracked: TrackedProcess = { process, label, exited: false, waiters: [] };
    process.onExit((code, signal) => {
      tracked.exited = true;
      for (const waiter of tracked.waiters.splice(0)) waiter();
      if (this.stopping) return;
      void this.fail(`${label} exited unexpectedly (${describeExit(code, signal)})`);
    });
    process.onError((error) => {
      if (this.stopping) return;
      void this.fail(`${label} failed: ${error.message}`);
    });
    return tracked;
  }

  private async fail(message: string): Promise<void> {
    if (this.stopping) {
      await this.done;
      return;
    }
    // Signals and failures join the same cleanup through `done`.
    this.stopping = true;
    this.deps.stderr.write(`\n${message}\n`);
    await this.terminateAll('SIGTERM');
    this.finish(1);
  }

  private async terminateAll(signal: NodeJS.Signals): Promise<void> {
    const frontend = this.frontend;
    const backend = this.backend;
    // Clear the refs first so a second concurrent shutdown cannot double-signal.
    this.frontend = undefined;
    this.backend = undefined;
    await Promise.all([this.terminate(frontend, signal), this.terminate(backend, signal)]);
  }

  private async terminate(
    tracked: TrackedProcess | undefined,
    signal: NodeJS.Signals,
  ): Promise<void> {
    if (tracked === undefined || tracked.exited) return;
    tracked.process.kill(signal);
    if (await this.waitForExit(tracked, this.deps.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS)) {
      return;
    }
    tracked.process.kill('SIGKILL');
    await this.waitForExit(tracked, this.deps.killGraceMs ?? DEFAULT_KILL_GRACE_MS);
  }

  private waitForExit(tracked: TrackedProcess, timeoutMs: number): Promise<boolean> {
    if (tracked.exited) return Promise.resolve(true);
    if (timeoutMs <= 0) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolve(false);
      }, timeoutMs);
      tracked.waiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  private finish(code: number): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveDone(code);
    this.deps.exit(code);
  }

  private announce(ready: DevWebReady): void {
    this.deps.stdout.write(
      [
        '',
        '  Hakimi source dev is running',
        '',
        `  Web:     ${ready.appUrl}`,
        `  API:     ${ready.backendOrigin}`,
        '  HMR:     on — edits under apps/kimi-web/ apply without a restart',
        '  Restart: the API runs from source; stop and re-run the command to load server-side edits',
        '  Stop:    Ctrl+C',
        '',
      ].join('\n'),
    );
    if (this.options.open) {
      this.deps.openUrl(ready.appUrl);
    }
  }
}

export function startDevWeb(options: DevWebOptions, deps: DevWebDeps): DevWebSession {
  return new DevWebSessionImpl(options, deps);
}

function startErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Failed to start the source dev session: ${detail}`;
}

/** Human-readable exit description, shared with the spawners' ready gate. */
export function describeExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  if (signal !== null) return `signal ${signal}`;
  return code === null ? 'unknown status' : `exit code ${code}`;
}
