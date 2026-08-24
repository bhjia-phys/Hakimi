/**
 * Scenario: the main-agent-only `GetProviderUsage` and `SetSubagentPreset`
 * tools.
 * Responsibilities: model-facing behavior of both tools — structured usage
 * JSON vs sanitized failures; preset validation, atomic activation, and the
 * guarantee that the main model / default model / thinking never change;
 * main-agent-only gating via the tool contribution table.
 * Wiring: tools are instantiated directly with stubbed collaborators; the
 * binding proof uses the real `resolveSubagentBinding` against a stub config.
 * Run: `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run test/agent/tools/providerUsageTools.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServicesAccessor } from '#/_base/di/instantiation';
import { IOAuthService } from '#/app/auth/auth';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { getAgentToolContributions } from '#/agent/toolRegistry/toolContribution';
import {
  ConfigTarget,
  type ConfigInspectValue,
  type IConfigService,
} from '#/app/config/config';
import { IProviderUsageService, type ProviderUsageResult } from '#/app/providerUsage/providerUsage';
import {
  MANAGED_OAUTH_USAGE_ERROR_MESSAGE,
  ProviderUsageService,
} from '#/app/providerUsage/providerUsageService';
import { IProviderService } from '#/kosong/provider/provider';
import { IModelCatalog, type Model } from '#/kosong/model/catalog';
import {
  resolveSubagentBinding,
  SUBAGENT_SECTION,
  type SubagentConfig,
} from '#/session/subagent/configSection';

import { GetProviderUsageTool } from '#/agent/tools/provider-usage/providerUsageTool';
import { SetSubagentPresetTool } from '#/agent/tools/subagent-preset/subagentPresetTool';
import { getAgentProfileContributions } from '#/app/agentProfileCatalog/contribution';
import '#/session/agentLifecycle/profile/profiles';
import { stubFlag } from '../../app/flag/stubs';
import { StubConfigService } from '../../kosong/stubs';

const signal = new AbortController().signal;

function stubModelCatalog(valid: readonly string[]): IModelCatalog {
  return {
    _serviceBrand: undefined,
    get: (id: string): Model => {
      if (valid.includes(id)) return {} as Model;
      throw new Error(`model ${id} not found`);
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

function stubUsageService(results: ProviderUsageResult[]): IProviderUsageService {
  return {
    _serviceBrand: undefined,
    queryUsage: vi.fn(async () => results),
  } as unknown as IProviderUsageService;
}

const SUBAGENT_SECTION_WITH_PRESETS = {
  timeoutMs: 3600000,
  preset: 'balanced',
  agents: { coder: { model: 'kimi-for-coding' } },
  presets: {
    balanced: {
      coder: { model: 'kimi-for-coding', thinkingEffort: 'high' },
      swarm: { model: 'kimi-for-coding' },
    },
    'kimi-heavy': {
      coder: { model: 'kimi-latest-heavy', thinkingEffort: 'high' },
    },
  },
};

/**
 * Target-aware config stub mirroring the real layered precedence
 * (memory overrides user): used to reproduce the print/headless
 * `ConfigTarget.Memory` overlay of the whole subagent section.
 */
class LayeredStubConfigService implements IConfigService {
  declare readonly _serviceBrand: undefined;
  readonly ready = Promise.resolve();
  private readonly user = new Map<string, unknown>();
  private readonly memory = new Map<string, unknown>();

