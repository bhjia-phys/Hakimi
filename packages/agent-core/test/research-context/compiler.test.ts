import { describe, expect, it } from 'vitest';

import {
  DomainProfileRegistry,
  PhysicsMemoryRegistry,
  ResearchEvalCaseRegistry,
  ResearchLedgerRegistry,
  WorkflowRecipeRegistry,
  compileResearchContextPack,
  createWorkFrame,
  type DomainProfile,
  type FileBackedResearchEvalCase,
  type PhysicsCapsule,
  type ResearchLedgerEvent,
  type WorkflowRecipe,
} from '../../src';

const DOMAIN = 'topological-order/fqhe-cs';

describe('compileResearchContextPack', () => {
  it('compiles profiles, recipes, memory, ledger proposals, and action bindings for a WorkFrame', () => {
    const domainProfiles = new DomainProfileRegistry();
    const workflowRecipes = new WorkflowRecipeRegistry();
    const physicsMemory = new PhysicsMemoryRegistry();
    const researchLedger = new ResearchLedgerRegistry();
    const researchHarness = new ResearchEvalCaseRegistry();

    domainProfiles.register(profile());
    workflowRecipes.register(recipe());
    physicsMemory.register(formulaCapsule());
    physicsMemory.register(benchmarkCapsule());
    researchLedger.register(ledgerEvent());
    researchHarness.register(evalFile());

    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.fqhe',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Relate Laughlin wavefunction and CS response.',
        activeObjectIds: ['formula.fqhe.flux-quantization'],
        sourceRefs: ['prompt:initial-question'],
      }),
      domainProfiles,
      workflowRecipes,
      physicsMemory,
      researchLedger,
      researchHarness,
      now: () => 123,
    });

    expect(pack.id).toMatch(/^context\.frame\.fqhe\.[a-f0-9]{12}$/);
    expect(pack.compiledAt).toBe(123);
    expect(pack.profiles.map((item) => item.id)).toEqual(['domain.fqhe-cs']);
    expect(pack.workflows.map((item) => item.id)).toEqual(['workflow.fqhe-cs.charge-flux']);
    expect(pack.physics.capsules.map((item) => item.id)).toEqual([
      'formula.fqhe.flux-quantization',
    ]);
    expect(pack.ledger.proposals.map((item) => item.id)).toEqual([
      'proposal.event.fqhe.flux-source.formula',
    ]);
    expect(pack.actionBindings.map((item) => item.id)).toEqual([
      'binding.formula.fqhe.flux-quantization.validate.check_convention',
      'binding.fqhe.convention',
    ]);
    expect(pack.domainPack).toMatchObject({
      domain: DOMAIN,
      profileIds: ['domain.fqhe-cs'],
      workflowIds: ['workflow.fqhe-cs.charge-flux'],
      evalCaseIds: ['eval.fqhe.charge-flux'],
      requiredTools: ['PhysicsMemory', 'ResearchLedger'],
    });
    expect(pack.sourceRefs).toEqual([
      'ledger:event.fqhe.flux-source',
      'local:profile',
      'local:workflow',
      'paper:laughlin',
      'prompt:initial-question',
    ]);
  });

  it('keeps missing registries as diagnostics instead of failing compilation', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.empty',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Answer a lightweight question.',
      }),
      now: () => 1,
    });

    expect(pack.profiles).toEqual([]);
    expect(pack.physics.capsules).toEqual([]);
    expect(pack.diagnostics.map((item) => item.code)).toEqual([
      'domain-profile-registry-disabled',
      'workflow-recipe-registry-disabled',
      'physics-memory-registry-disabled',
      'research-ledger-registry-disabled',
    ]);
  });
});

function profile(): DomainProfile {
  return {
    metadata: {
      id: 'domain.fqhe-cs',
      kind: 'domain_profile',
      title: 'FQHE/CS profile',
      domain: DOMAIN,
      status: 'checked',
      sourceRefs: ['local:profile'],
      conventions: ['convention.cs.level-normalization'],
      lenses: ['charge_flux_quantization'],
      workflows: ['workflow.fqhe-cs.charge-flux'],
      capsuleRefs: ['formula.fqhe.flux-quantization'],
      bridgeCapsules: [],
      contextTags: ['fqhe', 'chern-simons'],
    },
    path: 'profile.md',
    body: 'Profile body.',
    source: 'project',
  };
}

