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

describe('Session domain profiles and workflow recipes', () => {
  it('loads project .aitp/domain-profiles and .aitp/workflow-recipes when flags are enabled', async () => {
    const oldDomainFlag = process.env['KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE'];
    const oldWorkflowFlag = process.env['KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE'];
    process.env['KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE'] = '1';
    process.env['KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE'] = '1';
    try {
      const workDir = await makeTempDir('kimi-domain-workflow-work-');
      const userHome = await makeTempDir('kimi-domain-workflow-home-');
      const sessionDir = await makeTempDir('kimi-domain-workflow-session-');
      await mkdir(join(workDir, '.git'));
      await writeDomainProfile(join(workDir, '.aitp', 'domain-profiles', 'fqhe.md'));
      await writeWorkflowRecipe(
        join(workDir, '.aitp', 'workflow-recipes', 'fqhe', 'charge-flux.md'),
      );

      const session = new Session({
        id: 'test-domain-workflow',
        kaos: testKaos.withCwd(workDir),
        homedir: sessionDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        domainProfiles: { userHomeDir: userHome },
        workflowRecipes: { userHomeDir: userHome },
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

      expect(agent.domainProfiles?.listDomains()).toEqual(['topological-order/fqhe-cs']);
      expect(agent.domainProfiles?.requireProfile('domain.fqhe-cs').metadata.lenses).toEqual([
        'charge_flux_quantization',
      ]);
      expect(agent.workflowRecipes?.listDomains()).toEqual(['topological-order/fqhe-cs']);
      expect(
        agent.workflowRecipes?.requireRecipe('workflow.fqhe-cs.charge-flux').metadata
          .actionBindings,
      ).toEqual([
        expect.objectContaining({
          actionId: 'validate.check_convention',
          checkId: 'check.charge-flux-quantization.convention',
        }),
      ]);
    } finally {
      restoreEnv('KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE', oldDomainFlag);
      restoreEnv('KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE', oldWorkflowFlag);
    }
  });

  it('keeps sessions unchanged when flags are disabled', async () => {
    const oldDomainFlag = process.env['KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE'];
    const oldWorkflowFlag = process.env['KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE'];
    delete process.env['KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE'];
    delete process.env['KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE'];
    try {
      const workDir = await makeTempDir('kimi-domain-workflow-off-work-');
      const sessionDir = await makeTempDir('kimi-domain-workflow-off-session-');
      await mkdir(join(workDir, '.git'));
      await writeDomainProfile(join(workDir, '.aitp', 'domain-profiles', 'fqhe.md'));
      await writeWorkflowRecipe(
        join(workDir, '.aitp', 'workflow-recipes', 'fqhe', 'charge-flux.md'),
      );

      const session = new Session({
        id: 'test-domain-workflow-off',
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

      expect(agent.domainProfiles).toBeNull();
      expect(agent.workflowRecipes).toBeNull();
    } finally {
      restoreEnv('KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE', oldDomainFlag);
      restoreEnv('KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE', oldWorkflowFlag);
    }
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeDomainProfile(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    [
      '---',
      'id: domain.fqhe-cs',
      'kind: domain_profile',
      'title: FQHE/CS profile',
      'domain: topological-order/fqhe-cs',
      'status: raw',
      'source_refs:',
      '  - local:test',
      'lenses:',
      '  - charge_flux_quantization',
      'workflows:',
      '  - workflow.fqhe-cs.charge-flux',
      '---',
      'Profile body.',
    ].join('\n'),
    'utf-8',
  );
}

async function writeWorkflowRecipe(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    [
      '---',
      'id: workflow.fqhe-cs.charge-flux',
      'kind: workflow_recipe',
      'title: Charge-flux convention workflow',
      'domain: topological-order/fqhe-cs',
      'status: raw',
      'source_refs:',
      '  - local:test',
      'action_bindings:',
      '  - id: binding.fqhe.convention',
      '    action_id: validate.check_convention',
      '    domain_id: topological-order/fqhe-cs',
      '    lens_id: charge_flux_quantization',
      '    check_id: check.charge-flux-quantization.convention',
      '    priority: blocking',
      '---',
      'Workflow body.',
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