  onDidChangeConfiguration = () => ({ dispose: () => {} });
  onDidSectionChange = () => ({ dispose: () => {} });
  onDidChangeDiagnostics = () => ({ dispose: () => {} });

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
    const userValue = this.user.get(domain) as T | undefined;
    const memoryValue = this.memory.get(domain) as T | undefined;
    return {
      value: this.get<T>(domain),
      defaultValue: undefined,
      userValue,
      memoryValue,
    };
  }

  getAll(): Record<string, unknown> {
    return {};
  }

  set(domain: string, patch: unknown, target: ConfigTarget = ConfigTarget.User): Promise<void> {
    const layer = target === ConfigTarget.Memory ? this.memory : this.user;
    const previous = layer.get(domain);
    const value =
      patch !== null && typeof patch === 'object'
        ? { ...(isObject(previous) ? previous : {}), ...patch }
        : patch;
    layer.set(domain, value);
    return Promise.resolve();
  }

  replace(domain: string, value: unknown, target: ConfigTarget = ConfigTarget.User): Promise<void> {
    const layer = target === ConfigTarget.Memory ? this.memory : this.user;
    if (value === undefined || value === null) {
      layer.delete(domain);
    } else {
      layer.set(domain, value);
    }
    return Promise.resolve();
  }

  replaceSections(sections: Readonly<Record<string, unknown>>): Promise<void> {
    for (const [domain, value] of Object.entries(sections)) {
      void this.replace(domain, value);
    }
    return Promise.resolve();
  }

  reload(): Promise<void> {
    return Promise.resolve();
  }

  diagnostics(): readonly never[] {
    return [];
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GetProviderUsageTool', () => {
  it('returns stable structured usage JSON for ok results', async () => {
    const usage = stubUsageService([
      {
        kind: 'ok',
        provider: 'kimi',
        summary: { used: 17, limit: 100, resetAt: '2030-01-01T00:00:00.000Z', window: { duration: 1, unit: 'week' } },
        limits: [],
        extraUsage: { balanceCents: 10000, totalCents: 20000, monthlyChargeLimitEnabled: true, monthlyChargeLimitCents: 20000, monthlyUsedCents: 5000, currency: 'USD' },
      },
      { kind: 'unsupported', provider: 'deepseek', message: 'Usage endpoint is not available for this provider.' },
    ]);
    const tool = new GetProviderUsageTool(usage);
    const execution = tool.resolveExecution({});
    if (execution.isError === true) throw new Error('execution should not be an error');

    const result = await execution.execute({ turnId: 0, toolCallId: 'call_usage', signal });

    expect(usage.queryUsage).toHaveBeenCalledWith(undefined, { signal });
    expect(result.isError).toBeFalsy();
    if (typeof result.output !== 'string') throw new Error('expected string output');
    const parsed = JSON.parse(result.output);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      kind: 'ok',
      provider: 'kimi',
      summary: { used: 17, limit: 100, resetAt: '2030-01-01T00:00:00.000Z' },
      extraUsage: { balanceCents: 10000, currency: 'USD' },
    });
    expect(parsed[1]).toMatchObject({ kind: 'unsupported', provider: 'deepseek' });
    expect(result.output).not.toContain('sk-');
  });

  it('reports a cancellation when the query resolves after the signal aborts', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const usage = stubUsageService([]);
    (usage.queryUsage as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await gate;
      return [];
    });
    const tool = new GetProviderUsageTool(usage);
    const execution = tool.resolveExecution({});
    if (execution.isError === true) throw new Error('execution should not be an error');
    const controller = new AbortController();

    const pending = execution.execute({
      turnId: 0,
      toolCallId: 'call_usage',
      signal: controller.signal,
    });
    controller.abort();
    release();
    const result = await pending;

    expect(result.isError).toBe(true);
    expect(result.output).toBe('Query cancelled.');
  });

  it('never forwards managed OAuth credential sentinels from the real service', async () => {
    const sentinel = 'REFRESH-TOKEN-SENTINEL-zz9';
    const oauth = {
      _serviceBrand: undefined,
      getManagedUsage: async () => ({
        kind: 'error' as const,
        status: 400,
        message: `token_endpoint rejected ${sentinel}`,
      }),
    };
    const providers = {
      _serviceBrand: undefined,
      get: () => undefined,
      list: () => ({}),
    };
    const usage = new ProviderUsageService(
      providers as unknown as IProviderService,
      oauth as unknown as IOAuthService,
    );
    const tool = new GetProviderUsageTool(usage);
    const execution = tool.resolveExecution({ provider: 'managed:kimi-code' });
    if (execution.isError === true) throw new Error('execution should not be an error');

    const result = await execution.execute({ turnId: 0, toolCallId: 'call_usage', signal });

    expect(result.isError).toBeFalsy();
    if (typeof result.output !== 'string') throw new Error('expected string output');
    expect(result.output).toContain('"kind": "error"');
    expect(result.output).toContain(MANAGED_OAUTH_USAGE_ERROR_MESSAGE);
    expect(result.output).not.toContain(sentinel);
    expect(result.output).not.toContain('token_endpoint');
  });

  it('passes a specified provider through', async () => {
    const usage = stubUsageService([
      { kind: 'error', provider: 'kimi', message: 'Authorization failed.' },
    ]);
    const tool = new GetProviderUsageTool(usage);
    const execution = tool.resolveExecution({ provider: 'kimi' });
    if (execution.isError === true) throw new Error('execution should not be an error');
    await execution.execute({ turnId: 0, toolCallId: 'call_usage', signal });
    expect(usage.queryUsage).toHaveBeenCalledWith('kimi', { signal });
  });

  it('cancels before querying when the signal is already aborted', async () => {
    const usage = stubUsageService([]);
    const tool = new GetProviderUsageTool(usage);
    const execution = tool.resolveExecution({});
    if (execution.isError === true) throw new Error('execution should not be an error');
    const aborted = new AbortController();
    aborted.abort();

    const result = await execution.execute({
      turnId: 0,
      toolCallId: 'call_usage',
      signal: aborted.signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toBe('Query cancelled.');
    expect(usage.queryUsage).not.toHaveBeenCalled();
  });

  it('sanitizes unexpected service failures instead of leaking details', async () => {
    const usage = stubUsageService([]);
    (usage.queryUsage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom sk-super-secret'),
    );
    const tool = new GetProviderUsageTool(usage);
    const execution = tool.resolveExecution({});
    if (execution.isError === true) throw new Error('execution should not be an error');

    const result = await execution.execute({ turnId: 0, toolCallId: 'call_usage', signal });

    expect(result.isError).toBe(true);
    expect(result.output).toBe('Failed to query provider usage.');
    expect(result.output).not.toContain('sk-super-secret');
  });
});

