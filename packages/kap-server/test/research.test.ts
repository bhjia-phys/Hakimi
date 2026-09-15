/** Research memory-mode REST / WS coverage against the real server. */
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { IAgentResearchService, ISessionAitpAdapter, ensureMainAgent, resumeSessionById, type ResearchModeSnapshot } from '@moonshot-ai/agent-core-v2';
import { type RunningServer, startServer } from '../src/start';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';
import { authHeaders } from './helpers/auth';
import { getSessionResearchResponseSchema, researchCommandResponseSchema } from '../src/protocol/research';
import { researchModeUpdatedEventSchema } from '../src/protocol/events-zod';

interface Envelope<T> { code: number; msg: string; data: T; request_id: string }

describe('Research memory-mode REST and WS', () => {
  let server: RunningServer;
  let home: string;
  let workDir: string;
  let base: string;
  const connections: WebSocket[] = [];
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'research-memory-home-'));
    workDir = await mkdtemp(join(tmpdir(), 'research-memory-work-'));
    server = await startServer({ hostIdentity: TEST_HOST_IDENTITY, host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    base = `http://127.0.0.1:${server.port}/api/v1`;
  });
  afterEach(async () => {
    for (const ws of connections.splice(0)) {
      if (ws.readyState === WebSocket.CLOSED) continue;
      const closed = once(ws, 'close');
      ws.terminate();
      await closed;
    }
    await server.close();
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  async function request<T>(path: string, body?: unknown): Promise<Envelope<T>> {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: authHeaders(server, { 'content-type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return await response.json() as Envelope<T>;
  }
  async function createSession(): Promise<string> {
    const result = await request<{ id: string }>('/sessions', { metadata: { cwd: workDir } });
    expect(result.code).toBe(0);
    return result.data.id;
  }

  it('GET and mode commands do not resolve the old runtime or create project files', async () => {
    const id = await createSession();
    const initial = await request(`/sessions/${id}/research`);
    expect(initial.code).toBe(0);
    expect(getSessionResearchResponseSchema.parse(initial.data)).toEqual({ enabled: false, skillsAvailable: false });
    const session = (await resumeSessionById(server.core.accessor, id))!;
    const agent = await ensureMainAgent(session);
    expect(() => agent.accessor.get(IAgentResearchService)).toThrow();
    expect(() => session.accessor.get(ISessionAitpAdapter)).toThrow();
    const entered = await request<{ snapshot: ResearchModeSnapshot }>(`/sessions/${id}/research/command`, { command: { kind: 'enter_mode', actor: 'user' } });
    expect(entered.code).toBe(0);
    expect(researchCommandResponseSchema.parse(entered.data)).toEqual({ snapshot: { enabled: true, skillsAvailable: false } });
    const exited = await request(`/sessions/${id}/research/command`, { command: { kind: 'exit_mode' } });
    expect(exited).toMatchObject({ code: 0, data: { snapshot: { enabled: false, skillsAvailable: false } } });
    expect(await readdir(workDir)).toEqual([]);
  });

  it('rejects old mutations with a client-actionable retired error while keeping exit available', async () => {
    const id = await createSession();
    for (const command of [
      { kind: 'pause_loop', expectedRevision: 0 },
      { kind: 'create_line', slug: 'old', title: 'Old' },
      { kind: 'discard_historical_checkpoint', checkpointId: 'pending', expectedRevision: 0 },
      { kind: 'enter_mode', actor: 'user', lineSlug: 'old' },
    ]) {
      const result = await request(`/sessions/${id}/research/command`, { command });
      expect(result).toMatchObject({ code: 40001, msg: expect.stringContaining('research.retired'), data: null });
    }
    expect(await request(`/sessions/${id}/research/command`, { command: { kind: 'exit_mode' } })).toMatchObject({ code: 0 });
  });

  it('keeps request validation and session-not-found behavior', async () => {
    const id = await createSession();
    expect(await request(`/sessions/${id}/research/command`, { command: { kind: 'unknown' } })).toMatchObject({ code: 40001 });
    expect(await request('/sessions/not-found/research')).toMatchObject({ code: 40401 });
  });

  it('sends the new snapshot on the authenticated WS stream', async () => {
    const id = await createSession();
    await request(`/sessions/${id}/research`);
    const token = server.authTokenService.getToken();
    const frames: Array<{ type: string; id?: string; payload?: { accepted_subscriptions?: string[]; snapshot?: ResearchModeSnapshot } }> = [];
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/ws`, [`kimi-code.bearer.${token}`]);
    connections.push(ws);
    ws.on('message', (data) => {
      const buffer = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data) ? data : Buffer.from(data);
      frames.push(JSON.parse(buffer.toString('utf8')));
    });
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'client_hello', id: 'research-subscription', payload: { token, client_id: 'cli', subscriptions: [id] } }));
    await expect.poll(() => frames.find((frame) => frame.id === 'research-subscription')).toMatchObject({ payload: { accepted_subscriptions: [id] } });
    await request(`/sessions/${id}/research/command`, { command: { kind: 'enter_mode', actor: 'user' } });
    await expect.poll(() => frames.find((frame) => frame.type === 'research_mode.updated')).toMatchObject({ payload: { snapshot: { enabled: true, skillsAvailable: false } } });
    const frame = frames.find((item) => item.type === 'research_mode.updated')!;
    expect(researchModeUpdatedEventSchema.parse({ type: frame.type, snapshot: frame.payload?.snapshot })).toEqual({ type: 'research_mode.updated', snapshot: { enabled: true, skillsAvailable: false } });
  });

  it('cold-reopens an enabled toggle without creating AITP data', async () => {
    const id = await createSession();
    await request(`/sessions/${id}/research/command`, { command: { kind: 'enter_mode', actor: 'user' } });
    await server.close();
    server = await startServer({ hostIdentity: TEST_HOST_IDENTITY, host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    base = `http://127.0.0.1:${server.port}/api/v1`;
    expect(await request(`/sessions/${id}/research`)).toMatchObject({ code: 0, data: { enabled: true, skillsAvailable: false } });
    expect(await readdir(workDir)).toEqual([]);
  });
});
