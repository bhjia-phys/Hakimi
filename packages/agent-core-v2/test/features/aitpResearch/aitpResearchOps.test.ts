import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { DisposableStore } from '#/_base/di/lifecycle';
import { TestInstantiationService } from '#/_base/di/test';
import { contextAppendMessage, contextUndo } from '#/agent/contextMemory/contextOps';
import { IEventBus } from '#/app/event/eventBus';
import { EventBusService } from '#/app/event/eventBusService';
import {
  AitpModeModel,
  ResearchModel,
  ResearchCursorModel,
  aitpModeEnter,
  aitpModeExit,
  aitpModeSetPhase,
  aitpModeSetLoopStatus,
  aitpModeSetLine,
  researchCreateLine,
  researchUpdateLine,
  researchCreateQuestion,
  researchUpdateQuestion,
  researchSetFocus,
  researchSwitchLine,
  researchSteer,
  researchProposeCheckpoint,
  researchCommitCheckpoint,
  researchAcknowledgeCheckpoint,
  researchReopenQuestion,
  researchUpsertAlert,
  researchClearAlert,
  researchAcknowledgeAlert,
  researchPlanAction,
  researchStartAction,
  researchCompleteAction,
  researchRecordProgress,
  researchSetPhase,
  researchRequestHumanDecision,
  researchResolveHumanDecision,
} from '#/features/aitpResearch/aitpResearchOps';
import { AppendLogStore } from '#/persistence/backends/node-fs/appendLogStore';
import { InMemoryStorageService } from '#/persistence/backends/memory/inMemoryStorageService';
import { IAppendLogStore } from '#/persistence/interface/appendLogStore';
import { IFileSystemStorageService } from '#/persistence/interface/storage';
import { IWireService } from '#/wire/wire';

import { registerTestAgentWire, testWireScope } from '../../wire/stubs';

const SCOPE = 'wire';
const KEY = 'aitp-research-test';

let disposables: DisposableStore;
let wire: IWireService;
let eventBus: IEventBus;

function buildHost(key: string): IWireService {
  const ix = disposables.add(new TestInstantiationService());
  ix.stub(IFileSystemStorageService, new InMemoryStorageService());
  ix.set(IAppendLogStore, new SyncDescriptor(AppendLogStore));
  ix.set(IEventBus, new SyncDescriptor(EventBusService));
  eventBus = ix.get(IEventBus);
  return registerTestAgentWire(ix, testWireScope(SCOPE, key), {
    log: ix.get(IAppendLogStore),
    eventBus,
  });
}

beforeEach(() => {
  disposables = new DisposableStore();
  wire = buildHost(KEY);
});

afterEach(() => disposables.dispose());

