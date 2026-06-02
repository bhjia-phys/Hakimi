import type { DomainProfileId } from '../domain-profile';
import type {
  ActionAffordance,
  BridgePolicy,
  CheckContract,
  ExpansionHandle,
  GraphRef,
  PhysicsCapsuleId,
  PhysicsCapsuleKind,
  PhysicsDomainId,
  ReliabilityState,
} from '../physics-memory';
import type { ResearchActionBinding, WorkFrame } from '../research-action';
import type { ResearchLedgerEventStatus, ResearchTopicId } from '../research-ledger';
import type { WorkflowRecipeId } from '../workflow-recipe';

export type ResearchContextPackId = string;

export type ResearchContextRecordSource = 'model-tool' | 'controller' | 'replay';

export type ResearchContextDiagnosticSource =
  | 'workframe'
  | 'domain-profile'
  | 'workflow-recipe'
  | 'physics-memory'
  | 'research-ledger';

export interface ResearchContextPackDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly source: ResearchContextDiagnosticSource;
  readonly refId?: string | undefined;
}

export interface ResearchContextProfileSummary {
  readonly id: DomainProfileId;
  readonly title: string;
  readonly status: ReliabilityState;
  readonly sourceRefs: readonly string[];
  readonly conventions: readonly string[];
  readonly lenses: readonly string[];
  readonly workflows: readonly WorkflowRecipeId[];
  readonly capsuleRefs: readonly PhysicsCapsuleId[];
  readonly bridgeCapsules: readonly PhysicsCapsuleId[];
  readonly contextTags: readonly string[];
}

export interface ResearchContextWorkflowSummary {
  readonly id: WorkflowRecipeId;
  readonly title: string;
  readonly status: ReliabilityState;
  readonly sourceRefs: readonly string[];
  readonly actionBindingIds: readonly string[];
  readonly requiredCapsules: readonly PhysicsCapsuleId[];
  readonly requiredTools: readonly string[];
  readonly failureModes: readonly string[];
}

export interface ResearchContextCapsuleSummary {
  readonly id: PhysicsCapsuleId;
  readonly kind: PhysicsCapsuleKind;
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
}

export interface ResearchContextLedgerProposalSummary {
  readonly id: string;
  readonly kind: string;
  readonly eventIds: readonly string[];
  readonly targetCapsuleKind?: PhysicsCapsuleKind | undefined;
  readonly targetCapsuleId?: PhysicsCapsuleId | undefined;
  readonly sourceRefs: readonly string[];
  readonly openQuestions: readonly string[];
  readonly confidence: 'low' | 'medium' | 'high';
}

export interface ResearchContextPhysicsSection {
  readonly requestedFocus: readonly string[];
  readonly includedFocus: readonly PhysicsCapsuleId[];
  readonly capsules: readonly ResearchContextCapsuleSummary[];
}

export interface ResearchContextLedgerSection {
  readonly includeStatuses: readonly ResearchLedgerEventStatus[];
  readonly proposals: readonly ResearchContextLedgerProposalSummary[];
}

export interface ResearchContextPack {
  readonly id: ResearchContextPackId;
  readonly workFrameId: string;
  readonly domain: PhysicsDomainId;
  readonly topic: ResearchTopicId;
  readonly goal: string;
  readonly focusObjectIds: readonly string[];
  readonly assumptionIds: readonly string[];
  readonly conventionIds: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly profiles: readonly ResearchContextProfileSummary[];
  readonly workflows: readonly ResearchContextWorkflowSummary[];
  readonly physics: ResearchContextPhysicsSection;
  readonly ledger: ResearchContextLedgerSection;
  readonly actionBindings: readonly ResearchActionBinding[];
  readonly diagnostics: readonly ResearchContextPackDiagnostic[];
  readonly compiledAt: number;
}

export interface CompileResearchContextPackLimits {
  readonly maxCapsules?: number | undefined;
  readonly maxLedgerProposals?: number | undefined;
  readonly maxActionBindings?: number | undefined;
}

export interface CompileResearchContextPackOptions {
  readonly workFrame: WorkFrame;
  readonly reliabilityFloor?: ReliabilityState | undefined;
  readonly bridgePolicy?: BridgePolicy | undefined;
  readonly includeLedgerStatuses?: readonly ResearchLedgerEventStatus[] | undefined;
  readonly limits?: CompileResearchContextPackLimits | undefined;
  readonly now?: (() => number) | undefined;
}
