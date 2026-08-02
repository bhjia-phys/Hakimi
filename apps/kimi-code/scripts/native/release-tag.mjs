/**
 * Canonical Hakimi release tag helpers, shared by the native release scripts
 * (resolve-release.mjs, produce-manifest.mjs) and the CLI update channel
 * (src/cli/update/cdn.ts).
 *
 * Canonical tag format (the only format new releases produce):
 *   hakimi-v<semver>            e.g. hakimi-v0.22.0, hakimi-v0.22.1-beta.1
 *
 * Historical tag formats still parsed for backward compatibility:
 *   v<semver>                   e.g. v0.22.0
 *   @bhjia-phys/hakimi@<semver> e.g. @bhjia-phys/hakimi@0.22.0
 *   @moonshot-ai/kimi-code@<semver> (legacy upstream) e.g. @moonshot-ai/kimi-code@0.30.0
 *   <semver>                    bare version
 *
 * This module deliberately imports nothing outside node builtins so it can run
 * in CI steps that have no node_modules installed.
 */

export const HAKIMI_TAG_PREFIX = 'hakimi-v';

// Recognized release-tag prefixes, most specific first. A tag may carry
// exactly ONE of these; stacked prefixes are rejected.
const TAG_PREFIXES = [
  '@bhjia-phys/hakimi@',
  '@moonshot-ai/kimi-code@',
  'hakimi-v',
  'v',
];

// The official semver regex (semver.org), anchored: strict full-string
// validation, no leading zeros, optional prerelease / build metadata. This is
// equivalent to `semver.valid()` for well-formed input and intentionally
// rejects anything that merely contains digits.
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Strict semver check (no prefix allowed). Returns true for valid semver. */
export function isValidSemver(value) {
  return typeof value === 'string' && SEMVER_PATTERN.test(value);
}

/**
 * Parse a release tag into its semver part, or `null` when the tag is not a
 * recognized release tag (drafts, random names, version-like strings that do
 * not satisfy strict semver).
 *
 * A tag is either a bare strict semver, or exactly one supported prefix
 * followed by a strict semver. Only the first matching prefix is stripped —
 * stacked prefixes (`hakimi-vv1.2.3`, `@bhjia-phys/hakimi@v1.2.3`, ...) and
 * strings that merely contain a semver are rejected.
 */
export function parseReleaseTag(tag) {
  if (typeof tag !== 'string' || tag.length === 0) return null;
  if (isValidSemver(tag)) return tag;
  for (const prefix of TAG_PREFIXES) {
    if (tag.startsWith(prefix)) {
      const rest = tag.slice(prefix.length);
      return isValidSemver(rest) ? rest : null;
    }
  }
  return null;
}

/**
 * Build the canonical Hakimi release tag for a version.
 * Throws when the version is not strict semver.
 */
export function formatReleaseTag(version) {
  if (!isValidSemver(version)) {
    throw new Error(`Invalid Hakimi release version: ${JSON.stringify(version)}`);
  }
  return `${HAKIMI_TAG_PREFIX}${version}`;
}

/**
 * Normalize any supported release tag (canonical or historical) into the
 * canonical `hakimi-v<semver>` form; `null` when not parseable.
 */
export function normalizeReleaseTag(tag) {
  const version = parseReleaseTag(tag);
  return version === null ? null : formatReleaseTag(version);
}
