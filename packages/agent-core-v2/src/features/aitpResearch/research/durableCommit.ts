/**
 * `aitpResearch` domain — durable checkpoint verification contract.
 *
 * Owns the external AITP `show` → `check` barrier input and output while the
 * Research service remains the owner of checkpoint state and cursor commits.
 * Bound at Agent scope.
 */

import { createDecorator } from '#/_base/di/instantiation';

import type {
  AitpShowResult,
  ResearchCheckpointCheckReceipt,
} from '../types';

export interface DurableCommitCheckInput {
  readonly workstream: string;
  readonly preSaveCheck: ResearchCheckpointCheckReceipt;
}

export interface DurableCommitCheckResult {
  readonly postSaveCheck: ResearchCheckpointCheckReceipt;
}

export interface IDurableCommitService {
  readonly _serviceBrand: undefined;

  verifyEntry(entryId: string, expectedWorkstream: string, expectedTopicId: string): Promise<AitpShowResult>;
  checkAfterSave(input: DurableCommitCheckInput): Promise<DurableCommitCheckResult>;
}

export const IDurableCommitService = createDecorator<IDurableCommitService>(
  'durableCommitService',
);
