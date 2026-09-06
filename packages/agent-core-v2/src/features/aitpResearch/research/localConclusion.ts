/**
 * `aitpResearch` domain — validates adoption of retained local evidence.
 *
 * Shares the captured-context checks between the Agent service and replayable
 * checkpoint reducer. Original agent-owned context can recover after its first
 * explicit workstream confirmation, without inventing human approval. Stable
 * checkpoint identity preserves prepare/save idempotency across undo and replay.
 * Grants no tool or canonical-write permission.
 */

import type { ResearchWorkingState } from '../aitpResearchOps';
import type { ResearchLineWorkstreamBinding } from '../types';
import { deriveLineWorkstreamAlignment, sameLineWorkstreamBinding } from './workstreamBinding';

export function localConclusionAdoptionProblem(state: ResearchWorkingState, input: {
  readonly localConclusionId?: string;
  readonly confirmedBy?: 'user';
  readonly lineSlug?: string;
  readonly questionId?: string;
  readonly workstreamBinding?: ResearchLineWorkstreamBinding;
  readonly assessment?: string;
  readonly nextAction?: string;
}, recoverConfirmedScope = false): string | undefined {
  const local = state.localConclusion;
  if (local === undefined) return 'No retained local conclusion matches this adoption request.';
  if (input.localConclusionId !== local.candidate.sourceActionId || (
    input.confirmedBy !== 'user' && (!recoverConfirmedScope ||
      local.candidate.authority !== 'agent' || local.program === undefined || local.line === undefined ||
      input.lineSlug !== local.action.lineSlug || input.questionId !== local.action.questionId)
  )) {
    return 'Adoption requires the exact local conclusion ID and explicit user confirmation.';
  }
  if (
    state.phase !== 'state_updated' ||
    state.currentAction?.actionId !== local.action.actionId ||
    state.currentAction.status !== local.action.status ||
    (state.humanGate !== null && state.humanGate.resolvedAt === undefined)
  ) return 'The retained conclusion no longer owns a recoverable foreground boundary.';
  const program = state.program;
  const capturedProgram = local.program;
  if (capturedProgram !== undefined && (
    program === null || program.topicId !== capturedProgram.topicId ||
    (program.observedRevision ?? 1) !== capturedProgram.observedRevision ||
    program.title !== capturedProgram.title || program.goalText !== capturedProgram.goalText ||
    program.goalSource !== capturedProgram.goalSource || program.establishedAt !== capturedProgram.establishedAt
  )) return 'The captured Program has changed; retain the original evidence without reassigning it.';
  const line = input.lineSlug === undefined ? undefined : state.lines[input.lineSlug];
  if (line === undefined) return 'Choose an explicit existing target Line for this conclusion.';
  if (local.action.lineSlug !== undefined && local.action.lineSlug !== line.slug) {
    return 'A Line-bound conclusion cannot be adopted into a different Line.';
  }
  const binding = state.lineWorkstreamBindings?.[line.slug];
  const alignment = deriveLineWorkstreamAlignment({
    lineSlug: line.slug, binding,
    program: program === null ? undefined : { ...program, observedRevision: program.observedRevision ?? 1 },
  });
  if (alignment.status !== 'bound' || !sameLineWorkstreamBinding(binding, input.workstreamBinding)) {
    return 'Confirm the exact current Line-to-workstream binding before adopting the conclusion.';
  }
  const capturedLine = local.line;
  if (capturedLine !== undefined && (
    line.revision !== capturedLine.revision + 1 ||
    line.title !== capturedLine.title || line.objective !== capturedLine.objective ||
    line.assessment !== capturedLine.assessment || line.status !== capturedLine.status ||
    line.createdAt !== capturedLine.createdAt ||
    binding === undefined || binding.confirmedAt < local.progress.recordedAt
  )) return 'The captured Line changed beyond its first binding confirmation; do not reassign historical evidence.';
  const question = input.questionId === undefined ? undefined : state.questions[input.questionId];
  if ((input.questionId !== undefined && question === undefined) || (question !== undefined && question.lineSlug !== line.slug)) {
    return 'The target Question must belong to the explicit target Line.';
  }
  if (local.action.questionId !== undefined && (
    input.questionId !== local.action.questionId || question === undefined ||
    local.action.questionRevision === undefined || question.revision !== local.action.questionRevision
  )) return 'The captured Question or its revision changed; retain the original evidence.';
  if ((input.assessment !== undefined && input.assessment !== local.progress.mainlineImpact) ||
    (input.nextAction !== undefined && input.nextAction !== local.progress.nextAction)) {
    return 'Adoption must preserve the original assessment and next step, not replace the scientific conclusion.';
  }
  return undefined;
}

export function automaticLocalConclusionCheckpoint(state: ResearchWorkingState) {
  const local = state.localConclusion;
  if (local === undefined || state.pendingCheckpoint !== null) return undefined;
  if ((local.action.status !== 'completed' && local.action.status !== 'abandoned') ||
    local.candidate.sourceActionId !== local.action.actionId ||
    local.candidate.progressRecordedAt !== local.progress.recordedAt ||
    state.latestProgress?.recordedAt !== local.progress.recordedAt) return undefined;
  const lineSlug = local.action.lineSlug;
  const identity = `local-conclusion-${local.candidate.sourceActionId}-${local.candidate.progressRecordedAt}`;
  const proposal = {
    checkpointId: identity,
    idempotencyKey: identity,
    localConclusionId: local.candidate.sourceActionId,
    lineSlug,
    questionId: local.action.questionId,
    workstreamBinding: lineSlug === undefined ? undefined : state.lineWorkstreamBindings?.[lineSlug],
    createdAt: local.progress.recordedAt,
  };
  return localConclusionAdoptionProblem(state, proposal, true) === undefined ? proposal : undefined;
}
