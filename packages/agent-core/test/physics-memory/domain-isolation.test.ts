import { dirname, join, resolve } from 'pathe';

import { describe, expect, it } from 'vitest';

import {
  PhysicsMemoryRegistry,
  compilePhysicsContext,
} from '../../src/physics-memory';

const REPO_ROOT = resolve(dirname(import.meta.filename), '..', '..', '..', '..');
const FQHE_DOMAIN = 'topological-order/fqhe-cs';
const LIBRPA_DOMAIN = 'librpa/head-wing';
const BRIDGE_ID = 'bridge.fqhe-cs-to-librpa.response-notation';
const FQHE_FOCUS = 'formula.fqhe-cs.kmatrix-response';
const LIBRPA_TARGET = 'formula.librpa.head-wing.update';

describe('physics memory domain isolation and bridge capsules', () => {
  it('keeps LibRPA capsules out of a FQHE context without an explicit bridge focus', async () => {
    const registry = await loadProjectPhysicsMemory();

    const pack = compilePhysicsContext(registry, {
      domain: FQHE_DOMAIN,
      focus: [FQHE_FOCUS],
    });

    expect(pack.capsules.map((capsule) => capsule.metadata.id)).toEqual([
      'formula.fqhe-cs.cs-action-laughlin',
      FQHE_FOCUS,
    ]);
    expect(pack.capsules.some((capsule) => capsule.metadata.domain === LIBRPA_DOMAIN)).toBe(false);
    expect(pack.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'bridge-cross-domain-inclusion',
    );
  });

  it('allows a specific cross-domain capsule when a bridge capsule is explicit', async () => {
    const registry = await loadProjectPhysicsMemory();

    const pack = compilePhysicsContext(registry, {
      domain: FQHE_DOMAIN,
      focus: [FQHE_FOCUS, BRIDGE_ID],
    });

    expect(pack.capsules.map((capsule) => capsule.metadata.id)).toEqual([
      BRIDGE_ID,
      'formula.fqhe-cs.cs-action-laughlin',
      FQHE_FOCUS,
      LIBRPA_TARGET,
    ]);
    expect(pack.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        code: 'bridge-cross-domain-inclusion',
        capsuleId: LIBRPA_TARGET,
      }),
    );
  });

  it('rejects bridge-enabled cross-domain inclusion when bridge policy is deny', async () => {
    const registry = await loadProjectPhysicsMemory();

    const pack = compilePhysicsContext(registry, {
      domain: FQHE_DOMAIN,
      focus: [FQHE_FOCUS, BRIDGE_ID],
      bridgePolicy: 'deny',
    });

    expect(pack.capsules.map((capsule) => capsule.metadata.id)).toEqual([
      BRIDGE_ID,
      'formula.fqhe-cs.cs-action-laughlin',
      FQHE_FOCUS,
    ]);
    expect(pack.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'cross-domain-denied',
        capsuleId: LIBRPA_TARGET,
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
