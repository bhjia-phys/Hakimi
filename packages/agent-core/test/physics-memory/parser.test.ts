import { describe, expect, it } from 'vitest';

import { parsePhysicsCapsuleText, PhysicsMemoryParseError } from '../../src/physics-memory';

describe('physics memory parser', () => {
  it('parses capsule metadata with graph refs, checks, and action affordances', () => {
    const capsule = parsePhysicsCapsuleText({
      path: '/tmp/formula.md',
      source: 'project',
      text: [
        '---',
        'id: formula.librpa.chi0',
        'kind: Formula',
        'domain: librpa',
        'title: Independent-particle polarizability',
        'reliability: linked',
        'symbols:',
        '  - chi0',
        'depends_on:',
        '  - assumption.rpa.no_vertex',
        'source_refs:',
        '  - local:librpa-notes/chi0.md',
        'graph_refs:',
        '  - kind: Formula',
        '    id: graph.librpa.formula.chi0',
        '    relation: defines',
        'expansion_handles:',
        '  - kind: derivation',
        '    ref: graph.librpa.derivation.chi0',
        'required_checks:',
        '  - id: check.dimension.chi0',
        '    kind: dimension',
        '    severity: warning',
        'action_affordances:',
        '  - action_id: derive.check_dimension_consistency',
        '    intent: recommended',
        '---',
        '# Body',
        'Formula details.',
      ].join('\n'),
    });

    expect(capsule.metadata.id).toBe('formula.librpa.chi0');
    expect(capsule.metadata.dependsOn).toEqual(['assumption.rpa.no_vertex']);
    expect(capsule.metadata.graphRefs[0]).toEqual({
      kind: 'Formula',
      id: 'graph.librpa.formula.chi0',
      relation: 'defines',
    });
    expect(capsule.metadata.requiredChecks[0]?.kind).toBe('dimension');
    expect(capsule.metadata.actionAffordances[0]).toEqual({
      actionId: 'derive.check_dimension_consistency',
      intent: 'recommended',
    });
    expect(capsule.body).toBe('# Body\nFormula details.');
  });

  it('rejects invalid capsule kinds', () => {
    expect(() =>
      parsePhysicsCapsuleText({
        path: '/tmp/bad.md',
        source: 'project',
        text: [
          '---',
          'id: bad',
          'kind: Anomaly',
          'domain: qft',
          'title: Bad type',
          'reliability: raw',
          '---',
          'Body',
        ].join('\n'),
      }),
    ).toThrow(PhysicsMemoryParseError);
  });

  it('requires canonical provenance and reliability fields', () => {
    expect(() =>
      parsePhysicsCapsuleText({
        path: '/tmp/missing.md',
        source: 'project',
        text: ['---', 'id: missing', 'kind: Formula', 'domain: librpa', 'title: Missing', '---', 'Body'].join(
          '\n',
        ),
      }),
    ).toThrow(/reliability/);

    expect(() =>
      parsePhysicsCapsuleText({
        path: '/tmp/missing-source.md',
        source: 'project',
        text: [
          '---',
          'id: missing-source',
          'kind: Formula',
          'domain: librpa',
          'title: Missing source',
          'reliability: raw',
          '---',
          'Body',
        ].join('\n'),
      }),
    ).toThrow(/sourceRefs/);
  });
});
