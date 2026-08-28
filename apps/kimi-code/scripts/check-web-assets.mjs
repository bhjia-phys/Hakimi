// Validate a generated production Web bundle against its in-repository source
// and deterministic build recipe. Git metadata is deliberately excluded: the
// source, recipe/toolchain-requirement, and bundle digests are the complete identity.

import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEB_BRANDING_PATCH_VERSION } from './patch-web-branding.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepositoryRoot = resolve(appRoot, '../..');
const defaultTarget = resolve(appRoot, 'dist-web');
const defaultProvenancePath = resolve(appRoot, 'web-base.json');
export const WEB_PROVENANCE_SCHEMA_VERSION = 4;
export const WEB_SOURCE_REPOSITORY = 'hakimi';
export const WEB_SOURCE_PATH = 'apps/kimi-web';
export const WEB_SOURCE_FILES = [
  `${WEB_SOURCE_PATH}/index.html`,
  `${WEB_SOURCE_PATH}/tsconfig.json`,
];
export const WEB_RECIPE_FILES = [
  '.npmrc',
  '.nvmrc',
  'apps/kimi-code/scripts/build-web-assets.mjs',
  'apps/kimi-code/scripts/check-web-assets.mjs',
  'apps/kimi-code/scripts/patch-web-branding.mjs',
  'apps/kimi-code/scripts/record-web-provenance.mjs',
  'apps/kimi-web/package.json',
  'apps/kimi-web/vite.config.ts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const NODE_REQUIREMENT_PATTERN = /^>=\d+\.\d+\.\d+$/;
const syncHelp =
  '请运行 `pnpm run build:web-assets` 重新生成 dist-web 与 web-base.json，' +
  '或在生成后运行 `pnpm run build:web-assets -- --check` 检查产物。';

function bundleError(message) {
  return new Error(`${message} ${syncHelp}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosixPath(path) {
  return path.split('\\').join('/');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSourceRepository(repository) {
  if (repository !== WEB_SOURCE_REPOSITORY) {
    throw bundleError(
      `Web provenance 无效：repository 必须是 ${JSON.stringify(WEB_SOURCE_REPOSITORY)}。`,
    );
  }
}

function assertRelativeBundlePath(path) {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(path) ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw bundleError(`Web provenance 无效：文件路径 ${JSON.stringify(path)} 不是安全的 POSIX 相对路径。`);
  }
}

async function assertFile(filePath, description) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new Error(`${description} is not a file`);
    }
  } catch {
    throw bundleError(`Web 产物无效：${description} 不存在或不是文件（${filePath}）。`);
  }
}

async function walkFiles(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function assertSourceDirectory(dir, repositoryRoot) {
  const path = toPosixPath(relative(repositoryRoot, dir));
  let info;
  try {
    info = await lstat(dir);
  } catch (error) {
    throw bundleError(
      `Web source 无效：无法检查必需的构建输入目录 ${path}：${error instanceof Error ? error.message : String(error)}。`,
    );
  }
  if (info.isSymbolicLink()) {
    throw bundleError(`Web source 无效：必需的构建输入目录 ${path} 是 symbolic link。`);
  }
  if (!info.isDirectory()) {
    throw bundleError(`Web source 无效：必需的构建输入目录 ${path} 不是普通目录。`);
  }
}

async function walkSourceFiles(dir, repositoryRoot, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    throw bundleError(
      `Web source 无效：无法读取必需的构建输入目录 ${dir}：${error instanceof Error ? error.message : String(error)}。`,
    );
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    const path = toPosixPath(relative(repositoryRoot, full));
    let info;
    try {
      info = await lstat(full);
    } catch (error) {
      throw bundleError(
        `Web source 无效：无法检查 ${path}：${error instanceof Error ? error.message : String(error)}。`,
      );
    }
    if (info.isSymbolicLink()) {
      throw bundleError(`Web source 无效：${path} 是 symbolic link，provenance 不允许链接。`);
    }
    if (info.isDirectory()) {
      await walkSourceFiles(full, repositoryRoot, out);
    } else if (info.isFile()) {
      out.push(full);
    } else {
      throw bundleError(
        `Web source 无效：${path} 不是普通文件或目录，provenance 不支持该特殊文件类型。`,
      );
    }
  }
  return out;
}

async function appendRequiredFiles(repositoryRoot, paths, files, name) {
  for (const path of paths) {
    const file = resolve(repositoryRoot, path);
    let info;
    try {
      info = await lstat(file);
    } catch {
      throw bundleError(`Web ${name} 无效：必需文件 ${path} 不存在。`);
    }
    if (info.isSymbolicLink()) {
      throw bundleError(`Web ${name} 无效：必需文件 ${path} 是 symbolic link。`);
    }
    if (!info.isFile()) {
      throw bundleError(`Web ${name} 无效：必需文件 ${path} 不是普通文件。`);
    }
    files.push(file);
  }
}

async function buildFileRecords(repositoryRoot, files) {
  const records = [];
  for (const file of files) {
    const path = toPosixPath(relative(repositoryRoot, file));
    assertRelativeBundlePath(path);
    records.push({ path, sha256: sha256(await readFile(file)) });
  }
  records.sort((left, right) => compareStrings(left.path, right.path));
  return records;
}

async function inspectWebSource(repositoryRoot) {
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const sourceRoot = resolve(resolvedRepositoryRoot, WEB_SOURCE_PATH);
  const files = [];
  for (const directory of ['public', 'src']) {
    const path = resolve(sourceRoot, directory);
    await assertSourceDirectory(path, resolvedRepositoryRoot);
    await walkSourceFiles(path, resolvedRepositoryRoot, files);
  }
  await appendRequiredFiles(resolvedRepositoryRoot, WEB_SOURCE_FILES, files, 'source');

  const records = await buildFileRecords(resolvedRepositoryRoot, files);
  return {
    path: WEB_SOURCE_PATH,
    fileCount: records.length,
    files: records,
    sha256: sha256(`${JSON.stringify(records)}\n`),
  };
}

export async function readWebToolchainRequirements(
  repositoryRoot = defaultRepositoryRoot,
) {
  const packageText = await readFile(resolve(repositoryRoot, 'package.json'), 'utf8');
  let packageJson;
  try {
    packageJson = JSON.parse(packageText);
  } catch {
    throw bundleError('Web recipe 无效：根 package.json 不是合法 JSON。');
  }
  const node = isRecord(packageJson.engines) ? packageJson.engines.node : undefined;
  const packageManager = packageJson.packageManager;
  const pnpm =
    typeof packageManager === 'string' && packageManager.startsWith('pnpm@')
      ? packageManager.slice('pnpm@'.length)
      : '';
  if (
    typeof node !== 'string' ||
    !NODE_REQUIREMENT_PATTERN.test(node) ||
    !SEMVER_PATTERN.test(pnpm)
  ) {
    throw bundleError(
      'Web recipe 无效：根 package.json 必须通过 engines.node 声明 >=x.y.z 的 Node 最低版本，并通过 packageManager 声明确定的 pnpm semver。',
    );
  }
  return { node, pnpm };
}

async function inspectWebRecipe(repositoryRoot) {
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const files = [];
  await appendRequiredFiles(resolvedRepositoryRoot, WEB_RECIPE_FILES, files, 'recipe');
  const [toolchainRequirements, records] = await Promise.all([
    readWebToolchainRequirements(resolvedRepositoryRoot),
    buildFileRecords(resolvedRepositoryRoot, files),
  ]);
  return {
    toolchainRequirements,
    fileCount: records.length,
    files: records,
    sha256: sha256(`${JSON.stringify({ toolchainRequirements, files: records })}\n`),
  };
}

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

async function assertLocalReferences(indexHtml, target) {
  const references = new Set();
  const entryTagPattern = /<(script|link)\b([^>]*)>/gi;
  for (const tagMatch of indexHtml.matchAll(entryTagPattern)) {
    const attributeName = tagMatch[1].toLowerCase() === 'script' ? 'src' : 'href';
    const attributePattern = new RegExp(
      `(?:^|\\s)${attributeName}\\s*=\\s*(["'])(.*?)\\1`,
      'i',
    );
    const attributeMatch = attributePattern.exec(tagMatch[2]);
    if (attributeMatch === null) {
      continue;
    }
    const reference = attributeMatch[2];
    if (
      reference.startsWith('//') ||
      reference.startsWith('#') ||
      /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(reference)
    ) {
      continue;
    }
    if (!reference.startsWith('/')) {
      throw bundleError(
        `Web 产物无效：index.html 的本地入口必须使用以 / 开头的路径，深层 SPA 路由无法加载 ${reference}。`,
      );
    }
    references.add(reference);
  }

  for (const reference of references) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(reference, 'http://hakimi-web.local').pathname);
    } catch {
      throw bundleError(`Web 产物无效：index.html 包含无法解析的本地引用 ${reference}。`);
    }
    const filePath = resolve(target, pathname.replace(/^\/+/, ''));
    if (filePath !== target && !filePath.startsWith(`${target}${sep}`)) {
      throw bundleError(`Web 产物无效：index.html 的本地引用越出 dist-web：${reference}。`);
    }
    await assertFile(filePath, `index.html 引用的 ${reference}`);
  }
}

