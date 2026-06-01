import { describe, expect, it } from 'vitest';

import { compileResearchBlockToCandidateCapsule, type ResearchBlock } from '../../src/research-block';

describe('research block capsule boundary compiler', () => {
  it('compiles a local derivation block into an unpromoted candidate capsule', () => {
    const block: ResearchBlock = {
      id: 'fqhe.flux-insertion-charge',
      topic: 'fqhe-cs-effective-theory',
      domain: 'topological-order',
      title: 'Laughlin flux insertion pumps fractional charge',
      candidateCapsuleKind: 'DerivationStep',
      sourceRefs: ['ledger:event.fqhe.flux-insertion-source'],
      dependsOn: ['capsule.laughlin.wavefunction'],
      formulas: [
        {
          id: 'formula.ab-phase',
          expression: 'exp(i q Phi / hbar)',
          symbols: ['q', 'Phi', 'hbar'],
        },
      ],
      assumptions: [
        {
          id: 'assumption.gapped-adiabatic',
          statement: 'The gap remains open during adiabatic flux insertion.',
        },
      ],
      conventions: [
        {
          id: 'convention.external-em-flux',
          statement: 'Phi denotes external electromagnetic flux, not emergent CS flux.',
        },
      ],
      localClaims: [
        {
          id: 'claim.fractional-charge-pump',
          statement: 'One electron flux quantum pumps fractional charge in a Laughlin state.',
        },
      ],
      openQuestions: ['Check CS level normalization before connecting to K-matrix response.'],
      relatedObjects: ['concept:ab-phase', 'concept:laughlin-state'],
      body: 'A locally self-contained derivation block ready for capsule boundary compilation.',
    };

    const result = compileResearchBlockToCandidateCapsule(block);

    expect(result.capsule.metadata).toMatchObject({
      id: 'capsule.candidate.fqhe.flux-insertion-charge',
      kind: 'DerivationStep',
      domain: 'topological-order',
      reliability: 'raw',
      symbols: ['Phi', 'hbar', 'q'],
      assumes: ['assumption.gapped-adiabatic'],
      dependsOn: ['capsule.laughlin.wavefunction'],
      sourceRefs: ['ledger:event.fqhe.flux-insertion-source'],
      allowCrossDomain: false,
    });
    expect(result.capsule.metadata.requiredChecks.map((check) => check.kind)).toEqual([
      'dimension',
      'symbol_closure',
      'convention',
      'assumption_scope',
    ]);
    expect(result.capsule.metadata.actionAffordances).toContainEqual(
      expect.objectContaining({
        actionId: 'memory.propose_capsule',
        intent: 'recommended',
      }),
    );
    expect(result.capsule.body).toContain('## Open Questions');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'open-questions-preserved' }),
    );
  });
});
