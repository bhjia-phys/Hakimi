/**
 * `subagent` domain — registers the subagent feature flags into `flag`.
 *
 * Two flags: the deprecated `secondary-model` fallback flag, which enables
 * best-effort legacy `[secondary_model]` aliases for Agent, AgentSwarm, and
 * Tower workers when no canonical preset is active (off by default), and the
 * `auto_subagent_preset` flag that gates the engine's automatic subagent-preset
 * switching (off by default; also requires `enabled = true` under
 * `[subagent.auto_preset]`).
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

export const AUTO_SUBAGENT_PRESET_FLAG_ID = 'auto_subagent_preset';
export const AUTO_SUBAGENT_PRESET_FLAG_ENV = 'KIMI_CODE_EXPERIMENTAL_AUTO_SUBAGENT_PRESET';

export const autoSubagentPresetFlag: FlagDefinitionInput = {
  id: AUTO_SUBAGENT_PRESET_FLAG_ID,
  title: 'Automatic subagent preset switching',
  description:
    'Let the engine evaluate provider usage and per-subagent token usage before relevant Agent, AgentSwarm, or Tower spawns and rebindable resumes, then automatically activate the best configured `[subagent].preset`. Requires `enabled = true` under `[subagent.auto_preset]`; the decision only writes `[subagent].preset` and never blocks a spawn or resume.',
  env: AUTO_SUBAGENT_PRESET_FLAG_ENV,
  default: false,
  surface: 'core',
};

registerFlagDefinition(autoSubagentPresetFlag);
