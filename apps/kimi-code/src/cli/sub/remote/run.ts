import type { ChildProcess } from 'node:child_process';

import {
  createServerLogger,
  startServer,
  type RunningServer,
  type ServerStartOptions,
} from '@moonshot-ai/kap-server';

import { resolveServerWebAssetsDir } from '#/cli/sub/web/run';
import { WEB_USER_AGENT_SUFFIX } from '#/constant/app';
import { getDataDir } from '#/utils/paths';

import {
  createKimiCodeHostIdentity,
  getVersion,
} from '../../version';
import {
  spawnCloudflared,
  terminateCloudflared,
  waitForTryCloudflareUrl,
} from './cloudflared';
import { renderTerminalQr } from './qr';
import {
  buildRemoteSessionUrl,
  createRemoteToken,
  createTemporaryAuthTokenService,
  type RemoteSignalSource,
} from './tunnel';
import { resolveCloudflaredPath, type ParsedRemoteOptions } from './options';

const REMOTE_HOST = '127.0.0.1';
const REMOTE_ALLOWED_HOSTS = ['.trycloudflare.com'] as const;

type RemoteSignal = 'SIGINT' | 'SIGTERM';
type RemoteStopReason =
  | { readonly kind: 'signal'; readonly signal: RemoteSignal }
  | { readonly kind: 'ttl' }
  | { readonly kind: 'cloudflared'; readonly code: number | null; readonly signal: NodeJS.Signals | null };

export interface RemoteRunnerDeps {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly startServer?: (options: ServerStartOptions) => Promise<RunningServer>;
  readonly spawnCloudflared?: (executable: string, actualPort: number) => ChildProcess;
  readonly waitForTunnelUrl?: (
    child: ChildProcess,
    options: { readonly signal: AbortSignal },
  ) => Promise<string>;
  readonly terminateCloudflared?: (child: ChildProcess) => Promise<void>;
  readonly resolveCloudflaredPath?: (explicitPath: string | undefined) => string;
  readonly generateToken?: () => string;
  readonly generateQrCode?: (url: string) => Promise<string>;
  readonly signalSource?: RemoteSignalSource;
  readonly stdout?: Pick<NodeJS.WriteStream, 'write'>;
}

export async function runRemoteControl(
  options: ParsedRemoteOptions,
  deps: RemoteRunnerDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;

  const resolveCloudflared =
    deps.resolveCloudflaredPath ?? ((path) => resolveCloudflaredPath(path, { env }));
  const cloudflaredPath = resolveCloudflared(options.cloudflaredPath);
  const token = (deps.generateToken ?? createRemoteToken)();
  const authTokenService = createTemporaryAuthTokenService(token);
  const signalSource = deps.signalSource ?? process;
  const stdout = deps.stdout ?? process.stdout;
  const start = deps.startServer ?? ((serverOptions) => startServer(serverOptions));
  const spawnTunnel = deps.spawnCloudflared ?? spawnCloudflared;
  const waitForTunnel = deps.waitForTunnelUrl ?? waitForTryCloudflareUrl;
  const terminateTunnel = deps.terminateCloudflared ?? terminateCloudflared;
  const generateQrCode = deps.generateQrCode ?? renderTerminalQr;

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
  const ttlTimer = setTimeout(() => {
    requestStop({ kind: 'ttl' });
  }, options.ttlMs);

  const cleanup = (): Promise<void> => {
    cleanupPromise ??= (async () => {
      try {
        if (tunnel !== undefined) await terminateTunnel(tunnel);
      } finally {
        await server?.close();
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
      homeDir: getDataDir(),
      host: REMOTE_HOST,
      port: options.port,
      serverVersion: version,
      hostIdentity: {
        ...createKimiCodeHostIdentity(version),
        userAgentSuffix: WEB_USER_AGENT_SUFFIX,
      },
      logLevel: options.logLevel,
      logger,
      // The listener itself binds loopback, but a cloudflared Quick Tunnel
      // carries it to the public: `bindClass: 'public'` keeps the full public
      // hardening profile (security headers, auth-failure limiter, tunnel Host
      // admission via `allowedHosts`, shutdown/terminals/debug disabled).
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

    tunnel = spawnTunnel(cloudflaredPath, server.port);
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
    const remoteUrl = buildRemoteSessionUrl(startup.url, options.sessionId, token);
    const qr = await generateQrCode(remoteUrl);
    stdout.write(formatRemoteBanner(remoteUrl, options.ttlMs, qr));

    const reason = await stopped;
    if (reason.kind === 'cloudflared') {
      throw new Error(
        `cloudflared tunnel closed unexpectedly (${formatCloudflaredExit(reason.code, reason.signal)})`,
      );
    }
  } finally {
    clearTimeout(ttlTimer);
    if (tunnel !== undefined && onTunnelClose !== undefined) {
      tunnel.off('close', onTunnelClose);
    }
    // Keep the signal listeners attached THROUGH the teardown: once the last
    // listener for a signal is removed, Node restores the default behavior
    // (and bundled signal-exit re-raises) and a second Ctrl+C would kill the
    // process mid-cleanup. Only detach after cleanup() finished.
    await cleanup();
    signalSource.off('SIGINT', onSigint);
    signalSource.off('SIGTERM', onSigterm);
  }
}

export function formatRemoteBanner(remoteUrl: string, ttlMs: number, qr: string): string {
  return [
    '',
    '  Hakimi remote control ready',
    '',
    qr.trimEnd(),
    '',
    '  Copy URL:',
    `  ${remoteUrl}`,
    '',
    `  TTL:   ${formatDuration(ttlMs)} (closes automatically)`,
    '  Risk:  Anyone with this URL gets full access to every session — plus files, settings, and tools. Keep it private.',
    '  Stop:  Ctrl+C',
    '',
  ].join('\n');
}

function formatDuration(durationMs: number): string {
  const units = [
    ['d', 24 * 60 * 60 * 1_000],
    ['h', 60 * 60 * 1_000],
    ['m', 60 * 1_000],
    ['s', 1_000],
  ] as const;
  for (const [suffix, unitMs] of units) {
    if (durationMs % unitMs === 0) return `${durationMs / unitMs}${suffix}`;
  }
  return `${durationMs}ms`;
}

function formatCloudflaredExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal !== null) return `signal ${signal}`;
  if (code !== null) return `exit code ${code}`;
  return 'unknown status';
}
