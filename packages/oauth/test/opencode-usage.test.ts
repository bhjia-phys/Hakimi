/**
 * Scenario: OpenCode Go subscription-quota usage fetch / parse.
 * Responsibilities: Verify the strict base-URL resolver, the rolling/weekly/
 * monthly percent parser, and the Bearer fetch boundary (headers, status
 * hints, credential redaction, cancellation) without real network.
 * Wiring: Injected fetch responses model the external boundary.
 * Run: pnpm exec vitest run packages/oauth/test/opencode-usage.test.ts
 */

import { createServer, type Server } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchOpenCodeGoUsage,
  opencodeGoUsageUrl,
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_USAGE_URL,
  parseOpenCodeGoUsagePayload,
} from '../src';
import { fetchBearerUsageJson } from '../src/usage-fetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('opencodeGoUsageUrl', () => {
  it('resolves the normalized exact base to the fixed usage URL', () => {
    expect(opencodeGoUsageUrl('https://opencode.ai/zen/go/v1')).toBe(OPENCODE_GO_USAGE_URL);
    expect(opencodeGoUsageUrl('https://opencode.ai/zen/go/v1/')).toBe(OPENCODE_GO_USAGE_URL);
    expect(opencodeGoUsageUrl(OPENCODE_GO_BASE_URL)).toBe(OPENCODE_GO_USAGE_URL);
  });

  it('is case-insensitive on the origin but strict on the path', () => {
    expect(opencodeGoUsageUrl('https://OPENCODE.AI/zen/go/v1')).toBe(OPENCODE_GO_USAGE_URL);
    expect(opencodeGoUsageUrl('https://opencode.ai/ZEN/GO/V1')).toBeUndefined();
  });

  it('rejects other hosts, paths, and unparseable values', () => {
    expect(opencodeGoUsageUrl('https://opencode.ai/zen/go/v1/usage')).toBeUndefined();
    expect(opencodeGoUsageUrl('https://opencode.ai/zen/go/v2')).toBeUndefined();
    expect(opencodeGoUsageUrl('https://opencode.ai/v1')).toBeUndefined();
    expect(opencodeGoUsageUrl('https://proxy.example.com/zen/go/v1')).toBeUndefined();
    expect(opencodeGoUsageUrl('not a url')).toBeUndefined();
    expect(opencodeGoUsageUrl(undefined)).toBeUndefined();
    expect(opencodeGoUsageUrl('')).toBeUndefined();
  });
});

describe('parseOpenCodeGoUsagePayload', () => {
  it('normalizes rolling / weekly / monthly windows into percent rows', () => {
    const parsed = parseOpenCodeGoUsagePayload({
      usage: {
        rolling: { status: 'active', percent: 17, resetsAt: '2026-09-01T00:00:00Z' },
        weekly: { status: 'active', percent: 42, resetsAt: '2026-08-30T00:00:00Z' },
        monthly: { status: 'active', percent: 5.6, resetsAt: '2026-08-31T00:00:00Z' },
      },
    });
    expect(parsed.summary).toEqual({
      name: 'Rolling',
      used: 17,
      limit: 100,
      resetAt: '2026-09-01T00:00:00Z',
    });
    expect(parsed.limits).toEqual([
      { name: 'Weekly', used: 42, limit: 100, resetAt: '2026-08-30T00:00:00Z' },
      { name: 'Monthly', used: 6, limit: 100, resetAt: '2026-08-31T00:00:00Z' },
    ]);
    expect(parsed.extraUsage).toBeNull();
  });

  it('clamps over-limit percents to 100', () => {
    const parsed = parseOpenCodeGoUsagePayload({
      usage: { rolling: { percent: 133.7 } },
    });
    expect(parsed.summary).toEqual({ name: 'Rolling', used: 100, limit: 100 });
  });

  it('skips rows without a numeric percent and ignores invalid resetsAt', () => {
    const parsed = parseOpenCodeGoUsagePayload({
      usage: {
        rolling: { percent: 'n/a' },
        weekly: { percent: 10, resetsAt: 'not-a-date' },
      },
    });
    expect(parsed.summary).toBeNull();
    expect(parsed.limits).toEqual([{ name: 'Weekly', used: 10, limit: 100 }]);
  });

  it('returns empty when payload or usage is not an object', () => {
    expect(parseOpenCodeGoUsagePayload(null)).toEqual({ summary: null, limits: [], extraUsage: null });
    expect(parseOpenCodeGoUsagePayload('nope')).toEqual({ summary: null, limits: [], extraUsage: null });
    expect(parseOpenCodeGoUsagePayload({})).toEqual({ summary: null, limits: [], extraUsage: null });
  });
});

describe('fetchOpenCodeGoUsage', () => {
  it('sends only Authorization and Accept headers to the pinned URL', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ usage: { rolling: { percent: 17, resetsAt: '2026-09-01T00:00:00Z' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchOpenCodeGoUsage('oc-go-api-key');

    expect(result.kind).toBe('ok');
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    const init = calls[0]?.[1] ?? {};
    const headers = new Headers((init.headers ?? {}) as Record<string, string>);
    expect(calls[0]?.[0]).toBe(OPENCODE_GO_USAGE_URL);
    expect(init.redirect).toBe('error');
    expect(headers.get('authorization')).toBe('Bearer oc-go-api-key');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('user-agent')).toBeNull();
  });

  it('never accepts a caller-supplied destination: the pinned URL is the only outbound', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchOpenCodeGoUsage('oc-go-api-key');

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(OPENCODE_GO_USAGE_URL);
  });

  it('surfaces HTTP 401 with a provider-specific hint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));

    const result = await fetchOpenCodeGoUsage('oc-go-401-key');

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.status).toBe(401);
    expect(result.message).toBe('Authorization failed. Please check your OpenCode Go API key.');
    expect(result.message).not.toContain('oc-go-401-key');
  });

  it('redacts the API key from HTTP error bodies that echo it back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'rejected oc-go-api-key' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const result = await fetchOpenCodeGoUsage('oc-go-api-key');

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.status).toBe(403);
    expect(result.message).toBe('rejected [redacted]');
    expect(result.message).not.toContain('oc-go-api-key');
  });

  it('redacts the API key from network failure messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed for oc-go-api-key');
      }),
    );

    const result = await fetchOpenCodeGoUsage('oc-go-api-key');

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toBe('Failed to fetch usage: fetch failed for [redacted]');
  });

  it('does not issue a request when the caller signal is already aborted', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const aborted = new AbortController();
    aborted.abort();

    const result = await fetchOpenCodeGoUsage('oc-go-api-key', {
      signal: aborted.signal,
    });

    expect(result).toEqual({ kind: 'error', message: 'Usage query cancelled.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('usage-fetch redirect refusal', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function startRedirectServer(): Promise<{ base: string; targetHits: () => number }> {
    let targetHits = 0;
    server = createServer((req, res) => {
      if (req.url === '/start') {
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
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server?.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return { base: `http://127.0.0.1:${address.port}`, targetHits: () => targetHits };
  }

  it('does not follow a 30x redirect with the credential', async () => {
    const { base, targetHits } = await startRedirectServer();

    const result = await fetchBearerUsageJson(
      `${base}/start`,
      'redirect-token',
      {},
      {
        unauthorized: 'unauthorized',
        notFound: 'not found',
        statusPrefix: 'Failed to fetch usage',
      },
    );

    expect(result.kind).toBe('error');
    if (result.kind === 'ok') throw new Error('expected error');
    expect(result.message).not.toContain('redirect-token');
    // The redirect target must never receive a request carrying the token.
    expect(targetHits()).toBe(0);
  });
});