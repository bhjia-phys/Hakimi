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
      'Deprecated compatibility option; has no effect.',
      false,
    )
    .option('--no-open', 'Print the device URL without opening a browser.')
    .action(
      async (options: {
        provider: string;
        enableExperimental?: boolean;
        open?: boolean;
      }) => {
        await runLoginFlow(options.provider, {
          openBrowser: options.open !== false,
        });
      },
    );
}
