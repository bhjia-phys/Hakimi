import {
  activeSubagentPreset,
  describeSubagentModelOverride,
  SUBAGENT_PRESET_MAIN_PROFILE,
  SUBAGENT_PRESET_SWARM_PROFILE,
  SUBAGENT_PRESET_TOWER_WORKER_ROUTE,
  SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE,
  type KimiConfig,
  type KimiConfigPatch,
  type ThinkingEffort,
} from '@moonshot-ai/kimi-code-sdk';

import {
  ChoicePickerComponent,
  type ChoiceOption,
} from '../components/dialogs/choice-picker';
import { modelDisplayName } from '../components/dialogs/model-selector';
import {
  PresetNameInputDialogComponent,
  type PresetNameInputResult,
} from '../components/dialogs/preset-name-input-dialog';
import { TabbedModelSelectorComponent } from '../components/dialogs/tabbed-model-selector';
import { formatErrorMessage } from '../utils/event-payload';
import {
  pickerModelsForHost,
  refreshModelsForPicker,
} from './config';
import type { SlashCommandHost } from './dispatch';

const APPLY_PRESET = '__apply_preset__';
const CLEAR_PRESET = '__clear_preset__';
const CREATE_PRESET = '__create_preset__';
const BUILTIN_SUBAGENT_PROFILES = ['explore', 'plan', 'coder'] as const;

/**
 * `/preset` opens the visual preset manager. `/preset <name>` and
 * `/preset off|status` retain their original non-interactive behavior, while
 * `/preset edit <name>` opens an existing or new preset directly.
 */
export async function handlePresetCommand(host: SlashCommandHost, args: string): Promise<void> {
  const trimmed = args.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'status') {
    await showPresetStatus(host);
    return;
  }
  if (lower === 'off') {
    await switchPreset(host, undefined);
    return;
  }
  if (trimmed === '') {
    await showPresetPicker(host);
    return;
  }

  const editMatch = trimmed.match(/^edit\s+(.+)$/i);
  if (editMatch !== null) {
    const name = editMatch[1]?.trim();
    if (name === undefined || name.length === 0) {
      host.showError('Usage: /preset edit <name>');
      return;
    }
    await showPresetEditor(host, name);
    return;
  }

  const config = await loadConfig(host, 'Failed to load config');
  if (config === undefined) return;
  const available = Object.keys(config.subagent?.presets ?? {});
  if (!available.includes(trimmed)) {
    host.showError(
      available.length === 0
        ? `No subagent presets are defined. Create one with /preset edit ${trimmed}.`
        : `Unknown preset "${trimmed}". Available: ${available.join(', ')}.`,
    );
    return;
  }
  await switchPreset(host, trimmed, config);
}

async function showPresetPicker(host: SlashCommandHost): Promise<void> {
  const config = await loadConfig(host, 'Failed to load presets');
  if (config === undefined) return;
  const active = activeSubagentPreset(config.subagent);
  const names = Object.keys(config.subagent?.presets ?? {}).toSorted();
  const options: ChoiceOption[] = names.map((name) => ({
    value: name,
    label: name,
    description: presetSummary(config, name),
  }));
  options.push({
    value: CREATE_PRESET,
    label: 'Create new preset',
    description: 'Configure model routes for Main, subagents, and Swarm.',
  });
  if (active !== undefined) {
    options.push({
      value: CLEAR_PRESET,
      label: 'Clear active preset',
      description: 'Return subagents to base routing and keep the current main model.',
      tone: 'danger',
    });
  }

  host.mountEditorReplacement(
    new ChoicePickerComponent({
      title: 'Manage agent preset',
      hint: '↑↓ navigate · Enter select · Esc cancel',
      notice: names.length === 0
        ? 'No presets configured. Subagents currently use base routing / the parent model.'
        : undefined,
      noticeTone: 'warning',
      options,
      currentValue: active,
      searchable: names.length > 6,
      onSelect: (value) => {
        host.restoreEditor();
        if (value === CREATE_PRESET) {
          showPresetNameInput(host, names, config);
          return;
        }
        if (value === CLEAR_PRESET) {
          void switchPreset(host, undefined, config);
          return;
        }
        void showPresetEditor(host, value, config);
      },
      onCancel: () => {
        host.restoreEditor();
      },
    }),
  );
}

