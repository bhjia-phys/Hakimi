import type { ResearchEvalCheckResult } from '../research-harness';

export type BenchmarkAdapterId = string;
export type BenchmarkAdapterOutcome = 'pass' | 'fail' | 'blocked' | 'inconclusive';

export interface BenchmarkAdapterRunInput {
  readonly payload: unknown;
  readonly caseId?: string | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
}

export interface BenchmarkAdapterRunResult {
  readonly adapterId: BenchmarkAdapterId;
  readonly caseId: string;
  readonly domain: string;
  readonly actionId: string;
  readonly outcome: BenchmarkAdapterOutcome;
  readonly observation: string;
  readonly output: unknown;
  readonly evidenceRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly checkResults: readonly ResearchEvalCheckResult[];
}

export interface BenchmarkAdapter {
  readonly id: BenchmarkAdapterId;
  readonly title: string;
  readonly domain: string;
  readonly supportedActionIds: readonly string[];
  run(input: BenchmarkAdapterRunInput): BenchmarkAdapterRunResult;
}

export class BenchmarkAdapterNotFoundError extends Error {
  readonly adapterId: BenchmarkAdapterId;

  constructor(adapterId: BenchmarkAdapterId) {
    super(`Benchmark adapter "${adapterId}" is not registered`);
    this.name = 'BenchmarkAdapterNotFoundError';
    this.adapterId = adapterId;
  }
}

export class BenchmarkAdapterRegistry {
  private readonly byId = new Map<BenchmarkAdapterId, BenchmarkAdapter>();

  register(adapter: BenchmarkAdapter, options: { readonly replace?: boolean } = {}): void {
    if (this.byId.has(adapter.id) && options.replace !== true) return;
    this.byId.set(adapter.id, adapter);
  }

  getAdapter(id: BenchmarkAdapterId): BenchmarkAdapter | undefined {
    return this.byId.get(id);
  }

  requireAdapter(id: BenchmarkAdapterId): BenchmarkAdapter {
    const adapter = this.getAdapter(id);
    if (adapter === undefined) throw new BenchmarkAdapterNotFoundError(id);
    return adapter;
  }

  listAdapters(filter: { readonly domain?: string | undefined } = {}): readonly BenchmarkAdapter[] {
    return [...this.byId.values()]
      .filter((adapter) => filter.domain === undefined || adapter.domain === filter.domain)
      .toSorted((a, b) => a.id.localeCompare(b.id));
  }

  run(
    adapterId: BenchmarkAdapterId,
    input: BenchmarkAdapterRunInput,
  ): BenchmarkAdapterRunResult {
    return this.requireAdapter(adapterId).run(input);
  }
}
