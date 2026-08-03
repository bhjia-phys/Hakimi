/**
 * `subagent` domain — subagent config-section schema, env binding, and
 * timeout / model-route resolution.
 *
 * Owns the `[subagent]` configuration section (`timeout_ms`, `preset`,
 * `agents`, and `presets` on disk) together with the
 * `KIMI_SUBAGENT_TIMEOUT_MS` env override, mirroring v1's
 * `resolveSubagentTimeoutMs` precedence (env > config.toml > 2h default). While
 * the env var is set, `stripEnvBoundFields` restores the env-free raw value
 * before persistence, so the override never leaks into `config.toml`. Per-run
 * timeouts resolve through `resolveSubagentTimeoutMs`, and the timeout
 * message renders with `formatSubagentTimeoutDescription`.
 *
 * The effective model precedence is explicit tool `model` > active
 * preset/[subagent.agents] route `model` > profile `modelPreference` > the
 * configured secondary model > the caller's model. When explicit, the tool
 * choice remains the base model while route `thinkingEffort` still applies as
 * a field-level override; without it, route model resolution is unchanged.
 * When the secondary-model experiment is enabled and configured, it supplies
 * the default instead of the caller's model. A recipe with patch fields binds
 * the synthesized derived entry (`SECONDARY_DERIVED_MODEL_ID`); a pointer-only
 * recipe binds the pointed entry directly. `default_effort` is passed as the
 * explicit subagent thinking; without it the subagent resolves thinking
 * naturally (global thinking config → the bound model's default effort)
 * rather than inheriting the caller's level. An active preset then overrides
 * Agent by profile; AgentSwarm resolves `preset.swarm > preset.<profile> >
 * agents.swarm > agents.<profile>` field-by-field. Both tools resolve spawn
 * bindings through `resolveSubagentBinding`, advertise the base pair via
 * `buildSubagentModelDescriptions` (each line suffixed with the entry's
 * resolved capability flags, so the parent can route multimodal or
 * thinking-heavy subagent tasks instead of guessing from the model id),
 * and wrap spawn failures with `wrapSubagentModelError`; while the
 * experiment is off they also strip the no-op `model` parameter from their
 * advertised schemas via `stripSubagentModelParameter`. Spawn reporting
 * reads the display-facing alias from `subagentDisplayModel`: the derived
 * entry id means nothing to a user, so it resolves back to the recipe's base
 * alias — flag-independent on purpose, since interpreting an
 * already-persisted derived binding (resume) must keep working after the
 * experiment is switched off. Self-registered at module load via
 * `registerConfigSection`, so the `config` domain never imports this
 * domain's types.
 */

import { z } from 'zod';

import { Error2, ErrorCodes, isError2 } from '#/errors';
import type { AgentModelPreference } from '#/app/agentProfileCatalog/agentProfileCatalog';
import { isPlainObject } from '#/app/config/toml';
import type { IFlagService } from '#/app/flag/flag';
import {
  SECONDARY_MODEL_ENV,
  SECONDARY_MODEL_SECTION,
} from '#/app/kosongConfig/configSection';
import {
  SECONDARY_DERIVED_MODEL_ID,
  secondaryModelPatch,
} from '#/app/kosongConfig/secondaryModelOverlay';
import { type SecondaryModelConfig } from '#/app/kosongConfig/configSection';
import {
  type EnvBindings,
  envBindings,
  stripEnvBoundFields,
  type IConfigService,
} from '#/app/config/config';
import { registerConfigSection } from '#/app/config/configSectionContributions';
import type { ModelCapability } from '#/kosong/contract/capability';
import type { IModelCatalog } from '#/kosong/model/catalog';
import {
  camelToSnake,
  cloneRecord,
  setDefined,
  transformPlainObject,
} from '#/app/config/toml';

import { SECONDARY_MODEL_FLAG_ID } from './flag';

export const SUBAGENT_SECTION = 'subagent';

export const SUBAGENT_PRESET_MAIN_PROFILE = 'main';
export const SUBAGENT_PRESET_SWARM_PROFILE = 'swarm';

