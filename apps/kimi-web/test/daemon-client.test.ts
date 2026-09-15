// apps/kimi-web/test/daemon-client.test.ts
// DaemonKimiWebApi public REST adapter: session export binary/error contracts,
// getSessionGoal wire → app mapping, and raw stream-coordinate delivery.
// Wiring: real client/projector; fetch or WebSocket is stubbed at the network boundary.
// Run: pnpm --filter @bhjia-phys/hakimi-web exec vitest run test/daemon-client.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DaemonKimiWebApi, deriveTurnProgressSeed } from '../src/api/daemon/client';
import { clearCredential, setCredential } from '../src/api/daemon/serverAuth';
import {
  toAppAutoSubagentPresetStatus,
  toAppTask,
} from '../src/api/daemon/mappers';
import { DaemonApiError, DaemonNetworkError } from '../src/api/errors';
import { clearTrace, traceToJsonl } from '../src/debug/trace';
import type {
  AppEvent,
  AppMessage,
  KimiEventConnection,
  KimiEventMeta,
  ResearchCommand,
} from '../src/api/types';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly OPEN = FakeWebSocket.OPEN;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event?: CloseEvent) => void) | null = null;

  constructor(_url: string, _protocols?: string | string[]) {
    FakeWebSocket.instances.push(this);
  }

  send(_data: string): void {}

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  emit(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
}

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: '', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('task mapper', () => {
  it('maps subagent identity and runtime model fields', () => {
    expect(
      toAppTask({
        id: 'task-1',
        session_id: 'session-1',
        kind: 'subagent',
        description: 'Review the change',
        status: 'running',
        created_at: '2026-01-01T00:00:00.000Z',
        agent_id: 'agent-1',
        subagent_type: 'reviewer',
        model: 'runtime-model',
        thinking_effort: 'high',
        run_in_background: true,
      }),
    ).toMatchObject({
      id: 'task-1',
      agentId: 'agent-1',
      subagentType: 'reviewer',
      model: 'runtime-model',
      thinkingEffort: 'high',
      runInBackground: true,
    });
  });

  it('leaves background state unknown when the wire field is absent', () => {
    const task = toAppTask({
      id: 'task-2',
      session_id: 'session-1',
      kind: 'subagent',
      description: 'Foreground snapshot task',
      status: 'running',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(task.runInBackground).toBeUndefined();
  });
});

const WIRE_GOAL = {
  goalId: 'goal_1',
  objective: 'fix all lint warnings',
  status: 'active',
  turnsUsed: 1,
  tokensUsed: 0,
  wallClockMs: 0,
  waitingFor: { taskIds: ['task_1', 'task_2'], policy: 'all' },
  budget: {
    tokenBudget: null,
    turnBudget: null,
    wallClockBudgetMs: null,
    remainingTokens: null,
    remainingTurns: null,
    remainingWallClockMs: null,
    tokenBudgetReached: false,
    turnBudgetReached: false,
    wallClockBudgetReached: false,
    overBudget: false,
  },
};

const WIRE_RESEARCH = {
  enabled: true,
  skillsAvailable: true,
};

const WIRE_AUTO_PRESET_STATUS = {
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
};

describe('automatic-preset status mapper boundaries', () => {
  it('rejects invalid count, rate, percent, and contribution values', () => {
    const candidate = WIRE_AUTO_PRESET_STATUS.candidates[0]!;
    const invalidStatuses: unknown[] = [
      {
        ...WIRE_AUTO_PRESET_STATUS,
        candidates: [{
          ...candidate,
          local_evidence: {
            ...candidate.local_evidence,
            first_token_latency_sample_count: 1.5,
          },
        }],
      },
      {
        ...WIRE_AUTO_PRESET_STATUS,
        candidates: [{
          ...candidate,
          local_evidence: { ...candidate.local_evidence, adjusted_failure_rate: 1.01 },
        }],
      },
      {
        ...WIRE_AUTO_PRESET_STATUS,
        candidates: [{ ...candidate, quota_remaining_percent: 101 }],
      },
      {
        ...WIRE_AUTO_PRESET_STATUS,
        policy: { ...WIRE_AUTO_PRESET_STATUS.policy, priority_weight_percent: 101 },
      },
      {
        ...WIRE_AUTO_PRESET_STATUS,
        candidates: [{
          ...candidate,
          contributions: { ...candidate.contributions, latency_penalty: -1 },
        }],
      },
    ];

    for (const invalid of invalidStatuses) {
      expect(toAppAutoSubagentPresetStatus(invalid)).toBeUndefined();
    }
  });
});

function createApi(): DaemonKimiWebApi {
  return new DaemonKimiWebApi({
    serverHttpUrl: 'http://daemon.test',
    clientId: 'web_test',
    clientName: 'test',
    clientVersion: '0.0.0',
    clientUiMode: 'test',
  });
}

describe('DaemonKimiWebApi.exportSession', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { search: '?debug=1' });
    vi.stubGlobal('fetch', vi.fn());
    clearTrace();
  });

  afterEach(() => {
    clearTrace();
    vi.unstubAllGlobals();
  });

  it('posts the Web log to the encoded session export endpoint and returns the ZIP', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([80, 75, 3, 4]), {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="session-export.zip"',
        },
      }),
    );

    const result = await createApi().exportSession('sess/1', '{"event":"safe"}');

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess%2F1/export',
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ web_log: '{"event":"safe"}' }),
    });
    expect(result.fileName).toBe('session-export.zip');
    expect(result.blob.size).toBe(4);
  });

  it('falls back to a session-id ZIP name for an unsafe response filename', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([80, 75]), {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="../credentials.zip"',
        },
      }),
    );

    const result = await createApi().exportSession('sess_1');

    expect(result.fileName).toBe('sess_1.zip');
  });

  it('parses a JSON error envelope returned by the export endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: 41301, msg: 'export too large', request_id: 'req_server' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const caught = await createApi()
      .exportSession('sess_1', 'log')
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonApiError);
    expect(caught).toMatchObject({ code: 41301, requestId: 'req_server' });
  });

  it('rejects a successful response whose media type is not a ZIP', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('not a zip', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const caught = await createApi().exportSession('sess_1').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonNetworkError);
    expect(caught).toMatchObject({ phase: 'parse', contentType: 'text/plain' });
  });

  it('records only Web-log counts in the request trace', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([80, 75]), {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    );
    const secret = 'PROMPT_CONTENT_MUST_NOT_ENTER_TRACE';

    await createApi().exportSession('sess_1', `${secret}\nsecond line`);

    const trace = traceToJsonl();
    expect(trace).not.toContain(secret);
    expect(trace).toContain('web_log_bytes');
    expect(trace).toContain('web_log_entries');
  });
});

