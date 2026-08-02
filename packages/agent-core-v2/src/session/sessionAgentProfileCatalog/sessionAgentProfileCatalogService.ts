/**
 * `sessionAgentProfileCatalog` domain — `ISessionAgentProfileCatalog`
 * implementation.
 *
 * Projects the App-scope `IAgentProfileRegistry` into this session's merged
 * profile view. The relevant entries are the global ones (builtin) plus the
 * ones tagged with the seeded workspace key (user / plugin / extra /
 * workspace / explicit); they are re-merged on every registry change (the
 * projection is a cheap full recompute — merge, never incremental patching).
 * Merge rules, applied per profile name: candidates are collected from every
 * relevant entry (deduped within an entry, highest priority first); the first
 * candidate wins, except that replacing a same-name `builtin` profile
 * requires `override: true` in the frontmatter — a non-override collision is
 * warned about and skipped to the next candidate. `ready` resolves
 * immediately: the registry is already populated when this service is
 * constructed, and every later change arrives through `onDidChange`. The
 * per-name provenance (`builtin` / `system` — the `<home>/SYSTEM.md` prompt
 * override — / `file`) tracked by `profileSource` mirrors v1's delegation
 * semantics. Bound at Session scope.
 */

import { Disposable } from '#/_base/di/lifecycle';
import { Emitter, type Event } from '#/_base/event';
import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { ILogService } from '#/_base/log/log';
import { BugIndicatingError } from '#/errors';
import type { AgentProfile } from '#/app/agentProfileCatalog/agentProfileCatalog';
import { DEFAULT_AGENT_PROFILE_NAME } from '#/app/agentProfileCatalog/agentProfileCatalog';
import {
  IAgentProfileRegistry,
  type AgentProfileRegistration,
} from '#/app/agentProfileCatalog/agentProfileRegistry';
import { BUILTIN_AGENT_PROFILE_SOURCE_ID } from '#/app/agentProfileCatalog/builtinAgentProfileLoader';
import { AGENT_PROFILE_SOURCE_PRIORITY } from '#/app/agentProfileCatalog/agentProfileContribution';

import { ISessionAgentProfileCatalogSeed } from './agentProfileCatalogSeed';
import { IExplicitFileAgentSource } from './explicitFileAgentSource';
import {
  ISessionAgentProfileCatalog,
  type AgentProfileInspection,
  type AgentProfileSource,
  type AgentProfileSuppressedCandidate,
} from './sessionAgentProfileCatalog';

interface ProfileCandidate {
  readonly profile: AgentProfile;
  readonly sourceId: string;
  readonly priority: number;
}

