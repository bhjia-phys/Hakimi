import { recommendPhysicsLenses } from '../physics-direction';
import { blockingOpenObligations } from '../research-action';
import type {
  EscalationPolicyDecision,
  EscalationPolicyInput,
  EscalationTier,
  RuntimeEscalationRequirements,
} from './types';

export function decideEscalationPolicy(
  input: EscalationPolicyInput,
): EscalationPolicyDecision {
  const prompt = input.prompt.toLowerCase();
  const reasons: string[] = [];
  let tierRank = hasPhysicsCue(input) ? 1 : 0;

  if (tierRank === 1) {
    reasons.push('Physics-scoped request should keep domain and assumptions available.');
  }

  if (containsAny(prompt, ['derive', 'prove', 'show that', 'check', 'validate', 'consistent'])) {
    tierRank = Math.max(tierRank, 2);
    reasons.push('Derivation or validation wording requires checked workflow state.');
  }

  if (
    input.containsHighRiskTheoryClaim === true ||
    containsAny(prompt, ['chern-simons level', 'k-matrix', 'dirac quantization', 'anomaly'])
  ) {
    tierRank = Math.max(tierRank, 2);
    reasons.push('High-risk theory claim requires explicit checks before validated status.');
  }

  if (
    input.willEditFiles === true ||
    input.willRunBenchmark === true ||
    containsAny(prompt, ['code change', 'git diff', 'benchmark', 'head-wing', 'formula-code'])
  ) {
    tierRank = Math.max(tierRank, 2);
    reasons.push('Code or benchmark work requires action trace and evidence capture.');
  }

  if (
    input.willPromoteMemory === true ||
    input.requestedStatus === 'validated' ||
    containsAny(prompt, ['promote', 'validated memory', 'final validated'])
  ) {
    tierRank = Math.max(tierRank, 3);
    reasons.push('Promotion or validated-status request requires final gate.');
  }

  const openBlocking = blockingOpenObligations(input.obligations ?? []);
  if (openBlocking.length > 0) {
    tierRank = Math.max(tierRank, 2);
    reasons.push('Open blocking obligations require validation before stronger claims.');
  }

  const lensCandidates = recommendPhysicsLenses(
    {
      domain: input.domain,
      topic: input.topic,
      prompt: input.prompt,
      activeObjectKinds: input.activeObjectKinds,
      activeRelationKinds: input.activeRelationKinds,
      contextTags: input.contextTags,
    },
    { limit: 3 },
  ).filter((candidate) => candidate.status === 'applicable');

  if (lensCandidates.length > 0) {
    tierRank = Math.max(tierRank, 1);
    reasons.push('Applicable physics lens found; expose caveats and suggested checks.');
  }

  const tier = tierFromRank(tierRank);
  return {
    tier,
    requirements: requirementsForTier(tier),
    reasons: [...new Set(reasons)],
    recommendedActionIds: recommendedActions(
      input,
      lensCandidates.flatMap((candidate) => candidate.suggestedActions),
    ),
    lensCandidates,
  };
}

function recommendedActions(
  input: EscalationPolicyInput,
  lensActionIds: readonly string[],
): readonly string[] {
  const actions = new Set<string>([
    ...(input.requestedActionIds ?? []),
    ...lensActionIds,
  ]);
  if (input.willEditFiles === true || input.prompt.toLowerCase().includes('head-wing')) {
    actions.add('code.inspect_call_sites');
    actions.add('code.map_formula_to_code_region');
  }
  if (input.willRunBenchmark === true || input.prompt.toLowerCase().includes('benchmark')) {
    actions.add('benchmark.run_minimal_librpa_case');
  }
  if (input.willPromoteMemory === true || input.requestedStatus === 'validated') {
    actions.add('memory.propose_capsule');
  }
  return [...actions].toSorted();
}

function requirementsForTier(tier: EscalationTier): RuntimeEscalationRequirements {
  switch (tier) {
    case 'tier0_light':
      return {
        workFrame: 'none',
        actionTrace: 'none',
        ledgerCapture: 'none',
        finalGate: 'none',
        harnessCandidate: 'none',
      };
    case 'tier1_scoped':
      return {
        workFrame: 'recommended',
        actionTrace: 'recommended',
        ledgerCapture: 'none',
        finalGate: 'recommended',
        harnessCandidate: 'none',
      };
    case 'tier2_verified':
      return {
        workFrame: 'required',
        actionTrace: 'required',
        ledgerCapture: 'recommended',
        finalGate: 'required',
        harnessCandidate: 'recommended',
      };
    case 'tier3_promotion':
      return {
        workFrame: 'required',
        actionTrace: 'required',
        ledgerCapture: 'required',
        finalGate: 'required',
        harnessCandidate: 'recommended',
      };
  }
}

function tierFromRank(rank: number): EscalationTier {
  if (rank >= 3) return 'tier3_promotion';
  if (rank === 2) return 'tier2_verified';
  if (rank === 1) return 'tier1_scoped';
  return 'tier0_light';
}

function hasPhysicsCue(input: EscalationPolicyInput): boolean {
  if (input.domain) return true;
  return containsAny(input.prompt.toLowerCase(), [
    'fqhe',
    'chern-simons',
    'quantum hall',
    'librpa',
    'rpa',
    'gw',
    'flux',
    'wavefunction',
  ]);
}

function containsAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
