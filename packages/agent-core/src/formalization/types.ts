import type {
  PhysicsCapsuleKind,
  PhysicsDomainId,
  PhysicsRelationType,
  ReliabilityState,
} from '../physics-memory';
import type { PhysicsGraphNodeId } from '../physics-graph';

export type FormalizationTargetKind =
  | 'definition'
  | 'assumption'
  | 'formula'
  | 'lemma'
  | 'theorem';

export type FormalizationReadiness =
  | 'formalized'
  | 'formalization_ready'
  | 'needs_review'
  | 'not_formalizable';

export interface FormalizationDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly nodeId?: PhysicsGraphNodeId | undefined;
}

export interface FormalizationContract {
  readonly id: string;
  readonly graphNodeId: PhysicsGraphNodeId;
  readonly targetKind: FormalizationTargetKind;
  readonly title: string;
  readonly domain?: PhysicsDomainId | undefined;
  readonly currentReliability?: ReliabilityState | undefined;
  readonly readiness: FormalizationReadiness;
  readonly sourceRefs: readonly string[];
  readonly dependencyIds: readonly PhysicsGraphNodeId[];
  readonly assumptionIds: readonly PhysicsGraphNodeId[];
  readonly requiredHumanCheckpoint: boolean;
  readonly notes: readonly string[];
}

export interface FormalizationBlueprintNode {
  readonly id: PhysicsGraphNodeId;
  readonly contractId: string;
  readonly kind: FormalizationTargetKind;
  readonly title: string;
  readonly readiness: FormalizationReadiness;
  readonly domain?: PhysicsDomainId | undefined;
}

export interface FormalizationBlueprintEdge {
  readonly from: PhysicsGraphNodeId;
  readonly to: PhysicsGraphNodeId;
  readonly relation: PhysicsRelationType;
}

export interface FormalizationBlueprint {
  readonly format: 'aitp-formalization-blueprint/v0';
  readonly nodes: readonly FormalizationBlueprintNode[];
  readonly edges: readonly FormalizationBlueprintEdge[];
}

export interface FormalizationPlan {
  readonly contracts: readonly FormalizationContract[];
  readonly blueprint: FormalizationBlueprint;
  readonly diagnostics: readonly FormalizationDiagnostic[];
}

export interface FormalizationPlanInput {
  readonly targetIds: readonly PhysicsGraphNodeId[];
  readonly includeDependencyClosure?: boolean | undefined;
  readonly maxDepth?: number | undefined;
}

export function formalizationTargetKindFromCapsuleKind(
  kind: PhysicsCapsuleKind,
): FormalizationTargetKind | undefined {
  switch (kind) {
    case 'Definition':
      return 'definition';
    case 'Assumption':
      return 'assumption';
    case 'Formula':
      return 'formula';
    case 'Lemma':
      return 'lemma';
    case 'Theorem':
      return 'theorem';
    case 'BenchmarkCase':
    case 'Bridge':
    case 'CodeMapping':
    case 'DerivationStep':
    case 'FailureMode':
    case 'IntermediateObservable':
    case 'WorkflowRecipe':
      return undefined;
  }
}
