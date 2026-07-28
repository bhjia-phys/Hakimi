import { formatErrorMessage } from '../utils/event-payload';
import { setExperimentalFeatures } from './experimental-flags';
import type { SlashCommandHost } from './dispatch';

/**
 * The AITP research-runtime flags, mirroring AITP_FLAG_IDS in
 * agent-core/src/flags/registry.ts (not exported over the SDK boundary).
 */
const AITP_FLAG_IDS = [
  'physics-memory',
  'research-ledger',
  'research-action',
  'domain-profile',
  'workflow-recipe',
  'research-harness',
] as const;

/**
 * `/aitp [on|off|status]` — master switch for the built-in AITP research
 * runtime. Persists `[aitp] enabled` in config.toml; `on`/`off` reload the
 * session so the flag change takes effect. With no argument (or `status`)
 * it shows the configured master state plus the effective per-flag states.
 */
export async function handleAitpCommand(host: SlashCommandHost, args: string): Promise<void> {
  const trimmed = args.trim().toLowerCase();

  if (trimmed === '' || trimmed === 'status') {
    await showAitpStatus(host);
    return;
  }

  if (trimmed !== 'on' && trimmed !== 'off') {
    host.showError('Usage: /aitp [on|off|status]');
    return;
  }

  const enabled = trimmed === 'on';
  try {
    await host.harness.setConfig({ aitp: { enabled } });
    setExperimentalFeatures(await host.harness.getExperimentalFeatures());
    host.refreshSlashCommandAutocomplete();
    if (host.session !== undefined) {
      await host.session.reloadSession();
      await host.reloadCurrentSessionView(
        host.session,
        `AITP research runtime ${enabled ? 'enabled' : 'disabled'}. Session reloaded.`,
      );
    } else {
      host.showStatus(
        `AITP research runtime ${enabled ? 'enabled' : 'disabled'}. Takes effect in new sessions.`,
        'success',
      );
    }
    host.track('aitp_master_switch', { enabled });
  } catch (error) {
    host.showError(`Failed to update AITP setting: ${formatErrorMessage(error)}`);
  }
}

async function showAitpStatus(host: SlashCommandHost): Promise<void> {
  try {
    const [config, features] = await Promise.all([
      host.harness.getConfig({ reload: true }),
      host.harness.getExperimentalFeatures(),
    ]);
    const master = config.aitp?.enabled !== false;
    const lines = features
      .filter((feature) => (AITP_FLAG_IDS as readonly string[]).includes(feature.id))
      .map(
        (feature) =>
          `  ${feature.enabled ? 'on ' : 'off'}  ${feature.id} (${feature.source})`,
      );
    host.showStatus(
      [
        `AITP research runtime: ${master ? 'on' : 'off'} (config [aitp] enabled)`,
        ...lines,
        'Toggle with /aitp on|off — reloads the session.',
      ].join('\n'),
    );
  } catch (error) {
    host.showError(`Failed to load AITP status: ${formatErrorMessage(error)}`);
  }
}
