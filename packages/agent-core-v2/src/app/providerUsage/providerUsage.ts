/**
 * `providerUsage` domain — the App-scope usage-query contract.
 *
 * Owning contract of `IProviderUsageService`: querying usage across the
 * configured supported usage providers — managed Kimi OAuth
 * (`IOAuthService.getManagedUsage`), the official `api.kimi.com/coding`
 * API-key provider (`fetchManagedUsage`, pinned to the official
 * `/v1/usages` endpoint after the strict base check), the managed OpenAI Codex
 * provider
 * (`fetchCodexUsage` against the fixed official `wham/usage` URL through the
 * existing OAuth token provider / request auth), and the exact-base OpenCode
 * Go provider (`fetchOpenCodeGoUsage` against the fixed
 * `opencode.ai/zen/go/v1/usage` endpoint). `extraUsage` (the Kimi booster
 * wallet) is only ever present for the Kimi routes; Codex and OpenCode Go
 * report rate-limit / subscription-quota windows without wallet fields.
 * Providers with no usage endpoint answer `unsupported`; failures answer
 * `error`. Error messages are scrubbed at the service boundary: the API-key
 * routes redact their credential from untrusted remote text, and the managed
 * OAuth routes never forward remote text at all (their error is normalized to
 * a fixed, actionable message, optionally carrying the safe HTTP `status`),
 * because this layer does not hold the OAuth refresh credential needed to
 * redact it. App-scoped — shared across the application.
 */

import type { BoosterWalletInfo, UsageRow } from '@moonshot-ai/kimi-code-oauth';
import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';

export type ProviderUsageResult =
  | {
      readonly kind: 'ok';
      readonly provider: string;
      readonly summary: UsageRow | null;
      readonly limits: readonly UsageRow[];
      readonly extraUsage: BoosterWalletInfo | null;
    }
  | {
      readonly kind: 'error' | 'unsupported';
      readonly provider: string;
      /** Safe, normalized text — never raw untrusted remote text. */
      readonly message: string;
      /** Safe HTTP status of a failed query, when known. */
      readonly status?: number;
    };

export interface IProviderUsageService {
  readonly _serviceBrand: undefined;

  queryUsage(
    providerId?: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<readonly ProviderUsageResult[]>;
}

export const IProviderUsageService: ServiceIdentifier<IProviderUsageService> =
  createDecorator<IProviderUsageService>('providerUsageService');