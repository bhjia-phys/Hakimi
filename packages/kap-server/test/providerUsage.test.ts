import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
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
});