import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DisposableStore } from '#/_base/di/lifecycle';
import { SyncDescriptor } from '#/_base/di/descriptors';
import { createServices, TestInstantiationService } from '#/_base/di/test';
import { ILogService } from '#/_base/log/log';
import { contextAppendMessage, contextUndo } from '#/agent/contextMemory/contextOps';
import { makeAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { BeforeToolExecuteEventImpl } from '#/agent/toolExecutor/beforeToolExecuteEvent';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import { IEventBus } from '#/app/event/eventBus';
import { EventBusService } from '#/app/event/eventBusService';
import { InMemorySkillCatalog } from '#/app/skillCatalog/registry';
import { SessionAitpAdapterService } from '#/features/aitpResearch/adapter/sessionAitpAdapterService';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import {
  AitpModeModel,
  ResearchModel,
  ResearchCursorModel,
  aitpModeEnter,
  aitpModeSetPhase,
  aitpModeSetLoopStatus,
  researchProposeCheckpoint,
  researchCommitCheckpoint,
  researchAcknowledgeCheckpoint,
  researchCreateLine,
} from '#/features/aitpResearch/aitpResearchOps';
import { aitpResearchModeFlag } from '#/features/aitpResearch/flag';
import type {
  AitpAdapterHealth,
  AitpCheckReport,
  AitpEnterResult,
  AitpListResult,
  AitpNotePrepareResult,
  AitpNoteSaveResult,
  AitpRecordPrepareResult,
  AitpRecordSaveResult,
  AitpShowResult,
} from '#/features/aitpResearch/types';
import { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { IHostProcessService, type IHostProcess } from '#/os/interface/hostProcess';
import { AppendLogStore } from '#/persistence/backends/node-fs/appendLogStore';
import { InMemoryStorageService } from '#/persistence/backends/memory/inMemoryStorageService';
import { IAppendLogStore } from '#/persistence/interface/appendLogStore';
import { IFileSystemStorageService } from '#/persistence/interface/storage';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { ISessionContext, makeSessionContext } from '#/session/sessionContext/sessionContext';
import { ISessionSkillCatalog } from '#/session/sessionSkillCatalog/skillCatalog';
import { IWireService } from '#/wire/wire';

import { stubLog } from '../../_base/log/stubs';
import { stubSkill } from '../../app/skillCatalog/stubs';
import { registerTestAgentWire, testWireScope } from '../../wire/stubs';

const SCOPE = 'wire';
const KEY = 'aitp-research-service-test';

describe('AITP Research flag', () => {
  it('makes the capability available by default without entering the mode', () => {
    expect(aitpResearchModeFlag.default).toBe(true);
  });
});

let disposables: DisposableStore;
let wire: IWireService;
let eventBus: IEventBus;

function buildWire(key: string): IWireService {
  const ix = disposables.add(new TestInstantiationService());
  ix.stub(IFileSystemStorageService, new InMemoryStorageService());
  ix.set(IAppendLogStore, new SyncDescriptor(AppendLogStore));
  ix.set(IEventBus, new SyncDescriptor(EventBusService));
  return registerTestAgentWire(ix, testWireScope(SCOPE, key), {
    log: ix.get(IAppendLogStore),
    eventBus,
  });
}

beforeEach(() => {
  disposables = new DisposableStore();
  eventBus = new EventBusService();
  wire = buildWire(KEY);
});

afterEach(() => disposables.dispose());

const PLUGIN_ROOT = '/managed/aitp-research-protocol';
const SKILL_DIR = `${PLUGIN_ROOT}/skills/aitp`;
const CONTRACT_PATH = `${PLUGIN_ROOT}/aitp.contract.json`;
const MANIFEST_PATH = `${PLUGIN_ROOT}/kimi.plugin.json`;

function completedProcess(stdoutText: string): IHostProcess {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.end(stdoutText);
  stderr.end();
  return {
    _serviceBrand: undefined,
    pid: 1,
    exitCode: 0,
    stdin,
    stdout,
    stderr,
    wait: () => new Promise((resolve) => setImmediate(() => resolve(0))),
    kill: async () => {},
    dispose: () => {},
  };
}

function buildManagedPluginAdapter(options?: {
  readonly contract?: unknown;
  readonly manifest?: unknown;
}): {
  readonly adapter: ISessionAitpAdapter;
  readonly spawn: ReturnType<typeof vi.fn<IHostProcessService['spawn']>>;
} {
  const catalog = new InMemorySkillCatalog();
  catalog.register(stubSkill('aitp', {
    path: `${SKILL_DIR}/SKILL.md`,
    dir: SKILL_DIR,
    source: 'extra',
    plugin: { id: 'aitp-research-protocol' },
  }), { replace: true });

  const files = new Map<string, string>([
    [CONTRACT_PATH, JSON.stringify(options?.contract ?? {
      schema: 'aitp/adapter-contract-0.1',
      plugin: { name: 'aitp-research-protocol', version: '0.8.0' },
      python: { min_minor: 11, launcher: 'scripts/aitp.py', skills_dir: 'skills/' },
    })],
    [MANIFEST_PATH, JSON.stringify(options?.manifest ?? {
      name: 'aitp-research-protocol',
      version: '0.8.0',
      skills: './skills/',
    })],
  ]);
  const spawn = vi.fn<IHostProcessService['spawn']>(async () =>
    completedProcess('(3, 13, 0)\n'));
  const ix = createServices(disposables, {
    strict: true,
    additionalServices: (reg) => {
      reg.definePartialInstance(ISessionSkillCatalog, {
        catalog,
        ready: Promise.resolve(),
      });
      reg.definePartialInstance(IHostFileSystem, {
        readText: async (path) => {
          const text = files.get(path);
          if (text === undefined) throw new Error(`missing: ${path}`);
          return text;
        },
        stat: async (path) => {
          const text = files.get(path);
          if (text === undefined) throw new Error(`missing: ${path}`);
          return { isFile: true, isDirectory: false, size: text.length };
        },
      });
      reg.definePartialInstance(IHostProcessService, { spawn });
      reg.defineInstance(ISessionContext, makeSessionContext({
        sessionId: 'session',
        workspaceId: 'workspace',
        sessionDir: '/sessions/session',
        sessionScope: 'session',
        cwd: '/workspace',
      }));
      reg.defineInstance(ILogService, stubLog());
      reg.define(ISessionAitpAdapter, SessionAitpAdapterService);
    },
  });
  return { adapter: ix.get(ISessionAitpAdapter), spawn };
}

describe('AITP managed plugin contract discovery', () => {
  it('resolves the installed 0.8 layout and probes Python', async () => {
    const { adapter, spawn } = buildManagedPluginAdapter();

    await expect(adapter.probe()).resolves.toMatchObject({
      phase: 'ready',
      contractVersion: '0.1',
      pluginVersion: '0.8.0',
      pythonVersion: 'python3.13',
    });
    expect(adapter.resolveContractIdentity()).toEqual({
      contractVersion: '0.1',
      pluginVersion: '0.8.0',
      launcherPath: `${PLUGIN_ROOT}/scripts/aitp.py`,
      pluginRoot: PLUGIN_ROOT,
    });
    expect(spawn).toHaveBeenCalledWith(
      'python3.13',
      ['-c', 'import sys; print(sys.version_info[:3])'],
      expect.objectContaining({ cwd: '/workspace', shell: false }),
    );
  });

  it('fails closed on an unknown adapter contract schema', async () => {
    const { adapter, spawn } = buildManagedPluginAdapter({
      contract: {
        schema: 'aitp/adapter-contract-0.2',
        plugin: { name: 'aitp-research-protocol', version: '0.8.0' },
        python: { launcher: 'scripts/aitp.py' },
      },
    });

    await expect(adapter.probe()).resolves.toMatchObject({
      phase: 'degraded',
      lastError: 'Could not resolve a compatible AITP plugin contract from skill catalog',
    });
    expect(adapter.resolveContractIdentity()).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('fails closed when the manifest and contract versions disagree', async () => {
    const { adapter, spawn } = buildManagedPluginAdapter({
      manifest: {
        name: 'aitp-research-protocol',
        version: '0.7.0',
        skills: './skills/',
      },
    });

    await expect(adapter.probe()).resolves.toMatchObject({
      phase: 'degraded',
      lastError: 'Could not resolve a compatible AITP plugin contract from skill catalog',
    });
    expect(adapter.resolveContractIdentity()).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });
});

function makeScopeCtx(agentId = MAIN_AGENT_ID) {
  return makeAgentScopeContext({ agentId, agentScope: '' });
}

function makeStubModeSvc(opts?: { isActive?: boolean }) {
  const isActive = opts?.isActive ?? true;
  return {
    _serviceBrand: undefined as undefined,
    _setPhaseCalls: [] as string[],
    isActive,
    phase: isActive ? ('ready' as const) : ('inactive' as const),
    loopStatus: 'active' as const,
    revision: 0,
    health: null as null,
    async enter() {},
    async exit() {},
    setPhase(phase: string) { this._setPhaseCalls.push(phase); },
    assertResearchMutationAllowed() {},
    pauseLoop(_expectedRevision: number) {},
    resumeLoop(_expectedRevision: number) {},
    resetAdapter() {},
    async refreshHealth() { return { phase: 'inactive' as const }; },
  };
}

function makeStubAdapter(overrides?: {
  show?: (opts: { id: string }) => Promise<AitpShowResult>;
  check?: () => Promise<AitpCheckReport>;
}): ISessionAitpAdapter & { _setHealth(h: AitpAdapterHealth): void } {
  let health: AitpAdapterHealth = { phase: 'inactive' };
  const stubEnter: AitpEnterResult = {
    schema: 'aitp/enter-0.2',
    memory_status: 'available',
    root: '/workspace',
    topic: { id: 't1', title: 'Test', goal: { text: 'Not established yet', source: '.aitp/topic/TOPIC.md' } },
    recent_entries: [],
    unresolved_failures: [],
    next_action: { status: 'not_established', source: null },
    latest_working_note: null,
    recent_notes: [],
    counts: { active: 0, superseded: 0, unresolved_failures: 0, malformed: 0, omitted_active: 0, active_newer_than_latest_working_note: null },
    warnings: [],
  };
  const stubList: AitpListResult = {
    schema: 'aitp/list-0.1',
    root: '/workspace',
    count: 0,
    entries: [],
    warnings: [],
  };
  const stubShow: AitpShowResult = {
    schema: 'aitp/show-0.1',
    root: '/workspace',
    id: 'e1',
    status: 'active',
    source: '.aitp/topic/entries/entry-e1.md',
    legacy_derived: false,
    frontmatter: {},
    body: '',
  };
  const stubCheck: AitpCheckReport = {
    schema: 'aitp/check-report-0.1',
    root: '/workspace',
    status: 'clean',
    counts: { entries: 0, notes: 0, errors: 0, warnings: 0 },
    findings: [],
  };
  const stubRecordPrepare: AitpRecordPrepareResult = {
    status: 'prepared',
    id: 'entry-test',
    path: '.aitp/local/drafts/entry-test.md',
    save_command: 'aitp record save .aitp/local/drafts/entry-test.md',
  };
  const stubRecordSave: AitpRecordSaveResult = {
    status: 'saved',
    path: '.aitp/topic/entries/entry-test.md',
  };
  const stubNotePrepare: AitpNotePrepareResult = {
    status: 'prepared',
    id: 'note-test',
    path: '.aitp/local/drafts/note-test.md',
    save_command: 'aitp note save .aitp/local/drafts/note-test.md',
  };
  const stubNoteSave: AitpNoteSaveResult = {
    status: 'saved',
    path: '.aitp/topic/notes/note-test.md',
  };
  return {
    _serviceBrand: undefined,
    get health() { return health; },
    _setHealth(h: AitpAdapterHealth) { health = h; },
    probe: async () => { health = { phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0', lastCheckAt: Date.now() }; return health; },
    enter: async () => stubEnter,
    list: async () => stubList,
    show: overrides?.show ?? (async () => stubShow),
    check: overrides?.check ?? (async () => stubCheck),
    recordPrepare: async () => stubRecordPrepare,
    recordSave: async () => stubRecordSave,
    notePrepare: async () => stubNotePrepare,
    noteSave: async () => stubNoteSave,
    resolveContractIdentity: () => null,
    isReady: () => health.phase === 'ready',
    isDegraded: () => health.phase === 'degraded',
    reset() { health = { phase: 'inactive' }; },
  };
}

function makeVetoEvent(toolName: string, args: unknown): BeforeToolExecuteEventImpl {
  const ctx: ResolvedToolExecutionHookContext = {
    turnId: 1,
    signal: new AbortController().signal,
    toolCall: { type: 'function', id: 'tc1', name: toolName, arguments: JSON.stringify(args) },
    toolCalls: [],
    args,
    execution: {} as never,
  };
  return new BeforeToolExecuteEventImpl(ctx);
}

describe('AITP adapter zero-I/O when inactive', () => {
  it('reset() returns to inactive state', () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1' });
    expect(adapter.health.phase).toBe('ready');
    adapter.reset();
    expect(adapter.health.phase).toBe('inactive');
    expect(adapter.resolveContractIdentity()).toBeNull();
  });

  it('inactive adapter performs no IO', () => {
    const showSpy = vi.fn();
    const checkSpy = vi.fn();
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    adapter.reset();
    expect(adapter.health.phase).toBe('inactive');
    expect(showSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
  });
});

describe('commitCheckpoint barrier', () => {
  it('requires a pending checkpoint with matching id', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub());
    await expect(svc.commitCheckpoint({ checkpointId: 'nonexistent', entryId: 'e1' })).rejects.toThrow(
      'No pending checkpoint',
    );
  });

  it('calls show + check before advancing the cursor', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const showSpy = vi.fn<(opts: { id: string }) => Promise<AitpShowResult>>().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
    });
    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0 }, findings: [],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub());

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });

    expect(showSpy).toHaveBeenCalledWith({ id: 'e1' });
    expect(checkSpy).toHaveBeenCalledOnce();
    expect(wire.getModel(ResearchCursorModel).cursor).not.toBeNull();
    expect(wire.getModel(ResearchCursorModel).cursor!.entryId).toBe('e1');
  });

  it('acknowledges the question and reconciles an undone pending checkpoint', async () => {
    const adapter = makeStubAdapter();
    const modeSvc = makeStubModeSvc({ isActive: true });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub());

    wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    const checkpoint = svc.proposeCheckpoint({ questionId: question.id });
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));

    await svc.commitCheckpoint({ checkpointId: checkpoint.checkpointId, entryId: 'e1' });
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();
    expect(wire.getModel(ResearchModel).current.questions[question.id]!.persistence).toBe('committed');
    expect(wire.getModel(ResearchCursorModel).cursor?.checkpointId).toBe(checkpoint.checkpointId);

    wire.dispatch(contextUndo({ count: 1 }));
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe(checkpoint.checkpointId);
    expect(svc.getPendingCheckpoint()).toBeNull();
    expect(wire.getModel(ResearchModel).current.questions[question.id]!.persistence).toBe('committed');
  });

  it('rejects a second proposal without replacing the first pending checkpoint', async () => {
    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub());

    const first = svc.proposeCheckpoint({});
    expect(() => svc.proposeCheckpoint({})).toThrow('already pending');
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe(first.checkpointId);
  });

  it.each([
    ['a different entry id', 'e2', 'active'],
    ['a superseded entry', 'e1', 'superseded'],
  ] as const)('keeps the pending checkpoint when show returns %s', async (_case, entryId, status) => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const showSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: entryId, status,
      source: `.aitp/topic/entries/entry-${entryId}.md`, legacy_derived: false, frontmatter: {}, body: '',
    } as AitpShowResult);
    const checkSpy = vi.fn();
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow(
      'active matching entry',
    );
    expect(checkSpy).not.toHaveBeenCalled();
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe('cp1');
  });

  it('treats a repeated commit with the same checkpoint and entry as idempotent', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const showSpy = vi.fn<(opts: { id: string }) => Promise<AitpShowResult>>().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
    });
    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0 }, findings: [],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub());

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });
    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });

    expect(showSpy).toHaveBeenCalledOnce();
    expect(checkSpy).toHaveBeenCalledOnce();
    expect(wire.getModel(ResearchCursorModel).cursor).toMatchObject({ checkpointId: 'cp1', entryId: 'e1' });
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();
  });

  it('does not overwrite a committed cursor with a different entry', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const showSpy = vi.fn<(opts: { id: string }) => Promise<AitpShowResult>>().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
    });
    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0 }, findings: [],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub());

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });
    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e2' })).rejects.toThrow(
      'already committed',
    );

    expect(showSpy).toHaveBeenCalledOnce();
    expect(wire.getModel(ResearchCursorModel).cursor).toMatchObject({ checkpointId: 'cp1', entryId: 'e1' });
  });

  it('rechecks pending state after the adapter barrier before advancing the cursor', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    let releaseShow!: (result: AitpShowResult) => void;
    const showResult: AitpShowResult = {
      schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
    };
    const showPromise = new Promise<AitpShowResult>((resolve) => { releaseShow = resolve; });
    const showSpy = vi.fn<(opts: { id: string }) => Promise<AitpShowResult>>().mockReturnValue(showPromise);
    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0 }, findings: [],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    const modeSvc = makeStubModeSvc();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub());

    const commitPromise = svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });
    expect(showSpy).toHaveBeenCalledWith({ id: 'e1' });
    wire.dispatch(researchAcknowledgeCheckpoint({ checkpointId: 'cp1', entryId: 'external-e1' }));
    releaseShow(showResult);

    await expect(commitPromise).rejects.toThrow('changed while the AITP show barrier was running');
    expect(checkSpy).not.toHaveBeenCalled();
    expect(modeSvc._setPhaseCalls).not.toContain('degraded');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();
  });

  it('rechecks the committed cursor after the asynchronous check barrier', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    let releaseCheck!: (report: AitpCheckReport) => void;
    const checkPromise = new Promise<AitpCheckReport>((resolve) => { releaseCheck = resolve; });
    const checkSpy = vi.fn<() => Promise<AitpCheckReport>>().mockReturnValue(checkPromise);
    const adapter = makeStubAdapter({ check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub());

    const commitPromise = svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });
    await vi.waitFor(() => expect(checkSpy).toHaveBeenCalledOnce());
    wire.dispatch(researchCommitCheckpoint({ checkpointId: 'external', entryId: 'e2', committedAt: 2000 }));
    releaseCheck({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0 }, findings: [],
    });

    await expect(commitPromise).rejects.toThrow('changed while the AITP commit barrier was running');
    expect(wire.getModel(ResearchCursorModel).cursor).toMatchObject({
      checkpointId: 'external',
      entryId: 'e2',
    });
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe('cp1');
  });

  it('rejects when check reports error findings (degraded, cursor not advanced)', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'findings',
      counts: { entries: 1, notes: 0, errors: 1, warnings: 0 },
      findings: [{ level: 'error', code: 'missing_refs', path: 'e.md', message: 'missing refs' }],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc();
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('error finding');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe('cp1');
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });

  it('rejects when show throws (degraded, cursor not advanced)', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const showSpy = vi.fn().mockRejectedValue(new Error('show failed'));
    const adapter = makeStubAdapter({ show: showSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc();
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('commit barrier failed');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });
});

