import type { PhysicsDomainId, ReliabilityState } from '../physics-memory';
import type { ResearchActionBinding } from '../research-action';

export type WorkflowRecipeId = string;
export type WorkflowRecipeSource = 'project' | 'user' | 'extra' | 'builtin';

export interface WorkflowRecipeRoot {
  readonly path: string;
  readonly source: WorkflowRecipeSource;
}

export interface WorkflowRecipeMetadata {
  readonly id: WorkflowRecipeId;
  readonly kind: 'workflow_recipe';
  readonly title: string;
  readonly domain: PhysicsDomainId;
  readonly status: ReliabilityState;
  readonly sourceRefs: readonly string[];
  readonly actionBindings: readonly ResearchActionBinding[];
  readonly requiredCapsules: readonly string[];
  readonly requiredTools: readonly string[];
  readonly failureModes: readonly string[];
}

export interface WorkflowRecipe {
  readonly metadata: WorkflowRecipeMetadata;
  readonly path: string;
  readonly body: string;
  readonly source: WorkflowRecipeSource;
}

export interface WorkflowRecipeDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly recipeId?: WorkflowRecipeId;
  readonly path?: string;
  readonly rootPath?: string;
}
