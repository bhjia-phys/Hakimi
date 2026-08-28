import { describe, expect, it } from 'vitest';
import {
  researchManagerAckMatchesDraft,
  researchManagerDraftTarget,
  researchManagerDraftTargetMatches,
  researchManagerMutationAllowed,
  researchManagerSessionIsCurrent,
  type ResearchManagerDraftContext,
} from '../src/lib/researchManagerCommand';
import { isResearchIdleOnlyBusy } from '../src/lib/researchCommand';

const context: ResearchManagerDraftContext = {
  lineEditorMode: 'edit',
  lineSlug: '',
  selectedLineSlug: 'line-a',
  questionEditorMode: 'edit',
  selectedQuestionId: 'q_1',
  checkpointEntryId: 'entry-1',
};

describe('Research Manager command acknowledgements', () => {
  it('maps draft-saving commands to their precise form and target', () => {
    expect(researchManagerDraftTarget({
      kind: 'update_line',
      lineSlug: 'line-a',
      expectedRevision: 1,
    })).toEqual({ form: 'line', mode: 'edit', key: 'line-a' });
    expect(researchManagerDraftTarget({
      kind: 'create_question',
      lineSlug: 'line-a',
      wording: 'Question',
    })).toEqual({ form: 'question', mode: 'create', key: 'line-a' });
    expect(researchManagerDraftTarget({
      kind: 'propose_checkpoint',
      questionId: 'q_1',
    })).toEqual({ form: 'checkpoint', mode: 'propose', key: 'question:q_1' });
    expect(researchManagerDraftTarget({
      kind: 'commit_checkpoint',
      checkpointId: 'checkpoint-1',
      entryId: 'entry-1',
    })).toEqual({ form: 'checkpoint', mode: 'commit', key: 'entry-1' });
  });

  it.each([
    { kind: 'pause_loop', expectedRevision: 1 } as const,
    { kind: 'resume_loop', expectedRevision: 1 } as const,
    { kind: 'set_focus', questionId: 'q_1', expectedRevision: 1 } as const,
    { kind: 'defer_question', questionId: 'q_1', expectedRevision: 1 } as const,
    { kind: 'switch_line', lineSlug: 'line-a', expectedRevision: 1 } as const,
  ])('does not associate $kind with any dirty form', (command) => {
    expect(researchManagerDraftTarget(command)).toBeNull();
  });

  it('matches acknowledgements only to the currently edited target', () => {
    const lineTarget = researchManagerDraftTarget({
      kind: 'update_line',
      lineSlug: 'line-a',
      expectedRevision: 1,
    });
    const questionTarget = researchManagerDraftTarget({
      kind: 'update_question',
      questionId: 'q_1',
      expectedRevision: 1,
    });

    expect(lineTarget && researchManagerDraftTargetMatches(lineTarget, context)).toBe(true);
    expect(questionTarget && researchManagerDraftTargetMatches(questionTarget, context)).toBe(true);
    expect(lineTarget && researchManagerDraftTargetMatches(lineTarget, {
      ...context,
      selectedLineSlug: 'line-b',
    })).toBe(false);
    expect(questionTarget && researchManagerDraftTargetMatches(questionTarget, {
      ...context,
      selectedQuestionId: 'q_2',
    })).toBe(false);
  });

  it('rejects every Manager mutation during a main turn or compaction', () => {
    expect(researchManagerMutationAllowed(isResearchIdleOnlyBusy(false, false))).toBe(true);
    expect(researchManagerMutationAllowed(isResearchIdleOnlyBusy(true, false))).toBe(false);
    expect(researchManagerMutationAllowed(isResearchIdleOnlyBusy(false, true))).toBe(false);
  });

  it('binds manager work to the captured and currently active session', () => {
    expect(researchManagerSessionIsCurrent('sess-a', 'sess-a', 'sess-a')).toBe(true);
    expect(researchManagerSessionIsCurrent('sess-a', 'sess-b', 'sess-b')).toBe(false);
    expect(researchManagerSessionIsCurrent('sess-a', 'sess-a', 'sess-b')).toBe(false);
    expect(researchManagerSessionIsCurrent(null, null, 'sess-a')).toBe(false);
    expect(researchManagerSessionIsCurrent('sess-a', 'sess-a', undefined)).toBe(false);
  });

  it('rejects a late acknowledgement after the matching draft changes again', () => {
    const target = researchManagerDraftTarget({
      kind: 'update_question',
      questionId: 'q_1',
      expectedRevision: 1,
    });
    expect(target).not.toBeNull();
    if (target === null) return;
    const draft = { target, version: 4 };

    expect(researchManagerAckMatchesDraft(draft, 4, context)).toBe(true);
    expect(researchManagerAckMatchesDraft(draft, 5, context)).toBe(false);
  });
});
