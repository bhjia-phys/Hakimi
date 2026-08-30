#!/usr/bin/env node
/**
 * Hakimi downstream release-boundary checks.
 *
 * Verifies that Hakimi keeps its release identity intact: package name / bin /
 * repository, the upstream-baseline metadata (verified against the archive
 * remote, since Hakimi's own history no longer embeds upstream commits), the
 * upstream review audit, changeset hygiene, updater URLs, and the release-tag / workflow
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
const sdkPackagePath = join(root, 'packages/node-sdk/package.json');
const acpAdapterPackagePath = join(root, 'packages/acp-adapter/package.json');
const vscodePackagePath = join(root, 'apps/vscode/package.json');
const pnpmWorkspacePath = join(root, 'pnpm-workspace.yaml');
const flakePath = join(root, 'flake.nix');
const upstreamBasePath = join(root, 'apps/kimi-code/upstream-base.json');
const webBuildScriptPath = join(root, 'apps/kimi-code/scripts/build-web-assets.mjs');
const upstreamAuditPath = join(root, 'apps/kimi-code/upstream-audit.json');
const webBasePath = join(root, 'apps/kimi-code/web-base.json');
const changesetConfigPath = join(root, '.changeset/config.json');
const changesetDir = join(root, '.changeset');
const appConstantsPath = join(root, 'apps/kimi-code/src/constant/app.ts');
const resolveReleasePath = join(root, 'apps/kimi-code/scripts/native/resolve-release.mjs');
const produceManifestPath = join(root, 'apps/kimi-code/scripts/native/produce-manifest.mjs');
const releaseWorkflowPath = join(root, '.github/workflows/release-hakimi.yml');
const upstreamReleaseWorkflowPath = join(root, '.github/workflows/release.yml');
const pkgPrNewWorkflowPath = join(root, '.github/workflows/pkg-pr-new.yml');
const repairWorkflowPath = join(root, '.github/workflows/repair-hakimi-native-release.yml');
const nativeReleaseWorkflowPath = join(root, '.github/workflows/_hakimi-native-release.yml');
const nativeBuildWorkflowPath = join(root, '.github/workflows/_native-build.yml');
const manualWorkflowPath = join(root, '.github/workflows/manual-native-bundle.yml');

const HAKIMI_PACKAGE_NAME = '@bhjia-phys/hakimi';
const HAKIMI_SDK_PACKAGE_NAME = '@bhjia-phys/hakimi-sdk';
const LEGACY_SDK_PACKAGE_NAME = '@moonshot-ai/kimi-code-sdk';
const HAKIMI_REPO = 'bhjia-phys/Hakimi';
const UPSTREAM_REPO_URL = 'https://github.com/MoonshotAI/kimi-code.git';
const UPSTREAM_CLI_PACKAGE = '@moonshot-ai/kimi-code';
const PUBLIC_WORKSPACE_PACKAGE_NAMES = new Set([
  HAKIMI_PACKAGE_NAME,
  HAKIMI_SDK_PACKAGE_NAME,
]);

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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isLowercaseSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function workspacePatterns() {
  const lines = readFileSync(pnpmWorkspacePath, 'utf-8').split(/\r?\n/);
  const patterns = [];
  let inPackages = false;

  for (const line of lines) {
    if (!inPackages) {
      if (line.trim() === 'packages:') inPackages = true;
      continue;
    }
    if (line.trim() !== '' && !/^\s/.test(line)) break;

    const match = line.match(/^\s+-\s+(?:"([^"]+)"|'([^']+)'|([^#]+?))\s*(?:#.*)?$/);
    const pattern = match?.[1] ?? match?.[2] ?? match?.[3];
    if (pattern !== undefined) patterns.push(pattern.trim());
  }

  if (patterns.length === 0) {
    throw new Error(`No workspace package patterns found in ${pnpmWorkspacePath}`);
  }
  return patterns;
}

function expandWorkspacePattern(pattern) {
  let directories = [root];
  for (const segment of pattern.split('/').filter(Boolean)) {
    if (segment === '*') {
      directories = directories.flatMap((directory) =>
        readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(directory, entry.name)),
      );
      continue;
    }
    if (segment === '**') {
      const expanded = [...directories];
      for (const directory of expanded) {
        const children = readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(directory, entry.name));
        expanded.push(...children);
      }
      directories = expanded;
      continue;
    }
    directories = directories
      .map((directory) => join(directory, segment))
      .filter((directory) => existsSync(directory));
  }
  return directories
    .filter((directory) => directory !== root)
    .map((directory) => join(directory, 'package.json'))
    .filter((manifestPath) => existsSync(manifestPath));
}

function discoverWorkspacePackages() {
  /** @type {Set<string>} */
  const manifestPaths = new Set();
  for (const workspacePattern of workspacePatterns()) {
    const excluded = workspacePattern.startsWith('!');
    const pattern = excluded ? workspacePattern.slice(1) : workspacePattern;
    for (const manifestPath of expandWorkspacePattern(pattern)) {
      const absolutePath = resolve(manifestPath);
      if (excluded) manifestPaths.delete(absolutePath);
      else manifestPaths.add(absolutePath);
    }
  }

  const packages = [...manifestPaths].toSorted((left, right) => left.localeCompare(right)).map((manifestPath) => {
    const pkg = parseJsonFile(manifestPath);
    if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
      throw new Error(`Workspace manifest has no package name: ${manifestPath}`);
    }
    return { manifestPath, package: pkg };
  });
  const names = new Set();
  for (const { manifestPath, package: pkg } of packages) {
    if (names.has(pkg.name)) {
      throw new Error(`Duplicate workspace package name ${pkg.name}: ${manifestPath}`);
    }
    names.add(pkg.name);
  }
  return packages;
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
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
// 1.1 Public SDK identity and consumers
// ---------------------------------------------------------------------------

