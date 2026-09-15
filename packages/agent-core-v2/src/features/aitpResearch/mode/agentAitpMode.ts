/**
 * `aitpResearch` domain — `IAgentAitpModeService` contract.
 *
 * Agent-scope, main-only toggle for local knowledge and official AITP Skills.
 * getSnapshot awaits catalog readiness and reports visibility, not CLI health.
 * onDidChange signals only active/inactive transitions. Only enabled is persisted;
 * general Goal, Plan, permissions, and conversation undo remain independent.
 * Legacy phase/adapter/loop members are retained as retired source contracts
 * for unmounted historical implementations; calling them throws. Entry with
 * a legacy lineSlug also throws instead of creating or binding a Line.
 */

import { createDecorator } from '#/_base/di/instantiation';
import type { Event } from '#/_base/event';

import type {
  AitpAdapterHealth,
  AitpMaintenanceDegradedReason,
  AitpModePhase,
  ResearchLineWorkstreamBinding,
  ResearchLoopStatus,
} from '../types';

export interface AitpModeEntryOptions {
  readonly actor: 'user' | 'model';
  readonly lineSlug?: string;
}

export interface ResearchModeSnapshot {
  readonly enabled: boolean;
  readonly skillsAvailable: boolean;
}

export interface IAgentAitpModeService {
  readonly _serviceBrand: undefined;
  readonly onDidChange: Event<void>;
  getSnapshot(): Promise<ResearchModeSnapshot>;

  readonly phase: AitpModePhase;
  readonly loopStatus: ResearchLoopStatus;
  readonly revision: number;
  readonly isActive: boolean;
  readonly health: AitpAdapterHealth | null;
  readonly maintenanceDegradedReason: AitpMaintenanceDegradedReason | undefined;

  enter(options: AitpModeEntryOptions): Promise<void>;
  exit(): Promise<void>;
  setPhase(phase: AitpModePhase): void;
  assertResearchMutationAllowed(options?: { readonly allowPaused?: boolean }): void;
  pauseLoop(expectedRevision: number): void;
  resumeLoop(expectedRevision: number): void;
  refreshHealth(): Promise<AitpAdapterHealth>;
  reconcileCurrentTopicBinding(
    expectedLineSlug?: string,
  ): Promise<ResearchLineWorkstreamBinding | undefined>;
  resetAdapter(): void;
}

export const IAgentAitpModeService =
  createDecorator<IAgentAitpModeService>('agentAitpModeService');
