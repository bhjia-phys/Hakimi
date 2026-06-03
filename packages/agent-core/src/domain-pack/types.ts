import type { DomainProfileId } from '../domain-profile';
import type { PhysicsCapsuleId, PhysicsDomainId } from '../physics-memory';
import type { WorkflowRecipeId } from '../workflow-recipe';

export type DomainPackManifestId = string;

export type DomainPackManifestDiagnosticSource =
  | 'domain-profile'
  | 'workflow-recipe'
  | 'physics-memory'
  | 'research-harness';

export interface DomainPackManifestDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly source: DomainPackManifestDiagnosticSource;
  readonly refId?: string | undefined;
  readonly path?: string | undefined;
  readonly rootPath?: string | undefined;
}

export interface DomainPackManifest {
  readonly id: DomainPackManifestId;
  readonly domain: PhysicsDomainId;
  readonly profileIds: readonly DomainProfileId[];
  readonly workflowIds: readonly WorkflowRecipeId[];
  readonly capsuleIds: readonly PhysicsCapsuleId[];
  readonly bridgeCapsuleIds: readonly PhysicsCapsuleId[];
  readonly evalCaseIds: readonly string[];
  readonly actionBindingIds: readonly string[];
  readonly actionIds: readonly string[];
  readonly requiredTools: readonly string[];
  readonly contextTags: readonly string[];
  readonly diagnostics: readonly DomainPackManifestDiagnostic[];
  readonly compiledAt: number;
}
