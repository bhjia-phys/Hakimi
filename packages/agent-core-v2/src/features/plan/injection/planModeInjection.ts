/**
 * `plan` domain — plan-mode context injection.
 *
 * Owns the `plan_mode` context-injection provider: while plan mode is active it
 * emits full / re-entry reminders only when the disclosed mode/path changes,
 * and on the first inject after deactivation it emits the exit reminder. It reads
 * the live plan state through `IAgentPlanService.status()` and the recent history
 * through the injector disclosure, so lost context receives a fresh reminder.
 * The plain-data state (`wasActive`) is registered into `agentState`
 * (`IAgentStateService`) and read/written through it.
 */

import { Service } from '#/_base/di/service';
import { defineState } from '#/_base/state/stateRegistry';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import { IAgentPlanService } from '#/features/plan/plan';
import type { PlanFilePath } from '#/features/plan/plan';
import { IAgentStateService } from '#/agent/state/agentState';
import PLAN_MODE_EXIT_REMINDER from './plan-mode-exit-reminder.md?raw';
import PLAN_MODE_FULL_REMINDER from './plan-mode-full-reminder.md?raw';
import PLAN_MODE_INLINE_FULL_REMINDER from './plan-mode-inline-full-reminder.md?raw';
import PLAN_MODE_INLINE_REENTRY_REMINDER from './plan-mode-inline-reentry-reminder.md?raw';
import PLAN_MODE_REENTRY_REMINDER from './plan-mode-reentry-reminder.md?raw';
const PLAN_MODE_INJECTION_VARIANT = 'plan_mode';

export const planWasActiveKey = defineState<boolean>('plan.wasActive', () => false);

export class PlanModeInjection extends Service {
  constructor(
    @IAgentContextInjectorService injector: IAgentContextInjectorService,
    @IAgentPlanService private readonly plan: IAgentPlanService,
    // Retain the existing composition signature; disclosure owns dedup history.
    @IAgentContextMemoryService _context: IAgentContextMemoryService,
    @IAgentStateService private readonly states: IAgentStateService,
  ) {
    super();
    this.states.register(planWasActiveKey);

    this._register(
      injector.register<{ active: boolean; path: PlanFilePath }>(PLAN_MODE_INJECTION_VARIANT, async ({ lastDisclosure }) => {
        const data = await this.plan.status();
        if (data === null) {
          if (!this.states.get(planWasActiveKey)) return undefined;
          this.states.set(planWasActiveKey, false);
          return { content: PLAN_MODE_EXIT_REMINDER, disclosure: { active: false, path: null } };
        }
        const planFilePath = data.path;
        if (!this.states.get(planWasActiveKey)) {
          this.states.set(planWasActiveKey, true);
          return {
            content: data.content.trim().length > 0 ? reentryReminder(planFilePath) : fullReminder(planFilePath),
            disclosure: { active: true, path: planFilePath },
          };
        }
        if (lastDisclosure?.active !== true || lastDisclosure.path !== planFilePath) {
          return {
            content: fullReminder(planFilePath),
            disclosure: { active: true, path: planFilePath },
          };
        }
        return undefined;
      }),
    );
  }
}

function withPlanFileFooter(body: string, planFilePath: PlanFilePath): string {
  if (planFilePath === null || planFilePath.length === 0) return body;
  return `${body}\n\nPlan file: ${planFilePath}`;
}

function fullReminder(planFilePath: PlanFilePath): string {
  if (planFilePath === null || planFilePath.length === 0) {
    return PLAN_MODE_INLINE_FULL_REMINDER;
  }
  return withPlanFileFooter(PLAN_MODE_FULL_REMINDER, planFilePath);
}

function reentryReminder(planFilePath: PlanFilePath): string {
  if (planFilePath === null || planFilePath.length === 0) {
    return PLAN_MODE_INLINE_REENTRY_REMINDER;
  }
  return withPlanFileFooter(PLAN_MODE_REENTRY_REMINDER, planFilePath);
}
