// apps/kimi-web/test/daemon-client.test.ts
// DaemonKimiWebApi public REST adapter: session export binary/error contracts,
// getSessionGoal wire → app mapping, and raw stream-coordinate delivery.
// Wiring: real client/projector; fetch or WebSocket is stubbed at the network boundary.
// Run: pnpm --filter @bhjia-phys/hakimi-web exec vitest run test/daemon-client.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DaemonKimiWebApi } from '../src/api/daemon/client';
import { DaemonApiError, DaemonNetworkError } from '../src/api/errors';
import { clearTrace, traceToJsonl } from '../src/debug/trace';
import type { AppEvent, KimiEventConnection, KimiEventMeta, ResearchCommand } from '../src/api/types';

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
  mode: 'ready',
  loopStatus: 'active',
  currentLineSlug: 'sources',
  currentFocus: { questionId: 'q_1', boundedAction: 'Read the primary source', revision: 3 },
  currentQuestion: {
    id: 'q_1',
    lineSlug: 'sources',
    wording: 'What does the primary source establish?',
    assessment: 'Still collecting evidence',
    priority: 2,
    neededEvidence: ['Primary source'],
    evidenceRefs: ['ev_1'],
    falsifierRefs: [],
    nextBoundedAction: 'Read the primary source',
    workflow: 'active',
    epistemic: 'candidate',
    persistence: 'working',
    revision: 7,
  },
  questions: [
    {
      id: 'q_1',
      lineSlug: 'sources',
      wording: 'What does the primary source establish?',
      assessment: 'Still collecting evidence',
      priority: 2,
      neededEvidence: ['Primary source'],
      evidenceRefs: ['ev_1'],
      falsifierRefs: [],
      nextBoundedAction: 'Read the primary source',
      workflow: 'active',
      epistemic: 'candidate',
      persistence: 'working',
      revision: 7,
    },
  ],
  lines: [
    {
      slug: 'sources',
      title: 'Primary sources',
      objective: 'Establish the source record',
      assessment: 'One source found',
      status: 'active',
      createdAt: 1_700_000_000_000,
      revision: 4,
    },
  ],
  openQuestionCount: 1,
  activeQuestionCount: 1,
  blockedQuestionCount: 0,
  alerts: [
    {
      fingerprint: 'alert-active',
      kind: 'stale',
      classification: 'active_blocker',
      source: 'question',
      state: 'active',
      message: 'Recheck the cached source',
      questionId: 'q_1',
      lineSlug: 'sources',
      relatedEntryId: 'entry_0',
      workstream: 'sources',
      retryOfEntryId: 'entry_retry',
      reason: 'Source changed',
      createdAt: 1_700_000_000_300,
    },
    {
      fingerprint: 'alert-acknowledged',
      kind: 'degraded',
      state: 'acknowledged',
      message: 'Historical adapter warning',
      createdAt: 1_700_000_000_000,
      acknowledgedAt: 1_700_000_000_400,
    },
  ],
  effectiveNextStep: {
    text: 'Review the new spectrum',
    source: 'research_run',
    freshness: 'current',
    observedAt: 1_700_000_000_500,
    derivedFrom: {
      actionId: 'action_1',
      entryId: 'entry_0',
      questionId: 'q_1',
      lineSlug: 'sources',
    },
  },
  goalSummary: {
    objective: 'Finish the current Goal milestone',
    status: 'active',
    remainingTurns: 8,
  },
  program: {
    topicId: 'topic-example',
    title: 'Example research program',
    goalText: 'Establish the bounded research result.',
    goalSource: 'aitp-enter',
    establishedAt: 1_700_000_000_550,
  },
  aitpHealth: {
    phase: 'ready',
    contractVersion: '1.0',
    pluginVersion: '2.0',
    pythonVersion: '3.12',
    lastCheckAt: 1_700_000_000_100,
    notInitialized: false,
  },
  aitpMaintenance: {
    status: 'ready',
    refreshedAt: 1_700_000_000_600,
    memoryStatus: 'available',
    workstream: 'sources',
    latestWorkingNoteAt: 1_700_000_000_200,
    activeNewerThanWorkingNote: true,
    unresolvedFailureCount: 1,
    unresolvedFailures: [{
      entryId: 'failure_1',
      kind: 'failure',
      summary: 'A prior run failed',
      source: 'aitp',
      authority: 'tool',
      createdAt: 1_700_000_000_100,
      workstream: 'sources',
    }],
    nextAction: 'Review the new spectrum',
    nextActionDetails: {
      text: 'Review the new spectrum',
      entryId: 'entry_0',
      authority: 'agent',
      createdAt: 1_700_000_000_500,
      source: 'aitp',
    },
    warningSummaries: [{ level: 'warning', code: 'NOTE_STALE' }],
    check: {
      status: 'findings',
      counts: { entries: 3, notes: 1, errors: 0, warnings: 1 },
      findingCodes: ['NOTE_STALE'],
    },
  },
  pendingCheckpoint: {
    checkpointId: 'cp_1',
    committedEntryId: 'entry_pending',
    questionId: 'q_1',
    questionRevision: 7,
    lineSlug: 'sources',
    assessment: 'Primary source located',
    nextAction: 'Commit the ledger entry',
    idempotencyKey: 'idem_1',
    persistence: 'pending_commit',
    receipt: {
      prepare: {
        status: 'prepared',
        id: 'draft_1',
        path: '.aitp/draft_1.json',
        idempotencyKey: 'idem_1',
        workstreams: ['sources'],
      },
      save: {
        status: 'saved',
        draftPath: '.aitp/draft_1.json',
        path: '.aitp/entry_pending.json',
        source: 'record_save',
      },
      preSaveCheck: {
        status: 'clean',
        errors: 0,
        warnings: 0,
        findingFingerprints: [],
        errorFindingFingerprints: [],
        checkedAt: 1_700_000_000_150,
      },
      postSaveCheck: {
        status: 'findings',
        errors: 0,
        warnings: 1,
        findingFingerprints: ['warning_1'],
        errorFindingFingerprints: [],
        newErrorFindingFingerprints: [],
        preExistingErrorFindingFingerprints: [],
        checkedAt: 1_700_000_000_250,
      },
    },
    createdAt: 1_700_000_000_200,
  },
  latestCommittedCheckpoint: {
    checkpointId: 'cp_0',
    entryId: 'entry_0',
    receipt: {
      prepare: {
        status: 'existing',
        id: 'entry_0',
        path: '.aitp/entry_0.json',
        idempotencyKey: 'idem_0',
        workstreams: ['sources'],
      },
    },
    committedAt: 1_700_000_000_050,
  },
  committedCheckpointHistory: [
    { checkpointId: 'cp_old', entryId: 'entry_old', committedAt: 1_699_999_999_000 },
    { checkpointId: 'cp_0', entryId: 'entry_0', committedAt: 1_700_000_000_050 },
  ],
  phase: 'action_executing',
  currentAction: {
    actionId: 'action_1',
    questionId: 'q_1',
    lineSlug: 'sources',
    kind: 'experiment',
    purpose: 'Measure the spectrum',
    expectedEvidence: ['A resolved peak'],
    stopCondition: 'Peak converges',
    allowedToolKinds: ['bash'],
    retryOfEntryId: 'entry_retry',
    status: 'in_progress',
    createdAt: 1_700_000_000_000,
    requiresHumanApproval: true,
    run: {
      actionId: 'action_1',
      campaign: 'campaign_1',
      jobId: 'job_1',
      sourcePin: 'source-sha',
      binaryPin: 'binary-sha',
      stage: 'running',
      schedulerState: 'running',
      lastObservedAt: 1_700_000_000_700,
      nextCheckAt: 1_700_000_001_000,
      artifactRefs: ['artifact://run.log'],
    },
  },
  currentRun: {
    actionId: 'action_1',
    campaign: 'campaign_1',
    jobId: 'job_1',
    sourcePin: 'source-sha',
    binaryPin: 'binary-sha',
    stage: 'running',
    schedulerState: 'running',
    lastObservedAt: 1_700_000_000_700,
    nextCheckAt: 1_700_000_001_000,
    artifactRefs: ['artifact://run.log'],
  },
  latestProgress: {
    headline: 'Spectrum run started',
    question: 'What does the primary source establish?',
    motivation: 'Resolve the remaining uncertainty',
    workPerformed: 'Submitted the measured run',
    result: 'Scheduler accepted the job',
    mainlineImpact: 'Evidence collection is active',
    uncertainties: ['Peak position is pending'],
    nextAction: 'Observe the scheduler',
    phaseChange: { from: 'action_planned', to: 'action_executing' },
    detail: {
      assumptions: ['Calibration is stable'],
      derivation: 'Use the calibrated response',
      tests: ['Check convergence'],
      observations: ['Job is running'],
      sources: ['source://primary'],
      limitations: ['No final spectrum yet'],
      detailHint: 'Inspect the run log',
      artifactRefs: ['artifact://run.log'],
    },
    recordedAt: 1_700_000_000_750,
  },
  recentStateChange: {
    beforePhase: 'action_planned',
    afterPhase: 'action_executing',
    actionId: 'action_1',
    summary: 'The experiment started',
    changedAt: 1_700_000_000_700,
  },
  humanGate: {
    gateId: 'gate_1',
    kind: 'decision',
    actionId: 'action_1',
    questionId: 'q_1',
    prompt: 'Continue after the first spectrum?',
    createdAt: 1_700_000_000_800,
  },
  revision: 11,
};

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

  it('gets and maps the complete Research snapshot from the encoded session path', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_RESEARCH));

    const snapshot = await createApi().getSessionResearch('sess/1');

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess%2F1/research',
    );
    expect(snapshot).toEqual(WIRE_RESEARCH);
    expect(snapshot).not.toBe(WIRE_RESEARCH);
    expect(snapshot.currentAction).not.toBe(WIRE_RESEARCH.currentAction);
    expect(snapshot.aitpMaintenance).not.toBe(WIRE_RESEARCH.aitpMaintenance);
    expect(snapshot.program).toEqual(WIRE_RESEARCH.program);
    expect(snapshot.program).not.toBe(WIRE_RESEARCH.program);
  });

  it('posts the typed command and maps the returned snapshot', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({ snapshot: WIRE_RESEARCH }));
    const command = { kind: 'set_focus', questionId: 'q_1', expectedRevision: 11 } as const;

    const snapshot = await createApi().commandSessionResearch('sess/1', command);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://daemon.test/api/v1/sessions/sess%2F1/research/command');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ command }) });
    expect(snapshot.revision).toBe(11);
  });

  it.each([
    {
      kind: 'resolve_decision',
      gateId: 'gate_1',
      resolution: 'Continue',
      nextPhase: 'idle',
    },
    {
      kind: 'review_evidence',
      expectedRevision: 11,
      packet: {
        packet_id: 'packet_1',
        kind: 'observation',
        claim: 'The peak is resolved',
        evidence: 'Measured spectrum',
        assumptions: [],
        tests: [],
        artifact_refs: [],
        source_refs: [],
        limitations: [],
        confidence: 'high',
      },
    },
    {
      kind: 'observe_run',
      actionId: 'action_1',
      expectedRevision: 11,
      campaign: 'campaign_1',
      jobId: 'job_1',
      stage: 'running',
      schedulerState: 'running',
      artifactRefs: ['artifact://run.log'],
    },
    { kind: 'acknowledge_alert', fingerprint: 'alert-active' },
  ] satisfies ResearchCommand[])('posts the $kind Research Manager command unchanged', async (command) => {
    vi.mocked(fetch).mockResolvedValue(envelope({ snapshot: WIRE_RESEARCH }));

    await createApi().commandSessionResearch('sess/1', command);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://daemon.test/api/v1/sessions/sess%2F1/research/command');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ command }) });
  });
});

