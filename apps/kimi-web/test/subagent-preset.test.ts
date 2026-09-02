import { computed, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import type {
  AppConfig,
  AutoSubagentPresetCandidateScore,
  AutoSubagentPresetStatus,
} from '../src/api/types';
import { useModelProviderState } from '../src/composables/client/useModelProviderState';
import type { ExtendedState } from '../src/composables/useKimiWebClient';
import { i18n } from '../src/i18n';
import {
  autoSubagentPresetEnabled,
  autoSubagentPresetFlagOverridden,
  autoSubagentPresetPatch,
  autoSubagentPresetSupported,
  formatSubagentPresetScore,
  mainRouteForPreset,
  subagentPresetCandidateBreakdown,
  subagentPresetCandidateSummary,
  subagentPresetCandidatesOrder,
  subagentPresetCandidatesPatch,
  subagentPresetCurrentEvaluation,
  subagentPresetLabel,
  subagentPresetChangedLabel,
  subagentPresetManualLock,
  subagentPresetReasonLabel,
  subagentPresetRemainingLabel,
  subagentPresetResumeAutoPatch,
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

describe('Web subagent preset routes', () => {
  it('exposes the actual selected main route for the summary and runtime application', () => {
    expect(mainRouteForPreset(config, 'deep')).toEqual({
      model: 'acme/main',
      thinkingEffort: 'high',
    });
    expect(mainRouteForPreset(config, '')).toBeUndefined();
  });
});

describe('automatic preset setting', () => {
  const enabledConfig: AppConfig = {
    ...config,
    experimental: { auto_subagent_preset: false },
    subagent: { ...config.subagent, autoPreset: { enabled: true } },
  };

  it('reports the runtime as enabled only when both effective gates are on', () => {
    expect(autoSubagentPresetEnabled(enabledConfig, { auto_subagent_preset: true })).toBe(true);
    expect(autoSubagentPresetEnabled(enabledConfig, { auto_subagent_preset: false })).toBe(false);
    expect(
      autoSubagentPresetEnabled(
        { ...enabledConfig, subagent: { ...enabledConfig.subagent, autoPreset: { enabled: false } } },
        { auto_subagent_preset: true },
      ),
    ).toBe(false);
  });

  it('detects support from the effective flag catalog, even when the flag is off', () => {
    expect(autoSubagentPresetSupported({ auto_subagent_preset: false })).toBe(true);
    expect(autoSubagentPresetSupported({ auto_subagent_preset: true })).toBe(true);
    expect(autoSubagentPresetSupported({})).toBe(false);
  });

  it('uses effective meta flags and reports environment overrides in either direction', () => {
    expect(enabledConfig.experimental?.['auto_subagent_preset']).toBe(false);
    expect(autoSubagentPresetEnabled(enabledConfig, { auto_subagent_preset: true })).toBe(true);
    expect(
      autoSubagentPresetFlagOverridden(enabledConfig, { auto_subagent_preset: true }),
    ).toBe(true);
    expect(
      autoSubagentPresetFlagOverridden(
        { ...enabledConfig, experimental: { auto_subagent_preset: true } },
        { auto_subagent_preset: false },
      ),
    ).toBe(true);
    expect(autoSubagentPresetFlagOverridden(enabledConfig, {})).toBe(false);
  });

  it('patches only the two gates and puts the fail-closed domain first', () => {
    const enabled = autoSubagentPresetPatch(true);
    expect(Object.keys(enabled)).toEqual(['subagent', 'experimental']);
    expect(enabled).toEqual({
      subagent: { autoPreset: { enabled: true } },
      experimental: { auto_subagent_preset: true },
    });
    expect(autoSubagentPresetPatch(false)).toEqual({
      subagent: { autoPreset: { enabled: false } },
      experimental: { auto_subagent_preset: false },
    });
  });
});

describe('manual lock and resume-auto', () => {
  it('reports the persistent manual lock from autoPreset.manualLock', () => {
    const locked = { ...config, subagent: { ...config.subagent, autoPreset: { manualLock: true } } };
    expect(subagentPresetManualLock(locked)).toBe(true);
    expect(subagentPresetManualLock(config)).toBe(false);
    expect(subagentPresetManualLock({ ...config, subagent: undefined })).toBe(false);
    expect(subagentPresetManualLock(null)).toBe(false);
    expect(subagentPresetManualLock(undefined)).toBe(false);
  });

  it('resume-auto clears only manualLock and never touches the preset or the gates', () => {
    expect(subagentPresetResumeAutoPatch()).toEqual({
      subagent: { autoPreset: { manualLock: false } },
    });
    // Exactly one target field on the wire: no preset, no enabled flags, no
    // experimental gate — resuming must not re-route or re-enable anything.
    expect(Object.keys(subagentPresetResumeAutoPatch())).toEqual(['subagent']);
  });
});

describe('automatic-preset candidate priority', () => {
  it('falls back to declaration order only when candidates is absent', () => {
    expect(subagentPresetCandidatesOrder(config, ['fast', 'deep', 'balanced'])).toEqual([
      'fast',
      'deep',
      'balanced',
    ]);
    expect(
      subagentPresetCandidatesOrder(
        { ...config, subagent: { ...config.subagent, autoPreset: { candidates: [] } } },
        ['fast', 'deep'],
      ),
    ).toEqual([]);
    expect(subagentPresetCandidatesOrder(null, ['fast'])).toEqual(['fast']);
  });

  it('treats a configured subset as authoritative and never appends missing presets', () => {
    const ordered: AppConfig = {
      ...config,
      subagent: {
        ...config.subagent,
        autoPreset: { candidates: ['balanced'] },
      },
    };
    expect(subagentPresetCandidatesOrder(ordered, ['fast', 'deep', 'balanced'])).toEqual([
      'balanced',
    ]);
    expect(subagentPresetCandidatesOrder(ordered, ['fast', 'deep'])).toEqual(['balanced']);
  });

  it('keeps the configured order as-is, including names no longer declared', () => {
    const stale: AppConfig = {
      ...config,
      subagent: {
        ...config.subagent,
        autoPreset: { candidates: ['deep', 'retired', 'fast'] },
      },
    };
    expect(subagentPresetCandidatesOrder(stale, ['fast', 'deep'])).toEqual([
      'deep',
      'retired',
      'fast',
    ]);
  });

  it('returns a copy so callers may reorder without mutating the config', () => {
    const withCandidates: AppConfig = {
      ...config,
      subagent: { ...config.subagent, autoPreset: { candidates: ['fast', 'deep'] } },
    };
    const order = subagentPresetCandidatesOrder(withCandidates, ['deep', 'fast']);
    order.reverse();
    expect(withCandidates.subagent?.autoPreset?.candidates).toEqual(['fast', 'deep']);
  });

  it('persists a priority list targeting only the candidates field', () => {
    expect(subagentPresetCandidatesPatch(['deep', 'fast'])).toEqual({
      subagent: { autoPreset: { candidates: ['deep', 'fast'] } },
    });
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

describe('subagent-preset controls and status separators', () => {
  // Real i18n singleton — resolve labels against both shipped locales.
  const t = (key: string, named?: Record<string, unknown>): string =>
    String(i18n.global.t(key, named));

  function withLocale(locale: 'en' | 'zh', run: () => void): void {
    const prev = i18n.global.locale.value;
    i18n.global.locale.value = locale;
    try {
      run();
    } finally {
      i18n.global.locale.value = prev;
    }
  }

  const candidate: AutoSubagentPresetCandidateScore = {
    preset: 'balanced',
    provider: 'provider-a',
    availability: 'healthy',
    selectable: true,
    score: 76.25,
    quotaRemainingPercent: 80,
    contributions: {
      quotaRemaining: 80,
      priorityBonus: 8,
      resetBonus: 1,
      routeFitBonus: 2,
      tokenPenalty: 3,
      reliabilityPenalty: 7.5,
      latencyPenalty: 4.25,
    },
    localEvidence: {
      scope: 'profile',
      sampleCount: 8,
      failureCount: 1,
      adjustedFailureRate: 0.15,
      tokenCount: 42_000,
      averageFirstTokenLatencyMs: 320,
      firstTokenLatencySampleCount: 9,
      llmRequestCount: 12,
    },
  };

  const switchedStatus: AutoSubagentPresetStatus = {
    evaluatedAt: 1_750_000_000_000,
    route: 'agent',
    reasonCode: 'higher_score',
    currentPreset: 'balanced',
    selectedPreset: 'kimi-heavy',
    activatedPreset: 'kimi-heavy',
    currentScore: 76.25,
    selectedScore: 91,
    candidates: [candidate, { ...candidate, preset: 'kimi-heavy', score: 91 }],
    policy: {
      quotaFloorPercent: 10,
      switchMarginPercent: 5,
      localUsageWindowMs: 86_400_000,
      localUsageWeightPercent: 10,
      priorityWeightPercent: 20,
      reliabilityWeightPercent: 15,
      latencyWeightPercent: 10,
      switchCooldownMs: 30_000,
      circuitBreakerFailureThreshold: 3,
      circuitBreakerCooldownMs: 60_000,
    },
  };

  it('derives the actual current preset score instead of reusing the pre-evaluation score', () => {
    expect(subagentPresetCurrentEvaluation(switchedStatus, 'kimi-heavy')).toEqual({
      preset: 'kimi-heavy',
      score: 91,
    });
    expect(subagentPresetCurrentEvaluation(switchedStatus, undefined)).toEqual({
      preset: 'kimi-heavy',
      score: 91,
    });
    expect(subagentPresetCurrentEvaluation(switchedStatus, 'balanced')).toEqual({
      preset: 'kimi-heavy',
      score: 91,
    });
    expect(
      subagentPresetCurrentEvaluation(
        { ...switchedStatus, activatedPreset: undefined },
        'balanced',
      ),
    ).toEqual({ preset: 'balanced', score: 76.25 });
  });

  it('formats the header control label in en and zh', () => {
    withLocale('en', () => {
      expect(subagentPresetLabel('balanced', t)).toBe('Preset: balanced');
    });
    withLocale('zh', () => {
      expect(subagentPresetLabel('balanced', t)).toBe('Preset：balanced');
    });
  });

  it('shows base routing when no preset is configured and normalizes whitespace', () => {
    withLocale('en', () => {
      expect(subagentPresetLabel(undefined, t)).toBe('Preset: Base routing');
      expect(subagentPresetLabel('', t)).toBe('Preset: Base routing');
      expect(subagentPresetLabel('   ', t)).toBe('Preset: Base routing');
      expect(subagentPresetLabel(' balanced ', t)).toBe('Preset: balanced');
    });
    withLocale('zh', () => {
      expect(subagentPresetLabel(undefined, t)).toBe('Preset：基础路由');
    });
  });

  it('labels status.currentPreset as the pre-evaluation preset in both locales', () => {
    withLocale('en', () => {
      expect(
        t('settings.smartRoutingCurrentSelection', {
          previous: 'balanced',
          selected: 'kimi-heavy',
        }),
      ).toBe('Before evaluation balanced · selected kimi-heavy');
    });
    withLocale('zh', () => {
      expect(
        t('settings.smartRoutingCurrentSelection', {
          previous: 'balanced',
          selected: 'kimi-heavy',
        }),
      ).toBe('评估前 balanced · 选择 kimi-heavy');
    });
  });

  it('renders the status separator with from → to in en and zh', () => {
    withLocale('en', () => {
      expect(subagentPresetChangedLabel({ from: 'balanced', to: 'kimi-heavy' }, t)).toBe(
        'Subagent preset switched automatically: balanced → kimi-heavy',
      );
    });
    withLocale('zh', () => {
      expect(subagentPresetChangedLabel({ from: 'balanced', to: 'kimi-heavy' }, t)).toBe(
        'Subagent 预设已自动切换：balanced → kimi-heavy',
      );
    });
  });

  it('falls back to the new-preset-only label when from is absent or a no-op', () => {
    withLocale('en', () => {
      expect(subagentPresetChangedLabel({ to: 'balanced' }, t)).toBe(
        'Subagent preset switched automatically: balanced',
      );
      expect(subagentPresetChangedLabel({ from: 'balanced', to: 'balanced' }, t)).toBe(
        'Subagent preset switched automatically: balanced',
      );
      expect(subagentPresetChangedLabel(undefined, t)).toBe(
        'Subagent preset switched automatically: ',
      );
    });
    withLocale('zh', () => {
      expect(subagentPresetChangedLabel({ to: 'balanced' }, t)).toBe(
        'Subagent 预设已自动切换：balanced',
      );
    });
  });

  it('localizes the manual-lock badge and resume-auto action in en and zh', () => {
    withLocale('en', () => {
      expect(t('header.subagentPresetLocked')).toBe('Manual lock');
      expect(t('header.subagentPresetResumeAuto')).toBe('Resume automatic switching');
      expect(t('settings.presetManualLocked')).toBe('Locked');
      expect(t('settings.presetResumeAuto')).toBe('Resume automatic switching');
    });
    withLocale('zh', () => {
      expect(t('header.subagentPresetLocked')).toBe('手动锁定');
      expect(t('header.subagentPresetResumeAuto')).toBe('恢复自动切换');
      expect(t('settings.presetManualLocked')).toBe('已锁定');
      expect(t('settings.presetResumeAuto')).toBe('恢复自动切换');
    });
  });

  it('localizes the candidate-priority editor copy in en and zh', () => {
    withLocale('en', () => {
      expect(t('settings.presetCandidates')).toBe('Automatic switch priority');
      expect(t('settings.presetCandidatesAddPlaceholder')).toBe('Add preset…');
      expect(t('settings.presetCandidatesMoveUp')).toBe('Move up');
      expect(t('settings.presetCandidatesMoveDown')).toBe('Move down');
      expect(t('settings.presetCandidatesRemove')).toBe('Remove from priority list');
    });
    withLocale('zh', () => {
      expect(t('settings.presetCandidates')).toBe('自动切换候选优先级');
      expect(t('settings.presetCandidatesAddPlaceholder')).toBe('添加预设…');
      expect(t('settings.presetCandidatesMoveUp')).toBe('上移');
      expect(t('settings.presetCandidatesMoveDown')).toBe('下移');
      expect(t('settings.presetCandidatesRemove')).toBe('从优先级列表中移除');
    });
  });

  it('localizes structured reasons in diagnostics and transcript markers', () => {
    withLocale('en', () => {
      expect(subagentPresetReasonLabel('current_unhealthy', t)).toBe(
        'The current preset is unhealthy or low on quota',
      );
      expect(
        subagentPresetChangedLabel(
          {
            from: 'balanced',
            to: 'kimi-heavy',
            reasonCode: 'higher_score',
            profileName: 'reviewer',
          },
          t,
        ),
      ).toBe(
        'Subagent preset switched automatically: balanced → kimi-heavy · Another preset scored clearly higher for reviewer',
      );
    });
    withLocale('zh', () => {
      expect(subagentPresetReasonLabel('circuit_breaker_escape', t)).toBe(
        '当前 Preset 已触发熔断',
      );
      expect(
        subagentPresetChangedLabel(
          {
            from: 'balanced',
            to: 'kimi-heavy',
            reasonCode: 'higher_score',
            profileName: 'reviewer',
          },
          t,
        ),
      ).toBe(
        'Subagent 预设已自动切换：balanced → kimi-heavy · reviewer 角色：另一 Preset 的综合得分明显更高',
      );
    });
  });

  it('formats candidate totals, strongest contributions, and missing evidence', () => {
    withLocale('en', () => {
      expect(formatSubagentPresetScore(candidate.score, t)).toBe('Score 76.3');
      expect(formatSubagentPresetScore(undefined, t)).toBe('Score —');
      expect(subagentPresetCandidateSummary(candidate, 1000, t)).toBe(
        'Quota +80.0 · Reliability −7.5',
      );
      expect(subagentPresetCandidateBreakdown(candidate, t)).toContain(
        'Quota +80.0 · Priority +8.0 · Reset +1.0',
      );
      expect(
        subagentPresetCandidateSummary(
          { ...candidate, localEvidence: { ...candidate.localEvidence, scope: 'none' } },
          1000,
          t,
        ),
      ).toBe('Quota +80.0 · Reliability −7.5 · No local history');
    });
    withLocale('zh', () => {
      expect(subagentPresetCandidateSummary(candidate, 1000, t)).toBe(
        '额度 +80.0 · 可靠性 −7.5',
      );
    });
  });

  it('derives cooldown and circuit-breaker countdowns from an explicit clock input', () => {
    withLocale('en', () => {
      expect(subagentPresetRemainingLabel(61_000, 1_000, 'cooldown', t)).toBe(
        'Switch cooldown · 1m remaining',
      );
      expect(subagentPresetRemainingLabel(3_000, 1_000, 'circuit', t)).toBe(
        'Circuit breaker · 2s remaining',
      );
      expect(subagentPresetRemainingLabel(1_000, 1_000, 'cooldown', t)).toBeUndefined();
      expect(
        subagentPresetCandidateSummary(
          {
            ...candidate,
            availability: 'circuit_open',
            selectable: false,
            circuitBreakerOpenUntil: 3_000,
          },
          1_000,
          t,
        ),
      ).toBe('Circuit breaker · 2s remaining');
    });
  });
});
