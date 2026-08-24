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
