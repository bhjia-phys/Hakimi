import type { KimiConfig, SubagentConfig, SubagentModelConfig } from './schema';

export interface SubagentModelOverride {
  readonly modelAlias?: string;
  readonly thinkingEffort?: string;
}

export type SubagentRouteKind = 'agent' | 'swarm';

export const SUBAGENT_PRESET_MAIN_PROFILE = 'main';
export const SUBAGENT_PRESET_SWARM_PROFILE = 'swarm';

/**
 * Resolve the effective model/effort override for a subagent profile.
 * Agent precedence, per field:
 *
 *   [subagent.presets.<active>.<profile>]  >  [subagent.agents.<profile>]
 *
 * AgentSwarm adds the reserved `swarm` route ahead of the selected profile at
 * each layer:
 *
 *   preset.swarm > preset.<profile> > agents.swarm > agents.<profile>
 *
 * A field unset at both levels inherits the parent agent's value (handled by
 * the caller). A `model` naming an alias missing from `[models]` is dropped
 * with a warning so a typo never breaks subagent startup.
 */
export function resolveSubagentModelOverride(
  config: KimiConfig | undefined,
  profileName: string,
  warn: (message: string) => void = () => {},
  route: SubagentRouteKind = 'agent',
): SubagentModelOverride {
  const subagent = config?.subagent;
  if (subagent === undefined) return {};

  const presetName = activeSubagentPreset(subagent);
  const presetEntry = presetName !== undefined ? subagent.presets?.[presetName]?.[profileName] : undefined;
  const agentsEntry = subagent.agents?.[profileName];
  const presetSwarmEntry =
    route === 'swarm' && presetName !== undefined
      ? subagent.presets?.[presetName]?.[SUBAGENT_PRESET_SWARM_PROFILE]
      : undefined;
  const agentsSwarmEntry =
    route === 'swarm' ? subagent.agents?.[SUBAGENT_PRESET_SWARM_PROFILE] : undefined;

  const modelAlias = pickString(
    presetSwarmEntry?.model,
    presetEntry?.model,
    agentsSwarmEntry?.model,
    agentsEntry?.model,
  );
  const thinkingEffort = pickString(
    presetSwarmEntry?.thinkingEffort,
    presetEntry?.thinkingEffort,
    agentsSwarmEntry?.thinkingEffort,
    agentsEntry?.thinkingEffort,
  );

  const override: { modelAlias?: string; thinkingEffort?: string } = {};
  if (modelAlias !== undefined) {
    if (config?.models?.[modelAlias] !== undefined) {
      override.modelAlias = modelAlias;
    } else {
      warn(
        `[subagent] model alias "${modelAlias}" for profile "${profileName}" is not defined in [models]; inheriting the parent model.`,
      );
    }
  }
  if (thinkingEffort !== undefined) {
    override.thinkingEffort = thinkingEffort;
  }
  return override;
}

/**
 * Effective override a given profile runs with, for display (`/preset`
 * status): preset layer first, then `agents`, both raw (no alias validation).
 */
export function describeSubagentModelOverride(
  subagent: SubagentConfig | undefined,
  profileName: string,
  route: SubagentRouteKind = 'agent',
): SubagentModelConfig | undefined {
  if (subagent === undefined) return undefined;
  const presetName = activeSubagentPreset(subagent);
  const presetEntry = presetName !== undefined ? subagent.presets?.[presetName]?.[profileName] : undefined;
  const agentsEntry = subagent.agents?.[profileName];
  const presetSwarmEntry =
    route === 'swarm' && presetName !== undefined
      ? subagent.presets?.[presetName]?.[SUBAGENT_PRESET_SWARM_PROFILE]
      : undefined;
  const agentsSwarmEntry =
    route === 'swarm' ? subagent.agents?.[SUBAGENT_PRESET_SWARM_PROFILE] : undefined;
  const model = pickString(
    presetSwarmEntry?.model,
    presetEntry?.model,
    agentsSwarmEntry?.model,
    agentsEntry?.model,
  );
  const thinkingEffort = pickString(
    presetSwarmEntry?.thinkingEffort,
    presetEntry?.thinkingEffort,
    agentsSwarmEntry?.thinkingEffort,
    agentsEntry?.thinkingEffort,
  );
  if (model === undefined && thinkingEffort === undefined) return undefined;
  const result: SubagentModelConfig = {};
  if (model !== undefined) result.model = model;
  if (thinkingEffort !== undefined) result.thinkingEffort = thinkingEffort;
  return result;
}

/** Active preset name, or undefined when unset/blank. */
export function activeSubagentPreset(subagent: SubagentConfig | undefined): string | undefined {
  const preset = subagent?.preset?.trim();
  return preset === undefined || preset === '' ? undefined : preset;
}

function pickString(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== '') return candidate;
  }
  return undefined;
}
