import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';

import type { ProviderConfig } from '@moonshot-ai/kosong';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildRuntimeToolExposurePlan } from '../../src/agent/tool-exposure';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import type { SDKSessionRPC } from '../../src/rpc';
import { Session } from '../../src/session';
import { ProviderManager } from '../../src/session/provider-manager';
import {
  createDefaultBenchmarkAdapterRegistry,
  compileResearchContextPack,
  createWorkFrame,
  evaluateFinalGate,
  runResearchEvalCase,
  type ResearchActionRecord,
} from '../../src';
import { testKaos } from '../fixtures/test-kaos';

const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const satisfies ProviderConfig;

const REPO_ROOT = resolve(
  dirname(import.meta.filename),
  '..',
  '..',
  '..',
  '..',
);
const LIBRPA_ADAPTER_ID = 'adapter.librpa.head-wing-smoke';
const LIBRPA_DOMAIN = 'librpa/head-wing';
const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('LibRPA file-backed vertical slice', () => {
  it('runs the default head-wing smoke adapter as a deterministic benchmark contract', () => {
    const registry = createDefaultBenchmarkAdapterRegistry();

    const passed = registry.run(LIBRPA_ADAPTER_ID, {
      caseId: 'case.librpa.head-wing-smoke',
      sourceRefs: ['fixture:librpa/head-wing-smoke'],
      payload: {
        expected: { head: 1, wing: 0.25 },
        observed: { head: 1, wing: 0.2500001 },
        tolerance: 1e-6,
      },
    });
    const failed = registry.run(LIBRPA_ADAPTER_ID, {
      caseId: 'case.librpa.head-wing-smoke',
      payload: {
        expected: { head: 1, wing: 0.25 },
        observed: { head: 1, wing: 0.4 },
        tolerance: 1e-6,
      },
    });
    const blocked = registry.run(LIBRPA_ADAPTER_ID, {
      payload: { expected: { head: 1 }, observed: { head: 'bad' }, tolerance: 1e-6 },
    });

    expect(registry.listAdapters({ domain: LIBRPA_DOMAIN }).map((adapter) => adapter.id)).toEqual([
      LIBRPA_ADAPTER_ID,
    ]);
    expect(passed).toMatchObject({
      adapterId: LIBRPA_ADAPTER_ID,
      outcome: 'pass',
      actionId: 'benchmark.run_minimal_case',
      checkResults: [
        expect.objectContaining({
          checkId: 'check.librpa-head-wing.benchmark',
          status: 'passed',
        }),
      ],
    });
    expect(passed.evidenceRefs).toContain('benchmark:case.librpa.head-wing-smoke');
    expect(failed).toMatchObject({
      outcome: 'fail',
      checkResults: [expect.objectContaining({ status: 'failed' })],
    });
    expect(blocked).toMatchObject({
      outcome: 'blocked',
      checkResults: [expect.objectContaining({ status: 'missing' })],
    });
  });

  it('loads LibRPA .aitp files into an isolated session and closes the context/eval loop', async () => {
    const oldFlags = saveFlags([
      'KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE',
      'KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE',
      'KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY',
      'KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER',
      'KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS',
    ]);
    setFlags(oldFlags.map((item) => item.key));
    try {
      const workDir = await makeTempDir('kimi-librpa-vertical-work-');
      const userHome = await makeTempDir('kimi-librpa-vertical-home-');
      const sessionDir = await makeTempDir('kimi-librpa-vertical-session-');
      await mkdir(join(workDir, '.git'));
      await cp(join(REPO_ROOT, '.aitp'), join(workDir, '.aitp'), { recursive: true });

      const session = new Session({
        id: 'test-librpa-vertical',
        kaos: testKaos.withCwd(workDir),
        homedir: sessionDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        domainProfiles: { userHomeDir: userHome },
        workflowRecipes: { userHomeDir: userHome },
        physicsMemory: { userHomeDir: userHome },
        researchLedger: { userHomeDir: userHome },
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

      expect(agent.domainProfiles?.listDomains()).toEqual([
        LIBRPA_DOMAIN,
        'topological-order/fqhe-cs',
      ]);
      expect(agent.workflowRecipes?.listDomains()).toEqual([
        LIBRPA_DOMAIN,
        'topological-order/fqhe-cs',
      ]);
      expect(agent.physicsMemory?.registry.listDomains()).toEqual([
        LIBRPA_DOMAIN,
        'topological-order/fqhe-cs',
      ]);
      expect(agent.researchHarness?.listDomains()).toEqual([
        LIBRPA_DOMAIN,
        'topological-order/fqhe-cs',
      ]);

      const frame = createWorkFrame({
        id: 'frame.librpa.head-wing',
        domain: LIBRPA_DOMAIN,
        topic: 'librpa-head-wing',
        goal: 'Map and check a LibRPA head-wing formula-code edit.',
        activeObjectIds: ['formula.librpa.head-wing.update'],
        sourceRefs: ['prompt:librpa-head-wing'],
      });
      const pack = compileResearchContextPack({
        workFrame: frame,
        domainProfiles: agent.domainProfiles,
        workflowRecipes: agent.workflowRecipes,
        physicsMemory: agent.physicsMemory?.registry,
        researchLedger: agent.researchLedger?.registry,
        researchHarness: agent.researchHarness,
        now: () => 123,
      });
      const exposure = buildRuntimeToolExposurePlan(pack);

      expect(pack.profiles.map((profile) => profile.id)).toEqual(['domain.librpa.head-wing']);
      expect(pack.workflows.map((workflow) => workflow.id)).toEqual([
        'workflow.librpa.head-wing.formula-code-mapping',
      ]);
      expect(pack.physics.capsules.map((capsule) => capsule.id)).toEqual([
        'benchmark.librpa.head-wing.smoke',
        'codemapping.librpa.head-wing.formula-code-region',
        'formula.librpa.head-wing.update',
      ]);
      expect(pack.physics.capsules.some((capsule) => capsule.id.includes('fqhe'))).toBe(false);
      expect(pack.domainPack).toMatchObject({
        domain: LIBRPA_DOMAIN,
        profileIds: ['domain.librpa.head-wing'],
        workflowIds: ['workflow.librpa.head-wing.formula-code-mapping'],
        evalCaseIds: ['eval.librpa.head-wing.minimal'],
        requiredTools: ['Bash', 'Edit'],
      });
      expect(pack.domainPack?.capsuleIds.some((capsuleId) => capsuleId.includes('fqhe'))).toBe(
        false,
      );
      expect(pack.domainPack?.evalCaseIds.some((evalCaseId) => evalCaseId.includes('fqhe'))).toBe(
        false,
      );
      expect(pack.actionBindings.map((binding) => binding.id)).toEqual(
        expect.arrayContaining([
          'binding.librpa-head-wing.inspect-call-sites',
          'binding.librpa-head-wing.map-formula-code-region',
          'binding.librpa-head-wing.capture-git-diff',
          'binding.librpa-head-wing.run-minimal-case',
        ]),
      );
      expect(pack.actionBindings).toContainEqual(
        expect.objectContaining({
          actionId: 'benchmark.run_minimal_case',
          adapterId: LIBRPA_ADAPTER_ID,
          checkId: 'check.librpa-head-wing.benchmark',
        }),
      );
      expect(exposure.activeToolNames).toEqual(
        expect.arrayContaining(['PhysicsMemory', 'ResearchLedger', 'ResearchAction', 'Bash', 'Edit']),
      );

      const benchmarkRun = createDefaultBenchmarkAdapterRegistry().run(LIBRPA_ADAPTER_ID, {
        caseId: 'case.librpa.head-wing-smoke',
        payload: {
          expected: { head: 1, wing: 0.25 },
          observed: { head: 1, wing: 0.25 },
          tolerance: 1e-6,
        },
      });
      const evalFile = agent.researchHarness?.requireEvalCase('eval.librpa.head-wing.minimal');
      if (evalFile === undefined) throw new Error('Expected LibRPA eval case to be loaded.');

      const evalRun = runResearchEvalCase({
        evalCase: evalFile.evalCase,
        actionRecords: [
          actionRecord('code.inspect_call_sites', 'pass'),
          actionRecord('code.map_formula_to_code_region', 'pass'),
          actionRecord('code.capture_git_diff_observation', 'pass', ['git:diff:librpa-head-wing']),
          actionRecord('benchmark.run_minimal_case', 'pass', benchmarkRun.evidenceRefs),
        ],
        checkResults: benchmarkRun.checkResults,
        finalStatus: 'checked',
        finalAnswerText: 'The checked claim is supported by mapped code and benchmark evidence.',
      });
      const finalGate = evaluateFinalGate({
        requestedStatus: 'checked',
        obligations: [],
        workFrame: frame,
        evidenceRefs: benchmarkRun.evidenceRefs,
        sourceRefs: pack.sourceRefs,
      });

      expect(evalRun.outcome).toBe('pass');
      expect(finalGate).toMatchObject({
        outcome: 'allow',
        allowedStatus: 'checked',
      });
    } finally {
      restoreFlags(oldFlags);
    }
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function actionRecord(
  actionId: string,
  outcome: ResearchActionRecord['outcome'],
  evidenceRefs: readonly string[] = [`evidence:${actionId}`],
): ResearchActionRecord {
  return {
    actionId,
    callId: `call.${actionId}`,
    source: 'model',
    input: {},
    output: {},
    graphRefs: [],
    capsuleRefs: ['formula.librpa.head-wing.update'],
    ledgerEventIds: [],
    evidenceRefs,
    outcome,
    nextSuggestedActions: [],
  };
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

function saveFlags(keys: readonly string[]): Array<{ readonly key: string; readonly value: string | undefined }> {
  return keys.map((key) => ({ key, value: process.env[key] }));
}

function setFlags(keys: readonly string[]): void {
  for (const key of keys) process.env[key] = '1';
}

function restoreFlags(flags: readonly { readonly key: string; readonly value: string | undefined }[]): void {
  for (const { key, value } of flags) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
