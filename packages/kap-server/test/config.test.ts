import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  IAutoSubagentPresetService,
  IConfigService,
  IEventService,
  ISubagentPresetActivationService,
  type AutoSubagentPresetStatus,
  type GlobalEvent,
} from '@moonshot-ai/agent-core-v2';
import { ErrorCode } from '../src/protocol/error-codes';
import {
  configResponseSchema,
  subagentPresetActivationResponseSchema,
  subagentPresetStatusResponseSchema,
  type ConfigResponse,
  type SubagentPresetActivationResponse,
} from '../src/protocol/rest-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { type RunningServer, startServer } from '../src/start';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';
import { authedFetch, authHeaders } from './helpers/auth';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
  request_id: string;
}

const AUTO_PRESET_STATUS_FIXTURE = {
  evaluatedAt: 1_750_000_000_000,
  route: 'agent',
  profileName: 'reviewer',
  reasonCode: 'higher_score',
  currentPreset: 'balanced',
  selectedPreset: 'kimi-heavy',
  activatedPreset: 'kimi-heavy',
  currentScore: 58.5,
  selectedScore: 76.25,
  switchCooldownUntil: 1_750_000_030_000,
  candidates: [
    {
      preset: 'kimi-heavy',
      provider: 'provider-a',
      availability: 'healthy',
      selectable: true,
      score: 76.25,
      quotaRemainingPercent: 80,
      quotaResetAt: 1_750_003_600_000,
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
    },
  ],
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
} satisfies AutoSubagentPresetStatus;

