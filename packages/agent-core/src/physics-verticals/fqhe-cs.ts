import type { PhysicsCapsule } from '../physics-memory';
import { recommendPhysicsLenses, type PhysicsLensApplicabilityResult } from '../physics-direction';
import type { ResearchBlock, ResearchBlockCompileDiagnostic } from '../research-block';
import { compileResearchBlockToCandidateCapsule } from '../research-block';
import type { ResearchActionBinding, ResearchEvalCase, ResearchObligation } from '../research-action';
import { evaluateFinalGate, type FinalGateDecision } from '../research-policy';
import type { ResearchEvalCheckResult } from '../research-harness';

export type FqheChargeIdentity =
  | 'electron_charge'
  | 'laughlin_quasiparticle_charge'
  | 'emergent_gauge_charge';

export type FqheFluxIdentity =
  | 'external_em_flux'
  | 'emergent_cs_flux'
  | 'quasiparticle_ab_flux_period'
  | 'berry_curvature_flux';

export type FqhePhaseInvariant = 'q_phi_over_hbar' | 'k_matrix_response' | 'unspecified';

export interface FqheChargeFluxConventionInput {
  readonly chargeIdentity: FqheChargeIdentity;
  readonly fluxIdentity: FqheFluxIdentity;
  readonly phaseInvariant: FqhePhaseInvariant;
  readonly fillingDenominator: number;
}

export interface FqheChargeFluxConventionResult {
  readonly outcome: 'pass' | 'fail';
  readonly statement: string;
  readonly checkResult: ResearchEvalCheckResult;
  readonly obligation?: ResearchObligation | undefined;
  readonly suggestedActionBindings: readonly ResearchActionBinding[];
  readonly suggestedActions: readonly string[];
}

export interface FqheCsVerticalSliceResult {
  readonly blocks: readonly ResearchBlock[];
  readonly capsules: readonly PhysicsCapsule[];
  readonly diagnostics: readonly ResearchBlockCompileDiagnostic[];
  readonly lensCandidates: readonly PhysicsLensApplicabilityResult[];
  readonly conventionCheck: FqheChargeFluxConventionResult;
  readonly evalCase: ResearchEvalCase;
  readonly finalGate: FinalGateDecision;
}

