/**
 * `/provider-usage` REST route.
 *
 *   GET /provider-usage?provider=<id>  query usage across the configured usage providers
 *
 * Thin edge over the App-scoped `IProviderUsageService`: the service owns every
 * usage query — provider discovery, endpoint resolution, credential handling,
 * and error scrubbing at the service boundary — and this route only projects
 * its domain result into the snake_case wire shape (same mapping as
 * `/oauth/usage`'s `toWireUsage`). No caching, no polling, no credential
 * re-processing here: a request is exactly one `queryUsage` call.
 */

import {
  IProviderUsageService,
  type MeteredProviderUsage,
  type ProviderUsageResult,
  type Scope,
} from '@moonshot-ai/agent-core-v2';

import { okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import {
  providerUsageQuerySchema,
  providerUsageResponseSchema,
  type ProviderMeteredBalance,
  type ProviderMeteredBalanceResult,
  type ProviderMeteredPeriod,
  type ProviderMeteredUsage,
  type ProviderUsageItem,
  type ProviderUsageResponse,
  type ProviderUsageRow,
} from '../protocol/rest-provider-usage';

interface RouteHost {
  get(
    path: string,
    options: { preHandler?: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; query: unknown },
      reply: { send(payload: unknown): void },
    ) => Promise<void> | void,
  ): unknown;
}

export function registerProviderUsageRoutes(app: RouteHost, core: Scope): void {
  const usageRoute = defineRoute(
    {
      method: 'GET',
      path: '/provider-usage',
      querystring: providerUsageQuerySchema,
      success: { data: providerUsageResponseSchema },
      description:
        'Query usage across the configured supported usage providers',
      tags: ['providers'],
    },
    async (req, reply) => {
      const results = await core.accessor.get(IProviderUsageService).queryUsage(req.query.provider);
      reply.send(okEnvelope(toProviderUsageResponse(results), req.id));
    },
  );
  app.get(
    usageRoute.path,
    usageRoute.options,
    usageRoute.handler as Parameters<RouteHost['get']>[2],
  );
}

// ---------------------------------------------------------------------------
// Edge projection — domain (`ProviderUsageResult`) → snake_case wire shape.
// Field mapping mirrors `routes/oauth.ts` `toWireUsage` / `toWireUsageRow`
// exactly: rows map `resetAt` → `reset_at` and the booster wallet maps its
// camelCase fields to `balance_cents` / `total_cents` / `monthly_*_cents`.
// Error/unsupported entries relay the service-scrubbed `message` verbatim with
// the optional safe HTTP `status` — the scrub happened in the service, and the
// route must not re-derive or add any credential text itself.
// ---------------------------------------------------------------------------

function toProviderUsageResponse(results: readonly ProviderUsageResult[]): ProviderUsageResponse {
  return { providers: results.map(toProviderUsageItem) };
}

function toProviderUsageItem(result: ProviderUsageResult): ProviderUsageItem {
  if (result.kind === 'ok') {
    return {
      provider: result.provider,
      kind: 'ok',
      summary: result.summary === null ? null : toWireUsageRow(result.summary),
      limits: result.limits.map(toWireUsageRow),
      extra_usage:
        result.extraUsage === null
          ? null
          : {
              balance_cents: result.extraUsage.balanceCents,
              total_cents: result.extraUsage.totalCents,
              monthly_charge_limit_enabled: result.extraUsage.monthlyChargeLimitEnabled,
              monthly_charge_limit_cents: result.extraUsage.monthlyChargeLimitCents,
              monthly_used_cents: result.extraUsage.monthlyUsedCents,
              currency: result.extraUsage.currency,
            },
      metered_usage: toWireMeteredUsage(result.meteredUsage),
    };
  }
  if (result.kind === 'error') {
    return {
      provider: result.provider,
      kind: 'error',
      message: result.message,
      status: result.status,
    };
  }
  return {
    provider: result.provider,
    kind: 'unsupported',
    message: result.message,
    status: result.status,
  };
}

interface DomainUsageRow {
  name?: string;
  window?: { duration: number; unit: 'minute' | 'hour' | 'day' | 'week' };
  used: number;
  limit: number;
  resetAt?: string;
}

function toWireUsageRow(row: DomainUsageRow): ProviderUsageRow {
  return {
    name: row.name,
    window: row.window,
    used: row.used,
    limit: row.limit,
    reset_at: row.resetAt,
  };
}

// ---------------------------------------------------------------------------
// Metered usage projection — core `MeteredProviderUsage` → snake_case.
//
// Every field is mapped explicitly — never spread — so a future field on the
// domain type (including any credential-adjacent context) cannot leak onto the
// wire by accident. `estimated_cost` stays a high-precision CNY decimal string
// (or `null`) — the route performs no rounding or unit conversion, and the
// independent account `balance` is projected separately from Kimi `extra_usage`.
// ---------------------------------------------------------------------------

type MeteredPeriod = MeteredProviderUsage['today'];
type MeteredBalance = MeteredProviderUsage['balance'];

function toWireMeteredUsage(metered: MeteredProviderUsage | undefined): ProviderMeteredUsage | undefined {
  if (metered === undefined) return undefined;
  return {
    source: metered.source,
    cost_source: metered.costSource,
    currency: metered.currency,
    timezone: metered.timezone,
    tracking_started_at: metered.trackingStartedAt,
    degraded: metered.degraded,
    today: toWireMeteredPeriod(metered.today),
    month: toWireMeteredPeriod(metered.month),
    balance: toWireMeteredBalance(metered.balance),
  };
}

function toWireMeteredPeriod(period: MeteredPeriod): ProviderMeteredPeriod {
  return {
    start_at: period.startAt,
    end_at: period.endAt,
    request_count: period.requestCount,
    measured_request_count: period.measuredRequestCount,
    pending_request_count: period.pendingRequestCount,
    missing_usage_request_count: period.missingUsageRequestCount,
    unpriced_request_count: period.unpricedRequestCount,
    input_tokens: period.inputTokens,
    output_tokens: period.outputTokens,
    cache_read_tokens: period.cacheReadTokens,
    total_tokens: period.totalTokens,
    estimated_cost: period.estimatedCost,
    is_partial: period.isPartial,
  };
}

function toWireMeteredBalance(balance: MeteredBalance): ProviderMeteredBalanceResult {
  if (balance.kind === 'ok') {
    return {
      kind: 'ok',
      is_available: balance.isAvailable,
      balances: balance.balances.map((entry): ProviderMeteredBalance => ({
        currency: entry.currency,
        total: entry.total,
        granted: entry.granted,
        topped_up: entry.toppedUp,
      })),
    };
  }
  return {
    kind: 'error',
    message: balance.message,
    status: balance.status,
  };
}