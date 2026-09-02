import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  projectRemotePersistentStatus,
  REMOTE_PERSISTENT_START_FAILED_CODE,
  REMOTE_PERSISTENT_STOP_FAILED_CODE,
  REMOTE_PERSISTENT_UNSUPPORTED_CODE,
  RemotePersistentError,
  type IRemotePersistentController,
  type RemotePersistentStatus,
} from '../src';
import { type RunningServer, startServer } from '../src/start';
import { authHeaders } from './helpers/auth';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';

/** Env var driving the `remote_control` experimental flag (registered in kap-server). */
const REMOTE_CONTROL_FLAG_ENV = 'KIMI_CODE_EXPERIMENTAL_REMOTE_CONTROL';

function setRemoteControlFlag(enabled: boolean): void {
  process.env[REMOTE_CONTROL_FLAG_ENV] = enabled ? '1' : '0';
}

const INACTIVE: RemotePersistentStatus = {
  active: false,
  state: 'inactive',
  health: 'unknown',
  origin: null,
  url: null,
  port: null,
  started_at: null,
  systemd_available: true,
  message: null,
};

const ACTIVE: RemotePersistentStatus = {
  active: true,
  state: 'active',
  health: 'ok',
  origin: 'https://persistent-example.trycloudflare.com',
  url: 'https://persistent-example.trycloudflare.com/?remote=1#token=abc',
  port: 61234,
  started_at: '2026-09-01T00:00:00.000Z',
  systemd_available: true,
  message: null,
};

/** Fake host controller: counts calls, flips between inactive/active statuses. */
function createFakeController(opts?: {
  startError?: RemotePersistentError;
  stopError?: RemotePersistentError;
}): IRemotePersistentController & { startCalls(): number; stopCalls(): number } {
  let current: RemotePersistentStatus = { ...INACTIVE };
  let startCalls = 0;
  let stopCalls = 0;
  return {
    status: async () => ({ ...projectRemotePersistentStatus(current) }),
    start: async () => {
      startCalls += 1;
      if (opts?.startError !== undefined) throw opts.startError;
      current = { ...ACTIVE, started_at: new Date().toISOString() };
      return { ...projectRemotePersistentStatus(current) };
    },
    stop: async () => {
      stopCalls += 1;
      if (opts?.stopError !== undefined) throw opts.stopError;
      current = { ...INACTIVE };
      return { ...projectRemotePersistentStatus(current) };
    },
    startCalls: () => startCalls,
    stopCalls: () => stopCalls,
  };
}

describe('remote persistent contract', () => {
  it('projects exactly the wire fields (never a separate token property)', () => {
    expect(projectRemotePersistentStatus(ACTIVE)).toEqual(ACTIVE);
    expect(projectRemotePersistentStatus(ACTIVE)).not.toHaveProperty('token');
    expect(projectRemotePersistentStatus(INACTIVE)).toEqual(INACTIVE);
  });

  it('Defines the host error class and its daemon-reserved codes', () => {
    const error = new RemotePersistentError(REMOTE_PERSISTENT_UNSUPPORTED_CODE, 'nope');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RemotePersistentError');
    expect(error.code).toBe(REMOTE_PERSISTENT_UNSUPPORTED_CODE);
    expect(REMOTE_PERSISTENT_START_FAILED_CODE).toBe(50030);
    expect(REMOTE_PERSISTENT_STOP_FAILED_CODE).toBe(50031);
    expect(REMOTE_PERSISTENT_UNSUPPORTED_CODE).toBe(50032);
  });
});

