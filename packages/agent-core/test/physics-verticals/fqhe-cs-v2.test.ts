import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';

import type { ProviderConfig } from '@moonshot-ai/kosong';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { buildRuntimeToolExposurePlan } from '../../src/agent/tool-exposure';
import type { SDKSessionRPC } from '../../src/rpc';
import { Session } from '../../src/session';
import { ProviderManager } from '../../src/session/provider-manager';
import {
  checkFqheChargeFluxConvention,
  compileResearchContextPack,
  createWorkFrame,
  evaluateFinalGate,
  recommendPhysicsLenses,
  runResearchEvalCase,
  type ResearchActionRecord,
  type ResearchEvalCheckResult,
} from '../../src';
import { testKaos } from '../fixtures/test-kaos';

const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const satisfies ProviderConfig;

const REPO_ROOT = resolve(dirname(import.meta.filename), '..', '..', '..', '..');
const FQHE_DOMAIN = 'topological-order/fqhe-cs';
const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('FQHE/CS file-backed theory vertical V2', () => {
  it('loads the file-backed theory vertical and keeps the context pack domain-clean', async () => {
    const oldFlags = saveFlags(featureFlagKeys());
    setFlags(oldFlags.map((item) => item.key));
    try {
      const { agent } = await createIsolatedAgent();

      expect(agent.domainProfiles?.listDomains()).toEqual([
        'librpa/head-wing',
        FQHE_DOMAIN,
      ]);
      expect(agent.workflowRecipes?.listDomains()).toEqual([
        'librpa/head-wing',
        FQHE_DOMAIN,
      ]);
      expect(agent.physicsMemory?.registry.listDomains()).toEqual([
        'librpa/head-wing',
        FQHE_DOMAIN,
      ]);
      expect(agent.researchHarness?.listDomains()).toEqual([
        'librpa/head-wing',
        FQHE_DOMAIN,
      ]);

      const frame = createWorkFrame({
        id: 'frame.fqhe-cs.v2',
        domain: FQHE_DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Explain charge-flux period reasoning without conflating flux identities.',
        activeObjectIds: ['derivation.fqhe-cs.flux-insertion-charge-pump'],
        sourceRefs: ['prompt:fqhe-charge-flux'],
      });
      const pack = compileResearchContextPack({
        workFrame: frame,
        domainProfiles: agent.domainProfiles,
        workflowRecipes: agent.workflowRecipes,
        physicsMemory: agent.physicsMemory?.registry,
        researchLedger: agent.researchLedger?.registry,
        researchHarness: agent.researchHarness,
        now: () => 456,
      });
      const exposure = buildRuntimeToolExposurePlan(pack);
      const lens = recommendPhysicsLenses({
        domain: FQHE_DOMAIN,
        prompt:
          'Why does smaller Laughlin quasiparticle charge imply a larger flux period?',
        contextTags: ['fqhe', 'chern_simons', 'topological_order'],
      }).find((candidate) => candidate.lens.id === 'charge_flux_quantization');

      expect(pack.profiles.map((profile) => profile.id)).toEqual(['domain.fqhe-cs']);
      expect(pack.workflows.map((workflow) => workflow.id)).toEqual([
        'workflow.fqhe-cs.charge-flux-convention',
      ]);
      expect(pack.physics.capsules.map((capsule) => capsule.id)).toEqual([
        'benchmark.fqhe-cs.known-limits',
        'definition.fqhe-cs.laughlin-wavefunction',
        'derivation.fqhe-cs.flux-insertion-charge-pump',
        'formula.fqhe-cs.cs-action-laughlin',
        'formula.fqhe-cs.kmatrix-response',
      ]);
      expect(pack.physics.capsules.some((capsule) => capsule.id.includes('librpa'))).toBe(false);
      expect(pack.domainPack).toMatchObject({
        domain: FQHE_DOMAIN,
        profileIds: ['domain.fqhe-cs'],
        workflowIds: ['workflow.fqhe-cs.charge-flux-convention'],
        evalCaseIds: ['eval.fqhe-cs.charge-flux-v2'],
        requiredTools: ['PhysicsMemory', 'ResearchAction'],
      });
      expect(pack.domainPack?.bridgeCapsuleIds).toEqual([
        'bridge.fqhe-cs-to-librpa.response-notation',
      ]);
      expect(pack.domainPack?.capsuleIds).not.toEqual(
        expect.arrayContaining([
          'formula.librpa.head-wing.update',
          'codemapping.librpa.head-wing.formula-code-region',
          'benchmark.librpa.head-wing.smoke',
        ]),
      );
      expect(pack.domainPack?.evalCaseIds.some((evalCaseId) => evalCaseId.includes('librpa'))).toBe(
        false,
      );
      expect(pack.actionBindings.map((binding) => binding.id)).toEqual(
        expect.arrayContaining([
          'binding.fqhe-cs.charge-flux-apply-lens',
          'binding.fqhe-cs.charge-flux-convention',
          'binding.fqhe-cs.charge-flux-known-limit',
          'binding.fqhe-cs.charge-flux-dependency-closure',
        ]),
      );
      expect(exposure.activeToolNames).toEqual(
        expect.arrayContaining(['PhysicsMemory', 'ResearchLedger', 'ResearchAction']),
      );
      expect(exposure.activeToolNames).not.toContain('Bash');
      expect(lens).toMatchObject({
        status: 'applicable',
        confidence: 'high',
      });
    } finally {
      restoreFlags(oldFlags);
    }
  });

  it('passes the file-backed eval only with convention and known-limit evidence', async () => {
    const oldFlags = saveFlags(featureFlagKeys());
    setFlags(oldFlags.map((item) => item.key));
    try {
      const { agent } = await createIsolatedAgent();
      const evalFile = agent.researchHarness?.requireEvalCase('eval.fqhe-cs.charge-flux-v2');
      if (evalFile === undefined) throw new Error('Expected FQHE/CS eval case to be loaded.');

      const convention = checkFqheChargeFluxConvention({
        chargeIdentity: 'laughlin_quasiparticle_charge',
        fluxIdentity: 'external_em_flux',
        phaseInvariant: 'q_phi_over_hbar',
        fillingDenominator: 3,
      });
      const limitingCase = checkResult('check.charge-flux-quantization.limiting-case', 'limiting_case');
      const evalRun = runResearchEvalCase({
        evalCase: evalFile.evalCase,
        actionRecords: [
          actionRecord('physics.apply_direction_lens', 'pass'),
          actionRecord('validate.check_convention', 'pass', convention.checkResult.evidenceRefs),
          actionRecord('derive.compare_with_known_result', 'pass', [
            'vertical:fqhe-cs.known-limit',
          ]),
          actionRecord('graph.query_dependency_closure', 'pass'),
        ],
        checkResults: [convention.checkResult, limitingCase],
        evidenceRefs: ['vertical:fqhe-cs.charge-flux-convention'],
        finalStatus: 'validated',
        finalAnswerText:
          'The quasiparticle AB period uses external flux and q Phi / hbar, while the CS response uses distinct A and a fields.',
      });
      const finalGate = evaluateFinalGate({
        requestedStatus: 'validated',
        obligations: [],
        evidenceRefs: ['vertical:fqhe-cs.charge-flux-convention'],
        sourceRefs: evalFile.sourceRefs,
      });

      expect(convention.outcome).toBe('pass');
      expect(evalRun.outcome).toBe('pass');
      expect(finalGate).toMatchObject({
        outcome: 'allow',
        allowedStatus: 'validated',
      });
    } finally {
      restoreFlags(oldFlags);
    }
  });

  it('turns flux-identity conflation into a failed eval and downgraded final gate', async () => {
    const oldFlags = saveFlags(featureFlagKeys());
    setFlags(oldFlags.map((item) => item.key));
    try {
      const { agent } = await createIsolatedAgent();
      const evalFile = agent.researchHarness?.requireEvalCase('eval.fqhe-cs.charge-flux-v2');
      if (evalFile === undefined) throw new Error('Expected FQHE/CS eval case to be loaded.');

      const convention = checkFqheChargeFluxConvention({
        chargeIdentity: 'laughlin_quasiparticle_charge',
        fluxIdentity: 'berry_curvature_flux',
        phaseInvariant: 'q_phi_over_hbar',
        fillingDenominator: 3,
      });
      const evalRun = runResearchEvalCase({
        evalCase: evalFile.evalCase,
        actionRecords: [
          actionRecord('physics.apply_direction_lens', 'pass'),
          actionRecord('validate.check_convention', 'fail', convention.checkResult.evidenceRefs),
          actionRecord('derive.compare_with_known_result', 'pass', [
            'vertical:fqhe-cs.known-limit',
          ]),
        ],
        checkResults: [
          convention.checkResult,
          checkResult('check.charge-flux-quantization.limiting-case', 'limiting_case'),
        ],
        evidenceRefs: ['vertical:fqhe-cs.charge-flux-convention'],
        finalStatus: 'validated',
        finalAnswerText: 'external EM flux is identical to emergent CS flux',
      });
      const finalGate = evaluateFinalGate({
        requestedStatus: 'validated',
        obligations: convention.obligation === undefined ? [] : [convention.obligation],
        evidenceRefs: convention.checkResult.evidenceRefs,
        sourceRefs: evalFile.sourceRefs,
      });

      expect(convention.outcome).toBe('fail');
      expect(evalRun.outcome).toBe('fail');
      expect(evalRun.diagnostics.join(' ')).toContain('Forbidden claim matched');
      expect(finalGate).toMatchObject({
        outcome: 'downgrade',
        allowedStatus: 'provisional',
        openBlockingObligationIds: ['obl.fqhe.charge-flux-convention'],
      });
    } finally {
      restoreFlags(oldFlags);
    }
  });
});