export const FQHE_CS_RESEARCH_BLOCKS = [
  {
    id: 'fqhe.laughlin.wavefunction',
    topic: 'fqhe-cs-effective-theory',
    domain: 'topological-order/fqhe-cs',
    title: 'Laughlin wavefunction at filling nu=1/m',
    candidateCapsuleKind: 'Definition',
    sourceRefs: ['source:laughlin-1983'],
    formulas: [
      {
        id: 'formula.laughlin.wavefunction',
        expression: 'Psi_m = prod_{i<j}(z_i-z_j)^m exp(-sum_i |z_i|^2 / 4 l_B^2)',
        symbols: ['Psi_m', 'z_i', 'm', 'l_B'],
      },
    ],
    assumptions: [
      {
        id: 'assumption.lowest-landau-level',
        statement: 'Electrons are projected to the lowest Landau level.',
      },
      {
        id: 'assumption.odd-m-fermions',
        statement: 'm is odd for fermionic Laughlin states.',
      },
    ],
    conventions: [
      {
        id: 'convention.magnetic-length',
        statement: 'l_B is defined by l_B^2 = hbar/(e B) for the external magnetic field.',
      },
    ],
    localClaims: [
      {
        id: 'claim.filling-one-over-m',
        statement: 'The Laughlin wavefunction describes filling fraction nu=1/m.',
      },
    ],
    relatedObjects: ['concept:laughlin-state', 'concept:lowest-landau-level'],
    body: 'This block anchors the wavefunction side of the FQHE/CS vertical slice.',
  },
  {
    id: 'fqhe.flux-insertion.charge-pump',
    topic: 'fqhe-cs-effective-theory',
    domain: 'topological-order/fqhe-cs',
    title: 'Flux insertion and fractional charge pump',
    candidateCapsuleKind: 'DerivationStep',
    sourceRefs: ['source:laughlin-1983'],
    dependsOn: ['capsule.candidate.fqhe.laughlin.wavefunction'],
    formulas: [
      {
        id: 'formula.ab-phase',
        expression: 'phase = exp(i q Phi / hbar)',
        symbols: ['q', 'Phi', 'hbar'],
      },
      {
        id: 'formula.quasiparticle-flux-period',
        expression: 'Delta Phi = h / q',
        symbols: ['Delta Phi', 'h', 'q'],
      },
    ],
    assumptions: [
      {
        id: 'assumption.adiabatic-gap',
        statement: 'The bulk gap remains open during adiabatic flux insertion.',
      },
    ],
    conventions: [
      {
        id: 'convention.external-em-flux',
        statement: 'Phi denotes external electromagnetic flux unless explicitly marked otherwise.',
      },
    ],
    localClaims: [
      {
        id: 'claim.inverse-charge-flux-period',
        statement: 'For an AB phase period, a smaller quasiparticle charge implies a larger flux period.',
      },
    ],
    openQuestions: ['Relate this inverse period to CS compactness without conflating flux identities.'],
    relatedObjects: ['concept:ab-phase', 'concept:dirac-quantization', 'concept:flux-insertion'],
    body: 'This block is the local self-contained charge-flux reasoning boundary.',
  },
  {
    id: 'fqhe.cs.effective-action',
    topic: 'fqhe-cs-effective-theory',
    domain: 'topological-order/fqhe-cs',
    title: 'Abelian Chern-Simons effective action for Laughlin state',
    candidateCapsuleKind: 'Formula',
    sourceRefs: ['source:zhang-hansson-kivelson-1989'],
    dependsOn: ['capsule.candidate.fqhe.flux-insertion.charge-pump'],
    formulas: [
      {
        id: 'formula.cs-action-laughlin',
        expression: 'S = (m/4pi) int a da + (1/2pi) int A da',
        symbols: ['S', 'm', 'a', 'A'],
      },
    ],
    assumptions: [
      {
        id: 'assumption.compact-u1',
        statement: 'The emergent gauge field is treated as a compact U(1) gauge field.',
      },
    ],
    conventions: [
      {
        id: 'convention.cs-normalization',
        statement: 'Chern-Simons terms use differential-form normalization with 1/(4 pi).',
      },
    ],
    localClaims: [
      {
        id: 'claim.cs-level-m',
        statement: 'The Laughlin nu=1/m state is represented by Abelian CS level m in this normalization.',
      },
    ],
    relatedObjects: ['concept:chern-simons-effective-theory', 'concept:compact-u1'],
    body: 'This block connects flux insertion to the effective topological field theory.',
  },
  {
    id: 'fqhe.kmatrix.response',
    topic: 'fqhe-cs-effective-theory',
    domain: 'topological-order/fqhe-cs',
    title: 'K-matrix response and Hall conductance',
    candidateCapsuleKind: 'Formula',
    sourceRefs: ['source:wen-1995'],
    dependsOn: ['capsule.candidate.fqhe.cs.effective-action'],
    formulas: [
      {
        id: 'formula.kmatrix-hall-response',
        expression: 'sigma_xy = (e^2/h) t^T K^{-1} t',
        symbols: ['sigma_xy', 'e', 'h', 't', 'K'],
      },
    ],
    assumptions: [
      {
        id: 'assumption.abelian-topological-order',
        statement: 'The topological order is Abelian and described by an integer K matrix.',
      },
    ],
    conventions: [
      {
        id: 'convention.charge-vector',
        statement: 't is the electromagnetic charge vector.',
      },
    ],
    localClaims: [
      {
        id: 'claim.laughlin-kmatrix',
        statement: 'For the Laughlin state, K=(m) and t=1 gives sigma_xy=(e^2/h)/m.',
      },
    ],
    relatedObjects: ['concept:k-matrix', 'concept:hall-response'],
    body: 'This block closes the response-theory side of the FQHE/CS vertical slice.',
  },
] as const satisfies readonly ResearchBlock[];

export const DEFAULT_FQHE_CHARGE_FLUX_CONVENTION = {
  chargeIdentity: 'laughlin_quasiparticle_charge',
  fluxIdentity: 'external_em_flux',
  phaseInvariant: 'q_phi_over_hbar',
  fillingDenominator: 3,
} as const satisfies FqheChargeFluxConventionInput;

