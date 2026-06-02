import type {
  CheckContract,
  GraphRef,
  PhysicsCapsuleId,
  PhysicsCapsuleKind,
  PhysicsDomainId,
} from '../physics-memory';

export type ResearchActionId = string;

export type ResearchActionExposure = 'direct' | 'deferred' | 'direct-model-only' | 'hidden';

export type ResearchActionSource = 'model' | 'controller' | 'hidden-check' | 'subagent' | 'replay';

export type ResearchActionCategory =
  | 'graph'
  | 'derivation'
  | 'physics'
  | 'code'
  | 'benchmark'
  | 'memory'
  | 'harness';

export type ResearchActionOutcome = 'pass' | 'fail' | 'blocked' | 'inconclusive';

export type ResearchActionPhase =
  | 'scope'
  | 'source'
  | 'explore'
  | 'derive'
  | 'validate'
  | 'code'
  | 'benchmark'
  | 'compile';

export type ResearchObjectKind =
  | 'SourceExcerpt'
  | 'Definition'
  | 'Formula'
  | 'Assumption'
  | 'ConventionSet'
  | 'DerivationStep'
  | 'Claim'
  | 'CodeRegion'
  | 'CodeMapping'
  | 'BenchmarkCase'
  | 'FailureMode'
  | 'LedgerEvent'
  | 'CapsuleProposal'
  | 'HarnessCandidate';

export type ActionPreconditionKind =
  | 'has_source_ref'
  | 'has_convention_set'
  | 'has_assumption_scope'
  | 'has_active_workframe'
  | 'has_formula'
  | 'has_code_region'
  | 'has_benchmark_case';

export interface ActionPrecondition {
  readonly kind: ActionPreconditionKind;
  readonly description: string;
  readonly required: boolean;
}

export type ActionEffectKind =
  | 'create_object'
  | 'update_object_status'
  | 'create_obligation'
  | 'write_ledger_event'
  | 'compile_proposal'
  | 'record_harness_candidate';

export interface ActionEffect {
  readonly kind: ActionEffectKind;
  readonly targetKind?: ResearchObjectKind;
  readonly description: string;
}

export type ActionValidatorKind =
  | 'schema'
  | 'source_support'
  | 'dimension'
  | 'convention'
  | 'known_limit'
  | 'code_mapping'
  | 'benchmark';

export interface ActionValidator {
  readonly kind: ActionValidatorKind;
  readonly description: string;
  readonly blocking: boolean;
}

export type PrimitiveToolPolicy =
  | 'none'
  | 'read-only'
  | 'git-read'
  | 'shell-read'
  | 'write-gated'
  | 'benchmark-gated'
  | 'mcp-gated';

export interface ObligationTemplate {
  readonly kind: CheckContract['kind'] | 'source_support' | 'dependency_closure' | 'human_decision';
  readonly severity: 'blocking' | 'important' | 'advisory';
  readonly reason: string;
  readonly requiredActionId: ResearchActionId;
}

export type ResearchActionBindingPriority = 'low' | 'normal' | 'high' | 'blocking';

export interface ResearchActionBinding {
  readonly id: string;
  readonly actionId: ResearchActionId;
  readonly domainId?: PhysicsDomainId | undefined;
  readonly workflowId?: string | undefined;
  readonly lensId?: string | undefined;
  readonly checkId?: string | undefined;
  readonly adapterId?: string | undefined;
  readonly objectRefs?: readonly string[] | undefined;
  readonly params?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly priority?: ResearchActionBindingPriority | undefined;
}

export interface ResearchActionDefinition {
  readonly id: ResearchActionId;
  readonly category: ResearchActionCategory;
  readonly exposure: ResearchActionExposure;
  readonly title: string;
  readonly description: string;
  readonly phase?: ResearchActionPhase;
  readonly inputKinds?: readonly ResearchObjectKind[];
  readonly outputKinds?: readonly ResearchObjectKind[];
  readonly preconditions?: readonly ActionPrecondition[];
  readonly effects?: readonly ActionEffect[];
  readonly generatedObligations?: readonly ObligationTemplate[];
  readonly validators?: readonly ActionValidator[];
  readonly primitiveToolPolicy?: PrimitiveToolPolicy;
  readonly domains?: readonly PhysicsDomainId[];
  readonly capsuleKinds?: readonly PhysicsCapsuleKind[];
  readonly triggerHints?: readonly string[];
  readonly suggestedNextActions?: readonly string[];
  readonly suggestedNextActionBindings?: readonly ResearchActionBinding[];
  readonly inputSchema?: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
}

export interface ResearchActionRecord {
  readonly actionId: ResearchActionId;
  readonly callId: string;
  readonly source: ResearchActionSource;
  readonly input: unknown;
  readonly output: unknown;
  readonly graphRefs: readonly GraphRef[];
  readonly capsuleRefs: readonly PhysicsCapsuleId[];
  readonly ledgerEventIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly outcome: ResearchActionOutcome;
  readonly nextSuggestedActions: readonly string[];
  readonly nextSuggestedActionBindings?: readonly ResearchActionBinding[] | undefined;
}

export type ResearchEvalValidation =
  | {
      readonly type: 'action_outcome';
      readonly actionId: ResearchActionId;
      readonly outcome: ResearchActionOutcome;
    }
  | {
      readonly type: 'required_check';
      readonly check: CheckContract;
    }
  | {
      readonly type: 'evidence_ref';
      readonly pattern: string;
    }
  | {
      readonly type: 'final_status';
      readonly status: ResearchEvalFinalStatus;
    }
  | {
      readonly type: 'forbidden_claim';
      readonly pattern: string;
    };

export type ResearchEvalActionExpectation = ResearchActionId | ResearchActionBinding;
export type ResearchEvalFinalStatus =
  | 'exploratory'
  | 'provisional'
  | 'checked'
  | 'validated'
  | 'blocked';

export interface ResearchEvalCase {
  readonly id: string;
  readonly title: string;
  readonly task: string;
  readonly domain?: PhysicsDomainId;
  readonly capsuleRefs: readonly PhysicsCapsuleId[];
  readonly actionSequence: readonly ResearchEvalActionExpectation[];
  readonly validations: readonly ResearchEvalValidation[];
  readonly timeoutSeconds?: number;
}
