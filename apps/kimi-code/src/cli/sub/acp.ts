/**
 * `hakimi acp` sub-command.
 *
 * Starts the Agent Client Protocol (ACP) server over stdio so ACP-compatible
 * clients can drive a Hakimi session. The `--login` flag enters the same
 * Kimi-for-Coding OAuth flow as `hakimi login` for terminal-auth clients.
 */

import type { Command } from 'commander';

import {
  ACP_BUILTIN_SLASH_COMMANDS,
  runAcpServer,
  type AvailableCommand,
  type SlashCommandsSnapshot,
} from '@moonshot-ai/acp-adapter';
import { createKimiHarness, type Session, type SkillSummary } from '@moonshot-ai/kimi-code-sdk';

import { KIMI_CODE_HOME_ENV } from '#/constant/app';
import { createKimiCodeHostIdentity, getVersion } from '#/cli/version';
import { buildSkillSlashCommands } from '#/tui/commands/skills';

import { runLoginFlow } from './login-flow';

export function registerAcpCommand(parent: Command): void {
  parent
    .command('acp')
    .description('Run Hakimi as an Agent Client Protocol (ACP) server over stdio.')
    .option(
      '--login',
      'Run the device-code login flow then exit (entry point for ACP terminal-auth).',
      false,
    )
    .action(async (opts: { login?: boolean }) => {
      if (opts.login === true) {
        await runLoginFlow();
        return;
      }
      const identity = createKimiCodeHostIdentity();
      const harness = createKimiHarness({
        identity,
        uiMode: 'acp',
      });
      // Forward `KIMI_CODE_HOME` (if set) into `authMethods[0].env` so the
      // `hakimi login` subprocess clients spawn for terminal-auth writes its
      // token under the same data root the ACP server reads from. Used for
      // sandboxed test setups (Zed's `agent_servers.*.env.KIMI_CODE_HOME =
      // /tmp/...`). Production runs leave the env unset and the field stays
      // empty.
      const sandboxHome = process.env[KIMI_CODE_HOME_ENV];
      const terminalAuthEnv =
        sandboxHome !== undefined && sandboxHome.length > 0
          ? { [KIMI_CODE_HOME_ENV]: sandboxHome }
          : undefined;
      // Legacy `_meta.terminal-auth` fallback for clients that do not yet
      // honor the first-class `type:'terminal'` auth method. `command` is
      // the absolute path to this binary (`process.argv[1]`) so the client
      // can spawn it with `args:['login']` for the top-level `hakimi login`.
      // Keep this legacy shape for ACP client compatibility.

      const legacyCommand = process.argv[1];
      const builtinCommands: AvailableCommand[] = (ACP_BUILTIN_SLASH_COMMANDS as readonly AvailableCommand[]).map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        input: cmd.input,
      }));
      // Skills are session-scoped (per-cwd config), so we defer the
      // listSkills() call until the adapter hands us the just-created
      // Session. A listSkills() failure degrades to builtins-only so a
      // broken skill source never blanks the palette.
      const resolveSlashCommands = async (
        session: Session,
      ): Promise<SlashCommandsSnapshot> => {
        let skills: readonly SkillSummary[] = [];
        try {
          skills = await session.listSkills();
        } catch {
          skills = [];
        }
        // `buildSkillSlashCommands` already returns both views: the palette
        // entries advertised via `available_commands_update`, and the
        // commandName-to-skillName map the adapter uses to intercept
        // `/skill:<name>` inputs and route them to `Session.activateSkill`.
        // Passing both through keeps the two surfaces in lockstep without a
        // second `listSkills()` round trip.
        const built = buildSkillSlashCommands(skills);
        const skillCommands = built.commands.map((cmd) => ({
          name: cmd.name,
          description: cmd.description,
        }));
        return {
          commands: [...builtinCommands, ...skillCommands],
          skillCommandMap: built.commandMap,
        };
      };
      try {
        await runAcpServer(harness, {
          agentInfo: { name: 'Hakimi', version: getVersion() },
          slashCommands: resolveSlashCommands,
          ...(terminalAuthEnv ? { terminalAuthEnv } : {}),
          ...(legacyCommand !== undefined && legacyCommand.length > 0
            ? { terminalAuthLegacyCommand: legacyCommand }
            : {}),
        });
        process.exit(0);
      } catch (err) {
        process.stderr.write(`acp server: fatal error: ${String(err)}\n`);
        process.exit(1);
      }
    });
}
