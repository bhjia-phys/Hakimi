/** Registers the experimental ChatGPT OAuth provider flag. */

import { type FlagDefinitionInput, registerFlagDefinition } from '#/app/flag/flagRegistry';

export const OPENAI_CODEX_OAUTH_FLAG_ID = 'openai-codex-oauth';

export const openAICodexOAuthFlag: FlagDefinitionInput = {
  id: OPENAI_CODEX_OAUTH_FLAG_ID,
  title: 'ChatGPT / OpenAI Codex OAuth',
  description:
    'Allow Hakimi to authenticate with a ChatGPT subscription and use the OpenAI Codex backend.',
  env: 'KIMI_CODE_EXPERIMENTAL_OPENAI_CODEX_OAUTH',
  default: false,
  surface: 'both',
};

registerFlagDefinition(openAICodexOAuthFlag);
