/**
 * `aitpResearch` domain — Session-scope current-state maintenance service.
 *
 * Runs a read-only AITP `enter` → `check` cycle after the adapter probe has
 * reached `ready`. Refreshes are single-flight per workstream, while a prior
 * receipt satisfies non-forced reads. Adapter failures and check transport or
 * contract failures become safe degraded receipts; valid check findings are
 * projected as codes and counts. `reset()` invalidates older async work so an
 * exit or inactive restore cannot repopulate the next lifecycle.
 */

import { Service } from '#/_base/di/service';
import { Emitter, type Event } from '#/_base/event';

import { ISessionAitpAdapter } from '../adapter/sessionAitpAdapter';
import type {
  AitpCheckReport,
  AitpEnterResult,
  AitpMaintenanceCheckSummary,
  AitpMaintenanceDegradedReason,
  AitpMaintenanceReceipt,
  AitpMaintenanceWarningSummary,
} from '../types';
import {
  ISessionAitpLifecycleCoordinator,
  type AitpMaintenanceRefreshOptions,
} from './sessionAitpLifecycleCoordinator';

const DEFAULT_WORKSTREAM_KEY = '__default__';

export class SessionAitpLifecycleCoordinatorService
  extends Service
  implements ISessionAitpLifecycleCoordinator {
  declare readonly _serviceBrand: undefined;

  private readonly updateEmitter = this._register(new Emitter<AitpMaintenanceReceipt>());
  readonly onDidUpdate: Event<AitpMaintenanceReceipt> = this.updateEmitter.event;

  private readonly receipts = new Map<string, AitpMaintenanceReceipt>();
  private readonly inFlight = new Map<string, Promise<AitpMaintenanceReceipt>>();
  private readonly refreshControllers = new Map<string, AbortController>();
  private generation = 0;
  private latestKey: string | undefined;

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
  ) {
    super();
  }

  refresh(options?: AitpMaintenanceRefreshOptions): Promise<AitpMaintenanceReceipt> {
    const workstream = options?.workstream;
    const key = workstream ?? DEFAULT_WORKSTREAM_KEY;
    const inFlight = this.inFlight.get(key);
    if (inFlight !== undefined) return inFlight;

    const previous = this.receipts.get(key);
    if (previous !== undefined && options?.force !== true) {
      return Promise.resolve(previous);
    }

    const generation = this.generation;
    const controller = new AbortController();
    const task = this.runRefresh(key, workstream, generation, controller.signal);
    this.refreshControllers.set(key, controller);
    this.inFlight.set(key, task);
    void task.then(
      () => { this.clearInFlight(key, task, controller); },
      () => { this.clearInFlight(key, task, controller); },
    );
    return task;
  }

  snapshot(): AitpMaintenanceReceipt | undefined {
    if (this.latestKey !== undefined) return this.receipts.get(this.latestKey);
    return this.receipts.get(DEFAULT_WORKSTREAM_KEY);
  }

  reset(): void {
    this.generation += 1;
    for (const controller of this.refreshControllers.values()) controller.abort();
    this.refreshControllers.clear();
    this.receipts.clear();
    this.inFlight.clear();
    this.latestKey = undefined;
  }

  private async runRefresh(
    key: string,
    workstream: string | undefined,
    generation: number,
    signal: AbortSignal,
  ): Promise<AitpMaintenanceReceipt> {
    if (!this.adapter.isReady() || this.adapter.health.phase !== 'ready') {
      return this.storeIfCurrent(
        key,
        generation,
        this.degradedReceipt(workstream, this.adapter.isDegraded()
          ? 'adapter_degraded'
          : 'adapter_not_ready'),
      );
    }

    let entered: AitpEnterResult;
    try {
      entered = await this.adapter.enter({ workstream, signal });
    } catch {
      if (!this.isCurrent(generation)) return this.degradedReceipt(workstream, 'stale_generation');
      return this.storeIfCurrent(
        key,
        generation,
        this.degradedReceipt(workstream, 'enter_failed'),
      );
    }

    if (!this.isCurrent(generation)) {
      return this.degradedReceipt(workstream, 'stale_generation');
    }

    let report: AitpCheckReport;
    try {
      report = await this.adapter.check({ workstream, signal });
    } catch {
      if (!this.isCurrent(generation)) return this.degradedReceipt(workstream, 'stale_generation');
      return this.storeIfCurrent(
        key,
        generation,
        this.degradedReceipt(workstream, 'check_unavailable'),
      );
    }

    if (!this.isCurrent(generation)) return this.degradedReceipt(workstream, 'stale_generation');
    return this.storeIfCurrent(key, generation, this.receiptFromResults(workstream, entered, report));
  }

  private receiptFromResults(
    workstream: string | undefined,
    entered: AitpEnterResult,
    report: AitpCheckReport,
  ): AitpMaintenanceReceipt {
    const findingCodes = uniqueCodes(report.findings.map((finding) => finding.code));
    const check: AitpMaintenanceCheckSummary = {
      status: report.status,
      counts: {
        entries: report.counts.entries,
        notes: report.counts.notes,
        errors: report.counts.errors,
        warnings: report.counts.warnings,
      },
      findingCodes,
    };
    // A valid check report, including exit-1 error findings, is transport
    // success. Only an unavailable/invalid check reaches degradedReceipt();
    // checkpoint barriers decide whether a particular finding blocks commit.
    const status = 'ready';
    const warningSummaries: readonly AitpMaintenanceWarningSummary[] = entered.warnings.map((warning) => ({
      level: 'warning',
      code: summarizeCode(warning.code),
    }));

    return {
      status,
      refreshedAt: Date.now(),
      memoryStatus: entered.memory_status,
      workstream,
      latestWorkingNoteAt: parseTimestamp(entered.latest_working_note?.created_at),
      activeNewerThanWorkingNote: entered.counts.active_newer_than_latest_working_note === null
        ? null
        : entered.counts.active_newer_than_latest_working_note > 0,
      unresolvedFailureCount: entered.counts.unresolved_failures,
      unresolvedFailures: entered.unresolved_failures.map((failure) => ({
        entryId: failure.id,
        kind: failure.kind,
        summary: failure.summary,
        source: failure.source,
        authority: failure.authority,
        createdAt: parseTimestamp(failure.created_at),
        workstream,
      })),
      nextAction: 'status' in entered.next_action
        ? undefined
        : entered.next_action.text,
      nextActionDetails: 'status' in entered.next_action
        ? undefined
        : {
            text: entered.next_action.text,
            entryId: entered.next_action.entry_id,
            authority: entered.next_action.authority,
            createdAt: parseTimestamp(entered.next_action.created_at),
            source: entered.next_action.source,
          },
      warningSummaries,
      check,
    };
  }

  private degradedReceipt(
    workstream: string | undefined,
    reason: AitpMaintenanceDegradedReason,
  ): AitpMaintenanceReceipt {
    return {
      status: 'degraded',
      refreshedAt: Date.now(),
      memoryStatus: 'unknown',
      workstream,
      latestWorkingNoteAt: undefined,
      activeNewerThanWorkingNote: null,
      unresolvedFailureCount: 0,
      unresolvedFailures: [],
      nextAction: undefined,
      nextActionDetails: undefined,
      warningSummaries: [],
      check: {
        status: 'unavailable',
        counts: undefined,
        findingCodes: [],
      },
      degradedReason: reason,
    };
  }

  private storeIfCurrent(
    key: string,
    generation: number,
    receipt: AitpMaintenanceReceipt,
  ): AitpMaintenanceReceipt {
    if (this.isCurrent(generation)) {
      this.receipts.set(key, receipt);
      this.latestKey = key;
      this.updateEmitter.fire(receipt);
    }
    return receipt;
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private clearInFlight(
    key: string,
    task: Promise<AitpMaintenanceReceipt>,
    controller: AbortController,
  ): void {
    if (this.inFlight.get(key) === task) this.inFlight.delete(key);
    if (this.refreshControllers.get(key) === controller) this.refreshControllers.delete(key);
  }
}

function uniqueCodes(codes: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const code of codes) {
    const summary = summarizeCode(code);
    if (seen.has(summary)) continue;
    seen.add(summary);
    result.push(summary);
  }
  return result;
}

function summarizeCode(code: string): string {
  const safe = code.trim().replaceAll(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120);
  return safe.length > 0 ? safe : 'unknown';
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