const sdkPackage = parseJsonFile(sdkPackagePath);
check(
  'SDK package name is @bhjia-phys/hakimi-sdk',
  sdkPackage.name === HAKIMI_SDK_PACKAGE_NAME,
  JSON.stringify(sdkPackage.name),
);
check('SDK package is public', sdkPackage.private !== true, JSON.stringify(sdkPackage.private));
check(
  'SDK package metadata points at bhjia-phys/Hakimi',
  sdkPackage.author === 'bhjia-phys' &&
    sdkPackage.homepage?.includes(HAKIMI_REPO) &&
    sdkPackage.repository?.url?.includes(HAKIMI_REPO) &&
    sdkPackage.bugs?.url?.includes(HAKIMI_REPO),
);
check('SDK package version is strict semver', isValidSemver(sdkPackage.version));

check(
  'CLI depends on the public SDK workspace',
  cliPackage.devDependencies?.[HAKIMI_SDK_PACKAGE_NAME] === 'workspace:^' &&
    cliPackage.devDependencies?.[LEGACY_SDK_PACKAGE_NAME] === undefined,
);

const acpAdapterPackage = parseJsonFile(acpAdapterPackagePath);
check(
  'ACP adapter depends on the public SDK workspace',
  acpAdapterPackage.dependencies?.[HAKIMI_SDK_PACKAGE_NAME] === 'workspace:^' &&
    acpAdapterPackage.dependencies?.[LEGACY_SDK_PACKAGE_NAME] === undefined,
);

const vscodePackage = parseJsonFile(vscodePackagePath);
check(
  'VS Code extension depends on the public SDK workspace',
  vscodePackage.dependencies?.[HAKIMI_SDK_PACKAGE_NAME] === 'workspace:^' &&
    vscodePackage.dependencies?.[LEGACY_SDK_PACKAGE_NAME] === undefined,
);

let workspacePackages = [];
try {
  workspacePackages = discoverWorkspacePackages();
  check(
    'pnpm workspace patterns resolve uniquely named package manifests',
    workspacePackages.length > 0,
    `found ${workspacePackages.length} package manifests`,
  );
} catch (error) {
  check(
    'pnpm workspace patterns resolve uniquely named package manifests',
    false,
    error instanceof Error ? error.message : String(error),
  );
}
const publicWorkspacePackageNames = new Set(
  workspacePackages
    .filter(({ package: pkg }) => pkg.private !== true)
    .map(({ package: pkg }) => pkg.name),
);
const privateWorkspacePackageNames = workspacePackages
  .filter(({ package: pkg }) => pkg.private === true)
  .map(({ package: pkg }) => pkg.name);
check(
  'workspace manifests expose only Hakimi CLI and SDK publicly',
  sameSet(publicWorkspacePackageNames, PUBLIC_WORKSPACE_PACKAGE_NAMES),
  JSON.stringify([...publicWorkspacePackageNames].toSorted((left, right) => left.localeCompare(right))),
);
check(
  'every other workspace manifest is explicitly private',
  workspacePackages.length > 0 &&
    workspacePackages.every(
      ({ package: pkg }) =>
        PUBLIC_WORKSPACE_PACKAGE_NAMES.has(pkg.name) || pkg.private === true,
    ),
  JSON.stringify(
    workspacePackages
      .filter(({ package: pkg }) => !PUBLIC_WORKSPACE_PACKAGE_NAMES.has(pkg.name) && pkg.private !== true)
      .map(({ package: pkg }) => pkg.name),
  ),
);

checkTextFile(
  'flake workspaceNames uses the public SDK name',
  flakePath,
  [HAKIMI_SDK_PACKAGE_NAME],
  [LEGACY_SDK_PACKAGE_NAME],
);

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

const upstreamAudit = parseJsonFile(upstreamAuditPath);
const auditFields = [
  'checkedAt',
  'upstreamRef',
  'upstreamCommit',
  'localTrackingRef',
  'localTrackingCommit',
  'scope',
];
const auditChecks =
  isRecord(upstreamAudit) && Array.isArray(upstreamAudit.checks) ? upstreamAudit.checks : [];