describe('research.updated snapshot event', () => {
  it('publishes a research.updated event with a full snapshot after createQuestion', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1000 }));

    const events: { type: string; snapshot?: unknown }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => events.push(e as never)));

    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), adapter, makeToolExecutorStub());

    svc.createQuestion({ lineSlug: 'main', wording: 'Test Q' });

    expect(events).toHaveLength(1);
    const snapshot = events[0]!.snapshot as { questions: unknown[]; revision: number };
    expect(snapshot.questions).toHaveLength(1);
    expect(snapshot.revision).toBeGreaterThan(0);
  });
});

describe('line and focus coordination', () => {
  it('setFocus automatically selects the question line and publishes a consistent snapshot', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    svc.createLine({ slug: 'alt', title: 'Alternative' });
    const question = svc.createQuestion({ lineSlug: 'alt', wording: 'Q1' });

    const events: { snapshot?: { currentLineSlug?: string; currentFocus?: { questionId: string } } }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (event) => events.push(event as never)));
    svc.setFocus(question.id, 'bounded action');

    const snapshot = svc.getSnapshot();
    expect(snapshot.currentLineSlug).toBe('alt');
    expect(snapshot.currentFocus?.questionId).toBe(question.id);
    expect(events.at(-1)?.snapshot?.currentLineSlug).toBe('alt');
    expect(events.at(-1)?.snapshot?.currentFocus?.questionId).toBe(question.id);
  });

  it('updateQuestion rejects missing and stale question revisions', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });

    const updated = svc.updateQuestion({
      questionId: question.id,
      expectedRevision: question.revision,
      assessment: 'supported direction',
    });
    expect(updated.assessment).toBe('supported direction');
    expect(() => svc.updateQuestion({
      questionId: question.id,
      expectedRevision: question.revision,
      wording: 'stale',
    })).toThrow('Research question revision is stale');
    expect(() => svc.updateQuestion({ questionId: 'missing', wording: 'nope' })).toThrow('Question missing not found');
  });

  it('switchLine validates the target and clears focus from another line', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    svc.setFocus(question.id);
    const before = svc.getSnapshot();

    expect(() => {
      svc.switchLine('missing', before.revision);
    }).toThrow('Line missing not found');
    svc.createLine({ slug: 'alt', title: 'Alternative' });
    const switchRevision = svc.getSnapshot().revision;
    svc.switchLine('alt', switchRevision);

    const snapshot = svc.getSnapshot();
    expect(snapshot.currentLineSlug).toBe('alt');
    expect(snapshot.currentFocus).toBeUndefined();
  });
});

