/**
 * `aitpResearch` domain — `IAgentAitpModeService` implementation.
 *
 * Manages the AITP Research Mode lifecycle through wire dispatches
 * (`aitp_mode.enter` / `.exit` / `.set_phase` / `.set_loop_status` /
 * `.set_line`), enforces main-agent-only (`scopeContext`),
 * activates the Session-scope AITP adapter (`adapter`) on enter, runs
 * read-only current-state maintenance after a ready probe, and publishes
 * `agent.status.updated` after each op (`eventBus`). The `aitp_mode.updated`
 * signal is the sole responsibility of each op's `toEvent` — the service does
 * not manually re-publish it. Conversation undo and active-mode cold restore
 * replay silently and never trigger `toEvent`, so the service explicitly
 * publishes `aitp_mode.updated` + `agent.status.updated` once for downstream
 * consumers (e.g. `AgentResearchService`). Its `onDidChange` event is limited
 * to active/inactive visibility transitions. Inactive cold restore stays silent.
 * After a ready probe, one global `enter` observes only the Topic fields needed
 * by Hakimi's local Program. It never runs a global `check` or adopts global
 * entries/handoff. Current-state maintenance runs only through an explicitly
 * confirmed Line-to-workstream binding; unbound or stale Lines keep the mode
 * ready for low-risk local exploration and perform zero scoped maintenance.
 * Research Mode is a long-lived scientific context and may be active
 * alongside an active Plan overlay; it never exits or resets because Plan
 * mode is active. Legacy sessions with an older persisted active-tool
 * allowlist are repaired on entry and active restore by adding the current
 * Research tools to the profile overlay. Mode state follows
 * conversation undo through the checkpointed `AitpModeModel`. On `exit` and on
 * conversation undo / cold restore that reverts the mode to inactive, the
 * adapter is reset to its zero-I/O state. When entering with a `lineSlug`,
 * the line is created before `aitp_mode.enter` so its first mode event carries
 * a complete line-and-mode snapshot. Bound at Agent scope — contributed into every Agent
 * scope by `AitpResearchFeature`. Only the main agent installs lifecycle
 * subscriptions: a child's restore must not reset the shared Session adapter.
 */

import { Service } from '#/_base/di/service';
import { Emitter } from '#/_base/event';
import { IEventBus } from '#/app/event/eventBus';
import { IAgentProfileService } from '#/agent/profile/profile';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IWireService } from '#/wire/wire';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import { ISessionAitpLifecycleCoordinator } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinator';
import type {
  AitpAdapterHealth,
  AitpMaintenanceDegradedReason,
  AitpModePhase,
  ResearchLineWorkstreamBinding,
  ResearchLoopStatus,
} from '#/features/aitpResearch/types';
import { AitpResearchError, AitpResearchErrors } from '#/features/aitpResearch/errors';

import {
  AitpModeModel,
  aitpModeEnter,
  aitpModeExit,
  aitpModeSetPhase,
  aitpModeSetLoopStatus,
  ResearchModel,
  ResearchRevisionModel,
  researchCreateLine,
  researchSetProgram,
} from '#/features/aitpResearch/aitpResearchOps';
import {
  isMaintenanceReceiptAligned,
  sameLineWorkstreamBinding,
} from '#/features/aitpResearch/research/workstreamBinding';
import { type AitpModeEntryOptions, IAgentAitpModeService } from './agentAitpMode';

const RESEARCH_MODE_TOOL_NAMES = [
  'ExitAITPMode',
  'GetResearchStatus',
  'PrepareResearchPlanV2',
  'ActivateResearchPlanV2',
  'CompleteResearchPlanV2',
  'DiscardResearchPlanV2',
  'AcknowledgeResearchAlert',
  'CreateResearchLine',
  'UpdateResearchLine',
  'ConfirmResearchWorkstreamBinding',
  'ClearResearchWorkstreamBinding',
  'CreateResearchQuestion',
  'UpdateResearchQuestion',
  'SetResearchFocus',
  'ProposeResearchCheckpoint',
  'CommitResearchCheckpoint',
  'DiscardHistoricalResearchCheckpoint',
  'BeginResearchAction',
  'StartResearchAction',
  'ConcludeResearchAction',
  'RecordResearchProgress',
  'ReviewResearchEvidence',
  'ObserveResearchRun',
  'ReadResearchCheckpointEvidence',
  'RequestResearchDecision',
  'ResolveResearchDecision',
  'aitp_enter',
  'aitp_list',
  'aitp_show',
  'aitp_check',
  'aitp_record_prepare',
  'aitp_record_save',
  'aitp_note_prepare',
  'aitp_note_save',
] as const;

