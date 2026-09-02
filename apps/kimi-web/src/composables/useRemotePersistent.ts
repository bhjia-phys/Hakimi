// apps/kimi-web/src/composables/useRemotePersistent.ts
// Long-lived remote-control lifecycle for the Web dialog: drives the
// persistent `hakimi remote` systemd user service (GET/start/stop). Owns
// status, start/stop/refresh actions, error state, and low-frequency polling
// while the dialog is open or the service is active (so a restarted service's
// fresh random tunnel URL is picked up without manual refresh). Polling is
// always cleared on scope dispose.
//
// The persistent control URL is a bearer credential: this composable never
// logs it, persists it, or sends it anywhere — it only holds the
// server-provided status object in memory.

import { onScopeDispose, ref, watch, type Ref } from 'vue';

import { getKimiWebApi } from '../api';
import type { AppRemotePersistentStatus } from '../api/types';
import { remoteShareErrorMessage } from './useRemoteShare';

/** Low-frequency poll cadence while the dialog is open or the service is active. */
export const REMOTE_PERSISTENT_POLL_INTERVAL_MS = 15_000;

export interface UseRemotePersistentOptions {
  /** Whether the control surface is available (feature on + non-remote mode). */
  enabled: () => boolean;
  /** Whether the dialog is open (drives low-frequency polling). */
  dialogOpen: () => boolean;
}

export interface UseRemotePersistent {
  /** Last server-provided status; null until the first successful read. */
  status: Readonly<Ref<AppRemotePersistentStatus | null>>;
  /** A refresh (manual or poll) is in flight. */
  refreshing: Readonly<Ref<boolean>>;
  starting: Readonly<Ref<boolean>>;
  stopping: Readonly<Ref<boolean>>;
  /** Last start/stop/read failure message (or the first read failure), null when clean. */
  error: Readonly<Ref<string | null>>;
  /** Re-read the server status. Failures are silent while a status is known. */
  refresh: () => Promise<void>;
  /** Start the persistent systemd user service. Resolves true on success. */
  start: () => Promise<boolean>;
  /** Stop the persistent systemd user service (idempotent). Resolves true on success. */
  stop: () => Promise<boolean>;
  clearError: () => void;
}

export function useRemotePersistent(options: UseRemotePersistentOptions): UseRemotePersistent {
  const status = ref<AppRemotePersistentStatus | null>(null);
  const refreshing = ref(false);
  const starting = ref(false);
  const stopping = ref(false);
  const errorMessage = ref<string | null>(null);

  let refreshInFlight: Promise<void> | null = null;
  // Start/stop are authoritative mutations. Each one advances the generation,
  // invalidating any older poll or action response so stale inactive/active
  // state can never overwrite the result the user just requested.
  let requestGeneration = 0;

  async function refresh(): Promise<void> {
    if (!options.enabled()) return;
    if (refreshInFlight !== null) return refreshInFlight;
    const generation = requestGeneration;
    refreshInFlight = (async () => {
      refreshing.value = true;
      try {
        const nextStatus = await getKimiWebApi().getRemotePersistent();
        if (generation === requestGeneration) {
          status.value = nextStatus;
        }
        // Never clear a start/stop error from a background poll: the user
        // needs to see the failed action until they retry.
      } catch (error) {
        // Poll failures are transient (server restart). Surface them only
        // when there is nothing else to show and no newer action superseded
        // this request.
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

  async function start(): Promise<boolean> {
    if (!options.enabled() || starting.value) return false;
    const generation = ++requestGeneration;
    starting.value = true;
    try {
      const nextStatus = await getKimiWebApi().startRemotePersistent();
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
      starting.value = false;
    }
  }

  async function stop(): Promise<boolean> {
    if (!options.enabled() || stopping.value) return false;
    const generation = ++requestGeneration;
    stopping.value = true;
    try {
      const nextStatus = await getKimiWebApi().stopRemotePersistent();
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
    }, REMOTE_PERSISTENT_POLL_INTERVAL_MS);
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
    requestGeneration += 1;
    refreshInFlight = null;
  });

  return {
    status: status as Readonly<Ref<AppRemotePersistentStatus | null>>,
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