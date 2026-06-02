export const PHYSICS_CAPSULE_KINDS = [
  'Definition',
  'Assumption',
  'Formula',
  'DerivationStep',
  'Theorem',
  'Lemma',
  'CodeMapping',
  'IntermediateObservable',
  'BenchmarkCase',
  'FailureMode',
  'WorkflowRecipe',
] as const;

export type PhysicsCapsuleKind = (typeof PHYSICS_CAPSULE_KINDS)[number];

export const RELIABILITY_STATES = [
  'raw',
  'parsed',
  'linked',
  'checked',
  'validated',
  'formalized',
  'rejected',
] as const;

export type ReliabilityState = (typeof RELIABILITY_STATES)[number];

export type PhysicsDomainId = string;
export type PhysicsCapsuleId = string;

export type PhysicsMemorySource = 'project' | 'user' | 'extra' | 'builtin';

export interface PhysicsMemoryRoot {
  readonly path: string;
  readonly source: PhysicsMemorySource;
}

export type PhysicsGraphObjectKind =
  | PhysicsCapsuleKind
  | 'Concept'
  | 'ConventionSet'
  | 'QuestionContract'
  | 'EvidenceRun'
  | 'ValidationContract';

export type PhysicsRelationType =
  | 'defines'
  | 'assumes'
  | 'depends_on'
  | 'derives_from'
  | 'checks'
  | 'maps_to_code'
  | 'validated_by'
  | 'fails_under'
  | 'contradicts'
  | 'bridges_to';

export interface GraphRef {
  readonly kind: PhysicsGraphObjectKind;
  readonly id: string;
  readonly relation?: PhysicsRelationType;
}

export type ExpansionHandleKind =
  | 'definition'
  | 'formula'
  | 'derivation'
  | 'code'
  | 'benchmark'
  | 'failure'
  | 'workflow'
  | 'source';

export interface ExpansionHandle {
  readonly kind: ExpansionHandleKind;
  readonly ref: string;
  readonly title?: string;
}

export type CheckContractKind =
  | 'symbol_closure'
  | 'dimension'
  | 'convention'
  | 'assumption_scope'
  | 'limiting_case'
  | 'symmetry'
  | 'benchmark'
  | 'code_mapping';

export type CheckSeverity = 'info' | 'warning' | 'blocking';

export interface CheckContract {
  readonly id: string;
  readonly kind: CheckContractKind;
  readonly severity: CheckSeverity;
  readonly description?: string;
}

export type ActionAffordanceIntent = 'allowed' | 'recommended' | 'required';

export interface ActionAffordance {
  readonly actionId: string;
  readonly intent: ActionAffordanceIntent;
  readonly reason?: string;
}

export type BridgePolicy = 'deny' | 'explicit-only' | 'allow';

export interface ScopeSpec {
  readonly regimes?: readonly string[];
  readonly assumptions?: readonly string[];
  readonly excludes?: readonly string[];
}

export interface PhysicsPromotionPacket {
  readonly id: string;
  readonly candidateIds: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly validationRefs: readonly string[];
  readonly failureModes: readonly string[];
  readonly scope?: ScopeSpec | undefined;
  readonly targetReliability: Extract<ReliabilityState, 'checked' | 'validated' | 'formalized'>;
  readonly requiredHumanCheckpoint: boolean;
  readonly humanCheckpointLabel?: string | undefined;
}

export interface PhysicsGraphQuery {
  readonly domain?: PhysicsDomainId;
  readonly focusIds?: readonly string[];
  readonly kinds?: readonly PhysicsGraphObjectKind[];
  readonly relationTypes?: readonly PhysicsRelationType[];
  readonly reliabilityFloor?: ReliabilityState;
  readonly expansionDepth?: number;
  readonly includeEvidence?: boolean;
  readonly includeFailureModes?: boolean;
  readonly bridgePolicy?: BridgePolicy;
}

export interface PhysicsCapsuleMetadata {
  readonly id: PhysicsCapsuleId;
  readonly kind: PhysicsCapsuleKind;
  readonly domain: PhysicsDomainId;
  readonly title: string;
  readonly reliability: ReliabilityState;
  readonly symbols: readonly string[];
  readonly assumes: readonly string[];
  readonly dependsOn: readonly PhysicsCapsuleId[];
  readonly sourceRefs: readonly string[];
  readonly graphRefs: readonly GraphRef[];
  readonly expansionHandles: readonly ExpansionHandle[];
  readonly requiredChecks: readonly CheckContract[];
  readonly actionAffordances: readonly ActionAffordance[];
  readonly scope?: ScopeSpec;
  readonly allowCrossDomain: boolean;
  readonly validationRefs?: readonly string[] | undefined;
  readonly failureModes?: readonly string[] | undefined;
  readonly promotionPacketId?: string | undefined;
  readonly humanCheckpointLabel?: string | undefined;
}

export interface PhysicsCapsule {
  readonly metadata: PhysicsCapsuleMetadata;
  readonly path: string;
  readonly body: string;
  readonly source: PhysicsMemorySource;
}

export interface PhysicsMemoryDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly capsuleId?: PhysicsCapsuleId;
  readonly path?: string;
  readonly rootPath?: string;
}

export interface PhysicsContextPack {
  readonly domain: PhysicsDomainId;
  readonly focus: readonly PhysicsCapsuleId[];
  readonly capsules: readonly PhysicsCapsule[];
  readonly diagnostics: readonly PhysicsMemoryDiagnostic[];
}

export function isPhysicsCapsuleKind(value: string): value is PhysicsCapsuleKind {
  return (PHYSICS_CAPSULE_KINDS as readonly string[]).includes(value);
}

export function isReliabilityState(value: string): value is ReliabilityState {
  return (RELIABILITY_STATES as readonly string[]).includes(value);
}
