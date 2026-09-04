/**
 * `aitpResearch` domain — pure Research tool capability classification.
 *
 * The executor guard consumes this vocabulary. Known control tools do not do
 * scientific work, checkpoint persistence has its own narrow lease, known
 * work tools map to one capability, and every unknown tool requires an exact
 * `tool:<name>` grant. Scope-agnostic.
 */

export type ResearchExecutionCapability =
  | 'workspace_read'
  | 'workspace_write'
  | 'web_search'
  | 'web_fetch'
  | 'shell'
  | 'task'
  | 'subagent'
  | 'scheduler';

export type ResearchToolClassification =
  | { readonly kind: 'control' }
  | { readonly kind: 'checkpoint_persistence' }
  | { readonly kind: 'distillation_persistence' }
  | {
      readonly kind: 'work';
      readonly capability: ResearchExecutionCapability | `tool:${string}`;
    };

const CONTROL_TOOLS = new Set([
  'AcknowledgeResearchAlert',
  'ActivateResearchPlanV2',
  'AskUserQuestion',
  'BeginResearchAction',
  'ClearResearchWorkstreamBinding',
  'CompleteResearchAction',
  'CompleteResearchPlanV2',
  'ConcludeResearchAction',
  'ConfirmResearchWorkstreamBinding',
  'CreateGoal',
  'CreateResearchLine',
  'CreateResearchQuestion',
  'DiscardHistoricalResearchCheckpoint',
  'DiscardResearchPlanV2',
  'EnterAITPMode',
  'EnterPlanMode',
  'ExitAITPMode',
  'ExitPlanMode',
  'GetGoal',
  'GetProviderUsage',
  'GetResearchStatus',
  'ObserveResearchRun',
  'PlanResearchAction',
  'PrepareResearchPlanV2',
  'ProposeResearchCheckpoint',
  'RecordResearchProgress',
  'RequestResearchDecision',
  'ResolveResearchDecision',
  'ReviewResearchEvidence',
  'SetGoalBudget',
  'SetResearchFocus',
  'SetResearchPhase',
  'SetSubagentPreset',
  'Skill',
  'StartResearchAction',
  'TodoList',
  'UpdateGoal',
  'UpdateResearchLine',
  'UpdateResearchQuestion',
  'aitp_check',
  'aitp_enter',
  'aitp_list',
  'aitp_show',
  'select_tools',
]);

const CHECKPOINT_PERSISTENCE_TOOLS = new Set([
  'CommitResearchCheckpoint',
  'aitp_record_prepare',
  'aitp_record_save',
]);

const DISTILLATION_PERSISTENCE_TOOLS = new Set([
  'aitp_note_prepare',
  'aitp_note_save',
]);

const TOOL_CAPABILITIES = new Map<string, ResearchExecutionCapability>([
  ['Bash', 'shell'],
  ['Edit', 'workspace_write'],
  ['FetchURL', 'web_fetch'],
  ['Glob', 'workspace_read'],
  ['Grep', 'workspace_read'],
  ['Read', 'workspace_read'],
  ['ReadMediaFile', 'workspace_read'],
  ['WebSearch', 'web_search'],
  ['Write', 'workspace_write'],
  ['TaskList', 'task'],
  ['TaskOutput', 'task'],
  ['TaskStop', 'task'],
  ['AgentSwarm', 'subagent'],
  ['Agent', 'subagent'],
  ['TowerFinding', 'subagent'],
  ['TowerInbox', 'subagent'],
  ['TowerInit', 'subagent'],
  ['TowerMerge', 'subagent'],
  ['TowerMission', 'subagent'],
  ['TowerPlan', 'subagent'],
  ['TowerReview', 'subagent'],
  ['TowerSend', 'subagent'],
  ['TowerSpawn', 'subagent'],
  ['TowerStatus', 'subagent'],
  ['TowerTeardown', 'subagent'],
  ['CronCreate', 'scheduler'],
  ['CronDelete', 'scheduler'],
  ['CronList', 'scheduler'],
]);

const CAPABILITY_ALIASES = new Map<string, ResearchExecutionCapability>([
  ['bash', 'shell'],
  ['edit', 'workspace_write'],
  ['fetchurl', 'web_fetch'],
  ['glob', 'workspace_read'],
  ['grep', 'workspace_read'],
  ['read', 'workspace_read'],
  ['readmediafile', 'workspace_read'],
  ['websearch', 'web_search'],
  ['write', 'workspace_write'],
]);

export function classifyResearchTool(toolName: string): ResearchToolClassification {
  if (CONTROL_TOOLS.has(toolName)) return { kind: 'control' };
  if (CHECKPOINT_PERSISTENCE_TOOLS.has(toolName)) {
    return { kind: 'checkpoint_persistence' };
  }
  if (DISTILLATION_PERSISTENCE_TOOLS.has(toolName)) {
    return { kind: 'distillation_persistence' };
  }
  const capability = TOOL_CAPABILITIES.get(toolName);
  return capability === undefined
    ? { kind: 'work', capability: `tool:${toolName.toLocaleLowerCase('en-US')}` }
    : { kind: 'work', capability };
}

export function researchCapabilityGranted(
  allowedToolKinds: readonly string[],
  toolName: string,
  capability: ResearchExecutionCapability | `tool:${string}`,
): boolean {
  const exactTool = `tool:${toolName.toLocaleLowerCase('en-US')}`;
  for (const raw of allowedToolKinds) {
    const allowed = raw.trim().toLocaleLowerCase('en-US');
    if (allowed === capability || allowed === exactTool) return true;
    if (CAPABILITY_ALIASES.get(allowed) === capability) return true;
  }
  return false;
}
