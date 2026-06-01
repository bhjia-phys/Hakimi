import { describe, expect, it } from 'vitest';

import {
  ResearchLedgerRegistry,
  type ResearchLedgerEvent,
  type ResearchLedgerRoot,
} from '../../src/research-ledger';

describe('research ledger registry', () => {
  it('lists topics, domains, and filters events by topic, domain, type, and status', () => {
    const registry = new ResearchLedgerRegistry();
    registry.register(event('event.fqhe.source', 'fqhe', 'topological-order', 'source_excerpt'));
    registry.register(
      event('event.fqhe.derivation', 'fqhe', 'topological-order', 'derivation_scratch'),
    );
    registry.register(event('event.librpa.code', 'librpa-head-wing', 'librpa', 'code_observation'));

    expect(registry.listDomains()).toEqual(['librpa', 'topological-order']);
    expect(registry.listTopics({ domain: 'topological-order' })).toEqual(['fqhe']);
    expect(registry.listEvents({ topic: 'fqhe' }).map((item) => item.metadata.id)).toEqual([
      'event.fqhe.derivation',
      'event.fqhe.source',
    ]);
    expect(registry.listEvents({ domain: 'librpa' }).map((item) => item.metadata.id)).toEqual([
      'event.librpa.code',
    ]);
    expect(
      registry.listEvents({ type: 'derivation_scratch' }).map((item) => item.metadata.id),
    ).toEqual(['event.fqhe.derivation']);
    expect(registry.listEvents({ status: 'captured' }).map((item) => item.metadata.id)).toEqual([
      'event.fqhe.derivation',
      'event.fqhe.source',
      'event.librpa.code',
    ]);
  });

  it('keeps the first event for duplicate ids unless replace is requested', () => {
    const registry = new ResearchLedgerRegistry();
    registry.register(event('same', 'first', 'qft', 'source_excerpt'));
    registry.register(event('same', 'second', 'qft', 'source_excerpt'));
    expect(registry.requireEvent('same').metadata.topic).toBe('first');
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'duplicate-event-id',
        eventId: 'same',
        path: '/tmp/same.md',
      }),
    );

    registry.register(event('same', 'second', 'qft', 'source_excerpt'), { replace: true });
    expect(registry.requireEvent('same').metadata.topic).toBe('second');
  });

  it('preserves root provenance and records scan warnings as registry diagnostics', async () => {
    const roots: readonly ResearchLedgerRoot[] = [
      { path: '/project/.aitp/research-ledger', source: 'project' },
      { path: '/user/.aitp/research-ledger', source: 'user' },
      { path: '/project/.aitp/research-ledger', source: 'project' },
    ];
    const registry = new ResearchLedgerRegistry({
      discover: async (input) => {
        input.onWarning?.('bad event', new Error('missing topic'));
        return [event('event.fqhe.source', 'fqhe', 'topological-order', 'source_excerpt')];
      },
    });

    await registry.loadRoots(roots);

    expect(registry.getRoots()).toEqual([
      { path: '/project/.aitp/research-ledger', source: 'project' },
      { path: '/user/.aitp/research-ledger', source: 'user' },
    ]);
    expect(registry.requireEvent('event.fqhe.source').metadata.domain).toBe('topological-order');
    expect(registry.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'scan-warning',
        message: 'bad event: missing topic',
      }),
    );
  });
});

function event(
  id: string,
  topic: string,
  domain: string,
  type: ResearchLedgerEvent['metadata']['type'],
  overrides: Partial<ResearchLedgerEvent> = {},
): ResearchLedgerEvent {
  return {
    path: `/tmp/${id}.md`,
    body: overrides.body ?? '',
    root: overrides.root ?? { path: '/tmp', source: 'project' },
    metadata: {
      id,
      topic,
      domain,
      type,
      status: 'captured',
      sourceRefs: ['local:test'],
      dependsOn: [],
      openQuestions: [],
      relatedObjects: [],
      ...overrides.metadata,
    },
  };
}