describe('server-v2 /api/v1/config', () => {
  let server: RunningServer | undefined;
  let home: string | undefined;
  let base: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kimi-server-v2-config-'));
    await mkdir(join(home, '.git'));
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

  async function boot(toml?: string): Promise<void> {
    if (toml !== undefined) {
      await writeFile(join(home as string, 'config.toml'), toml, 'utf-8');
    }
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
    });
    base = `http://127.0.0.1:${server.port}`;
  }

  async function getConfig(): Promise<ConfigResponse> {
    const res = await authedFetch(server as RunningServer, base, '/api/v1/config');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Envelope<ConfigResponse>;
    expect(body.code).toBe(0);
    return configResponseSchema.parse(body.data);
  }

  async function patchConfig(patch: Record<string, unknown>): Promise<ConfigResponse> {
    const res = await authedFetch(server as RunningServer, base, '/api/v1/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Envelope<ConfigResponse>;
    expect(body.code).toBe(0);
    return configResponseSchema.parse(body.data);
  }

  async function activateSubagentPreset(preset: string): Promise<Envelope<unknown>> {
    const res = await authedFetch(
      server as RunningServer,
      base,
      '/api/v1/config/subagent-preset/activate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preset }),
      },
    );
    expect(res.status).toBe(200);
    return (await res.json()) as Envelope<unknown>;
  }

  /** Resolve when a matching `event.config.changed` is published on IEventService. */
  function waitForConfigChanged(
    predicate: (event: GlobalEvent) => boolean,
    timeoutMs = 3000,
  ): Promise<GlobalEvent> {
    const running = server as RunningServer;
    return new Promise((resolve, reject) => {
      let subscription: { dispose(): void } | undefined;
      const timer = setTimeout(() => {
        subscription?.dispose();
        reject(new Error('timed out waiting for event.config.changed'));
      }, timeoutMs);
      subscription = running.core.accessor.get(IEventService).onDidPublish((event) => {
        if (event.type !== 'event.config.changed' || !predicate(event)) return;
        clearTimeout(timer);
        subscription?.dispose();
        resolve(event);
      });
    });
  }

  /** Overwrite the config file atomically so the watcher never sees a half-written document. */
  async function replaceConfigFile(content: string): Promise<void> {
    const path = join(home as string, 'config.toml');
    const tmp = `${path}.tmp`;
    await writeFile(tmp, content, 'utf-8');
    await rename(tmp, path);
  }

  it('GET echoes default_permission_mode and derives yolo = false', async () => {
    await boot('default_permission_mode = "auto"\n');
    const cfg = await getConfig();
    expect(cfg.default_permission_mode).toBe('auto');
    expect(cfg.yolo).toBe(false);
  });

  it('POST { yolo: true } sets default_permission_mode = yolo and echoes yolo = true', async () => {
    await boot();
    const cfg = await patchConfig({ yolo: true });
    expect(cfg.default_permission_mode).toBe('yolo');
    expect(cfg.yolo).toBe(true);

    const after = await getConfig();
    expect(after.default_permission_mode).toBe('yolo');
    expect(after.yolo).toBe(true);
  });

  it('POST { default_permission_mode: auto } writes the canonical field and derives yolo = false', async () => {
    await boot();
    const cfg = await patchConfig({ default_permission_mode: 'auto' });
    expect(cfg.default_permission_mode).toBe('auto');
    expect(cfg.yolo).toBe(false);

    const after = await getConfig();
    expect(after.default_permission_mode).toBe('auto');
    expect(after.yolo).toBe(false);
  });

  it('POST { secondary_model } persists the subagent model pool and GET echoes it', async () => {
    await boot();
    const cfg = await patchConfig({
      secondary_model: {
        default_model: 'provider/fast',
        models: { 'provider/fast': 'fast and cheap' },
      },
    });
    expect(cfg.secondary_model).toMatchObject({ defaultModel: 'provider/fast' });

    const after = await getConfig();
    expect(after.secondary_model).toMatchObject({
      defaultModel: 'provider/fast',
      models: { 'provider/fast': 'fast and cheap' },
    });
  });

  it('POST { secondary_model } preserves pool alias keys containing underscores', async () => {
    await boot();
    await patchConfig({
      secondary_model: { default_model: 'provider/fast_model', models: { 'provider/fast_model': '' } },
    });

    const after = await getConfig();
    expect(after.secondary_model).toMatchObject({
      defaultModel: 'provider/fast_model',
      models: { 'provider/fast_model': '' },
    });
    expect(
      Object.keys((after.secondary_model as { models: Record<string, string> }).models),
    ).not.toContain('provider/fastModel');
  });

  it('POST { providers } converts fields of a provider id colliding with a map-valued key', async () => {
    await boot();
    await patchConfig({
      providers: {
        models: { type: 'openai', base_url: 'https://example.test', api_key: 'sk-test' },
      },
    });

    const after = await getConfig();
    expect(after.providers['models']).toMatchObject({
      type: 'openai',
      base_url: 'https://example.test',
      has_api_key: true,
    });
  });

  it('allowlists passthrough config before REST, config events, and the durable journal', async () => {
    await boot();
    const secret = 'PASSTHROUGH_SECRET_SENTINEL';
    const eventPromise = waitForConfigChanged((event) =>
      (event.payload as { changedFields?: string[] }).changedFields?.includes('services') === true,
    );

    const cfg = await patchConfig({
      services: {
        moonshot_fetch: {
          base_url: 'https://example.test',
          api_key: secret,
          oauth: { storage: 'file', key: secret, oauth_host: 'https://oauth.test' },
          custom_headers: { Authorization: `Bearer ${secret}`, 'X-Api-Key': secret },
        },
        custom_extension: { token: secret, private_key: secret },
      },
      models: {
        'provider/secure': {
          provider_id: 'provider',
          base_url: 'https://models.example.test',
          protocol: 'openai',
          model: 'safe-model',
          max_output_size: 2048,
          bearer_token: secret,
          credential: { private_key: secret },
          api_key: secret,
          overrides: { max_output_size: 1024, private_key: secret },
        },
      },
    });
    const event = await eventPromise;
    const after = await getConfig();

    expect(cfg.services).toEqual({ moonshotFetch: { baseUrl: 'https://example.test' } });
    expect(cfg.models).toEqual({
      'provider/secure': {
        providerId: 'provider',
        baseUrl: 'https://models.example.test',
        protocol: 'openai',
        model: 'safe-model',
        maxOutputSize: 2048,
        overrides: { maxOutputSize: 1024 },
      },
    });
    expect(JSON.stringify({ cfg, event, after })).not.toContain(secret);
    expect(JSON.stringify({ cfg, event, after })).not.toContain('customExtension');
    expect(JSON.stringify({ cfg, event, after })).not.toContain('bearerToken');
    expect(JSON.stringify({ cfg, event, after })).not.toContain('credential');
    expect(JSON.stringify({ cfg, event, after })).not.toContain('privateKey');

    let journal = '';
    await vi.waitFor(async () => {
      journal = await readFile(
        join(home as string, 'server', 'events', '__global__.jsonl'),
        'utf-8',
      );
      expect(journal).toContain('event.config.changed');
    });
    expect(journal).not.toContain(secret);
    expect(journal).not.toContain('customExtension');
    expect(journal).not.toContain('bearerToken');
    expect(journal).not.toContain('credential');
    expect(journal).not.toContain('privateKey');
  });

  it('omits unknown top-level domains from REST, events, and the durable journal', async () => {
    const secret = 'UNKNOWN_DOMAIN_SECRET_SENTINEL';
    await boot(
      `[plugin_auth]\ntoken = "${secret}"\nprivate_key = "${secret}"\ncredential = "${secret}"\n`,
    );

    const rest = await authedFetch(server as RunningServer, base, '/api/v1/config');
    const restBody = (await rest.json()) as Envelope<Record<string, unknown>>;
    expect(restBody.code).toBe(0);
    expect(JSON.stringify(restBody)).not.toContain(secret);
    expect(restBody.data['plugin_auth']).toBeUndefined();
    expect(restBody.data['pluginAuth']).toBeUndefined();

    const eventPromise = waitForConfigChanged((event) =>
      (event.payload as { changedFields?: string[] }).changedFields?.includes('telemetry') === true,
    );
    await patchConfig({ telemetry: false });
    const event = await eventPromise;
    expect(JSON.stringify(event)).not.toContain(secret);
    expect(JSON.stringify(event)).not.toContain('pluginAuth');

    let journal = '';
    await vi.waitFor(async () => {
      journal = await readFile(
        join(home as string, 'server', 'events', '__global__.jsonl'),
        'utf-8',
      );
      expect(journal).toContain('event.config.changed');
    });
    expect(journal).not.toContain(secret);
    expect(journal).not.toContain('pluginAuth');
  });

  it('session create ignores a broken legacy subagent model pool while the experiment is on', async () => {
    await boot(
      '[experimental]\n"secondary-model" = true\n\n[secondary_model.models]\n"provider/fast" = "fast and cheap"\n',
    );
    const res = await authedFetch(server as RunningServer, base, '/api/v1/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metadata: { cwd: home as string } }),
    });
    const body = (await res.json()) as Envelope<{ id: string }>;
    expect(body.code).toBe(0);
  });

  it('session create ignores a broken legacy subagent model pool while the experiment is off', async () => {
    await boot('[secondary_model.models]\n"provider/fast" = "fast and cheap"\n');
    const res = await authedFetch(server as RunningServer, base, '/api/v1/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metadata: { cwd: home as string } }),
    });
    const body = (await res.json()) as Envelope<{ id: string }>;
    expect(body.code).toBe(0);
  });

  it('POST { subagent.preset } uses manual activation while merging the remaining route fields', async () => {
    await boot();
    const activation = (server as RunningServer).core.accessor.get(
      ISubagentPresetActivationService,
    );

    const cfg = await patchConfig({
      subagent: {
        preset: 'research',
        timeout_ms: 1234,
        agents: { main: { thinking_effort: 'low' } },
        presets: {
          research: {
            main: { thinking_effort: 'high' },
            swarm: { thinking_effort: 'medium' },
          },
        },
      },
    });

    expect(cfg.subagent).toMatchObject({
      preset: 'research',
      timeoutMs: 1234,
      autoPreset: { manualLock: true },
      agents: { main: { thinkingEffort: 'low' } },
      presets: {
        research: {
          main: { thinkingEffort: 'high' },
          swarm: { thinkingEffort: 'medium' },
        },
      },
    });
    expect(activation.manualRevision).toBe(1);
    const after = await getConfig();
    expect(after.subagent).toEqual(cfg.subagent);
  });

  it('lets a generic POST manual preset win after a competing automatic transaction', async () => {
    await boot(
      '[subagent]\npreset = "balanced"\n\n[subagent.presets.balanced.reviewer]\nthinking_effort = "high"\n\n[subagent.presets.deep.reviewer]\nthinking_effort = "max"\n',
    );
    const running = server as RunningServer;
    const activation = running.core.accessor.get(ISubagentPresetActivationService);
    let automaticEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      automaticEntered = resolve;
    });
    let releaseAutomatic!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseAutomatic = resolve;
    });
    const automatic = activation.runExclusive(async (transaction) => {
      automaticEntered();
      await gate;
      return transaction.activate('balanced');
    });
    await entered;

    const manual = patchConfig({
      subagent: { preset: 'deep', timeout_ms: 4321 },
    });
    await vi.waitFor(() => {
      expect(
        running.core.accessor.get(IConfigService).get<{ timeoutMs?: number }>('subagent')
          .timeoutMs,
      ).toBe(4321);
    });
    releaseAutomatic();
    const [automaticResult, manualConfig] = await Promise.all([automatic, manual]);

    expect(automaticResult.kind).toBe('activated');
    expect(manualConfig.subagent).toMatchObject({
      preset: 'deep',
      timeoutMs: 4321,
      autoPreset: { manualLock: true },
    });
    expect(activation.manualRevision).toBe(1);
    expect((await getConfig()).subagent).toEqual(manualConfig.subagent);
  });

  it('deep-merges the Web automatic-preset gates without replacing routes or other flags', async () => {
    await boot(
      '[experimental]\nexisting_flag = true\n\n[subagent]\npreset = "balanced"\n\n[subagent.presets.balanced.agent]\nmodel = "provider/base"\n',
    );

    const cfg = await patchConfig({
      experimental: { auto_subagent_preset: true },
      subagent: { autoPreset: { enabled: true } },
    });

    expect(cfg.experimental).toEqual({ existing_flag: true, auto_subagent_preset: true });
    expect(cfg.subagent).toMatchObject({
      preset: 'balanced',
      autoPreset: { enabled: true },
      presets: { balanced: { agent: { model: 'provider/base' } } },
    });
  });

  it('returns the latest automatic-preset status without persisting or leaking extra fields', async () => {
    await boot('[subagent]\npreset = "balanced"\n');
    const configPath = join(home as string, 'config.toml');
    const configBefore = await readFile(configPath, 'utf8');

    const emptyResponse = await authedFetch(
      server as RunningServer,
      base,
      '/api/v1/config/subagent-preset/status',
    );
    expect(emptyResponse.status).toBe(200);
    const emptyBody = (await emptyResponse.json()) as Envelope<unknown>;
    expect(emptyBody.code).toBe(0);
    expect(subagentPresetStatusResponseSchema.parse(emptyBody.data)).toBeNull();

    const secret = 'RUNTIME_STATUS_SECRET_SENTINEL';
    const runtimeStatus = {
      ...AUTO_PRESET_STATUS_FIXTURE,
      internalCredential: secret,
    } as AutoSubagentPresetStatus;
    vi.spyOn(
      (server as RunningServer).core.accessor.get(IAutoSubagentPresetService),
      'status',
    ).mockReturnValue(runtimeStatus);

    const response = await authedFetch(
      server as RunningServer,
      base,
      '/api/v1/config/subagent-preset/status',
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Envelope<unknown>;
    expect(body.code).toBe(0);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(subagentPresetStatusResponseSchema.parse(body.data)).toEqual({
      evaluated_at: 1_750_000_000_000,
      route: 'agent',
      profile_name: 'reviewer',
      reason_code: 'higher_score',
      current_preset: 'balanced',
      selected_preset: 'kimi-heavy',
      activated_preset: 'kimi-heavy',
      current_score: 58.5,
      selected_score: 76.25,
      switch_cooldown_until: 1_750_000_030_000,
      candidates: [
        {
          preset: 'kimi-heavy',
          provider: 'provider-a',
          availability: 'healthy',
          selectable: true,
          score: 76.25,
          quota_remaining_percent: 80,
          quota_reset_at: 1_750_003_600_000,
          contributions: {
            quota_remaining: 80,
            priority_bonus: 8,
            reset_bonus: 1,
            route_fit_bonus: 2,
            token_penalty: 3,
            reliability_penalty: 7.5,
            latency_penalty: 4.25,
          },
          local_evidence: {
            scope: 'profile',
            sample_count: 8,
            failure_count: 1,
            adjusted_failure_rate: 0.15,
            token_count: 42_000,
            average_first_token_latency_ms: 320,
            first_token_latency_sample_count: 9,
            llm_request_count: 12,
          },
        },
      ],
      policy: {
        quota_floor_percent: 10,
        switch_margin_percent: 5,
        local_usage_window_ms: 86_400_000,
        local_usage_weight_percent: 10,
        priority_weight_percent: 20,
        reliability_weight_percent: 15,
        latency_weight_percent: 10,
        switch_cooldown_ms: 30_000,
        circuit_breaker_failure_threshold: 3,
        circuit_breaker_cooldown_ms: 60_000,
      },
    });

    const configResponse = await authedFetch(server as RunningServer, base, '/api/v1/config');
    const configBody = (await configResponse.json()) as Envelope<Record<string, unknown>>;
    expect(configBody.data['subagent_preset_status']).toBeUndefined();
    expect(configBody.data['status']).toBeUndefined();
    expect(JSON.stringify(configBody)).not.toContain(secret);
    await expect(readFile(configPath, 'utf8')).resolves.toBe(configBefore);
  });

  it('rejects invalid count, rate, percent, and contribution values at the REST projector', async () => {
    await boot();
    const candidate = AUTO_PRESET_STATUS_FIXTURE.candidates[0]!;
    const invalidStatuses = [
      {
        ...AUTO_PRESET_STATUS_FIXTURE,
        candidates: [{
          ...candidate,
          localEvidence: { ...candidate.localEvidence, firstTokenLatencySampleCount: 1.5 },
        }],
      },
      {
        ...AUTO_PRESET_STATUS_FIXTURE,
        candidates: [{
          ...candidate,
          localEvidence: { ...candidate.localEvidence, adjustedFailureRate: 1.01 },
        }],
      },
      {
        ...AUTO_PRESET_STATUS_FIXTURE,
        candidates: [{ ...candidate, quotaRemainingPercent: 101 }],
      },
      {
        ...AUTO_PRESET_STATUS_FIXTURE,
        policy: { ...AUTO_PRESET_STATUS_FIXTURE.policy, latencyWeightPercent: 101 },
      },
      {
        ...AUTO_PRESET_STATUS_FIXTURE,
        candidates: [{
          ...candidate,
          contributions: { ...candidate.contributions, tokenPenalty: -1 },
        }],
      },
    ];
    const status = vi.spyOn(
      (server as RunningServer).core.accessor.get(IAutoSubagentPresetService),
      'status',
    );

    for (const invalid of invalidStatuses) {
      status.mockReturnValueOnce(invalid as unknown as AutoSubagentPresetStatus);
      const response = await authedFetch(
        server as RunningServer,
        base,
        '/api/v1/config/subagent-preset/status',
      );
      const body = (await response.json()) as Envelope<unknown>;
      expect(body.code).toBe(0);
      expect(body.data).toBeNull();
    }
  });

  it('activates and clears a preset through the shared manual activation boundary', async () => {
    await boot(
      '[subagent]\npreset = "balanced"\n\n[subagent.presets.balanced.reviewer]\nthinking_effort = "high"\n\n[subagent.presets.deep.reviewer]\nthinking_effort = "max"\n',
    );
    const activation = (server as RunningServer).core.accessor.get(
      ISubagentPresetActivationService,
    );

    const activated = await activateSubagentPreset('deep');
    expect(activated.code).toBe(0);
    const activatedData = subagentPresetActivationResponseSchema.parse(
      activated.data,
    ) satisfies SubagentPresetActivationResponse;
    expect(activatedData.config.subagent).toMatchObject({ preset: 'deep' });
    expect(activation.manualRevision).toBe(1);

    const cleared = await activateSubagentPreset('');
    expect(cleared.code).toBe(0);
    const clearedData = subagentPresetActivationResponseSchema.parse(
      cleared.data,
    ) satisfies SubagentPresetActivationResponse;
    expect(clearedData.config.subagent).toMatchObject({ preset: '' });
    expect(activation.manualRevision).toBe(2);
  });

  it('rejects an invalid preset route before changing the active selector', async () => {
    await boot(
      '[subagent]\npreset = "balanced"\n\n[subagent.presets.balanced.reviewer]\nthinking_effort = "high"\n\n[subagent.presets.broken.reviewer]\nmodel = "missing/model"\n',
    );

    const rejected = await activateSubagentPreset('broken');

    expect(rejected.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(rejected.msg).toContain('could not be resolved');
    expect((await getConfig()).subagent).toMatchObject({ preset: 'balanced' });
  });

  it('external config-file reload publishes ONE merged configChanged event', async () => {
    await boot('default_permission_mode = "auto"\n[experimental]\n"secondary-model" = true\n');
    const eventPromise = waitForConfigChanged((event) => {
      const payload = event.payload as { changedFields: string[] };
      return (
        payload.changedFields.includes('default_permission_mode') &&
        payload.changedFields.includes('experimental')
      );
    });
    // Two domains change in one reload — the bridge must merge them into a
    // single synchronously-batched event.
    await replaceConfigFile(
      'default_permission_mode = "yolo"\n[experimental]\n"secondary-model" = false\n',
    );
    const event = await eventPromise;
    const payload = event.payload as { changedFields: string[]; config: ConfigResponse };
    expect(payload.changedFields.sort()).toEqual(['default_permission_mode', 'experimental']);
    const cfg = configResponseSchema.parse(payload.config);
    expect(cfg.default_permission_mode).toBe('yolo');
    expect(cfg.yolo).toBe(true);
    expect(cfg.experimental).toEqual({ 'secondary-model': false });
  });

  it('POST /config set publishes exactly one configChanged event (no reload echoing a set)', async () => {
    await boot();
    const published: GlobalEvent[] = [];
    const subscription = (server as RunningServer).core.accessor
      .get(IEventService)
      .onDidPublish((event) => published.push(event));
    try {
      await patchConfig({ default_permission_mode: 'auto' });
      // The set writes config.toml, which the file watcher turns into a reload.
      // That reload is a no-op (the file matches the write base) and must NOT
      // publish a second event — settle past the watcher debounce to catch an
      // echo that would arrive ~150ms later.
      await new Promise((resolve) => setTimeout(resolve, 500));
      const changed = published.filter((event) => event.type === 'event.config.changed');
      expect(changed).toHaveLength(1);
      const payload = changed[0]!.payload as { changedFields: string[]; config: ConfigResponse };
      expect(payload.changedFields).toEqual(['default_permission_mode']);
      expect(configResponseSchema.parse(payload.config).default_permission_mode).toBe('auto');
    } finally {
      subscription.dispose();
    }
  });
});