describe('DaemonKimiWebApi.getSessionGoal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a present goal snapshot', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_GOAL));
    const goal = await createApi().getSessionGoal('sess_1');
    expect(goal?.objective).toBe('fix all lint warnings');
    expect(goal?.status).toBe('active');
    expect(goal?.turnsUsed).toBe(1);
    expect(goal?.waitingFor).toEqual({ taskIds: ['task_1', 'task_2'], policy: 'all' });
  });

  it('maps null to null (no active goal)', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(null));
    const goal = await createApi().getSessionGoal('sess_1');
    expect(goal).toBeNull();
  });

  it('requests the session goal endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(null));
    await createApi().getSessionGoal('sess_42');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess_42/goal',
    );
  });
});

describe('DaemonKimiWebApi.getMeta experimental flags', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['missing', {}, {}],
    ['false', { experimental_flags: { 'tool-select': false } }, { 'tool-select': false }],
    ['true', { experimental_flags: { 'tool-select': true } }, { 'tool-select': true }],
  ] as const)('maps %s experimental_flags without falling open', async (_case, extra, expected) => {
    vi.mocked(fetch).mockResolvedValue(envelope({
      server_version: '1.0.0',
      server_id: 'server-1',
      started_at: '2026-01-01T00:00:00.000Z',
      capabilities: {},
      ...extra,
    }));

    const meta = await createApi().getMeta();

    expect(meta.experimentalFlags).toEqual(expected);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('http://daemon.test/api/v1/meta');
  });
});

describe('DaemonKimiWebApi Research', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gets and maps the Research mode snapshot from the encoded session path', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_RESEARCH));

    const snapshot = await createApi().getSessionResearch('sess/1');

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess%2F1/research',
    );
    expect(snapshot).toEqual(WIRE_RESEARCH);
    expect(snapshot).not.toBe(WIRE_RESEARCH);
  });

  it.each([
    { kind: 'enter_mode', actor: 'user' },
    { kind: 'exit_mode' },
  ] as const satisfies readonly ResearchCommand[])(
    'posts the $kind mode command unchanged and maps the returned snapshot',
    async (command) => {
      vi.mocked(fetch).mockResolvedValue(envelope({ snapshot: WIRE_RESEARCH }));

      const snapshot = await createApi().commandSessionResearch('sess/1', command);

      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe('http://daemon.test/api/v1/sessions/sess%2F1/research/command');
      expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ command }) });
      expect(snapshot).toEqual(WIRE_RESEARCH);
    },
  );
});

