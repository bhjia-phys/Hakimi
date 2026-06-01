import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  ResearchLedgerWriteError,
  writeResearchLedgerEvent,
} from '../../src/research-ledger';

describe('research ledger writer', () => {
  it('writes deterministic topic-scoped event files that parse back through the ledger parser', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aitp-ledger-writer-'));
    onTestFinished(async () => {
      await rm(root, { recursive: true, force: true });
    });

    const result = await writeResearchLedgerEvent({
      root: { path: root, source: 'project' },
      now: new Date('2026-06-02T00:00:00.000Z'),
      metadata: {
        id: 'event.librpa.head-wing.diff',
        type: 'git_diff_observation',
        topic: 'librpa-head-wing',
        domain: 'librpa',
        status: 'captured',
        sourceRefs: ['git:diff:head-wing'],
        dependsOn: ['event.librpa.head-wing.code'],
        candidateCapsuleKind: 'CodeMapping',
        openQuestions: ['confirm head-wing convention'],
        relatedObjects: ['code:librpa/head-wing'],
      },
      body: 'Observed a head-wing code-path change.',
    });

    expect(result.path.replaceAll('\\', '/')).toBe(
      `${root.replaceAll('\\', '/')}/librpa-head-wing/events/event.librpa.head-wing.diff.md`,
    );
    expect(result.event.metadata).toMatchObject({
      id: 'event.librpa.head-wing.diff',
      type: 'git_diff_observation',
      topic: 'librpa-head-wing',
      domain: 'librpa',
      status: 'captured',
      sourceRefs: ['git:diff:head-wing'],
      dependsOn: ['event.librpa.head-wing.code'],
      candidateCapsuleKind: 'CodeMapping',
      openQuestions: ['confirm head-wing convention'],
      relatedObjects: ['code:librpa/head-wing'],
      createdAt: '2026-06-02T00:00:00.000Z',
    });
    expect(await readFile(result.path, 'utf8')).toContain(
      'Observed a head-wing code-path change.',
    );
  });

  it('rejects missing source refs and unsafe slugs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aitp-ledger-writer-'));
    onTestFinished(async () => {
      await rm(root, { recursive: true, force: true });
    });

    await expect(
      writeResearchLedgerEvent({
        root: { path: root, source: 'project' },
        metadata: {
          id: 'event.no-source',
          type: 'source_excerpt',
          topic: 'fqhe',
          domain: 'topological-order',
          status: 'captured',
          sourceRefs: [],
          dependsOn: [],
          openQuestions: [],
          relatedObjects: [],
        },
        body: 'No source refs.',
      }),
    ).rejects.toThrow(ResearchLedgerWriteError);

    await expect(
      writeResearchLedgerEvent({
        root: { path: root, source: 'project' },
        metadata: {
          id: '../escape',
          type: 'source_excerpt',
          topic: 'fqhe',
          domain: 'topological-order',
          status: 'captured',
          sourceRefs: ['local:test'],
          dependsOn: [],
          openQuestions: [],
          relatedObjects: [],
        },
        body: 'Unsafe id.',
      }),
    ).rejects.toThrow(ResearchLedgerWriteError);
  });
});
