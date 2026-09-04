/**
 * `remote` command surface.
 *
 * Two registrations share the name:
 *
 *   - `registerRemoteCommands` — the persistent all-sessions group
 *     (`start | status | stop` + hidden `serve`), wired into `commands.ts`.
 *   - `registerRemoteCommand` — the hidden single-session takeover entry kept
 *     for the TUI `/remote` flow and for tests. NOTE: the TUI does NOT route
 *     through the commander registration — `tui/commands/remote.ts` calls the
 *     runner (`runRemoteControl`) directly after stopping the harness. This
 *     registration exists as the CLI-facing, testable encoding of that same
 *     command line; it is intentionally not mounted in the user-facing CLI,
 *     so a second process can never own the session the TUI is sharing.
 *
 * Both are exported so the TUI keeps importing `parseRemoteOptions` /
 * `runRemoteControl` from `#/cli/sub/remote/index` and the focused tests can
 * drive either surface.
 */

import type { Command } from 'commander';

import { DEFAULT_SERVER_PORT, VALID_LOG_LEVELS } from '#/cli/sub/web/shared';

import { DEFAULT_REMOTE_TTL, parseRemoteOptions, type RemoteCliOptions } from './options';
import { runRemoteControl, type RemoteRunnerDeps } from './run';

export * from './cloudflared';
export * from './control';
export * from './group';
export * from './options';
export * from './run';
export * from './serve';
export * from './store';
export * from './systemd';
export * from './tunnel';

export type RemoteCommandDeps = RemoteRunnerDeps;

export function registerRemoteCommand(program: Command): void {
  program
    // Hidden single-session takeover entry. The TUI `/remote` flow runs the
    // underlying runner directly; this registration keeps the exact command
    // line testable without exposing it in the user-facing CLI help.
    .command('remote', { hidden: true })
    .description('Temporarily share one session through a Cloudflare Quick Tunnel.')
    .requiredOption('--session <id>', 'Session ID to expose.')
    .option('--port <port>', `Local server port (default ${DEFAULT_SERVER_PORT}).`)
    .option('--ttl <duration>', `Lifetime such as 30m or 1h (default ${DEFAULT_REMOTE_TTL}).`)
    .option('--cloudflared <absolute-path>', 'Absolute path to the cloudflared executable.')
    .option('--log-level <level>', `Server log level: ${VALID_LOG_LEVELS.join('|')}.`)
    .action(async (opts: RemoteCliOptions) => {
      try {
        await handleRemoteCommand(opts);
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });
}

export async function handleRemoteCommand(
  opts: RemoteCliOptions,
  deps: RemoteCommandDeps = {},
): Promise<void> {
  await runRemoteControl(parseRemoteOptions(opts), deps);
}