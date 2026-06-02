import { dirname, join, resolve } from 'pathe';

import { describe, expect, it } from 'vitest';

import {
  PhysicsMemoryRegistry,
  buildFormalizationPlan,
  buildPhysicsGraphFromMemory,
  type PhysicsCapsule,
} from '../../src';

const REPO_ROOT = resolve(dirname(import.meta.filename), '..', '..', '..', '..');

describe('formalization bridge contracts', () => {
  it('exports a blueprint-like dependency graph for theorem-shaped memory', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(capsule('definition.group', 'Definition', 'Group definition'));
    registry.register(capsule('lemma.identity-unique', 'Lemma', 'Identity uniqueness', [
      'definition.group',
    ]));
    registry.register(capsule('theorem.left-identity', 'Theorem', 'Left identity theorem', [
      'lemma.identity-unique',
    ]));

    const plan = buildFormalizationPlan(buildPhysicsGraphFromMemory(registry), {
      targetIds: ['theorem.left-identity'],
      maxDepth: 2,
    });

    expect(plan.contracts.map((contract) => [contract.graphNodeId, contract.targetKind])).toEqual([
      ['definition.group', 'definition'],
      ['lemma.identity-unique', 'lemma'],
      ['theorem.left-identity', 'theorem'],
    ]);
    expect(plan.contracts.every((contract) => contract.readiness === 'formalization_ready')).toBe(
      true,
    );
    expect(plan.blueprint).toMatchObject({
      format: 'aitp-formalization-blueprint/v0',
      edges: [
        {
          from: 'lemma.identity-unique',
          to: 'definition.group',
          relation: 'depends_on',
        },
        {
          from: 'theorem.left-identity',
          to: 'lemma.identity-unique',
          relation: 'depends_on',
        },
      ],
    });
  });

  it('marks checked FQHE formula memory as formalization-ready, not formalized', async () => {
    const registry = await loadProjectPhysicsMemory();
    const plan = buildFormalizationPlan(buildPhysicsGraphFromMemory(registry), {
      targetIds: ['formula.fqhe-cs.kmatrix-response'],
      maxDepth: 1,
    });
    const formula = plan.contracts.find(
      (contract) => contract.graphNodeId === 'formula.fqhe-cs.kmatrix-response',
    );

    expect(formula).toMatchObject({
      targetKind: 'formula',
      currentReliability: 'checked',
      readiness: 'formalization_ready',
      requiredHumanCheckpoint: true,
    });
    expect(formula?.notes.join(' ')).toContain('not as a checked theorem');
  });

  it('keeps failure modes out of formalization exports', async () => {
    const registry = await loadProjectPhysicsMemory();
    const plan = buildFormalizationPlan(buildPhysicsGraphFromMemory(registry), {
      targetIds: ['failure.fqhe-cs.flux-identity-conflation'],
      includeDependencyClosure: false,
    });

    expect(plan.contracts).toEqual([]);
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        code: 'not-formalizable-kind',
        nodeId: 'failure.fqhe-cs.flux-identity-conflation',
      }),
    );
  });
});

async function loadProjectPhysicsMemory(): Promise<PhysicsMemoryRegistry> {
  const registry = new PhysicsMemoryRegistry();
  await registry.loadRoots([
    {
      path: join(REPO_ROOT, '.aitp', 'physics-memory'),
      source: 'project',
    },
  ]);
  return registry;
}

function capsule(
  id: string,
  kind: PhysicsCapsule['metadata']['kind'],
  title: string,
  dependsOn: readonly string[] = [],
): PhysicsCapsule {
  return {
    path: `/tmp/${id}.md`,
    body: title,
    source: 'project',
    metadata: {
      id,
      kind,
      domain: 'math/algebra',
      title,
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn,
      sourceRefs: ['local:test'],
      graphRefs: [],
      expansionHandles: [],
      requiredChecks: [],
      actionAffordances: [],
      allowCrossDomain: false,
    },
  };
}
