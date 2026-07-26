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
    .description('Authenticate Hakimi with Kimi for Coding or ChatGPT via a device-code flow.')
    .option(
      '-p, --provider <provider>',
      'Login provider: kimi-code (default) or openai-codex.',
      'kimi-code',
    )
    .option(
      '--enable-experimental',
      'Enable the experimental ChatGPT OAuth provider before login.',
      false,
    )
    .action(async (options: { provider: string; enableExperimental?: boolean }) => {
      await runLoginFlow(options.provider, {
        enableExperimental: options.enableExperimental === true,
      });
    });
}
