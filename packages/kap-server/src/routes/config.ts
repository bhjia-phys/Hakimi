/**
 * `/config` route handlers — server-v2 port.
 *
 * Implements the v1 `/api/v1/config` wire contract plus the v2 automatic-preset
 * runtime status boundary on top of `agent-core-v2`'s section registry and
 * canonical preset services:
 *   GET  /config                            — global configuration, secrets redacted
 *   GET  /config/subagent-preset/status     — latest process-local automatic evaluation
 *   POST /config                            — update configuration (merge semantics)
 *   POST /config/subagent-preset/activate   — validate and serialize manual routing changes
 *
 * **Wire fidelity**: reuses the local `protocol/rest-config` schemas and explicit
 * projectors. v2's `IConfigService` is a per-domain registry (`get(domain)` /
 * `set(domain, patch)`) and does not expose a whole-config view or redaction, so
 * this route is the edge facade that:
 *   - projects `getAll()` (camelCase resolved config) into the snake_case
 *     `ConfigResponse`, projecting providers to `has_api_key`, recursively
 *     removing credential fields elsewhere, and omitting the arbitrary `raw`
 *     domain so REST/WS/journal outputs share one safe view;
 *   - projects the App-scope evaluator's in-memory status field-by-field without
 *     adding it to `/config` or persisting it to `config.toml`;
 *   - splits v1's flat multi-domain `POST /config` patch into per-domain
 *     `IConfigService.set(domain, value)` calls (snake_case → camelCase), except
 *     an own `[subagent].preset` field, which is committed last through the
 *     shared manual activation boundary while the remaining fields still merge.
 *
 * The process-wide config bridge in `start.ts` observes config writes alongside
 * internal tool writes and external reloads, then publishes the secret-free
 * `event.config.changed` snapshot. Runtime status never enters that bridge.
 */

import {
  IAutoSubagentPresetService,
  IConfigService,
  ISubagentPresetActivationService,
  type Scope,
} from '@moonshot-ai/agent-core-v2';

import { errEnvelope, okEnvelope } from '../envelope';
import { requestLog } from '../lib/requestLog';
import { defineRoute } from '../middleware/defineRoute';
import { ErrorCode } from '../protocol/error-codes';
import {
  configResponseSchema,
  patchConfigRequestSchema,
  projectSubagentPresetStatus,
  subagentPresetActivationRequestSchema,
  subagentPresetActivationResponseSchema,
  subagentPresetStatusResponseSchema,
} from '../protocol/rest-config';
import type { ConfigResponse } from '../protocol/rest-config';

type ProviderResponse = ConfigResponse['providers'][string];

interface ConfigRouteHost {
  get(
    path: string,
    options: { schema?: Record<string, unknown> },
    handler: (
      req: { id: string },
      reply: { send(payload: unknown): void },
    ) => Promise<void> | void,
  ): unknown;
  post(
    path: string,
    options: { schema?: Record<string, unknown> },
    handler: (
      req: { id: string; body: unknown },
      reply: { send(payload: unknown): void },
    ) => Promise<void> | void,
  ): unknown;
}

