/**
 * `hakimi remote serve` — the hidden foreground entry the systemd user unit
 * runs. It serves the FULL data plane under the fixed config token with no
 * TTL:
 *
 *   - starts the FULL loopback Hakimi server (no `remoteAccess` narrowing —
 *     the Web client may list, open, and control every existing session with
 *     full config / workspace / task / fs output), hardened exactly like the
 *     public-bind web server (`bindClass: 'public'` keeps the public profile
 *     on the loopback bind that the cloudflared tunnel carries), and WITHOUT
 *     the temporary remote-share controller;
 *   - spawns cloudflared (absolute path from the config) against the server's
 *     actual port and waits for the random trycloudflare origin;
 *   - atomically writes `<home>/remote/state.json` (pid, port, origin, start
 *     time, and the optional cloudflared metrics port) once the tunnel is up;
 *   - probes cloudflared readiness immediately, requires the first healthy
 *     connection within 60s, then restarts after three consecutive 5s
 *     failures;
 *   - on SIGINT/SIGTERM tears down in order cloudflared → server → state
 *     (state removal is PID-guarded so a stale process can never delete a
 *     newer process's state) and exits 0;
 *   - on an unexpected cloudflared exit or unhealthy readiness, cleans up the
 *     same way and exits non-zero, so systemd (`Restart=on-failure`) restarts
 *     the whole combo and a fresh random origin lands in state.json.
 */

import type { ChildProcess } from 'node:child_process';
import { unlinkSync } from 'node:fs';

import {
  createServerLogger,
  startServer,
  type RunningServer,
  type ServerLogLevel,
  type ServerStartOptions,
} from '@moonshot-ai/kap-server';

import { resolveServerWebAssetsDir } from '#/cli/sub/web/run';
import { WEB_USER_AGENT_SUFFIX } from '#/constant/app';

import {
  createKimiCodeHostIdentity,
  getVersion,
} from '../../version';
import {
  createTunnelLogTail,
  CLOUDFLARED_LOG_TAIL_LIMIT_BYTES,
  probeTunnelReadiness,
  redactDiagnosticText,
  spawnCloudflared,
  terminateCloudflared,
  validateTryCloudflareUrl,
  waitForMetricsAddress,
  waitForTryCloudflareUrl,
  type CloudflaredMetricsAddress,
  type CloudflaredSpawnOptions,
  type ProbeTunnelReadinessOptions,
  type TunnelLogTail,
  type TunnelLogTailOptions,
  type TunnelReadinessProbeResult,
} from './cloudflared';
import {
  createTunnelReadinessMonitor,
  REMOTE_READY_FAIL_THRESHOLD,
  REMOTE_READY_GRACE_PERIOD_MS,
  REMOTE_READY_INTERVAL_MS,
  type MetricsAddressStatus,
  type TunnelReadinessMonitor,
  type TunnelUnhealthyDiagnosis,
} from './monitor';
import { renderTerminalQr } from './qr';
import {
  readPrivateJsonFile,
  remoteStatePath,
  writePrivateJsonFile,
  RemoteConfigSchema,
  RemoteStateSchema,
  type RemoteConfig,
  type RemoteState,
} from './store';
import { buildRemoteRootUrl, createTemporaryAuthTokenService, type RemoteSignalSource } from './tunnel';

export const REMOTE_SERVE_HOST = '127.0.0.1';
export const REMOTE_ALLOWED_HOSTS = ['.trycloudflare.com'] as const;

/** `--metrics` bind for the serve cloudflared: OS-assigned free loopback port. */
const REMOTE_METRICS_BIND = '127.0.0.1:0';
/** Per-probe timeout for the loopback `/ready` fetch. */
const REMOTE_READY_PROBE_TIMEOUT_MS = 2_000;
/** Redacted tail excerpt attached to the unhealthy-exit diagnostic log. */
const REMOTE_READY_DIAGNOSTICS_MAX_BYTES = 8 * 1024;

