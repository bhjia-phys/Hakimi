import { describe, expect, it } from 'vitest';

import {
  FQHE_CS_LENSES,
  LIBRPA_HEAD_WING_LENSES,
  THEORETICAL_PHYSICS_GENERAL_LENSES,
  recommendPhysicsLenses,
} from '../../src/physics-direction';

describe('physics direction lenses', () => {
  it('proposes the charge-flux quantization lens for inverse charge-flux FQHE questions', () => {
    const recommendations = recommendPhysicsLenses({
      domain: 'topological-order/fqhe-cs',
      prompt:
        'In FQHE, why does a smaller fractional charge seem to correspond to a larger flux period?',
      contextTags: ['fqhe', 'laughlin'],
    });

    const chargeFlux = recommendations.find(
      (candidate) => candidate.lens.id === 'charge_flux_quantization',
    );

    expect(chargeFlux).toMatchObject({
      status: 'applicable',
      confidence: 'high',
    });
    expect(chargeFlux?.matchedObjectKinds).toEqual(['charge', 'flux']);
    expect(chargeFlux?.matchedRelationKinds).toContain('dirac_quantization');
    expect(chargeFlux?.caveats.join(' ')).toContain('external electromagnetic flux');
    expect(chargeFlux?.requiredChecks.map((check) => check.kind)).toEqual([
      'convention',
      'limiting_case',
    ]);
    expect(chargeFlux?.suggestedActionBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'validate.check_convention',
          checkId: 'check.charge-flux-quantization.convention',
          priority: 'blocking',
        }),
      ]),
    );
    expect(chargeFlux?.suggestedActions).toContain('validate.check_convention');
  });

  it('rejects charge-flux quantization when the flux is only a momentum-space Berry flux', () => {
    const recommendations = recommendPhysicsLenses(
      {
        domain: 'topological-order/fqhe-cs',
        prompt: 'Does Berry curvature flux in momentum space determine the Chern number?',
        contextTags: ['berry_curvature', 'momentum_space'],
      },
      {
        lenses: FQHE_CS_LENSES,
        includeRejected: true,
      },
    );

    const chargeFlux = recommendations.find(
      (candidate) => candidate.lens.id === 'charge_flux_quantization',
    );

    expect(chargeFlux?.status).toBe('rejected');
    expect(chargeFlux?.rejectionReasons.join(' ')).toContain('Rejected object kinds');
  });

  it('keeps rejected lenses out of normal recommendations', () => {
    const recommendations = recommendPhysicsLenses(
      {
        domain: 'topological-order/fqhe-cs',
        prompt: 'Does Berry curvature flux in momentum space determine the Chern number?',
        contextTags: ['berry_curvature', 'momentum_space'],
      },
      { lenses: FQHE_CS_LENSES },
    );

    expect(recommendations.map((candidate) => candidate.lens.id)).not.toContain(
      'charge_flux_quantization',
    );
  });

  it('proposes the LibRPA head-wing formula-code lens for mapped code changes', () => {
    const recommendations = recommendPhysicsLenses(
      {
        domain: 'librpa/head-wing',
        prompt:
          'Update the LibRPA head-wing formula-code mapping and check downstream call sites, intermediate observable, and smoke benchmark.',
        activeObjectKinds: ['formula', 'code_region'],
        activeRelationKinds: ['formula_code_mapping'],
        contextTags: ['librpa', 'head_wing', 'code_change'],
      },
      { lenses: LIBRPA_HEAD_WING_LENSES },
    );

    expect(recommendations[0]).toMatchObject({
      lens: { id: 'librpa_head_wing_formula_code_mapping' },
      status: 'applicable',
      confidence: 'high',
    });
    expect(recommendations[0]?.requiredChecks.map((check) => check.kind)).toEqual([
      'code_mapping',
      'benchmark',
    ]);
    expect(recommendations[0]?.suggestedActionBindings).toEqual([
      expect.objectContaining({
        actionId: 'code.inspect_call_sites',
        domainId: 'librpa/head-wing',
      }),
      expect.objectContaining({
        actionId: 'code.map_formula_to_code_region',
        checkId: 'check.librpa-head-wing.code-mapping',
      }),
      expect.objectContaining({
        actionId: 'code.capture_git_diff_observation',
      }),
      expect.objectContaining({
        actionId: 'benchmark.run_minimal_case',
        adapterId: 'adapter.librpa.head-wing-smoke',
      }),
    ]);
    expect(recommendations[0]?.suggestedActions).toEqual([
      'code.inspect_call_sites',
      'code.map_formula_to_code_region',
      'code.capture_git_diff_observation',
      'benchmark.run_minimal_case',
    ]);
  });

  it('proposes the generic research object discovery lens for new theory problems', () => {
    const recommendations = recommendPhysicsLenses(
      {
        domain: 'theoretical-physics/general',
        topic: 'random-boundary massive matter motion',
        prompt:
          'A new theoretical physics problem asks how massive matter moves with boundary conditions, bath coupling, survival probability, hitting time, and energy flux observables.',
        contextTags: ['new_topic'],
      },
      { lenses: THEORETICAL_PHYSICS_GENERAL_LENSES },
    );

    const objectDiscovery = recommendations.find(
      (candidate) => candidate.lens.id === 'research_object_discovery',
    );

    expect(objectDiscovery).toMatchObject({
      lens: { id: 'research_object_discovery' },
      status: 'applicable',
      confidence: 'high',
    });
    expect(objectDiscovery?.matchedObjectKinds).toEqual([
      'dynamical_degree',
      'observable',
    ]);
    expect(objectDiscovery?.matchedRelationKinds).toEqual(
      expect.arrayContaining(['boundary_condition', 'source_or_sink']),
    );
    expect(objectDiscovery?.guidingQuestions.join(' ')).toContain(
      'primary dynamical degrees of freedom',
    );
    expect(objectDiscovery?.suggestedActionBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'physics.apply_direction_lens',
          lensId: 'research_object_discovery',
          priority: 'blocking',
        }),
      ]),
    );
  });

  it('proposes lecture-guided object discovery for conceptual new theory topics', () => {
    const recommendations = recommendPhysicsLenses(
      {
        domain: 'theoretical-physics/general',
        topic: 'open-boundary massive matter motion',
        prompt:
          'Before deriving, use lecture background and review notes to understand the degrees of freedom, model layer, observables, and known limits for this new theory problem.',
        contextTags: ['new_topic', 'lecture', 'conceptual_scaffolding'],
      },
      { lenses: THEORETICAL_PHYSICS_GENERAL_LENSES },
    );

    const lectureGuided = recommendations.find(
      (candidate) => candidate.lens.id === 'lecture_guided_object_discovery',
    );

    expect(lectureGuided).toMatchObject({
      status: 'applicable',
      confidence: 'high',
    });
    expect(lectureGuided?.matchedContextTags).toEqual(
      expect.arrayContaining(['lecture', 'conceptual_scaffolding']),
    );
    expect(lectureGuided?.guidingQuestions.join(' ')).toContain(
      'open lecture or review shelf',
    );
    expect(lectureGuided?.requiredChecks.map((check) => check.id)).toContain(
      'check.theoretical-physics.lecture-source-boundary',
    );
    expect(lectureGuided?.suggestedActionBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'source.search_literature',
          lensId: 'lecture_guided_object_discovery',
          checkId: 'check.theoretical-physics.lecture-source-boundary',
        }),
      ]),
    );
  });

  it('proposes the boundary/source-sink motion lens for massive boundary dynamics', () => {
    const recommendations = recommendPhysicsLenses(
      {
        domain: 'theoretical-physics/general',
        topic: 'fixed AdS boundary detector massive matter motion',
        prompt:
          'A fixed-background AdS reflecting cavity has a boundary detector that randomly switches off and on. When on, the boundary couples to a measurement bath that can absorb what leaves the subsystem. I care about how massive matter moves, not the normal-mode spectrum.',
        contextTags: ['new_topic'],
      },
      { lenses: THEORETICAL_PHYSICS_GENERAL_LENSES },
    );

    const boundaryMotion = recommendations.find(
      (candidate) => candidate.lens.id === 'boundary_sink_motion_inventory',
    );

    expect(boundaryMotion).toMatchObject({
      status: 'applicable',
      confidence: 'high',
    });
    expect(boundaryMotion?.matchedRelationKinds).toEqual(
      expect.arrayContaining(['boundary_condition', 'source_or_sink']),
    );
    expect(boundaryMotion?.guidingQuestions.join(' ')).toContain('Where does it interact');
    expect(boundaryMotion?.requiredChecks.map((check) => check.id)).toContain(
      'check.theoretical-physics.reachability-before-boundary-loss',
    );
    expect(boundaryMotion?.requiredChecks.map((check) => check.id)).toContain(
      'check.theoretical-physics.model-layer-motion-map',
    );
    expect(boundaryMotion?.guidingQuestions.join(' ')).toContain(
      'point-particle/geodesic',
    );
    expect(boundaryMotion?.guidingQuestions.join(' ')).toContain(
      'reachability verdict',
    );
    expect(boundaryMotion?.suggestedActionBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lensId: 'boundary_sink_motion_inventory',
          checkId: 'check.theoretical-physics.reachability-before-boundary-loss',
          priority: 'blocking',
        }),
        expect.objectContaining({
          actionId: 'validate.check_convention',
          lensId: 'boundary_sink_motion_inventory',
          checkId: 'check.theoretical-physics.model-layer-motion-map',
          priority: 'blocking',
        }),
      ]),
    );
  });
});
