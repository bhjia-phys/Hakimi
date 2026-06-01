import type {
  ActionEffect,
  ActionPrecondition,
  ActionValidator,
  ObligationTemplate,
  PrimitiveToolPolicy,
  ResearchActionDefinition,
  ResearchActionPhase,
  ResearchObjectKind,
} from './types';

export interface ActionAlgebraDefinition
  extends Omit<
    ResearchActionDefinition,
    | 'phase'
    | 'inputKinds'
    | 'outputKinds'
    | 'preconditions'
    | 'effects'
    | 'generatedObligations'
    | 'validators'
    | 'primitiveToolPolicy'
  > {
  readonly phase: ResearchActionPhase;
  readonly inputKinds: readonly ResearchObjectKind[];
  readonly outputKinds: readonly ResearchObjectKind[];
  readonly preconditions: readonly ActionPrecondition[];
  readonly effects: readonly ActionEffect[];
  readonly generatedObligations: readonly ObligationTemplate[];
  readonly validators: readonly ActionValidator[];
  readonly primitiveToolPolicy: PrimitiveToolPolicy;
}

export function asActionAlgebraDefinition(
  action: ResearchActionDefinition,
): ActionAlgebraDefinition {
  return {
    ...action,
    phase: action.phase ?? 'explore',
    inputKinds: action.inputKinds ?? [],
    outputKinds: action.outputKinds ?? [],
    preconditions: action.preconditions ?? [],
    effects: action.effects ?? [],
    generatedObligations: action.generatedObligations ?? [],
    validators: action.validators ?? [],
    primitiveToolPolicy: action.primitiveToolPolicy ?? 'none',
  };
}
