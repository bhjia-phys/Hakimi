import { createServer, type Server } from 'node:http';

import { afterEach, describe, it, expect, vi } from 'vitest';

import {
  fetchManagedUsage,
  fetchManagedUsageFromBase,
  formatDuration,
  isManagedKimiCode,
  isManagedKimiCodeBaseUrl,
  kimiCodeBaseUrl,
  kimiCodeUsageUrl,
  kimiCodeUsageUrlFromBase,
  OFFICIAL_KIMI_CODE_USAGE_URL,
  officialKimiCodeUsageUrl,
  parseManagedUsagePayload,
} from '../src/managed-usage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('kimiCodeBaseUrl', () => {
  it('strips trailing slashes from the KIMI_CODE_BASE_URL override', () => {
    // The env value must be normalized at the source: provision persists it
    // verbatim while the model refresh rewrites it normalized, and the
    // deep-equal diff between the two shapes would fire a spurious
    // providers-changed event mid-login.
    vi.stubEnv('KIMI_CODE_BASE_URL', 'https://gw.example.com/');
    expect(kimiCodeBaseUrl()).toBe('https://gw.example.com');
    expect(kimiCodeUsageUrl()).toBe('https://gw.example.com/usages');
  });
});

describe('isManagedKimiCodeBaseUrl', () => {
  it('matches the default managed endpoint, with or without a trailing slash', () => {
    expect(isManagedKimiCodeBaseUrl('https://api.kimi.com/coding/v1')).toBe(true);
    expect(isManagedKimiCodeBaseUrl('https://api.kimi.com/coding/v1/')).toBe(true);
  });

  it('matches against the KIMI_CODE_BASE_URL override', () => {
    vi.stubEnv('KIMI_CODE_BASE_URL', 'https://gw.example.com/coding/v1/');
    expect(isManagedKimiCodeBaseUrl('https://gw.example.com/coding/v1')).toBe(true);
    expect(isManagedKimiCodeBaseUrl('https://api.kimi.com/coding/v1')).toBe(false);
  });

  it('is case-insensitive on the origin but strict on the path', () => {
    expect(isManagedKimiCodeBaseUrl('https://API.KIMI.COM/coding/v1')).toBe(true);
    expect(isManagedKimiCodeBaseUrl('https://api.kimi.com/CODING/v1')).toBe(false);
  });

  it('rejects other paths on the managed host and other hosts entirely', () => {
    expect(isManagedKimiCodeBaseUrl('https://api.kimi.com/coding/v2')).toBe(false);
    expect(isManagedKimiCodeBaseUrl('https://api.kimi.com/v1')).toBe(false);
    expect(isManagedKimiCodeBaseUrl('https://gateway.example.com/coding/v1')).toBe(false);
    expect(isManagedKimiCodeBaseUrl('https://api.moonshot.cn/v1')).toBe(false);
  });

  it('rejects undefined and unparseable values', () => {
    expect(isManagedKimiCodeBaseUrl(undefined)).toBe(false);
    expect(isManagedKimiCodeBaseUrl('')).toBe(false);
    expect(isManagedKimiCodeBaseUrl('not a url')).toBe(false);
  });
});

describe('officialKimiCodeUsageUrl', () => {
  it('resolves the Anthropic protocol root to the v1 usages endpoint', () => {
    expect(officialKimiCodeUsageUrl('https://api.kimi.com/coding')).toBe(
      'https://api.kimi.com/coding/v1/usages',
    );
    expect(officialKimiCodeUsageUrl('https://api.kimi.com/coding/')).toBe(
      'https://api.kimi.com/coding/v1/usages',
    );
  });

  it('resolves the v1 base, with or without a trailing slash', () => {
    expect(officialKimiCodeUsageUrl('https://api.kimi.com/coding/v1')).toBe(
      'https://api.kimi.com/coding/v1/usages',
    );
    expect(officialKimiCodeUsageUrl('https://api.kimi.com/coding/v1/')).toBe(
      'https://api.kimi.com/coding/v1/usages',
    );
  });

  it('is case-insensitive on the origin but strict on the path', () => {
    expect(officialKimiCodeUsageUrl('https://API.KIMI.COM/coding/v1')).toBe(
      'https://api.kimi.com/coding/v1/usages',
    );
    expect(officialKimiCodeUsageUrl('https://api.kimi.com/CODING/v1')).toBeUndefined();
  });

  it('rejects other hosts, paths, and unparseable values', () => {
    expect(officialKimiCodeUsageUrl('https://api.kimi.com/coding/v2')).toBeUndefined();
    expect(officialKimiCodeUsageUrl('https://api.kimi.com/v1')).toBeUndefined();
    expect(officialKimiCodeUsageUrl('https://api.moonshot.cn/v1')).toBeUndefined();
    expect(officialKimiCodeUsageUrl('https://gateway.example.com/coding/v1')).toBeUndefined();
  });

  it('rejects undefined and unparseable values', () => {
    expect(officialKimiCodeUsageUrl(undefined)).toBeUndefined();
    expect(officialKimiCodeUsageUrl('')).toBeUndefined();
    expect(officialKimiCodeUsageUrl('not a url')).toBeUndefined();
  });
});

