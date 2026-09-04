import { describe, expect, it } from 'vitest';

import {
  renderResearchInjection,
  resolveResearchVerbosity,
} from '#/features/aitpResearch/injection/researchInjectionPresenter';
import type {
  ResearchGoalProjection,
  ResearchStatusSnapshot,
} from '#/features/aitpResearch/types';

function snapshot(overrides: Partial<ResearchStatusSnapshot> = {}): ResearchStatusSnapshot {
  return {
    mode: 'ready',
    loopStatus: 'active',
    planningPolicy: 'collaborative',
    currentLineSlug: 'spin-chain',
    lineWorkstreamBindings: [],
    questions: [],
    lines: [],
    openQuestionCount: 0,
    activeQuestionCount: 0,
    blockedQuestionCount: 0,
    alerts: [],
    aitpHealth: { phase: 'ready' },
    phase: 'gap_analysis',
    revision: 1,
    ...overrides,
  };
}

function goal(overrides: Partial<ResearchGoalProjection> = {}): ResearchGoalProjection {
  return {
    schema: 'hakimi/research-goal-0.1',
    goalId: 'bounded-diagnostic',
    objective: 'Test the finite-size symmetry obstruction',
    completionCriterion: 'Report the full residual and the finite-size limitation',
    status: 'active',
    continuation: { state: 'running' },
    scope: { programTopicId: 'spin-chain', lineSlug: 'spin-chain' },
    nonGoals: ['Do not infer a thermodynamic no-go from finite sizes'],
    budget: {
      tokenBudget: 10000,
      turnBudget: 20,
      wallClockBudgetMs: 100000,
      remainingTokens: 9000,
      remainingTurns: 18,
      remainingWallClockMs: 90000,
      tokenBudgetReached: false,
      turnBudgetReached: false,
      wallClockBudgetReached: false,
      overBudget: false,
    },
    stopConditions: [],
    programRelation: { status: 'aligned', reason: 'Confirmed by the researcher' },
    humanGates: [],
    persistenceGuards: [],
    researchRevision: 1,
    ...overrides,
  };
}

function subsequentVerbosity(before: ResearchStatusSnapshot, after: ResearchStatusSnapshot) {
  return resolveResearchVerbosity({
    isNewTurn: false,
    lastDisclosure: renderResearchInjection(before, 'brief').disclosure,
  }, after);
}

describe('Research injection semantic projection', () => {
  it('discloses degraded provisional work once and refreshes when AITP recovers', () => {
    const ready = snapshot();
    const degraded = snapshot({ mode: 'degraded' });
    expect(subsequentVerbosity(ready, degraded)).toBe('delta');
    expect(subsequentVerbosity(degraded, { ...degraded, revision: 2 })).toBeUndefined();
    expect(subsequentVerbosity(degraded, ready)).toBe('delta');
    const content = renderResearchInjection(degraded, 'delta').content;
    expect(content).toContain('user-directed bounded Actions may continue');
    expect(content).toContain('AITP writes, automatic Goal continuation and completion remain blocked');
    expect(renderResearchInjection(ready, 'delta').content).not.toContain('Provisional research:');
  });

  it('does not reinject for budget counters or Research revision churn', () => {
    const initial = goal();
    const before = snapshot({ researchGoal: initial });
    const after = snapshot({
      revision: 12,
      researchGoal: goal({
        researchRevision: 12,
        budget: {
          ...initial.budget,
          remainingTokens: 8000,
          remainingTurns: 17,
          remainingWallClockMs: 80000,
        },
      }),
    });
    expect(subsequentVerbosity(before, after)).toBeUndefined();
    expect(renderResearchInjection(before, 'brief').content)
      .toBe(renderResearchInjection(after, 'brief').content);
    expect(resolveResearchVerbosity({
      isNewTurn: true,
      lastDisclosure: renderResearchInjection(before, 'brief').disclosure,
    }, after)).toBe('brief');
  });

  it('does not reinject for legacy Goal remaining-turn counters', () => {
    const summary = {
      goalId: 'bounded-diagnostic',
      objective: 'Test the finite-size symmetry obstruction',
      status: 'active' as const,
      turnBudget: 20,
      remainingTurns: 18,
    };
    const before = snapshot({ goalSummary: summary });
    const after = snapshot({ goalSummary: { ...summary, remainingTurns: 17 } });
    expect(subsequentVerbosity(before, after)).toBeUndefined();
    expect(subsequentVerbosity(before, snapshot({
      goalSummary: { ...summary, turnBudget: 30 },
    }))).toBe('brief');
  });

  it.each([
    { objective: 'Test the alternative symmetry candidate' },
    { completionCriterion: 'Report an exact small-system commutator' },
    { scope: { programTopicId: 'spin-chain', lineSlug: 'alternative' } },
    { status: 'paused' as const, terminalReason: 'User paused' },
    { continuation: { state: 'held' as const, reason: 'Pending durable checkpoint' } },
    { continuation: { state: 'waiting' as const, reason: 'Bounded external task' } },
    { persistenceGuards: [{ code: 'pending', status: 'blocked' as const, reason: 'Save the candidate' }] },
    { budget: { ...goal().budget, tokenBudget: 20000 } },
    { budget: { ...goal().budget, tokenBudgetReached: true, overBudget: true } },
  ])('still discloses meaningful Goal changes: %j', (change) => {
    expect(subsequentVerbosity(
      snapshot({ researchGoal: goal() }),
      snapshot({ researchGoal: goal(change) }),
    )).toBe('brief');
  });

  it('renders the scientific completion criterion and the actual continuation hold', () => {
    const output = renderResearchInjection(snapshot({
      researchGoal: goal({
        continuation: { state: 'held', reason: 'Pending durable checkpoint' },
      }),
    }), 'brief').content;
    expect(output).toContain('Completion criterion: Report the full residual and the finite-size limitation');
    expect(output).toContain('Continuation: held — Pending durable checkpoint');
    expect(output).not.toContain('remainingWallClockMs');
  });

  it.each(['historical_unresolved', 'superseded_by_retry'] as const)(
    'does not turn %s history into current attention or a new delta', (classification) => {
      const before = snapshot();
      const after = snapshot({ alerts: [{
        fingerprint: 'old-failure',
        kind: 'blocked',
        state: 'active',
        classification,
        message: 'An older attempt failed',
        lineSlug: 'spin-chain',
        createdAt: 1,
      }] });
      expect(subsequentVerbosity(before, after)).toBeUndefined();
      expect(renderResearchInjection(after, 'brief').content).not.toContain('An older attempt failed');
      expect(after.alerts[0]?.state).toBe('active');
      expect(after.alerts[0]?.classification).toBe(classification);
    },
  );

  it.each(['active_blocker', undefined] as const)(
    'retains a current or legacy unclassified blocker: %s', (classification) => {
      const before = snapshot();
      const after = snapshot({ alerts: [{
        fingerprint: 'current-failure',
        kind: 'blocked',
        classification,
        message: 'Current input is inconsistent',
        createdAt: 1,
      }] });
      expect(subsequentVerbosity(before, after)).toBe('delta');
      expect(renderResearchInjection(after, 'brief').content).toContain('Current input is inconsistent');
    },
  );
});