describe('SetSubagentPresetTool', () => {
  function createTool(config: IConfigService): SetSubagentPresetTool {
    return new SetSubagentPresetTool(config, stubModelCatalog(['kimi-for-coding', 'kimi-latest-heavy']));
  }

  it('rejects an unknown preset and lists the available ones', async () => {
    const config = new StubConfigService({ subagent: SUBAGENT_SECTION_WITH_PRESETS });
    const tool = createTool(config);
    const execution = tool.resolveExecution({ preset: 'nope' });
    expect(execution.isError).toBe(true);
    if (execution.isError !== true) return;
    expect(execution.output).toContain('Invalid subagent preset "nope"');
    expect(execution.output).toContain('balanced');
    expect(execution.output).toContain('kimi-heavy');
  });

  it('rejects activation when no presets are configured', () => {
    const config = new StubConfigService({ subagent: { timeoutMs: 1000 } });
    const tool = createTool(config);
    const execution = tool.resolveExecution({ preset: 'balanced' });
    expect(execution.isError).toBe(true);
  });

  it('rejects a preset whose route model does not resolve', () => {
    const config = new StubConfigService({
      subagent: { presets: { broken: { coder: { model: 'ghost-model' } } } },
    });
    const tool = createTool(config);
    const execution = tool.resolveExecution({ preset: 'broken' });
    expect(execution.isError).toBe(true);
    if (execution.isError !== true) return;
    expect(execution.output).toContain('ghost-model');
  });

  it('activates the preset atomically and leaves every other setting untouched', async () => {
    const config = new StubConfigService({
      subagent: SUBAGENT_SECTION_WITH_PRESETS,
      defaultModel: 'gpt-main-model',
      thinking: { level: 'high' },
    });
    const tool = createTool(config);
    const execution = tool.resolveExecution({ preset: 'kimi-heavy' });
    if (execution.isError === true) throw new Error('execution should not be an error');

    const result = await execution.execute({ turnId: 0, toolCallId: 'call_preset', signal });

    expect(result.isError).toBeFalsy();
    const active = config.get<Record<string, unknown>>(SUBAGENT_SECTION);
    expect(active?.['preset']).toBe('kimi-heavy');
    expect(active?.['presets']).toEqual(SUBAGENT_SECTION_WITH_PRESETS.presets);
    expect(active?.['agents']).toEqual(SUBAGENT_SECTION_WITH_PRESETS.agents);
    expect(active?.['timeoutMs']).toBe(3600000);
    expect(config.get('defaultModel')).toBe('gpt-main-model');
    expect(config.get('thinking')).toEqual({ level: 'high' });

    if (typeof result.output !== 'string') throw new Error('expected string output');
    const parsed = JSON.parse(result.output);
    expect(parsed).toMatchObject({
      preset: 'kimi-heavy',
      main_model_changed: false,
      routes: { coder: { model: 'kimi-latest-heavy', thinkingEffort: 'high' } },
    });
  });

  it('patches only the preset key into an existing print-mode memory overlay', async () => {
    const config = new LayeredStubConfigService();
    config.set(SUBAGENT_SECTION, SUBAGENT_SECTION_WITH_PRESETS, ConfigTarget.User);
    // `applyPrintModeConfigDefaults` overlays the whole effective subagent
    // section (with the print-timeout) into ConfigTarget.Memory.
    config.set(
      SUBAGENT_SECTION,
      { ...SUBAGENT_SECTION_WITH_PRESETS, timeoutMs: 0 },
      ConfigTarget.Memory,
    );
    expect(config.get<SubagentConfig>(SUBAGENT_SECTION).preset).toBe('balanced');
    expect(config.get<SubagentConfig>(SUBAGENT_SECTION).timeoutMs).toBe(0);

    const tool = createTool(config);
    const execution = tool.resolveExecution({ preset: 'kimi-heavy' });
    if (execution.isError === true) throw new Error('execution should not be an error');
    const result = await execution.execute({ turnId: 0, toolCallId: 'call_preset', signal });

    expect(result.isError).toBeFalsy();
    const userValue = config.inspect<SubagentConfig>(SUBAGENT_SECTION).userValue;
    const memoryValue = config.inspect<SubagentConfig>(SUBAGENT_SECTION).memoryValue;
    expect(userValue).toMatchObject({
      preset: 'kimi-heavy',
      presets: SUBAGENT_SECTION_WITH_PRESETS.presets,
      timeoutMs: 3600000,
    });
    expect(memoryValue).toMatchObject({
      preset: 'kimi-heavy',
      timeoutMs: 0,
      presets: SUBAGENT_SECTION_WITH_PRESETS.presets,
    });
    const effective = config.get<SubagentConfig>(SUBAGENT_SECTION);
    expect(effective.preset).toBe('kimi-heavy');
    expect(effective.timeoutMs).toBe(0);
  });

  it('re-validates before writing when the preset is deleted after resolve', async () => {
    const config = new StubConfigService({ subagent: SUBAGENT_SECTION_WITH_PRESETS });
    const tool = createTool(config);
    const execution = tool.resolveExecution({ preset: 'kimi-heavy' });
    if (execution.isError === true) throw new Error('execution should not be an error');
    config.setSilent(SUBAGENT_SECTION, {
      ...SUBAGENT_SECTION_WITH_PRESETS,
      presets: { balanced: SUBAGENT_SECTION_WITH_PRESETS.presets.balanced },
    });

    const result = await execution.execute({ turnId: 0, toolCallId: 'call_preset', signal });

    expect(result.isError).toBe(true);
    expect(result.output).toContain('Invalid subagent preset "kimi-heavy"');
    expect(config.get<SubagentConfig>(SUBAGENT_SECTION).preset).toBe('balanced');
  });

  it('re-validates before writing when a route model is broken after resolve', async () => {
    const config = new StubConfigService({ subagent: SUBAGENT_SECTION_WITH_PRESETS });
    const tool = createTool(config);
    const execution = tool.resolveExecution({ preset: 'kimi-heavy' });
    if (execution.isError === true) throw new Error('execution should not be an error');
    config.setSilent(SUBAGENT_SECTION, {
      ...SUBAGENT_SECTION_WITH_PRESETS,
      presets: {
        ...SUBAGENT_SECTION_WITH_PRESETS.presets,
        'kimi-heavy': { coder: { model: 'ghost-model' } },
      },
    });

    const result = await execution.execute({ turnId: 0, toolCallId: 'call_preset', signal });

    expect(result.isError).toBe(true);
    expect(result.output).toContain('ghost-model');
    expect(config.get<SubagentConfig>(SUBAGENT_SECTION).preset).toBe('balanced');
  });
});

