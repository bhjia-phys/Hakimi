/**
 * OpenCode Go usage fetch / parse.
 *
 * OpenCode Go exposes a subscription-quota usage endpoint on the Zen Go v1
 * base:
 *
 *   GET https://opencode.ai/zen/go/v1/usage
 *
 * This module owns the strict resolver (only the normalized exact base
 * `https://opencode.ai/zen/go/v1` maps to the fixed usage URL — no endpoint
 * guessing for proxies or mirrors), the parser that normalizes the
 * `{ usage: { rolling, weekly, monthly } }` percent payload into the shared
 * `UsageRow` model (used = percent, limit = 100, name labels, `resetsAt`
 * passed through), and the credential-bearing fetch boundary (Bearer provider
 * API key, with AbortSignal/timeout handling and key redaction). The fetch is
 * pinned to the fixed usage URL — the adapter never accepts a caller-supplied
 * destination, so the credential cannot be sent to an arbitrary host.
 * OpenCode Go usage is subscription quota, not a Kimi wallet: the normalized
 * result never carries booster-wallet fields.
 */

import type { UsageRow } from './managed-usage';
import { fetchBearerUsageJson, type UsageFetchOptions } from './usage-fetch';
import { isRecord } from './utils';

export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';
export const OPENCODE_GO_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';

/** Pinned usage target — the only URL `fetchOpenCodeGoUsage` ever sends to. */
const OPENCODE_GO_USAGE_FETCH_URL: string = OPENCODE_GO_USAGE_URL;

/**
 * Strict official-endpoint resolver for the OpenCode Go usage endpoint.
 * Accepts exactly the normalized base `https://opencode.ai/zen/go/v1` —
 * trailing slashes and origin case tolerated, path case strict — and returns
 * the fixed `https://opencode.ai/zen/go/v1/usage` URL. Any other host or path
 * (proxies, mirrors, gateways) returns `undefined` so callers never guess an
 * endpoint for a base they cannot trust.
 */
export function opencodeGoUsageUrl(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined) return undefined;
  const normalized = parseNormalizedUrl(baseUrl);
  const official = parseNormalizedUrl(OPENCODE_GO_BASE_URL);
  if (normalized === undefined || official === undefined) return undefined;
  return normalized === official ? OPENCODE_GO_USAGE_URL : undefined;
}

function parseNormalizedUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return undefined;
  }
}

export interface ParsedOpenCodeGoUsage {
  /** `rolling` window, normalized to a percent row. */
  readonly summary: UsageRow | null;
  /** `weekly` and `monthly` windows, normalized to percent rows. */
  readonly limits: UsageRow[];
  /** Always null — OpenCode Go usage is subscription quota, not a Kimi wallet. */
  readonly extraUsage: null;
}

export function parseOpenCodeGoUsagePayload(payload: unknown): ParsedOpenCodeGoUsage {
  if (!isRecord(payload)) return { summary: null, limits: [], extraUsage: null };
  const usage = payload['usage'];
  if (!isRecord(usage)) return { summary: null, limits: [], extraUsage: null };

  const limits: UsageRow[] = [];
  const weekly = toWindowRow(usage['weekly'], 'Weekly');
  if (weekly !== null) limits.push(weekly);
  const monthly = toWindowRow(usage['monthly'], 'Monthly');
  if (monthly !== null) limits.push(monthly);

  return {
    summary: toWindowRow(usage['rolling'], 'Rolling'),
    limits,
    extraUsage: null,
  };
}

function toWindowRow(raw: unknown, name: string): UsageRow | null {
  if (!isRecord(raw)) return null;
  const percent = toFiniteNumber(raw['percent']);
  if (percent === undefined) return null;
  return {
    name,
    used: clampPercent(percent),
    limit: 100,
    resetAt: resetsAtFrom(raw['resetsAt']),
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resetsAtFrom(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : raw;
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

export type FetchOpenCodeGoUsageResult = {
  readonly kind: 'ok';
  readonly parsed: ParsedOpenCodeGoUsage;
};

export interface FetchOpenCodeGoUsageError {
  readonly kind: 'error';
  readonly status?: number;
  readonly message: string;
}

export interface FetchOpenCodeGoUsageOptions extends UsageFetchOptions {}

/**
 * The single boundary that holds the OpenCode Go provider API key as a Bearer
 * token, so it is also the single place where error messages built from
 * untrusted input get the key defensively scrubbed. The request goes to the
 * pinned official `OPENCODE_GO_USAGE_URL` only — no caller-supplied URL is
 * accepted, so the credential can never be sent to an arbitrary host.
 */
export async function fetchOpenCodeGoUsage(
  apiKey: string,
  opts: FetchOpenCodeGoUsageOptions = {},
): Promise<FetchOpenCodeGoUsageResult | FetchOpenCodeGoUsageError> {
  const result = await fetchBearerUsageJson(
    OPENCODE_GO_USAGE_FETCH_URL,
    apiKey,
    {},
    {
      unauthorized: 'Authorization failed. Please check your OpenCode Go API key.',
      notFound: 'Usage endpoint not available for OpenCode Go.',
      statusPrefix: 'Failed to fetch usage',
    },
    opts,
  );
  if (result.kind === 'error') return result;
  return { kind: 'ok', parsed: parseOpenCodeGoUsagePayload(result.json) };
}