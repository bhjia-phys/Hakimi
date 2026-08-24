/**
 * `skillVisibility` domain — `IAgentSkillVisibilityService` implementation.
 *
 * The fold over the `SkillVisibilityContribution` collection: for each
 * registered filter, a skill is visible only if every filter's `isVisible`
 * returns `true`. The first filter that rejects a skill provides the hidden
 * reason. Each filter receives a `ServicesAccessor` resolved through
 * `IInstantiationService.invokeFunction`, so filters can read runtime state
 * without the core skill domain importing any feature. Bound at Agent scope.
 */

import { type CollectionView } from '#/_base/di/collection';
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

  constructor(
    @SkillVisibilityContribution private readonly filters: CollectionView<SkillVisibilityFilter>,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super();
  }

  isSkillVisible(skill: SkillDefinition): boolean {
    return this.instantiationService.invokeFunction((accessor) => {
      for (const filter of this.filters.items) {
        if (!filter.isVisible(skill, accessor)) return false;
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
