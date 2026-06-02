import type { PhysicsGraphCandidate, PhysicsGraphCompileDiagnostic } from './graph-types';

export function checkGraphCandidateContradictions(
  candidates: readonly PhysicsGraphCandidate[],
): readonly PhysicsGraphCompileDiagnostic[] {
  const diagnostics: PhysicsGraphCompileDiagnostic[] = [];
  const seen = new Map<string, PhysicsGraphCandidate>();

  for (const candidate of candidates) {
    if (candidate.kind !== 'convention' && candidate.kind !== 'definition') continue;
    const key = contradictionKey(candidate);
    const prior = seen.get(key);
    if (prior === undefined) {
      seen.set(key, candidate);
      continue;
    }
    if (normalize(candidate.body) === normalize(prior.body)) continue;
    diagnostics.push({
      severity: 'warning',
      code: 'possible-contradiction',
      message: `Candidates "${prior.id}" and "${candidate.id}" may encode incompatible ${candidate.kind} content.`,
      candidateId: candidate.id,
    });
  }

  return diagnostics;
}

function contradictionKey(candidate: PhysicsGraphCandidate): string {
  return `${candidate.domain}\u0000${candidate.kind}\u0000${candidate.relatedObjects[0] ?? candidate.title}`;
}

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/g, ' ').toLowerCase();
}
