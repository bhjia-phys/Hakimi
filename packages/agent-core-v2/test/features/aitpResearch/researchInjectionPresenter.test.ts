import { describe, expect, it } from 'vitest';
import { DisposableStore } from '#/_base/di/lifecycle';
import { createServices } from '#/_base/di/test';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { IAgentPromptService } from '#/agent/prompt/prompt';
import { IAgentGoalService } from '#/agent/goal/goal';
import { IAitpResearchInjection } from '#/features/aitpResearch/injection/aitpResearchInjectionContract';
import { AitpResearchInjection } from '#/features/aitpResearch/injection/aitpResearchInjection';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
import { IResearchTurnAdmission } from '#/features/aitpResearch/loop/researchTurnAdmission';
import { createTestAgent } from '../../harness';

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

function maintainedSnapshot(): ResearchStatusSnapshot {
  const topic = {
    id: 'spin-chain', title: 'Finite-size symmetry',
    goalText: 'Distinguish candidate symmetries', goalSource: '.aitp/topic/TOPIC.md',
  };
  return snapshot({
    program: { ...topic, topicId: topic.id, establishedAt: 1, observedRevision: 2 },
    currentWorkstreamBinding: {
      status: 'bound', lineSlug: 'spin-chain', reason: 'Explicitly confirmed',
      binding: {
        confirmationId: 'confirmed', lineSlug: 'spin-chain', workstream: 'symmetry',
        topicId: topic.id, observedRevision: 2, confirmedBy: 'user', confirmedAt: 10,
      },
    },
    aitpMaintenance: {
      status: 'ready', refreshedAt: 20, memoryStatus: 'available', topic, workstream: 'symmetry',
      activeNewerThanWorkingNote: false, unresolvedFailureCount: 0, unresolvedFailures: [],
      warningSummaries: [], check: { status: 'clean', findingCodes: [] },
    },
  });
}

describe('Research injection in outbound agent requests', () => {
  it('deduplicates successive turns and restores missing context through the real injection chain', async () => {
    let state = maintainedSnapshot();
    const ctx = createTestAgent();
    const disposables = new DisposableStore();
    const attach = (target: typeof ctx) => {
      const services = createServices(disposables, { strict: true, additionalServices: (reg) => {
        reg.defineInstance(IAgentContextInjectorService, target.get(IAgentContextInjectorService));
        reg.defineInstance(IAgentAitpModeService, { isActive: true } as IAgentAitpModeService);
        reg.defineInstance(IAgentResearchService, { getSnapshot: () => state } as IAgentResearchService);
        reg.defineInstance(IResearchTurnAdmission, { isCurrentResearchTurn: () => true } as IResearchTurnAdmission);
        reg.define(IAitpResearchInjection, AitpResearchInjection);
      } });
      services.get(IAitpResearchInjection);
    };
    try {
      const goals = ctx.get(IAgentGoalService);
      const created = await goals.createGoal({ objective: 'UNIQUE_RESEARCH_OBJECTIVE',
        completionCriterion: 'UNIQUE_RESEARCH_CRITERION' });
      await goals.pauseGoal();
      state = { ...state, researchGoal: goal({ goalId: created.goalId,
        objective: created.objective, completionCriterion: created.completionCriterion, status: 'paused' }) };
      attach(ctx);
      const ask = async (text: string, target = ctx) => {
        target.mockNextResponse({ type: 'text', text: 'Observed; no new scientific conclusion.' });
        const handle = await target.get(IAgentPromptService).enqueue({ message: {
          role: 'user', content: [{ type: 'text', text }], toolCalls: [], origin: { kind: 'user' },
        } });
        expect((await handle.completion).state).toBe('completed');
        return JSON.stringify(target.llmCalls.at(-1));
      };
      const first = await ask('What is our current question?');
      expect(first.match(/Research state guidance/g)).toHaveLength(1);
      expect(first.match(/UNIQUE_RESEARCH_OBJECTIVE/g)).toHaveLength(1);
      expect(first.match(/UNIQUE_RESEARCH_CRITERION/g)).toHaveLength(1);
      const unchanged = await ask('Explain the same question briefly.');
      expect(unchanged.match(/Research state guidance/g)).toHaveLength(1);
      const resumed = createTestAgent();
      try {
        await resumed.restore(await ctx.persistedWireRecords());
        attach(resumed);
        const restoredHistory = await ask('Continue the restored question.', resumed);
        expect(restoredHistory.match(/Research state guidance/g)).toHaveLength(1);
      } finally {
        await resumed.dispose();
      }
      state = { ...state, planningPolicy: 'dreaming' };
      const changed = await ask('What is the planning policy now?');
      expect(changed.match(/Research state guidance/g)).toHaveLength(2);
      ctx.context.applyCompaction({ summary: 'The symmetry question is unresolved.',
        compactedCount: ctx.context.get().length, tokensBefore: 5000, tokensAfter: 30,
        keptUserMessageCount: 0, keptHeadUserMessageCount: 0 });
      const compacted = await ask('Continue after compaction.');
      expect(compacted.match(/Research state guidance/g)).toHaveLength(1);
      expect(compacted).toContain('dreaming');
      await ctx.undoHistory(1);
      const undone = await ask('Continue after undo.');
      expect(undone.match(/Research state guidance/g)).toHaveLength(1);
      ctx.clearContext();
      const restored = await ask('Recover the current research context.');
      expect(restored.match(/Research state guidance/g)).toHaveLength(1);
      expect(restored).toContain('dreaming');
      expect(restored.match(/UNIQUE_RESEARCH_OBJECTIVE/g)).toHaveLength(1);
    } finally {
      disposables.dispose();
      await ctx.dispose();
    }
  });
});

