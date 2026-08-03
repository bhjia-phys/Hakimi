/**
 * Scenario: the v2 model OAuth adapter gates the experimental ChatGPT provider
 * and forwards its provider-specific request authentication when enabled.
 * Responsibilities: cover the adapter's public request-auth contract only.
 * Wiring: use an in-memory OAuth service and flag service; no network or disk.
 * Run: pnpm exec vitest run packages/agent-core-v2/test/app/kosongConfig/oauthTokenAdapter.test.ts
 */

import { describe, expect, it, vi } from 'vitest';
import {
  OPENAI_CODEX_OAUTH_KEY,
  OPENAI_CODEX_PROVIDER_NAME,
} from '@moonshot-ai/kimi-code-oauth';

import type { IOAuthService } from '#/app/auth/auth';
import { ModelOAuthTokenAdapter } from '#/app/kosongConfig/oauthTokenAdapter';

import { stubFlag } from '../flag/stubs';

const oauthRef = { storage: 'file', key: OPENAI_CODEX_OAUTH_KEY } as const;

function oauthServiceWithRequestAuth(): IOAuthService {
  return {
    resolveTokenProvider: vi.fn(() => ({
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      getRequestAuth: vi.fn().mockResolvedValue({
        apiKey: 'access-token',
        headers: {
          'ChatGPT-Account-Id': 'account-123',
          originator: 'hakimi',
        },
      }),
    })),
  } as unknown as IOAuthService;
}

describe('ModelOAuthTokenAdapter', () => {
  it('rejects ChatGPT request auth while the experiment is disabled', async () => {
    const adapter = new ModelOAuthTokenAdapter(oauthServiceWithRequestAuth(), stubFlag(false));

    await expect(adapter.getRequestAuth(OPENAI_CODEX_PROVIDER_NAME, oauthRef)).rejects.toThrow(
      /experimental.*\/experiments/i,
    );
  });

  it('returns ChatGPT account routing headers when the experiment is enabled', async () => {
    const adapter = new ModelOAuthTokenAdapter(oauthServiceWithRequestAuth(), stubFlag(true));

    await expect(
      adapter.getRequestAuth(OPENAI_CODEX_PROVIDER_NAME, oauthRef),
    ).resolves.toEqual({
      apiKey: 'access-token',
      headers: {
        'ChatGPT-Account-Id': 'account-123',
        originator: 'hakimi',
      },
    });
  });
});