describe('server-v2 config changed → WS global fan-out (real connection)', () => {
  let server: RunningServer | undefined;
  let home: string | undefined;
  let base: string;
  let wsUrl: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kimi-server-v2-config-ws-'));
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

  async function boot(toml?: string): Promise<void> {
    if (toml !== undefined) {
      await writeFile(join(home as string, 'config.toml'), toml, 'utf-8');
    }
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
    });
    base = `http://127.0.0.1:${server.port}`;
    wsUrl = `ws://127.0.0.1:${server.port}/api/v1/ws`;
  }

  /** Open a raw WS connection (no hello) — acceptable as a global target. */
  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const token = (server as RunningServer).authTokenService.getToken();
      const ws = new WebSocket(wsUrl, [`kimi-code.bearer.${token}`]);
      // Resolve on the server's first (`server_hello`) frame.
      ws.once('message', () => resolve(ws));
      ws.once('error', reject);
    });
  }

  function collectFrames(ws: WebSocket): Array<Record<string, unknown>> {
    const frames: Array<Record<string, unknown>> = [];
    ws.on('message', (data) => {
      try {
        const text = Array.isArray(data)
          ? Buffer.concat(data).toString('utf8')
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : Buffer.from(new Uint8Array(data)).toString('utf8');
        frames.push(JSON.parse(text) as Record<string, unknown>);
      } catch {
        // ignore non-JSON control frames
      }
    });
    return frames;
  }

  async function waitForFrame(
    frames: Array<Record<string, unknown>>,
    predicate: (frame: Record<string, unknown>) => boolean,
    timeoutMs = 3000,
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = frames.find(predicate);
      if (found !== undefined) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('timed out waiting for WS frame');
  }

  /** Overwrite the config file atomically so the watcher never sees a half-written document. */
  async function replaceConfigFile(content: string): Promise<void> {
    const path = join(home as string, 'config.toml');
    const tmp = `${path}.tmp`;
    await writeFile(tmp, content, 'utf-8');
    await rename(tmp, path);
  }

  async function patchConfig(patch: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${base}/api/v1/config`, {
      method: 'POST',
      headers: authHeaders(server as RunningServer, { 'content-type': 'application/json' }),
      body: JSON.stringify(patch),
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Envelope<ConfigResponse>;
    expect(body.code).toBe(0);
  }

  it('POST /config set reaches an established WS connection exactly once, flat camelCase frame', async () => {
    await boot();
    const ws = await connect();
    const frames = collectFrames(ws);
    try {
      await patchConfig({ default_permission_mode: 'auto' });

      const frame = await waitForFrame(frames, (f) => f['type'] === 'event.config.changed');
      const payload = frame['payload'] as Record<string, unknown>;
      expect(frame).toMatchObject({
        type: 'event.config.changed',
        session_id: '__global__',
        payload: {
          type: 'event.config.changed',
          changedFields: ['default_permission_mode'],
          config: expect.objectContaining({ default_permission_mode: 'auto' }),
        },
      });
      // Flat field name stays `changedFields`, never `changed_fields`.
      expect(payload['changed_fields']).toBeUndefined();

      // Settle past the file-watcher debounce: the set's own file write must
      // not echo as a second frame (that reload is a no-op).
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(frames.filter((f) => f['type'] === 'event.config.changed')).toHaveLength(1);
    } finally {
      ws.close();
    }
  });

  it('internal config set reaches an established WS connection exactly once', async () => {
    await boot();
    const ws = await connect();
    const frames = collectFrames(ws);
    try {
      await (server as RunningServer).core.accessor.get(IConfigService).set('subagent', {
        preset: 'codex-heavy',
        presets: { 'codex-heavy': { agent: { model: 'provider/gpt' } } },
      });

      const frame = await waitForFrame(frames, (f) => f['type'] === 'event.config.changed');
      expect(frame).toMatchObject({
        type: 'event.config.changed',
        session_id: '__global__',
        payload: {
          type: 'event.config.changed',
          changedFields: ['subagent'],
          config: expect.objectContaining({
            subagent: expect.objectContaining({ preset: 'codex-heavy' }),
          }),
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(frames.filter((f) => f['type'] === 'event.config.changed')).toHaveLength(1);
    } finally {
      ws.close();
    }
  });

  it('external config-file reload reaches an established WS connection once, merged changedFields', async () => {
    await boot('default_permission_mode = "auto"\n[experimental]\n"secondary-model" = true\n');
    const ws = await connect();
    const frames = collectFrames(ws);
    try {
      await replaceConfigFile(
        'default_permission_mode = "yolo"\n[experimental]\n"secondary-model" = false\n',
      );

      const frame = await waitForFrame(frames, (f) => f['type'] === 'event.config.changed');
      const payload = frame['payload'] as Record<string, unknown>;
      expect(frame).toMatchObject({
        type: 'event.config.changed',
        session_id: '__global__',
        payload: {
          type: 'event.config.changed',
          config: expect.objectContaining({ default_permission_mode: 'yolo' }),
        },
      });
      // The reload bridge merges both touched domains into one frame.
      expect(payload['changedFields']).toEqual(['default_permission_mode', 'experimental']);

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(frames.filter((f) => f['type'] === 'event.config.changed')).toHaveLength(1);
    } finally {
      ws.close();
    }
  });
});
