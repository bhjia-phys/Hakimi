/**
 * Pure planning helpers for the one-command source Web dev session.
 *
 * Everything here is side-effect free: the rules that decide which origin the
 * Vite dev server proxies to, which inherited environment variables are dropped
 * so the session cannot attach itself to a stale instance, how the bearer token
 * reaches the browser, and which host the frontend binds are all unit-testable
 * without spawning a process.
 */

import { buildOpenableUrl } from '#/cli/sub/web/access-urls';

/** Canonical frontend (Vite) port, matching apps/kimi-web/vite.config.ts. */
export const DEV_WEB_DEFAULT_FRONTEND_PORT = 5175;
/** Canonical backend port, matching `kimi web`'s default. */
export const DEV_WEB_DEFAULT_BACKEND_PORT = 58627;
/** Host the frontend binds when no Windows-reachable WSL address is detected. */
export const DEV_WEB_LOOPBACK_HOST = '127.0.0.1';

/**
 * Inherited environment variables that must NOT survive into the Vite dev
 * server.
 *
 * Each of them can silently misroute the session at a *different* process or
 * port (`KIMI_SERVER_URL`, `VITE_KIMI_SERVER_HTTP_URL`, `KIMI_BACKEND_*`,
 * `WEB_PORT`, `WEB_PREVIEW_PORT`) or flip `vite.config.ts` into its
 * canonical/desktop build mode (`KIMI_WEB_*`). Everything here is deleted first
 * and then re-pinned by `buildFrontendEnv`, either to this session's actual
 * values or to a neutral one (`DEV_WEB_PINNED_ENV`).
 */
export const DEV_WEB_DROPPED_ENV: readonly string[] = [
  'KIMI_SERVER_URL',
  'VITE_KIMI_SERVER_HTTP_URL',
  'KIMI_BACKEND_DEFAULT_URL',
  'KIMI_BACKEND_MULTI_URL',
  'WEB_PORT',
  'WEB_PREVIEW_PORT',
  'KIMI_WEB_CANONICAL_BUILD',
  'KIMI_WEB_BUILD_OUT_DIR',
  'KIMI_WEB_DESKTOP',
];

/**
 * Keys from `DEV_WEB_DROPPED_ENV` that are re-pinned after the drop instead of
 * being left unset. The rest stay unset so `vite.config.ts` and Vite's own
 * defaults apply.
 */
export const DEV_WEB_PINNED_ENV: readonly string[] = [
  'KIMI_SERVER_URL',
  // The Sidebar's dev backend switcher offers `default` / `multi` presets
  // (vite.config.ts reads these at config load). Leaving them at their
  // hardcoded 58627/58628 fallbacks would let one click repoint the proxy at
  // whatever old instance happens to sit there, with no way back — so both
  // presets are pinned to this session's actual origin too.
  'KIMI_BACKEND_DEFAULT_URL',
  'KIMI_BACKEND_MULTI_URL',
  'WEB_PORT',
  // Explicitly empty beats an inherited value AND a stale apps/kimi-web/.env*
  // entry (process env wins over Vite's env files): the client keeps using the
  // same-origin proxy instead of switching itself to direct/CORS mode.
  'VITE_KIMI_SERVER_HTTP_URL',
  // `__KIMI_WEB_DESKTOP__` gates the desktop/"internal testing build" banner;
  // a source dev session is never that build.
  'KIMI_WEB_DESKTOP',
];

export interface FrontendEnvOptions {
  /** Origin the source server actually bound (`onReady`), e.g. `http://127.0.0.1:58628`. */
  backendOrigin: string;
  /** Frontend port Vite must listen on (`--port --strictPort`). */
  frontendPort: number;
}

/**
 * Build the Vite dev server's environment from a copy of the inherited one.
 * The caller's environment object is never mutated.
 */
export function buildFrontendEnv(
  base: NodeJS.ProcessEnv,
  options: FrontendEnvOptions,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of DEV_WEB_DROPPED_ENV) {
    delete env[key];
  }
  // The exact origin reported by the backend's ready hook — never the
  // requested port, which the server may have incremented past.
  env['KIMI_SERVER_URL'] = options.backendOrigin;
  env['KIMI_BACKEND_DEFAULT_URL'] = options.backendOrigin;
  env['KIMI_BACKEND_MULTI_URL'] = options.backendOrigin;
  env['WEB_PORT'] = String(options.frontendPort);
  env['VITE_KIMI_SERVER_HTTP_URL'] = '';
  env['KIMI_WEB_DESKTOP'] = '0';
  return env;
}

/**
 * Host the Vite dev server binds. A Windows browser cannot reach a WSL2
 * loopback listener, so a definitively detected NAT address is used there;
 * everywhere else stays on loopback. Never a wildcard — this is a dev server
 * with HMR, not a LAN service.
 */
export function resolveFrontendHost(wslNatHost: string | undefined): string {
  return wslNatHost !== undefined && wslNatHost.length > 0
    ? wslNatHost
    : DEV_WEB_LOOPBACK_HOST;
}

/**
 * Browser-facing dev URL. The bearer token rides only in the `#token=` fragment
 * (client-side, never sent to the server); without a token the bare origin is
 * returned.
 */
export function buildDevWebUrl(
  host: string,
  port: number,
  token: string | undefined,
): string {
  return buildOpenableUrl(`http://${host}:${port}`, token);
}

export interface DevWebCliOptions {
  /** Open the Web UI in the default browser once it is ready. */
  open: boolean;
  /** Preferred Vite port; the session walks upwards when it is taken. */
  frontendPort: number;
  /** Preferred backend port; the server takes the next free port when taken. */
  backendPort: number;
}

export interface ParsedDevWebArgs {
  help: boolean;
  options: DevWebCliOptions;
}

/**
 * Parse the dev entry's argv. `--no-open` and `--help` exist so automation can
 * run the session without a browser; anything unrecognised is an error rather
 * than being silently ignored.
 */
export function parseDevWebArgs(argv: readonly string[]): ParsedDevWebArgs {
  const options: DevWebCliOptions = {
    open: true,
    frontendPort: DEV_WEB_DEFAULT_FRONTEND_PORT,
    backendPort: DEV_WEB_DEFAULT_BACKEND_PORT,
  };
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--no-open':
        options.open = false;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      case '--port': {
        const raw = argv[index + 1];
        if (raw === undefined) throw new Error('error: --port requires a value');
        index += 1;
        options.frontendPort = parsePortArg(raw, '--port');
        break;
      }
      case '--backend-port': {
        const raw = argv[index + 1];
        if (raw === undefined) throw new Error('error: --backend-port requires a value');
        index += 1;
        options.backendPort = parsePortArg(raw, '--backend-port');
        break;
      }
      default:
        throw new Error(`error: unknown option: ${String(arg)}`);
    }
  }
  return { help, options };
}

/**
 * Strict port parser: `Number.parseInt` would happily accept `5175garbage` or
 * `1.5`, silently binding a port the user never asked for.
 */
function parsePortArg(raw: string, label: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`error: invalid ${label} value: ${raw}`);
  }
  const port = Number.parseInt(raw, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`error: invalid ${label} value: ${raw}`);
  }
  return port;
}
