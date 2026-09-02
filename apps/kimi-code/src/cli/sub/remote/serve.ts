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
 *     time) once the tunnel is up, then idles forever — no TTL timer;
 *   - on SIGINT/SIGTERM tears down in order cloudflared → server → state
 *     (state removal is PID-guarded so a stale process can never delete a
 *     newer process's state) and exits 0;
 *   - on an unexpected cloudflared exit cleans up the same way and exits
 *     non-zero, so systemd (`Restart=on-failure`) restarts the whole combo and
 *     a fresh random origin lands in state.json.
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
  spawnCloudflared,
  terminateCloudflared,
  validateTryCloudflareUrl,
  waitForTryCloudflareUrl,
} from './cloudflared';
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

type RemoteSignal = 'SIGINT' | 'SIGTERM';
type RemoteStopReason =
  | { readonly kind: 'signal'; readonly signal: RemoteSignal }
  | {
      readonly kind: 'cloudflared';
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
    };

export interface RemoteServeOptions {
  readonly configPath: string;
  readonly logLevel: ServerLogLevel;
}

export interface RemoteServeDeps {
  readonly pid?: number;
  readonly startServer?: (options: ServerStartOptions) => Promise<RunningServer>;
  readonly spawnCloudflared?: (executable: string, actualPort: number) => ChildProcess;
  readonly waitForTunnelUrl?: (
    child: ChildProcess,
    options: { readonly signal: AbortSignal },
  ) => Promise<string>;
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
  const terminateTunnel = deps.terminateCloudflared ?? terminateCloudflared;
  const generateQrCode = deps.generateQrCode ?? renderTerminalQr;

  const config = readConfig(options.configPath);
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

  let onTunnelClose:
    | ((code: number | null, signal: NodeJS.Signals | null) => void)
    | undefined;

  try {
    const version = getVersion();
    const logger = createServerLogger({ level: options.logLevel });
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

    tunnel = spawnTunnel(config.cloudflaredPath, server.port);
    const startupAbort = new AbortController();
    const tunnelUrlPromise = waitForTunnel(tunnel, { signal: startupAbort.signal });
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

    tunnel.stdout?.resume();
    tunnel.stderr?.resume();

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
    });

    const remoteUrl = buildRemoteRootUrl(origin, config.token);
    const qr = await generateQrCode(remoteUrl);
    stdout.write(formatServeBanner(remoteUrl, origin, server.port, qr));

    const reason = await stopped;
    if (reason.kind === 'cloudflared') {
      throw new Error(
        `cloudflared tunnel closed unexpectedly (${formatCloudflaredExit(reason.code, reason.signal)})`,
      );
    }
  } finally {
    if (tunnel !== undefined && onTunnelClose !== undefined) {
      tunnel.off('close', onTunnelClose);
    }
    // Keep the signal listeners attached THROUGH the teardown: once the last
    // listener for a signal is removed, Node restores the default behavior
    // (and bundled signal-exit re-raises) and a second SIGINT/SIGTERM would
    // kill the process mid-cleanup, leaving state.json and the tunnel behind.
    // Only detach after cleanup() finished.
    await cleanup();
    signalSource.off('SIGINT', onSigint);
    signalSource.off('SIGTERM', onSigterm);
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