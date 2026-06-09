/**
 * `hakimi login` drives the Kimi-for-Coding OAuth device-code flow
 * non-interactively.
 *
 * The terminal-auth legacy ACP path points clients at this entry point. The
 * first-class ACP login path enters the same flow through `hakimi acp --login`.
 */

import type { Command } from 'commander';

import { runLoginFlow } from './login-flow';

export function registerLoginCommand(parent: Command): void {
  parent
    .command('login')
    .description('Authenticate Hakimi with Kimi for Coding via the device-code flow.')
    .action(async () => {
      await runLoginFlow();
    });
}