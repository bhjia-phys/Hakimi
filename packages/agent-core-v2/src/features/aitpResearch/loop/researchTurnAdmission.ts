/**
 * `aitpResearch` domain — `IResearchTurnAdmission` contract + implementation.
 *
 * Tracks whether the current main-agent turn is an admitted Research turn: a
 * turn admitted for Research maintenance is one the research loop is actually
 * driving — a typed Goal-owned continuation intent while Research Mode is
 * ready and the loop is running. Ordinary user / system / subagent / cron turns are
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
import type { TurnEndedEvent, TurnStartedEvent } from '#/agent/loop/turnEvents';
import type { TurnIntent } from '#/agent/loop/stepRequest';
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

/**
 * Whether a typed Goal continuation is admitted as a Research turn. The
 * origin remains a display/transcript concern; the runtime intent is the
 * authoritative admission signal.
 */
export function isResearchAdmittedIntent(
  intent: TurnIntent | undefined,
  mode: Pick<IAgentAitpModeService, 'isActive' | 'phase' | 'loopStatus'>,
): boolean {
  return intent?.kind === 'goal_continuation' &&
    intent.owner === 'goal' &&
    mode.isActive &&
    mode.phase === 'ready' &&
    mode.loopStatus === 'active';
}

export class ResearchTurnAdmission extends Service implements IResearchTurnAdmission {
  declare readonly _serviceBrand: undefined;

  private admittedTurnId: number | null = null;
  private admitted = false;

  constructor(
    @IEventBus eventBus: IEventBus,
    @IAgentScopeContext scopeCtx: IAgentScopeContext,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
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
    this.admitted = isResearchAdmittedIntent(event.intent, this.mode);
  }

  private onTurnEnded(event: TurnEndedEvent): void {
    if (this.admittedTurnId !== event.turnId) return;
    this.admittedTurnId = null;
    this.admitted = false;
  }
}
