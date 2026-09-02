import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { DisposableStore } from '#/_base/di/lifecycle';
import { TestInstantiationService } from '#/_base/di/test';
import {
  contextAppendMessage,
  contextApplyCompaction,
  contextUndo,
} from '#/agent/contextMemory/contextOps';
import { IEventBus } from '#/app/event/eventBus';
import { EventBusService } from '#/app/event/eventBusService';
import {
  AitpModeModel,
  ResearchModel,
  ResearchCursorModel,
  ResearchRevisionModel,
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
  researchBindCheckpointEntry,
  researchBindCheckpointReceipt,
  researchCommitCheckpoint,
  researchAcknowledgeCheckpoint,
  researchReopenQuestion,
  researchUpsertAlert,
  researchClearAlert,
  researchAcknowledgeAlert,
  researchPlanAction,
  researchBeginAction,
  researchStartAction,
  researchCompleteAction,
  researchObserveRun,
  researchRecordProgress,
  researchSetPhase,
  researchRequestHumanDecision,
  researchResolveHumanDecision,
  researchSetProgram,
  researchConfirmGoalAlignment,
  researchClearGoalAlignment,
  researchStartPeriod,
  researchUpdatePeriod,
  researchEndPeriod,
  researchAdvanceRevision,
} from '#/features/aitpResearch/aitpResearchOps';
import { AppendLogStore } from '#/persistence/backends/node-fs/appendLogStore';
import { InMemoryStorageService } from '#/persistence/backends/memory/inMemoryStorageService';
import { IAppendLogStore } from '#/persistence/interface/appendLogStore';
import { IFileSystemStorageService } from '#/persistence/interface/storage';
import { IWireService } from '#/wire/wire';