describe('public research mutation guards', () => {
  it('rejects every public Research mutation while the mode is inactive', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    const mutations = [
      () => svc.createLine({ slug: 'main', title: 'Main' }),
      () => svc.createQuestion({ lineSlug: 'main', wording: 'Q1' }),
      () => svc.updateLine({ slug: 'main' }),
      () => svc.updateQuestion({ questionId: 'q1' }),
      () => svc.setFocus('q1'),
      () => svc.switchLine('main'),
      () => svc.steer({ kind: 'defer_question', questionId: 'q1', expectedRevision: 0 }),
      () => svc.steer({ kind: 'pause_loop', expectedRevision: 0 }),
      () => svc.reopenQuestion('q1'),
      () => svc.proposeCheckpoint({}),
    ];

    for (const mutation of mutations) {
      expect(mutation).toThrow('AITP Research Mode is inactive');
    }
    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow(
      'AITP Research Mode is inactive',
    );
  });

  it('rejects research mutations while the loop is paused', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    modeSvc.pauseLoop(wire.getModel(ResearchModel).current.revision);

    expect(() => svc.createLine({ slug: 'alt', title: 'Alternative' })).toThrow(
      'Research loop is paused',
    );
  });

  it('allows paused question recovery but keeps model-progress mutations blocked', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    svc.steer({
      kind: 'close_question',
      questionId: question.id,
      expectedRevision: svc.getSnapshot().revision,
    });
    modeSvc.pauseLoop(svc.getSnapshot().revision);

    expect(() => svc.setFocus(question.id)).toThrow('Research loop is paused');
    expect(() => svc.proposeCheckpoint({ questionId: question.id })).toThrow(
      'Research loop is paused',
    );

    svc.steer({
      kind: 'reopen_question',
      questionId: question.id,
      expectedRevision: svc.getSnapshot().revision,
      reason: 'new evidence',
    });
    expect(svc.getSnapshot().questions.find((item) => item.id === question.id)).toMatchObject({
      workflow: 'open',
      persistence: 'working',
    });

    svc.steer({
      kind: 'defer_question',
      questionId: question.id,
      expectedRevision: svc.getSnapshot().revision,
    });
    expect(svc.getSnapshot().questions.find((item) => item.id === question.id)?.workflow).toBe('deferred');
  });

  it('rejects direct subagent mutations even when the tool guard is bypassed', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx('subagent-1'),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
    );

    expect(() => svc.createLine({ slug: 'main', title: 'Main' })).toThrow(
      'only available on the main agent',
    );
  });

  it('rejects questions that reference a missing line', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    expect(() => svc.createQuestion({ lineSlug: 'missing', wording: 'Orphan' })).toThrow(
      'Line missing not found',
    );
  });

  it('rejects a checkpoint whose question and line do not match without creating pending state', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.createLine({ slug: 'main', title: 'Main' });
    svc.createLine({ slug: 'alt', title: 'Alternative' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });

    expect(() => svc.proposeCheckpoint({ questionId: question.id, lineSlug: 'alt' })).toThrow(
      `Line alt does not own question ${question.id}`,
    );
    expect(svc.getPendingCheckpoint()).toBeNull();
  });

  it('rejects unknown question ids for steering and reopening', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    for (const kind of ['defer_question', 'block_question', 'close_question'] as const) {
      expect(() => svc.steer({
        kind,
        questionId: 'missing',
        expectedRevision: svc.getSnapshot().revision,
      })).toThrow('Question missing not found');
    }
    expect(() => svc.reopenQuestion('missing', undefined, svc.getSnapshot().revision)).toThrow(
      'Question missing not found',
    );
  });
});