// NOTE: stays Disposable — its own 'get' collides with the Fiber
export class SessionAgentProfileCatalogService
  extends Disposable
  implements ISessionAgentProfileCatalog
{
  declare readonly _serviceBrand: undefined;

  private merged = new Map<string, AgentProfile>();
  private inspections = new Map<string, AgentProfileInspection>();
  private builtinDefault: AgentProfile | undefined;
  private readonly onDidChangeEmitter = this._register(new Emitter<string>());
  readonly onDidChange: Event<string> = this.onDidChangeEmitter.event;

  constructor(
    @IAgentProfileRegistry private readonly registry: IAgentProfileRegistry,
    @ISessionAgentProfileCatalogSeed private readonly seed: ISessionAgentProfileCatalogSeed,
    @IExplicitFileAgentSource private readonly explicit: IExplicitFileAgentSource,
    @ILogService private readonly log: ILogService,
  ) {
    super();
    this.reproject();
    this._register(
      this.registry.onDidChange((change) => {
        if (change.workspaceKey !== undefined && change.workspaceKey !== this.seed.workspaceKey) {
          return;
        }
        this.reproject();
        this.onDidChangeEmitter.fire(change.sourceId);
      }),
    );
    // The per-session explicit files are copied into the session dir at
    // create time; fold them into the projection once the source's first
    // load resolves (an invalid `--agent-file` rejects `ready`).
    void this.explicit.ready.then(() => {
      this.reproject();
      this.onDidChangeEmitter.fire('explicit');
    });
  }

  get ready(): Promise<void> {
    return this.explicit.ready;
  }

  get(name: string): AgentProfile | undefined {
    return this.merged.get(name);
  }

  getDefault(): AgentProfile {
    const profile = this.get(DEFAULT_AGENT_PROFILE_NAME);
    if (profile === undefined) {
      throw new BugIndicatingError(
        `Default agent profile "${DEFAULT_AGENT_PROFILE_NAME}" is not registered`,
      );
    }
    return profile;
  }

  list(): readonly AgentProfile[] {
    return [...this.merged.values()];
  }

  inspect(name: string): AgentProfileInspection | undefined {
    return this.inspections.get(name);
  }

  profileSource(name: string): AgentProfileSource {
    const inspection = this.inspections.get(name);
    if (inspection === undefined || inspection.sourceId === BUILTIN_AGENT_PROFILE_SOURCE_ID) {
      return 'builtin';
    }
    // The `<home>/SYSTEM.md` prompt override is synthesized against the
    // builtin default with the same name and a copied description — only the
    // prompt differs. A regular agent file that replaces the default carries
    // its own description.
    if (
      name === DEFAULT_AGENT_PROFILE_NAME &&
      this.builtinDefault !== undefined &&
      inspection.profile.description === this.builtinDefault.description
    ) {
      return 'system';
    }
    return 'file';
  }

  async load(): Promise<void> {
    await this.ready;
  }

  async reload(): Promise<void> {
    await this.ready;
    this.reproject();
    this.onDidChangeEmitter.fire('catalog');
  }

  private relevantEntries(): AgentProfileRegistration[] {
    const key = this.seed.workspaceKey;
    return this.registry
      .entries()
      .filter((e) => e.workspaceKey === undefined || e.workspaceKey === key);
  }

  private reproject(): void {
    const merged = new Map<string, AgentProfile>();
    const inspections = new Map<string, AgentProfileInspection>();
    const entries = [...this.relevantEntries()];
    // The per-session explicit source (session-dir copies of `--agent-file`)
    // participates in the merge at the same priority as the workspace
    // explicit loader; it is session-local, so no workspace-key filter.
    const explicitContribution = this.explicit.contribution();
    if (explicitContribution.profiles.length > 0) {
      entries.push({
        sourceId: 'explicit',
        priority: AGENT_PROFILE_SOURCE_PRIORITY.explicit,
        contribution: explicitContribution,
      });
    }

    const builtinEntry = entries.find((e) => e.sourceId === BUILTIN_AGENT_PROFILE_SOURCE_ID);
    if (builtinEntry !== undefined) {
      this.builtinDefault = builtinEntry.contribution.profiles.find(
        (profile) => profile.name === DEFAULT_AGENT_PROFILE_NAME,
      );
      for (const profile of builtinEntry.contribution.profiles) {
        merged.set(profile.name, profile);
        inspections.set(profile.name, {
          name: profile.name,
          profile,
          sourceId: builtinEntry.sourceId,
          priority: builtinEntry.priority,
          suppressed: [],
        });
      }
    }

    const fileCandidates = new Map<string, ProfileCandidate[]>();
    const ordered = entries
      .filter((e) => e.sourceId !== BUILTIN_AGENT_PROFILE_SOURCE_ID)
      .toSorted((a, b) => b.priority - a.priority);
    for (const entry of ordered) {
      const entryProfiles = new Map<string, AgentProfile>();
      for (const profile of entry.contribution.profiles) {
        entryProfiles.set(profile.name, profile);
      }
      for (const profile of entryProfiles.values()) {
        const candidates = fileCandidates.get(profile.name) ?? [];
        candidates.push({
          profile,
          sourceId: entry.sourceId,
          priority: entry.priority,
        });
        fileCandidates.set(profile.name, candidates);
      }
    }

    for (const candidates of fileCandidates.values()) {
      const suppressed: AgentProfileSuppressedCandidate[] = [];
      let winner = false;
      for (const candidate of candidates) {
        if (merged.has(candidate.profile.name) && candidate.profile.override !== true) {
          this.log.warn(
            `agent file profile "${candidate.profile.name}" ignored: a same-name builtin profile exists; set "override: true" in the frontmatter to replace it`,
          );
          suppressed.push({
            sourceId: candidate.sourceId,
            priority: candidate.priority,
            reason: 'builtin-override-required',
          });
          continue;
        }
        merged.set(candidate.profile.name, candidate.profile);
        inspections.set(candidate.profile.name, {
          name: candidate.profile.name,
          profile: candidate.profile,
          sourceId: candidate.sourceId,
          priority: candidate.priority,
          suppressed: [
            ...suppressed,
            ...candidates.slice(candidates.indexOf(candidate) + 1).map((rest) => ({
              sourceId: rest.sourceId,
              priority: rest.priority,
              reason: 'priority' as const,
            })),
          ],
        });
        winner = true;
        break;
      }
      if (!winner && suppressed.length > 0) {
        const name = candidates[0]?.profile.name;
        const existing = name === undefined ? undefined : inspections.get(name);
        if (existing !== undefined) {
          inspections.set(existing.name, { ...existing, suppressed });
        }
      }
    }

    this.merged = merged;
    this.inspections = inspections;
  }
}

registerScopedService(
  LifecycleScope.Session,
  ISessionAgentProfileCatalog,
  SessionAgentProfileCatalogService,
  ScopeActivation.OnScopeCreated,
  'sessionAgentProfileCatalog',
);
