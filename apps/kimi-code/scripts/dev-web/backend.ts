/**
 * Child entry for the source-server half of the one-command dev session.
 *
 * Started by `scripts/dev-web/index.ts` with an IPC channel: it boots the same
 * in-process source server `kimi web` uses (loopback bind + bearer auth kept as
 * is) and reports the origin it actually bound — which may be a port above the
 * requested one when that port is taken — plus the persistent token. The parent
 * never parses logs or guesses a port.
 *
 * The server itself owns SIGINT/SIGTERM and exits the process, so the parent
 * only has to signal this child and wait.
 */

import {
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
  parseServerOptions,
  tryResolveServerToken,
} from '#/cli/sub/web/shared';
import { startServerForeground } from '#/cli/sub/web/run';
import { getDataDir } from '#/utils/paths';

interface ReadyReport {
  type: 'ready';
  origin: string;
  token: string | undefined;
}

interface ErrorReport {
  type: 'error';
  message: string;
}

function report(message: ReadyReport | ErrorReport): void {
  try {
    // The channel is gone once the parent exits; nothing left to report to.
    process.send?.(message);
  } catch {
    // Ignore: the parent is already gone.
  }
}

function fail(message: string): never {
  report({ type: 'error', message });
  process.exit(1);
}

const requestedPort = process.argv[2] ?? String(DEFAULT_SERVER_PORT);
const options = (() => {
  try {
    // Loopback is deliberate: the browser talks to the Vite dev server, which
    // proxies /api/v1 to this loopback origin over HTTP + WS. On WSL the NAT
    // address only ever belongs to the frontend, so the API stays private.
    return parseServerOptions({
      host: DEFAULT_SERVER_HOST,
      port: requestedPort,
      debugEndpoints: false,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
})();

void startServerForeground(options, {
  onReady: (origin) => {
    // Resolve the token only now: a first-ever boot writes it while starting up.
    report({ type: 'ready', origin, token: tryResolveServerToken(getDataDir()) });
  },
}).catch((error: unknown) => {
  fail(`the source server failed to start: ${error instanceof Error ? error.message : String(error)}`);
});