function showPresetNameInput(
  host: SlashCommandHost,
  existingNames: readonly string[],
  config: KimiConfig,
): void {
  host.mountEditorReplacement(
    new PresetNameInputDialogComponent(
      existingNames,
      (result: PresetNameInputResult) => {
        host.restoreEditor();
        if (result.kind === 'cancel') {
          void showPresetPicker(host);
          return;
        }
        void showPresetEditor(host, result.value, config);
      },
    ),
  );
}

async function showPresetEditor(
  host: SlashCommandHost,
  name: string,
  loadedConfig?: KimiConfig,
): Promise<void> {
  const config = loadedConfig ?? await loadConfig(host, 'Failed to load preset');
  if (config === undefined) return;
  const active = activeSubagentPreset(config.subagent);
  const profileNames = collectProfileNames(config.subagent?.agents, config.subagent?.presets)
    .filter(
      (profileName) =>
        profileName !== SUBAGENT_PRESET_MAIN_PROFILE &&
        profileName !== SUBAGENT_PRESET_SWARM_PROFILE &&
        profileName !== SUBAGENT_PRESET_TOWER_WORKER_ROUTE &&
        profileName !== SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE,
    );
  for (const profileName of BUILTIN_SUBAGENT_PROFILES) {
    if (!profileNames.includes(profileName)) profileNames.push(profileName);
  }
  profileNames.sort((left, right) => {
    const leftIndex = BUILTIN_SUBAGENT_PROFILES.indexOf(left as never);
    const rightIndex = BUILTIN_SUBAGENT_PROFILES.indexOf(right as never);
    if (leftIndex >= 0 || rightIndex >= 0) {
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    }
    return left.localeCompare(right);
  });

  const options: ChoiceOption[] = [
    {
      value: APPLY_PRESET,
      label: active === name ? 'Reapply preset' : 'Activate preset',
      description: 'Apply Main to this session and enable Agent, Swarm, and Tower routing.',
    },
    routeOption(config, name, SUBAGENT_PRESET_MAIN_PROFILE, 'Main agent'),
    ...profileNames.map((profileName) =>
      routeOption(config, name, profileName, `${capitalize(profileName)} subagent`),
    ),
    routeOption(config, name, SUBAGENT_PRESET_SWARM_PROFILE, 'Swarm default'),
    routeOption(config, name, SUBAGENT_PRESET_TOWER_WORKER_ROUTE, 'Tower worker'),
    routeOption(config, name, SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE, 'Tower reviewer'),
  ];

  host.mountEditorReplacement(
    new ChoicePickerComponent({
      title: `Preset: ${name}`,
      hint: '↑↓ navigate · Enter select · Esc back',
      notice: active === name ? 'Active preset' : 'Changes are saved now; activate to apply them.',
      noticeTone: active === name ? 'success' : 'warning',
      options,
      onSelect: (value) => {
        host.restoreEditor();
        if (value === APPLY_PRESET) {
          void switchPreset(host, name);
          return;
        }
        void showPresetModelPicker(host, name, value);
      },
      onCancel: () => {
        host.restoreEditor();
        void showPresetPicker(host);
      },
    }),
  );
}

