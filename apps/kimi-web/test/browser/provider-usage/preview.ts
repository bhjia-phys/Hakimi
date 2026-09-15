import { createApp, h } from 'vue';

import ProviderUsagePanel from '../../../src/components/settings/ProviderUsagePanel.vue';
import { i18n, setLocale } from '../../../src/i18n';
import type {
  ProviderMeteredPeriod,
  ProviderMeteredUsage,
  ProviderUsageResult,
} from '../../../src/api/types';
import '../../../src/style.css';
import { providerUsage } from './stubKimiWebClient';

function period(overrides: Partial<ProviderMeteredPeriod> = {}): ProviderMeteredPeriod {
  return {
    startAt: '2030-01-01T00:00:00.000Z',
    endAt: '2030-01-01T23:59:59.999Z',
    requestCount: 3,
    measuredRequestCount: 3,
    pendingRequestCount: 0,
    missingUsageRequestCount: 0,
    unpricedRequestCount: 0,
    inputTokens: 1200,
    outputTokens: 800,
    cacheReadTokens: 300,
    totalTokens: 2000,
    estimatedCost: '0.0234',
    isPartial: false,
    ...overrides,
  };
}

function metered(overrides: Partial<ProviderMeteredUsage> = {}): ProviderMeteredUsage {
  return {
    source: 'local',
    costSource: 'estimated',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    trackingStartedAt: '2030-01-01T00:00:00.000Z',
    degraded: false,
    today: period(),
    month: period({
      startAt: '2030-01-01T00:00:00.000Z',
      endAt: '2030-01-31T23:59:59.999Z',
      requestCount: 12,
      measuredRequestCount: 12,
      inputTokens: 8000,
      outputTokens: 5000,
      cacheReadTokens: 2000,
      totalTokens: 13000,
      estimatedCost: '1.2345',
    }),
    balance: {
      kind: 'ok',
      isAvailable: true,
      balances: [
        { currency: 'CNY', total: '88.50', granted: '10.00', toppedUp: '78.50' },
        { currency: 'USD', total: '2.50', granted: '0.00', toppedUp: '2.50' },
      ],
    },
    ...overrides,
  };
}

function ok(m: ProviderMeteredUsage | null, provider = 'deepseek'): ProviderUsageResult[] {
  return [
    {
      provider,
      kind: 'ok',
      summary: null,
      limits: [],
      extraUsage: null,
      meteredUsage: m ?? undefined,
    },
  ];
}

const fixtures: Record<string, () => ProviderUsageResult[]> = {
  normal: () => ok(metered()),
  'no-data': () => {
    const empty = period({
      requestCount: 0, measuredRequestCount: 0, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, totalTokens: 0, estimatedCost: null, isPartial: true,
    });
    return ok(metered({
      trackingStartedAt: null,
      today: empty,
      month: { ...empty, endAt: '2030-02-01T00:00:00.000Z' },
    }));
  },
  'unknown-tracking': () => {
    const report = metered({ trackingStartedAt: null, degraded: true });
    return ok({ ...report, today: { ...report.today, isPartial: true }, month: { ...report.month, isPartial: true } });
  },
  'balance-error': () => ok(metered({ balance: { kind: 'error', message: 'Balance endpoint unavailable.', status: 503 } })),
  'balance-unavailable': () => ok(metered({ balance: {
    kind: 'ok', isAvailable: false,
    balances: [{ currency: 'CNY', total: '0', granted: '0', toppedUp: '0' }],
  } })),
  'balance-empty': () => ok(metered({ balance: { kind: 'ok', isAvailable: true, balances: [] } })),
  'tiny-balance': () => ok(metered({ balance: {
    kind: 'ok', isAvailable: true,
    balances: [{ currency: 'CNY', total: '0.001', granted: '0', toppedUp: '0.001' }],
  } })),
  partial: () => ok(metered({
    today: period({ isPartial: true, pendingRequestCount: 2, missingUsageRequestCount: 1, unpricedRequestCount: 1 }),
  })),
  degraded: () => ok(metered({ degraded: true })),
  tiny: () => ok(metered({ today: period({ estimatedCost: '0.000123' }) })),
  unknown: () => ok(metered({ today: period({ estimatedCost: null }), month: period({ estimatedCost: null }) })),
  empty: () => [],
};

setLocale('en');

createApp({
  setup: () => () => h('main', { style: 'display:flex;justify-content:center;align-items:flex-start;padding:24px;min-height:100dvh;' }, [
    h('div', { style: 'width:100%;max-width:640px;' }, [h(ProviderUsagePanel)]),
  ]),
}).use(i18n).mount('#app');

Object.assign(window, {
  providerUsageHarness: {
    theme: (value: string) => { document.documentElement.dataset.colorScheme = value; },
    locale: setLocale,
    state: (name: string) => { providerUsage.value = fixtures[name](); },
  },
});
