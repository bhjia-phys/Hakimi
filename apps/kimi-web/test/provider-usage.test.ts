import { describe, expect, it } from 'vitest';

import type { ProviderUsageResult } from '../src/api/types';
import enSettings from '../src/i18n/locales/en/settings';
import zhSettings from '../src/i18n/locales/zh/settings';
import {
  formatBeijingTime,
  formatCnyEstimatedCost,
  formatMeteredBalance,
  formatProviderCurrency,
  formatProviderUsageReset,
  formatTokenCount,
  providerUsageBadgeVariant,
  providerUsageBarPercent,
  providerUsagePercent,
  providerUsageRemaining,
  providerUsageRemainingPercent,
} from '../src/lib/providerUsage';

describe('provider usage presentation helpers', () => {
  it('does not invent a percentage for a zero limit', () => {
    expect(providerUsagePercent({ used: 5, limit: 0 })).toBeNull();
    expect(providerUsageRemainingPercent({ used: 5, limit: 0 })).toBeNull();
    expect(providerUsageBarPercent({ used: 5, limit: 0 })).toBe(0);
  });

  it('keeps the raw usage percentage unmuted for over-limit rows', () => {
    expect(providerUsagePercent({ used: 150, limit: 100 })).toBe(150);
  });

  it('expresses the visual bar in remaining semantics', () => {
    expect(providerUsageBarPercent({ used: 17, limit: 100 })).toBe(83);
    expect(providerUsageRemainingPercent({ used: 17, limit: 100 })).toBe(83);
    // Over-limit rows have nothing left: the bar reads 0, not 100.
    expect(providerUsageBarPercent({ used: 150, limit: 100 })).toBe(0);
  });

  it('computes the remaining quota as limit minus used', () => {
    expect(providerUsageRemaining({ used: 17, limit: 100 })).toBe(83);
    expect(providerUsageRemaining({ used: 0, limit: 1000 })).toBe(1000);
  });

  it('computes and clamps the remaining percentage', () => {
    expect(providerUsageRemainingPercent({ used: 17, limit: 100 })).toBe(83);
    expect(providerUsageRemainingPercent({ used: 40, limit: 1000 })).toBe(96);
    expect(providerUsageRemainingPercent({ used: 150, limit: 100 })).toBe(0);
    expect(providerUsageRemainingPercent({ used: 5, limit: 0 })).toBeNull();
  });

  it('reports a negative remaining for over-limit rows', () => {
    expect(providerUsageRemaining({ used: 150, limit: 100 })).toBe(-50);
    expect(providerUsageBarPercent({ used: 150, limit: 100 })).toBe(0);
  });

  it('does not invent a remaining value when used or limit is not finite', () => {
    expect(providerUsageRemaining({ used: Number.NaN, limit: 100 })).toBeNull();
    expect(providerUsageRemaining({ used: 10, limit: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('handles missing and invalid reset timestamps explicitly', () => {
    expect(formatProviderUsageReset(undefined, 'en-US')).toBeNull();
    expect(formatProviderUsageReset('not-a-date', 'en-US')).toBe('not-a-date');
    expect(formatProviderUsageReset('2030-01-01T00:00:00Z', 'en-US')).toContain('2030');
  });

  it('formats currency values from whole cents', () => {
    expect(formatProviderCurrency(500, 'USD', 'en-US')).toBe('$5.00');
  });

  it('keeps error and unsupported results visually distinct', () => {
    const error: ProviderUsageResult = {
      provider: 'api-key',
      kind: 'error',
      message: 'failed',
    };
    const unsupported: ProviderUsageResult = {
      provider: 'custom',
      kind: 'unsupported',
      message: 'unavailable',
    };
    expect(providerUsageBadgeVariant(error)).toBe('danger');
    expect(providerUsageBadgeVariant(unsupported)).toBe('neutral');
  });

  describe('metered estimated-cost formatting', () => {
    it('returns null for an unknown cost (never fabricates zero)', () => {
      expect(formatCnyEstimatedCost(null)).toBeNull();
    });

    it('renders tiny positive sub-cent amounts as <¥0.01, not a misleading 0.00', () => {
      expect(formatCnyEstimatedCost('0.000123')).toBe('<¥0.01');
      expect(formatCnyEstimatedCost('0.009')).toBe('<¥0.01');
    });

    it('renders whole-cent and larger amounts to two decimals', () => {
      expect(formatCnyEstimatedCost('0.01')).toBe('¥0.01');
      expect(formatCnyEstimatedCost('12.345')).toBe('¥12.35');
      expect(formatCnyEstimatedCost('0')).toBe('¥0.00');
    });

    it.each(['not-a-number', '', ' ', '-1', 'NaN', 'Infinity', '9'.repeat(400)])(
      'treats invalid estimated cost %s as unknown', (value) => {
        expect(formatCnyEstimatedCost(value)).toBeNull();
      },
    );
  });

  describe('metered balance formatting', () => {
    it('renders CNY and USD balances in their own currency without conversion', () => {
      expect(formatMeteredBalance('10.5', 'CNY', 'en-US')).toMatch(/10\.5/);
      expect(formatMeteredBalance('1.25', 'USD', 'en-US')).toMatch(/1\.25/);
      expect(formatMeteredBalance('1.25', 'USD', 'en-US')).not.toContain('CNY');
    });

    it('does not round a positive sub-cent balance down to zero', () => {
      expect(formatMeteredBalance('0.001', 'CNY', 'en-US')).toBe('<¥0.01');
      expect(formatMeteredBalance('0.000001', 'USD', 'en-US')).toBe('<$0.01');
      expect(formatMeteredBalance('0', 'CNY', 'en-US')).toBe('¥0.00');
    });

    it('preserves meaningful fractional precision in official balances', () => {
      expect(formatMeteredBalance('110.000001', 'CNY', 'en-US')).toBe('¥110.000001');
      expect(formatMeteredBalance('-0.001', 'CNY', 'en-US')).toBe('-¥0.001');
    });

    it('falls back to a currency-prefixed raw value on invalid input', () => {
      expect(formatMeteredBalance('nope', 'CNY', 'en-US')).toBe('CNY nope');
    });
  });

  it('formats token counts with locale grouping separators', () => {
    expect(formatTokenCount(1600, 'en-US')).toBe('1,600');
  });

  it('formats Beijing time and falls back to the raw string for invalid input', () => {
    expect(formatBeijingTime('2030-01-01T00:00:00Z', 'en-US')).toContain('2030');
    expect(formatBeijingTime('not-a-date', 'en-US')).toBe('not-a-date');
  });

  it('keeps all usage i18n key paths in sync across en and zh', () => {
    function paths(value: Record<string, unknown>, prefix = ''): string[] {
      return Object.entries(value).flatMap(([key, item]) => {
        const path = `${prefix}${key}`;
        return item !== null && typeof item === 'object'
          ? paths(item as Record<string, unknown>, `${path}.`)
          : [path];
      });
    }
    const usagePaths = (value: Record<string, unknown>) => paths(value)
      .filter((path) => /^(metered|usage|providerUsage|refreshUsage)/.test(path))
      .toSorted();
    expect(usagePaths(enSettings).length).toBeGreaterThan(24);
    expect(usagePaths(enSettings)).toEqual(usagePaths(zhSettings));
  });
});
