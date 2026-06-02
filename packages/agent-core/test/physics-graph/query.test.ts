import { dirname, join, resolve } from 'pathe';

import { describe, expect, it } from 'vitest';

import {
  PhysicsMemoryRegistry,
  buildPhysicsGraphFromMemory,
  findPhysicsGraphPath,
  queryPhysicsGraphContradictions,
  queryPhysicsGraphDependencyClosure,
  queryPhysicsGraphNeighborhood,
  type PhysicsCapsule,
} from '../../src';

const REPO_ROOT = resolve(dirname(import.meta.filename), '..', '..', '..', '..');
const BRIDGE_ID = 'bridge.fqhe-cs-to-librpa.response-notation';
const FQHE_KMATRIX = 'formula.fqhe-cs.kmatrix-response';
const FQHE_CS_ACTION = 'formula.fqhe-cs.cs-action-laughlin';
const LIBRPA_TARGET = 'formula.librpa.head-wing.update';

describe('physics graph query semantics', () => {
  it('builds a graph from file-backed physics memory and expands dependency closure', async () => {
    const graph = buildPhysicsGraphFromMemory(await loadProjectPhysicsMemory());

    const closure = queryPhysicsGraphDependencyClosure(graph, {
      startIds: [FQHE_KMATRIX],
      maxDepth: 1,
    });

    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([FQHE_KMATRIX, FQHE_CS_ACTION, BRIDGE_ID, LIBRPA_TARGET]),
    );
    expect(closure.nodeIds).toEqual([
      'assumption.abelian-topological-order',
      'convention.fqhe.charge-vector',
      FQHE_CS_ACTION,
      FQHE_KMATRIX,
    ]);
    expect(closure.edges).toContainEqual(
      expect.objectContaining({
        sourceId: FQHE_KMATRIX,
        targetId: FQHE_CS_ACTION,
        relation: 'depends_on',
      }),
    );
  });

  it('finds an explicit bridge-aware path without allowing cross-domain paths under deny', async () => {
    const graph = buildPhysicsGraphFromMemory(await loadProjectPhysicsMemory());

    const allowed = findPhysicsGraphPath(graph, {
      fromId: FQHE_KMATRIX,
      toId: LIBRPA_TARGET,
      direction: 'both',
      maxDepth: 3,
      bridgePolicy: 'explicit-only',
    });
    const denied = findPhysicsGraphPath(graph, {
      fromId: FQHE_KMATRIX,
      toId: LIBRPA_TARGET,
      direction: 'both',
      maxDepth: 3,
      bridgePolicy: 'deny',
    });

    expect(allowed.found).toBe(true);
    expect(allowed.nodeIds).toEqual([FQHE_KMATRIX, BRIDGE_ID, LIBRPA_TARGET]);
    expect(allowed.edges.map((edge) => edge.relation)).toEqual(['depends_on', 'bridges_to']);
    expect(denied.found).toBe(false);
  });

  it('keeps ordinary neighborhood expansion bridge-policy aware', async () => {
    const graph = buildPhysicsGraphFromMemory(await loadProjectPhysicsMemory());

    const allowed = queryPhysicsGraphNeighborhood(graph, {
      startIds: [BRIDGE_ID],
      direction: 'out',
      relationTypes: ['bridges_to'],
      bridgePolicy: 'explicit-only',
    });
    const denied = queryPhysicsGraphNeighborhood(graph, {
      startIds: [BRIDGE_ID],
      direction: 'out',
      relationTypes: ['bridges_to'],
      bridgePolicy: 'deny',
    });

    expect(allowed.nodeIds).toEqual(
      expect.arrayContaining([BRIDGE_ID, LIBRPA_TARGET]),
    );
    expect(denied.nodeIds).toEqual([BRIDGE_ID]);
  });

  it('queries contradiction edges as first-class graph semantics', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(
      capsule('convention.external-flux', 'External flux convention', [
        { kind: 'ConventionSet', id: 'convention.emergent-flux', relation: 'contradicts' },
      ]),
    );
    registry.register(capsule('convention.emergent-flux', 'Emergent flux convention'));

    const graph = buildPhysicsGraphFromMemory(registry);
    const contradictions = queryPhysicsGraphContradictions(graph, { domain: 'fqhe' });

    expect(contradictions).toEqual([
      expect.objectContaining({
        sourceId: 'convention.external-flux',
        targetId: 'convention.emergent-flux',
        relation: 'contradicts',
      }),
    ]);
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
  title: string,
  graphRefs: PhysicsCapsule['metadata']['graphRefs'] = [],
): PhysicsCapsule {
  return {
    path: `/tmp/${id}.md`,
    body: title,
    source: 'project',
    metadata: {
      id,
      kind: 'Definition',
      domain: 'fqhe',
      title,
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn: [],
      sourceRefs: ['local:test'],
      graphRefs,
      expansionHandles: [],
      requiredChecks: [],
      actionAffordances: [],
      allowCrossDomain: false,
    },
  };
}