describe('pause/resume persists loopStatus', () => {
  it('pauseLoop dispatches aitp_mode.set_loop_status paused', () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    expect(wire.getModel(AitpModeModel).current.loopStatus).toBe('active');
    wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'paused' }));
    expect(wire.getModel(AitpModeModel).current.loopStatus).toBe('paused');
    wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'active' }));
    expect(wire.getModel(AitpModeModel).current.loopStatus).toBe('active');
  });

  it('pauseLoop and resumeLoop use the public research revision guard', async () => {
    const modeSvc = await buildRealModeService();
    await modeSvc.enter({ actor: 'user' });
    const revision = wire.getModel(ResearchModel).current.revision;

    expect(() => modeSvc.pauseLoop(revision + 1)).toThrow('Research revision is stale');
    modeSvc.pauseLoop(revision);
    expect(modeSvc.loopStatus).toBe('paused');
    modeSvc.resumeLoop(revision);
    expect(modeSvc.loopStatus).toBe('active');
  });

  it('loopStatus follows conversation undo', () => {
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'paused' }));
    expect(wire.getModel(AitpModeModel).current.loopStatus).toBe('paused');
    wire.dispatch(contextUndo({ count: 1 }));
    expect(wire.getModel(AitpModeModel).current.phase).toBe('inactive');
    expect(wire.getModel(AitpModeModel).current.loopStatus).toBe('active');
  });
});

describe('exit resets adapter', () => {
  it('exit dispatches aitp_mode.exit and adapter.reset() is called', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));

    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1' });

    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      { enabled: () => true } as never,
      makeScopeCtx(),
      { status: async () => null } as never,
      adapter,
      eventBus,
    );

    await modeSvc.exit();
    expect(wire.getModel(AitpModeModel).current.phase).toBe('inactive');
    expect(adapter.health.phase).toBe('inactive');
  });
});

describe('undo/cold restore reconcile', () => {
  it('reconcileAfterRestore resets adapter when mode is inactive after undo', async () => {
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));

    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1' });

    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    new AgentAitpModeService(
      wire,
      { enabled: () => true } as never,
      makeScopeCtx(),
      { status: async () => null } as never,
      adapter,
      eventBus,
    );

    wire.dispatch(contextUndo({ count: 1 }));
    eventBus.publish({ type: 'context.undone', turns: 1 });
    expect(wire.getModel(AitpModeModel).current.phase).toBe('inactive');
    expect(adapter.health.phase).toBe('inactive');
  });

  it('does not let an obsolete enter probe restore the mode after exit', async () => {
    const adapter = makeStubAdapter();
    let resolveProbe!: (health: AitpAdapterHealth) => void;
    vi.spyOn(adapter, 'probe').mockImplementation(() => new Promise((resolve) => {
      resolveProbe = resolve;
    }));

    const modeSvc = await buildRealModeService(adapter);
    const enterPromise = modeSvc.enter({ actor: 'user' });
    await vi.waitFor(() => expect(adapter.probe).toHaveBeenCalledOnce());
    expect(modeSvc.phase).toBe('probing');

    await modeSvc.exit();
    resolveProbe({ phase: 'ready', contractVersion: '0.1' });
    await enterPromise;

    expect(modeSvc.phase).toBe('inactive');
    expect(adapter.health.phase).toBe('inactive');
  });

  it('re-probes the adapter after an active undo', async () => {
    const adapter = makeStubAdapter();
    const probeSpy = vi.spyOn(adapter, 'probe');
    const modeSvc = await buildRealModeService(adapter);
    await modeSvc.enter({ actor: 'user' });
    const probesAfterEnter = probeSpy.mock.calls.length;

    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
    wire.dispatch(contextUndo({ count: 1 }));
    eventBus.publish({ type: 'context.undone', turns: 1 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(modeSvc.isActive).toBe(true);
    expect(probeSpy).toHaveBeenCalledTimes(probesAfterEnter + 1);
  });

  it('re-probes the adapter after an active cold restore', async () => {
    const adapter = makeStubAdapter();
    const probeSpy = vi.spyOn(adapter, 'probe');
    const modeSvc = await buildRealModeService(adapter);
    await modeSvc.enter({ actor: 'user' });
    const probesAfterEnter = probeSpy.mock.calls.length;

    await wire.restore();

    expect(modeSvc.isActive).toBe(true);
    expect(probeSpy).toHaveBeenCalledTimes(probesAfterEnter + 1);
  });
});

describe('UpdateGoal barrier and subagent veto', () => {
  it('vetoes UpdateGoal(complete) when a pending checkpoint exists and mode is active', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc({ isActive: true });
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub());

    const event = makeVetoEvent('UpdateGoal', { status: 'complete' });
    await (svc as unknown as { guardToolExecution: (e: BeforeToolExecuteEventImpl) => Promise<void> }).guardToolExecution(event);

    expect(event.vetoResult).toBeDefined();
    expect(event.vetoResult?.isError).toBe(true);
    expect(event.vetoResult?.output).toContain('pending commit');
  });

  it('does not veto UpdateGoal(complete) when no pending checkpoint', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));

    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc({ isActive: true });
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub());

    const event = makeVetoEvent('UpdateGoal', { status: 'complete' });
    await (svc as unknown as { guardToolExecution: (e: BeforeToolExecuteEventImpl) => Promise<void> }).guardToolExecution(event);

    expect(event.vetoResult).toBeUndefined();
  });

  it('does not veto UpdateGoal(non-complete)', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc({ isActive: true });
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub());

    const event = makeVetoEvent('UpdateGoal', { status: 'blocked' });
    await (svc as unknown as { guardToolExecution: (e: BeforeToolExecuteEventImpl) => Promise<void> }).guardToolExecution(event);

    expect(event.vetoResult).toBeUndefined();
  });

  it('vetoes AITP mutation tools on subagents', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));

    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc({ isActive: true });
    const svc = new AgentResearchService(wire, makeAgentScopeContext({ agentId: 'subagent-1', agentScope: '' }), eventBus, modeSvc, adapter, makeToolExecutorStub());

    const event = makeVetoEvent('CreateResearchQuestion', { line_slug: 'main', wording: 'test' });
    await (svc as unknown as { guardToolExecution: (e: BeforeToolExecuteEventImpl) => Promise<void> }).guardToolExecution(event);

    expect(event.vetoResult).toBeDefined();
    expect(event.vetoResult?.isError).toBe(true);
    expect(event.vetoResult?.output).toContain('main agent');
  });
});

