import type {
  CheckContract,
  GraphRef,
  PhysicsCapsuleId,
  PhysicsCapsuleKind,
  PhysicsDomainId,
} from '../physics-memory';

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

export interface ResearchActionDefinition {
  readonly id: string;
  readonly category: ResearchActionCategory;
  readonly exposure: ResearchActionExposure;
  readonly title: string;
  readonly description: string;
  readonly domains?: readonly PhysicsDomainId[];
  readonly capsuleKinds?: readonly PhysicsCapsuleKind[];
  readonly triggerHints?: readonly string[];
  readonly suggestedNextActions?: readonly string[];
  readonly inputSchema?: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
}

export interface ResearchActionRecord {
  readonly actionId: string;
  readonly callId: string;
  readonly source: ResearchActionSource;
  readonly input: unknown;
  readonly output: unknown;
  readonly graphRefs: readonly GraphRef[];
  readonly capsuleRefs: readonly PhysicsCapsuleId[];
  readonly evidenceRefs: readonly string[];
  readonly outcome: ResearchActionOutcome;
  readonly nextSuggestedActions: readonly string[];
}

export type ResearchEvalValidation =
  | {
      readonly type: 'action_outcome';
      readonly actionId: string;
      readonly outcome: ResearchActionOutcome;
    }
  | {
      readonly type: 'required_check';
      readonly check: CheckContract;
    }
  | {
      readonly type: 'evidence_ref';
      readonly pattern: string;
    };

export interface ResearchEvalCase {
  readonly id: string;
  readonly title: string;
  readonly task: string;
  readonly domain?: PhysicsDomainId;
  readonly capsuleRefs: readonly PhysicsCapsuleId[];
  readonly actionSequence: readonly string[];
  readonly validations: readonly ResearchEvalValidation[];
  readonly timeoutSeconds?: number;
}
