import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  IProviderUsageLedgerService,
  IProviderUsageService,
  type IProviderUsageService as IProviderUsageServiceType,
  type ProviderUsageResult,
  type ScopeSeed,
} from '@moonshot-ai/agent-core-v2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  providerUsageResponseSchema,
  type ProviderUsageResponse,
} from '../src/protocol/rest-provider-usage';
import { type RunningServer, startServer } from '../src/start';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';
import { authHeaders } from './helpers/auth';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
  request_id: string;
}

describe('server-v2 GET /api/v1/provider-usage', () => {
  let server: RunningServer | undefined;
  let home: string | undefined;
  let base: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kimi-server-v2-provider-usage-'));
  });

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (home !== undefined) {
      await rm(home, { recursive: true, force: true });
      home = undefined;
    }
  });

  function usageStub(
    queryUsage: IProviderUsageServiceType['queryUsage'],
  ): IProviderUsageServiceType {
    return { _serviceBrand: undefined, queryUsage };
  }

  async function boot(seeds: ScopeSeed): Promise<void> {
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
      seeds,
    });
    base = `http://127.0.0.1:${server.port}`;
  }

  async function getUsage(query = ''): Promise<ProviderUsageResponse> {
    const res = await fetch(`${base}/api/v1/provider-usage${query}`, {
      headers: authHeaders(server as RunningServer),
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Envelope<ProviderUsageResponse>;
    expect(body.code).toBe(0);
    return providerUsageResponseSchema.parse(body.data);
  }

  const okResult = (
    overrides: Partial<Omit<Extract<ProviderUsageResult, { kind: 'ok' }>, 'kind'>> = {},
  ): ProviderUsageResult => ({
    kind: 'ok',
    provider: 'managed:kimi-code',
    summary: {
      name: 'Weekly limit',
      window: { duration: 1, unit: 'week' },
      used: 40,
      limit: 1000,
      resetAt: '2030-01-01T00:00:00.000Z',
    },
    limits: [
      { name: '5h limit', window: { duration: 5, unit: 'hour' }, used: 1, limit: 100 },
      { used: 2, limit: 50 },
    ],
    extraUsage: {
      balanceCents: 500,
      totalCents: 1000,
      monthlyChargeLimitEnabled: true,
      monthlyChargeLimitCents: 2000,
      monthlyUsedCents: 1500,
      currency: 'CNY',
    },
    ...overrides,
  });

  it('queries every usage provider and maps ok/error/unsupported to snake_case', async () => {
    const queryUsage = vi.fn<IProviderUsageServiceType['queryUsage']>(async () => [
      okResult(),
      {
        kind: 'error',
        provider: 'api-key',
        message: 'Authorization failed.',
        status: 401,
      },
      {
        kind: 'unsupported',
        provider: 'other',
        message: 'Usage endpoint is not available for this provider.',
      },
    ]);
    await boot([[IProviderUsageService, usageStub(queryUsage)]] as unknown as ScopeSeed);

    expect(await getUsage()).toEqual({
      providers: [
        {
          provider: 'managed:kimi-code',
          kind: 'ok',
          summary: {
            name: 'Weekly limit',
            window: { duration: 1, unit: 'week' },
            used: 40,
            limit: 1000,
            reset_at: '2030-01-01T00:00:00.000Z',
          },
          limits: [
            { name: '5h limit', window: { duration: 5, unit: 'hour' }, used: 1, limit: 100 },
            { used: 2, limit: 50 },
          ],
          extra_usage: {
            balance_cents: 500,
            total_cents: 1000,
            monthly_charge_limit_enabled: true,
            monthly_charge_limit_cents: 2000,
            monthly_used_cents: 1500,
            currency: 'CNY',
          },
        },
        { provider: 'api-key', kind: 'error', message: 'Authorization failed.', status: 401 },
        {
          provider: 'other',
          kind: 'unsupported',
          message: 'Usage endpoint is not available for this provider.',
        },
      ],
    });
    expect(queryUsage).toHaveBeenCalledWith(undefined);
  });

  it('forwards the optional provider query to queryUsage', async () => {
    const queryUsage = vi.fn<IProviderUsageServiceType['queryUsage']>(async () => [
      okResult({ provider: 'managed:kimi-code' }),
    ]);
    await boot([[IProviderUsageService, usageStub(queryUsage)]] as unknown as ScopeSeed);

    expect(await getUsage('?provider=managed%3Akimi-code')).toEqual({
      providers: [
        expect.objectContaining({ provider: 'managed:kimi-code', kind: 'ok' }),
      ],
    });
    expect(queryUsage).toHaveBeenCalledWith('managed:kimi-code');
  });

  it('handles a null summary/extra_usage ok payload', async () => {
    const queryUsage = vi.fn<IProviderUsageServiceType['queryUsage']>(async () => [
      okResult({ summary: null, extraUsage: null }),
    ]);
    await boot([[IProviderUsageService, usageStub(queryUsage)]] as unknown as ScopeSeed);

    const data = await getUsage();
    expect(data.providers[0]).toMatchObject({ kind: 'ok', summary: null, extra_usage: null });
  });

  it('never exposes credentials: relays the service-scrubbed message and no credential fields', async () => {
    // The service is the scrubber (it replaces credential-bearing text with
    // `[redacted]`); the route must relay that verbatim and must not add or
    // re-derive any credential-carrying field of its own.
    const queryUsage = vi.fn<IProviderUsageServiceType['queryUsage']>(async () => [
      {
        kind: 'error',
        provider: 'api-key',
        message: 'Request failed with credential [redacted]',
        status: 403,
      },
    ]);
    await boot([[IProviderUsageService, usageStub(queryUsage)]] as unknown as ScopeSeed);

    const data = await getUsage('?provider=api-key');
    expect(data.providers[0]).toEqual({
      provider: 'api-key',
      kind: 'error',
      message: 'Request failed with credential [redacted]',
      status: 403,
    });
    // The wire shape carries no key material anywhere — serialize and prove it.
    expect(JSON.stringify(data)).not.toMatch(/api_key|apiKey|has_api_key|sk-test|sk-/);
  });

  const meteredUsageFixture = {
    source: 'local',
    costSource: 'estimated',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    trackingStartedAt: '2030-01-01T00:00:00.000Z',
    degraded: false,
    today: {
      startAt: '2030-01-01T00:00:00.000Z',
      endAt: '2030-01-01T23:59:59.999Z',
      requestCount: 3,
      measuredRequestCount: 2,
      pendingRequestCount: 1,
      missingUsageRequestCount: 0,
      unpricedRequestCount: 0,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      totalTokens: 160,
      estimatedCost: '0.000123',
      isPartial: true,
    },
    month: {
      startAt: '2030-01-01T00:00:00.000Z',
      endAt: '2030-01-31T23:59:59.999Z',
      requestCount: 10,
      measuredRequestCount: 8,
      pendingRequestCount: 2,
      missingUsageRequestCount: 1,
      unpricedRequestCount: 1,
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 100,
      totalTokens: 1600,
      estimatedCost: null,
      isPartial: true,
    },
    balance: {
      kind: 'ok',
      isAvailable: true,
      balances: [
        { currency: 'CNY', total: '10.50', granted: '2.00', toppedUp: '8.50' },
        { currency: 'USD', total: '1.25', granted: '0.00', toppedUp: '1.25' },
      ],
    },
  } as const;

  it('projects the local metered usage and official balance field-by-field', async () => {
    const queryUsage = vi.fn<IProviderUsageServiceType['queryUsage']>(async () => [
      okResult({ meteredUsage: meteredUsageFixture }),
    ]);
    await boot([[IProviderUsageService, usageStub(queryUsage)]] as unknown as ScopeSeed);

    const data = await getUsage();
    expect(data.providers[0]).toEqual({
      provider: 'managed:kimi-code',
      kind: 'ok',
      summary: {
        name: 'Weekly limit',
        window: { duration: 1, unit: 'week' },
        used: 40,
        limit: 1000,
        reset_at: '2030-01-01T00:00:00.000Z',
      },
      limits: [
        { name: '5h limit', window: { duration: 5, unit: 'hour' }, used: 1, limit: 100 },
        { used: 2, limit: 50 },
      ],
      extra_usage: {
        balance_cents: 500,
        total_cents: 1000,
        monthly_charge_limit_enabled: true,
        monthly_charge_limit_cents: 2000,
        monthly_used_cents: 1500,
        currency: 'CNY',
      },
      metered_usage: {
        source: 'local',
        cost_source: 'estimated',
        currency: 'CNY',
        timezone: 'Asia/Shanghai',
        tracking_started_at: '2030-01-01T00:00:00.000Z',
        degraded: false,
        today: {
          start_at: '2030-01-01T00:00:00.000Z',
          end_at: '2030-01-01T23:59:59.999Z',
          request_count: 3,
          measured_request_count: 2,
          pending_request_count: 1,
          missing_usage_request_count: 0,
          unpriced_request_count: 0,
          input_tokens: 100,
          output_tokens: 50,
          cache_read_tokens: 10,
          total_tokens: 160,
          estimated_cost: '0.000123',
          is_partial: true,
        },
        month: {
          start_at: '2030-01-01T00:00:00.000Z',
          end_at: '2030-01-31T23:59:59.999Z',
          request_count: 10,
          measured_request_count: 8,
          pending_request_count: 2,
          missing_usage_request_count: 1,
          unpriced_request_count: 1,
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_tokens: 100,
          total_tokens: 1600,
          estimated_cost: null,
          is_partial: true,
        },
        balance: {
          kind: 'ok',
          is_available: true,
          balances: [
            { currency: 'CNY', total: '10.50', granted: '2.00', topped_up: '8.50' },
            { currency: 'USD', total: '1.25', granted: '0.00', topped_up: '1.25' },
          ],
        },
      },
    });
  });

  it('keeps local metered stats even when the official balance query fails', async () => {
    const queryUsage = vi.fn<IProviderUsageServiceType['queryUsage']>(async () => [
      okResult({
        meteredUsage: {
          ...meteredUsageFixture,
          balance: { kind: 'error', message: 'Balance endpoint unavailable.', status: 503 },
        },
      }),
    ]);
    await boot([[IProviderUsageService, usageStub(queryUsage)]] as unknown as ScopeSeed);

    const data = await getUsage();
    expect(data.providers[0]).toMatchObject({
      kind: 'ok',
      metered_usage: {
        today: expect.objectContaining({ total_tokens: 160, estimated_cost: '0.000123' }),
        balance: { kind: 'error', message: 'Balance endpoint unavailable.', status: 503 },
      },
    });
  });

  it('projects a real recorded attempt and official balance through the REST schema', async () => {
    await writeFile(join(home!, 'config.toml'), [
      '[experimental]',
      'deepseek_usage = true',
      '[providers.deepseek]',
      'type = "openai"',
      'base_url = "https://api.deepseek.com/v1"',
      'api_key = "test-deepseek-integration"',
    ].join('\n'));
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://api.deepseek.com/user/balance') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-deepseek-integration');
        return new Response(JSON.stringify({
          is_available: true,
          balance_infos: [{ currency: 'CNY', total_balance: '123.45', granted_balance: '0', topped_up_balance: '123.45' }],
        }));
      }
      if (!url.startsWith('http://127.0.0.1:')) throw new Error('Unexpected external request in usage test');
      return originalFetch(input, init);
    }));
    try {
      await boot([]);
      const ledger = server!.core.accessor.get(IProviderUsageLedgerService);
      const id = ledger.startAttempt({
        providerName: 'deepseek',
        providerType: 'openai',
        modelName: 'deepseek-v4-pro',
        modelAlias: 'deepseek/pro',
        baseUrl: 'https://api.deepseek.com/v1',
        startedAtEpochMs: Date.now(),
      });
      expect(id).toBeDefined();
      ledger.finishAttempt(id!, {
        outcome: 'success',
        usage: { inputOther: 1000, inputCacheRead: 2000, inputCacheCreation: 0, output: 300 },
      });
      const data = await getUsage('?provider=deepseek');
      expect(data.providers).toHaveLength(1);
      const result = data.providers[0];
      expect(result?.kind).toBe('ok');
      if (result?.kind !== 'ok') throw new Error('Expected metered provider result');
      expect(result.metered_usage?.today).toMatchObject({
        request_count: 1,
        measured_request_count: 1,
        input_tokens: 3000,
        cache_read_tokens: 2000,
        output_tokens: 300,
        total_tokens: 3300,
      });
      expect(Number(result.metered_usage?.today.estimated_cost)).toBeGreaterThan(0);
      expect(result.metered_usage?.balance).toEqual({
        kind: 'ok', is_available: true,
        balances: [{ currency: 'CNY', total: '123.45', granted: '0', topped_up: '123.45' }],
      });
      expect(JSON.stringify(data)).not.toContain('test-deepseek-integration');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});