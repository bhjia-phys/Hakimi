import type { PhysicsDomainId, ReliabilityState } from '../physics-memory';

export type DomainProfileId = string;
export type DomainProfileSource = 'project' | 'user' | 'extra' | 'builtin';

export interface DomainProfileRoot {
  readonly path: string;
  readonly source: DomainProfileSource;
}

export interface DomainProfileMetadata {
  readonly id: DomainProfileId;
  readonly kind: 'domain_profile';
  readonly title: string;
  readonly domain: PhysicsDomainId;
  readonly status: ReliabilityState;
  readonly sourceRefs: readonly string[];
  readonly conventions: readonly string[];
  readonly lenses: readonly string[];
  readonly workflows: readonly string[];
  readonly capsuleRefs: readonly string[];
  readonly bridgeCapsules: readonly string[];
  readonly contextTags: readonly string[];
}

export interface DomainProfile {
  readonly metadata: DomainProfileMetadata;
  readonly path: string;
  readonly body: string;
  readonly source: DomainProfileSource;
}

export interface DomainProfileDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly profileId?: DomainProfileId;
  readonly path?: string;
  readonly rootPath?: string;
}
