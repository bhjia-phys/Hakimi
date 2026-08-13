// Verify the prebuilt web bundle is present before packaging.
//
// apps/kimi-web no longer exists in this repo: the web UI is developed in the
// code-app repo (apps/web) and the built bundle is synced here and committed
// at apps/kimi-code/dist-web (gitignored, force-added). This script replaces
// the old copy-from-source step and rejects an incomplete or conflicted entry
// page before packaging.

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(appRoot, 'dist-web');

async function assertWebAssets() {
  const indexPath = resolve(target, 'index.html');
  let index;
  try {
    const info = await stat(indexPath);
    if (!info.isFile()) {
      throw new Error('index.html is not a file');
    }
    index = await readFile(indexPath, 'utf8');
  } catch {
    throw new Error(
      `未找到已提交的 web 产物 ${indexPath}。web 产物由 code-app 仓同步（见根 AGENTS.md），` +
        '请从该仓运行 `KIMI_CODE_REPO=<此 checkout> pnpm run sync:web` 并提交 dist-web。',
    );
  }

  if (/^(<<<<<<<|=======|>>>>>>>)(?: .*)?$/m.test(index)) {
    throw new Error(`${indexPath} 包含未解决的 Git 冲突标记。`);
  }

  const references = [...index.matchAll(/(?:src|href)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)].map(
    ([, path]) => path.slice(1),
  );
  const missing = [];
  for (const relativePath of references) {
    try {
      const info = await stat(resolve(target, relativePath));
      if (!info.isFile()) missing.push(relativePath);
    } catch {
      missing.push(relativePath);
    }
  }
  if (missing.length > 0) {
    throw new Error(`${indexPath} 引用了不存在的 web 产物：${missing.join(', ')}`);
  }
}

await assertWebAssets();
const files = await readdir(target, { recursive: true });
console.log(`Web assets OK: ${target} (${files.length} entries, synced from code-app)`);
