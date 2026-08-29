/**
 * `aitpResearch` domain — `IAitpExternalFactService` implementation.
 *
 * Wraps the non-checkpointed `ResearchCursorModel` (committed cursor, ordered
 * commit history, global revision) behind the external-fact facade. Reads are
 * pure projections of the wire model and never dispatch or publish; writes
 * dispatch the idempotent `research.commit_checkpoint` op so repeated or
 * conflicting commits stay replayable and the checkpointed `ResearchModel` is
 * never touched. Because the backing model is non-checkpointed, conversation
 * undo cannot retract a committed AITP fact — this service preserves that
 * boundary. `createExternalFactFacade` exposes the same contract as a plain
 * object for manual construction (tests) without `new`ing a dependency-bearing
 * `Service`; the Agent-scoped `AitpExternalFactService` delegates to it.
 * Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import { IWireService } from '#/wire/wire';
import {
  ResearchCursorModel,
  researchCommitCheckpoint,
} from '#/features/aitpResearch/aitpResearchOps';
import type {
  ResearchCheckpointReceipt,
  ResearchCommittedCursor,
} from '#/features/aitpResearch/types';

import {
  IAitpExternalFactService,
  type CommitExternalFactInput,
} from './externalFact';

export function createExternalFactFacade(wire: IWireService): IAitpExternalFactService {
  return {
    _serviceBrand: undefined,
    getCommittedCursor(): ResearchCommittedCursor | null {
      return wire.getModel(ResearchCursorModel).cursor;
    },
    getCommitHistory(): readonly ResearchCommittedCursor[] {
      return wire.getModel(ResearchCursorModel).history;
    },
    getRevision(): number {
      return wire.getModel(ResearchCursorModel).revision;
    },
    commitExternalFact(input: CommitExternalFactInput): void {
      wire.dispatch(
        researchCommitCheckpoint({
          checkpointId: input.checkpointId,
          entryId: input.entryId,
          receipt: input.receipt === undefined ? undefined : toWireCheckpointReceipt(input.receipt),
          committedAt: input.committedAt,
        }),
      );
    },
  };
}

export function toWireCheckpointReceipt(receipt: ResearchCheckpointReceipt) {
  return {
    prepare: receipt.prepare === undefined
      ? undefined
      : {
          ...receipt.prepare,
          workstreams: receipt.prepare.workstreams === undefined
            ? undefined
            : [...receipt.prepare.workstreams],
        },
    save: receipt.save,
    preSaveCheck: receipt.preSaveCheck === undefined
      ? undefined
      : {
          ...receipt.preSaveCheck,
          findingFingerprints: [...receipt.preSaveCheck.findingFingerprints],
          errorFindingFingerprints: [...receipt.preSaveCheck.errorFindingFingerprints],
          newErrorFindingFingerprints: receipt.preSaveCheck.newErrorFindingFingerprints === undefined
            ? undefined
            : [...receipt.preSaveCheck.newErrorFindingFingerprints],
          preExistingErrorFindingFingerprints: receipt.preSaveCheck.preExistingErrorFindingFingerprints === undefined
            ? undefined
            : [...receipt.preSaveCheck.preExistingErrorFindingFingerprints],
        },
    postSaveCheck: receipt.postSaveCheck === undefined
      ? undefined
      : {
          ...receipt.postSaveCheck,
          findingFingerprints: [...receipt.postSaveCheck.findingFingerprints],
          errorFindingFingerprints: [...receipt.postSaveCheck.errorFindingFingerprints],
          newErrorFindingFingerprints: receipt.postSaveCheck.newErrorFindingFingerprints === undefined
            ? undefined
            : [...receipt.postSaveCheck.newErrorFindingFingerprints],
          preExistingErrorFindingFingerprints: receipt.postSaveCheck.preExistingErrorFindingFingerprints === undefined
            ? undefined
            : [...receipt.postSaveCheck.preExistingErrorFindingFingerprints],
        },
  };
}

export class AitpExternalFactService extends Service implements IAitpExternalFactService {
  declare readonly _serviceBrand: undefined;

  private readonly delegate: IAitpExternalFactService;

  constructor(
    @IWireService wire: IWireService,
  ) {
    super();
    this.delegate = createExternalFactFacade(wire);
  }

  getCommittedCursor(): ResearchCommittedCursor | null {
    return this.delegate.getCommittedCursor();
  }

  getCommitHistory(): readonly ResearchCommittedCursor[] {
    return this.delegate.getCommitHistory();
  }

  getRevision(): number {
    return this.delegate.getRevision();
  }

  commitExternalFact(input: CommitExternalFactInput): void {
    this.delegate.commitExternalFact(input);
  }
}