describe('isManagedKimiCode', () => {
  it('matches only the kimi-code managed provider', () => {
    expect(isManagedKimiCode('managed:kimi-code')).toBe(true);
    expect(isManagedKimiCode('managed:moonshot-ai')).toBe(false);
    expect(isManagedKimiCode('openai')).toBe(false);
    expect(isManagedKimiCode('')).toBe(false);
    expect(isManagedKimiCode(null)).toBe(false);
    expect(isManagedKimiCode()).toBe(false);
  });
});

describe('parseManagedUsagePayload', () => {
  it('returns empty when payload is not an object', () => {
    expect(parseManagedUsagePayload(null)).toEqual({ summary: null, limits: [], extraUsage: null });
    expect(parseManagedUsagePayload('nope')).toEqual({ summary: null, limits: [], extraUsage: null });
  });

  it('parses the numeric strings the platform reports', () => {
    const parsed = parseManagedUsagePayload({
      usage: { used: '17', limit: '100', resetTime: '2030-01-01T00:00:00.000Z' },
    });
    expect(parsed.summary).toEqual({
      used: 17,
      limit: 100,
      resetAt: '2030-01-01T00:00:00.000Z',
      window: { duration: 1, unit: 'week' },
    });
  });

  it('extracts a summary from the `usage` object and passes its name through', () => {
    const parsed = parseManagedUsagePayload({
      usage: { used: 40, limit: 1000, name: 'Weekly limit' },
    });
    expect(parsed.summary).toEqual({
      name: 'Weekly limit',
      window: { duration: 1, unit: 'week' },
      used: 40,
      limit: 1000,
    });
    expect(parsed.limits).toEqual([]);
  });

  it('treats an unnamed summary as the weekly limit', () => {
    const parsed = parseManagedUsagePayload({ usage: { used: 1, limit: 10 } });
    expect(parsed.summary).toEqual({
      used: 1,
      limit: 10,
      window: { duration: 1, unit: 'week' },
    });
  });

  it('defaults used to 0 when absent', () => {
    const parsed = parseManagedUsagePayload({ usage: { limit: 1000 } });
    expect(parsed.summary).toMatchObject({ used: 0, limit: 1000 });
  });

  it('normalizes window duration and timeUnit from the window record', () => {
    const parsed = parseManagedUsagePayload({
      limits: [
        { detail: { used: 1, limit: 100 }, window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' } },
        { detail: { used: 2, limit: 50 }, window: { duration: 24, timeUnit: 'TIME_UNIT_HOUR' } },
        { detail: { used: 3, limit: 60 }, window: { duration: 7, timeUnit: 'TIME_UNIT_DAY' } },
        { detail: { used: 4, limit: 30 }, window: { duration: 90, timeUnit: 'TIME_UNIT_MINUTE' } },
      ],
    });
    expect(parsed.limits.map((l) => l.window)).toEqual([
      // Whole-hour minute windows fold to hours (300 MINUTE = the 5h limit).
      { duration: 5, unit: 'hour' },
      { duration: 24, unit: 'hour' },
      { duration: 7, unit: 'day' },
      // Non-hour-aligned minute windows stay in minutes.
      { duration: 90, unit: 'minute' },
    ]);
  });

  it('passes through `name` from the item or detail', () => {
    const parsed = parseManagedUsagePayload({
      limits: [
        { name: 'Daily cap', detail: { used: 5, limit: 100 } },
        { detail: { used: 1, limit: 10, name: 'Detail named' } },
      ],
    });
    expect(parsed.limits.map((l) => l.name)).toEqual(['Daily cap', 'Detail named']);
  });

  it('skips limit rows without a detail record', () => {
    const parsed = parseManagedUsagePayload({
      limits: [{ used: 2, limit: 20 }],
    });
    expect(parsed.limits).toEqual([]);
  });

  it('passes the detail resetTime through as resetAt', () => {
    const at = '2030-01-01T00:00:00.000Z';
    const parsed = parseManagedUsagePayload({
      limits: [{ detail: { used: 1, limit: 10, resetTime: at } }],
    });
    expect(parsed.limits[0]?.resetAt).toBe(at);
  });

  it('extracts extra usage from boosterWallet.balance', () => {
    const parsed = parseManagedUsagePayload({
      usage: { used: 40, limit: 1000, name: 'Weekly limit' },
      boosterWallet: {
        id: 'wallet_1',
        balance: {
          type: 'BOOSTER',
          amount: '20000000000',
          amountLeft: '10000000000',
          unit: 'UNIT_CURRENCY',
        },
        monthlyChargeLimitEnabled: true,
        monthlyChargeLimit: { currency: 'USD', priceInCents: '20000' },
        monthlyUsed: { currency: 'USD', priceInCents: '5000' },
      },
    });
    expect(parsed.extraUsage).toEqual({
      balanceCents: 10000,
      totalCents: 20000,
      monthlyChargeLimitEnabled: true,
      monthlyChargeLimitCents: 20000,
      monthlyUsedCents: 5000,
      currency: 'USD',
    });
  });

  it('treats missing amountLeft as zero balance', () => {
    const parsed = parseManagedUsagePayload({
      usage: { used: 1, limit: 10 },
      boosterWallet: { balance: { type: 'BOOSTER', amount: '20000000000' } },
    });
    expect(parsed.extraUsage).toMatchObject({ totalCents: 20000, balanceCents: 0 });
  });

  it('defaults monthly limit fields when absent', () => {
    const parsed = parseManagedUsagePayload({
      usage: { used: 1, limit: 10 },
      boosterWallet: {
        balance: { type: 'BOOSTER', amount: '20000000000', amountLeft: '20000000000' },
      },
    });
    expect(parsed.extraUsage).toEqual({
      balanceCents: 20000,
      totalCents: 20000,
      monthlyChargeLimitEnabled: false,
      monthlyChargeLimitCents: 0,
      monthlyUsedCents: 0,
      currency: 'USD',
    });
  });

  it('returns null extra usage when boosterWallet is missing or invalid', () => {
    expect(parseManagedUsagePayload({ usage: { used: 1, limit: 10 } }).extraUsage).toBeNull();
    expect(
      parseManagedUsagePayload({
        usage: { used: 1, limit: 10 },
        boosterWallet: { balance: { type: 'OTHER', amount: '100', amountLeft: '50' } },
      }).extraUsage,
    ).toBeNull();
    expect(
      parseManagedUsagePayload({
        usage: { used: 1, limit: 10 },
        boosterWallet: { balance: { type: 'BOOSTER', amount: '0', amountLeft: '0' } },
      }).extraUsage,
    ).toBeNull();
  });
});

describe('fetchManagedUsage', () => {
  it('sends only Authorization and Accept headers to the pinned official URL', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ usage: { used: 1, limit: 10 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchManagedUsage('access-token')).resolves.toEqual({
      kind: 'ok',
      parsed: {
        summary: { used: 1, limit: 10, window: { duration: 1, unit: 'week' } },
        limits: [],
        extraUsage: null,
      },
    });

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    const init = calls[0]?.[1] ?? {};
    const headers = new Headers((init.headers ?? {}) as Record<string, string>);
    expect(calls[0]?.[0]).toBe(OFFICIAL_KIMI_CODE_USAGE_URL);
    expect(init.redirect).toBe('error');
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('user-agent')).toBeNull();
    expect(headers.get('x-msh-platform')).toBeNull();
  });

  it('never accepts a caller-supplied destination: the pinned URL is the only outbound', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchManagedUsage('access-token');

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(OFFICIAL_KIMI_CODE_USAGE_URL);
  });

  it('surfaces JSON API error messages with status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'usage quota unavailable' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const result = await fetchManagedUsage('access-token');

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.status).toBe(401);
    expect(result.message).toBe('usage quota unavailable');
  });

  it('surfaces nested JSON API error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'usage endpoint moved' } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const result = await fetchManagedUsage('access-token');

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.status).toBe(404);
    expect(result.message).toBe('usage endpoint moved');
  });

  it('falls back to local usage hints when the API error body is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const result = await fetchManagedUsage('access-token');

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.status).toBe(404);
    expect(result.message).toBe('Usage endpoint not available. Try Kimi For Coding.');
  });

  it('redacts the credential from HTTP error bodies that echo it back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'invalid key sk-super-secret-token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const result = await fetchManagedUsage('sk-super-secret-token');

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toBe('invalid key [redacted]');
    expect(result.message).not.toContain('sk-super-secret-token');
  });

  it('redacts the credential from network failure messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed for sk-net-token');
      }),
    );

    const result = await fetchManagedUsage('sk-net-token');

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toBe('Failed to fetch usage: fetch failed for [redacted]');
    expect(result.message).not.toContain('sk-net-token');
  });

  it('aborts the request when the caller signal is already aborted', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const aborted = new AbortController();
    aborted.abort();

    const result = await fetchManagedUsage('access-token', {
      signal: aborted.signal,
    });

    expect(result).toEqual({ kind: 'error', message: 'Usage query cancelled.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signals the internal controller when the caller aborts mid-flight', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: unknown, init: RequestInit | undefined) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );

    const pending = fetchManagedUsage('access-token', {
      signal: controller.signal,
    });
    controller.abort();
    const result = await pending;

    expect(result).toEqual({ kind: 'error', message: 'Usage query cancelled.' });
  });
});

