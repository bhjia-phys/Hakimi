/**
 * LocalWebSearchProvider - no-auth web search fallback.
 *
 * This provider intentionally uses a plain HTML search endpoint so Hakimi can
 * keep WebSearch usable when the chat model is DeepSeek and no Kimi/Moonshot
 * OAuth token is available.
 */

import { parseHTML as rawParseHTML } from 'linkedom';

import type { UrlFetcher, WebSearchProvider, WebSearchResult } from '../builtin';

interface LocalWebSearchProviderOptions {
  searchUrl?: string;
  searchUrls?: readonly string[];
  userAgent?: string;
  fetchImpl?: typeof fetch;
  urlFetcher?: UrlFetcher;
}

interface DomElementLike {
  textContent: string | null;
  parentElement?: DomElementLike | null;
  getAttribute(name: string): string | null;
  querySelector(selector: string): DomElementLike | null;
  querySelectorAll(selector: string): ArrayLike<DomElementLike>;
}

interface DomParseResult {
  document: DomElementLike;
}

const parseHTML = rawParseHTML as unknown as (html: string) => DomParseResult;

const DEFAULT_SEARCH_URLS = [
  'https://html.duckduckgo.com/html/',
  'https://www.bing.com/search',
] as const;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export class LocalWebSearchProvider implements WebSearchProvider {
  private readonly searchUrls: readonly string[];
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly urlFetcher: UrlFetcher | undefined;

  constructor(options: LocalWebSearchProviderOptions = {}) {
    this.searchUrls =
      options.searchUrls ?? (options.searchUrl !== undefined ? [options.searchUrl] : DEFAULT_SEARCH_URLS);
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.urlFetcher = options.urlFetcher;
  }

  async search(
    query: string,
    options?: { limit?: number; includeContent?: boolean; toolCallId?: string },
  ): Promise<WebSearchResult[]> {
    const limit = options?.limit ?? 5;
    const html = await this.fetchSearchHtml(query);
    const results = parseSearchResults(html, limit);
    if (options?.includeContent !== true || this.urlFetcher === undefined) return results;

    return Promise.all(
      results.map(async (result): Promise<WebSearchResult> => {
        try {
          const fetched = await this.urlFetcher?.fetch(result.url, {
            toolCallId: options.toolCallId,
          });
          if (fetched?.content === undefined || fetched.content.length === 0) return result;
          return { ...result, content: fetched.content };
        } catch {
          return result;
        }
      }),
    );
  }

  private async fetchSearchHtml(query: string): Promise<string> {
    const errors: string[] = [];
    for (const searchUrl of this.searchUrls) {
      try {
        const requestUrl = buildSearchUrl(searchUrl, query);
        const response = await this.fetchImpl(requestUrl, {
          method: 'GET',
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': this.userAgent,
          },
        });

        if (response.status >= 400) {
          const detail = await safeReadText(response);
          errors.push(`HTTP ${String(response.status)} from ${requestUrl.origin}. ${detail}`.trim());
          continue;
        }

        const html = await response.text();
        const probe = parseSearchResults(html, 1);
        if (probe.length === 0) {
          errors.push(`No parseable search results from ${requestUrl.origin}.`);
          continue;
        }
        return html;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${searchUrl}: ${message}`);
      }
    }

    throw new Error(`Local web search request failed: ${errors.join(' | ')}`);
  }
}

function buildSearchUrl(searchUrl: string, query: string): URL {
  const requestUrl = new URL(searchUrl);
  requestUrl.searchParams.set('q', query);
  const host = requestUrl.hostname.toLowerCase();
  if (host.includes('duckduckgo.com')) {
    requestUrl.searchParams.set('kl', 'us-en');
  } else if (host.includes('bing.com')) {
    requestUrl.searchParams.set('mkt', 'en-US');
    requestUrl.searchParams.set('setlang', 'en');
  }
  return requestUrl;
}

function parseSearchResults(html: string, limit: number): WebSearchResult[] {
  const { document } = parseHTML(html);
  const duckDuckGoResults = parseDuckDuckGoResults(document, limit);
  if (duckDuckGoResults.length > 0) return duckDuckGoResults;

  return parseBingResults(document, limit);
}

function parseDuckDuckGoResults(document: DomElementLike, limit: number): WebSearchResult[] {
  const anchors = Array.from(document.querySelectorAll('a.result__a'));
  const out: WebSearchResult[] = [];

  for (const anchor of anchors) {
    const title = normalizeText(anchor.textContent ?? '');
    const rawHref = anchor.getAttribute('href');
    const url = normalizeResultUrl(rawHref);
    if (title.length === 0 || url === null) continue;

    const container = nearestDuckDuckGoResult(anchor);
    const snippet = normalizeText(container?.querySelector('.result__snippet')?.textContent ?? '');

    out.push({
      title,
      url,
      snippet,
    });
    if (out.length >= limit) break;
  }

  return out;
}

function parseBingResults(document: DomElementLike, limit: number): WebSearchResult[] {
  const items = Array.from(document.querySelectorAll('li.b_algo'));
  const out: WebSearchResult[] = [];

  for (const item of items) {
    const anchor = item.querySelector('h2 a') ?? item.querySelector('a');
    if (anchor === null) continue;
    const title = normalizeText(anchor.textContent ?? '');
    const url = normalizeResultUrl(anchor.getAttribute('href'));
    if (title.length === 0 || url === null) continue;
    const snippet = normalizeText(
      item.querySelector('.b_caption p')?.textContent ?? item.querySelector('p')?.textContent ?? '',
    );
    out.push({ title, url, snippet });
    if (out.length >= limit) break;
  }

  return out;
}

function nearestDuckDuckGoResult(anchor: DomElementLike): DomElementLike | null {
  // linkedom's minimal local type above does not model `closest`; a selector
  // walk is not worth a wider DOM surface here. DuckDuckGo places the snippet
  // near the result anchor, so querying the whole document would risk matching
  // the first result for every row. Prefer the common parent when available.
  return anchor.parentElement?.parentElement ?? anchor.parentElement ?? null;
}

function normalizeResultUrl(rawHref: string | null): string | null {
  if (rawHref === null || rawHref.trim().length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawHref, 'https://duckduckgo.com');
  } catch {
    return null;
  }

  const redirected = parsed.searchParams.get('uddg');
  const candidate = redirected ?? parsed.href;
  try {
    const normalized = new URL(candidate);
    if (normalized.protocol !== 'http:' && normalized.protocol !== 'https:') return null;
    return normalized.href;
  } catch {
    return null;
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
