import type { PhysicsDomainId } from '../physics-memory';

export type ResearchObligationKind =
  | 'source_support'
  | 'dimension_check'
  | 'convention_check'
  | 'symbol_closure'
  | 'dependency_closure'
  | 'known_limit'
  | 'code_mapping'
  | 'benchmark'
  | 'human_decision';

export type ResearchObligationSeverity = 'blocking' | 'important' | 'advisory';
export type ResearchObligationStatus = 'open' | 'passed' | 'failed' | 'waived';

export interface ResearchObligation {
  readonly id: string;
  readonly kind: ResearchObligationKind;
  readonly domain: PhysicsDomainId;
  readonly topic: string;
  readonly targetObjectId: string;
  readonly severity: ResearchObligationSeverity;
  readonly reason: string;
  readonly requiredActionId: string;
  readonly status: ResearchObligationStatus;
}

export function transitionObligation(
  obligation: ResearchObligation,
  status: ResearchObligationStatus,
): ResearchObligation {
  return {
    ...obligation,
    status,
  };
}

export function blockingOpenObligations(
  obligations: readonly ResearchObligation[],
): readonly ResearchObligation[] {
  return obligations.filter(
    (obligation) => obligation.severity === 'blocking' && obligation.status === 'open',
  );
}

export function finalAnswerIsBlocked(obligations: readonly ResearchObligation[]): boolean {
  return blockingOpenObligations(obligations).length > 0;
}
