import { describe, expect, it } from 'vitest';

import {
  DomainProfileRegistry,
  PhysicsMemoryRegistry,
  ResearchEvalCaseRegistry,
  WorkflowRecipeRegistry,
  compileDomainPackManifest,
  type DomainProfile,
  type FileBackedResearchEvalCase,
  type PhysicsCapsule,
  type WorkflowRecipe,
} from '../../src';

const DOMAIN = 'topological-order/fqhe-cs';
const OTHER_DOMAIN = 'librpa/head-wing';

describe('compileDomainPackManifest', () => {
  it('summarizes file-backed profiles, workflows, memory, evals, actions, and tools by domain', () => {
    const domainProfiles = new DomainProfileRegistry();
    const workflowRecipes = new WorkflowRecipeRegistry();
    const physicsMemory = new PhysicsMemoryRegistry();
    const researchHarness = new ResearchEvalCaseRegistry();

    domainProfiles.register(profile());
    workflowRecipes.register(sourceWorkflow());
    physicsMemory.register(formulaCapsule());
    physicsMemory.register(bridgeCapsule());
    physicsMemory.register(otherDomainCapsule());
    researchHarness.register(evalFile('eval.fqhe.source-search', DOMAIN));
    researchHarness.register(evalFile('eval.librpa.head-wing', OTHER_DOMAIN));

    const manifest = compileDomainPackManifest({
      domain: DOMAIN,
      domainProfiles,
      workflowRecipes,
      physicsMemory,
      researchHarness,
      now: () => 123,
    });

    expect(manifest.id).toMatch(/^domain-pack\.topological-order-fqhe-cs\.[a-f0-9]{12}$/);
    expect(manifest.compiledAt).toBe(123);
    expect(manifest.profileIds).toEqual(['domain.fqhe-cs']);
    expect(manifest.workflowIds).toEqual(['workflow.fqhe.source-search']);
    expect(manifest.capsuleIds).toEqual([
      'bridge.fqhe-cs-to-librpa.response-notation',
      'formula.fqhe.flux-quantization',
    ]);
    expect(manifest.bridgeCapsuleIds).toEqual(['bridge.fqhe-cs-to-librpa.response-notation']);
    expect(manifest.evalCaseIds).toEqual(['eval.fqhe.source-search']);
    expect(manifest.actionBindingIds).toEqual([
      'binding.formula.fqhe.flux-quantization.validate.check_convention',
      'binding.fqhe.source-search',
    ]);
    expect(manifest.actionIds).toEqual([
      'source.search_literature',
      'validate.check_convention',
    ]);
    expect(manifest.requiredTools).toEqual(['FetchURL', 'WebSearch']);
    expect(manifest.contextTags).toEqual(['chern-simons', 'fqhe']);
    expect(manifest.diagnostics).toEqual([]);
  });

  it('rejects cross-domain profile workflow references while keeping same-domain recipes', () => {
    const domainProfiles = new DomainProfileRegistry();
    const workflowRecipes = new WorkflowRecipeRegistry();

    domainProfiles.register(
      profile({
        workflows: [
          'workflow.fqhe.source-search',
          'workflow.librpa.patch',
          'workflow.missing',
        ],
      }),
    );
    workflowRecipes.register(sourceWorkflow());
    workflowRecipes.register(patchWorkflow());

    const manifest = compileDomainPackManifest({
      domain: DOMAIN,
      domainProfiles,
      workflowRecipes,
    });

    expect(manifest.workflowIds).toEqual(['workflow.fqhe.source-search']);
    expect(manifest.actionIds).toEqual(['source.search_literature']);
    expect(manifest.requiredTools).toEqual(['FetchURL', 'WebSearch']);
    expect(manifest.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'cross-domain-profile-workflow',
          source: 'workflow-recipe',
          refId: 'workflow.librpa.patch',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'missing-profile-workflow',
          source: 'workflow-recipe',
          refId: 'workflow.missing',
        }),
      ]),
    );
  });
});

