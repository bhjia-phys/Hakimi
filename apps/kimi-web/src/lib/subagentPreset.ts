import type { AppConfig, SubagentModelConfig } from '../api/types';

export function thinkingConfigForPreset(
  effort: string,
): NonNullable<AppConfig['thinking']> {
  if (effort === 'off') return { enabled: false };
  if (effort === 'on') return { enabled: true };
  return { enabled: true, effort };
}

export function mainRouteForPreset(
  config: Pick<AppConfig, 'subagent'>,
  preset: string,
): SubagentModelConfig | undefined {
  if (preset.length === 0) return undefined;
  return config.subagent?.presets?.[preset]?.['main'];
}

/** Match CLI `/preset`: write only the active selector plus the preset's main defaults. */
export function configPatchForPreset(
  config: Pick<AppConfig, 'subagent'>,
  preset: string,
): Partial<AppConfig> {
  const patch: Partial<AppConfig> = { subagent: { preset } };
  const main = mainRouteForPreset(config, preset);
  if (main?.model !== undefined) patch.defaultModel = main.model;
  if (main?.thinkingEffort !== undefined) {
    patch.thinking = thinkingConfigForPreset(main.thinkingEffort);
  }
  return patch;
}