describe('aitpResearch ops (wire-backed)', () => {
  describe('AitpModeModel', () => {
    it('starts inactive', () => {
      const state = wire.getModel(AitpModeModel).current;
      expect(state.phase).toBe('inactive');
      expect(state.loopStatus).toBe('active');
      expect(state.revision).toBe(0);
    });

    it('enter transitions inactive→probing and bumps revision', () => {
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      const state = wire.getModel(AitpModeModel).current;
      expect(state.phase).toBe('probing');
      expect(state.revision).toBe(1);
      expect(state.entryActor).toBe('user');
    });

    it('enter is idempotent when already active', () => {
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      wire.dispatch(aitpModeEnter({ actor: 'model' }));
      const state = wire.getModel(AitpModeModel).current;
      expect(state.revision).toBe(1);
      expect(state.entryActor).toBe('user');
    });

    it('exit transitions to inactive and bumps revision', () => {
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      wire.dispatch(aitpModeExit({}));
      const state = wire.getModel(AitpModeModel).current;
      expect(state.phase).toBe('inactive');
      expect(state.revision).toBe(2);
      expect(state.entryActor).toBeUndefined();
    });

    it('setPhase updates phase and bumps revision', () => {
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
      const state = wire.getModel(AitpModeModel).current;
      expect(state.phase).toBe('ready');
      expect(state.revision).toBe(2);
    });

    it('setPhase is no-op when phase unchanged', () => {
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      wire.dispatch(aitpModeSetPhase({ phase: 'probing' }));
      const state = wire.getModel(AitpModeModel).current;
      expect(state.revision).toBe(1);
    });

    it('setLoopStatus toggles pause/resume and bumps revision', () => {
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      expect(wire.getModel(AitpModeModel).current.loopStatus).toBe('active');
      wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'paused' }));
      expect(wire.getModel(AitpModeModel).current.loopStatus).toBe('paused');
      expect(wire.getModel(AitpModeModel).current.revision).toBe(2);
      wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'active' }));
      expect(wire.getModel(AitpModeModel).current.loopStatus).toBe('active');
      expect(wire.getModel(AitpModeModel).current.revision).toBe(3);
    });

    it('setLoopStatus is no-op when unchanged', () => {
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'active' }));
      expect(wire.getModel(AitpModeModel).current.revision).toBe(1);
    });

    it('setLine persists the current line, bumps revision, and is idempotent', () => {
      const events: string[] = [];
      disposables.add(eventBus.subscribe('aitp_mode.updated', () => events.push('updated')));
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      wire.dispatch(aitpModeSetLine({ lineSlug: 'main' }));
      wire.dispatch(aitpModeSetLine({ lineSlug: 'main' }));

      const state = wire.getModel(AitpModeModel).current;
      expect(state.currentLineSlug).toBe('main');
      expect(state.revision).toBe(2);
      expect(events).toHaveLength(3);
    });

    it('exit is no-op when already inactive', () => {
      wire.dispatch(aitpModeExit({}));
      const state = wire.getModel(AitpModeModel).current;
      expect(state.phase).toBe('inactive');
      expect(state.revision).toBe(0);
    });
  });

  describe('AitpModeModel undo', () => {
    it('undo reverts enter', () => {
      // Create a checkpoint anchor first
      wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
      // Then enter mode
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      expect(wire.getModel(AitpModeModel).current.phase).toBe('probing');
      // Undo back to the checkpoint
      wire.dispatch(contextUndo({ count: 1 }));
      expect(wire.getModel(AitpModeModel).current.phase).toBe('inactive');
    });
  });

  describe('ResearchModel', () => {
    it('starts empty', () => {
      const state = wire.getModel(ResearchModel).current;
      expect(state.questions).toEqual({});
      expect(state.lines).toEqual({});
      expect(state.focus).toBeNull();
      expect(state.pendingCheckpoint).toBeNull();
      expect(state.revision).toBe(0);
      expect(state.phase).toBe('idle');
      expect(state.currentAction).toBeNull();
      expect(state.latestProgress).toBeNull();
      expect(state.recentStateChange).toBeNull();
      expect(state.humanGate).toBeNull();
    });

    it('createQuestion adds a question and bumps revision', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Test question', assessment: 'candidate mechanism', priority: 1, neededEvidence: [],
      }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.questions['q1']).toBeDefined();
      expect(state.questions['q1']!.wording).toBe('Test question');
      expect(state.questions['q1']!.assessment).toBe('candidate mechanism');
      expect(state.questions['q1']!.workflow).toBe('open');
      expect(state.questions['q1']!.epistemic).toBe('unknown');
      expect(state.questions['q1']!.persistence).toBe('working');
      expect(state.questions['q1']!.revision).toBe(1);
      expect(state.revision).toBe(2);
    });

    it('createQuestion is idempotent for duplicate id', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'First', priority: 0, neededEvidence: [],
      }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Second', priority: 0, neededEvidence: [],
      }));
      expect(wire.getModel(ResearchModel).current.questions['q1']!.wording).toBe('First');
      expect(wire.getModel(ResearchModel).current.revision).toBe(2);
    });

    it('updateQuestion changes fields and bumps question revision', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Original', priority: 0, neededEvidence: [],
      }));
      wire.dispatch(researchUpdateQuestion({
        questionId: 'q1', expectedRevision: 1, wording: 'Updated', assessment: 'supported mechanism', workflow: 'active', actor: 'model',
      }));
      const q = wire.getModel(ResearchModel).current.questions['q1']!;
      expect(q.wording).toBe('Updated');
      expect(q.assessment).toBe('supported mechanism');
      expect(q.workflow).toBe('active');
      expect(q.revision).toBe(2);
    });

    it('updateQuestion rejects stale expectedRevision', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Original', priority: 0, neededEvidence: [],
      }));
      wire.dispatch(researchUpdateQuestion({
        questionId: 'q1', expectedRevision: 99, wording: 'Stale', actor: 'model',
      }));
      expect(wire.getModel(ResearchModel).current.questions['q1']!.wording).toBe('Original');
    });

    it('setFocus sets the current focus', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [],
      }));
      wire.dispatch(researchSetFocus({
        questionId: 'q1', boundedAction: 'do something', expectedRevision: 2,
      }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.focus).not.toBeNull();
      expect(state.focus!.questionId).toBe('q1');
      expect(state.focus!.boundedAction).toBe('do something');
    });

    it('switchLine clears focus when it belongs to another line', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateLine({ slug: 'alt', title: 'Alternative', createdAt: 2 }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [],
      }));
      wire.dispatch(researchSetFocus({ questionId: 'q1', expectedRevision: 3 }));
      wire.dispatch(researchSwitchLine({ lineSlug: 'alt', expectedRevision: 4 }));

      const state = wire.getModel(ResearchModel).current;
      expect(state.focus).toBeNull();
      expect(state.revision).toBe(5);
    });

    it('steer close_question clears focus on that question', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [],
      }));
      wire.dispatch(researchSetFocus({
        questionId: 'q1', expectedRevision: 2,
      }));
      wire.dispatch(researchSteer({
        kind: 'close_question', questionId: 'q1', expectedRevision: 0, reason: 'done', actor: 'human',
      }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.questions['q1']!.workflow).toBe('closed');
      expect(state.focus).toBeNull();
    });

    it('reopenQuestion sets workflow back to open', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [],
      }));
      wire.dispatch(researchSteer({
        kind: 'close_question', questionId: 'q1', expectedRevision: 0, actor: 'human',
      }));
      wire.dispatch(researchReopenQuestion({
        questionId: 'q1', expectedRevision: 2, reason: 'new evidence',
      }));
      expect(wire.getModel(ResearchModel).current.questions['q1']!.workflow).toBe('open');
    });

    it('upsertAlert deduplicates by fingerprint without bumping revision', () => {
      wire.dispatch(researchUpsertAlert({
        fingerprint: 'research.alert.blocked.question.q1',
        kind: 'blocked',
        message: 'Question q1 is blocked',
        questionId: 'q1',
        lineSlug: 'main',
        createdAt: 100,
      }));
      const revision = wire.getModel(ResearchModel).current.revision;
      wire.dispatch(researchUpsertAlert({
        fingerprint: 'research.alert.blocked.question.q1',
        kind: 'blocked',
        message: 'Question q1 is blocked',
        questionId: 'q1',
        lineSlug: 'main',
        createdAt: 200,
      }));

      expect(wire.getModel(ResearchModel).current.alerts).toEqual([{
        fingerprint: 'research.alert.blocked.question.q1',
        kind: 'blocked',
        message: 'Question q1 is blocked',
        questionId: 'q1',
        lineSlug: 'main',
        createdAt: 100,
      }]);
      expect(wire.getModel(ResearchModel).current.revision).toBe(revision);
    });

    it('clearAlert removes a condition alert and acknowledgeAlert preserves it', () => {
      wire.dispatch(researchUpsertAlert({
        fingerprint: 'research.alert.stale.maintenance',
        kind: 'stale',
        message: 'stale',
        createdAt: 100,
      }));
      wire.dispatch(researchAcknowledgeAlert({ fingerprint: 'research.alert.stale.maintenance', acknowledgedAt: 200 }));
      const acknowledged = wire.getModel(ResearchModel).current.alerts[0]!;
      expect(acknowledged.acknowledgedAt).toBe(200);
      const revision = wire.getModel(ResearchModel).current.revision;

      wire.dispatch(researchAcknowledgeAlert({ fingerprint: 'research.alert.stale.maintenance', acknowledgedAt: 300 }));
      expect(wire.getModel(ResearchModel).current.revision).toBe(revision);
      wire.dispatch(researchClearAlert({ fingerprint: 'research.alert.stale.maintenance' }));
      expect(wire.getModel(ResearchModel).current.alerts).toEqual([]);
      wire.dispatch(researchClearAlert({ fingerprint: 'research.alert.stale.maintenance' }));
      expect(wire.getModel(ResearchModel).current.revision).toBe(revision + 1);
    });

    it('upsertAlert updates changed content while retaining identity and acknowledgement', () => {
      wire.dispatch(researchUpsertAlert({
        fingerprint: 'research.alert.blocked.aitp-failure',
        kind: 'blocked',
        message: 'one failure',
        createdAt: 100,
      }));
      wire.dispatch(researchAcknowledgeAlert({ fingerprint: 'research.alert.blocked.aitp-failure', acknowledgedAt: 200 }));
      wire.dispatch(researchUpsertAlert({
        fingerprint: 'research.alert.blocked.aitp-failure',
        kind: 'blocked',
        message: 'two failures',
        createdAt: 300,
      }));

      expect(wire.getModel(ResearchModel).current.alerts[0]).toEqual({
        fingerprint: 'research.alert.blocked.aitp-failure',
        kind: 'blocked',
        message: 'two failures',
        createdAt: 100,
        acknowledgedAt: 200,
      });
    });

    it('proposeCheckpoint sets pendingCheckpoint', () => {
      wire.dispatch(researchProposeCheckpoint({
        checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000,
      }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.pendingCheckpoint).not.toBeNull();
      expect(state.pendingCheckpoint!.checkpointId).toBe('cp1');
      expect(state.pendingCheckpoint!.persistence).toBe('pending_commit');
    });

    it('proposeCheckpoint preserves the first pending checkpoint', () => {
      wire.dispatch(researchProposeCheckpoint({
        checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000,
      }));
      wire.dispatch(researchProposeCheckpoint({
        checkpointId: 'cp2', idempotencyKey: 'key2', createdAt: 2000,
      }));

      expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe('cp1');
      expect(wire.getModel(ResearchModel).current.revision).toBe(1);
    });

    it('createQuestion ignores a question whose line is missing', () => {
      wire.dispatch(researchCreateQuestion({
        id: 'orphan', lineSlug: 'missing', wording: 'Orphan', priority: 0, neededEvidence: [],
      }));

      expect(wire.getModel(ResearchModel).current.questions['orphan']).toBeUndefined();
      expect(wire.getModel(ResearchModel).current.revision).toBe(0);
    });

    it('commitCheckpoint does not overwrite a different committed cursor', () => {
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 }));
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp2', entryId: 'e2', committedAt: 2000 }));

      expect(wire.getModel(ResearchCursorModel).cursor).toEqual({
        checkpointId: 'cp1',
        entryId: 'e1',
        committedAt: 1000,
      });
      expect(wire.getModel(ResearchCursorModel).revision).toBe(1);
    });

    it('acknowledgeCheckpoint commits the linked question and clears pending state', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [],
      }));
      wire.dispatch(researchProposeCheckpoint({
        checkpointId: 'cp1', questionId: 'q1', idempotencyKey: 'key1', createdAt: 1000,
      }));
      expect(wire.getModel(ResearchModel).current.questions['q1']!.persistence).toBe('pending_commit');

      wire.dispatch(researchAcknowledgeCheckpoint({ checkpointId: 'cp1', entryId: 'e1' }));

      const state = wire.getModel(ResearchModel).current;
      expect(state.pendingCheckpoint).toBeNull();
      expect(state.questions['q1']!.persistence).toBe('committed');
    });

    it('createLine adds a line with createdAt and bumps revision', () => {
      wire.dispatch(researchCreateLine({
        slug: 'main', title: 'Main Line', createdAt: 5000,
      }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.lines['main']).toBeDefined();
      expect(state.lines['main']!.title).toBe('Main Line');
      expect(state.lines['main']!.status).toBe('active');
      expect(state.lines['main']!.createdAt).toBe(5000);
      expect(state.lines['main']!.revision).toBe(1);
      expect(state.revision).toBe(1);
    });

    it('updateLine changes fields and ignores stale revisions', () => {
      wire.dispatch(researchCreateLine({
        slug: 'main', title: 'Main Line', objective: 'Original', assessment: 'open', createdAt: 5000,
      }));
      wire.dispatch(researchUpdateLine({
        slug: 'main', expectedRevision: 1, title: 'Updated Line', objective: 'Refined',
        status: 'paused', assessment: 'revised', reason: 'new evidence',
      }));
      wire.dispatch(researchUpdateLine({
        slug: 'main', expectedRevision: 1, title: 'Stale',
      }));

      const line = wire.getModel(ResearchModel).current.lines['main']!;
      expect(line.title).toBe('Updated Line');
      expect(line.objective).toBe('Refined');
      expect(line.status).toBe('paused');
      expect(line.assessment).toBe('revised');
      expect(line.revision).toBe(2);
    });

    it('createLine is idempotent for duplicate slug', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'First', createdAt: 100 }));
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Second', createdAt: 200 }));
      expect(wire.getModel(ResearchModel).current.lines['main']!.title).toBe('First');
      expect(wire.getModel(ResearchModel).current.lines['main']!.createdAt).toBe(100);
      expect(wire.getModel(ResearchModel).current.revision).toBe(1);
    });
  });

  describe('ResearchModel scientific state ops', () => {
    it('setPhase transitions idle→orienting and records state change', () => {
      wire.dispatch(researchSetPhase({ phase: 'orienting', reason: 'start', changedAt: 100 }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.phase).toBe('orienting');
      expect(state.recentStateChange).not.toBeNull();
      expect(state.recentStateChange!.beforePhase).toBe('idle');
      expect(state.recentStateChange!.afterPhase).toBe('orienting');
      expect(state.recentStateChange!.summary).toBe('start');
      expect(state.revision).toBe(1);
    });

    it('setPhase is a no-op when phase is unchanged', () => {
      wire.dispatch(researchSetPhase({ phase: 'orienting', changedAt: 100 }));
      wire.dispatch(researchSetPhase({ phase: 'orienting', changedAt: 200 }));
      expect(wire.getModel(ResearchModel).current.revision).toBe(1);
    });

    it('setPhase is a no-op for invalid transition', () => {
      wire.dispatch(researchSetPhase({ phase: 'action_executing', changedAt: 100 }));
      expect(wire.getModel(ResearchModel).current.phase).toBe('idle');
      expect(wire.getModel(ResearchModel).current.revision).toBe(0);
    });

    it('planAction transitions to action_planned and stores the action', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 200 }));
      wire.dispatch(researchCreateQuestion({ id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [] }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', questionId: 'q1', lineSlug: 'main', kind: 'experiment',
        purpose: 'test hypothesis', expectedEvidence: ['measurement'],
        stopCondition: 'p < 0.05', allowedToolKinds: ['bash'], requiresHumanApproval: false,
        createdAt: 300,
      }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.phase).toBe('action_planned');
      expect(state.currentAction).not.toBeNull();
      expect(state.currentAction!.actionId).toBe('a1');
      expect(state.currentAction!.status).toBe('planned');
      expect(state.currentAction!.kind).toBe('experiment');
    });

    it('planAction is a no-op from an invalid phase', () => {
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'x', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 100,
      }));
      expect(wire.getModel(ResearchModel).current.currentAction).toBeNull();
    });

    it('planAction is a no-op when questionId is missing', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', questionId: 'missing', kind: 'experiment', purpose: 'x',
        expectedEvidence: [], stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false,
        createdAt: 200,
      }));
      expect(wire.getModel(ResearchModel).current.currentAction).toBeNull();
    });

    it('startAction transitions action_planned→action_executing', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'x', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      wire.dispatch(researchStartAction({ actionId: 'a1', startedAt: 300 }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.phase).toBe('action_executing');
      expect(state.currentAction!.status).toBe('in_progress');
    });

    it('startAction is a no-op with wrong actionId', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'x', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      wire.dispatch(researchStartAction({ actionId: 'wrong', startedAt: 300 }));
      expect(wire.getModel(ResearchModel).current.phase).toBe('action_planned');
    });

    it('completeAction transitions action_executing→evaluating', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'x', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      wire.dispatch(researchStartAction({ actionId: 'a1', startedAt: 300 }));
      wire.dispatch(researchCompleteAction({ actionId: 'a1', status: 'completed', completedAt: 400 }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.phase).toBe('evaluating');
      expect(state.currentAction!.status).toBe('completed');
      expect(state.currentAction!.completedAt).toBe(400);
    });

    it('completeAction is a no-op from wrong phase', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'x', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      wire.dispatch(researchCompleteAction({ actionId: 'a1', status: 'completed', completedAt: 300 }));
      expect(wire.getModel(ResearchModel).current.phase).toBe('action_planned');
    });

    it('recordProgress stores the report and updates phase via phaseChange', () => {
      wire.dispatch(researchSetPhase({ phase: 'orienting', changedAt: 100 }));
      wire.dispatch(researchRecordProgress({
        headline: 'Found gap', motivation: 'no data', workPerformed: 'literature review',
        result: 'gap identified', mainlineImpact: 'opens new direction', uncertainties: [],
        phaseChange: { from: 'orienting', to: 'gap_analysis' }, recordedAt: 200,
      }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.phase).toBe('gap_analysis');
      expect(state.latestProgress).not.toBeNull();
      expect(state.latestProgress!.headline).toBe('Found gap');
      expect(state.recentStateChange!.beforePhase).toBe('orienting');
      expect(state.recentStateChange!.afterPhase).toBe('gap_analysis');
    });

    it('recordProgress ignores invalid phaseChange but still stores the report', () => {
      wire.dispatch(researchRecordProgress({
        headline: 'test', motivation: 'm', workPerformed: 'w', result: 'r',
        mainlineImpact: 'i', uncertainties: [],
        phaseChange: { from: 'idle', to: 'action_executing' }, recordedAt: 100,
      }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.phase).toBe('idle');
      expect(state.latestProgress).not.toBeNull();
      expect(state.latestProgress!.headline).toBe('test');
    });

    it('recordProgress stores detail fields', () => {
      wire.dispatch(researchRecordProgress({
        headline: 'detailed', motivation: 'm', workPerformed: 'w', result: 'r',
        mainlineImpact: 'i', uncertainties: ['u1'],
        detail: { assumptions: ['a1'], derivation: 'step 1', tests: ['t1'] },
        recordedAt: 100,
      }));
      const progress = wire.getModel(ResearchModel).current.latestProgress!;
      expect(progress.detail).toBeDefined();
      expect(progress.detail!.assumptions).toEqual(['a1']);
      expect(progress.detail!.derivation).toBe('step 1');
    });

    it('requestHumanDecision sets phase to awaiting_human and stores gate', () => {
      wire.dispatch(researchSetPhase({ phase: 'orienting', changedAt: 100 }));
      wire.dispatch(researchRequestHumanDecision({
        gateId: 'g1', kind: 'approval', prompt: 'approve experiment?', createdAt: 200,
      }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.phase).toBe('awaiting_human');
      expect(state.humanGate).not.toBeNull();
      expect(state.humanGate!.gateId).toBe('g1');
      expect(state.humanGate!.kind).toBe('approval');
    });

    it('requestHumanDecision is a no-op when actionId does not match currentAction', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'x', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      wire.dispatch(researchRequestHumanDecision({
        gateId: 'g1', kind: 'approval', actionId: 'wrong', prompt: 'p', createdAt: 300,
      }));
      expect(wire.getModel(ResearchModel).current.humanGate).toBeNull();
    });

    it('resolveHumanDecision restores a legal phase and preserves the resolved gate', () => {
      wire.dispatch(researchSetPhase({ phase: 'orienting', changedAt: 100 }));
      wire.dispatch(researchRequestHumanDecision({
        gateId: 'g1', kind: 'decision', prompt: 'choose a direction', createdAt: 200,
      }));
      wire.dispatch(researchResolveHumanDecision({
        gateId: 'g1', resolution: 'Continue with the measured path', nextPhase: 'gap_analysis', changedAt: 300,
      }));

      const state = wire.getModel(ResearchModel).current;
      expect(state.phase).toBe('gap_analysis');
      expect(state.humanGate).toMatchObject({
        gateId: 'g1',
        prompt: 'choose a direction',
        resolvedAt: 300,
        resolution: 'Continue with the measured path',
      });
      expect(state.recentStateChange).toMatchObject({
        beforePhase: 'awaiting_human',
        afterPhase: 'gap_analysis',
        summary: 'Continue with the measured path',
        changedAt: 300,
      });
    });

    it('resolveHumanDecision is a no-op for a wrong gate id', () => {
      wire.dispatch(researchRequestHumanDecision({
        gateId: 'g1', kind: 'review', prompt: 'review the result', createdAt: 100,
      }));
      const before = wire.getModel(ResearchModel).current;
      wire.dispatch(researchResolveHumanDecision({
        gateId: 'wrong', resolution: 'ignored', nextPhase: 'idle', changedAt: 200,
      }));

      const after = wire.getModel(ResearchModel).current;
      expect(after).toBe(before);
      expect(after.phase).toBe('awaiting_human');
      expect(after.humanGate?.resolvedAt).toBeUndefined();
    });

    it('resolveHumanDecision is a no-op for an invalid recovery phase and on double resolve', () => {
      wire.dispatch(researchRequestHumanDecision({
        gateId: 'g1', kind: 'review', prompt: 'review the result', createdAt: 100,
      }));
      const beforeInvalid = wire.getModel(ResearchModel).current;
      wire.dispatch(researchResolveHumanDecision({
        gateId: 'g1', resolution: 'ignored', nextPhase: 'state_updated', changedAt: 200,
      }));
      expect(wire.getModel(ResearchModel).current).toBe(beforeInvalid);

      wire.dispatch(researchResolveHumanDecision({
        gateId: 'g1', resolution: 'approved', nextPhase: 'idle', changedAt: 300,
      }));
      const resolved = wire.getModel(ResearchModel).current;
      wire.dispatch(researchResolveHumanDecision({
        gateId: 'g1', resolution: 'changed later', nextPhase: 'gap_analysis', changedAt: 400,
      }));

      expect(wire.getModel(ResearchModel).current).toBe(resolved);
      expect(resolved.humanGate?.resolution).toBe('approved');
      expect(resolved.phase).toBe('idle');
    });
  });

  describe('ResearchCursorModel (non-checkpointed)', () => {
    it('starts with null cursor', () => {
      expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    });

    it('commitCheckpoint advances the cursor', () => {
      wire.dispatch(researchCommitCheckpoint({
        checkpointId: 'cp1', entryId: 'e1', committedAt: 2000,
      }));
      wire.dispatch(researchCommitCheckpoint({
        checkpointId: 'cp1', entryId: 'e1', committedAt: 3000,
      }));
      const cursor = wire.getModel(ResearchCursorModel);
      expect(cursor.cursor).not.toBeNull();
      expect(cursor.cursor!.checkpointId).toBe('cp1');
      expect(cursor.cursor!.entryId).toBe('e1');
      expect(cursor.cursor!.committedAt).toBe(2000);
      expect(cursor.revision).toBe(1);
    });

    it('committed cursor is NOT reverted by conversation undo', () => {
      wire.dispatch(researchCommitCheckpoint({
        checkpointId: 'cp1', entryId: 'e1', committedAt: 2000,
      }));
      wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
      wire.dispatch(contextUndo({ count: 1 }));
      expect(wire.getModel(ResearchCursorModel).cursor).not.toBeNull();
      expect(wire.getModel(ResearchCursorModel).cursor!.checkpointId).toBe('cp1');
    });
  });

  describe('ResearchModel undo', () => {
    it('undo reverts question creation', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      // Create a checkpoint anchor first
      wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
      // Then create the question
      wire.dispatch(researchCreateQuestion({
        id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [],
      }));
      expect(wire.getModel(ResearchModel).current.questions['q1']).toBeDefined();
      // Undo back to the checkpoint
      wire.dispatch(contextUndo({ count: 1 }));
      expect(wire.getModel(ResearchModel).current.questions['q1']).toBeUndefined();
    });
  });
});