export function checkFqheChargeFluxConvention(
  input: FqheChargeFluxConventionInput,
): FqheChargeFluxConventionResult {
  const accepted =
    input.chargeIdentity === 'laughlin_quasiparticle_charge' &&
    (input.fluxIdentity === 'external_em_flux' ||
      input.fluxIdentity === 'quasiparticle_ab_flux_period') &&
    input.phaseInvariant === 'q_phi_over_hbar' &&
    input.fillingDenominator > 1;

  const statement = accepted
    ? 'The inverse charge-flux period is used only for quasiparticle AB phase with declared external/AB flux identity.'
    : 'Charge-flux reasoning is ambiguous or invalid until charge identity, flux identity, and phase invariant are fixed.';

  const checkResult: ResearchEvalCheckResult = {
    checkId: 'check.charge-flux-quantization.convention',
    kind: 'convention',
    status: accepted ? 'passed' : 'failed',
    evidenceRefs: ['vertical:fqhe-cs.charge-flux-convention'],
  };

  return {
    outcome: accepted ? 'pass' : 'fail',
    statement,
    checkResult,
    obligation: accepted
      ? undefined
      : {
          id: 'obl.fqhe.charge-flux-convention',
          kind: 'convention_check',
          domain: 'topological-order/fqhe-cs',
          topic: 'fqhe-cs-effective-theory',
          targetObjectId: 'formula.quasiparticle-flux-period',
          severity: 'blocking',
          reason:
            'Charge-flux reasoning must distinguish external EM flux, emergent CS flux, quasiparticle AB period, and Berry flux.',
          requiredActionId: 'validate.check_convention',
          status: 'open',
        },
    suggestedActionBindings: FQHE_CHARGE_FLUX_ACTION_BINDINGS,
    suggestedActions: [
      'physics.apply_direction_lens',
      'validate.check_convention',
      'derive.compare_with_known_result',
    ],
  };
}

export const FQHE_CHARGE_FLUX_ACTION_BINDINGS = [
  {
    id: 'binding.fqhe-cs.charge-flux-apply-lens',
    actionId: 'physics.apply_direction_lens',
    domainId: 'topological-order/fqhe-cs',
    lensId: 'charge_flux_quantization',
    priority: 'high',
  },
  {
    id: 'binding.fqhe-cs.charge-flux-convention',
    actionId: 'validate.check_convention',
    domainId: 'topological-order/fqhe-cs',
    lensId: 'charge_flux_quantization',
    checkId: 'check.charge-flux-quantization.convention',
    priority: 'blocking',
    params: {
      requiredDistinctions: [
        'external_em_flux',
        'emergent_cs_flux',
        'quasiparticle_ab_flux_period',
        'berry_curvature_flux',
      ],
    },
  },
] as const satisfies readonly ResearchActionBinding[];

export function buildFqheCsChargeFluxEvalCase(): ResearchEvalCase {
  return {
    id: 'eval.fqhe-cs.charge-flux-convention',
    title: 'FQHE/CS charge-flux convention eval',
    task: 'Explain inverse fractional charge and flux period without conflating EM, CS, AB, and Berry flux identities.',
    domain: 'topological-order/fqhe-cs',
    capsuleRefs: [
      'capsule.candidate.fqhe.laughlin.wavefunction',
      'capsule.candidate.fqhe.flux-insertion.charge-pump',
      'capsule.candidate.fqhe.cs.effective-action',
      'capsule.candidate.fqhe.kmatrix.response',
    ],
    actionSequence: FQHE_CHARGE_FLUX_ACTION_BINDINGS,
    validations: [
      {
        type: 'action_outcome',
        actionId: 'validate.check_convention',
        outcome: 'pass',
      },
      {
        type: 'required_check',
        check: {
          id: 'check.charge-flux-quantization.convention',
          kind: 'convention',
          severity: 'blocking',
          description:
            'The eval requires charge normalization and flux identity to be declared.',
        },
      },
    ],
  };
}

export function compileFqheCsVerticalSlice(
  convention: FqheChargeFluxConventionInput = DEFAULT_FQHE_CHARGE_FLUX_CONVENTION,
): FqheCsVerticalSliceResult {
  const compiled = FQHE_CS_RESEARCH_BLOCKS.map((block) =>
    compileResearchBlockToCandidateCapsule(block),
  );
  const conventionCheck = checkFqheChargeFluxConvention(convention);
  const obligations = conventionCheck.obligation ? [conventionCheck.obligation] : [];
  return {
    blocks: FQHE_CS_RESEARCH_BLOCKS,
    capsules: compiled.map((result) => result.capsule),
    diagnostics: compiled.flatMap((result) => result.diagnostics),
    lensCandidates: recommendPhysicsLenses({
      domain: 'topological-order/fqhe-cs',
      topic: 'fqhe-cs-effective-theory',
      prompt:
        'Why does a smaller Laughlin quasiparticle fractional charge correspond to a larger AB flux period, and how is that related to Dirac quantization and Chern-Simons effective theory?',
      contextTags: ['fqhe', 'chern_simons', 'topological_order'],
    }).filter((candidate) => candidate.status === 'applicable'),
    conventionCheck,
    evalCase: buildFqheCsChargeFluxEvalCase(),
    finalGate: evaluateFinalGate({
      requestedStatus: 'validated',
      obligations,
      evidenceRefs: ['vertical:fqhe-cs.charge-flux-convention'],
      sourceRefs: ['source:laughlin-1983', 'source:zhang-hansson-kivelson-1989', 'source:wen-1995'],
    }),
  };
}
