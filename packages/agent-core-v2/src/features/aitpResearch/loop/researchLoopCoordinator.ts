/**
 * `aitpResearch` domain — `IResearchLoopCoordinator` contract + implementation.
 *
 * Drives deterministic turn-boundary maintenance for the main agent through
 * `IEventBus`, `IAgentAitpModeService`, `IAgentResearchService`, and the
 * Session-scope AITP lifecycle coordinator. It advances an admitted idle active
 * loop to orienting at turn start, notes the admitted turn boundary on the
 * research period (one `loopCount` increment per interactive or autonomous
 * Research turn), and refreshes the read-only AITP current-state
 * projection after admitted turns that changed research state. Typed main-agent
 * user turns carry an interactive lease; entry during a live user turn performs
 * the same local boundary once when admission becomes available, before the next
 * ordinary context-injection step. Post-guard Goal continuations carry an
 * autonomous lease. System / subagent / cron / unclassified turns abstain. It
 * never judges results, completes actions, writes AITP records, or enqueues
 * continuations; the Goal engine remains the sole continuation owner. Subagent
 * instances remain inert. Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import { createDecorator } from '#/_base/di/instantiation';
import { IEventBus } from '#/app/event/eventBus';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import type { TurnEndedEvent, TurnStartedEvent } from '#/agent/loop/turnEvents';
import { ISessionAitpLifecycleCoordinator } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinator';
import { AitpResearchError, AitpResearchErrors } from '#/features/aitpResearch/errors';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
import { IResearchTurnAdmission } from '#/features/aitpResearch/loop/researchTurnAdmission';
import {
  isMaintenanceReceiptAligned,
  sameLineWorkstreamBinding,
} from '#/features/aitpResearch/research/workstreamBinding';
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
  private boundaryNoted = false;

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
    this._register(eventBus.subscribe('aitp_mode.updated', () => {
      this.noteAdmittedBoundary();
    }));
  }

  private onTurnStarted(event: TurnStartedEvent): void {
    if (this.lastTurnId === event.turnId) return;
    this.lastTurnId = event.turnId;
    this.boundaryNoted = false;
    this.turnStartRevision = null;
    this.turnStartActionId = null;
    this.noteAdmittedBoundary();
  }

  private noteAdmittedBoundary(): void {
    if (this.lastTurnId === null || this.boundaryNoted || !this.admission.isTurnAdmitted(this.lastTurnId)) return;
    this.boundaryNoted = true;
    this.research.noteLoopBoundary();

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
    this.lastTurnId = null;
    if (!this.mode.isActive || this.mode.loopStatus !== 'active') return;
    if (this.maintenance === undefined || this.turnStartRevision === null) return;

    const snapshot = this.research.getSnapshot();
    const researchChanged = snapshot.revision !== this.turnStartRevision ||
      (snapshot.currentAction?.actionId ?? null) !== this.turnStartActionId;
    this.turnStartRevision = null;
    this.turnStartActionId = null;
    if (!researchChanged) return;
    if (snapshot.currentLineSlug === undefined) return;
    void this.refreshTurnEndMaintenance(snapshot.currentLineSlug);
  }

  private async refreshTurnEndMaintenance(lineSlug: string): Promise<void> {
    const maintenance = this.maintenance;
    if (maintenance === undefined) return;
    try {
      const binding = await this.mode.reconcileCurrentTopicBinding(lineSlug);
      if (binding === undefined || !this.mode.isActive) return;
      const snapshot = this.research.getSnapshot();
      if (
        snapshot.currentLineSlug !== binding.lineSlug ||
        snapshot.currentWorkstreamBinding?.status !== 'bound' ||
        snapshot.currentWorkstreamBinding.binding?.workstream !== binding.workstream ||
        snapshot.currentWorkstreamBinding.binding.topicId !== binding.topicId ||
        snapshot.currentWorkstreamBinding.binding.observedRevision !== binding.observedRevision
      ) return;
      const receipt = await maintenance.refresh({
        workstream: binding.workstream,
        force: true,
      });
      if (receipt.degradedReason === 'stale_generation') return;
      const after = this.research.getSnapshot();
      const currentBinding = after.currentWorkstreamBinding?.status === 'bound'
        ? after.currentWorkstreamBinding.binding
        : undefined;
      if (
        !this.mode.isActive ||
        after.currentLineSlug !== binding.lineSlug ||
        currentBinding === undefined ||
        !sameLineWorkstreamBinding(currentBinding, binding) ||
        after.program === undefined ||
        !isMaintenanceReceiptAligned({
          receipt,
          binding: currentBinding,
          program: after.program,
        })
      ) {
        maintenance.reset();
        if (
          this.mode.isActive &&
          this.research.getSnapshot().currentLineSlug === lineSlug
        ) this.mode.setPhase('degraded');
        return;
      }
      if (this.mode.phase !== receipt.status) this.mode.setPhase(receipt.status);
    } catch (error) {
      if (
        error instanceof AitpResearchError &&
        error.code === AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED
      ) return;
      if (
        this.mode.isActive &&
        this.research.getSnapshot().currentLineSlug === lineSlug
      ) this.mode.setPhase('degraded');
    }
  }
}
