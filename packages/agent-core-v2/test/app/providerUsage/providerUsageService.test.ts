/**
 * `app/providerUsage` tests — `IProviderUsageService`:
 *
 *  - managed Kimi OAuth (`managed:kimi-code`) delegates to
 *    `IOAuthService.getManagedUsage` and maps the parsed result;
 *  - the official API-key provider (`https://api.kimi.com/coding(/v1)` base)
 *    fetches `/v1/usages` with the resolved credential as Bearer token —
 *    inline `apiKey` and the provider env-bag both resolve;
 *  - the managed OpenAI Codex provider (`managed:openai-codex`) resolves the
 *    token provider / request auth through `IOAuthService` and fetches the
 *    fixed official `wham/usage` URL;
 *  - the exact-base OpenCode Go provider (`https://opencode.ai/zen/go/v1`)
 *    fetches the fixed `/v1/usage` endpoint with the resolved API key;
 *  - a specified provider is queried alone; an omitted query targets every
 *    identifiable supported usage provider and skips the rest;
 *  - `unsupported` for non-official endpoints, `error` for missing
 *    credentials, HTTP/network failures, and unknown providers;
 *  - error messages have the real credential redacted.
 */

import {
  KIMI_CODE_FLOW_CONFIG,
  KIMI_CODE_PROVIDER_NAME,
  KimiOAuthToolkit,
  OPENAI_CODEX_PROVIDER_NAME,
  resolveKimiTokenStorageName,
  type AuthManagedUsageResult,
  type BearerTokenProvider,
  type TokenInfo,
  type TokenStorage,
} from '@moonshot-ai/kimi-code-oauth';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createScopedTestHost } from '#/_base/di/test';
import { IOAuthService } from '#/app/auth/auth';
import { IProviderUsageService } from '#/app/providerUsage/providerUsage';
import {
  CODEX_OAUTH_USAGE_ERROR_MESSAGE,
  MANAGED_OAUTH_USAGE_ERROR_MESSAGE,
} from '#/app/providerUsage/providerUsageService';
import {
  IProviderService,
  type ProviderConfig,
} from '#/kosong/provider/provider';
import '#/kosong/provider/providers/kimi/kimi.contrib';

const OFFICIAL_V1_BASE = 'https://api.kimi.com/coding/v1';
const OFFICIAL_ROOT_BASE = 'https://api.kimi.com/coding';
const OFFICIAL_USAGE_URL = 'https://api.kimi.com/coding/v1/usages';
const CODEX_BASE = 'https://chatgpt.com/backend-api/codex';
const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const OPENCODE_BASE = 'https://opencode.ai/zen/go/v1';
const OPENCODE_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';
const EPOCH_ISO = new Date(1_780_000_000 * 1000).toISOString();

const CODEX_PAYLOAD = {
  plan_type: 'plus',
  rate_limit: {
    primary_window: {
      used_percent: 17,
      limit_window_seconds: 86_400,
      reset_after_seconds: 12_345,
      reset_at: 1_780_000_000,
    },
    secondary_window: {
      used_percent: 42,
      limit_window_seconds: 604_800,
      reset_at: 1_780_000_000,
    },
  },
};

const OPENCODE_PAYLOAD = {
  usage: {
    rolling: { status: 'active', percent: 17, resetsAt: '2026-09-01T00:00:00Z' },
    weekly: { status: 'active', percent: 42, resetsAt: '2026-08-30T00:00:00Z' },
    monthly: { status: 'active', percent: 5, resetsAt: '2026-08-31T00:00:00Z' },
  },
};

interface StubOAuth extends IOAuthService {
  readonly checks: Array<{ provider: string }>;
}

function stubProviders(providers: Record<string, ProviderConfig>): IProviderService {
  return {
    _serviceBrand: undefined,
    ready: Promise.resolve(),
    onDidChangeProviders: () => ({ dispose: () => {} }),
    onDidChangeDefaultProvider: () => ({ dispose: () => {} }),
    get: (name: string) => providers[name],
    list: () => providers,
    getDefaultProvider: () => undefined,
    set: async () => {},
    delete: async () => {},
    loadAll: () => {},
    replaceAll: async () => {},
    setDefaultProvider: async () => {},
  } as unknown as IProviderService;
}

