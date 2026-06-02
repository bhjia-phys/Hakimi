import type { PhysicsLens } from '../types';

export const FQHE_CS_LENSES = [
  {
    id: 'charge_flux_quantization',
    title: 'Charge-flux quantization lens',
    domains: ['topological-order', 'topological-order/fqhe-cs'],
    summary:
      'Use AB phase, compact U(1), flux insertion, or Dirac-style quantization to reason about inverse charge-flux periods.',
    requiredObjectKinds: ['charge', 'flux'],
    requiredRelationKinds: [
      'ab_phase',
      'dirac_quantization',
      'flux_insertion',
      'large_gauge_transformation',
    ],
    supportingContextTags: ['fqhe', 'chern_simons', 'topological_order'],
    rejectObjectKinds: ['berry_curvature_flux'],
    rejectContextTags: ['momentum_space'],
    caveats: [
      'Distinguish external electromagnetic flux from emergent Chern-Simons flux and quasiparticle AB flux periods.',
      'Do not equate Laughlin flux insertion, statistical flux attachment, and Dirac monopole quantization without declaring conventions.',
      'The lens proposes a direction for checking q Phi phase periodicity; it is not a proof of the effective theory.',
    ],
    guidingQuestions: [
      'Which charge is used in the phase: electron charge, quasiparticle charge, or emergent gauge charge?',
      'Which flux is varied: external electromagnetic flux, emergent Chern-Simons flux, or a Berry/geometric flux?',
      'Is the relevant invariant q Phi / hbar, a large gauge transformation, or a K-matrix response coefficient?',
    ],
    requiredChecks: [
      {
        id: 'check.charge-flux-quantization.convention',
        kind: 'convention',
        severity: 'blocking',
        description:
          'Declare charge normalization and flux identity before using inverse charge-flux reasoning.',
      },
      {
        id: 'check.charge-flux-quantization.limiting-case',
        kind: 'limiting_case',
        severity: 'warning',
        description:
          'Check the electron-charge limit and the Laughlin nu=1/m flux-insertion normalization.',
      },
    ],
    suggestedActionBindings: [
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
        reason:
          'Charge-flux reasoning must distinguish charge normalization and flux identity.',
      },
      {
        id: 'binding.fqhe-cs.charge-flux-known-limit',
        actionId: 'derive.compare_with_known_result',
        domainId: 'topological-order/fqhe-cs',
        lensId: 'charge_flux_quantization',
        checkId: 'check.charge-flux-quantization.limiting-case',
        priority: 'high',
      },
      {
        id: 'binding.fqhe-cs.charge-flux-dependency-closure',
        actionId: 'graph.query_dependency_closure',
        domainId: 'topological-order/fqhe-cs',
        lensId: 'charge_flux_quantization',
        priority: 'normal',
      },
    ],
    expansionHandles: [
      {
        kind: 'derivation',
        ref: 'lens:charge_flux_quantization',
        title: 'Charge-flux quantization direction check',
      },
    ],
  },
] as const satisfies readonly PhysicsLens[];
