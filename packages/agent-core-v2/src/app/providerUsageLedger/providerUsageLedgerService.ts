/**
 * `providerUsageLedger` domain — `IProviderUsageLedgerService` implementation.
 *
 * Records each real attempt as an independent atomic document under the
 * `store` persistence scope (`bootstrap.scope('store')`), namespaced
 * `providerUsageLedger/<Asia/Shanghai year-month>/<uuid>` so independent keys
 * never contend on a shared accumulator across processes sharing a home dir.
 * Start and finish writes for one attempt are serialized; a finish overwrites
 * the same document. Recording is best-effort and fire-and-forget: a
 * persistence or pricing failure marks the ledger degraded but never blocks a
 * generation, turns a success into a retry, or overrides a model error. Reads
 * only accept formal UUID keys (skipping atomic-write `.tmp.<pid>.<hex>`
 * leftovers), runtime-validate every document, and bound read concurrency;
 * completed (immutable) records are cached, pending records are re-read, and a
 * process restart re-lists from the store. Immutable tracking-start and gap
 * events use independent UUIDs, preventing an older writer from overwriting a
 * newer coverage reset. Queries and graceful disposal await queued writes,
 * without making model generation wait for persistence. App scope.
 */

import { officialDeepSeekBalanceUrl } from '@moonshot-ai/kimi-code-oauth';

import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { IBootstrapService } from '#/app/bootstrap/bootstrap';
import { IFlagService } from '#/app/flag/flag';
import { DEEPSEEK_USAGE_FLAG_ID } from '#/app/providerUsage/flag';
import type { LocalMeteredUsage, MeteredUsagePeriod } from '#/app/providerUsage/meteredUsage';
import type { TokenUsage } from '#/kosong/contract/usage';
import { IAtomicDocumentStore } from '#/persistence/interface/atomicDocumentStore';

import {
  computeCostNanos,
  endOfShanghaiDay,
  endOfShanghaiMonth,
  formatNanosToCny,
  isDeepSeekPeak,
  PRICING_SNAPSHOT_VALID_FROM,
  PRICING_SNAPSHOT_VERSION,
  resolveDeepSeekModelKind,
  shanghaiYearMonth,
  startOfShanghaiDay,
  startOfShanghaiMonth,
} from './pricing';
import {
  IProviderUsageLedgerService,
  type MeteredAttemptFinish,
  type MeteredAttemptOutcome,
  type MeteredAttemptStart,
} from './providerUsageLedger';

const LEDGER_NAMESPACE = 'providerUsageLedger';
const TRACKING_NAMESPACE = '_tracking';
const TRACKING_KEY = 'start';
const MAX_READ_CONCURRENCY = 8;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AttemptRecord {
  readonly attemptId: string;
  readonly providerName: string;
  readonly modelName: string;
  readonly modelAlias: string;
  readonly startedAtEpochMs: number;
  readonly outcome: MeteredAttemptOutcome | 'started';
  readonly usage: TokenUsage | null;
  readonly pricingVersion: string | null;
  readonly costNanos: string | null;
}

interface TrackingMetadata {
  readonly providerName: string;
  readonly trackingStartedAtEpochMs: number;
  readonly reset?: boolean;
  readonly gap?: boolean;
}

interface TrackingState {
  readonly startedAtEpochMs: number | null;
  readonly gapTimes: readonly number[];
}

interface StartContext {
  readonly start: MeteredAttemptStart;
  readonly monthScope: string;
}

export class ProviderUsageLedgerService implements IProviderUsageLedgerService {
  declare readonly _serviceBrand: undefined;

  private readonly storeScope: string;
  private readonly startContexts = new Map<string, StartContext>();
  private readonly startWrites = new Map<string, Promise<void>>();
  private readonly finishWrites = new Set<Promise<void>>();
  private readonly trackingWrites = new Map<string, Promise<void>>();
  private readonly flagWasOn = new Map<string, boolean>();
  private readonly gapDays = new Set<string>();
  private readonly cache = new Map<string, AttemptRecord>();
  private degraded = false;
  private closed = false;

