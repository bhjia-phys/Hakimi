#!/usr/bin/env node
/**
 * Hakimi downstream release-boundary checks.
 *
 * Verifies that Hakimi keeps its release identity intact: package name / bin /
 * repository, the upstream-baseline metadata (verified against the archive
 * remote, since Hakimi's own history no longer embeds upstream commits),
 * changeset hygiene, updater URLs, and the release-tag / workflow
 * parameterization. Structured data (JSON) is parsed; text checks are used
 * only for the few boundaries that live inside workflow YAML or source files
 * that cannot be read structurally.
 *
 * Exit code 0 = all checks passed; non-zero lists every failure.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  formatReleaseTag,
  isValidSemver,
  parseReleaseTag,
} from '../apps/kimi-code/scripts/native/release-tag.mjs';

const root = resolve(import.meta.dirname, '..');
const rootPackagePath = join(root, 'package.json');
const cliPackagePath = join(root, 'apps/kimi-code/package.json');
const upstreamBasePath = join(root, 'apps/kimi-code/upstream-base.json');
const webBuildScriptPath = join(root, 'apps/kimi-code/scripts/build-web-assets.mjs');
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
// 2.1 Build-time Web asset delivery
// ---------------------------------------------------------------------------

const rootPackage = parseJsonFile(rootPackagePath);
const packageFiles = Array.isArray(cliPackage.files) ? cliPackage.files : [];
check('package publishes dist-web', packageFiles.includes('dist-web'));
check('package publishes web-base.json', packageFiles.includes('web-base.json'));
check('Web source build entry exists', existsSync(webBuildScriptPath));
check(
  'root build:web-assets invokes the source build entry',
  rootPackage.scripts?.['build:web-assets'] ===
    'node apps/kimi-code/scripts/build-web-assets.mjs',
  JSON.stringify(rootPackage.scripts?.['build:web-assets']),
);
check(
  'CLI package build generates Web assets',
  typeof cliPackage.scripts?.build === 'string' &&
    cliPackage.scripts.build.startsWith('node scripts/build-web-assets.mjs && '),
  JSON.stringify(cliPackage.scripts?.build),
);
check(
  'CLI package prepack generates Web assets',
  cliPackage.scripts?.prepack === 'node scripts/build-web-assets.mjs',
  JSON.stringify(cliPackage.scripts?.prepack),
);

try {
  const generatedPaths = [
    'apps/kimi-code/dist-web',
    'apps/kimi-code/web-base.json',
  ];
  const provenance = parseJsonFile(join(root, 'apps/kimi-code/web-base.json'));
  const bundleFiles = Array.isArray(provenance.bundle?.files)
    ? provenance.bundle.files.map(({ path }) => `apps/kimi-code/dist-web/${path}`)
    : [];
  const expectedTracked = new Set([
    ...bundleFiles,
    'apps/kimi-code/web-base.json',
  ]);
  const tracked = new Set(
    git(['ls-files', '--', ...generatedPaths])
      .split('\n')
      .filter(Boolean),
  );
  const requiredTracked = [
    'apps/kimi-code/dist-web/index.html',
    'apps/kimi-code/dist-web/boot.js',
    'apps/kimi-code/web-base.json',
  ];
  const missing = [...expectedTracked].filter(
    (path) => !tracked.has(path) || !existsSync(join(root, path)),
  );
  const unexpected = [...tracked].filter((path) => !expectedTracked.has(path));
  const missingRequired = requiredTracked.filter((path) => !expectedTracked.has(path));
  check(
    'tracked Web outputs match the provenance manifest',
    bundleFiles.length > 0 && missing.length === 0 && unexpected.length === 0 && missingRequired.length === 0,
    [
      ...missing.map((path) => `missing ${path}`),
      ...unexpected.map((path) => `unexpected ${path}`),
      ...missingRequired.map((path) => `manifest omits ${path}`),
    ].join(', '),
  );

  const untracked = git(['ls-files', '--others', '--', ...generatedPaths])
    .split('\n')
    .filter(Boolean);
  check(
    'generated Web outputs contain no untracked files',
    untracked.length === 0,
    untracked.join(', '),
  );
} catch (error) {
  check(
    'tracked Web outputs match the provenance manifest',
    false,
    error instanceof Error ? error.message : String(error),
  );
}

// ---------------------------------------------------------------------------
// 3. Upstream provenance against the archive remote (only when reachable)
// ---------------------------------------------------------------------------

// Hakimi's Git history no longer contains upstream commits, so the recorded
// baseline commit is verified against the archive remote instead of HEAD.
const archiveUrl = 'https://github.com/bhjia-phys/Hakimi-upstream-archive.git';
const archiveReachable = (() => {
  try {
    gitOk(['remote', 'get-url', 'archive']);
    return git(['remote', 'get-url', 'archive']) === archiveUrl;
  } catch {
    return false;
  }
})();
if (!archiveReachable) {
  skipped.push('upstream provenance (archive remote not configured)');
} else {
  const commit = upstreamBase.commit;
  if (!gitOk(['cat-file', '-e', `${commit}^{commit}`])) {
    try {
      execFileSync('git', ['fetch', '--quiet', 'archive', commit], { stdio: 'ignore' });
    } catch {
      // Fall through to the cat-file probe below.
    }
  }
  if (!gitOk(['cat-file', '-e', `${commit}^{commit}`])) {
    skipped.push(`upstream provenance (commit ${commit} not reachable from the archive remote)`);
  } else {
    check(
      'upstream-base.json commit exists on the archive remote',
      gitOk(['merge-base', '--is-ancestor', commit, 'archive/main']),
      `commit ${commit}`,
    );
    check(
      'upstream-base.json version matches the recorded baseline (metadata only)',
      upstreamBase.version === '0.35.0',
      `recorded ${upstreamBase.version}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Changeset hygiene
// ---------------------------------------------------------------------------

for (const entry of readdirSync(changesetDir)) {
  if (!entry.endsWith('.md') || entry === 'README.md') continue;
  const text = readFileSync(join(changesetDir, entry), 'utf-8');
  if (text.includes(`"${UPSTREAM_CLI_PACKAGE}":`)) {
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