async function inspectWebBundle(target) {
  const indexHtmlPath = resolve(target, 'index.html');
  await assertFile(indexHtmlPath, 'index.html');
  await assertFile(resolve(target, 'boot.js'), 'boot.js');

  const rawIndexHtml = await readFile(indexHtmlPath, 'utf8');
  if (/^(<<<<<<<|=======|>>>>>>>)(?: .*)?$/m.test(rawIndexHtml)) {
    throw new Error(`${indexHtmlPath} 包含未解决的 Git 冲突标记。`);
  }

  const indexHtml = stripHtmlComments(rawIndexHtml);
  if (!indexHtml.includes('<title>Hakimi Web</title>')) {
    throw bundleError('Web 产物无效：index.html 未包含 Hakimi Web 标题。');
  }
  await assertLocalReferences(indexHtml, target);

  const files = await walkFiles(target);
  files.sort((left, right) => compareStrings(toPosixPath(relative(target, left)), toPosixPath(relative(target, right))));
  for (const file of files) {
    const extension = extname(file);
    if (extension !== '.html' && extension !== '.js') {
      continue;
    }
    const body = await readFile(file, 'utf8');
    const displayText = extension === '.html' ? stripHtmlComments(body) : body;
    if (displayText.includes('Kimi Code')) {
      throw bundleError(
        `Web 产物无效：${toPosixPath(relative(target, file))} 仍包含未修补的 Kimi Code 展示品牌。`,
      );
    }
  }

  const records = [];
  for (const file of files) {
    const path = toPosixPath(relative(target, file));
    assertRelativeBundlePath(path);
    records.push({ path, sha256: sha256(await readFile(file)) });
  }
  const bundle = {
    fileCount: records.length,
    files: records,
    sha256: sha256(`${JSON.stringify(records)}\n`),
  };
  return { files, bundle };
}

