import { blockingOpenObligations } from '../research-action';
import type { FinalAnswerClaimStatus, FinalGateDecision, FinalGateInput } from './types';

const STATUS_RANK: Record<FinalAnswerClaimStatus, number> = {
  exploratory: 0,
  provisional: 1,
  checked: 2,
  validated: 3,
};

export function evaluateFinalGate(input: FinalGateInput): FinalGateDecision {
  const reasons: string[] = [];
  const requiredActionIds = new Set<string>();
  let allowedStatus = input.requestedStatus;
  let outcome: FinalGateDecision['outcome'] = 'allow';

  const openBlocking = blockingOpenObligations(input.obligations);
  for (const obligation of openBlocking) {
    requiredActionIds.add(obligation.requiredActionId);
  }

  if (openBlocking.length > 0) {
    reasons.push('Open blocking obligations prevent validated final claims.');
    allowedStatus = minStatus(allowedStatus, 'provisional');
    outcome = input.mustBeValidated === true ? 'block' : 'downgrade';
  }

  if (input.workFrame?.trustState === 'blocked' && STATUS_RANK[input.requestedStatus] >= 2) {
    reasons.push('Blocked WorkFrame cannot support checked or validated final status.');
    allowedStatus = minStatus(allowedStatus, 'provisional');
    outcome = input.mustBeValidated === true ? 'block' : 'downgrade';
  }

  if (input.requestedStatus === 'validated' && !hasEvidence(input)) {
    reasons.push('Validated final status requires explicit evidence or source refs.');
    allowedStatus = minStatus(allowedStatus, 'checked');
    outcome = outcome === 'block' ? 'block' : 'downgrade';
    requiredActionIds.add('validate.check_source_support');
  }

  return {
    outcome,
    allowedStatus,
    reasons,
    openBlockingObligationIds: openBlocking.map((obligation) => obligation.id).toSorted(),
    requiredActionIds: [...requiredActionIds].toSorted(),
  };
}

export function shouldApplyFinalGate(input: {
  readonly requestedStatus: FinalAnswerClaimStatus;
  readonly hasWorkFrame: boolean;
  readonly obligationCount: number;
  readonly evidenceCount: number;
}): boolean {
  if (!input.hasWorkFrame) return false;
  if (input.requestedStatus === 'validated') return true;
  return input.obligationCount > 0 || input.evidenceCount > 0;
}

export function renderFinalGateContinuation(decision: FinalGateDecision): string {
  const lines = [
    `Before finishing, revise the answer with status="${decision.allowedStatus}".`,
  ];
  if (decision.outcome === 'block') {
    lines.push('Do not claim completion; state that the task is blocked on missing checks.');
  } else if (decision.outcome === 'downgrade') {
    lines.push('Do not overclaim validation; briefly name the missing checks or evidence.');
  }
  if (decision.requiredActionIds.length > 0) {
    lines.push(`Required actions: ${decision.requiredActionIds.join(', ')}.`);
  }
  if (decision.reasons.length > 0) {
    lines.push(`Reasons: ${decision.reasons.join(' ')}`);
  }
  return lines.join(' ');
}

function hasEvidence(input: FinalGateInput): boolean {
  return (input.evidenceRefs?.length ?? 0) > 0 || (input.sourceRefs?.length ?? 0) > 0;
}

function minStatus(
  left: FinalAnswerClaimStatus,
  right: FinalAnswerClaimStatus,
): FinalAnswerClaimStatus {
  return STATUS_RANK[left] <= STATUS_RANK[right] ? left : right;
}