describe('remote persistent control routes', () => {
  let server: RunningServer | undefined;
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kap-remote-persistent-'));
  });

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    setRemoteControlFlag(false);
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  });

  async function startMain(opts: {
    controller?: IRemotePersistentController;
    flag?: boolean;
  }): Promise<RunningServer> {
    setRemoteControlFlag(opts.flag ?? true);
    return startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
      remotePersistentController: opts.controller,
    });
  }

  it('registers no control routes without a controller', async () => {
    server = await startMain({});
    for (const [method, url] of [
      ['GET', '/api/v1/remote-persistent'],
      ['POST', '/api/v1/remote-persistent:start'],
      ['POST', '/api/v1/remote-persistent:stop'],
    ] as const) {
      const response = await server.app.inject({
        method,
        url,
        headers: method === 'GET' ? authHeaders(server) : { ...authHeaders(server), 'content-type': 'application/json' },
        payload: method === 'POST' ? {} : undefined,
      });
      expect(response.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it('registers no control routes when the flag is off even with a controller', async () => {
    server = await startMain({ controller: createFakeController(), flag: false });
    const status = await server.app.inject({
      method: 'GET',
      url: '/api/v1/remote-persistent',
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

  it('serves status and wires :start / :stop to the host controller', async () => {
    const controller = createFakeController();
    server = await startMain({ controller });

    const status = await server.app.inject({
      method: 'GET',
      url: '/api/v1/remote-persistent',
      headers: authHeaders(server),
    });
    expect(status.statusCode).toBe(200);
    const statusBody = status.json() as { code: number; data: RemotePersistentStatus };
    expect(statusBody.code).toBe(0);
    expect(statusBody.data).toEqual(INACTIVE);
    expect(statusBody.data).not.toHaveProperty('token');

    const start = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-persistent:start',
      headers: { ...authHeaders(server), 'content-type': 'application/json' },
      payload: {},
    });
    expect(start.statusCode).toBe(200);
    expect(start.json()).toMatchObject({ code: 0, data: { active: true, url: ACTIVE.url } });
    expect(controller.startCalls()).toBe(1);

    const activeStatus = await server.app.inject({
      method: 'GET',
      url: '/api/v1/remote-persistent',
      headers: authHeaders(server),
    });
    expect(activeStatus.json()).toMatchObject({
      code: 0,
      data: { active: true, health: 'ok', systemd_available: true },
    });

    const stop = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-persistent:stop',
      headers: authHeaders(server),
      payload: {},
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json()).toMatchObject({ code: 0, data: { active: false } });
    expect(controller.stopCalls()).toBe(1);
  });

  it('projects host failures as structured envelopes and rejects unknown actions', async () => {
    const controller = createFakeController({
      startError: new RemotePersistentError(REMOTE_PERSISTENT_START_FAILED_CODE, 'cloudflared missing'),
      stopError: new RemotePersistentError(REMOTE_PERSISTENT_UNSUPPORTED_CODE, 'no systemd'),
    });
    server = await startMain({ controller });
    const headers = { ...authHeaders(server), 'content-type': 'application/json' };

    const start = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-persistent:start',
      headers,
      payload: {},
    });
    expect(start.statusCode).toBe(200);
    expect(start.json()).toMatchObject({ code: REMOTE_PERSISTENT_START_FAILED_CODE, msg: 'cloudflared missing' });

    const stop = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-persistent:stop',
      headers,
      payload: {},
    });
    expect(stop.json()).toMatchObject({ code: REMOTE_PERSISTENT_UNSUPPORTED_CODE, msg: 'no systemd' });

    const unsupported = await server.app.inject({
      method: 'POST',
      url: '/api/v1/remote-persistent:restart',
      // No content-type / payload: an empty body with `application/json` is a
      // transport error before our validation, so probe the action only.
      headers: authHeaders(server),
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
      remotePersistentController: createFakeController(),
    };
    setRemoteControlFlag(true);
    await expect(startServer({ ...base, disableAuth: true })).rejects.toThrow(
      'Remote persistent control requires bearer-token authentication',
    );
    await expect(startServer({ ...base, disableHostCheck: true })).rejects.toThrow(
      'Remote persistent control requires Host validation',
    );
  });
});