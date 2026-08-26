import { computed, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../src/api/types';
import { useModelProviderState } from '../src/composables/client/useModelProviderState';
import type { ExtendedState } from '../src/composables/useKimiWebClient';
import {
  configPatchForPreset,
  mainRouteForPreset,
  thinkingConfigForPreset,
} from '../src/lib/subagentPreset';

const apiMock = vi.hoisted(() => ({ listModels: vi.fn(), setConfig: vi.fn() }));

vi.mock('../src/api', () => ({
  getKimiWebApi: () => apiMock,
}));

const config: AppConfig = {
  providers: {},
  subagent: {
    preset: 'fast',
    agents: { coder: { model: 'base/coder' } },
    presets: {
      fast: { coder: { model: 'fast/coder' } },
      deep: {
        main: { model: 'acme/main', thinkingEffort: 'high' },
        coder: { model: 'acme/coder', thinkingEffort: 'high' },
      },
    },
  },
};

describe('Web subagent preset parity with CLI', () => {
  it('applies the selected main route and sends only a minimal subagent patch', () => {
    expect(configPatchForPreset(config, 'deep')).toEqual({
      subagent: { preset: 'deep' },
      defaultModel: 'acme/main',
      thinking: { enabled: true, effort: 'high' },
    });
  });

  it('clears only the active selector and keeps the current main defaults', () => {
    expect(configPatchForPreset(config, '')).toEqual({ subagent: { preset: '' } });
  });

  it.each([
    ['off', { enabled: false }],
    ['on', { enabled: true }],
    ['max', { enabled: true, effort: 'max' }],
  ] as const)('maps the %s main effort like CLI', (effort, expected) => {
    expect(thinkingConfigForPreset(effort)).toEqual(expected);
  });

  it('exposes the actual selected main route for the summary', () => {
    expect(mainRouteForPreset(config, 'deep')).toEqual({
      model: 'acme/main',
      thinkingEffort: 'high',
    });
    expect(mainRouteForPreset(config, '')).toBeUndefined();
  });
});

describe('preset main runtime application', () => {
  function createHarness(persistSessionProfile = vi.fn().mockResolvedValue(true)) {
    const state = {
      activeSessionId: 'sess_a',
      sessions: [
        { id: 'sess_a', model: 'old/a' },
        { id: 'sess_b', model: 'old/b' },
      ],
      defaultModel: 'old/a',
      thinking: 'high',
      thinkingBySession: { sess_a: 'high', sess_b: 'low' },
    } as unknown as ExtendedState;
    const updateSession = vi.fn(
      (
        id: string,
        update: (session: ExtendedState['sessions'][number]) => ExtendedState['sessions'][number],
      ) => {
        state.sessions = state.sessions.map((session) =>
          session.id === id ? update(session) : session,
        );
      },
    );
    const modelProvider = useModelProviderState(state, {
      pushOperationFailure: vi.fn(),
      refreshSessionStatus: vi.fn().mockResolvedValue(undefined),
      persistSessionProfile,
      activity: computed(() => 'idle'),
      updateSession,
      updateSessionMessages: vi.fn(),
    });
    return { state, modelProvider, persistSessionProfile };
  }

  it('updates one session profile without rewriting the exact global config patch', async () => {
    apiMock.setConfig.mockReset();
    const { state, modelProvider, persistSessionProfile } = createHarness();

    const applied = await modelProvider.applyPresetMainRoute({
      model: 'new/model',
      thinkingEffort: 'max',
    }, 'sess_a');

    expect(applied).toBe(true);
    expect(persistSessionProfile).toHaveBeenCalledWith(
      { model: 'new/model', thinking: 'max' },
      'sess_a',
    );
    expect(state.sessions[0]?.model).toBe('new/model');
    expect(state.thinking).toBe('max');
    expect(state.thinkingBySession).toEqual({ sess_a: 'max', sess_b: 'low' });
    expect(apiMock.setConfig).not.toHaveBeenCalled();
  });

  it('keeps preset thinking through a draft model catalog refresh', async () => {
    const { state, modelProvider, persistSessionProfile } = createHarness();
    state.activeSessionId = undefined;
    state.thinking = 'low';
    apiMock.listModels.mockResolvedValue([
      {
        id: 'new/draft',
        provider: 'acme',
        model: 'new/draft',
        maxContextSize: 128_000,
        capabilities: ['thinking'],
        supportEfforts: ['low', 'max'],
        defaultEffort: 'low',
      },
    ]);

    const applied = await modelProvider.applyPresetMainRoute({
      model: 'new/draft',
      thinkingEffort: 'max',
    });
    await modelProvider.loadModels();
    await nextTick();

    expect(applied).toBe(true);
    expect(modelProvider.draftModel.value).toBe('new/draft');
    expect(state.thinking).toBe('max');
    expect(persistSessionProfile).not.toHaveBeenCalled();
  });

  it('applies to the session captured before a slow global save', async () => {
    const { state, modelProvider, persistSessionProfile } = createHarness();
    state.activeSessionId = 'sess_b';
    state.thinking = 'low';

    await modelProvider.applyPresetMainRoute(
      { model: 'new/a', thinkingEffort: 'max' },
      'sess_a',
    );

    expect(persistSessionProfile).toHaveBeenCalledWith(
      { model: 'new/a', thinking: 'max' },
      'sess_a',
    );
    expect(state.sessions.map((session) => session.model)).toEqual(['new/a', 'old/b']);
    expect(state.thinkingBySession).toEqual({ sess_a: 'max', sess_b: 'low' });
    expect(state.thinking).toBe('low');
  });

  it('does not restore one session thinking into another after a failed request', async () => {
    let resolvePersist: ((value: boolean) => void) | undefined;
    const persist = vi.fn().mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolvePersist = resolve;
      }),
    );
    const { state, modelProvider } = createHarness(persist);

    const applying = modelProvider.applyPresetMainRoute(
      { model: 'new/a', thinkingEffort: 'max' },
      'sess_a',
    );
    state.activeSessionId = 'sess_b';
    state.thinking = 'low';
    resolvePersist?.(false);

    expect(await applying).toBe(false);
    expect(state.sessions.map((session) => session.model)).toEqual(['old/a', 'old/b']);
    expect(state.thinkingBySession).toEqual({ sess_a: 'high', sess_b: 'low' });
    expect(state.thinking).toBe('low');
  });

  it('does not let an older failed activation roll back a newer one', async () => {
    let resolveFirst: ((value: boolean) => void) | undefined;
    let resolveSecond: ((value: boolean) => void) | undefined;
    const persist = vi.fn()
      .mockImplementationOnce(
        () => new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockImplementationOnce(
        () => new Promise<boolean>((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const { state, modelProvider } = createHarness(persist);

    const first = modelProvider.applyPresetMainRoute(
      { model: 'first/a', thinkingEffort: 'max' },
      'sess_a',
    );
    const second = modelProvider.applyPresetMainRoute(
      { model: 'second/a', thinkingEffort: 'low' },
      'sess_a',
    );
    resolveFirst?.(false);
    expect(await first).toBe(false);
    expect(state.sessions[0]?.model).toBe('second/a');
    expect(state.thinkingBySession['sess_a']).toBe('low');

    resolveSecond?.(true);
    expect(await second).toBe(true);
  });
});
