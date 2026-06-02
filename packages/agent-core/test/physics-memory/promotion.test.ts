import { describe, expect, it } from 'vitest';

import {
  promotePhysicsCandidates,
  type PhysicsGraphCandidate,
  type PhysicsPromotionPacket,
} from '../../src/physics-memory';

describe('physics memory promotion pipeline', () => {
  it('promotes candidate graph objects conservatively when packet requirements are satisfied', () => {
    const candidate = graphCandidate('graph.candidate.event.fqhe.derived-step');
    const packet: PhysicsPromotionPacket = {
      id: 'promotion.fqhe.derived-step',
      candidateIds: [candidate.id],
      sourceRefs: ['paper:zhang-hansson-kivelson-1989'],
      validationRefs: ['ledger:event.fqhe.dimension-check'],
      failureModes: ['failure:convention-mismatch'],
      scope: {
        regimes: ['nu=1/3'],
        assumptions: ['gapped-adiabatic'],
      },
      targetReliability: 'validated',
      requiredHumanCheckpoint: false,
    };

    const result = promotePhysicsCandidates([candidate], packet);

    expect(result.ok).toBe(true);
    expect(result.capsules[0]?.metadata).toMatchObject({
      id: 'capsule.promoted.event.fqhe.derived-step',
      kind: 'DerivationStep',
      reliability: 'validated',
      promotionPacketId: 'promotion.fqhe.derived-step',
      validationRefs: ['ledger:event.fqhe.dimension-check'],
      failureModes: ['failure:convention-mismatch'],
      scope: {
        regimes: ['nu=1/3'],
        assumptions: ['gapped-adiabatic'],
      },
    });
  });

  it('rejects promotion without scope or validation refs', () => {
    const candidate = graphCandidate('graph.candidate.event.fqhe.formula');
    const packet: PhysicsPromotionPacket = {
      id: 'promotion.fqhe.formula',
      candidateIds: [candidate.id],
      sourceRefs: ['paper:laughlin-1983'],
      validationRefs: [],
      failureModes: [],
      targetReliability: 'validated',
      requiredHumanCheckpoint: false,
    };

    const result = promotePhysicsCandidates([candidate], packet);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['missing-scope', 'missing-validation-refs']),
    );
  });

  it('requires explicit human checkpoint for formalized promotion', () => {
    const candidate = graphCandidate('graph.candidate.event.fqhe.definition');
    const packet: PhysicsPromotionPacket = {
      id: 'promotion.fqhe.definition',
      candidateIds: [candidate.id],
      sourceRefs: ['paper:laughlin-1983'],
      validationRefs: ['ledger:event.fqhe.review'],
      failureModes: [],
      scope: { regimes: ['ground-state'] },
      targetReliability: 'formalized',
      requiredHumanCheckpoint: true,
    };

    const result = promotePhysicsCandidates([candidate], packet);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'missing-human-checkpoint',
      }),
    );
  });
});

function graphCandidate(id: string): PhysicsGraphCandidate {
  return {
    id,
    kind: 'derivation_step',
    domain: 'topological-order',
    title: 'Derived step',
    body: 'Body',
    reliability: 'checked',
    sourceEventIds: ['event.fqhe.derived-step'],
    sourceRefs: ['ledger:event.fqhe.derived-step'],
    relatedObjects: ['assumption:gapped-adiabatic'],
    dependsOn: ['capsule.shared.base-formula'],
    assumptions: ['assumption:gapped-adiabatic'],
    promotionState: 'candidate',
  };
}
