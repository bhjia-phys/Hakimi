/**
 * Entry point for the one-command source Web dev session.
 *
 * Started by the repo root `dev` wrapper (`pnpm dev` / `./dev`) through Node's
 * in-process tsx loader, so it can reuse the app's own source modules: the
 * backend keeps `kimi web`'s loopback + bearer defaults, and the Vite dev
 * server for apps/kimi-web is spawned with the exact origin the backend
 * reported. The lifecycle rules live in ./orchestrator.ts, the child plumbing in
 * ./spawn.ts, and the launcher arguments in ./launch-args.mjs.
 *
 * Static checking: `scripts/dev-web` is part of apps/kimi-code/tsconfig.json's
 * `include`, so `pnpm -C apps/kimi-code run typecheck` covers this file. The repo's
 * oxlint config deliberately ignores `apps/*\/scripts/` (.oxlintrc.json
 * `ignorePatterns`), so these files are typechecked but not linted — the same
 * deal as the app's other dev scripts.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveWslNatHost } from '#/cli/sub/web/wsl-network';
import { openUrl as openInBrowser } from '#/utils/open-url';

import { parseDevWebArgs } from './config';
import { tsxChildEnv, tsxNodeArgs } from './launch-args.mjs';
import {
  startDevWeb,
  type BackendLaunch,
  type DevWebDeps,
  type FrontendLaunchOptions,
  type ManagedProcess,
} from './orchestrator';
import { toManagedProcess, waitForBackendReady } from './spawn';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const WEB_ROOT = resolve(REPO_ROOT, 'apps/kimi-web');
// apps/kimi-web's own resolution so the dev server is the Vite this workspace
// actually builds the web UI with, not another vite that happens to be hoisted.
const requireWeb = createRequire(join(WEB_ROOT, 'package.json'));

/**
 * Ceilings, not waits: each half returns as soon as it is up. A cold Vite start
 * (dependency pre-bundling) is the slow one.
 */
const BACKEND_READY_TIMEOUT_MS = 60_000;
const FRONTEND_READY_TIMEOUT_MS = 90_000;
const FRONTEND_POLL_INTERVAL_MS = 250;
const FRONTEND_PORT_SCAN_LIMIT = 50;

const HELP = `Usage: pnpm dev [options]        (also: ./dev at the repo root, or ./Hakimi/dev from its parent)

Starts this repository's source server plus the Vite dev server for
apps/kimi-web against it, then opens the Web UI. Both run from source:
frontend edits hot-reload; server-side edits need a restart.

Options:
  --port <port>          Preferred frontend (Vite) port. Default 5175; the next
                         free port is used when it is taken.
  --backend-port <port>  Preferred backend port. Default 58627; the server takes
                         the next free port when it is taken.
  --no-open              Do not open a browser (for automation).
  -h, --help             Show this help.

Stop with Ctrl+C. Only the two processes this command started are stopped.
`;

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseDevWebArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(HELP);
    process.exit(1);
    return;
  }
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  const session = startDevWeb(parsed.options, realDeps());
  await session.done;
}

function realDeps(): DevWebDeps {
  return {
    startBackend: startSourceBackend,
    startFrontend: startViteFrontend,
    waitForFrontend,
    pickFrontendPort,
    resolveFrontendHost: () => resolveWslNatHost(),
    openUrl: (url) => {
      openInBrowser(url);
    },
    registerSignal: (signal, handler) => {
      process.on(signal, handler);
    },
    exit: (code) => {
      process.exit(code);
    },
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
  };
}

function startSourceBackend(options: { port: number }): BackendLaunch {
  const child = spawn(
    process.execPath,
    tsxNodeArgs(resolve(SCRIPT_DIR, 'backend.ts'), [String(options.port)]),
    {
      cwd: REPO_ROOT,
      // Dev mode tolerates a missing dist-web: the UI comes from Vite instead.
      env: tsxChildEnv(process.env, { KIMI_CODE_DEV_SERVER: '1' }),
      // fd 3 is the ready/error report — no log scraping, no port guessing.
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    },
  );
  return {
    process: toManagedProcess(child),
    ready: waitForBackendReady(child, BACKEND_READY_TIMEOUT_MS),
  };
}

function startViteFrontend(options: FrontendLaunchOptions): ManagedProcess {
  const vitePackage = requireWeb.resolve('vite/package.json');
  const child = spawn(
    process.execPath,
    [
      join(dirname(vitePackage), 'bin', 'vite.js'),
      '--port',
      String(options.port),
      // The port was probed free, so fail loudly instead of drifting to another
      // one — the announced URL must be the one actually served.
      '--strictPort',
      '--host',
      options.host,
      // Keep the dev URL banner on screen when Vite restarts for a config change.
      '--clearScreen',
      'false',
    ],
    {
      cwd: WEB_ROOT,
      // Isolated env holding the actual backend origin (see buildFrontendEnv).
      env: options.env,
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
  return toManagedProcess(child);
}

async function pickFrontendPort(host: string, preferred: number): Promise<number> {
  const limit = Math.min(preferred + FRONTEND_PORT_SCAN_LIMIT, 65_535);
  for (let port = preferred; port <= limit; port += 1) {
    if (await isPortFree(host, port)) return port;
  }
  throw new Error(`no free frontend port at or above ${preferred} on ${host}`);
}

function isPortFree(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const probe = createServer();
    probe.once('error', () => {
      resolve(false);
    });
    probe.once('listening', () => {
      probe.close(() => {
        resolve(true);
      });
    });
    probe.listen({ host, port, exclusive: true });
  });
}

async function waitForFrontend(origin: string): Promise<void> {
  const deadline = Date.now() + FRONTEND_READY_TIMEOUT_MS;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin);
      await response.body?.cancel();
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(FRONTEND_POLL_INTERVAL_MS);
  }
  throw new Error(`the Vite dev server did not become ready at ${origin} (${lastError})`);
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

await main();
