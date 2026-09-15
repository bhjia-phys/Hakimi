/**
 * Tunnel readiness monitor for the persistent `hakimi remote serve` service.
 *
 * The serve process spawns cloudflared with `--metrics 127.0.0.1:0`, parses
 * the real loopback metrics address from the child's JSON logs, then probes
 * `http://127.0.0.1:<port>/ready`.
 *
 * Timing model:
 *
 *   - `start()` probes IMMEDIATELY (a pending metrics address is re-polled
 *     every interval instead of counting as a failure) and arms an independent
 *     startup-deadline timer (`gracePeriodMs`, 60s). The first successful
 *     probe clears the deadline.
 *   - Before the deadline only the first OK matters: failures do not count
 *     yet, but if nothing ever became ready within the deadline the monitor
 *     reports unhealthy (this also covers a never-published metrics address
 *     and a hanging probe).
 *   - After the deadline is cleared, every interval probes `/ready`;
 *     `failThreshold` consecutive failures invoke `onUnhealthy`.
 *
 * The caller (serve) translates `onUnhealthy` into the existing cleanup +
 * non-zero exit, so systemd's `Restart=on-failure` brings the service back —
 * exactly like a cloudflared crash.
 *
 * The monitor never overlaps probes (each tick awaits its probe before
 * scheduling the next), `stop()` aborts the in-flight probe and cancels all
 * pending timers, an already-aborted external signal prevents startup
 * entirely, and every async path is settled so a throwing user callback can
 * never surface an unhandled rejection.
 */

export type MetricsAddressStatus =
  | { readonly state: 'known'; readonly host: '127.0.0.1'; readonly port: number }
  | { readonly state: 'pending' }
  | { readonly state: 'failed' };

export interface TunnelProbeResult {
  readonly ok: boolean;
  readonly detail: string;
}

export type TunnelProbe = (port: number, signal: AbortSignal) => Promise<TunnelProbeResult>;

export interface TunnelFailureRecord {
  readonly at: number;
  readonly detail: string;
}

export interface TunnelUnhealthyDiagnosis {
  readonly metrics: MetricsAddressStatus;
  readonly failures: ReadonlyArray<TunnelFailureRecord>;
  readonly lastOkAt: number | null;
}

export interface TunnelReadinessMonitorOptions {
  /** Live metrics address state; re-read on every tick. */
  readonly metricsAddress: () => MetricsAddressStatus;
  readonly probe: TunnelProbe;
  /** Startup deadline before the first ready is reported as unhealthy. */
  readonly gracePeriodMs?: number;
  readonly intervalMs?: number;
  readonly failThreshold?: number;
  /** Aborting this signal stops the monitor and cancels any in-flight probe. */
  readonly signal?: AbortSignal;
  readonly onUnhealthy: (diagnosis: TunnelUnhealthyDiagnosis) => void;
}

export interface TunnelReadinessMonitor {
  readonly start: () => void;
  readonly stop: () => void;
}

export const REMOTE_READY_GRACE_PERIOD_MS = 60_000;
export const REMOTE_READY_INTERVAL_MS = 5_000;
export const REMOTE_READY_FAIL_THRESHOLD = 3;

export function createTunnelReadinessMonitor(
  options: TunnelReadinessMonitorOptions,
): TunnelReadinessMonitor {
  const gracePeriodMs = options.gracePeriodMs ?? REMOTE_READY_GRACE_PERIOD_MS;
  const intervalMs = options.intervalMs ?? REMOTE_READY_INTERVAL_MS;
  const failThreshold = options.failThreshold ?? REMOTE_READY_FAIL_THRESHOLD;

  let started = false;
  let stopped = false;
  let deadlineCleared = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | undefined;
  const failures: TunnelFailureRecord[] = [];
  let lastOkAt: number | null = null;

  const schedule = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = undefined;
      // runTick owns every await inside a try/catch; this guard also absorbs
      // a throwing `onUnhealthy` user callback.
      void runTick().catch(() => {});
    }, delayMs);
  };

  const noteFailure = (detail: string): void => {
    failures.push({ at: Date.now(), detail });
    if (failures.length >= failThreshold) {
      stop();
      fire({
        metrics: options.metricsAddress(),
        failures: [...failures],
        lastOkAt,
      });
      return;
    }
    schedule(intervalMs);
  };

  const fire = (diagnosis: TunnelUnhealthyDiagnosis): void => {
    try {
      options.onUnhealthy(diagnosis);
    } catch {
      // A throwing callback must never cascade; the monitor is already
      // stopped and the caller's restart path runs independently.
    }
  };

  const runTick = async (): Promise<void> => {
    if (stopped) return;
    const address = options.metricsAddress();
    if (address.state !== 'known') {
      if (!deadlineCleared) {
        // Before the first OK, pending AND failed metrics discovery stay under
        // the same 60s startup deadline; neither may trigger an early restart.
        schedule(intervalMs);
      } else {
        // Defensive handling if discovery state ever regresses after readiness:
        // it participates in the normal consecutive-failure rule.
        noteFailure(`metrics address ${address.state}`);
      }
      return;
    }
    const controller = new AbortController();
    inFlight = controller;
    let result: TunnelProbeResult;
    try {
      result = await options.probe(address.port, controller.signal);
    } catch (error) {
      result = { ok: false, detail: errorMessage(error) };
    } finally {
      if (inFlight === controller) inFlight = undefined;
    }
    if (stopped) return;
    if (result.ok) {
      failures.length = 0;
      lastOkAt = Date.now();
      if (!deadlineCleared) {
        deadlineCleared = true;
        if (deadline !== undefined) clearTimeout(deadline);
        deadline = undefined;
      }
      schedule(intervalMs);
    } else if (!deadlineCleared) {
      // Before the first OK, failures only mean "not ready yet": keep
      // probing; the deadline timer bounds this phase instead of the
      // failure counter.
      schedule(intervalMs);
    } else {
      noteFailure(result.detail);
    }
  };

  const onSignalAbort = (): void => {
    stop();
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (deadline !== undefined) clearTimeout(deadline);
    deadline = undefined;
    inFlight?.abort();
    inFlight = undefined;
    options.signal?.removeEventListener('abort', onSignalAbort);
  };

  const start = (): void => {
    if (started || stopped) return;
    if (options.signal?.aborted === true) return; // never arm against a dead signal
    started = true;
    options.signal?.addEventListener('abort', onSignalAbort, { once: true });
    deadline = setTimeout(() => {
      deadline = undefined;
      if (stopped || deadlineCleared) return;
      stop();
      fire({
        metrics: options.metricsAddress(),
        failures: [
          ...failures,
          { at: Date.now(), detail: `never became ready within ${gracePeriodMs}ms` },
        ],
        lastOkAt,
      });
    }, gracePeriodMs);
    schedule(0); // probe immediately
  };

  return { start, stop };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}