describe('DaemonKimiWebApi config and provider usage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps subagent presets, automatic settings, and secondary-model config without changing nested casing', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        providers: {},
        subagent: {
          preset: 'balanced',
          agents: { coder: { model: 'deepseek', thinkingEffort: 'high' } },
          presets: {
            balanced: { reviewer: { model: 'codex', thinkingEffort: 'xhigh' } },
          },
          autoPreset: { enabled: true, quotaFloorPercent: 25 },
        },
        secondary_model: {
          defaultModel: 'fallback',
          maxContextSize: 128000,
          supportEfforts: ['high'],
        },
        experimental: { auto_subagent_preset: true },
      }),
    );

    await expect(createApi().getConfig()).resolves.toMatchObject({
      subagent: {
        preset: 'balanced',
        agents: { coder: { model: 'deepseek', thinkingEffort: 'high' } },
        autoPreset: { enabled: true, quotaFloorPercent: 25 },
      },
      secondaryModel: {
        defaultModel: 'fallback',
        maxContextSize: 128000,
        supportEfforts: ['high'],
      },
      experimental: { auto_subagent_preset: true },
    });
  });

  it('posts subagent, automatic-preset, and secondary-model patches to their shared config domains', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({ providers: {} }));

    await createApi().setConfig({
      subagent: {
        preset: 'kimi-heavy',
        presets: { 'kimi-heavy': { researcher: { model: 'kimi', thinkingEffort: 'max' } } },
        autoPreset: { enabled: true },
      },
      secondaryModel: { defaultModel: 'fallback', force: true },
      experimental: { auto_subagent_preset: true },
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://daemon.test/api/v1/config');
    if (typeof init?.body !== 'string') throw new Error('expected a JSON string body');
    expect(JSON.parse(init.body)).toEqual({
      subagent: {
        preset: 'kimi-heavy',
        presets: { 'kimi-heavy': { researcher: { model: 'kimi', thinkingEffort: 'max' } } },
        autoPreset: { enabled: true },
      },
      secondary_model: { defaultModel: 'fallback', force: true },
      experimental: { auto_subagent_preset: true },
    });
  });

  it('activates a preset through the serialized server endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        config: {
          providers: {},
          subagent: { preset: 'codex-heavy', presets: { 'codex-heavy': {} } },
        },
      }),
    );

    await expect(createApi().activateSubagentPreset('codex-heavy')).resolves.toMatchObject({
      config: { subagent: { preset: 'codex-heavy' } },
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://daemon.test/api/v1/config/subagent-preset/activate');
    if (typeof init?.body !== 'string') throw new Error('expected a JSON string body');
    expect(JSON.parse(init.body)).toEqual({ preset: 'codex-heavy' });
  });

  it.each([
    [
      'the default Fastify JSON shape',
      () =>
        new Response(
          JSON.stringify({
            statusCode: 404,
            error: 'Not Found',
            message: 'Route POST:/api/v1/config/subagent-preset/activate not found',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
    ],
    [
      'a non-JSON response',
      () =>
        new Response('Route not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        }),
    ],
  ])('falls back to the legacy config patch for %s', async (_label, unavailableResponse) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(unavailableResponse())
      .mockResolvedValueOnce(
        envelope({ providers: {}, subagent: { preset: 'codex-heavy' } }),
      );

    await expect(createApi().activateSubagentPreset('codex-heavy')).resolves.toEqual({
      config: { providers: {}, subagent: { preset: 'codex-heavy' } },
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const [activateUrl, activateInit] = vi.mocked(fetch).mock.calls[0]!;
    const [configUrl, configInit] = vi.mocked(fetch).mock.calls[1]!;
    expect(activateUrl).toBe('http://daemon.test/api/v1/config/subagent-preset/activate');
    expect(configUrl).toBe('http://daemon.test/api/v1/config');
    if (typeof activateInit?.body !== 'string' || typeof configInit?.body !== 'string') {
      throw new Error('expected JSON string bodies');
    }
    expect(JSON.parse(activateInit.body)).toEqual({ preset: 'codex-heavy' });
    expect(JSON.parse(configInit.body)).toEqual({ subagent: { preset: 'codex-heavy' } });
  });

  it('does not hide non-404 activation failures behind the legacy fallback', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 40001, msg: 'Invalid preset', data: null }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(createApi().activateSubagentPreset('missing')).rejects.toMatchObject({
      code: 40001,
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('maps the manual lock and candidate priority through the config read', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        providers: {},
        subagent: {
          preset: 'balanced',
          presets: { balanced: { reviewer: { model: 'codex' } } },
          autoPreset: {
            enabled: true,
            manualLock: true,
            candidates: ['balanced', 'deepseek-heavy'],
            quotaFloorPercent: 25,
            priorityWeightPercent: 20,
            reliabilityWeightPercent: 15,
            latencyWeightPercent: 10,
            switchCooldownMs: 30_000,
            circuitBreakerFailureThreshold: 3,
            circuitBreakerCooldownMs: 60_000,
          },
        },
      }),
    );

    await expect(createApi().getConfig()).resolves.toMatchObject({
      subagent: {
        preset: 'balanced',
        autoPreset: {
          enabled: true,
          manualLock: true,
          candidates: ['balanced', 'deepseek-heavy'],
          quotaFloorPercent: 25,
          priorityWeightPercent: 20,
          reliabilityWeightPercent: 15,
          latencyWeightPercent: 10,
          switchCooldownMs: 30_000,
          circuitBreakerFailureThreshold: 3,
          circuitBreakerCooldownMs: 60_000,
        },
      },
    });
  });

  it('reads and strictly maps the latest automatic-preset status', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_AUTO_PRESET_STATUS));

    await expect(createApi().getAutoSubagentPresetStatus()).resolves.toMatchObject({
      evaluatedAt: 1_750_000_000_000,
      profileName: 'reviewer',
      reasonCode: 'higher_score',
      currentScore: 58.5,
      selectedScore: 76.25,
      candidates: [
        {
          preset: 'kimi-heavy',
          quotaRemainingPercent: 80,
          contributions: { reliabilityPenalty: 7.5 },
          localEvidence: {
            scope: 'profile',
            averageFirstTokenLatencyMs: 320,
            firstTokenLatencySampleCount: 9,
          },
        },
      ],
      policy: { priorityWeightPercent: 20, circuitBreakerFailureThreshold: 3 },
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/config/subagent-preset/status',
    );
  });

  it('silently degrades when no automatic-preset evaluation exists', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(null));

    await expect(createApi().getAutoSubagentPresetStatus()).resolves.toBeUndefined();
  });

  it.each([
    [
      'the default Fastify JSON shape',
      () =>
        new Response(
          JSON.stringify({
            statusCode: 404,
            error: 'Not Found',
            message: 'Route GET:/api/v1/config/subagent-preset/status not found',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
    ],
    [
      'a non-JSON response',
      () =>
        new Response('Route not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        }),
    ],
  ])('silently degrades the status read for %s', async (_label, unavailableResponse) => {
    vi.mocked(fetch).mockResolvedValue(unavailableResponse());

    await expect(createApi().getAutoSubagentPresetStatus()).resolves.toBeUndefined();
  });

  it('drops malformed automatic-preset status data without surfacing diagnostics', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({ ...WIRE_AUTO_PRESET_STATUS, reason_code: 'future_reason' }),
    );
    await expect(createApi().getAutoSubagentPresetStatus()).resolves.toBeUndefined();
  });

  it('posts a resume-auto patch with only the manualLock field', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({ providers: {} }));

    await createApi().setConfig({ subagent: { autoPreset: { manualLock: false } } });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://daemon.test/api/v1/config');
    if (typeof init?.body !== 'string') throw new Error('expected a JSON string body');
    expect(JSON.parse(init.body)).toEqual({
      subagent: { autoPreset: { manualLock: false } },
    });
  });

  it('maps candidates and the manual lock through the activation response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        config: {
          providers: {},
          subagent: {
            preset: 'codex-heavy',
            presets: { 'codex-heavy': {} },
            autoPreset: {
              enabled: true,
              manualLock: true,
              candidates: ['codex-heavy', 'balanced'],
            },
          },
        },
      }),
    );

    await expect(createApi().activateSubagentPreset('codex-heavy')).resolves.toMatchObject({
      config: {
        subagent: {
          preset: 'codex-heavy',
          autoPreset: { enabled: true, manualLock: true, candidates: ['codex-heavy', 'balanced'] },
        },
      },
    });
  });

  it('queries a selected provider and maps ok/error/unsupported usage results', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        providers: [
          {
            provider: 'managed:kimi-code',
            kind: 'ok',
            summary: { name: 'Weekly', used: 40, limit: 100, reset_at: '2030-01-01T00:00:00Z' },
            limits: [{ used: 2, limit: 50 }],
            extra_usage: {
              balance_cents: 500,
              total_cents: 1000,
              monthly_charge_limit_enabled: true,
              monthly_charge_limit_cents: 2000,
              monthly_used_cents: 1500,
              currency: 'CNY',
            },
          },
          { provider: 'api-key', kind: 'error', message: 'Authorization failed.', status: 401 },
          { provider: 'custom', kind: 'unsupported', message: 'Usage endpoint unavailable.' },
        ],
      }),
    );

    const result = await createApi().getProviderUsage('managed:kimi-code');

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/provider-usage?provider=managed%3Akimi-code',
    );
    expect(result).toEqual([
      {
        provider: 'managed:kimi-code',
        kind: 'ok',
        summary: { name: 'Weekly', used: 40, limit: 100, resetAt: '2030-01-01T00:00:00Z' },
        limits: [{ used: 2, limit: 50, name: undefined, window: undefined, resetAt: undefined }],
        extraUsage: {
          balanceCents: 500,
          totalCents: 1000,
          monthlyChargeLimitEnabled: true,
          monthlyChargeLimitCents: 2000,
          monthlyUsedCents: 1500,
          currency: 'CNY',
        },
      },
      { provider: 'api-key', kind: 'error', message: 'Authorization failed.', status: 401 },
      { provider: 'custom', kind: 'unsupported', message: 'Usage endpoint unavailable.', status: undefined },
    ]);
  });

  it('maps the local metered usage and official balance to camelCase', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        providers: [
          {
            provider: 'deepseek',
            kind: 'ok',
            summary: null,
            limits: [],
            extra_usage: null,
            metered_usage: {
              source: 'local',
              cost_source: 'estimated',
              currency: 'CNY',
              timezone: 'Asia/Shanghai',
              tracking_started_at: '2030-01-01T00:00:00.000Z',
              degraded: false,
              today: {
                start_at: '2030-01-01T00:00:00.000Z',
                end_at: '2030-01-01T23:59:59.999Z',
                request_count: 3,
                measured_request_count: 2,
                pending_request_count: 1,
                missing_usage_request_count: 0,
                unpriced_request_count: 0,
                input_tokens: 100,
                output_tokens: 50,
                cache_read_tokens: 10,
                total_tokens: 160,
                estimated_cost: '0.000123',
                is_partial: true,
              },
              month: {
                start_at: '2030-01-01T00:00:00.000Z',
                end_at: '2030-01-31T23:59:59.999Z',
                request_count: 10,
                measured_request_count: 8,
                pending_request_count: 2,
                missing_usage_request_count: 1,
                unpriced_request_count: 1,
                input_tokens: 1000,
                output_tokens: 500,
                cache_read_tokens: 100,
                total_tokens: 1600,
                estimated_cost: null,
                is_partial: true,
              },
              balance: {
                kind: 'ok',
                is_available: true,
                balances: [
                  { currency: 'CNY', total: '10.50', granted: '2.00', topped_up: '8.50' },
                  { currency: 'USD', total: '1.25', granted: '0.00', topped_up: '1.25' },
                ],
              },
            },
          },
        ],
      }),
    );

    const [result] = await createApi().getProviderUsage('deepseek');

    expect(result).toMatchObject({
      provider: 'deepseek',
      kind: 'ok',
      meteredUsage: {
        source: 'local',
        costSource: 'estimated',
        currency: 'CNY',
        timezone: 'Asia/Shanghai',
        trackingStartedAt: '2030-01-01T00:00:00.000Z',
        degraded: false,
        today: {
          startAt: '2030-01-01T00:00:00.000Z',
          endAt: '2030-01-01T23:59:59.999Z',
          requestCount: 3,
          measuredRequestCount: 2,
          pendingRequestCount: 1,
          missingUsageRequestCount: 0,
          unpricedRequestCount: 0,
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
          totalTokens: 160,
          estimatedCost: '0.000123',
          isPartial: true,
        },
        month: {
          startAt: '2030-01-01T00:00:00.000Z',
          endAt: '2030-01-31T23:59:59.999Z',
          requestCount: 10,
          measuredRequestCount: 8,
          pendingRequestCount: 2,
          missingUsageRequestCount: 1,
          unpricedRequestCount: 1,
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 100,
          totalTokens: 1600,
          estimatedCost: null,
          isPartial: true,
        },
        balance: {
          kind: 'ok',
          isAvailable: true,
          balances: [
            { currency: 'CNY', total: '10.50', granted: '2.00', toppedUp: '8.50' },
            { currency: 'USD', total: '1.25', granted: '0.00', toppedUp: '1.25' },
          ],
        },
      },
    });
  });

  it('maps a balance error while keeping local metered stats', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        providers: [
          {
            provider: 'deepseek',
            kind: 'ok',
            summary: null,
            limits: [],
            extra_usage: null,
            metered_usage: {
              source: 'local',
              cost_source: 'estimated',
              currency: 'CNY',
              timezone: 'Asia/Shanghai',
              tracking_started_at: '2030-01-01T00:00:00.000Z',
              degraded: false,
              today: {
                start_at: '2030-01-01T00:00:00.000Z',
                end_at: '2030-01-01T23:59:59.999Z',
                request_count: 3,
                measured_request_count: 2,
                pending_request_count: 1,
                missing_usage_request_count: 0,
                unpriced_request_count: 0,
                input_tokens: 100,
                output_tokens: 50,
                cache_read_tokens: 10,
                total_tokens: 160,
                estimated_cost: '0.000123',
                is_partial: true,
              },
              month: {
                start_at: '2030-01-01T00:00:00.000Z',
                end_at: '2030-01-31T23:59:59.999Z',
                request_count: 10,
                measured_request_count: 8,
                pending_request_count: 2,
                missing_usage_request_count: 1,
                unpriced_request_count: 1,
                input_tokens: 1000,
                output_tokens: 500,
                cache_read_tokens: 100,
                total_tokens: 1600,
                estimated_cost: null,
                is_partial: true,
              },
              balance: { kind: 'error', message: 'Balance endpoint unavailable.', status: 503 },
            },
          },
        ],
      }),
    );

    const [result] = await createApi().getProviderUsage('deepseek');

    expect(result).toMatchObject({
      provider: 'deepseek',
      kind: 'ok',
      meteredUsage: {
        today: expect.objectContaining({ totalTokens: 160, estimatedCost: '0.000123' }),
        balance: { kind: 'error', message: 'Balance endpoint unavailable.', status: 503 },
      },
    });
  });
});