describe('subagent preset routing takes effect immediately', () => {
  it('routes the next spawn to the newly activated preset while the main model stays put', async () => {
    const config = new StubConfigService({
      subagent: SUBAGENT_SECTION_WITH_PRESETS,
      defaultModel: 'gpt-main-model',
      thinking: { level: 'medium' },
    });
    const flag = stubFlag(true);
    const own = { modelAlias: 'gpt-main-model', thinkingLevel: 'medium' };
    const routing = { profileName: 'coder', route: 'agent' as const, caller: own };
    const modelCatalog = stubModelCatalog(['kimi-for-coding', 'kimi-latest-heavy']);

    const before = resolveSubagentBinding(config, flag, modelCatalog, routing);
    expect(before.model).toBe('kimi-for-coding');

    const tool = new SetSubagentPresetTool(config, modelCatalog);
    const execution = tool.resolveExecution({ preset: 'kimi-heavy' });
    if (execution.isError === true) throw new Error('execution should not be an error');
    await execution.execute({ turnId: 0, toolCallId: 'call_preset', signal });

    const after = resolveSubagentBinding(config, flag, modelCatalog, routing);
    expect(after.model).toBe('kimi-latest-heavy');
    expect(config.get('defaultModel')).toBe('gpt-main-model');
    expect(config.get('thinking')).toEqual({ level: 'medium' });
    expect(after.model).not.toBe(own.modelAlias);
  });
});

