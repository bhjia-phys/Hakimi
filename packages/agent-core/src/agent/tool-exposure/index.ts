import type { ResearchContextPack } from '../../research-context';
import { DEFAULT_RESEARCH_ACTIONS, primitiveToolNamesForAction } from '../../research-action';

export type RuntimeToolExposureSource = 'controller' | 'replay';

export interface RuntimeToolExposurePlan {
  readonly managedToolNames: readonly string[];
  readonly activeToolNames: readonly string[];
  readonly workFrameId: string;
  readonly contextPackId: string;
  readonly reason: string;
}

const MANAGED_RESEARCH_TOOLS = [
  'PhysicsMemory',
  'ResearchLedger',
  'ResearchAction',
  'Read',
  'Grep',
  'Glob',
  'WebSearch',
  'FetchURL',
  'Bash',
  'Write',
  'Edit',
] as const;

const THEORY_RESEARCH_TOOLS = [
  'PhysicsMemory',
  'ResearchLedger',
  'ResearchAction',
  'Read',
  'Grep',
  'Glob',
] as const;
const CODE_RESEARCH_TOOLS = [
  'PhysicsMemory',
  'ResearchLedger',
  'ResearchAction',
  'Read',
  'Grep',
  'Glob',
  'Bash',
  'Write',
  'Edit',
] as const;
const DEFAULT_ACTION_BY_ID = new Map(DEFAULT_RESEARCH_ACTIONS.map((action) => [action.id, action]));

export function buildRuntimeToolExposurePlan(
  pack: ResearchContextPack,
): RuntimeToolExposurePlan {
  const workflowTools = new Set<string>(pack.workflows.flatMap((workflow) => workflow.requiredTools));
  const primitiveTools = new Set<string>(
    pack.actionBindings.flatMap((binding) => primitiveToolsForActionId(binding.actionId)),
  );
  const hasCodeIntent =
    pack.domain === 'librpa' ||
    pack.actionBindings.some((binding) =>
      binding.actionId.startsWith('code.') || binding.actionId.startsWith('benchmark.'),
    ) ||
    [...workflowTools, ...primitiveTools].some(
      (tool) => tool === 'Bash' || tool === 'Write' || tool === 'Edit',
    );

  const activeToolNames = [
    ...(hasCodeIntent ? CODE_RESEARCH_TOOLS : THEORY_RESEARCH_TOOLS),
    ...workflowTools,
    ...primitiveTools,
  ].filter(uniqueNonEmpty);

  return {
    managedToolNames: [...MANAGED_RESEARCH_TOOLS],
    activeToolNames,
    workFrameId: pack.workFrameId,
    contextPackId: pack.id,
    reason: hasCodeIntent
      ? 'Expose code-capable research tools for a code/benchmark-oriented WorkFrame.'
      : 'Expose memory, ledger, and action tools for a theory-oriented WorkFrame.',
  };
}

function primitiveToolsForActionId(actionId: string): readonly string[] {
  const action = DEFAULT_ACTION_BY_ID.get(actionId);
  return action === undefined ? [] : primitiveToolNamesForAction(action);
}

function uniqueNonEmpty(value: string, index: number, array: readonly string[]): boolean {
  return value.length > 0 && array.indexOf(value) === index;
}