  constructor(
    @IBootstrapService bootstrap: IBootstrapService,
    @IAtomicDocumentStore private readonly atomicDocs: IAtomicDocumentStore,
    @IFlagService private readonly flags: IFlagService,
  ) {
    this.storeScope = bootstrap.scope('store');
  }

  startAttempt(start: MeteredAttemptStart): string | undefined {
    if (this.closed) return undefined;
    try {
      if (officialDeepSeekBalanceUrl(start.baseUrl) === undefined) return undefined;
      const provider = start.providerName;
      const flagOn = this.flags.enabled(DEEPSEEK_USAGE_FLAG_ID);
      const wasOn = this.flagWasOn.get(provider);
      this.flagWasOn.set(provider, flagOn);
      if (!flagOn) {
        this.enqueueTrackingGap(provider, start.startedAtEpochMs);
        return undefined;
      }
      const attemptId = crypto.randomUUID();
      const monthScope = this.monthScope(shanghaiYearMonth(start.startedAtEpochMs));
      const record: AttemptRecord = {
        attemptId,
        providerName: start.providerName,
        modelName: start.modelName,
        modelAlias: start.modelAlias,
        startedAtEpochMs: start.startedAtEpochMs,
        outcome: 'started',
        usage: null,
        pricingVersion: null,
        costNanos: null,
      };
      this.startContexts.set(attemptId, { start, monthScope });
      this.cache.set(this.cacheKey(monthScope, attemptId), record);
      this.startWrites.set(
        attemptId,
        this.atomicDocs.set(monthScope, attemptId, record).catch(() => {
          this.degraded = true;
        }),
      );
      if (wasOn !== true) {
        this.enqueueTrackingWrite(provider, start.startedAtEpochMs, wasOn === false);
      }
      return attemptId;
    } catch {
      this.degraded = true;
      return undefined;
    }
  }

  finishAttempt(attemptId: string, finish: MeteredAttemptFinish): void {
    if (this.closed) return;
    const context = this.startContexts.get(attemptId);
    if (context === undefined) return;
    this.startContexts.delete(attemptId);
    const prior = this.startWrites.get(attemptId) ?? Promise.resolve();
    this.startWrites.delete(attemptId);
    let usage: TokenUsage | null = null;
    if (finish.usage !== null) {
      if (isValidUsage(finish.usage)) {
        usage = {
          inputOther: finish.usage.inputOther,
          inputCacheRead: finish.usage.inputCacheRead,
          inputCacheCreation: finish.usage.inputCacheCreation,
          output: finish.usage.output,
        };
      } else {
        this.degraded = true;
      }
    }
    let priced: { readonly version: string | null; readonly costNanos: string | null };
    try {
      priced = this.price(context.start, usage);
    } catch {
      this.degraded = true;
      priced = { version: null, costNanos: null };
    }
    const record: AttemptRecord = {
      attemptId,
      providerName: context.start.providerName,
      modelName: context.start.modelName,
      modelAlias: context.start.modelAlias,
      startedAtEpochMs: context.start.startedAtEpochMs,
      outcome: finish.outcome,
      usage,
      pricingVersion: priced.version,
      costNanos: priced.costNanos,
    };
    const cacheKey = this.cacheKey(context.monthScope, attemptId);
    const write = prior
      .then(() => this.atomicDocs.set(context.monthScope, attemptId, record))
      .then(() => { this.cache.set(cacheKey, record); })
      .catch(() => { this.degraded = true; });
    this.finishWrites.add(write);
    void write.then(() => { this.finishWrites.delete(write); });
  }

  async dispose(): Promise<void> {
    this.closed = true;
    await this.settleWrites();
  }

  private async settleWrites(): Promise<void> {
    await Promise.all([
      ...this.startWrites.values(),
      ...this.finishWrites,
      ...this.trackingWrites.values(),
    ]);
  }