describe('deriveTurnProgressSeed', () => {
  function snapshotMessage(message: Omit<AppMessage, 'sessionId'>): AppMessage {
    return { ...message, sessionId: 'session-1' };
  }

  it('derives the current segment from the last user message when prompt id is absent', () => {
    const messages = [
      snapshotMessage({
        id: 'old-user',
        role: 'user',
        createdAt: '2026-01-01T00:00:00.000Z',
        promptId: 'old-prompt',
        content: [{ type: 'text', text: 'old prompt' }],
      }),
      snapshotMessage({
        id: 'old-step',
        role: 'assistant',
        createdAt: '2026-01-01T00:00:01.000Z',
        promptId: 'old-prompt',
        content: [
          { type: 'toolUse', toolCallId: 'old-tool', toolName: 'Read', input: {} },
        ],
      }),
      snapshotMessage({
        id: 'current-user',
        role: 'user',
        createdAt: '2026-01-01T00:01:00.000Z',
        content: [{ type: 'text', text: 'current prompt' }],
      }),
      snapshotMessage({
        id: 'current-step-1',
        role: 'assistant',
        createdAt: '2026-01-01T00:01:01.000Z',
        content: [
          { type: 'toolUse', toolCallId: 'tool-1', toolName: 'Read', input: {} },
          { type: 'toolUse', toolCallId: 'tool-1', toolName: 'Read', input: {} },
        ],
      }),
      snapshotMessage({
        id: 'current-result-1',
        role: 'tool',
        createdAt: 'not-a-time',
        content: [{ type: 'toolResult', toolCallId: 'tool-1', output: 'ok' }],
      }),
      snapshotMessage({
        id: 'current-step-2',
        role: 'assistant',
        createdAt: '2026-01-01T00:01:02.000Z',
        content: [
          { type: 'toolUse', toolCallId: 'tool-2', toolName: 'Bash', input: {} },
        ],
      }),
      snapshotMessage({
        id: 'current-result-2',
        role: 'tool',
        createdAt: '2026-01-01T00:01:03.000Z',
        content: [
          { type: 'toolResult', toolCallId: 'tool-2', output: 'ok' },
          { type: 'toolResult', toolCallId: 'tool-2', output: 'ok' },
        ],
      }),
    ];

    const seed = deriveTurnProgressSeed(messages, undefined, ['running-tool', 'tool-2']);

    expect(seed).toMatchObject({
      startedAt: Date.parse('2026-01-01T00:01:00.000Z'),
      stepCount: 2,
      stepNumbers: [1, 2],
    });
    expect(seed.toolCallIds).toHaveLength(3);
    expect(seed.toolCallIds).toEqual(expect.arrayContaining(['running-tool', 'tool-1', 'tool-2']));
    expect(seed.completedToolCallIds).toEqual(['tool-1', 'tool-2']);
    expect(seed.toolCallIds).not.toContain('old-tool');
  });

  it('falls back to the last user segment when the snapshot prompt id is not projected onto messages', () => {
    const seed = deriveTurnProgressSeed(
      [
        snapshotMessage({
          id: 'current-user',
          role: 'user',
          createdAt: '2026-01-01T00:02:00.000Z',
          content: [{ type: 'text', text: 'current prompt' }],
        }),
        snapshotMessage({
          id: 'current-partial-step',
          role: 'assistant',
          createdAt: '2026-01-01T00:02:01.000Z',
          content: [
            { type: 'toolUse', toolCallId: 'tool-current', toolName: 'Read', input: {} },
          ],
        }),
      ],
      'current-prompt-id',
      [],
    );

    expect(seed).toMatchObject({
      startedAt: Date.parse('2026-01-01T00:02:00.000Z'),
      stepCount: 1,
      stepNumbers: [1],
      toolCallIds: ['tool-current'],
    });
  });

  it('falls back to the current time when the current segment has no valid timestamp', () => {
    const before = Date.now();
    const seed = deriveTurnProgressSeed(
      [
        snapshotMessage({
          id: 'current-user',
          role: 'user',
          createdAt: 'invalid',
          content: [{ type: 'text', text: 'current prompt' }],
        }),
      ],
      undefined,
      [],
    );
    const after = Date.now();

    expect(seed.startedAt).toBeGreaterThanOrEqual(before);
    expect(seed.startedAt).toBeLessThanOrEqual(after);
    expect(seed).toMatchObject({ stepCount: 1, stepNumbers: [1] });
  });
});

