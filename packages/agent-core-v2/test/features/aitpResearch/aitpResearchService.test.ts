import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DisposableStore, toDisposable } from '#/_base/di/lifecycle';
import { SyncDescriptor } from '#/_base/di/descriptors';
import { ISessionSkillCatalogData } from '#/session/sessionSkillCatalog/skillCatalogData';
import { SessionSkillCatalogService } from '#/session/sessionSkillCatalog/skillCatalogService';
import { ISessionStateService } from '#/session/state/sessionState';
import { SessionStateService } from '#/session/state/sessionStateService';
import { ScopeActivation } from '#/_base/di/instantiation';
import { InstantiationService } from '#/_base/di/instantiationService';
import { _clearScopedRegistryForTests, registerScopedService } from '#/_base/di/scope';
import { createScopedTestHost, stubPair, TestInstantiationService } from '#/_base/di/test';
import { Emitter, Event } from '#/_base/event';
import { resetUnexpectedErrorHandler, setUnexpectedErrorHandler } from '#/_base/errors/unexpectedError';
import { IFeatureManager } from '#/app/feature/featureManager';
import { FeatureManagerService } from '#/app/feature/featureManagerService';
import { LifecycleScope } from '#/app/scopes';
import { IEventBus } from '#/app/event/eventBus';
import { EventBusService } from '#/app/event/eventBusService';
import { InMemorySkillCatalog } from '#/app/skillCatalog/registry';
import { IAgentContextInjectorService, type ContextInjectionProvider, type ContextInjectionContext } from '#/agent/contextInjector/contextInjector';
import { IAgentScopeContext, makeAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentSkillVisibilityService } from '#/agent/skillVisibility/skillVisibility';
import { AgentSkillVisibilityService } from '#/agent/skillVisibility/skillVisibilityService';
import { IAgentToolActivationService } from '#/agent/toolActivation/toolActivation';
import { AgentToolActivationService } from '#/agent/toolActivation/toolActivationService';
import { IAgentToolRegistryService } from '#/agent/toolRegistry/toolRegistry';
import { AgentToolRegistryService } from '#/agent/toolRegistry/toolRegistryService';
import { IAgentProfileService } from '#/agent/profile/profile';
import { IAgentRuntimeService } from '#/agent/runtimeBinding/agentRuntime';
import { ISessionToolPolicyGate } from '#/session/sessionToolPolicyGate/sessionToolPolicyGate';
import { GoalCompletionGuardContribution, GoalContinuationParticipantContribution } from '#/agent/goal/goalContribution';
import { ISessionSkillCatalog } from '#/session/sessionSkillCatalog/skillCatalog';
import { IWireService } from '#/wire/wire';
import type { WireRecord } from '#/wire/record';
import { AitpResearchFeature } from '#/features/aitpResearch/aitpResearchFeature';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import { ISessionAitpLifecycleCoordinator } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinator';
import { IDurableCommitService } from '#/features/aitpResearch/research/durableCommit';
import { IAitpDistillationHandoffService } from '#/features/aitpResearch/research/distillationHandoff';
import { IAitpExternalFactService } from '#/features/aitpResearch/research/externalFact';
import { IResearchLoopCoordinator } from '#/features/aitpResearch/loop/researchLoopCoordinator';
import { IResearchTurnAdmission } from '#/features/aitpResearch/loop/researchTurnAdmission';
import { dispatchResearchModeCommand } from '#/features/aitpResearch/mode/researchModeCommand';
import { ResearchModeModel } from '#/features/aitpResearch/mode/researchModeOps';
import { AitpModeModel, ResearchModel, ResearchCursorModel, aitpModeEnter, aitpModeSetPhase, researchCreateLine, researchProposeCheckpoint } from '#/features/aitpResearch/aitpResearchOps';
import { contextAppendMessage, contextUndo } from '#/agent/contextMemory/contextOps';
import { planModeEnter, PlanModel } from '#/features/plan/planOps';
import { registerTestAgentWire, recordingWireLog } from '../../wire/stubs';
import { stubSkill } from '../../app/skillCatalog/stubs';
import '#/index';

