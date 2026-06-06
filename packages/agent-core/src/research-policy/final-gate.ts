import { blockingOpenObligations } from '../research-action';
import type {
  FinalAnswerClaimStatus,
  FinalGateAitpCallObligation,
  FinalGateDecision,
  FinalGateInput,
} from './types';

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
  const openAitpCalls = (input.aitpCallObligations ?? []).filter(
    (obligation) => !obligation.satisfied && !obligation.blockerRecorded,
  );
  const requiredNowAitpCalls = openAitpCalls.filter((obligation) => obligation.requiredNow);
  const trustBoundaryAitpCalls = openAitpCalls.filter((obligation) => obligation.trustBoundary);
  for (const obligation of openAitpCalls) {
    requiredActionIds.add(obligation.actionId);
  }

  if (openBlocking.length > 0) {
    reasons.push('Open blocking obligations prevent validated final claims.');
    allowedStatus = minStatus(allowedStatus, 'provisional');
    outcome = input.mustBeValidated === true ? 'block' : 'downgrade';
  }

  if (requiredNowAitpCalls.length > 0 && STATUS_RANK[input.requestedStatus] >= 1) {
    reasons.push('AITP required-now call obligations are still open.');
    allowedStatus = minStatus(allowedStatus, 'exploratory');
    outcome = input.mustBeValidated === true ? 'block' : 'downgrade';
  }

  if (trustBoundaryAitpCalls.length > 0 && STATUS_RANK[input.requestedStatus] >= 2) {
    reasons.push('AITP trust-boundary prerequisites are still open.');
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
    openAitpCallObligationIds: openAitpCalls.map((obligation) => obligation.id).toSorted(),
    aitpLifecycleTriggerLines: openAitpCalls
      .map(renderAitpLifecycleTriggerLine)
      .filter((line): line is string => line !== undefined),
    requiredActionIds: [...requiredActionIds].toSorted(),
  };
}

export function shouldApplyFinalGate(input: {
  readonly requestedStatus: FinalAnswerClaimStatus;
  readonly hasWorkFrame: boolean;
  readonly obligationCount: number;
  readonly evidenceCount: number;
  readonly aitpCallObligationCount?: number | undefined;
}): boolean {
  if (!input.hasWorkFrame) return false;
  if (input.requestedStatus === 'validated') return true;
  return (
    input.obligationCount > 0 ||
    input.evidenceCount > 0 ||
    (input.aitpCallObligationCount ?? 0) > 0
  );
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
  if (decision.openAitpCallObligationIds.length > 0) {
    lines.push(`Open AITP call obligations: ${decision.openAitpCallObligationIds.join(', ')}.`);
  }
  if (decision.aitpLifecycleTriggerLines.length > 0) {
    lines.push(`AITP lifecycle triggers: ${decision.aitpLifecycleTriggerLines.join('; ')}.`);
  }
  if (decision.reasons.length > 0) {
    lines.push(`Reasons: ${decision.reasons.join(' ')}`);
  }
  return lines.join(' ');
}

function renderAitpLifecycleTriggerLine(
  obligation: FinalGateAitpCallObligation,
): string | undefined {
  const trigger = obligation.lifecycleTrigger;
  if (trigger === undefined || !hasLifecycleTrigger(trigger)) return undefined;
  const phases =
    trigger.lifecyclePhases.length === 0 ? 'phase=unspecified' : `phase=${trigger.lifecyclePhases.join(',')}`;
  const conditions =
    trigger.triggerConditions.length === 0 ? '' : ` when=${trigger.triggerConditions.join('|')}`;
  const threshold =
    trigger.recordingThreshold === undefined ? '' : ` threshold=${trigger.recordingThreshold}`;
  const boundary = renderTrustBoundaryInputs(trigger.trustBoundaryInputs);
  const host =
    trigger.recommendedHostBehavior.length === 0
      ? ''
      : ` host=${trigger.recommendedHostBehavior.join('|')}`;
  return `${obligation.actionId}@${phases}${conditions}${threshold}${boundary}${host}`;
}

function renderTrustBoundaryInputs(
  inputs: NonNullable<FinalGateAitpCallObligation['lifecycleTrigger']>['trustBoundaryInputs'],
): string {
  const parts: string[] = [];
  if (inputs.targetRefs.length > 0) parts.push(`targets=${inputs.targetRefs.join(',')}`);
  if (inputs.claimId !== undefined && inputs.claimId.length > 0) parts.push(`claim=${inputs.claimId}`);
  if (inputs.entrypoints.length > 0) parts.push(`entrypoints=${inputs.entrypoints.join(',')}`);
  if (inputs.requiresPreflight) parts.push('requires_preflight=true');
  if (inputs.finalGateRequired) parts.push('final_gate_required=true');
  return parts.length === 0 ? '' : ` trust_inputs=${parts.join('|')}`;
}

function hasLifecycleTrigger(
  trigger: FinalGateAitpCallObligation['lifecycleTrigger'],
): boolean {
  return (
    trigger !== undefined &&
    (trigger.lifecyclePhases.length > 0 ||
      trigger.triggerConditions.length > 0 ||
      trigger.recordingThreshold !== undefined ||
      trigger.trustBoundaryInputs.targetRefs.length > 0 ||
      trigger.trustBoundaryInputs.entrypoints.length > 0 ||
      trigger.trustBoundaryInputs.requiredBeforeTrustChange.length > 0 ||
      trigger.trustBoundaryInputs.requiresPreflight ||
      trigger.trustBoundaryInputs.finalGateRequired ||
      trigger.recommendedHostBehavior.length > 0)
  );
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
