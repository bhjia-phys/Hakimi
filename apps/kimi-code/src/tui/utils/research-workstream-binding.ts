import type { ResearchStatusSnapshot } from '@bhjia-phys/hakimi-sdk';

export type ResearchLineWorkstreamAlignment = NonNullable<
  ResearchStatusSnapshot['currentWorkstreamBinding']
>;

/**
 * Project one Line's binding against the currently observed AITP Topic.
 *
 * The active Line keeps the coordinator-provided alignment as its source of
 * truth. Other Lines only have stored immutable bindings in the snapshot, so
 * the TUI derives their display status without inferring membership from a
 * matching slug.
 */
export function projectLineWorkstreamAlignment(
  snapshot: ResearchStatusSnapshot,
  lineSlug: string,
): ResearchLineWorkstreamAlignment {
  if (
    lineSlug === snapshot.currentLineSlug &&
    snapshot.currentWorkstreamBinding !== undefined
  ) {
    return snapshot.currentWorkstreamBinding;
  }

  const binding = (snapshot.lineWorkstreamBindings ?? []).find(
    (candidate) => candidate.lineSlug === lineSlug,
  );
  if (binding === undefined) {
    return {
      lineSlug,
      status: 'unbound',
      reason: `Research Line ${lineSlug} has no explicitly confirmed AITP workstream.`,
    };
  }
  if (snapshot.program === undefined) {
    return {
      lineSlug,
      status: 'unavailable',
      reason: 'The binding exists, but no current AITP Topic has been observed.',
      binding,
    };
  }
  if (binding.topicId !== snapshot.program.topicId) {
    return {
      lineSlug,
      status: 'conflict',
      reason: `The binding belongs to AITP Topic ${binding.topicId}, but the current Topic is ${snapshot.program.topicId}.`,
      binding,
    };
  }
  if (binding.observedRevision !== snapshot.program.observedRevision) {
    return {
      lineSlug,
      status: 'stale',
      reason: `The AITP Topic observation changed from revision ${String(binding.observedRevision)} to ${String(snapshot.program.observedRevision)}; confirm membership again.`,
      binding,
    };
  }
  return {
    lineSlug,
    status: 'bound',
    reason: `Research Line ${lineSlug} is explicitly bound to AITP workstream ${binding.workstream}.`,
    binding,
  };
}
