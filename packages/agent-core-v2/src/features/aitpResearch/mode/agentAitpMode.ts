/**
 * `aitpResearch` domain — `IAgentAitpModeService` contract.
 *
 * The Agent-scope (main-only) AITP mode state machine. Manages the mode
 * lifecycle (`inactive` → `probing` → `ready` / `degraded` → `inactive`),
 * explicit user entry vs model entry, adapter activation, and context
 * injection disclosure. Research Mode is a long-lived scientific context that
 * may be active alongside an active Plan overlay. The mode state is
 * checkpointed through wire so it follows conversation undo. Bound at Agent
 * scope.
 */

import { createDecorator } from '#/_base/di/instantiation';
import type { Event } from '#/_base/event';

import type { AitpAdapterHealth, AitpMaintenanceDegradedReason, AitpModePhase, ResearchLoopStatus } from '../types';

export interface AitpModeEntryOptions {
  readonly actor: 'user' | 'model';
  readonly lineSlug?: string;
}

export interface IAgentAitpModeService {
  readonly _serviceBrand: undefined;
  readonly onDidChange: Event<void>;

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
  resetAdapter(): void;
}

export const IAgentAitpModeService =
  createDecorator<IAgentAitpModeService>('agentAitpModeService');
