import { request as httpRequest } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type RawData, WebSocket } from 'ws';

import {
  createRemoteShareController,
  projectRemoteShareStatus,
  REMOTE_SHARE_ALREADY_ACTIVE_CODE,
  RemoteShareError,
} from '../src';
import type {
  IRemoteShareController,
  RemoteAccessEdge,
  RemoteAccessEdgeFactory,
  RemoteShareStartResult,
  RemoteShareStatus,
} from '../src';
import { type RunningServer, startServer } from '../src/start';
import { authHeaders } from './helpers/auth';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';

/** Env var driving the `remote_control` experimental flag (registered in kap-server). */
const REMOTE_CONTROL_FLAG_ENV = 'KIMI_CODE_EXPERIMENTAL_REMOTE_CONTROL';

function setRemoteControlFlag(enabled: boolean): void {
  process.env[REMOTE_CONTROL_FLAG_ENV] = enabled ? '1' : '0';
}

function rawDataToString(raw: RawData): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}

function openEdgeWebSocket(url: string, token: string): Promise<WebSocket> {
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

/** Start the main listener with the remote-share control surface enabled. */
async function startMain(opts: {
  home: string;
  controller?: IRemoteShareController;
  webAssetsDir?: string;
  flag?: boolean;
}): Promise<RunningServer> {
  setRemoteControlFlag(opts.flag ?? true);
  return startServer({
    hostIdentity: TEST_HOST_IDENTITY,
    host: '127.0.0.1',
    port: 0,
    homeDir: opts.home,
    logLevel: 'silent',
    webAssetsDir: opts.webAssetsDir,
    remoteShareController: opts.controller,
  });
}

interface CapturingRemoteShareController {
  readonly controller: IRemoteShareController;
  lastStart(): RemoteShareStartResult | undefined;
}

function createCapturingRemoteShareController(opts?: {
  readonly buildUrl?: (result: RemoteShareStartResult) => string;
  readonly onClose?: () => void;
}): CapturingRemoteShareController {
  const inner = createRemoteShareController();
  let lastStart: RemoteShareStartResult | undefined;
  let publicUrl: string | null = null;
  const withUrl = (status: RemoteShareStatus, url: string | null): RemoteShareStatus => ({
    ...projectRemoteShareStatus(status),
    url,
  });

  return {
    controller: {
      status: () => {
        const status = inner.status();
        return withUrl(status, status.active ? publicUrl : null);
      },
      start: async (input, factory) => {
        const result = await inner.start(input, factory);
        publicUrl = opts?.buildUrl?.(result) ?? null;
        lastStart = { ...result, url: publicUrl };
        return lastStart;
      },
      stop: async () => {
        publicUrl = null;
        return withUrl(await inner.stop(), null);
      },
      close: async () => {
        opts?.onClose?.();
        publicUrl = null;
        await inner.close();
      },
    },
    lastStart: () => lastStart,
  };
}

async function createSession(server: RunningServer, cwd: string): Promise<string> {
  const response = await server.app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    headers: { ...authHeaders(server), 'content-type': 'application/json' },
    payload: { metadata: { cwd } },
  });
  const body = response.json() as { code: number; data?: { id: string } };
  expect(body.code).toBe(0);
  if (body.data === undefined) throw new Error('session create returned no data');
  return body.data.id;
}

async function startShare(
  server: RunningServer,
  sessionId: string,
  getInternalResult: () => RemoteShareStartResult | undefined,
  ttl?: number,
): Promise<RemoteShareStartResult> {
  const response = await server.app.inject({
    method: 'POST',
    url: '/api/v1/remote-share:start',
    headers: { ...authHeaders(server), 'content-type': 'application/json' },
    payload: ttl === undefined ? { session_id: sessionId } : { session_id: sessionId, ttl },
  });
  expect(response.statusCode).toBe(200);
  const body = response.json() as { code: number; data: RemoteShareStatus };
  expect(body.code).toBe(0);
  expect(body.data).toMatchObject({ active: true, session_id: sessionId, host: '127.0.0.1' });
  expect(body.data).toHaveProperty('url');
  expect(body.data).not.toHaveProperty('token');
  expect(body.data.port).toBeGreaterThan(0);

  const internalResult = getInternalResult();
  if (internalResult === undefined) throw new Error('host controller captured no start result');
  expect(internalResult.token.length).toBeGreaterThan(0);
  return { ...body.data, token: internalResult.token };
}

