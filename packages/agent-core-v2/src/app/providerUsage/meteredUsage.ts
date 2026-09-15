/**
 * `providerUsage` domain — local metered usage reporting contract.
 *
 * Separates observed request tokens and estimated CNY costs from subscription
 * quota windows and the independently queried official account balance supplied
 * by the OAuth package's credential-safe adapter. Owned by the App-scope
 * providerUsage service. Calendar periods use Asia/Shanghai; incomplete records
 * never imply zero cost. Input tokens include cache reads; total tokens are
 * input plus output, without counting the cache-read subset again.
 */

import type { FetchDeepSeekBalanceResult } from '@moonshot-ai/kimi-code-oauth';

export interface MeteredUsagePeriod {
  readonly startAt: string;
  readonly endAt: string;
  readonly requestCount: number;
  readonly measuredRequestCount: number;
  readonly pendingRequestCount: number;
  readonly missingUsageRequestCount: number;
  readonly unpricedRequestCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly totalTokens: number;
  readonly estimatedCost: string | null;
  readonly isPartial: boolean;
}

export interface LocalMeteredUsage {
  readonly source: 'local';
  readonly costSource: 'estimated';
  readonly currency: 'CNY';
  readonly timezone: 'Asia/Shanghai';
  readonly trackingStartedAt: string | null;
  readonly degraded: boolean;
  readonly today: MeteredUsagePeriod;
  readonly month: MeteredUsagePeriod;
}

export interface MeteredProviderUsage extends LocalMeteredUsage {
  readonly balance: FetchDeepSeekBalanceResult;
}
