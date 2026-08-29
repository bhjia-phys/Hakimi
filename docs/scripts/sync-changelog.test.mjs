import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ENGLISH_CHANGELOG_PATH,
  SOURCE_CHANGELOG_PATH,
  cleanReleaseBody,
  createSyncPlan,
  parseSourceChangelog,
  parseSyncChangelogArgs,
  resolveGitRelease,
  stripChangesetEntryDecoration,
  syncChangelog,
} from './sync-changelog.mjs';

const target = `---
outline: 2
---

# Changelog

This page documents Hakimi releases. Releases beginning with Kimi Code 0.36.1 are preserved upstream history and are not part of Hakimi's independent release line.

## 0.36.1 (2026-08-01)

### Features

- Existing upstream entry.

## 0.13.1 (2025-08-01)

### Features

- Historical upstream release with the same semver.
`;

const source = `# @bhjia-phys/hakimi

## 0.13.1

### Minor Changes

- [#123](https://example.test/pull/123) [\`abc1234\`](https://example.test/commit/abc1234) Thanks [@alice](https://example.test/alice), [@bob](https://example.test/bob)! - Add the released feature.

  Keep this continuation paragraph.

### Patch Changes

- Fix the released behavior.

## 0.13.0

### Minor Changes

- Establish the Hakimi release-line baseline.

## 0.36.1

### Minor Changes

- Existing upstream entry.

## 0.13.1

### Patch Changes

- Historical upstream release with the same semver.
`;

await test('strips PR, hash, and single- or multi-author credits', () => {
  assert.equal(
    stripChangesetEntryDecoration(
      '- [#1](https://example.test/pull/1) [`abcdef0`](https://example.test/commit/abcdef0) Thanks [@a](https://example.test/a)! - Add one.',
    ),
    '- Add one.',
  );
  assert.equal(
    stripChangesetEntryDecoration(
      '- [#2](https://example.test/pull/2) [`abcdef1`](https://example.test/commit/abcdef1) Thanks [@a](https://example.test/a), [@b](https://example.test/b)! - Add two.',
    ),
    '- Add two.',
  );
});

await test('removes changesets headings while preserving multiline entry content', () => {
  const parsed = parseSourceChangelog(source);
  const cleaned = cleanReleaseBody(parsed.releases[0].body);
  assert.doesNotMatch(cleaned, /### (?:Minor|Patch) Changes/);
  assert.doesNotMatch(cleaned, /\[#123\]|abc1234|Thanks /);
  assert.match(cleaned, /- Add the released feature\.\n\n  Keep this continuation paragraph\./);
  assert.match(cleaned, /- Fix the released behavior\./);
});

await test('treats the first 0.13.0 block as a no-op boundary before upstream history', async () => {
  const currentSource = `# @bhjia-phys/hakimi

## 0.13.0

- Establish the Hakimi release-line baseline.

## 0.36.1

- Preserve an upstream release.
`;
  const currentTarget = `# Changelog

This page documents Hakimi releases.

## 0.36.1 (2026-08-14)

- Preserve an upstream release.
`;
  let resolveCalls = 0;
  const plan = await createSyncPlan({
    sourceText: currentSource,
    targetText: currentTarget,
    resolveRelease: async () => {
      resolveCalls += 1;
      return null;
    },
  });

  assert.equal(plan.changed, false);
  assert.deepEqual(plan.versions, []);
  assert.equal(resolveCalls, 0);
});

await test('builds a dated incremental plan above the existing release boundary', async () => {
  const plan = await createSyncPlan({
    sourceText: source,
    targetText: target,
    resolveRelease: async () => ({ tag: 'hakimi-v0.13.1', date: '2026-08-26' }),
  });
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.versions, ['0.13.1']);
  assert.match(plan.text, /## 0\.13\.1 \(2026-08-26\)/);
  assert.ok(plan.text.indexOf('## 0.13.1') < plan.text.indexOf('## 0.36.1'));
  assert.doesNotMatch(plan.text, /### (?:Minor|Patch) Changes|\[#123\]|Thanks /);

  const idempotentPlan = await createSyncPlan({
    sourceText: source,
    targetText: plan.text,
    resolveRelease: async () => {
      throw new Error('Already-synced releases must not resolve metadata again.');
    },
  });
  assert.equal(idempotentPlan.changed, false);
  assert.deepEqual(idempotentPlan.versions, []);
  assert.equal(idempotentPlan.text, plan.text);
});

await test('fails closed when a pending release has no tag or a bad date', async () => {
  await assert.rejects(
    createSyncPlan({
      sourceText: source,
      targetText: target,
      resolveRelease: async () => null,
    }),
    /has no published release tag/,
  );
  await assert.rejects(
    createSyncPlan({
      sourceText: source,
      targetText: target,
      resolveRelease: async () => ({ tag: 'hakimi-v0.13.1', date: '2026-02-30' }),
    }),
    /has no parseable release date/,
  );
  await assert.rejects(
    createSyncPlan({
      sourceText: source.replace('## 0.13.0', '## 0.12.0'),
      targetText: target,
      resolveRelease: async () => null,
    }),
    /missing release-line baseline 0\.13\.0/,
  );
});

await test('fails closed for a non-canonical tag and a tag changelog drift', async () => {
  await assert.rejects(
    createSyncPlan({
      sourceText: source,
      targetText: target,
      resolveRelease: async () => ({ tag: 'v0.13.1', date: '2026-08-26' }),
    }),
    /must use canonical tag hakimi-v0\.13\.1/,
  );

  const git = async (args) => {
    if (args[0] === 'rev-parse') return 'commit\n';
    if (args[0] === 'show' && args[1] === '-s') return '2026-08-26\n';
    return source.replace('Add the released feature.', 'Different tagged content.');
  };
  const release = parseSourceChangelog(source).releases[0];
  await assert.rejects(
    resolveGitRelease(release, '@bhjia-phys/hakimi', '/repo', git),
    /differs from apps\/kimi-code\/CHANGELOG\.md recorded at tag/,
  );
});

await test('rejects malformed source boundaries and duplicate dry-run arguments', () => {
  assert.throws(
    () => parseSourceChangelog('# package\n\n## next\n\n- Entry.\n'),
    /not strict semver/,
  );
  assert.deepEqual(parseSyncChangelogArgs(['--dry-run']), { dryRun: true });
  assert.throws(
    () => parseSyncChangelogArgs(['--dry-run', '--dry-run']),
    /may only be specified once/,
  );
  assert.throws(() => parseSyncChangelogArgs(['--check']), /Unknown option/);
});

await test('sync writes only the English docs target and dry-run writes nothing', async () => {
  const reads = new Map([
    [`/repo/${SOURCE_CHANGELOG_PATH}`, source],
    [`/repo/${ENGLISH_CHANGELOG_PATH}`, target],
  ]);
  const writes = [];
  const options = {
    root: '/repo',
    readText: async (path) => reads.get(path),
    writeText: async (path, text) => writes.push({ path, text }),
    resolveRelease: async () => ({ tag: 'hakimi-v0.13.1', date: '2026-08-26' }),
  };

  await syncChangelog({ ...options, dryRun: true });
  assert.deepEqual(writes, []);

  await syncChangelog(options);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, `/repo/${ENGLISH_CHANGELOG_PATH}`);
  assert.doesNotMatch(writes[0].path, /\/zh\//);
});