type RemoteSignal = 'SIGINT' | 'SIGTERM';
type RemoteStopReason =
  | { readonly kind: 'signal'; readonly signal: RemoteSignal }
  | {
      readonly kind: 'cloudflared';
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
    }
  | { readonly kind: 'tunnel-unhealthy' };

export interface RemoteServeOptions {
  readonly configPath: string;
  readonly logLevel: ServerLogLevel;
}

export interface RemoteServeDeps {
  readonly pid?: number;
  readonly startServer?: (options: ServerStartOptions) => Promise<RunningServer>;
  readonly spawnCloudflared?: (
    executable: string,
    actualPort: number,
    options?: CloudflaredSpawnOptions,
  ) => ChildProcess;
  readonly waitForTunnelUrl?: (
    child: ChildProcess,
    options: { readonly signal: AbortSignal },
  ) => Promise<string>;
  readonly waitForMetricsAddress?: (
    child: ChildProcess,
    options: { readonly signal: AbortSignal },
  ) => Promise<CloudflaredMetricsAddress>;
  readonly probeTunnelReadiness?: (
    port: number,
    options: ProbeTunnelReadinessOptions,
  ) => Promise<TunnelReadinessProbeResult>;
  readonly createTunnelLogTail?: (options?: TunnelLogTailOptions) => TunnelLogTail;
  /**
   * Unhealthy-exit diagnostics hook (defaults to a `logger.error` with the
   * redacted tail). Injectable so a failing logger can be exercised without
   * blocking the restart path.
   */
  readonly reportTunnelUnhealthy?: (
    diagnosis: TunnelUnhealthyDiagnosis,
    recentLogs: string,
  ) => void;
  readonly terminateCloudflared?: (child: ChildProcess) => Promise<void>;
  readonly signalSource?: RemoteSignalSource;
  readonly stdout?: Pick<NodeJS.WriteStream, 'write'>;
  readonly generateQrCode?: (url: string) => Promise<string>;
  readonly now?: () => number;
  readonly readConfig?: (configPath: string) => RemoteConfig;
  readonly writeState?: (statePath: string, state: RemoteState) => void;
  readonly readState?: (statePath: string) => RemoteState | undefined;
  readonly removeState?: (statePath: string) => void;
}