function validateFileManifest(value, name, digestPayload = (records) => records) {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw bundleError(`Web provenance 无效：${name} 必须包含 files 清单。`);
  }
  if (!Number.isSafeInteger(value.fileCount) || value.fileCount < 0) {
    throw bundleError(`Web provenance 无效：${name}.fileCount 必须是非负整数。`);
  }
  if (value.fileCount !== value.files.length) {
    throw bundleError(`Web provenance 无效：${name}.fileCount 与 files 清单长度不一致。`);
  }

  const records = [];
  for (const entry of value.files) {
    if (!isRecord(entry)) {
      throw bundleError(`Web provenance 无效：${name}.files 的每一项必须是 object。`);
    }
    assertRelativeBundlePath(entry.path);
    if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) {
      throw bundleError(`Web provenance 无效：${entry.path} 的 sha256 必须是 64 位小写摘要。`);
    }
    records.push({ path: entry.path, sha256: entry.sha256 });
  }
  const sorted = [...records].sort((left, right) => compareStrings(left.path, right.path));
  if (JSON.stringify(records) !== JSON.stringify(sorted)) {
    throw bundleError(`Web provenance 无效：${name}.files 必须按 path 排序。`);
  }
  if (new Set(records.map((entry) => entry.path)).size !== records.length) {
    throw bundleError(`Web provenance 无效：${name}.files 包含重复路径。`);
  }
  if (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)) {
    throw bundleError(`Web provenance 无效：${name}.sha256 必须是 64 位小写摘要。`);
  }
  const recordedDigest = sha256(`${JSON.stringify(digestPayload(records))}\n`);
  if (value.sha256 !== recordedDigest) {
    throw bundleError(`Web provenance 无效：${name}.sha256 与记录的文件清单不一致。`);
  }
  return { fileCount: value.fileCount, files: records, sha256: value.sha256 };
}

