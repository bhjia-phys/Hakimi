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
  it('starts new topics with a built-in theoretical physics research pack by default', async () => {
    const workDir = await makeTempDir('kimi-domain-workflow-default-work-');
    const sessionDir = await makeTempDir('kimi-domain-workflow-default-session-');
    await mkdir(join(workDir, '.git'));

    const session = new Session({
      id: 'test-domain-workflow-default',
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
    agent.config.update({
      cwd: workDir,
      modelAlias: MOCK_PROVIDER.model,
    });
    agent.workFrames.open(
      {
        id: 'frame.quantum-gravity-code',
        domain: 'quantum-gravity/spinfoam',
        topic: 'spinfoam-amplitude-code-check',
        goal: 'Search literature, inspect code mapping, prepare patch, and submit a benchmark job if needed.',
      },
      { source: 'controller' },
    );

    const pack = agent.researchContext.compileForWorkFrame(
      { workFrameId: 'frame.quantum-gravity-code' },
      { source: 'controller' },
    );

    expect(agent.domainProfiles?.listDomains()).toContain('theoretical-physics/general');
    expect(pack.profiles.map((profile) => profile.id)).toEqual([
      'domain.theoretical-physics.generic',
    ]);
    expect(pack.workflows.map((workflow) => workflow.id)).toEqual([
      'workflow.theoretical-physics.computational-research',
      'workflow.theoretical-physics.general-research',
    ]);
    expect(pack.physics.capsules.map((capsule) => capsule.id)).toEqual([
      'failure.theoretical-physics.unsourced-or-unscoped-overclaim',
      'workflow.theoretical-physics.boundary-sink-motion-inventory',
      'workflow.theoretical-physics.formula-validation-contract',
      'workflow.theoretical-physics.research-object-discovery',
      'workflow.theoretical-physics.scope-evidence-validation-ladder',
    ]);
    expect(pack.profiles[0]?.lenses).toContain('research_object_discovery');
    expect(pack.profiles[0]?.lenses).toContain('boundary_sink_motion_inventory');
    expect(pack.actionBindings.map((binding) => binding.actionId)).toEqual(
      expect.arrayContaining([
        'physics.apply_direction_lens',
        'source.search_literature',
        'source.capture_source_excerpt',
        'validate.check_source_support',
        'code.prepare_patch',
        'benchmark.submit_external_job',
      ]),
    );
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        lensId: 'research_object_discovery',
        checkId: 'check.theoretical-physics.research-object-inventory',
      }),
    );
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        lensId: 'boundary_sink_motion_inventory',
        checkId: 'check.theoretical-physics.reachability-before-boundary-loss',
        priority: 'blocking',
      }),
    );
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'validate.check_convention',
        lensId: 'boundary_sink_motion_inventory',
        checkId: 'check.theoretical-physics.model-layer-motion-map',
        priority: 'blocking',
      }),
    );
    expect(pack.physics.capsules).toContainEqual(
      expect.objectContaining({
        id: 'workflow.theoretical-physics.boundary-sink-motion-inventory',
        bodyPreview: expect.stringContaining('survival probability'),
        requiredChecks: expect.arrayContaining([
          expect.objectContaining({
            id: 'check.theoretical-physics.model-layer-motion-map',
            severity: 'blocking',
          }),
        ]),
      }),
    );
    expect(pack.physics.capsules).toContainEqual(
      expect.objectContaining({
        id: 'workflow.theoretical-physics.boundary-sink-motion-inventory',
        bodyPreview: expect.stringContaining('layer-by-layer reachability verdict'),
      }),
    );
    expect(pack.domainPack).toMatchObject({
      domain: 'quantum-gravity/spinfoam',
      profileIds: ['domain.theoretical-physics.generic'],
      evalCaseIds: ['eval.theoretical-physics.evidence-loop'],
    });
    expect(pack.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'generic-theoretical-physics-profile-fallback',
          source: 'domain-profile',
        }),
      ]),
    );
  });

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

      expect(agent.domainProfiles?.listDomains()).toEqual(
        expect.arrayContaining(['topological-order/fqhe-cs']),
      );
      expect(agent.domainProfiles?.requireProfile('domain.fqhe-cs').metadata.lenses).toEqual([
        'charge_flux_quantization',
      ]);
      expect(agent.workflowRecipes?.listDomains()).toEqual(
        expect.arrayContaining(['topological-order/fqhe-cs']),
      );
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
    process.env['KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE'] = '0';
    process.env['KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE'] = '0';
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
