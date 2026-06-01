import { describe, expect, it } from 'vitest';

import { asActionAlgebraDefinition, type ResearchActionDefinition } from '../../src/research-action';

describe('action algebra definition', () => {
  it('fills action algebra defaults without breaking registry-era action definitions', () => {
    const legacy: ResearchActionDefinition = {
      id: 'derive.propose_route',
      category: 'derivation',
      exposure: 'direct',
      title: 'Propose route',
      description: 'Sketch a possible derivation route.',
    };

    expect(asActionAlgebraDefinition(legacy)).toMatchObject({
      id: 'derive.propose_route',
      phase: 'explore',
      inputKinds: [],
      outputKinds: [],
      primitiveToolPolicy: 'none',
    });
  });

  it('preserves typed preconditions, effects, obligations, validators, and primitive tool policy', () => {
    const action = asActionAlgebraDefinition({
      id: 'code.map_formula_to_code',
      category: 'code',
      exposure: 'direct',
      title: 'Map formula to code',
      description: 'Create a formula-code mapping candidate.',
      phase: 'code',
      inputKinds: ['Formula', 'CodeRegion'],
      outputKinds: ['CodeMapping'],
      preconditions: [
        {
          kind: 'has_formula',
          description: 'A formula must be selected.',
          required: true,
        },
      ],
      effects: [
        {
          kind: 'create_object',
          targetKind: 'CodeMapping',
          description: 'Create a code mapping candidate.',
        },
      ],
      generatedObligations: [
        {
          kind: 'code_mapping',
          severity: 'blocking',
          reason: 'Formula-code mappings must be checked before implementation.',
          requiredActionId: 'code.check_intermediate_observable',
        },
      ],
      validators: [
        {
          kind: 'code_mapping',
          description: 'Check symbol and index mapping.',
          blocking: true,
        },
      ],
      primitiveToolPolicy: 'git-read',
    });

    expect(action.inputKinds).toEqual(['Formula', 'CodeRegion']);
    expect(action.generatedObligations[0]?.requiredActionId).toBe(
      'code.check_intermediate_observable',
    );
    expect(action.primitiveToolPolicy).toBe('git-read');
  });
});