  async getMeteredUsage(
    providerName: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<LocalMeteredUsage> {
    const now = Date.now();
    const monthScope = this.monthScope(shanghaiYearMonth(now));
    let records: AttemptRecord[] = [];
    let tracking: TrackingState = { startedAtEpochMs: null, gapTimes: [] };
    if (options?.signal?.aborted !== true) {
      try {
        await this.settleWrites();
        const keys = await this.atomicDocs.list(monthScope);
        records = await this.readRecords(monthScope, keys);
        tracking = await this.readTrackingState(providerName);
      } catch {
        this.degraded = true;
      }
    }
    const providerRecords = records.filter((record) => record.providerName === providerName);
    const report = aggregateMeteredUsage(providerRecords, now, this.degraded, tracking.startedAtEpochMs);
    const withGaps = (period: MeteredUsagePeriod): MeteredUsagePeriod => {
      const from = Date.parse(period.startAt);
      const to = Date.parse(period.endAt);
      return {
        ...period,
        isPartial: period.isPartial || tracking.gapTimes.some((time) => time >= from && time < to),
      };
    };
    return { ...report, today: withGaps(report.today), month: withGaps(report.month) };
  }

  private enqueueTrackingWrite(providerName: string, startedAtEpochMs: number, reset: boolean): void {
    const key = crypto.randomUUID();
    const prior = this.trackingWrites.get(providerName) ?? Promise.resolve();
    const write = prior
      .then(() => this.atomicDocs.set(this.trackingScope(providerName), key, {
        providerName,
        trackingStartedAtEpochMs: startedAtEpochMs,
        reset,
      } satisfies TrackingMetadata))
      .catch(() => { this.degraded = true; });
    this.trackingWrites.set(providerName, write);
  }

  private enqueueTrackingGap(providerName: string, startedAtEpochMs: number): void {
    const dayKey = `${encodeURIComponent(providerName)}:${startOfShanghaiDay(startedAtEpochMs)}`;
    if (this.gapDays.has(dayKey)) return;
    const prior = this.trackingWrites.get(providerName) ?? Promise.resolve();
    const write = prior.then(async () => {
      if (this.gapDays.has(dayKey)) return;
      const tracking = await this.readTrackingState(providerName);
      if (tracking.startedAtEpochMs === null) return;
      await this.atomicDocs.set(this.trackingScope(providerName), crypto.randomUUID(), {
        providerName,
        trackingStartedAtEpochMs: startedAtEpochMs,
        reset: false,
        gap: true,
      } satisfies TrackingMetadata);
      this.gapDays.add(dayKey);
    }).catch(() => { this.degraded = true; });
    this.trackingWrites.set(providerName, write);
  }

  private async readTrackingState(providerName: string): Promise<TrackingState> {
    try {
      const scope = this.trackingScope(providerName);
      const keys = (await this.atomicDocs.list(scope))
        .filter((key) => key === TRACKING_KEY || UUID_REGEX.test(key));
      const metadata = await mapWithConcurrency(keys, MAX_READ_CONCURRENCY, async (key) => {
        try {
          const value = await this.atomicDocs.get<unknown>(scope, key);
          if (value === undefined) return undefined;
          if (!isValidTrackingMetadata(value) || value.providerName !== providerName) {
            this.degraded = true;
            return undefined;
          }
          return { key, value };
        } catch {
          this.degraded = true;
          return undefined;
        }
      });
      let first: number | null = null;
      let lastReset: number | null = null;
      const gapTimes: number[] = [];
      for (const record of metadata) {
        if (record === undefined) continue;
        const time = record.value.trackingStartedAtEpochMs;
        if (record.value.gap === true) {
          gapTimes.push(time);
          continue;
        }
        first = first === null ? time : Math.min(first, time);
        if (record.value.reset === true || record.key === TRACKING_KEY) {
          lastReset = lastReset === null ? time : Math.max(lastReset, time);
        }
      }
      return { startedAtEpochMs: lastReset ?? first, gapTimes };
    } catch {
      this.degraded = true;
      return { startedAtEpochMs: null, gapTimes: [] };
    }
  }

  private price(
    start: MeteredAttemptStart,
    usage: TokenUsage | null,
  ): { readonly version: string | null; readonly costNanos: string | null } {
    if (usage === null || start.startedAtEpochMs < PRICING_SNAPSHOT_VALID_FROM) {
      return { version: null, costNanos: null };
    }
    const kind = resolveDeepSeekModelKind(start.modelName);
    if (kind === undefined) return { version: null, costNanos: null };
    const peak = isDeepSeekPeak(start.startedAtEpochMs);
    return {
      version: PRICING_SNAPSHOT_VERSION,
      costNanos: computeCostNanos(kind, peak, usage).toString(),
    };
  }

  private async readRecords(
    monthScope: string,
    keys: readonly string[],
  ): Promise<AttemptRecord[]> {
    const formalKeys = keys.filter((key) => UUID_REGEX.test(key));
    const results: AttemptRecord[] = [];
    const seenAttemptIds = new Set<string>();
    const toRead: string[] = [];
    for (const key of formalKeys) {
      const cacheKey = this.cacheKey(monthScope, key);
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined && cached.outcome !== 'started') {
        if (!seenAttemptIds.has(cached.attemptId)) {
          seenAttemptIds.add(cached.attemptId);
          results.push(cached);
        }
      } else {
        toRead.push(key);
      }
    }
    const reads = await mapWithConcurrency(toRead, MAX_READ_CONCURRENCY, async (key) => {
      try {
        const record = await this.atomicDocs.get<unknown>(monthScope, key);
        if (record === undefined) return undefined;
        if (!isValidAttemptRecord(record, key)) {
          this.degraded = true;
          return undefined;
        }
        this.cache.set(this.cacheKey(monthScope, key), record);
        return record;
      } catch {
        this.degraded = true;
        return undefined;
      }
    });
    for (const record of reads) {
      if (record !== undefined && !seenAttemptIds.has(record.attemptId)) {
        seenAttemptIds.add(record.attemptId);
        results.push(record);
      }
    }
    return results;
  }

