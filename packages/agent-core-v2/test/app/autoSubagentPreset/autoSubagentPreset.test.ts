/**
 * Scenario: the App-scope `autoSubagentPreset` decider scores configured
 * `[subagent]` presets from quota/reset, local priority, route/model fit, token
 * use, and profile-aware reliability/latency evidence, then applies the quota
 * floor, score margin, switch cooldown, and provider circuit breaker.
 * Coverage includes deterministic score contributions, low-sample shrinkage,
 * profile fallback, reset timing, unknown evidence, weighted priority overtake,
 * cooldown and unhealthy escape, circuit recovery, status/event explanations,
 * retryable ledger hydration, quota-query deadlines, and the shared
 * manual/automatic activation boundary. Manual lock and concurrent human writes
 * remain absolute; failures keep the current preset and expose only structured,
 * sanitized evidence.
 * Wiring: the SUT is resolved by interface through `TestInstantiationService`
 * with a writable layered config stub, a flagged stub, a provider-aligned
 * model catalog, a programmable provider-usage service, and a fake run-usage
 * ledger with a live completion emitter.
 * Run: `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run
 * test/app/autoSubagentPreset/autoSubagentPreset.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { Emitter, type Event } from '#/_base/event';
import { DisposableStore } from '#/_base/di/lifecycle';
import { TestInstantiationService } from '#/_base/di/test';
import { ILogService } from '#/_base/log/log';
import { IHostClock } from '#/os/interface/hostClock';
import {
  ConfigTarget,
  type ConfigDiagnostic,
  type ConfigInspectValue,
  IConfigService,
  type ResolvedConfig,
} from '#/app/config/config';
import { IFlagService } from '#/app/flag/flag';
import { deepMerge } from '#/app/config/configPure';
import { IEventService } from '#/app/event/event';
import { IModelCatalog, type Model } from '#/kosong/model/catalog';
import { IProviderUsageService, type ProviderUsageResult } from '#/app/providerUsage/providerUsage';
import {
  type AgentRunUsageEntry,
  type AgentRunUsageFinishedRecord,
  type AgentRunUsageRecord,
  type AgentRunUsageStartedRecord,
  IAgentRunUsageService,
} from '#/app/agentRunUsage/agentRunUsage';
import {
  SUBAGENT_SECTION,
  resolveSubagentAutoPresetConfig,
  type SubagentAutoPresetConfig,
  type SubagentConfig,
  type SubagentRouteRequest,
} from '#/session/subagent/configSection';
import { AUTO_SUBAGENT_PRESET_FLAG_ID } from '#/session/subagent/flag';
import { ISubagentPresetActivationService } from '#/session/subagent/presetActivation';
import { SubagentPresetActivationService } from '#/session/subagent/presetActivationService';

import {
  AutoSubagentPresetService,
  providerQuotaEvidence,
  providerQuotaPercent,
} from '#/app/autoSubagentPreset/autoSubagentPresetService';
import {
  IAutoSubagentPresetService,
  SUBAGENT_PRESET_CHANGED_EVENT_TYPE,
  SUBAGENT_PRESET_EVALUATED_EVENT_TYPE,
} from '#/app/autoSubagentPreset/autoSubagentPreset';

const PRESETS: Record<string, Record<string, { model?: string; thinkingEffort?: string }>> = {
  balanced: { explore: { model: 'route/balanced', thinkingEffort: 'medium' } },
  'kimi-heavy': { explore: { model: 'route/kimi', thinkingEffort: 'high' } },
  'deepseek-heavy': { explore: { model: 'route/deepseek' } },
};

const REQUEST: SubagentRouteRequest = {
  route: 'agent',
  profileName: 'explore',
  caller: { modelAlias: 'caller-model', thinkingLevel: 'low' },
};

/** Shared evaluation context: every call is scoped to the same test session. */
const CTX = { sessionId: 'test-session' };

function subagentConfigWith(
  patch: Partial<Pick<SubagentConfig, 'timeoutMs' | 'preset' | 'presets'>> & {
    readonly autoPreset?: Partial<SubagentAutoPresetConfig>;
  } = {},
): SubagentConfig {
  const { autoPreset, ...rest } = patch;
  return {
    timeoutMs: 3_600_000,
    preset: 'balanced',
    autoPreset: { enabled: true, ...autoPreset } as SubagentAutoPresetConfig,
    presets: PRESETS as SubagentConfig['presets'],
    ...rest,
  };
}

function windowRow(used: number, limit: number): ProviderUsageResult {
  return {
    kind: 'ok',
    provider: 'provider',
    summary: null,
    limits: [{ used, limit }],
    extraUsage: null,
  };
}

function okResult(remainingPercent: number): ProviderUsageResult {
  return windowRow((100 - remainingPercent) / 100, 1);
}

/**
 * Layered config stub mirroring the real precedence (memory overrides user):
 * used to verify the decider writes `[subagent].preset` to the User layer and
 * syncs an existing print/headless memory overlay. One instance is shared by
 * the whole suite and mutated per test (`replace` / `set`), because the SUT
 * holds the injected reference for its lifetime.
 */
class LayeredConfigStub implements IConfigService {
  declare readonly _serviceBrand: undefined;
  readonly ready = Promise.resolve();
  onDidChangeConfiguration = (): { dispose: () => void } => ({ dispose: () => {} });
  onDidSectionChange = (): { dispose: () => void } => ({ dispose: () => {} });
  onDidChangeDiagnostics = (): { dispose: () => void } => ({ dispose: () => {} });
  failWrites = false;
  private readonly user = new Map<string, unknown>();

  constructor(initialUser: Record<string, unknown> = {}) {
    for (const [domain, value] of Object.entries(initialUser)) {
      this.user.set(domain, value);
    }
  }

  private readonly memory = new Map<string, unknown>();

  get<T = unknown>(domain: string): T {
    const userValue = this.user.get(domain);
    const memoryValue = this.memory.get(domain);
    if (memoryValue === undefined) return userValue as T;
    if (userValue === undefined) return memoryValue as T;
    if (isObject(userValue) && isObject(memoryValue)) {
      return { ...userValue, ...memoryValue } as T;
    }
    return memoryValue as T;
  }

  inspect<T = unknown>(domain: string): ConfigInspectValue<T> {
    return {
      value: this.get<T>(domain),
      defaultValue: undefined,
      userValue: this.user.get(domain) as T | undefined,
      memoryValue: this.memory.get(domain) as T | undefined,
    };
  }

  getAll(): ResolvedConfig {
    return Object.fromEntries(this.user) as ResolvedConfig;
  }

  async set(domain: string, patch: unknown, target: ConfigTarget = ConfigTarget.User): Promise<void> {
    if (this.failWrites) throw new Error('disk full');
    const layer = target === ConfigTarget.Memory ? this.memory : this.user;
    const previous = layer.get(domain);
    const value = deepMerge(previous, patch);
    layer.set(domain, value);
  }

  async replace(domain: string, value: unknown, target: ConfigTarget = ConfigTarget.User): Promise<void> {
    if (this.failWrites) throw new Error('disk full');
    const layer = target === ConfigTarget.Memory ? this.memory : this.user;
    if (value === undefined || value === null) {
      layer.delete(domain);
    } else {
      layer.set(domain, value);
    }
  }

  async replaceSections(sections: Readonly<Record<string, unknown>>): Promise<void> {
    for (const [domain, value] of Object.entries(sections)) {
      await this.replace(domain, value);
    }
  }

  reload(): Promise<void> {
    return Promise.resolve();
  }

