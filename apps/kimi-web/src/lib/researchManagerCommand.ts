import type {
  ResearchCommand,
  ResearchPhase,
  ResearchRunState,
  ResearchSchedulerState,
} from '../api/types';

export type ResearchManagerEditorMode = 'create' | 'edit';

export const RESEARCH_DECISION_NEXT_PHASES = [
  'idle',
  'gap_analysis',
  'action_planned',
  'action_executing',
  'evaluating',
] as const satisfies readonly ResearchPhase[];

export type ResearchManagerDraftTarget =
  | { form: 'line'; mode: 'create'; key: string }
  | { form: 'line'; mode: 'edit'; key: string }
  | { form: 'question'; mode: 'create'; key: string }
  | { form: 'question'; mode: 'edit'; key: string }
  | { form: 'decision'; mode: 'resolve'; key: string }
  | { form: 'evidence'; mode: 'review'; key: string }
  | { form: 'run'; mode: 'observe'; key: string }
  | { form: 'checkpoint'; mode: 'propose'; key: string }
  | { form: 'checkpoint'; mode: 'commit'; key: string };

export interface ResearchManagerCommandRequest {
  id: number;
  command: ResearchCommand;
  draft?: {
    target: ResearchManagerDraftTarget;
    version: number;
    baseRevision?: number;
  };
}

export interface ResearchManagerCommandAck extends ResearchManagerCommandRequest {
  succeeded: boolean;
}

export function researchManagerMutationAllowed(busy: boolean): boolean {
  return !busy;
}

export function researchManagerSessionIsCurrent(
  expectedSessionId: string | null,
  managerSessionId: string | null,
  activeSessionId: string | undefined,
): expectedSessionId is string {
  return expectedSessionId !== null
    && expectedSessionId === managerSessionId
    && expectedSessionId === activeSessionId;
}

export function researchEvidenceDraftTargetKey(target: {
  questionId?: string;
  lineSlug?: string;
  actionId?: string;
}): string {
  return `question:${target.questionId ?? ''}|line:${target.lineSlug ?? ''}|action:${target.actionId ?? ''}`;
}

export function researchCheckpointDraftTargetKey(target: {
  questionId?: string;
  lineSlug?: string;
}): string {
  return target.questionId === undefined
    ? `line:${target.lineSlug ?? ''}`
    : `question:${target.questionId}`;
}

export function researchManagerScienceDraftIsStale(
  dirty: boolean,
  baseRevision: number | null,
  currentRevision: number | null,
  baseTarget: string | null,
  currentTarget: string | null,
): boolean {
  if (!dirty) return false;
  return baseRevision === null
    || currentRevision === null
    || baseRevision !== currentRevision
    || baseTarget === null
    || baseTarget !== currentTarget;
}

export function researchManagerCheckpointDraftIsStale(
  dirty: boolean,
  baseRevision: number | null,
  currentRevision: number | null,
  baseTarget: string | null,
  currentTarget: string | null,
  basePendingCheckpointId: string | null,
  currentPendingCheckpointId: string | null,
): boolean {
  return researchManagerScienceDraftIsStale(
    dirty,
    baseRevision,
    currentRevision,
    baseTarget,
    currentTarget,
  ) || (dirty && basePendingCheckpointId !== currentPendingCheckpointId);
}

export function researchManagerQuestionDraftIsStale(
  dirty: boolean,
  editing: boolean,
  baseSnapshotRevision: number | null,
  currentSnapshotRevision: number | null,
  baseQuestionRevision: number | null,
  currentQuestionRevision: number | null,
): boolean {
  if (!dirty || !editing) return false;
  return baseSnapshotRevision === null
    || currentSnapshotRevision === null
    || baseSnapshotRevision !== currentSnapshotRevision
    || baseQuestionRevision === null
    || currentQuestionRevision === null
    || baseQuestionRevision !== currentQuestionRevision;
}

export function researchRunTerminalStateIsConsistent(
  schedulerState: ResearchSchedulerState,
  terminalState: ResearchRunState['terminalState'] | '',
): boolean {
  if (
    schedulerState === 'completed'
    || schedulerState === 'failed'
    || schedulerState === 'cancelled'
  ) {
    return terminalState === schedulerState;
  }
  return terminalState === '';
}

export interface ResearchManagerDraftContext {
  lineEditorMode: ResearchManagerEditorMode;
  lineSlug: string;
  selectedLineSlug: string;
  questionEditorMode: ResearchManagerEditorMode;
  selectedQuestionId: string;
  decisionGateId: string;
  evidenceTargetKey: string;
  runActionId: string;
  checkpointEntryId: string;
}

export function researchManagerDraftTarget(
  command: ResearchCommand,
): ResearchManagerDraftTarget | null {
  switch (command.kind) {
    case 'create_line':
      return { form: 'line', mode: 'create', key: command.slug };
    case 'update_line':
      return { form: 'line', mode: 'edit', key: command.lineSlug };
    case 'create_question':
      return { form: 'question', mode: 'create', key: command.lineSlug };
    case 'update_question':
      return { form: 'question', mode: 'edit', key: command.questionId };
    case 'resolve_decision':
      return { form: 'decision', mode: 'resolve', key: command.gateId };
    case 'review_evidence':
      return {
        form: 'evidence',
        mode: 'review',
        key: researchEvidenceDraftTargetKey({
          questionId: command.packet.question_id,
          lineSlug: command.packet.line_slug,
          actionId: command.packet.action_id,
        }),
      };
    case 'observe_run':
      return { form: 'run', mode: 'observe', key: command.actionId };
    case 'propose_checkpoint':
      return {
        form: 'checkpoint',
        mode: 'propose',
        key: command.questionId === undefined
          ? `line:${command.lineSlug ?? ''}`
          : `question:${command.questionId}`,
      };
    case 'commit_checkpoint':
      return { form: 'checkpoint', mode: 'commit', key: command.entryId };
    default:
      return null;
  }
}

export function researchManagerDraftTargetMatches(
  target: ResearchManagerDraftTarget,
  context: ResearchManagerDraftContext,
): boolean {
  switch (target.form) {
    case 'line':
      return context.lineEditorMode === target.mode
        && (target.mode === 'create' ? context.lineSlug.trim() : context.selectedLineSlug) === target.key;
    case 'question':
      return context.questionEditorMode === target.mode
        && (target.mode === 'create' ? context.selectedLineSlug : context.selectedQuestionId) === target.key;
    case 'decision':
      return context.decisionGateId === target.key;
    case 'evidence':
      return context.evidenceTargetKey === target.key;
    case 'run':
      return context.runActionId === target.key;
    case 'checkpoint':
      if (target.mode === 'commit') return context.checkpointEntryId.trim() === target.key;
      return target.key === (context.selectedQuestionId === ''
        ? `line:${context.selectedLineSlug}`
        : `question:${context.selectedQuestionId}`);
  }
}

export function researchManagerAckMatchesDraft(
  draft: NonNullable<ResearchManagerCommandAck['draft']>,
  currentVersion: number,
  context: ResearchManagerDraftContext,
): boolean {
  return draft.version === currentVersion
    && researchManagerDraftTargetMatches(draft.target, context);
}
