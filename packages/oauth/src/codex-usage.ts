/**
 * OpenAI Codex official usage fetch / parse.
 *
 * The official ChatGPT backend exposes usage at a fixed URL separate from the
 * Codex chat base:
 *
 *   GET https://chatgpt.com/backend-api/wham/usage
 *
 * This module owns the strict resolver (only the official managed Codex
 * provider/chat base `https://chatgpt.com/backend-api/codex` maps to that
 * fixed URL — no endpoint guessing for proxies or mirrors), the parser that
 * normalizes the windowed rate-limit payload into the shared `UsageRow` model
 * (used = clamped percent, limit = 100, name labels, `reset_at` epoch seconds
 * → ISO), and the credential-bearing fetch boundary (Bearer OAuth access
 * token plus the provider-request headers such as `ChatGPT-Account-Id` /
 * `User-Agent`, with AbortSignal/timeout handling and token redaction). The
 * fetch is pinned to the fixed usage URL — the adapter never accepts a
 * caller-supplied destination, so the credential cannot be sent to an
 * arbitrary host.
 * Codex usage is a rate-limit window, not a Kimi wallet: the normalized
 * result never carries booster-wallet fields.
 */

import type { UsageRow, UsageWindow } from './managed-usage';
import { fetchBearerUsageJson, type UsageFetchOptions } from './usage-fetch';
import { isRecord } from './utils';

export const OFFICIAL_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
export const OFFICIAL_CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

/** Pinned usage target — the only URL `fetchCodexUsage` ever sends to. */
const CODEX_USAGE_FETCH_URL: string = OFFICIAL_CODEX_USAGE_URL;

/**
 * Strict official-endpoint resolver for the OpenAI Codex usage endpoint.
 * Accepts exactly the official managed Codex provider/chat base
 * (`https://chatgpt.com/backend-api/codex`) — trailing slashes and origin
 * case tolerated, path case strict — and returns the single fixed
 * `https://chatgpt.com/backend-api/wham/usage` URL. Any other host or path
 * (proxies, mirrors, gateways) returns `undefined` so callers never guess an
 * endpoint for a base they cannot trust.
 */
export function officialCodexUsageUrl(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined) return undefined;
  const normalized = parseNormalizedUrl(baseUrl);
  const official = parseNormalizedUrl(OFFICIAL_CODEX_BASE_URL);
  if (normalized === undefined || official === undefined) return undefined;
  return normalized === official ? OFFICIAL_CODEX_USAGE_URL : undefined;
}

function parseNormalizedUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return undefined;
  }
}

export interface ParsedCodexUsage {
  /** `primary_window`, normalized to a percent row. */
  readonly summary: UsageRow | null;
  /** `secondary_window` plus every `additional_rate_limits` entry. */
  readonly limits: UsageRow[];
  /** Always null — Codex usage is a rate-limit window, not a Kimi wallet. */
  readonly extraUsage: null;
}

export function parseCodexUsagePayload(payload: unknown): ParsedCodexUsage {
  if (!isRecord(payload)) return { summary: null, limits: [], extraUsage: null };
  const rateLimit = isRecord(payload['rate_limit']) ? payload['rate_limit'] : undefined;
  const limits: UsageRow[] = [];
  const secondary = toWindowRow(rateLimit?.['secondary_window'], 'Secondary window');
  if (secondary !== null) limits.push(secondary);

  const additional = payload['additional_rate_limits'];
  if (Array.isArray(additional)) {
    additional.forEach((item, index) => {
      if (!isRecord(item) || !isRecord(item['rate_limit'])) return;
      const label = additionalLimitLabel(item, index);
      const primary = toWindowRow(item['rate_limit']['primary_window'], label);
      if (primary !== null) limits.push(primary);
      const nestedSecondary = toWindowRow(
        item['rate_limit']['secondary_window'],
        `${label} secondary window`,
      );
      if (nestedSecondary !== null) limits.push(nestedSecondary);
    });
  }

  return {
    summary: toWindowRow(rateLimit?.['primary_window'], 'Primary window'),
    limits,
    extraUsage: null,
  };
}

function additionalLimitLabel(item: Record<string, unknown>, index: number): string {
  if (typeof item['limit_name'] === 'string' && item['limit_name'].length > 0) {
    return item['limit_name'];
  }
  if (typeof item['metered_feature'] === 'string' && item['metered_feature'].length > 0) {
    return item['metered_feature'];
  }
  return `Additional limit ${String(index + 1)}`;
}

function toWindowRow(raw: unknown, name: string): UsageRow | null {
  if (!isRecord(raw)) return null;
  const usedPercent = toFiniteNumber(raw['used_percent']);
  if (usedPercent === undefined) return null;
  return {
    name,
    used: clampPercent(usedPercent),
    limit: 100,
    window: windowFromSeconds(raw['limit_window_seconds']),
    resetAt: resetAtFromEpoch(raw['reset_at']),
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function windowFromSeconds(raw: unknown): UsageWindow | undefined {
  const seconds = toFiniteNumber(raw);
  if (seconds === undefined || seconds <= 0) return undefined;
  const total = Math.floor(seconds);
  if (total % 604_800 === 0) return { duration: total / 604_800, unit: 'week' };
  if (total % 86_400 === 0) return { duration: total / 86_400, unit: 'day' };
  if (total % 3600 === 0) return { duration: total / 3600, unit: 'hour' };
  return { duration: Math.max(1, Math.floor(total / 60)), unit: 'minute' };
}

function resetAtFromEpoch(raw: unknown): string | undefined {
  const seconds = toFiniteNumber(raw);
  if (seconds !== undefined) {
    // Guard the range explicitly: `toISOString()` throws for out-of-range
    // dates, so an extreme but finite `reset_at` must omit the field, never
    // blow up the whole query.
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof raw === 'string' && raw.length > 0) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return raw;
  }
  return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// ── HTTP fetch ────────────────────────────────────────────────────────

export interface CodexRequestAuth {
  readonly apiKey: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export type FetchCodexUsageResult = { readonly kind: 'ok'; readonly parsed: ParsedCodexUsage };

export interface FetchCodexUsageError {
  readonly kind: 'error';
  readonly status?: number;
  readonly message: string;
}

export interface FetchCodexUsageOptions extends UsageFetchOptions {}

/**
 * The single boundary that holds the Codex OAuth access token (the
 * credential) for the usage query. The request goes to the pinned official
 * `OFFICIAL_CODEX_USAGE_URL` only — no caller-supplied URL is accepted, so
 * the credential can never be sent to an arbitrary host. Extra request
 * headers obtained from the OAuth provider (`ChatGPT-Account-Id`,
 * `User-Agent`, `originator`) are merged in without ever replacing the Bearer
 * token.
 */
export async function fetchCodexUsage(
  requestAuth: CodexRequestAuth,
  opts: FetchCodexUsageOptions = {},
): Promise<FetchCodexUsageResult | FetchCodexUsageError> {
  const result = await fetchBearerUsageJson(
    CODEX_USAGE_FETCH_URL,
    requestAuth.apiKey,
    requestAuth.headers ?? {},
    {
      unauthorized: 'Authorization failed. Please re-authenticate OpenAI Codex (run /login).',
      notFound: 'Usage endpoint not available for OpenAI Codex.',
      statusPrefix: 'Failed to fetch usage',
    },
    opts,
  );
  if (result.kind === 'error') return result;
  return { kind: 'ok', parsed: parseCodexUsagePayload(result.json) };
}