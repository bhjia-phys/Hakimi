// apps/kimi-web/test/remote-persistent.test.ts
// Long-lived remote-control REST adapter (wire → app mapping, :start/:stop
// payloads) and the useRemotePersistent composable state/polling logic.
// The credential appears only inside the full control URL's fragment; the
// status response never exposes a separate token field.
// Run: pnpm --filter @bhjia-phys/hakimi-web exec vitest run test/remote-persistent.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

import {
  DaemonKimiWebApi,
  REMOTE_PERSISTENT_START_TIMEOUT_MS,
} from '../src/api/daemon/client';
import { toAppRemotePersistentStatus } from '../src/api/daemon/mappers';
import { DaemonApiError } from '../src/api/errors';
import {
  REMOTE_PERSISTENT_POLL_INTERVAL_MS,
  useRemotePersistent,
} from '../src/composables/useRemotePersistent';

const apiMock = vi.hoisted(() => ({
  getRemotePersistent: vi.fn(),
  startRemotePersistent: vi.fn(),
  stopRemotePersistent: vi.fn(),
}));

vi.mock('../src/api', () => ({
  getKimiWebApi: () => apiMock,
}));

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Wire → app mapper
// ---------------------------------------------------------------------------

describe('toAppRemotePersistentStatus', () => {
  it('maps the full active snake_case status to camelCase', () => {
    expect(
      toAppRemotePersistentStatus({
        active: true,
        state: 'active',
        health: 'ok',
        origin: 'https://name.trycloudflare.com',
        url: 'https://name.trycloudflare.com/?remote=1#secret',
        port: 61234,
        started_at: '2026-08-31T09:00:00.000Z',
        systemd_available: true,
        message: null,
      }),
    ).toEqual({
      active: true,
      state: 'active',
      health: 'ok',
      origin: 'https://name.trycloudflare.com',
      url: 'https://name.trycloudflare.com/?remote=1#secret',
      port: 61234,
      startedAt: '2026-08-31T09:00:00.000Z',
      systemdAvailable: true,
      message: null,
    });
  });

  it('preserves nulls / unsupported host fields for the inactive status', () => {
    expect(
      toAppRemotePersistentStatus({
        active: false,
        state: 'unsupported',
        health: 'unknown',
        origin: null,
        url: null,
        port: null,
        started_at: null,
        systemd_available: false,
        message: 'needs a Linux systemd user session',
      }),
    ).toEqual({
      active: false,
      state: 'unsupported',
      health: 'unknown',
      origin: null,
      url: null,
      port: null,
      startedAt: null,
      systemdAvailable: false,
      message: 'needs a Linux systemd user session',
    });
  });
});

// ---------------------------------------------------------------------------
// DaemonKimiWebApi REST adapter
// ---------------------------------------------------------------------------

function createApi(): DaemonKimiWebApi {
  return new DaemonKimiWebApi({
    serverHttpUrl: 'http://daemon.test',
    clientId: 'web_test',
    clientName: 'test',
    clientVersion: '0.0.0',
    clientUiMode: 'test',
  });
}

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: '', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const WIRE_ACTIVE = {
  active: true,
  state: 'active',
  health: 'ok',
  origin: 'https://name.trycloudflare.com',
  url: 'https://name.trycloudflare.com/?remote=1#secret',
  port: 61234,
  started_at: '2026-08-31T09:00:00.000Z',
  systemd_available: true,
  message: null,
};

const WIRE_INACTIVE = {
  active: false,
  state: 'inactive',
  health: 'unknown',
  origin: null,
  url: null,
  port: null,
  started_at: null,
  systemd_available: true,
  message: 'The persistent service is stopped.',
};