export function registerConfigRoutes(app: ConfigRouteHost, core: Scope): void {
  const getRoute = defineRoute(
    {
      method: 'GET',
      path: '/config',
      success: { data: configResponseSchema },
      description: 'Get the global Kimi configuration (secrets redacted)',
      tags: ['config'],
    },
    async (req, reply) => {
      const config = core.accessor.get(IConfigService);
      await config.ready;
      reply.send(okEnvelope(toConfigResponse(config.getAll()), req.id));
    },
  );
  app.get(getRoute.path, getRoute.options, getRoute.handler as Parameters<ConfigRouteHost['get']>[2]);

  const presetStatusRoute = defineRoute(
    {
      method: 'GET',
      path: '/config/subagent-preset/status',
      success: { data: subagentPresetStatusResponseSchema },
      description: 'Get the latest process-local automatic subagent-preset evaluation',
      tags: ['config'],
    },
    (req, reply) => {
      const status = core.accessor.get(IAutoSubagentPresetService).status();
      reply.send(okEnvelope(projectSubagentPresetStatus(status) ?? null, req.id));
    },
  );
  app.get(
    presetStatusRoute.path,
    presetStatusRoute.options,
    presetStatusRoute.handler as Parameters<ConfigRouteHost['get']>[2],
  );

  const activatePresetRoute = defineRoute(
    {
      method: 'POST',
      path: '/config/subagent-preset/activate',
      body: subagentPresetActivationRequestSchema,
      success: { data: subagentPresetActivationResponseSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: {},
      },
      description: 'Validate and activate a subagent routing preset; empty selects base routing',
      tags: ['config'],
    },
    async (req, reply) => {
      try {
        const { preset } = subagentPresetActivationRequestSchema.parse(req.body);
        const config = core.accessor.get(IConfigService);
        await config.ready;
        const result = await core.accessor.get(ISubagentPresetActivationService).activate(preset);
        if (result.kind !== 'activated') {
          requestLog(req)?.warn({ preset, kind: result.kind }, 'subagent preset activation rejected');
          reply.send(errEnvelope(ErrorCode.VALIDATION_FAILED, result.message, req.id));
          return;
        }
        requestLog(req)?.info({ preset }, 'subagent preset activated');
        reply.send(
          okEnvelope(
            {
              config: toConfigResponse(config.getAll()),
              warning: result.warning,
            },
            req.id,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        requestLog(req)?.error({ err: error }, 'subagent preset activation failed');
        reply.send(errEnvelope(ErrorCode.VALIDATION_FAILED, message, req.id));
      }
    },
  );
  app.post(
    activatePresetRoute.path,
    activatePresetRoute.options,
    activatePresetRoute.handler as Parameters<ConfigRouteHost['post']>[2],
  );

  const setRoute = defineRoute(
    {
      method: 'POST',
      path: '/config',
      body: patchConfigRequestSchema,
      success: { data: configResponseSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: {},
      },
      description: 'Update the global Kimi configuration (merge semantics)',
      tags: ['config'],
    },
    async (req, reply) => {
      try {
        const config = core.accessor.get(IConfigService);
        await config.ready;
        const camelPatch = convertKeysSnakeToCamel(req.body) as Record<string, unknown>;
        // v1 wire sugar: `yolo: true` is an alias for
        // `default_permission_mode = 'yolo'`. Fold it into the canonical domain and
        // drop the key so `yolo` is never a config domain and never persisted.
        if (camelPatch['yolo'] === true) {
          camelPatch['defaultPermissionMode'] = 'yolo';
        }
        delete camelPatch['yolo'];
        let manualPreset: string | undefined;
        const subagentPatch = camelPatch['subagent'];
        if (isPlainObject(subagentPatch) && Object.hasOwn(subagentPatch, 'preset')) {
          if (typeof subagentPatch['preset'] !== 'string') {
            throw new TypeError('subagent.preset must be a string');
          }
          manualPreset = subagentPatch['preset'];
          delete subagentPatch['preset'];
          if (Object.keys(subagentPatch).length === 0) delete camelPatch['subagent'];
        }
        for (const domain of Object.keys(camelPatch)) {
          await config.set(domain, camelPatch[domain]);
        }
        if (manualPreset !== undefined) {
          const result = await core.accessor
            .get(ISubagentPresetActivationService)
            .activate(manualPreset);
          if (result.kind !== 'activated') throw new Error(result.message);
        }
        const response = toConfigResponse(config.getAll());
        const changedFields = Object.keys(req.body as Record<string, unknown>);
        // The process-wide config bridge publishes the corresponding
        // `event.config.changed` after all domain writes settle.
        // Only the changed field *names* — values may carry secrets.
        requestLog(req)?.info({ changedFields }, 'config updated');
        reply.send(okEnvelope(response, req.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        requestLog(req)?.error({ err: error }, 'config update failed');
        reply.send(errEnvelope(ErrorCode.VALIDATION_FAILED, message, req.id));
      }
    },
  );
  app.post(setRoute.path, setRoute.options, setRoute.handler as Parameters<ConfigRouteHost['post']>[2]);
}

// ---------------------------------------------------------------------------
// Edge facade — project the v2 resolved config into the v1 `ConfigResponse`
// wire shape. Only domains in the public v1 contract may cross this edge;
// unknown plugin/future domains and the arbitrary `raw` domain are omitted
// because no finite redaction policy can make unknown values safe over REST,
// WS, or the durable global event journal. Credential-bearing passthrough
// domains use explicit public projections; remaining fixed-schema domains are
// recursively scrubbed. The process-wide config bridge reuses this projection.
// ---------------------------------------------------------------------------

const PUBLIC_CONFIG_DOMAINS = new Set([
  'providers',
  'defaultProvider',
  'defaultModel',
  'models',
  'thinking',
  'planMode',
  'defaultPermissionMode',
  'defaultPlanMode',
  'permission',
  'hooks',
  'services',
  'mergeAllAvailableSkills',
  'extraSkillDirs',
  'loopControl',
  'background',
  'subagent',
  'secondaryModel',
  'experimental',
  'telemetry',
]);

export function toConfigResponse(resolved: Record<string, unknown>): ConfigResponse {
  const wire: Record<string, unknown> = {};
  for (const [domain, value] of Object.entries(resolved)) {
    if (!PUBLIC_CONFIG_DOMAINS.has(domain)) continue;
    let projected: unknown;
    switch (domain) {
      case 'providers':
        projected = toProviderResponses(value);
        break;
      case 'models':
        projected = toModelResponses(value);
        break;
      case 'services':
        projected = toServiceResponses(value);
        break;
      default:
        projected = redactConfigValue(value);
    }
    wire[camelToSnake(domain)] = projected;
  }
  // v1 wire echo: surface `yolo` as a derived boolean of the effective default
  // permission mode. `yolo` is not a config domain; it is computed here so the
  // v1 `/config` shape is preserved without persisting a parallel field.
  const defaultPermissionMode = resolved['defaultPermissionMode'];
  if (typeof defaultPermissionMode === 'string') {
    wire['yolo'] = defaultPermissionMode === 'yolo';
  }
  // `providers` is required by `ConfigResponse` even when no provider is configured.
  if (wire['providers'] === undefined) {
    wire['providers'] = {};
  }
  return wire as ConfigResponse;
}

function redactConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactConfigValue);
  if (!isPlainObject(value)) return value;
  const safe: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveConfigKey(key)) continue;
    safe[key] = redactConfigValue(child);
  }
  return safe;
}

