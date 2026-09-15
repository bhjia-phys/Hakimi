/**
 * `providerUsageLedger` domain — local metered-usage accounting contract.
 *
 * `IProviderUsageLedgerService` is the narrow recording + query surface the
 * Agent LLM requester injects directly. It only receives request facts — the
 * provider identity, wire/alias model names, the resolved base URL, and the
 * request start epoch — and an attempt outcome; it owns neither the request
 * lifecycle nor any rate/file layout. Recording is best-effort and
 * fire-and-forget: a persistence failure must never block a generation or
 * turn a successful request into a retry. App-scoped — shared across the
 * process so every workspace/agent aggregates into one ledger.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type { TokenUsage } from '#/kosong/contract/usage';

import type { LocalMeteredUsage } from '#/app/providerUsage/meteredUsage';

export interface MeteredAttemptStart {
  readonly providerName: string;
  readonly providerType: string | undefined;
  readonly modelName: string;
  readonly modelAlias: string;
  readonly baseUrl: string | undefined;
  readonly startedAtEpochMs: number;
}

export type MeteredAttemptOutcome = 'success' | 'error' | 'cancelled';

export interface MeteredAttemptFinish {
  readonly usage: TokenUsage | null;
  readonly outcome: MeteredAttemptOutcome;
}

export interface IProviderUsageLedgerService {
  readonly _serviceBrand: undefined;

  startAttempt(start: MeteredAttemptStart): string | undefined;

  finishAttempt(attemptId: string, finish: MeteredAttemptFinish): void;

  getMeteredUsage(
    providerName: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<LocalMeteredUsage>;
}

export const IProviderUsageLedgerService: ServiceIdentifier<IProviderUsageLedgerService> =
  createDecorator<IProviderUsageLedgerService>('providerUsageLedgerService');
