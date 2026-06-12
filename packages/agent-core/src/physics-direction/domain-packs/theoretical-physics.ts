import type { PhysicsLens } from '../types';

export const THEORETICAL_PHYSICS_GENERAL_LENSES = [
  {
    id: 'lecture_guided_object_discovery',
    title: 'Lecture-guided object discovery lens',
    domains: ['theoretical-physics', 'theoretical-physics/general'],
    summary:
      'Use curated open lecture and review orientation to improve physical object discovery while keeping retrieved chunks heuristic until AITP promotion.',
    requiredObjectKinds: ['dynamical_degree', 'observable'],
    requiredRelationKinds: ['model_layer'],
    supportingContextTags: [
      'theoretical_physics',
      'new_topic',
      'lecture',
      'review',
      'background',
      'conceptual_scaffolding',
      'method_selection',
      'source_backtrace',
    ],
    caveats: [
      'A curated lecture chunk is an orientation pointer, not evidence or validation.',
      'Do not use lecture orientation as claim support unless the exact passage is promoted through AITP source, reference, evidence, validation, and trust-preflight records.',
    ],
    guidingQuestions: [
      'Which open lecture or review shelf is most likely to clarify the relevant degrees of freedom, regimes, and observables?',
      'What object inventory does the lecture orientation suggest: degrees of freedom, controls, boundary/source/sink terms, time scales, currents, and known limits?',
      'Which retrieved chunks are only conceptual scaffolding, and which exact sources would need source-asset/reference/evidence promotion before claim support?',
      'What is the danger of importing a familiar auxiliary diagnostic, such as a spectrum or normal mode, instead of the user-targeted physical object?',
    ],
    requiredChecks: [
      {
        id: 'check.theoretical-physics.lecture-guided-object-discovery',
        kind: 'assumption_scope',
        severity: 'warning',
        description:
          'Use lecture orientation to improve object discovery, but keep the retrieved chunks heuristic until promoted through AITP records.',
      },
      {
        id: 'check.theoretical-physics.lecture-source-boundary',
        kind: 'convention',
        severity: 'blocking',
        description:
          'Do not treat curated lecture retrieval as evidence, validation, final-gate satisfaction, or claim-trust authority.',
      },
    ],
    suggestedActionBindings: [
      {
        id: 'binding.theoretical-physics.apply-lecture-guided-object-discovery-lens',
        actionId: 'physics.apply_direction_lens',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'lecture_guided_object_discovery',
        checkId: 'check.theoretical-physics.lecture-guided-object-discovery',
        priority: 'high',
        reason:
          'New theory topics benefit from curated lecture orientation before choosing objects and observables.',
      },
      {
        id: 'binding.theoretical-physics.search-curated-lecture-orientation',
        actionId: 'source.search_literature',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'lecture_guided_object_discovery',
        checkId: 'check.theoretical-physics.lecture-source-boundary',
        priority: 'high',
        params: {
          preferredSources: [
            'curated_open_lecture_notes',
            'review_style_sources',
            'source_backtrace_candidates',
          ],
          forbiddenUses: [
            'evidence_support',
            'validation_result',
            'claim_trust_update',
          ],
        },
        reason:
          'Use curated lecture orientation to find definitions and regimes, then promote exact sources only when claim support is needed.',
      },
      {
        id: 'binding.theoretical-physics-check-lecture-source-boundary',
        actionId: 'validate.check_convention',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'lecture_guided_object_discovery',
        checkId: 'check.theoretical-physics.lecture-source-boundary',
        priority: 'blocking',
        reason:
          'Curated RAG orientation must stay separate from evidence and trust changes.',
      },
    ],
    suggestedActions: [
      'physics.apply_direction_lens',
      'source.search_literature',
      'source.extract_definition',
      'validate.check_convention',
    ],
    expansionHandles: [
      {
        kind: 'source',
        ref: 'aitp:curated_rag_corpus:aitp.curated.heuristic_background.v1',
        title: 'AITP curated lecture orientation shelf',
      },
    ],
  },
  {
    id: 'research_object_discovery',
    title: 'Research object discovery lens',
    domains: ['theoretical-physics', 'theoretical-physics/general'],
    summary:
      'Before deriving or recording a new theory topic, identify the dynamical degrees of freedom, controls, boundaries/sources, observables, model layers, known limits, and failure modes.',
    requiredObjectKinds: ['dynamical_degree', 'observable'],
    requiredRelationKinds: [
      'boundary_condition',
      'source_or_sink',
      'scale_separation',
      'model_layer',
    ],
    supportingContextTags: [
      'theoretical_physics',
      'new_topic',
      'boundary_condition',
      'open_system',
      'massive_matter',
      'observable',
    ],
    caveats: [
      'Do not replace the user target with a familiar spectral or formal object before checking the intended degrees of freedom and observables.',
      'Treat this lens as process guidance; it does not validate any domain-specific claim by itself.',
    ],
    guidingQuestions: [
      'What are the primary dynamical degrees of freedom: particles, fields, wavepackets, distributions, fluids, defects, or operators?',
      'What are the controls: boundary conditions, sources/sinks, couplings, scales, noise processes, cutoffs, or external probes?',
      'Which observables answer the user question directly, and which objects are only diagnostics?',
      'Which model layers should be separated before writing the graph: classical, field-theoretic, kinetic/ensemble, effective, numerical, or dual descriptions?',
      'What known limits, reachability constraints, conservation laws, and failure modes could invalidate the naive formulation?',
    ],
    requiredChecks: [
      {
        id: 'check.theoretical-physics.research-object-inventory',
        kind: 'assumption_scope',
        severity: 'blocking',
        description:
          'A new research topic should name the central degrees of freedom, controls, observables, model layers, known limits, and failure modes before promoting claims.',
      },
      {
        id: 'check.theoretical-physics.primary-observable-alignment',
        kind: 'convention',
        severity: 'warning',
        description:
          'Confirm that the chosen observables answer the user question directly and that auxiliary diagnostics are labeled as secondary.',
      },
    ],
    suggestedActionBindings: [
      {
        id: 'binding.theoretical-physics.apply-object-discovery-lens',
        actionId: 'physics.apply_direction_lens',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'research_object_discovery',
        checkId: 'check.theoretical-physics.research-object-inventory',
        priority: 'blocking',
        reason:
          'New theoretical physics topics should first discover the central objects and observables before graph writes or derivations.',
      },
      {
        id: 'binding.theoretical-physics.extract-object-inventory',
        actionId: 'source.extract_definition',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'research_object_discovery',
        checkId: 'check.theoretical-physics.research-object-inventory',
        priority: 'high',
        params: {
          expectedObjects: [
            'dynamical_degrees_of_freedom',
            'control_parameters',
            'boundary_or_source_terms',
            'observables',
            'model_layers',
            'known_limits',
            'failure_modes',
          ],
        },
        reason:
          'The first graph draft should contain typed object candidates rather than only prose summary.',
      },
      {
        id: 'binding.theoretical-physics-check-primary-observables',
        actionId: 'validate.check_convention',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'research_object_discovery',
        checkId: 'check.theoretical-physics.primary-observable-alignment',
        priority: 'high',
        params: {
          requiredDistinctions: [
            'primary_observable',
            'auxiliary_diagnostic',
            'model_assumption',
            'known_limit',
          ],
        },
        reason:
          'Do not let auxiliary diagnostics replace the physical quantity the user asked to study.',
      },
    ],
    suggestedActions: [
      'physics.apply_direction_lens',
      'source.extract_definition',
      'validate.check_convention',
      'validate.check_known_limit',
    ],
    expansionHandles: [
      {
        kind: 'workflow',
        ref: 'lens:research_object_discovery',
        title: 'New-topic research object inventory',
      },
    ],
  },
  {
    id: 'boundary_sink_motion_inventory',
    title: 'Boundary/source-sink motion inventory lens',
    domains: ['theoretical-physics', 'theoretical-physics/general'],
    summary:
      'For matter dynamics controlled by a boundary, wall, source, sink, bath, detector, or absorbing channel, first identify the moving object, the effective interaction surface, reachability/hitting conditions, survival/flux observables, and which spectral quantities are auxiliary.',
    requiredObjectKinds: ['dynamical_degree', 'observable'],
    requiredRelationKinds: [
      'boundary_condition',
      'source_or_sink',
      'reachability_constraint',
    ],
    supportingContextTags: [
      'boundary_condition',
      'open_system',
      'massive_matter',
      'matter_motion',
      'survival_analysis',
      'hitting_time',
      'energy_flux',
    ],
    caveats: [
      'Do not assume the moving object reaches the mathematical boundary; check the effective wall, cutoff, detector support, or wave/ensemble tail that actually couples to the sink.',
      'Treat spectra, normal modes, correlator poles, and Green functions as diagnostics unless the user explicitly asks for them as the primary object.',
      'This lens is generic process guidance, not a claim that any specific spacetime or model has a particular reachability property.',
    ],
    guidingQuestions: [
      'What is moving: a classical particle, field wavepacket, density matrix, kinetic distribution, fluid element, or defect?',
      'Where does it interact with the boundary/source/sink: true asymptotic boundary, finite wall, interface, detector support, wavefunction tail, or ensemble boundary condition?',
      'Can the moving object reach or hit that surface in the regime being modeled, and what known limit would make the naive boundary coupling vanish or become indirect?',
      'If the system is AdS-like with massive matter, is the boundary the conformal boundary or a finite cutoff wall, and does finite-energy timelike motion reach it or only couple through a field tail, boundary condition, or ensemble sink?',
      'What are the primary motion observables: trajectory/reflection map, survival probability, hitting-time distribution, particle number, current, energy flux, or absorption rate?',
      'Which model layers must be separated before deriving: point-particle/geodesic, field wavepacket, kinetic/ensemble, effective open-system, and spectral diagnostics?',
      'What is the reachability verdict, primary observable, and failure mode in each active layer before writing the final framing?',
    ],
    requiredChecks: [
      {
        id: 'check.theoretical-physics.boundary-sink-motion-inventory',
        kind: 'assumption_scope',
        severity: 'blocking',
        description:
          'Boundary/source-sink motion problems require explicit moving object, effective interaction surface, reachability/hitting condition, primary observables, and auxiliary diagnostics.',
      },
      {
        id: 'check.theoretical-physics.reachability-before-boundary-loss',
        kind: 'limiting_case',
        severity: 'blocking',
        description:
          'Do not assign boundary loss to matter motion until the relevant boundary, cutoff, wall, detector support, wave tail, or ensemble sink is identified and reachable in the chosen model layer.',
      },
      {
        id: 'check.theoretical-physics.model-layer-motion-map',
        kind: 'assumption_scope',
        severity: 'blocking',
        description:
          'Separate the point-particle, field/wavepacket, kinetic/ensemble, effective open-system, and spectral-diagnostic layers, and state the reachability verdict and primary observable for each active layer before treating a boundary sink as the same object across all layers.',
      },
    ],
    suggestedActionBindings: [
      {
        id: 'binding.theoretical-physics.apply-boundary-sink-motion-lens',
        actionId: 'physics.apply_direction_lens',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'boundary_sink_motion_inventory',
        checkId: 'check.theoretical-physics.boundary-sink-motion-inventory',
        priority: 'blocking',
        reason:
          'Boundary/source-sink motion questions should inventory the moving object, effective interaction surface, reachability, and primary observables before spectral analysis.',
      },
      {
        id: 'binding.theoretical-physics.check-reachability-before-boundary-loss',
        actionId: 'validate.check_known_limit',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'boundary_sink_motion_inventory',
        checkId: 'check.theoretical-physics.reachability-before-boundary-loss',
        priority: 'blocking',
        params: {
          requiredDistinctions: [
            'true_boundary',
            'finite_wall_or_cutoff',
            'wave_or_ensemble_tail',
            'effective_sink',
          ],
        },
        reason:
          'A boundary absorber only affects motion through the surface or support the matter can actually reach or overlap.',
      },
      {
        id: 'binding.theoretical-physics.map-boundary-motion-model-layers',
        actionId: 'validate.check_convention',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'boundary_sink_motion_inventory',
        checkId: 'check.theoretical-physics.model-layer-motion-map',
        priority: 'blocking',
        params: {
          requiredDistinctions: [
            'point_particle_or_geodesic',
            'field_wavepacket',
            'kinetic_or_ensemble',
            'effective_open_system',
            'spectral_diagnostic',
          ],
        },
        reason:
          'Boundary-motion claims should say which layer is being modeled before importing intuition from another layer.',
      },
      {
        id: 'binding.theoretical-physics.extract-motion-observables',
        actionId: 'source.extract_definition',
        domainId: 'theoretical-physics/general',
        workflowId: 'workflow.theoretical-physics.general-research',
        lensId: 'boundary_sink_motion_inventory',
        checkId: 'check.theoretical-physics.boundary-sink-motion-inventory',
        priority: 'high',
        params: {
          expectedObjects: [
            'trajectory_or_reflection_map',
            'survival_probability',
            'hitting_time_distribution',
            'particle_number_or_current',
            'energy_flux_or_absorption_rate',
            'auxiliary_spectral_diagnostic',
          ],
        },
        reason:
          'For motion problems, observables should be survival, hitting, current, and flux-like quantities before optional spectral diagnostics.',
      },
    ],
    suggestedActions: [
      'physics.apply_direction_lens',
      'validate.check_known_limit',
      'validate.check_convention',
      'source.extract_definition',
    ],
    expansionHandles: [
      {
        kind: 'workflow',
        ref: 'lens:boundary_sink_motion_inventory',
        title: 'Boundary/source-sink motion inventory',
      },
    ],
  },
] as const satisfies readonly PhysicsLens[];
