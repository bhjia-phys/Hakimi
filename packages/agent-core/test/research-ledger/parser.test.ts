import { describe, expect, it } from 'vitest';

import {
  parseResearchLedgerEventText,
  ResearchLedgerParseError,
} from '../../src/research-ledger';

describe('research ledger parser', () => {
  it('parses source-backed ledger event metadata and preserves body text', () => {
    const event = parseResearchLedgerEventText({
      path: '/repo/.aitp/research-ledger/fqhe/events/flux-note.md',
      root: {
        path: '/repo/.aitp/research-ledger',
        source: 'project',
      },
      text: [
        '---',
        'id: event.fqhe.flux-note',
        'type: derivation_scratch',
        'topic: fqhe-cs-effective-theory',
        'domain: topological-order',
        'status: captured',
        'source_refs:',
        '  - paper:zhang-hansson-kivelson-1989',
        'depends_on:',
        '  - event.fqhe.source-excerpt',
        'candidate_capsule_kind: DerivationStep',
        'open_questions:',
        '  - check flux quantum convention',
        'related_objects:',
        '  - formula:fqhe.flux-quantization',
        'created_at: 2026-06-01T00:00:00.000Z',
        '---',
        '',
        '## Observation',
        '',
        'The scratch derivation uses one statistical flux unit.',
        '',
      ].join('\n'),
    });

    expect(event.metadata).toEqual({
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
    });
    expect(event.body).toBe(
      '\n## Observation\n\nThe scratch derivation uses one statistical flux unit.\n',
    );
  });

  it('rejects unknown event type, status, and candidate capsule kind', () => {
    expect(() =>
      parseResearchLedgerEventText({
        path: '/tmp/bad-type.md',
        root: { path: '/tmp', source: 'project' },
        text: [
          '---',
          'id: bad',
          'type: anomaly',
          'topic: qft',
          'domain: qft',
          'status: captured',
          '---',
          'Body',
        ].join('\n'),
      }),
    ).toThrow(ResearchLedgerParseError);

    expect(() =>
      parseResearchLedgerEventText({
        path: '/tmp/bad-status.md',
        root: { path: '/tmp', source: 'project' },
        text: [
          '---',
          'id: bad',
          'type: source_excerpt',
          'topic: qft',
          'domain: qft',
          'status: validated',
          '---',
          'Body',
        ].join('\n'),
      }),
    ).toThrow(/status/);

    expect(() =>
      parseResearchLedgerEventText({
        path: '/tmp/bad-kind.md',
        root: { path: '/tmp', source: 'project' },
        text: [
          '---',
          'id: bad',
          'type: source_excerpt',
          'topic: qft',
          'domain: qft',
          'status: captured',
          'candidate_capsule_kind: Anomaly',
          '---',
          'Body',
        ].join('\n'),
      }),
    ).toThrow(/candidate capsule kind/);
  });

  it('requires the canonical routing fields', () => {
    expect(() =>
      parseResearchLedgerEventText({
        path: '/tmp/missing.md',
        root: { path: '/tmp', source: 'project' },
        text: ['---', 'id: missing', 'type: source_excerpt', 'status: captured', '---', 'Body'].join(
          '\n',
        ),
      }),
    ).toThrow(/topic/);
  });
});