async function showPresetModelPicker(
  host: SlashCommandHost,
  presetName: string,
  profileName: string,
): Promise<void> {
  await refreshModelsForPicker(host);
  const models = pickerModelsForHost(host);
  if (Object.keys(models).length === 0) {
    host.showNotice(
      'No models configured',
      'Run /login to sign in, or /provider to add another provider from a model catalog.',
    );
    return;
  }
  const config = await loadConfig(host, 'Failed to load preset route');
  if (config === undefined) return;
  const configured = config.subagent?.presets?.[presetName]?.[profileName];
  const fallback = routeFallback(host, config, profileName);
  const selectedValue = configured?.model ?? fallback.model;
  const currentThinkingEffort = configured?.thinkingEffort ?? fallback.thinkingEffort;

  host.mountEditorReplacement(
    new TabbedModelSelectorComponent({
      models,
      currentValue: selectedValue,
      selectedValue,
      currentThinkingEffort,
      title: ` Select model for ${routeLabel(profileName)} · preset ${presetName}`,
      onSelect: ({ alias, thinking }) => {
        host.restoreEditor();
        void savePresetRoute(host, presetName, profileName, alias, thinking);
      },
      onCancel: () => {
        host.restoreEditor();
        void showPresetEditor(host, presetName);
      },
    }),
  );
}

async function savePresetRoute(
  host: SlashCommandHost,
  presetName: string,
  profileName: string,
  model: string,
  thinkingEffort: ThinkingEffort,
): Promise<void> {
  try {
    await host.harness.setConfig({
      subagent: {
        presets: {
          [presetName]: {
            [profileName]: { model, thinkingEffort },
          },
        },
      },
    });
    const display = modelDisplayName(model, host.state.appState.availableModels[model]);
    host.showStatus(
      `Saved ${presetName} · ${routeLabel(profileName)}: ${display}, thinking ${thinkingEffort}.`,
      'success',
    );
    host.track('subagent_preset_route_save', {
      preset: presetName,
      route: profileName,
      model,
      effort: thinkingEffort,
    });
    await showPresetEditor(host, presetName);
  } catch (error) {
    host.showError(`Failed to save preset route: ${formatErrorMessage(error)}`);
  }
}

async function switchPreset(
  host: SlashCommandHost,
  name: string | undefined,
  loadedConfig?: KimiConfig,
): Promise<void> {
  try {
    const config = loadedConfig ?? await host.harness.getConfig({ reload: true });
    const main = name === undefined
      ? undefined
      : config.subagent?.presets?.[name]?.[SUBAGENT_PRESET_MAIN_PROFILE];
    if (main?.model !== undefined && config.models?.[main.model] === undefined) {
      host.showError(
        `Cannot activate preset "${name}": Main model alias "${main.model}" is not configured.`,
      );
      return;
    }

    const patch: KimiConfigPatch = { subagent: { preset: name ?? '' } };
    if (main?.model !== undefined) patch.defaultModel = main.model;
    if (main?.thinkingEffort !== undefined) {
      patch.thinking = thinkingConfigForPreset(main.thinkingEffort);
    }
    await host.harness.setConfig(patch);

    const message = name === undefined
      ? 'Agent preset cleared; subagents use base routing / the parent model.'
      : `Agent preset "${name}" activated.`;
    if (host.session !== undefined) {
      if (main?.model !== undefined && main.model !== host.state.appState.model) {
        await host.session.setModel(main.model);
      }
      if (
        main?.thinkingEffort !== undefined &&
        main.thinkingEffort !== host.state.appState.thinkingEffort
      ) {
        await host.session.setThinking(main.thinkingEffort);
      }
      await host.session.reloadSession();
      await host.reloadCurrentSessionView(host.session, `${message} Session reloaded.`);
    } else if (main?.model !== undefined) {
      await host.authFlow.activateModelAfterLogin(main.model, main.thinkingEffort);
      host.showStatus(`${message} Main model applied.`, 'success');
    } else {
      host.showStatus(`${message} Takes effect in new sessions.`, 'success');
    }
    host.track('subagent_preset_switch', { preset: name ?? 'off' });
  } catch (error) {
    host.showError(`Failed to switch agent preset: ${formatErrorMessage(error)}`);
  }
}

