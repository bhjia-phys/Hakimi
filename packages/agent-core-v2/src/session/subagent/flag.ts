/**
 * `subagent` domain — registers the deprecated `secondary-model` fallback flag
 * into `flag`.
 *
 * Enables best-effort legacy `[secondary_model]` aliases for Agent,
 * AgentSwarm, and Tower workers when no canonical preset is active. It does
 * not add a model choice to the agent-facing tool schemas or make legacy pool
 * validation a startup blocker. Off by default; enable via
 * `KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL`, the master
 * `KIMI_CODE_EXPERIMENTAL_FLAG`, or the `[experimental]` config section.
 */

import { type FlagDefinitionInput, registerFlagDefinition } from '#/app/flag/flagRegistry';

export const SECONDARY_MODEL_FLAG_ID = 'secondary-model';
export const SECONDARY_MODEL_FLAG_ENV = 'KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL';

export const secondaryModelFlag: FlagDefinitionInput = {
  id: SECONDARY_MODEL_FLAG_ID,
  title: 'Legacy secondary model fallback',
  description:
    'Allow Agent, AgentSwarm, and Tower workers to use a legacy [secondary_model] alias when no canonical preset is active; canonical [subagent] routes take precedence and Tower reviewers never use this fallback.',
  env: SECONDARY_MODEL_FLAG_ENV,
  default: false,
  surface: 'core',
};

registerFlagDefinition(secondaryModelFlag);