function stubOAuth(usage: AuthManagedUsageResult[]): StubOAuth {
  const checks: Array<{ provider: string }> = [];
  let index = 0;
  return {
    ...({
      _serviceBrand: undefined,
      startLogin: () => Promise.reject(new Error('not implemented')),
      getFlow: () => undefined,
      cancelLogin: () => Promise.reject(new Error('not implemented')),
      logout: () => Promise.reject(new Error('not implemented')),
      status: () => Promise.resolve({ loggedIn: false }),
      refreshOAuthProviderModels: () => Promise.reject(new Error('not implemented')),
      getManagedUserInfo: () => Promise.reject(new Error('not implemented')),
      resolveTokenProvider: () => undefined,
      getCachedAccessToken: () => Promise.resolve(undefined),
    } as unknown as IOAuthService),
    checks,
    getManagedUsage: async (provider?: string) => {
      checks.push({ provider: provider ?? KIMI_CODE_PROVIDER_NAME });
      const result = usage[Math.min(index, usage.length - 1)];
      index += 1;
      return result;
    },
  } as StubOAuth;
}

function stubFetchOk(payload: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
}

function stubFetchError(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
}

function stubFetchNetworkError(message: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError(message);
    }),
  );
}

const PAYLOAD = {
  usage: { used: '17', limit: '100', resetTime: '2030-01-01T00:00:00.000Z' },
  boosterWallet: {
    balance: { type: 'BOOSTER', amount: '20000000000', amountLeft: '10000000000' },
    monthlyChargeLimit: { currency: 'USD', priceInCents: '20000' },
    monthlyUsed: { currency: 'USD', priceInCents: '5000' },
    monthlyChargeLimitEnabled: true,
  },
};

