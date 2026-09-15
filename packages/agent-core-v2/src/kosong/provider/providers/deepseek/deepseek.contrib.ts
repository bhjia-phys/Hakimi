/**
 * `kosong/provider` domain — registers official DeepSeek over the OpenAI base.
 *
 * Owns the endpoint, known Flash capabilities, thinking intent, and output
 * token dialect. Message, tool, and reasoning replay stay on the shared base.
 */

import { Error2 } from '#/_base/errors/errors';
import { UNKNOWN_CAPABILITY } from '#/kosong/contract/capability';
import { CONFIG_INVALID_ERROR_CODE } from '#/kosong/contract/errors';
import type { ProtocolEndpoint, ProtocolTrait } from '#/kosong/protocol/protocolTrait';

import { registerProviderDefinition } from '../../providerDefinition';

const deepseekEndpoint: ProtocolEndpoint = {
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  baseUrlEnv: 'DEEPSEEK_BASE_URL',
  defaultBaseUrl: 'https://api.deepseek.com',
};

const flashModels = new Set([
  'deepseek-flash',
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp',
]);

export const deepseekOpenAITrait: ProtocolTrait = {
  endpoint: () => deepseekEndpoint,

  capability: (modelName) =>
    flashModels.has(modelName)
      ? {
          image_in: true,
          video_in: false,
          audio_in: false,
          thinking: true,
          tool_use: true,
          max_context_tokens: 1_048_576,
        }
      : UNKNOWN_CAPABILITY,

  reasoningKey: () => 'reasoning_content',

  withThinking: (effort, _options, generationKwargs) => {
    if (!['off', 'on', 'low', 'high', 'max'].includes(effort)) {
      throw new Error2(
        CONFIG_INVALID_ERROR_CODE,
        'DeepSeek thinking effort must be off, on, low, high, or max.',
        { details: { provider: 'deepseek', effort } },
      );
    }
    const {
      thinking: _thinking,
      reasoning_effort: _reasoningEffort,
      ...extraBody
    } = (generationKwargs['extra_body'] ?? {}) as Record<string, unknown>;
    return {
      extra_body: extraBody,
      thinking: { type: effort === 'off' ? 'disabled' : 'enabled' },
      reasoning_effort: effort === 'off' || effort === 'on' ? undefined : effort,
    };
  },

  withMaxCompletionTokens: (maxCompletionTokens) => ({ max_tokens: maxCompletionTokens }),

  buildParams: (params) => {
    const { extra_body: extraBody, ...rest } = params;
    const { max_completion_tokens: maxCompletionTokens, ...out } = {
      ...(extraBody as Record<string, unknown> | undefined),
      ...rest,
    };
    if (out['max_tokens'] === undefined && maxCompletionTokens !== undefined) {
      out['max_tokens'] = maxCompletionTokens;
    }
    return out;
  },
};

registerProviderDefinition({
  id: 'deepseek',
  baseProtocol: 'openai',
  traits: [deepseekOpenAITrait],
  endpoint: deepseekEndpoint,
});
