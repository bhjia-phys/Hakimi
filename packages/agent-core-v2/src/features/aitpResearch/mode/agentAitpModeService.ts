/**
 * `aitpResearch` domain — `IAgentAitpModeService` implementation.
 *
 * Manages the AITP Research Mode lifecycle through wire dispatches
 * (`aitp_mode.enter` / `.exit` / `.set_phase` / `.set_loop_status` /
 * `.set_line`), checks
 * the experimental flag (`flags`), enforces main-agent-only (`scopeContext`),
 * blocks entry while Plan mode is active (`planService`), activates the
 * Session-scope AITP adapter (`adapter`) on enter, and publishes
 * `agent.status.updated` after each op (`eventBus`). The `aitp_mode.updated`
 * signal is the sole responsibility of each op's `toEvent` — the service does
 * not manually re-publish it. Conversation undo and active-mode cold restore
 * replay silently and never trigger `toEvent`, so the service explicitly
 * publishes `aitp_mode.updated` + `agent.status.updated` once for downstream
 * consumers (e.g. `AgentResearchService`). Inactive cold restore stays silent.
 * Mode state follows
 * conversation undo through the checkpointed `AitpModeModel`. On `exit` and on
 * conversation undo / cold restore that reverts the mode to inactive, the
 * adapter is reset to its zero-I/O state. When entering with a `lineSlug`,
 * the line is created before `aitp_mode.enter` so its first mode event carries
 * a complete line-and-mode snapshot. Bound at Agent scope — contributed into every Agent
 * scope by `AitpResearchFeature`.
 */

import { Service } from '#/_base/di/service';
import { IEventBus } from '#/app/event/eventBus';
import { IFlagService } from '#/app/flag/flag';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentPlanService } from '#/features/plan/plan';
import { IWireService } from '#/wire/wire';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import type { AitpAdapterHealth, AitpModePhase, ResearchLoopStatus } from '#/features/aitpResearch/types';
import { AitpResearchError, AitpResearchErrors } from '#/features/aitpResearch/errors';

import {
  AitpModeModel,
  aitpModeEnter,
  aitpModeExit,
  aitpModeSetPhase,
  aitpModeSetLoopStatus,
  ResearchModel,
  researchCreateLine,
} from '#/features/aitpResearch/aitpResearchOps';
import { type AitpModeEntryOptions, IAgentAitpModeService } from './agentAitpMode';

export class AgentAitpModeService extends Service implements IAgentAitpModeService {
  declare readonly _serviceBrand: undefined;

  private probeGeneration = 0;

  constructor(
    @IWireService private readonly wire: IWireService,
    @IFlagService private readonly flags: IFlagService,
    @IAgentScopeContext private readonly scopeCtx: IAgentScopeContext,
    @IAgentPlanService private readonly planService: IAgentPlanService,
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IEventBus private readonly eventBus: IEventBus,
  ) {
    super();

    this._register(
      this.wire.hooks.onDidRestore.register('aitpMode', async (_ctx, next) => {
        const phaseChanged = await this.reconcileAfterRestore();
        if (this.isActive && !phaseChanged) this.publishModeAndStatus();
        await next();
      }),
    );

    this._register(
      this.eventBus.subscribe('context.undone', () => {
        void this.reconcileAfterRestore().then((phaseChanged) => {
          if (this.isActive && !phaseChanged) this.publishModeAndStatus();
        });
      }),
    );
  }

  get phase(): AitpModePhase {
    return this.wire.getModel(AitpModeModel).current.phase;
  }

  get loopStatus(): ResearchLoopStatus {
    return this.wire.getModel(AitpModeModel).current.loopStatus;
  }

  get revision(): number {
    return this.wire.getModel(AitpModeModel).current.revision;
  }

  get isActive(): boolean {
    return this.phase !== 'inactive';
  }

  get health(): AitpAdapterHealth | null {
    if (!this.isActive) return null;
    return this.adapter.health;
  }