export type SubagentRouteKind = 'agent' | 'swarm';

export const SubagentModelConfigSchema = z.object({
  model: z.string().min(1).optional(),
  thinkingEffort: z.string().min(1).optional(),
});

export const SubagentConfigSchema = z.object({
  timeoutMs: z.number().int().min(0).optional(),
  preset: z.string().optional(),
  agents: z.record(z.string(), SubagentModelConfigSchema).optional(),
  presets: z
    .record(z.string(), z.record(z.string(), SubagentModelConfigSchema))
    .optional(),
});

export type SubagentConfig = z.infer<typeof SubagentConfigSchema>;
export type SubagentModelConfig = z.infer<typeof SubagentModelConfigSchema>;

export const DEFAULT_SUBAGENT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export const SUBAGENT_TIMEOUT_ENV = 'KIMI_SUBAGENT_TIMEOUT_MS';

function parseTimeoutMsEnv(raw: string): number | undefined {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

export const subagentEnvBindings: EnvBindings<SubagentConfig> = envBindings(
  SubagentConfigSchema,
  {
    timeoutMs: { env: SUBAGENT_TIMEOUT_ENV, parse: parseTimeoutMsEnv },
  },
);

export const stripSubagentEnv = stripEnvBoundFields(subagentEnvBindings);

export const subagentFromToml = (rawSnake: unknown): unknown => {
  if (!isPlainObject(rawSnake)) return rawSnake;
  const out = transformPlainObject(rawSnake);
  if (isPlainObject(rawSnake['agents'])) {
    out['agents'] = modelConfigRecordFromToml(rawSnake['agents']);
  }
  if (isPlainObject(rawSnake['presets'])) {
    const presets: Record<string, unknown> = {};
    for (const [name, entries] of Object.entries(rawSnake['presets'])) {
      presets[name] = isPlainObject(entries)
        ? modelConfigRecordFromToml(entries)
        : entries;
    }
    out['presets'] = presets;
  }
  return out;
};

export const subagentToToml = (value: unknown, rawSnake: unknown): unknown => {
  if (!isPlainObject(value)) return value;
  const out = cloneRecord(rawSnake);
  setDefined(out, 'timeout_ms', value['timeoutMs']);
  setDefined(out, 'preset', value['preset']);
  setDefined(
    out,
    'agents',
    isPlainObject(value['agents'])
      ? modelConfigRecordToToml(value['agents'], out['agents'])
      : value['agents'],
  );
  if (isPlainObject(value['presets'])) {
    const rawPresets = cloneRecord(out['presets']);
    const presets: Record<string, unknown> = {};
    for (const [name, entries] of Object.entries(value['presets'])) {
      presets[name] = isPlainObject(entries)
        ? modelConfigRecordToToml(entries, rawPresets[name])
        : entries;
    }
    out['presets'] = presets;
  } else {
    setDefined(out, 'presets', value['presets']);
  }
  return out;
};

function modelConfigRecordFromToml(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(value)) {
    out[name] = isPlainObject(entry) ? transformPlainObject(entry) : entry;
  }
  return out;
}

function modelConfigRecordToToml(
  value: Record<string, unknown>,
  rawSnake: unknown,
): Record<string, unknown> {
  const raw = cloneRecord(rawSnake);
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) {
      out[name] = entry;
      continue;
    }
    const converted = cloneRecord(raw[name]);
    for (const [key, field] of Object.entries(entry)) {
      setDefined(converted, camelToSnake(key), field);
    }
    out[name] = converted;
  }
  return out;
}

registerConfigSection(SUBAGENT_SECTION, SubagentConfigSchema, {
  defaultValue: { timeoutMs: DEFAULT_SUBAGENT_TIMEOUT_MS },
  env: subagentEnvBindings,
  stripEnv: stripSubagentEnv,
  fromToml: subagentFromToml,
  toToml: subagentToToml,
});

export function resolveSubagentTimeoutMs(config: IConfigService): number {
  return (
    config.get<SubagentConfig | undefined>(SUBAGENT_SECTION)?.timeoutMs ??
    DEFAULT_SUBAGENT_TIMEOUT_MS
  );
}

