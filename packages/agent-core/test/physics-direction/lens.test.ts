import { describe, expect, it } from 'vitest';

import {
  FQHE_CS_LENSES,
  LIBRPA_HEAD_WING_LENSES,
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
});