let disposables: DisposableStore;
beforeEach(() => {
  disposables = new DisposableStore();
  _clearScopedRegistryForTests();
  registerScopedService(LifecycleScope.App, IFeatureManager, FeatureManagerService, ScopeActivation.OnScopeCreated, 'feature');
  registerScopedService(LifecycleScope.Agent, IAgentSkillVisibilityService, AgentSkillVisibilityService);
  registerScopedService(LifecycleScope.Agent, IAgentToolActivationService, AgentToolActivationService);
  registerScopedService(LifecycleScope.Agent, IAgentToolRegistryService, AgentToolRegistryService);
});
afterEach(() => disposables.dispose());

const emptyContext: ContextInjectionContext = { injectedPositions: [], lastInjectedAt: null, isNewTurn: true };
const aitpSkill = stubSkill('aitp', { plugin: { id: 'aitp-research-protocol' } });

function setup(options: { records?: WireRecord[]; plugin?: boolean; agentId?: string; skills?: ISessionSkillCatalog } = {}) {
  const records = options.records ?? [];
  const bus = new EventBusService();
  const ix = disposables.add(new TestInstantiationService());
  const wire = registerTestAgentWire(ix, 'research/test', { log: recordingWireLog(records), eventBus: bus });
  const catalog = new InMemorySkillCatalog();
  if (options.plugin !== false) catalog.register(aitpSkill);
  const catalogChanged = disposables.add(new Emitter<string>());
  const load = vi.fn(async () => {});
  const skills: ISessionSkillCatalog = options.skills ?? { _serviceBrand: undefined, catalog, ready: Promise.resolve(), onDidChange: catalogChanged.event, load, reload: load, list: async () => [] };
  const providers = new Map<string, ContextInjectionProvider>();
  const injector: IAgentContextInjectorService = {
    _serviceBrand: undefined,
    register(name, provider) { providers.set(name, provider as ContextInjectionProvider); return toDisposable(() => providers.delete(name)); },
    reconcileWhenIdle: async () => {},
  };
  const profile = {
    data: () => ({ activeToolNames: ['EnterAITPMode', 'ExitAITPMode', 'BeginResearchAction', 'aitp_record_save'], disallowedTools: [] }),
    addActiveTool: vi.fn(),
  };
  const host = createScopedTestHost();
  disposables.add(host);
  host.app.accessor.get(IFeatureManager).provideUnit(AitpResearchFeature);
  const session = host.child(LifecycleScope.Session, 'session', [stubPair(ISessionSkillCatalog, skills)]);
  const agent = host.childOf(session, LifecycleScope.Agent, options.agentId ?? 'main', [
    stubPair(IWireService, wire),
    stubPair(IEventBus, bus),
    stubPair(IAgentScopeContext, makeAgentScopeContext({ agentId: options.agentId ?? 'main', agentScope: 'research/test' })),
    stubPair(IAgentContextInjectorService, injector),
    stubPair(IAgentProfileService, profile as unknown as IAgentProfileService),
    stubPair(IAgentRuntimeService, { onDidChange: Event.None, isAvailable: () => true } as unknown as IAgentRuntimeService),
    stubPair(ISessionToolPolicyGate, { disabledTools: [] } as unknown as ISessionToolPolicyGate),
  ]);
  const mode = agent.accessor.get(IAgentAitpModeService);
  return { host, session, agent, mode, wire, records, bus, providers, profile, load, catalog, catalogChanged };
}

function previous(content: string): ContextInjectionContext {
  return { ...emptyContext, lastInjection: { role: 'user', content: [{ type: 'text', text: `<system-reminder>\n${content}\n</system-reminder>` }], toolCalls: [], origin: { kind: 'injection', variant: 'aitp_research' } } };
}

function deferredCatalog() {
  const catalog = new InMemorySkillCatalog();
  let complete!: () => void;
  let fail!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; });
  const ix = disposables.add(new TestInstantiationService());
  ix.stub(ISessionSkillCatalogData, { _serviceBrand: undefined, catalog, ready, onDidChange: Event.None as Event<string> });
  ix.set(ISessionStateService, new SyncDescriptor(SessionStateService));
  ix.set(ISessionSkillCatalog, new SyncDescriptor(SessionSkillCatalogService));
  return { catalog, complete, fail, skills: ix.get(ISessionSkillCatalog) };
}