export async function runRemoteServe(
  options: RemoteServeOptions,
  deps: RemoteServeDeps = {},
): Promise<void> {
  const pid = deps.pid ?? process.pid;
  const now = deps.now ?? Date.now;
  const readConfig =
    deps.readConfig ??
    ((configPath: string) => {
      const config = readPrivateJsonFile(configPath, RemoteConfigSchema);
      if (config === undefined) {
        throw new Error(`remote config not found: ${configPath} (run 'hakimi remote start' first)`);
      }
      return config;
    });
  const writeState = deps.writeState ?? ((path, state) => writePrivateJsonFile(path, state));
  const readState =
    deps.readState ?? ((path) => readPrivateJsonFile(path, RemoteStateSchema));
  const removeState = deps.removeState ?? ((path) => {
    try {
      unlinkSync(path);
    } catch {
      // Already gone — fine.
    }
  });
  const signalSource = deps.signalSource ?? process;
  const stdout = deps.stdout ?? process.stdout;
  const start = deps.startServer ?? ((serverOptions) => startServer(serverOptions));
  const spawnTunnel = deps.spawnCloudflared ?? spawnCloudflared;
  const waitForTunnel = deps.waitForTunnelUrl ?? waitForTryCloudflareUrl;
  const waitForMetrics = deps.waitForMetricsAddress ?? waitForMetricsAddress;
  const probeReadiness = deps.probeTunnelReadiness ?? probeTunnelReadiness;
  const makeTunnelLogTail = deps.createTunnelLogTail ?? createTunnelLogTail;
  const terminateTunnel = deps.terminateCloudflared ?? terminateCloudflared;
  const generateQrCode = deps.generateQrCode ?? renderTerminalQr;

  const config = readConfig(options.configPath);
  const redactDiagnostic = (text: string): string => redactDiagnosticText(text, config.token);
  const statePath = remoteStatePath(config.homeDir);
  const authTokenService = createTemporaryAuthTokenService(config.token);

  let server: RunningServer | undefined;
  let tunnel: ChildProcess | undefined;
  let cleanupPromise: Promise<void> | undefined;
  let stopReason: RemoteStopReason | undefined;
  let resolveStop!: (reason: RemoteStopReason) => void;
  const stopped = new Promise<RemoteStopReason>((resolve) => {
    resolveStop = resolve;
  });
  // Live readiness-monitor state. Monitoring starts immediately after URL
  // publication: metrics discovery and `/ready` are retried under one 60s
  // first-ready deadline; after the first OK, three consecutive failures
  // trigger `tunnel-unhealthy`.
  let metricsStatus: MetricsAddressStatus = { state: 'pending' };
  let metricsPort: number | undefined;
  let stdoutTail: TunnelLogTail | undefined;
  let stderrTail: TunnelLogTail | undefined;
  let tunnelMonitor: TunnelReadinessMonitor | undefined;
  // Aborts the in-flight URL/metrics waits during teardown so their internal
  // timers never keep the process alive after the service stops.
  const startupAbort = new AbortController();
  const requestStop = (reason: RemoteStopReason): void => {
    if (stopReason !== undefined) return;
    stopReason = reason;
    resolveStop(reason);
  };
  const onSigint = (): void => {
    requestStop({ kind: 'signal', signal: 'SIGINT' });
  };
  const onSigterm = (): void => {
    requestStop({ kind: 'signal', signal: 'SIGTERM' });
  };
  // Persistent (`on`, not `once`) signal listeners: a `once` handler is
  // removed the moment the first signal fires, so a second signal — or the
  // bundled signal-exit bookkeeping that re-raises a signal once the last
  // listener is gone — can kill the process while the teardown below is still
  // running. Keeping the listeners attached until the `finally` suppresses the
  // default signal death for the whole cleanup; `requestStop` makes repeats a
  // no-op.
  signalSource.on('SIGINT', onSigint);
  signalSource.on('SIGTERM', onSigterm);

  // One cleanup path for every exit: cloudflared → server → state. State is
  // removed only when THIS pid owns it (a systemd restart writes new state
  // under the new pid before the old process finishes dying).
  const cleanup = (): Promise<void> => {
    cleanupPromise ??= (async () => {
      try {
        if (tunnel !== undefined) await terminateTunnel(tunnel);
      } finally {
        await server?.close();
      }
      const current = readState(statePath);
      if (current !== undefined && current.pid === pid) {
        removeState(statePath);
      }
    })();
    return cleanupPromise;
  };

  /** Merge the parsed metrics port into state only while this pid owns it. */
  const updateStateWithMetricsPort = (port: number): void => {
    const current = readState(statePath);
    if (current !== undefined && current.pid === pid) {
      writeState(statePath, { ...current, metricsPort: port });
    }
  };

  let onTunnelClose:
    | ((code: number | null, signal: NodeJS.Signals | null) => void)
    | undefined;

  try {
    const version = getVersion();
    const logger = createServerLogger({ level: options.logLevel });

    /**
     * Readiness watchdog: probe immediately, require the first loopback
     * `/ready` success within 60s (including metrics discovery), then require
     * three consecutive 5s probe failures before reporting unhealthy. The
     * caller turns that into the standard cleanup + non-zero exit so systemd
     * restarts the whole combo.
     */
    const startReadinessMonitor = (): void => {
      if (tunnelMonitor !== undefined) return;
      tunnelMonitor = createTunnelReadinessMonitor({
        metricsAddress: () => metricsStatus,
        probe: (port, signal) =>
          probeReadiness(port, { timeoutMs: REMOTE_READY_PROBE_TIMEOUT_MS, signal }),
        gracePeriodMs: REMOTE_READY_GRACE_PERIOD_MS,
        intervalMs: REMOTE_READY_INTERVAL_MS,
        failThreshold: REMOTE_READY_FAIL_THRESHOLD,
        onUnhealthy: (diagnosis) => {
          // The restart path goes FIRST: diagnostics must never preempt the
          // cleanup + non-zero exit that systemd observes.
          requestStop({ kind: 'tunnel-unhealthy' });
          try {
            const safeDiagnosis: TunnelUnhealthyDiagnosis = {
              ...diagnosis,
              failures: diagnosis.failures.map((failure) => ({
                ...failure,
                detail: redactDiagnostic(failure.detail).slice(0, 512),
              })),
            };
            (deps.reportTunnelUnhealthy ?? reportTunnelUnhealthyLog)(
              safeDiagnosis,
              redactedTail(safeDiagnosis),
            );
          } catch {
            // A failing tail/logger must not swallow the restart.
          }
        },
      });
      tunnelMonitor.start();
    };

    const reportTunnelUnhealthyLog = (
      diagnosis: TunnelUnhealthyDiagnosis,
      recentLogs: string,
    ): void => {
      logger.error(
        {
          metrics:
            diagnosis.metrics.state === 'known'
              ? `${diagnosis.metrics.host}:${diagnosis.metrics.port}`
              : diagnosis.metrics.state,
          consecutive_failures: diagnosis.failures.length,
          last_ok_at: diagnosis.lastOkAt,
          failures: diagnosis.failures.map((failure) => ({
            at: new Date(failure.at).toISOString(),
            detail: failure.detail,
          })),
          recent_logs: recentLogs,
        },
        'cloudflared tunnel unhealthy; restarting service',
      );
    };

    /** Redacted, budgeted tail merged from BOTH streams (independent buffers). */
    const redactedTail = (diagnosis: TunnelUnhealthyDiagnosis): string => {
      const perStream = Math.max(1, Math.floor(REMOTE_READY_DIAGNOSTICS_MAX_BYTES / 2));
      const parts: string[] = [];
      for (const tail of [stdoutTail, stderrTail]) {
        const dumped = tail?.dump({ maxBytes: perStream }) ?? '';
        if (dumped.length > 0) parts.push(dumped);
      }
      if (parts.length === 0 && diagnosis.failures.length > 0) parts.push('(no tunnel log captured)');
      return parts.join('\n');
    };

    server = await start({
      homeDir: config.homeDir,
      host: REMOTE_SERVE_HOST,
      // Ephemeral loopback port — the actual port is recorded in state.json
      // so `status` and the tunnel both use it.
      port: 0,
      serverVersion: version,
      hostIdentity: {
        ...createKimiCodeHostIdentity(version),
        userAgentSuffix: WEB_USER_AGENT_SUFFIX,
      },
      logLevel: options.logLevel,
      logger,
      // The listener itself binds loopback, but the systemd tunnel carries it
      // to the public: `bindClass: 'public'` keeps the full public hardening
      // profile (security headers, auth-failure limiter, tunnel Host admission
      // via `allowedHosts`, shutdown/terminals/debug disabled).
      bindClass: 'public',
      debugEndpoints: false,
      insecureNoTls: true,
      allowRemoteShutdown: false,
      allowRemoteTerminals: false,
      allowedHosts: REMOTE_ALLOWED_HOSTS,
      authTokenService,
      telemetry: true,
      webAssetsDir: resolveServerWebAssetsDir(),
    });

    if (stopReason !== undefined) return;

    tunnel = spawnTunnel(config.cloudflaredPath, server.port, { metrics: REMOTE_METRICS_BIND });
    // Collect bounded redacted tails from the very first line so an
    // unhealthy-exit diagnostic always carries the tunnel's own view. Each
    // stream gets its OWN tail: sharing one partial-line buffer across stdout
    // and stderr would stitch unrelated half-lines together.
    const tailOptions = {
      limitBytes: CLOUDFLARED_LOG_TAIL_LIMIT_BYTES,
      redact: redactDiagnostic,
    };
    stdoutTail = makeTunnelLogTail(tailOptions);
    stderrTail = makeTunnelLogTail(tailOptions);
    tunnel.stdout?.on('data', stdoutTail.onChunk);
    tunnel.stderr?.on('data', stderrTail.onChunk);
    const tunnelUrlPromise = waitForTunnel(tunnel, { signal: startupAbort.signal });
    // Best-effort metrics address parse: never blocks the URL publish path. A
    // late/failed parse is covered by the monitor's startup deadline (never
    // silently disables the watchdog).
    waitForMetrics(tunnel, { signal: startupAbort.signal })
      .then((address) => {
        metricsStatus = { state: 'known', host: address.host, port: address.port };
        metricsPort = address.port;
        updateStateWithMetricsPort(address.port);
      })
      .catch(() => {
        if (metricsStatus.state === 'pending') metricsStatus = { state: 'failed' };
      });
    const startup = await Promise.race([
      tunnelUrlPromise.then((url) => ({ kind: 'ready' as const, url })),
      stopped.then((reason) => ({ kind: 'stopped' as const, reason })),
    ]);
    if (startup.kind === 'stopped') {
      startupAbort.abort();
      await tunnelUrlPromise.catch(() => {});
      return;
    }

    onTunnelClose = (code, signal): void => {
      requestStop({ kind: 'cloudflared', code, signal });
    };
    tunnel.once('close', onTunnelClose);
    if (tunnel.exitCode !== null || tunnel.signalCode !== null) {
      onTunnelClose(tunnel.exitCode, tunnel.signalCode);
      throw new Error(
        `cloudflared tunnel closed unexpectedly (${formatCloudflaredExit(tunnel.exitCode, tunnel.signalCode)})`,
      );
    }

    const origin = validateTryCloudflareUrl(startup.url);
    if (origin === undefined) {
      throw new Error(`cloudflared published an invalid tunnel origin: ${startup.url}`);
    }
    writeState(statePath, {
      version: 1,
      pid,
      port: server.port,
      origin,
      startedAt: now(),
      metricsPort,
    });
    startReadinessMonitor();

    const remoteUrl = buildRemoteRootUrl(origin, config.token);
    const qr = await generateQrCode(remoteUrl);
    stdout.write(formatServeBanner(remoteUrl, origin, server.port, qr));

    const reason = await stopped;
    if (reason.kind === 'cloudflared') {
      throw new Error(
        `cloudflared tunnel closed unexpectedly (${formatCloudflaredExit(reason.code, reason.signal)})`,
      );
    }
    if (reason.kind === 'tunnel-unhealthy') {
      throw new Error('cloudflared tunnel became unhealthy; restarting service');
    }
  } finally {
    startupAbort.abort();
    tunnelMonitor?.stop();
    if (tunnel !== undefined && onTunnelClose !== undefined) {
      tunnel.off('close', onTunnelClose);
    }
    // Keep signal and tail listeners attached THROUGH teardown: cloudflared may
    // emit its final useful diagnostic while terminating, and removing the
    // last signal listener early restores Node's default signal death. The
    // outer finally guarantees every listener is detached even if cleanup
    // itself throws.
    try {
      await cleanup();
    } finally {
      if (tunnel !== undefined) {
        if (stdoutTail !== undefined) tunnel.stdout?.off('data', stdoutTail.onChunk);
        if (stderrTail !== undefined) tunnel.stderr?.off('data', stderrTail.onChunk);
      }
      signalSource.off('SIGINT', onSigint);
      signalSource.off('SIGTERM', onSigterm);
    }
  }
}

export function formatServeBanner(
  remoteUrl: string,
  origin: string,
  port: number,
  qr: string,
): string {
  return [
    '',
    '  Hakimi remote control ready (all sessions)',
    '',
    qr.trimEnd(),
    '',
    '  Copy URL:',
    `  ${remoteUrl}`,
    '',
    `  Tunnel:  ${origin}`,
    `  Port:    127.0.0.1:${port}`,
    '  Token:   fixed (reused across restarts)',
    '  Risk:    Anyone with this URL gets full access to every Hakimi session — plus files, settings, and tools. Keep it private.',
    '  Stop:    hakimi remote stop (or Ctrl+C)',
    '',
  ].join('\n');
}

export function formatCloudflaredExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  if (signal !== null) return `signal ${signal}`;
  if (code !== null) return `exit code ${code}`;
  return 'unknown status';
}