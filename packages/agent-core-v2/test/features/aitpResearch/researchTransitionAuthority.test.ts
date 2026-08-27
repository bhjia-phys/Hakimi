import { describe, expect, it } from 'vitest';

import type { ResearchPhase } from '#/features/aitpResearch/types';
import {
  PLAN_ACTION_PHASES,
  RESEARCH_PHASE_TRANSITIONS,
  allowedNextPhases,
  isLiveForegroundAction,
  isPhaseTransitionValid,
  isUnresolvedHumanGate,
} from '#/features/aitpResearch/transitions/researchTransitionAuthority';

const ALL_PHASES: readonly ResearchPhase[] = [
  'idle', 'orienting', 'gap_analysis', 'action_planned', 'action_executing',
  'evaluating', 'state_updated', 'checkpoint_pending', 'awaiting_human',
];

describe('research transition authority', () => {
  it('exposes every phase in the canonical transition table', () => {
    expect(Object.keys(RESEARCH_PHASE_TRANSITIONS).toSorted()).toEqual(ALL_PHASES.toSorted());
  });

  it('isPhaseTransitionValid agrees with the table and is asymmetric where the table says so', () => {
    for (const from of ALL_PHASES) {
      const allowed = RESEARCH_PHASE_TRANSITIONS[from];
      for (const to of ALL_PHASES) {
        expect(isPhaseTransitionValid(from, to)).toBe(allowed.includes(to));
      }
    }
    // A couple of spot checks lock the intended cycle edges.
    expect(isPhaseTransitionValid('idle', 'orienting')).toBe(true);
    expect(isPhaseTransitionValid('orienting', 'idle')).toBe(true);
    expect(isPhaseTransitionValid('idle', 'action_executing')).toBe(false);
    expect(isPhaseTransitionValid('action_executing', 'state_updated')).toBe(false);
    expect(isPhaseTransitionValid('awaiting_human', 'action_executing')).toBe(true);
  });

  it('allowedNextPhases returns the table entry, and empty for an unknown phase', () => {
    expect(allowedNextPhases('idle')).toEqual(['orienting', 'gap_analysis', 'action_planned', 'awaiting_human']);
    expect(allowedNextPhases('orienting')).toEqual(['gap_analysis', 'action_planned', 'idle', 'awaiting_human']);
    expect(allowedNextPhases('checkpoint_pending')).toEqual(['idle', 'gap_analysis', 'awaiting_human']);
    expect(allowedNextPhases('nope' as never)).toEqual([]);
  });

  it('the plan-action phase precondition is a subset of phases that can reach action_planned', () => {
    for (const phase of PLAN_ACTION_PHASES) {
      // Every planning phase either already is action_planned or can transition into it.
      expect(phase === 'action_planned' || isPhaseTransitionValid(phase, 'action_planned')).toBe(true);
    }
  });

  it('isUnresolvedHumanGate is true only for an outstanding gate', () => {
    expect(isUnresolvedHumanGate(null)).toBe(false);
    expect(isUnresolvedHumanGate(undefined)).toBe(false);
    expect(isUnresolvedHumanGate({})).toBe(true);
    expect(isUnresolvedHumanGate({ resolvedAt: undefined })).toBe(true);
    expect(isUnresolvedHumanGate({ resolvedAt: 123 })).toBe(false);
  });

  it('isLiveForegroundAction is true only for planned or in_progress actions', () => {
    expect(isLiveForegroundAction(null)).toBe(false);
    expect(isLiveForegroundAction(undefined)).toBe(false);
    expect(isLiveForegroundAction({ status: 'planned' })).toBe(true);
    expect(isLiveForegroundAction({ status: 'in_progress' })).toBe(true);
    expect(isLiveForegroundAction({ status: 'completed' })).toBe(false);
    expect(isLiveForegroundAction({ status: 'abandoned' })).toBe(false);
  });
});