describe('DaemonKimiWebApi.connectEvents', () => {
  let connection: KimiEventConnection | undefined;

  afterEach(() => {
    connection?.close();
    connection = undefined;
    vi.unstubAllGlobals();
  });

  it('delivers raw assistant stream coordinates with the projected delta', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: Array<{ event: AppEvent; meta: KimiEventMeta }> = [];
    connection = createApi().connectEvents({
      onEvent(event, meta) {
        received.push({ event, meta });
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const socket = FakeWebSocket.instances[0]!;

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'turn.started',
      seq: 1,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { agentId: 'main', turnId: 7 },
    });
    socket.emit({
      type: 'turn.step.started',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { agentId: 'main', turnId: 7, step: 1 },
    });
    socket.emit({
      type: 'assistant.delta',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      volatile: true,
      offset: 0,
      payload: { agentId: 'main', turnId: 7, delta: 'hello' },
    });
    socket.emit({
      type: 'thinking.delta',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      volatile: true,
      offset: 0,
      payload: { agentId: 'main', turnId: 7, delta: 'thought' },
    });

    expect(received).toContainEqual({
      event: {
        type: 'turnProgress',
        sessionId: 'session-1',
        update: {
          kind: 'start',
          turnId: 7,
          startedAt: Date.parse('2026-01-01T00:00:00.000Z'),
        },
      },
      meta: { sessionId: 'session-1', seq: 1, stream: undefined },
    });

    const delta = received.find(({ event }) => event.type === 'assistantDelta');
    expect(delta).toMatchObject({
      event: {
        type: 'assistantDelta',
        sessionId: 'session-1',
        delta: { text: 'hello' },
      },
      meta: {
        sessionId: 'session-1',
        seq: 2,
        stream: { turnId: 7, offset: 0, kind: 'text' },
      },
    });

    const thinking = received.find(
      ({ event }) => event.type === 'assistantDelta' && event.delta.thinking !== undefined,
    );
    expect(thinking).toMatchObject({
      event: {
        type: 'assistantDelta',
        sessionId: 'session-1',
        delta: { thinking: 'thought' },
      },
      meta: {
        sessionId: 'session-1',
        seq: 2,
        stream: { turnId: 7, offset: 0, kind: 'thinking' },
      },
    });
  });

  it('projects list-level work facts from the global session event', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.session.work_changed',
      seq: 1,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: {
        busy: true,
        main_turn_active: false,
        pending_interaction: 'question',
      },
    });

    expect(received).toContainEqual({
      type: 'sessionWorkChanged',
      sessionId: 'session-1',
      busy: true,
      mainTurnActive: false,
      pendingInteraction: 'question',
      lastTurnReason: undefined,
    });
  });

  it.each(['changedFields', 'changed_fields'] as const)(
    'projects config changes from the %s payload alias',
    (fieldName) => {
      FakeWebSocket.instances = [];
      vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
      const received: AppEvent[] = [];
      connection = createApi().connectEvents({
        onEvent(event) {
          received.push(event);
        },
        onResync() {},
        onError() {},
        onConnectionChange() {},
      });
      const [socket] = FakeWebSocket.instances;
      if (socket === undefined) throw new Error('WebSocket was not created');

      socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
      socket.emit({
        type: 'event.config.changed',
        seq: 1,
        session_id: '__global__',
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: {
          type: 'event.config.changed',
          [fieldName]: ['subagent'],
          config: {
            providers: {},
            subagent: { preset: 'balanced' },
          },
        },
      });

      expect(received).toContainEqual(
        expect.objectContaining({
          type: 'configChanged',
          changedFields: ['subagent'],
          config: expect.objectContaining({ subagent: { preset: 'balanced' } }),
        }),
      );
    },
  );

  it('delivers both raw and protocol Research updates as the same typed event', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'research_mode.updated',
      seq: 1,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { snapshot: WIRE_RESEARCH },
    });
    socket.emit({
      type: 'event.research_mode.updated',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:01.000Z',
      payload: { snapshot: WIRE_RESEARCH },
    });

    const updates = received.filter((event) => event.type === 'researchUpdated');
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual(updates[1]);
    expect(updates[0]).toEqual({
      type: 'researchUpdated',
      sessionId: 'session-1',
      snapshot: WIRE_RESEARCH,
    });
  });
});