describe('DaemonKimiWebApi remote persistent', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Gets the status and maps it to the app model', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_ACTIVE));

    const status = await createApi().getRemotePersistent();

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/remote-persistent',
    );
    expect(status).toEqual({
      active: true,
      state: 'active',
      health: 'ok',
      origin: 'https://name.trycloudflare.com',
      url: 'https://name.trycloudflare.com/?remote=1#secret',
      port: 61234,
      startedAt: '2026-08-31T09:00:00.000Z',
      systemdAvailable: true,
      message: null,
    });
    expect(status).not.toHaveProperty('token');
  });

  it('Posts an empty body on :start with a deadline well above the server wait', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_ACTIVE));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

    const status = await createApi().startRemotePersistent();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('http://daemon.test/api/v1/remote-persistent:start');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({}) });
    expect(REMOTE_PERSISTENT_START_TIMEOUT_MS).toBeGreaterThan(30_000);
    expect(timeoutSpy).toHaveBeenCalledWith(REMOTE_PERSISTENT_START_TIMEOUT_MS);
    expect(status.active).toBe(true);
  });

  it('Posts an empty body on :stop and maps the inactive status', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_INACTIVE));

    const status = await createApi().stopRemotePersistent();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('http://daemon.test/api/v1/remote-persistent:stop');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({}) });
    expect(status.active).toBe(false);
  });

  it('Surfaces a daemon error envelope (e.g. unsupported 50032)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: 50032, msg: 'no systemd here', request_id: 'req_x' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const caught = await createApi()
      .startRemotePersistent()
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonApiError);
    expect(caught).toMatchObject({ code: 50032, message: 'no systemd here' });
  });
});

// ---------------------------------------------------------------------------
// useRemotePersistent composable — state, actions, and low-frequency polling
// ---------------------------------------------------------------------------

