/**
 * `aitpResearch` domain — `IResearchTurnAdmission` contract + implementation.
 *
 * Tracks whether the current main-agent turn is an admitted Research turn: a
 * turn admitted for Research maintenance is one the research loop is actually
 * driving — a Goal-owned continuation lease with the
 * `system_trigger` / `goal_continuation` origin while Research Mode is active
 * and the loop is running. Ordinary user / system / subagent / cron turns are
 * not admitted and abstain from Research behavior (idle→orienting, turn-end
 * AITP maintenance, Research guidance injection). Admission is a transient
 * per-turn lease: acquired at `turn.started`, released at `turn.ended`; it is
 * never persisted, so a cold restore starts with no admitted turn and the next
 * turn recomputes it. Subagent instances stay inert. Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import { createDecorator } from '#/_base/di/instantiation';
import { IEventBus } from '#/app/event/eventBus';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentGoalService } from '#/agent/goal/goal';
import type { PromptOrigin } from '#/agent/contextMemory/types';
import type { TurnEndedEvent, TurnStartedEvent } from '#/agent/loop/turnEvents';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';

export interface IResearchTurnAdmission {
  readonly _serviceBrand: undefined;

  /** Whether the given turn was admitted as a Research turn. */
  isTurnAdmitted(turnId: number): boolean;

  /** Whether the most recent `turn.started` was admitted as a Research turn. */
  isCurrentResearchTurn(): boolean;
}

export const IResearchTurnAdmission =
  createDecorator<IResearchTurnAdmission>('researchTurnAdmission');

const GOAL_CONTINUATION_TRIGGER = 'goal_continuation';

/**
 * Whether a turn origin is an admitted Research turn given the current mode
 * state. Admits only a Goal research continuation while Research Mode is active
 * and the loop is running; active mode alone is not sufficient.
 */
export function isResearchAdmittedOrigin(
  origin: PromptOrigin,
  mode: Pick<IAgentAitpModeService, 'isActive' | 'loopStatus'>,
): boolean {
  if (origin.kind !== 'system_trigger' || origin.name !== GOAL_CONTINUATION_TRIGGER) {
    return false;
  }
  return mode.isActive && mode.loopStatus === 'active';
}

export class ResearchTurnAdmission extends Service implements IResearchTurnAdmission {
  declare readonly _serviceBrand: undefined;

  private admittedTurnId: number | null = null;
  private admitted = false;

  constructor(
    @IEventBus eventBus: IEventBus,
    @IAgentScopeContext scopeCtx: IAgentScopeContext,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentGoalService private readonly goals: IAgentGoalService,
  ) {
    super();
    if (scopeCtx.agentId !== MAIN_AGENT_ID) return;
    this._register(
      eventBus.subscribe('turn.started', (event) => {
        this.onTurnStarted(event);
      }),
    );
    this._register(
      eventBus.subscribe('turn.ended', (event) => {
        this.onTurnEnded(event);
      }),
    );
  }

  isTurnAdmitted(turnId: number): boolean {
    return this.admittedTurnId === turnId && this.admitted;
  }

  isCurrentResearchTurn(): boolean {
    return this.admitted;
  }

  private onTurnStarted(event: TurnStartedEvent): void {
    this.admittedTurnId = event.turnId;
    const triggerAdmitted = isResearchAdmittedOrigin(event.origin, this.mode);
    const goalId = event.origin.kind === 'system_trigger' &&
      event.origin.name === GOAL_CONTINUATION_TRIGGER
      ? event.origin.goalId
      : undefined;
    this.admitted = triggerAdmitted && goalId !== undefined &&
      this.goals.isGoalContinuationTurn(event.turnId, goalId);
  }

  private onTurnEnded(event: TurnEndedEvent): void {
    if (this.admittedTurnId !== event.turnId) return;
    this.admittedTurnId = null;
    this.admitted = false;
  }
}
