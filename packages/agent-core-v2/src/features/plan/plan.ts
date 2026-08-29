import { createDecorator } from "#/_base/di/instantiation";

export type PlanData = null | {
  readonly id: string;
  readonly content: string;
  readonly path: string;
};

export type PlanFilePath = string | null;

export type PlanResolutionOutcome =
  | 'approved'
  | 'auto_approved'
  | 'revise'
  | 'rejected'
  | 'rejected_and_exited'
  | 'dismissed';

export interface PlanResolution {
  readonly planId: string;
  readonly planRevision: number;
  readonly outcome: PlanResolutionOutcome;
  readonly selectedLabel?: string;
}

export interface IAgentPlanService {
  readonly _serviceBrand: undefined;

  enter(id?: string, createFile?: boolean): Promise<void>;
  cancel(id?: string): void;
  clear(): Promise<void>;
  exit(id?: string): void;
  recordRevision(): Promise<void>;
  recordResolution?(outcome: PlanResolutionOutcome, selectedLabel?: string): void;
  getResolution?(): PlanResolution | null;
  status(): Promise<PlanData>;
}

export const IAgentPlanService =
  createDecorator<IAgentPlanService>('agentPlanService');
