import type { FlagDefinitionInput } from './types';

/**
 * Experimental feature flags.
 *
 * To add one, append an entry and gate runtime behavior through the scoped
 * resolver available on `KimiCore`, `Session`, or `Agent`:
 *   { id: 'my_feature', title: 'My feature', description: '...', env: 'KIMI_CODE_EXPERIMENTAL_MY_FEATURE', default: false, surface: 'both' }
 *
 * Keep the `as const satisfies` — it derives the literal `FlagId` union that gives `enabled()`
 * autocomplete and typo-checking. `env` must start with 'KIMI_CODE_EXPERIMENTAL_', be unique, and
 * not equal the master switch 'KIMI_CODE_EXPERIMENTAL_FLAG'; `id` must not be 'flag'.
 */
export const FLAG_DEFINITIONS = [
  // Micro compaction has been disabled and removed: the capability cannot be
  // enabled via env, config, or the master experimental switch. The entry is
  // kept here commented out so it can be restored if the feature is revived.
  // {
  //   id: 'micro_compaction',
  //   title: 'Micro compaction',
  //   description: 'Trim older large tool results from context while keeping recent conversation intact.',
  //   env: 'KIMI_CODE_EXPERIMENTAL_MICRO_COMPACTION',
  //   default: false,
  //   surface: 'core',
  // },
  {
    id: 'tool-select',
    title: 'Tool select (progressive tool disclosure)',
    description:
      'Keep MCP tool schemas out of the immutable top-level tools[]; the model loads them on demand via the select_tools tool. Only takes effect on models whose capability catalog declares dynamically loaded tools.',
    env: 'KIMI_CODE_EXPERIMENTAL_TOOL_SELECT',
    default: false,
    surface: 'core',
  },
  {
    id: 'physics-memory',
    title: 'Physics memory',
    description: 'Load theoretical-physics memory capsules into Hakimi sessions.',
    env: 'KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY',
    default: false,
    surface: 'core',
  },
  {
    id: 'research-ledger',
    title: 'Research ledger',
    description: 'Expose append-only research progress and proposal tools.',
    env: 'KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER',
    default: false,
    surface: 'core',
  },
  {
    id: 'research-action',
    title: 'Research actions',
    description: 'Expose native research-action orchestration tools.',
    env: 'KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION',
    default: false,
    surface: 'core',
  },
  {
    id: 'domain-profile',
    title: 'Domain profiles',
    description: 'Load domain profiles for research context compilation.',
    env: 'KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE',
    default: false,
    surface: 'core',
  },
  {
    id: 'workflow-recipe',
    title: 'Workflow recipes',
    description: 'Load reusable research workflow recipes.',
    env: 'KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE',
    default: false,
    surface: 'core',
  },
  {
    id: 'research-harness',
    title: 'Research harness',
    description: 'Load local research eval cases and benchmark adapters.',
    env: 'KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS',
    default: false,
    surface: 'core',
  },
  {
    id: 'micro-compaction',
    title: 'Micro compaction',
    description: 'Trim older large tool results from context while keeping recent conversation intact.',
    env: 'KIMI_CODE_EXPERIMENTAL_MICRO_COMPACTION',
    default: false,
    surface: 'core',
  },
] as const satisfies readonly FlagDefinitionInput[];

/** Literal union of registered flag ids. */
export type FlagId = (typeof FLAG_DEFINITIONS)[number]['id'];