describe('useRemotePersistent', () => {
  beforeEach(() => {
    apiMock.getRemotePersistent.mockReset().mockResolvedValue(toAppRemotePersistentStatus(WIRE_INACTIVE));
    apiMock.startRemotePersistent.mockReset().mockResolvedValue(toAppRemotePersistentStatus(WIRE_ACTIVE));
    apiMock.stopRemotePersistent.mockReset().mockResolvedValue(toAppRemotePersistentStatus(WIRE_INACTIVE));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mount(options: { enabled: boolean; dialogOpen?: boolean }): {
    api: ReturnType<typeof useRemotePersistent>;
    enabled: { value: boolean };
    dialogOpen: { value: boolean };
    stop: () => void;
  } {
    const enabled = { value: options.enabled };
    const dialogOpen = { value: options.dialogOpen ?? false };
    const scope = effectScope();
    let api!: ReturnType<typeof useRemotePersistent>;
    scope.run(() => {
      api = useRemotePersistent({
        enabled: () => enabled.value,
        dialogOpen: () => dialogOpen.value,
      });
    });
    return { api, enabled, dialogOpen, stop: () => { scope.stop(); } };
  }

  it('reads the status once on mount and exposes it', async () => {
    const { api, stop } = mount({ enabled: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(apiMock.getRemotePersistent).toHaveBeenCalledTimes(1);
    expect(api.status.value?.active).toBe(false);
    stop();
  });

  it('does not call the server when disabled', async () => {
    const { api, stop } = mount({ enabled: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(apiMock.getRemotePersistent).not.toHaveBeenCalled();
    expect(api.status.value).toBeNull();
    stop();
  });

  it('start calls the server, updates status, and resolves true', async () => {
    const { api, stop } = mount({ enabled: true });
    await vi.advanceTimersByTimeAsync(0);

    const ok = await api.start();

    expect(ok).toBe(true);
    expect(apiMock.startRemotePersistent).toHaveBeenCalledWith();
    expect(api.status.value?.active).toBe(true);
    expect(api.error.value).toBeNull();
    stop();
  });

  it('does not let an older refresh overwrite a completed start', async () => {
    const staleRefresh = deferred<ReturnType<typeof toAppRemotePersistentStatus>>();
    apiMock.getRemotePersistent.mockReset().mockReturnValueOnce(staleRefresh.promise);
    const { api, stop } = mount({ enabled: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(await api.start()).toBe(true);
    expect(api.status.value?.active).toBe(true);

    staleRefresh.resolve(toAppRemotePersistentStatus(WIRE_INACTIVE));
    await staleRefresh.promise;
    await vi.advanceTimersByTimeAsync(0);

    expect(api.status.value?.active).toBe(true);
    stop();
  });

  it('does not let an older refresh overwrite a completed stop', async () => {
    apiMock.getRemotePersistent.mockResolvedValueOnce(toAppRemotePersistentStatus(WIRE_ACTIVE));
    const { api, stop } = mount({ enabled: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.status.value?.active).toBe(true);

    const staleRefresh = deferred<ReturnType<typeof toAppRemotePersistentStatus>>();
    apiMock.getRemotePersistent.mockReturnValueOnce(staleRefresh.promise);
    const refreshPromise = api.refresh();
    expect(await api.stop()).toBe(true);
    expect(api.status.value?.active).toBe(false);

    staleRefresh.resolve(toAppRemotePersistentStatus(WIRE_ACTIVE));
    await refreshPromise;

    expect(api.status.value?.active).toBe(false);
    stop();
  });

  it('surfaces a start failure as the error ref', async () => {
    const { api, stop } = mount({ enabled: true });
    apiMock.startRemotePersistent.mockRejectedValue(new DaemonApiError({
      code: 50032,
      msg: 'no systemd here',
      requestId: 'req_x',
    }));

    expect(await api.start()).toBe(false);
    expect(api.error.value).toBe('no systemd here');
    stop();
  });

  it('polls at the low frequency while the dialog is open or the service is active', async () => {
    const { api, dialogOpen, stop } = mount({ enabled: true });

    // Open the dialog → immediate refresh, then a poll every interval.
    dialogOpen.value = true;
    await vi.advanceTimersByTimeAsync(0);
    const afterOpen = apiMock.getRemotePersistent.mock.calls.length;
    expect(afterOpen).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(REMOTE_PERSISTENT_POLL_INTERVAL_MS);
    expect(apiMock.getRemotePersistent.mock.calls.length).toBe(afterOpen + 1);

    stop();
    await vi.advanceTimersByTimeAsync(REMOTE_PERSISTENT_POLL_INTERVAL_MS * 2);
    expect(apiMock.getRemotePersistent.mock.calls.length).toBe(afterOpen + 1);
  });

  it('keeps polling after the dialog closes while active, and stops once stopped', async () => {
    const { api, dialogOpen, stop } = mount({ enabled: true });
    dialogOpen.value = true;
    await vi.advanceTimersByTimeAsync(0);

    await api.start();
    dialogOpen.value = false;
    await vi.advanceTimersByTimeAsync(0);
    const baseline = apiMock.getRemotePersistent.mock.calls.length;

    // Active service → still polls with the dialog closed.
    await vi.advanceTimersByTimeAsync(REMOTE_PERSISTENT_POLL_INTERVAL_MS);
    expect(apiMock.getRemotePersistent.mock.calls.length).toBe(baseline + 1);

    // Stop → inactive → polling stops.
    await api.stop();
    expect(apiMock.stopRemotePersistent).toHaveBeenCalledWith();
    const afterStop = apiMock.getRemotePersistent.mock.calls.length;
    await vi.advanceTimersByTimeAsync(REMOTE_PERSISTENT_POLL_INTERVAL_MS * 2);
    expect(apiMock.getRemotePersistent.mock.calls.length).toBe(afterStop);
    stop();
  });

  it('exposes a stop failure as the error ref', async () => {
    const { api, stop } = mount({ enabled: true });
    apiMock.stopRemotePersistent.mockRejectedValue(new DaemonApiError({
      code: 50031,
      msg: 'stop failed',
      requestId: 'req_x',
    }));

    expect(await api.stop()).toBe(false);
    expect(api.error.value).toBe('stop failed');
    stop();
  });
});