describe('provider usage / subagent preset tool main-agent gating', () => {
  const gatedTools = [
    ['GetProviderUsageTool', GetProviderUsageTool],
    ['SetSubagentPresetTool', SetSubagentPresetTool],
  ] as const;

  function accessorFor(agentId: string): ServicesAccessor {
    const scopeContext: IAgentScopeContext = {
      _serviceBrand: undefined,
      agentId,
      scope: () => '',
    };
    return { get: () => scopeContext } as unknown as ServicesAccessor;
  }

  it.each(gatedTools)('%s is contributed with a main-agent-only guard', (name, ctor) => {
    const contribution = getAgentToolContributions().find((c) => c.ctor === ctor);
    expect(contribution, `${name} contribution`).toBeDefined();
    const when = contribution?.options.when;
    expect(when, `${name} must gate on agent identity`).toBeDefined();
    expect(when?.(accessorFor('main'))).toBe(true);
    expect(when?.(accessorFor('sub-1'))).toBe(false);
  });
});

describe('provider usage / subagent preset tool profile policy', () => {
  const profiles = new Map(
    getAgentProfileContributions().map((profile) => [profile.name, profile]),
  );

  it('grants both tools only to the main agent profile', () => {
    const agentTools = profiles.get('agent')?.tools ?? [];
    const coderTools = profiles.get('coder')?.tools ?? [];
    const exploreTools = profiles.get('explore')?.tools ?? [];
    expect(agentTools).toContain('GetProviderUsage');
    expect(agentTools).toContain('SetSubagentPreset');
    expect(coderTools).not.toContain('GetProviderUsage');
    expect(coderTools).not.toContain('SetSubagentPreset');
    expect(exploreTools).not.toContain('GetProviderUsage');
    expect(exploreTools).not.toContain('SetSubagentPreset');
  });
});