export type SubagentModelChoice = AgentModelPreference;

export function resolveSecondaryModel(
  config: IConfigService,
  flags: IFlagService,
): SecondaryModelConfig | undefined {
  if (!flags.enabled(SECONDARY_MODEL_FLAG_ID)) return undefined;
  return config.get<SecondaryModelConfig | undefined>(SECONDARY_MODEL_SECTION);
}

export function resolveSubagentBinding(
  config: IConfigService,
  flags: IFlagService,
  own: { modelAlias: string; thinkingLevel: string },
  explicitModel?: SubagentModelChoice,
  routing?: { profileName: string; route: SubagentRouteKind },
  profilePreference?: SubagentModelChoice,
): { model: string; thinking?: string; displayModel: string } {
  const secondary = resolveSecondaryModel(config, flags);
  // An explicit "secondary" request must never silently degrade to the
  // caller's model: the fallback is only for the implicit default path.
  if (explicitModel === 'secondary' && secondary?.model === undefined) {
    throw new Error(
      'model: "secondary" was requested but no secondary model is available — ' +
        'configure [secondary_model].model (or the KIMI_SECONDARY_MODEL env var) and ' +
        'enable the secondary-model experiment (KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL, ' +
        'or [experimental] secondary-model = true).',
    );
  }
  const modelChoice = explicitModel ?? profilePreference;
  let binding: { model: string; thinking?: string };
  if (modelChoice !== 'primary' && secondary?.model !== undefined) {
    binding = {
      model:
        secondaryModelPatch(secondary) === undefined
          ? secondary.model
          : SECONDARY_DERIVED_MODEL_ID,
      thinking: secondary.defaultEffort,
    };
  } else {
    binding = { model: own.modelAlias, thinking: own.thinkingLevel };
  }
  if (routing !== undefined) {
    const override = resolveSubagentModelOverride(config, routing.profileName, routing.route);
    binding = {
      model: explicitModel === undefined ? override.model ?? binding.model : binding.model,
      thinking: override.thinkingEffort ?? binding.thinking,
    };
  }
  return {
    model: binding.model,
    thinking: binding.thinking,
    displayModel: subagentDisplayModel(config, binding.model),
  };
}

export function resolveSubagentModelOverride(
  config: IConfigService,
  profileName: string,
  route: SubagentRouteKind = 'agent',
): SubagentModelConfig {
  const subagent = config.get<SubagentConfig | undefined>(SUBAGENT_SECTION);
  if (subagent === undefined) return {};
  const presetEntry =
    subagent.preset === undefined
      ? undefined
      : subagent.presets?.[subagent.preset]?.[profileName];
  const agentsEntry = subagent.agents?.[profileName];
  const presetSwarmEntry =
    route === 'swarm' && subagent.preset !== undefined
      ? subagent.presets?.[subagent.preset]?.[SUBAGENT_PRESET_SWARM_PROFILE]
      : undefined;
  const agentsSwarmEntry =
    route === 'swarm'
      ? subagent.agents?.[SUBAGENT_PRESET_SWARM_PROFILE]
      : undefined;
  return compactSubagentModelConfig({
    model: firstConfiguredString(
      presetSwarmEntry?.model,
      presetEntry?.model,
      agentsSwarmEntry?.model,
      agentsEntry?.model,
    ),
    thinkingEffort: firstConfiguredString(
      presetSwarmEntry?.thinkingEffort,
      presetEntry?.thinkingEffort,
      agentsSwarmEntry?.thinkingEffort,
      agentsEntry?.thinkingEffort,
    ),
  });
}

export function subagentDisplayModel(
  config: IConfigService,
  boundAlias: string,
): string {
  if (boundAlias !== SECONDARY_DERIVED_MODEL_ID) return boundAlias;
  return (
    config.get<SecondaryModelConfig | undefined>(SECONDARY_MODEL_SECTION)?.model ?? boundAlias
  );
}

