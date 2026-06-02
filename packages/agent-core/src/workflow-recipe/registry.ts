import { discoverWorkflowRecipes, type DiscoverWorkflowRecipesOptions } from './scanner';
import type {
  WorkflowRecipe,
  WorkflowRecipeDiagnostic,
  WorkflowRecipeId,
  WorkflowRecipeRoot,
} from './types';

export class WorkflowRecipeNotFoundError extends Error {
  readonly recipeId: WorkflowRecipeId;

  constructor(recipeId: WorkflowRecipeId) {
    super(`Workflow recipe "${recipeId}" is not registered`);
    this.name = 'WorkflowRecipeNotFoundError';
    this.recipeId = recipeId;
  }
}

export interface WorkflowRecipeRegistryOptions {
  readonly discover?: typeof discoverWorkflowRecipes;
  readonly onWarning?: (message: string, cause?: unknown) => void;
}

export interface ListWorkflowRecipesFilter {
  readonly domain?: string;
}

export class WorkflowRecipeRegistry {
  private readonly byId = new Map<WorkflowRecipeId, WorkflowRecipe>();
  private readonly roots: WorkflowRecipeRoot[] = [];
  private readonly diagnostics: WorkflowRecipeDiagnostic[] = [];
  private readonly discoverImpl: typeof discoverWorkflowRecipes;
  private readonly onWarning: (message: string, cause?: unknown) => void;

  constructor(options: WorkflowRecipeRegistryOptions = {}) {
    this.discoverImpl = options.discover ?? discoverWorkflowRecipes;
    this.onWarning = options.onWarning ?? (() => {});
  }

  async loadRoots(roots: readonly WorkflowRecipeRoot[]): Promise<void> {
    for (const root of roots) {
      if (!this.roots.some((existing) => existing.path === root.path)) this.roots.push(root);
    }
    const recipes = await this.discoverImpl({
      roots,
      onWarning: (message, cause) => {
        this.warn({
          code: 'scan-warning',
          message: cause instanceof Error ? `${message}: ${cause.message}` : message,
        });
        this.onWarning(message, cause);
      },
    } satisfies DiscoverWorkflowRecipesOptions);
    for (const recipe of recipes) {
      this.register(recipe);
    }
  }

  register(recipe: WorkflowRecipe, options: { readonly replace?: boolean } = {}): void {
    const id = recipe.metadata.id;
    const existing = this.byId.get(id);
    if (existing !== undefined && options.replace !== true) {
      this.warn({
        code: 'duplicate-workflow-recipe-id',
        message: `Duplicate workflow recipe "${id}" at ${recipe.path}; keeping ${existing.path}.`,
        recipeId: id,
        path: recipe.path,
      });
      return;
    }
    if (options.replace === true || !this.byId.has(id)) {
      this.byId.set(id, recipe);
    }
  }

  getRecipe(id: WorkflowRecipeId): WorkflowRecipe | undefined {
    return this.byId.get(id);
  }

  requireRecipe(id: WorkflowRecipeId): WorkflowRecipe {
    const recipe = this.getRecipe(id);
    if (recipe === undefined) throw new WorkflowRecipeNotFoundError(id);
    return recipe;
  }

  listDomains(): readonly string[] {
    return [...new Set([...this.byId.values()].map((recipe) => recipe.metadata.domain))]
      .toSorted();
  }

  listRecipes(filter: ListWorkflowRecipesFilter = {}): readonly WorkflowRecipe[] {
    return [...this.byId.values()]
      .filter((recipe) => filter.domain === undefined || recipe.metadata.domain === filter.domain)
      .toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
  }

  getRoots(): readonly WorkflowRecipeRoot[] {
    return this.roots.map((root) => ({ ...root }));
  }

  getDiagnostics(): readonly WorkflowRecipeDiagnostic[] {
    return this.diagnostics.map((diagnostic) => ({ ...diagnostic }));
  }

  private warn(input: Omit<WorkflowRecipeDiagnostic, 'severity'>): void {
    this.diagnostics.push({
      severity: 'warning',
      ...input,
    });
  }
}
