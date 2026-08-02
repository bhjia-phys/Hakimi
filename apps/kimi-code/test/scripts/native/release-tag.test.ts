/**
 * Scenario: canonical Hakimi release-tag contract shared by the native
 * release scripts (resolve-release / produce-manifest) and the CLI update
 * channel (cdn.ts).
 *
 * Responsibilities asserted:
 *   - `formatReleaseTag` produces only canonical `hakimi-v<semver>` tags and
 *     rejects non-strict-semver versions;
 *   - `isValidSemver` accepts only strict semver (no prefixes, no leading
 *     zeros, no whitespace);
 *   - `parseReleaseTag` accepts exactly one supported prefix per tag
 *     (canonical `hakimi-v`, historical `v`, scoped Hakimi, legacy upstream
 *     scoped, or bare semver) and rejects stacked prefixes, whitespace and
 *     version-like garbage;
 *   - `normalizeReleaseTag` rewrites every accepted historical form to the
 *     canonical form and returns null for rejected input.
 *
 * Wiring: pure module, zero dependencies — no mocks, no env, no disk.
 *
 * Run: `pnpm --filter @bhjia-phys/hakimi exec vitest run test/scripts/native/release-tag.test.ts`
 */

import { describe, expect, it } from 'vitest';

import {
  formatReleaseTag,
  HAKIMI_TAG_PREFIX,
  isValidSemver,
  normalizeReleaseTag,
  parseReleaseTag,
} from '../../../scripts/native/release-tag.mjs';

describe('formatReleaseTag', () => {
  it('produces hakimi-v<version> for a stable version', () => {
    expect(formatReleaseTag('0.22.0')).toBe('hakimi-v0.22.0');
  });

  it('produces hakimi-v<version> for a prerelease version', () => {
    expect(formatReleaseTag('0.22.1-beta.1')).toBe('hakimi-v0.22.1-beta.1');
  });

  it('preserves build metadata in the formatted tag', () => {
    expect(formatReleaseTag('1.2.3+build.5')).toBe('hakimi-v1.2.3+build.5');
  });

  it('rejects a version that is not strict semver', () => {
    expect(() => formatReleaseTag('0.22')).toThrow(/Invalid Hakimi release version/);
    expect(() => formatReleaseTag('01.2.3')).toThrow(/Invalid Hakimi release version/);
    expect(() => formatReleaseTag('v0.22.0')).toThrow(/Invalid Hakimi release version/);
    expect(() => formatReleaseTag('latest')).toThrow(/Invalid Hakimi release version/);
    expect(() => formatReleaseTag('')).toThrow(/Invalid Hakimi release version/);
  });
});

describe('isValidSemver', () => {
  it('accepts strict semver with prerelease and build metadata', () => {
    expect(isValidSemver('0.22.0')).toBe(true);
    expect(isValidSemver('0.22.1-beta.1')).toBe(true);
    expect(isValidSemver('1.2.3+build.5')).toBe(true);
  });

  it('rejects prefixes, leading zeros, whitespace and incomplete versions', () => {
    expect(isValidSemver('v0.22.0')).toBe(false);
    expect(isValidSemver('hakimi-v0.22.0')).toBe(false);
    expect(isValidSemver('01.2.3')).toBe(false);
    expect(isValidSemver(' 1.2.3')).toBe(false);
    expect(isValidSemver('1.2.3 ')).toBe(false);
    expect(isValidSemver('1.2')).toBe(false);
    expect(isValidSemver('2024.01')).toBe(false);
  });
});