async function createIsolatedAgent(): Promise<{
  readonly agent: Awaited<ReturnType<Session['createAgent']>>['agent'];
}> {
  const workDir = await makeTempDir('kimi-fqhe-v2-work-');
  const userHome = await makeTempDir('kimi-fqhe-v2-home-');
  const sessionDir = await makeTempDir('kimi-fqhe-v2-session-');
  await mkdir(join(workDir, '.git'));
  await cp(join(REPO_ROOT, '.aitp'), join(workDir, '.aitp'), { recursive: true });

  const session = new Session({
    id: 'test-fqhe-cs-v2',
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
  return { agent };
}

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
    capsuleRefs: ['derivation.fqhe-cs.flux-insertion-charge-pump'],
    ledgerEventIds: [],
    evidenceRefs,
    outcome,
    nextSuggestedActions: [],
  };
}

function checkResult(
  checkId: string,
  kind: ResearchEvalCheckResult['kind'],
): ResearchEvalCheckResult {
  return {
    checkId,
    kind,
    status: 'passed',
    evidenceRefs: [`vertical:fqhe-cs.${checkId}`],
  };
}

function featureFlagKeys(): readonly string[] {
  return [
    'KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE',
    'KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE',
    'KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY',
    'KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER',
    'KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS',
  ];
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
