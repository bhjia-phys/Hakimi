/**
 * `aitpResearch` domain — `ISessionAitpAdapter` contract.
 *
 * The Session-scope adapter that bridges Hakimi to the external AITP CLI
 * (plugin 0.8/0.9, adapter-contract-0.1/0.2). Strictly consumes the AITP CLI surface
 * (`enter`, `list`, `show`, `check`, `record/note prepare/save`); never calls
 * `init`, `inventory`, or `backfill --apply`; never writes canonical AITP
 * files directly. Bound at Session scope.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';

import type {
  AitpAdapterHealth,
  AitpAuthority,
  AitpCheckReport,
  AitpContractIdentity,
  AitpEntryKind,
  AitpEnterResult,
  AitpListResult,
  AitpNoteMode,
  AitpNotePrepareResult,
  AitpNoteSaveResult,
  AitpRecordPrepareResult,
  AitpRecordSaveResult,
  AitpShowResult,
} from '../types';

interface AitpAdapterOperationOptions {
  readonly signal?: AbortSignal;
}

export interface AitpAdapterEnterOptions extends AitpAdapterOperationOptions {
  readonly workstream?: string;
  readonly recent?: number;
}

export interface AitpAdapterListOptions extends AitpAdapterOperationOptions {
  readonly workstream?: string;
  readonly kind?: AitpEntryKind;
  readonly since?: string;
}

export interface AitpAdapterShowOptions extends AitpAdapterOperationOptions {
  readonly id: string;
}

export interface AitpAdapterCheckOptions extends AitpAdapterOperationOptions {
  readonly workstream?: string;
}

export interface AitpAdapterRecordPrepareOptions extends AitpAdapterOperationOptions {
  readonly kind: AitpEntryKind;
  readonly authority?: AitpAuthority;
  readonly createdBy?: string;
  readonly idempotencyKey?: string;
  readonly workstreams?: readonly string[];
}

export interface AitpAdapterRecordSaveOptions extends AitpAdapterOperationOptions {
  readonly draftPath: string;
  readonly expectedTopic?: string;
  readonly exactWorkstream?: string;
}

export interface AitpAdapterNotePrepareOptions extends AitpAdapterOperationOptions {
  readonly mode: AitpNoteMode;
  readonly title: string;
  readonly createdBy: string;
  readonly workstreams?: readonly string[];
}

export interface AitpAdapterNoteSaveOptions extends AitpAdapterOperationOptions {
  readonly draftPath: string;
}

export interface ISessionAitpAdapter {
  readonly _serviceBrand: undefined;

  readonly health: AitpAdapterHealth;

  probe(): Promise<AitpAdapterHealth>;
  enter(options?: AitpAdapterEnterOptions): Promise<AitpEnterResult>;
  list(options?: AitpAdapterListOptions): Promise<AitpListResult>;
  show(options: AitpAdapterShowOptions): Promise<AitpShowResult>;
  check(options?: AitpAdapterCheckOptions): Promise<AitpCheckReport>;

  recordPrepare(options: AitpAdapterRecordPrepareOptions): Promise<AitpRecordPrepareResult>;
  recordSave(options: AitpAdapterRecordSaveOptions): Promise<AitpRecordSaveResult>;
  notePrepare(options: AitpAdapterNotePrepareOptions): Promise<AitpNotePrepareResult>;
  noteSave(options: AitpAdapterNoteSaveOptions): Promise<AitpNoteSaveResult>;

  resolveContractIdentity(): AitpContractIdentity | null;
  isReady(): boolean;
  isDegraded(): boolean;
  reset(): void;
}

export const ISessionAitpAdapter: ServiceIdentifier<ISessionAitpAdapter> =
  createDecorator<ISessionAitpAdapter>('sessionAitpAdapter');