  diagnostics(): readonly ConfigDiagnostic[] {
    return [];
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function modelCatalogFor(routes: Record<string, { provider: string }>): IModelCatalog {
  return {
    _serviceBrand: undefined,
    get: (id: string): Model => {
      const entry = routes[id];
      if (entry === undefined) throw new Error(`model ${id} not found`);
      return { providerName: entry.provider } as Model;
    },
    getRequester: () => {
      throw new Error('not used');
    },
    inspect: () => {
      throw new Error('not used');
    },
    ping: () => Promise.reject(new Error('not used')),
    findByName: () => [],
    listModels: () => Promise.resolve([]),
    listProviders: () => Promise.resolve([]),
    getProvider: () => Promise.reject(new Error('not used')),
    setDefaultModel: () => Promise.reject(new Error('not used')),
  } as unknown as IModelCatalog;
}

const ROUTES = {
  'route/balanced': { provider: 'provider-balanced' },
  'route/kimi': { provider: 'provider-kimi' },
  'route/deepseek': { provider: 'provider-deepseek' },
  'route/deepseek-plan': { provider: 'provider-deepseek-plan' },
  'route/other': { provider: 'provider-other' },
  'caller-model': { provider: 'provider-balanced' },
};

class FakeRunUsageService implements IAgentRunUsageService {
  declare readonly _serviceBrand: undefined;
  readonly onDidFinishRun: Event<AgentRunUsageEntry>;
  private readonly emitter = new Emitter<AgentRunUsageEntry>();
  entries: readonly AgentRunUsageEntry[] = [];
  readCalls = 0;
  readImpl: (() => Promise<readonly AgentRunUsageEntry[]>) | undefined;

  constructor() {
    this.onDidFinishRun = this.emitter.event;
  }

  appendStarted(): void {}
  appendFinished(): void {}

  async *iterate(): AsyncIterable<AgentRunUsageRecord> {
    for (const entry of this.entries) {
      yield entry.started;
      if (entry.finished !== undefined) yield entry.finished;
    }
  }

  async read(): Promise<readonly AgentRunUsageEntry[]> {
    this.readCalls += 1;
    return this.readImpl === undefined ? this.entries : this.readImpl();
  }

  finish(entry: AgentRunUsageEntry): void {
    this.emitter.fire(entry);
  }
}

function startedRecord(
  runId: string,
  modelAlias: string,
  startedAt: number,
  profileName: string = 'explore',
): AgentRunUsageStartedRecord {
  return {
    version: 1,
    kind: 'started',
    runId,
    childAgentId: 'agent-child',
    parentAgentId: 'main',
    profileName,
    modelAlias,
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    startedAt,
  };
}

function finishedRecord(
  runId: string,
  endedAt: number,
  totalTokens: number,
  patch: Partial<AgentRunUsageFinishedRecord> = {},
): AgentRunUsageFinishedRecord {
  return {
    version: 1,
    kind: 'finished',
    runId,
    status: 'completed',
    startedAt: endedAt - 60_000,
    endedAt,
    durationMs: 60_000,
    usage: { inputOther: totalTokens, output: 0, inputCacheRead: 0, inputCacheCreation: 0 },
    contextTokens: totalTokens,
    ...patch,
  };
}

function runEntry(
  runId: string,
  modelAlias: string,
  endedAt: number,
  totalTokens: number,
  options: {
    readonly profileName?: string;
    readonly finished?: Partial<AgentRunUsageFinishedRecord>;
  } = {},
): AgentRunUsageEntry {
  return {
    started: startedRecord(runId, modelAlias, endedAt - 60_000, options.profileName),
    finished: finishedRecord(runId, endedAt, totalTokens, options.finished),
  };
}

describe('providerQuotaPercent', () => {
  it('takes the lowest remaining percent across summary and limits windows', () => {
    const result: ProviderUsageResult = {
      kind: 'ok',
      provider: 'kimi',
      summary: { used: 30, limit: 100 },
      limits: [
        { used: 90, limit: 100 },
        { used: 50, limit: 200 },
        { used: 10, limit: 0 },
      ],
      extraUsage: null,
    };
    expect(providerQuotaPercent(result, false)).toBe(10);
  });

  it('treats error/unsupported/empty windows as unknown', () => {
    expect(providerQuotaPercent({ kind: 'error', provider: 'kimi', message: 'x' }, false)).toBeUndefined();
    expect(providerQuotaPercent({ kind: 'unsupported', provider: 'kimi', message: 'x' }, false)).toBeUndefined();
    expect(providerQuotaPercent(undefined, false)).toBeUndefined();
    const empty: ProviderUsageResult = {
      kind: 'ok',
      provider: 'kimi',
      summary: null,
      limits: [],
      extraUsage: null,
    };
    expect(providerQuotaPercent(empty, false)).toBeUndefined();
  });

  it('uses the wallet percent only when Extra Usage is opted in and has positive balance', () => {
    const wallet = {
      balanceCents: 25,
      totalCents: 100,
      monthlyChargeLimitEnabled: true,
      monthlyChargeLimitCents: 100,
      monthlyUsedCents: 0,
      currency: 'USD',
    };
    const base: ProviderUsageResult = {
      kind: 'ok',
      provider: 'kimi',
      summary: null,
      limits: [],
      extraUsage: wallet,
    };
    expect(providerQuotaPercent(base, true)).toBe(25);
    // Without the opt-in the wallet never counts.
    expect(providerQuotaPercent(base, false)).toBeUndefined();
    // A spent wallet is not positive balance.
    expect(providerQuotaPercent({ ...base, extraUsage: { ...wallet, balanceCents: 0 } }, true)).toBeUndefined();
  });

  it('lets a positive wallet take over a depleted plan window when opted in', () => {
    const wallet = {
      balanceCents: 25,
      totalCents: 100,
      monthlyChargeLimitEnabled: false,
      monthlyChargeLimitCents: 0,
      monthlyUsedCents: 0,
      currency: 'USD',
    };
    const result: ProviderUsageResult = {
      kind: 'ok',
      provider: 'kimi',
      summary: null,
      limits: [{ used: 90, limit: 100 }],
      extraUsage: wallet,
    };
    // Plan window at 10% remaining, wallet at 25%: the effective quota is the
    // larger of the two (wallet covers the depleted plan).
    expect(providerQuotaPercent(result, true)).toBe(25);
    // Without the opt-in the wallet never counts and only the window remains.
    expect(providerQuotaPercent(result, false)).toBe(10);
    // A healthy plan window still governs over the wallet.
    const healthy: ProviderUsageResult = {
      ...result,
      limits: [{ used: 30, limit: 100 }],
    };
    expect(providerQuotaPercent(healthy, true)).toBe(70);
  });

  it('clamps over-quota windows to zero and treats non-finite limits as unknown', () => {
    expect(providerQuotaPercent(windowRow(120, 100), false)).toBe(0);
    expect(providerQuotaPercent(windowRow(Number.NaN, 100), false)).toBe(100);
  });

  it('keeps the reset of the tightest valid plan window and ignores stale reset times', () => {
    const now = Date.UTC(2026, 0, 1);
    const tightResetAt = now + 60 * 60 * 1000;
    const result: ProviderUsageResult = {
      kind: 'ok',
      provider: 'provider',
      summary: { used: 20, limit: 100, resetAt: new Date(now + 2 * 60 * 60 * 1000).toISOString() },
      limits: [
        { used: 75, limit: 100, resetAt: new Date(tightResetAt).toISOString() },
        { used: 10, limit: 100, resetAt: new Date(now - 1).toISOString() },
      ],
      extraUsage: null,
    };

    expect(providerQuotaEvidence(result, false, now)).toEqual({
      remainingPercent: 25,
      resetAt: tightResetAt,
    });
    expect(
      providerQuotaEvidence(
        { ...result, limits: [{ used: 75, limit: 100, resetAt: new Date(now - 1).toISOString() }] },
        false,
        now,
      ),
    ).toEqual({ remainingPercent: 25, resetAt: undefined });
  });

  it('drops the plan reset when Extra Usage truly covers the tightest window', () => {
    const now = Date.UTC(2026, 0, 1);
    const result: ProviderUsageResult = {
      kind: 'ok',
      provider: 'provider',
      summary: null,
      limits: [{ used: 90, limit: 100, resetAt: new Date(now + 60_000).toISOString() }],
      extraUsage: {
        balanceCents: 50,
        totalCents: 100,
        monthlyChargeLimitEnabled: true,
        monthlyChargeLimitCents: 100,
        monthlyUsedCents: 0,
        currency: 'USD',
      },
    };

    expect(providerQuotaEvidence(result, true, now)).toEqual({ remainingPercent: 50 });
  });
});

describe('AutoSubagentPresetService', () => {
  let disposables: DisposableStore;
  let ix: TestInstantiationService;
  let config: LayeredConfigStub;
  let usage: FakeRunUsageService;
  let usageCalls: string[];
  let autoPreset: IAutoSubagentPresetService;
  /** Core facts published on `IEventService` by the service under test. */
  let publishedEvents: Array<{ type: string; payload: unknown }>;
  const quotaResults = new Map<string, ProviderUsageResult | undefined>();
  let clockNow = Date.now();

  beforeEach(() => {
    disposables = new DisposableStore();
    clockNow = Date.now();
    ix = disposables.add(new TestInstantiationService());
    config = new LayeredConfigStub({ subagent: subagentConfigWith() });
    usage = new FakeRunUsageService();
    usageCalls = [];
    quotaResults.clear();
    publishedEvents = [];
    const flag: IFlagService = {
      _serviceBrand: undefined,
      enabled: vi.fn((id: string) => id === AUTO_SUBAGENT_PRESET_FLAG_ID),
      registry: {
        _serviceBrand: undefined,
        register: () => ({ dispose: () => {} }),
        get: () => undefined,
        list: () => [],
      },
      snapshot: () => ({}),
      enabledIds: () => [],
      explain: () => undefined,
      explainAll: () => [],
      setConfigOverrides: () => {},
    } as unknown as IFlagService;
    ix.stub(IConfigService, config);
    ix.stub(IFlagService, flag);
    ix.stub(IModelCatalog, modelCatalogFor(ROUTES));
    ix.stub(IAgentRunUsageService, usage);
    ix.stub(IProviderUsageService, {
      _serviceBrand: undefined,
      queryUsage: vi.fn(async (providerId?: string): Promise<readonly ProviderUsageResult[]> => {
        if (providerId === undefined) return [];
        usageCalls.push(providerId);
        const result = quotaResults.get(providerId);
        return result === undefined
          ? [{ kind: 'error', provider: providerId, message: 'down' }]
          : [{ ...result, provider: providerId }];
      }),
    } as unknown as IProviderUsageService);
    ix.stub(ILogService, {
      _serviceBrand: undefined,
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: () => ({} as ILogService),
      level: 'warn',
      setLevel: () => {},
      flush: async () => {},
    } as unknown as ILogService);
    ix.stub(IHostClock, {
      _serviceBrand: undefined,
      now: () => new Date(clockNow),
      timeZone: () => 'UTC',
    });
    ix.stub(IEventService, {
      _serviceBrand: undefined,
      publish: vi.fn((event: { type: string; payload: unknown }) => {
        publishedEvents.push(event);
      }),
      subscribe: () => ({ dispose: () => {} }),
      onDidPublish: () => () => {},
      listenerCount: 0,
    } as unknown as IEventService);
    ix.set(
      ISubagentPresetActivationService,
      new SyncDescriptor(SubagentPresetActivationService),
    );
    ix.set(IAutoSubagentPresetService, new SyncDescriptor(AutoSubagentPresetService));
    autoPreset = ix.get(IAutoSubagentPresetService);
  });

  afterEach(() => {
    vi.useRealTimers();
    disposables.dispose();
  });

  function setQuota(provider: string, result: ProviderUsageResult | undefined): void {
    quotaResults.set(provider, result);
  }

  function currentPreset(): string | undefined {
    return config.get<SubagentConfig>(SUBAGENT_SECTION)?.preset;
  }

  describe('flag and config gates', () => {
    it('does nothing when the flag is disabled', async () => {
      (ix.get(IFlagService).enabled as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const result = await autoPreset.evaluate(REQUEST, CTX);
      expect(result.activatedPreset).toBeUndefined();
      expect(currentPreset()).toBe('balanced');
      expect(usageCalls).toEqual([]);
    });

    it('does nothing when [subagent] auto_preset.enabled is off', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: false } }),
      );
      const result = await autoPreset.evaluate(REQUEST, CTX);
      expect(result.reason).toContain('disabled');
      expect(usageCalls).toEqual([]);
    });

    it('never touches main/default model or global thinking', async () => {
      await config.set('defaultModel', 'gpt-main-model');
      await config.set('thinking', { level: 'high' });
      setQuota('provider-balanced', okResult(90));
      setQuota('provider-kimi', okResult(99));

      await autoPreset.evaluate(REQUEST, CTX);
      expect(config.get('defaultModel')).toBe('gpt-main-model');
      expect(config.get('thinking')).toEqual({ level: 'high' });
    });
  });

  describe('manual lock', () => {
    it('defers to a manual selection and skips usage queries while locked', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, manualLock: true } }),
      );

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.reason).toBe('manual preset selection');
      expect(usageCalls).toEqual([]);
      expect(currentPreset()).toBe('balanced');
    });

    it('resumes automatic selection once the manual lock is cleared', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, manualLock: true } }),
      );
      await autoPreset.evaluate(REQUEST, CTX);
      expect(usageCalls).toEqual([]);

      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, manualLock: false } }),
      );
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(95));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      expect(usageCalls).toContain('provider-kimi');
    });

    it('stamps preset + manual_lock atomically through the public manual boundary and never through the automatic transaction', async () => {
      const activation = ix.get(ISubagentPresetActivationService);

      const result = await activation.activate('kimi-heavy');

      expect(result.kind).toBe('activated');
      const userValue = config.inspect<SubagentConfig>(SUBAGENT_SECTION).userValue;
      expect(userValue?.preset).toBe('kimi-heavy');
      expect(userValue?.autoPreset).toMatchObject({ manualLock: true, enabled: true });

      // The automatic path only patches the preset: a committed automatic
      // switch leaves the lock off, so the next evaluation is not parked.
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, manualLock: false } }),
      );
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(95));
      const automatic = await autoPreset.evaluate(REQUEST, CTX);
      expect(automatic.activatedPreset).toBe('kimi-heavy');
      expect(
        resolveSubagentAutoPresetConfig(
          config.get<SubagentConfig | undefined>(SUBAGENT_SECTION),
        ),
      ).toMatchObject({ enabled: true, manualLock: false });
    });

    it('stamps the lock even when a manual activation clears to base routing', async () => {
      const activation = ix.get(ISubagentPresetActivationService);

      const cleared = await activation.activate('');

      expect(cleared.kind).toBe('activated');
      const userValue = config.inspect<SubagentConfig>(SUBAGENT_SECTION).userValue;
      expect(userValue?.preset).toBe('');
      expect(userValue?.autoPreset).toMatchObject({ manualLock: true });
    });

    it('rejects a preset with a blank thinking effort without changing the selector or manual lock', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          presets: {
            ...PRESETS,
            invalid: { explore: { model: 'route/kimi', thinkingEffort: '   ' } },
          },
        }),
      );
      const activation = ix.get(ISubagentPresetActivationService);
      const revision = activation.manualRevision;

      const result = await activation.activate('invalid');

      expect(result).toMatchObject({ kind: 'failed', commitStarted: false });
      if (result.kind !== 'failed') throw new Error('expected activation failure');
      expect(result.message).toContain('thinking_effort');
      expect(currentPreset()).toBe('balanced');
      expect(
        resolveSubagentAutoPresetConfig(
          config.get<SubagentConfig | undefined>(SUBAGENT_SECTION),
        ).manualLock,
      ).toBe(false);
      expect(activation.manualRevision).toBe(revision);
    });
  });

  describe('selection rules', () => {
    it('keeps the current preset when it is healthy and no candidate beats it by margin', async () => {
      setQuota('provider-balanced', okResult(80));
      setQuota('provider-kimi', okResult(85));
      setQuota('provider-deepseek', okResult(89));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(currentPreset()).toBe('balanced');
    });

    it('keeps a healthy higher-priority current when the weighted lead stays below margin', async () => {
      setQuota('provider-balanced', okResult(80));
      setQuota('provider-kimi', okResult(95));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.reasonCode).toBe('score_margin_not_met');
      expect(currentPreset()).toBe('balanced');
    });

    it('switches below the floor even when the margin is not met', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, switchMarginPercent: 15 } }),
      );
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(30));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
    });

    it('keeps the current below floor when no candidate scores above it', async () => {
      setQuota('provider-balanced', okResult(10));
      setQuota('provider-kimi', okResult(10));
      setQuota('provider-deepseek', okResult(9));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(currentPreset()).toBe('balanced');
    });

    it('does not switch to a below-floor candidate that only scores slightly higher', async () => {
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(24));
      setQuota('provider-deepseek', okResult(23));

      // Balanced is below the floor (20 < 25), but the best candidate (24) is
      // also below the floor and only beats it by 4 (< margin 10) — the floor
      // escape requires the candidate to actually reach the floor.
      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(currentPreset()).toBe('balanced');
    });

    it('keeps no active preset when every candidate is below the floor', async () => {
      await config.replace(SUBAGENT_SECTION, subagentConfigWith({ preset: undefined }));
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(15));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.reason).toContain('floor');
      expect(currentPreset()).toBeUndefined();
    });

    it('falls back when the current provider is unknown and another candidate is healthy', async () => {
      setQuota('provider-balanced', undefined);
      setQuota('provider-kimi', okResult(90));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      expect(currentPreset()).toBe('kimi-heavy');
    });

    it('prefers the current preset on an exact score tie', async () => {
      setQuota('provider-balanced', okResult(70));
      setQuota('provider-kimi', okResult(70));
      setQuota('provider-deepseek', okResult(70));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
    });

    it('lets quota outweigh priority and exposes the additive score breakdown', async () => {
      await config.replace(SUBAGENT_SECTION, subagentConfigWith({ preset: undefined }));
      setQuota('provider-balanced', okResult(30));
      setQuota('provider-kimi', okResult(90));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      expect(result.currentPreset).toBeUndefined();
      const status = autoPreset.status()!;
      const balanced = status.candidates.find((candidate) => candidate.preset === 'balanced')!;
      const kimi = status.candidates.find((candidate) => candidate.preset === 'kimi-heavy')!;
      expect(balanced.contributions).toMatchObject({
        priorityBonus: 20,
        routeFitBonus: 2,
      });
      expect(balanced.contributions.quotaRemaining).toBeCloseTo(30);
      expect(balanced.score).toBeCloseTo(52);
      expect(kimi.contributions).toMatchObject({
        priorityBonus: 10,
        routeFitBonus: 2,
      });
      expect(kimi.contributions.quotaRemaining).toBeCloseTo(90);
      expect(kimi.score).toBeCloseTo(102);
    });

    it('breaks exact ties between non-current candidates by candidate order', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          preset: undefined,
          autoPreset: { enabled: true, candidates: ['deepseek-heavy', 'kimi-heavy'] },
        }),
      );
      setQuota('provider-kimi', okResult(60));
      setQuota('provider-deepseek', okResult(60));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('deepseek-heavy');
    });

    it('escapes an unhealthy current to the highest weighted healthy candidate', async () => {
      setQuota('provider-balanced', okResult(10));
      setQuota('provider-kimi', okResult(90));
      setQuota('provider-deepseek', okResult(95));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      expect(result.reasonCode).toBe('current_unhealthy');
    });

    it('switches only when the weighted score lead reaches the configured margin', async () => {
      await config.replace(SUBAGENT_SECTION, subagentConfigWith({ preset: 'kimi-heavy' }));
      setQuota('provider-balanced', okResult(44));
      setQuota('provider-kimi', okResult(50));

      let result = await autoPreset.evaluate(REQUEST, CTX);
      expect(result.activatedPreset).toBeUndefined();
      expect(result.reasonCode).toBe('score_margin_not_met');
      expect(currentPreset()).toBe('kimi-heavy');

      clockNow += 301_000;
      setQuota('provider-balanced', okResult(51));
      setQuota('provider-kimi', okResult(50));

      result = await autoPreset.evaluate(REQUEST, CTX);
      expect(result.activatedPreset).toBe('balanced');
      expect(result.reasonCode).toBe('higher_score');
      expect(currentPreset()).toBe('balanced');
    });

    it('keeps the current preset when no candidate has any health evidence', async () => {
      setQuota('provider-balanced', undefined);
      setQuota('provider-kimi', undefined);
      setQuota('provider-deepseek', undefined);

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.reason).toContain('evidence');
      expect(currentPreset()).toBe('balanced');
    });

    it('treats a current preset outside the candidates as an explicit manual choice', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, candidates: ['kimi-heavy'] } }),
      );
      setQuota('provider-kimi', okResult(99));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.reason).toContain('explicit');
      expect(currentPreset()).toBe('balanced');
    });

    it('degrades missing candidates and unresolvable route models', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          autoPreset: { enabled: true, candidates: ['balanced', 'ghost', 'missing'] },
          presets: {
            ...PRESETS,
            ghost: { explore: { model: 'route/ghost' } },
          } as SubagentConfig['presets'],
        }),
      );
      // `route/ghost` is absent from the model catalog, so 'ghost' never scores.
      setQuota('provider-balanced', okResult(80));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(usageCalls).toEqual(['provider-balanced']);
    });
  });

  describe('reset, local reliability, latency, and stability controls', () => {
    it('adds only a small linear bonus for a valid reset within 24 hours', async () => {
      const now = Date.UTC(2026, 0, 1);
      clockNow = now;
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          preset: undefined,
          autoPreset: {
            enabled: true,
            candidates: ['balanced', 'kimi-heavy'],
            priorityWeightPercent: 0,
            localUsageWeightPercent: 0,
            reliabilityWeightPercent: 0,
            latencyWeightPercent: 0,
          },
        }),
      );
      setQuota('provider-balanced', {
        kind: 'ok',
        provider: 'provider-balanced',
        summary: null,
        limits: [{ used: 50, limit: 100, resetAt: new Date(now + 24 * 60 * 60 * 1000).toISOString() }],
        extraUsage: null,
      });
      setQuota('provider-kimi', {
        kind: 'ok',
        provider: 'provider-kimi',
        summary: null,
        limits: [{ used: 50, limit: 100, resetAt: new Date(now + 60 * 60 * 1000).toISOString() }],
        extraUsage: null,
      });

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      const [balanced, kimi] = autoPreset.status()!.candidates;
      expect(balanced?.contributions.resetBonus).toBe(0);
      expect(kimi?.contributions.resetBonus).toBeGreaterThan(1.9);
      expect(kimi?.contributions.resetBonus).toBeLessThanOrEqual(2);
    });

    it('uses profile samples once sufficient and lets reliability outweigh local priority', async () => {
      const now = Date.now();
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          preset: undefined,
          autoPreset: {
            enabled: true,
            candidates: ['balanced', 'kimi-heavy'],
            priorityWeightPercent: 20,
            localUsageWeightPercent: 0,
            reliabilityWeightPercent: 50,
            latencyWeightPercent: 0,
          },
        }),
      );
      usage.entries = [
        ...Array.from({ length: 3 }, (_, index) =>
          runEntry(`balanced-explore-failed-${index}`, 'route/balanced', now - index, 0, {
            finished: { status: 'failed' },
          }),
        ),
        ...Array.from({ length: 3 }, (_, index) =>
          runEntry(`balanced-plan-ok-${index}`, 'route/balanced', now - 10 - index, 0, {
            profileName: 'plan',
          }),
        ),
        ...Array.from({ length: 3 }, (_, index) =>
          runEntry(`kimi-explore-ok-${index}`, 'route/kimi', now - 20 - index, 0),
        ),
      ];
      setQuota('provider-balanced', okResult(70));
      setQuota('provider-kimi', okResult(70));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      const balanced = result.status!.candidates.find((candidate) => candidate.preset === 'balanced')!;
      expect(balanced.localEvidence).toMatchObject({
        scope: 'profile',
        sampleCount: 3,
        failureCount: 3,
        adjustedFailureRate: 0.6,
      });
      expect(balanced.contributions.reliabilityPenalty).toBe(30);
    });

    it('falls back to provider-wide evidence below the profile sample threshold', async () => {
      const now = Date.now();
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          preset: undefined,
          autoPreset: {
            enabled: true,
            candidates: ['balanced'],
            localUsageWeightPercent: 0,
            reliabilityWeightPercent: 20,
            latencyWeightPercent: 0,
          },
        }),
      );
      usage.entries = [
        runEntry('explore-failed-1', 'route/balanced', now, 0, { finished: { status: 'failed' } }),
        runEntry('explore-failed-2', 'route/balanced', now - 1, 0, { finished: { status: 'failed' } }),
        runEntry('plan-ok-1', 'route/balanced', now - 2, 0, { profileName: 'plan' }),
        runEntry('plan-ok-2', 'route/balanced', now - 3, 0, { profileName: 'plan' }),
        runEntry('plan-ok-3', 'route/balanced', now - 4, 0, { profileName: 'plan' }),
      ];
      setQuota('provider-balanced', okResult(80));

      await autoPreset.evaluate(REQUEST, CTX);

      const balanced = autoPreset.status()!.candidates[0]!;
      expect(balanced.localEvidence).toMatchObject({
        scope: 'provider',
        sampleCount: 5,
        failureCount: 2,
        adjustedFailureRate: 0.4,
      });
      expect(balanced.contributions.reliabilityPenalty).toBe(8);
    });

    it('shrinks a single failed run while retaining near-timeout reliability evidence', async () => {
      const now = Date.now();
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          preset: undefined,
          autoPreset: {
            enabled: true,
            candidates: ['balanced', 'kimi-heavy'],
            priorityWeightPercent: 0,
            localUsageWeightPercent: 0,
            reliabilityWeightPercent: 20,
            latencyWeightPercent: 0,
          },
        }),
      );
      usage.entries = [
        runEntry('near-timeout-failed', 'route/balanced', now, 0, {
          finished: { status: 'failed', durationMs: 3_599_000 },
        }),
      ];
      setQuota('provider-balanced', okResult(70));
      setQuota('provider-kimi', okResult(70));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      const balanced = result.status!.candidates[0]!;
      expect(balanced.localEvidence).toMatchObject({
        sampleCount: 1,
        failureCount: 1,
        adjustedFailureRate: 0.2,
      });
      expect(balanced.contributions.reliabilityPenalty).toBe(4);
    });

    it('weights profile first-token latency by measured samples across partial and legacy runs', async () => {
      const now = Date.now();
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          preset: undefined,
          autoPreset: {
            enabled: true,
            candidates: ['balanced', 'kimi-heavy'],
            priorityWeightPercent: 0,
            localUsageWeightPercent: 0,
            reliabilityWeightPercent: 0,
            latencyWeightPercent: 20,
          },
        }),
      );
      usage.entries = [
        runEntry('balanced-latency-single', 'route/balanced', now, 0, {
          finished: {
            averageFirstTokenLatencyMs: 1000,
            firstTokenLatencySampleCount: 1,
            llmRequestCount: 10,
          },
        }),
        runEntry('balanced-latency-partial', 'route/balanced', now - 1, 0, {
          finished: {
            averageFirstTokenLatencyMs: 100,
            firstTokenLatencySampleCount: 2,
            llmRequestCount: 4,
          },
        }),
        runEntry('balanced-latency-legacy', 'route/balanced', now - 2, 0, {
          finished: { averageFirstTokenLatencyMs: 700, llmRequestCount: 8 },
        }),
        ...Array.from({ length: 3 }, (_, index) =>
          runEntry(`kimi-latency-${index}`, 'route/kimi', now - 10 - index, 0, {
            finished: {
              averageFirstTokenLatencyMs: 100,
              firstTokenLatencySampleCount: 1,
              llmRequestCount: 1,
            },
          }),
        ),
      ];
      setQuota('provider-balanced', okResult(70));
      setQuota('provider-kimi', okResult(70));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      const balanced = result.status!.candidates[0]!;
      const kimi = result.status!.candidates[1]!;
      expect(balanced.localEvidence).toMatchObject({
        scope: 'profile',
        averageFirstTokenLatencyMs: 475,
        firstTokenLatencySampleCount: 4,
        llmRequestCount: 22,
      });
      expect(balanced.contributions.latencyPenalty).toBe(16);
      expect(kimi.localEvidence).toMatchObject({
        firstTokenLatencySampleCount: 3,
        llmRequestCount: 3,
      });
      expect(kimi.contributions.latencyPenalty).toBeCloseTo(20 * (100 / 475) * 0.6);
    });

    it('opens on consecutive failed runs and immediately escapes the unhealthy current', async () => {
      const now = Date.now();
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          autoPreset: {
            enabled: true,
            candidates: ['balanced', 'kimi-heavy'],
            priorityWeightPercent: 0,
            reliabilityWeightPercent: 0,
            circuitBreakerFailureThreshold: 3,
            circuitBreakerCooldownMs: 900_000,
          },
        }),
      );
      usage.entries = Array.from({ length: 3 }, (_, index) =>
        runEntry(`failed-${index}`, 'route/balanced', now - (3 - index) * 1000, 0, {
          finished: {
            status: 'failed',
            errorCode: index === 0 ? 'provider.connection_error' : undefined,
          },
        }),
      );
      setQuota('provider-balanced', okResult(99));
      setQuota('provider-kimi', okResult(50));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      expect(result.reasonCode).toBe('circuit_breaker_escape');
      expect(result.status!.candidates[0]).toMatchObject({
        availability: 'circuit_open',
        selectable: false,
      });
      expect(result.status!.candidates[0]!.circuitBreakerOpenUntil).toBeGreaterThan(now);
    });

    it('counts a live failed suffix across the cooldown cutoff and clears it after success', async () => {
      const now = Date.UTC(2026, 0, 1);
      clockNow = now;
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          autoPreset: {
            enabled: true,
            candidates: ['balanced', 'kimi-heavy'],
            priorityWeightPercent: 0,
            localUsageWeightPercent: 0,
            reliabilityWeightPercent: 0,
            latencyWeightPercent: 0,
            switchCooldownMs: 0,
            circuitBreakerFailureThreshold: 3,
            circuitBreakerCooldownMs: 60_000,
          },
        }),
      );
      setQuota('provider-balanced', okResult(99));
      setQuota('provider-kimi', okResult(50));
      await autoPreset.evaluate(REQUEST, CTX);

      usage.finish(runEntry('spanning-failed-1', 'route/balanced', now, 0, {
        finished: { status: 'failed' },
      }));
      clockNow = now + 40_000;
      usage.finish(runEntry('spanning-failed-2', 'route/balanced', now + 40_000, 0, {
        finished: { status: 'failed' },
      }));
      clockNow = now + 80_000;
      usage.finish(runEntry('spanning-failed-3', 'route/balanced', now + 80_000, 0, {
        finished: { status: 'failed' },
      }));

      const opened = await autoPreset.evaluate(REQUEST, CTX);

      expect(opened.reasonCode).toBe('circuit_breaker_escape');
      expect(opened.status!.candidates[0]).toMatchObject({
        availability: 'circuit_open',
        circuitBreakerOpenUntil: now + 140_000,
      });

      clockNow = now + 80_001;
      usage.finish(runEntry('spanning-recovered', 'route/balanced', now + 80_001, 0));
      const recovered = await autoPreset.evaluate(REQUEST, CTX);

      expect(recovered.activatedPreset).toBe('balanced');
      expect(recovered.status!.candidates[0]).toMatchObject({
        availability: 'healthy',
        circuitBreakerOpenUntil: undefined,
      });
    });

    it('rebuilds a failed suffix spanning the cooldown cutoff from the ledger after restart', async () => {
      const now = Date.UTC(2026, 0, 1);
      clockNow = now;
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          autoPreset: {
            enabled: true,
            candidates: ['balanced', 'kimi-heavy'],
            priorityWeightPercent: 0,
            localUsageWindowMs: 30_000,
            localUsageWeightPercent: 0,
            reliabilityWeightPercent: 0,
            latencyWeightPercent: 0,
            circuitBreakerFailureThreshold: 3,
            circuitBreakerCooldownMs: 60_000,
          },
        }),
      );
      usage.entries = [
        runEntry('hydrated-failed-1', 'route/balanced', now - 130_000, 0, {
          finished: { status: 'failed' },
        }),
        runEntry('hydrated-failed-2', 'route/balanced', now - 70_000, 0, {
          finished: { status: 'failed' },
        }),
        runEntry('hydrated-failed-3', 'route/balanced', now - 10_000, 0, {
          finished: { status: 'failed' },
        }),
      ];
      setQuota('provider-balanced', okResult(99));
      setQuota('provider-kimi', okResult(50));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(usage.readCalls).toBe(1);
      expect(result.reasonCode).toBe('circuit_breaker_escape');
      expect(result.status!.candidates[0]).toMatchObject({
        availability: 'circuit_open',
        circuitBreakerOpenUntil: now + 50_000,
      });
    });

    it('closes the circuit early after a later success and ignores cancellations', async () => {
      const now = Date.now();
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          autoPreset: {
            enabled: true,
            candidates: ['balanced', 'kimi-heavy'],
            reliabilityWeightPercent: 0,
            circuitBreakerFailureThreshold: 3,
            circuitBreakerCooldownMs: 900_000,
          },
        }),
      );
      usage.entries = [
        ...Array.from({ length: 3 }, (_, index) =>
          runEntry(`failed-${index}`, 'route/balanced', now - 10_000 + index, 0, {
            finished: { status: 'failed' },
          }),
        ),
        runEntry('recovered', 'route/balanced', now - 1000, 0),
        ...Array.from({ length: 3 }, (_, index) =>
          runEntry(`cancelled-${index}`, 'route/kimi', now - 500 + index, 0, {
            finished: { status: 'cancelled' },
          }),
        ),
      ];
      setQuota('provider-balanced', okResult(90));
      setQuota('provider-kimi', okResult(80));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.status!.candidates[0]).toMatchObject({
        availability: 'healthy',
        circuitBreakerOpenUntil: undefined,
      });
      expect(result.status!.candidates[1]!.localEvidence).toMatchObject({
        scope: 'none',
        sampleCount: 0,
        failureCount: 0,
      });
    });

    it('blocks ordinary cross-switching during cooldown but permits unhealthy escape', async () => {
      const now = Date.UTC(2026, 0, 1);
      clockNow = now;
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          autoPreset: {
            enabled: true,
            candidates: ['balanced', 'kimi-heavy'],
            priorityWeightPercent: 0,
            reliabilityWeightPercent: 0,
            latencyWeightPercent: 0,
            switchCooldownMs: 600_000,
          },
        }),
      );
      setQuota('provider-balanced', okResult(50));
      setQuota('provider-kimi', okResult(90));
      const first = await autoPreset.evaluate(REQUEST, CTX);
      expect(first.activatedPreset).toBe('kimi-heavy');
      expect(first.status!.switchCooldownUntil).toBe(now + 600_000);

      usage.finish(runEntry('cache-reset-1', 'route/kimi', now + 1, 0));
      setQuota('provider-balanced', okResult(95));
      setQuota('provider-kimi', okResult(50));
      const cooled = await autoPreset.evaluate(REQUEST, CTX);
      expect(cooled.activatedPreset).toBeUndefined();
      expect(cooled.reasonCode).toBe('switch_cooldown');
      expect(currentPreset()).toBe('kimi-heavy');

      usage.finish(runEntry('cache-reset-2', 'route/kimi', now + 2, 0));
      setQuota('provider-kimi', okResult(10));
      const escaped = await autoPreset.evaluate(REQUEST, CTX);
      expect(escaped.activatedPreset).toBe('balanced');
      expect(escaped.reasonCode).toBe('current_unhealthy');
    });
  });

  describe('local token usage', () => {
    it('applies the token weight to the score and flips the decision', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, localUsageWeightPercent: 10 } }),
      );
      const now = Date.now();
      usage.entries = [
        runEntry('run-heavy', 'route/balanced', now - 30_000, 900_000),
        runEntry('run-light', 'route/kimi', now - 30_000, 0),
      ];
      setQuota('provider-balanced', okResult(30));
      setQuota('provider-kimi', okResult(48));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
    });

    it('prunes finished runs outside the local usage window', async () => {
      const now = Date.now();
      usage.entries = [runEntry('run-old', 'route/balanced', now - 2 * 60 * 60 * 1000, 1_000_000)];
      setQuota('provider-balanced', okResult(30));
      setQuota('provider-kimi', okResult(40));

      // Without pruning, the stale token penalty would lower balanced from 52
      // to 42 and let kimi lead by the 10-point margin. Pruning leaves both at
      // 52, where the current preset wins the exact tie.
      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(currentPreset()).toBe('balanced');
    });

    it('hydrates the window from the ledger and updates from live completion events', async () => {
      const now = Date.now();
      usage.entries = [runEntry('run-historic', 'route/kimi', now - 60_000, 1_000)];
      setQuota('provider-balanced', okResult(30));
      setQuota('provider-kimi', okResult(45));

      // Historic kimi tokens (1_000, normalized 1.0 → −10) leave kimi at 35;
      // balanced 30 is still healthy and first in priority → keep — the
      // hydration contributed to scoring.
      await autoPreset.evaluate(REQUEST, CTX);
      expect(currentPreset()).toBe('balanced');

      // A live completion adds 1M balanced tokens: balanced drops to 20 (below
      // the floor), so the decider falls back in order to kimi (~45). No re-read
      // is needed for the event.
      usage.finish(runEntry('run-live', 'route/balanced', now + 60_000, 1_000_000));
      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
    });

    it('normalizes only against candidate-provider tokens, never a busy outsider', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, localUsageWeightPercent: 10 } }),
      );
      const now = Date.now();
      usage.entries = [
        runEntry('run-candidate', 'route/balanced', now - 30_000, 1_000_000),
        runEntry('run-outsider', 'route/other', now - 30_000, 10_000_000),
      ];
      setQuota('provider-balanced', okResult(30));
      setQuota('provider-kimi', okResult(45));

      // The outsider provider is not among the candidates, so its 10M tokens
      // must not dilute the normalization: balanced drops to 20 (1M/1M → −10,
      // below the floor) and the decider falls back to kimi (45). A max
      // including the outsider would leave balanced at ~29 (healthy) and keep
      // the current preset.
      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
    });

    it('does not accumulate completed runs while disabled and recovers via hydration', async () => {
      const now = Date.now();
      usage.entries = [runEntry('run-seed', 'route/balanced', now - 30_000, 1_000_000)];
      const flag = ix.get(IFlagService).enabled as ReturnType<typeof vi.fn>;
      flag.mockReturnValue(false);
      usage.finish(runEntry('run-off', 'route/kimi', now + 1_000, 5_000_000));
      await autoPreset.evaluate(REQUEST, CTX);

      flag.mockReturnValue(true);
      setQuota('provider-balanced', okResult(30));
      setQuota('provider-kimi', okResult(45));

      // Only the seeded balanced run (1M, hydrated from read()) counts — the
      // 5M kimi run that finished while disabled was dropped. Balanced 30−10=20
      // → below the floor → fallback to kimi (45). Had the off-run counted,
      // kimi would drop to 35 and balanced's normalization would shrink to 0.2
      // (5M max), leaving balanced at 28 (healthy) → keep.
      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
    });

    it('does not use old entries as local evidence', async () => {
      const now = Date.now();
      const oldNoUsage: AgentRunUsageEntry = {
        started: startedRecord('run-old-no-usage', 'route/kimi', now - 2 * 3_600_000),
        finished: { ...finishedRecord('run-old-no-usage', now - 2 * 3_600_000, 0), usage: undefined },
      };
      usage.entries = [oldNoUsage];
      setQuota('provider-balanced', okResult(80));
      setQuota('provider-kimi', okResult(95));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.status!.candidates[1]!.localEvidence).toMatchObject({
        scope: 'none',
        sampleCount: 0,
      });
    });

    it('keeps an in-window usage-undefined entry without letting it affect tokens', async () => {
      const now = Date.now();
      const noUsage: AgentRunUsageEntry = {
        started: startedRecord('run-no-usage', 'route/kimi', now - 60_000),
        finished: { ...finishedRecord('run-no-usage', now - 60_000, 0), usage: undefined },
      };
      usage.entries = [noUsage];
      setQuota('provider-balanced', okResult(90));
      setQuota('provider-kimi', okResult(95));

      await autoPreset.evaluate(REQUEST, CTX);

      // kimi has no token penalty from the entry, so the margin stays 5 → keep.
      expect(currentPreset()).toBe('balanced');
    });

    it('keeps bounded breaker history after entries age out of the local evidence window', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, localUsageWindowMs: 3_600_000 } }),
      );
      const now = Date.now();
      const aging: AgentRunUsageEntry = {
        started: startedRecord('run-aging', 'route/kimi', now - 2 * 60_000),
        finished: { ...finishedRecord('run-aging', now - 60_000, 0), usage: undefined },
      };
      usage.entries = [aging];
      setQuota('provider-balanced', okResult(90));
      setQuota('provider-kimi', okResult(95));

      await autoPreset.evaluate(REQUEST, CTX);
      expect(autoPreset.status()!.candidates[1]!.localEvidence.sampleCount).toBe(1);

      clockNow = now + 4 * 3_600_000;
      await autoPreset.evaluate(REQUEST, CTX);
      expect(autoPreset.status()!.candidates[1]!.localEvidence).toMatchObject({
        scope: 'none',
        sampleCount: 0,
      });
    });

    it('re-hydrates from the ledger after being disabled mid-process', async () => {
      const now = Date.now();
      usage.entries = [runEntry('run-a', 'route/kimi', now - 30_000, 1_000)];
      setQuota('provider-balanced', okResult(30));
      setQuota('provider-kimi', okResult(49));
      const flag = ix.get(IFlagService).enabled as ReturnType<typeof vi.fn>;

      // Enabled: hydration loads run-a (kimi 1_000 → 39), balanced is still
      // healthy at 30 — no switch.
      await autoPreset.evaluate(REQUEST, CTX);
      expect(currentPreset()).toBe('balanced');

      // Disabled mid-process: a completion while off must not be retained, and
      // the next evaluation drops the retained window. The record is still
      // persisted to the ledger (simulated below).
      flag.mockReturnValue(false);
      usage.finish(runEntry('run-b', 'route/balanced', now + 1_000, 5_000_000));
      await autoPreset.evaluate(REQUEST, CTX);

      // The ledger now carries both the pre-disable and the off-period runs.
      usage.entries = [
        runEntry('run-a', 'route/kimi', now - 30_000, 1_000),
        runEntry('run-b', 'route/balanced', now + 1_000, 5_000_000),
      ];

      // Re-enabled: the evaluation must re-hydrate from read() — with run-b's
      // 5M balanced tokens counted, balanced (30−10=20) drops below the floor
      // and the decider falls back to kimi (39). A skipped re-hydration would
      // see balanced at 30 (healthy) and keep it.
      flag.mockReturnValue(true);
      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
    });

    it('single-flights first hydration and does not expose a half-hydrated window', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      usage.entries = [runEntry('run-seed', 'route/balanced', Date.now(), 1000)];
      usage.readImpl = async () => {
        await gate;
        return usage.entries;
      };
      setQuota('provider-balanced', okResult(90));
      setQuota('provider-kimi', okResult(95));
      let firstSettled = false;
      let secondSettled = false;

      const first = autoPreset.evaluate(REQUEST, CTX).finally(() => {
        firstSettled = true;
      });
      const second = autoPreset.evaluate(REQUEST, CTX).finally(() => {
        secondSettled = true;
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(usage.readCalls).toBe(1);
      expect(firstSettled).toBe(false);
      expect(secondSettled).toBe(false);

      release();
      await Promise.all([first, second]);
      expect(usage.readCalls).toBe(1);
      expect(autoPreset.status()!.candidates[0]!.localEvidence.sampleCount).toBe(1);
    });

    it('retries ledger hydration after failed reads', async () => {
      let failuresRemaining = 2;
      usage.readImpl = async () => {
        if (failuresRemaining > 0) {
          failuresRemaining -= 1;
          throw new Error('ledger unavailable');
        }
        return [runEntry('run-retry', 'route/balanced', Date.now(), 1000)];
      };
      setQuota('provider-balanced', okResult(90));
      setQuota('provider-kimi', okResult(95));

      await autoPreset.evaluate(REQUEST, CTX);
      expect(usage.readCalls).toBe(1);

      await autoPreset.evaluate(REQUEST, CTX);
      expect(usage.readCalls).toBe(2);

      await autoPreset.evaluate(REQUEST, CTX);
      expect(usage.readCalls).toBe(3);
      expect(autoPreset.status()!.candidates[0]!.localEvidence.sampleCount).toBe(1);
    });
  });

  describe('quota caching and concurrency', () => {
    it('serves quota from the TTL cache and refreshes after the interval', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, refreshIntervalMs: 60_000 } }),
      );
      setQuota('provider-balanced', okResult(80));
      setQuota('provider-kimi', okResult(95));

      await autoPreset.evaluate(REQUEST, CTX);
      await autoPreset.evaluate(REQUEST, CTX);
      expect(usageCalls.filter((p) => p === 'provider-kimi')).toHaveLength(1);

      clockNow += 61_000;
      await autoPreset.evaluate(REQUEST, CTX);
      expect(usageCalls.filter((p) => p === 'provider-kimi')).toHaveLength(2);
    });

    it('shares an in-flight quota query between concurrent evaluations', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const query = vi.mocked(ix.get(IProviderUsageService).queryUsage);
      query.mockImplementation(async (providerId?: string) => {
        if (providerId !== undefined) usageCalls.push(providerId);
        await gate;
        return [okResult(95)];
      });

      const first = autoPreset.evaluate(REQUEST, CTX);
      const second = autoPreset.evaluate(REQUEST, CTX);
      release();
      await Promise.all([first, second]);

      // Every provider quota is single-flighted, so each provider is queried once.
      expect(usageCalls.filter((p) => p === 'provider-kimi')).toHaveLength(1);
      expect(usageCalls.filter((p) => p === 'provider-balanced')).toHaveLength(1);
    });

    it('invalidates the quota cache when a run finishes, so the next spawn refetches', async () => {
      setQuota('provider-balanced', okResult(80));
      setQuota('provider-kimi', okResult(95));

      await autoPreset.evaluate(REQUEST, CTX);
      expect(usageCalls.filter((p) => p === 'provider-kimi')).toHaveLength(1);

      usage.finish(runEntry('run-1', 'route/kimi', Date.now(), 1000));

      await autoPreset.evaluate(REQUEST, CTX);
      expect(usageCalls.filter((p) => p === 'provider-kimi')).toHaveLength(2);
    });

    it('serializes concurrent activation writes without corrupting the section', async () => {
      setQuota('provider-balanced', okResult(5));
      setQuota('provider-kimi', okResult(90));
      setQuota('provider-deepseek', okResult(95));

      const [a, b] = await Promise.all([
        autoPreset.evaluate(REQUEST, CTX),
        autoPreset.evaluate(REQUEST, CTX),
      ]);
      const chosen = [a.activatedPreset, b.activatedPreset].filter(
        (preset): preset is string => preset !== undefined,
      );
      expect(chosen.length).toBeGreaterThan(0);
      const finalPreset = currentPreset();
      expect(chosen).toContain(finalPreset);
      // The presets/agents/timeout fields survive the writes.
      expect(config.get<SubagentConfig>(SUBAGENT_SECTION).presets).toEqual(PRESETS);
    });

    it('negative-caches unknown quota answers within the TTL', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, refreshIntervalMs: 60_000 } }),
      );
      setQuota('provider-balanced', okResult(80));
      setQuota('provider-kimi', undefined);

      await autoPreset.evaluate(REQUEST, CTX);
      await autoPreset.evaluate(REQUEST, CTX);
      expect(usageCalls.filter((p) => p === 'provider-kimi')).toHaveLength(1);

      usage.finish(runEntry('run-1', 'route/kimi', Date.now(), 100));
      await autoPreset.evaluate(REQUEST, CTX);
      expect(usageCalls.filter((p) => p === 'provider-kimi')).toHaveLength(2);
    });

    it('returns immediately when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await autoPreset.evaluate(REQUEST, { sessionId: 'test-session', signal: controller.signal });

      expect(result.reason).toBe('cancelled');
      expect(usageCalls).toEqual([]);
      expect(currentPreset()).toBe('balanced');
    });

    it('races a provider that ignores abort and safely absorbs its late rejection', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, queryTimeoutMs: 5 } }),
      );
      const rejectors: Array<(error: Error) => void> = [];
      const query = vi.mocked(ix.get(IProviderUsageService).queryUsage);
      query.mockImplementation(
        (providerId?: string) =>
          new Promise<readonly ProviderUsageResult[]>((_resolve, reject) => {
            if (providerId !== undefined) usageCalls.push(providerId);
            rejectors.push(reject);
          }),
      );

      const startedAt = Date.now();
      const result = await autoPreset.evaluate(REQUEST, CTX);
      const elapsed = Date.now() - startedAt;

      expect(result.activatedPreset).toBeUndefined();
      expect(elapsed).toBeLessThan(1000);
      expect(rejectors).toHaveLength(3);

      for (const reject of rejectors) reject(new Error('late provider failure'));
      await Promise.resolve();
      await Promise.resolve();
      expect(currentPreset()).toBe('balanced');
    });

    it('does not persist once aborted mid-evaluation', async () => {
      const controller = new AbortController();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const query = vi.mocked(ix.get(IProviderUsageService).queryUsage);
      query.mockImplementation(
        (providerId?: string, options?: { signal?: AbortSignal }) =>
          new Promise<readonly ProviderUsageResult[]>((resolve) => {
            if (providerId !== undefined) usageCalls.push(providerId);
            void Promise.race([
              gate,
              new Promise<void>((settle) => {
                options?.signal?.addEventListener(
                  'abort',
                  () => {
                    settle();
                  },
                  { once: true },
                );
              }),
            ]).then(() => {
              resolve([{ kind: 'error', provider: providerId ?? 'x', message: 'aborted' }]);
            });
          }),
      );

      const pending = autoPreset.evaluate(REQUEST, { sessionId: 'test-session', signal: controller.signal });
      controller.abort();
      release();
      const result = await pending;

      expect(result.reason).toBe('cancelled');
      expect(currentPreset()).toBe('balanced');
    });

    it('does not negative-cache a quota answer cancelled by the caller signal', async () => {
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          autoPreset: { enabled: true, refreshIntervalMs: 60_000, queryTimeoutMs: 20 },
        }),
      );
      const controller = new AbortController();
      const query = vi.mocked(ix.get(IProviderUsageService).queryUsage);
      query.mockImplementation(
        (providerId?: string, options?: { signal?: AbortSignal }) =>
          new Promise<readonly ProviderUsageResult[]>((resolve) => {
            if (providerId !== undefined) usageCalls.push(providerId);
            options?.signal?.addEventListener(
              'abort',
              () => {
                resolve([{ kind: 'error', provider: providerId ?? 'x', message: 'aborted' }]);
              },
              { once: true },
            );
          }),
      );

      const pending = autoPreset.evaluate(REQUEST, { sessionId: 'test-session', signal: controller.signal });
      controller.abort();
      await pending;

      const cancelledCalls = usageCalls.length;

      // The next spawn has no aborting signal: the previous cancellation must
      // not have been cached as an unknown, so every provider is re-queried.
      await autoPreset.evaluate(REQUEST, CTX);
      expect(usageCalls.length).toBeGreaterThan(cancelledCalls);
    });

    it('re-decides against the live preset inside the write lock instead of overwriting on a stale current', async () => {
      const presets: SubagentConfig['presets'] = {
        balanced: {
          explore: { model: 'route/balanced' },
          plan: { model: 'route/balanced' },
        },
        'kimi-heavy': {
          explore: { model: 'route/kimi' },
          plan: { model: 'route/kimi' },
        },
        'deepseek-heavy': {
          explore: { model: 'route/deepseek' },
          plan: { model: 'route/deepseek-plan' },
        },
      };
      await config.replace(SUBAGENT_SECTION, subagentConfigWith({ presets }));
      quotaResults.set('provider-balanced', okResult(5));
      quotaResults.set('provider-kimi', okResult(90));
      quotaResults.set('provider-deepseek', okResult(95));
      quotaResults.set('provider-deepseek-plan', okResult(85));

      const exploreReq: SubagentRouteRequest = {
        route: 'agent',
        profileName: 'explore',
        caller: { modelAlias: 'caller-model', thinkingLevel: 'low' },
      };
      const planReq: SubagentRouteRequest = {
        route: 'agent',
        profileName: 'plan',
        caller: { modelAlias: 'caller-model', thinkingLevel: 'low' },
      };

      const [a, b] = await Promise.all([
        autoPreset.evaluate(exploreReq, CTX),
        autoPreset.evaluate(planReq, CTX),
      ]);

      // Exactly one evaluation commits: the explore route prefers deepseek
      // (95 over 90) and the plan route prefers kimi (90 over 85) — different
      // choices driven by the same stale balanced current. Whichever commits
      // first, the other must re-decide against the live preset inside the
      // write lock and keep it instead of overwriting it.
      const committed = [a, b].filter(
        (evaluation) => evaluation.activatedPreset !== undefined,
      );
      expect(committed).toHaveLength(1);
      const finalPreset = committed[0]!.activatedPreset!;
      expect(currentPreset()).toBe(finalPreset);
      const kept = [a, b].find((evaluation) => evaluation.activatedPreset === undefined)!;
      expect(kept.currentPreset).toBe(finalPreset);
      expect(kept.reason).not.toContain('failed');
    });

    it('rechecks the experimental flag inside the shared activation lock', async () => {
      const activation = ix.get(ISubagentPresetActivationService);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = activation.runExclusive(async () => gate);
      setQuota('provider-balanced', okResult(5));
      setQuota('provider-kimi', okResult(95));

      const pending = autoPreset.evaluate(REQUEST, CTX);
      await vi.waitFor(() => expect(usageCalls.length).toBeGreaterThan(0));
      (ix.get(IFlagService).enabled as ReturnType<typeof vi.fn>).mockReturnValue(false);
      release();
      await blocker;
      const result = await pending;

      expect(result.reason).toBe('flag disabled');
      expect(currentPreset()).toBe('balanced');
    });

    it('rechecks auto_preset.enabled inside the shared activation lock', async () => {
      const activation = ix.get(ISubagentPresetActivationService);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = activation.runExclusive(async () => gate);
      setQuota('provider-balanced', okResult(5));
      setQuota('provider-kimi', okResult(95));

      const pending = autoPreset.evaluate(REQUEST, CTX);
      await vi.waitFor(() => expect(usageCalls.length).toBeGreaterThan(0));
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: false } }),
      );
      release();
      await blocker;
      const result = await pending;

      expect(result.reason).toBe('auto preset disabled');
      expect(currentPreset()).toBe('balanced');
    });

    it('rechecks candidate settings inside the shared activation lock', async () => {
      const activation = ix.get(ISubagentPresetActivationService);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = activation.runExclusive(async () => gate);
      setQuota('provider-balanced', okResult(5));
      setQuota('provider-kimi', okResult(95));

      const pending = autoPreset.evaluate(REQUEST, CTX);
      await vi.waitFor(() => expect(usageCalls.length).toBeGreaterThan(0));
      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({
          autoPreset: { enabled: true, candidates: ['balanced'] },
        }),
      );
      release();
      await blocker;
      const result = await pending;

      expect(result.activatedPreset).toBeUndefined();
      expect(currentPreset()).toBe('balanced');
      expect(result.reason).toMatch(/quota floor|already optimal|config changed/);
    });

    it('does not overwrite a same-value manual selection made during quota queries', async () => {
      setQuota('provider-balanced', okResult(5));
      setQuota('provider-kimi', okResult(95));
      setQuota('provider-deepseek', okResult(90));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const query = vi.mocked(ix.get(IProviderUsageService).queryUsage);
      query.mockImplementation(async (providerId?: string) => {
        if (providerId === undefined) return [];
        usageCalls.push(providerId);
        await gate;
        const result = quotaResults.get(providerId);
        return result === undefined
          ? [{ kind: 'error', provider: providerId, message: 'down' }]
          : [{ ...result, provider: providerId }];
      });

      const automatic = autoPreset.evaluate(REQUEST, CTX);
      await vi.waitFor(() => expect(usageCalls.length).toBeGreaterThan(0));
      const manual = await ix.get(ISubagentPresetActivationService).activate('kimi-heavy');
      expect(manual.kind).toBe('activated');
      release();
      const result = await automatic;

      // The manual selection stamped the manual lock, so the commit recheck
      // defers without overwriting the human choice.
      expect(result.reason).toBe('manual preset selection');
      expect(result.activatedPreset).toBeUndefined();
      expect(currentPreset()).toBe('kimi-heavy');
    });

    it('does not overwrite a different-value manual selection made during quota queries', async () => {
      setQuota('provider-balanced', okResult(5));
      setQuota('provider-kimi', okResult(95));
      setQuota('provider-deepseek', okResult(90));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const query = vi.mocked(ix.get(IProviderUsageService).queryUsage);
      query.mockImplementation(async (providerId?: string) => {
        if (providerId === undefined) return [];
        usageCalls.push(providerId);
        await gate;
        const result = quotaResults.get(providerId);
        return result === undefined
          ? [{ kind: 'error', provider: providerId, message: 'down' }]
          : [{ ...result, provider: providerId }];
      });

      const automatic = autoPreset.evaluate(REQUEST, CTX);
      await vi.waitFor(() => expect(usageCalls.length).toBeGreaterThan(0));
      const manual = await ix.get(ISubagentPresetActivationService).activate('kimi-heavy');
      expect(manual.kind).toBe('activated');
      release();
      const result = await automatic;

      // The manual choice itself is never replaced — even when it differs from
      // what the stale scoring would have activated.
      expect(result.reason).toBe('manual preset selection');
      expect(result.activatedPreset).toBeUndefined();
      expect(currentPreset()).toBe('kimi-heavy');
    });

    it('clears a manual preset to base routing through the shared activation boundary', async () => {
      const activation = ix.get(ISubagentPresetActivationService);
      const revision = activation.manualRevision;

      const result = await activation.activate('');

      expect(result.kind).toBe('activated');
      expect(currentPreset()).toBe('');
      expect(activation.manualRevision).toBe(revision + 1);
    });

    it('shares the write lock with manual activation so the later human choice wins', async () => {
      setQuota('provider-balanced', okResult(5));
      setQuota('provider-kimi', okResult(95));
      setQuota('provider-deepseek', okResult(90));
      const activation = ix.get(ISubagentPresetActivationService);
      const originalSet = config.set.bind(config);
      let autoCommitStarted!: () => void;
      const autoCommit = new Promise<void>((resolve) => {
        autoCommitStarted = resolve;
      });
      let releaseAutoCommit!: () => void;
      const autoCommitGate = new Promise<void>((resolve) => {
        releaseAutoCommit = resolve;
      });
      config.set = vi.fn(async (domain, patch, target = ConfigTarget.User) => {
        if (
          domain === SUBAGENT_SECTION &&
          target === ConfigTarget.User &&
          isObject(patch) &&
          patch['preset'] === 'kimi-heavy'
        ) {
          autoCommitStarted();
          await autoCommitGate;
        }
        await originalSet(domain, patch, target);
      });

      const automatic = autoPreset.evaluate(REQUEST, CTX);
      await autoCommit;
      let manualSettled = false;
      const manual = activation.activate('deepseek-heavy').finally(() => {
        manualSettled = true;
      });
      await Promise.resolve();
      expect(manualSettled).toBe(false);

      releaseAutoCommit();
      const [automaticResult, manualResult] = await Promise.all([automatic, manual]);

      expect(automaticResult.activatedPreset).toBe('kimi-heavy');
      expect(manualResult.kind).toBe('activated');
      expect(currentPreset()).toBe('deepseek-heavy');
    });
  });

  describe('persistence', () => {
    it('writes only [subagent].preset and syncs an existing memory overlay', async () => {
      await config.set(SUBAGENT_SECTION, { ...subagentConfigWith(), timeoutMs: 0 }, ConfigTarget.Memory);
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(95));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      const userValue = config.inspect<SubagentConfig>(SUBAGENT_SECTION).userValue;
      const memoryValue = config.inspect<SubagentConfig>(SUBAGENT_SECTION).memoryValue;
      expect(userValue).toMatchObject({ preset: 'kimi-heavy', timeoutMs: 3_600_000 });
      expect(memoryValue).toMatchObject({ preset: 'kimi-heavy', timeoutMs: 0 });
      // The effective preset changed, so the next resolve already sees it.
      expect(currentPreset()).toBe('kimi-heavy');
    });

    it('does not report cancellation after the User-layer commit has started', async () => {
      const activation = ix.get(ISubagentPresetActivationService);
      const originalSet = config.set.bind(config);
      let committed!: () => void;
      const userCommitted = new Promise<void>((resolve) => {
        committed = resolve;
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      config.set = vi.fn(async (domain, patch, target = ConfigTarget.User) => {
        await originalSet(domain, patch, target);
        if (target === ConfigTarget.User) {
          committed();
          await gate;
        }
      });
      const controller = new AbortController();

      const pending = activation.activate('kimi-heavy', controller.signal);
      await userCommitted;
      controller.abort();
      release();
      const result = await pending;

      expect(result.kind).toBe('activated');
      expect(currentPreset()).toBe('kimi-heavy');
    });

    it('reports a committed activation warning when Memory overlay alignment fails', async () => {
      await config.set(
        SUBAGENT_SECTION,
        { ...subagentConfigWith(), timeoutMs: 0 },
        ConfigTarget.Memory,
      );
      const activation = ix.get(ISubagentPresetActivationService);
      const originalSet = config.set.bind(config);
      config.set = vi.fn(async (domain, patch, target = ConfigTarget.User) => {
        if (target === ConfigTarget.Memory) throw new Error('memory write failed');
        await originalSet(domain, patch, target);
      });

      const result = await activation.activate('kimi-heavy');

      expect(result.kind).toBe('activated');
      if (result.kind !== 'activated') throw new Error('expected committed activation');
      expect(result.warning).toContain('Memory overlay');
      expect(config.inspect<SubagentConfig>(SUBAGENT_SECTION).userValue?.preset).toBe(
        'kimi-heavy',
      );
      expect(config.inspect<SubagentConfig>(SUBAGENT_SECTION).memoryValue?.preset).toBe(
        'balanced',
      );
    });

    it('keeps the current preset and logs a sanitized warn when the activation persist fails', async () => {
      config.failWrites = true;
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(95));
      const warn = ix.get(ILogService).warn as ReturnType<typeof vi.fn>;

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.reason).toContain('failed');
      expect(currentPreset()).toBe('balanced');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toBe(
        'auto subagent preset activation failed; keeping the current preset',
      );
    });

    it('end-to-end: a positive wallet takes over a depleted plan window only when opted in', async () => {
      quotaResults.set('provider-balanced', {
        kind: 'ok',
        provider: 'x',
        summary: null,
        limits: [{ used: 95, limit: 100 }],
        extraUsage: null,
      });
      quotaResults.set('provider-kimi', {
        kind: 'ok',
        provider: 'x',
        summary: null,
        limits: [],
        extraUsage: {
          balanceCents: 30,
          totalCents: 100,
          monthlyChargeLimitEnabled: false,
          monthlyChargeLimitCents: 0,
          monthlyUsedCents: 0,
          currency: 'USD',
        },
      });

      // Default (allowExtraUsage=false): the kimi wallet never counts → kimi is
      // unknown → balanced stays active even with only 5% left.
      await autoPreset.evaluate(REQUEST, CTX);
      expect(currentPreset()).toBe('balanced');
      const queriedBeforeToggle = usageCalls.length;

      await config.replace(
        SUBAGENT_SECTION,
        subagentConfigWith({ autoPreset: { enabled: true, allowExtraUsage: true } }),
      );

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBe('kimi-heavy');
      expect(usageCalls).toHaveLength(queriedBeforeToggle);
    });
  });

  describe('status and decision fact publishing', () => {
    it('publishes evaluated plus an explained preset_changed fact when a switch commits', async () => {
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(95));

      const result = await autoPreset.evaluate(REQUEST, { sessionId: 'session-42' });

      expect(result.activatedPreset).toBe('kimi-heavy');
      expect(result.reasonCode).toBe('current_unhealthy');
      expect(autoPreset.status()).toBe(result.status);
      const changed = publishedEvents.find(
        (event) => event.type === SUBAGENT_PRESET_CHANGED_EVENT_TYPE,
      );
      expect(changed?.payload).toMatchObject({
        sessionId: 'session-42',
        previousPreset: 'balanced',
        currentPreset: 'kimi-heavy',
        reasonCode: 'current_unhealthy',
        profileName: 'explore',
        evaluatedAt: result.status!.evaluatedAt,
        previousScore: result.status!.currentScore,
        currentScore: result.status!.selectedScore,
      });
      const evaluated = publishedEvents.find(
        (event) => event.type === SUBAGENT_PRESET_EVALUATED_EVENT_TYPE,
      );
      expect(evaluated?.payload).toMatchObject({
        ...result.status,
        sessionId: 'session-42',
      });
      expect(publishedEvents).toHaveLength(2);
      // The automatic switch never stamps the manual lock.
      expect(
        resolveSubagentAutoPresetConfig(config.get<SubagentConfig | undefined>(SUBAGENT_SECTION)),
      ).toMatchObject({ enabled: true, manualLock: false });
    });

    it('publishes an evaluated no-op with the candidate breakdown', async () => {
      setQuota('provider-balanced', okResult(90));
      setQuota('provider-kimi', okResult(95));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.reasonCode).toBe('current_optimal');
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]).toMatchObject({
        type: SUBAGENT_PRESET_EVALUATED_EVENT_TYPE,
        payload: {
          sessionId: 'test-session',
          reasonCode: 'current_optimal',
          currentPreset: 'balanced',
          candidates: result.status!.candidates,
        },
      });
    });

    it('publishes an evaluated early return when cancelled', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await autoPreset.evaluate(REQUEST, {
        sessionId: 'session-42',
        signal: controller.signal,
      });

      expect(result.reasonCode).toBe('cancelled');
      expect(result.status?.candidates).toEqual([]);
      expect(publishedEvents).toEqual([
        {
          type: SUBAGENT_PRESET_EVALUATED_EVENT_TYPE,
          payload: { ...result.status, sessionId: 'session-42' },
        },
      ]);
    });

    it('publishes only a sanitized evaluated fact when preset activation fails', async () => {
      config.failWrites = true;
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(95));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.reasonCode).toBe('activation_failed');
      expect(currentPreset()).toBe('balanced');
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]).toMatchObject({
        type: SUBAGENT_PRESET_EVALUATED_EVENT_TYPE,
        payload: { reasonCode: 'activation_failed' },
      });
      expect(JSON.stringify(publishedEvents)).not.toContain('disk full');
    });

    it('publishes only an evaluated fact when a commit has no effective change', async () => {
      await config.set(SUBAGENT_SECTION, subagentConfigWith(), ConfigTarget.Memory);
      const originalSet = config.set.bind(config);
      config.set = vi.fn(async (domain, patch, target = ConfigTarget.User) => {
        if (target === ConfigTarget.Memory) throw new Error('memory write failed');
        await originalSet(domain, patch, target);
      });
      setQuota('provider-balanced', okResult(20));
      setQuota('provider-kimi', okResult(95));

      const result = await autoPreset.evaluate(REQUEST, CTX);

      expect(result.activatedPreset).toBeUndefined();
      expect(result.reasonCode).toBe('activation_no_effect');
      expect(currentPreset()).toBe('balanced');
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]).toMatchObject({
        type: SUBAGENT_PRESET_EVALUATED_EVENT_TYPE,
        payload: { reasonCode: 'activation_no_effect' },
      });
    });
  });
});

