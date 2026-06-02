import {
  discoverResearchEvalCases,
  type DiscoverResearchEvalCasesOptions,
} from './scanner';
import type {
  FileBackedResearchEvalCase,
  ResearchEvalCaseDiagnostic,
  ResearchEvalCaseRoot,
} from './types';

export class ResearchEvalCaseNotFoundError extends Error {
  readonly evalCaseId: string;

  constructor(evalCaseId: string) {
    super(`Research eval case "${evalCaseId}" is not registered`);
    this.name = 'ResearchEvalCaseNotFoundError';
    this.evalCaseId = evalCaseId;
  }
}

export interface ResearchEvalCaseRegistryOptions {
  readonly discover?: typeof discoverResearchEvalCases;
  readonly onWarning?: (message: string, cause?: unknown) => void;
}

export interface ListResearchEvalCasesFilter {
  readonly domain?: string;
}

export class ResearchEvalCaseRegistry {
  private readonly byId = new Map<string, FileBackedResearchEvalCase>();
  private readonly roots: ResearchEvalCaseRoot[] = [];
  private readonly diagnostics: ResearchEvalCaseDiagnostic[] = [];
  private readonly discoverImpl: typeof discoverResearchEvalCases;
  private readonly onWarning: (message: string, cause?: unknown) => void;

  constructor(options: ResearchEvalCaseRegistryOptions = {}) {
    this.discoverImpl = options.discover ?? discoverResearchEvalCases;
    this.onWarning = options.onWarning ?? (() => {});
  }

  async loadRoots(roots: readonly ResearchEvalCaseRoot[]): Promise<void> {
    for (const root of roots) {
      if (!this.roots.some((existing) => existing.path === root.path)) this.roots.push(root);
    }
    const evalCases = await this.discoverImpl({
      roots,
      onWarning: (message, cause) => {
        this.warn({
          code: 'scan-warning',
          message: cause instanceof Error ? `${message}: ${cause.message}` : message,
        });
        this.onWarning(message, cause);
      },
    } satisfies DiscoverResearchEvalCasesOptions);
    for (const evalCase of evalCases) {
      this.register(evalCase);
    }
  }

  register(
    evalCase: FileBackedResearchEvalCase,
    options: { readonly replace?: boolean } = {},
  ): void {
    const id = evalCase.evalCase.id;
    const existing = this.byId.get(id);
    if (existing !== undefined && options.replace !== true) {
      this.warn({
        code: 'duplicate-research-eval-case-id',
        message: `Duplicate research eval case "${id}" at ${evalCase.path}; keeping ${existing.path}.`,
        evalCaseId: id,
        path: evalCase.path,
      });
      return;
    }
    if (options.replace === true || !this.byId.has(id)) {
      this.byId.set(id, evalCase);
    }
  }

  getEvalCase(id: string): FileBackedResearchEvalCase | undefined {
    return this.byId.get(id);
  }

  requireEvalCase(id: string): FileBackedResearchEvalCase {
    const evalCase = this.getEvalCase(id);
    if (evalCase === undefined) throw new ResearchEvalCaseNotFoundError(id);
    return evalCase;
  }

  listDomains(): readonly string[] {
    return [
      ...new Set(
        [...this.byId.values()]
          .map((evalCase) => evalCase.evalCase.domain)
          .filter((domain): domain is string => domain !== undefined),
      ),
    ].toSorted();
  }

  listEvalCases(filter: ListResearchEvalCasesFilter = {}): readonly FileBackedResearchEvalCase[] {
    return [...this.byId.values()]
      .filter(
        (evalCase) =>
          filter.domain === undefined || evalCase.evalCase.domain === filter.domain,
      )
      .toSorted((a, b) => a.evalCase.id.localeCompare(b.evalCase.id));
  }

  getRoots(): readonly ResearchEvalCaseRoot[] {
    return this.roots.map((root) => ({ ...root }));
  }

  getDiagnostics(): readonly ResearchEvalCaseDiagnostic[] {
    return this.diagnostics.map((diagnostic) => ({ ...diagnostic }));
  }

  private warn(input: Omit<ResearchEvalCaseDiagnostic, 'severity'>): void {
    this.diagnostics.push({
      severity: 'warning',
      ...input,
    });
  }
}