function compactSubagentModelConfig(
  value: SubagentModelConfig,
): SubagentModelConfig {
  const compact: SubagentModelConfig = {};
  if (value.model !== undefined) compact.model = value.model;
  if (value.thinkingEffort !== undefined) {
    compact.thinkingEffort = value.thinkingEffort;
  }
  return compact;
}

function firstConfiguredString(
  ...values: readonly (string | undefined)[]
): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) return value;
  }
  return undefined;
}

export function buildSubagentModelDescriptions(
  config: IConfigService,
  flags: IFlagService,
  callerModelAlias: string | undefined,
  modelCatalog: IModelCatalog,
): string | undefined {
  const secondary = resolveSecondaryModel(config, flags);
  const secondaryModel = secondary?.model;
  if (secondaryModel === undefined || callerModelAlias === undefined) return undefined;
  const boundSecondary =
    secondaryModelPatch(secondary) === undefined ? secondaryModel : SECONDARY_DERIVED_MODEL_ID;
  return [
    'Available models (pass via model):',
    `- secondary: ${secondaryModel} (default) — the configured secondary model; prefer it for routine subagent tasks${capabilitiesSuffix(resolvedCapabilities(modelCatalog, boundSecondary))}`,
    `- primary: ${callerModelAlias} — the main model you are running on; use it for hard, quality-sensitive subagent tasks${capabilitiesSuffix(resolvedCapabilities(modelCatalog, callerModelAlias))}`,
  ].join('\n');
}

const ADVERTISED_CAPABILITY_FLAGS = [
  'image_in',
  'video_in',
  'audio_in',
  'thinking',
  'tool_use',
  'dynamically_loaded_tools',
] as const satisfies readonly (keyof ModelCapability)[];

function capabilitiesSuffix(capability: ModelCapability | undefined): string {
  if (capability === undefined) return '';
  const names = ADVERTISED_CAPABILITY_FLAGS.filter((flag) => capability[flag] === true);
  return `; capabilities: ${names.length === 0 ? 'none' : names.join(', ')}`;
}

function resolvedCapabilities(
  modelCatalog: IModelCatalog,
  model: string,
): ModelCapability | undefined {
  try {
    return modelCatalog.get(model).capabilities;
  } catch {
    return undefined;
  }
}

export function stripSubagentModelParameter(
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const properties = parameters['properties'];
  if (!isPlainObject(properties) || !('model' in properties)) return parameters;
  const nextProperties = { ...properties };
  delete nextProperties['model'];
  const next: Record<string, unknown> = { ...parameters, properties: nextProperties };
  const required = parameters['required'];
  if (Array.isArray(required) && required.includes('model')) {
    next['required'] = required.filter((entry) => entry !== 'model');
  }
  return next;
}

export function wrapSubagentModelError(
  error: unknown,
  boundModel: string,
  callerModelAlias: string | undefined,
): unknown {
  if (boundModel === callerModelAlias) return error;
  if (!isError2(error) || error.code !== ErrorCodes.CONFIG_INVALID) return error;
  if (error.details?.['model'] !== boundModel) return error;
  const displayModel =
    boundModel === SECONDARY_DERIVED_MODEL_ID
      ? `the derived entry "${SECONDARY_DERIVED_MODEL_ID}"`
      : `"${boundModel}"`;
  return new Error2(
    error.code,
    `${error.message} (secondary model ${displayModel} comes from [secondary_model].model / ${SECONDARY_MODEL_ENV} — check that it names a valid [models] entry)`,
    {
      cause: error,
      name: error.name,
      details: {
        ...error.details,
        secondaryModel: boundModel,
        secondaryModelConfig: {
          section: 'secondaryModel.model',
          environment: SECONDARY_MODEL_ENV,
        },
      },
    },
  );
}

export function formatSubagentTimeoutDescription(ms: number): string {
  if (ms % (60 * 60 * 1000) === 0) {
    const h = ms / (60 * 60 * 1000);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  if (ms % (60 * 1000) === 0) {
    const m = ms / (60 * 1000);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  if (ms % 1000 === 0) {
    const s = ms / 1000;
    return `${s} second${s === 1 ? '' : 's'}`;
  }
  return `${ms} ms`;
}
