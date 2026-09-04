// apps/kimi-web/test/remote-share.test.ts
// Remote-share REST adapter (wire → app mapping, :start/:stop payloads),
// useRemoteShare composable state/polling logic, and the QR helper output.
// Run: pnpm --filter @bhjia-phys/hakimi-web exec vitest run test/remote-share.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

import { DaemonKimiWebApi } from '../src/api/daemon/client';
import { toAppRemoteShareStatus } from '../src/api/daemon/mappers';
import { DaemonApiError } from '../src/api/errors';
import {
  REMOTE_SHARE_POLL_INTERVAL_MS,
  remoteShareRemainingParts,
  remoteShareRemainingSeconds,
  useRemoteShare,
} from '../src/composables/useRemoteShare';
import { remoteShareQrSvg } from '../src/lib/remoteShareQr';

const apiMock = vi.hoisted(() => ({
  getRemoteShare: vi.fn(),
  startRemoteShare: vi.fn(),
  stopRemoteShare: vi.fn(),
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

describe('toAppRemoteShareStatus', () => {
  it('maps the full active share snake_case status to camelCase', () => {
    expect(
      toAppRemoteShareStatus({
        active: true,
        session_id: 'sess_1',
        host: '127.0.0.1',
        port: 46271,
        url: 'https://example.test/remote/sess_1#secret',
        ttl_seconds: 28800,
        started_at: '2026-08-31T09:00:00.000Z',
        expires_at: '2026-08-31T17:00:00.000Z',
      }),
    ).toEqual({
      active: true,
      sessionId: 'sess_1',
      host: '127.0.0.1',
      port: 46271,
      url: 'https://example.test/remote/sess_1#secret',
      ttlSeconds: 28800,
      startedAt: '2026-08-31T09:00:00.000Z',
      expiresAt: '2026-08-31T17:00:00.000Z',
    });
  });

  it('preserves nulls for the inactive status (token never present)', () => {
    expect(
      toAppRemoteShareStatus({
        active: false,
        session_id: null,
        host: null,
        port: null,
        url: null,
        ttl_seconds: null,
        started_at: null,
        expires_at: null,
      }),
    ).toEqual({
      active: false,
      sessionId: null,
      host: null,
      port: null,
      url: null,
      ttlSeconds: null,
      startedAt: null,
      expiresAt: null,
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

const WIRE_SHARE = {
  active: true,
  session_id: 'sess_1',
  host: '127.0.0.1',
  port: 46271,
  url: 'https://example.test/remote/sess_1#secret',
  ttl_seconds: 28800,
  started_at: '2026-08-31T09:00:00.000Z',
  expires_at: '2026-08-31T17:00:00.000Z',
};

const WIRE_INACTIVE = {
  active: false,
  session_id: null,
  host: null,
  port: null,
  url: null,
  ttl_seconds: null,
  started_at: null,
  expires_at: null,
};

describe('DaemonKimiWebApi remote share', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Gets the status and maps it to the app model', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_SHARE));

    const status = await createApi().getRemoteShare();

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('http://daemon.test/api/v1/remote-share');
    expect(status).toEqual({
      active: true,
      sessionId: 'sess_1',
      host: '127.0.0.1',
      port: 46271,
      url: 'https://example.test/remote/sess_1#secret',
      ttlSeconds: 28800,
      startedAt: '2026-08-31T09:00:00.000Z',
      expiresAt: '2026-08-31T17:00:00.000Z',
    });
  });

  it('Posts session_id + ttl on :start and returns the active status', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_SHARE));

    const status = await createApi().startRemoteShare('sess_1', 3600);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('http://daemon.test/api/v1/remote-share:start');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ session_id: 'sess_1', ttl: 3600 }) });
    expect(status.active).toBe(true);
    expect(status.url).toContain('#');
  });

  it('Omits ttl on :start when no lifetime is requested', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_INACTIVE));

    await createApi().startRemoteShare('sess_1');

    const init = vi.mocked(fetch).mock.calls[0]?.[1] ?? {};
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ session_id: 'sess_1' }) });
  });

  it('Posts an empty body on :stop and maps the inactive status', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_INACTIVE));

    const status = await createApi().stopRemoteShare();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('http://daemon.test/api/v1/remote-share:stop');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({}) });
    expect(status.active).toBe(false);
  });

  it('Surfaces a daemon error envelope (e.g. already-active 40927)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: 40927, msg: 'remote share already active', request_id: 'req_x' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const caught = await createApi()
      .startRemoteShare('sess_1')
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonApiError);
    expect(caught).toMatchObject({ code: 40927, message: 'remote share already active' });
  });
});

// ---------------------------------------------------------------------------
// useRemoteShare composable — state, actions, and low-frequency polling
// ---------------------------------------------------------------------------