function profile(
  overrides: Partial<DomainProfile['metadata']> = {},
): DomainProfile {
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
      workflows: ['workflow.fqhe.source-search'],
      capsuleRefs: ['formula.fqhe.flux-quantization'],
      bridgeCapsules: ['bridge.fqhe-cs-to-librpa.response-notation'],
      contextTags: ['fqhe', 'chern-simons'],
      ...overrides,
    },
    path: 'profile.md',
    body: 'Profile body.',
    source: 'project',
  };
}

function sourceWorkflow(): WorkflowRecipe {
  return {
    metadata: {
      id: 'workflow.fqhe.source-search',
      kind: 'workflow_recipe',
      title: 'FQHE source search',
      domain: DOMAIN,
      status: 'checked',
      sourceRefs: ['local:workflow'],
      actionBindings: [
        {
          id: 'binding.fqhe.source-search',
          actionId: 'source.search_literature',
          domainId: DOMAIN,
          workflowId: 'workflow.fqhe.source-search',
          priority: 'high',
        },
      ],
      requiredCapsules: ['formula.fqhe.flux-quantization'],
      requiredTools: ['WebSearch', 'FetchURL'],
      failureModes: [],
    },
    path: 'workflow.md',
    body: 'Search sources and store evidence.',
    source: 'project',
  };
}

function patchWorkflow(): WorkflowRecipe {
  return {
    metadata: {
      id: 'workflow.librpa.patch',
      kind: 'workflow_recipe',
      title: 'LibRPA patch',
      domain: OTHER_DOMAIN,
      status: 'checked',
      sourceRefs: ['local:librpa'],
      actionBindings: [
        {
          id: 'binding.librpa.patch',
          actionId: 'code.prepare_patch',
          domainId: OTHER_DOMAIN,
          workflowId: 'workflow.librpa.patch',
        },
      ],
      requiredCapsules: [],
      requiredTools: ['Bash', 'Edit', 'Write'],
      failureModes: [],
    },
    path: 'librpa-workflow.md',
    body: 'Patch LibRPA.',
    source: 'project',
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

function bridgeCapsule(): PhysicsCapsule {
  return {
    metadata: {
      id: 'bridge.fqhe-cs-to-librpa.response-notation',
      kind: 'Bridge',
      domain: DOMAIN,
      title: 'FQHE response notation to LibRPA bridge',
      reliability: 'checked',
      symbols: ['chi', 'sigma_xy'],
      assumes: [],
      dependsOn: ['formula.fqhe.flux-quantization', 'formula.librpa.head-wing.update'],
      sourceRefs: ['local:bridge'],
      graphRefs: [
        {
          kind: 'Bridge',
          id: 'graph.bridge.fqhe-cs-to-librpa.response-notation',
          relation: 'bridges_to',
        },
      ],
      expansionHandles: [
        {
          kind: 'bridge',
          ref: 'bridge.fqhe-cs-to-librpa.response-notation',
        },
      ],
      requiredChecks: [],
      actionAffordances: [],
      allowCrossDomain: true,
      bridge: {
        fromDomain: DOMAIN,
        toDomain: OTHER_DOMAIN,
        capsuleRefs: ['formula.librpa.head-wing.update'],
        reason: 'Notation comparison only.',
      },
    },
    path: 'bridge.md',
    body: 'Bridge body.',
    source: 'project',
  };
}

function otherDomainCapsule(): PhysicsCapsule {
  return {
    metadata: {
      id: 'formula.librpa.head-wing.update',
      kind: 'Formula',
      domain: OTHER_DOMAIN,
      title: 'LibRPA head-wing update',
      reliability: 'checked',
      symbols: ['chi'],
      assumes: [],
      dependsOn: [],
      sourceRefs: ['local:librpa'],
      graphRefs: [],
      expansionHandles: [],
      requiredChecks: [],
      actionAffordances: [],
      allowCrossDomain: false,
    },
    path: 'librpa-formula.md',
    body: 'LibRPA formula.',
    source: 'project',
  };
}

function evalFile(id: string, domain: string): FileBackedResearchEvalCase {
  return {
    path: `${id}.md`,
    source: 'project',
    body: 'Eval body.',
    sourceRefs: ['local:eval'],
    evalCase: {
      id,
      title: id,
      task: 'Run eval.',
      domain,
      capsuleRefs: [],
      actionSequence: [],
      validations: [],
    },
  };
}
