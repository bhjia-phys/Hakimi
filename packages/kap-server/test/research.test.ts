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

interface ResearchSnapshot {
  mode: string;
  loopStatus: string;
  questions: unknown[];
  lines: unknown[];
  openQuestionCount: number;
  activeQuestionCount: number;
  blockedQuestionCount: number;
  alerts: unknown[];
  aitpHealth: { phase: string };
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

  it('POST on a non-existent session returns SESSION_NOT_FOUND', async () => {
    const { status, body } = await postJson<unknown>(
      '/api/v1/sessions/nonexistent/research/command',
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40401);
  });
});
