import {
  activeSubagentPreset,
  describeSubagentModelOverride,
} from '@moonshot-ai/kimi-code-sdk';

import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

/**
 * `/preset [<name>|off|status]` — switch the active subagent model preset
 * (`[subagent] preset` in config.toml). A preset bundles per-subagent-type
 * model/thinking-effort overrides from `[subagent.presets.<name>]`, taking
 * precedence over `[subagent.agents]`; switching reloads the session so new
 * subagents pick it up. With no argument (or `status`) it shows the active
 * preset and the effective per-type overrides.
 */
export async function handlePresetCommand(host: SlashCommandHost, args: string): Promise<void> {
  const trimmed = args.trim();

  if (trimmed === '' || trimmed.toLowerCase() === 'status') {
    await showPresetStatus(host);
    return;
  }

  if (trimmed.toLowerCase() === 'off') {
    await switchPreset(host, undefined);
    return;
  }

  let available: readonly string[];
  try {
    const config = await host.harness.getConfig({ reload: true });
    available = Object.keys(config.subagent?.presets ?? {});
  } catch (error) {
    host.showError(`Failed to load config: ${formatErrorMessage(error)}`);
    return;
  }

  if (!available.includes(trimmed)) {
    host.showError(
      available.length === 0
        ? `No subagent presets are defined in config.toml ([subagent.presets.${trimmed}] not found).`
        : `Unknown preset "${trimmed}". Available: ${available.join(', ')}.`,
    );
    return;
  }

  await switchPreset(host, trimmed);
}

async function switchPreset(host: SlashCommandHost, name: string | undefined): Promise<void> {
  try {
    // An empty string clears the active preset (blank is treated as unset).
    await host.harness.setConfig({ subagent: { preset: name ?? '' } });
    const message =
      name === undefined
        ? 'Subagent preset cleared; subagents use [subagent.agents] / the parent model.'
        : `Subagent preset "${name}" activated.`;
    if (host.session !== undefined) {
      await host.session.reloadSession();
      await host.reloadCurrentSessionView(host.session, `${message} Session reloaded.`);
    } else {
      host.showStatus(`${message} Takes effect in new sessions.`, 'success');
    }
    host.track('subagent_preset_switch', { preset: name ?? 'off' });
  } catch (error) {
    host.showError(`Failed to switch subagent preset: ${formatErrorMessage(error)}`);
  }
}

async function showPresetStatus(host: SlashCommandHost): Promise<void> {
  try {
    const config = await host.harness.getConfig({ reload: true });
    const subagent = config.subagent;
    const active = activeSubagentPreset(subagent);
    const presetNames = Object.keys(subagent?.presets ?? {});
    const profileNames = collectProfileNames(subagent?.agents, subagent?.presets);

    const lines: string[] = [
      active === undefined
        ? 'Active subagent preset: none (using [subagent.agents] / parent model)'
        : `Active subagent preset: ${active}`,
      presetNames.length === 0
        ? 'Defined presets: none'
        : `Defined presets: ${presetNames.map((name) => (name === active ? `${name} *` : name)).join(', ')}`,
    ];

    if (profileNames.length === 0) {
      lines.push('No subagent model overrides configured — subagents inherit the parent model.');
    } else {
      lines.push('Effective overrides (preset > [subagent.agents] > parent):');
      for (const profileName of profileNames) {
        const effective = describeSubagentModelOverride(subagent, profileName);
        const parts: string[] = [];
        if (effective?.model !== undefined) {
          const known = config.models?.[effective.model] !== undefined;
          parts.push(`model=${effective.model}${known ? '' : ' (not in [models]!)'}`);
        }
        if (effective?.thinkingEffort !== undefined) {
          parts.push(`effort=${effective.thinkingEffort}`);
        }
        lines.push(`  ${profileName}: ${parts.length > 0 ? parts.join('  ') : 'inherits parent'}`);
      }
    }
    lines.push('Switch with /preset <name> — reloads the session.');
    host.showStatus(lines.join('\n'));
  } catch (error) {
    host.showError(`Failed to load preset status: ${formatErrorMessage(error)}`);
  }
}

type OverrideRecord = Record<string, unknown> | undefined;

function collectProfileNames(
  agents: OverrideRecord,
  presets: Record<string, Record<string, unknown>> | undefined,
): string[] {
  const names = new Set<string>(Object.keys(agents ?? {}));
  for (const preset of Object.values(presets ?? {})) {
    for (const name of Object.keys(preset)) names.add(name);
  }
  return [...names].sort();
}