describe('kimiCodeUsageUrlFromBase', () => {
  it('derives /usages from a custom managed provider base, tolerating a trailing slash', () => {
    expect(kimiCodeUsageUrlFromBase('https://gw.example.com/coding/v1')).toBe(
      'https://gw.example.com/coding/v1/usages',
    );
    expect(kimiCodeUsageUrlFromBase('https://gw.example.com/coding/v1/')).toBe(
      'https://gw.example.com/coding/v1/usages',
    );
    expect(kimiCodeUsageUrlFromBase('https://gw.example.com')).toBe(
      'https://gw.example.com/usages',
    );
    expect(kimiCodeUsageUrlFromBase('http://127.0.0.1:58627')).toBe(
      'http://127.0.0.1:58627/usages',
    );
  });

  it('rejects userinfo, query, hash, non-http(s) schemes, and unparseable values', () => {
    expect(kimiCodeUsageUrlFromBase('https://user:pass@host/coding/v1')).toBeUndefined();
    expect(kimiCodeUsageUrlFromBase('https://host/coding/v1?token=abc')).toBeUndefined();
    expect(kimiCodeUsageUrlFromBase('https://host/coding/v1#frag')).toBeUndefined();
    expect(kimiCodeUsageUrlFromBase('ftp://host/coding/v1')).toBeUndefined();
    expect(kimiCodeUsageUrlFromBase('not a url')).toBeUndefined();
    expect(kimiCodeUsageUrlFromBase(undefined)).toBeUndefined();
  });
});

