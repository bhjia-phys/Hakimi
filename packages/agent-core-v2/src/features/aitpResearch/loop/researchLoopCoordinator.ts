/**
 * `aitpResearch` domain — `IResearchLoopCoordinator` contract + implementation.
 *
 * The minimal Research Loop lifecycle coordinator. Subscribes to `turn.started`
 * and `turn.ended` on the Agent-scope `IEventBus`. On `turn.started`, when
 * Research Mode is active and the loop is running, if the scientific phase is
 * `idle` it advances to `orienting` — the sole state mutation; the coordinator
 * never enqueues a continuation (Goal owns that). The current turn's semantic
 * revision and action id are recorded in plain fields (never written to the
 * wire model) for dedup and state judgment. On `turn.ended`, no automatic
 * result judgment, action completion, or AITP write occurs; preserved state is
 * surfaced by the next `AitpResearchInjection` cycle. Only the main agent's
 * coordinator subscribes; subagent instances are inert. Subscribes exactly
 * once at construction — mode enter/exit, pause/resume, and wire restore do
 * not re-register. Bound at Agent scope — contributed into every Agent scope
 * by `AitpResearchFeature`.
 */

import { Service } from '#/_base/di/service';
import { createDecorator } from '#/_base/di/instantiation';
import { IEventBus } from '#/app/event/eventBus';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import type { TurnEndedEvent, TurnStartedEvent } from '#/agent/loop/turnEvents';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
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
  ) {
    super();
    if (scopeCtx.agentId !== MAIN_AGENT_ID) return;
    this._register(
      eventBus.subscribe('turn.started', (e) => this.onTurnStarted(e)),
    );
    this._register(
      eventBus.subscribe('turn.ended', (e) => this.onTurnEnded(e)),
    );
  }

  private onTurnStarted(event: TurnStartedEvent): void {
    if (this.lastTurnId === event.turnId) return;
    this.lastTurnId = event.turnId;

    if (!this.mode.isActive || this.mode.loopStatus !== 'active') {
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
      // Phase may have changed between snapshot and setPhase, or the mode
      // may have transitioned; the injection cycle will surface the current
      // state. Minimal safe implementation — no further action.
    }
  }

  private onTurnEnded(_event: TurnEndedEvent): void {
    // Minimal safe implementation: do not auto-judge results, auto-complete
    // actions, or auto-write AITP. If the current action is still in_progress
    // or the phase is action_executing/evaluating, state is preserved and the
    // next AitpResearchInjection cycle surfaces the pending action/phase/gate
    // to the main agent. No deterministic stale/blocked alert is produced —
    // there is no runtime alert-adding op in the existing wire vocabulary.
    // turnStartRevision / turnStartActionId remain available for state
    // judgment but no mutation is performed here.
  }
}
