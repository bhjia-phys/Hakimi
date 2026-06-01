import { describe, expect, it } from 'vitest';

import {
  PhysicsMemoryRegistry,
  type PhysicsCapsule,
  type PhysicsMemoryRoot,
} from '../../src/physics-memory';

describe('physics memory registry', () => {
  it('lists domains and filters capsules by domain and kind', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(capsule('formula.librpa', 'librpa', 'Formula'));
    registry.register(capsule('failure.librpa', 'librpa', 'FailureMode'));
    registry.register(capsule('formula.fqhe', 'fqhe', 'Formula'));

    expect(registry.listDomains()).toEqual(['fqhe', 'librpa']);
    expect(registry.listCapsules({ domain: 'librpa' }).map((item) => item.metadata.id)).toEqual([
      'failure.librpa',
      'formula.librpa',
    ]);
    expect(registry.listCapsules({ kind: 'Formula' }).map((item) => item.metadata.id)).toEqual([
      'formula.fqhe',
      'formula.librpa',
    ]);
  });

  it('renders compact model listings without capsule bodies', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(
      capsule('formula.librpa.chi0', 'librpa', 'Formula', {
        body: 'This detailed derivation body must not be present in the compact listing.',
        requiredChecks: [
          {
            id: 'check.dimension.chi0',
            kind: 'dimension',
            severity: 'warning',
          },
        ],
      }),
    );

    const listing = registry.getModelCapsuleListing({ domain: 'librpa' });

    expect(listing).toContain('### librpa');
    expect(listing).toContain('formula.librpa.chi0');
    expect(listing).toContain('checks=dimension');
    expect(listing).not.toContain('detailed derivation body');
  });

  it('keeps the first capsule for duplicate ids unless replace is requested', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(capsule('same', 'first', 'Formula'));
    registry.register(capsule('same', 'second', 'Formula'));
    expect(registry.requireCapsule('same').metadata.domain).toBe('first');
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'duplicate-capsule-id',
        capsuleId: 'same',
        path: '/tmp/same.md',
      }),
    );

    registry.register(capsule('same', 'second', 'Formula'), { replace: true });
    expect(registry.requireCapsule('same').metadata.domain).toBe('second');
  });

  it('preserves root provenance and records scan warnings as registry diagnostics', async () => {
    const roots: readonly PhysicsMemoryRoot[] = [
      { path: '/project/.aitp/physics-memory', source: 'project' },
      { path: '/user/.aitp/physics-memory', source: 'user' },
      { path: '/project/.aitp/physics-memory', source: 'project' },
    ];
    const registry = new PhysicsMemoryRegistry({
      discover: async (input) => {
        input.onWarning?.('bad capsule', new Error('missing reliability'));
        return [capsule('formula.fqhe', 'fqhe', 'Formula')];
      },
    });

    await registry.loadRoots(roots);

    expect(registry.getRoots()).toEqual([
      { path: '/project/.aitp/physics-memory', source: 'project' },
      { path: '/user/.aitp/physics-memory', source: 'user' },
    ]);
    expect(registry.requireCapsule('formula.fqhe').metadata.domain).toBe('fqhe');
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'scan-warning',
        message: 'bad capsule: missing reliability',
      }),
    );
  });
});

function capsule(
  id: string,
  domain: string,
  kind: PhysicsCapsule['metadata']['kind'],
  overrides: Partial<PhysicsCapsule> & {
    readonly requiredChecks?: PhysicsCapsule['metadata']['requiredChecks'];
  } = {},
): PhysicsCapsule {
  return {
    path: `/tmp/${id}.md`,
    source: 'project',
    body: overrides.body ?? '',
    metadata: {
      id,
      domain,
      kind,
      title: id,
      reliability: 'linked',
      symbols: [],
      assumes: [],
      dependsOn: [],
      sourceRefs: ['local:test'],
      graphRefs: [],
      expansionHandles: [],
      requiredChecks: overrides.requiredChecks ?? [],
      actionAffordances: [],
      allowCrossDomain: false,
    },
  };
}
