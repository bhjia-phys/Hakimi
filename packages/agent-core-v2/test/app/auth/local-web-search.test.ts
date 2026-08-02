/**
 * `auth` domain tests — `LocalWebSearchProvider` endpoint fallback and HTML
 * parsing, driven through the `WebSearchProvider` contract with an injected
 * `fetchImpl` (a real `fetch` is never used, so no network is touched).
 * Responsibilities asserted: DuckDuckGo / Bing result parsing and URL
 * normalization, per-endpoint failure fallback, aggregate error reporting,
 * and AbortSignal handling (no fetch after abort, no endpoint retry after
 * abort).
 * Run: pnpm exec vitest run packages/agent-core-v2/test/app/auth/local-web-search.test.ts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalWebSearchProvider } from '#/app/auth/webSearch/providers/local-web-search';

const DDG_HTML = `<!DOCTYPE html><html><body>
<div class="result"><h2 class="result__title"><a class="result__a" href="https://example.com/one">First Result</a></h2><a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fone">Snippet one.</a></div>
<div class="result"><h2 class="result__title"><a class="result__a" href="https://example.com/two">Second Result</a></h2><a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ftwo">Snippet two.</a></div>
</body></html>`;

const BING_HTML = `<!DOCTYPE html><html><body><ol>
<li class="b_algo"><h2><a href="https://example.com/b1">Bing One</a></h2><div class="b_caption"><p>Bing snippet one.</p></div></li>
<li class="b_algo"><h2><a href="https://example.com/b2">Bing Two</a></h2><div class="b_caption"><p>Bing snippet two.</p></div></li>
</ol></body></html>`;

function htmlResponse(html: string): Response {
  return { status: 200, text: async () => html } as unknown as Response;
}

function errorResponse(status: number, detail = ''): Response {
  return { status, text: async () => detail } as unknown as Response;
}

describe('LocalWebSearchProvider (no-auth fallback)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns normalized results from a DuckDuckGo HTML fixture', async () => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(DDG_HTML));
    const provider = new LocalWebSearchProvider({ fetchImpl: fetchMock });

    const results = await provider.search('hello');

    expect(results).toEqual([
      { title: 'First Result', url: 'https://example.com/one', snippet: 'Snippet one.' },
      { title: 'Second Result', url: 'https://example.com/two', snippet: 'Snippet two.' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe('https://html.duckduckgo.com/html/?q=hello&kl=us-en');
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('Mozilla/5.0');
  });

  it('parses a Bing result page and adds the locale query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(BING_HTML));
    const provider = new LocalWebSearchProvider({
      searchUrls: ['https://www.bing.com/search'],
      fetchImpl: fetchMock,
    });

    const results = await provider.search('hello');

    expect(results).toEqual([
      { title: 'Bing One', url: 'https://example.com/b1', snippet: 'Bing snippet one.' },
      { title: 'Bing Two', url: 'https://example.com/b2', snippet: 'Bing snippet two.' },
    ]);
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(String(url)).toBe('https://www.bing.com/search?q=hello&mkt=en-US&setlang=en');
  });

  it('tries the next endpoint when the first returns an HTTP error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500, 'boom'))
      .mockResolvedValueOnce(htmlResponse(DDG_HTML));
    const provider = new LocalWebSearchProvider({ fetchImpl: fetchMock });

    const results = await provider.search('hello');

    expect(results).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl] = fetchMock.mock.calls[0] as [URL];
    expect(String(firstUrl)).toBe('https://html.duckduckgo.com/html/?q=hello&kl=us-en');
    const [secondUrl] = fetchMock.mock.calls[1] as [URL];
    expect(String(secondUrl)).toBe('https://www.bing.com/search?q=hello&mkt=en-US&setlang=en');
  });

  it('tries the next endpoint when the first page has no parseable results', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse('<html><body>no results here</body></html>'))
      .mockResolvedValueOnce(htmlResponse(BING_HTML));
    const provider = new LocalWebSearchProvider({ fetchImpl: fetchMock });

    const results = await provider.search('hello');

    expect(results).toEqual([
      { title: 'Bing One', url: 'https://example.com/b1', snippet: 'Bing snippet one.' },
      { title: 'Bing Two', url: 'https://example.com/b2', snippet: 'Bing snippet two.' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a clear aggregate error when every endpoint fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500, 'boom'))
      .mockResolvedValueOnce(errorResponse(502, 'bad gateway'));
    const provider = new LocalWebSearchProvider({ fetchImpl: fetchMock });

    await expect(provider.search('hello')).rejects.toThrow(
      /Local web search request failed:.*HTTP 500.*HTTP 502/s,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch at all when the signal is already aborted', async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const provider = new LocalWebSearchProvider({ fetchImpl: fetchMock });

    await expect(provider.search('hello', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry another endpoint after the signal fires mid-request', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const provider = new LocalWebSearchProvider({ fetchImpl: fetchMock });

    const search = provider.search('hello', { signal: controller.signal });
    controller.abort();

    await expect(search).rejects.toThrow('network down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
