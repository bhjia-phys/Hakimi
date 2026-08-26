import { describe, expect, it } from 'vitest';

import type { ProviderUsageResult } from '../src/api/types';
import {
  formatProviderCurrency,
  formatProviderUsageReset,
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
});
