/**
 * `aitpResearch` domain — `IResearchTurnAdmission` contract + implementation.
 *
 * Tracks the current main-agent Research turn lease. A typed user intent gets
 * an `interactive_research` lease; a typed Goal-owned continuation intent gets
 * an `autonomous_research` lease. User-directed provisional exploration also
 * runs with degraded AITP; autonomous admission still requires ready mode.
 * Both require active Research Mode and a running loop. The autonomous intent
 * is a post-guard capability produced only by the Goal continuation engine
 * after its participants allow enqueue;
 * admission never creates or schedules a continuation. System / subagent /
 * cron / unclassified turns abstain. The lease is transient: a live typed user
 * turn can acquire it after mode entry settles without another prompt. Mode
 * changes revoke an autonomous lease but never mint or revive one; only a new
 * guarded Goal turn can do that. Leases are released at `turn.ended` and never
 * persisted. A cold restore starts with no lease and recomputes it at the next
 * turn. Subagent instances
 * stay inert. Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import { createDecorator } from '#/_base/di/instantiation';
import { IEventBus } from '#/app/event/eventBus';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import type { TurnEndedEvent, TurnStartedEvent } from '#/agent/loop/turnEvents';
import type { TurnIntent } from '#/agent/loop/stepRequest';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';

export type ResearchTurnLease =
  | 'none'
  | 'interactive_research'
  | 'autonomous_research';

export interface IResearchTurnAdmission {
  readonly _serviceBrand: undefined;

  /** The transient Research lease associated with the given turn. */
  leaseForTurn(turnId: number): ResearchTurnLease;

  /** The transient Research lease for the most recent live turn. */
  currentLease(): ResearchTurnLease;

  /** Whether the given turn was admitted as a Research turn. */
  isTurnAdmitted(turnId: number): boolean;

  /** Whether the most recent `turn.started` was admitted as a Research turn. */
  isCurrentResearchTurn(): boolean;
}

export const IResearchTurnAdmission =
  createDecorator<IResearchTurnAdmission>('researchTurnAdmission');

/**
 * Resolve the lease represented by a typed runtime intent. The origin remains
 * a display/transcript concern; prompt ingress classifies a true user prompt,
 * while the Goal engine mints its autonomous intent only after continuation
 * participants allow enqueue.
 */
export function resolveResearchTurnLease(
  intent: TurnIntent | undefined,
  mode: Pick<IAgentAitpModeService, 'isActive' | 'phase' | 'loopStatus'>,
): ResearchTurnLease {
  if (!mode.isActive || mode.loopStatus !== 'active') {
    return 'none';
  }
  if (intent?.kind === 'user' && (mode.phase === 'ready' || mode.phase === 'degraded')) {
    return 'interactive_research';
  }
  if (mode.phase !== 'ready') return 'none';
  if (intent?.kind === 'goal_continuation' && intent.owner === 'goal') {
    return 'autonomous_research';
  }
  return 'none';
}

export class ResearchTurnAdmission extends Service implements IResearchTurnAdmission {
  declare readonly _serviceBrand: undefined;

  private admittedTurnId: number | null = null;
  private lease: ResearchTurnLease = 'none';
  private userTurn = false;

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
    this._register(eventBus.subscribe('aitp_mode.updated', () => {
      if (this.admittedTurnId === null) return;
      if (this.userTurn) {
        this.lease = resolveResearchTurnLease({ kind: 'user' }, this.mode);
      } else if (!this.mode.isActive || this.mode.phase !== 'ready' || this.mode.loopStatus !== 'active') {
        this.lease = 'none';
      }
    }));
  }

  leaseForTurn(turnId: number): ResearchTurnLease {
    return this.admittedTurnId === turnId ? this.lease : 'none';
  }

  currentLease(): ResearchTurnLease {
    return this.lease;
  }

  isTurnAdmitted(turnId: number): boolean {
    return this.leaseForTurn(turnId) !== 'none';
  }

  isCurrentResearchTurn(): boolean {
    return this.lease !== 'none';
  }

  private onTurnStarted(event: TurnStartedEvent): void {
    this.admittedTurnId = event.turnId;
    this.userTurn = event.intent?.kind === 'user';
    this.lease = resolveResearchTurnLease(event.intent, this.mode);
  }

  private onTurnEnded(event: TurnEndedEvent): void {
    if (this.admittedTurnId !== event.turnId) return;
    this.admittedTurnId = null;
    this.lease = 'none';
    this.userTurn = false;
  }
}
