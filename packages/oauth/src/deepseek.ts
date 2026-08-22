import { readApiErrorMessage } from './api-error';
import { parseKimiCodeCustomHeaders } from './identity';
import { mergeRefreshedModelAlias } from './model-alias-merge';
import type {
  ManagedKimiConfigShape,
  ManagedKimiModelAlias,
} from './managed-kimi-code';
import { isRecord } from './utils';

export const DEEPSEEK_PROVIDER_ID = 'deepseek';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-pro';
export const DEEPSEEK_DEFAULT_CONTEXT_SIZE = 1_000_000;
export const DEEPSEEK_DEFAULT_MAX_OUTPUT_SIZE = 384_000;
export const DEEPSEEK_VISION_MODEL_PREFIX = 'deepseek-v4-flash-vision';

const DEEPSEEK_MODEL_FIELDS: ReadonlySet<string> = new Set([
  'provider',
  'model',
  'maxContextSize',
  'maxOutputSize',
  'capabilities',
  'displayName',
]);

export interface DeepSeekModelInfo {
  readonly id: string;
  readonly maxContextSize: number;
  readonly maxOutputSize: number;
  readonly capabilities: readonly string[];
  readonly displayName: string;
}

export interface DeepSeekProviderView {
  readonly type?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly env?: unknown;
  readonly source?: unknown;
}

export class DeepSeekModelsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DeepSeekModelsApiError';
    this.status = status;
  }
}

export function isDeepSeekVisionModel(model: string): boolean {
  return model.trim().toLowerCase().startsWith(DEEPSEEK_VISION_MODEL_PREFIX);
}

export function isDeepSeekThinkingCapable(model: string): boolean {
  return model.trim().toLowerCase() !== 'deepseek-chat';
}

export function deepSeekDisplayName(model: string): string {
  switch (model.trim().toLowerCase()) {
    case 'deepseek-v4-pro':
      return 'DeepSeek V4 Pro';
    case 'deepseek-v4-flash':
      return 'DeepSeek V4 Flash';
    case 'deepseek-v4-flash-vision-exp':
      return 'DeepSeek V4 Flash Vision Exp';
    case 'deepseek-reasoner':
      return 'DeepSeek Reasoner';
    case 'deepseek-chat':
      return 'DeepSeek Chat';
    default:
      return `DeepSeek ${model}`;
  }
}

export function deepSeekCapabilities(model: string): string[] {
  const capabilities: string[] = [];
  if (isDeepSeekVisionModel(model)) capabilities.push('image_in');
  if (isDeepSeekThinkingCapable(model)) capabilities.push('thinking');
  capabilities.push('tool_use');
  return capabilities;
}

export function deepSeekModelInfo(id: string): DeepSeekModelInfo {
  return {
    id,
    maxContextSize: DEEPSEEK_DEFAULT_CONTEXT_SIZE,
    maxOutputSize: DEEPSEEK_DEFAULT_MAX_OUTPUT_SIZE,
    capabilities: deepSeekCapabilities(id),
    displayName: deepSeekDisplayName(id),
  };
}

export function isDeepSeekProvider(provider: DeepSeekProviderView): boolean {
  if (!isRecord(provider.source)) return false;
  return provider.source['kind'] === 'deepseek';
}

export function resolveDeepSeekProviderApiKey(
  provider: DeepSeekProviderView,
): string | undefined {
  if (typeof provider.apiKey === 'string' && provider.apiKey.length > 0) {
    return provider.apiKey;
  }
  if (!isRecord(provider.env)) return undefined;
  const value = provider.env['DEEPSEEK_API_KEY'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function fetchDeepSeekModels(options: {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<DeepSeekModelInfo[]> {
  const baseUrl = (options.baseUrl ?? DEEPSEEK_BASE_URL).replace(/\/+$/, '');
  const res = await (options.fetchImpl ?? fetch)(`${baseUrl}/models`, {
    headers: {
      ...parseKimiCodeCustomHeaders(),
      Authorization: `Bearer ${options.apiKey}`,
      Accept: 'application/json',
    },
    signal: options.signal,
  });
  if (!res.ok) {
    throw new DeepSeekModelsApiError(
      await readApiErrorMessage(res, `Failed to list DeepSeek models (HTTP ${res.status}).`),
      res.status,
    );
  }
  const payload: unknown = await res.json();
  if (!isRecord(payload) || !Array.isArray(payload['data'])) {
    throw new Error(`Unexpected models response for ${baseUrl}.`);
  }
  const ids = new Set<string>();
  for (const item of payload['data']) {
    if (!isRecord(item)) continue;
    const id = item['id'];
    if (typeof id === 'string' && id.length > 0) ids.add(id);
  }
  return [...ids].map(deepSeekModelInfo);
}

export function applyDeepSeekProviderModels(
  config: ManagedKimiConfigShape,
  providerId: string,
  models: readonly DeepSeekModelInfo[],
): void {
  const existingModels = config.models ?? {};
  const prefix = `${providerId}/`;
  const upstreamKeys = new Set(models.map((model) => `${prefix}${model.id}`));

  for (const [alias, raw] of Object.entries(existingModels)) {
    if (!alias.startsWith(prefix) || !isRecord(raw) || raw['provider'] !== providerId) continue;
    // Canonical aliases are generated as `<provider>/<model-id>`. Keep
    // differently named aliases because they may be user-owned routes to the
    // same upstream model.
    const modelId = raw['model'];
    if (typeof modelId === 'string' && alias === `${prefix}${modelId}` && !upstreamKeys.has(alias)) {
      delete existingModels[alias];
    }
  }

  for (const model of models) {
    const alias = `${prefix}${model.id}`;
    const remote: ManagedKimiModelAlias = {
      provider: providerId,
      model: model.id,
      maxContextSize: model.maxContextSize,
      maxOutputSize: model.maxOutputSize,
      capabilities: [...model.capabilities],
      displayName: model.displayName,
    };
    existingModels[alias] = mergeRefreshedModelAlias(
      existingModels[alias],
      remote,
      DEEPSEEK_MODEL_FIELDS,
    );
  }
  config.models = existingModels;
}
