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

  private readonly receipts = new Map<string, AitpMaintenanceReceipt>();
  private readonly inFlight = new Map<string, Promise<AitpMaintenanceReceipt>>();
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
    const task = this.runRefresh(key, workstream, generation);
    this.inFlight.set(key, task);
    void task.then(
      () => { this.clearInFlight(key, task); },
      () => { this.clearInFlight(key, task); },
    );
    return task;
  }

  snapshot(): AitpMaintenanceReceipt | undefined {
    if (this.latestKey !== undefined) return this.receipts.get(this.latestKey);
    return this.receipts.get(DEFAULT_WORKSTREAM_KEY);
  }

  reset(): void {
    this.generation += 1;
    this.receipts.clear();
    this.inFlight.clear();
    this.latestKey = undefined;
  }

  private async runRefresh(
    key: string,
    workstream: string | undefined,
    generation: number,
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
      entered = await this.adapter.enter(workstream === undefined ? undefined : { workstream });
    } catch {
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
      report = await this.adapter.check(workstream === undefined ? undefined : { workstream });
    } catch {
      return this.storeIfCurrent(
        key,
        generation,
        this.degradedReceipt(workstream, 'check_unavailable'),
      );
    }

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
    const status = report.counts.errors > 0 ? 'degraded' : 'ready';
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
      nextAction: 'status' in entered.next_action
        ? undefined
        : entered.next_action.text,
      warningSummaries,
      check,
      degradedReason: status === 'degraded' ? 'check_findings' : undefined,
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
      nextAction: undefined,
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
    }
    return receipt;
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private clearInFlight(key: string, task: Promise<AitpMaintenanceReceipt>): void {
    if (this.inFlight.get(key) === task) this.inFlight.delete(key);
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