describe('useRemoteShare', () => {
  beforeEach(() => {
    apiMock.getRemoteShare.mockReset().mockResolvedValue(toAppRemoteShareStatus(WIRE_INACTIVE));
    apiMock.startRemoteShare.mockReset().mockResolvedValue(toAppRemoteShareStatus(WIRE_SHARE));
    apiMock.stopRemoteShare.mockReset().mockResolvedValue(toAppRemoteShareStatus(WIRE_INACTIVE));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mount(options: {
    enabled: boolean;
    dialogOpen?: boolean;
    sessionId?: string;
  }): {
    api: ReturnType<typeof useRemoteShare>;
    enabled: { value: boolean };
    dialogOpen: { value: boolean };
    sessionId: { value: string | undefined };
    stop: () => void;
  } {
    const enabled = { value: options.enabled };
    const dialogOpen = { value: options.dialogOpen ?? false };
    const sessionId = { value: options.sessionId };
    // The composable reactively reads these refs through the getters.
    const scope = effectScope();
    let api!: ReturnType<typeof useRemoteShare>;
    scope.run(() => {
      api = useRemoteShare({
        enabled: () => enabled.value,
        getSessionId: () => sessionId.value,
        dialogOpen: () => dialogOpen.value,
      });
    });
    return { api, enabled, dialogOpen, sessionId, stop: () => { scope.stop(); } };
  }

  it('reads the status once on mount and exposes it', async () => {
    const { api, stop } = mount({ enabled: true, sessionId: 'sess_1' });
    // Immediate watcher fires refresh because no status has loaded yet.
    await vi.advanceTimersByTimeAsync(0);
    expect(apiMock.getRemoteShare).toHaveBeenCalledTimes(1);
    expect(api.status.value?.active).toBe(false);
    stop();
  });

  it('does not call the server when disabled', async () => {
    const { api, stop } = mount({ enabled: false, sessionId: 'sess_1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(apiMock.getRemoteShare).not.toHaveBeenCalled();
    expect(api.status.value).toBeNull();
    stop();
  });

  it('start posts the session + ttl, updates status, and resolves true', async () => {
    const { api, stop } = mount({ enabled: true, sessionId: 'sess_1' });
    await vi.advanceTimersByTimeAsync(0);

    const ok = await api.start(3600);

    expect(ok).toBe(true);
    expect(apiMock.startRemoteShare).toHaveBeenCalledWith('sess_1', 3600);
    expect(api.status.value?.active).toBe(true);
    expect(api.error.value).toBeNull();
    stop();
  });

  it('does not let an older refresh overwrite a completed start', async () => {
    const staleRefresh = deferred<ReturnType<typeof toAppRemoteShareStatus>>();
    apiMock.getRemoteShare.mockReset().mockReturnValueOnce(staleRefresh.promise);
    const { api, stop } = mount({ enabled: true, sessionId: 'sess_1' });
    await vi.advanceTimersByTimeAsync(0);

    expect(await api.start(3600)).toBe(true);
    expect(api.status.value?.active).toBe(true);

    staleRefresh.resolve(toAppRemoteShareStatus(WIRE_INACTIVE));
    await staleRefresh.promise;
    await vi.advanceTimersByTimeAsync(0);

    expect(api.status.value?.active).toBe(true);
    stop();
  });

  it('does not let an older refresh overwrite a completed stop', async () => {
    apiMock.getRemoteShare.mockResolvedValueOnce(toAppRemoteShareStatus(WIRE_SHARE));
    const { api, stop } = mount({ enabled: true, sessionId: 'sess_1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.status.value?.active).toBe(true);

    const staleRefresh = deferred<ReturnType<typeof toAppRemoteShareStatus>>();
    apiMock.getRemoteShare.mockReturnValueOnce(staleRefresh.promise);
    const refreshPromise = api.refresh();
    expect(await api.stop()).toBe(true);
    expect(api.status.value?.active).toBe(false);

    staleRefresh.resolve(toAppRemoteShareStatus(WIRE_SHARE));
    await refreshPromise;

    expect(api.status.value?.active).toBe(false);
    stop();
  });

  it('start fails without a session and surfaces an API failure as error', async () => {
    const { api, sessionId, stop } = mount({ enabled: true, sessionId: 'sess_1' });
    await vi.advanceTimersByTimeAsync(0);

    sessionId.value = undefined;
    expect(await api.start(3600)).toBe(false);
    expect(apiMock.startRemoteShare).not.toHaveBeenCalled();

    sessionId.value = 'sess_1';
    apiMock.startRemoteShare.mockRejectedValue(new DaemonApiError({
      code: 50050,
      msg: 'cloudflared failed to start',
      requestId: 'req_x',
    }));
    expect(await api.start(3600)).toBe(false);
    expect(api.error.value).toBe('cloudflared failed to start');
    stop();
  });

  it('reconciles an already-active 40927 by re-reading status instead of erroring', async () => {
    const { api, stop } = mount({ enabled: true, sessionId: 'sess_1' });
    await vi.advanceTimersByTimeAsync(0);

    apiMock.startRemoteShare.mockRejectedValue(
      new DaemonApiError({ code: 40927, msg: 'already active', requestId: 'req_x' }),
    );
    apiMock.getRemoteShare.mockResolvedValue(toAppRemoteShareStatus(WIRE_SHARE));

    const ok = await api.start(3600);

    expect(ok).toBe(true);
    expect(api.error.value).toBeNull();
    expect(api.status.value?.active).toBe(true);
    expect(apiMock.getRemoteShare).toHaveBeenCalled();
    stop();
  });

  it('polls at the low frequency while the dialog is open, and bumps the badge state', async () => {
    const { api, dialogOpen, stop } = mount({ enabled: true, sessionId: 'sess_1' });

    // Open the dialog → immediate refresh, then a poll every 15s.
    dialogOpen.value = true;
    await vi.advanceTimersByTimeAsync(0);
    const afterOpen = apiMock.getRemoteShare.mock.calls.length;
    expect(afterOpen).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(REMOTE_SHARE_POLL_INTERVAL_MS);
    const afterTick = apiMock.getRemoteShare.mock.calls.length;
    expect(afterTick).toBe(afterOpen + 1);

    stop();
    await vi.advanceTimersByTimeAsync(REMOTE_SHARE_POLL_INTERVAL_MS * 2);
    expect(apiMock.getRemoteShare.mock.calls.length).toBe(afterTick);
  });

  it('keeps polling after the dialog closes while a share is active, and stops once stopped', async () => {
    const { api, dialogOpen, stop } = mount({ enabled: true, sessionId: 'sess_1' });
    dialogOpen.value = true;
    await vi.advanceTimersByTimeAsync(0);

    await api.start(28800);
    dialogOpen.value = false;
    await vi.advanceTimersByTimeAsync(0);
    const baseline = apiMock.getRemoteShare.mock.calls.length;

    // Active share → still polls with the dialog closed.
    await vi.advanceTimersByTimeAsync(REMOTE_SHARE_POLL_INTERVAL_MS);
    expect(apiMock.getRemoteShare.mock.calls.length).toBe(baseline + 1);

    // Stop → inactive → polling stops.
    await api.stop();
    expect(apiMock.stopRemoteShare).toHaveBeenCalledWith();
    const afterStop = apiMock.getRemoteShare.mock.calls.length;
    await vi.advanceTimersByTimeAsync(REMOTE_SHARE_POLL_INTERVAL_MS * 2);
    expect(apiMock.getRemoteShare.mock.calls.length).toBe(afterStop);
    stop();
  });

  it('exposes a stop failure as the error ref', async () => {
    const { api, stop } = mount({ enabled: true, sessionId: 'sess_1' });
    apiMock.stopRemoteShare.mockRejectedValue(new DaemonApiError({
      code: 50051,
      msg: 'stop failed',
      requestId: 'req_x',
    }));

    expect(await api.stop()).toBe(false);
    expect(api.error.value).toBe('stop failed');
    stop();
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('remoteShareRemainingSeconds', () => {
  const NOW = Date.parse('2026-08-31T10:00:00.000Z');

  it('returns null when there is no expiry', () => {
    expect(remoteShareRemainingSeconds(null, NOW)).toBeNull();
    expect(remoteShareRemainingSeconds(undefined, NOW)).toBeNull();
    expect(remoteShareRemainingSeconds('not-a-date', NOW)).toBeNull();
  });

  it('counts whole remaining seconds, clamped to 0', () => {
    expect(remoteShareRemainingSeconds('2026-08-31T11:00:00.000Z', NOW)).toBe(3600);
    expect(remoteShareRemainingSeconds('2026-08-31T10:00:00.500Z', NOW)).toBe(1);
    expect(remoteShareRemainingSeconds('2026-08-31T09:00:00.000Z', NOW)).toBe(0);
  });
});

describe('remoteShareRemainingParts', () => {
  it('splits seconds into whole hours + minutes', () => {
    expect(remoteShareRemainingParts(8 * 3600)).toEqual({ hours: 8, minutes: 0 });
    expect(remoteShareRemainingParts(90 * 60)).toEqual({ hours: 1, minutes: 30 });
    expect(remoteShareRemainingParts(45)).toEqual({ hours: 0, minutes: 0 });
    expect(remoteShareRemainingParts(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});

// ---------------------------------------------------------------------------
// QR helper — deterministic SVG output (no canvas in the Node test env)
// ---------------------------------------------------------------------------

describe('remoteShareQrSvg', () => {
  it('encodes the full control URL deterministically', async () => {
    const url = 'https://example.test/remote/sess_1#secret-fragment-token';
    const svg = await remoteShareQrSvg(url);
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain('<path');
    // Same input → byte-identical output; a different input differs.
    expect(await remoteShareQrSvg(url)).toBe(svg);
    expect(await remoteShareQrSvg(`${url}2`)).not.toBe(svg);
  });

  it('returns null for an empty url', async () => {
    expect(await remoteShareQrSvg('')).toBeNull();
  });
});