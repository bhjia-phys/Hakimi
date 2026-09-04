/**
 * `hakimi remote` command group — the persistent all-sessions tunnel.
 *
 *   start  — install + start the systemd user unit and print the access link
 *   status — show service/unit state, current URL, QR, port, health
 *   stop   — disable the unit; the fixed token is kept for the next start
 *   serve  — (hidden) foreground runner the systemd unit executes
 *
 * The single-session TUI `/remote` takeover entry (`registerRemoteCommand`)
 * stays separate and unchanged — it is only invoked from the TUI, never from
 * this group.
 */

import type { Command } from 'commander';

import { VALID_LOG_LEVELS } from '#/cli/sub/web/shared';

import { runRemoteServe, type RemoteServeOptions } from './serve';
import {
  runRemoteStart,
  runRemoteStatus,
  runRemoteStop,
  type RemoteControlDeps,
  type RemoteStartCliOptions,
} from './control';

export interface RemoteGroupDeps extends RemoteControlDeps {}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/**
 * Register `remote start|status|stop` (user-facing) plus the hidden internal
 * `remote serve --config <path>` entry used by the systemd unit.
 */
export function registerRemoteCommands(program: Command): void {
  const remote = program
    .command('remote')
    .description(
      'Persistent remote control of all Hakimi sessions through a Cloudflare Quick Tunnel (systemd user service).',
    );

  remote
    .command('start')
    .description(
      'Start the persistent remote service and print the public URL and QR code.',
    )
    .option('--cloudflared <absolute-path>', 'Absolute path to the cloudflared executable.')
    .action(async (opts: RemoteStartCliOptions) => {
      try {
        await runRemoteStart(opts);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });

  remote
    .command('status')
    .description('Show the remote service status, current tunnel URL, and QR code.')
    .action(async () => {
      try {
        await runRemoteStatus();
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });

  remote
    .command('stop')
    .description('Stop the remote service; the fixed access token is kept for the next start.')
    .action(async () => {
      try {
        await runRemoteStop();
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });

  remote
    .command('serve', { hidden: true })
    .description(
      "Internal: run the persistent all-sessions remote server in the foreground. Used by the 'hakimi-remote.service' systemd user unit.",
    )
    .requiredOption('--config <path>', 'Absolute path to the remote config.json.')
    .option(
      '--log-level <level>',
      `Server log level: ${VALID_LOG_LEVELS.join('|')} (default info).`,
    )
    .action(async (opts: { config: string; logLevel?: string }) => {
      try {
        const options: RemoteServeOptions = {
          configPath: opts.config,
          // An invalid --log-level throws here — inside the try — so it is
          // caught like any other failure and reported via `fail()` instead
          // of escaping the commander action as an unhandled rejection.
          logLevel: parseServeLogLevel(opts.logLevel),
        };
        await runRemoteServe(options);
        // Signals were handled inside the runner; exit cleanly once the event
        // loop has nothing else to keep alive.
        process.exit(0);
      } catch (error) {
        // Non-zero exit lets systemd `Restart=on-failure` restart the combo.
        fail(error instanceof Error ? error.message : String(error));
      }
    });
}

export function parseServeLogLevel(raw: string | undefined): RemoteServeOptions['logLevel'] {
  if (raw === undefined) return 'info';
  if ((VALID_LOG_LEVELS as readonly string[]).includes(raw)) {
    return raw as RemoteServeOptions['logLevel'];
  }
  throw new Error(`error: invalid --log-level value: ${raw} (expected ${VALID_LOG_LEVELS.join('|')})`);
}