describe('automatic subagent-preset event mapping', () => {
  let connection: KimiEventConnection | undefined;

  it('projects a strict evaluated event into the typed process-global status', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.subagent.preset_evaluated',
      seq: 10,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: WIRE_AUTO_PRESET_STATUS,
    });

    expect(received).toContainEqual(
      expect.objectContaining({
        type: 'subagentPresetEvaluated',
        sessionId: 'session-1',
        status: expect.objectContaining({
          reasonCode: 'higher_score',
          selectedScore: 76.25,
        }),
      }),
    );
  });

  it('drops malformed evaluated events and incomplete expanded change events', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.subagent.preset_evaluated',
      seq: 10,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { ...WIRE_AUTO_PRESET_STATUS, reason_code: 'future_reason' },
    });
    socket.emit({
      type: 'event.subagent.preset_changed',
      seq: 11,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:01.000Z',
      payload: { current_preset: 'kimi-heavy', reason_code: 'higher_score' },
    });

    expect(received.some((event) => event.type === 'subagentPresetEvaluated')).toBe(false);
    expect(received.some((event) => event.type === 'subagentPresetChanged')).toBe(false);
  });

  it('projects the wire event into a typed subagentPresetChanged AppEvent', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.subagent.preset_changed',
      seq: 11,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { previous_preset: 'balanced', current_preset: 'kimi-heavy' },
    });

    expect(received).toContainEqual({
      type: 'subagentPresetChanged',
      sessionId: 'session-1',
      previousPreset: 'balanced',
      currentPreset: 'kimi-heavy',
    });
  });

  it('maps the expanded change reason, profile, timestamp, and scores', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.subagent.preset_changed',
      seq: 12,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: {
        previous_preset: 'balanced',
        current_preset: 'kimi-heavy',
        reason_code: 'higher_score',
        profile_name: 'reviewer',
        evaluated_at: 1_750_000_000_000,
        previous_score: 58.5,
        current_score: 76.25,
      },
    });

    expect(received).toContainEqual({
      type: 'subagentPresetChanged',
      sessionId: 'session-1',
      previousPreset: 'balanced',
      currentPreset: 'kimi-heavy',
      reasonCode: 'higher_score',
      profileName: 'reviewer',
      evaluatedAt: 1_750_000_000_000,
      previousScore: 58.5,
      currentScore: 76.25,
    });
  });

  it('maps an absent previous_preset to an undefined previousPreset', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.subagent.preset_changed',
      seq: 12,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { current_preset: 'deepseek-heavy' },
    });

    expect(received).toContainEqual(
      expect.objectContaining({
        type: 'subagentPresetChanged',
        sessionId: 'session-1',
        previousPreset: undefined,
        currentPreset: 'deepseek-heavy',
      }),
    );
  });

  it('does not project malformed preset names into a preset-change event', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.subagent.preset_changed',
      seq: 13,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { current_preset: '   ' },
    });
    socket.emit({
      type: 'event.subagent.preset_changed',
      seq: 14,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:01.000Z',
      payload: { previous_preset: 42, current_preset: 'kimi-heavy' },
    });

    expect(received.some((event) => event.type === 'subagentPresetChanged')).toBe(false);
  });
});

describe('DaemonKimiWebApi.getWorkspaceFileBlob', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    clearTrace();
    setCredential('test-token');
  });

  afterEach(() => {
    clearCredential();
    clearTrace();
    vi.unstubAllGlobals();
  });

  it('downloads workspace bytes with the Bearer credential and a per-segment-encoded path', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    );

    const blob = await createApi().getWorkspaceFileBlob('sess_1', 'docs/报告 v1.pdf');

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(
      `http://daemon.test/api/v1/sessions/sess_1/fs/docs/${encodeURIComponent('报告 v1.pdf')}:download`,
    );
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
    expect(init?.method).toBe('GET');
    expect(blob.size).toBe(4);
  });

  it('parses the daemon error envelope (e.g. 40101) into a DaemonApiError', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 40101, msg: 'unauthorized', request_id: 'req_1' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const caught = await createApi()
      .getWorkspaceFileBlob('sess_1', 'docs/a.pdf')
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonApiError);
    expect(caught).toMatchObject({ code: 40101, requestId: 'req_1' });
  });

  it('throws a DaemonNetworkError when the fetch itself fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));

    const caught = await createApi()
      .getWorkspaceFileBlob('sess_1', 'docs/a.pdf')
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonNetworkError);
  });
});
