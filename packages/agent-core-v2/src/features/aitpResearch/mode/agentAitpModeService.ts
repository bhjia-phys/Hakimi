/**
 * `aitpResearch` domain — local knowledge and research memory toggle.
 *
 * Persists only enabled through wire, reads official Skill availability from
 * the ready session catalog, and publishes deduplicated snapshots through the
 * agent event bus. Visibility changes only on active/inactive transitions;
 * unrelated catalog changes must not unfreeze plugin guidance. Scope context
 * restricts activation to the main agent. Restore never probes
 * AITP, changes profiles, or mutates legacy Research records. Agent scope.
 */

import { Service } from '#/_base/di/service';
import { onUnexpectedError } from '#/_base/errors/unexpectedError';
import { Emitter } from '#/_base/event';
import { IEventBus } from '#/app/event/eventBus';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IWireService } from '#/wire/wire';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { ISessionSkillCatalog } from '#/session/sessionSkillCatalog/skillCatalog';
import { AitpModeModel } from '../aitpResearchOps';
import { AitpResearchError, AitpResearchErrors } from '../errors';
import { retiredResearchOperation } from './retiredResearch';
import { ResearchModeModel, researchModeSetEnabled } from './researchModeOps';
import { type AitpModeEntryOptions, IAgentAitpModeService, type ResearchModeSnapshot } from './agentAitpMode';

export class AgentAitpModeService extends Service implements IAgentAitpModeService {
  declare readonly _serviceBrand: undefined;
  private readonly changed = this._register(new Emitter<void>());
  readonly onDidChange = this.changed.event;
  private lastVisibilityActive = false;
  private lastSnapshot: ResearchModeSnapshot | undefined;

  constructor(
    @IWireService private readonly wire: IWireService,
    @IAgentScopeContext private readonly scopeCtx: IAgentScopeContext,
    @IEventBus private readonly eventBus: IEventBus,
    @ISessionSkillCatalog private readonly skills: ISessionSkillCatalog,
  ) {
    super();
    if (scopeCtx.agentId !== MAIN_AGENT_ID) return;
    this.lastVisibilityActive = this.isActive;
    this._register(wire.hooks.onDidRestore.register('researchMode', async (_ctx, next) => {
      const snapshotReady = this.lastSnapshot !== undefined;
      void this.publishSnapshot().catch(onUnexpectedError);
      if (!snapshotReady) {
        await this.skills.ready.catch(onUnexpectedError);
      }
      this.publishVisibilityChangeIfNeeded();
      await next();
    }));
    this._register(eventBus.subscribe('context.undone', () => {
      this.publishVisibilityChangeIfNeeded();
      void this.publishSnapshot().catch(onUnexpectedError);
    }));
    this._register(skills.onDidChange(() => {
      void this.publishSnapshot().catch(onUnexpectedError);
    }));
  }

  get isActive(): boolean {
    return this.scopeCtx.agentId === MAIN_AGENT_ID &&
      (this.wire.getModel(ResearchModeModel).enabled ??
        this.wire.getModel(AitpModeModel).current.phase !== 'inactive');
  }

  async getSnapshot(): Promise<ResearchModeSnapshot> {
    await this.skills.ready;
    return this.readSnapshot();
  }

  private readSnapshot(): ResearchModeSnapshot {
    return {
      enabled: this.isActive,
      skillsAvailable: this.skills.catalog.getModelSkillListing(
        (skill) => skill.plugin?.id === 'aitp-research-protocol',
      ).length > 0,
    };
  }

  async enter(options: AitpModeEntryOptions): Promise<void> {
    this.assertMainAgent();
    if (options.lineSlug !== undefined) retiredResearchOperation();
    if (this.wire.getModel(ResearchModeModel).enabled === true) return;
    this.wire.dispatch(researchModeSetEnabled({ enabled: true }));
    this.publishVisibilityChangeIfNeeded();
    await this.publishSnapshot();
  }

  async exit(): Promise<void> {
    this.assertMainAgent();
    if (this.wire.getModel(ResearchModeModel).enabled === false) return;
    this.wire.dispatch(researchModeSetEnabled({ enabled: false }));
    this.publishVisibilityChangeIfNeeded();
    await this.publishSnapshot();
  }

  get phase(): never { return retiredResearchOperation(); }
  get loopStatus(): never { return retiredResearchOperation(); }
  get revision(): never { return retiredResearchOperation(); }
  get health(): never { return retiredResearchOperation(); }
  get maintenanceDegradedReason(): never { return retiredResearchOperation(); }
  setPhase(): never { return retiredResearchOperation(); }
  assertResearchMutationAllowed(): never { return retiredResearchOperation(); }
  pauseLoop(): never { return retiredResearchOperation(); }
  resumeLoop(): never { return retiredResearchOperation(); }
  async refreshHealth(): Promise<never> { return retiredResearchOperation(); }
  async reconcileCurrentTopicBinding(): Promise<never> { return retiredResearchOperation(); }
  resetAdapter(): never { return retiredResearchOperation(); }

  private assertMainAgent(): void {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_NOT_MAIN_AGENT,
        'Research Mode is only available on the main agent.',
      );
    }
  }

  private publishVisibilityChangeIfNeeded(): void {
    const active = this.isActive;
    if (active === this.lastVisibilityActive) return;
    this.lastVisibilityActive = active;
    this.changed.fire();
    this.eventBus.publish({ type: 'agent.status.updated' });
  }

  private async publishSnapshot(): Promise<void> {
    await this.skills.ready;
    if (this._store.isDisposed) return;
    const snapshot = this.readSnapshot();
    if (this.lastSnapshot?.enabled === snapshot.enabled &&
        this.lastSnapshot.skillsAvailable === snapshot.skillsAvailable) return;
    this.lastSnapshot = snapshot;
    this.eventBus.publish({ type: 'research_mode.updated', snapshot });
  }
}