  async enter(options: AitpModeEntryOptions): Promise<void> {
    if (!this.flags.enabled('aitp_research_mode')) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_FLAG_DISABLED,
        'AITP Research Mode is not enabled. Set KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE=true.',
      );
    }
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_NOT_MAIN_AGENT,
        'AITP Research Mode is only available on the main agent.',
      );
    }
    const planStatus = await this.planService.status();
    if (planStatus !== null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_PLAN_CONFLICT,
        'Plan mode is active. Exit Plan mode before entering AITP Research Mode.',
      );
    }
    if (this.isActive) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_ALREADY_ACTIVE,
        'AITP Research Mode is already active.',
      );
    }

    const generation = ++this.probeGeneration;
    if (options.lineSlug !== undefined) {
      this.wire.dispatch(
        researchCreateLine({
          slug: options.lineSlug,
          title: options.lineSlug,
          createdAt: Date.now(),
        }),
      );
    }

    this.wire.dispatch(aitpModeEnter({ actor: options.actor, lineSlug: options.lineSlug }));
    this.publishAgentStatus();

    try {
      const health = await this.adapter.probe();
      if (this.isProbeCurrent(generation)) {
        this.setPhase(health.phase === 'ready' ? 'ready' : 'degraded');
      }
    } catch {
      if (this.isProbeCurrent(generation)) this.setPhase('degraded');
    }
  }

  async exit(): Promise<void> {
    this.probeGeneration += 1;
    if (!this.isActive) {
      this.adapter.reset();
      return;
    }
    this.wire.dispatch(aitpModeExit({}));
    this.adapter.reset();
    this.publishAgentStatus();
  }

  setPhase(phase: AitpModePhase): void {
    this.wire.dispatch(aitpModeSetPhase({ phase }));
    this.publishAgentStatus();
  }

  assertResearchMutationAllowed(options?: { readonly allowPaused?: boolean }): void {
    this.assertFlagAndAgent();
    if (!this.isActive) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_INACTIVE,
        'AITP Research Mode is inactive. Enter the mode before mutating research state.',
      );
    }
    if (this.loopStatus === 'paused' && options?.allowPaused !== true) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LOOP_PAUSED,
        'Research loop is paused. Resume the loop before mutating research state.',
      );
    }
  }

  pauseLoop(expectedRevision: number): void {
    this.assertModeCommandAllowed(expectedRevision);
    this.wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'paused' }));
    this.publishAgentStatus();
  }

  resumeLoop(expectedRevision: number): void {
    this.assertModeCommandAllowed(expectedRevision);
    this.wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'active' }));
    this.publishAgentStatus();
  }

  resetAdapter(): void {
    this.adapter.reset();
  }

  async refreshHealth(): Promise<AitpAdapterHealth> {
    if (!this.isActive) return { phase: 'inactive' };
    return this.adapter.probe();
  }

  private assertFlagAndAgent(): void {
    if (!this.flags.enabled('aitp_research_mode')) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_FLAG_DISABLED,
        'AITP Research Mode is not enabled. Set KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE=true.',
      );
    }
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_NOT_MAIN_AGENT,
        'AITP Research Mode is only available on the main agent.',
      );
    }
  }

  private assertModeCommandAllowed(expectedRevision: number): void {
    this.assertFlagAndAgent();
    const researchRevision = this.wire.getModel(ResearchModel).current.revision;
    if (expectedRevision !== 0 && expectedRevision !== researchRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${expectedRevision}, got ${researchRevision}.`,
      );
    }
    if (!this.isActive) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_INACTIVE,
        'AITP Research Mode is inactive. Enter the mode first.',
      );
    }
  }

  private reconcileAfterRestore(): Promise<boolean> {
    const generation = ++this.probeGeneration;
    if (!this.isActive) {
      this.adapter.reset();
      return Promise.resolve(false);
    }
    return this.adapter.probe().then(
      (health) => {
        if (!this.isProbeCurrent(generation)) return false;
        const nextPhase = health.phase === 'ready' ? 'ready' : 'degraded';
        const changed = this.phase !== nextPhase;
        if (changed) this.setPhase(nextPhase);
        return changed;
      },
      () => {
        if (!this.isProbeCurrent(generation)) return false;
        const changed = this.phase !== 'degraded';
        if (changed) this.setPhase('degraded');
        return changed;
      },
    );
  }

  private isProbeCurrent(generation: number): boolean {
    return generation === this.probeGeneration && this.isActive;
  }

  private publishAgentStatus(): void {
    this.eventBus.publish({ type: 'agent.status.updated' });
  }

  private publishModeAndStatus(): void {
    this.eventBus.publish({ type: 'aitp_mode.updated' });
    this.eventBus.publish({ type: 'agent.status.updated' });
  }
}
