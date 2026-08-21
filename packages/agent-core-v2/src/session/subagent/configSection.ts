/**
 * `subagent` domain — subagent config-section schemas, env binding, and
 * timeout / model resolution.
 *
 * Owns two on-disk sections:
 *
 * - `[subagent]` — `timeout_ms`, together with the `KIMI_SUBAGENT_TIMEOUT_MS`
 *   env override (precedence: env > config.toml > 2h default). While the env
 *   var is set, `stripEnvBoundFields` restores the env-free raw value before
 *   persistence, so the override never leaks into `config.toml`. The section
 *   also owns the canonical route tables (`preset`, `agents`, `presets`). The
 *   shared resolver applies `preset.<profile> > agents.<profile> > caller` for
 *   Agent, `preset.swarm > preset.<profile> > agents.swarm > agents.<profile> >
 *   caller` for AgentSwarm, and the dedicated `tower_worker` /
 *   `tower_reviewer` route followed by caller for Tower. Fresh spawns and
 *   resumes both use that resolver.
 *
 * - `[secondary_model]` — a deprecated compatibility section. Its schema and
 *   explicit reads/writes remain available for v1/API round-trips, but it is
 *   not a product control surface and provider/model maintenance must not
 *   rewrite it.
 *
 * The legacy default is consulted only when no preset is active: Agent,
 * AgentSwarm, and Tower workers may use it when the `secondary-model` flag is
 * enabled, while Tower reviewers never do. It is best effort, so a dangling
 * legacy alias degrades to the caller's binding. Canonical aliases fail with
 * coded `[subagent]` guidance. The old model-description and schema-strip
 * helpers remain exported only for compatibility callers, not for v2 tool
 * schemas.
 * Cross-field validation is enforced as `Error2(CONFIG_INVALID)` by
 * `assertValidSubagentModelConfig` before session materialization, with the
 * Session-scope validation service as backstop. It validates every canonical
 * entry in `agents` and only the active preset's entries; inactive presets and
 * legacy pool aliases are intentionally not startup blockers. `cascadeSubagentModelPool`
 * remains exported for compatibility, but product provider/model maintenance
 * no longer calls it or rewrites the deprecated section.
 * Self-registered at module load via `registerConfigSection`.
 */

import { z } from 'zod';

import { Error2, ErrorCodes, isError2 } from '#/errors';
import type { AgentModelPreference } from '#/app/agentProfileCatalog/agentProfileCatalog';
import { isPlainObject } from '#/app/config/toml';
import type { IFlagService } from '#/app/flag/flag';
import {
  type EnvBindings,
  envBindings,
  stripEnvBoundFields,
  type IConfigService,
} from '#/app/config/config';
import { registerConfigSection } from '#/app/config/configSectionContributions';
import type { IModelCatalog } from '#/kosong/model/catalog';
import {
  camelToSnake,
  cloneRecord,
  setDefined,
  transformPlainObject,
} from '#/app/config/toml';

import { SECONDARY_MODEL_FLAG_ID } from './flag';

export const SUBAGENT_SECTION = 'subagent';
export const SECONDARY_MODEL_SECTION = 'secondaryModel';

export const SUBAGENT_PRESET_MAIN_PROFILE = 'main';
export const SUBAGENT_PRESET_SWARM_PROFILE = 'swarm';
export const SUBAGENT_PRESET_TOWER_WORKER_ROUTE = 'tower_worker';
export const SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE = 'tower_reviewer';
// Profile-named aliases keep the route keys easy to discover for hosts that
// already model the main and swarm entries as profile names.
export const SUBAGENT_PRESET_TOWER_WORKER_PROFILE = SUBAGENT_PRESET_TOWER_WORKER_ROUTE;
export const SUBAGENT_PRESET_TOWER_REVIEWER_PROFILE = SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE;

export type SubagentRouteKind =
  | 'agent'
  | 'swarm'
  | typeof SUBAGENT_PRESET_TOWER_WORKER_ROUTE
  | typeof SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE;

export type SubagentBindingSource = 'preset' | 'agents' | 'legacy-secondary' | 'caller';

