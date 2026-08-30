/**
 * `skillVisibility` domain — Agent-scope skill visibility contribution seam.
 *
 * A generic `collection` token that lets features contribute filters
 * controlling which skills are visible to the model and the user. The
 * `IAgentSkillVisibilityService` fold applies every registered filter in
 * registration order: a skill is visible only if every filter returns
 * `true`. Filters receive a `ServicesAccessor` so they can read runtime
 * state (e.g. whether a mode is active) without the core skill domain
 * importing any feature; a filter may also expose a live change event through
 * that accessor. Frozen profile listings may use a separate filter callback
 * so a feature can keep dynamic-only skills out of the initial prompt. The
 * core skill domain (`skillCatalog`, `SkillTool`, `IAgentSkillService`)
 * queries this service; it never imports any feature. Bound at Agent scope.
 */

import { createDecorator, type ServicesAccessor } from '#/_base/di/instantiation';
import { collection, type CollectionToken } from '#/_base/di/collection';
import type { Event } from '#/_base/event';
import type { SkillDefinition } from '#/app/skillCatalog/types';

export interface SkillVisibilityFilter {
  readonly id: string;
  readonly isVisible: (skill: SkillDefinition, accessor: ServicesAccessor) => boolean;
  readonly isVisibleInFrozenListing?: (skill: SkillDefinition, accessor: ServicesAccessor) => boolean;
  readonly describeHidden: (skill: SkillDefinition, accessor: ServicesAccessor) => string | undefined;
  readonly onDidChange?: (accessor: ServicesAccessor) => Event<void>;
}

export const SkillVisibilityContribution: CollectionToken<SkillVisibilityFilter> =
  collection<SkillVisibilityFilter>('skillVisibility');

export interface IAgentSkillVisibilityService {
  readonly _serviceBrand: undefined;
  readonly onDidChange: Event<void>;

  isSkillVisible(skill: SkillDefinition): boolean;
  isSkillVisibleInFrozenListing(skill: SkillDefinition): boolean;
  hiddenReason(skill: SkillDefinition): string | undefined;
  filterVisible(skills: readonly SkillDefinition[]): readonly SkillDefinition[];
}

export const IAgentSkillVisibilityService =
  createDecorator<IAgentSkillVisibilityService>('agentSkillVisibilityService');
