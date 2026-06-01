import type {
  ResearchActionCategory,
  ResearchActionDefinition,
  ResearchActionExposure,
} from './types';
import type { PhysicsCapsuleKind, PhysicsDomainId } from '../physics-memory';

export interface ResearchActionFilter {
  readonly category?: ResearchActionCategory;
  readonly exposure?: ResearchActionExposure;
  readonly domain?: PhysicsDomainId;
  readonly capsuleKind?: PhysicsCapsuleKind;
}

export class ResearchActionNotFoundError extends Error {
  readonly actionId: string;

  constructor(actionId: string) {
    super(`Research action "${actionId}" is not registered`);
    this.name = 'ResearchActionNotFoundError';
    this.actionId = actionId;
  }
}

export class ResearchActionRegistry {
  private readonly byId = new Map<string, ResearchActionDefinition>();

  register(
    action: ResearchActionDefinition,
    options: { readonly replace?: boolean } = {},
  ): void {
    if (options.replace === true || !this.byId.has(action.id)) {
      this.byId.set(action.id, action);
    }
  }

  getAction(id: string): ResearchActionDefinition | undefined {
    return this.byId.get(id);
  }

  requireAction(id: string): ResearchActionDefinition {
    const action = this.getAction(id);
    if (action === undefined) throw new ResearchActionNotFoundError(id);
    return action;
  }

  listActions(filter: ResearchActionFilter = {}): readonly ResearchActionDefinition[] {
    return [...this.byId.values()]
      .filter((action) => filter.category === undefined || action.category === filter.category)
      .filter((action) => filter.exposure === undefined || action.exposure === filter.exposure)
      .filter((action) => domainMatches(action, filter.domain))
      .filter((action) => capsuleKindMatches(action, filter.capsuleKind))
      .toSorted((a, b) => a.id.localeCompare(b.id));
  }

  listModelVisibleActions(): readonly ResearchActionDefinition[] {
    return this.listActions().filter(
      (action) => action.exposure === 'direct' || action.exposure === 'direct-model-only',
    );
  }
}

function domainMatches(action: ResearchActionDefinition, domain?: PhysicsDomainId): boolean {
  if (domain === undefined || action.domains === undefined) return true;
  return action.domains.includes(domain);
}

function capsuleKindMatches(
  action: ResearchActionDefinition,
  capsuleKind?: PhysicsCapsuleKind,
): boolean {
  if (capsuleKind === undefined || action.capsuleKinds === undefined) return true;
  return action.capsuleKinds.includes(capsuleKind);
}
