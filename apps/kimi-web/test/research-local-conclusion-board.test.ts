import { describe, expect, it } from 'vitest';
import type { ResearchStatusSnapshot } from '../src/api/types';
import { buildResearchBoardCompactSlots, selectResearchLineOverview } from '../src/lib/researchBoardPresentation';
import { localConclusion } from './fixtures/local-conclusion';

function snapshot(): ResearchStatusSnapshot {
  return {
    mode: 'ready', loopStatus: 'active', planningPolicy: 'collaborative',
    phase: 'state_updated', revision: 8, questions: [], lines: [],
    lineWorkstreamBindings: [], alerts: [], openQuestionCount: 0,
    activeQuestionCount: 0, blockedQuestionCount: 0, aitpHealth: { phase: 'ready' },
    localConclusion, currentAction: localConclusion.action,
    latestProgress: localConclusion.progress,
  };
}

describe('scientific purpose while a job runs', () => {
  function runningSnapshot(): ResearchStatusSnapshot {
    return {
      ...snapshot(), localConclusion: undefined, latestProgress: undefined,
      currentLineSlug: 'test-line', phase: 'action_executing',
      currentAction: {
        actionId: 'gap-test', lineSlug: 'test-line', kind: 'simulation',
        purpose: 'Compare gaps while awaiting the sample', expectedEvidence: ['Gap comparison'],
        stopCondition: 'One discriminating result', allowedToolKinds: ['workspace_read'],
        requiresHumanApproval: false, status: 'in_progress', createdAt: 1,
      },
      currentRun: {
        actionId: 'gap-test', campaign: 'sample-campaign', jobId: '1234',
        stage: 'scf', schedulerState: 'running', lastObservedAt: 2, artifactRefs: [],
      },
    };
  }

  it('retains both the scientific purpose and its own observed job without mutating state', () => {
    const state = runningSnapshot();
    const before = structuredClone(state);
    expect(buildResearchBoardCompactSlots(state).find((slot) => slot.kind === 'cycle')).toMatchObject({
      current: { source: 'run', actionPurpose: state.currentAction!.purpose,
        jobId: '1234', stage: 'scf', schedulerState: 'running' },
      actionStatus: 'in_progress',
    });
    expect(state).toEqual(before);
  });

  it('does not project a completed Action as ongoing research', () => {
    const state = runningSnapshot();
    state.currentAction!.status = 'completed';
    state.phase = 'state_updated';
    const cycle = buildResearchBoardCompactSlots(state).find((slot) => slot.kind === 'cycle');
    expect(cycle).toMatchObject({ current: { source: 'run', actionPurpose: undefined }, actionStatus: undefined });
  });

  it.each([1, 2])('hides an explicitly foreign Action and run with %s Lines', (count) => {
    const state = runningSnapshot();
    state.currentAction!.lineSlug = 'other-line';
    state.lines = ['test-line', 'other-line'].slice(0, count).map((slug) => ({
      slug, title: slug, status: 'active', createdAt: 1, revision: 1,
    }));
    const cycle = buildResearchBoardCompactSlots(state).find((slot) => slot.kind === 'cycle');
    expect(cycle?.current?.source).not.toBe('run');
    expect(JSON.stringify(cycle)).not.toContain('Compare gaps');
  });

  it('does not attach a mismatched run to the scientific purpose', () => {
    const state = runningSnapshot();
    state.currentRun!.actionId = 'another-action';
    expect(buildResearchBoardCompactSlots(state).find((slot) => slot.kind === 'cycle')).toMatchObject({
      current: { source: 'action', text: state.currentAction!.purpose },
    });
  });

  it('does not borrow a foreign action progress report or its next step', () => {
    const state = runningSnapshot();
    state.currentAction!.lineSlug = 'another-line';
    state.latestProgress = { ...localConclusion.progress,
      headline: 'FOREIGN_RESULT', nextAction: 'FOREIGN_NEXT' };
    const before = structuredClone(state);
    const slots = buildResearchBoardCompactSlots(state);
    expect(JSON.stringify(slots.find((slot) => slot.kind === 'cycle'))).not.toContain('FOREIGN_RESULT');
    expect(JSON.stringify(slots.find((slot) => slot.kind === 'next')) ?? '').not.toContain('FOREIGN_NEXT');
    expect(state).toEqual(before);
  });
});

