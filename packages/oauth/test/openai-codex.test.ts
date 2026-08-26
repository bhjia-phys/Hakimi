/**
 * Scenario: ChatGPT device OAuth, token refresh, request auth, and config lifecycle.
 * Responsibilities: Verify the public OAuth toolkit contract without real network or storage.
 * Wiring: In-memory token storage and injected fetch responses model external boundaries.
 * Run: pnpm exec vitest run packages/oauth/test/openai-codex.test.ts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyOpenAICodexConfig,
  extractOpenAICodexAccountId,
  fetchCodexUsage,
  OFFICIAL_CODEX_USAGE_URL,
  officialCodexUsageUrl,
  OPENAI_CODEX_OAUTH_KEY,
  OPENAI_CODEX_PROVIDER_NAME,
  OAuthUnauthorizedError,
  OpenAICodexOAuthToolkit,
  parseCodexUsagePayload,
  removeOpenAICodexConfig,
  requestOpenAICodexDeviceAuthorization,
  type ManagedKimiConfigShape,
  type TokenInfo,
  type TokenStorage,
} from '../src';

afterEach(() => {
  vi.unstubAllGlobals();
});

class MemoryTokenStorage implements TokenStorage {
  readonly tokens = new Map<string, TokenInfo>();

  async load(name: string): Promise<TokenInfo | undefined> {
    return this.tokens.get(name);
  }

  async save(name: string, token: TokenInfo): Promise<void> {
    this.tokens.set(name, token);
  }

  async remove(name: string): Promise<void> {
    this.tokens.delete(name);
  }

  async list(): Promise<string[]> {
    return [...this.tokens.keys()];
  }
}

function jwt(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenAI Codex OAuth account identity', () => {
  it('extracts the ChatGPT account id from supported token claim shapes', () => {
    expect(
      extractOpenAICodexAccountId({
        id_token: jwt({ chatgpt_account_id: 'acct-root' }),
        access_token: 'unused',
        refresh_token: 'refresh',
      }),
    ).toBe('acct-root');
    expect(
      extractOpenAICodexAccountId({
        id_token: jwt({
          'https://api.openai.com/auth': { chatgpt_account_id: 'acct-nested' },
        }),
        access_token: 'unused',
        refresh_token: 'refresh',
      }),
    ).toBe('acct-nested');
    expect(
      extractOpenAICodexAccountId({
        id_token: 'not-a-jwt',
        access_token: jwt({ organizations: [{ id: 'acct-org' }] }),
        refresh_token: 'refresh',
      }),
    ).toBe('acct-org');
  });

  it('returns undefined for malformed or unrecognized claims', () => {
    expect(
      extractOpenAICodexAccountId({
        id_token: 'not-a-jwt',
        access_token: 'also-not-a-jwt',
        refresh_token: 'refresh',
      }),
    ).toBeUndefined();
  });
});

describe('OpenAICodexOAuthToolkit', () => {
  it('completes the headless device flow and returns request-scoped account headers', async () => {
    const storage = new MemoryTokenStorage();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requests.push({ url, init });
      if (url.endsWith('/api/accounts/deviceauth/usercode')) {
        return jsonResponse({
          device_auth_id: 'device-auth-id',
          user_code: 'ABCD-EFGH',
          interval: '5',
        });
      }
      if (url.endsWith('/api/accounts/deviceauth/token')) {
        return jsonResponse({
          authorization_code: 'authorization-code',
          code_verifier: 'code-verifier',
        });
      }
      if (url.endsWith('/oauth/token')) {
        return jsonResponse({
          id_token: jwt({ chatgpt_account_id: 'acct-123' }),
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        });
      }
      return jsonResponse({ error: 'unexpected request' }, 500);
    });
    const onDeviceCode = vi.fn();
    const toolkit = new OpenAICodexOAuthToolkit({
      homeDir: '/tmp/hakimi-openai-oauth',
      storage,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1_000,
      userAgent: 'hakimi/0.0.0-test',
    });

    await toolkit.login({ onDeviceCode });

    expect(onDeviceCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://auth.openai.com/codex/device',
      }),
    );
    expect(storage.tokens.get('openai-codex')).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 4_600,
      accountId: 'acct-123',
    });

    const provider = toolkit.tokenProvider({
      storage: 'file',
      key: OPENAI_CODEX_OAUTH_KEY,
    });
    await expect(provider.getRequestAuth?.()).resolves.toEqual({
      apiKey: 'access-token',
      headers: {
        'ChatGPT-Account-Id': 'acct-123',
        originator: 'hakimi',
        'User-Agent': 'hakimi/0.0.0-test',
      },
    });
    const deviceRequestBody = requests[0]?.init?.body;
    if (typeof deviceRequestBody !== 'string') {
      throw new TypeError('expected the device authorization body to be a JSON string');
    }
    expect(JSON.parse(deviceRequestBody)).toEqual({
      client_id: expect.any(String),
    });
    expect(requests[2]?.init?.body).toContain('grant_type=authorization_code');
    expect(requests[2]?.init?.body).toContain('code_verifier=code-verifier');
  });

  it('coalesces concurrent refreshes and preserves the account id when refresh omits it', async () => {
    const storage = new MemoryTokenStorage();
    storage.tokens.set('openai-codex', {
      accessToken: 'expired-access',
      refreshToken: 'refresh-once',
      expiresAt: 1,
      expiresIn: 3600,
      scope: 'openid',
      tokenType: 'Bearer',
      accountId: 'acct-existing',
    });
    let refreshCalls = 0;
    const fetchImpl = vi.fn(async () => {
      refreshCalls += 1;
      await Promise.resolve();
      return jsonResponse({
        id_token: 'no-account-claims',
        access_token: 'fresh-access',
        refresh_token: 'fresh-refresh',
        expires_in: 3600,
      });
    });
    const toolkit = new OpenAICodexOAuthToolkit({
      homeDir: '/tmp/hakimi-openai-oauth',
      storage,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 10_000,
      userAgent: 'hakimi/test',
    });
    const provider = toolkit.tokenProvider();

    const [first, second] = await Promise.all([
      provider.getRequestAuth?.(),
      provider.getRequestAuth?.(),
    ]);

    expect(refreshCalls).toBe(1);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      apiKey: 'fresh-access',
      headers: { 'ChatGPT-Account-Id': 'acct-existing' },
    });
  });
});

describe('OpenAI Codex OAuth diagnostics', () => {
  it('surfaces a safe, actionable region rejection from the device endpoint', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 'unsupported_country_region_territory',
            message: 'Country, region, or territory not supported',
            type: 'request_forbidden',
          },
        },
        403,
      ),
    );

    const request = requestOpenAICodexDeviceAuthorization(
      {
        name: 'openai-codex',
        oauthHost: 'https://auth.openai.com',
        clientId: 'test-client',
      },
      { fetchImpl: fetchImpl as typeof fetch },
    );

    await expect(request).rejects.toBeInstanceOf(OAuthUnauthorizedError);
    await expect(request).rejects.toThrow(
      /unsupported_country_region_territory.*HTTP_PROXY.*HTTPS_PROXY.*NO_PROXY/i,
    );
  });
});

describe('OpenAI Codex managed config', () => {
  it('provisions selectable GPT models and removes only its managed entries', () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        keep: { type: 'kimi', baseUrl: 'https://keep.example.test' },
      },
      models: {
        'keep/model': {
          provider: 'keep',
          model: 'model',
          maxContextSize: 1000,
        },
      },
      defaultModel: 'keep/model',
    };

    const result = applyOpenAICodexConfig(config);

    expect(result.providerName).toBe(OPENAI_CODEX_PROVIDER_NAME);
    expect(config.providers[OPENAI_CODEX_PROVIDER_NAME]).toMatchObject({
      type: 'openai_responses',
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      generationKwargs: {
        parallel_tool_calls: true,
        tool_choice: 'auto',
        include: ['reasoning.encrypted_content'],
      },
      oauth: {
        storage: 'file',
        key: OPENAI_CODEX_OAUTH_KEY,
        oauthHost: 'https://auth.openai.com',
      },
    });
    expect(config.models?.['openai-codex/gpt-5.6-sol']).toMatchObject({
      provider: OPENAI_CODEX_PROVIDER_NAME,
      model: 'gpt-5.6-sol',
      maxContextSize: 500_000,
      maxInputSize: 372_000,
      capabilities: ['thinking', 'always_thinking', 'tool_use', 'image_in'],
      supportEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
      defaultEffort: 'medium',
    });
    expect(config.models?.['openai-codex/gpt-5.6-terra']).toMatchObject({
      supportEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
    });
    expect(config.models?.['openai-codex/gpt-5.6-luna']).toMatchObject({
      maxContextSize: 500_000,
      maxInputSize: 372_000,
      supportEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    });
    expect(result.models).toEqual([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ]);
    expect(config.models?.['keep/model']).toBeDefined();
    expect(config.defaultModel).toBe('openai-codex/gpt-5.6-sol');

    removeOpenAICodexConfig(config);

    expect(config.providers[OPENAI_CODEX_PROVIDER_NAME]).toBeUndefined();
    expect(config.models?.['openai-codex/gpt-5.6-sol']).toBeUndefined();
    expect(config.models?.['keep/model']).toBeDefined();
    expect(config.defaultModel).toBeUndefined();
  });

  it('falls back to GPT-5.6 Sol when a preserved Codex default was removed', () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        [OPENAI_CODEX_PROVIDER_NAME]: {
          type: 'openai_responses',
          baseUrl: 'https://chatgpt.com/backend-api/codex',
        },
      },
      models: {
        'openai-codex/gpt-5.5': {
          provider: OPENAI_CODEX_PROVIDER_NAME,
          model: 'gpt-5.5',
          maxContextSize: 272_000,
        },
      },
      defaultModel: 'openai-codex/gpt-5.5',
    };

    applyOpenAICodexConfig(config, { preserveDefaultModel: true });

    expect(config.defaultModel).toBe('openai-codex/gpt-5.6-sol');
  });

  it('preserves an unrelated default model when removing the managed provider', () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        [OPENAI_CODEX_PROVIDER_NAME]: {
          type: 'openai_responses',
          baseUrl: 'https://chatgpt.com/backend-api/codex',
        },
      },
      models: {
        'openai-codex/gpt-5.4': {
          provider: OPENAI_CODEX_PROVIDER_NAME,
          model: 'gpt-5.4',
          maxContextSize: 1_050_000,
        },
      },
      defaultModel: 'builtin/default-model',
      thinking: { enabled: true },
    };

    removeOpenAICodexConfig(config);

    expect(config.defaultModel).toBe('builtin/default-model');
    expect(config.thinking).toEqual({ enabled: true });
  });
});

describe('officialCodexUsageUrl', () => {
  it('resolves exactly the official managed Codex base to the fixed usage URL', () => {
    expect(officialCodexUsageUrl('https://chatgpt.com/backend-api/codex')).toBe(
      OFFICIAL_CODEX_USAGE_URL,
    );
    expect(officialCodexUsageUrl('https://chatgpt.com/backend-api/codex/')).toBe(
      OFFICIAL_CODEX_USAGE_URL,
    );
  });

  it('is case-insensitive on the origin but strict on the path', () => {
    expect(officialCodexUsageUrl('https://CHATGPT.COM/backend-api/codex')).toBe(
      OFFICIAL_CODEX_USAGE_URL,
    );
    expect(officialCodexUsageUrl('https://chatgpt.com/BACKEND-API/codex')).toBeUndefined();
  });

  it('rejects other hosts, paths, and unparseable values', () => {
    expect(officialCodexUsageUrl('https://chatgpt.com/backend-api')).toBeUndefined();
    expect(officialCodexUsageUrl('https://chatgpt.com/backend-api/codex/wham/usage')).toBeUndefined();
    expect(officialCodexUsageUrl('https://proxy.example.com/backend-api/codex')).toBeUndefined();
    expect(officialCodexUsageUrl('https://api.openai.com/v1')).toBeUndefined();
    expect(officialCodexUsageUrl('not a url')).toBeUndefined();
    expect(officialCodexUsageUrl(undefined)).toBeUndefined();
    expect(officialCodexUsageUrl('')).toBeUndefined();
  });
});

describe('parseCodexUsagePayload', () => {
  const EPOCH_ISO = new Date(1_780_000_000 * 1000).toISOString();

  it('normalizes root and nested additional rate-limit windows into percent rows', () => {
    const parsed = parseCodexUsagePayload({
      plan_type: 'plus',
      rate_limit: {
        primary_window: {
          used_percent: 17,
          limit_window_seconds: 86_400,
          reset_after_seconds: 12_345,
          reset_at: 1_780_000_000,
        },
        secondary_window: {
          used_percent: 42.6,
          limit_window_seconds: 604_800,
          reset_after_seconds: 55,
          reset_at: 1_780_000_000,
        },
      },
      additional_rate_limits: [
        {
          limit_name: 'Codex Other',
          metered_feature: 'codex_other',
          rate_limit: {
            primary_window: {
              used_percent: 100,
              limit_window_seconds: 3600,
              reset_at: 1_780_000_000,
            },
            secondary_window: {
              used_percent: 50,
              limit_window_seconds: 300,
              reset_at: 1_780_000_000,
            },
          },
        },
        {
          limit_name: '',
          metered_feature: 'codex_fallback',
          rate_limit: {
            primary_window: {
              used_percent: 133.7,
              limit_window_seconds: 300,
              reset_at: 1_780_000_000,
            },
          },
        },
      ],
    });
    expect(parsed.summary).toEqual({
      name: 'Primary window',
      used: 17,
      limit: 100,
      window: { duration: 1, unit: 'day' },
      resetAt: EPOCH_ISO,
    });
    expect(parsed.limits).toEqual([
      {
        name: 'Secondary window',
        used: 43,
        limit: 100,
        window: { duration: 1, unit: 'week' },
        resetAt: EPOCH_ISO,
      },
      {
        name: 'Codex Other',
        used: 100,
        limit: 100,
        window: { duration: 1, unit: 'hour' },
        resetAt: EPOCH_ISO,
      },
      {
        name: 'Codex Other secondary window',
        used: 50,
        limit: 100,
        window: { duration: 5, unit: 'minute' },
        resetAt: EPOCH_ISO,
      },
      // Empty limit_name falls back to metered_feature; over-limit percent clamps.
      {
        name: 'codex_fallback',
        used: 100,
        limit: 100,
        window: { duration: 5, unit: 'minute' },
        resetAt: EPOCH_ISO,
      },
    ]);
    expect(parsed.extraUsage).toBeNull();
  });

  it('omits a window row without a numeric used_percent', () => {
    const parsed = parseCodexUsagePayload({
      rate_limit: {
        primary_window: { used_percent: 'n/a', reset_at: 1 },
        secondary_window: { used_percent: 5 },
      },
    });
    expect(parsed.summary).toBeNull();
    expect(parsed.limits).toEqual([
      { name: 'Secondary window', used: 5, limit: 100 },
    ]);
  });

  it('omits resetAt for extreme but finite reset_at instead of throwing', () => {
    // An epoch seconds value far outside the valid Date range must not blow
    // up `toISOString()`; the row survives without a reset time.
    const parsed = parseCodexUsagePayload({
      rate_limit: {
        primary_window: {
          used_percent: 17,
          limit_window_seconds: 86_400,
          reset_at: 1e300,
        },
        secondary_window: { used_percent: 5, reset_at: 8.64e15 + 1 },
      },
    });
    expect(parsed.summary).toEqual({
      name: 'Primary window',
      used: 17,
      limit: 100,
      window: { duration: 1, unit: 'day' },
      resetAt: undefined,
    });
    expect(parsed.limits[0]).toMatchObject({ name: 'Secondary window', used: 5, limit: 100 });
    expect(parsed.limits[0]?.resetAt).toBeUndefined();
  });

  it('returns empty when payload or rate_limit is not an object', () => {
    expect(parseCodexUsagePayload(null)).toEqual({ summary: null, limits: [], extraUsage: null });
    expect(parseCodexUsagePayload('nope')).toEqual({ summary: null, limits: [], extraUsage: null });
    expect(parseCodexUsagePayload({})).toEqual({ summary: null, limits: [], extraUsage: null });
  });
});

describe('fetchCodexUsage', () => {
  it('sends the Bearer access token plus the request-auth headers to the pinned URL', async () => {
    const fetchMock = vi.fn(
      async () =>
        jsonResponse({
          plan_type: 'plus',
          rate_limit: {
            primary_window: { used_percent: 17, limit_window_seconds: 86_400, reset_at: 1_780_000_000 },
          },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCodexUsage({
      apiKey: 'codex-access-token',
      headers: {
        'ChatGPT-Account-Id': 'acct-123',
        'User-Agent': 'hakimi',
        originator: 'hakimi',
        // Provider-supplied headers must never replace the credential boundary.
        Authorization: 'Bearer wrong-token',
        Accept: 'text/plain',
      },
    });

    expect(result.kind).toBe('ok');
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    const init = calls[0]?.[1] ?? {};
    const headers = new Headers((init.headers ?? {}) as Record<string, string>);
    expect(calls[0]?.[0]).toBe(OFFICIAL_CODEX_USAGE_URL);
    expect(init.redirect).toBe('error');
    expect(headers.get('authorization')).toBe('Bearer codex-access-token');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('chatgpt-account-id')).toBe('acct-123');
    expect(headers.get('user-agent')).toBe('hakimi');
    expect(headers.get('originator')).toBe('hakimi');
  });

  it('never accepts a caller-supplied destination: the pinned URL is the only outbound', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await fetchCodexUsage({ apiKey: 'codex-access-token' });

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(OFFICIAL_CODEX_USAGE_URL);
  });

  it('redacts the access token from HTTP error bodies that echo it back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'invalid token codex-access-token' }, 401)),
    );

    const result = await fetchCodexUsage({ apiKey: 'codex-access-token' });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.status).toBe(401);
    expect(result.message).toBe('invalid token [redacted]');
    expect(result.message).not.toContain('codex-access-token');
  });

  it('surfaces HTTP 404 with a provider-specific hint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const result = await fetchCodexUsage({ apiKey: 'codex-404-token' });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.status).toBe(404);
    expect(result.message).toBe('Usage endpoint not available for OpenAI Codex.');
    expect(result.message).not.toContain('codex-404-token');
  });

  it('redacts the access token from network failure messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed for codex-access-token');
      }),
    );

    const result = await fetchCodexUsage({ apiKey: 'codex-access-token' });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toBe('Failed to fetch usage: fetch failed for [redacted]');
    expect(result.message).not.toContain('codex-access-token');
  });

  it('does not issue a request when the caller signal is already aborted', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const aborted = new AbortController();
    aborted.abort();

    const result = await fetchCodexUsage({ apiKey: 'codex-signal-token' }, {
      signal: aborted.signal,
    });

    expect(result).toEqual({ kind: 'error', message: 'Usage query cancelled.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
