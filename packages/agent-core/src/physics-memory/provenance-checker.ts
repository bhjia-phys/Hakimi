import type { PhysicsGraphCandidate, PhysicsGraphCompileDiagnostic } from './graph-types';

export function checkGraphCandidateProvenance(
  candidate: PhysicsGraphCandidate,
): readonly PhysicsGraphCompileDiagnostic[] {
  if (candidate.sourceRefs.length > 0) return [];
  return [
    {
      severity: 'error',
      code: 'missing-provenance',
      message: `Candidate "${candidate.id}" has no source refs.`,
      candidateId: candidate.id,
    },
  ];
}
