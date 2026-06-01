import { checkPhysicsLensApplicability } from './applicability';
import { DEFAULT_PHYSICS_LENSES } from './domain-packs';
import type {
  PhysicsLensApplicabilityInput,
  PhysicsLensApplicabilityResult,
  RecommendPhysicsLensesOptions,
} from './types';

export function recommendPhysicsLenses(
  input: PhysicsLensApplicabilityInput,
  options: RecommendPhysicsLensesOptions = {},
): readonly PhysicsLensApplicabilityResult[] {
  const lenses = options.lenses ?? DEFAULT_PHYSICS_LENSES;
  const results = lenses
    .map((lens) => checkPhysicsLensApplicability(lens, input))
    .filter((result) => options.includeRejected === true || result.status !== 'rejected')
    .toSorted(compareLensResults);
  return typeof options.limit === 'number' ? results.slice(0, options.limit) : results;
}

function compareLensResults(
  left: PhysicsLensApplicabilityResult,
  right: PhysicsLensApplicabilityResult,
): number {
  const statusDelta = statusRank(right.status) - statusRank(left.status);
  if (statusDelta !== 0) return statusDelta;
  if (right.score !== left.score) return right.score - left.score;
  return left.lens.id.localeCompare(right.lens.id);
}

function statusRank(status: PhysicsLensApplicabilityResult['status']): number {
  switch (status) {
    case 'applicable':
      return 2;
    case 'needs_context':
      return 1;
    case 'rejected':
      return 0;
  }
}