export interface SubagentRouteRequest {
  readonly route: SubagentRouteKind;
  readonly profileName?: string;
  readonly modelPreference?: AgentModelPreference;
  readonly caller: { readonly modelAlias: string; readonly thinkingLevel: string };
}

export interface SubagentBindingResolution {
  readonly model: string;
  readonly thinking?: string;
  readonly source: SubagentBindingSource;
  readonly modelSource: SubagentBindingSource;
  readonly thinkingSource: SubagentBindingSource;
}

export const SubagentModelConfigSchema = z.object({
  model: z.string().optional(),
  thinkingEffort: z.string().optional(),
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

export const SecondaryModelConfigSchema = z.object({
  defaultModel: z.string().min(1).optional(),
  models: z.record(z.string(), z.string()).optional(),
  force: z.boolean().optional(),
  model: z.string().min(1).optional(),
  maxContextSize: z.number().int().min(1).optional(),
  maxInputSize: z.number().int().min(1).optional(),
  maxOutputSize: z.number().int().min(1).optional(),
  capabilities: z.array(z.string()).optional(),
  displayName: z.string().optional(),
  reasoningKey: z.string().optional(),
  adaptiveThinking: z.boolean().optional(),
  supportEfforts: z.array(z.string()).optional(),
  defaultEffort: z.string().optional(),
  offEffort: z.string().optional(),
});

export type SecondaryModelConfig = z.infer<typeof SecondaryModelConfigSchema>;

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

registerConfigSection(SECONDARY_MODEL_SECTION, SecondaryModelConfigSchema, {
  deprecation: {
    replacement: '[subagent] and /preset',
    message:
      'The legacy model pool is only a compatibility fallback; provider and model maintenance will not rewrite this section.',
  },
});

export function resolveSubagentTimeoutMs(config: IConfigService): number {
  return (
    config.get<SubagentConfig | undefined>(SUBAGENT_SECTION)?.timeoutMs ??
    DEFAULT_SUBAGENT_TIMEOUT_MS
  );
}

export const PRIMARY_SUBAGENT_MODEL_CHOICE = 'primary';

export interface SubagentModelPool {
  readonly defaultModel?: string;
  readonly models: Record<string, string>;
}

export function resolveSubagentModelPool(config: IConfigService): SubagentModelPool | undefined {
  const section = config.get<SecondaryModelConfig | undefined>(SECONDARY_MODEL_SECTION);
  if (section?.models !== undefined) {
    return { defaultModel: section.defaultModel, models: section.models };
  }
  if (section?.defaultModel !== undefined) {
    return { defaultModel: section.defaultModel, models: { [section.defaultModel]: '' } };
  }
  if (section?.model !== undefined) {
    return { defaultModel: section.model, models: { [section.model]: '' } };
  }
  return undefined;
}

export const SECONDARY_MODEL_FORCE_REQUIRES_DEFAULT_MESSAGE =
  '[secondary_model].default_model is required when [secondary_model].force is set';

export const SECONDARY_MODEL_FORCE_EXCLUDES_MODELS_MESSAGE =
  '[secondary_model].force cannot be combined with [secondary_model.models]: the pool table only exists to offer the main agent a choice, and force removes that choice';

export function isSubagentModelForced(config: IConfigService): boolean {
  return config.get<SecondaryModelConfig | undefined>(SECONDARY_MODEL_SECTION)?.force === true;
}

export function exposesSubagentModelChoice(config: IConfigService, flags: IFlagService): boolean {
  if (!flags.enabled(SECONDARY_MODEL_FLAG_ID)) return false;
  if (isSubagentModelForced(config)) return false;
  return resolveSubagentModelPool(config) !== undefined;
}

export const SECONDARY_MODEL_DEFAULT_MODEL_REQUIRED_MESSAGE =
  '[secondary_model].default_model is required when [secondary_model.models] is configured';

export const SECONDARY_MODEL_PRIMARY_MODEL_RESERVED_MESSAGE = `[secondary_model.models] key "${PRIMARY_SUBAGENT_MODEL_CHOICE}" is reserved: it always binds the caller's own model. Rename the pool entry.`;

export function assertValidSubagentModelPool(
  pool: SubagentModelPool,
  modelCatalog: IModelCatalog,
): void {
  if (Object.hasOwn(pool.models, PRIMARY_SUBAGENT_MODEL_CHOICE)) {
    throw new Error2(ErrorCodes.CONFIG_INVALID, SECONDARY_MODEL_PRIMARY_MODEL_RESERVED_MESSAGE, {
      details: {
        section: SECONDARY_MODEL_SECTION,
        field: 'models',
        model: PRIMARY_SUBAGENT_MODEL_CHOICE,
      },
    });
  }
  const aliases = Object.keys(pool.models);
  if (pool.defaultModel === undefined) {
    throw new Error2(ErrorCodes.CONFIG_INVALID, SECONDARY_MODEL_DEFAULT_MODEL_REQUIRED_MESSAGE, {
      details: { section: SECONDARY_MODEL_SECTION, field: 'defaultModel' },
    });
  }
  if (!Object.hasOwn(pool.models, pool.defaultModel)) {
    throw new Error2(
      ErrorCodes.CONFIG_INVALID,
      `[secondary_model].default_model "${pool.defaultModel}" is not a [secondary_model.models] key. Available models: ${aliases.join(', ')}.`,
      { details: { model: pool.defaultModel, availableModels: aliases } },
    );
  }
  for (const alias of aliases) {
    try {
      modelCatalog.get(alias);
    } catch (error) {
      throw new Error2(
        ErrorCodes.CONFIG_INVALID,
        `[secondary_model.models] entry "${alias}" could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error, details: { model: alias } },
      );
    }
  }
}

export function activeSubagentPreset(
  subagent: SubagentConfig | undefined,
): string | undefined {
  const preset = subagent?.preset?.trim();
  return preset === undefined || preset.length === 0 ? undefined : preset;
}

function readSubagentConfig(config: IConfigService): SubagentConfig | undefined {
  const raw = config.inspect<unknown>(SUBAGENT_SECTION).userValue;
  if (raw !== undefined) {
    const parsed = SubagentConfigSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? 'invalid section shape';
      throw new Error2(
        ErrorCodes.CONFIG_INVALID,
        `[subagent] is invalid: ${issue}.`,
        { details: { section: SUBAGENT_SECTION } },
      );
    }
  }
  return config.get<SubagentConfig | undefined>(SUBAGENT_SECTION);
}

function requireActivePreset(
  subagent: SubagentConfig | undefined,
  active: string | undefined,
): Record<string, SubagentModelConfig> | undefined {
  if (active === undefined) return undefined;
  const presets = subagent?.presets;
  if (presets === undefined || !Object.hasOwn(presets, active)) {
    throw new Error2(
      ErrorCodes.CONFIG_INVALID,
      `[subagent].preset "${active}" does not name a configured preset.`,
      { details: { section: SUBAGENT_SECTION, field: 'preset', preset: active } },
    );
  }
  return presets[active];
}

function ownRouteEntry(
  routes: Record<string, SubagentModelConfig> | undefined,
  routeName: string,
): SubagentModelConfig | undefined {
  return routes !== undefined && Object.hasOwn(routes, routeName) ? routes[routeName] : undefined;
}

/**
 * Resolve the canonical model routes that hosts display. This helper only
 * reports `[subagent]` route fields; the legacy section is intentionally not
 * folded into the display because it is no longer a formal route.
 */
export function describeSubagentModelOverride(
  subagent: SubagentConfig | undefined,
  profileName: string,
  route: SubagentRouteKind = 'agent',
): SubagentModelConfig | undefined {
  if (subagent === undefined) return undefined;
  const active = activeSubagentPreset(subagent);
  const entries = routeEntries(subagent, active, route, profileName);
  const model = firstConfiguredEntry(entries, 'model')?.value;
  const thinkingEffort = firstConfiguredEntry(entries, 'thinkingEffort')?.value;
  if (model === undefined && thinkingEffort === undefined) return undefined;
  return compactSubagentModelConfig({ model, thinkingEffort });
}

/**
 * Validate only formal `[subagent]` routes. The legacy pool remains readable
 * and round-trippable, but a dangling legacy alias is deliberately ignored by
 * startup; the resolver falls back to the caller when it needs that alias.
 */
export function assertValidSubagentModelConfig(
  config: IConfigService,
  _flags: IFlagService,
  modelCatalog: IModelCatalog,
): void {
  const subagent = readSubagentConfig(config);
  if (subagent === undefined) return;

  for (const [profileName, entry] of Object.entries(subagent.agents ?? {})) {
    assertCanonicalEntry(entry, `agents.${profileName}`, modelCatalog);
  }

  const active = activeSubagentPreset(subagent);
  const preset = requireActivePreset(subagent, active);
  if (preset === undefined) return;
  for (const [routeName, entry] of Object.entries(preset)) {
    assertCanonicalEntry(entry, `presets.${active}.${routeName}`, modelCatalog);
  }
}

function assertCanonicalEntry(
  entry: SubagentModelConfig,
  routeName: string,
  modelCatalog: IModelCatalog,
): void {
  const model = canonicalRouteValue(entry.model, routeName, 'model');
  if (model !== undefined) validateCanonicalModelAlias(model, routeName, modelCatalog);
  canonicalRouteValue(entry.thinkingEffort, routeName, 'thinkingEffort');
}

export function cascadeSubagentModelPool(
  section: SecondaryModelConfig | undefined,
  survivingModels: Record<string, unknown>,
  renamedAliases: ReadonlyMap<string, string> = new Map(),
): SecondaryModelConfig | null | undefined {
  if (section === undefined) return undefined;
  const remap = (alias: string): string => renamedAliases.get(alias) ?? alias;
  const nextDefault = section.defaultModel === undefined ? undefined : remap(section.defaultModel);
  const nextLegacyDefault = section.model === undefined ? undefined : remap(section.model);
  const effectiveDefault = nextDefault ?? nextLegacyDefault;
  if (effectiveDefault !== undefined && !(effectiveDefault in survivingModels)) return null;

  let changed = nextDefault !== section.defaultModel || nextLegacyDefault !== section.model;
  let nextPool: Record<string, string> | undefined;
  if (section.models !== undefined) {
    nextPool = {};
    for (const [alias, description] of Object.entries(section.models)) {
      const key = remap(alias);
      if (!(key in survivingModels)) {
        changed = true;
        continue;
      }
      if (key !== alias) changed = true;
      nextPool[key] = description;
    }
    if (Object.keys(nextPool).length === 0) {
      nextPool = undefined;
      changed = true;
    }
  }
  if (!changed) return undefined;
  return { ...section, defaultModel: nextDefault, model: nextLegacyDefault, models: nextPool };
}

export function resolveSubagentBinding(
  config: IConfigService,
  flags: IFlagService,
  modelCatalog: IModelCatalog,
  request: SubagentRouteRequest,
): SubagentBindingResolution {
  const subagent = readSubagentConfig(config);
  const active = activeSubagentPreset(subagent);
  requireActivePreset(subagent, active);
  const entries = routeEntries(subagent, active, request.route, request.profileName);
  const modelCandidate = firstConfiguredEntry(entries, 'model');
  const thinkingCandidate = firstConfiguredEntry(entries, 'thinkingEffort');

  let model = request.caller.modelAlias;
  let modelSource: SubagentBindingSource = 'caller';
  if (modelCandidate !== undefined) {
    model = modelCandidate.value;
    modelSource = modelCandidate.source;
    validateCanonicalModelAlias(model, modelCandidate.routeName, modelCatalog);
  } else if (
    active === undefined &&
    request.modelPreference !== 'primary' &&
    request.route !== SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE &&
    flags.enabled(SECONDARY_MODEL_FLAG_ID)
  ) {
    const legacy = config.get<SecondaryModelConfig | undefined>(SECONDARY_MODEL_SECTION);
    const legacyAlias = legacy?.defaultModel ?? legacy?.model;
    if (legacyAlias !== undefined) {
      try {
        modelCatalog.get(legacyAlias);
        model = legacyAlias;
        modelSource = 'legacy-secondary';
      } catch {
        // A deprecated fallback is best effort. A removed provider must not
        // prevent a new session or a resume from inheriting its caller.
      }
    }
  }

  const thinking =
    thinkingCandidate !== undefined
      ? thinkingCandidate.value
      : modelSource === 'legacy-secondary'
        ? undefined
        : request.caller.thinkingLevel;
  const thinkingSource: SubagentBindingSource =
    thinkingCandidate?.source ?? (modelSource === 'legacy-secondary' ? 'legacy-secondary' : 'caller');
  return {
    model,
    thinking,
    source: modelSource,
    modelSource,
    thinkingSource,
  };
}

interface RouteEntry {
  readonly entry: SubagentModelConfig | undefined;
  readonly source: SubagentBindingSource;
  readonly routeName: string;
}

function routeEntries(
  subagent: SubagentConfig | undefined,
  active: string | undefined,
  route: SubagentRouteKind,
  profileName: string | undefined,
): readonly RouteEntry[] {
  const profile = profileName ?? '';
  const preset = requireActivePreset(subagent, active);
  const agents = subagent?.agents;
  if (route === 'swarm') {
    return active === undefined
      ? [
          { entry: ownRouteEntry(agents, SUBAGENT_PRESET_SWARM_PROFILE), source: 'agents', routeName: 'agents.swarm' },
          { entry: ownRouteEntry(agents, profile), source: 'agents', routeName: `agents.${profile}` },
        ]
      : [
          { entry: ownRouteEntry(preset, SUBAGENT_PRESET_SWARM_PROFILE), source: 'preset', routeName: `presets.${active}.swarm` },
          { entry: ownRouteEntry(preset, profile), source: 'preset', routeName: `presets.${active}.${profile}` },
          { entry: ownRouteEntry(agents, SUBAGENT_PRESET_SWARM_PROFILE), source: 'agents', routeName: 'agents.swarm' },
          { entry: ownRouteEntry(agents, profile), source: 'agents', routeName: `agents.${profile}` },
        ];
  }
  if (
    route === SUBAGENT_PRESET_TOWER_WORKER_ROUTE ||
    route === SUBAGENT_PRESET_TOWER_REVIEWER_ROUTE
  ) {
    return active === undefined
      ? [
          { entry: ownRouteEntry(agents, route), source: 'agents', routeName: `agents.${route}` },
        ]
      : [
          { entry: ownRouteEntry(preset, route), source: 'preset', routeName: `presets.${active}.${route}` },
          { entry: ownRouteEntry(agents, route), source: 'agents', routeName: `agents.${route}` },
        ];
  }
  return active === undefined
    ? [{ entry: ownRouteEntry(agents, profile), source: 'agents', routeName: `agents.${profile}` }]
    : [
        { entry: ownRouteEntry(preset, profile), source: 'preset', routeName: `presets.${active}.${profile}` },
        { entry: ownRouteEntry(agents, profile), source: 'agents', routeName: `agents.${profile}` },
      ];
}

function firstConfiguredEntry(
  entries: readonly RouteEntry[],
  field: 'model' | 'thinkingEffort',
): { readonly value: string; readonly source: SubagentBindingSource; readonly routeName: string } | undefined {
  for (const candidate of entries) {
    const value = canonicalRouteValue(candidate.entry?.[field], candidate.routeName, field);
    if (value !== undefined) {
      return { value, source: candidate.source, routeName: candidate.routeName };
    }
  }
  return undefined;
}

function canonicalRouteValue(
  value: string | undefined,
  routeName: string,
  field: 'model' | 'thinkingEffort',
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) {
    const fieldName = field === 'thinkingEffort' ? 'thinking_effort' : field;
    throw new Error2(
      ErrorCodes.CONFIG_INVALID,
      `[subagent] ${fieldName} in ${routeName} cannot be blank; configure the route through /preset or [subagent.agents].`,
      { details: { section: SUBAGENT_SECTION, route: routeName, field: fieldName } },
    );
  }
  return normalized;
}

function validateCanonicalModelAlias(
  alias: string,
  routeName: string,
  modelCatalog: IModelCatalog,
): void {
  try {
    modelCatalog.get(alias);
  } catch (error) {
    throw new Error2(
      ErrorCodes.CONFIG_INVALID,
      `[subagent] model alias "${alias}" from ${routeName} could not be resolved; configure the route through /preset or [subagent.agents].`,
      {
        cause: error,
        details: { section: SUBAGENT_SECTION, route: routeName, model: alias },
      },
    );
  }
}

export function resolveSubagentModelOverride(
  config: IConfigService,
  profileName: string,
  route: SubagentRouteKind = 'agent',
): SubagentModelConfig {
  const subagent = readSubagentConfig(config);
  const active = activeSubagentPreset(subagent);
  const entries = routeEntries(subagent, active, route, profileName);
  return compactSubagentModelConfig({
    model: firstConfiguredEntry(entries, 'model')?.value,
    thinkingEffort: firstConfiguredEntry(entries, 'thinkingEffort')?.value,
  });
}

function compactSubagentModelConfig(value: SubagentModelConfig): SubagentModelConfig {
  const compact: SubagentModelConfig = {};
  if (value.model !== undefined) compact.model = value.model;
  if (value.thinkingEffort !== undefined) compact.thinkingEffort = value.thinkingEffort;
  return compact;
}

export function buildSubagentModelDescriptions(
  config: IConfigService,
  flags: IFlagService,
  callerModelAlias: string | undefined,
): string | undefined {
  if (!exposesSubagentModelChoice(config, flags)) return undefined;
  const pool = resolveSubagentModelPool(config)!;
  const lines = ['Available models (pass via model):'];
  const defaultModel = pool.defaultModel;
  const markersFor = (alias: string): string => {
    const markers: string[] = [];
    if (alias === defaultModel) markers.push('[default]');
    if (alias === callerModelAlias) markers.push('[main model]');
    return markers.length === 0 ? '' : ` ${markers.join(' ')}`;
  };
  if (defaultModel !== undefined && Object.hasOwn(pool.models, defaultModel)) {
    lines.push(
      formatPoolLine(`${defaultModel}${markersFor(defaultModel)}`, pool.models[defaultModel]!),
    );
  }
  for (const [alias, description] of Object.entries(pool.models)) {
    if (alias === defaultModel) continue;
    lines.push(formatPoolLine(`${alias}${markersFor(alias)}`, description));
  }
  const callerInPool =
    callerModelAlias !== undefined && Object.hasOwn(pool.models, callerModelAlias);
  lines.push(
    `- ${PRIMARY_SUBAGENT_MODEL_CHOICE}${callerInPool ? ` (${callerModelAlias})` : ''}: the main model you are running on, bound with your current thinking level; use it for hard, quality-sensitive subagent tasks`,
  );
  return lines.join('\n');
}

function formatPoolLine(label: string, description: string): string {
  return description === '' ? `- ${label}` : `- ${label}: ${description}`;
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
  resolution: Pick<SubagentBindingResolution, 'model' | 'source'>,
  callerModelAlias: string | undefined,
): unknown {
  if (resolution.source === 'caller' || resolution.source === 'legacy-secondary') return error;
  if (resolution.model === callerModelAlias) return error;
  if (!isError2(error) || error.code !== ErrorCodes.CONFIG_INVALID) return error;
  if (error.details?.['model'] !== resolution.model) return error;
  const route = typeof error.details?.['route'] === 'string' ? error.details['route'] : 'canonical route';
  return new Error2(
    error.code,
    `${error.message} (subagent model "${resolution.model}" comes from [subagent] ${route} — configure it through /preset or [subagent.agents])`,
    {
      cause: error,
      name: error.name,
      details: {
        ...error.details,
        subagentModel: resolution.model,
        subagentModelConfig: {
          section: 'subagent',
          route,
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