async function edgeFetch(port: number, path: string, token?: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

/**
 * Edge HTTP request with caller-controlled headers — `fetch` cannot set the
 * `Host` header, so the Host/Origin rejection tests go through `http.request`.
 */
function rawEdgeFetch(
  port: number,
  path: string,
  token: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 0,
              headers: Object.fromEntries(
                Object.entries(res.headers).map(([key, value]) => [key, String(value)]),
              ),
            }),
          );
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Expect the edge WS upgrade to be refused (Host/Origin/token failures). */
function expectEdgeWsRejected(
  port: number,
  token: string,
  headers?: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws`, [
      `kimi-code.bearer.${token}`,
    ], { headers });
    const done = (err?: Error): void => {
      clearTimeout(timeout);
      socket.removeAllListeners();
      try {
        socket.terminate();
      } catch {
        // ignore
      }
      if (err !== undefined) reject(err);
      else resolve();
    };
    const timeout = setTimeout(
      () => done(new Error('connection was not rejected within timeout')),
      1_500,
    );
    socket.once('open', () => {
      done(new Error('connection unexpectedly opened'));
    });
    socket.once('error', () => {
      done();
    });
    socket.once('close', () => {
      done();
    });
  });
}

async function makeWebAssets(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kap-remote-share-web-'));
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), '<main>Kimi</main>');
  await writeFile(join(dir, 'assets', 'app-12345678.js'), 'export {};');
  return dir;
}

describe('remote share controller (unit)', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kap-remote-share-unit-'));
  });

  afterEach(async () => {
    setRemoteControlFlag(false);
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  });

  it('starts with a fresh ephemeral credential, reports status, and stops idempotently', async () => {
    const controller = createRemoteShareController();
    let closed = 0;
    let factoryArgs: { sessionId: string; token: string } | undefined;
    const factory: RemoteAccessEdgeFactory = async (args) => {
      factoryArgs = { sessionId: args.sessionId, token: args.authTokenService.getToken() };
      return {
        sessionId: args.sessionId,
        host: '127.0.0.1',
        port: 0,
        close: async () => {
          closed += 1;
        },
      };
    };

    expect(controller.status()).toEqual({
      active: false,
      session_id: null,
      host: null,
      port: null,
      url: null,
      ttl_seconds: null,
      started_at: null,
      expires_at: null,
    });

    const result = await controller.start({ sessionId: 'session-a' }, factory);
    expect(result).toMatchObject({
      active: true,
      session_id: 'session-a',
      host: '127.0.0.1',
      port: 0,
      url: null,
      ttl_seconds: null,
      expires_at: null,
    });
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
    expect(factoryArgs).toEqual({ sessionId: 'session-a', token: result.token });
    expect(factoryArgs!.token.length).toBeGreaterThan(0);

    const status = controller.status();
    expect(status.active).toBe(true);
    expect(status.url).toBeNull();
    expect(status).not.toHaveProperty('token');
    expect(projectRemoteShareStatus(result)).toEqual(status);
    expect(projectRemoteShareStatus(result)).not.toHaveProperty('token');

    // A second share while one is active is rejected with the dedicated code.
    await expect(controller.start({ sessionId: 'session-b' }, factory)).rejects.toMatchObject({
      name: 'RemoteShareError',
      code: REMOTE_SHARE_ALREADY_ACTIVE_CODE,
    });

    await expect(controller.stop()).resolves.toMatchObject({ active: false });
    expect(closed).toBe(1);
    await expect(controller.stop()).resolves.toMatchObject({ active: false });
    expect(closed).toBe(1);
    await controller.close();
    expect(closed).toBe(1);
  });

  it('single-flights concurrent starts and closes an edge stopped during startup', async () => {
    const controller = createRemoteShareController();
    let releaseFactory!: () => void;
    const factoryGate = new Promise<void>((resolve) => {
      releaseFactory = resolve;
    });
    let factoryCalls = 0;
    let closed = 0;
    const factory: RemoteAccessEdgeFactory = async (args) => {
      factoryCalls += 1;
      await factoryGate;
      return {
        sessionId: args.sessionId,
        host: '127.0.0.1',
        port: 0,
        close: async () => {
          closed += 1;
        },
      };
    };

    const firstStart = controller.start({ sessionId: 'session-a' }, factory);
    await expect(
      controller.start({ sessionId: 'session-b' }, factory),
    ).rejects.toMatchObject({
      name: 'RemoteShareError',
      code: REMOTE_SHARE_ALREADY_ACTIVE_CODE,
      message: 'remote share is already starting',
    });
    expect(factoryCalls).toBe(1);

    const stop = controller.stop();
    releaseFactory();
    await expect(firstStart).resolves.toMatchObject({ active: false });
    await expect(stop).resolves.toMatchObject({ active: false });
    expect(closed).toBe(1);
    expect(controller.status()).toMatchObject({ active: false });
  });

  it('keeps stop idempotent when an in-flight start fails', async () => {
    const controller = createRemoteShareController();
    let rejectFactory!: (error: Error) => void;
    const factoryResult = new Promise<RemoteAccessEdge>((_resolve, reject) => {
      rejectFactory = reject;
    });
    const factory: RemoteAccessEdgeFactory = async () => factoryResult;

    const start = controller.start({ sessionId: 'session-a' }, factory);
    const stop = controller.stop();
    rejectFactory(new Error('factory failed'));

    await expect(start).rejects.toThrow('factory failed');
    await expect(stop).resolves.toMatchObject({ active: false });
    expect(controller.status()).toMatchObject({ active: false });
  });

  it('auto-stops the edge when the TTL expires', async () => {
    const controller = createRemoteShareController();
    let closed = false;
    const factory: RemoteAccessEdgeFactory = async (args) => ({
      sessionId: args.sessionId,
      host: '127.0.0.1',
      port: 0,
      close: async () => {
        closed = true;
      },
    });

    await controller.start({ sessionId: 'session-a', ttlSeconds: 0.05 }, factory);
    expect(controller.status().active).toBe(true);
    const deadline = Date.now() + 2_000;
    while (controller.status().active && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(controller.status().active).toBe(false);
    expect(closed).toBe(true);
  });

  it('proves RemoteShareError is exported for host-side handling', () => {
    expect(RemoteShareError).toBeTypeOf('function');
  });
});

describe('remote share control routes', () => {
  let server: RunningServer | undefined;
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kap-remote-share-routes-'));
  });

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    setRemoteControlFlag(false);
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  });

  it('exposes the remote_control flag via /meta but registers no control routes without a controller', async () => {
    server = await startMain({ home });
    const meta = await server.app.inject({
      method: 'GET',
      url: '/api/v1/meta',
      headers: authHeaders(server),
    });
    expect(meta.statusCode).toBe(200);
    const metaBody = meta.json() as { code: number; data: { experimental_flags: Record<string, boolean> } };
    expect(metaBody.code).toBe(0);
    expect(metaBody.data.experimental_flags['remote_control']).toBe(true);

    const status = await server.app.inject({
      method: 'GET',
      url: '/api/v1/remote-share',
      headers: authHeaders(server),
    });
    expect(status.statusCode).toBe(404);
    const start = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-share:start',
      headers: { ...authHeaders(server), 'content-type': 'application/json' },
      payload: { session_id: 'x' },
    });
    expect(start.statusCode).toBe(404);
  });

  it('registers no control routes when the flag is off even with a controller', async () => {
    server = await startMain({ home, controller: createRemoteShareController(), flag: false });
    const status = await server.app.inject({
      method: 'GET',
      url: '/api/v1/remote-share',
      headers: authHeaders(server),
    });
    expect(status.statusCode).toBe(404);
    const meta = await server.app.inject({
      method: 'GET',
      url: '/api/v1/meta',
      headers: authHeaders(server),
    });
    const metaBody = meta.json() as { data: { experimental_flags: Record<string, boolean> } };
    expect(metaBody.data.experimental_flags['remote_control']).toBe(false);
  });

  it('validates action bodies and rejects unsupported actions', async () => {
    server = await startMain({ home, controller: createRemoteShareController() });
    const headers = authHeaders(server);

    for (const payload of [undefined, {}, { session_id: '' }, { session_id: 'x', ttl: 0 }, { session_id: 'x', ttl: -1 }, { session_id: 'x', ttl: 1.5 }]) {
      const response = await server.app.inject({
        method: 'POST',
        url: '/api/v1/remote-share:start',
        // An undefined payload must not carry the JSON content type — with it,
        // Fastify's JSON parser rejects the empty body before our validation.
        headers: payload === undefined ? headers : { ...headers, 'content-type': 'application/json' },
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(200);
      expect(response.json()).toMatchObject({ code: 40001 });
    }

    const stop = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-share:stop',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {},
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json()).toMatchObject({ code: 0, data: { active: false } });

    const invalidStop = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-share:stop',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { session_id: 'unexpected' },
    });
    expect(invalidStop.statusCode).toBe(200);
    expect(invalidStop.json()).toMatchObject({ code: 40001 });

    const unsupported = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-share:restart',
      headers,
    });
    expect(unsupported.statusCode).toBe(200);
    expect(unsupported.json()).toMatchObject({ code: 40001 });
  });

  it('refuses to run when authentication or Host validation is disabled', async () => {
    const base = {
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent' as const,
      remoteShareController: createRemoteShareController(),
    };
    setRemoteControlFlag(true);
    await expect(startServer({ ...base, disableAuth: true })).rejects.toThrow(
      'Remote share control requires bearer-token authentication',
    );
    await expect(startServer({ ...base, disableHostCheck: true })).rejects.toThrow(
      'Remote share control requires Host validation',
    );
  });
});

describe('main + edge share the same Core', () => {
  let server: RunningServer | undefined;
  let home: string;
  let webAssetsDir: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kap-remote-share-io-'));
  });

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    setRemoteControlFlag(false);
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    if (webAssetsDir !== undefined) {
      await rm(webAssetsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
      webAssetsDir = undefined;
    }
  });

  it('keeps the main listener full while the edge serves the complete data plane', async () => {
    const managed = createCapturingRemoteShareController({
      buildUrl: (result) =>
        `https://share-example.trycloudflare.com/#token=${encodeURIComponent(result.token)}`,
    });
    const controller = managed.controller;
    webAssetsDir = await makeWebAssets();
    server = await startMain({ home, controller, webAssetsDir });

    const target = await createSession(server, home);
    const foreign = await createSession(server, home);
    // A file the full edge fs surface must be able to serve from the session
    // workspace (the session cwd is `home`).
    await writeFile(join(home, 'shared.txt'), 'shared file content');
    const share = await startShare(server, target, managed.lastStart, 3_600);
    expect(share).toMatchObject({
      active: true,
      session_id: target,
      ttl_seconds: 3_600,
      host: '127.0.0.1',
      url: `https://share-example.trycloudflare.com/#token=${encodeURIComponent(share.token)}`,
    });
    expect(share.expires_at).not.toBeNull();
    expect(share.started_at).not.toBeNull();

    // Status never re-exposes the ephemeral token.
    const statusResponse = await server.app.inject({
      method: 'GET',
      url: '/api/v1/remote-share',
      headers: authHeaders(server),
    });
    expect(statusResponse.statusCode).toBe(200);
    const statusBody = statusResponse.json() as { code: number; data: RemoteShareStatus };
    expect(statusBody.code).toBe(0);
    expect(statusBody.data).toMatchObject({
      active: true,
      session_id: target,
      port: share.port,
      url: share.url,
    });
    expect(statusBody.data).not.toHaveProperty('token');

    // A second share while one is active is a dedicated conflict.
    const conflict = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-share:start',
      headers: { ...authHeaders(server), 'content-type': 'application/json' },
      payload: { session_id: target },
    });
    expect(conflict.json()).toMatchObject({ code: REMOTE_SHARE_ALREADY_ACTIVE_CODE });

    const edgeToken = share.token;
    const edgePort = share.port as number;

    // The main listener keeps its full surface (no projection, no 403s).
    const mainConfigWrite = await server.app.inject({
      method: 'POST',
      url: '/api/v1/config',
      headers: { ...authHeaders(server), 'content-type': 'application/json' },
      payload: {},
    });
    expect(mainConfigWrite.statusCode).toBe(200);
    expect(mainConfigWrite.json()).toMatchObject({ code: 0 });
    const mainList = await server.app.inject({
      method: 'GET',
      url: '/api/v1/sessions',
      headers: authHeaders(server),
    });
    const mainListBody = mainList.json() as { code: number; data: { items: Array<{ id: string }> } };
    expect(mainListBody.code).toBe(0);
    expect(mainListBody.data.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([target, foreign]),
    );

    // Edge bootstrap + full surface work with the EPHEMERAL token.
    const edgeHealth = await edgeFetch(edgePort, '/api/v1/healthz');
    expect(edgeHealth.status).toBe(200);
    expect(await edgeHealth.json()).toMatchObject({ code: 0 });

    const edgeMeta = await edgeFetch(edgePort, '/api/v1/meta', edgeToken);
    expect(edgeMeta.status).toBe(200);
    expect(await edgeMeta.json()).toMatchObject({ code: 0 });

    // Sessions: EVERY session is listed, and direct reads carry FULL metadata
    // (no `{ cwd: '.' }` projection, no secrets/paths withheld).
    const edgeList = await edgeFetch(edgePort, '/api/v1/sessions', edgeToken);
    const edgeListBody = (await edgeList.json()) as { code: number; data: { items: Array<{ id: string }> } };
    expect(edgeListBody.code).toBe(0);
    expect(edgeListBody.data.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([target, foreign]),
    );

    for (const sessionId of [target, foreign]) {
      const edgeDirect = await edgeFetch(edgePort, `/api/v1/sessions/${sessionId}`, edgeToken);
      const edgeDirectBody = (await edgeDirect.json()) as {
        code: number;
        data: { id: string; metadata: Record<string, unknown> };
      };
      expect(edgeDirectBody.code).toBe(0);
      expect(edgeDirectBody.data.id).toBe(sessionId);
      expect(edgeDirectBody.data.metadata).toMatchObject({ cwd: home });
    }

    // Cross-session reads work end to end (foreign session messages).
    const foreignMessages = await edgeFetch(
      edgePort,
      `/api/v1/sessions/${foreign}/messages`,
      edgeToken,
    );
    expect(foreignMessages.status).toBe(200);
    expect(await foreignMessages.json()).toMatchObject({ code: 0 });

    // Tasks: the full, unprojected output shape.
    const edgeTasks = await edgeFetch(edgePort, `/api/v1/sessions/${target}/tasks`, edgeToken);
    expect(edgeTasks.status).toBe(200);
    expect(await edgeTasks.json()).toMatchObject({ code: 0, data: { items: expect.any(Array) } });

    // Workspaces: the full registry.
    const edgeWorkspaces = await edgeFetch(edgePort, '/api/v1/workspaces', edgeToken);
    expect(edgeWorkspaces.status).toBe(200);
    expect(await edgeWorkspaces.json()).toMatchObject({ code: 0, data: { items: expect.any(Array) } });

    // Config: readable AND writable through the edge (no projection).
    const edgeConfigGet = await edgeFetch(edgePort, '/api/v1/config', edgeToken);
    expect(edgeConfigGet.status).toBe(200);
    expect(await edgeConfigGet.json()).toMatchObject({ code: 0 });
    const edgeConfigWrite = await fetch(`http://127.0.0.1:${edgePort}/api/v1/config`, {
      method: 'POST',
      headers: { authorization: `Bearer ${edgeToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(edgeConfigWrite.status).toBe(200);
    expect(await edgeConfigWrite.json()).toMatchObject({ code: 0 });

    // Filesystem: the full fs surface serves the real file content.
    const edgeFs = await edgeFetch(
      edgePort,
      `/api/v1/sessions/${target}/fs/shared.txt:download`,
      edgeToken,
    );
    expect(edgeFs.status, 'fs download').toBe(200);
    expect(await edgeFs.text()).toBe('shared file content');

    // API v2 is reachable like on the main listener.
    const edgeV2 = await edgeFetch(edgePort, '/api/v2/sessions', edgeToken);
    expect(edgeV2.status).toBe(200);
    expect(await edgeV2.json()).toMatchObject({ code: 0 });

    // Debug RPC, PTY terminals, the shutdown route, and the nested
    // remote-share / remote-persistent control surfaces are NOT registered on
    // the edge (404 — the dedicated 40302 allowlist denials are gone because
    // the full listener has no remote allowlist; `start.ts` keeps those
    // surfaces disabled for the tunnel-exposed listener).
    for (const request of [
      { method: 'GET' as const, path: `/api/v1/sessions/${target}/terminals` },
      { method: 'GET' as const, path: '/api/v1/debug/channels' },
      { method: 'GET' as const, path: '/api/v1/remote-share' },
      { method: 'POST' as const, path: '/api/v1/remote-share:start' },
      { method: 'GET' as const, path: '/api/v1/remote-persistent' },
      { method: 'POST' as const, path: '/api/v1/remote-persistent:start' },
      { method: 'POST' as const, path: '/api/v1/remote-persistent:stop' },
      { method: 'GET' as const, path: '/openapi.json' },
    ]) {
      const response = await edgeFetch(edgePort, request.path, edgeToken);
      expect(response.status, `${request.method} ${request.path}`).toBe(404);
    }

    // The edge accepts ONLY its ephemeral credential: the main token, a wrong
    // token, and a missing token are all 401.
    const edgeTokenOnMain = await server.app.inject({
      method: 'GET',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${edgeToken}` },
    });
    expect(edgeTokenOnMain.statusCode).toBe(401);
    const mainTokenOnEdge = await edgeFetch(edgePort, `/api/v1/sessions/${target}`, authHeaders(server)['authorization']);
    expect(mainTokenOnEdge.status).toBe(401);
    const noTokenOnEdge = await edgeFetch(edgePort, '/api/v1/sessions');
    expect(noTokenOnEdge.status).toBe(401);
    const wrongTokenOnEdge = await edgeFetch(edgePort, '/api/v1/sessions', 'wrong-token');
    expect(wrongTokenOnEdge.status).toBe(401);

    // Host / Origin are still enforced on the edge: a spoofed Host gets 403 on
    // HTTP, and both a spoofed Host and a disallowed browser Origin refuse the
    // WS upgrade (before token validation, matching the main listener).
    const spoofedHostEdge = await rawEdgeFetch(edgePort, '/api/v1/sessions', edgeToken, {
      host: 'evil.example.test',
    });
    expect(spoofedHostEdge.status).toBe(403);
    await expect(
      expectEdgeWsRejected(edgePort, edgeToken, {
        host: 'evil.example.test',
        origin: 'https://evil.example.test',
      }),
    ).resolves.toBeUndefined();
    await expect(
      expectEdgeWsRejected(edgePort, edgeToken, {
        host: 'share-example.trycloudflare.com',
        origin: 'http://evil.example.test',
      }),
    ).resolves.toBeUndefined();
    await expect(
      expectEdgeWsRejected(edgePort, 'wrong-token', {
        host: 'share-example.trycloudflare.com',
        origin: 'https://share-example.trycloudflare.com',
      }),
    ).resolves.toBeUndefined();

    // Web assets are served (auth-exempt).
    const page = await edgeFetch(edgePort, '/');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<main>Kimi</main>');
    const asset = await edgeFetch(edgePort, '/assets/app-12345678.js');
    expect(asset.status).toBe(200);

    // The edge WS admits the full protocol: subscriptions to every real
    // session ack with code 0 (no remote allowlist / fan-out projection).
    const socket = await openEdgeWebSocket(`ws://127.0.0.1:${edgePort}/api/v1/ws`, edgeToken);
    try {
      const targetAckPromise = waitForAck(socket, 'target-subscribe');
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          id: 'target-subscribe',
          payload: { session_ids: [target] },
        }),
      );
      await expect(targetAckPromise).resolves.toMatchObject({ type: 'ack', code: 0 });

      const foreignAckPromise = waitForAck(socket, 'foreign-subscribe');
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          id: 'foreign-subscribe',
          payload: { session_ids: [foreign] },
        }),
      );
      await expect(foreignAckPromise).resolves.toMatchObject({ type: 'ack', code: 0 });
    } finally {
      socket.close();
    }

    // Stopping the share closes the edge listener but leaves the main alive.
    const stop = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-share:stop',
      headers: authHeaders(server),
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json()).toMatchObject({ code: 0, data: { active: false, url: null } });
    await expect(edgeFetch(edgePort, '/api/v1/healthz')).rejects.toThrow();
    const mainAfterStop = await server.app.inject({
      method: 'GET',
      url: '/api/v1/sessions',
      headers: authHeaders(server),
    });
    expect(mainAfterStop.statusCode).toBe(200);
    expect(mainAfterStop.json()).toMatchObject({ code: 0 });
    expect(controller.status().active).toBe(false);
  });

  it('main close() calls the controller close (reclaiming the edge) before teardown', async () => {
    let controllerClosed = false;
    const managed = createCapturingRemoteShareController({
      onClose: () => {
        controllerClosed = true;
      },
    });
    const controller = managed.controller;
    server = await startMain({ home, controller });

    const target = await createSession(server, home);
    const share = await startShare(server, target, managed.lastStart);
    expect(controller.status().active).toBe(true);

    await server.close();
    server = undefined;

    expect(controllerClosed).toBe(true);
    expect(controller.status().active).toBe(false);
    await expect(edgeFetch(share.port as number, '/api/v1/healthz')).rejects.toThrow();
  });
});