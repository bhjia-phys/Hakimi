import {
  applyDeepSeekProviderModels,
  DeepSeekModelsApiError,
  fetchDeepSeekModels,
} from '../src/deepseek';
import type { ManagedKimiConfigShape } from '../src/managed-kimi-code';
import { describe, expect, it, vi } from 'vitest';

describe('DeepSeek model catalog', () => {
  it('fetches the official model list with bearer authentication and vision metadata', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      expect(url).toBe('https://api.deepseek.example/models');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-deepseek');
      return new Response(
        JSON.stringify({
          data: [
            { id: 'deepseek-v4-pro' },
            { id: 'deepseek-v4-flash-vision-exp' },
            { id: 'deepseek-v4-flash-vision-exp' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const models = await fetchDeepSeekModels({
      apiKey: 'sk-deepseek',
      baseUrl: 'https://api.deepseek.example/',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(models.map((model) => model.id)).toEqual([
      'deepseek-v4-pro',
      'deepseek-v4-flash-vision-exp',
    ]);
    expect(models[1]).toMatchObject({
      maxContextSize: 1_000_000,
      maxOutputSize: 384_000,
      capabilities: ['image_in', 'thinking', 'tool_use'],
      displayName: 'DeepSeek V4 Flash Vision Exp',
    });
  });

  it('surfaces a typed API error with the provider response message', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'invalid api key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const error = await fetchDeepSeekModels({
      apiKey: 'bad-key',
      fetchImpl: fetchImpl as typeof fetch,
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(DeepSeekModelsApiError);
    expect(error).toMatchObject({ status: 401 });
    expect((error as Error).message).toContain('invalid api key');
  });

  it('replaces generated aliases while preserving user aliases and overrides', () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        deepseek: {
          type: 'openai',
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'sk-deepseek',
          source: { kind: 'deepseek' },
        },
      },
      models: {
        'deepseek/stale': {
          provider: 'deepseek',
          model: 'stale',
          maxContextSize: 1,
        },
        custom: {
          provider: 'deepseek',
          model: 'private-model',
          maxContextSize: 2048,
        },
        'deepseek/vision': {
          provider: 'deepseek',
          model: 'deepseek-v4-flash-vision-exp',
          maxContextSize: 2048,
        },
        'deepseek/deepseek-v4-flash-vision-exp': {
          provider: 'deepseek',
          model: 'deepseek-v4-flash-vision-exp',
          maxContextSize: 1,
          overrides: { maxContextSize: 4096 },
        },
      },
    };

    applyDeepSeekProviderModels(config, 'deepseek', [
      {
        id: 'deepseek-v4-flash-vision-exp',
        maxContextSize: 1_000_000,
        maxOutputSize: 384_000,
        capabilities: ['image_in', 'thinking', 'tool_use'],
        displayName: 'DeepSeek V4 Flash Vision Exp',
      },
    ]);

    expect(config.models?.['deepseek/stale']).toBeUndefined();
    expect(config.models?.['custom']).toMatchObject({ model: 'private-model' });
    expect(config.models?.['deepseek/deepseek-v4-flash-vision-exp']).toMatchObject({
      maxContextSize: 1_000_000,
      maxOutputSize: 384_000,
      capabilities: ['image_in', 'thinking', 'tool_use'],
      overrides: { maxContextSize: 4096 },
    });
  });
});
