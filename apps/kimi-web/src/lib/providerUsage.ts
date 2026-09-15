import type { ProviderUsageResult, ProviderUsageRow } from '../api/types';

/** Used quota as a percentage of the limit (0–100+); `null` when not computable. */
export function providerUsagePercent(row: Pick<ProviderUsageRow, 'used' | 'limit'>): number | null {
  if (!Number.isFinite(row.used) || !Number.isFinite(row.limit) || row.limit <= 0) return null;
  return Math.max(0, Math.round((row.used / row.limit) * 100));
}

/** Remaining quota in raw units (`limit - used`); `null` when not computable. */
export function providerUsageRemaining(
  row: Pick<ProviderUsageRow, 'used' | 'limit'>,
): number | null {
  if (!Number.isFinite(row.used) || !Number.isFinite(row.limit)) return null;
  return row.limit - row.used;
}

/**
 * Remaining quota as a percentage of the limit (0–100); `null` when not
 * computable. The complementary view of {@link providerUsagePercent} — a row
 * at `{used: 17, limit: 100}` reads 83, an over-limit row reads 0.
 */
export function providerUsageRemainingPercent(
  row: Pick<ProviderUsageRow, 'used' | 'limit'>,
): number | null {
  const usedPercent = providerUsagePercent(row);
  return usedPercent === null ? null : Math.max(0, 100 - usedPercent);
}

/**
 * Visual-bar width for the remaining quota, clamped to 0–100. Expressed in
 * remaining semantics like {@link providerUsageRemainingPercent}: at
 * `{used: 17, limit: 100}` the bar fills 83%, an over-limit row fills 0%, and
 * a zero/invalid limit fills nothing.
 */
export function providerUsageBarPercent(row: Pick<ProviderUsageRow, 'used' | 'limit'>): number {
  return Math.min(providerUsageRemainingPercent(row) ?? 0, 100);
}

export function formatProviderUsageReset(resetAt: string | undefined, locale: string): string | null {
  if (resetAt === undefined) return null;
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return resetAt;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatProviderCurrency(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function providerUsageBadgeVariant(
  result: ProviderUsageResult,
): 'success' | 'danger' | 'neutral' {
  if (result.kind === 'ok') return 'success';
  return result.kind === 'error' ? 'danger' : 'neutral';
}

// ---------------------------------------------------------------------------
// Metered usage formatting — local estimated CNY cost + official balance.
// ---------------------------------------------------------------------------

/**
 * Format a high-precision estimated CNY cost (decimal string, or `null` when
 * unknown). Returns `null` for unknown (caller renders the "unknown" marker,
 * never zero). Tiny positive sub-cent amounts render as `<¥0.01` instead of a
 * misleading `¥0.00`; everything else is rounded to two decimals for display
 * only (no rounding happens in the wire projection).
 */
export function formatCnyEstimatedCost(cost: string | null): string | null {
  if (cost === null || !/^\d+(?:\.\d+)?$/.test(cost)) return null;
  const value = Number(cost);
  if (!Number.isFinite(value)) return null;
  if (value > 0 && value < 0.01) return '<¥0.01';
  return `¥${value.toFixed(2)}`;
}

/**
 * Format an official account balance decimal string in its own currency (CNY or
 * USD). No currency conversion is performed — each balance renders in the
 * currency the provider reported it in.
 */
export function formatMeteredBalance(
  value: string,
  currency: 'CNY' | 'USD',
  locale: string,
): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return `${currency} ${value}`;
  const symbol = currency === 'CNY' ? '¥' : '$';
  if (number > 0 && number < 0.01) return `<${symbol}0.01`;
  const scale = Math.min(20, value.split('.')[1]?.length ?? 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: Math.max(2, scale),
    }).format(number);
  } catch {
    return `${currency} ${value}`;
  }
}

/** Format an integer token count with the locale's grouping separators. */
export function formatTokenCount(count: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(count);
}

/**
 * Format an ISO timestamp in Asia/Shanghai (Beijing) time. Falls back to the raw
 * string when the input is not a parseable date.
 */
export function formatBeijingTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Shanghai',
    }).format(date);
  } catch {
    return iso;
  }
}