  private monthScope(yearMonth: string): string {
    return `${this.storeScope}/${LEDGER_NAMESPACE}/${yearMonth}`;
  }

  private trackingScope(providerName: string): string {
    const providerKey = encodeURIComponent(providerName).replaceAll('.', '%2E');
    return `${this.storeScope}/${LEDGER_NAMESPACE}/${TRACKING_NAMESPACE}/${providerKey}`;
  }

  private cacheKey(monthScope: string, attemptId: string): string {
    return `${monthScope}/${attemptId}`;
  }
}

export function aggregateMeteredUsage(
  records: readonly AttemptRecord[],
  nowEpochMs: number,
  degraded: boolean,
  trackingStartedAtEpochMs: number | null,
): LocalMeteredUsage {
  const todayStart = startOfShanghaiDay(nowEpochMs);
  const todayEnd = endOfShanghaiDay(nowEpochMs);
  const monthStart = startOfShanghaiMonth(nowEpochMs);
  const monthEnd = endOfShanghaiMonth(nowEpochMs);

  const trackingStartedAt =
    trackingStartedAtEpochMs === null ? null : new Date(trackingStartedAtEpochMs).toISOString();

  const today = aggregatePeriod(records, todayStart, todayEnd, trackingStartedAt, degraded);
  const month = aggregatePeriod(records, monthStart, monthEnd, trackingStartedAt, degraded);

  return {
    source: 'local',
    costSource: 'estimated',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    trackingStartedAt,
    degraded,
    today,
    month,
  };
}