describe('Research injection semantic projection', () => {
  it('refreshes visible human decisions without relying on a Goal or phase change', () => {
    const before = snapshot({ phase: 'awaiting_human', humanGate: {
      gateId: 'direction-choice', kind: 'approval', prompt: 'Choose the low-cost benchmark.', createdAt: 1,
    } });
    const edited = snapshot({ ...before, humanGate: {
      ...before.humanGate!, prompt: 'Choose between the two benchmark assumptions.',
    } });
    const resolved = snapshot({ ...edited, humanGate: {
      ...edited.humanGate!, resolvedAt: 2, resolution: 'Use the first assumption provisionally.',
    } });
    expect(subsequentVerbosity(before, edited)).toBe('brief');
    expect(subsequentVerbosity(edited, resolved)).toBe('brief');
    expect(subsequentVerbosity(resolved, { ...resolved, humanGate: undefined })).toBe('brief');
    expect(subsequentVerbosity(resolved, { ...resolved, revision: 2 })).toBeUndefined();
    expect(renderResearchInjection(resolved, 'brief').content).toContain('Use the first assumption provisionally.');
    expect(resolved.humanGate?.resolvedAt).toBe(2);
  });

  it('does not inject a decision belonging to an unrelated action', () => {
    const before = snapshot();
    const after = snapshot({ humanGate: {
      gateId: 'other-decision', actionId: 'other-action', kind: 'approval',
      prompt: 'UNRELATED_DECISION', createdAt: 1,
    } });
    expect(subsequentVerbosity(before, after)).toBeUndefined();
    expect(renderResearchInjection(after, 'brief').content).not.toContain('UNRELATED_DECISION');
  });

  it.each(['collaborative', 'dreaming'] as const)('keeps %s guidance independent of Action permissions', (planningPolicy) => {
    const content = renderResearchInjection(snapshot({ planningPolicy }), 'brief').content;
    expect(content).toContain('routine checks need no new plan');
    expect(content).toContain('A Research action is optional context');
    expect(content).toContain('without creating an Action merely to record them');
    expect(content).toContain('never invent human approval');
    expect(content).not.toContain('planning_level=');
    expect(content).not.toContain('Bind its finalized version');
    expect(content).not.toContain('normal conclude path');
  });

  it.each(['brief', 'delta'] as const)('supplies exact pending-evidence arguments in %s without revision-only reinjection', (verbosity) => {
    const state = snapshot({ revision: 42, pendingCheckpoint: {
      checkpointId: 'checkpoint-original', lineSlug: 'spin-chain', idempotencyKey: 'original-key',
      createdAt: 10, persistence: 'pending_commit',
      commitCandidate: { sourceActionId: 'original-action', progressRecordedAt: 10,
        entryKind: 'run', authority: 'agent', provenance: 'agent_verification', rationale: 'Observed submission.' },
    } });
    const before = structuredClone(state);
    const content = renderResearchInjection(state, verbosity).content;
    expect(content).toContain('checkpoint_id=checkpoint-original, expected_revision=42');
    expect(content).toContain('GetResearchStatus');
    expect(subsequentVerbosity(state, { ...state, revision: 43 })).toBeUndefined();
    expect(subsequentVerbosity({ ...state, pendingCheckpoint: undefined }, state)).toBe('delta');
    expect(subsequentVerbosity(state, { ...state, pendingCheckpoint: undefined })).toBe('delta');
    expect(subsequentVerbosity(state, {
      ...state,
      pendingCheckpoint: { ...state.pendingCheckpoint!, checkpointId: 'replacement-checkpoint' },
    })).toBe('delta');
    expect(state).toEqual(before);
    expect(renderResearchInjection({ ...state, pendingCheckpoint: undefined }, verbosity).content).not.toContain('expected_revision=');
    expect(renderResearchInjection({ ...state, mode: 'degraded' }, verbosity).content).not.toContain('expected_revision=');
  });

  it('identifies completed native scoped reads without suppressing evidence and save verification', () => {
    const state = maintainedSnapshot();
    const before = structuredClone(state);
    const content = renderResearchInjection(state, 'brief').content;
    expect(content).toContain('Native AITP maintenance: enter/check completed');
    expect(content).toContain('confirmed current workstream symmetry');
    expect(content).toContain('new external changes or stale evidence require refresh');
    expect(content).toContain('Preserve required checkpoint and Note pre/post-save verification');
    expect(content).toContain('Loading a Skill, compaction, or a phase change alone');
    expect(content).toContain('native-coordinator versus fallback ownership');
    expect(state).toEqual(before);
  });

  it.each(['brief', 'delta'] as const)('routes missing Note locators through the confirmed workstream in %s', (verbosity) => {
    const state = maintainedSnapshot();
    const before = structuredClone(state);
    const content = renderResearchInjection(state, verbosity).content;
    expect(content).toContain('For needed Note content without a scoped locator');
    expect(content).toContain('aitp_enter({"workstream":"symmetry","recent":1})');
    expect(content).not.toContain('aitp_enter({"workstream":"spin-chain"');
    expect(content).toContain('latest_working_note.source');
    expect(content).toContain('verify its workstreams');
    expect(content).toContain('not Glob order or another Line');
    expect(content).toContain('not a health cycle or write trigger');
    expect(state).toEqual(before);
    expect(subsequentVerbosity(state, { ...state, revision: 2 })).toBeUndefined();
  });

  it.each([
    'missing', 'degraded', 'unavailable_check', 'wrong_workstream', 'wrong_topic',
    'changed_goal', 'before_confirmation', 'unbound', 'stale_binding', 'other_line', 'degraded_mode',
  ])('does not advertise a reusable native read for %s', (condition) => {
    const valid = maintainedSnapshot();
    const receipt = valid.aitpMaintenance!;
    const alignment = valid.currentWorkstreamBinding!;
    const binding = alignment.binding!;
    const changes: Record<string, Partial<ResearchStatusSnapshot>> = {
      missing: { aitpMaintenance: undefined },
      degraded: { aitpMaintenance: { ...receipt, status: 'degraded' } },
      unavailable_check: { aitpMaintenance: { ...receipt, check: { status: 'unavailable', findingCodes: [] } } },
      wrong_workstream: { aitpMaintenance: { ...receipt, workstream: 'other' } },
      wrong_topic: { aitpMaintenance: { ...receipt, topic: { ...receipt.topic!, id: 'other' } } },
      changed_goal: { program: { ...valid.program!, goalText: 'A different scientific goal' } },
      before_confirmation: { aitpMaintenance: { ...receipt, refreshedAt: 9 } },
      unbound: { currentWorkstreamBinding: { ...alignment, status: 'unbound' } },
      stale_binding: { currentWorkstreamBinding: { ...alignment, binding: { ...binding, observedRevision: 1 } } },
      other_line: { currentLineSlug: 'other' },
      degraded_mode: { mode: 'degraded' },
    };
    const state = { ...valid, ...changes[condition] };
    const content = renderResearchInjection(state, 'brief').content;
    expect(content).not.toContain('Native AITP maintenance: enter/check completed');
    expect(content).not.toContain('For needed Note content without a scoped locator');
    expect(content).not.toContain('aitp_enter({');
  });

  it('keeps findings visible alongside a completed native read', () => {
    const state = maintainedSnapshot();
    const content = renderResearchInjection({ ...state, aitpMaintenance: {
      ...state.aitpMaintenance!, activeNewerThanWorkingNote: true, unresolvedFailureCount: 2,
      warningSummaries: [{ level: 'warning', code: 'historical_pin_drift' }],
      check: { status: 'findings', findingCodes: ['historical_pin_drift'] },
    } }, 'delta').content;
    expect(content).toContain('Native AITP maintenance: enter/check completed');
    expect(content).toContain('Active entries are newer');
    expect(content).toContain('2 unresolved failure(s). Historical context');
    expect(content).toContain('historical_pin_drift');
  });

  it('discloses receipt availability changes but not same-scope refresh timestamp churn', () => {
    const ready = maintainedSnapshot();
    const absent = { ...ready, aitpMaintenance: undefined };
    expect(subsequentVerbosity(absent, ready)).toBe('delta');
    expect(subsequentVerbosity(ready, absent)).toBe('delta');
    const refreshed = { ...ready, aitpMaintenance: { ...ready.aitpMaintenance!, refreshedAt: 30 } };
    expect(subsequentVerbosity(ready, refreshed)).toBeUndefined();
    expect(renderResearchInjection(ready, 'brief').content).toBe(renderResearchInjection(refreshed, 'brief').content);
  });

  it('discloses degraded provisional work once and refreshes when AITP recovers', () => {
    const ready = snapshot();
    const degraded = snapshot({ mode: 'degraded' });
    expect(subsequentVerbosity(ready, degraded)).toBe('delta');
    expect(subsequentVerbosity(degraded, { ...degraded, revision: 2 })).toBeUndefined();
    expect(subsequentVerbosity(degraded, ready)).toBe('delta');
    const content = renderResearchInjection(degraded, 'delta').content;
    expect(content).toContain('Independent research continues under normal permissions');
    expect(content).toContain('memory availability does not control Goal continuation or completion');
    expect(content).not.toContain('automatic Goal continuation and completion remain blocked');
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
    }, after)).toBeUndefined();
  });

  it('restores a brief when retained context no longer contains a disclosure', () => {
    const state = maintainedSnapshot();
    expect(resolveResearchVerbosity({ isNewTurn: true }, state)).toBe('brief');
    expect(resolveResearchVerbosity({ isNewTurn: false }, state)).toBe('brief');
    const lastDisclosure = renderResearchInjection(state, 'brief').disclosure;
    expect(resolveResearchVerbosity({ isNewTurn: true, lastDisclosure }, state)).toBeUndefined();
    expect(resolveResearchVerbosity({ isNewTurn: true, lastDisclosure }, {
      ...state, planningPolicy: 'dreaming',
    })).toBe('brief');
  });

  it('discloses legacy plan meaning rather than version-only churn', () => {
    const plan: NonNullable<ResearchStatusSnapshot['researchPlanV2']> = {
      schema: 'hakimi/research-plan-0.2', planId: 'legacy-plan', revision: 1,
      goalId: 'old-goal', programId: 'spin-chain', programObservedRevision: 1,
      goalRelation: 'same_program_goal', objective: 'Check a candidate symmetry',
      milestones: [{ milestoneId: 'm1', title: 'Minimal test', objective: 'Test',
        completionCriterion: 'Report residual', evidenceRequirements: ['Residual'] }],
      evidenceRequirements: [], decisionPoints: [], assumptions: [], currentMilestoneId: 'm1',
      stopConditions: ['Stop on a counterexample'], replanConditions: ['Reconsider the ansatz'],
      status: 'active', createdAt: 1, updatedAt: 1,
    };
    const before = snapshot({ researchPlanV2: plan });
    const versionOnly = snapshot({ researchPlanV2: { ...plan, revision: 2, updatedAt: 2 } });
    expect(subsequentVerbosity(before, versionOnly)).toBeUndefined();
    expect(renderResearchInjection(before, 'brief').content)
      .toBe(renderResearchInjection(versionOnly, 'brief').content);
    for (const changed of [
      { ...plan, objective: 'Check the revised ansatz' },
      { ...plan, milestones: [{ ...plan.milestones[0]!, evidenceRequirements: ['Independent residual'] }] },
      { ...plan, stopConditions: ['Stop on nonzero residual'] },
    ]) {
      expect(subsequentVerbosity(before, snapshot({ researchPlanV2: changed }))).toBe('brief');
    }
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

  it('leaves task text to Goal injection while retaining the actual continuation hold', () => {
    const output = renderResearchInjection(snapshot({
      researchGoal: goal({
        continuation: { state: 'held', reason: 'Pending durable checkpoint' },
      }),
    }), 'brief').content;
    expect(output).not.toContain('Report the full residual and the finite-size limitation');
    expect(output).not.toContain('Test the finite-size symmetry obstruction');
    expect(output).toContain('supplied by the Goal reminder');
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
