/**
 * Scenario: AITP Research Mode REST routes (`/sessions/{id}/research` and
 * `/sessions/{id}/research/command`).
 * Responsibilities: verify GET returns an inactive snapshot without AITP I/O,
 * invalid body rejection, stale-revision POST mapping, enter_mode flag-gated
 * error mapping, and session-not-found.
 * Wiring: real kap-server on a temp home; the default-on AITP flag is explicitly
 * disabled so the flag-off path remains covered without AITP I/O — enter_mode
 * surfaces a coded 40001, and GET returns an inactive snapshot.
 * Run: `pnpm --filter @moonshot-ai/kap-server exec vitest run test/research.test.ts`.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IAgentResearchService,
  ensureMainAgent,
  resumeSessionById,
} from '@moonshot-ai/agent-core-v2';

import { type RunningServer, startServer } from '../src/start';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';
import { authHeaders } from './helpers/auth';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
  request_id: string;
  details?: { path: string; message: string }[];
  stack?: string;
}

interface ResearchAlert {
  fingerprint: string;
  acknowledgedAt?: number;
}

interface ResearchSnapshot {
  mode: string;
  loopStatus: string;
  questions: Array<{ id: string }>;
  lines: Array<{ slug: string }>;
  openQuestionCount: number;
  activeQuestionCount: number;
  blockedQuestionCount: number;
  alerts: ResearchAlert[];
  aitpHealth: { phase: string };
  phase: string;
  currentRun?: {
    actionId: string;
    campaign: string;
    jobId: string;
    stage: string;
    schedulerState: string;
    lastObservedAt: number;
    nextCheckAt?: number;
    artifactRefs: string[];
  };
  humanGate?: {
    gateId: string;
    resolvedAt?: number;
    resolution?: string;
  };
  revision: number;
}

describe('server-v2 /api/v1/sessions/{sid}/research', () => {
  let server: RunningServer | undefined;
  let home: string | undefined;
  let workDir: string | undefined;
  let base: string;

  beforeEach(async () => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE', '0');
    home = await mkdtemp(join(tmpdir(), 'kimi-server-v2-research-'));
    workDir = await mkdtemp(join(tmpdir(), 'kimi-server-v2-research-work-'));
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (home !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 } as never);
      home = undefined;
    }
    if (workDir !== undefined) {
      await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 } as never);
      workDir = undefined;
    }
    vi.unstubAllEnvs();
  });

  async function createSession(): Promise<string> {
    const res = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: authHeaders(server as RunningServer, { 'content-type': 'application/json' }),
      body: JSON.stringify({ metadata: { cwd: home as string } }),
    } as never);
    const body = (await res.json()) as Envelope<{ id: string }>;
    if (body.code !== 0) {
      throw new Error(`session create failed: code=${body.code} msg=${body.msg}`);
    }
    return body.data.id;
  }

  async function getJson<T>(path: string): Promise<{ status: number; body: Envelope<T> }> {
    const res = await fetch(`${base}${path}`, {
      headers: authHeaders(server as RunningServer),
    } as never);
    return { status: res.status, body: (await res.json()) as Envelope<T> };
  }

  async function postJson<T>(
    path: string,
    body: unknown,
  ): Promise<{ status: number; body: Envelope<T> }> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: authHeaders(server as RunningServer, { 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    } as never);
    return { status: res.status, body: (await res.json()) as Envelope<T> };
  }

  it('GET returns an inactive research snapshot without triggering AITP I/O', async () => {
    const sessionId = await createSession();
    const { status, body } = await getJson<ResearchSnapshot>(
      `/api/v1/sessions/${sessionId}/research`,
    );
    expect(status).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.mode).toBe('inactive');
    expect(body.data.loopStatus).toBe('active');
    expect(body.data.revision).toBe(0);
    expect(body.data.questions).toHaveLength(0);
    expect(body.data.aitpHealth.phase).toBe('inactive');
  });

  it('GET returns SESSION_NOT_FOUND for a non-existent session', async () => {
    const { status, body } = await getJson<ResearchSnapshot>(
      '/api/v1/sessions/nonexistent/research',
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40401);
  });

  it('POST rejects an invalid command body with VALIDATION_FAILED', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'unknown_kind' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
    expect(body.details).toBeDefined();
  });

  it('POST rejects update_line without its expected revision', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'update_line', lineSlug: 'main', assessment: 'new' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
    expect(body.details).toBeDefined();
  });

  it('POST rejects propose_checkpoint without its expected revision', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'propose_checkpoint', lineSlug: 'main' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
    expect(body.details).toBeDefined();
  });

  it('POST rejects a body missing the command field', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {},
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
  });

  it('POST enter_mode maps flag-disabled to VALIDATION_FAILED, not INTERNAL_ERROR', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<ResearchSnapshot>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(status).toBe(200);
    // This test explicitly disables the default-on flag, so enter_mode throws
    // aitp.mode_flag_disabled. The route maps this to VALIDATION_FAILED (40001),
    // not INTERNAL_ERROR (50001).
    expect(body.code).toBe(40001);
    expect(body.msg).toMatch(/AITP Research Mode is not enabled/i);
  });

  it('POST resolves human decisions, acknowledges alerts, and maps attention errors', async () => {
    await server!.close();
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE', '1');
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(entered.body.code).toBe(0);

    const liveSession = await resumeSessionById(server.core.accessor, sessionId);
    expect(liveSession).toBeDefined();
    const agent = await ensureMainAgent(liveSession!);
    const research = agent.accessor.get(IAgentResearchService);
    const gate = research.requestHumanDecision({
      kind: 'decision',
      prompt: 'Choose the next research direction.',
    });

    const missingGate = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'resolve_decision',
          gateId: 'missing-gate',
          resolution: 'ignored',
          nextPhase: 'idle',
        },
      },
    );
    expect(missingGate.body.code).toBe(40001);

    const invalidPhase = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'resolve_decision',
          gateId: gate.gateId,
          resolution: 'not yet',
          nextPhase: 'orienting',
        },
      },
    );
    expect(invalidPhase.body.code).toBe(40001);

    const resolved = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'resolve_decision',
          gateId: gate.gateId,
          resolution: 'Continue with the measured path.',
          nextPhase: 'idle',
        },
      },
    );
    expect(resolved.body.code).toBe(0);
    expect(resolved.body.data.snapshot.phase).toBe('idle');
    expect(resolved.body.data.snapshot.humanGate).toMatchObject({
      gateId: gate.gateId,
      resolution: 'Continue with the measured path.',
      resolvedAt: expect.any(Number),
    });

    const repeated = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'resolve_decision',
          gateId: gate.gateId,
          resolution: 'again',
          nextPhase: 'idle',
        },
      },
    );
    expect(repeated.body.code).toBe(40001);

    const createdLine = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'create_line', slug: 'main', title: 'Main line' } },
    );
    expect(createdLine.body.data.snapshot.lines[0]?.slug).toBe('main');
    const createdQuestion = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'create_question',
          lineSlug: 'main',
          wording: 'Why?',
        },
      },
    );
    const questionId = createdQuestion.body.data.snapshot.questions[0]!.id;
    const closed = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'close_question',
          questionId,
          expectedRevision: createdQuestion.body.data.snapshot.revision,
        },
      },
    );
    const reopened = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'reopen_question',
          questionId,
          expectedRevision: closed.body.data.snapshot.revision,
        },
      },
    );
    const alert = reopened.body.data.snapshot.alerts.find(
      (candidate) => candidate.fingerprint === `research.alert.reopened.question.${questionId}`,
    );
    expect(alert).toBeDefined();

    const acknowledged = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'acknowledge_alert', fingerprint: alert!.fingerprint } },
    );
    expect(acknowledged.body.code).toBe(0);
    expect(acknowledged.body.data.snapshot.alerts.find(
      (candidate) => candidate.fingerprint === alert!.fingerprint,
    )).toMatchObject({ acknowledgedAt: expect.any(Number) });
  });

  it('POST pause_loop and resume_loop return the real loopStatus snapshot', async () => {
    await server!.close();
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE', '1');
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(entered.body.code).toBe(0);
    expect(entered.body.data.snapshot.mode).not.toBe('inactive');

    const revision = entered.body.data.snapshot.revision;
    const paused = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'pause_loop', expectedRevision: revision } },
    );
    expect(paused.body.code).toBe(0);
    expect(paused.body.data.snapshot.loopStatus).toBe('paused');

    const stale = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'resume_loop', expectedRevision: revision + 1 } },
    );
    expect(stale.body.code).toBe(40001);

    const resumed = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'resume_loop', expectedRevision: revision } },
    );
    expect(resumed.body.code).toBe(0);
    expect(resumed.body.data.snapshot.loopStatus).toBe('active');
  });

  it('POST pause_loop with stale revision maps to VALIDATION_FAILED', async () => {
    const sessionId = await createSession();
    // The research model starts at revision 0 (inactive mode). A pause_loop
    // with expectedRevision=999 is stale, so the dedicated mode service throws
    // research.revision_stale — mapped to VALIDATION_FAILED.
    const { status, body } = await postJson<ResearchSnapshot>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'pause_loop', expectedRevision: 999 } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
  });

  it('POST rejects a stale checkpoint proposal without creating pending state', async () => {
    await server!.close();
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE', '1');
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    const expectedRevision = entered.body.data.snapshot.revision;
    const advanced = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'create_line', slug: 'main', title: 'Main line' } },
    );
    expect(advanced.body.data.snapshot.revision).toBeGreaterThan(expectedRevision);

    const stale = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'propose_checkpoint',
          expectedRevision,
          lineSlug: 'main',
        },
      },
    );
    expect(stale.status).toBe(200);
    expect(stale.body.code).toBe(40001);
    expect(stale.body.msg).toMatch(/revision is stale/i);

    const current = await getJson<ResearchSnapshot & { pendingCheckpoint?: unknown }>(
      `/api/v1/sessions/${sessionId}/research`,
    );
    expect(current.body.data.pendingCheckpoint).toBeUndefined();
  });

  it('POST set_focus with stale revision maps to VALIDATION_FAILED', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<ResearchSnapshot>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'set_focus',
          questionId: 'q-nonexistent',
          expectedRevision: 999,
        },
      },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
  });

  it('POST dispatches an action-bound run observation to the research service', async () => {
    await server!.close();
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE', '1');
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(entered.body.code).toBe(0);

    const liveSession = await resumeSessionById(server.core.accessor, sessionId);
    const agent = await ensureMainAgent(liveSession!);
    const research = agent.accessor.get(IAgentResearchService);
    research.setPhase('gap_analysis');
    const action = research.planAction({
      kind: 'simulation',
      purpose: 'Run the bounded HPC calculation.',
      stopCondition: 'Stop after the declared analyzer evidence exists.',
    });
    research.startAction(action.actionId);
    const before = research.getSnapshot();

    const observed = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'observe_run',
          actionId: action.actionId,
          expectedRevision: before.revision,
          campaign: 'bi2se3-r2',
          jobId: '3128781',
          stage: 'scf',
          schedulerState: 'running',
          artifactRefs: ['scf.log'],
        },
      },
    );
    expect(observed.body.code).toBe(0);
    expect(observed.body.data.snapshot.currentRun).toMatchObject({
      actionId: action.actionId,
      campaign: 'bi2se3-r2',
      jobId: '3128781',
      stage: 'scf',
      schedulerState: 'running',
      artifactRefs: ['scf.log'],
    });
  });

  it('POST on a non-existent session returns SESSION_NOT_FOUND', async () => {
    const { status, body } = await postJson<unknown>(
      '/api/v1/sessions/nonexistent/research/command',
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40401);
  });
});
