import { discoverDomainProfiles, type DiscoverDomainProfilesOptions } from './scanner';
import type {
  DomainProfile,
  DomainProfileDiagnostic,
  DomainProfileId,
  DomainProfileRoot,
} from './types';

export class DomainProfileNotFoundError extends Error {
  readonly profileId: DomainProfileId;

  constructor(profileId: DomainProfileId) {
    super(`Domain profile "${profileId}" is not registered`);
    this.name = 'DomainProfileNotFoundError';
    this.profileId = profileId;
  }
}

export interface DomainProfileRegistryOptions {
  readonly discover?: typeof discoverDomainProfiles;
  readonly onWarning?: (message: string, cause?: unknown) => void;
}

export interface ListDomainProfilesFilter {
  readonly domain?: string;
}

export class DomainProfileRegistry {
  private readonly byId = new Map<DomainProfileId, DomainProfile>();
  private readonly roots: DomainProfileRoot[] = [];
  private readonly diagnostics: DomainProfileDiagnostic[] = [];
  private readonly discoverImpl: typeof discoverDomainProfiles;
  private readonly onWarning: (message: string, cause?: unknown) => void;

  constructor(options: DomainProfileRegistryOptions = {}) {
    this.discoverImpl = options.discover ?? discoverDomainProfiles;
    this.onWarning = options.onWarning ?? (() => {});
  }

  async loadRoots(roots: readonly DomainProfileRoot[]): Promise<void> {
    for (const root of roots) {
      if (!this.roots.some((existing) => existing.path === root.path)) this.roots.push(root);
    }
    const profiles = await this.discoverImpl({
      roots,
      onWarning: (message, cause) => {
        this.warn({
          code: 'scan-warning',
          message: cause instanceof Error ? `${message}: ${cause.message}` : message,
        });
        this.onWarning(message, cause);
      },
    } satisfies DiscoverDomainProfilesOptions);
    for (const profile of profiles) {
      this.register(profile);
    }
  }

  register(profile: DomainProfile, options: { readonly replace?: boolean } = {}): void {
    const id = profile.metadata.id;
    const existing = this.byId.get(id);
    if (existing !== undefined && options.replace !== true) {
      this.warn({
        code: 'duplicate-domain-profile-id',
        message: `Duplicate domain profile "${id}" at ${profile.path}; keeping ${existing.path}.`,
        profileId: id,
        path: profile.path,
      });
      return;
    }
    if (options.replace === true || !this.byId.has(id)) {
      this.byId.set(id, profile);
    }
  }

  getProfile(id: DomainProfileId): DomainProfile | undefined {
    return this.byId.get(id);
  }

  requireProfile(id: DomainProfileId): DomainProfile {
    const profile = this.getProfile(id);
    if (profile === undefined) throw new DomainProfileNotFoundError(id);
    return profile;
  }

  listDomains(): readonly string[] {
    return [...new Set([...this.byId.values()].map((profile) => profile.metadata.domain))]
      .toSorted();
  }

  listProfiles(filter: ListDomainProfilesFilter = {}): readonly DomainProfile[] {
    return [...this.byId.values()]
      .filter((profile) => filter.domain === undefined || profile.metadata.domain === filter.domain)
      .toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
  }

  getRoots(): readonly DomainProfileRoot[] {
    return this.roots.map((root) => ({ ...root }));
  }

  getDiagnostics(): readonly DomainProfileDiagnostic[] {
    return this.diagnostics.map((diagnostic) => ({ ...diagnostic }));
  }

  private warn(input: Omit<DomainProfileDiagnostic, 'severity'>): void {
    this.diagnostics.push({
      severity: 'warning',
      ...input,
    });
  }
}
