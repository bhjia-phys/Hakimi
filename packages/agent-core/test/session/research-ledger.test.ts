import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'pathe';

import type { ProviderConfig } from '@moonshot-ai/kosong';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import type { SDKSessionRPC } from '../../src/rpc';
import { Session } from '../../src/session';
import { ProviderManager } from '../../src/session/provider-manager';
import { testKaos } from '../fixtures/test-kaos';

const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const satisfies ProviderConfig;

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('Session research ledger', () => {
  it('loads .aitp/research-ledger into agents when the feature flag is enabled', async () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'];
    process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'] = '1';
    try {
      const workDir = await makeTempDir('kimi-research-ledger-work-');
      const userHome = await makeTempDir('kimi-research-ledger-home-');
      const sessionDir = await makeTempDir('kimi-research-ledger-session-');
      await mkdir(join(workDir, '.git'));
      await writeEvent(
        join(workDir, '.aitp', 'research-ledger', 'fqhe', 'events', 'flux-note.md'),
        'event.fqhe.flux-note',
      );
      const records: AgentRecord[] = [];
      const session = new Session({
        id: 'test-research-ledger',
        kaos: testKaos.withCwd(workDir),
        homedir: sessionDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        researchLedger: { userHomeDir: userHome },
        providerManager: testProviderManager(),
      });

      const { agent } = await session.createAgent({
        type: 'main',
        persistence: new InMemoryAgentRecordPersistence([], {
          onRecord: (record) => records.push(record),
        }),
      });
      agent.config.update({
        cwd: workDir,
        modelAlias: MOCK_PROVIDER.model,
      });

      expect(agent.researchLedger?.registry.listTopics()).toEqual(['fqhe-cs-effective-theory']);
      expect(agent.researchLedger?.registry.listDomains()).toEqual(['topological-order']);
      const rootsLoaded = records.find((record) => record.type === 'research_ledger.roots_loaded');
      expect(rootsLoaded).toMatchObject({
        type: 'research_ledger.roots_loaded',
        source: 'session-start',
        eventCount: 1,
        topics: ['fqhe-cs-effective-theory'],
        domains: ['topological-order'],
        diagnostics: [],
      });
      expect(rootsLoaded).toMatchObject({
        roots: [
          expect.objectContaining({
            source: 'project',
            path: expect.stringContaining('/.aitp/research-ledger'),
          }),
        ],
      });
    } finally {
      restoreEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER', oldFlag);
    }
  });

  it('keeps existing sessions without research ledger unchanged when the flag is disabled', async () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'];
    process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'] = '0';
    try {
      const workDir = await makeTempDir('kimi-research-ledger-off-work-');
      const sessionDir = await makeTempDir('kimi-research-ledger-off-session-');
      await mkdir(join(workDir, '.git'));
      await writeEvent(
        join(workDir, '.aitp', 'research-ledger', 'fqhe', 'events', 'flux-note.md'),
        'event.fqhe.flux-note',
      );
      const records: AgentRecord[] = [];
      const session = new Session({
        id: 'test-research-ledger-off',
        kaos: testKaos.withCwd(workDir),
        homedir: sessionDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        providerManager: testProviderManager(),
      });

      const { agent } = await session.createAgent({
        type: 'main',
        persistence: new InMemoryAgentRecordPersistence([], {
          onRecord: (record) => records.push(record),
        }),
      });
      agent.config.update({
        cwd: workDir,
        modelAlias: MOCK_PROVIDER.model,
      });

      expect(agent.researchLedger).toBeNull();
      expect(records.some((record) => record.type.startsWith('research_ledger.'))).toBe(false);
    } finally {
      restoreEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER', oldFlag);
    }
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeEvent(path: string, id: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    [
      '---',
      `id: ${id}`,
      'type: derivation_scratch',
      'topic: fqhe-cs-effective-theory',
      'domain: topological-order',
      'status: linked',
      'source_refs:',
      '  - local:test',
      'candidate_capsule_kind: DerivationStep',
      'open_questions:',
      '  - check flux quantum convention',
      '---',
      'Flux quantization scratch note.',
    ].join('\n'),
    'utf-8',
  );
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function createSessionRpc(): SDKSessionRPC {
  return {
    emitEvent: vi.fn(),
    requestApproval: vi.fn(),
    requestQuestion: vi.fn(),
    toolCall: vi.fn(),
  } as unknown as SDKSessionRPC;
}

function testProviderManager(): ProviderManager {
  return new ProviderManager({
    config: {
      providers: {
        test: {
          type: MOCK_PROVIDER.type,
          apiKey: MOCK_PROVIDER.apiKey,
        },
      },
      models: {
        [MOCK_PROVIDER.model]: {
          provider: 'test',
          model: MOCK_PROVIDER.model,
          maxContextSize: 1_000_000,
        },
      },
    },
  });
}