function aggregatePeriod(
  records: readonly AttemptRecord[],
  startAt: number,
  endAt: number,
  trackingStartedAt: string | null,
  degraded: boolean,
): MeteredUsagePeriod {
  let requestCount = 0;
  let measuredRequestCount = 0;
  let pendingRequestCount = 0;
  let missingUsageRequestCount = 0;
  let unpricedRequestCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let totalCostNanos: bigint | null = null;

  for (const record of records) {
    if (record.startedAtEpochMs < startAt || record.startedAtEpochMs >= endAt) continue;
    requestCount += 1;
    if (record.outcome === 'started') {
      pendingRequestCount += 1;
      continue;
    }
    if (record.usage === null) {
      missingUsageRequestCount += 1;
      continue;
    }
    measuredRequestCount += 1;
    inputTokens += nonNegative(record.usage.inputOther) +
      nonNegative(record.usage.inputCacheCreation) + nonNegative(record.usage.inputCacheRead);
    cacheReadTokens += nonNegative(record.usage.inputCacheRead);
    outputTokens += nonNegative(record.usage.output);
    if (record.costNanos === null) {
      unpricedRequestCount += 1;
      continue;
    }
    const cost = parseNanos(record.costNanos);
    if (cost === null) {
      unpricedRequestCount += 1;
      continue;
    }
    totalCostNanos = (totalCostNanos ?? 0n) + cost;
  }

  const totalTokens = inputTokens + outputTokens;
  const trackingGap =
    trackingStartedAt === null || trackingStartedAt > new Date(startAt).toISOString();
  const isPartial =
    degraded ||
    trackingGap ||
    pendingRequestCount > 0 ||
    missingUsageRequestCount > 0 ||
    unpricedRequestCount > 0;

  return {
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    requestCount,
    measuredRequestCount,
    pendingRequestCount,
    missingUsageRequestCount,
    unpricedRequestCount,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    totalTokens,
    estimatedCost: totalCostNanos === null ? null : formatNanosToCny(totalCostNanos),
    isPartial,
  };
}

function isValidAttemptRecord(value: unknown, key: string): value is AttemptRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (r['attemptId'] !== key) return false;
  if (typeof r['providerName'] !== 'string') return false;
  if (typeof r['modelName'] !== 'string') return false;
  if (typeof r['modelAlias'] !== 'string') return false;
  if (!isTimestamp(r['startedAtEpochMs'])) return false;
  const outcome = r['outcome'];
  if (outcome !== 'started' && outcome !== 'success' && outcome !== 'error' && outcome !== 'cancelled') {
    return false;
  }
  if (r['usage'] !== null && !isValidUsage(r['usage'])) return false;
  if (r['pricingVersion'] !== null && typeof r['pricingVersion'] !== 'string') return false;
  if (r['costNanos'] !== null && !isValidCostNanos(r['costNanos'])) return false;
  return true;
}

function isValidUsage(value: unknown): value is TokenUsage {
  if (typeof value !== 'object' || value === null) return false;
  const u = value as Record<string, unknown>;
  return (
    isNonNegativeSafeInt(u['inputOther']) &&
    isNonNegativeSafeInt(u['output']) &&
    isNonNegativeSafeInt(u['inputCacheRead']) &&
    isNonNegativeSafeInt(u['inputCacheCreation'])
  );
}

function isValidCostNanos(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return false;
  try {
    BigInt(value);
    return true;
  } catch {
    return false;
  }
}

function isValidTrackingMetadata(value: unknown): value is TrackingMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r['providerName'] === 'string' &&
    isTimestamp(r['trackingStartedAtEpochMs']) &&
    (r['reset'] === undefined || typeof r['reset'] === 'boolean') &&
    (r['gap'] === undefined || typeof r['gap'] === 'boolean') &&
    !(r['gap'] === true && r['reset'] === true)
  );
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= 0 && !Number.isNaN(new Date(value).getTime());
}

function isNonNegativeSafeInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseNanos(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const current = next;
      next += 1;
      if (current >= items.length) break;
      results[current] = await fn(items[current] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

registerScopedService(
  LifecycleScope.App,
  IProviderUsageLedgerService,
  ProviderUsageLedgerService,
  ScopeActivation.OnScopeCreated,
  'providerUsageLedger',
);
