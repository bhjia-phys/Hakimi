import type { PhysicsDomainId } from '../physics-memory';
import type { PhysicsLensApplicabilityResult } from '../physics-direction';
import type { AitpLifecycleTriggerInfo } from '../aitp/types';
import type { ResearchActionBinding, ResearchObligation, WorkFrame } from '../research-action';

export type EscalationTier = 'tier0_light' | 'tier1_scoped' | 'tier2_verified' | 'tier3_promotion';
export type RuntimeRequirementLevel = 'none' | 'recommended' | 'required';

export interface RuntimeEscalationRequirements {
  readonly workFrame: RuntimeRequirementLevel;
  readonly actionTrace: RuntimeRequirementLevel;
  readonly ledgerCapture: RuntimeRequirementLevel;
  readonly finalGate: RuntimeRequirementLevel;
  readonly harnessCandidate: RuntimeRequirementLevel;
}

export interface EscalationPolicyInput {
  readonly prompt: string;
  readonly domain?: PhysicsDomainId | undefined;
  readonly topic?: string | undefined;
  readonly workFrame?: WorkFrame | undefined;
  readonly obligations?: readonly ResearchObligation[] | undefined;
  readonly requestedStatus?: FinalAnswerClaimStatus | undefined;
  readonly activeObjectKinds?: readonly string[] | undefined;
  readonly activeRelationKinds?: readonly string[] | undefined;
  readonly contextTags?: readonly string[] | undefined;
  readonly requestedActionIds?: readonly string[] | undefined;
  readonly willEditFiles?: boolean | undefined;
  readonly willRunBenchmark?: boolean | undefined;
  readonly willPromoteMemory?: boolean | undefined;
  readonly containsHighRiskTheoryClaim?: boolean | undefined;
}

export interface EscalationPolicyDecision {
  readonly tier: EscalationTier;
  readonly requirements: RuntimeEscalationRequirements;
  readonly reasons: readonly string[];
  readonly recommendedActionIds: readonly string[];
  readonly recommendedActionBindings: readonly ResearchActionBinding[];
  readonly lensCandidates: readonly PhysicsLensApplicabilityResult[];
}

export type FinalAnswerClaimStatus = 'exploratory' | 'provisional' | 'checked' | 'validated';
export type FinalGateOutcome = 'allow' | 'downgrade' | 'block';

export interface FinalGateInput {
  readonly requestedStatus: FinalAnswerClaimStatus;
  readonly obligations: readonly ResearchObligation[];
  readonly aitpCallObligations?: readonly FinalGateAitpCallObligation[] | undefined;
  readonly workFrame?: WorkFrame | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly mustBeValidated?: boolean | undefined;
}

export interface FinalGateAitpCallObligation {
  readonly id: string;
  readonly actionId: string;
  readonly reason: string;
  readonly requiredNow: boolean;
  readonly trustBoundary: boolean;
  readonly finalGateRequired?: boolean | undefined;
  readonly lifecycleTrigger?: AitpLifecycleTriggerInfo | undefined;
  readonly satisfied: boolean;
  readonly blockerRecorded: boolean;
}

export interface FinalGateDecision {
  readonly outcome: FinalGateOutcome;
  readonly allowedStatus: FinalAnswerClaimStatus;
  readonly reasons: readonly string[];
  readonly openBlockingObligationIds: readonly string[];
  readonly openAitpCallObligationIds: readonly string[];
  readonly aitpLifecycleTriggerLines: readonly string[];
  readonly requiredActionIds: readonly string[];
}