describe('parseReleaseTag', () => {
  const accepted: ReadonlyArray<readonly [string, string]> = [
    // canonical hakimi-v prefix (stable, prerelease, build metadata)
    ['hakimi-v0.22.0', '0.22.0'],
    ['hakimi-v0.22.1-beta.1', '0.22.1-beta.1'],
    ['hakimi-v1.2.3+build.5', '1.2.3+build.5'],
    // historical v prefix
    ['v0.22.0', '0.22.0'],
    // historical scoped Hakimi package tag
    ['@bhjia-phys/hakimi@0.22.0', '0.22.0'],
    // historical legacy upstream package tag
    ['@moonshot-ai/kimi-code@0.30.0', '0.30.0'],
    // bare semver
    ['0.22.0', '0.22.0'],
  ];

  for (const [tag, version] of accepted) {
    it(`accepts ${JSON.stringify(tag)} as ${version}`, () => {
      expect(parseReleaseTag(tag)).toBe(version);
    });
  }

  it('rejects stacked prefixes', () => {
    expect(parseReleaseTag('hakimi-vv1.2.3')).toBeNull();
    expect(parseReleaseTag('@bhjia-phys/hakimi@v1.2.3')).toBeNull();
    expect(parseReleaseTag('@bhjia-phys/hakimi@hakimi-v1.2.3')).toBeNull();
    expect(parseReleaseTag('@bhjia-phys/hakimi@@moonshot-ai/kimi-code@1.2.3')).toBeNull();
    expect(parseReleaseTag('vv1.2.3')).toBeNull();
    expect(parseReleaseTag('hakimi-v@bhjia-phys/hakimi@1.2.3')).toBeNull();
  });

  it('rejects version-like garbage that only contains a semver', () => {
    expect(parseReleaseTag('nightly')).toBeNull();
    expect(parseReleaseTag('nightly-build')).toBeNull();
    expect(parseReleaseTag('hakimi-2024.01')).toBeNull();
    expect(parseReleaseTag('hakimi-v1.2')).toBeNull();
    expect(parseReleaseTag('hakimi-v01.2.3')).toBeNull();
    expect(parseReleaseTag('2024.01')).toBeNull();
  });

  it('rejects leading or trailing whitespace', () => {
    expect(parseReleaseTag(' 1.2.3')).toBeNull();
    expect(parseReleaseTag('1.2.3 ')).toBeNull();
    expect(parseReleaseTag('hakimi-v1.2.3 ')).toBeNull();
  });

  it('rejects empty and prefix-only tags', () => {
    expect(parseReleaseTag('')).toBeNull();
    expect(parseReleaseTag('hakimi-v')).toBeNull();
    expect(parseReleaseTag('v')).toBeNull();
    expect(parseReleaseTag('@bhjia-phys/hakimi@')).toBeNull();
  });

  it('rejects non-string tags', () => {
    expect(parseReleaseTag(undefined as unknown as string)).toBeNull();
    expect(parseReleaseTag(null as unknown as string)).toBeNull();
    expect(parseReleaseTag(42 as unknown as string)).toBeNull();
  });
});

describe('normalizeReleaseTag', () => {
  it('normalizes every accepted historical form to hakimi-v<version>', () => {
    expect(normalizeReleaseTag('v0.22.0')).toBe('hakimi-v0.22.0');
    expect(normalizeReleaseTag('@bhjia-phys/hakimi@0.22.0')).toBe('hakimi-v0.22.0');
    expect(normalizeReleaseTag('@moonshot-ai/kimi-code@0.30.0')).toBe('hakimi-v0.30.0');
    expect(normalizeReleaseTag('0.22.0')).toBe('hakimi-v0.22.0');
  });

  it('passes through the canonical form unchanged', () => {
    expect(normalizeReleaseTag('hakimi-v0.22.1-beta.1')).toBe('hakimi-v0.22.1-beta.1');
  });

  it('returns null for stacked-prefix and malformed tags', () => {
    expect(normalizeReleaseTag('hakimi-vv1.2.3')).toBeNull();
    expect(normalizeReleaseTag('@bhjia-phys/hakimi@v1.2.3')).toBeNull();
    expect(normalizeReleaseTag('nightly')).toBeNull();
  });
});

describe('HAKIMI_TAG_PREFIX', () => {
  it('is the canonical hakimi-v prefix', () => {
    expect(HAKIMI_TAG_PREFIX).toBe('hakimi-v');
  });
});
