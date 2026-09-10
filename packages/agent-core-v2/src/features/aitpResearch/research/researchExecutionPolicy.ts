/**
 * Research-owned operation routing, not execution permission.
 * Ordinary tools (including shell and MCP) retain their normal tool policies;
 * Research only routes its control operations and owned memory persistence.
 */

export type ResearchToolClassification =
  | { readonly kind: 'control' }
  | { readonly kind: 'checkpoint_persistence' }
  | { readonly kind: 'distillation_persistence' }
  | { readonly kind: 'work' };

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
  'ReadResearchCheckpointEvidence',
  'CommitResearchCheckpoint',
  'aitp_record_prepare',
  'aitp_record_save',
]);

const DISTILLATION_PERSISTENCE_TOOLS = new Set([
  'aitp_note_prepare',
  'aitp_note_save',
]);

export function classifyResearchTool(toolName: string): ResearchToolClassification {
  if (CONTROL_TOOLS.has(toolName)) return { kind: 'control' };
  if (CHECKPOINT_PERSISTENCE_TOOLS.has(toolName)) return { kind: 'checkpoint_persistence' };
  if (DISTILLATION_PERSISTENCE_TOOLS.has(toolName)) return { kind: 'distillation_persistence' };
  return { kind: 'work' };
}
