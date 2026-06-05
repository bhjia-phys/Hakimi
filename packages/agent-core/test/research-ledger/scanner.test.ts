import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';

import {
  discoverResearchLedgerEvents,
  resolveResearchLedgerRoots,
} from '../../src/research-ledger';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('research ledger scanner', () => {
  it('discovers markdown events recursively and ignores README files', async () => {
    const root = await makeTempDir();
    await mkdir(join(root, 'fqhe', 'events'), { recursive: true });
    await writeFile(
      join(root, 'fqhe', 'events', 'flux-note.md'),
      validEvent('event.fqhe.flux-note'),
      'utf8',
    );
    await writeFile(join(root, 'README.md'), validEvent('event.readme'), 'utf8');

    const events = await discoverResearchLedgerEvents({
      roots: [{ path: root, source: 'project' }],
    });

    expect(events.map((event) => event.metadata.id)).toEqual(['event.fqhe.flux-note']);
  });

  it('discovers EVENT.md files', async () => {
    const root = await makeTempDir();
    await mkdir(join(root, 'librpa', 'tool-runs', 'run-1'), { recursive: true });
    await writeFile(
      join(root, 'librpa', 'tool-runs', 'run-1', 'EVENT.md'),
      validEvent('event.librpa.run-1'),
      'utf8',
    );

    const events = await discoverResearchLedgerEvents({
      roots: [{ path: root, source: 'project' }],
    });

    expect(events.map((event) => event.metadata.id)).toEqual(['event.librpa.run-1']);
  });

  it('resolves project and user ledger roots when present', async () => {
    const project = await makeTempDir();
    const user = await makeTempDir();
    await mkdir(join(project, '.git'));
    await mkdir(join(project, '.aitp', 'research-ledger'), { recursive: true });
    await mkdir(join(user, '.aitp', 'research-ledger'), { recursive: true });

    const roots = await resolveResearchLedgerRoots({
      paths: { workDir: join(project, 'subdir'), userHomeDir: user },
    });

    expect(roots.map((root) => root.source)).toEqual(['project', 'user']);
  });

  it('prefers Hakimi ledger roots while keeping legacy .aitp roots readable', async () => {
    const project = await makeTempDir();
    const user = await makeTempDir();
    await mkdir(join(project, '.git'));
    await mkdir(join(project, '.hakimi', 'research-ledger'), { recursive: true });
    await mkdir(join(project, '.aitp', 'research-ledger'), { recursive: true });
    await mkdir(join(user, 'research-ledger'), { recursive: true });
    await mkdir(join(user, '.aitp', 'research-ledger'), { recursive: true });

    const roots = await resolveResearchLedgerRoots({
      paths: { workDir: join(project, 'subdir'), userHomeDir: user },
    });

    expect(roots.map((root) => root.path.replaceAll('\\', '/'))).toEqual([
      expect.stringContaining('/.hakimi/research-ledger'),
      expect.stringContaining('/.aitp/research-ledger'),
      expect.stringMatching(/\/research-ledger$/),
      expect.stringContaining('/.aitp/research-ledger'),
    ]);
    expect(roots.map((root) => root.source)).toEqual(['project', 'project', 'user', 'user']);
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kimi-research-ledger-'));
  tempDirs.push(dir);
  return dir;
}

function validEvent(id: string): string {
  return [
    '---',
    `id: ${id}`,
    'type: source_excerpt',
    'topic: test-topic',
    'domain: test-domain',
    'status: captured',
    'source_refs:',
    '  - local:test',
    '---',
    'Body',
  ].join('\n');
}
