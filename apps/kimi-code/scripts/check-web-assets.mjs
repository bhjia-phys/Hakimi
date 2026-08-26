// Validate the committed prebuilt web bundle and its source provenance before packaging.
//
// The browser UI source lives in the external code-app repo. Hakimi commits only
// the branded dist-web bundle plus web-base.json, which binds the declared source
// identity and branding patch version to an exact file list and content hashes.
// This is drift-detection metadata, not a signed source attestation.

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEB_BRANDING_PATCH_VERSION } from './patch-web-branding.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultTarget = resolve(appRoot, 'dist-web');
const defaultProvenancePath = resolve(appRoot, 'web-base.json');
export const WEB_SOURCE_REPOSITORY = 'code-app';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const syncHelp =
  'web 产物由 code-app 仓同步（见根 AGENTS.md）。请依次运行 ' +
  '`KIMI_CODE_REPO=<此 checkout> pnpm run sync:web`、' +
  '`node apps/kimi-code/scripts/patch-web-branding.mjs`、' +
  '`node apps/kimi-code/scripts/record-web-provenance.mjs --repository code-app --commit <source-commit>`，' +
  '再运行本检查并提交 dist-web 与 web-base.json。';

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

function assertSourceIdentity(repository, commit) {
  if (repository !== WEB_SOURCE_REPOSITORY) {
    throw bundleError(
      `Web provenance 无效：repository 必须是 ${JSON.stringify(WEB_SOURCE_REPOSITORY)}。`,
    );
  }
  if (typeof commit !== 'string' || !COMMIT_PATTERN.test(commit)) {
    throw bundleError('Web provenance 无效：commit 必须是 40 位小写 Git SHA。');
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

function validateRecordedProvenance(value) {
  if (!isRecord(value)) {
    throw bundleError('Web provenance 无效：web-base.json 必须是 JSON object。');
  }
  assertSourceIdentity(value.repository, value.commit);
  if (value.brandingPatchVersion !== WEB_BRANDING_PATCH_VERSION) {
    throw bundleError(
      `Web provenance 无效：brandingPatchVersion 应为 ${WEB_BRANDING_PATCH_VERSION}，实际为 ${JSON.stringify(value.brandingPatchVersion)}。`,
    );
  }
  if (!isRecord(value.bundle) || !Array.isArray(value.bundle.files)) {
    throw bundleError('Web provenance 无效：bundle 必须包含 files 清单。');
  }
  if (!Number.isSafeInteger(value.bundle.fileCount) || value.bundle.fileCount < 0) {
    throw bundleError('Web provenance 无效：bundle.fileCount 必须是非负整数。');
  }
  if (value.bundle.fileCount !== value.bundle.files.length) {
    throw bundleError('Web provenance 无效：bundle.fileCount 与 files 清单长度不一致。');
  }

  const records = [];
  for (const entry of value.bundle.files) {
    if (!isRecord(entry)) {
      throw bundleError('Web provenance 无效：bundle.files 的每一项必须是 object。');
    }
    assertRelativeBundlePath(entry.path);
    if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) {
      throw bundleError(`Web provenance 无效：${entry.path} 的 sha256 必须是 64 位小写摘要。`);
    }
    records.push({ path: entry.path, sha256: entry.sha256 });
  }
  const sorted = [...records].sort((left, right) => compareStrings(left.path, right.path));
  if (JSON.stringify(records) !== JSON.stringify(sorted)) {
    throw bundleError('Web provenance 无效：bundle.files 必须按 path 排序。');
  }
  if (new Set(records.map((entry) => entry.path)).size !== records.length) {
    throw bundleError('Web provenance 无效：bundle.files 包含重复路径。');
  }
  if (typeof value.bundle.sha256 !== 'string' || !SHA256_PATTERN.test(value.bundle.sha256)) {
    throw bundleError('Web provenance 无效：bundle.sha256 必须是 64 位小写摘要。');
  }
  const recordedDigest = sha256(`${JSON.stringify(records)}\n`);
  if (value.bundle.sha256 !== recordedDigest) {
    throw bundleError('Web provenance 无效：bundle.sha256 与记录的文件清单不一致。');
  }

  return {
    repository: value.repository,
    commit: value.commit,
    brandingPatchVersion: value.brandingPatchVersion,
    bundle: {
      fileCount: value.bundle.fileCount,
      files: records,
      sha256: value.bundle.sha256,
    },
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

export async function buildWebProvenance({ target = defaultTarget, repository, commit }) {
  assertSourceIdentity(repository, commit);
  const { bundle } = await inspectWebBundle(target);
  return {
    repository,
    commit,
    brandingPatchVersion: WEB_BRANDING_PATCH_VERSION,
    bundle,
  };
}

async function inspectAgainstProvenance(target, provenance) {
  const { files, bundle } = await inspectWebBundle(target);
  if (provenance.bundle.fileCount !== bundle.fileCount) {
    throw bundleError(
      `Web provenance 已过期：记录 ${provenance.bundle.fileCount} 个文件，当前 bundle 有 ${bundle.fileCount} 个文件。`,
    );
  }
  for (let index = 0; index < bundle.files.length; index += 1) {
    const recorded = provenance.bundle.files[index];
    const actual = bundle.files[index];
    if (recorded.path !== actual.path) {
      throw bundleError(
        `Web provenance 已过期：文件清单不一致（记录 ${recorded.path}，当前 ${actual.path}）。`,
      );
    }
    if (recorded.sha256 !== actual.sha256) {
      throw bundleError(`Web provenance 已过期：${actual.path} 的 sha256 不匹配。`);
    }
  }
  if (provenance.bundle.sha256 !== bundle.sha256) {
    throw bundleError('Web provenance 已过期：bundle.sha256 与当前 bundle 不匹配。');
  }
  return { files, bundle, provenance };
}

export async function verifyWebAssetsAgainstProvenance(target, provenance) {
  return inspectAgainstProvenance(target, validateRecordedProvenance(provenance));
}

export async function verifyWebAssets(
  target = defaultTarget,
  provenancePath = defaultProvenancePath,
) {
  const provenance = await readRecordedProvenance(provenancePath);
  return inspectAgainstProvenance(target, provenance);
}

export async function assertWebAssets(
  target = defaultTarget,
  provenancePath = defaultProvenancePath,
) {
  return (await verifyWebAssets(target, provenancePath)).files;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await assertWebAssets();
  console.log(`Web assets OK: ${defaultTarget} (${files.length} files, provenance verified)`);
}
