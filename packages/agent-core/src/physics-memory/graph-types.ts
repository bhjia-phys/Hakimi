import type { PhysicsDomainId, ReliabilityState } from './types';

export const PHYSICS_GRAPH_CANDIDATE_KINDS = [
  'definition',
  'notation',
  'convention',
  'assumption',
  'formula',
  'derivation_step',
  'code_mapping',
  'benchmark_case',
  'failure_mode',
  'workflow_recipe',
  'bridge',
] as const;

export type PhysicsGraphCandidateKind = (typeof PHYSICS_GRAPH_CANDIDATE_KINDS)[number];

export interface PhysicsGraphCandidate {
  readonly id: string;
  readonly kind: PhysicsGraphCandidateKind;
  readonly domain: PhysicsDomainId;
  readonly title: string;
  readonly body: string;
  readonly reliability: ReliabilityState;
  readonly sourceEventIds: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly relatedObjects: readonly string[];
  readonly dependsOn: readonly string[];
  readonly assumptions: readonly string[];
  readonly promotionState: 'candidate';
}

export interface PhysicsGraphCompileDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly eventId?: string | undefined;
  readonly candidateId?: string | undefined;
}

export interface PhysicsGraphCompileResult {
  readonly domain?: PhysicsDomainId | undefined;
  readonly topic?: string | undefined;
  readonly candidates: readonly PhysicsGraphCandidate[];
  readonly diagnostics: readonly PhysicsGraphCompileDiagnostic[];
}