describe('mode signal event chain', () => {
  it('enter fires aitp_mode.updated exactly once per op (not duplicated by service)', async () => {
    const modeEvents: { type: string }[] = [];
    disposables.add(eventBus.subscribe('aitp_mode.updated', (e) => modeEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    await modeSvc.enter({ actor: 'user' });

    // enter dispatches aitp_mode.enter (toEvent → 1 aitp_mode.updated),
    // then setPhase('ready') dispatches aitp_mode.set_phase (toEvent → 1 more).
    // The service must NOT manually re-publish aitp_mode.updated.
    expect(modeEvents).toHaveLength(2);
  });

  it('pauseLoop/resumeLoop each fire exactly one aitp_mode.updated', async () => {
    const modeEvents: { type: string }[] = [];
    disposables.add(eventBus.subscribe('aitp_mode.updated', (e) => modeEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    await modeSvc.enter({ actor: 'user' });
    modeEvents.length = 0;

    modeSvc.pauseLoop(wire.getModel(ResearchModel).current.revision);
    expect(modeEvents).toHaveLength(1);
    modeSvc.resumeLoop(wire.getModel(ResearchModel).current.revision);
    expect(modeEvents).toHaveLength(2);
  });

  it('exit fires exactly one aitp_mode.updated', async () => {
    const modeEvents: { type: string }[] = [];
    disposables.add(eventBus.subscribe('aitp_mode.updated', (e) => modeEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    await modeSvc.enter({ actor: 'user' });
    modeEvents.length = 0;

    await modeSvc.exit();
    expect(modeEvents).toHaveLength(1);
  });

  it('undo publishes aitp_mode.updated + agent.status.updated (toEvent is silent on replay)', async () => {
    const modeEvents: { type: string }[] = [];
    const statusEvents: { type: string }[] = [];
    disposables.add(eventBus.subscribe('aitp_mode.updated', (e) => modeEvents.push(e as never)));
    disposables.add(eventBus.subscribe('agent.status.updated', (e) => statusEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    await modeSvc.enter({ actor: 'user' });
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
    modeEvents.length = 0;
    statusEvents.length = 0;

    wire.dispatch(contextUndo({ count: 1 }));
    eventBus.publish({ type: 'context.undone', turns: 1 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(modeEvents).toHaveLength(1);
    expect(statusEvents).toHaveLength(1);
  });

  it('research.updated is published on every mode signal with a complete line snapshot', async () => {
    const researchEvents: {
      type: string;
      snapshot?: { lines: readonly { slug: string }[] };
    }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => researchEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    await buildRealResearchService(modeSvc);

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    // The line is created before aitp_mode.enter, so every mode-triggered
    // research.updated snapshot already contains the selected line.
    expect(researchEvents.length).toBeGreaterThanOrEqual(2);
    for (const e of researchEvents) {
      expect(e.snapshot?.lines.some((line) => line.slug === 'main')).toBe(true);
    }
  });

  it('research.updated snapshot reflects mode phase after pause/resume', async () => {
    const researchEvents: { type: string; snapshot?: { mode: string; loopStatus: string } }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => researchEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    await buildRealResearchService(modeSvc);

    await modeSvc.enter({ actor: 'user' });
    researchEvents.length = 0;

    modeSvc.pauseLoop(wire.getModel(ResearchModel).current.revision);
    const pausedSnapshot = researchEvents[researchEvents.length - 1]!.snapshot;
    expect(pausedSnapshot!.loopStatus).toBe('paused');

    modeSvc.resumeLoop(wire.getModel(ResearchModel).current.revision);
    const resumedSnapshot = researchEvents[researchEvents.length - 1]!.snapshot;
    expect(resumedSnapshot!.loopStatus).toBe('active');
  });

  it('no circular publishing: research.updated does not trigger aitp_mode.updated', async () => {
    const modeEvents: { type: string }[] = [];
    const researchEvents: { type: string }[] = [];
    disposables.add(eventBus.subscribe('aitp_mode.updated', (e) => modeEvents.push(e as never)));
    disposables.add(eventBus.subscribe('research.updated', (e) => researchEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    modeEvents.length = 0;
    researchEvents.length = 0;

    wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1000 }));
    researchSvc.createQuestion({ lineSlug: 'main', wording: 'Test Q' });

    // research.updated should fire (from the explicit publish),
    // but aitp_mode.updated should NOT fire (no mode op was dispatched)
    expect(researchEvents.length).toBeGreaterThan(0);
    expect(modeEvents).toHaveLength(0);
  });
});

describe('checkpoint degraded syncs research.updated', () => {
  it('commitCheckpoint degraded fires research.updated with degraded mode', async () => {
    const adapter = makeStubAdapter({
      check: async () => ({
        schema: 'aitp/check-report-0.1', root: '/workspace', status: 'findings',
        counts: { entries: 1, notes: 0, errors: 1, warnings: 0 },
        findings: [{ level: 'error', code: 'missing_refs', path: 'e.md', message: 'missing' }],
      } as AitpCheckReport),
    });
    const modeSvc = await buildRealModeService(adapter);
    const researchSvc = await buildRealResearchService(modeSvc, adapter);

    await modeSvc.enter({ actor: 'user' });
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const researchEvents: { type: string; snapshot?: { mode: string } }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => researchEvents.push(e as never)));

    await expect(researchSvc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('error finding');

    // setPhase('degraded') → aitp_mode.updated → research.updated with degraded mode
    const degradedSnapshot = researchEvents.find((e) => e.snapshot?.mode === 'degraded');
    expect(degradedSnapshot).toBeDefined();
  });
});

describe('injection active guidance', () => {
  it('renders guidance section when mode is active', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers: { name: string; fn: () => string | undefined }[] = [];
    const stubInjector = {
      _serviceBrand: undefined as undefined,
      register(name: string, fn: () => string | undefined) {
        providers.push({ name, fn });
        return { dispose: () => {} };
      },
      reconcileWhenIdle: async () => {},
    };
    new AitpResearchInjection(stubInjector as never, modeSvc, researchSvc);

    expect(providers).toHaveLength(1);
    expect(providers[0]!.name).toBe('aitp_research');
    const output = providers[0]!.fn();
    expect(output).toBeDefined();
    expect(output).toContain('Research state guidance');
    expect(output).toContain('CreateResearchQuestion');
    expect(output).toContain('SetResearchFocus');
    expect(output).toContain('UpdateResearchQuestion');
    expect(output).toContain('ProposeResearchCheckpoint');
  });

  it('returns undefined when mode is inactive', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers: { name: string; fn: () => string | undefined }[] = [];
    const stubInjector = {
      _serviceBrand: undefined as undefined,
      register(name: string, fn: () => string | undefined) {
        providers.push({ name, fn });
        return { dispose: () => {} };
      },
      reconcileWhenIdle: async () => {},
    };
    new AitpResearchInjection(stubInjector as never, modeSvc, researchSvc);

    const output = providers[0]!.fn();
    expect(output).toBeUndefined();
  });
});

function makeToolExecutorStub() {
  return {
    onBeforeExecuteTool: () => ({ dispose: () => {} }),
  } as unknown as import('#/agent/toolExecutor/toolExecutor').IAgentToolExecutorService;
}

async function buildRealModeService(adapter?: ReturnType<typeof makeStubAdapter>) {
  const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
  return new AgentAitpModeService(
    wire,
    { enabled: () => true } as never,
    makeScopeCtx(),
    { status: async () => null } as never,
    adapter ?? makeStubAdapter(),
    eventBus,
  );
}

async function buildRealResearchService(
  modeSvc: Awaited<ReturnType<typeof buildRealModeService>>,
  adapter?: ReturnType<typeof makeStubAdapter>,
) {
  const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
  return new AgentResearchService(
    wire,
    makeScopeCtx(),
    eventBus,
    modeSvc,
    adapter ?? makeStubAdapter(),
    makeToolExecutorStub(),
  );
}

// ---------------------------------------------------------------------------
// Regression tests: launcher exit-code handling, error envelopes, schemas,
// argv precision, and checkpoint barrier semantics.
// ---------------------------------------------------------------------------

function completedProcessWith(stdoutText: string, exitCode = 0, stderrText = ''): IHostProcess {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.end(stdoutText);
  stderr.end(stderrText);
  return {
    _serviceBrand: undefined,
    pid: 1,
    exitCode,
    stdin,
    stdout,
    stderr,
    wait: () => new Promise((resolve) => setImmediate(() => resolve(exitCode))),
    kill: async () => {},
    dispose: () => {},
  };
}

/** Build a managed-plugin adapter whose spawn returns scripted responses in order. */
function buildScriptedAdapter(scripts: { stdout: string; exitCode?: number; stderr?: string }[]) {
  const catalog = new InMemorySkillCatalog();
  catalog.register(stubSkill('aitp', {
    path: `${SKILL_DIR}/SKILL.md`,
    dir: SKILL_DIR,
    source: 'extra',
    plugin: { id: 'aitp-research-protocol' },
  }), { replace: true });

  const files = new Map<string, string>([
    [CONTRACT_PATH, JSON.stringify({
      schema: 'aitp/adapter-contract-0.1',
      plugin: { name: 'aitp-research-protocol', version: '0.8.0' },
      python: { min_minor: 11, launcher: 'scripts/aitp.py', skills_dir: 'skills/' },
    })],
    [MANIFEST_PATH, JSON.stringify({
      name: 'aitp-research-protocol',
      version: '0.8.0',
      skills: './skills/',
    })],
  ]);

  let callIndex = 0;
  const spawn = vi.fn<IHostProcessService['spawn']>(async (_cmd, args) => {
    // Python probe calls have '-c' in args — always return the probe response.
    if (args !== undefined && args.includes('-c')) {
      return completedProcessWith('(3, 13, 0)\n');
    }
    const script = scripts[callIndex] ?? scripts[scripts.length - 1]!;
    callIndex++;
    return completedProcessWith(script.stdout, script.exitCode ?? 0, script.stderr ?? '');
  });

  const ix = createServices(disposables, {
    strict: true,
    additionalServices: (reg) => {
      reg.definePartialInstance(ISessionSkillCatalog, {
        catalog,
        ready: Promise.resolve(),
      });
      reg.definePartialInstance(IHostFileSystem, {
        readText: async (path) => {
          const text = files.get(path);
          if (text === undefined) throw new Error(`missing: ${path}`);
          return text;
        },
        stat: async (path) => {
          const text = files.get(path);
          if (text === undefined) throw new Error(`missing: ${path}`);
          return { isFile: true, isDirectory: false, size: text.length };
        },
      });
      reg.definePartialInstance(IHostProcessService, { spawn });
      reg.defineInstance(ISessionContext, makeSessionContext({
        sessionId: 'session',
        workspaceId: 'workspace',
        sessionDir: '/sessions/session',
        sessionScope: 'session',
        cwd: '/workspace',
      }));
      reg.defineInstance(ILogService, stubLog());
      reg.define(ISessionAitpAdapter, SessionAitpAdapterService);
    },
  });
  return { adapter: ix.get(ISessionAitpAdapter), spawn };
}

/** Golden enter-0.2 payload matching the real CLI shape. */
const GOLDEN_ENTER_0_2 = {
  schema: 'aitp/enter-0.2',
  memory_status: 'available',
  root: '/workspace',
  topic: { id: 'topic-abc', title: 'Test Topic', goal: { text: 'Not established yet', source: '.aitp/topic/TOPIC.md' } },
  recent_entries: [],
  unresolved_failures: [],
  next_action: { status: 'not_established', source: null },
  latest_working_note: null,
  recent_notes: [],
  counts: { active: 0, superseded: 0, unresolved_failures: 0, malformed: 0, omitted_active: 0, active_newer_than_latest_working_note: null },
  warnings: [],
};

/** Golden check-report-0.1 payload (exit 1 = findings). */
const GOLDEN_CHECK_FINDINGS = {
  schema: 'aitp/check-report-0.1',
  root: '/workspace',
  status: 'findings',
  counts: { entries: 1, notes: 0, errors: 0, warnings: 1 },
  findings: [{ level: 'warning', code: 'empty_topic_goal', path: '.aitp/topic/TOPIC.md', message: 'Research Goal is not established' }],
};

/** Golden check-report-0.1 with error findings. */
const GOLDEN_CHECK_ERRORS = {
  schema: 'aitp/check-report-0.1',
  root: '/workspace',
  status: 'findings',
  counts: { entries: 1, notes: 0, errors: 1, warnings: 0 },
  findings: [{ level: 'error', code: 'missing_refs', path: '.aitp/topic/entries/entry-x.md', message: 'result requires nonempty refs' }],
};

/** Golden check-report-0.2 (scoped, with by_code + outside_scope). */
const GOLDEN_CHECK_0_2 = {
  schema: 'aitp/check-report-0.2',
  root: '/workspace',
  status: 'findings',
  workstream: 'ws-1',
  counts: { entries: 1, notes: 0, errors: 1, warnings: 0, by_code: { missing_refs: { errors: 1, warnings: 0 } }, outside_scope: { errors: 0, warnings: 1 } },
  findings: [{ level: 'error', code: 'missing_refs', path: '.aitp/topic/entries/entry-x.md', message: 'result requires nonempty refs' }],
};

/** Golden list-0.1 payload. */
const GOLDEN_LIST_0_1 = {
  schema: 'aitp/list-0.1',
  root: '/workspace',
  count: 0,
  entries: [],
  warnings: [],
};

/** Golden show-0.1 payload (active entry). */
const GOLDEN_SHOW_0_1 = {
  schema: 'aitp/show-0.1',
  root: '/workspace',
  id: 'entry-abcdef0123456789abcdef0123456789',
  status: 'active',
  source: '.aitp/topic/entries/entry-abcdef0123456789abcdef0123456789.md',
  legacy_derived: false,
  frontmatter: { id: 'entry-abcdef0123456789abcdef0123456789', kind: 'observation' },
  body: 'Some body text',
};

/** Golden show-0.1 malformed (frontmatter: null). */
const GOLDEN_SHOW_MALFORMED = {
  schema: 'aitp/show-0.1',
  root: '/workspace',
  id: 'entry-bad',
  status: 'malformed',
  source: '.aitp/topic/entries/entry-bad.md',
  legacy_derived: false,
  frontmatter: null,
  body: '---\nbroken yaml\n',
  warning: { code: 'invalid_schema', path: '.aitp/topic/entries/entry-bad.md', message: 'bad frontmatter' },
};

/** Golden record prepare (prepared). */
const GOLDEN_RECORD_PREPARE = {
  status: 'prepared',
  id: 'entry-new',
  path: '.aitp/local/drafts/entry-new.md',
  save_command: 'aitp record save .aitp/local/drafts/entry-new.md',
};

/** Golden record prepare (existing). */
const GOLDEN_RECORD_EXISTING = {
  status: 'existing',
  path: '.aitp/topic/entries/entry-existing.md',
  idempotency_key: 'key-1',
};

/** Golden record save. */
const GOLDEN_RECORD_SAVE = { status: 'saved', path: '.aitp/topic/entries/entry-saved.md' };

/** Golden note prepare. */
const GOLDEN_NOTE_PREPARE = {
  status: 'prepared',
  id: 'note-new',
  path: '.aitp/local/drafts/note-new.md',
  save_command: 'aitp note save .aitp/local/drafts/note-new.md',
};

/** Golden note save. */
const GOLDEN_NOTE_SAVE = { status: 'saved', path: '.aitp/topic/notes/note-saved.md' };

/** AITP error envelope (stdout JSON, exit 2). */
const AITP_ERROR_ENVELOPE = {
  status: 'error',
  code: 'not_initialized',
  message: 'AITP workspace is not initialized',
};

describe('launcher exit-code and error handling', () => {
  it('check exit 1 is a normal findings report, not a tool error', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_CHECK_FINDINGS), exitCode: 1 },
    ]);
    await adapter.probe();
    const report = await adapter.check();
    expect(report.schema).toBe('aitp/check-report-0.1');
    expect(report.status).toBe('findings');
    expect(report.counts.errors).toBe(0);
    expect(report.counts.warnings).toBe(1);
    expect(adapter.health.phase).toBe('ready');
  });

  it('exit 2 stdout error envelope preserves AITP code/message', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(AITP_ERROR_ENVELOPE), exitCode: 2 },
    ]);
    await adapter.probe();
    await expect(adapter.check()).rejects.toThrow('not_initialized');
    // not_initialized should set typed health flag
    expect(adapter.health.phase).toBe('degraded');
    expect(adapter.health.notInitialized).toBe(true);
  });

  it('not_initialized error updates health with typed code', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ status: 'error', code: 'not_initialized', message: 'no .aitp/store.json' }), exitCode: 2 },
    ]);
    await adapter.probe();
    await expect(adapter.enter()).rejects.toThrow();
    expect(adapter.health.notInitialized).toBe(true);
    expect(adapter.health.phase).toBe('degraded');
  });

  it('non-not_initialized exit 2 does not set notInitialized', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ status: 'error', code: 'entry_not_found', message: 'no Entry' }), exitCode: 2 },
    ]);
    await adapter.probe();
    await expect(adapter.show({ id: 'entry-missing' })).rejects.toThrow('entry_not_found');
    expect(adapter.health.notInitialized).toBeUndefined();
  });

  it('argparse stderr-only fallback when stdout is not JSON', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: '', exitCode: 2, stderr: 'usage: aitp check [--workstream WORKSTREAM]\nerror: unrecognized arguments: --bad' },
    ]);
    await adapter.probe();
    await expect(adapter.check()).rejects.toThrow('unrecognized arguments');
    expect(adapter.health.notInitialized).toBeUndefined();
    expect(adapter.health.phase).toBe('ready');
  });

  it('non-JSON stdout on success exit fails closed with contract_unknown', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: 'not json at all', exitCode: 0 },
    ]);
    await adapter.probe();
    await expect(adapter.check()).rejects.toThrow('non-JSON');
    expect(adapter.health.phase).toBe('degraded');
  });

  it('unknown schema version fails closed', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ schema: 'aitp/check-report-0.9', root: '/w', status: 'clean', counts: {}, findings: [] }), exitCode: 0 },
    ]);
    await adapter.probe();
    await expect(adapter.check()).rejects.toThrow('schema validation');
    expect(adapter.health.phase).toBe('degraded');
  });

  it('version-0 record prepare with unknown status fails closed', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ status: 'unknown_status', path: '/x' }), exitCode: 0 },
    ]);
    await adapter.probe();
    await expect(adapter.recordPrepare({ kind: 'observation' })).rejects.toThrow('schema validation');
  });

  it('version-0 record prepare with extra keys fails closed', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ status: 'prepared', id: 'e1', path: '/x', save_command: 'cmd', extra_key: 'bad' }), exitCode: 0 },
    ]);
    await adapter.probe();
    await expect(adapter.recordPrepare({ kind: 'observation' })).rejects.toThrow('schema validation');
  });

  it('error envelope with extra key falls back to stderr, not not_initialized', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ status: 'error', code: 'not_initialized', message: 'msg', extra: 'bad' }), exitCode: 2, stderr: 'argparse misuse' },
    ]);
    await adapter.probe();
    await expect(adapter.check()).rejects.toThrow('argparse misuse');
    expect(adapter.health.notInitialized).toBeUndefined();
    expect(adapter.health.phase).toBe('ready');
  });
});