describe('AutoSubagentPresetService route model alignment', () => {
  // The candidate's provider comes from the route model resolved for that
  // preset (`resolveSubagentBindingForPreset`), not from the active preset.
  it('aligns providers through the candidate route model', async () => {
    const disposables = new DisposableStore();
    const ix = disposables.add(new TestInstantiationService());
    const config = new LayeredConfigStub({ subagent: subagentConfigWith() });
    const queries: string[] = [];
    ix.stub(IConfigService, config);
    ix.stub(IFlagService, {
      _serviceBrand: undefined,
      enabled: () => true,
      registry: {
        _serviceBrand: undefined,
        register: () => ({ dispose: () => {} }),
        get: () => undefined,
        list: () => [],
      },
      snapshot: () => ({}),
      enabledIds: () => [],
      explain: () => undefined,
      explainAll: () => [],
      setConfigOverrides: () => {},
    } as unknown as IFlagService);
    ix.stub(IModelCatalog, modelCatalogFor(ROUTES));
    ix.stub(IAgentRunUsageService, new FakeRunUsageService() as unknown as IAgentRunUsageService);
    ix.stub(IProviderUsageService, {
      _serviceBrand: undefined,
      queryUsage: vi.fn(async (providerId?: string) => {
        if (providerId !== undefined) queries.push(providerId);
        return [{ kind: 'error', provider: providerId ?? 'x', message: 'no' }];
      }),
    } as unknown as IProviderUsageService);
    ix.stub(ILogService, {
      _serviceBrand: undefined,
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: () => ({} as ILogService),
      level: 'warn',
      setLevel: () => {},
      flush: async () => {},
    } as unknown as ILogService);
    ix.stub(IHostClock, {
      _serviceBrand: undefined,
      now: () => new Date(),
      timeZone: () => 'UTC',
    });
    ix.stub(IEventService, {
      _serviceBrand: undefined,
      publish: vi.fn(),
      subscribe: () => ({ dispose: () => {} }),
      onDidPublish: () => () => {},
      listenerCount: 0,
    } as unknown as IEventService);
    ix.set(
      ISubagentPresetActivationService,
      new SyncDescriptor(SubagentPresetActivationService),
    );
    ix.set(IAutoSubagentPresetService, new SyncDescriptor(AutoSubagentPresetService));
    const service = ix.get(IAutoSubagentPresetService);

    // Every candidate route resolves to its own provider; the balanced preset
    // (current) and the kimi preset both get queried even though only balanced
    // is active, because scoring reasons about every configured candidate.
    await service.evaluate(REQUEST, { sessionId: 'test-session' });
    expect(queries.toSorted()).toEqual(['provider-balanced', 'provider-deepseek', 'provider-kimi']);
    disposables.dispose();
  });
});