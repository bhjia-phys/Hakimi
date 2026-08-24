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