describe('read transport schema validation', () => {
  it('parses enter-0.2 golden shape', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_ENTER_0_2), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.enter();
    expect(result.schema).toBe('aitp/enter-0.2');
    expect(result.topic.id).toBe('topic-abc');
  });

  it('parses enter-0.3 with workstream', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ ...GOLDEN_ENTER_0_2, schema: 'aitp/enter-0.3', workstream: 'ws-1' }), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.enter({ workstream: 'ws-1' });
    expect(result.schema).toBe('aitp/enter-0.3');
  });

  it('parses list-0.1 golden shape', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_LIST_0_1), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.list();
    expect(result.schema).toBe('aitp/list-0.1');
  });

  it('parses list-0.2 with workstream', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ ...GOLDEN_LIST_0_1, schema: 'aitp/list-0.2', workstream: 'ws-1' }), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.list({ workstream: 'ws-1' });
    expect(result.schema).toBe('aitp/list-0.2');
  });

  it('parses show-0.1 active entry', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_SHOW_0_1), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.show({ id: 'entry-abcdef0123456789abcdef0123456789' });
    expect(result.status).toBe('active');
    expect(result.frontmatter).not.toBeNull();
  });

  it('parses show-0.1 malformed (frontmatter null)', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_SHOW_MALFORMED), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.show({ id: 'entry-bad' });
    expect(result.status).toBe('malformed');
    expect(result.frontmatter).toBeNull();
  });

  it('parses check-report-0.1', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_CHECK_FINDINGS), exitCode: 1 },
    ]);
    await adapter.probe();
    const result = await adapter.check();
    expect(result.schema).toBe('aitp/check-report-0.1');
  });

  it('parses check-report-0.2 scoped', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_CHECK_0_2), exitCode: 1 },
    ]);
    await adapter.probe();
    const result = await adapter.check({ workstream: 'ws-1' });
    expect(result.schema).toBe('aitp/check-report-0.2');
  });

  it('rejects enter-0.2 with top-level extra key (fail-closed)', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ ...GOLDEN_ENTER_0_2, extra_top_level: 'bad' }), exitCode: 0 },
    ]);
    await adapter.probe();
    await expect(adapter.enter()).rejects.toThrow('schema validation');
  });

  it('rejects enter-0.2 with nested extra key in topic (fail-closed)', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify({ ...GOLDEN_ENTER_0_2, topic: { ...GOLDEN_ENTER_0_2.topic, extra_nested: 'bad' } }), exitCode: 0 },
    ]);
    await adapter.probe();
    await expect(adapter.enter()).rejects.toThrow('schema validation');
  });
});

