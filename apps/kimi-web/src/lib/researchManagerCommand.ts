import type { ResearchCommand } from '../api/types';

export type ResearchManagerEditorMode = 'create' | 'edit';

export type ResearchManagerDraftTarget =
  | { form: 'line'; mode: 'create'; key: string }
  | { form: 'line'; mode: 'edit'; key: string }
  | { form: 'question'; mode: 'create'; key: string }
  | { form: 'question'; mode: 'edit'; key: string }
  | { form: 'checkpoint'; mode: 'propose'; key: string }
  | { form: 'checkpoint'; mode: 'commit'; key: string };

export interface ResearchManagerCommandRequest {
  id: number;
  command: ResearchCommand;
  draft?: {
    target: ResearchManagerDraftTarget;
    version: number;
  };
}

export type ResearchManagerCommandAck = ResearchManagerCommandRequest;

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

export interface ResearchManagerDraftContext {
  lineEditorMode: ResearchManagerEditorMode;
  lineSlug: string;
  selectedLineSlug: string;
  questionEditorMode: ResearchManagerEditorMode;
  selectedQuestionId: string;
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
