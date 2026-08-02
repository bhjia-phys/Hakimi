/**
 * `auth` domain (cross-cutting) — no-auth web search fallback provider.
 *
 * Serves `WebSearch` without any Kimi/Moonshot credentials: queries a
 * plain-HTML search endpoint (DuckDuckGo, then Bing) and parses the result
 * rows client-side, so a Hakimi install with no OAuth keeps working search
 * for non-Kimi models. The caller's `AbortSignal` is passed to every fetch
 * and an aborted request is never masked as a search failure — once the
 * signal fires no further endpoint is tried. `fetchImpl` is injectable for
 * offline tests.
 */

import { parseHTML as rawParseHTML } from 'linkedom';

import { abortError } from '#/_base/utils/abort';
import type { WebSearchProvider, WebSearchResult } from '#/agent/tools/web-search/web-search';

interface LocalWebSearchProviderOptions {
  searchUrl?: string;
  searchUrls?: readonly string[];
  userAgent?: string;
  fetchImpl?: typeof fetch;
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

const RESULT_LIMIT = 5;

export class LocalWebSearchProvider implements WebSearchProvider {
  private readonly searchUrls: readonly string[];
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LocalWebSearchProviderOptions = {}) {
    this.searchUrls =
      options.searchUrls ??
      (options.searchUrl !== undefined ? [options.searchUrl] : DEFAULT_SEARCH_URLS);
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async search(
    query: string,
    options?: {
      toolCallId?: string;
      signal?: AbortSignal;
    },
  ): Promise<WebSearchResult[]> {
    const html = await this.fetchSearchHtml(query, options?.signal);
    return parseSearchResults(html, RESULT_LIMIT);
  }

  private async fetchSearchHtml(query: string, signal: AbortSignal | undefined): Promise<string> {
    const errors: string[] = [];
    for (const searchUrl of this.searchUrls) {
      if (signal?.aborted === true) throw abortError();
      try {
        const requestUrl = buildSearchUrl(searchUrl, query);
        const response = await this.fetchImpl(requestUrl, {
          method: 'GET',
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': this.userAgent,
          },
          signal,
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
        if (signalAborted(signal)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${searchUrl}: ${message}`);
      }
    }

    throw new Error(`Local web search request failed: ${errors.join(' | ')}`);
  }
}

function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
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
