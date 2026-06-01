import { describe, expect, it } from 'vitest';
import { join } from 'pathe';

import {
  compilePhysicsContext,
  PhysicsMemoryRegistry,
  type PhysicsCapsule,
} from '../../src/physics-memory';

describe('physics memory compiler', () => {
  it('compiles the LibRPA fixture vertical slice without benchmark warnings', async () => {
    const registry = new PhysicsMemoryRegistry();
    await registry.loadRoots([
      {
        path: join(import.meta.dirname, '..', 'fixtures', 'physics-memory', 'librpa'),
        source: 'project',
      },
    ]);

    const pack = compilePhysicsContext(registry, {
      domain: 'librpa',
      focus: ['formula.librpa.chi0.independent_particle'],
    });

    expect(registry.listCapsules({ domain: 'librpa' }).map((item) => item.metadata.kind)).toEqual([
      'Assumption',
      'BenchmarkCase',
      'CodeMapping',
      'Definition',
      'Formula',
    ]);
    expect(pack.capsules.map((item) => item.metadata.id)).toEqual([
      'assumption.librpa.no_vertex',
      'definition.librpa.single_particle_state',
      'formula.librpa.chi0.independent_particle',
    ]);
    expect(pack.diagnostics.map((item) => item.code)).not.toContain('missing-benchmark');
  });

  it('compiles focused capsules with direct dependencies', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(capsule('assumption.rpa', 'librpa', 'Assumption'));
    registry.register(capsule('formula.chi0', 'librpa', 'Formula', ['assumption.rpa']));
    registry.register(capsule('benchmark.chi0', 'librpa', 'BenchmarkCase', ['formula.chi0']));
    registry.register(capsule('formula.fqhe', 'fqhe', 'Formula'));

    const pack = compilePhysicsContext(registry, {
      domain: 'librpa',
      focus: ['formula.chi0'],
    });

    expect(pack.capsules.map((item) => item.metadata.id)).toEqual([
      'assumption.rpa',
      'formula.chi0',
    ]);
    expect(pack.diagnostics).toEqual([]);
  });

  it('warns about cross-domain dependencies and missing benchmarks', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(capsule('formula.fqhe', 'fqhe', 'Formula'));
    registry.register(capsule('formula.librpa', 'librpa', 'Formula', ['formula.fqhe']));

    const pack = compilePhysicsContext(registry, {
      domain: 'librpa',
      focus: ['formula.librpa'],
    });

    expect(pack.capsules.map((item) => item.metadata.id)).toEqual(['formula.librpa']);
    expect(pack.diagnostics.map((item) => item.code)).toEqual([
      'cross-domain-dependency',
      'missing-benchmark',
    ]);
  });

  it('errors on missing dependencies', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(capsule('formula.incomplete', 'librpa', 'Formula', ['missing.definition']));

    const pack = compilePhysicsContext(registry, {
      domain: 'librpa',
      focus: ['formula.incomplete'],
    });

    expect(pack.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'missing-dependency',
        capsuleId: 'formula.incomplete',
      }),
    );
  });

  it('carries registry diagnostics into compiled context packs', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(capsule('definition.anyons', 'fqhe', 'Definition'));
    registry.register(capsule('definition.anyons', 'fqhe', 'Definition'));

    const pack = compilePhysicsContext(registry, {
      domain: 'fqhe',
      focus: ['definition.anyons'],
    });

    expect(pack.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'duplicate-capsule-id',
        capsuleId: 'definition.anyons',
      }),
    );
  });
});

function capsule(
  id: string,
  domain: string,
  kind: PhysicsCapsule['metadata']['kind'],
  dependsOn: readonly string[] = [],
): PhysicsCapsule {
  return {
    path: `/tmp/${id}.md`,
    source: 'project',
    body: '',
    metadata: {
      id,
      domain,
      kind,
      title: id,
      reliability: 'linked',
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
