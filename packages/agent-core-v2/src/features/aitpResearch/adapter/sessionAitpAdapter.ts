/**
 * `aitpResearch` domain — `ISessionAitpAdapter` contract.
 *
 * The Session-scope adapter that bridges Hakimi to the external AITP CLI
 * (plugin 0.8, adapter-contract-0.1). Strictly consumes the AITP CLI surface
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

export interface AitpAdapterEnterOptions {
  readonly workstream?: string;
  readonly recent?: number;
}

export interface AitpAdapterListOptions {
  readonly workstream?: string;
  readonly kind?: AitpEntryKind;
  readonly since?: string;
}

export interface AitpAdapterShowOptions {
  readonly id: string;
}

export interface AitpAdapterCheckOptions {
  readonly workstream?: string;
}

export interface AitpAdapterRecordPrepareOptions {
  readonly kind: AitpEntryKind;
  readonly authority?: AitpAuthority;
  readonly createdBy?: string;
  readonly idempotencyKey?: string;
  readonly workstreams?: readonly string[];
}

export interface AitpAdapterRecordSaveOptions {
  readonly draftPath: string;
}

export interface AitpAdapterNotePrepareOptions {
  readonly mode: AitpNoteMode;
  readonly title: string;
  readonly createdBy: string;
  readonly workstreams?: readonly string[];
}

export interface AitpAdapterNoteSaveOptions {
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
