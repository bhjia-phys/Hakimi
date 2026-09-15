/**
 * `providerUsageLedger` pricing tests — the pure DeepSeek rate table, fixed
 * precision CNY formatting, and the Asia/Shanghai day/month + peak clock.
 */

import { describe, expect, it } from 'vitest';

import {
  computeCostNanos,
  endOfShanghaiDay,
  endOfShanghaiMonth,
  formatNanosToCny,
  isDeepSeekPeak,
  resolveDeepSeekModelKind,
  shanghaiParts,
  shanghaiYearMonth,
  startOfShanghaiDay,
  startOfShanghaiMonth,
} from '#/app/providerUsageLedger/pricing';

const SHANGHAI_OFFSET_MS = 8 * 3_600_000;

function shanghaiEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - SHANGHAI_OFFSET_MS;
}

describe('resolveDeepSeekModelKind', () => {
  it('maps the exact V4 model names and leaves unknown names unpriced', () => {
    expect(resolveDeepSeekModelKind('deepseek-v4-pro')).toBe('pro');
    expect(resolveDeepSeekModelKind('deepseek-v4-flash')).toBe('flash');
    expect(resolveDeepSeekModelKind('deepseek-v4-flash-vision-exp')).toBe('flash-vision');
    expect(resolveDeepSeekModelKind('deepseek-chat')).toBeUndefined();
    expect(resolveDeepSeekModelKind('deepseek-v4-flash-extra')).toBeUndefined();
    expect(resolveDeepSeekModelKind('')).toBeUndefined();
  });

  it('does not resolve prototype keys to a tier', () => {
    expect(resolveDeepSeekModelKind('constructor')).toBeUndefined();
    expect(resolveDeepSeekModelKind('toString')).toBeUndefined();
    expect(resolveDeepSeekModelKind('__proto__')).toBeUndefined();
    expect(resolveDeepSeekModelKind('hasOwnProperty')).toBeUndefined();
  });
});

describe('computeCostNanos', () => {
  const usage = {
    inputOther: 0,
    output: 1_000_000,
    inputCacheRead: 0,
    inputCacheCreation: 0,
  };

  it('uses the peak pro output rate', () => {
    expect(computeCostNanos('pro', true, usage)).toBe(27_000_000_000n);
  });

  it('uses the peak flash output rate', () => {
    expect(computeCostNanos('flash', true, usage)).toBe(9_000_000_000n);
  });

  it('prices the flash-vision exp at the flash rate', () => {
    expect(computeCostNanos('flash-vision', true, usage)).toBe(9_000_000_000n);
  });

  it('halves the rate off-peak', () => {
    expect(computeCostNanos('pro', false, usage)).toBe(13_500_000_000n);
    expect(computeCostNanos('flash', false, usage)).toBe(4_500_000_000n);
  });

  it('counts cache creation as uncached input rather than omitting it', () => {
    expect(computeCostNanos('pro', true, {
      inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 1_000_000,
    })).toBe(9_000_000_000n);
  });

  it('splits cache hit vs miss input against the distinct rates', () => {
    const split = {
      inputOther: 1_000_000,
      output: 0,
      inputCacheRead: 2_000_000,
      inputCacheCreation: 0,
    };
    // pro peak: miss 9000/tok * 1M + hit 300/tok * 2M
    expect(computeCostNanos('pro', true, split)).toBe(9_000_000_000n + 600_000_000n);
  });
});

describe('formatNanosToCny', () => {
  it('formats whole CNY without a fractional part', () => {
    expect(formatNanosToCny(27_000_000_000n)).toBe('27');
  });

  it('keeps fixed precision without rounding to cents', () => {
    expect(formatNanosToCny(100n)).toBe('0.0000001');
  });

  it('formats zero as "0"', () => {
    expect(formatNanosToCny(0n)).toBe('0');
  });
});

describe('Shanghai clock', () => {
  it('maps a UTC instant to Shanghai wall-clock parts', () => {
    const parts = shanghaiParts(shanghaiEpoch(2026, 9, 7, 9, 30));
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(9);
    expect(parts.day).toBe(7);
    expect(parts.hour).toBe(9);
    expect(parts.minute).toBe(30);
  });

  it('computes day start/end across the UTC+8 boundary', () => {
    const at = shanghaiEpoch(2026, 9, 7, 15, 0);
    expect(startOfShanghaiDay(at)).toBe(shanghaiEpoch(2026, 9, 7, 0, 0));
    expect(endOfShanghaiDay(at)).toBe(shanghaiEpoch(2026, 9, 8, 0, 0));
  });

  it('computes month start/end', () => {
    const at = shanghaiEpoch(2026, 9, 15, 12, 0);
    expect(startOfShanghaiMonth(at)).toBe(shanghaiEpoch(2026, 9, 1, 0, 0));
    expect(endOfShanghaiMonth(at)).toBe(shanghaiEpoch(2026, 10, 1, 0, 0));
  });

  it('groups the year-month from the Shanghai wall clock', () => {
    expect(shanghaiYearMonth(shanghaiEpoch(2026, 9, 1, 0, 30))).toBe('2026-09');
    // 2026-08-31 23:30 Shanghai is still August.
    expect(shanghaiYearMonth(shanghaiEpoch(2026, 8, 31, 23, 30))).toBe('2026-08');
  });
});

describe('isDeepSeekPeak', () => {
  it('is peak during the weekday morning and afternoon windows', () => {
    // 2026-09-07 is a Monday.
    expect(isDeepSeekPeak(shanghaiEpoch(2026, 9, 7, 9, 0))).toBe(true);
    expect(isDeepSeekPeak(shanghaiEpoch(2026, 9, 7, 11, 59))).toBe(true);
    expect(isDeepSeekPeak(shanghaiEpoch(2026, 9, 7, 14, 0))).toBe(true);
    expect(isDeepSeekPeak(shanghaiEpoch(2026, 9, 7, 17, 59))).toBe(true);
  });

  it('is off-peak in the lunch gap and outside windows', () => {
    expect(isDeepSeekPeak(shanghaiEpoch(2026, 9, 7, 12, 0))).toBe(false);
    expect(isDeepSeekPeak(shanghaiEpoch(2026, 9, 7, 13, 59))).toBe(false);
    expect(isDeepSeekPeak(shanghaiEpoch(2026, 9, 7, 18, 0))).toBe(false);
    expect(isDeepSeekPeak(shanghaiEpoch(2026, 9, 7, 8, 59))).toBe(false);
  });

  it('is off-peak on the weekend', () => {
    // 2026-09-05 is a Saturday.
    expect(isDeepSeekPeak(shanghaiEpoch(2026, 9, 5, 10, 0))).toBe(false);
  });
});
