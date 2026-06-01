import { describe, expect, it } from 'vitest';

import { ResearchActionRegistry, type ResearchActionDefinition } from '../../src/research-action';

describe('research action registry', () => {
  it('filters actions by exposure, category, domain, and capsule kind', () => {
    const registry = new ResearchActionRegistry();
    registry.register(action('graph.expand_capsule', 'graph', 'direct', ['librpa'], ['Formula']));
    registry.register(action('derive.check_dimension', 'derivation', 'deferred', ['librpa'], ['Formula']));
    registry.register(action('harness.score_trace', 'harness', 'hidden'));

    expect(registry.listModelVisibleActions().map((item) => item.id)).toEqual([
      'graph.expand_capsule',
    ]);
    expect(
      registry
        .listActions({ exposure: 'deferred', domain: 'librpa', capsuleKind: 'Formula' })
        .map((item) => item.id),
    ).toEqual(['derive.check_dimension']);
    expect(registry.listActions({ category: 'harness' }).map((item) => item.id)).toEqual([
      'harness.score_trace',
    ]);
  });

  it('keeps first registration unless replace is requested', () => {
    const registry = new ResearchActionRegistry();
    registry.register(action('same', 'graph', 'direct'));
    registry.register({ ...action('same', 'code', 'hidden'), title: 'second' });
    expect(registry.requireAction('same').category).toBe('graph');

    registry.register({ ...action('same', 'code', 'hidden'), title: 'second' }, { replace: true });
    expect(registry.requireAction('same').category).toBe('code');
  });
});

function action(
  id: string,
  category: ResearchActionDefinition['category'],
  exposure: ResearchActionDefinition['exposure'],
  domains?: ResearchActionDefinition['domains'],
  capsuleKinds?: ResearchActionDefinition['capsuleKinds'],
): ResearchActionDefinition {
  return {
    id,
    category,
    exposure,
    domains,
    capsuleKinds,
    title: id,
    description: `${id} description`,
  };
}