export class AgentAitpModeService extends Service implements IAgentAitpModeService {
  declare readonly _serviceBrand: undefined;

  private readonly onDidChangeEmitter = this._register(new Emitter<void>());
  readonly onDidChange = this.onDidChangeEmitter.event;
  private lastVisibilityActive = false;
  private probeGeneration = 0;
  private topicReconcileGeneration = 0;
  private maintenanceReason: AitpMaintenanceDegradedReason | undefined;
  private lastModeLineSlug: string | undefined;

  constructor(
    @IWireService private readonly wire: IWireService,
    @IAgentScopeContext private readonly scopeCtx: IAgentScopeContext,
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IEventBus private readonly eventBus: IEventBus,
    @IAgentProfileService private readonly profile: IAgentProfileService,
    @ISessionAitpLifecycleCoordinator private readonly coordinator?: ISessionAitpLifecycleCoordinator,
  ) {
    super();
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) return;
    this.lastVisibilityActive = this.isActive;
    this.lastModeLineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;

    this._register(
      this.wire.hooks.onDidRestore.register('aitpMode', async (_ctx, next) => {
        const phaseChanged = await this.reconcileAfterRestore();
        this.publishVisibilityChangeIfNeeded();
        if (this.isActive && !phaseChanged) this.publishModeAndStatus();
        await next();
      }),
    );

    this._register(
      this.eventBus.subscribe('context.undone', () => {
        // An ordinary undo in a session that is already outside Research
        // Mode has no AITP lifecycle to restore. The Research service still
        // publishes its single global undo revision fence; avoid manufacturing
        // a second mode/status update (and a Goal retry) here.
        if (!this.isActive && !this.lastVisibilityActive) return;
        void this.reconcileAfterRestore({ undoBoundary: true }).then((phaseChanged) => {
          this.publishVisibilityChangeIfNeeded();
          if (!phaseChanged) this.publishModeAndStatus();
        });
      }),
    );

