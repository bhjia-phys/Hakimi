import type {
  CheckContract,
  ExpansionHandle,
  PhysicsDomainId,
} from '../physics-memory';

export type PhysicsLensId = string;
export type PhysicsLensObjectKind = string;
export type PhysicsLensRelationKind = string;
export type PhysicsLensContextTag = string;

export type PhysicsLensStatus = 'applicable' | 'needs_context' | 'rejected';
export type PhysicsLensConfidence = 'high' | 'medium' | 'low';

export interface PhysicsLens {
  readonly id: PhysicsLensId;
  readonly title: string;
  readonly domains: readonly PhysicsDomainId[];
  readonly summary: string;
  readonly requiredObjectKinds: readonly PhysicsLensObjectKind[];
  readonly requiredRelationKinds?: readonly PhysicsLensRelationKind[] | undefined;
  readonly supportingContextTags?: readonly PhysicsLensContextTag[] | undefined;
  readonly rejectObjectKinds?: readonly PhysicsLensObjectKind[] | undefined;
  readonly rejectContextTags?: readonly PhysicsLensContextTag[] | undefined;
  readonly caveats: readonly string[];
  readonly guidingQuestions: readonly string[];
  readonly requiredChecks: readonly CheckContract[];
  readonly suggestedActions: readonly string[];
  readonly expansionHandles?: readonly ExpansionHandle[] | undefined;
}

export interface PhysicsLensApplicabilityInput {
  readonly domain?: PhysicsDomainId | undefined;
  readonly topic?: string | undefined;
  readonly prompt?: string | undefined;
  readonly activeObjectKinds?: readonly PhysicsLensObjectKind[] | undefined;
  readonly activeRelationKinds?: readonly PhysicsLensRelationKind[] | undefined;
  readonly contextTags?: readonly PhysicsLensContextTag[] | undefined;
  readonly capsuleIds?: readonly string[] | undefined;
  readonly codeRegionTags?: readonly string[] | undefined;
}

export interface PhysicsLensApplicabilityResult {
  readonly lens: PhysicsLens;
  readonly status: PhysicsLensStatus;
  readonly confidence: PhysicsLensConfidence;
  readonly score: number;
  readonly matchedObjectKinds: readonly PhysicsLensObjectKind[];
  readonly missingObjectKinds: readonly PhysicsLensObjectKind[];
  readonly matchedRelationKinds: readonly PhysicsLensRelationKind[];
  readonly missingRelationKinds: readonly PhysicsLensRelationKind[];
  readonly matchedContextTags: readonly PhysicsLensContextTag[];
  readonly rejectionReasons: readonly string[];
  readonly diagnostics: readonly string[];
  readonly caveats: readonly string[];
  readonly guidingQuestions: readonly string[];
  readonly requiredChecks: readonly CheckContract[];
  readonly suggestedActions: readonly string[];
  readonly expansionHandles: readonly ExpansionHandle[];
}

export interface RecommendPhysicsLensesOptions {
  readonly lenses?: readonly PhysicsLens[] | undefined;
  readonly includeRejected?: boolean | undefined;
  readonly limit?: number | undefined;
}