function recipe(): WorkflowRecipe {
  return {
    metadata: {
      id: 'workflow.fqhe-cs.charge-flux',
      kind: 'workflow_recipe',
      title: 'Charge-flux convention workflow',
      domain: DOMAIN,
      status: 'checked',
      sourceRefs: ['local:workflow'],
      actionBindings: [
        {
          id: 'binding.fqhe.convention',
          actionId: 'validate.check_convention',
          domainId: DOMAIN,
          lensId: 'charge_flux_quantization',
          checkId: 'check.charge-flux-quantization.convention',
          priority: 'blocking',
        },
      ],
      requiredCapsules: ['formula.fqhe.flux-quantization'],
      requiredTools: ['PhysicsMemory', 'ResearchLedger'],
      failureModes: ['failure.fqhe.convention-mismatch'],
    },
    path: 'workflow.md',
    body: 'Workflow body.',
    source: 'project',
  };
}

function evalFile(): FileBackedResearchEvalCase {
  return {
    path: 'eval.md',
    source: 'project',
    body: 'Eval body.',
    sourceRefs: ['local:eval'],
    evalCase: {
      id: 'eval.fqhe.charge-flux',
      title: 'FQHE charge-flux eval',
      task: 'Explain charge-flux convention.',
      domain: DOMAIN,
      capsuleRefs: ['formula.fqhe.flux-quantization'],
      actionSequence: [],
      validations: [],
    },
  };
}

function formulaCapsule(): PhysicsCapsule {
  return {
    metadata: {
      id: 'formula.fqhe.flux-quantization',
      kind: 'Formula',
      domain: DOMAIN,
      title: 'Flux quantization convention',
      reliability: 'checked',
      symbols: ['Phi', 'Phi_0'],
      assumes: ['convention.cs.level-normalization'],
      dependsOn: [],
      sourceRefs: ['paper:laughlin'],
      graphRefs: [{ kind: 'Formula', id: 'formula.fqhe.flux-quantization' }],
      expansionHandles: [{ kind: 'formula', ref: 'formula.fqhe.flux-quantization' }],
      requiredChecks: [
        {
          id: 'check.charge-flux-quantization.convention',
          kind: 'convention',
          severity: 'blocking',
        },
      ],
      actionAffordances: [
        {
          actionId: 'validate.check_convention',
          intent: 'required',
          reason: 'CS normalization depends on the flux convention.',
        },
      ],
      allowCrossDomain: false,
    },
    path: 'formula.md',
    body: 'Phi = n Phi_0.',
    source: 'project',
  };
}

function benchmarkCapsule(): PhysicsCapsule {
  return {
    metadata: {
      id: 'benchmark.fqhe.flux-smoke',
      kind: 'BenchmarkCase',
      domain: DOMAIN,
      title: 'Flux convention smoke check',
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn: ['formula.fqhe.flux-quantization'],
      sourceRefs: ['local:benchmark'],
      graphRefs: [],
      expansionHandles: [],
      requiredChecks: [],
      actionAffordances: [],
      allowCrossDomain: false,
    },
    path: 'benchmark.md',
    body: 'Smoke check.',
    source: 'project',
  };
}

function ledgerEvent(): ResearchLedgerEvent {
  return {
    metadata: {
      id: 'event.fqhe.flux-source',
      type: 'source_excerpt',
      topic: 'fqhe-cs-effective-theory',
      domain: DOMAIN,
      status: 'captured',
      sourceRefs: ['ledger:event.fqhe.flux-source'],
      dependsOn: [],
      candidateCapsuleKind: 'Formula',
      openQuestions: [],
      relatedObjects: ['formula.fqhe.flux-quantization'],
    },
    path: 'event.md',
    body: 'Flux insertion source excerpt.',
    root: { path: '.aitp/research-ledger', source: 'project' },
  };
}