describe('write transport schema validation', () => {
  it('parses record prepare (prepared)', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_RECORD_PREPARE), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.recordPrepare({ kind: 'observation' });
    expect(result.status).toBe('prepared');
    expect(result.path).toContain('entry-new');
  });

  it('parses record prepare (existing)', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_RECORD_EXISTING), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.recordPrepare({ kind: 'result', idempotencyKey: 'key-1' });
    expect(result.status).toBe('existing');
  });

  it('parses record save', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_RECORD_SAVE), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.recordSave({ draftPath: '.aitp/local/drafts/entry.md' });
    expect(result.status).toBe('saved');
  });

  it('parses note prepare', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_NOTE_PREPARE), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.notePrepare({ mode: 'working', title: 'T', createdBy: 'agent:test' });
    expect(result.status).toBe('prepared');
  });

  it('parses note save', async () => {
    const { adapter } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_NOTE_SAVE), exitCode: 0 },
    ]);
    await adapter.probe();
    const result = await adapter.noteSave({ draftPath: '.aitp/local/drafts/note.md' });
    expect(result.status).toBe('saved');
  });
});

/** Find the first non-probe spawn call (args don't include '-c'). */
function findCommandCall(spawn: ReturnType<typeof vi.fn>): readonly unknown[] {
  const call = spawn.mock.calls.find((c) => {
    const args = c[1] as readonly string[];
    return !args.includes('-c');
  });
  if (call === undefined) throw new Error('no command call found');
  return call;
}

