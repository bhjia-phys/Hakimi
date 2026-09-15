/**
 * `providerUsageLedger` domain — DeepSeek pricing and Asia/Shanghai clock.
 *
 * Pure functions only: a strict model-name → tier table (no fuzzy matching, no
 * back-dating of unverified historical rates), a fixed-precision CNY cost in
 * integer nano-yuan (1 CNY = 10^9 nanos) so per-request amounts are never
 * rounded to cents before aggregation, and the Asia/Shanghai wall-clock
 * helpers used to group attempts into calendar days/months and to select the
 * official peak/off-peak rate. The rate snapshot is versioned and dated.
 */

import type { TokenUsage } from '#/kosong/contract/usage';

export const PRICING_SNAPSHOT_VERSION = '2026-09-07';
export const PRICING_SNAPSHOT_VALID_FROM = Date.parse(`${PRICING_SNAPSHOT_VERSION}T00:00:00+08:00`);

const NANOS_PER_CNY = 1_000_000_000n;
const MILLIS_PER_HOUR = 3_600_000;
const SHANGHAI_UTC_OFFSET_MS = 8 * MILLIS_PER_HOUR;

export type DeepSeekModelKind = 'pro' | 'flash' | 'flash-vision';

interface TierRate {
  readonly cacheHitNanosPerToken: bigint;
  readonly cacheMissNanosPerToken: bigint;
  readonly outputNanosPerToken: bigint;
}

const FLASH_PEAK: TierRate = {
  cacheHitNanosPerToken: 100n,
  cacheMissNanosPerToken: 3000n,
  outputNanosPerToken: 9000n,
};

const FLASH_OFF_PEAK: TierRate = {
  cacheHitNanosPerToken: 50n,
  cacheMissNanosPerToken: 1500n,
  outputNanosPerToken: 4500n,
};

const PRO_PEAK: TierRate = {
  cacheHitNanosPerToken: 300n,
  cacheMissNanosPerToken: 9000n,
  outputNanosPerToken: 27000n,
};

const PRO_OFF_PEAK: TierRate = {
  cacheHitNanosPerToken: 150n,
  cacheMissNanosPerToken: 4500n,
  outputNanosPerToken: 13500n,
};

const MODEL_KIND_BY_NAME: Readonly<Record<string, DeepSeekModelKind>> = {
  'deepseek-v4-pro': 'pro',
  'deepseek-v4-flash': 'flash',
  'deepseek-v4-flash-vision-exp': 'flash-vision',
};

export function resolveDeepSeekModelKind(modelName: string): DeepSeekModelKind | undefined {
  if (!Object.prototype.hasOwnProperty.call(MODEL_KIND_BY_NAME, modelName)) return undefined;
  return MODEL_KIND_BY_NAME[modelName];
}

function rateFor(kind: DeepSeekModelKind, peak: boolean): TierRate {
  switch (kind) {
    case 'pro':
      return peak ? PRO_PEAK : PRO_OFF_PEAK;
    case 'flash':
    case 'flash-vision':
      return peak ? FLASH_PEAK : FLASH_OFF_PEAK;
  }
}

export function computeCostNanos(
  kind: DeepSeekModelKind,
  peak: boolean,
  usage: TokenUsage,
): bigint {
  const rate = rateFor(kind, peak);
  const cacheRead = toNonNegative(usage.inputCacheRead);
  const inputOther = toNonNegative(usage.inputOther) + toNonNegative(usage.inputCacheCreation);
  const output = toNonNegative(usage.output);
  return (
    BigInt(cacheRead) * rate.cacheHitNanosPerToken +
    BigInt(inputOther) * rate.cacheMissNanosPerToken +
    BigInt(output) * rate.outputNanosPerToken
  );
}

function toNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function formatNanosToCny(nanos: bigint): string {
  const negative = nanos < 0n;
  const abs = negative ? -nanos : nanos;
  const whole = abs / NANOS_PER_CNY;
  const fraction = abs % NANOS_PER_CNY;
  let fractionText = fraction.toString().padStart(9, '0').replace(/0+$/, '');
  const sign = negative ? '-' : '';
  if (fractionText.length === 0) return `${sign}${whole.toString()}`;
  return `${sign}${whole.toString()}.${fractionText}`;
}

export interface ShanghaiTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly weekday: number;
}

const SHANGHAI_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function shanghaiParts(epochMs: number): ShanghaiTimeParts {
  const parts = SHANGHAI_FORMATTER.formatToParts(new Date(epochMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part === undefined ? 0 : Number(part.value);
  };
  const year = read('year');
  const month = read('month');
  const day = read('day');
  const hour = read('hour');
  const minute = read('minute');
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

export function startOfShanghaiDay(epochMs: number): number {
  const { year, month, day } = shanghaiParts(epochMs);
  return Date.UTC(year, month - 1, day) - SHANGHAI_UTC_OFFSET_MS;
}

export function endOfShanghaiDay(epochMs: number): number {
  return startOfShanghaiDay(epochMs) + 24 * MILLIS_PER_HOUR;
}

export function startOfShanghaiMonth(epochMs: number): number {
  const { year, month } = shanghaiParts(epochMs);
  return Date.UTC(year, month - 1, 1) - SHANGHAI_UTC_OFFSET_MS;
}

export function endOfShanghaiMonth(epochMs: number): number {
  const { year, month } = shanghaiParts(epochMs);
  return Date.UTC(year, month, 1) - SHANGHAI_UTC_OFFSET_MS;
}

export function shanghaiYearMonth(epochMs: number): string {
  const { year, month } = shanghaiParts(epochMs);
  return `${String(year)}-${String(month).padStart(2, '0')}`;
}

export function isDeepSeekPeak(epochMs: number): boolean {
  const { weekday, hour } = shanghaiParts(epochMs);
  if (weekday < 1 || weekday > 5) return false;
  const morningPeak = hour >= 9 && hour < 12;
  const afternoonPeak = hour >= 14 && hour < 18;
  return morningPeak || afternoonPeak;
}
