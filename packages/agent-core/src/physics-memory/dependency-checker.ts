import type { PhysicsMemoryRegistry } from './registry';
import type { PhysicsGraphCandidate, PhysicsGraphCompileDiagnostic } from './graph-types';

export function checkGraphCandidateDependencies(
  registry: PhysicsMemoryRegistry,
  candidates: readonly PhysicsGraphCandidate[],
): readonly PhysicsGraphCompileDiagnostic[] {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const diagnostics: PhysicsGraphCompileDiagnostic[] = [];

  for (const candidate of candidates) {
    for (const dependencyId of candidate.dependsOn) {
      const presentInCandidates = candidateIds.has(dependencyId);
      const presentInRegistry = registry.getCapsule(dependencyId) !== undefined;
      if (presentInCandidates || presentInRegistry) continue;
      diagnostics.push({
        severity: 'warning',
        code: 'missing-dependency',
        message: `Candidate "${candidate.id}" depends on missing object "${dependencyId}".`,
        candidateId: candidate.id,
      });
    }
    if (candidate.assumptions.length === 0) continue;
    diagnostics.push({
      severity: 'info',
      code: 'assumption-dependency-trace',
      message: `Candidate "${candidate.id}" depends on assumptions: ${candidate.assumptions.join(', ')}.`,
      candidateId: candidate.id,
    });
  }

  return diagnostics;
}