describe('fetchManagedUsageFromBase', () => {
  it('contacts the derived /usages URL of a custom managed provider base with redirect refusal', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ usage: { used: 1, limit: 10 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchManagedUsageFromBase(
      'https://gw.example.com/coding/v1',
      'access-token',
    );

    expect(result.kind).toBe('ok');
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    const init = calls[0]?.[1] ?? {};
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('https://gw.example.com/coding/v1/usages');
    expect(init.redirect).toBe('error');
  });

  it('issues no request for an invalid provider base', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    for (const base of [
      'https://user:pass@host/coding/v1',
      'https://host/coding/v1?token=abc',
      'https://host/coding/v1#frag',
      'ftp://host/coding/v1',
      'not a url',
    ]) {
      const result = await fetchManagedUsageFromBase(base, 'access-token');
      expect(result).toEqual({
        kind: 'error',
        message: 'Failed to fetch usage: invalid provider base URL.',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts the credential from a custom-base usage server that echoes it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'rejected custom-base-token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const result = await fetchManagedUsageFromBase('https://gw.example.com', 'custom-base-token');

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.status).toBe(401);
    expect(result.message).toBe('rejected [redacted]');
    expect(result.message).not.toContain('custom-base-token');
  });

  it('does not follow a 30x redirect from a custom managed provider host', async () => {
    let usageHits = 0;
    let targetHits = 0;
    const server: Server = createServer((req, res) => {
      if (req.url === '/usages') {
        usageHits += 1;
        res.writeHead(302, { Location: '/target' });
        res.end();
        return;
      }
      if (req.url === '/target') {
        targetHits += 1;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('no port');

      const result = await fetchManagedUsageFromBase(
        `http://127.0.0.1:${address.port}`,
        'redirect-token',
      );

      expect(result.kind).toBe('error');
      if (result.kind === 'ok') throw new Error('expected error');
      expect(result.message).not.toContain('redirect-token');
      expect(usageHits).toBe(1);
      // The redirect target must never receive a request carrying the token.
      expect(targetHits).toBe(0);
    } finally {
      server.close();
    }
  });
});

describe('formatDuration', () => {
  it('formats days/hours/minutes', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3661)).toBe('1h 1m');
    expect(formatDuration(86_400 + 7200 + 600)).toBe('1d 2h 10m');
  });
});