function validateToolchainRequirements(value) {
  if (
    !isRecord(value) ||
    typeof value.node !== 'string' ||
    !NODE_REQUIREMENT_PATTERN.test(value.node) ||
    typeof value.pnpm !== 'string' ||
    !SEMVER_PATTERN.test(value.pnpm)
  ) {
    throw bundleError(
      'Web provenance 无效：recipe.toolchainRequirements 必须包含 >=x.y.z 的 Node 最低版本和确定的 pnpm semver。',
    );
  }
  return { node: value.node, pnpm: value.pnpm };
}

function validateRecipe(value) {
  if (!isRecord(value)) {
    throw bundleError('Web provenance 无效：recipe 必须是 object。');
  }
  const toolchainRequirements = validateToolchainRequirements(value.toolchainRequirements);
  const manifest = validateFileManifest(value, 'recipe', (files) => ({
    toolchainRequirements,
    files,
  }));
  const paths = manifest.files.map((entry) => entry.path);
  if (JSON.stringify(paths) !== JSON.stringify(WEB_RECIPE_FILES)) {
    throw bundleError('Web provenance 无效：recipe.files 必须精确覆盖 canonical build recipe。');
  }
  return { toolchainRequirements, ...manifest };
}

function validateRecordedProvenance(value) {
  if (!isRecord(value)) {
    throw bundleError('Web provenance 无效：web-base.json 必须是 JSON object。');
  }
  if (value.schemaVersion !== WEB_PROVENANCE_SCHEMA_VERSION) {
    throw bundleError(
      `Web provenance 无效：schemaVersion 必须是 ${WEB_PROVENANCE_SCHEMA_VERSION}。`,
    );
  }
  assertSourceRepository(value.repository);
  if (!isRecord(value.source) || value.source.path !== WEB_SOURCE_PATH) {
    throw bundleError(
      `Web provenance 无效：source.path 必须是 ${JSON.stringify(WEB_SOURCE_PATH)}。`,
    );
  }
  const source = validateFileManifest(value.source, 'source');
  for (const entry of source.files) {
    if (!entry.path.startsWith(`${WEB_SOURCE_PATH}/`)) {
      throw bundleError(`Web provenance 无效：source 文件 ${entry.path} 不属于 ${WEB_SOURCE_PATH}。`);
    }
  }
  const requiredSourceFiles = [
    ...WEB_SOURCE_FILES,
    `${WEB_SOURCE_PATH}/public/boot.js`,
    `${WEB_SOURCE_PATH}/src/main.ts`,
  ];
  const recordedSourcePaths = new Set(source.files.map((entry) => entry.path));
  for (const path of requiredSourceFiles) {
    if (!recordedSourcePaths.has(path)) {
      throw bundleError(`Web provenance 无效：source 清单缺少必需构建输入 ${path}。`);
    }
  }
  const recipe = validateRecipe(value.recipe);
  if (value.brandingPatchVersion !== WEB_BRANDING_PATCH_VERSION) {
    throw bundleError(
      `Web provenance 无效：brandingPatchVersion 应为 ${WEB_BRANDING_PATCH_VERSION}，实际为 ${JSON.stringify(value.brandingPatchVersion)}。`,
    );
  }
  const bundle = validateFileManifest(value.bundle, 'bundle');

  return {
    schemaVersion: value.schemaVersion,
    repository: value.repository,
    source: { path: value.source.path, ...source },
    recipe,
    brandingPatchVersion: value.brandingPatchVersion,
    bundle,
  };
}