describe('launcher argv precision', () => {
  it('enter passes --recent and --workstream', async () => {
    const { adapter, spawn } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_ENTER_0_2), exitCode: 0 },
    ]);
    await adapter.probe();
    await adapter.enter({ workstream: 'ws-1', recent: 5 });
    const enterCall = findCommandCall(spawn);
    expect(enterCall?.[1]).toContain('--recent');
    expect(enterCall?.[1]).toContain('5');
    expect(enterCall?.[1]).toContain('--workstream');
    expect(enterCall?.[1]).toContain('ws-1');
  });

  it('list passes --kind, --since, and --workstream', async () => {
    const { adapter, spawn } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_LIST_0_1), exitCode: 0 },
    ]);
    await adapter.probe();
    await adapter.list({ kind: 'result', since: '2025-01-01T00:00:00Z', workstream: 'ws-1' });
    const listCall = findCommandCall(spawn);
    expect(listCall?.[1]).toContain('--kind');
    expect(listCall?.[1]).toContain('result');
    expect(listCall?.[1]).toContain('--since');
    expect(listCall?.[1]).toContain('2025-01-01T00:00:00Z');
    expect(listCall?.[1]).toContain('--workstream');
    expect(listCall?.[1]).toContain('ws-1');
  });

  it('record prepare passes --kind, --authority, --created-by, --idempotency-key, --workstream', async () => {
    const { adapter, spawn } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_RECORD_PREPARE), exitCode: 0 },
    ]);
    await adapter.probe();
    await adapter.recordPrepare({
      kind: 'decision',
      authority: 'agent',
      createdBy: 'agent:kimi',
      idempotencyKey: 'key-1',
      workstreams: ['ws-a', 'ws-b'],
    });
    const prepCall = findCommandCall(spawn);
    const argv = prepCall?.[1] as string[];
    expect(argv).toContain('--kind');
    expect(argv[argv.indexOf('--kind') + 1]).toBe('decision');
    expect(argv).toContain('--authority');
    expect(argv[argv.indexOf('--authority') + 1]).toBe('agent');
    expect(argv).toContain('--created-by');
    expect(argv[argv.indexOf('--created-by') + 1]).toBe('agent:kimi');
    expect(argv).toContain('--idempotency-key');
    expect(argv[argv.indexOf('--idempotency-key') + 1]).toBe('key-1');
    // --workstream is repeatable
    const wsIndices = argv.reduce<number[]>((acc, val, i) => val === '--workstream' ? [...acc, i] : acc, []);
    expect(wsIndices).toHaveLength(2);
    expect(argv[wsIndices[0]! + 1]).toBe('ws-a');
    expect(argv[wsIndices[1]! + 1]).toBe('ws-b');
  });

  it('record save passes only draft positional (no --idempotency-key)', async () => {
    const { adapter, spawn } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_RECORD_SAVE), exitCode: 0 },
    ]);
    await adapter.probe();
    await adapter.recordSave({ draftPath: '.aitp/local/drafts/entry-x.md' });
    const saveCall = findCommandCall(spawn);
    const argv = saveCall?.[1] as string[];
    expect(argv).not.toContain('--idempotency-key');
    // The draft path appears as a positional arg
    expect(argv).toContain('.aitp/local/drafts/entry-x.md');
  });

  it('note prepare passes --mode, --title, --created-by, --workstream', async () => {
    const { adapter, spawn } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_NOTE_PREPARE), exitCode: 0 },
    ]);
    await adapter.probe();
    await adapter.notePrepare({
      mode: 'theory',
      title: 'My Note',
      createdBy: 'agent:kimi',
      workstreams: ['ws-1'],
    });
    const prepCall = findCommandCall(spawn);
    const argv = prepCall?.[1] as string[];
    expect(argv).toContain('--mode');
    expect(argv[argv.indexOf('--mode') + 1]).toBe('theory');
    expect(argv).toContain('--title');
    expect(argv[argv.indexOf('--title') + 1]).toBe('My Note');
    expect(argv).toContain('--created-by');
    expect(argv[argv.indexOf('--created-by') + 1]).toBe('agent:kimi');
    expect(argv).toContain('--workstream');
  });

  it('note save passes only draft positional (no --idempotency-key)', async () => {
    const { adapter, spawn } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_NOTE_SAVE), exitCode: 0 },
    ]);
    await adapter.probe();
    await adapter.noteSave({ draftPath: '.aitp/local/drafts/note-x.md' });
    const saveCall = findCommandCall(spawn);
    const argv = saveCall?.[1] as string[];
    expect(argv).not.toContain('--idempotency-key');
    expect(argv).toContain('.aitp/local/drafts/note-x.md');
  });
});

describe('checkpoint barrier: warning vs error', () => {
  it('warning-only findings allow the cursor (exit 1, 0 errors)', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
      }),
      check: async () => ({
        schema: 'aitp/check-report-0.1', root: '/workspace', status: 'findings',
        counts: { entries: 1, notes: 0, errors: 0, warnings: 1 },
        findings: [{ level: 'warning', code: 'empty_topic_goal', path: '.aitp/topic/TOPIC.md', message: 'no goal' }],
      } as AitpCheckReport),
    });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub());

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });
    expect(wire.getModel(ResearchCursorModel).cursor).not.toBeNull();
    expect(wire.getModel(ResearchCursorModel).cursor!.entryId).toBe('e1');
  });

  it('error findings block the cursor (exit 1, >0 errors)', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
      }),
      check: async () => GOLDEN_CHECK_ERRORS as AitpCheckReport,
    });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc();
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('error finding');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });

  it('adapter check throw (exit 2) fails closed', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));

    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
      }),
      check: async () => { throw new Error('command failed'); },
    });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc();
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('commit barrier failed');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });
});

describe('injection guidance content', () => {
  it('contains canonical-read and line/workstream boundary guidance', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers: { name: string; fn: () => string | undefined }[] = [];
    const stubInjector = {
      _serviceBrand: undefined as undefined,
      register(name: string, fn: () => string | undefined) {
        providers.push({ name, fn });
        return { dispose: () => {} };
      },
      reconcileWhenIdle: async () => {},
    };
    new AitpResearchInjection(stubInjector as never, modeSvc, researchSvc);

    const output = providers[0]!.fn()!;
    expect(output).toContain('aitp_show');
    expect(output).toContain('do not Read the Markdown file');
    expect(output).toContain('different namespaces');
    expect(output).toContain('explicit researcher decision');
    expect(output).toContain('candidate');
    expect(output).toContain('durable AITP decision');
  });
});

describe('tool schema boundary: invalid kind rejected before spawn', () => {
  let toolSchemas: typeof import('#/features/aitpResearch/tools/aitpAdapterTools');

  beforeEach(async () => {
    toolSchemas = await import('#/features/aitpResearch/tools/aitpAdapterTools');
  });

  it('AitpListInputSchema rejects invalid kind', () => {
    const result = toolSchemas.AitpListInputSchema.safeParse({ kind: 'working' });
    expect(result.success).toBe(false);
  });

  it('AitpRecordPrepareInputSchema rejects invalid kind', () => {
    const result = toolSchemas.AitpRecordPrepareInputSchema.safeParse({ kind: 'analysis' });
    expect(result.success).toBe(false);
  });

  it('AitpRecordPrepareInputSchema accepts valid kind', () => {
    const result = toolSchemas.AitpRecordPrepareInputSchema.safeParse({ kind: 'observation', created_by: 'agent:x' });
    expect(result.success).toBe(true);
  });

  it('AitpNotePrepareInputSchema rejects invalid mode', () => {
    const result = toolSchemas.AitpNotePrepareInputSchema.safeParse({ mode: 'draft', title: 'T', created_by: 'agent:x' });
    expect(result.success).toBe(false);
  });

  it('AitpNotePrepareInputSchema accepts working mode', () => {
    const result = toolSchemas.AitpNotePrepareInputSchema.safeParse({ mode: 'working', title: 'T', created_by: 'agent:x' });
    expect(result.success).toBe(true);
  });

  it('AitpRecordSaveInputSchema does not accept idempotency_key', () => {
    const result = toolSchemas.AitpRecordSaveInputSchema.safeParse({ draft_path: '/x', idempotency_key: 'k' });
    expect(result.success).toBe(false);
  });

  it('AitpNoteSaveInputSchema does not accept idempotency_key', () => {
    const result = toolSchemas.AitpNoteSaveInputSchema.safeParse({ draft_path: '/x', idempotency_key: 'k' });
    expect(result.success).toBe(false);
  });

  it('AitpRecordPrepareInputSchema requires created_by when authority is agent (default)', () => {
    expect(toolSchemas.AitpRecordPrepareInputSchema.safeParse({ kind: 'observation' }).success).toBe(false);
    expect(toolSchemas.AitpRecordPrepareInputSchema.safeParse({ kind: 'observation', authority: 'agent' }).success).toBe(false);
  });

  it('AitpRecordPrepareInputSchema allows missing created_by when authority is human', () => {
    expect(toolSchemas.AitpRecordPrepareInputSchema.safeParse({ kind: 'observation', authority: 'human' }).success).toBe(true);
  });

  it('AitpRecordPrepareInputSchema accepts agent authority with created_by', () => {
    expect(toolSchemas.AitpRecordPrepareInputSchema.safeParse({ kind: 'observation', authority: 'agent', created_by: 'agent:x' }).success).toBe(true);
  });

  it('AitpListInputSchema rejects invalid workstream slug', () => {
    expect(toolSchemas.AitpListInputSchema.safeParse({ workstream: 'BAD_WS' }).success).toBe(false);
  });

  it('AitpListInputSchema accepts valid workstream slug', () => {
    expect(toolSchemas.AitpListInputSchema.safeParse({ workstream: 'ws-1' }).success).toBe(true);
  });

  it('AitpRecordPrepareInputSchema rejects duplicate workstreams', () => {
    const result = toolSchemas.AitpRecordPrepareInputSchema.safeParse({ kind: 'observation', created_by: 'agent:x', workstreams: ['ws-a', 'ws-a'] });
    expect(result.success).toBe(false);
  });

  it('AitpRecordPrepareInputSchema rejects empty workstreams array', () => {
    const result = toolSchemas.AitpRecordPrepareInputSchema.safeParse({ kind: 'observation', created_by: 'agent:x', workstreams: [] });
    expect(result.success).toBe(false);
  });
});
