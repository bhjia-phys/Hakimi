/**
 * `aitpResearch` domain — explicit Line-to-workstream binding projection.
 *
 * Derives current alignment from Hakimi-local confirmation provenance and the
 * observed AITP Topic, and compares immutable binding tuples exactly.
 */

import type {
  ResearchLineWorkstreamAlignment,
  ResearchLineWorkstreamBinding,
  ResearchProgram,
} from '#/features/research/types';
import type { AitpMaintenanceReceipt } from '#/features/aitpResearch/types';

/**
 * Accept a scoped maintenance receipt only when it belongs to the exact
 * confirmed workstream and the fresh unscoped Program observation. Degraded
 * receipts without Topic data are safe only when they carry no scientific
 * projection that could have come from a different Topic.
 */
export function isMaintenanceReceiptAligned(input: {
  readonly receipt: AitpMaintenanceReceipt;
  readonly binding: ResearchLineWorkstreamBinding;
  readonly program: Omit<ResearchProgram, 'observedRevision'> & {
    readonly observedRevision?: number;
  };
}): boolean {
  const { receipt, binding, program } = input;
  if (
    receipt.workstream !== binding.workstream ||
    binding.topicId !== program.topicId ||
    binding.observedRevision !== (program.observedRevision ?? 1)
  ) return false;
  if (receipt.topic === undefined) {
    return receipt.status === 'degraded' &&
      receipt.activeNewerThanWorkingNote === null &&
      receipt.unresolvedFailures.length === 0 &&
      receipt.nextAction === undefined &&
      receipt.nextActionDetails === undefined;
  }
  return receipt.topic.id === program.topicId &&
    receipt.topic.title === program.title &&
    receipt.topic.goalText === program.goalText &&
    receipt.topic.goalSource === program.goalSource &&
    receipt.unresolvedFailures.every((failure) => failure.workstream === binding.workstream);
}

export function deriveLineWorkstreamAlignment(input: {
  readonly lineSlug: string;
  readonly binding?: ResearchLineWorkstreamBinding;
  readonly program?: ResearchProgram | null;
}): ResearchLineWorkstreamAlignment {
  const { lineSlug, binding, program } = input;
  if (binding === undefined) {
    return {
      lineSlug,
      status: 'unbound',
      reason: `Research Line ${lineSlug} has no explicitly confirmed AITP workstream.`,
    };
  }
  if (binding.lineSlug !== lineSlug) {
    return {
      lineSlug,
      status: 'conflict',
      reason: `The stored binding identifies Research Line ${binding.lineSlug}, not ${lineSlug}.`,
      binding,
    };
  }
  if (program === undefined || program === null) {
    return {
      lineSlug,
      status: 'unavailable',
      reason: 'The binding exists, but no current AITP Topic has been observed.',
      binding,
    };
  }
  if (binding.topicId !== program.topicId) {
    return {
      lineSlug,
      status: 'conflict',
      reason: `The binding belongs to AITP Topic ${binding.topicId}, but the current Topic is ${program.topicId}.`,
      binding,
    };
  }
  if (binding.observedRevision !== program.observedRevision) {
    return {
      lineSlug,
      status: 'stale',
      reason: `The AITP Topic observation changed from revision ${String(binding.observedRevision)} to ${String(program.observedRevision)}; confirm membership again.`,
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

export function sameLineWorkstreamBinding(
  left: ResearchLineWorkstreamBinding | undefined,
  right: ResearchLineWorkstreamBinding | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.confirmationId === right.confirmationId
    && left.lineSlug === right.lineSlug
    && left.workstream === right.workstream
    && left.topicId === right.topicId
    && left.observedRevision === right.observedRevision
    && left.confirmedBy === right.confirmedBy
    && left.confirmedAt === right.confirmedAt;
}
