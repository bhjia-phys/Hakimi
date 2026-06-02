import { describe, expect, it } from 'vitest';

import {
  PhysicsMemoryRegistry,
  compilePhysicsGraphCandidates,
  type PhysicsCapsule,
} from '../../src/physics-memory';
import { ResearchLedgerRegistry, type ResearchLedgerEvent } from '../../src/research-ledger';

describe('physics memory compiler v2', () => {
  it('compiles ledger events into candidate graph objects with dependency tracing', () => {
    const registry = new PhysicsMemoryRegistry();
    registry.register(
      capsule('capsule.shared.base-formula', {
        kind: 'Formula',
        title: 'Base formula',
      }),
    );

    const ledger = new ResearchLedgerRegistry();
    ledger.register(
      event('event.fqhe.derived-step', {
        type: 'equation_candidate',
        topic: 'fqhe-cs',
        body: '# Derived step\n\nLocal derivation block.',
        dependsOn: ['capsule.shared.base-formula', 'capsule.missing.assumption'],
        relatedObjects: ['assumption:gapped-adiabatic', 'concept:laughlin-state'],
        candidateCapsuleKind: 'DerivationStep',
      }),
    );

    const result = compilePhysicsGraphCandidates(registry, {
      ledger,
      topic: 'fqhe-cs',
      domain: 'topological-order',
    });

    expect(result.candidates[0]).toMatchObject({
      id: 'graph.candidate.event.fqhe.derived-step',
      kind: 'derivation_step',
      reliability: 'linked',
      promotionState: 'candidate',
      dependsOn: ['capsule.shared.base-formula', 'capsule.missing.assumption'],
      assumptions: ['assumption:gapped-adiabatic'],
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'missing-dependency',
        candidateId: 'graph.candidate.event.fqhe.derived-step',
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'assumption-dependency-trace',
        candidateId: 'graph.candidate.event.fqhe.derived-step',
      }),
    );
  });

  it('flags incompatible convention candidates instead of silently blending them', () => {
    const registry = new PhysicsMemoryRegistry();
    const ledger = new ResearchLedgerRegistry();
    ledger.register(
      event('event.fqhe.conv-a', {
        type: 'assumption_candidate',
        topic: 'fqhe-cs',
        body: '# Flux convention\n\nPhi denotes external electromagnetic flux.',
        relatedObjects: ['convention:flux-symbol'],
        candidateCapsuleKind: 'Definition',
      }),
    );
    ledger.register(
      event('event.fqhe.conv-b', {
        type: 'assumption_candidate',
        topic: 'fqhe-cs',
        body: '# Flux convention\n\nPhi denotes emergent Chern-Simons flux.',
        relatedObjects: ['convention:flux-symbol'],
        candidateCapsuleKind: 'Definition',
      }),
    );

    const result = compilePhysicsGraphCandidates(registry, {
      ledger,
      topic: 'fqhe-cs',
      domain: 'topological-order',
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'possible-contradiction',
      }),
    );
  });
});

function capsule(
  id: string,
  overrides: Partial<PhysicsCapsule['metadata']> & { readonly title: string },
): PhysicsCapsule {
  const { title, ...rest } = overrides;
  const metadata = {
    id,
    kind: 'Definition',
    domain: 'topological-order',
    title,
    reliability: 'validated',
    symbols: [],
    assumes: [],
    dependsOn: [],
    sourceRefs: ['local:test'],
    graphRefs: [],
    expansionHandles: [],
    requiredChecks: [],
    actionAffordances: [],
    allowCrossDomain: false,
    ...rest,
  } satisfies PhysicsCapsule['metadata'];
  return {
    path: `/tmp/${id}.md`,
    body: title,
    source: 'project',
    metadata,
  };
}

function event(
  id: string,
  overrides: Partial<ResearchLedgerEvent['metadata']> & {
    readonly body: string;
    readonly topic: string;
  },
): ResearchLedgerEvent {
  const { topic, body, ...rest } = overrides;
  const metadata = {
    id,
    type: 'derivation_scratch',
    topic,
    domain: 'topological-order',
    status: 'linked',
    sourceRefs: ['local:test'],
    dependsOn: [],
    openQuestions: [],
    relatedObjects: [],
    ...rest,
  } satisfies ResearchLedgerEvent['metadata'];
  return {
    path: `/tmp/${id}.md`,
    root: { path: '/tmp', source: 'project' },
    body,
    metadata,
  };
}
