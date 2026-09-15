/**
 * `providerUsage` domain — registers the provider-usage feature flags into `flag`.
 *
 * The `deepseek_usage` flag gates official DeepSeek metered usage + balance:
 * when off, a DeepSeek provider keeps reporting `unsupported` and no attempt
 * is recorded; when on, the provider reports local today/month token and
 * estimated-CNY metered usage alongside the official account balance.
 */

import { type FlagDefinitionInput, registerFlagDefinition } from '#/app/flag/flagRegistry';

export const DEEPSEEK_USAGE_FLAG_ID = 'deepseek_usage';
export const DEEPSEEK_USAGE_FLAG_ENV = 'KIMI_CODE_EXPERIMENTAL_DEEPSEEK_USAGE';

export const deepseekUsageFlag: FlagDefinitionInput = {
  id: DEEPSEEK_USAGE_FLAG_ID,
  title: 'Official DeepSeek metered usage and balance',
  description:
    'Record local today/month DeepSeek token usage with estimated CNY cost and query the official account balance for the configured official DeepSeek provider.',
  env: DEEPSEEK_USAGE_FLAG_ENV,
  default: false,
  surface: 'both',
};

registerFlagDefinition(deepseekUsageFlag);
