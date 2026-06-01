import {
  discoverResearchLedgerEvents,
  type DiscoverResearchLedgerEventsOptions,
} from './scanner';
import type {
  ResearchLedgerEvent,
  ResearchLedgerEventId,
  ResearchLedgerEventStatus,
  ResearchLedgerEventType,
  ResearchLedgerRoot,
  ResearchTopicId,
} from './types';
import type { PhysicsDomainId } from '../physics-memory';

export interface ResearchLedgerDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly eventId?: ResearchLedgerEventId;
  readonly path?: string;
  readonly rootPath?: string;
}

export class ResearchLedgerEventNotFoundError extends Error {
  readonly eventId: ResearchLedgerEventId;

  constructor(eventId: ResearchLedgerEventId) {
    super(`Research ledger event "${eventId}" is not registered`);
    this.name = 'ResearchLedgerEventNotFoundError';
    this.eventId = eventId;
  }
}

export interface ResearchLedgerRegistryOptions {
  readonly discover?: typeof discoverResearchLedgerEvents;
  readonly onWarning?: (message: string, cause?: unknown) => void;
}

export interface ListResearchLedgerEventsFilter {
  readonly topic?: ResearchTopicId;
  readonly domain?: PhysicsDomainId;
  readonly type?: ResearchLedgerEventType;
  readonly status?: ResearchLedgerEventStatus;
}

export class ResearchLedgerRegistry {
  private readonly byId = new Map<ResearchLedgerEventId, ResearchLedgerEvent>();
  private readonly roots: ResearchLedgerRoot[] = [];
  private readonly diagnostics: ResearchLedgerDiagnostic[] = [];
  private readonly discoverImpl: typeof discoverResearchLedgerEvents;
  private readonly onWarning: (message: string, cause?: unknown) => void;

  constructor(options: ResearchLedgerRegistryOptions = {}) {
    this.discoverImpl = options.discover ?? discoverResearchLedgerEvents;
    this.onWarning = options.onWarning ?? (() => {});
  }

  async loadRoots(roots: readonly ResearchLedgerRoot[]): Promise<void> {
    for (const root of roots) {
      this.ensureRoot(root);
    }
    const events = await this.discoverImpl({
      roots,
      onWarning: (message, cause) => {
        this.warn({
          code: 'scan-warning',
          message: cause instanceof Error ? `${message}: ${cause.message}` : message,
        });
        this.onWarning(message, cause);
      },
    } satisfies DiscoverResearchLedgerEventsOptions);
    for (const event of events) {
      this.register(event);
    }
  }

  register(event: ResearchLedgerEvent, options: { readonly replace?: boolean } = {}): void {
    const id = event.metadata.id;
    const existing = this.byId.get(id);
    if (existing !== undefined && options.replace !== true) {
      this.warn({
        code: 'duplicate-event-id',
        message: `Duplicate research ledger event "${id}" at ${event.path}; keeping ${existing.path}.`,
        eventId: id,
        path: event.path,
      });
      return;
    }
    if (options.replace === true || !this.byId.has(id)) {
      this.byId.set(id, event);
    }
  }

  ensureRoot(root: ResearchLedgerRoot): void {
    if (!this.roots.some((existing) => existing.path === root.path)) this.roots.push(root);
  }

  getEvent(id: ResearchLedgerEventId): ResearchLedgerEvent | undefined {
    return this.byId.get(id);
  }

  requireEvent(id: ResearchLedgerEventId): ResearchLedgerEvent {
    const event = this.getEvent(id);
    if (event === undefined) throw new ResearchLedgerEventNotFoundError(id);
    return event;
  }

  listTopics(filter: { readonly domain?: PhysicsDomainId } = {}): readonly ResearchTopicId[] {
    return sortedUnique(
      this.listEvents({ domain: filter.domain }).map((event) => event.metadata.topic),
    );
  }

  listDomains(): readonly PhysicsDomainId[] {
    return sortedUnique([...this.byId.values()].map((event) => event.metadata.domain));
  }

  listEvents(filter: ListResearchLedgerEventsFilter = {}): readonly ResearchLedgerEvent[] {
    return [...this.byId.values()]
      .filter((event) => filter.topic === undefined || event.metadata.topic === filter.topic)
      .filter((event) => filter.domain === undefined || event.metadata.domain === filter.domain)
      .filter((event) => filter.type === undefined || event.metadata.type === filter.type)
      .filter((event) => filter.status === undefined || event.metadata.status === filter.status)
      .toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
  }

  getRoots(): readonly ResearchLedgerRoot[] {
    return this.roots.map((root) => ({ ...root }));
  }

  getDiagnostics(): readonly ResearchLedgerDiagnostic[] {
    return this.diagnostics.map((diagnostic) => ({ ...diagnostic }));
  }

  private warn(input: Omit<ResearchLedgerDiagnostic, 'severity'>): void {
    this.diagnostics.push({
      severity: 'warning',
      ...input,
    });
  }
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].toSorted();
}