function isSensitiveConfigKey(key: string): boolean {
  const normalized = key.replaceAll(/[-_\s]/g, '').toLowerCase();
  return (
    normalized === 'oauth' ||
    normalized === 'customheaders' ||
    normalized === 'authorization' ||
    normalized === 'proxyauthorization' ||
    normalized === 'cookie' ||
    normalized === 'setcookie' ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('accesstoken') ||
    normalized.endsWith('refreshtoken') ||
    normalized.endsWith('clientsecret') ||
    normalized.endsWith('password')
  );
}

const MODEL_RESPONSE_KEYS = [
  'providerId',
  'baseUrl',
  'protocol',
  'name',
  'aliases',
  'provider',
  'model',
  'maxContextSize',
  'maxInputSize',
  'maxOutputSize',
  'capabilities',
  'displayName',
  'reasoningKey',
  'adaptiveThinking',
  'betaApi',
  'supportEfforts',
  'defaultEffort',
  'offEffort',
] as const;

const MODEL_OVERRIDE_RESPONSE_KEYS = [
  'maxContextSize',
  'maxInputSize',
  'maxOutputSize',
  'capabilities',
  'displayName',
  'reasoningKey',
  'adaptiveThinking',
  'supportEfforts',
  'defaultEffort',
  'offEffort',
] as const;

const PUBLIC_MODEL_PROTOCOLS = new Set([
  'anthropic',
  'openai',
  'openai_responses',
  'google-genai',
]);

function toModelResponses(value: unknown): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  if (!isPlainObject(value)) return result;
  for (const [id, raw] of Object.entries(value)) {
    if (!isPlainObject(raw)) continue;
    const model = pickPublicFields(raw, MODEL_RESPONSE_KEYS);
    if (
      model['protocol'] !== undefined &&
      (typeof model['protocol'] !== 'string' || !PUBLIC_MODEL_PROTOCOLS.has(model['protocol']))
    ) {
      delete model['protocol'];
    }
    if (isPlainObject(raw['overrides'])) {
      model['overrides'] = pickPublicFields(raw['overrides'], MODEL_OVERRIDE_RESPONSE_KEYS);
    }
    result[id] = model;
  }
  return result;
}

function pickPublicFields(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  return result;
}

function toServiceResponses(value: unknown): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  if (!isPlainObject(value)) return result;
  for (const key of ['moonshotSearch', 'moonshotFetch'] as const) {
    const raw = value[key];
    if (!isPlainObject(raw)) continue;
    result[key] = typeof raw['baseUrl'] === 'string' ? { baseUrl: raw['baseUrl'] } : {};
  }
  return result;
}

interface ProviderLike {
  readonly type?: unknown;
  readonly baseUrl?: unknown;
  readonly defaultModel?: unknown;
  readonly apiKey?: unknown;
  readonly oauth?: unknown;
}

function toProviderResponses(value: unknown): Record<string, ProviderResponse> {
  const result: Record<string, ProviderResponse> = {};
  if (!isPlainObject(value)) return result;
  for (const [id, raw] of Object.entries(value)) {
    const provider = raw as ProviderLike;
    result[id] = {
      type: typeof provider.type === 'string' ? provider.type : '',
      base_url: nonEmpty(provider.baseUrl),
      default_model: nonEmpty(provider.defaultModel),
      has_api_key: hasProviderCredential(provider),
    };
  }
  return result;
}

function hasProviderCredential(provider: ProviderLike): boolean {
  if (nonEmpty(provider.apiKey) !== undefined) return true;
  if (provider.oauth !== undefined) return true;
  return false;
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Config properties whose values are maps keyed by user-defined identifiers
 * (provider ids, model aliases, subagent pool aliases, flag names). Those keys
 * are data, not field names — snake→camel conversion must pass them through
 * untouched (`fast_model` must not become `fastModel`), while the map *values*
 * (e.g. a provider's `api_key`) still convert. Preserve mode therefore only
 * engages from a normal field-name level: an entry key that happens to match
 * the list (a provider literally named `models`) must not keep its own
 * children preserved.
 */
const MAP_VALUED_CONFIG_KEYS = new Set(['providers', 'models', 'experimental', 'raw']);

function convertKeysSnakeToCamel(obj: unknown, preserveKeys = false): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeysSnakeToCamel(item));
  }
  if (isPlainObject(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[preserveKeys ? key : snakeToCamel(key)] = convertKeysSnakeToCamel(
        value,
        !preserveKeys && MAP_VALUED_CONFIG_KEYS.has(key),
      );
    }
    return result;
  }
  return obj;
}

function snakeToCamel(str: string): string {
  return str.replaceAll(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

/** camelCase → snake_case, used to project config domain keys onto the wire. */
export function camelToSnake(str: string): string {
  return str.replaceAll(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}
