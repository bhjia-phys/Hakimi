/**
 * Hakimi version helpers.
 *
 * `getVersion` reads the host CLI's `package.json#version`.
 * `getUpstreamBase` reads the upstream Kimi Code baseline from
 * `upstream-base.json` (next to the host package.json), falling back to the
 * build-injected value for bundles that cannot read files at runtime (native
 * SEA).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { createKimiUserAgent, KIMI_CODE_PLATFORM, type KimiHostIdentity } from '@moonshot-ai/kimi-code-oauth';
import { valid } from 'semver';
import { z } from 'zod';

import {
  KIMI_CODING_AGENT_USER_AGENT_PRODUCT,
  KIMI_CODING_AGENT_USER_AGENT_SUFFIX,
} from '#/constant/app';

import { KIMI_BUILD_INFO, type UpstreamBase } from './build-info';

const MODULE_DIR = import.meta.dirname;

const UPSTREAM_BASE_FILE_NAME = 'upstream-base.json';

/**
 * `apps/kimi-code/upstream-base.json` schema — the single source of truth for
 * the upstream Kimi Code baseline a Hakimi release is built from. Strict:
 * unknown fields, malformed repository/version/commit all fail. A malformed
 * value throws from `getUpstreamBase` instead of silently displaying a wrong
 * version.
 */
export const UpstreamBaseSchema = z
  .object({
    repository: z.string().url(),
    version: z.string().refine((value) => valid(value) !== null, { error: 'invalid semver' }),
    commit: z.string().regex(/^[a-f0-9]{40}$/, 'expected 40-char lowercase git sha'),
  })
  .strict();

export function getHostPackageJsonPath(): string {
  // Walk upwards from this file's directory until a `package.json` shows up,
  // so both dev (`tsx src/main.ts` — this file in `src/cli/`, pkg 2 levels
  // up) and prod (`node dist/main.mjs` — this code bundled into `dist/`,
  // pkg 1 level up) resolve correctly.
  let dir = MODULE_DIR;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'package.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate package.json near ${MODULE_DIR}`);
}

export function getHostPackageRoot(): string {
  return dirname(getHostPackageJsonPath());
}

export function getVersion(): string {
  if (KIMI_BUILD_INFO.version !== undefined) {
    return KIMI_BUILD_INFO.version;
  }
  const pkg = JSON.parse(readFileSync(getHostPackageJsonPath(), 'utf-8')) as {
    version: string;
  };
  return pkg.version;
}

function parseUpstreamBase(raw: unknown, source: string): UpstreamBase {
  const parsed = UpstreamBaseSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Malformed upstream base metadata (${source}): ${details}`);
  }
  return parsed.data;
}

/**
 * The upstream Kimi Code baseline this Hakimi build derives from, or
 * `undefined` when no baseline is recorded (the build was not produced from
 * the upstream replay pipeline).
 *
 * Prefers the build-injected value (native SEA); otherwise reads
 * `upstream-base.json` next to the host package.json. **Throws** on a
 * malformed file or build value — a wrong upstream version must never be
 * shown silently.
 */
export function getUpstreamBase(): UpstreamBase | undefined {
  const fromBuild = KIMI_BUILD_INFO.upstream;
  if (fromBuild !== undefined) {
    return parseUpstreamBase(fromBuild, 'build info');
  }
  const basePath = join(getHostPackageRoot(), UPSTREAM_BASE_FILE_NAME);
  if (!existsSync(basePath)) {
    return undefined;
  }
  return parseUpstreamBase(JSON.parse(readFileSync(basePath, 'utf-8')), basePath);
}

export function createKimiCodeHostIdentity(version = getVersion()): KimiHostIdentity {
  return {
    productName: KIMI_CODING_AGENT_USER_AGENT_PRODUCT,
    version,
    platform: KIMI_CODE_PLATFORM,
    userAgentSuffix: KIMI_CODING_AGENT_USER_AGENT_SUFFIX,
  };
}

/**
 * Product User-Agent (`kimi-code-cli/<version>`) for ad-hoc outbound fetches
 * that don't go through the provider pipeline (registry / catalog imports).
 */
export function createKimiCodeUserAgent(version = getVersion()): string {
  return createKimiUserAgent(createKimiCodeHostIdentity(version));
}