describe('DaemonKimiWebApi config and provider usage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps subagent presets and secondary-model config without changing nested casing', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        providers: {},
        subagent: {
          preset: 'balanced',
          agents: { coder: { model: 'deepseek', thinkingEffort: 'high' } },
          presets: {
            balanced: { reviewer: { model: 'codex', thinkingEffort: 'xhigh' } },
          },
        },
        secondary_model: {
          defaultModel: 'fallback',
          maxContextSize: 128000,
          supportEfforts: ['high'],
        },
      }),
    );

    await expect(createApi().getConfig()).resolves.toMatchObject({
      subagent: {
        preset: 'balanced',
        agents: { coder: { model: 'deepseek', thinkingEffort: 'high' } },
      },
      secondaryModel: {
        defaultModel: 'fallback',
        maxContextSize: 128000,
        supportEfforts: ['high'],
      },
    });
  });

  it('posts subagent and secondary-model patches to their shared config domains', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({ providers: {} }));

    await createApi().setConfig({
      subagent: {
        preset: 'kimi-heavy',
        presets: { 'kimi-heavy': { researcher: { model: 'kimi', thinkingEffort: 'max' } } },
      },
      secondaryModel: { defaultModel: 'fallback', force: true },
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://daemon.test/api/v1/config');
    if (typeof init?.body !== 'string') throw new Error('expected a JSON string body');
    expect(JSON.parse(init.body)).toEqual({
      subagent: {
        preset: 'kimi-heavy',
        presets: { 'kimi-heavy': { researcher: { model: 'kimi', thinkingEffort: 'max' } } },
      },
      secondary_model: { defaultModel: 'fallback', force: true },
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
      type: 'research.updated',
      seq: 1,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { snapshot: WIRE_RESEARCH },
    });
    socket.emit({
      type: 'event.research.updated',
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