const MANAGED_OK: AuthManagedUsageResult = {
  kind: 'ok',
  summary: { used: 40, limit: 1000, window: { duration: 1, unit: 'week' } },
  limits: [],
  extraUsage: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('IProviderUsageService', () => {
  it('delegates the managed Kimi OAuth provider and maps the result', async () => {
    const oauth = stubOAuth([MANAGED_OK]);
    const host = createScopedTestHost([
      [IProviderService, stubProviders({ [KIMI_CODE_PROVIDER_NAME]: { type: 'anthropic' } })],
      [IOAuthService, oauth],
    ]);
    try {
      const service = host.app.accessor.get(IProviderUsageService);
      const results = await service.queryUsage(KIMI_CODE_PROVIDER_NAME);
      expect(oauth.checks).toEqual([{ provider: KIMI_CODE_PROVIDER_NAME }]);
      expect(results).toEqual([
        { kind: 'ok', provider: KIMI_CODE_PROVIDER_NAME, summary: { used: 40, limit: 1000, window: { duration: 1, unit: 'week' } }, limits: [], extraUsage: null },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('fetches official v1 usage with an inline api key', async () => {
    stubFetchOk(PAYLOAD);
    const host = createScopedTestHost([
      [IProviderService, stubProviders({ kimi: { apiKey: 'sk-test-inline', baseUrl: OFFICIAL_V1_BASE } })],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      expect(results).toEqual([
        {
          kind: 'ok',
          provider: 'kimi',
          summary: { used: 17, limit: 100, resetAt: '2030-01-01T00:00:00.000Z', window: { duration: 1, unit: 'week' } },
          limits: [],
          extraUsage: {
            balanceCents: 10000,
            totalCents: 20000,
            monthlyChargeLimitEnabled: true,
            monthlyChargeLimitCents: 20000,
            monthlyUsedCents: 5000,
            currency: 'USD',
          },
        },
      ]);
      const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit?][];
      const init = calls[0]?.[1] ?? {};
      const headers = new Headers((init.headers ?? {}) as Record<string, string>);
      expect(calls[0]?.[0]).toBe(OFFICIAL_USAGE_URL);
      expect(headers.get('authorization')).toBe('Bearer sk-test-inline');
    } finally {
      host.dispose();
    }
  });

  it('resolves the Anthropic protocol root to the same v1 usages endpoint', async () => {
    stubFetchOk(PAYLOAD);
    const host = createScopedTestHost([
      [IProviderService, stubProviders({ kimi: { apiKey: 'sk-test-inline', baseUrl: OFFICIAL_ROOT_BASE } })],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit?][];
      expect(calls[0]?.[0]).toBe(OFFICIAL_USAGE_URL);
      expect(calls[0]?.[0]).not.toBe(`${OFFICIAL_ROOT_BASE}/usages`);
    } finally {
      host.dispose();
    }
  });

  it('resolves the api key from the provider env bag when no inline apiKey is set', async () => {
    stubFetchOk(PAYLOAD);
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({ kimi: { type: 'kimi', env: { KIMI_API_KEY: 'sk-env-bag' }, baseUrl: OFFICIAL_V1_BASE } }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit?][];
      const init = calls[0]?.[1] ?? {};
      const headers = new Headers((init.headers ?? {}) as Record<string, string>);
      expect(headers.get('authorization')).toBe('Bearer sk-env-bag');
    } finally {
      host.dispose();
    }
  });

  it('resolves base URL and api key both from the provider env bag', async () => {
    stubFetchOk(PAYLOAD);
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          kimi: { type: 'kimi', env: { KIMI_API_KEY: 'sk-env-bag', KIMI_BASE_URL: OFFICIAL_V1_BASE } },
        }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      expect(results[0]).toMatchObject({ kind: 'ok', provider: 'kimi' });
      const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit?][];
      const init = calls[0]?.[1] ?? {};
      const headers = new Headers((init.headers ?? {}) as Record<string, string>);
      expect(calls[0]?.[0]).toBe(OFFICIAL_USAGE_URL);
      expect(headers.get('authorization')).toBe('Bearer sk-env-bag');
    } finally {
      host.dispose();
    }
  });

  it('discovers env-bag providers whose effective base URL is the official endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(PAYLOAD), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          kimi: { type: 'kimi', env: { KIMI_API_KEY: 'sk-env-bag', KIMI_BASE_URL: OFFICIAL_V1_BASE } },
          deepseek: { type: 'kimi', env: { KIMI_API_KEY: 'sk-d', KIMI_BASE_URL: 'https://api.deepseek.com/v1' } },
        }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage();
      expect(results.map((r) => r.provider)).toEqual(['kimi']);
      const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit?][];
      expect(calls[0]?.[0]).toBe(OFFICIAL_USAGE_URL);
    } finally {
      host.dispose();
    }
  });

  it('queries only the specified provider', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(PAYLOAD), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          kimi: { apiKey: 'sk-a', baseUrl: OFFICIAL_V1_BASE },
          other: { apiKey: 'sk-b', baseUrl: 'https://api.example.test/v1' },
        }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      expect(results.map((r) => r.provider)).toEqual(['kimi']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      host.dispose();
    }
  });

  it('queries every Kimi usage provider when unspecified and skips the rest', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(PAYLOAD), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const oauth = stubOAuth([MANAGED_OK]);
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          [KIMI_CODE_PROVIDER_NAME]: { type: 'anthropic' },
          kimi: { apiKey: 'sk-a', baseUrl: OFFICIAL_V1_BASE },
          deepseek: { apiKey: 'sk-d', baseUrl: 'https://api.deepseek.com/v1' },
        }),
      ],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage();
      expect(results.map((r) => r.provider).sort()).toEqual(['kimi', KIMI_CODE_PROVIDER_NAME]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(oauth.checks).toEqual([{ provider: KIMI_CODE_PROVIDER_NAME }]);
    } finally {
      host.dispose();
    }
  });

  it('returns an error when an official provider has no credential', async () => {
    const host = createScopedTestHost([
      [IProviderService, stubProviders({ kimi: { baseUrl: OFFICIAL_V1_BASE } })],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      expect(results).toEqual([
        { kind: 'error', provider: 'kimi', message: 'No credential configured for provider kimi.' },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('returns unsupported for a provider without a Kimi usage endpoint', async () => {
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({ deepseek: { apiKey: 'sk-d', baseUrl: 'https://api.deepseek.com/v1' } }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('deepseek');
      expect(results).toEqual([
        { kind: 'unsupported', provider: 'deepseek', message: 'Usage endpoint is not available for this provider.' },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('rejects an explicit Moonshot Open Platform base URL as unsupported', async () => {
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({ kimi: { apiKey: 'sk-x', baseUrl: 'https://api.moonshot.cn/v1' } }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      expect(results).toEqual([
        { kind: 'unsupported', provider: 'kimi', message: 'Usage endpoint is not available for this provider.' },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('reports an unknown provider as an error', async () => {
    const host = createScopedTestHost([
      [IProviderService, stubProviders({})],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('ghost');
      expect(results).toEqual([
        { kind: 'error', provider: 'ghost', message: 'Provider ghost is not configured.' },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('surfaces HTTP 401 as a redacted error entry', async () => {
    stubFetchError(401, { message: 'invalid key sk-test-401' });
    const host = createScopedTestHost([
      [IProviderService, stubProviders({ kimi: { apiKey: 'sk-test-401', baseUrl: OFFICIAL_V1_BASE } })],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      expect(results).toEqual([
        { kind: 'error', provider: 'kimi', message: 'invalid key [redacted]' },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('surfaces HTTP 404 as a redacted error entry', async () => {
    stubFetchError(404, { detail: 'usage endpoint moved sk-404' });
    const host = createScopedTestHost([
      [IProviderService, stubProviders({ kimi: { apiKey: 'sk-404', baseUrl: OFFICIAL_V1_BASE } })],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      expect(results).toEqual([
        { kind: 'error', provider: 'kimi', message: 'usage endpoint moved [redacted]' },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('redacts the api key from network failure messages', async () => {
    stubFetchNetworkError('fetch failed for sk-test-net');
    const host = createScopedTestHost([
      [IProviderService, stubProviders({ kimi: { apiKey: 'sk-test-net', baseUrl: OFFICIAL_V1_BASE } })],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('kimi');
      expect(results).toEqual([
        { kind: 'error', provider: 'kimi', message: 'Failed to fetch usage: fetch failed for [redacted]' },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('masks any managed OAuth error text at the service boundary', async () => {
    const sentinel = 'REFRESH-TOKEN-SENTINEL-zz9';
    const oauth = stubOAuth([]);
    oauth.getManagedUsage = async () => ({
      kind: 'error',
      status: 400,
      message: `refresh failed: token_endpoint rejected ${sentinel}`,
    });

    const host = createScopedTestHost([
      [IProviderService, stubProviders({})],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor
        .get(IProviderUsageService)
        .queryUsage(KIMI_CODE_PROVIDER_NAME);
      expect(results).toEqual([
        {
          kind: 'error',
          provider: KIMI_CODE_PROVIDER_NAME,
          message: MANAGED_OAUTH_USAGE_ERROR_MESSAGE,
          status: 400,
        },
      ]);
      expect(JSON.stringify(results)).not.toContain(sentinel);
    } finally {
      host.dispose();
    }
  });

  it('never forwards a managed OAuth access token echoed by the usage server (end to end)', async () => {
    const token = 'fake-oauth-token-xyz';
    const tokens = new Map<string, TokenInfo>();
    const storage: TokenStorage = {
      load: async (name) => tokens.get(name),
      save: async (name, info) => {
        tokens.set(name, info);
      },
      remove: async (name) => {
        tokens.delete(name);
      },
      list: async () => [...tokens.keys()],
    };
    const oauthKey = 'e2e-key-1';
    tokens.set(resolveKimiTokenStorageName({ providerName: KIMI_CODE_PROVIDER_NAME, oauthKey }), {
      accessToken: token,
      refreshToken: '',
      expiresAt: Math.floor(Date.now() / 1000) + 86_000,
      scope: '',
      tokenType: 'Bearer',
      expiresIn: 86_400,
    });
    const toolkit = new KimiOAuthToolkit({
      homeDir: '/tmp/kimi-oauth-e2e',
      storage,
      flowConfig: KIMI_CODE_FLOW_CONFIG,
    });
    stubFetchError(401, { message: `rejected ${token}` });
    const oauth = stubOAuth([]);
    oauth.getManagedUsage = async (provider?: string) =>
      toolkit.getManagedUsage(provider ?? KIMI_CODE_PROVIDER_NAME, {
        baseUrl: OFFICIAL_V1_BASE,
        oauthRef: { key: oauthKey },
      });

    const host = createScopedTestHost([
      [IProviderService, stubProviders({})],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage(KIMI_CODE_PROVIDER_NAME);
      expect(results).toEqual([
        {
          kind: 'error',
          provider: KIMI_CODE_PROVIDER_NAME,
          message: MANAGED_OAUTH_USAGE_ERROR_MESSAGE,
          status: 401,
        },
      ]);
      const serialized = JSON.stringify(results);
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain('rejected');
    } finally {
      host.dispose();
    }
  });

  it('stops before issuing any request when the caller signal is already aborted', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(PAYLOAD), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const aborted = new AbortController();
    aborted.abort();
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({ kimi: { apiKey: 'sk-a', baseUrl: OFFICIAL_V1_BASE } }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor
        .get(IProviderUsageService)
        .queryUsage(undefined, { signal: aborted.signal });
      expect(results).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      host.dispose();
    }
  });

  it('uses the managed default base URL for an oauth provider without a config entry', async () => {
    const host = createScopedTestHost([
      [IProviderService, stubProviders({})],
      [IOAuthService, stubOAuth([MANAGED_OK])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage(KIMI_CODE_PROVIDER_NAME);
      expect(results[0]).toMatchObject({ kind: 'ok', provider: KIMI_CODE_PROVIDER_NAME });
    } finally {
      host.dispose();
    }
  });

  it('queries managed OpenAI Codex through the OAuth request auth', async () => {
    stubFetchOk(CODEX_PAYLOAD);
    const oauth = stubOAuth([]);
    const tokenProvider: BearerTokenProvider = {
      getAccessToken: async () => 'codex-access-token',
      getRequestAuth: async () => ({
        apiKey: 'codex-access-token',
        headers: {
          'ChatGPT-Account-Id': 'acct-123',
          'User-Agent': 'hakimi',
          originator: 'hakimi',
        },
      }),
    };
    oauth.resolveTokenProvider = (provider, ref) =>
      provider === OPENAI_CODEX_PROVIDER_NAME ? tokenProvider : undefined;
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          [OPENAI_CODEX_PROVIDER_NAME]: {
            type: 'openai_responses',
            baseUrl: CODEX_BASE,
            oauth: { storage: 'file', key: 'oauth/openai-codex' },
          },
        }),
      ],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage(OPENAI_CODEX_PROVIDER_NAME);
      expect(results).toEqual([
        {
          kind: 'ok',
          provider: OPENAI_CODEX_PROVIDER_NAME,
          summary: {
            name: 'Primary window',
            used: 17,
            limit: 100,
            window: { duration: 1, unit: 'day' },
            resetAt: EPOCH_ISO,
          },
          limits: [
            {
              name: 'Secondary window',
              used: 42,
              limit: 100,
              window: { duration: 1, unit: 'week' },
              resetAt: EPOCH_ISO,
            },
          ],
          extraUsage: null,
        },
      ]);
      const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit?][];
      const init = calls[0]?.[1] ?? {};
      const headers = new Headers((init.headers ?? {}) as Record<string, string>);
      expect(calls[0]?.[0]).toBe(CODEX_USAGE_URL);
      expect(headers.get('authorization')).toBe('Bearer codex-access-token');
      expect(headers.get('chatgpt-account-id')).toBe('acct-123');
      expect(headers.get('user-agent')).toBe('hakimi');
    } finally {
      host.dispose();
    }
  });

  it('requires getRequestAuth for the Codex token provider', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(CODEX_PAYLOAD), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const oauth = stubOAuth([]);
    oauth.resolveTokenProvider = (provider) =>
      provider === OPENAI_CODEX_PROVIDER_NAME
        ? { getAccessToken: async () => 'codex-bare-token' }
        : undefined;
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          [OPENAI_CODEX_PROVIDER_NAME]: { type: 'openai_responses', baseUrl: CODEX_BASE },
        }),
      ],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor
        .get(IProviderUsageService)
        .queryUsage(OPENAI_CODEX_PROVIDER_NAME);
      // Codex usage routing needs the account-id headers carried by
      // `getRequestAuth`; a bare access token is not a usable credential here.
      expect(results).toEqual([
        {
          kind: 'error',
          provider: OPENAI_CODEX_PROVIDER_NAME,
          message: `No credential configured for provider ${OPENAI_CODEX_PROVIDER_NAME}.`,
        },
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      host.dispose();
    }
  });

  it('normalizes a Codex token-provider failure without leaking its message', async () => {
    const sentinel = 'CODEX-REFRESH-SENTINEL-q7';
    const oauth = stubOAuth([]);
    oauth.resolveTokenProvider = (provider) =>
      provider === OPENAI_CODEX_PROVIDER_NAME
        ? {
            getAccessToken: async () => 'unused',
            getRequestAuth: async () => {
              throw new Error(`refresh failed: token endpoint echoed ${sentinel}`);
            },
          }
        : undefined;
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          [OPENAI_CODEX_PROVIDER_NAME]: { type: 'openai_responses', baseUrl: CODEX_BASE },
        }),
      ],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage(OPENAI_CODEX_PROVIDER_NAME);
      expect(results).toEqual([
        { kind: 'error', provider: OPENAI_CODEX_PROVIDER_NAME, message: CODEX_OAUTH_USAGE_ERROR_MESSAGE },
      ]);
      expect(JSON.stringify(results)).not.toContain(sentinel);
    } finally {
      host.dispose();
    }
  });

  it('returns an error when the Codex OAuth token provider cannot be resolved', async () => {
    const oauth = stubOAuth([]);
    oauth.resolveTokenProvider = () => undefined;
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          [OPENAI_CODEX_PROVIDER_NAME]: { type: 'openai_responses', baseUrl: CODEX_BASE },
        }),
      ],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage(OPENAI_CODEX_PROVIDER_NAME);
      expect(results).toEqual([
        {
          kind: 'error',
          provider: OPENAI_CODEX_PROVIDER_NAME,
          message: `No credential configured for provider ${OPENAI_CODEX_PROVIDER_NAME}.`,
        },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('rejects a non-official Codex base URL as unsupported', async () => {
    const oauth = stubOAuth([]);
    oauth.resolveTokenProvider = vi.fn(() => undefined);
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          [OPENAI_CODEX_PROVIDER_NAME]: {
            type: 'openai_responses',
            baseUrl: 'https://proxy.example.com/backend-api/codex',
          },
        }),
      ],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage(OPENAI_CODEX_PROVIDER_NAME);
      expect(results).toEqual([
        {
          kind: 'unsupported',
          provider: OPENAI_CODEX_PROVIDER_NAME,
          message: 'Usage endpoint is not available for this provider.',
        },
      ]);
      expect(oauth.resolveTokenProvider).not.toHaveBeenCalled();
    } finally {
      host.dispose();
    }
  });

  it('redacts a Codex access token echoed by the usage server (end to end)', async () => {
    const token = 'codex-echoed-token-zz';
    stubFetchError(401, { message: `invalid token ${token}` });
    const oauth = stubOAuth([]);
    oauth.resolveTokenProvider = (provider) =>
      provider === OPENAI_CODEX_PROVIDER_NAME
        ? { getAccessToken: async () => token, getRequestAuth: async () => ({ apiKey: token }) }
        : undefined;
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          [OPENAI_CODEX_PROVIDER_NAME]: { type: 'openai_responses', baseUrl: CODEX_BASE },
        }),
      ],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage(OPENAI_CODEX_PROVIDER_NAME);
      expect(results).toEqual([
        {
          kind: 'error',
          provider: OPENAI_CODEX_PROVIDER_NAME,
          message: 'invalid token [redacted]',
          status: 401,
        },
      ]);
      const serialized = JSON.stringify(results);
      expect(serialized).not.toContain(token);
    } finally {
      host.dispose();
    }
  });

  it('discovers managed OpenAI Codex alongside the managed Kimi provider', async () => {
    stubFetchOk(CODEX_PAYLOAD);
    const oauth = stubOAuth([MANAGED_OK]);
    oauth.resolveTokenProvider = (provider) =>
      provider === OPENAI_CODEX_PROVIDER_NAME
        ? { getAccessToken: async () => 'codex-discovery-token' }
        : undefined;
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          [KIMI_CODE_PROVIDER_NAME]: { type: 'anthropic' },
          [OPENAI_CODEX_PROVIDER_NAME]: { type: 'openai_responses', baseUrl: CODEX_BASE },
          deepseek: { apiKey: 'sk-d', baseUrl: 'https://api.deepseek.com/v1' },
        }),
      ],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage();
      expect(results.map((r) => r.provider).sort()).toEqual([
        KIMI_CODE_PROVIDER_NAME,
        OPENAI_CODEX_PROVIDER_NAME,
      ]);
    } finally {
      host.dispose();
    }
  });

  it('fetches OpenCode Go usage with an inline api key', async () => {
    stubFetchOk(OPENCODE_PAYLOAD);
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({ opencode: { apiKey: 'oc-go-api-key', baseUrl: OPENCODE_BASE } }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('opencode');
      expect(results).toEqual([
        {
          kind: 'ok',
          provider: 'opencode',
          summary: { name: 'Rolling', used: 17, limit: 100, resetAt: '2026-09-01T00:00:00Z' },
          limits: [
            { name: 'Weekly', used: 42, limit: 100, resetAt: '2026-08-30T00:00:00Z' },
            { name: 'Monthly', used: 5, limit: 100, resetAt: '2026-08-31T00:00:00Z' },
          ],
          extraUsage: null,
        },
      ]);
      const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit?][];
      const init = calls[0]?.[1] ?? {};
      const headers = new Headers((init.headers ?? {}) as Record<string, string>);
      expect(calls[0]?.[0]).toBe(OPENCODE_USAGE_URL);
      expect(headers.get('authorization')).toBe('Bearer oc-go-api-key');
    } finally {
      host.dispose();
    }
  });

  it('discovers exact-base OpenCode Go providers and skips the rest', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(OPENCODE_PAYLOAD), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          opencode: { apiKey: 'oc-go', baseUrl: OPENCODE_BASE },
          other: { apiKey: 'sk-x', baseUrl: 'https://api.example.test/v1' },
        }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage();
      expect(results.map((r) => r.provider)).toEqual(['opencode']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
      expect(calls[0]?.[0]).toBe(OPENCODE_USAGE_URL);
    } finally {
      host.dispose();
    }
  });

  it('rejects a non-official OpenCode Go base URL as unsupported', async () => {
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({ opencode: { apiKey: 'oc-go', baseUrl: 'https://opencode.ai/zen/go/v2' } }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('opencode');
      expect(results).toEqual([
        {
          kind: 'unsupported',
          provider: 'opencode',
          message: 'Usage endpoint is not available for this provider.',
        },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('returns an error when an OpenCode Go provider has no credential', async () => {
    const host = createScopedTestHost([
      [IProviderService, stubProviders({ opencode: { baseUrl: OPENCODE_BASE } })],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('opencode');
      expect(results).toEqual([
        { kind: 'error', provider: 'opencode', message: 'No credential configured for provider opencode.' },
      ]);
    } finally {
      host.dispose();
    }
  });

  it('redacts an OpenCode Go api key echoed by the usage server', async () => {
    stubFetchError(403, { message: 'rejected oc-go-echoed-key' });
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({ opencode: { apiKey: 'oc-go-echoed-key', baseUrl: OPENCODE_BASE } }),
      ],
      [IOAuthService, stubOAuth([])],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage('opencode');
      expect(results).toEqual([
        {
          kind: 'error',
          provider: 'opencode',
          message: 'rejected [redacted]',
        },
      ]);
      expect(JSON.stringify(results)).not.toContain('oc-go-echoed-key');
    } finally {
      host.dispose();
    }
  });

  it('isolates an unexpected provider failure without aborting the batch', async () => {
    const sentinel = 'UNEXPECTED-PROVIDER-BOOM-s88';
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(PAYLOAD), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const oauth = stubOAuth([]);
    // The managed route throws unexpectedly (e.g. an internal bug): the batch
    // must record a fixed error for this provider and keep querying the rest.
    oauth.getManagedUsage = async () => {
      throw new Error(sentinel);
    };
    const host = createScopedTestHost([
      [
        IProviderService,
        stubProviders({
          [KIMI_CODE_PROVIDER_NAME]: { type: 'anthropic' },
          kimi: { apiKey: 'sk-isolated', baseUrl: OFFICIAL_V1_BASE },
        }),
      ],
      [IOAuthService, oauth],
    ]);
    try {
      const results = await host.app.accessor.get(IProviderUsageService).queryUsage();
      expect(results.map((r) => r.provider).sort()).toEqual(['kimi', KIMI_CODE_PROVIDER_NAME]);
      expect(results.find((r) => r.provider === KIMI_CODE_PROVIDER_NAME)).toEqual({
        kind: 'error',
        provider: KIMI_CODE_PROVIDER_NAME,
        message: `Failed to query usage for provider ${KIMI_CODE_PROVIDER_NAME}.`,
      });
      expect(results.find((r) => r.provider === 'kimi')).toMatchObject({ kind: 'ok' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // The raw exception text (which may carry credential material) never leaks.
      expect(JSON.stringify(results)).not.toContain(sentinel);
    } finally {
      host.dispose();
    }
  });

  it('threads the caller signal into the managed Kimi OAuth usage fetch', async () => {
    const token = 'fake-oauth-token-sig';
    const tokens = new Map<string, TokenInfo>();
    const storage: TokenStorage = {
      load: async (name) => tokens.get(name),
      save: async (name, info) => {
        tokens.set(name, info);
      },
      remove: async (name) => {
        tokens.delete(name);
      },
      list: async () => [...tokens.keys()],
    };
    const oauthKey = 'signal-key-1';
    tokens.set(resolveKimiTokenStorageName({ providerName: KIMI_CODE_PROVIDER_NAME, oauthKey }), {
      accessToken: token,
      refreshToken: '',
      expiresAt: Math.floor(Date.now() / 1000) + 86_000,
      scope: '',
      tokenType: 'Bearer',
      expiresIn: 86_400,
    });
    const toolkit = new KimiOAuthToolkit({
      homeDir: '/tmp/kimi-oauth-signal',
      storage,
      flowConfig: KIMI_CODE_FLOW_CONFIG,
    });
    const seenOptions: unknown[] = [];
    const oauth = stubOAuth([]);
    oauth.getManagedUsage = async (
      provider?: string,
      options?: { readonly signal?: AbortSignal },
    ) => {
      seenOptions.push(options);
      return toolkit.getManagedUsage(provider ?? KIMI_CODE_PROVIDER_NAME, {
        baseUrl: OFFICIAL_V1_BASE,
        oauthRef: { key: oauthKey },
        signal: options?.signal,
      });
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: unknown, init: RequestInit | undefined) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );
    const host = createScopedTestHost([
      [IProviderService, stubProviders({})],
      [IOAuthService, oauth],
    ]);
    try {
      const controller = new AbortController();
      const pending = host.app.accessor
        .get(IProviderUsageService)
        .queryUsage(KIMI_CODE_PROVIDER_NAME, { signal: controller.signal });
      controller.abort();
      const results = await pending;
      // The in-flight managed token refresh / usage fetch is cancelled; the
      // service normalizes the cancellation to its fixed, safe message.
      expect(results).toEqual([
        {
          kind: 'error',
          provider: KIMI_CODE_PROVIDER_NAME,
          message: MANAGED_OAUTH_USAGE_ERROR_MESSAGE,
        },
      ]);
      expect(seenOptions[0]).toEqual({ signal: controller.signal });
    } finally {
      host.dispose();
    }
  });
});