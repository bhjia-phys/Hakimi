import { discoverPhysicsCapsules, type DiscoverPhysicsCapsulesOptions } from './scanner';
import type {
  PhysicsCapsule,
  PhysicsCapsuleId,
  PhysicsCapsuleKind,
  PhysicsDomainId,
  PhysicsMemoryDiagnostic,
  PhysicsMemoryRoot,
} from './types';

const LISTING_TITLE_MAX = 180;

export class PhysicsCapsuleNotFoundError extends Error {
  readonly capsuleId: PhysicsCapsuleId;

  constructor(capsuleId: PhysicsCapsuleId) {
    super(`Physics capsule "${capsuleId}" is not registered`);
    this.name = 'PhysicsCapsuleNotFoundError';
    this.capsuleId = capsuleId;
  }
}

export interface PhysicsMemoryRegistryOptions {
  readonly discover?: typeof discoverPhysicsCapsules;
  readonly onWarning?: (message: string, cause?: unknown) => void;
}

export interface ListCapsulesFilter {
  readonly domain?: PhysicsDomainId;
  readonly kind?: PhysicsCapsuleKind;
}

export class PhysicsMemoryRegistry {
  private readonly byId = new Map<PhysicsCapsuleId, PhysicsCapsule>();
  private readonly roots: PhysicsMemoryRoot[] = [];
  private readonly diagnostics: PhysicsMemoryDiagnostic[] = [];
  private readonly discoverImpl: typeof discoverPhysicsCapsules;
  private readonly onWarning: (message: string, cause?: unknown) => void;

  constructor(options: PhysicsMemoryRegistryOptions = {}) {
    this.discoverImpl = options.discover ?? discoverPhysicsCapsules;
    this.onWarning = options.onWarning ?? (() => {});
  }

  async loadRoots(roots: readonly PhysicsMemoryRoot[]): Promise<void> {
    for (const root of roots) {
      if (!this.roots.some((existing) => existing.path === root.path)) this.roots.push(root);
    }
    const capsules = await this.discoverImpl({
      roots,
      onWarning: (message, cause) => {
        this.warn({
          code: 'scan-warning',
          message: cause instanceof Error ? `${message}: ${cause.message}` : message,
        });
        this.onWarning(message, cause);
      },
    } satisfies DiscoverPhysicsCapsulesOptions);
    for (const capsule of capsules) {
      this.register(capsule);
    }
  }

  register(capsule: PhysicsCapsule, options: { readonly replace?: boolean } = {}): void {
    const id = capsule.metadata.id;
    const existing = this.byId.get(id);
    if (existing !== undefined && options.replace !== true) {
      this.warn({
        code: 'duplicate-capsule-id',
        message: `Duplicate physics capsule "${id}" at ${capsule.path}; keeping ${existing.path}.`,
        capsuleId: id,
        path: capsule.path,
      });
      return;
    }
    if (options.replace === true || !this.byId.has(id)) {
      this.byId.set(id, capsule);
    }
  }

  getCapsule(id: PhysicsCapsuleId): PhysicsCapsule | undefined {
    return this.byId.get(id);
  }

  requireCapsule(id: PhysicsCapsuleId): PhysicsCapsule {
    const capsule = this.getCapsule(id);
    if (capsule === undefined) throw new PhysicsCapsuleNotFoundError(id);
    return capsule;
  }

  listDomains(): readonly PhysicsDomainId[] {
    return [...new Set([...this.byId.values()].map((capsule) => capsule.metadata.domain))].toSorted();
  }

  listCapsules(filter: ListCapsulesFilter = {}): readonly PhysicsCapsule[] {
    return [...this.byId.values()]
      .filter((capsule) => filter.domain === undefined || capsule.metadata.domain === filter.domain)
      .filter((capsule) => filter.kind === undefined || capsule.metadata.kind === filter.kind)
      .toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
  }

  getModelCapsuleListing(filter: ListCapsulesFilter = {}): string {
    const capsules = this.listCapsules(filter);
    if (capsules.length === 0) return 'No physics capsules';
    const lines: string[] = [];
    for (const domain of sortedUnique(capsules.map((capsule) => capsule.metadata.domain))) {
      lines.push(`### ${domain}`);
      for (const capsule of capsules.filter((item) => item.metadata.domain === domain)) {
        lines.push(formatModelCapsule(capsule));
      }
    }
    return lines.join('\n');
  }

  getRoots(): readonly PhysicsMemoryRoot[] {
    return this.roots.map((root) => ({ ...root }));
  }

  getDiagnostics(): readonly PhysicsMemoryDiagnostic[] {
    return this.diagnostics.map((diagnostic) => ({ ...diagnostic }));
  }

  private warn(input: Omit<PhysicsMemoryDiagnostic, 'severity'>): void {
    this.diagnostics.push({
      severity: 'warning',
      ...input,
    });
  }
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].toSorted();
}

function formatModelCapsule(capsule: PhysicsCapsule): string {
  const { metadata } = capsule;
  const checks =
    metadata.requiredChecks.length === 0
      ? ''
      : ` checks=${metadata.requiredChecks.map((check) => check.kind).join(',')}`;
  return (
    `- ${metadata.id}: ${metadata.kind}, reliability=${metadata.reliability}${checks} - ` +
    truncate(metadata.title, LISTING_TITLE_MAX)
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
