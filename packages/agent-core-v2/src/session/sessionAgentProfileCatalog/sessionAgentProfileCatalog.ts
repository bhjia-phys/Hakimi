/**
 * `sessionAgentProfileCatalog` domain — Session-scoped merged agent-profile
 * catalog contract.
 *
 * The Catalog of the agent-profile extension point: a read-only projection
 * over the App-scope `IAgentProfileRegistry`, scoped to THIS session — it
 * merges the global contributions (builtin / plugin / user) with the ones the
 * workspace loaders tagged with this session's seeded workspace key
 * (workspace / extra / explicit). Name-level dedup happens HERE, in the
 * projection: higher-priority sources win name collisions, while builtin
 * names require an explicit `override: true` opt-in to be replaced.
 * `inspect(name)` exposes the projection's adjudication (winning source,
 * suppressed candidates) for debugging surfaces. `profileSource` exposes
 * where each merged profile came from (`builtin` / `system` — the
 * `SYSTEM.md` prompt override — / `file`), so compatibility edges can mirror
 * v1's delegation semantics without guessing from profile fields. Bound at
 * Session scope.
 */

import { createDecorator } from '#/_base/di/instantiation';
import type { Event } from '#/_base/event';
import type { AgentProfile } from '#/app/agentProfileCatalog/agentProfileCatalog';

export interface AgentProfileSuppressedCandidate {
  readonly sourceId: string;
  readonly priority: number;
  readonly reason: 'priority' | 'builtin-override-required';
}

export interface AgentProfileInspection {
  readonly name: string;
  readonly profile: AgentProfile;
  readonly sourceId: string;
  readonly priority: number;
  readonly suppressed: readonly AgentProfileSuppressedCandidate[];
}

/**
 * Where a merged profile came from. `system` is the `<home>/SYSTEM.md`
 * prompt-override profile (synthesised against the builtin default); `file`
 * is any regular agent-file contribution, including one that replaced a
 * builtin of the same name via `override: true`.
 */
export type AgentProfileSource = 'builtin' | 'system' | 'file';

export interface ISessionAgentProfileCatalog {
  readonly _serviceBrand: undefined;

  readonly ready: Promise<void>;
  readonly onDidChange: Event<string>;
  get(name: string): AgentProfile | undefined;
  getDefault(): AgentProfile;
  list(): readonly AgentProfile[];
  inspect(name: string): AgentProfileInspection | undefined;
  /** The source of the merged profile under `name`; `'builtin'` when the name is not merged. */
  profileSource(name: string): AgentProfileSource;
  load(): Promise<void>;
  reload(): Promise<void>;
}

export const ISessionAgentProfileCatalog =
  createDecorator<ISessionAgentProfileCatalog>('sessionAgentProfileCatalog');