async function showPresetStatus(host: SlashCommandHost): Promise<void> {
  const config = await loadConfig(host, 'Failed to load preset status');
  if (config === undefined) return;
  const subagent = config.subagent;
  const active = activeSubagentPreset(subagent);
  const presetNames = Object.keys(subagent?.presets ?? {});
  const profileNames = (active === undefined
    ? Object.keys(subagent?.agents ?? {})
    : collectProfileNames(subagent?.agents, subagent?.presets)
  ).filter(
    (name) =>
      name !== SUBAGENT_PRESET_MAIN_PROFILE &&
      name !== SUBAGENT_PRESET_SWARM_PROFILE &&
      name !== SUBAGENT_PRESET_TOWER_WORKER_ROUTE &&
      name !== SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE,
  );

  const main = mainRouteForStatus(host, config, active);
  const swarm = describeSubagentModelOverride(subagent, '', 'swarm');
  const towerWorker = describeSubagentModelOverride(
    subagent,
    '',
    SUBAGENT_PRESET_TOWER_WORKER_ROUTE,
  );
  const towerReviewer = describeSubagentModelOverride(
    subagent,
    '',
    SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE,
  );
  const legacyModel = active === undefined
    ? config.secondaryModel?.defaultModel ?? config.secondaryModel?.model
    : undefined;
  const hasCanonicalOverride =
    profileNames.length > 0 ||
    swarm !== undefined ||
    towerWorker !== undefined ||
    towerReviewer !== undefined;
  const noActiveCanonical = active === undefined && !hasCanonicalOverride;
  const legacyAwareFallback =
    active === undefined && legacyModel !== undefined
      ? 'legacy compatibility may apply; otherwise inherits parent'
      : 'inherits parent';

  const lines: string[] = [
    active === undefined
      ? 'Active agent preset: none (using base routing / parent model)'
      : `Active agent preset: ${active}`,
    presetNames.length === 0
      ? 'Defined presets: none'
      : `Defined presets: ${presetNames.map((name) => (name === active ? `${name} *` : name)).join(', ')}`,
  ];
  lines.push(`  main: ${formatRoute(main, config, 'keeps current/default model')}`);

  if (noActiveCanonical) {
    lines.push(
      legacyModel === undefined
        ? 'No canonical subagent model routes configured — subagents and Tower workers use the parent model.'
        : 'No canonical subagent model routes configured — legacy compatibility may apply to eligible subagents and Tower workers; otherwise they use the parent model.',
    );
  } else if (!hasCanonicalOverride) {
    lines.push('No canonical subagent model routes configured — subagents inherit the parent model.');
  } else {
    lines.push('Effective Agent routes (preset > [subagent.agents] > parent):');
    for (const profileName of profileNames.toSorted()) {
      const effective = describeSubagentModelOverride(subagent, profileName);
      lines.push(`  ${profileName}: ${formatRoute(effective, config, legacyAwareFallback)}`);
    }
  }
  if (!noActiveCanonical) {
    lines.push(
      `  swarm: ${formatRoute(
        swarm,
        config,
        active === undefined && legacyModel !== undefined
          ? 'legacy compatibility may apply; otherwise follows the task profile or parent'
          : 'inherits the selected task profile route',
      )}`,
    );
    lines.push(`  tower_worker: ${formatRoute(towerWorker, config, legacyAwareFallback)}`);
    lines.push(`  tower_reviewer: ${formatRoute(towerReviewer, config, 'inherits parent')}`);
  }
  if (legacyModel !== undefined && !noActiveCanonical) {
    lines.push(
      `  legacy compatibility fallback: model=${legacyModel} (configured compatibility fallback; may apply when the secondary-model flag and profile permit)`,
    );
  }
  lines.push('Open /preset to configure, or switch directly with /preset <name>.');
  host.showStatus(lines.join('\n'));
}

async function loadConfig(
  host: SlashCommandHost,
  failureLabel: string,
): Promise<KimiConfig | undefined> {
  try {
    return await host.harness.getConfig({ reload: true });
  } catch (error) {
    host.showError(`${failureLabel}: ${formatErrorMessage(error)}`);
    return undefined;
  }
}

