/**
 * Official DeepSeek balance parsing and credential-safe fetch boundary.
 * All requests are mocked; money remains a decimal string, not quota percent.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEEPSEEK_BALANCE_URL,
  fetchDeepSeekBalance,
  officialDeepSeekBalanceUrl,
  parseDeepSeekBalancePayload,
} from '../src';

const payload = {
  is_available: true,
  balance_infos: [{
    currency: 'CNY',
    total_balance: '110.000001',
    granted_balance: '10.000001',
    topped_up_balance: '100.00',
  }],
};

afterEach(() => vi.unstubAllGlobals());

describe('officialDeepSeekBalanceUrl', () => {
  it.each([
    'https://api.deepseek.com',
    'https://api.deepseek.com/',
    'https://api.deepseek.com/v1',
    'https://API.DEEPSEEK.COM/v1/',
    'https://api.deepseek.com/anthropic/',
    'https://api.deepseek.com:443/v1',
  ])('recognizes the official base %s', (base) => {
    expect(officialDeepSeekBalanceUrl(base)).toBe(DEEPSEEK_BALANCE_URL);
  });

  it.each([
    undefined, '', 'not a URL',
    'http://api.deepseek.com/v1',
    'https://api.deepseek.com.example.test/v1',
    'https://proxy.example.test/v1',
    'https://api.deepseek.com:8443/v1',
    'https://api.deepseek.com/V1',
    'https://api.deepseek.com/other',
    'https://api.deepseek.com/user/balance',
    'https://api.deepseek.com/v1?key=example',
    'https://api.deepseek.com/v1#example',
    'https://user:password@api.deepseek.com/v1',
  ])('does not trust a different endpoint %s', (base) => {
    expect(officialDeepSeekBalanceUrl(base)).toBeUndefined();
  });
});

describe('parseDeepSeekBalancePayload', () => {
  it('preserves precision and currency without inventing quota windows', () => {
    expect(parseDeepSeekBalancePayload(payload)).toEqual({
      kind: 'ok',
      isAvailable: true,
      balances: [{ currency: 'CNY', total: '110.000001', granted: '10.000001', toppedUp: '100.00' }],
    });
  });

  it('preserves an unavailable account and a second currency independently', () => {
    expect(parseDeepSeekBalancePayload({
      is_available: false,
      balance_infos: [
        { currency: 'CNY', total_balance: '-0.01', granted_balance: '0', topped_up_balance: '-0.01' },
        { currency: 'USD', total_balance: '1.50', granted_balance: '0.50', topped_up_balance: '1.00' },
      ],
    })).toEqual({
      kind: 'ok', isAvailable: false,
      balances: [
        { currency: 'CNY', total: '-0.01', granted: '0', toppedUp: '-0.01' },
        { currency: 'USD', total: '1.50', granted: '0.50', toppedUp: '1.00' },
      ],
    });
  });

  it.each([null, {}, [], { is_available: true }, { is_available: 'true', balance_infos: [] },
    { is_available: true, balance_infos: [] },
    { ...payload, balance_infos: [payload.balance_infos[0], payload.balance_infos[0]] },
  ])('rejects incomplete payloads instead of reporting a zero balance', (value) => {
    expect(parseDeepSeekBalancePayload(value).kind).toBe('error');
  });

  describe.each(['total_balance', 'granted_balance', 'topped_up_balance'])('%s validation', (field) => {
    it.each(['NaN', 'Infinity', '1e6', '', ' 1 ', '0x10', '1.2.3', '9'.repeat(400), 12, null])(
      'rejects invalid decimal money %s', (value) => {
        expect(parseDeepSeekBalancePayload({
          ...payload,
          balance_infos: [{ ...payload.balance_infos[0], [field]: value }],
        }).kind).toBe('error');
      },
    );
  });

  it('rejects unknown currency and never includes malformed remote content', () => {
    const result = parseDeepSeekBalancePayload({
      ...payload,
      balance_infos: [{ ...payload.balance_infos[0], currency: 'SECRET_REMOTE_CONTENT' }],
    });
    expect(result.kind).toBe('error');
    expect(JSON.stringify(result)).not.toContain('SECRET_REMOTE_CONTENT');
  });
});

describe('fetchDeepSeekBalance', () => {
  it('uses the fixed official endpoint and refuses redirects', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload)));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchDeepSeekBalance('test-deepseek-key')).kind).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DEEPSEEK_BALANCE_URL);
    expect(init.redirect).toBe('error');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-deepseek-key');
    expect(headers.get('Accept')).toBe('application/json');
    expect([...headers.keys()].toSorted()).toEqual(['accept', 'authorization']);
  });

  it.each([401, 403, 404, 429, 500])('scrubs credentials from HTTP %i errors', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'echoed test-deepseek-key' } }), { status },
    )));
    const result = await fetchDeepSeekBalance('test-deepseek-key');
    expect(result.kind).toBe('error');
    expect(result).toMatchObject({ status });
    expect(JSON.stringify(result)).not.toContain('test-deepseek-key');
  });

  it('scrubs network errors and handles non-JSON responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('test-deepseek-key network error'); }));
    expect(JSON.stringify(await fetchDeepSeekBalance('test-deepseek-key'))).not.toContain('test-deepseek-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>not JSON</html>')));
    expect((await fetchDeepSeekBalance('test-deepseek-key')).kind).toBe('error');
  });

  it('does not start an already-cancelled request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    expect(await fetchDeepSeekBalance('test-deepseek-key', { signal: controller.signal })).toEqual({
      kind: 'error', message: 'Usage query cancelled.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an HTTP 200 payload without balance data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    expect(await fetchDeepSeekBalance('test-deepseek-key')).toEqual({
      kind: 'error', message: 'DeepSeek returned an invalid account balance response.',
    });
  });

  it('propagates cancellation while a request is in flight', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const controller = new AbortController();
    const request = fetchDeepSeekBalance('test-deepseek-key', { signal: controller.signal });
    controller.abort();
    expect(await request).toEqual({ kind: 'error', message: 'Usage query cancelled.' });
  });

  it('bounds slow requests by the supplied timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    expect(await fetchDeepSeekBalance('test-deepseek-key', { timeoutMs: 5 })).toEqual({
      kind: 'error', message: 'Failed to query DeepSeek balance: request timed out.',
    });
  });
});