const auditEntriesAreRecords = auditChecks.every(isRecord);
const auditEntriesHaveExpectedFields =
  auditEntriesAreRecords &&
  auditChecks.every((entry) => {
    const keys = Object.keys(entry);
    return keys.length === auditFields.length && auditFields.every((field) => keys.includes(field));
  });
const auditEntriesHaveValidDates =
  auditEntriesHaveExpectedFields && auditChecks.every((entry) => isRealDate(entry.checkedAt));
const auditEntriesHaveCanonicalRefs =
  auditEntriesHaveExpectedFields &&
  auditChecks.every(
    (entry) =>
      entry.upstreamRef === 'refs/heads/main' &&
      entry.localTrackingRef === 'refs/remotes/upstream/main',
  );
const auditEntriesHaveValidCommits =
  auditEntriesHaveExpectedFields &&
  auditChecks.every(
    (entry) => isLowercaseSha(entry.upstreamCommit) && isLowercaseSha(entry.localTrackingCommit),
  );
const auditEntriesHaveNonEmptyScopes =
  auditEntriesHaveExpectedFields &&
  auditChecks.every((entry) => typeof entry.scope === 'string' && entry.scope.trim().length > 0);
const auditEntriesAreOrdered =
  auditEntriesHaveValidDates &&
  auditChecks.every((entry, index) => index === 0 || entry.checkedAt >= auditChecks[index - 1].checkedAt);
const auditEntryKeys = auditEntriesAreRecords
  ? auditChecks.map((entry) => JSON.stringify([entry.checkedAt, entry.upstreamCommit, entry.scope]))
  : [];

check(
  'upstream-audit.json repository matches upstream',
  isRecord(upstreamAudit) && upstreamAudit.repository === UPSTREAM_REPO_URL,
  JSON.stringify(upstreamAudit?.repository),
);
check(
  'upstream-audit.json checks is a non-empty array',
  Array.isArray(upstreamAudit?.checks) && upstreamAudit.checks.length > 0,
);
check(
  'upstream-audit.json entries have exactly the six audit fields',
  auditEntriesHaveExpectedFields,
);
check('upstream-audit.json entries have real YYYY-MM-DD dates', auditEntriesHaveValidDates);
check('upstream-audit.json entries use canonical refs', auditEntriesHaveCanonicalRefs);
check('upstream-audit.json entries use lowercase 40-char SHAs', auditEntriesHaveValidCommits);
check('upstream-audit.json entries have non-empty scopes', auditEntriesHaveNonEmptyScopes);
check('upstream-audit.json entries are ordered by date', auditEntriesAreOrdered);
check(
  'upstream-audit.json entries have no duplicate date/commit/scope tuple',
  new Set(auditEntryKeys).size === auditEntryKeys.length,
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
  const provenance = parseJsonFile(webBasePath);
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
  if (text.includes(`"${LEGACY_SDK_PACKAGE_NAME}":`)) {
    check(`changeset ${entry} must not reference ${LEGACY_SDK_PACKAGE_NAME}`, false);
  }
}
if (!failures.some((failure) => failure.startsWith('changeset '))) {
  check('changesets never reference legacy CLI or SDK package names', true);
}

const changesetConfig = parseJsonFile(changesetConfigPath);
const changelogRepo = changesetConfig.changelog?.[1]?.repo;
check(
  'changeset config changelog repo is bhjia-phys/Hakimi',
  changelogRepo === HAKIMI_REPO,
  JSON.stringify(changelogRepo),
);
const ignoredPackages = new Set(changesetConfig.ignore);
check(
  'changeset config ignores every private workspace package',
  ignoredPackages.size === privateWorkspacePackageNames.length &&
    privateWorkspacePackageNames.every((name) => ignoredPackages.has(name)),
  JSON.stringify(changesetConfig.ignore),
);
check(
  'changeset config leaves only Hakimi CLI and SDK publishable',
  !ignoredPackages.has(HAKIMI_PACKAGE_NAME) && !ignoredPackages.has(HAKIMI_SDK_PACKAGE_NAME),
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

// 7.0 PR preview and upstream workflow boundary
checkTextFile(
  'pkg-pr-new.yml is the Hakimi PR preview workflow',
  pkgPrNewWorkflowPath,
  [
    'name: pkg.pr.new (Hakimi)',
    "github.repository == 'bhjia-phys/Hakimi'",
    'cancel-in-progress: true',
    'name: Publish Hakimi preview',
    'pnpm --filter @bhjia-phys/hakimi run build',
    'Publish Hakimi packages to pkg.pr.new',
    "'./apps/kimi-code' './packages/node-sdk'",
  ],
  [
    "github.repository_owner == 'MoonshotAI'",
    UPSTREAM_CLI_PACKAGE,
    LEGACY_SDK_PACKAGE_NAME,
  ],
);
checkTextFile(
  'upstream release.yml remains owner-gated and separate',
  upstreamReleaseWorkflowPath,
  ['name: Release', "github.repository_owner == 'MoonshotAI'"],
  ["github.repository == 'bhjia-phys/Hakimi'"],
);

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
