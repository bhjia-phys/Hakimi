// apps/kimi-web/src/composables/useRemoteShare.ts
// Remote-share lifecycle for Web session control. The current session is only
// the initial landing point; the resulting share can switch among all existing
// sessions. Owns status, start/stop/refresh actions, and low-frequency polling
// while the dialog is open or a share is active. Polling is always cleared on
// scope dispose.
//
// The share URL is a bearer credential: this composable never logs it,
// persists it, or sends it anywhere — it only holds the server-provided
// status object in memory.

import { onScopeDispose, ref, watch, type Ref } from 'vue';

import { getKimiWebApi } from '../api';
import type { AppRemoteShareStatus } from '../api/types';

/** Low-frequency poll cadence while the dialog is open or a share is active. */
export const REMOTE_SHARE_POLL_INTERVAL_MS = 15_000;

/** TTL presets in seconds offered by the start dialog (the server enforces the cap). */
export const REMOTE_SHARE_TTL_PRESET_SECONDS: readonly number[] = [
  30 * 60,
  60 * 60,
  8 * 60 * 60,
  24 * 60 * 60,
] as const;

/** Dialog default TTL (8h) — the server validates the final value. */
export const REMOTE_SHARE_DEFAULT_TTL_SECONDS = 8 * 60 * 60;

/** Daemon-reserved business code for "a remote share is already active". */
export const REMOTE_SHARE_ALREADY_ACTIVE_CODE = 40927;

/** Seconds remaining until `expiresAt` (ISO) at `now`; null when there is no expiry. */
export function remoteShareRemainingSeconds(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (expiresAt === null || expiresAt === undefined) return null;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** Whole hours + minutes of `seconds`, for localized countdown labels. */
export function remoteShareRemainingParts(seconds: number): {
  hours: number;
  minutes: number;
} {
  const total = Math.max(0, Math.floor(seconds));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
  };
}

/** Best-effort human-readable message from any thrown value (never throws). */
export function remoteShareErrorMessage(err: unknown): string {
  if (typeof err === 'string' && err.length > 0) return err;
  if (typeof err === 'object' && err !== null) {
    const e = err as { msg?: unknown; message?: unknown };
    if (typeof e.msg === 'string' && e.msg.length > 0) return e.msg;
    if (typeof e.message === 'string' && e.message.length > 0) return e.message;
  }
  return 'Unknown error';
}

export interface UseRemoteShareOptions {
  /** Whether the control surface is available (feature on + non-remote mode). */
  enabled: () => boolean;
  /** Current session id to use as the remote share's initial landing point. */
  getSessionId: () => string | undefined;
  /** Whether the share dialog is open (drives low-frequency polling). */
  dialogOpen: () => boolean;
}

export interface UseRemoteShare {
  /** Last server-provided status; null until the first successful read. */
  status: Readonly<Ref<AppRemoteShareStatus | null>>;
  /** A refresh (manual or poll) is in flight. */
  refreshing: Readonly<Ref<boolean>>;
  starting: Readonly<Ref<boolean>>;
  stopping: Readonly<Ref<boolean>>;
  /** Last start/stop failure message (or the first read failure), null when clean. */
  error: Readonly<Ref<string | null>>;
  /** Re-read the server status. Failures are silent while a status is known. */
  refresh: () => Promise<void>;
  /** Start a share from the current session. Resolves true on success; a 40927
   *  already-active response is reconciled by re-reading status rather than
   *  surfacing an error. */
  start: (ttlSeconds?: number) => Promise<boolean>;
  /** Stop the active share (idempotent on the server). Resolves true on success. */
  stop: () => Promise<boolean>;
  clearError: () => void;
}