import { registerTestAgentWire, testWireScope } from '../../wire/stubs';
import { createExternalFactFacade } from '#/features/aitpResearch/research/externalFactService';
import { researchPutPlanV2 } from '#/features/aitpResearch/researchPlanV2Ops';
import { researchSetPlanningPolicy } from '#/features/aitpResearch/researchPlanningPolicyOps';
import {
  researchClearWorkstreamBinding,
  researchConfirmWorkstreamBinding,
} from '#/features/aitpResearch/researchWorkstreamBindingOps';
import { deriveLineWorkstreamAlignment } from '#/features/aitpResearch/research/workstreamBinding';

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

    it('cold replay does not revive an exited mode from a late persisted phase update', async () => {
      wire.dispatch(aitpModeEnter({ actor: 'user' }));
      wire.dispatch(aitpModeExit({}));
      wire.dispatch(aitpModeSetPhase({ phase: 'degraded' }));

      expect(wire.getModel(AitpModeModel).current).toMatchObject({
        phase: 'inactive',
        revision: 2,
      });
      await wire.restore();
      expect(wire.getModel(AitpModeModel).current).toMatchObject({
        phase: 'inactive',
        entryActor: undefined,
      });
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
      expect(state.lineWorkstreamBindings).toEqual({});
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
        classification: 'active_blocker',
        source: 'question',
        state: 'active',
        message: 'Question q1 is blocked',
        questionId: 'q1',
        lineSlug: 'main',
        relatedEntryId: undefined,
        workstream: undefined,
        retryOfEntryId: undefined,
        reason: undefined,
        createdAt: 100,
      }]);
      expect(wire.getModel(ResearchModel).current.revision).toBe(revision);
    });

    it('clearAlert retains a cleared condition and acknowledgeAlert preserves it', () => {
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
      expect(wire.getModel(ResearchModel).current.alerts[0]).toMatchObject({
        fingerprint: 'research.alert.stale.maintenance',
        state: 'cleared',
        acknowledgedAt: 200,
      });
      const clearedRevision = wire.getModel(ResearchModel).current.revision;
      wire.dispatch(researchClearAlert({ fingerprint: 'research.alert.stale.maintenance' }));
      expect(wire.getModel(ResearchModel).current.revision).toBe(clearedRevision);
    });

    it('upsertAlert reactivates a cleared condition and clears its acknowledgement', () => {
      wire.dispatch(researchUpsertAlert({
        fingerprint: 'research.alert.stale.maintenance',
        kind: 'stale',
        message: 'stale',
        createdAt: 100,
      }));
      wire.dispatch(researchAcknowledgeAlert({ fingerprint: 'research.alert.stale.maintenance', acknowledgedAt: 200 }));
      wire.dispatch(researchClearAlert({ fingerprint: 'research.alert.stale.maintenance' }));
      wire.dispatch(researchUpsertAlert({
        fingerprint: 'research.alert.stale.maintenance',
        kind: 'stale',
        message: 'stale again',
        createdAt: 300,
      }));

      expect(wire.getModel(ResearchModel).current.alerts[0]).toMatchObject({
        fingerprint: 'research.alert.stale.maintenance',
        state: 'active',
        acknowledgedAt: undefined,
        message: 'stale again',
        createdAt: 100,
      });
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
        classification: 'active_blocker',
        source: 'adapter',
        state: 'acknowledged',
        message: 'two failures',
        questionId: undefined,
        lineSlug: undefined,
        relatedEntryId: undefined,
        workstream: undefined,
        retryOfEntryId: undefined,
        reason: undefined,
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

    it('undo removes an unsaved conclude candidate with its pending checkpoint', () => {
      wire.dispatch(contextAppendMessage({
        message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
      }));
      wire.dispatch(researchProposeCheckpoint({
        checkpointId: 'cp-candidate',
        idempotencyKey: 'key-candidate',
        createdAt: 1000,
        commitCandidate: {
          sourceActionId: 'action-1',
          progressRecordedAt: 999,
          entryKind: 'failure',
          authority: 'tool',
          provenance: 'tool_verification',
          rationale: 'The repeated tool failure is a durable delta.',
        },
      }));
      expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.commitCandidate)
        .toMatchObject({ entryKind: 'failure', authority: 'tool' });

      wire.dispatch(contextUndo({ count: 1 }));

      expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();
    });

    it('restores a pending checkpoint with its bound AITP entry and receipts', async () => {
      wire.dispatch(
        researchProposeCheckpoint({
          checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000,
          commitCandidate: {
            sourceActionId: 'action-1',
            progressRecordedAt: 999,
            entryKind: 'result',
            authority: 'agent',
            provenance: 'agent_verification',
            rationale: 'The checked result is a durable delta.',
          },
        }),
        researchBindCheckpointEntry({ checkpointId: 'cp1', entryId: 'e1' }),
        researchBindCheckpointReceipt({
          checkpointId: 'cp1',
          receipt: {
            prepare: {
              status: 'prepared',
              id: 'e1',
              path: '.aitp/local/drafts/e1.md',
              idempotencyKey: 'key1',
            },
            save: {
              status: 'saved',
              draftPath: '.aitp/local/drafts/e1.md',
              path: '.aitp/topic/entries/entry-e1.md',
            },
            preSaveCheck: {
              status: 'clean',
              errors: 0,
              warnings: 0,
              findingFingerprints: [],
              errorFindingFingerprints: [],
              checkedAt: 1100,
            },
          },
        }),
      );

      await wire.restore();

      expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toMatchObject({
        checkpointId: 'cp1',
        committedEntryId: 'e1',
        commitCandidate: {
          sourceActionId: 'action-1',
          progressRecordedAt: 999,
          entryKind: 'result',
          authority: 'agent',
          provenance: 'agent_verification',
        },
        receipt: {
          prepare: { status: 'prepared', id: 'e1', idempotencyKey: 'key1' },
          save: { status: 'saved', draftPath: '.aitp/local/drafts/e1.md' },
          preSaveCheck: { status: 'clean', errors: 0 },
        },
      });
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

    it('proposeCheckpoint does not silently overwrite a pending checkpoint for the same question revision', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateQuestion({ id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [] }));
      wire.dispatch(researchProposeCheckpoint({
        checkpointId: 'cp1', questionId: 'q1', idempotencyKey: 'key1', createdAt: 1000,
      }));
      const firstRevision = wire.getModel(ResearchModel).current.revision;
      const firstQuestionRevision = wire.getModel(ResearchModel).current.questions['q1']!.revision;

      // A second checkpoint for the same question remains pending on the first.
      wire.dispatch(researchProposeCheckpoint({
        checkpointId: 'cp2', questionId: 'q1', idempotencyKey: 'key2', createdAt: 2000,
      }));

      const state = wire.getModel(ResearchModel).current;
      expect(state.pendingCheckpoint?.checkpointId).toBe('cp1');
      expect(state.pendingCheckpoint?.questionId).toBe('q1');
      expect(state.revision).toBe(firstRevision);
      expect(state.questions['q1']!.revision).toBe(firstQuestionRevision);
    });

    it('createQuestion ignores a question whose line is missing', () => {
      wire.dispatch(researchCreateQuestion({
        id: 'orphan', lineSlug: 'missing', wording: 'Orphan', priority: 0, neededEvidence: [],
      }));

      expect(wire.getModel(ResearchModel).current.questions['orphan']).toBeUndefined();
      expect(wire.getModel(ResearchModel).current.revision).toBe(0);
    });

    it('commitCheckpoint appends a different committed cursor to history', () => {
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 }));
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp2', entryId: 'e2', committedAt: 2000 }));

      const cursorModel = wire.getModel(ResearchCursorModel);
      // `cursor` is the latest commit projection; `history` keeps every commit.
      expect(cursorModel.cursor).toEqual({
        checkpointId: 'cp2',
        entryId: 'e2',
        committedAt: 2000,
      });
      expect(cursorModel.history).toEqual([
        { checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 },
        { checkpointId: 'cp2', entryId: 'e2', committedAt: 2000 },
      ]);
      expect(cursorModel.revision).toBe(2);
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

    it('confirms an explicit Line-to-workstream binding against the observed Topic revision', () => {
      wire.dispatch(researchCreateLine({ slug: 'local-line', title: 'Local line', createdAt: 1 }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 2,
      }));
      wire.dispatch(researchConfirmWorkstreamBinding({
        confirmationId: 'confirmation-1',
        lineSlug: 'local-line',
        workstream: 'aitp-workstream',
        topicId: 'topic-a',
        observedRevision: 1,
        confirmedBy: 'user',
        confirmedAt: 3,
        expectedRevision: 2,
      }));

      const state = wire.getModel(ResearchModel).current;
      expect(state.lineWorkstreamBindings).toEqual({
        'local-line': {
          confirmationId: 'confirmation-1',
          lineSlug: 'local-line',
          workstream: 'aitp-workstream',
          topicId: 'topic-a',
          observedRevision: 1,
          confirmedBy: 'user',
          confirmedAt: 3,
        },
      });
      expect(state.lines['local-line']?.revision).toBe(2);
      expect(state.revision).toBe(3);
    });

    it('rejects stale, conflicting, and implicit Line-to-workstream binding ops', () => {
      wire.dispatch(researchCreateLine({ slug: 'local-line', title: 'Local line', createdAt: 1 }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 2,
      }));
      const base = {
        confirmationId: 'confirmation-1',
        lineSlug: 'local-line',
        workstream: 'aitp-workstream',
        topicId: 'topic-a',
        observedRevision: 1,
        confirmedBy: 'main_agent' as const,
        confirmedAt: 3,
      };

      wire.dispatch(researchConfirmWorkstreamBinding({ ...base, expectedRevision: 1 }));
      wire.dispatch(researchConfirmWorkstreamBinding({ ...base, topicId: 'topic-b', expectedRevision: 2 }));
      wire.dispatch(researchConfirmWorkstreamBinding({ ...base, observedRevision: 2, expectedRevision: 2 }));
      wire.dispatch(researchConfirmWorkstreamBinding({ ...base, lineSlug: 'missing', expectedRevision: 2 }));
      expect(wire.getModel(ResearchModel).current.lineWorkstreamBindings).toEqual({});

      wire.dispatch(researchConfirmWorkstreamBinding({ ...base, expectedRevision: 2 }));
      const confirmedRevision = wire.getModel(ResearchModel).current.revision;
      wire.dispatch(researchConfirmWorkstreamBinding({
        ...base,
        workstream: 'different-workstream',
        expectedRevision: confirmedRevision,
      }));
      expect(wire.getModel(ResearchModel).current.lineWorkstreamBindings).toEqual({
        'local-line': expect.objectContaining({ workstream: 'aitp-workstream' }),
      });
      expect(wire.getModel(ResearchModel).current.revision).toBe(confirmedRevision);
    });

    it('makes confirmation idempotent and requires the exact immutable binding to clear it', () => {
      wire.dispatch(researchCreateLine({ slug: 'local-line', title: 'Local line', createdAt: 1 }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 2,
      }));
      const binding = {
        confirmationId: 'confirmation-1',
        lineSlug: 'local-line',
        workstream: 'aitp-workstream',
        topicId: 'topic-a',
        observedRevision: 1,
        confirmedBy: 'user' as const,
        confirmedAt: 3,
      };
      wire.dispatch(researchConfirmWorkstreamBinding({ ...binding, expectedRevision: 2 }));
      const confirmedRevision = wire.getModel(ResearchModel).current.revision;
      wire.dispatch(researchConfirmWorkstreamBinding({ ...binding, expectedRevision: confirmedRevision }));
      expect(wire.getModel(ResearchModel).current.revision).toBe(confirmedRevision);

      wire.dispatch(researchClearWorkstreamBinding({
        binding: { ...binding, confirmedAt: 4 },
        expectedRevision: confirmedRevision,
      }));
      expect(wire.getModel(ResearchModel).current.lineWorkstreamBindings?.['local-line']).toEqual(binding);

      wire.dispatch(researchClearWorkstreamBinding({ binding, expectedRevision: confirmedRevision }));
      expect(wire.getModel(ResearchModel).current.lineWorkstreamBindings).toEqual({});
      expect(wire.getModel(ResearchModel).current.revision).toBe(confirmedRevision + 1);
    });

    it('fails closed when a persisted map key and binding Line identity disagree', () => {
      expect(deriveLineWorkstreamAlignment({
        lineSlug: 'line-a',
        binding: {
          confirmationId: 'confirmation-1',
          lineSlug: 'line-b',
          workstream: 'ws-b',
          topicId: 'topic-a',
          observedRevision: 1,
          confirmedBy: 'user',
          confirmedAt: 3,
        },
        program: {
          topicId: 'topic-a',
          title: 'Topic A',
          goalText: 'Prove X',
          goalSource: 'TOPIC.md',
          establishedAt: 2,
          observedRevision: 1,
        },
      })).toMatchObject({
        lineSlug: 'line-a',
        status: 'conflict',
        binding: { lineSlug: 'line-b' },
      });
    });

    it('clears an exact legacy binding by its map-key Line when the embedded Line identity disagrees', () => {
      wire.dispatch(researchCreateLine({ slug: 'line-a', title: 'Line A', createdAt: 1 }));
      wire.dispatch(researchCreateLine({ slug: 'line-b', title: 'Line B', createdAt: 2 }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 3,
      }));
      const malformed = {
        confirmationId: 'confirmation-legacy',
        lineSlug: 'line-b',
        workstream: 'ws-b',
        topicId: 'topic-a',
        observedRevision: 1,
        confirmedBy: 'user' as const,
        confirmedAt: 4,
      };
      const state = wire.getModel(ResearchModel).current;
      Object.assign(state.lineWorkstreamBindings!, { 'line-a': malformed });
      const expectedRevision = state.revision;
      const lineRevision = state.lines['line-a']!.revision;

      wire.dispatch(researchClearWorkstreamBinding({
        binding: malformed,
        targetLineSlug: 'line-a',
        expectedRevision,
      }));

      const cleared = wire.getModel(ResearchModel).current;
      expect(cleared.lineWorkstreamBindings).toEqual({});
      expect(cleared.lines['line-a']?.revision).toBe(lineRevision + 1);
      expect(cleared.lines['line-b']?.revision).toBe(1);
      expect(cleared.revision).toBe(expectedRevision + 1);
    });

    it('does not revive an old binding after a cleared Topic observation changes or cycles', () => {
      wire.dispatch(researchCreateLine({ slug: 'local-line', title: 'Local line', createdAt: 1 }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 2,
      }));
      const binding = {
        confirmationId: 'confirmation-1',
        lineSlug: 'local-line',
        workstream: 'aitp-workstream',
        topicId: 'topic-a',
        observedRevision: 1,
        confirmedBy: 'user' as const,
        confirmedAt: 3,
      };
      wire.dispatch(researchConfirmWorkstreamBinding({ ...binding, expectedRevision: 2 }));

      wire.dispatch(researchSetProgram({ clear: true }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 4,
      }));
      let state = wire.getModel(ResearchModel).current;
      expect(state.program).toMatchObject({ observedRevision: 1, establishedAt: 2 });
      expect(deriveLineWorkstreamAlignment({
        lineSlug: 'local-line',
        binding: state.lineWorkstreamBindings?.['local-line'],
        program: state.program === null
          ? null
          : { ...state.program, observedRevision: state.program.observedRevision ?? 1 },
      }).status).toBe('bound');

      wire.dispatch(researchSetProgram({ clear: true }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A revised', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 5,
      }));
      state = wire.getModel(ResearchModel).current;
      expect(state.program?.observedRevision).toBe(2);
      expect(deriveLineWorkstreamAlignment({
        lineSlug: 'local-line',
        binding: state.lineWorkstreamBindings?.['local-line'],
        program: state.program === null
          ? null
          : { ...state.program, observedRevision: state.program.observedRevision ?? 1 },
      }).status).toBe('stale');

      wire.dispatch(researchSetProgram({ clear: true }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-b', title: 'Topic B', goalText: 'Prove Y', goalSource: 'TOPIC.md', establishedAt: 6,
      }));
      wire.dispatch(researchSetProgram({ clear: true }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 7,
      }));
      state = wire.getModel(ResearchModel).current;
      expect(state.program?.observedRevision).toBe(4);
      expect(deriveLineWorkstreamAlignment({
        lineSlug: 'local-line',
        binding: state.lineWorkstreamBindings?.['local-line'],
        program: state.program === null
          ? null
          : { ...state.program, observedRevision: state.program.observedRevision ?? 1 },
      }).status).toBe('stale');
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

    it('beginAction transitions idle to action_executing while preserving question ownership', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 100 }));
      wire.dispatch(researchCreateQuestion({ id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [] }));
      wire.dispatch(researchSetFocus({ questionId: 'q1', expectedRevision: 2 }));
      expect(wire.getModel(ResearchModel).current.phase).toBe('idle');

      wire.dispatch(researchBeginAction({
        actionId: 'a1', questionId: 'q1', lineSlug: 'main', kind: 'experiment',
        purpose: 'test hypothesis', expectedEvidence: ['measurement'],
        stopCondition: 'p < 0.05', allowedToolKinds: ['bash'], requiresHumanApproval: false,
        createdAt: 300,
      }));

      const state = wire.getModel(ResearchModel).current;
      expect(state.phase).toBe('action_executing');
      expect(state.currentAction).toMatchObject({
        actionId: 'a1', questionId: 'q1', lineSlug: 'main', status: 'in_progress',
      });
      expect(state.focus?.questionId).toBe('q1');
    });

    it('planAction is a no-op from an invalid phase', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'existing', kind: 'experiment', purpose: 'existing action', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      wire.dispatch(researchStartAction({ actionId: 'existing', startedAt: 300 }));
      wire.dispatch(researchCompleteAction({ actionId: 'existing', status: 'completed', completedAt: 400 }));
      const before = wire.getModel(ResearchModel).current;

      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'x', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 500,
      }));

      expect(wire.getModel(ResearchModel).current).toBe(before);
      expect(before.phase).toBe('evaluating');
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

    it('requestHumanDecision is a replay no-op when a human gate is already pending', () => {
      wire.dispatch(researchSetPhase({ phase: 'orienting', changedAt: 100 }));
      wire.dispatch(researchRequestHumanDecision({
        gateId: 'g1', kind: 'approval', prompt: 'approve?', createdAt: 200,
      }));
      const before = wire.getModel(ResearchModel).current;
      // A second request for a new gate must not overwrite the unresolved gate.
      wire.dispatch(researchRequestHumanDecision({
        gateId: 'g2', kind: 'decision', prompt: 'choose?', createdAt: 300,
      }));

      const after = wire.getModel(ResearchModel).current;
      expect(after).toBe(before);
      expect(after.humanGate?.gateId).toBe('g1');
      expect(after.humanGate?.resolvedAt).toBeUndefined();
      expect(after.phase).toBe('awaiting_human');
    });

    it('planAction is a replay no-op while a foreground action is still live (no orphaning)', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'first', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      expect(wire.getModel(ResearchModel).current.currentAction?.actionId).toBe('a1');

      // Replanning from action_planned (an allowed phase) must not orphan a1.
      wire.dispatch(researchPlanAction({
        actionId: 'a2', kind: 'derivation', purpose: 'second', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 300,
      }));

      const state = wire.getModel(ResearchModel).current;
      expect(state.currentAction?.actionId).toBe('a1');
      expect(state.currentAction?.status).toBe('planned');
      expect(state.phase).toBe('action_planned');
    });

    it('planning and begin are replay no-ops from idle while a human gate is unresolved', () => {
      wire.dispatch(researchRequestHumanDecision({
        gateId: 'g1', kind: 'decision', prompt: 'choose a direction', createdAt: 100,
      }));
      wire.dispatch(researchSetPhase({ phase: 'idle', changedAt: 150 }));
      const before = wire.getModel(ResearchModel).current;
      expect(before.phase).toBe('idle');
      expect(before.humanGate?.resolvedAt).toBeUndefined();

      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'blocked plan', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      wire.dispatch(researchBeginAction({
        actionId: 'a2', kind: 'experiment', purpose: 'blocked begin', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 300,
      }));

      expect(wire.getModel(ResearchModel).current).toBe(before);
    });

    it('rejects action question/line mismatches during replay', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchCreateLine({ slug: 'alt', title: 'Alt', createdAt: 2 }));
      wire.dispatch(researchCreateQuestion({ id: 'q1', lineSlug: 'main', wording: 'Q1', priority: 0, neededEvidence: [] }));
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 3 }));
      const before = wire.getModel(ResearchModel).current;

      wire.dispatch(researchPlanAction({
        actionId: 'a1', questionId: 'q1', lineSlug: 'alt', kind: 'experiment', purpose: 'wrong owner',
        expectedEvidence: [], stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 4,
      }));

      expect(wire.getModel(ResearchModel).current).toBe(before);
    });

    it('clears scientific foreground state when switching lines', () => {
      wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'first', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      wire.dispatch(researchStartAction({ actionId: 'a1', startedAt: 300 }));
      wire.dispatch(researchObserveRun({
        actionId: 'a1', campaign: 'c', jobId: 'j', stage: 'running', schedulerState: 'running',
        lastObservedAt: 400, artifactRefs: [],
      }));
      wire.dispatch(researchSwitchLine({ lineSlug: 'main', expectedRevision: 0 }));

      expect(wire.getModel(ResearchModel).current).toMatchObject({
        phase: 'idle', currentAction: null, currentRun: null, latestProgress: null,
        recentStateChange: null, humanGate: null, focus: null,
      });
    });

    it('resolve to action_executing is a replay no-op without an in-progress action', () => {
      wire.dispatch(researchRequestHumanDecision({
        gateId: 'g1', kind: 'decision', prompt: 'choose a direction', createdAt: 100,
      }));
      const before = wire.getModel(ResearchModel).current;
      wire.dispatch(researchResolveHumanDecision({
        gateId: 'g1', resolution: 'run it', nextPhase: 'action_executing', changedAt: 200,
      }));

      expect(wire.getModel(ResearchModel).current).toBe(before);
    });

    it('observeRun is a replay no-op outside an executing in-progress action', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'first', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      const before = wire.getModel(ResearchModel).current;
      wire.dispatch(researchObserveRun({
        actionId: 'a1', campaign: 'c', jobId: 'j', stage: 'running', schedulerState: 'running',
        lastObservedAt: 300, artifactRefs: [],
      }));

      expect(wire.getModel(ResearchModel).current).toBe(before);
    });

    it('planAction remains allowed once no foreground action is live', () => {
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 100 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a1', kind: 'experiment', purpose: 'first', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 200,
      }));
      wire.dispatch(researchStartAction({ actionId: 'a1', startedAt: 300 }));
      wire.dispatch(researchCompleteAction({ actionId: 'a1', status: 'abandoned', completedAt: 400 }));
      // After abandon the action is no longer foreground; reach a plan-able phase
      // via legal transitions (evaluating → idle → gap_analysis) and re-plan.
      wire.dispatch(researchSetPhase({ phase: 'idle', changedAt: 500 }));
      wire.dispatch(researchSetPhase({ phase: 'gap_analysis', changedAt: 600 }));
      wire.dispatch(researchPlanAction({
        actionId: 'a2', kind: 'derivation', purpose: 'second', expectedEvidence: [],
        stopCondition: 'done', allowedToolKinds: [], requiresHumanApproval: false, createdAt: 700,
      }));

      expect(wire.getModel(ResearchModel).current.currentAction?.actionId).toBe('a2');
    });
  });

  describe('ResearchCursorModel (non-checkpointed)', () => {
    it('starts with null cursor and empty history', () => {
      const state = wire.getModel(ResearchCursorModel);
      expect(state.cursor).toBeNull();
      expect(state.history).toEqual([]);
      expect(state.revision).toBe(0);
    });

    it('commitCheckpoint advances the cursor and appends to history (idempotent)', () => {
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
      expect(cursor.history).toEqual([{ checkpointId: 'cp1', entryId: 'e1', committedAt: 2000 }]);
      expect(cursor.revision).toBe(1);
    });

    it('commitCheckpoint rejects a same-checkpoint different-entry commit', () => {
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 }));
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp1', entryId: 'e2', committedAt: 2000 }));

      const cursor = wire.getModel(ResearchCursorModel);
      // The conflicting commit is a no-op: the first commit is preserved.
      expect(cursor.cursor).toEqual({ checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 });
      expect(cursor.history).toEqual([{ checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 }]);
      expect(cursor.revision).toBe(1);
    });

    it('commitCheckpoint is idempotent for an older commit even after a newer one', () => {
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 }));
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp2', entryId: 'e2', committedAt: 2000 }));
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp1', entryId: 'e1', committedAt: 3000 }));

      const cursor = wire.getModel(ResearchCursorModel);
      expect(cursor.cursor).toEqual({ checkpointId: 'cp2', entryId: 'e2', committedAt: 2000 });
      expect(cursor.history).toEqual([
        { checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 },
        { checkpointId: 'cp2', entryId: 'e2', committedAt: 2000 },
      ]);
      expect(cursor.revision).toBe(2);
    });

    it('committed cursor and its AITP receipt are NOT reverted by conversation undo', () => {
      wire.dispatch(researchCommitCheckpoint({
        checkpointId: 'cp1',
        entryId: 'e1',
        receipt: {
          prepare: {
            status: 'prepared',
            id: 'e1',
            path: '.aitp/local/drafts/e1.md',
            idempotencyKey: 'key1',
          },
          save: {
            status: 'saved',
            draftPath: '.aitp/local/drafts/e1.md',
            path: '.aitp/topic/entries/entry-e1.md',
          },
          preSaveCheck: {
            status: 'clean', errors: 0, warnings: 0,
            findingFingerprints: [], errorFindingFingerprints: [], checkedAt: 1900,
          },
          postSaveCheck: {
            status: 'clean', errors: 0, warnings: 0,
            findingFingerprints: [], errorFindingFingerprints: [], checkedAt: 2000,
          },
        },
        committedAt: 2000,
      }));
      wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
      wire.dispatch(contextUndo({ count: 1 }));
      expect(wire.getModel(ResearchCursorModel).cursor).toMatchObject({
        checkpointId: 'cp1',
        entryId: 'e1',
        receipt: {
          prepare: { id: 'e1' },
          save: { status: 'saved' },
          postSaveCheck: { status: 'clean' },
        },
      });
      // The ordered commit history is equally durable across conversation undo.
      expect(wire.getModel(ResearchCursorModel).history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ checkpointId: 'cp1', entryId: 'e1' }),
        ]),
      );
    });

    it('cold restore rebuilds the latest cursor and the full commit history', async () => {
      wire.dispatch(researchCommitCheckpoint({
        checkpointId: 'cp1', entryId: 'e1', receipt: {
          prepare: { status: 'prepared', id: 'e1', path: '.aitp/local/drafts/e1.md', idempotencyKey: 'key1' },
          save: { status: 'saved', draftPath: '.aitp/local/drafts/e1.md', path: '.aitp/topic/entries/entry-e1.md' },
        }, committedAt: 1000,
      }));
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp2', entryId: 'e2', committedAt: 2000 }));

      await wire.restore();

      const cursor = wire.getModel(ResearchCursorModel);
      expect(cursor.cursor).toMatchObject({ checkpointId: 'cp2', entryId: 'e2' });
      expect(cursor.history).toMatchObject([
        { checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 },
        { checkpointId: 'cp2', entryId: 'e2', committedAt: 2000 },
      ]);
      expect(cursor.revision).toBe(2);
    });

    it('external-fact facade commits and reads idempotently without touching ResearchModel', () => {
      const facts = createExternalFactFacade(wire);
      const receipt = {
        prepare: {
          status: 'prepared' as const,
          id: 'e1',
          path: '.aitp/local/drafts/e1.md',
          idempotencyKey: 'key1',
        },
        save: {
          status: 'saved' as const,
          draftPath: '.aitp/local/drafts/e1.md',
          path: '.aitp/topic/entries/entry-e1.md',
        },
      };
      facts.commitExternalFact({ checkpointId: 'cp1', entryId: 'e1', committedAt: 2000, receipt });
      // Repeated commit with the same checkpoint + entry is idempotent.
      facts.commitExternalFact({ checkpointId: 'cp1', entryId: 'e1', committedAt: 3000, receipt });
      // A same-checkpoint different-entry commit is a no-op.
      facts.commitExternalFact({ checkpointId: 'cp1', entryId: 'e2', committedAt: 4000 });

      expect(facts.getCommittedCursor()).toEqual({
        checkpointId: 'cp1', entryId: 'e1', committedAt: 2000, receipt,
      });
      expect(facts.getCommitHistory()).toEqual([
        { checkpointId: 'cp1', entryId: 'e1', committedAt: 2000, receipt },
      ]);
      expect(facts.getRevision()).toBe(1);
      // The checkpointed working model is untouched by the external-fact facade.
      expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();
    });

    it('external-fact facade reads are pure: repeated reads never dispatch or mutate', () => {
      const facts = createExternalFactFacade(wire);
      wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp1', entryId: 'e1', committedAt: 2000 }));
      const revisionBefore = facts.getRevision();
      const first = facts.getCommittedCursor();
      const historyFirst = facts.getCommitHistory();
      // Reads must be idempotent projections — no side effects, no dispatch.
      expect(facts.getCommittedCursor()).toEqual(first);
      expect(facts.getCommitHistory()).toEqual(historyFirst);
      expect(facts.getRevision()).toBe(revisionBefore);
      expect(wire.getModel(ResearchCursorModel).revision).toBe(revisionBefore);
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

    it('undo removes a later Line-to-workstream confirmation without changing the earlier Line or Topic', () => {
      wire.dispatch(researchCreateLine({ slug: 'local-line', title: 'Local line', createdAt: 1 }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 2,
      }));
      wire.dispatch(contextAppendMessage({
        message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
      }));
      wire.dispatch(researchConfirmWorkstreamBinding({
        confirmationId: 'confirmation-1',
        lineSlug: 'local-line',
        workstream: 'aitp-workstream',
        topicId: 'topic-a',
        observedRevision: 1,
        confirmedBy: 'user',
        confirmedAt: 3,
        expectedRevision: 2,
      }));
      expect(wire.getModel(ResearchModel).current.lineWorkstreamBindings?.['local-line']).toBeDefined();
      const abandonedRevision = wire.getModel(ResearchModel).current.revision;

      wire.dispatch(contextUndo({ count: 1 }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.lineWorkstreamBindings).toEqual({});
      expect(state.lines['local-line']).toBeDefined();
      expect(state.program).toMatchObject({ topicId: 'topic-a', observedRevision: 1 });
      expect(state.revision).toBeLessThan(abandonedRevision);
    });

    it('keeps the published Research revision clock monotonic across undo and cold replay', async () => {
      wire.dispatch(researchAdvanceRevision({ nextRevision: 1, notifyGoal: false }));
      wire.dispatch(contextAppendMessage({
        message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
      }));
      wire.dispatch(researchAdvanceRevision({ nextRevision: 2, notifyGoal: false }));
      expect(wire.getModel(ResearchRevisionModel).revision).toBe(2);

      wire.dispatch(contextUndo({ count: 1 }));
      expect(wire.getModel(ResearchRevisionModel).revision).toBe(2);

      await wire.restore();
      expect(wire.getModel(ResearchRevisionModel).revision).toBe(2);
    });

    it('floors the first post-upgrade published revision above legacy working state', () => {
      wire.dispatch(researchCreateLine({ slug: 'legacy', title: 'Legacy', createdAt: 1 }));
      expect(wire.getModel(ResearchModel).current.revision).toBe(1);
      expect(wire.getModel(ResearchRevisionModel).revision).toBe(0);

      wire.dispatch(researchAdvanceRevision({ nextRevision: 2, notifyGoal: false }));
      expect(wire.getModel(ResearchRevisionModel).revision).toBe(2);
    });

    it('cold restore preserves the exact confirmed Line-to-workstream binding', async () => {
      wire.dispatch(researchCreateLine({ slug: 'local-line', title: 'Local line', createdAt: 1 }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 2,
      }));
      const binding = {
        confirmationId: 'confirmation-1',
        lineSlug: 'local-line',
        workstream: 'aitp-workstream',
        topicId: 'topic-a',
        observedRevision: 1,
        confirmedBy: 'main_agent' as const,
        confirmedAt: 3,
      };
      wire.dispatch(researchConfirmWorkstreamBinding({ ...binding, expectedRevision: 2 }));

      await wire.restore();

      expect(wire.getModel(ResearchModel).current.lineWorkstreamBindings).toEqual({
        'local-line': binding,
      });
    });
  });

  describe('ResearchModel program and period layers', () => {
    it('starts with no program, no period, and an empty period history', () => {
      const state = wire.getModel(ResearchModel).current;
      expect(state.program).toBeNull();
      expect(state.period).toBeNull();
      expect(state.periodHistory).toEqual([]);
    });

    it('sets observedRevision to 1 and increments it monotonically when an observation changes', () => {
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 1000,
      }));
      let state = wire.getModel(ResearchModel).current;
      expect(state.program).toEqual({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 1000, observedRevision: 1,
      });
      expect(state.revision).toBe(1);

      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 1000,
      }));
      expect(wire.getModel(ResearchModel).current.revision).toBe(1);

      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X rigorously', goalSource: 'TOPIC.md', establishedAt: 1000,
      }));
      state = wire.getModel(ResearchModel).current;
      expect(state.program?.observedRevision).toBe(2);

      wire.dispatch(researchSetProgram({
        topicId: 'topic-b', title: 'Topic B', goalText: 'Prove Y', goalSource: 'TOPIC.md', establishedAt: 2000,
      }));
      state = wire.getModel(ResearchModel).current;
      expect(state.program).toEqual({
        topicId: 'topic-b', title: 'Topic B', goalText: 'Prove Y', goalSource: 'TOPIC.md', establishedAt: 2000, observedRevision: 3,
      });
      expect(state.revision).toBe(3);
    });

    it('keeps explicit Goal-to-Program confirmation checkpointed and clearable', () => {
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 1000,
      }));
      wire.dispatch(researchConfirmGoalAlignment({
        relation: 'goal_parent_of_program',
        expectedRevision: 1,
        goalId: 'goal-1',
        topicId: 'topic-a',
        observedRevision: 1,
        confirmedAt: 1000,
      }));
      expect(wire.getModel(ResearchModel).current.goalProgramBinding).toEqual({
        relation: 'goal_parent_of_program', goalId: 'goal-1', topicId: 'topic-a', observedRevision: 1, confirmedAt: 1000,
      });

      const revision = wire.getModel(ResearchModel).current.revision;
      wire.dispatch(researchClearGoalAlignment({
        expectedRevision: revision, goalId: 'goal-1', topicId: 'topic-a', observedRevision: 1,
      }));
      expect(wire.getModel(ResearchModel).current.goalProgramBinding).toBeNull();
    });

    it('keeps legacy replay without a binding and ignores stale alignment ops', () => {
      expect(wire.getModel(ResearchModel).current.goalProgramBinding).toBeNull();
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 1000,
      }));
      wire.dispatch(researchConfirmGoalAlignment({
        relation: 'same_program_goal', expectedRevision: 0, goalId: 'goal-1', topicId: 'topic-a', observedRevision: 1, confirmedAt: 1000,
      }));
      expect(wire.getModel(ResearchModel).current.goalProgramBinding).toBeNull();
    });

    it('start_period opens a period, is a no-op for the same line, and archives on a line switch', () => {
      wire.dispatch(researchStartPeriod({ id: 'p1', lineSlug: 'main', startedAt: 1000 }));
      let state = wire.getModel(ResearchModel).current;
      expect(state.period).toEqual({
        id: 'p1', lineSlug: 'main', startedAt: 1000, loopCount: 0,
      });
      expect(state.periodHistory).toEqual([]);
      expect(state.revision).toBe(1);

      wire.dispatch(researchStartPeriod({ id: 'p1-dup', lineSlug: 'main', startedAt: 1500 }));
      state = wire.getModel(ResearchModel).current;
      expect(state.period!.id).toBe('p1');
      expect(state.revision).toBe(1);

      wire.dispatch(researchStartPeriod({ id: 'p2', lineSlug: 'alt', startedAt: 2000 }));
      state = wire.getModel(ResearchModel).current;
      expect(state.period).toEqual({
        id: 'p2', lineSlug: 'alt', startedAt: 2000, loopCount: 0,
      });
      expect(state.periodHistory).toEqual([{
        id: 'p1', lineSlug: 'main', startedAt: 1000, endedAt: 2000, loopCount: 0,
      }]);
    });

    it('update_period bumps the loop count and records the current question and summary', () => {
      wire.dispatch(researchStartPeriod({ id: 'p1', lineSlug: 'main', startedAt: 1000 }));
      wire.dispatch(researchUpdatePeriod({ id: 'p1', loopCount: 1, currentQuestionId: 'q1', summary: 'headline' }));
      let state = wire.getModel(ResearchModel).current;
      expect(state.period).toMatchObject({
        id: 'p1', loopCount: 1, currentQuestionId: 'q1', summary: 'headline',
      });

      // Partial updates keep the other fields.
      wire.dispatch(researchUpdatePeriod({ id: 'p1', loopCount: 2 }));
      state = wire.getModel(ResearchModel).current;
      expect(state.period).toMatchObject({
        id: 'p1', loopCount: 2, currentQuestionId: 'q1', summary: 'headline',
      });

      // Wrong id is a no-op.
      wire.dispatch(researchUpdatePeriod({ id: 'other', loopCount: 9 }));
      expect(wire.getModel(ResearchModel).current.period!.loopCount).toBe(2);
    });

    it('update_period can explicitly clear optional fields', () => {
      wire.dispatch(researchStartPeriod({ id: 'p1', lineSlug: 'main', startedAt: 1000 }));
      wire.dispatch(researchUpdatePeriod({ id: 'p1', currentQuestionId: 'q1', summary: 'headline' }));
      wire.dispatch(researchUpdatePeriod({ id: 'p1', currentQuestionId: null, summary: null }));

      expect(wire.getModel(ResearchModel).current.period).toMatchObject({
        id: 'p1', currentQuestionId: undefined, summary: undefined,
      });
    });

    it('end_period archives the open period and clears the current one', () => {
      wire.dispatch(researchStartPeriod({ id: 'p1', lineSlug: 'main', startedAt: 1000 }));
      wire.dispatch(researchUpdatePeriod({ id: 'p1', loopCount: 3 }));
      wire.dispatch(researchEndPeriod({ endedAt: 4000 }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.period).toBeNull();
      expect(state.periodHistory).toEqual([{
        id: 'p1', lineSlug: 'main', startedAt: 1000, endedAt: 4000, loopCount: 3,
      }]);

      // Ending again is a no-op.
      wire.dispatch(researchEndPeriod({ endedAt: 5000 }));
      expect(wire.getModel(ResearchModel).current.periodHistory).toHaveLength(1);
    });

    it('undo restores the local program and period working state', () => {
      wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
      wire.dispatch(researchSetProgram({
        topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 1000,
      }));
      wire.dispatch(researchStartPeriod({ id: 'p1', lineSlug: 'main', startedAt: 1000 }));
      wire.dispatch(researchUpdatePeriod({ id: 'p1', loopCount: 1 }));
      expect(wire.getModel(ResearchModel).current.program).not.toBeNull();
      expect(wire.getModel(ResearchModel).current.period?.loopCount).toBe(1);

      wire.dispatch(contextUndo({ count: 1 }));
      const state = wire.getModel(ResearchModel).current;
      expect(state.program).toBeNull();
      expect(state.period).toBeNull();
      expect(state.periodHistory).toEqual([]);
    });

    it('cold restore keeps the latest monotonic Research Plan v2 revision', async () => {
      const base = {
        schema: 'hakimi/research-plan-0.2' as const,
        planId: 'research-plan-1',
        revision: 1,
        goalId: 'goal-1',
        programId: 'topic-1',
        programObservedRevision: 1,
        goalRelation: 'goal_milestone_in_program' as const,
        objective: 'Validate one milestone.',
        completionCriterion: 'The checks pass.',
        milestones: [{
          milestoneId: 'm1',
          title: 'Run and validate',
          objective: 'Run one calculation.',
          completionCriterion: 'Validation passes.',
          evidenceRequirements: ['Output and log'],
        }],
        evidenceRequirements: ['Reproducible result'],
        decisionPoints: [],
        assumptions: [],
        currentMilestoneId: 'm1',
        stopConditions: ['Stop on validation failure.'],
        replanConditions: ['Replan on Program drift.'],
        status: 'draft' as const,
        createdAt: 1,
        updatedAt: 1,
      };
      wire.dispatch(researchPutPlanV2(base));
      wire.dispatch(researchPutPlanV2({
        ...base,
        revision: 2,
        status: 'active',
        updatedAt: 2,
      }));
      wire.dispatch(researchPutPlanV2(base));
      expect(wire.getModel(ResearchModel).current.researchPlanV2).toMatchObject({
        planId: 'research-plan-1',
        revision: 2,
        status: 'active',
      });

      await wire.restore();
      expect(wire.getModel(ResearchModel).current.researchPlanV2).toMatchObject({
        planId: 'research-plan-1',
        revision: 2,
        status: 'active',
      });
    });

    it('defaults planning to collaborative, follows undo, and survives compaction and cold restore', async () => {
      expect(wire.getModel(ResearchModel).current.planningPolicy).toBe('collaborative');
      wire.dispatch(contextAppendMessage({
        message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
      }));
      wire.dispatch(researchSetPlanningPolicy('dreaming'));
      expect(wire.getModel(ResearchModel).current.planningPolicy).toBe('dreaming');

      wire.dispatch(contextUndo({ count: 1 }));
      expect(wire.getModel(ResearchModel).current.planningPolicy).toBe('collaborative');

      wire.dispatch(researchSetPlanningPolicy('dreaming'));
      wire.dispatch(contextApplyCompaction({ summary: 'research planning context', compactedCount: 1 }));
      expect(wire.getModel(ResearchModel).current.planningPolicy).toBe('dreaming');

      await wire.restore();
      expect(wire.getModel(ResearchModel).current.planningPolicy).toBe('dreaming');
    });
  });
});
