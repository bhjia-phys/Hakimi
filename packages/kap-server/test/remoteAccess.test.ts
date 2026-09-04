import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import { ISessionMetadata, getLiveSessionById } from '@moonshot-ai/agent-core-v2';
import { pino, type Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type RawData, WebSocket } from 'ws';

import {
  REMOTE_ACCESS_FORBIDDEN_CODE,
  REMOTE_ACCESS_FORBIDDEN_MESSAGE,
  isRemoteAccessAllowed,
} from '../src/middleware/remoteAccess';
import { ErrorCode } from '../src/protocol/error-codes';
import {
  projectRemotePromptSubmission,
  projectRemoteResponseEnvelope,
} from '../src/security/remoteResponseProjection';
import { type RunningServer, startServer } from '../src/start';
import { authHeaders } from './helpers/auth';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';

const SHARED_SESSION_ID = 'shared-session';

function captureLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: pino({ level: 'info' }, stream), lines };
}

function openRemoteWebSocket(url: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, [`kimi-code.bearer.${token}`], {
      headers: {
        host: 'share-example.trycloudflare.com',
        origin: 'https://share-example.trycloudflare.com',
      },
    });
    socket.once('open', () => {
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

function rawDataToString(raw: RawData): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}

function waitForAck(socket: WebSocket, id: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ack ${id}`));
    }, 1_500);
    const onMessage = (raw: RawData): void => {
      const frame = JSON.parse(rawDataToString(raw)) as Record<string, unknown>;
      if (frame['type'] !== 'ack' || frame['id'] !== id) return;
      cleanup();
      resolve(frame);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
    };
    socket.on('message', onMessage);
    socket.on('error', onError);
  });
}

describe('remote access route policy', () => {
  it('allows only Web bootstrap reads and the shared session operations', () => {
    const allowed: Array<[string, string]> = [
      ['GET', '/'],
      ['GET', '/assets/app-12345678.js'],
      ['GET', '/sessions/shared-session'],
      ['GET', '/api/v1/healthz'],
      ['GET', '/api/v1/auth'],
      ['GET', '/api/v1/meta'],
      ['GET', '/api/v1/sessions'],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/snapshot`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/messages`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/messages/message-1`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/status`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/tasks`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/approvals`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/questions`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/prompts`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/prompts:steer`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/prompts/prompt-1:abort`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/prompts/prompt-1:steer`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}:abort`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/approvals/approval-1`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/questions/question-1`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/questions/question-1:dismiss`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/tasks/task-1:cancel`],
    ];
    for (const [method, url] of allowed) {
      expect(isRemoteAccessAllowed(method, url, SHARED_SESSION_ID), `${method} ${url}`).toBe(true);
    }
  });

  it('allows the same projected control surface for every session in all-session mode', () => {
    const allowed: Array<[string, string]> = [
      ['GET', '/api/v1/sessions'],
      ['GET', '/api/v1/sessions/session-a'],
      ['GET', '/api/v1/sessions/session-b/snapshot'],
      ['GET', '/api/v1/sessions/session-b/tasks'],
      ['POST', '/api/v1/sessions/session-a/prompts'],
      ['POST', '/api/v1/sessions/session-b:abort'],
      ['POST', '/api/v1/sessions/session-b/tasks/task-1:cancel'],
    ];
    for (const [method, url] of allowed) {
      expect(isRemoteAccessAllowed(method, url, null), `${method} ${url}`).toBe(true);
    }

    for (const [method, url] of [
      ['GET', '/api/v1/sessions/__global__'],
      ['GET', '/api/v1/sessions/session-a/profile'],
      ['POST', '/api/v1/sessions'],
      ['POST', '/api/v1/sessions/session-b:archive'],
      ['GET', '/api/v1/config'],
      ['GET', '/api/v1/workspaces'],
    ] as Array<[string, string]>) {
      expect(isRemoteAccessAllowed(method, url, null), `${method} ${url}`).toBe(false);
    }
  });

  it('fails closed for other sessions and dangerous surfaces', () => {
    const denied: Array<[string, string]> = [
      ['GET', '/openapi.json'],
      ['GET', '/asyncapi.json'],
      ['GET', '/documentation'],
      ['GET', '/api/v2/sessions'],
      ['GET', '/api/v1/debug/channels'],
      ['GET', '/api/v1/config'],
      ['GET', '/api/v1/models'],
      ['GET', '/api/v1/providers'],
      ['GET', '/api/v1/providers/example'],
      ['GET', '/api/v1/catalog/providers/example'],
      ['GET', '/api/v1/provider-usage?provider=example'],
      ['GET', '/api/v1/oauth/login'],
      ['GET', '/api/v1/oauth/usage'],
      ['GET', '/api/v1/oauth/userinfo'],
      ['GET', '/api/v1/plugins'],
      ['GET', '/api/v1/plugins/marketplace'],
      ['GET', '/api/v1/capabilities'],
      ['GET', '/api/v1/capabilities/example'],
      ['GET', '/api/v1/workspaces'],
      ['GET', '/api/v1/sessions/other-session'],
      ['GET', '/api/v1/sessions/other-session/status'],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/profile`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/children`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/transcript?agent_id=main`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/transcript/ops?agent_id=main&since_seq=0`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/transcript/user-messages`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/transcript/plan?agent_id=main`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/goal`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/warnings`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/prompts`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/tasks/task-1?with_output=true`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/research`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/terminals`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/fs/file.txt`],
      ['GET', '/api/v1/files/file-1'],
      ['GET', '/api/v1/remote-share'],
      ['POST', '/api/v1/remote-share:start'],
      ['GET', '/api/v1/remote-persistent'],
      ['POST', '/api/v1/remote-persistent:start'],
      ['POST', '/api/v1/remote-persistent:stop'],
      ['POST', '/api/v1/config'],
      ['POST', '/api/v1/providers'],
      ['POST', '/api/v1/oauth/login'],
      ['POST', '/api/v1/plugins'],
      ['POST', '/api/v1/capabilities/example:install'],
      ['POST', '/api/v1/shutdown'],
      ['POST', '/api/v1/search'],
      ['POST', '/api/v1/sessions'],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}:fork`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}:archive`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/export`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/fs:read`],
      ['POST', `/api/v1/sessions/${SHARED_SESSION_ID}/tasks/task-1`],
      ['POST', '/api/v1/files'],
      ['PUT', `/api/v1/sessions/${SHARED_SESSION_ID}/prompts`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}%2fother/status`],
      ['GET', `/api/v1/sessions/${SHARED_SESSION_ID}/../other/status`],
    ];
    for (const [method, url] of denied) {
      expect(isRemoteAccessAllowed(method, url, SHARED_SESSION_ID), `${method} ${url}`).toBe(false);
    }
  });

  it('drops prompt-time runtime overrides at the remote boundary', () => {
    const content = [{ type: 'text' as const, text: 'continue' }];
    expect(
      projectRemotePromptSubmission({
        content,
        metadata: { private: true },
        agent_id: 'side-agent',
        profile: 'dangerous-profile',
        model: 'private-provider/private-model',
        thinking: 'high',
        permission_mode: 'yolo',
        plan_mode: true,
        swarm_mode: true,
        disabled_tools: [],
      }),
    ).toEqual({ content });
  });

  it('projects error envelopes without stacks, provider details, paths, or opaque data', () => {
    const projected = projectRemoteResponseEnvelope({
      code: ErrorCode.FILE_NOT_FOUND,
      msg: 'cannot open /home/private/workspace/secret.txt',
      data: { path: '/home/private/workspace/secret.txt', safe: false },
      request_id: 'request-1',
      stack: 'Error: missing\n    at /home/private/packages/service.ts:42:1',
      details: { provider_id: 'private-provider', model_id: 'private-model' },
    });
    expect(projected).toMatchObject({
      code: ErrorCode.FILE_NOT_FOUND,
      data: { safe: false },
      request_id: 'request-1',
    });
    const json = JSON.stringify(projected);
    expect(json).not.toContain('/home/private');
    expect(json).not.toContain('private-provider');
    expect(json).not.toContain('private-model');
    expect(projected).not.toHaveProperty('stack');
    expect(projected).not.toHaveProperty('details');

    expect(
      projectRemoteResponseEnvelope({
        code: ErrorCode.INTERNAL_ERROR,
        msg: 'failed at /home/private/workspace',
        data: null,
        request_id: 'request-2',
      }),
    ).toMatchObject({ msg: 'internal.error' });
  });
});

describe('remote access server integration', () => {
  let server: RunningServer | undefined;
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kap-remote-access-'));
  });

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  });

  async function startRemote(sessionId: string | null = SHARED_SESSION_ID, logger?: Logger): Promise<RunningServer> {
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: logger === undefined ? 'silent' : undefined,
      logger,
      insecureNoTls: true,
      remoteAccess: { sessionId },
    });
    return server;
  }

  it('refuses remote mode when authentication or Host validation is disabled', async () => {
    const base = {
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent' as const,
      insecureNoTls: true,
      remoteAccess: { sessionId: SHARED_SESSION_ID },
    };

    await expect(startServer({ ...base, disableAuth: true })).rejects.toThrow(
      'Remote access requires bearer-token authentication',
    );
    await expect(startServer({ ...base, disableHostCheck: true })).rejects.toThrow(
      'Remote access requires Host validation',
    );

    const previous = process.env['KIMI_CODE_DISABLE_HOST_CHECK'];
    process.env['KIMI_CODE_DISABLE_HOST_CHECK'] = '1';
    try {
      await expect(startServer(base)).rejects.toThrow('Remote access requires Host validation');
    } finally {
      if (previous === undefined) delete process.env['KIMI_CODE_DISABLE_HOST_CHECK'];
      else process.env['KIMI_CODE_DISABLE_HOST_CHECK'] = previous;
    }
  });

  it('returns a dedicated 403 envelope, admits trycloudflare same-origin bootstrap, and changes no ordinary mode behavior', async () => {
    const remote = await startRemote();
    const headers = authHeaders(remote);

    const tunnelBootstrap = await remote.app.inject({
      method: 'GET',
      url: '/api/v1/auth',
      headers: {
        ...headers,
        host: 'share-example.trycloudflare.com',
        origin: 'https://share-example.trycloudflare.com',
      },
    });
    expect(tunnelBootstrap.statusCode).toBe(200);
    expect(tunnelBootstrap.json()).toMatchObject({ code: 0 });
    expect(tunnelBootstrap.headers['access-control-allow-origin']).toBe(
      'https://share-example.trycloudflare.com',
    );
    expect(tunnelBootstrap.headers['x-content-type-options']).toBe('nosniff');
    expect(tunnelBootstrap.headers['referrer-policy']).toBe('no-referrer');
    expect(tunnelBootstrap.headers['content-security-policy']).toContain("default-src 'self'");

    const meta = await remote.app.inject({
      method: 'GET',
      url: '/api/v1/meta',
      headers,
    });
    expect(meta.statusCode).toBe(200);
    expect(meta.json()).toMatchObject({ code: 0 });

    const target = await remote.app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${SHARED_SESSION_ID}/status`,
      headers,
    });
    expect(target.statusCode).toBe(200);
    expect(target.json()).toMatchObject({ code: 40401 });

    const promptError = await remote.app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${SHARED_SESSION_ID}/prompts`,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {
        content: [
          {
            type: 'file',
            file_id: 'missing-file',
            name: 'private.txt',
            media_type: 'text/plain',
            size: 1,
          },
        ],
        permission_mode: 'yolo',
        model: 'private-provider/private-model',
      },
    });
    expect(promptError.statusCode).toBe(200);
    expect(promptError.json()).toMatchObject({ code: ErrorCode.FILE_NOT_FOUND });
    expect(promptError.json()).not.toHaveProperty('stack');
    expect(promptError.json()).not.toHaveProperty('details');
    expect(promptError.body).not.toContain(home);
    expect(promptError.body).not.toContain('private-provider');

    const denied = await remote.app.inject({
      method: 'GET',
      url: '/api/v1/sessions/foreign-session/status?probe=private',
      headers,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      code: REMOTE_ACCESS_FORBIDDEN_CODE,
      msg: REMOTE_ACCESS_FORBIDDEN_MESSAGE,
      data: null,
      request_id: denied.json().request_id,
    });

    for (const request of [
      { method: 'GET', url: '/api/v2/sessions' },
      { method: 'GET', url: '/openapi.json' },
      { method: 'GET', url: `/api/v1/sessions/${SHARED_SESSION_ID}/terminals` },
      { method: 'GET', url: `/api/v1/sessions/${SHARED_SESSION_ID}/fs/file.txt` },
      { method: 'POST', url: '/api/v1/config', payload: {} },
      { method: 'POST', url: `/api/v1/sessions/${SHARED_SESSION_ID}:fork`, payload: {} },
    ] as const) {
      const response = await remote.app.inject({ ...request, headers });
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(403);
      expect(response.json()).toMatchObject({ code: REMOTE_ACCESS_FORBIDDEN_CODE });
    }

    await remote.close();
    server = undefined;
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
    });
    const normalConfigWrite = await server.app.inject({
      method: 'POST',
      url: '/api/v1/config',
      headers: { ...authHeaders(server), 'content-type': 'application/json' },
      payload: {},
    });
    expect(normalConfigWrite.statusCode).toBe(200);
    expect(normalConfigWrite.json()).toMatchObject({ code: 0 });
    const normalV2 = await server.app.inject({
      method: 'GET',
      url: '/api/v2/sessions',
      headers: authHeaders(server),
    });
    expect(normalV2.statusCode).toBe(200);
    expect(normalV2.json()).not.toMatchObject({ code: REMOTE_ACCESS_FORBIDDEN_CODE });
  });

  it('applies the session boundary to a trycloudflare same-origin WebSocket', async () => {
    const remote = await startRemote();
    const socket = await openRemoteWebSocket(
      `ws://127.0.0.1:${remote.port}/api/v1/ws`,
      remote.authTokenService.getToken(),
    );
    try {
      const ackPromise = waitForAck(socket, 'foreign-subscription');
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          id: 'foreign-subscription',
          payload: { session_ids: ['foreign-session'] },
        }),
      );
      await expect(ackPromise).resolves.toMatchObject({
        type: 'ack',
        code: REMOTE_ACCESS_FORBIDDEN_CODE,
        msg: REMOTE_ACCESS_FORBIDDEN_MESSAGE,
        payload: {},
      });
    } finally {
      socket.close();
    }
  });

  it('projects only the configured session in list and direct reads', async () => {
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
    });

    const createSession = async (): Promise<string> => {
      const response = await server!.app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { ...authHeaders(server!), 'content-type': 'application/json' },
        payload: { metadata: { cwd: home } },
      });
      expect(response.json()).toMatchObject({ code: 0 });
      return response.json<{ data: { id: string } }>().data.id;
    };
    const sharedId = await createSession();
    const otherId = await createSession();
    const shared = getLiveSessionById(server.core.accessor, sharedId);
    if (shared === undefined) throw new Error(`session ${sharedId} not found`);
    await shared.accessor.get(ISessionMetadata).update({
      lastPrompt: 'Open /home/example/request.md next',
      custom: {
        note: 'The user mentioned /home/example/note.md',
        secret: 'SESSION_METADATA_SECRET',
        path: '/srv/remote-private/workspace',
        nested: {
          filePath: 'C:\\Users\\Private\\secret.txt',
          thumbnailUrl: 'https://media.example.test/private.png',
          blob: 'blobref:private-image',
          data: 'private-inline-data',
          label: 'safe custom label',
        },
      },
    });

    const ordinaryDirect = await server.app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sharedId}`,
      headers: authHeaders(server),
    });
    expect(ordinaryDirect.json()).toMatchObject({
      code: 0,
      data: {
        last_prompt: 'Open /home/example/request.md next',
        metadata: {
          cwd: home,
          path: '/srv/remote-private/workspace',
          nested: {
            filePath: 'C:\\Users\\Private\\secret.txt',
            thumbnailUrl: 'https://media.example.test/private.png',
            blob: 'blobref:private-image',
            data: 'private-inline-data',
          },
        },
      },
    });

    await server.close();
    server = undefined;
    const remote = await startRemote(sharedId);
    const response = await remote.app.inject({
      method: 'GET',
      url: '/api/v1/sessions',
      headers: authHeaders(remote),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      code: number;
      data: {
        items: Array<{
          id: string;
          last_prompt?: string;
          metadata: Record<string, unknown>;
        }>;
      };
    };
    expect(body.code).toBe(0);
    expect(body.data.items.map((session) => session.id)).toEqual([sharedId]);
    expect(body.data.items.map((session) => session.id)).not.toContain(otherId);
    expect(body.data.items[0]).toMatchObject({
      last_prompt: 'Open /home/example/request.md next',
    });
    expect(body.data.items[0]?.metadata).toEqual({ cwd: '.' });

    const sharedDirect = await remote.app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sharedId}`,
      headers: authHeaders(remote),
    });
    expect(sharedDirect.statusCode).toBe(200);
    const sharedDirectBody = sharedDirect.json() as {
      code: number;
      data: { id: string; last_prompt?: string; metadata: Record<string, unknown> };
    };
    expect(sharedDirectBody).toMatchObject({
      code: 0,
      data: {
        id: sharedId,
        last_prompt: 'Open /home/example/request.md next',
      },
    });
    expect(sharedDirectBody.data.metadata).toEqual({ cwd: '.' });
    const projectedJson = JSON.stringify({ list: body.data, direct: sharedDirectBody });
    expect(projectedJson).not.toContain('/srv/remote-private');
    expect(projectedJson).not.toContain('C:\\Users\\Private');
    expect(projectedJson).not.toContain('media.example.test');
    expect(projectedJson).not.toContain('blobref:');
    expect(projectedJson).not.toContain('private-inline-data');
    expect(projectedJson).not.toContain('SESSION_METADATA_SECRET');
    expect(projectedJson).not.toContain('safe custom label');
    expect(projectedJson).not.toContain(home);

    const foreignDirect = await remote.app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${otherId}`,
      headers: authHeaders(remote),
    });
    expect(foreignDirect.statusCode).toBe(403);
  });

  it('all-session mode lists and controls every session while refusing host surfaces', async () => {
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
    });
    const createSession = async (): Promise<string> => {
      const response = await server!.app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { ...authHeaders(server!), 'content-type': 'application/json' },
        payload: { metadata: { cwd: home } },
      });
      expect(response.json()).toMatchObject({ code: 0 });
      return response.json<{ data: { id: string } }>().data.id;
    };
    const firstId = await createSession();
    const secondId = await createSession();
    await server.close();
    server = undefined;

    const remote = await startRemote(null);
    const headers = authHeaders(remote);

    // Every projected session is listed (metadata stripped to the safe shape).
    const list = await remote.app.inject({
      method: 'GET',
      url: '/api/v1/sessions',
      headers,
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      code: number;
      data: { items: Array<{ id: string; metadata: Record<string, unknown> }> };
    };
    expect(body.data.items.map((session) => session.id).toSorted()).toEqual(
      [firstId, secondId].toSorted(),
    );
    for (const item of body.data.items) {
      expect(item.metadata).toEqual({ cwd: '.' });
      expect(JSON.stringify(item)).not.toContain(home);
    }

    // Control (prompt submission) proceeds for ANY session — no 403 — with the
    // same projected error envelope as single-session mode.
    for (const id of [firstId, secondId]) {
      const prompt = await remote.app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${id}/prompts`,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: {
          content: [
            {
              type: 'file',
              file_id: 'missing-file',
              name: 'private.txt',
              media_type: 'text/plain',
              size: 1,
            },
          ],
          permission_mode: 'yolo',
          model: 'private-provider/private-model',
        },
      });
      expect(prompt.statusCode, `prompt ${id}`).toBe(200);
      expect(prompt.json()).toMatchObject({ code: ErrorCode.FILE_NOT_FOUND });
      expect(prompt.body).not.toContain('private-provider');
    }

    // Host surfaces stay refused in all-session mode.
    for (const request of [
      { method: 'GET', url: '/api/v1/config' },
      { method: 'GET', url: '/api/v1/debug/channels' },
      { method: 'GET', url: `/api/v1/sessions/${firstId}/terminals` },
      { method: 'GET', url: `/api/v1/sessions/${firstId}/fs/file.txt` },
      { method: 'POST', url: '/api/v1/shutdown', payload: {} },
      { method: 'POST', url: '/api/v1/remote-share:start', payload: {} },
      { method: 'POST', url: `/api/v1/sessions/${firstId}:fork`, payload: {} },
    ] as const) {
      const response = await remote.app.inject({ ...request, headers });
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(403);
      expect(response.json()).toMatchObject({ code: REMOTE_ACCESS_FORBIDDEN_CODE });
    }
  });

  it('redacts denied URLs and never logs denied request content', async () => {
    const { logger, lines } = captureLogger();
    const remote = await startRemote(SHARED_SESSION_ID, logger);
    const response = await remote.app.inject({
      method: 'POST',
      url: '/api/v1/config?probe=url-secret-value',
      headers: {
        ...authHeaders(remote),
        'content-type': 'application/json',
        host: 'share-example.trycloudflare.com',
      },
      payload: { providers: { token: 'body-secret-value' } },
    });
    expect(response.statusCode).toBe(403);
    await new Promise((resolve) => setImmediate(resolve));

    const output = lines.join('');
    expect(output).not.toContain('url-secret-value');
    expect(output).not.toContain('body-secret-value');
    expect(output).not.toContain('share-example.trycloudflare.com');
    const completed = lines
      .map((line) => JSON.parse(line) as { msg?: string; req?: { url?: string; host?: string }; code?: number })
      .findLast((entry) => entry.msg === 'request completed');
    expect(completed).toMatchObject({
      req: { url: '[redacted]', host: '[redacted]' },
      code: REMOTE_ACCESS_FORBIDDEN_CODE,
    });
  });
});
