import type { KimiConfig, SubagentConfig, SubagentModelConfig } from './schema';

export interface SubagentModelOverride {
  readonly modelAlias?: string;
  readonly thinkingEffort?: string;
}

/**
 * Resolve the effective model/effort override for a subagent profile
 * (`explore`, `plan`, `coder`). Precedence, per field:
 *
 *   [subagent.presets.<active>.<profile>]  >  [subagent.agents.<profile>]
 *
 * A field unset at both levels inherits the parent agent's value (handled by
 * the caller). A `model` naming an alias missing from `[models]` is dropped
 * with a warning so a typo never breaks subagent startup.
 */
export function resolveSubagentModelOverride(
  config: KimiConfig | undefined,
  profileName: string,
  warn: (message: string) => void = () => {},
): SubagentModelOverride {
  const subagent = config?.subagent;
  if (subagent === undefined) return {};

  const presetName = activeSubagentPreset(subagent);
  const presetEntry = presetName !== undefined ? subagent.presets?.[presetName]?.[profileName] : undefined;
  const agentsEntry = subagent.agents?.[profileName];

  const modelAlias = pickString(presetEntry?.model, agentsEntry?.model);
  const thinkingEffort = pickString(presetEntry?.thinkingEffort, agentsEntry?.thinkingEffort);

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
): SubagentModelConfig | undefined {
  if (subagent === undefined) return undefined;
  const presetName = activeSubagentPreset(subagent);
  const presetEntry = presetName !== undefined ? subagent.presets?.[presetName]?.[profileName] : undefined;
  const agentsEntry = subagent.agents?.[profileName];
  const model = pickString(presetEntry?.model, agentsEntry?.model);
  const thinkingEffort = pickString(presetEntry?.thinkingEffort, agentsEntry?.thinkingEffort);
  if (model === undefined && thinkingEffort === undefined) return undefined;
  return { ...(model !== undefined ? { model } : {}), ...(thinkingEffort !== undefined ? { thinkingEffort } : {}) };
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
