import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';

import { discoverPhysicsCapsules, resolvePhysicsMemoryRoots } from '../../src/physics-memory';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('physics memory scanner', () => {
  it('discovers markdown capsules recursively', async () => {
    const root = await makeTempDir();
    await mkdir(join(root, 'nested'), { recursive: true });
    await writeFile(join(root, 'nested', 'formula.md'), validCapsule('formula.test'), 'utf8');

    const capsules = await discoverPhysicsCapsules({
      roots: [{ path: root, source: 'project' }],
    });

    expect(capsules.map((capsule) => capsule.metadata.id)).toEqual(['formula.test']);
  });

  it('resolves project and user memory roots when present', async () => {
    const project = await makeTempDir();
    const user = await makeTempDir();
    await mkdir(join(project, '.git'));
    await mkdir(join(project, '.aitp', 'physics-memory'), { recursive: true });
    await mkdir(join(user, '.aitp', 'physics-memory'), { recursive: true });

    const roots = await resolvePhysicsMemoryRoots({
      paths: { workDir: join(project, 'subdir'), userHomeDir: user },
    });

    expect(roots.map((root) => root.source)).toEqual(['project', 'user']);
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kimi-physics-memory-'));
  tempDirs.push(dir);
  return dir;
}

function validCapsule(id: string): string {
  return [
    '---',
    `id: ${id}`,
    'kind: Formula',
    'domain: test',
    `title: ${id}`,
    'reliability: linked',
    'source_refs:',
    '  - local:test',
    '---',
    'Body',
  ].join('\n');
}
