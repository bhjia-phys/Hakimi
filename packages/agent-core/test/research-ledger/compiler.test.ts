import { describe, expect, it } from 'vitest';

import {
  compileResearchLedgerProposals,
  ResearchLedgerRegistry,
  type ResearchLedgerEvent,
} from '../../src/research-ledger';

describe('research ledger compiler', () => {
  it('compiles linked events into capsule proposals without promotion', () => {
    const registry = new ResearchLedgerRegistry();
    registry.register(
      event('event.fqhe.flux-step', {
        status: 'linked',
        candidateCapsuleKind: 'DerivationStep',
        openQuestions: [],
      }),
    );
    registry.register(
      event('event.fqhe.raw-note', {
        status: 'captured',
        candidateCapsuleKind: 'Formula',
      }),
    );

    const result = compileResearchLedgerProposals(registry, {
      topic: 'fqhe-cs-effective-theory',
      domain: 'topological-order',
    });

    expect(result.proposals).toEqual([
      expect.objectContaining({
        id: 'proposal.event.fqhe.flux-step.derivationstep',
        kind: 'capsule',
        targetCapsuleKind: 'DerivationStep',
        eventIds: ['event.fqhe.flux-step'],
        confidence: 'high',
      }),
    ]);
    expect(result.proposals[0]).not.toHaveProperty('promoted');
  });

  it('emits diagnostics for missing provenance, missing body, missing candidate kind, and open questions', () => {
    const registry = new ResearchLedgerRegistry();
    registry.register(
      event('event.fqhe.problem', {
        status: 'linked',
        sourceRefs: [],
        body: '',
        candidateCapsuleKind: undefined,
        openQuestions: ['check CS level normalization'],
      }),
    );

    const result = compileResearchLedgerProposals(registry, {
      includeStatuses: ['linked'],
    });

    expect(result.proposals[0]).toEqual(
      expect.objectContaining({
        kind: 'obligation',
        confidence: 'low',
      }),
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'missing-source-ref',
      'missing-body',
      'missing-candidate-kind',
      'unresolved-open-question',
    ]);
  });
});

function event(
  id: string,
  overrides: Partial<ResearchLedgerEvent['metadata']> & {
    readonly body?: string;
  } = {},
): ResearchLedgerEvent {
  return {
    path: `/tmp/${id}.md`,
    body: overrides.body ?? 'Body',
    root: { path: '/tmp', source: 'project' },
    metadata: {
      id,
      type: 'derivation_scratch',
      topic: 'fqhe-cs-effective-theory',
      domain: 'topological-order',
      status: 'linked',
      sourceRefs: ['paper:zhang-hansson-kivelson-1989'],
      dependsOn: [],
      candidateCapsuleKind: 'DerivationStep',
      openQuestions: ['check flux quantum convention'],
      relatedObjects: [],
      ...overrides,
    },
  };
}
