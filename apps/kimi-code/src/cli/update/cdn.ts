import { gt, valid } from 'semver';
import { z } from 'zod';

import {
  KIMI_CODE_CDN_LATEST_JSON_URL,
  KIMI_CODE_CDN_LATEST_URL,
  KIMI_CODE_GITHUB_RELEASES_API_URL,
} from '#/constant/app';

import { parseReleaseTag } from '../../../scripts/native/release-tag.mjs';

import type { UpdateManifest } from './types';

const CDN_FETCH_TIMEOUT_MS = 3_000;

const GITHUB_API_HEADERS = {
  accept: 'application/vnd.github+json',
  // GitHub rejects API calls without a User-Agent.
  'user-agent': 'hakimi-cli',
};

const RolloutBatchSchema = z.object({
  percent: z.number().int().min(0).max(100),
  delaySeconds: z.number().int().min(0),
});

/**
 * CDN `latest.json` wire format. Deliberately NOT `.strict()` — unknown
 * fields are ignored so future manifest additions never break shipped
 * clients (the plain-text `/latest` taught us that hard-failing on
 * unexpected content bricks the update path forever).
 */
export const UpdateManifestSchema = z.object({
  version: z.string().refine((value) => valid(value) !== null, { error: 'invalid semver' }),
  publishedAt: z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)), { error: 'invalid timestamp' }),
  rollout: z.array(RolloutBatchSchema).readonly().default([]),
});

export interface FetchLatestResult {
  /** Raw newest version — what `hakimi upgrade` installs, never rollout-gated. */
  readonly latest: string;
  /** Null when the JSON manifest was unavailable and we fell back to plain text. */
  readonly manifest: UpdateManifest | null;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  headers?: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CDN_FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(input, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the latest published Hakimi version from the release channel.
 *
 * **Throws** on any failure (network error, non-2xx, empty body, non-semver
 * text). Callers must catch — `refreshUpdateCache` deliberately lets the
 * error propagate so the existing cache stays intact instead of being
 * overwritten with a null `latest` on a transient blip.
 *
 * `fetchImpl` is injectable for tests; defaults to the global `fetch`.
 */
export async function fetchLatestVersionFromCdn(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchWithTimeout(fetchImpl, KIMI_CODE_CDN_LATEST_URL);
  if (!response.ok) {
    throw new Error(`CDN /latest returned HTTP ${response.status}`);
  }
  const raw = (await response.text()).trim();
  if (valid(raw) === null) {
    throw new Error(`CDN /latest returned invalid semver: ${JSON.stringify(raw)}`);
  }
  return raw;
}

async function fetchUpdateManifestFromCdn(fetchImpl: typeof fetch): Promise<UpdateManifest> {
  const response = await fetchWithTimeout(fetchImpl, KIMI_CODE_CDN_LATEST_JSON_URL);
  if (!response.ok) {
    throw new Error(`CDN /latest.json returned HTTP ${response.status}`);
  }
  return UpdateManifestSchema.parse(JSON.parse(await response.text()));
}

/**
 * Last-resort version source: the GitHub releases API. Needed because Hakimi
 * ships previews as GitHub prereleases, which `releases/latest/download/...`
 * never serves — without this the update check would never see them.
 *
 * The newest version is the max semver over release tag names. The canonical
 * `hakimi-v<semver>` prefix and the historical tag forms (`v`, scoped
 * package tags, legacy upstream tags) are all accepted (see
 * `scripts/native/release-tag.mjs`). Drafts and non-semver tags are ignored.
 *
 * **Throws** on any failure; callers must catch (see above).
 */
async function fetchLatestVersionFromGithub(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchWithTimeout(
    fetchImpl,
    KIMI_CODE_GITHUB_RELEASES_API_URL,
    GITHUB_API_HEADERS,
  );
  if (!response.ok) {
    throw new Error(`GitHub releases API returned HTTP ${response.status}`);
  }
  const body: unknown = JSON.parse(await response.text());
  if (!Array.isArray(body)) {
    throw new Error('GitHub releases API returned an unexpected payload');
  }
  let latest: string | null = null;
  for (const release of body) {
    if (typeof release !== 'object' || release === null) continue;
    const record = release as { tag_name?: unknown; draft?: unknown };
    if (record.draft === true || typeof record.tag_name !== 'string') continue;
    const version = parseReleaseTag(record.tag_name);
    if (version === null) continue;
    if (latest === null || gt(version, latest)) latest = version;
  }
  if (latest === null) {
    throw new Error('GitHub releases API returned no semver release tags');
  }
  return latest;
}

/**
 * Fetch the rollout manifest, falling back to the plain-text `/latest` when
 * `latest.json` is unavailable or malformed, and to the GitHub releases API
 * when neither static file exists (the current prerelease-only channel). The
 * fallback removes any deployment-order coupling between client releases and
 * the CDN file, and a null manifest means "fully rolled out" — exactly the
 * pre-rollout behavior.
 *
 * **Throws** only when all sources fail; callers must catch (see above).
 */
export async function fetchLatestFromCdn(
  fetchImpl: typeof fetch = fetch,
): Promise<FetchLatestResult> {
  const manifest = await fetchUpdateManifestFromCdn(fetchImpl).catch(() => null);
  if (manifest !== null) {
    return { latest: manifest.version, manifest };
  }
  const latest = await fetchLatestVersionFromCdn(fetchImpl).catch(() =>
    fetchLatestVersionFromGithub(fetchImpl),
  );
  return { latest, manifest: null };
}
