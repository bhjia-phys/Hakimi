import { describe, expect, it } from 'vitest';

import {
  isResearchLedgerEventStatus,
  isResearchLedgerEventType,
  type CompileProposal,
  type PrecompilePacket,
  type PromotionPacket,
  type ResearchLedgerEvent,
} from '../../src/research-ledger';

describe('research ledger types', () => {
  it('recognizes event types and statuses', () => {
    expect(isResearchLedgerEventType('derivation_scratch')).toBe(true);
    expect(isResearchLedgerEventType('unknown')).toBe(false);
    expect(isResearchLedgerEventStatus('captured')).toBe(true);
    expect(isResearchLedgerEventStatus('validated')).toBe(false);
  });

  it('models a source-backed event and compile lifecycle packets', () => {
    const event: ResearchLedgerEvent = {
      metadata: {
        id: 'event.fqhe.flux-note',
        type: 'derivation_scratch',
        topic: 'fqhe-cs-effective-theory',
        domain: 'topological-order',
        status: 'captured',
        sourceRefs: ['paper:zhang-hansson-kivelson-1989'],
        dependsOn: ['event.fqhe.source-excerpt'],
        candidateCapsuleKind: 'DerivationStep',
        openQuestions: ['check flux quantum convention'],
        relatedObjects: ['formula:fqhe.flux-quantization'],
        createdAt: '2026-06-01T00:00:00.000Z',
      },
      path: '/repo/.aitp/research-ledger/fqhe/events/flux-note.md',
      body: 'The scratch derivation uses one statistical flux unit.',
      root: {
        path: '/repo/.aitp/research-ledger',
        source: 'project',
      },
    };

    const packet: PrecompilePacket = {
      id: 'precompile.fqhe.flux-note',
      topic: event.metadata.topic,
      domain: event.metadata.domain,
      eventIds: [event.metadata.id],
      sourceRefs: event.metadata.sourceRefs,
      openQuestions: event.metadata.openQuestions,
    };

    const proposal: CompileProposal = {
      id: 'proposal.fqhe.flux-step',
      kind: 'capsule',
      topic: packet.topic,
      domain: packet.domain,
      eventIds: packet.eventIds,
      targetCapsuleKind: 'DerivationStep',
      sourceRefs: packet.sourceRefs,
      openQuestions: packet.openQuestions,
      confidence: 'medium',
    };

    const promotion: PromotionPacket = {
      id: 'promotion.fqhe.flux-step',
      proposalIds: [proposal.id],
      targetCapsuleIds: ['derivation.fqhe.flux-attachment'],
      evidenceRefs: proposal.sourceRefs,
      requiredHumanCheckpoint: true,
    };

    expect(event.metadata.status).toBe('captured');
    expect(packet.eventIds).toEqual(['event.fqhe.flux-note']);
    expect(proposal.targetCapsuleKind).toBe('DerivationStep');
    expect(promotion.requiredHumanCheckpoint).toBe(true);
  });
});