function routeOption(
  config: KimiConfig,
  presetName: string,
  profileName: string,
  label: string,
): ChoiceOption {
  const configured = config.subagent?.presets?.[presetName]?.[profileName];
  return {
    value: profileName,
    label,
    description: configured === undefined
      ? routeInheritanceDescription(profileName)
      : formatRoute(configured, config, routeInheritanceDescription(profileName)),
  };
}

function mainRouteFallback(
  host: SlashCommandHost,
  config: KimiConfig,
): { model: string; thinkingEffort: string } {
  return {
    model: host.state.appState.model || config.defaultModel || '',
    thinkingEffort: host.state.appState.thinkingEffort,
  };
}

function mainRouteForStatus(
  host: SlashCommandHost,
  config: KimiConfig,
  activePreset: string | undefined,
): { model?: string; thinkingEffort?: string } {
  const configured = activePreset === undefined
    ? undefined
    : config.subagent?.presets?.[activePreset]?.[SUBAGENT_PRESET_MAIN_PROFILE];
  const fallback = mainRouteFallback(host, config);
  return {
    model: configured?.model ?? (fallback.model || undefined),
    thinkingEffort: configured?.thinkingEffort ?? fallback.thinkingEffort,
  };
}

function routeFallback(
  host: SlashCommandHost,
  config: KimiConfig,
  profileName: string,
): { model: string; thinkingEffort: string } {
  if (profileName === SUBAGENT_PRESET_MAIN_PROFILE) {
    return mainRouteFallback(host, config);
  }
  const base = config.subagent?.agents?.[profileName];
  return {
    model: base?.model ?? host.state.appState.model,
    thinkingEffort: base?.thinkingEffort ?? host.state.appState.thinkingEffort,
  };
}

function presetSummary(config: KimiConfig, name: string): string {
  const routes = config.subagent?.presets?.[name] ?? {};
  const configured = Object.keys(routes);
  if (configured.length === 0) return 'No routes configured yet.';
  return `${configured.length} route${configured.length === 1 ? '' : 's'} configured: ${configured.join(', ')}`;
}

function formatRoute(
  route: { model?: string; thinkingEffort?: string } | undefined,
  config: KimiConfig,
  fallback: string,
): string {
  if (route === undefined) return fallback;
  const parts: string[] = [];
  if (route.model !== undefined) {
    const known = config.models?.[route.model] !== undefined;
    parts.push(`model=${route.model}${known ? '' : ' (not configured!)'}`);
  }
  if (route.thinkingEffort !== undefined) parts.push(`effort=${route.thinkingEffort}`);
  return parts.length > 0 ? parts.join('  ') : fallback;
}

function routeInheritanceDescription(profileName: string): string {
  if (profileName === SUBAGENT_PRESET_MAIN_PROFILE) {
    return 'Uses the current main/default model when activated.';
  }
  if (profileName === SUBAGENT_PRESET_SWARM_PROFILE) {
    return 'Falls back to each swarm task profile, then base routing / parent.';
  }
  if (profileName === SUBAGENT_PRESET_TOWER_WORKER_ROUTE) {
    return 'Applies to Tower workers, then falls back to [subagent.agents.tower_worker], then the parent model.';
  }
  if (profileName === SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE) {
    return 'Applies to Tower reviewers, then falls back to [subagent.agents.tower_reviewer], then the parent model.';
  }
  return `Falls back to [subagent.agents.${profileName}], then the parent model.`;
}

function routeLabel(profileName: string): string {
  if (profileName === SUBAGENT_PRESET_MAIN_PROFILE) return 'Main agent';
  if (profileName === SUBAGENT_PRESET_SWARM_PROFILE) return 'Swarm default';
  if (profileName === SUBAGENT_PRESET_TOWER_WORKER_ROUTE) return 'Tower worker';
  if (profileName === SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE) return 'Tower reviewer';
  return `${capitalize(profileName)} subagent`;
}

function thinkingConfigForPreset(effort: string): { enabled: boolean; effort?: string } {
  if (effort === 'off') return { enabled: false };
  if (effort === 'on') return { enabled: true };
  return { enabled: true, effort };
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
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
  return [...names];
}
