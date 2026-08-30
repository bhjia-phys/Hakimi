/**
 * `skillVisibility` domain — `IAgentSkillVisibilityService` implementation.
 *
 * The fold over the `SkillVisibilityContribution` collection: for each
 * registered filter, a skill is visible only if every filter's `isVisible`
 * returns `true`. Frozen profile listings use an optional
 * `isVisibleInFrozenListing` callback and fall back to `isVisible`. The first
 * filter that rejects a skill provides the hidden reason. Each filter receives
 * a `ServicesAccessor` resolved through `IInstantiationService.invokeFunction`,
 * so filters can read runtime state without the core skill domain importing any
 * feature. The service forwards filter and contribution changes through
 * `onDidChange`. Bound at Agent scope.
 */

import { type CollectionView } from '#/_base/di/collection';
import { DisposableStore } from '#/_base/di/lifecycle';
import { Emitter, type Event } from '#/_base/event';
import { Service } from '#/_base/di/service';
import { IInstantiationService } from '#/_base/di/instantiation';
import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import type { SkillDefinition } from '#/app/skillCatalog/types';

import {
  IAgentSkillVisibilityService,
  SkillVisibilityContribution,
  type SkillVisibilityFilter,
} from './skillVisibility';

export class AgentSkillVisibilityService extends Service implements IAgentSkillVisibilityService {
  declare readonly _serviceBrand: undefined;

  private readonly onDidChangeEmitter = this._register(new Emitter<void>());
  private filterEventsBound = false;
  readonly onDidChange: Event<void> = (listener, thisArg, disposables) => {
    this.filterEventsBound = true;
    this.bindFilterEvents();
    return this.onDidChangeEmitter.event(listener, thisArg, disposables);
  };
  private readonly filterEventDisposables = this._register(new DisposableStore());

  constructor(
    @SkillVisibilityContribution private readonly filters: CollectionView<SkillVisibilityFilter>,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super();
    this._register(
      this.filters.onDidChange(() => {
        if (this.filterEventsBound) this.bindFilterEvents();
        this.onDidChangeEmitter.fire();
      }),
    );
  }

  private bindFilterEvents(): void {
    this.filterEventDisposables.clear();
    for (const filter of this.filters.items) {
      if (filter.onDidChange === undefined) continue;
      const event = this.instantiationService.invokeFunction(filter.onDidChange);
      this.filterEventDisposables.add(event(() => {
        this.onDidChangeEmitter.fire();
      }));
    }
  }

  isSkillVisible(skill: SkillDefinition): boolean {
    return this.instantiationService.invokeFunction((accessor) => {
      for (const filter of this.filters.items) {
        if (!filter.isVisible(skill, accessor)) return false;
      }
      return true;
    });
  }

  isSkillVisibleInFrozenListing(skill: SkillDefinition): boolean {
    return this.instantiationService.invokeFunction((accessor) => {
      for (const filter of this.filters.items) {
        const isVisible = filter.isVisibleInFrozenListing ?? filter.isVisible;
        if (!isVisible(skill, accessor)) return false;
      }
      return true;
    });
  }

  hiddenReason(skill: SkillDefinition): string | undefined {
    return this.instantiationService.invokeFunction((accessor) => {
      for (const filter of this.filters.items) {
        const reason = filter.describeHidden(skill, accessor);
        if (reason !== undefined) return reason;
      }
      return undefined;
    });
  }

  filterVisible(skills: readonly SkillDefinition[]): readonly SkillDefinition[] {
    return this.instantiationService.invokeFunction((accessor) => {
      const visible: SkillDefinition[] = [];
      for (const skill of skills) {
        let isVisible = true;
        for (const filter of this.filters.items) {
          if (!filter.isVisible(skill, accessor)) {
            isVisible = false;
            break;
          }
        }
        if (isVisible) visible.push(skill);
      }
      return visible;
    });
  }
}

registerScopedService(
  LifecycleScope.Agent,
  IAgentSkillVisibilityService,
  AgentSkillVisibilityService,
  ScopeActivation.OnScopeCreated,
  'skillVisibility',
);
