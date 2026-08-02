#!/usr/bin/env node
/**
 * Hakimi downstream release-boundary checks.
 *
 * Verifies that the Hakimi fork keeps its release identity intact after
 * upstream syncs: package name / bin / repository, the upstream-baseline
 * metadata, changeset hygiene, updater URLs, and the release-tag / workflow
 * parameterization. Structured data (JSON) is parsed; text checks are used
 * only for the few boundaries that live inside workflow YAML or source files
 * that cannot be read structurally.
 *
 * Exit code 0 = all checks passed; non-zero lists every failure.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  formatReleaseTag,
  isValidSemver,
  parseReleaseTag,
} from '../apps/kimi-code/scripts/native/release-tag.mjs';

const root = resolve(import.meta.dirname, '..');
const cliPackagePath = join(root, 'apps/kimi-code/package.json');
const upstreamBasePath = join(root, 'apps/kimi-code/upstream-base.json');
const changesetConfigPath = join(root, '.changeset/config.json');
const changesetDir = join(root, '.changeset');
const appConstantsPath = join(root, 'apps/kimi-code/src/constant/app.ts');
const resolveReleasePath = join(root, 'apps/kimi-code/scripts/native/resolve-release.mjs');
const produceManifestPath = join(root, 'apps/kimi-code/scripts/native/produce-manifest.mjs');
const releaseWorkflowPath = join(root, '.github/workflows/release-hakimi.yml');
const repairWorkflowPath = join(root, '.github/workflows/repair-hakimi-native-release.yml');
const nativeReleaseWorkflowPath = join(root, '.github/workflows/_hakimi-native-release.yml');
const nativeBuildWorkflowPath = join(root, '.github/workflows/_native-build.yml');
const manualWorkflowPath = join(root, '.github/workflows/manual-native-bundle.yml');

const HAKIMI_PACKAGE_NAME = '@bhjia-phys/hakimi';
const HAKIMI_REPO = 'bhjia-phys/Hakimi';
const UPSTREAM_REPO_URL = 'https://github.com/MoonshotAI/kimi-code.git';
const UPSTREAM_CLI_PACKAGE = '@moonshot-ai/kimi-code';

const failures = [];
const skipped = [];

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function checkTextFile(name, filePath, required, forbidden = []) {
  const text = readFileSync(filePath, 'utf-8');
  for (const needle of required) {
    if (!text.includes(needle)) {
      check(`${name}: contains ${JSON.stringify(needle)}`, false);
      return;
    }
  }
  for (const needle of forbidden) {
    if (text.includes(needle)) {
      check(`${name}: must not contain ${JSON.stringify(needle)}`, false);
      return;
    }
  }
  check(`${name}: references resolved`, true);
}

function parseJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim();
}

function gitOk(args) {
  try {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. CLI package identity
// ---------------------------------------------------------------------------

const cliPackage = parseJsonFile(cliPackagePath);
check('package name is @bhjia-phys/hakimi', cliPackage.name === HAKIMI_PACKAGE_NAME);
check(
  'bin.hakimi points at dist/main.mjs',
  cliPackage.bin?.hakimi === 'dist/main.mjs',
  JSON.stringify(cliPackage.bin),
);
check(
  'package repository points at bhjia-phys/Hakimi',
  typeof cliPackage.repository?.url === 'string' &&
    cliPackage.repository.url.includes(HAKIMI_REPO),
  JSON.stringify(cliPackage.repository),
);
check('package version is strict semver', isValidSemver(cliPackage.version));

// ---------------------------------------------------------------------------
// 2. Upstream baseline metadata
// ---------------------------------------------------------------------------

const upstreamBase = parseJsonFile(upstreamBasePath);
check(
  'upstream-base.json repository matches upstream',
  upstreamBase.repository === UPSTREAM_REPO_URL,
  JSON.stringify(upstreamBase.repository),
);
check('upstream-base.json version is strict semver', isValidSemver(upstreamBase.version));
check(
  'upstream-base.json commit is a 40-char lowercase sha',
  /^[a-f0-9]{40}$/.test(upstreamBase.commit),
  JSON.stringify(upstreamBase.commit),
);

// ---------------------------------------------------------------------------
// 3. Git provenance (only when the object is available locally)
// ---------------------------------------------------------------------------

try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch {
  skipped.push('git provenance (git binary unavailable)');
}
if (skipped.length === 0) {
  const commit = upstreamBase.commit;
  if (!gitOk(['cat-file', '-e', `${commit}^{commit}`])) {
    skipped.push(`git provenance (commit ${commit} not present in local clone)`);
  } else {
    check(
      'upstream commit is an ancestor of HEAD',
      gitOk(['merge-base', '--is-ancestor', commit, 'HEAD']),
      `commit ${commit}`,
    );
    const upstreamVersionAtCommit = JSON.parse(
      git(['show', `${commit}:apps/kimi-code/package.json`]),
    ).version;
    check(
      'upstream-base.json version matches package.json at that commit',
      upstreamVersionAtCommit === upstreamBase.version,
      `recorded ${upstreamBase.version}, found ${upstreamVersionAtCommit}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Changeset hygiene
// ---------------------------------------------------------------------------

for (const entry of readdirSync(changesetDir)) {
  if (!entry.endsWith('.md') || entry === 'README.md') continue;
  const text = readFileSync(join(changesetDir, entry), 'utf-8');
  if (text.includes(UPSTREAM_CLI_PACKAGE)) {
    check(`changeset ${entry} must not reference ${UPSTREAM_CLI_PACKAGE}`, false);
  }
}
if (!failures.some((failure) => failure.startsWith('changeset '))) {
  check('changesets never reference the legacy CLI package name', true);
}

const changesetConfig = parseJsonFile(changesetConfigPath);
const changelogRepo = changesetConfig.changelog?.[1]?.repo;
check(
  'changeset config changelog repo is bhjia-phys/Hakimi',
  changelogRepo === HAKIMI_REPO,
  JSON.stringify(changelogRepo),
);

// ---------------------------------------------------------------------------
// 5. Updater URLs
// ---------------------------------------------------------------------------

checkTextFile(
  'updater constants point at bhjia-phys/Hakimi',
  appConstantsPath,
  [
    'https://github.com/bhjia-phys/Hakimi/releases/latest/download',
    'https://api.github.com/repos/bhjia-phys/Hakimi/releases',
  ],
  ['MoonshotAI/kimi-code'],
);

// ---------------------------------------------------------------------------
// 6. Canonical release tag
// ---------------------------------------------------------------------------

check(
  'formatReleaseTag produces hakimi-v<version>',
  formatReleaseTag('1.2.3') === 'hakimi-v1.2.3',
);
check(
  'parseReleaseTag accepts canonical and historical tag forms',
  parseReleaseTag('hakimi-v0.22.1-beta.1') === '0.22.1-beta.1' &&
    parseReleaseTag('v0.22.0') === '0.22.0' &&
    parseReleaseTag('@bhjia-phys/hakimi@0.22.0') === '0.22.0' &&
    parseReleaseTag('@moonshot-ai/kimi-code@0.30.0') === '0.30.0' &&
    parseReleaseTag('0.22.0') === '0.22.0',
);
check(
  'parseReleaseTag rejects non-release tags',
  parseReleaseTag('nightly') === null,
);
check(
  'parseReleaseTag rejects stacked prefixes',
  parseReleaseTag('hakimi-vv1.2.3') === null &&
    parseReleaseTag('@bhjia-phys/hakimi@v1.2.3') === null &&
    parseReleaseTag('@bhjia-phys/hakimi@hakimi-v1.2.3') === null &&
    parseReleaseTag('@bhjia-phys/hakimi@@moonshot-ai/kimi-code@1.2.3') === null,
);

const resolveRelease = readFileSync(resolveReleasePath, 'utf-8');
check(
  'resolve-release.mjs uses the shared release-tag helper',
  resolveRelease.includes("'./release-tag.mjs'") &&
    !resolveRelease.includes('${packageName}@${version}'),
  'expected import of ./release-tag.mjs and no scoped-package tag construction',
);

// ---------------------------------------------------------------------------
// 7. Workflow parameterization
// ---------------------------------------------------------------------------

// 7.1 Automatic release workflow (release-hakimi.yml)
checkTextFile(
  'release-hakimi.yml gates on bhjia-phys/Hakimi',
  releaseWorkflowPath,
  ["github.repository == 'bhjia-phys/Hakimi'"],
);
checkTextFile(
  'release-hakimi.yml runs the boundary checker before publishing',
  releaseWorkflowPath,
  ['scripts/check-hakimi-release-boundary.mjs'],
);
checkTextFile(
  'release-hakimi.yml disables changesets GitHub Releases (canonical tag only)',
  releaseWorkflowPath,
  ['createGithubReleases: false'],
  ['createGithubReleases: true'],
);
checkTextFile(
  'release-hakimi.yml is push-to-main only (no workflow_dispatch repair path)',
  releaseWorkflowPath,
  ['branches:', '- main'],
  ['workflow_dispatch'],
);
checkTextFile(
  'release-hakimi.yml delegates native assets to the shared reusable workflow',
  releaseWorkflowPath,
  ['uses: ./.github/workflows/_hakimi-native-release.yml'],
);
checkTextFile(
  'release-hakimi.yml pins and verifies the canonical tag at the publishing commit',
  releaseWorkflowPath,
  [
    'RELEASE_TARGET: ${{ github.sha }}',
    '--target "$RELEASE_TARGET"',
    'Release tag $RELEASE_TAG targets $tag_target, expected $RELEASE_TARGET',
  ],
);

const releaseWorkflow = readFileSync(releaseWorkflowPath, 'utf-8');
const nativeReleaseJobMarker = '\n  native-release:\n';
const nativeReleaseJobStart = releaseWorkflow.indexOf(nativeReleaseJobMarker);
const nativeReleaseJob =
  nativeReleaseJobStart === -1 ? '' : releaseWorkflow.slice(nativeReleaseJobStart);
check(
  'release-hakimi.yml grants the reusable native-release caller contents: write',
  nativeReleaseJob.includes('\n    permissions:\n') &&
    nativeReleaseJob.includes('\n      contents: write\n'),
);

// 7.2 Shared Hakimi native-release pipeline (_hakimi-native-release.yml)
checkTextFile(
  '_hakimi-native-release.yml uses Hakimi package/filter/artifact',
  nativeReleaseWorkflowPath,
  [
    "cli-package-filter: '@bhjia-phys/hakimi'",
    'binary-name: hakimi',
    'artifact-base-name: hakimi',
    'upload-artifact-prefix: hakimi-native',
    'sign-macos: false',
  ],
);
checkTextFile(
  '_hakimi-native-release.yml validates tag/source identity and pins the resolved commit',
  nativeReleaseWorkflowPath,
  [
    'formatReleaseTag',
    'checkout-ref',
    'apps/kimi-code/package.json',
    'source_commit',
    'git rev-parse HEAD',
  ],
);

checkTextFile(
  'produce-manifest.mjs requires all six native targets and verifies archive checksums',
  produceManifestPath,
  [
    'darwin-arm64',
    'darwin-x64',
    'linux-arm64',
    'linux-x64',
    'win32-arm64',
    'win32-x64',
    'Missing required native release artifacts',
    'Checksum mismatch for',
  ],
);

// 7.3 Manual repair workflow (repair-hakimi-native-release.yml)
checkTextFile(
  'repair-hakimi-native-release.yml is workflow_dispatch only',
  repairWorkflowPath,
  ['workflow_dispatch', "github.repository == 'bhjia-phys/Hakimi'", "github.ref == 'refs/heads/main'"],
  ['branches:', 'push:'],
);
checkTextFile(
  'repair-hakimi-native-release.yml requires a version input',
  repairWorkflowPath,
  ['version:', 'required: true', 'type: string'],
);
checkTextFile(
  'repair-hakimi-native-release.yml never publishes npm or creates releases',
  repairWorkflowPath,
  ['gh release view'],
  ['changesets/action', 'changeset publish', 'npm publish', 'gh release create'],
);
checkTextFile(
  'repair-hakimi-native-release.yml rebuilds from the canonical tag',
  repairWorkflowPath,
  ['checkout-ref: ${{ needs.validate-release.outputs.release_tag }}'],
);

// 7.4 Manual native bundle (manual-native-bundle.yml)
checkTextFile(
  'manual-native-bundle.yml uses Hakimi package/filter/artifact',
  manualWorkflowPath,
  [
    "cli-package-filter: '@bhjia-phys/hakimi'",
    'binary-name: hakimi',
    'artifact-base-name: hakimi',
    'upload-artifact-prefix: hakimi-native',
  ],
);
checkTextFile(
  'manual-native-bundle.yml defaults sign-macos to false via the workflow input',
  manualWorkflowPath,
  ['sign-macos: ${{ inputs.sign-macos }}', 'default: false'],
  ['sign-macos: true'],
);

// 7.5 Reusable native build (_native-build.yml): upstream defaults intact
checkTextFile(
  '_native-build.yml keeps upstream Kimi Code defaults',
  nativeBuildWorkflowPath,
  [
    "default: '@moonshot-ai/kimi-code'",
    "default: 'kimi'",
    "default: 'kimi-code'",
    "default: 'kimi-code-native'",
  ],
);
checkTextFile(
  '_native-build.yml supports an explicit checkout-ref defaulting to github.sha',
  nativeBuildWorkflowPath,
  ['checkout-ref:', 'inputs.checkout-ref || github.sha'],
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

for (const note of skipped) {
  console.log(`SKIP  ${note}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} Hakimi release-boundary check(s) failed:`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
console.log('\nAll Hakimi release-boundary checks passed.');
