/**
 * `aitpResearch` domain — durable checkpoint verification contract.
 *
 * Owns the external AITP `show` → `check` barrier input and output while the
 * Research service remains the owner of checkpoint state and cursor commits.
 * Bound at Agent scope.
 */

import { createDecorator } from '#/_base/di/instantiation';

import type {
  ResearchCheckpointCheckReceipt,
} from '../types';

export interface DurableCommitCheckInput {
  readonly workstreams?: readonly string[];
  readonly preSaveCheck: ResearchCheckpointCheckReceipt;
}

export interface DurableCommitCheckResult {
  readonly postSaveCheck: ResearchCheckpointCheckReceipt;
}

export interface IDurableCommitService {
  readonly _serviceBrand: undefined;

  verifyEntry(entryId: string): Promise<void>;
  checkAfterSave(input: DurableCommitCheckInput): Promise<DurableCommitCheckResult>;
}

export const IDurableCommitService = createDecorator<IDurableCommitService>(
  'durableCommitService',
);
