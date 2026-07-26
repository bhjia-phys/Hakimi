import { describe, expect, it, vi } from 'vitest';

import {
  applyOpenAICodexConfig,
  extractOpenAICodexAccountId,
  OPENAI_CODEX_OAUTH_KEY,
  OPENAI_CODEX_PROVIDER_NAME,
  OAuthUnauthorizedError,
  OpenAICodexOAuthToolkit,
  removeOpenAICodexConfig,
  requestOpenAICodexDeviceAuthorization,
  type ManagedKimiConfigShape,
  type TokenInfo,
  type TokenStorage,
} from '../src';

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
    expect(config.models?.['openai-codex/gpt-5.5']).toMatchObject({
      provider: OPENAI_CODEX_PROVIDER_NAME,
      model: 'gpt-5.5',
      maxContextSize: 272_000,
      maxInputSize: 272_000,
      capabilities: ['thinking', 'always_thinking', 'tool_use', 'image_in'],
      supportEfforts: ['low', 'medium', 'high', 'xhigh'],
      defaultEffort: 'medium',
    });
    expect(config.models?.['openai-codex/gpt-5.6-sol']).toBeUndefined();
    expect(config.models?.['openai-codex/gpt-5.2']).toBeDefined();
    expect(config.models?.['openai-codex/gpt-5.4']).toBeDefined();
    expect(config.models?.['openai-codex/gpt-5.4-mini']).toBeDefined();
    expect(config.models?.['keep/model']).toBeDefined();
    expect(config.defaultModel).toBe('openai-codex/gpt-5.5');

    removeOpenAICodexConfig(config);

    expect(config.providers[OPENAI_CODEX_PROVIDER_NAME]).toBeUndefined();
    expect(config.models?.['openai-codex/gpt-5.5']).toBeUndefined();
    expect(config.models?.['keep/model']).toBeDefined();
    expect(config.defaultModel).toBeUndefined();
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
