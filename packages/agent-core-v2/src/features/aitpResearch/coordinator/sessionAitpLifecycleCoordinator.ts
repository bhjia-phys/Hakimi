/**
 * `aitpResearch` domain — Session-scope current-state maintenance contract.
 *
 * Coordinates the read-only AITP `enter` → `check` cycle used after Research
 * Mode entry and after active undo/cold restore. It never initializes,
 * adopts, backfills, or writes an Entry/Note. Bound at Session scope so Agent
 * lifecycle services consume one coordinator for the session.
 */

import { createDecorator } from '#/_base/di/instantiation';
import type { Event } from '#/_base/event';

import type { AitpMaintenanceReceipt } from '../types';

export interface AitpMaintenanceRefreshOptions {
  readonly workstream?: string;
  readonly force?: boolean;
}

export interface ISessionAitpLifecycleCoordinator {
  readonly _serviceBrand: undefined;

  readonly onDidUpdate: Event<AitpMaintenanceReceipt>;

  refresh(options?: AitpMaintenanceRefreshOptions): Promise<AitpMaintenanceReceipt>;
  snapshot(): AitpMaintenanceReceipt | undefined;
  reset(): void;
}

export const ISessionAitpLifecycleCoordinator =
  createDecorator<ISessionAitpLifecycleCoordinator>('sessionAitpLifecycleCoordinator');
