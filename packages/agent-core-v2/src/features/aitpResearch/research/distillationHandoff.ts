/**
 * `aitpResearch` domain — bounded post-commit distillation handoff contract.
 *
 * Exposes the Agent-scope best-effort bridge from one newly committed AITP
 * Entry to the external `distilling-methods` Skill. It owns no ledger or
 * method-card semantics and persists no coordinator state. Bound at Agent
 * scope.
 */

import { createDecorator } from '#/_base/di/instantiation';
import type { ToolDelivery } from '#/tool/toolContract';

export interface DistillationHandoffInput {
  readonly checkpointId: string;
  readonly entryId: string;
}

export type DistillationHandoffResult =
  | {
      readonly status: 'scheduled';
      readonly delivery: ToolDelivery;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: string;
    };

export interface IAitpDistillationHandoffService {
  readonly _serviceBrand: undefined;

  prepare(input: DistillationHandoffInput): Promise<DistillationHandoffResult>;
}

export const IAitpDistillationHandoffService =
  createDecorator<IAitpDistillationHandoffService>('aitpDistillationHandoffService');