async function readRecordedProvenance(provenancePath) {
  let text;
  try {
    text = await readFile(provenancePath, 'utf8');
  } catch {
    throw bundleError(`Web provenance 缺失：无法读取 ${provenancePath}。`);
  }
  try {
    return validateRecordedProvenance(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw bundleError(`Web provenance 无效：${provenancePath} 不是合法 JSON。`);
    }
    throw error;
  }
}

export async function buildWebProvenance({
  target = defaultTarget,
  repositoryRoot = defaultRepositoryRoot,
} = {}) {
  const [{ bundle }, source, recipe] = await Promise.all([
    inspectWebBundle(target),
    inspectWebSource(repositoryRoot),
    inspectWebRecipe(repositoryRoot),
  ]);
  return {
    schemaVersion: WEB_PROVENANCE_SCHEMA_VERSION,
    repository: WEB_SOURCE_REPOSITORY,
    source,
    recipe,
    brandingPatchVersion: WEB_BRANDING_PATCH_VERSION,
    bundle,
  };
}

function assertManifestMatches(name, recorded, actual) {
  const prefix =
    name === 'source'
      ? 'Web source 已漂移'
      : name === 'recipe'
        ? 'Web recipe 已漂移'
        : 'Web provenance 已过期';
  if (recorded.fileCount !== actual.fileCount) {
    throw bundleError(
      `${prefix}：记录 ${recorded.fileCount} 个文件，当前 ${name} 有 ${actual.fileCount} 个文件。`,
    );
  }
  for (let index = 0; index < actual.files.length; index += 1) {
    const recordedFile = recorded.files[index];
    const actualFile = actual.files[index];
    if (recordedFile.path !== actualFile.path) {
      throw bundleError(
        `${prefix}：文件清单不一致（记录 ${recordedFile.path}，当前 ${actualFile.path}）。`,
      );
    }
    if (recordedFile.sha256 !== actualFile.sha256) {
      throw bundleError(`${prefix}：${actualFile.path} 的 sha256 不匹配。`);
    }
  }
  if (recorded.sha256 !== actual.sha256) {
    throw bundleError(`${prefix}：${name}.sha256 与当前 ${name} 不匹配。`);
  }
}

async function inspectAgainstProvenance(
  target,
  provenance,
  {
    repositoryRoot = defaultRepositoryRoot,
    verifySource = true,
    verifyRecipe = true,
  } = {},
) {
  let source = provenance.source;
  if (verifySource) {
    source = await inspectWebSource(repositoryRoot);
    assertManifestMatches('source', provenance.source, source);
  }
  let recipe = provenance.recipe;
  if (verifyRecipe) {
    recipe = await inspectWebRecipe(repositoryRoot);
    if (
      JSON.stringify(provenance.recipe.toolchainRequirements) !==
      JSON.stringify(recipe.toolchainRequirements)
    ) {
      throw bundleError('Web recipe 已漂移：toolchain requirements 不匹配。');
    }
    assertManifestMatches('recipe', provenance.recipe, recipe);
  }
  const { files, bundle } = await inspectWebBundle(target);
  assertManifestMatches('bundle', provenance.bundle, bundle);
  return { files, source, recipe, bundle, provenance };
}

export async function verifyWebAssetsAgainstProvenance(target, provenance, options) {
  return inspectAgainstProvenance(target, validateRecordedProvenance(provenance), options);
}

export async function verifyWebAssets(
  target = defaultTarget,
  provenancePath = defaultProvenancePath,
  repositoryRoot = defaultRepositoryRoot,
) {
  const provenance = await readRecordedProvenance(provenancePath);
  return inspectAgainstProvenance(target, provenance, { repositoryRoot });
}

export async function assertWebAssets(
  target = defaultTarget,
  provenancePath = defaultProvenancePath,
  repositoryRoot = defaultRepositoryRoot,
) {
  return (await verifyWebAssets(target, provenancePath, repositoryRoot)).files;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, provenance } = await verifyWebAssets();
  console.log(
    `Web assets OK: ${defaultTarget} (${files.length} files, source ${provenance.source.sha256}, recipe ${provenance.recipe.sha256}, provenance verified)`,
  );
}
