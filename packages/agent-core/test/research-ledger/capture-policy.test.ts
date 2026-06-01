import { describe, expect, it } from 'vitest';

import {
  buildResearchCaptureDecision,
  eventTypeForCaptureClass,
} from '../../src/research-ledger';

describe('research capture policy', () => {
  it('maps controlled capture classes to ledger event types and write inputs', () => {
    expect(eventTypeForCaptureClass('source_excerpt')).toBe('source_excerpt');
    expect(eventTypeForCaptureClass('git_diff_observation')).toBe('git_diff_observation');
    expect(eventTypeForCaptureClass('benchmark_observation')).toBe('benchmark_observation');
    expect(eventTypeForCaptureClass('failure_observation')).toBe('failure_observation');

    const decision = buildResearchCaptureDecision({
      captureClass: 'git_diff_observation',
      topic: 'librpa-head-wing',
      domain: 'librpa',
      title: 'Head wing src/foo.cpp diff',
      body: 'The change touches head-wing assembly.',
      sourceRefs: ['git:diff:head-wing'],
      artifactRefs: ['artifact:diff.patch'],
      relatedObjects: ['code:librpa/head-wing'],
      candidateCapsuleKind: 'CodeMapping',
      openQuestions: ['check downstream call sites'],
      createdAt: '2026-06-02T00:00:00.000Z',
    });

    expect(decision.capture).toBe(true);
    expect(decision.writeInput).toMatchObject({
      metadata: {
        id: 'event.librpa-head-wing.git_diff_observation.Head-wing-src-foo.cpp-diff',
        type: 'git_diff_observation',
        topic: 'librpa-head-wing',
        domain: 'librpa',
        status: 'captured',
        sourceRefs: ['git:diff:head-wing', 'artifact:diff.patch'],
        relatedObjects: ['code:librpa/head-wing'],
        candidateCapsuleKind: 'CodeMapping',
        openQuestions: ['check downstream call sites'],
        createdAt: '2026-06-02T00:00:00.000Z',
      },
    });
    expect(decision.writeInput?.body).toContain('## Artifact Refs');
  });

  it('rejects provenance-free captures and long inline outputs without artifact refs', () => {
    const missingProvenance = buildResearchCaptureDecision({
      captureClass: 'source_excerpt',
      topic: 'fqhe-cs',
      domain: 'topological-order',
      title: 'Uncited note',
      body: 'No source.',
    });
    expect(missingProvenance.capture).toBe(false);
    expect(missingProvenance.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'missing-provenance',
    );

    const longOutput = buildResearchCaptureDecision({
      captureClass: 'benchmark_observation',
      topic: 'librpa-head-wing',
      domain: 'librpa',
      title: 'Long benchmark log',
      body: 'x'.repeat(5000),
      sourceRefs: ['local:benchmark-log'],
    });
    expect(longOutput.capture).toBe(false);
    expect(longOutput.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'long-output-needs-artifact-ref',
    );
  });
});
