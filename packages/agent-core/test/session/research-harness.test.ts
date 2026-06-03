import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'pathe';

import type { ProviderConfig } from '@moonshot-ai/kosong';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('Session research harness evals', () => {
  it('loads project .aitp/evals when the feature flag is enabled', async () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS'];
    process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS'] = '1';
    try {
      const workDir = await makeTempDir('kimi-research-harness-work-');
      const userHome = await makeTempDir('kimi-research-harness-home-');
      const sessionDir = await makeTempDir('kimi-research-harness-session-');
      await mkdir(join(workDir, '.git'));
      await writeEvalCase(join(workDir, '.aitp', 'evals', 'fqhe', 'charge-flux.md'));

      const session = new Session({
        id: 'test-research-harness',
        kaos: testKaos.withCwd(workDir),
        homedir: sessionDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        researchHarness: { userHomeDir: userHome },
        providerManager: testProviderManager(),
      });

      const { agent } = await session.createAgent({
        type: 'main',
        persistence: new InMemoryAgentRecordPersistence([]),
      });
      agent.config.update({
        cwd: workDir,
        modelAlias: MOCK_PROVIDER.model,
      });

      expect(agent.researchHarness?.listDomains()).toEqual(
        expect.arrayContaining(['topological-order/fqhe-cs', 'theoretical-physics/general']),
      );
      expect(agent.researchHarness?.requireEvalCase('eval.fqhe.charge-flux').source).toBe(
        'project',
      );
    } finally {
      restoreEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS', oldFlag);
    }
  });

  it('keeps sessions unchanged when the research harness flag is disabled', async () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS'];
    process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS'] = '0';
    try {
      const workDir = await makeTempDir('kimi-research-harness-off-work-');
      const sessionDir = await makeTempDir('kimi-research-harness-off-session-');
      await mkdir(join(workDir, '.git'));
      await writeEvalCase(join(workDir, '.aitp', 'evals', 'fqhe', 'charge-flux.md'));

      const session = new Session({
        id: 'test-research-harness-off',
        kaos: testKaos.withCwd(workDir),
        homedir: sessionDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        providerManager: testProviderManager(),
      });

      const { agent } = await session.createAgent({
        type: 'main',
        persistence: new InMemoryAgentRecordPersistence([]),
      });

      expect(agent.researchHarness).toBeNull();
    } finally {
      restoreEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS', oldFlag);
    }
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeEvalCase(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    [
      '---',
      'id: eval.fqhe.charge-flux',
      'kind: research_eval_case',
      'title: FQHE charge-flux convention',
      'task: Explain inverse fractional charge and flux period safely.',
      'domain: topological-order/fqhe-cs',
      'source_refs:',
      '  - local:test',
      'required_action_bindings:',
      '  - action_id: validate.check_convention',
      '    domain_id: topological-order/fqhe-cs',
      '    check_id: check.charge-flux-quantization.convention',
      'expected_final_status: checked',
      '---',
      'Eval body.',
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