describe('Research memory-mode production assembly', () => {
  it('keeps snapshot reads pending without blocking ordinary cold restore on catalog readiness', async () => {
    const deferred = deferredCatalog();
    const { mode, wire, bus } = setup({ skills: deferred.skills });
    const snapshots: unknown[] = [];
    disposables.add(bus.subscribe('research_mode.updated', (event) => snapshots.push(event.snapshot)));
    let readCompleted = false;
    let restoreCompleted = false;
    const read = mode.getSnapshot().then((snapshot) => { readCompleted = true; return snapshot; });
    const restore = wire.restore().then(() => { restoreCompleted = true; });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(restoreCompleted).toBe(false);
    expect(mode.isActive).toBe(false);
    expect(readCompleted).toBe(false);
    expect(snapshots).toEqual([]);
    deferred.catalog.register(aitpSkill);
    deferred.complete();
    await restore;
    expect(await read).toEqual({ enabled: false, skillsAvailable: true });
    expect(snapshots).toEqual([{ enabled: false, skillsAvailable: true }]);
  });

  it('continues ordinary wire restore and reports a rejected catalog without fabricating a snapshot', async () => {
    const reported: unknown[] = [];
    setUnexpectedErrorHandler((error) => reported.push(error));
    try {
      const deferred = deferredCatalog();
      const { mode, wire, bus } = setup({ skills: deferred.skills });
      const snapshots: unknown[] = [];
      disposables.add(bus.subscribe('research_mode.updated', (event) => snapshots.push(event.snapshot)));
      const downstream = vi.fn();
      disposables.add(wire.hooks.onDidRestore.register('afterResearch', async (_ctx, next) => {
        downstream();
        await next();
      }));
      const error = new Error('catalog discovery failed');
      deferred.fail(error);
      await expect(wire.restore()).resolves.toBeUndefined();
      expect(downstream).toHaveBeenCalledOnce();
      expect(mode.isActive).toBe(false);
      await expect(mode.getSnapshot()).rejects.toBe(error);
      expect(reported).toContain(error);
      expect(snapshots).toEqual([]);
    } finally {
      resetUnexpectedErrorHandler();
    }
  });

  it('publishes catalog readiness after restore without a catalog change', async () => {
    const deferred = deferredCatalog();
    const { bus, wire } = setup({ skills: deferred.skills });
    const snapshots: unknown[] = [];
    disposables.add(bus.subscribe('research_mode.updated', (event) => snapshots.push(event.snapshot)));
    deferred.catalog.register(aitpSkill);
    deferred.complete();
    await wire.restore();
    await deferred.skills.ready;
    await expect.poll(() => snapshots).toEqual([{ enabled: false, skillsAvailable: true }]);
  });

  it('does not publish late catalog readiness after the mode scope is disposed', async () => {
    const deferred = deferredCatalog();
    const { host, bus } = setup({ skills: deferred.skills });
    const snapshots: unknown[] = [];
    disposables.add(bus.subscribe('research_mode.updated', (event) => snapshots.push(event.snapshot)));
    deferred.complete();
    host.dispose();
    deferred.catalog.register(aitpSkill);
    await deferred.skills.ready;
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(snapshots).toEqual([]);
  });

  it('does not publish duplicate static snapshots for repeated restores', async () => {
    const { bus, wire } = setup();
    const snapshots: unknown[] = [];
    disposables.add(bus.subscribe('research_mode.updated', (event) => snapshots.push(event.snapshot)));
    await wire.restore();
    expect(snapshots).toEqual([{ enabled: false, skillsAvailable: true }]);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(snapshots).toHaveLength(1);
  });

  it('mounts only the toggle, guidance, visibility and two compatibility tools', async () => {
    const { agent, session, mode, profile } = setup();
    for (const token of [IAgentResearchService, IDurableCommitService, IAitpExternalFactService, IAitpDistillationHandoffService, IResearchLoopCoordinator, IResearchTurnAdmission]) {
      expect(() => agent.accessor.get(token)).toThrow();
    }
    expect(() => session.accessor.get(ISessionAitpAdapter)).toThrow();
    expect(() => session.accessor.get(ISessionAitpLifecycleCoordinator)).toThrow();
    expect(disposables.add((agent.instantiation as InstantiationService).collectionStore.createView(GoalCompletionGuardContribution, agent.instantiation)).items).toEqual([]);
    expect(disposables.add((agent.instantiation as InstantiationService).collectionStore.createView(GoalContinuationParticipantContribution, agent.instantiation)).items).toEqual([]);
    const activation = agent.accessor.get(IAgentToolActivationService);
    const tools = agent.accessor.get(IAgentToolRegistryService);
    await activation.activate();
    expect(tools.list().map((tool) => tool.name)).toEqual(['EnterAITPMode']);
    await mode.enter({ actor: 'user' });
    expect(tools.list().map((tool) => tool.name)).toEqual(['EnterAITPMode', 'ExitAITPMode']);
    await mode.exit();
    expect(tools.list().map((tool) => tool.name)).toEqual(['EnterAITPMode']);
    expect(profile.addActiveTool).not.toHaveBeenCalled();
  });

  it('persists only enabled, performs no catalog reload or research writes, and is idempotent', async () => {
    const { mode, wire, records, bus, load } = setup();
    const before = structuredClone(wire.getModel(ResearchModel));
    expect(await mode.getSnapshot()).toEqual({ enabled: false, skillsAvailable: true });
    await mode.enter({ actor: 'user' });
    await mode.enter({ actor: 'model' });
    bus.publish({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } });
    bus.publish({ type: 'turn.ended', turnId: 1, reason: 'completed' });
    await mode.exit();
    await mode.exit();
    await wire.flush();
    expect(records.map((record) => record.type)).toEqual(['research_mode.set_enabled', 'research_mode.set_enabled']);
    expect(wire.getModel(ResearchModel)).toEqual(before);
    expect(wire.getModel(ResearchModeModel)).toEqual({ enabled: false });
    expect(load).not.toHaveBeenCalled();
  });

  it('cold-restores legacy enabled state without a probe, profile repair, or checkpoint reconciliation', async () => {
    const seed = setup();
    await seed.wire.restore();
    seed.wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'old' }));
    seed.wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
    seed.wire.dispatch(researchCreateLine({ slug: 'old', title: 'Old', createdAt: 1 }));
    seed.wire.dispatch(researchProposeCheckpoint({ checkpointId: 'pending', idempotencyKey: 'pending', createdAt: 2 }));
    await seed.wire.flush();
    const records = structuredClone(seed.records);
    const restored = setup({ records });
    const before = structuredClone(records);
    await restored.wire.restore();
    expect(await restored.mode.getSnapshot()).toEqual({ enabled: true, skillsAvailable: true });
    expect(restored.wire.getModel(ResearchModel).current.pendingCheckpoint).toMatchObject({ checkpointId: 'pending' });
    expect(restored.profile.addActiveTool).not.toHaveBeenCalled();
    expect(records).toEqual(before);
    await restored.mode.exit();
    expect(restored.mode.isActive).toBe(false);
    expect(restored.wire.getModel(AitpModeModel).current.phase).toBe('ready');
    expect(restored.wire.getModel(ResearchModel).current.pendingCheckpoint).toMatchObject({ checkpointId: 'pending' });
    const again = setup({ records: structuredClone(records) });
    await again.wire.restore();
    expect(again.mode.isActive).toBe(false);
  });

  it('pins an explicit on command even when legacy history already appears enabled', async () => {
    const { mode, wire } = setup();
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    expect(mode.isActive).toBe(true);
    expect(wire.getModel(ResearchModeModel).enabled).toBeNull();
    await mode.enter({ actor: 'user' });
    wire.dispatch(contextUndo({ count: 1 }));
    expect(wire.getModel(AitpModeModel).current.phase).toBe('inactive');
    expect(mode.isActive).toBe(true);
  });

  it('keeps general Plan and conversation undo independent of the explicit toggle', async () => {
    const { mode, wire } = setup();
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
    wire.dispatch(planModeEnter({ id: 'plan' }));
    await mode.enter({ actor: 'user' });
    expect(wire.getModel(PlanModel).current.active).toBe(true);
    wire.dispatch(contextUndo({ count: 1 }));
    expect(mode.isActive).toBe(true);
    await mode.exit();
    expect(mode.isActive).toBe(false);
  });

  it('toggles official Skill visibility while keeping unrelated skills visible', async () => {
    const { mode, agent } = setup();
    const visibility = agent.accessor.get(IAgentSkillVisibilityService);
    expect(visibility.isSkillVisible(aitpSkill)).toBe(false);
    expect(visibility.isSkillVisible(stubSkill('ordinary'))).toBe(true);
    await mode.enter({ actor: 'user' });
    expect(visibility.isSkillVisible(aitpSkill)).toBe(true);
    expect(visibility.isSkillVisibleInFrozenListing(aitpSkill)).toBe(false);
    await mode.exit();
    expect(visibility.isSkillVisible(aitpSkill)).toBe(false);
  });

  it('reports a missing plugin honestly and emits availability changes without probing', async () => {
    const { mode, bus, catalog, catalogChanged, load, providers } = setup({ plugin: false });
    const snapshots: unknown[] = [];
    disposables.add(bus.subscribe('research_mode.updated', (event) => snapshots.push(event.snapshot)));
    await mode.enter({ actor: 'user' });
    expect(await mode.getSnapshot()).toEqual({ enabled: true, skillsAvailable: false });
    expect(await providers.get('aitp_research')!(emptyContext)).toMatchObject({ content: expect.stringContaining('Skills are unavailable') });
    catalog.register(aitpSkill);
    catalogChanged.fire('plugin');
    await expect.poll(() => snapshots).toEqual([{ enabled: true, skillsAvailable: false }, { enabled: true, skillsAvailable: true }]);
    expect(load).not.toHaveBeenCalled();
  });

  it('supersedes stale execution reminders and deduplicates knowledge/memory guidance', async () => {
    const { mode, providers } = setup();
    const render = providers.get('aitp_research')!;
    expect(await render(emptyContext)).toBeUndefined();
    expect(await render(previous('BeginResearchAction is required.'))).toMatchObject({ content: expect.stringContaining('instructions are retired') });
    await mode.enter({ actor: 'user' });
    const result = await render(emptyContext) as { content: string };
    expect(result.content).toContain('No delta means no write');
    expect(result.content).toContain('CLI fallback');
    expect(result.content).toContain('Ordinary tools need no Research action');
    expect(await render(previous(result.content))).toBeUndefined();
    await mode.exit();
    expect(await render(previous(result.content))).toMatchObject({ content: expect.stringContaining('Research Mode is off') });
  });

  it('preserves the independent dynamic Skill listing on entry and exit', async () => {
    const { mode, providers } = setup();
    const render = providers.get('aitp_skill_visibility')!;
    expect(await render(emptyContext)).toBeUndefined();
    await mode.enter({ actor: 'user' });
    const result = await render(emptyContext) as { content: string };
    expect(result.content).toContain('aitp');
    expect(await render(previous(result.content))).toBeUndefined();
    await mode.exit();
    expect(await render(previous(result.content))).toMatchObject({ content: expect.stringContaining('no active AITP') });
  });

  it('rejects all old execution entry points instead of pretending success', async () => {
    const { mode, records } = setup();
    for (const kind of ['begin_action', 'commit_checkpoint', 'discard_historical_checkpoint', 'pause_loop', 'confirm_goal_alignment', 'set_planning_policy']) {
      await expect(dispatchResearchModeCommand(mode, { kind })).rejects.toMatchObject({ code: 'research.retired' });
    }
    await expect(mode.enter({ actor: 'user', lineSlug: 'old' })).rejects.toMatchObject({ code: 'research.retired' });
    expect(() => mode.pauseLoop(0)).toThrow('retired');
    expect(() => mode.resetAdapter()).toThrow('retired');
    expect(records).toEqual([]);
  });

  it('does not activate in child agents', async () => {
    const { mode, records } = setup({ agentId: 'child' });
    await expect(mode.enter({ actor: 'model' })).rejects.toMatchObject({ code: 'aitp.mode_not_main_agent' });
    expect(mode.isActive).toBe(false);
    expect(records).toEqual([]);
  });

  it('keeps old wire fixture replay read-only through the production entry decoder imports', async () => {
    const fixture = readFileSync(new URL('./fixtures/replay/legacy-0.21-two-line-stranded-action.jsonl', import.meta.url), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as WireRecord);
    const { wire, records, mode } = setup({ records: structuredClone(fixture) });
    await wire.restore();
    expect(records).toEqual(fixture);
    expect(wire.getModel(ResearchModel).current.currentAction).toMatchObject({ actionId: 'action-active', status: 'in_progress' });
    await mode.exit();
    expect(wire.getModel(ResearchModel).current.currentAction).toMatchObject({ actionId: 'action-active', status: 'in_progress' });
  });
});
