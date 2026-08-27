/**
 * `aitpResearch` domain — `IResearchLoopCoordinator` contract + implementation.
 *
 * Drives deterministic turn-boundary maintenance for the main agent through
 * `IEventBus`, `IAgentAitpModeService`, `IAgentResearchService`, and the
 * Session-scope AITP lifecycle coordinator. It advances an admitted idle active
 * loop to orienting at turn start and refreshes the read-only AITP current-state
 * projection after admitted turns that changed research state. Admission is
 * required: only a Goal-owned continuation lease with the
 * `system_trigger` / `goal_continuation` origin while Research Mode is active
 * and the loop is running proceeds; ordinary user / system / subagent / cron
 * turns abstain. It never judges results, completes actions, writes AITP
 * records, or enqueues continuations; Goal owns continuation. Subagent
 * instances remain inert. Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import { createDecorator } from '#/_base/di/instantiation';
import { IEventBus } from '#/app/event/eventBus';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import type { TurnEndedEvent, TurnStartedEvent } from '#/agent/loop/turnEvents';
import { ISessionAitpLifecycleCoordinator } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinator';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
import { IResearchTurnAdmission } from '#/features/aitpResearch/loop/researchTurnAdmission';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';

export interface IResearchLoopCoordinator {
  readonly _serviceBrand: undefined;
}

export const IResearchLoopCoordinator =
  createDecorator<IResearchLoopCoordinator>('researchLoopCoordinator');

export class ResearchLoopCoordinator extends Service implements IResearchLoopCoordinator {
  declare readonly _serviceBrand: undefined;

  private lastTurnId: number | null = null;
  private turnStartRevision: number | null = null;
  private turnStartActionId: string | null = null;

  constructor(
    @IEventBus eventBus: IEventBus,
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentScopeContext scopeCtx: IAgentScopeContext,
    @IResearchTurnAdmission private readonly admission: IResearchTurnAdmission,
    @ISessionAitpLifecycleCoordinator private readonly maintenance?: ISessionAitpLifecycleCoordinator,
  ) {
    super();
    if (scopeCtx.agentId !== MAIN_AGENT_ID) return;
    this._register(
      eventBus.subscribe('turn.started', (e) => {
        this.onTurnStarted(e);
      }),
    );
    this._register(
      eventBus.subscribe('turn.ended', (e) => {
        this.onTurnEnded(e);
      }),
    );
  }

  private onTurnStarted(event: TurnStartedEvent): void {
    if (this.lastTurnId === event.turnId) return;
    this.lastTurnId = event.turnId;

    if (!this.admission.isTurnAdmitted(event.turnId)) {
      this.turnStartRevision = null;
      this.turnStartActionId = null;
      return;
    }

    const snapshot = this.research.getSnapshot();
    this.turnStartRevision = snapshot.revision;
    this.turnStartActionId = snapshot.currentAction?.actionId ?? null;

    if (snapshot.phase !== 'idle') return;

    try {
      this.research.setPhase('orienting', 'turn.started auto-advance');
    } catch {
      return;
    }
  }

  private onTurnEnded(event: TurnEndedEvent): void {
    if (this.lastTurnId !== event.turnId) return;
    if (!this.mode.isActive || this.mode.loopStatus !== 'active') return;
    if (this.maintenance === undefined || this.turnStartRevision === null) return;

    const snapshot = this.research.getSnapshot();
    const researchChanged = snapshot.revision !== this.turnStartRevision ||
      (snapshot.currentAction?.actionId ?? null) !== this.turnStartActionId;
    this.turnStartRevision = null;
    this.turnStartActionId = null;
    if (!researchChanged) return;

    void this.maintenance.refresh({
      workstream: snapshot.currentLineSlug,
      force: true,
    }).catch(() => undefined);
  }
}