export function useRemoteShare(options: UseRemoteShareOptions): UseRemoteShare {
  const status = ref<AppRemoteShareStatus | null>(null);
  const refreshing = ref(false);
  const starting = ref(false);
  const stopping = ref(false);
  const errorMessage = ref<string | null>(null);

  let refreshInFlight: Promise<void> | null = null;
  // Start/stop are authoritative mutations. Each one advances the generation,
  // invalidating any older poll or action response so stale inactive/active
  // state cannot overwrite the result the user just requested.
  let requestGeneration = 0;

  async function refresh(): Promise<void> {
    if (!options.enabled()) return;
    if (refreshInFlight !== null) return refreshInFlight;
    const generation = requestGeneration;
    refreshInFlight = (async () => {
      refreshing.value = true;
      try {
        const nextStatus = await getKimiWebApi().getRemoteShare();
        if (generation === requestGeneration) {
          status.value = nextStatus;
        }
        // Never clear a start/stop error from a background poll: the user
        // needs to see the failed action until they retry.
      } catch (error) {
        // Poll failures are transient (server restart, edge not ready yet).
        // Surface them only when there is nothing else to show and no newer
        // action superseded this request.
        if (generation === requestGeneration && status.value === null) {
          errorMessage.value = remoteShareErrorMessage(error);
        }
      } finally {
        refreshing.value = false;
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  async function start(ttlSeconds?: number): Promise<boolean> {
    const sessionId = options.getSessionId();
    if (!options.enabled() || sessionId === undefined || starting.value) return false;
    const generation = ++requestGeneration;
    starting.value = true;
    try {
      try {
        const nextStatus = await getKimiWebApi().startRemoteShare(sessionId, ttlSeconds);
        if (generation === requestGeneration) {
          status.value = nextStatus;
          errorMessage.value = null;
        }
        return true;
      } catch (error) {
        if (isAlreadyActive(error)) {
          // Another surface (e.g. the TUI) holds the share — reconcile instead
          // of failing the dialog.
          await refresh();
          return status.value?.active === true;
        }
        if (generation === requestGeneration) {
          errorMessage.value = remoteShareErrorMessage(error);
        }
        return false;
      }
    } finally {
      starting.value = false;
    }
  }

  async function stop(): Promise<boolean> {
    if (!options.enabled() || stopping.value) return false;
    const generation = ++requestGeneration;
    stopping.value = true;
    try {
      const nextStatus = await getKimiWebApi().stopRemoteShare();
      if (generation === requestGeneration) {
        status.value = nextStatus;
        errorMessage.value = null;
      }
      return true;
    } catch (error) {
      if (generation === requestGeneration) {
        errorMessage.value = remoteShareErrorMessage(error);
      }
      return false;
    } finally {
      stopping.value = false;
    }
  }

  function clearError(): void {
    errorMessage.value = null;
  }

  // -------------------------------------------------------------------------
  // Low-frequency polling
  // -------------------------------------------------------------------------
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling(): void {
    if (pollTimer !== null) return;
    const timer = setInterval(() => {
      void refresh();
    }, REMOTE_SHARE_POLL_INTERVAL_MS);
    pollTimer = timer;
  }

  watch(
    () =>
      [
        options.enabled(),
        options.dialogOpen(),
        status.value?.active === true,
      ] as const,
    ([enabled, dialogOpen, active], prev) => {
      if (!enabled) {
        stopPolling();
        return;
      }
      // Refresh immediately when nothing has loaded yet, or when the dialog
      // just opened (so it shows fresh state without waiting for a tick).
      // A poll flipping the active flag alone does NOT trigger a redundant read.
      const justOpened = dialogOpen && prev !== undefined && !prev[1];
      if (status.value === null || justOpened) {
        void refresh();
      }
      if (dialogOpen || active) {
        startPolling();
      } else {
        stopPolling();
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    stopPolling();
    refreshInFlight = null;
  });

  return {
    status: status as Readonly<Ref<AppRemoteShareStatus | null>>,
    refreshing: refreshing as Readonly<Ref<boolean>>,
    starting: starting as Readonly<Ref<boolean>>,
    stopping: stopping as Readonly<Ref<boolean>>,
    error: errorMessage as Readonly<Ref<string | null>>,
    refresh,
    start,
    stop,
    clearError,
  };
}

function isAlreadyActive(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === REMOTE_SHARE_ALREADY_ACTIVE_CODE
  );
}