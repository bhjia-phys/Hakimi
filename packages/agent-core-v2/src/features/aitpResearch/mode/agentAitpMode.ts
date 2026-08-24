/**
 * `aitpResearch` domain — `IAgentAitpModeService` contract.
 *
 * The Agent-scope (main-only) AITP mode state machine. Manages the mode
 * lifecycle (`inactive` → `probing` → `ready` / `degraded` → `inactive`),
 * explicit user entry vs model entry, Plan mode conflict, adapter activation,
 * and context injection disclosure. The mode state is checkpointed through
 * wire so it follows conversation undo. Bound at Agent scope.
 */

import { createDecorator } from '#/_base/di/instantiation';

import type { AitpAdapterHealth, AitpModePhase, ResearchLoopStatus } from '../types';

export interface AitpModeEntryOptions {
  readonly actor: 'user' | 'model';
  readonly lineSlug?: string;
}

export interface IAgentAitpModeService {
  readonly _serviceBrand: undefined;

  readonly phase: AitpModePhase;
  readonly loopStatus: ResearchLoopStatus;
  readonly revision: number;
  readonly isActive: boolean;
  readonly health: AitpAdapterHealth | null;

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
