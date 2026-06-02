import { describe, expect, it } from 'vitest';

import {
  DomainProfileRegistry,
  parseDomainProfileText,
  type DomainProfile,
  type DomainProfileRoot,
} from '../../src/domain-profile';

describe('domain profile registry', () => {
  it('parses domain profile frontmatter with aliases', () => {
    const profile = parseDomainProfileText({
      path: '/tmp/fqhe.md',
      source: 'project',
      text: [
        '---',
        'id: domain.fqhe-cs',
        'kind: domain_profile',
        'title: FQHE and Abelian Chern-Simons theory',
        'domain: topological-order/fqhe-cs',
        'status: raw',
        'source_refs:',
        '  - local:test',
        'conventions:',
        '  - convention.external-em-flux',
        'lenses:',
        '  - charge_flux_quantization',
        'workflows:',
        '  - workflow.fqhe-cs.explain-charge-flux',
        'capsule_refs:',
        '  - capsule.fqhe.flux-insertion',
        'context_tags:',
        '  - fqhe',
        '---',
        'Domain notes.',
      ].join('\n'),
    });

    expect(profile.metadata).toMatchObject({
      id: 'domain.fqhe-cs',
      kind: 'domain_profile',
      domain: 'topological-order/fqhe-cs',
      status: 'raw',
      sourceRefs: ['local:test'],
      lenses: ['charge_flux_quantization'],
      workflows: ['workflow.fqhe-cs.explain-charge-flux'],
    });
    expect(profile.body).toBe('Domain notes.');
  });

  it('lists domains and filters profiles by domain', () => {
    const registry = new DomainProfileRegistry();
    registry.register(profile('domain.fqhe', 'topological-order/fqhe-cs'));
    registry.register(profile('domain.librpa', 'librpa'));

    expect(registry.listDomains()).toEqual(['librpa', 'topological-order/fqhe-cs']);
    expect(registry.listProfiles({ domain: 'librpa' }).map((item) => item.metadata.id)).toEqual([
      'domain.librpa',
    ]);
  });

  it('keeps the first profile for duplicate ids unless replace is requested', () => {
    const registry = new DomainProfileRegistry();
    registry.register(profile('same', 'first'));
    registry.register(profile('same', 'second'));
    expect(registry.requireProfile('same').metadata.domain).toBe('first');
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'duplicate-domain-profile-id',
        profileId: 'same',
      }),
    );

    registry.register(profile('same', 'second'), { replace: true });
    expect(registry.requireProfile('same').metadata.domain).toBe('second');
  });

  it('preserves root provenance and records scan warnings as registry diagnostics', async () => {
    const roots: readonly DomainProfileRoot[] = [
      { path: '/project/.aitp/domain-profiles', source: 'project' },
      { path: '/user/.aitp/domain-profiles', source: 'user' },
      { path: '/project/.aitp/domain-profiles', source: 'project' },
    ];
    const registry = new DomainProfileRegistry({
      discover: async (input) => {
        input.onWarning?.('bad profile', new Error('missing source refs'));
        return [profile('domain.fqhe', 'topological-order/fqhe-cs')];
      },
    });

    await registry.loadRoots(roots);

    expect(registry.getRoots()).toEqual([
      { path: '/project/.aitp/domain-profiles', source: 'project' },
      { path: '/user/.aitp/domain-profiles', source: 'user' },
    ]);
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'scan-warning',
        message: 'bad profile: missing source refs',
      }),
    );
  });
});

function profile(id: string, domain: string): DomainProfile {
  return {
    path: `/tmp/${id}.md`,
    source: 'project',
    body: '',
    metadata: {
      id,
      kind: 'domain_profile',
      title: id,
      domain,
      status: 'raw',
      sourceRefs: ['local:test'],
      conventions: [],
      lenses: [],
      workflows: [],
      capsuleRefs: [],
      bridgeCapsules: [],
      contextTags: [],
    },
  };
}