describe('retained local conclusion Board', () => {
  it('browses another Line without moving execution or exposing another Line question', () => {
    const state = snapshot();
    state.currentLineSlug = 'gw';
    state.lines = ['gw', 'crpa'].map((slug) => ({ slug, title: slug, status: 'active', createdAt: 1, revision: 1 }));
    state.questions = ['gw', 'crpa'].map((lineSlug) => ({
      id: lineSlug, lineSlug, wording: lineSlug, priority: 1, neededEvidence: [],
      evidenceRefs: [], falsifierRefs: [], workflow: 'active', epistemic: 'candidate',
      persistence: 'working', revision: 1,
    }));
    const before = structuredClone(state);
    const view = selectResearchLineOverview(state, 'crpa');
    expect(view?.executionLineSlug).toBe('gw');
    expect(view?.questions.map((question) => question.id)).toEqual(['crpa']);
    expect(selectResearchLineOverview(state, 'missing')).toBeUndefined();
    expect(state).toEqual(before);
  });
  it('uses the projected Question next step without inventing a Focus', () => {
    const state: ResearchStatusSnapshot = {
      ...snapshot(), localConclusion: undefined, currentAction: undefined, latestProgress: undefined,
      currentLineSlug: 'test-line', currentFocus: undefined,
      currentQuestion: {
        id: 'question', lineSlug: 'test-line', wording: 'Does the limiting case discriminate?',
        priority: 1, neededEvidence: [], evidenceRefs: ['entry-test'], falsifierRefs: [],
        nextBoundedAction: 'Stop; the finite test is complete.',
        workflow: 'closed', epistemic: 'supported', persistence: 'committed', revision: 4,
      },
      effectiveNextStep: {
        text: 'Stop; the finite test is complete.', source: 'question', freshness: 'current',
        observedAt: 2, derivedFrom: { questionId: 'question', lineSlug: 'test-line' },
      },
    };
    state.questions = [state.currentQuestion!];
    const before = structuredClone(state);
    expect(buildResearchBoardCompactSlots(state).find((slot) => slot.kind === 'next')).toMatchObject({
      text: 'Stop; the finite test is complete.',
      derivedFrom: { questionId: 'question', lineSlug: 'test-line' },
    });
    expect(state).toEqual(before);
  });

  it('keeps unsaved ownership in attention without replacing the scientific next step', () => {
    const slots = buildResearchBoardCompactSlots(snapshot());
    expect(slots).toHaveLength(4);
    expect(slots.find((slot) => slot.kind === 'cycle')).toMatchObject({
      stage: 'next_ready', mode: 'ready', loopStatus: 'active',
      planningPolicy: 'collaborative', actionStatus: 'completed',
      current: { source: 'local_conclusion', text: localConclusion.progress.headline },
    });
    expect(slots.find((slot) => slot.kind === 'attention')).toMatchObject({
      source: 'local_conclusion', additionalCount: 0,
      text: expect.stringContaining('not recorded in AITP'),
    });
    expect(slots.find((slot) => slot.kind === 'next')).toMatchObject({
      source: 'progress', text: localConclusion.progress.nextAction,
    });
    expect(JSON.stringify(slots)).not.toContain('In Research Manager');
  });

  it('does not replace a projected scientific step with local conclusion adoption', () => {
    const state = snapshot();
    state.effectiveNextStep = {
      text: 'Inspect the existing result before selecting the next experiment.',
      source: 'question', freshness: 'current', observedAt: 9, derivedFrom: {},
    };
    const before = structuredClone(state);
    const slots = buildResearchBoardCompactSlots(state);
    expect(slots.find((slot) => slot.kind === 'next')).toMatchObject(state.effectiveNextStep);
    expect(slots.find((slot) => slot.kind === 'attention')).toMatchObject({ source: 'local_conclusion' });
    expect(state).toEqual(before);
  });

  it('does not present a foreign Line result as the current science', () => {
    const original = snapshot();
    const slots = buildResearchBoardCompactSlots({
      ...original, currentLineSlug: 'other', latestProgress: undefined,
      localConclusion: { ...localConclusion, action: { ...localConclusion.action, lineSlug: 'original' } },
    });
    expect(slots.find((slot) => slot.kind === 'cycle')).not.toMatchObject({
      current: { text: localConclusion.progress.headline },
    });
    expect(slots.find((slot) => slot.kind === 'next')).toBeUndefined();
    expect(slots.find((slot) => slot.kind === 'attention')?.source).not.toBe('local_conclusion');
  });

  it.each(['unscoped', 'conflicting-question'])('does not guess local conclusion ownership with multiple Lines (%s)', (kind) => {
    const state = snapshot();
    state.currentLineSlug = 'gw';
    state.lines = ['gw', 'crpa'].map((slug) => ({ slug, title: slug, status: 'active', createdAt: 1, revision: 1 }));
    state.questions = [{ id: 'crpa-q', lineSlug: 'crpa', wording: 'Other problem', priority: 1,
      neededEvidence: [], evidenceRefs: [], falsifierRefs: [], workflow: 'active',
      epistemic: 'candidate', persistence: 'working', revision: 1 }];
    state.localConclusion = { ...localConclusion, action: { ...localConclusion.action,
      lineSlug: kind === 'unscoped' ? undefined : 'gw',
      questionId: kind === 'unscoped' ? undefined : 'crpa-q',
    } };
    state.currentAction = state.localConclusion.action;
    const before = structuredClone(state);
    const slots = buildResearchBoardCompactSlots(state);
    expect(slots.find((slot) => slot.kind === 'cycle')?.current?.source).not.toBe('local_conclusion');
    expect(slots.find((slot) => slot.kind === 'attention')?.source).not.toBe('local_conclusion');
    expect(JSON.stringify(slots)).not.toContain(localConclusion.progress.headline);
    expect(state).toEqual(before);
  });

  it('keeps an unresolved human decision ahead of ownership adoption', () => {
    const original = snapshot();
    const slots = buildResearchBoardCompactSlots({
      ...original,
      humanGate: { gateId: 'gate', kind: 'approval', prompt: 'Choose the physical convention', createdAt: 5 },
      effectiveNextStep: {
        text: 'Resolve the physical convention', source: 'human_gate', freshness: 'blocked',
        observedAt: 5, derivedFrom: {},
      },
    });
    expect(slots.find((slot) => slot.kind === 'attention')).toMatchObject({ source: 'human_gate' });
    expect(slots.find((slot) => slot.kind === 'next')).toMatchObject({ source: 'human_gate' });
  });
});