    this._register(
      this.eventBus.subscribe('aitp_mode.updated', () => {
        if (!this.isActive) {
          this.lastModeLineSlug = undefined;
          return;
        }
        const lineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
        if (lineSlug === this.lastModeLineSlug) return;
        this.lastModeLineSlug = lineSlug;
        this.ensureCurrentScopeRefresh(lineSlug);
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

  /** Why the last maintenance refresh was degraded, when one is known. */
  get maintenanceDegradedReason(): AitpMaintenanceDegradedReason | undefined {
    if (this.currentConfirmedWorkstream() === undefined) return undefined;
    return this.coordinator?.snapshot()?.degradedReason ?? this.maintenanceReason;
  }

  async enter(options: AitpModeEntryOptions): Promise<void> {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_NOT_MAIN_AGENT,
        'AITP Research Mode is only available on the main agent.',
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

    this.ensureResearchTools();
    this.wire.dispatch(aitpModeEnter({ actor: options.actor, lineSlug: options.lineSlug }));
    this.publishVisibilityChangeIfNeeded();
    this.publishAgentStatus();

    let lineSlug: string | undefined;
    let reconciliationStarted = false;
    let reconcileGeneration = this.topicReconcileGeneration;
    try {
      const health = await this.adapter.probe();
      if (!this.isProbeCurrent(generation)) return;
      if (health.phase !== 'ready') {
        this.setPhase('degraded');
        return;
      }
      // A Line can change while the mode-level adapter probe is pending. Read
      // it only after the probe succeeds; pre-ready Line signals cannot start
      // their own adapter reconciliation yet.
      lineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
      reconciliationStarted = true;
      const reconciliation = this.reconcileCurrentTopicBinding(lineSlug);
      reconcileGeneration = this.topicReconcileGeneration;
      const binding = await reconciliation;
      if (!this.isTopicReconcileCurrent(
        generation,
        reconcileGeneration,
        lineSlug,
      )) return;
      const maintenanceStatus = binding === undefined
        ? this.clearMaintenanceScope()
        : await this.refreshMaintenance(binding);
      if (
        maintenanceStatus !== undefined &&
        this.isTopicReconcileCurrent(generation, reconcileGeneration, lineSlug)
      ) {
        this.setPhase(maintenanceStatus);
      }
    } catch {
      if (!this.isProbeCurrent(generation)) return;
      if (this.topicReconcileGeneration !== reconcileGeneration) return;
      if (
        reconciliationStarted &&
        !this.isTopicReconcileCurrent(generation, reconcileGeneration, lineSlug)
      ) return;
      this.setPhase('degraded');
    }
  }

  async exit(): Promise<void> {
    this.probeGeneration += 1;
    this.coordinator?.reset();
    this.adapter.reset();
    this.maintenanceReason = undefined;
    this.lastModeLineSlug = undefined;
    if (!this.isActive) return;
    this.wire.dispatch(aitpModeExit({}));
    this.publishVisibilityChangeIfNeeded();
    this.publishAgentStatus();
  }

  setPhase(phase: AitpModePhase): void {
    if (phase === 'inactive') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        'Use exit() to leave AITP Research Mode; setPhase("inactive") is invalid.',
      );
    }
    if (!this.isActive) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_INACTIVE,
        'Cannot change the AITP Research Mode phase after the mode has exited.',
      );
    }
    this.wire.dispatch(aitpModeSetPhase({ phase }));
    this.publishAgentStatus();
  }

  assertResearchMutationAllowed(options?: { readonly allowPaused?: boolean }): void {
    this.assertMainAgent();
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
    this.topicReconcileGeneration += 1;
    this.coordinator?.reset();
    this.adapter.reset();
    this.maintenanceReason = undefined;
    this.lastModeLineSlug = undefined;
  }

  async refreshHealth(): Promise<AitpAdapterHealth> {
    if (!this.isActive) return { phase: 'inactive' };
    return this.adapter.probe();
  }

  private assertMainAgent(): void {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_NOT_MAIN_AGENT,
        'AITP Research Mode is only available on the main agent.',
      );
    }
  }

  private assertModeCommandAllowed(expectedRevision: number): void {
    this.assertMainAgent();
    const worldRevision = this.wire.getModel(ResearchRevisionModel).revision;
    const researchRevision = worldRevision > 0
      ? worldRevision
      : this.wire.getModel(ResearchModel).current.revision;
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

  private async reconcileAfterRestore(options?: {
    readonly undoBoundary?: boolean;
  }): Promise<boolean> {
    const generation = ++this.probeGeneration;
    if (!this.isActive) {
      this.coordinator?.reset();
      this.adapter.reset();
      return false;
    }
    this.coordinator?.reset();
    this.adapter.reset();
    this.ensureResearchTools();
    let lineSlug: string | undefined;
    let reconciliationStarted = false;
    let reconcileGeneration = this.topicReconcileGeneration;
    if (options?.undoBoundary === true) {
      // `context.undone` subscribers are synchronous, while their returned
      // promises are not awaited. Yield once so AgentResearchService can first
      // capture the restored active/inactive baseline and advance the public
      // world revision. This microtask still runs before UndoService resolves
      // to its caller, closing the restored-`ready` admission window without
      // treating an inactive -> active undo as a fresh live mode entry.
      await Promise.resolve();
      if (!this.isProbeCurrent(generation)) return false;
      if (this.phase !== 'probing') this.setPhase('probing');
    }
    try {
      const health = await this.adapter.probe();
      if (!this.isProbeCurrent(generation)) return false;
      lineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
      let binding: ResearchLineWorkstreamBinding | undefined;
      if (health.phase === 'ready') {
        reconciliationStarted = true;
        const reconciliation = this.reconcileCurrentTopicBinding(lineSlug);
        reconcileGeneration = this.topicReconcileGeneration;
        binding = await reconciliation;
        if (!this.isTopicReconcileCurrent(
          generation,
          reconcileGeneration,
          lineSlug,
        )) return false;
      }
      const nextPhase = health.phase === 'ready'
        ? binding === undefined
          ? this.clearMaintenanceScope()
          : await this.refreshMaintenance(binding)
        : 'degraded';
      if (!this.isProbeCurrent(generation)) return false;
      if (
        health.phase === 'ready' &&
        !this.isTopicReconcileCurrent(generation, reconcileGeneration, lineSlug)
      ) return false;
      if (nextPhase === undefined) return false;
      const changed = this.phase !== nextPhase;
      if (changed) this.setPhase(nextPhase);
      return changed;
    } catch {
      if (!this.isProbeCurrent(generation)) return false;
      if (this.topicReconcileGeneration !== reconcileGeneration) return false;
      if (
        reconciliationStarted &&
        !this.isTopicReconcileCurrent(generation, reconcileGeneration, lineSlug)
      ) return false;
      this.clearMaintenanceScope();
      const changed = this.phase !== 'degraded';
      if (changed) this.setPhase('degraded');
      return changed;
    }
  }

  private async refreshMaintenance(
    binding: ResearchLineWorkstreamBinding,
  ): Promise<'ready' | 'degraded' | undefined> {
    if (this.coordinator === undefined) return 'ready';
    try {
      const receipt = await this.coordinator.refresh({
        workstream: binding.workstream,
        force: true,
      });
      if (
        receipt.degradedReason === 'stale_generation' ||
        !sameLineWorkstreamBinding(
          this.currentConfirmedBinding(binding.lineSlug),
          binding,
        )
      ) return undefined;
      const program = this.wire.getModel(ResearchModel).current.program;
      if (
        program === null ||
        !isMaintenanceReceiptAligned({ receipt, binding, program })
      ) {
        this.clearMaintenanceScope();
        this.maintenanceReason = 'stale_generation';
        return 'degraded';
      }
      this.maintenanceReason = receipt.degradedReason;
      return receipt.status;
    } catch {
      if (!sameLineWorkstreamBinding(
        this.currentConfirmedBinding(binding.lineSlug),
        binding,
      )) return undefined;
      this.maintenanceReason = undefined;
      return 'degraded';
    }
  }

  async reconcileCurrentTopicBinding(
    expectedLineSlug?: string,
  ): Promise<ResearchLineWorkstreamBinding | undefined> {
    if (!this.isActive || !this.adapter.isReady()) return undefined;
    const currentLineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
    if (
      expectedLineSlug !== undefined &&
      currentLineSlug !== expectedLineSlug
    ) this.throwStaleTopicReconciliation(expectedLineSlug);
    const modeGeneration = this.probeGeneration;
    const reconcileGeneration = ++this.topicReconcileGeneration;
    const lineSlug = expectedLineSlug ?? currentLineSlug;
    const entered = await this.adapter.enter();
    if (!this.isTopicReconcileCurrent(
      modeGeneration,
      reconcileGeneration,
      lineSlug,
    )) this.throwStaleTopicReconciliation(lineSlug);
    const state = this.wire.getModel(ResearchModel).current;
    const current = state.program;
    const sameTopic = current?.topicId === entered.topic.id;
    const researchRevision = state.revision;
    this.wire.dispatch(researchSetProgram({
      topicId: entered.topic.id,
      title: entered.topic.title,
      goalText: entered.topic.goal.text,
      goalSource: entered.topic.goal.source,
      establishedAt: sameTopic ? current!.establishedAt : Date.now(),
    }));
    // The unscoped observation is the sole Program authority. Any Program
    // revision change makes every in-flight/cached scoped receipt stale, even
    // when the Line slug itself did not change.
    if (this.wire.getModel(ResearchModel).current.revision !== researchRevision) {
      this.clearMaintenanceScope();
    }
    if (!this.isTopicReconcileCurrent(
      modeGeneration,
      reconcileGeneration,
      lineSlug,
    )) this.throwStaleTopicReconciliation(lineSlug);
    this.lastModeLineSlug = lineSlug;
    if (this.wire.getModel(ResearchModel).current.revision !== researchRevision) {
      this.eventBus.publish({ type: 'aitp_mode.updated' });
    }
    return lineSlug === undefined
      ? undefined
      : this.currentConfirmedBinding(lineSlug);
  }

  private currentConfirmedBinding(
    lineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug,
  ): ResearchLineWorkstreamBinding | undefined {
    if (lineSlug === undefined) return undefined;
    if (this.wire.getModel(AitpModeModel).current.currentLineSlug !== lineSlug) {
      return undefined;
    }
    const state = this.wire.getModel(ResearchModel).current;
    const binding = (state.lineWorkstreamBindings ?? {})[lineSlug];
    if (binding === undefined || binding.lineSlug !== lineSlug) return undefined;
    const program = state.program;
    if (program === null) return undefined;
    if (
      binding.topicId !== program.topicId ||
      binding.observedRevision !== (program.observedRevision ?? 1)
    ) return undefined;
    return { ...binding };
  }

  private currentConfirmedWorkstream(): string | undefined {
    return this.currentConfirmedBinding()?.workstream;
  }

  private clearMaintenanceScope(): 'ready' {
    this.coordinator?.reset();
    this.maintenanceReason = undefined;
    return 'ready';
  }

  private ensureCurrentScopeRefresh(expectedLineSlug?: string): void {
    this.clearMaintenanceScope();
    if (!this.adapter.isReady()) return;
    void this.refreshReconciledMaintenance(expectedLineSlug);
  }

  private async refreshReconciledMaintenance(
    expectedLineSlug?: string,
  ): Promise<'ready' | 'degraded' | undefined> {
    const modeGeneration = this.probeGeneration;
    let reconcileGeneration = this.topicReconcileGeneration;
    try {
      const reconciliation = this.reconcileCurrentTopicBinding(expectedLineSlug);
      reconcileGeneration = this.topicReconcileGeneration;
      const binding = await reconciliation;
      if (!this.isTopicReconcileCurrent(
        modeGeneration,
        reconcileGeneration,
        expectedLineSlug,
      )) return undefined;
      const status = binding === undefined
        ? this.clearMaintenanceScope()
        : await this.refreshMaintenance(binding);
      if (!this.isTopicReconcileCurrent(
        modeGeneration,
        reconcileGeneration,
        expectedLineSlug,
      )) return undefined;
      if (status !== undefined && this.phase !== status) this.setPhase(status);
      return status;
    } catch {
      if (!this.isTopicReconcileCurrent(
        modeGeneration,
        reconcileGeneration,
        expectedLineSlug,
      )) return undefined;
      this.clearMaintenanceScope();
      if (this.phase !== 'degraded') this.setPhase('degraded');
      return 'degraded';
    }
  }

  private isTopicReconcileCurrent(
    modeGeneration: number,
    reconcileGeneration: number,
    lineSlug: string | undefined,
  ): boolean {
    return this.isProbeCurrent(modeGeneration) &&
      reconcileGeneration === this.topicReconcileGeneration &&
      this.wire.getModel(AitpModeModel).current.currentLineSlug === lineSlug;
  }

  private throwStaleTopicReconciliation(lineSlug: string | undefined): never {
    throw new AitpResearchError(
      AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
      `Fresh AITP Topic observation for Research Line ${lineSlug ?? '<none>'} was superseded by a newer mode or Line reconciliation.`,
    );
  }

  private ensureResearchTools(): void {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) return;
    for (const name of RESEARCH_MODE_TOOL_NAMES) this.profile.addActiveTool(name);
  }

  private isProbeCurrent(generation: number): boolean {
    return generation === this.probeGeneration && this.isActive;
  }

  private publishVisibilityChangeIfNeeded(): void {
    const active = this.isActive;
    if (active === this.lastVisibilityActive) return;
    this.lastVisibilityActive = active;
    this.onDidChangeEmitter.fire();
  }

  private publishAgentStatus(): void {
    this.eventBus.publish({ type: 'agent.status.updated' });
  }

  private publishModeAndStatus(): void {
    this.eventBus.publish({ type: 'aitp_mode.updated' });
    this.eventBus.publish({ type: 'agent.status.updated' });
  }
}
