import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DisposableStore } from '#/_base/di/lifecycle';
import { Emitter } from '#/_base/event';
import { SyncDescriptor } from '#/_base/di/descriptors';
import { createServices, TestInstantiationService } from '#/_base/di/test';
import { ILogService } from '#/_base/log/log';
import type { IAgentGoalService } from '#/agent/goal/goal';
import type { IAgentPlanService } from '#/features/plan/plan';
import type { GoalSnapshot, GoalStatus } from '#/agent/goal/types';
import { contextAppendMessage, contextUndo } from '#/agent/contextMemory/contextOps';
import { makeAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { BeforeToolExecuteEventImpl } from '#/agent/toolExecutor/beforeToolExecuteEvent';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import type { TurnStartedEvent } from '#/agent/loop/turnEvents';
import type { ToolExecution, RunnableToolExecution } from '#/tool/toolContract';
import { IEventBus } from '#/app/event/eventBus';
import { EventBusService } from '#/app/event/eventBusService';
import { InMemorySkillCatalog } from '#/app/skillCatalog/registry';
import { SessionAitpAdapterService } from '#/features/aitpResearch/adapter/sessionAitpAdapterService';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import { SessionAitpLifecycleCoordinatorService } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinatorService';
import { IDurableCommitService } from '#/features/aitpResearch/research/durableCommit';
import { DurableCommitService } from '#/features/aitpResearch/research/durableCommitService';
import { createExternalFactFacade } from '#/features/aitpResearch/research/externalFactService';
import type { IAitpExternalFactService } from '#/features/aitpResearch/research/externalFact';
import {
  AitpModeModel,
  ResearchModel,
  ResearchCursorModel,
  aitpModeEnter,
  aitpModeSetPhase,
  aitpModeSetLoopStatus,
  researchProposeCheckpoint,
  researchBindCheckpointEntry,
  researchBindCheckpointReceipt,
  researchCommitCheckpoint,
  researchAcknowledgeCheckpoint,
  researchCreateLine,
} from '#/features/aitpResearch/aitpResearchOps';
import { PlanModel, planModeEnter, planModeExit, planResolution } from '#/features/plan/planOps';
import { ResearchPlanModel } from '#/features/aitpResearch/researchPlanOps';
import { aitpResearchModeFlag } from '#/features/aitpResearch/flag';
import { AitpResearchErrors } from '#/features/aitpResearch/errors';
import {
  parseResearchEvidencePacket,
  type ResearchEvidencePacket,
} from '#/features/aitpResearch/research/evidencePacket';
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
  AitpMaintenanceReceipt,
  ResearchStatusSnapshot,
} from '#/features/aitpResearch/types';
import { renderResearchInjection } from '#/features/aitpResearch/injection/researchInjectionPresenter';
import { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { IHostProcessService, type IHostProcess } from '#/os/interface/hostProcess';
import type { AgentResearchService } from '#/features/aitpResearch/research/agentResearchService';
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

const GOAL_CONTINUATION_ORIGIN = {
  kind: 'system_trigger' as const,
  name: 'goal_continuation' as const,
  goalId: 'goal-test',
};
const GOAL_CONTINUATION_INTENT = {
  kind: 'goal_continuation' as const,
  owner: 'goal' as const,
  goalId: 'goal-test',
};

function runnableExecution(execution: ToolExecution): RunnableToolExecution {
  if (!('execute' in execution)) throw new Error('Expected runnable tool execution');
  return execution;
}

describe('AITP Research flag', () => {
  it('keeps the capability opt-in by default without entering the mode', () => {
    expect(aitpResearchModeFlag.default).toBe(false);
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
  readonly skillPath?: string;
  readonly skillDir?: string;
  readonly statEntries?: ReadonlyMap<string, { readonly isFile: boolean; readonly isDirectory: boolean; readonly size?: number }>;
  readonly spawn?: IHostProcessService['spawn'];
}): {
  readonly adapter: ISessionAitpAdapter;
  readonly spawn: ReturnType<typeof vi.fn<IHostProcessService['spawn']>>;
} {
  const catalog = new InMemorySkillCatalog();
  const skillDir = options?.skillDir ?? SKILL_DIR;
  catalog.register(stubSkill('aitp', {
    path: options?.skillPath ?? `${skillDir}/SKILL.md`,
    dir: skillDir,
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
  const spawn = vi.fn<IHostProcessService['spawn']>();
  spawn.mockImplementation(options?.spawn ?? (async () => completedProcess('(3, 13, 0)\n')));
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
          const entry = options?.statEntries?.get(path);
          if (entry !== undefined) {
            return { ...entry, size: entry.size ?? 0 };
          }
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

  it('searches multiple parent levels for the plugin root', async () => {
    const skillDir = `${PLUGIN_ROOT}/nested/deeper/skills/aitp`;
    const { adapter } = buildManagedPluginAdapter({
      skillDir,
      skillPath: `${skillDir}/SKILL.md`,
    });

    await expect(adapter.probe()).resolves.toMatchObject({ phase: 'ready', pluginVersion: '0.8.0' });
    expect(adapter.resolveContractIdentity()?.pluginRoot).toBe(PLUGIN_ROOT);
  });

  it('continues upward when a successful stat is not a file', async () => {
    const skillDir = `${PLUGIN_ROOT}/non-file/aitp`;
    const nonFile = { isFile: false, isDirectory: true } as const;
    const statEntries = new Map([
      [`${skillDir}/aitp.contract.json`, nonFile],
      [`${skillDir}/kimi.plugin.json`, nonFile],
    ]);
    const { adapter } = buildManagedPluginAdapter({
      skillDir,
      skillPath: `${skillDir}/SKILL.md`,
      statEntries,
    });

    await expect(adapter.probe()).resolves.toMatchObject({ phase: 'ready' });
    expect(adapter.resolveContractIdentity()?.pluginRoot).toBe(PLUGIN_ROOT);
  });

  it('rejects a launcher path that escapes the plugin root', async () => {
    const { adapter, spawn } = buildManagedPluginAdapter({
      contract: {
        schema: 'aitp/adapter-contract-0.1',
        plugin: { name: 'aitp-research-protocol', version: '0.8.0' },
        python: { launcher: '../outside.py' },
      },
    });

    await expect(adapter.probe()).resolves.toMatchObject({
      phase: 'degraded',
      lastError: 'Could not resolve a compatible AITP plugin contract from skill catalog',
    });
    expect(adapter.resolveContractIdentity()).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('isolates a probe that finishes after reset from a subsequent probe', async () => {
    let releaseOldWait!: (exitCode: number) => void;
    const oldWait = new Promise<number>((resolve) => { releaseOldWait = resolve; });
    const oldStdout = new PassThrough();
    const oldStderr = new PassThrough();
    const oldProcess: IHostProcess = {
      _serviceBrand: undefined,
      pid: 11,
      exitCode: null,
      stdin: new PassThrough(),
      stdout: oldStdout,
      stderr: oldStderr,
      wait: () => oldWait,
      kill: async () => {},
      dispose: () => {},
    };
    let probeCalls = 0;
    const spawn = vi.fn<IHostProcessService['spawn']>(async (_command, args) => {
      if (!args?.includes('-c')) return completedProcess('');
      probeCalls += 1;
      if (probeCalls === 1) return oldProcess;
      return completedProcess('(3, 13, 0)\n');
    });
    const { adapter } = buildManagedPluginAdapter({ spawn });

    const oldProbe = adapter.probe();
    await vi.waitFor(() => expect(probeCalls).toBe(1));
    adapter.reset();
    const newProbe = adapter.probe();
    await expect(newProbe).resolves.toMatchObject({ phase: 'ready', pythonVersion: 'python3.13' });
    releaseOldWait(143);
    oldStdout.end();
    oldStderr.end();

    await expect(oldProbe).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
    });
    expect(adapter.health).toMatchObject({ phase: 'ready', pythonVersion: 'python3.13' });
    expect(adapter.resolveContractIdentity()?.pluginVersion).toBe('0.8.0');
  });
});

describe('AITP adapter mutation single-flight', () => {
  it('recovers after a rejected mutation settles', async () => {
    let releaseFirst!: (exitCode: number) => void;
    const firstWait = new Promise<number>((resolve) => {
      releaseFirst = resolve;
    });
    let commandCalls = 0;
    const firstStdout = new PassThrough();
    const firstStderr = new PassThrough();
    firstStdout.end(JSON.stringify({ status: 'error', code: 'entry_exists', message: 'busy' }));
    firstStderr.end();
    const firstProcess: IHostProcess = {
      _serviceBrand: undefined,
      pid: 1,
      exitCode: null,
      stdin: new PassThrough(),
      stdout: firstStdout,
      stderr: firstStderr,
      wait: () => firstWait,
      kill: async () => {},
      dispose: () => {},
    };
    const spawnImplementation = vi.fn<IHostProcessService['spawn']>(async (_command, args) => {
      if (args?.includes('-c')) return completedProcess('(3, 13, 0)\n');
      commandCalls++;
      if (commandCalls === 1) return firstProcess;
      return completedProcess(JSON.stringify({
        status: 'prepared',
        id: 'entry-1',
        path: '.aitp/local/drafts/entry-1.md',
        save_command: 'aitp record save .aitp/local/drafts/entry-1.md',
      }));
    });
    const { adapter } = buildManagedPluginAdapter({ spawn: spawnImplementation });

    await adapter.probe();
    const first = adapter.recordPrepare({ kind: 'observation', createdBy: 'agent:test' });
    const firstResult = expect(first).rejects.toThrow('entry_exists');
    await vi.waitFor(() => {
      expect(commandCalls).toBe(1);
    });
    await expect(adapter.recordPrepare({ kind: 'observation', createdBy: 'agent:test' })).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_SINGLE_FLIGHT,
    });

    releaseFirst(2);
    await firstResult;
    await expect(adapter.recordPrepare({ kind: 'observation', createdBy: 'agent:test' })).resolves.toMatchObject({
      status: 'prepared',
      id: 'entry-1',
    });
  });
});

function makeScopeCtx(agentId = MAIN_AGENT_ID) {
  return makeAgentScopeContext({ agentId, agentScope: '' });
}

function makeStubModeSvc(opts?: {
  isActive?: boolean;
  phase?: AitpAdapterHealth['phase'];
  loopStatus?: import('#/features/aitpResearch/types').ResearchLoopStatus;
}) {
  const isActive = opts?.isActive ?? true;
  const phase = opts?.phase ?? (isActive ? 'ready' : 'inactive');
  return {
    _serviceBrand: undefined as undefined,
    _setPhaseCalls: [] as string[],
    isActive,
    phase,
    loopStatus: opts?.loopStatus ?? 'active',
    revision: 0,
    health: null as null,
    maintenanceDegradedReason: undefined as undefined,
    async enter() {},
    async exit() {},
    setPhase(nextPhase: string) { this._setPhaseCalls.push(nextPhase); },
    assertResearchMutationAllowed() {},
    pauseLoop(_expectedRevision: number) {},
    resumeLoop(_expectedRevision: number) {},
    resetAdapter() {},
    async refreshHealth() { return { phase: 'inactive' as const }; },
  };
}

function makeStubAdapter(overrides?: {
  show?: (opts: { id: string }) => Promise<AitpShowResult>;
  check?: (opts?: { workstream?: string }) => Promise<AitpCheckReport>;
  recordPrepare?: () => Promise<AitpRecordPrepareResult>;
  recordSave?: () => Promise<AitpRecordSaveResult>;
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
    recordPrepare: overrides?.recordPrepare ?? (async () => stubRecordPrepare),
    recordSave: overrides?.recordSave ?? (async () => stubRecordSave),
    notePrepare: async () => stubNotePrepare,
    noteSave: async () => stubNoteSave,
    resolveContractIdentity: () => null,
    isReady: () => health.phase === 'ready',
    isDegraded: () => health.phase === 'degraded',
    reset() { health = { phase: 'inactive' }; },
  };
}

function bindCompleteCheckpointReceipt(
  checkpointId: string,
  entryId = 'e1',
  preSaveErrors: readonly { readonly code: string; readonly path: string; readonly message: string }[] = [],
): void {
  const pending = wire.getModel(ResearchModel).current.pendingCheckpoint;
  if (pending === null || pending.checkpointId !== checkpointId) {
    throw new Error(`Missing pending checkpoint ${checkpointId}`);
  }
  const draftPath = `.aitp/local/drafts/${entryId}.md`;
  const errorFindingFingerprints = preSaveErrors
    .map((finding) => `${finding.code}:${finding.path}:${finding.message}`)
    .sort();
  wire.dispatch(
    researchBindCheckpointEntry({ checkpointId, entryId }),
    researchBindCheckpointReceipt({
      checkpointId,
      receipt: {
        prepare: {
          status: 'prepared',
          id: entryId,
          path: draftPath,
          idempotencyKey: pending.idempotencyKey,
        },
        save: {
          status: 'saved',
          draftPath,
          path: `.aitp/topic/entries/entry-${entryId}.md`,
        },
        preSaveCheck: {
          status: preSaveErrors.length === 0 ? 'clean' : 'findings',
          errors: preSaveErrors.length,
          warnings: 0,
          findingFingerprints: preSaveErrors
            .map((finding) => `error:${finding.code}:${finding.path}:${finding.message}`)
            .sort(),
          errorFindingFingerprints,
          checkedAt: 900,
        },
      },
    }),
  );
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

describe('durable checkpoint verification', () => {
  it('verifies an active saved Entry and records a clean post-save receipt', async () => {
    const showSpy = vi.fn<(opts: { id: string }) => Promise<AitpShowResult>>().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
    });
    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'clean',
      counts: { entries: 1, notes: 0, errors: 0, warnings: 0 }, findings: [],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    const durable = new DurableCommitService(adapter);

    await durable.verifyEntry('e1');
    const result = await durable.checkAfterSave({
      workstreams: ['main'],
      preSaveCheck: {
        status: 'clean', errors: 0, warnings: 0,
        findingFingerprints: [], errorFindingFingerprints: [], checkedAt: 100,
      },
    });

    expect(showSpy).toHaveBeenCalledWith({ id: 'e1' });
    expect(checkSpy).toHaveBeenCalledWith({ workstream: 'main' });
    expect(result.postSaveCheck).toMatchObject({ status: 'clean', errors: 0, warnings: 0 });
  });

  it('rejects new errors but preserves an unchanged pre-save error as a receipt warning', async () => {
    const existing = { level: 'error' as const, code: 'legacy', path: 'old.md', message: 'old error' };
    const adapter = makeStubAdapter({
      check: async () => ({
        schema: 'aitp/check-report-0.1', root: '/workspace', status: 'findings',
        counts: { entries: 1, notes: 0, errors: 1, warnings: 0 }, findings: [existing],
      }),
    });
    const durable = new DurableCommitService(adapter);
    const baseline = {
      status: 'findings' as const, errors: 1, warnings: 0,
      findingFingerprints: ['error:legacy:old.md:old error'],
      errorFindingFingerprints: ['legacy:old.md:old error'], checkedAt: 100,
    };

    await expect(durable.checkAfterSave({ preSaveCheck: baseline })).resolves.toMatchObject({
      postSaveCheck: { newErrorFindingFingerprints: [], preExistingErrorFindingFingerprints: ['legacy:old.md:old error'] },
    });

    const newAdapter = makeStubAdapter({
      check: async () => ({
        schema: 'aitp/check-report-0.1', root: '/workspace', status: 'findings',
        counts: { entries: 1, notes: 0, errors: 1, warnings: 0 },
        findings: [{ level: 'error', code: 'new', path: 'entry.md', message: 'new error' }],
      }),
    });
    const newDurable = new DurableCommitService(newAdapter);
    await expect(newDurable.checkAfterSave({ preSaveCheck: baseline })).rejects.toThrow('new error finding');
  });

  it('contributes an Agent-scoped verifier that the Research service consumes', async () => {
    const adapter = makeStubAdapter();
    const durable: IDurableCommitService = new DurableCommitService(adapter);
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');
    const verifyEntry = vi.spyOn(durable, 'verifyEntry');
    const checkAfterSave = vi.spyOn(durable, 'checkAfterSave');
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService(), undefined, durable,
    );

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });

    expect(verifyEntry).toHaveBeenCalledWith('e1');
    expect(checkAfterSave).toHaveBeenCalledOnce();
    expect(wire.getModel(ResearchCursorModel).cursor).toMatchObject({ checkpointId: 'cp1', entryId: 'e1' });
  });
});

describe('typed research evidence packets', () => {
  it('strictly parses a packet and applies defaults without mutating Research state', async () => {
    const packet: ResearchEvidencePacket = parseResearchEvidencePacket({
      packet_id: 'packet-1',
      kind: 'derivation',
      claim: 'The symmetry constraint preserves the stated degeneracy.',
      evidence: 'A two-line derivation under the declared boundary conditions.',
    });
    expect(packet.assumptions).toEqual([]);
    expect(packet.confidence).toBe('medium');
    expect(() => parseResearchEvidencePacket({
      ...packet,
      unexpected: true,
    })).toThrow();
  });

  it('serially reviews a packet against the current revision and never changes assessment', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    const adapter = makeStubAdapter();
    const mode = makeStubModeSvc({ isActive: true });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, mode, adapter, makeToolExecutorStub(), makeStubGoalService());
    svc.createLine({ slug: 'main', title: 'Main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Does the construction preserve symmetry?' });
    const packet = parseResearchEvidencePacket({
      packet_id: 'packet-1',
      kind: 'result',
      question_id: question.id,
      line_slug: 'main',
      claim: 'The computed observable is invariant.',
      evidence: 'Independent evaluations agree within the declared tolerance.',
      tests: ['Compared both symmetry branches.'],
    });
    const before = svc.getSnapshot();
    const review = svc.reviewEvidencePacket(packet, before.revision);

    expect(review).toEqual({
      packet,
      researchRevision: before.revision,
      questionId: question.id,
      lineSlug: 'main',
    });
    expect(svc.getSnapshot()).toEqual(before);
  });

  it('rejects a packet after the Research revision changes', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), makeStubAdapter(), makeToolExecutorStub(), makeStubGoalService());
    svc.createLine({ slug: 'main', title: 'Main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q' });
    const packet = parseResearchEvidencePacket({
      packet_id: 'packet-2', kind: 'observation', question_id: question.id,
      claim: 'An observation.', evidence: 'A measured value.',
    });
    const revision = svc.getSnapshot().revision;
    svc.updateQuestion({ questionId: question.id, assessment: 'New assessment' });
    expect(() => svc.reviewEvidencePacket(packet, revision)).toThrow('revision is stale');
  });
});

describe('research run observations', () => {
  it('records a bounded HPC observation and derives a wait-next-step without polling', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), makeStubAdapter(), makeToolExecutorStub(), makeStubGoalService());
    svc.setPhase('gap_analysis');
    const action = svc.planAction({
      kind: 'simulation', purpose: 'Run the bounded scheduler calculation for the current question.',
      stopCondition: 'Stop after the analyzer has produced the required evidence.',
    });
    svc.startAction(action.actionId);
    const before = svc.getSnapshot();
    const run = svc.observeRun({
      actionId: action.actionId,
      expectedRevision: before.revision,
      campaign: 'campaign-bi2se3-r2',
      jobId: '3128781',
      sourcePin: 'source-sha',
      binaryPin: 'binary-sha',
      stage: 'scf',
      schedulerState: 'running',
      nextCheckAt: Date.now() + 60_000,
      artifactRefs: ['run/scf.log'],
    });

    expect(run).toMatchObject({ actionId: action.actionId, jobId: '3128781', stage: 'scf', schedulerState: 'running' });
    expect(svc.getSnapshot().currentRun).toEqual(run);
    expect(svc.getSnapshot().effectiveNextStep?.source).toBe('research_run');
    expect(svc.getSnapshot().effectiveNextStep?.text).toContain('3128781');
  });

  it('rejects stale or invalid terminal observations and never submits a scheduler job', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), makeStubAdapter(), makeToolExecutorStub(), makeStubGoalService());
    svc.setPhase('gap_analysis');
    const action = svc.planAction({
      kind: 'simulation', purpose: 'Run one bounded HPC calculation and inspect its evidence.',
      stopCondition: 'Stop when the declared artifacts exist.',
    });
    const revision = svc.getSnapshot().revision;
    expect(() => svc.observeRun({
      actionId: action.actionId, expectedRevision: revision - 1, campaign: 'c', jobId: 'j',
      stage: 'running', schedulerState: 'completed', artifactRefs: [],
    })).toThrow('revision is stale');
    expect(() => svc.observeRun({
      actionId: action.actionId, expectedRevision: revision, campaign: 'c', jobId: 'j',
      stage: 'running', schedulerState: 'completed', artifactRefs: [],
    })).toThrow('requires an explicit terminal state');
  });
});

describe('commitCheckpoint barrier', () => {
  it('requires a pending checkpoint with matching id', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());
    await expect(svc.commitCheckpoint({ checkpointId: 'nonexistent', entryId: 'e1' })).rejects.toThrow(
      'No pending checkpoint',
    );
  });

  it('rejects a pending checkpoint without prepare/save/check receipts', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp-missing', idempotencyKey: 'key1', createdAt: 1000 }));
    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp-missing', entryId: 'e1' })).rejects.toThrow(
      'no complete AITP prepare/save receipt',
    );
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
  });

  it('calls show + check before advancing the cursor', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');

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
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });

    expect(showSpy).toHaveBeenCalledWith({ id: 'e1' });
    expect(checkSpy).toHaveBeenCalledOnce();
    expect(wire.getModel(ResearchCursorModel).cursor).toMatchObject({
      checkpointId: 'cp1',
      entryId: 'e1',
      receipt: {
        prepare: { status: 'prepared', id: 'e1' },
        save: { status: 'saved' },
        preSaveCheck: { status: 'clean', errors: 0 },
        postSaveCheck: { status: 'clean', errors: 0 },
      },
    });
  });

  it('acknowledges the question and reconciles an undone pending checkpoint', async () => {
    const adapter = makeStubAdapter();
    const modeSvc = makeStubModeSvc({ isActive: true });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    const checkpoint = svc.proposeCheckpoint({ questionId: question.id });
    bindCompleteCheckpointReceipt(checkpoint.checkpointId);
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));

    await svc.commitCheckpoint({ checkpointId: checkpoint.checkpointId, entryId: 'e1' });
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();
    expect(wire.getModel(ResearchModel).current.questions[question.id]!.persistence).toBe('committed');
    expect(wire.getModel(ResearchCursorModel).cursor?.checkpointId).toBe(checkpoint.checkpointId);

    wire.dispatch(contextUndo({ count: 1 }));
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe(checkpoint.checkpointId);
    // The committed-cursor reconcile is a lifecycle action fired on undo
    // (`context.undone`), not a read side-effect; `getPendingCheckpoint` stays pure.
    eventBus.publish({ type: 'context.undone', turns: 1 });
    expect(svc.getPendingCheckpoint()).toBeNull();
    expect(wire.getModel(ResearchModel).current.questions[question.id]!.persistence).toBe('committed');
  });

  it('keeps the committed cursor after conversation undo while the pending checkpoint reverts', async () => {
    const adapter = makeStubAdapter();
    const modeSvc = makeStubModeSvc({ isActive: true });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    const checkpoint = svc.proposeCheckpoint({ questionId: question.id });
    bindCompleteCheckpointReceipt(checkpoint.checkpointId);
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));

    await svc.commitCheckpoint({ checkpointId: checkpoint.checkpointId, entryId: 'e1' });
    expect(svc.getCommittedCursor()).toMatchObject({ checkpointId: checkpoint.checkpointId, entryId: 'e1' });

    wire.dispatch(contextUndo({ count: 1 }));
    // The external fact (committed cursor) survives undo; the checkpointed
    // working state (pending checkpoint) reverts.
    expect(svc.getCommittedCursor()).toMatchObject({ checkpointId: checkpoint.checkpointId, entryId: 'e1' });
    expect(svc.getPendingCheckpoint()).not.toBeNull();
    expect(wire.getModel(ResearchCursorModel).history).toEqual(
      expect.arrayContaining([expect.objectContaining({ checkpointId: checkpoint.checkpointId, entryId: 'e1' })]),
    );
  });

  it('routes cursor reads and writes through the external-fact facade service', async () => {
    const adapter = makeStubAdapter();
    const externalFact: IAitpExternalFactService = createExternalFactFacade(wire);
    const commitSpy = vi.spyOn(externalFact, 'commitExternalFact');
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService(), undefined, undefined, externalFact,
    );

    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');
    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });

    expect(commitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointId: 'cp1', entryId: 'e1' }),
    );
    expect(svc.getCommittedCursor()).toMatchObject({ checkpointId: 'cp1', entryId: 'e1' });
  });

  it('rebuilds the committed cursor and history on cold wire restore after a facade commit', async () => {
    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');
    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });

    await wire.restore();

    expect(svc.getCommittedCursor()).toMatchObject({ checkpointId: 'cp1', entryId: 'e1' });
    expect(wire.getModel(ResearchCursorModel).history).toEqual(
      expect.arrayContaining([expect.objectContaining({ checkpointId: 'cp1', entryId: 'e1' })]),
    );
  });

  it('rejects a second proposal without replacing the first pending checkpoint', async () => {
    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

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
    bindCompleteCheckpointReceipt('cp1');

    const showSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: entryId, status,
      source: `.aitp/topic/entries/entry-${entryId}.md`, legacy_derived: false, frontmatter: {}, body: '',
    } as AitpShowResult);
    const checkSpy = vi.fn();
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

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
    bindCompleteCheckpointReceipt('cp1');

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
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

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
    bindCompleteCheckpointReceipt('cp1');

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
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });
    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e2' })).rejects.toThrow(
      'already committed',
    );

    expect(showSpy).toHaveBeenCalledOnce();
    expect(wire.getModel(ResearchCursorModel).cursor).toMatchObject({ checkpointId: 'cp1', entryId: 'e1' });
  });

  it('appends two different checkpoints to the committed history sequentially', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    // First checkpoint: propose → bind full receipt → commit.
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1', 'e1');

    const adapter = makeStubAdapter({
      show: async ({ id }: { id: string }) => ({
        schema: 'aitp/show-0.1', root: '/workspace', id, status: 'active',
        source: `.aitp/topic/entries/entry-${id}.md`, legacy_derived: false, frontmatter: {}, body: '',
      }),
    });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();

    // Second, independent checkpoint: a new proposal is accepted after commit,
    // bound to a different AITP entry, and appended to the history.
    const second = svc.proposeCheckpoint({});
    bindCompleteCheckpointReceipt(second.checkpointId, 'e2');
    await svc.commitCheckpoint({ checkpointId: second.checkpointId, entryId: 'e2' });

    const cursor = wire.getModel(ResearchCursorModel);
    expect(cursor.cursor).toMatchObject({ checkpointId: second.checkpointId, entryId: 'e2' });
    expect(cursor.history).toMatchObject([
      { checkpointId: 'cp1', entryId: 'e1' },
      { checkpointId: second.checkpointId, entryId: 'e2' },
    ]);
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();
    // The `latestCommittedCheckpoint` projection stays compatible and points at
    // the latest commit; the full ordered history is exposed additively.
    expect(svc.getSnapshot().latestCommittedCheckpoint).toMatchObject({ checkpointId: second.checkpointId, entryId: 'e2' });
    expect(svc.getSnapshot().committedCheckpointHistory).toHaveLength(2);
    expect(svc.getSnapshot().committedCheckpointHistory![1]).toMatchObject({ checkpointId: second.checkpointId, entryId: 'e2' });
  });

  it('rejects a checkpoint when its question revision changes during the show barrier', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));

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
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());
    svc.createLine({ slug: 'main', title: 'Main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    const checkpoint = svc.proposeCheckpoint({ questionId: question.id });
    bindCompleteCheckpointReceipt(checkpoint.checkpointId);

    const commitPromise = svc.commitCheckpoint({ checkpointId: checkpoint.checkpointId, entryId: 'e1' });
    expect(showSpy).toHaveBeenCalledWith({ id: 'e1' });
    svc.updateQuestion({ questionId: question.id, assessment: 'Concurrent revision update' });
    releaseShow(showResult);

    await expect(commitPromise).rejects.toThrow('changed while the AITP show barrier was running');
    expect(checkSpy).not.toHaveBeenCalled();
    expect(modeSvc._setPhaseCalls).not.toContain('degraded');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe(checkpoint.checkpointId);
  });

  it('rechecks the committed cursor after the asynchronous check barrier', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');

    let releaseCheck!: (report: AitpCheckReport) => void;
    const checkPromise = new Promise<AitpCheckReport>((resolve) => { releaseCheck = resolve; });
    const checkSpy = vi.fn<() => Promise<AitpCheckReport>>().mockReturnValue(checkPromise);
    const adapter = makeStubAdapter({ check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

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

  it('allows unchanged pre-existing check errors and records them as receipt warnings', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp-existing', idempotencyKey: 'key1', createdAt: 1000 }));
    const existingFinding = { code: 'legacy_error', path: 'old.md', message: 'pre-existing error' };
    bindCompleteCheckpointReceipt('cp-existing', 'e1', [existingFinding]);

    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'findings',
      counts: { entries: 1, notes: 0, errors: 1, warnings: 0 },
      findings: [{ level: 'error', ...existingFinding }],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc();
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    await svc.commitCheckpoint({ checkpointId: 'cp-existing', entryId: 'e1' });

    expect(modeSvc._setPhaseCalls).not.toContain('degraded');
    expect(wire.getModel(ResearchCursorModel).cursor?.receipt?.postSaveCheck).toMatchObject({
      errors: 1,
      newErrorFindingFingerprints: [],
      preExistingErrorFindingFingerprints: ['legacy_error:old.md:pre-existing error'],
    });
  });

  it('rejects when check reports error findings (degraded, cursor not advanced)', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');

    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'findings',
      counts: { entries: 1, notes: 0, errors: 1, warnings: 0 },
      findings: [{ level: 'error', code: 'missing_refs', path: 'e.md', message: 'missing refs' }],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc();
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('error finding');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe('cp1');
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });

  it('rejects when show throws (degraded, cursor not advanced)', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');

    const showSpy = vi.fn().mockRejectedValue(new Error('show failed'));
    const adapter = makeStubAdapter({ show: showSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc();
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('commit barrier failed');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });
});

describe('research snapshot pure reads', () => {
  it('read projections never dispatch, publish, or invoke the adapter and leave revision/state untouched', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    const adapter = makeStubAdapter();
    const showSpy = vi.spyOn(adapter, 'show');
    const checkSpy = vi.spyOn(adapter, 'check');
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'ready' }),
      adapter,
      makeToolExecutorStub(),
      makeStubGoalService(),
    );

    // Seed state through a real mutation (which legitimately dispatches + publishes).
    svc.createLine({ slug: 'main', title: 'Main' });
    svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });

    const dispatchSpy = vi.spyOn(wire, 'dispatch');
    const researchEvents: unknown[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => researchEvents.push(e as never)));
    dispatchSpy.mockClear();
    showSpy.mockClear();
    checkSpy.mockClear();

    const stateBefore = wire.getModel(ResearchModel).current;
    const revisionBefore = stateBefore.revision;
    const cursorBefore = wire.getModel(ResearchCursorModel).cursor;
    const snapshotBefore = svc.getSnapshot();

    svc.getSnapshot();
    svc.getSnapshot();
    svc.getQuestions();
    svc.getLines();
    svc.getPendingCheckpoint();
    svc.getCommittedCursor();
    svc.getScientificProgress('brief');
    svc.getScientificProgress('detail');
    svc.getScientificProgress('audit');

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(researchEvents).toHaveLength(0);
    expect(showSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
    expect(wire.getModel(ResearchModel).current).toEqual(stateBefore);
    expect(wire.getModel(ResearchModel).current.revision).toBe(revisionBefore);
    expect(wire.getModel(ResearchCursorModel).cursor).toEqual(cursorBefore);
    expect(svc.getSnapshot()).toEqual(snapshotBefore);
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
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), adapter, makeToolExecutorStub(), makeStubGoalService());

    svc.createQuestion({ lineSlug: 'main', wording: 'Test Q' });

    expect(events).toHaveLength(1);
    const snapshot = events[0]!.snapshot as { questions: unknown[]; revision: number };
    expect(snapshot.questions).toHaveLength(1);
    expect(snapshot.revision).toBeGreaterThan(0);
  });
});

describe('Goal display projection', () => {
  it('omits goalSummary when there is no current Goal', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );

    expect(svc.getSnapshot().goalSummary).toBeUndefined();
  });

  it.each(['active', 'paused', 'blocked', 'complete'] as const)(
    'projects a %s Goal status without writing AITP state',
    async (status) => {
      const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
      const svc = new AgentResearchService(
        wire,
        makeScopeCtx(),
        eventBus,
        makeStubModeSvc({ isActive: true }),
        makeStubAdapter(),
        makeToolExecutorStub(),
        makeStubGoalService(makeGoalSnapshot(status)),
      );

      expect(svc.getSnapshot().goalSummary).toEqual({ status, remainingTurns: 3 });
    },
  );

  it('omits remainingTurns when the Goal has no turn budget', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active', null)),
    );

    expect(svc.getSnapshot().goalSummary).toEqual({ status: 'active' });
  });

  it('publishes a complete Research snapshot when Goal status or budget changes', async () => {
    let currentGoal: GoalSnapshot | null = makeGoalSnapshot('active', 3);
    const goal = makeStubGoalService(() => currentGoal);
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      goal,
    );
    const events: ResearchStatusSnapshot[] = [];
    disposables.add(eventBus.subscribe('research.updated', (event) => events.push(event.snapshot)));

    currentGoal = makeGoalSnapshot('paused', 2);
    eventBus.publish({ type: 'goal.updated', snapshot: currentGoal });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      mode: 'ready',
      goalSummary: { status: 'paused', remainingTurns: 2 },
      questions: [],
      lines: [],
      alerts: [],
    });
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
      makeStubGoalService(),
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
      adapter,
      eventBus,
      makeProfileServiceStub(),
    );

    await modeSvc.exit();
    expect(wire.getModel(AitpModeModel).current.phase).toBe('inactive');
    expect(adapter.health.phase).toBe('inactive');
  });
});

describe('legacy Research tool compatibility', () => {
  it('adds the current Research tools before entering the mode', async () => {
    const addActiveTool = vi.fn();
    const modeSvc = await buildRealModeService(undefined, makeProfileServiceStub(addActiveTool));

    await modeSvc.enter({ actor: 'user' });

    const toolNames = addActiveTool.mock.calls.map(([name]) => name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'CreateResearchQuestion',
        'SetResearchFocus',
        'BeginResearchAction',
        'ConcludeResearchAction',
        'ResolveResearchDecision',
        'AcknowledgeResearchAlert',
      ]),
    );
    expect(toolNames).not.toEqual(expect.arrayContaining([
      'PlanResearchAction',
      'CompleteResearchAction',
      'SetResearchPhase',
    ]));
  });

  it('repairs the Research tool overlay when restoring an active mode', async () => {
    const addActiveTool = vi.fn();
    const modeSvc = await buildRealModeService(undefined, makeProfileServiceStub(addActiveTool));
    await modeSvc.enter({ actor: 'user' });
    addActiveTool.mockClear();

    await wire.restore();

    expect(modeSvc.isActive).toBe(true);
    const toolNames = addActiveTool.mock.calls.map(([name]) => name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'CreateResearchQuestion',
        'SetResearchFocus',
        'BeginResearchAction',
        'ConcludeResearchAction',
        'ResolveResearchDecision',
        'AcknowledgeResearchAlert',
      ]),
    );
    expect(toolNames).not.toEqual(expect.arrayContaining([
      'PlanResearchAction',
      'CompleteResearchAction',
      'SetResearchPhase',
    ]));
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
      adapter,
      eventBus,
      makeProfileServiceStub(),
    );

    wire.dispatch(contextUndo({ count: 1 }));
    eventBus.publish({ type: 'context.undone', turns: 1 });
    expect(wire.getModel(AitpModeModel).current.phase).toBe('inactive');
    expect(adapter.health.phase).toBe('inactive');
  });

  it('keeps Research Mode active when restore finds an active Plan', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
    const adapter = makeStubAdapter();
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      { enabled: () => true } as never,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
    );

    eventBus.publish({ type: 'context.undone', turns: 1 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(modeSvc.isActive).toBe(true);
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

describe('goal completion guard and subagent veto', () => {
  type GuardCallable = (
    input: import('#/agent/goal/goalContribution').GoalCompletionGuardInput,
  ) => Promise<import('#/agent/goal/goalContribution').GoalCompletionGuardResult>
    | import('#/agent/goal/goalContribution').GoalCompletionGuardResult;

  function guardOf(svc: AgentResearchService): GuardCallable {
    const guard = (svc as unknown as {
      guardGoalCompletion: GuardCallable;
    }).guardGoalCompletion;
    return guard.bind(svc);
  }

  it('rejects completion when a pending checkpoint exists and mode is active', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');

    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc({ isActive: true });
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    const result = await guardOf(svc)({ goalId: 'goal-1', objective: 'work', actor: 'model' });

    expect(result.allow).toBe(false);
    expect(result).toMatchObject({ owner: 'aitpResearch', code: 'research.checkpoint.pending' });
    if (result.allow === false) expect(result.reason).toContain('pending commit');
  });

  it('rejects completion when Research Mode is degraded', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'degraded' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );

    const result = await guardOf(svc)({ goalId: 'goal-1', objective: 'work', actor: 'model' });

    expect(result.allow).toBe(false);
    expect(result).toMatchObject({ owner: 'aitpResearch', code: 'research.mode.degraded' });
    if (result.allow === false) expect(result.reason).toContain('Research Mode is degraded');
  });

  it('rejects completion while a human gate is unresolved', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    svc.requestHumanDecision({ kind: 'review', prompt: 'Review the evidence' });

    const result = await guardOf(svc)({ goalId: 'goal-1', objective: 'work', actor: 'model' });

    expect(result.allow).toBe(false);
    expect(result).toMatchObject({ owner: 'aitpResearch', code: 'research.human-gate.unresolved' });
    if (result.allow === false) expect(result.reason).toContain('human gate is unresolved');
  });

  it('allows completion after the human gate is resolved', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    const gate = svc.requestHumanDecision({ kind: 'decision', prompt: 'Choose the result' });
    svc.resolveHumanDecision({
      gateId: gate.gateId,
      resolution: 'Use the measured result',
      nextPhase: 'gap_analysis',
    });

    const result = await guardOf(svc)({ goalId: 'goal-1', objective: 'work', actor: 'model' });

    expect(result).toEqual({ allow: true });
  });

  it('allows completion during an ordinary active research action', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    svc.setPhase('gap_analysis');
    const action = svc.planAction({ kind: 'experiment', purpose: 'Test the hypothesis', stopCondition: 'done' });
    svc.startAction(action.actionId);

    const result = await guardOf(svc)({ goalId: 'goal-1', objective: 'work', actor: 'model' });

    expect(result).toEqual({ allow: true });
  });

  it('allows completion when no pending checkpoint', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));

    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc({ isActive: true });
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    const result = await guardOf(svc)({ goalId: 'goal-1', objective: 'work', actor: 'model' });

    expect(result).toEqual({ allow: true });
  });

  it('allows completion when the mode is inactive even with pending research state', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');

    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc({ isActive: false });
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    const result = await guardOf(svc)({ goalId: 'goal-1', objective: 'work', actor: 'model' });

    expect(result).toEqual({ allow: true });
  });

  it.each(['ResolveResearchDecision', 'AcknowledgeResearchAlert'] as const)('vetoes %s on subagents', async (toolName) => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));

    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc({ isActive: true });
    const svc = new AgentResearchService(wire, makeAgentScopeContext({ agentId: 'subagent-1', agentScope: '' }), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    const event = makeVetoEvent(toolName, {
      fingerprint: 'research.alert.example',
      gate_id: 'g1', resolution: 'approved', next_phase: 'gap_analysis',
    });
    await (svc as unknown as { guardToolExecution: (e: BeforeToolExecuteEventImpl) => Promise<void> }).guardToolExecution(event);

    expect(event.vetoResult).toBeDefined();
    expect(event.vetoResult?.isError).toBe(true);
    expect(event.vetoResult?.output).toContain('main agent');
  });

  type DecideCallable = (
    input: import('#/agent/goal/goalContribution').GoalContinuationInput,
  ) => Promise<import('#/agent/goal/goalContribution').GoalContinuationDecisionResult>
    | import('#/agent/goal/goalContribution').GoalContinuationDecisionResult;

  function decideOf(svc: AgentResearchService): DecideCallable {
    const decide = (svc as unknown as {
      decideGoalContinuation: DecideCallable;
    }).decideGoalContinuation;
    return decide.bind(svc);
  }

  it('abstains from goal continuation when the mode is inactive', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: false }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );

    const result = await decideOf(svc)({ goalId: 'goal-1', objective: 'work', turnsUsed: 1 });

    expect(result).toEqual({ decision: 'abstain' });
  });

  it('holds goal continuation while the research loop is paused', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, loopStatus: 'paused' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );

    const result = await decideOf(svc)({ goalId: 'goal-1', objective: 'work', turnsUsed: 1 });

    expect(result).toMatchObject({ decision: 'hold', owner: 'aitpResearch' });
    if (result.decision === 'hold') expect(result.reason).toContain('paused');
  });

  it('holds goal continuation while Research Mode is degraded', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'degraded' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );

    const result = await decideOf(svc)({ goalId: 'goal-1', objective: 'work', turnsUsed: 1 });

    expect(result).toMatchObject({ decision: 'hold', owner: 'aitpResearch' });
    if (result.decision === 'hold') expect(result.reason).toContain('degraded');
  });

  it('holds goal continuation while a human gate is unresolved', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    svc.requestHumanDecision({ kind: 'review', prompt: 'Review the evidence' });

    const result = await decideOf(svc)({ goalId: 'goal-1', objective: 'work', turnsUsed: 1 });

    expect(result).toMatchObject({ decision: 'hold', owner: 'aitpResearch' });
    if (result.decision === 'hold') expect(result.reason).toContain('human gate');
  });

  it('abstains from goal continuation after the human gate is resolved', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    const gate = svc.requestHumanDecision({ kind: 'decision', prompt: 'Choose the result' });
    svc.resolveHumanDecision({
      gateId: gate.gateId,
      resolution: 'Use the measured result',
      nextPhase: 'gap_analysis',
    });

    const result = await decideOf(svc)({ goalId: 'goal-1', objective: 'work', turnsUsed: 1 });

    expect(result).toEqual({ decision: 'abstain' });
  });

  it('abstains from goal continuation during an ordinary active research action', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    svc.setPhase('gap_analysis');
    const action = svc.planAction({ kind: 'experiment', purpose: 'Test the hypothesis', stopCondition: 'done' });
    svc.startAction(action.actionId);

    const result = await decideOf(svc)({ goalId: 'goal-1', objective: 'work', turnsUsed: 1 });

    expect(result).toEqual({ decision: 'abstain' });
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
    bindCompleteCheckpointReceipt('cp1');

    const researchEvents: { type: string; snapshot?: { mode: string } }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => researchEvents.push(e as never)));

    await expect(researchSvc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('error finding');

    // setPhase('degraded') → aitp_mode.updated → research.updated with degraded mode
    const degradedSnapshot = researchEvents.find((e) => e.snapshot?.mode === 'degraded');
    expect(degradedSnapshot).toBeDefined();
  });
});

describe('injection active guidance', () => {
  it('renders trimmed guidance section when mode is active', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    expect(providers.list).toHaveLength(1);
    expect(providers.list[0]!.name).toBe('aitp_research');
    const output = providers.call(0, { isNewTurn: true });
    expect(output).toBeDefined();
    expect(output).toContain('Research state guidance');
    expect(output).toContain('BeginResearchAction');
    expect(output).toContain('ConcludeResearchAction');
    expect(output).toContain('ProposeResearchCheckpoint');
    expect(output).toContain('CommitResearchCheckpoint');
  });

  it('returns undefined when mode is inactive', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, false);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const output = providers.call(0, { isNewTurn: true });
    expect(output).toBeUndefined();
  });

  it('abstains (zero disclosure) for an ordinary turn even while mode is active', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    researchSvc.createQuestion({ lineSlug: 'main', wording: 'What causes X?' });
    researchSvc.setPhase('orienting');

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    // Ordinary turn (user origin, not a Goal research continuation) → not admitted.
    const admission = await makeInjectionAdmission(modeSvc, false);
    eventBus.publish({
      type: 'turn.started',
      turnId: 1,
      origin: { kind: 'user' },
    });
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const output = providers.call(0, { isNewTurn: true });
    expect(output).toBeUndefined();
  });
});

function makeToolExecutorStub() {
  return {
    onBeforeExecuteTool: () => ({ dispose: () => {} }),
  } as unknown as import('#/agent/toolExecutor/toolExecutor').IAgentToolExecutorService;
}

function makeGoalSnapshot(
  status: GoalStatus,
  remainingTurns: number | null = 3,
): GoalSnapshot {
  return {
    goalId: 'goal-1',
    objective: 'Test goal',
    status,
    turnsUsed: 0,
    tokensUsed: 0,
    wallClockMs: 0,
    budget: {
      tokenBudget: null,
      turnBudget: remainingTurns,
      wallClockBudgetMs: null,
      remainingTokens: null,
      remainingTurns,
      remainingWallClockMs: null,
      tokenBudgetReached: false,
      turnBudgetReached: remainingTurns === 0,
      wallClockBudgetReached: false,
      overBudget: remainingTurns === 0,
    },
  };
}

function makeStubGoalService(
  goalOrGetter: GoalSnapshot | null | (() => GoalSnapshot | null) = null,
): IAgentGoalService {
  const getGoal = typeof goalOrGetter === 'function' ? goalOrGetter : () => goalOrGetter;
  return {
    _serviceBrand: undefined,
    getGoal: () => ({ goal: getGoal() }),
  } as IAgentGoalService;
}

function makeProfileServiceStub(addActiveTool = vi.fn()) {
  return {
    addActiveTool,
  } as unknown as import('#/agent/profile/profile').IAgentProfileService;
}

type CapturedProvider = (
  context: import('#/agent/contextInjector/contextInjector').ContextInjectionContext<
    import('#/features/aitpResearch/injection/researchInjectionPresenter').InjectionDisclosure
  >,
) => import('#/agent/contextInjector/contextInjector').ContextInjectionResult<
  import('#/features/aitpResearch/injection/researchInjectionPresenter').InjectionDisclosure
> | undefined;

function captureProviders() {
  const list: { name: string; fn: CapturedProvider }[] = [];
  const stub = {
    _serviceBrand: undefined as undefined,
    register(name: string, fn: CapturedProvider) {
      list.push({ name, fn });
      return { dispose: () => {} };
    },
    reconcileWhenIdle: async () => {},
  };
  function call(
    index: number,
    opts?: {
      readonly isNewTurn?: boolean;
      readonly lastDisclosure?: import('#/features/aitpResearch/injection/researchInjectionPresenter').InjectionDisclosure;
      readonly returnDisclosure?: boolean;
    },
  ): string | undefined {
    const result = list[index]!.fn({
      injectedPositions: [],
      lastInjectedAt: null,
      lastInjection: undefined,
      lastDisclosure: opts?.lastDisclosure,
      isNewTurn: opts?.isNewTurn ?? true,
    });
    if (result === undefined) return undefined;
    if (typeof result === 'string') return result;
    if (opts?.returnDisclosure) return result.disclosure as unknown as string;
    const content = result.content;
    return typeof content === 'string' ? content : undefined;
  }
  return { list, stub, call };
}

async function makeInjectionAdmission(
  modeSvc: Awaited<ReturnType<typeof buildRealModeService>>,
  admitted: boolean,
): Promise<import('#/features/aitpResearch/loop/researchTurnAdmission').IResearchTurnAdmission> {
  const { ResearchTurnAdmission } = await import('#/features/aitpResearch/loop/researchTurnAdmission');
  const admission = new ResearchTurnAdmission(
    eventBus,
    makeAgentScopeContext({ agentId: MAIN_AGENT_ID, agentScope: '' }),
    modeSvc,
  );
  disposables.add(admission);
  if (admitted) {
    eventBus.publish({
      type: 'turn.started',
      turnId: 1,
      origin: GOAL_CONTINUATION_ORIGIN,
      intent: GOAL_CONTINUATION_INTENT,
    });
  }
  return admission;
}

async function buildRealModeService(
  adapter?: ReturnType<typeof makeStubAdapter>,
  profile = makeProfileServiceStub(),
) {
  const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
  return new AgentAitpModeService(
    wire,
    { enabled: () => true } as never,
    makeScopeCtx(),
    adapter ?? makeStubAdapter(),
    eventBus,
    profile,
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
    makeStubGoalService(),
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

describe('checkpoint receipt tool integration', () => {
  it('binds prepare, pre-save check, and save receipts to the pending checkpoint', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      modeSvc,
      adapter,
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    const checkpoint = researchSvc.proposeCheckpoint({});
    const recordPrepareSpy = vi.spyOn(adapter, 'recordPrepare');
    const checkSpy = vi.spyOn(adapter, 'check');
    const recordSaveSpy = vi.spyOn(adapter, 'recordSave');
    const { AitpRecordPrepareTool, AitpRecordSaveTool } = await import(
      '#/features/aitpResearch/tools/aitpAdapterTools'
    );
    const prepareTool = new AitpRecordPrepareTool(adapter, modeSvc, researchSvc);
    const saveTool = new AitpRecordSaveTool(adapter, modeSvc, researchSvc);

    await runnableExecution(prepareTool.resolveExecution({
      kind: 'result',
      authority: 'agent',
      created_by: 'agent:main',
      workstreams: ['magnetic-symmetry'],
      checkpoint_id: checkpoint.checkpointId,
    })).execute({ turnId: 1, toolCallId: 'prepare', signal: new AbortController().signal });
    await runnableExecution(saveTool.resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: checkpoint.checkpointId,
    })).execute({ turnId: 1, toolCallId: 'save', signal: new AbortController().signal });

    expect(recordPrepareSpy).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: checkpoint.idempotencyKey,
      workstreams: ['magnetic-symmetry'],
    }));
    expect(checkSpy).toHaveBeenCalledWith({ workstream: 'magnetic-symmetry' });
    expect(recordSaveSpy).toHaveBeenCalledWith({
      draftPath: '.aitp/local/drafts/entry-test.md',
    });
    expect(researchSvc.getPendingCheckpoint()).toMatchObject({
      checkpointId: checkpoint.checkpointId,
      committedEntryId: 'entry-test',
      receipt: {
        prepare: {
          id: 'entry-test',
          idempotencyKey: checkpoint.idempotencyKey,
          workstreams: ['magnetic-symmetry'],
        },
        save: {
          status: 'saved',
          draftPath: '.aitp/local/drafts/entry-test.md',
        },
        preSaveCheck: { status: 'clean', errors: 0 },
      },
    });
  });

  it('treats a canonical existing prepare hit as an already-saved checkpoint', async () => {
    let checkpointIdempotencyKey = 'unused';
    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1',
        root: '/workspace',
        id: 'entry-e1',
        status: 'active',
        source: '.aitp/topic/entries/entry-e1.md',
        legacy_derived: false,
        frontmatter: {},
        body: '',
      }),
      recordPrepare: async () => ({
        status: 'existing',
        path: '.aitp/topic/entries/entry-e1.md',
        idempotency_key: checkpointIdempotencyKey,
      }),
    });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      modeSvc,
      adapter,
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    const checkpoint = researchSvc.proposeCheckpoint({});
    checkpointIdempotencyKey = checkpoint.idempotencyKey;
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    await runnableExecution(new AitpRecordPrepareTool(adapter, modeSvc, researchSvc).resolveExecution({
      kind: 'result',
      authority: 'agent',
      created_by: 'agent:main',
      checkpoint_id: checkpoint.checkpointId,
    })).execute({ turnId: 1, toolCallId: 'prepare-existing', signal: new AbortController().signal });

    expect(researchSvc.getPendingCheckpoint()).toMatchObject({
      committedEntryId: 'entry-e1',
      receipt: {
        prepare: { status: 'existing', id: 'entry-e1', path: '.aitp/topic/entries/entry-e1.md' },
        save: {
          status: 'already_saved',
          source: 'prepare_existing',
          draftPath: '.aitp/topic/entries/entry-e1.md',
          path: '.aitp/topic/entries/entry-e1.md',
        },
        preSaveCheck: { status: 'clean', errors: 0 },
      },
    });
    await researchSvc.commitCheckpoint({ checkpointId: checkpoint.checkpointId, entryId: 'entry-e1' });
    expect(researchSvc.getCommittedCursor()).toMatchObject({ entryId: 'entry-e1' });
  });
});

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
    bindCompleteCheckpointReceipt('cp1');

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
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });
    expect(wire.getModel(ResearchCursorModel).cursor).not.toBeNull();
    expect(wire.getModel(ResearchCursorModel).cursor!.entryId).toBe('e1');
  });

  it('error findings block the cursor (exit 1, >0 errors)', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');

    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
      }),
      check: async () => GOLDEN_CHECK_ERRORS as AitpCheckReport,
    });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc();
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('error finding');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });

  it('adapter check throw (exit 2) fails closed', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 }));
    bindCompleteCheckpointReceipt('cp1');

    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false, frontmatter: {}, body: '',
      }),
      check: async () => { throw new Error('command failed'); },
    });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const modeSvc = makeStubModeSvc();
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' })).rejects.toThrow('commit barrier failed');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });
});

describe('injection guidance content', () => {
  it('contains canonical-read and milestone-boundary guidance', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const output = providers.call(0, { isNewTurn: true })!;
    expect(output).toContain('aitp_show');
    expect(output).toContain('never Read the Markdown file');
    expect(output).toContain('using-aitp skill');
    expect(output).toContain('ProposeResearchCheckpoint');
    expect(output).toContain('CommitResearchCheckpoint');
    expect(output).not.toContain('different namespaces');
    expect(output).not.toContain('explicit researcher decision');
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

describe('Research Loop scientific state', () => {
  it('default state has phase=idle and no action/progress/gate', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    const snapshot = svc.getSnapshot();
    expect(snapshot.phase).toBe('idle');
    expect(snapshot.currentAction).toBeUndefined();
    expect(snapshot.latestProgress).toBeUndefined();
    expect(snapshot.recentStateChange).toBeUndefined();
    expect(snapshot.humanGate).toBeUndefined();
  });

  it('setPhase transitions and publishes research.updated', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    const events: { snapshot?: { phase?: string } }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => events.push(e as never)));

    const change = svc.setPhase('orienting', 'start');
    expect(change.beforePhase).toBe('idle');
    expect(change.afterPhase).toBe('orienting');
    expect(events.at(-1)?.snapshot?.phase).toBe('orienting');
  });

  it('setPhase rejects invalid transition', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    expect(() => svc.setPhase('action_executing')).toThrow('Invalid phase transition');
  });

  it('setPhase rejects same phase', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    expect(() => svc.setPhase('idle')).toThrow('already');
  });

  it('planAction can plan directly from idle', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.createLine({ slug: 'main', title: 'Main' });

    const action = svc.planAction({
      kind: 'experiment', purpose: 'test', stopCondition: 'p < 0.05',
    });
    expect(action.status).toBe('planned');
    expect(action.kind).toBe('experiment');
    expect(action.actionId).toMatch(/[0-9a-f-]{36}/);
  });

  it('planAndStartAction begins directly from idle after focusing a question', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    svc.createLine({ slug: 'main', title: 'Main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Which path is consistent?' });
    svc.setFocus(question.id, 'run the bounded check');

    expect(svc.getSnapshot()).toMatchObject({
      phase: 'idle',
      currentFocus: { questionId: question.id },
    });

    const action = svc.planAndStartAction({
      questionId: question.id,
      kind: 'experiment',
      purpose: 'test the focused hypothesis',
      stopCondition: 'the consistency check completes',
    });

    expect(action).toMatchObject({
      questionId: question.id,
      lineSlug: 'main',
      status: 'in_progress',
    });
    expect(svc.getSnapshot()).toMatchObject({
      phase: 'action_executing',
      currentAction: { actionId: action.actionId, status: 'in_progress' },
    });
  });

  it('planAction rejects missing question/line', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');

    expect(() => svc.planAction({
      questionId: 'missing', kind: 'experiment', purpose: 'x', stopCondition: 'done',
    })).toThrow('Question missing not found');
    expect(() => svc.planAction({
      lineSlug: 'missing', kind: 'experiment', purpose: 'x', stopCondition: 'done',
    })).toThrow('Line missing not found');
  });

  it('planAction rejects when a foreground action is still live (no orphaning)', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAction({ kind: 'experiment', purpose: 'first', stopCondition: 'done' });

    expect(() => svc.planAction({ kind: 'derivation', purpose: 'second', stopCondition: 'done' })).toThrow(
      'Cannot plan a new action',
    );
    // The existing foreground action is preserved, not orphaned.
    expect(svc.getSnapshot().currentAction?.actionId).toBe(action.actionId);
    expect(svc.getSnapshot().currentAction?.status).toBe('planned');
    expect(svc.getSnapshot().phase).toBe('action_planned');
  });

  it('planAction error names the allowed next phases for an illegal phase', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    const action = svc.planAction({
      kind: 'experiment', purpose: 'x', stopCondition: 'done',
    });
    svc.startAction(action.actionId);
    svc.completeAction(action.actionId, 'completed');

    expect(() => svc.planAction({
      kind: 'derivation', purpose: 'try again', stopCondition: 'done',
    })).toThrow(/Cannot plan action from phase 'evaluating'. Allowed next phases: state_updated, idle, awaiting_human/);
  });

  it('start/complete lifecycle', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAction({
      kind: 'derivation', purpose: 'derive formula', stopCondition: 'consistent',
    });

    svc.startAction(action.actionId);
    expect(svc.getSnapshot().phase).toBe('action_executing');
    expect(svc.getSnapshot().currentAction?.status).toBe('in_progress');

    svc.completeAction(action.actionId, 'completed');
    expect(svc.getSnapshot().phase).toBe('evaluating');
    expect(svc.getSnapshot().currentAction?.status).toBe('completed');
  });

  it('concludeAction records scientific progress with the completed action atomically', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      kind: 'derivation',
      purpose: 'derive the symmetry constraint',
      stopCondition: 'the constraint is internally consistent',
    });

    const conclusion = svc.concludeAction({
      actionId: action.actionId,
      status: 'completed',
      progress: {
        headline: 'Symmetry constraint derived',
        motivation: 'The current question requires a closed-form constraint.',
        workPerformed: 'Derived the constraint from the representation algebra.',
        result: 'The constraint is consistent with the assumed generators.',
        mainlineImpact: 'The derivation supports the current research direction.',
        nextAction: 'Test the constraint against the numerical spectrum.',
        detail: {
          derivation: 'Applied the commutator identity and matched coefficients.',
          tests: ['Symbolic consistency check passed'],
          limitations: ['The derivation assumes an exact symmetry limit'],
        },
      },
    });

    expect(conclusion.action.status).toBe('completed');
    expect(conclusion.progress.result).toContain('consistent');
    expect(svc.getSnapshot().phase).toBe('state_updated');
    expect(svc.getSnapshot().currentAction?.status).toBe('completed');
    expect(svc.getSnapshot().latestProgress?.detail?.tests).toEqual(['Symbolic consistency check passed']);
  });

  it('concludeAction records what was learned when an action is abandoned', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      kind: 'experiment',
      purpose: 'test the numerical branch',
      stopCondition: 'the input validation failure is localized',
    });

    const conclusion = svc.concludeAction({
      actionId: action.actionId,
      status: 'abandoned',
      progress: {
        headline: 'Numerical branch abandoned',
        motivation: 'The input validation failure prevents a meaningful run.',
        workPerformed: 'Checked the harness inputs and reproduced the failure.',
        result: 'No physical result was obtained because the harness stopped early.',
        mainlineImpact: 'The branch needs input repair before a scientific comparison.',
        uncertainties: ['The remote input file still needs inspection'],
        nextAction: 'Repair the input and retry the bounded experiment.',
        detail: {
          limitations: ['This is a harness failure, not evidence against the hypothesis'],
        },
      },
    });

    expect(conclusion.action.status).toBe('abandoned');
    expect(svc.getSnapshot().phase).toBe('state_updated');
    expect(svc.getSnapshot().latestProgress?.uncertainties).toHaveLength(1);
  });

  it('concludeAction rejects an action that is not executing without changing state', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAction({
      kind: 'experiment', purpose: 'test the branch', stopCondition: 'done',
    });
    const before = svc.getSnapshot();

    expect(() => svc.concludeAction({
      actionId: action.actionId,
      status: 'completed',
      progress: {
        headline: 'Should not be recorded',
        motivation: 'The action has not started yet.',
        workPerformed: 'Nothing was executed.',
        result: 'No result.',
        mainlineImpact: 'No impact.',
      },
    })).toThrow("not in 'in_progress' status");
    expect(svc.getSnapshot()).toEqual(before);
  });

  it('startAction rejects wrong actionId', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    svc.planAction({ kind: 'experiment', purpose: 'x', stopCondition: 'done' });

    expect(() => svc.startAction('wrong')).toThrow('Action wrong not found');
  });

  it('startAction rejects when action already started', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAction({ kind: 'experiment', purpose: 'x', stopCondition: 'done' });
    svc.startAction(action.actionId);

    expect(() => svc.startAction(action.actionId)).toThrow("not in 'planned' status");
  });

  it('completeAction rejects when action not in_progress', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAction({ kind: 'experiment', purpose: 'x', stopCondition: 'done' });

    expect(() => svc.completeAction(action.actionId, 'completed')).toThrow('not in');
  });

  it('recordProgress stores report and transitions via phaseChange', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('orienting');

    const report = svc.recordProgress({
      headline: 'Gap found',
      motivation: 'No prior work',
      workPerformed: 'Literature review',
      result: 'Gap identified',
      mainlineImpact: 'New direction',
      uncertainties: ['scope unclear'],
      phaseChange: { from: 'orienting', to: 'gap_analysis' },
    });
    expect(report.headline).toBe('Gap found');
    expect(svc.getSnapshot().phase).toBe('gap_analysis');
    expect(svc.getSnapshot().latestProgress?.headline).toBe('Gap found');
    expect(svc.getSnapshot().recentStateChange?.beforePhase).toBe('orienting');
  });

  it('recordProgress rejects invalid phaseChange', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    expect(() => svc.recordProgress({
      headline: 'x', motivation: 'm', workPerformed: 'w', result: 'r',
      mainlineImpact: 'i', uncertainties: [],
      phaseChange: { from: 'idle', to: 'evaluating' },
    })).toThrow('Invalid phase transition');
  });

  it('recordProgress stores detail fields', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    svc.recordProgress({
      headline: 'detailed',
      motivation: 'm', workPerformed: 'w', result: 'r', mainlineImpact: 'i',
      uncertainties: [],
      detail: { assumptions: ['a1'], derivation: 'step 1', tests: ['t1'] },
    });
    expect(svc.getSnapshot().latestProgress?.detail?.assumptions).toEqual(['a1']);
  });

  it('requestHumanDecision sets awaiting_human', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('orienting');

    const gate = svc.requestHumanDecision({
      kind: 'approval', prompt: 'Approve this experiment?',
    });
    expect(gate.kind).toBe('approval');
    expect(svc.getSnapshot().phase).toBe('awaiting_human');
    expect(svc.getSnapshot().humanGate?.gateId).toBe(gate.gateId);
  });

  it('requestHumanDecision rejects mismatched actionId', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    svc.planAction({ kind: 'experiment', purpose: 'x', stopCondition: 'done' });

    expect(() => svc.requestHumanDecision({
      kind: 'approval', actionId: 'wrong', prompt: 'p',
    })).toThrow('Action wrong not found');
  });

  it('requestHumanDecision rejects while a human gate is already pending', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('orienting');
    const gate = svc.requestHumanDecision({ kind: 'approval', prompt: 'approve the first thing' });

    expect(() => svc.requestHumanDecision({ kind: 'decision', prompt: 'override it' })).toThrow(
      'already pending',
    );
    // The original unresolved gate is preserved, not overwritten.
    expect(svc.getSnapshot().humanGate?.gateId).toBe(gate.gateId);
    expect(svc.getSnapshot().humanGate?.resolvedAt).toBeUndefined();
    expect(svc.getSnapshot().phase).toBe('awaiting_human');
  });

  it('resolveHumanDecision restores a valid phase and keeps the resolved gate', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('orienting');
    const gate = svc.requestHumanDecision({
      kind: 'decision', prompt: 'Choose the next research direction',
    });

    const resolved = svc.resolveHumanDecision({
      gateId: gate.gateId,
      resolution: 'Continue with the measured path',
      nextPhase: 'gap_analysis',
    });

    expect(resolved).toMatchObject({
      gateId: gate.gateId,
      resolution: 'Continue with the measured path',
      resolvedAt: expect.any(Number),
    });
    expect(svc.getSnapshot().phase).toBe('gap_analysis');
    expect(svc.getSnapshot().humanGate?.resolution).toBe('Continue with the measured path');
    expect(svc.getSnapshot().recentStateChange).toMatchObject({
      beforePhase: 'awaiting_human',
      afterPhase: 'gap_analysis',
    });
  });

  it('resolveHumanDecision rejects a wrong gate id and an invalid recovery phase', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    const gate = svc.requestHumanDecision({
      kind: 'review', prompt: 'Review the latest evidence carefully',
    });

    expect(() => svc.resolveHumanDecision({
      gateId: 'wrong', resolution: 'ignored', nextPhase: 'idle',
    })).toThrow('No unresolved human gate');
    expect(() => svc.resolveHumanDecision({
      gateId: gate.gateId, resolution: 'ignored', nextPhase: 'state_updated',
    })).toThrow('Invalid human-gate recovery phase');
    expect(svc.getSnapshot().humanGate?.resolvedAt).toBeUndefined();
  });

  it('resolveHumanDecision rejects double resolution while preserving the first decision', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    const gate = svc.requestHumanDecision({
      kind: 'decision', prompt: 'Choose whether to continue the study',
    });
    svc.resolveHumanDecision({
      gateId: gate.gateId, resolution: 'continue', nextPhase: 'idle',
    });

    expect(() => svc.resolveHumanDecision({
      gateId: gate.gateId, resolution: 'replace', nextPhase: 'gap_analysis',
    })).toThrow('already resolved');
    expect(svc.getSnapshot().humanGate?.resolution).toBe('continue');
    expect(svc.getSnapshot().phase).toBe('idle');
  });

  it('blocks a requiresHumanApproval action until its matching approval gate is resolved', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAction({
      kind: 'experiment', purpose: 'test an approval-gated hypothesis', stopCondition: 'measurement complete',
      requiresHumanApproval: true,
    });

    expect(() => svc.startAction(action.actionId)).toThrow('requires a resolved human approval gate');

    const gate = svc.requestHumanDecision({
      kind: 'approval', actionId: action.actionId, prompt: 'Approve the gated experiment now',
    });
    expect(() => svc.startAction(action.actionId)).toThrow('requires a resolved human approval gate');

    svc.resolveHumanDecision({
      gateId: gate.gateId, resolution: 'approved', nextPhase: 'action_planned',
    });
    expect(() => svc.startAction(action.actionId)).not.toThrow();
    expect(svc.getSnapshot().phase).toBe('action_executing');
  });

  it('getScientificProgress brief omits detail', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    svc.recordProgress({
      headline: 'brief test',
      motivation: 'm', workPerformed: 'w', result: 'r', mainlineImpact: 'i',
      uncertainties: [],
      detail: { assumptions: ['a1'] },
    });

    const brief = svc.getScientificProgress('brief');
    expect(brief.latestProgress?.headline).toBe('brief test');
    expect(brief.latestProgress?.detail).toBeUndefined();
  });

  it('getScientificProgress detail includes detail', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    svc.recordProgress({
      headline: 'detail test',
      motivation: 'm', workPerformed: 'w', result: 'r', mainlineImpact: 'i',
      uncertainties: [],
      detail: { assumptions: ['a1'], derivation: 'd1' },
    });

    const detail = svc.getScientificProgress('detail');
    expect(detail.latestProgress?.detail?.assumptions).toEqual(['a1']);
    expect(detail.latestProgress?.detail?.derivation).toBe('d1');
  });

  it('getScientificProgress audit includes phaseChange and humanDecision', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('orienting');

    svc.recordProgress({
      headline: 'audit test',
      motivation: 'm', workPerformed: 'w', result: 'r', mainlineImpact: 'i',
      uncertainties: [],
      phaseChange: { from: 'orienting', to: 'gap_analysis' },
      humanDecision: 'proceed',
    });

    const audit = svc.getScientificProgress('audit');
    expect(audit.latestProgress?.phaseChange).toEqual({ from: 'orienting', to: 'gap_analysis' });
    expect(audit.latestProgress?.humanDecision).toBe('proceed');
  });

  it('scientific ops are blocked when mode is inactive', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);

    expect(() => svc.setPhase('orienting')).toThrow('AITP Research Mode is inactive');
    expect(() => svc.planAction({ kind: 'experiment', purpose: 'x', stopCondition: 'done' })).toThrow(
      'AITP Research Mode is inactive',
    );
    expect(() => svc.recordProgress({
      headline: 'x', motivation: 'm', workPerformed: 'w', result: 'r',
      mainlineImpact: 'i', uncertainties: [],
    })).toThrow('AITP Research Mode is inactive');
  });

  it('question CRUD does not auto-advance phase', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    const before = svc.getSnapshot().phase;
    svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    const after = svc.getSnapshot().phase;
    expect(before).toBe('idle');
    expect(after).toBe('idle');
  });

  it('full loop: orient→gap→plan→start→complete→evaluate→record→checkpoint_pending', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    svc.setPhase('orienting', 'begin');
    expect(svc.getSnapshot().phase).toBe('orienting');

    svc.recordProgress({
      headline: 'oriented', motivation: 'm', workPerformed: 'w', result: 'r',
      mainlineImpact: 'i', uncertainties: [],
      phaseChange: { from: 'orienting', to: 'gap_analysis' },
    });
    expect(svc.getSnapshot().phase).toBe('gap_analysis');

    const action = svc.planAction({
      kind: 'experiment', purpose: 'test', stopCondition: 'p < 0.05',
    });
    expect(svc.getSnapshot().phase).toBe('action_planned');

    svc.startAction(action.actionId);
    expect(svc.getSnapshot().phase).toBe('action_executing');

    svc.completeAction(action.actionId, 'completed');
    expect(svc.getSnapshot().phase).toBe('evaluating');

    svc.recordProgress({
      headline: 'evaluated', motivation: 'm', workPerformed: 'w', result: 'r',
      mainlineImpact: 'i', uncertainties: [],
      phaseChange: { from: 'evaluating', to: 'state_updated' },
    });
    expect(svc.getSnapshot().phase).toBe('state_updated');

    svc.setPhase('checkpoint_pending', 'ready to commit');
    expect(svc.getSnapshot().phase).toBe('checkpoint_pending');
  });
});

// ---------------------------------------------------------------------------
// Research Loop tool contracts and implementations
// ---------------------------------------------------------------------------

describe('Research Loop tool schemas', () => {
  let schemas: typeof import('#/features/aitpResearch/tools/researchTools');

  beforeEach(async () => {
    schemas = await import('#/features/aitpResearch/tools/researchTools');
  });

  it('PlanResearchActionInputSchema requires purpose ≥ 10 chars', () => {
    expect(schemas.PlanResearchActionInputSchema.safeParse({
      kind: 'experiment', purpose: 'short', stop_condition: 'done',
    }).success).toBe(false);
    expect(schemas.PlanResearchActionInputSchema.safeParse({
      kind: 'experiment', purpose: 'long enough purpose', stop_condition: 'done',
    }).success).toBe(true);
  });

  it('PlanResearchActionInputSchema rejects unknown kind', () => {
    expect(schemas.PlanResearchActionInputSchema.safeParse({
      kind: 'invalid', purpose: 'long enough purpose', stop_condition: 'done',
    }).success).toBe(false);
  });

  it('RecordResearchProgressInputSchema requires structured fields with min length', () => {
    expect(schemas.RecordResearchProgressInputSchema.safeParse({
      headline: 'ab', motivation: 'm', work_performed: 'w', result: 'r', mainline_impact: 'i',
    }).success).toBe(false);
    expect(schemas.RecordResearchProgressInputSchema.safeParse({
      headline: 'valid headline', motivation: 'valid motivation', work_performed: 'valid work',
      result: 'valid result', mainline_impact: 'valid impact', uncertainties: [],
    }).success).toBe(true);
  });

  it('RecordResearchProgressInputSchema rejects extra keys (strict)', () => {
    expect(schemas.RecordResearchProgressInputSchema.safeParse({
      headline: 'valid headline', motivation: 'valid motivation', work_performed: 'valid work',
      result: 'valid result', mainline_impact: 'valid impact', uncertainties: [], extra: 'bad',
    }).success).toBe(false);
  });

  it('ConcludeResearchActionInputSchema requires scientific content and rejects phase_change', () => {
    const base = {
      action_id: 'action-1',
      status: 'completed',
      headline: 'A meaningful conclusion',
      motivation: 'A bounded question needs an answer.',
      work_performed: 'Derived and checked the stated relation.',
      result: 'The relation is consistent with the assumptions.',
      mainline_impact: 'The result supports the current direction.',
    };
    expect(schemas.ConcludeResearchActionInputSchema.safeParse(base).success).toBe(true);
    expect(schemas.ConcludeResearchActionInputSchema.safeParse({
      ...base,
      phase_change: { from: 'evaluating', to: 'state_updated' },
    }).success).toBe(false);
    expect(schemas.ConcludeResearchActionInputSchema.safeParse({
      ...base,
      result: 'x',
    }).success).toBe(false);
  });

  it('ConcludeResearchActionInputSchema rejects unknown keys', () => {
    expect(schemas.ConcludeResearchActionInputSchema.safeParse({
      action_id: 'action-1',
      status: 'completed',
      headline: 'A meaningful conclusion',
      motivation: 'A bounded question needs an answer.',
      work_performed: 'Derived and checked the stated relation.',
      result: 'The relation is consistent with the assumptions.',
      mainline_impact: 'The result supports the current direction.',
      extra: true,
    }).success).toBe(false);
  });

  it('RequestResearchDecisionInputSchema requires prompt ≥ 10 chars', () => {
    expect(schemas.RequestResearchDecisionInputSchema.safeParse({
      kind: 'approval', prompt: 'short',
    }).success).toBe(false);
    expect(schemas.RequestResearchDecisionInputSchema.safeParse({
      kind: 'approval', prompt: 'Approve this experiment?',
    }).success).toBe(true);
  });

  it('SetResearchPhaseInputSchema requires a scientific reason', () => {
    expect(schemas.SetResearchPhaseInputSchema.safeParse({
      phase: 'orienting', reason: 'short',
    }).success).toBe(false);
    expect(schemas.SetResearchPhaseInputSchema.safeParse({
      phase: 'orienting', reason: 'Begin by mapping the evidence gap',
    }).success).toBe(true);
    expect(schemas.SetResearchPhaseInputSchema.safeParse({
      phase: 'orienting',
    }).success).toBe(false);
  });

  it('ResolveResearchDecisionInputSchema requires gate, resolution, and recovery phase', () => {
    expect(schemas.ResolveResearchDecisionInputSchema.safeParse({
      gate_id: 'g1', resolution: 'approved', next_phase: 'gap_analysis',
    }).success).toBe(true);
    expect(schemas.ResolveResearchDecisionInputSchema.safeParse({
      gate_id: 'g1', resolution: '', next_phase: 'gap_analysis',
    }).success).toBe(false);
    expect(schemas.ResolveResearchDecisionInputSchema.safeParse({
      gate_id: 'g1', resolution: 'approved', next_phase: 'not_a_phase',
    }).success).toBe(false);
  });

  it('StartResearchActionInputSchema requires action_id', () => {
    expect(schemas.StartResearchActionInputSchema.safeParse({}).success).toBe(false);
    expect(schemas.StartResearchActionInputSchema.safeParse({ action_id: 'a1' }).success).toBe(true);
  });

  it('CompleteResearchActionInputSchema requires completed or abandoned', () => {
    expect(schemas.CompleteResearchActionInputSchema.safeParse({
      action_id: 'a1', status: 'invalid',
    }).success).toBe(false);
    expect(schemas.CompleteResearchActionInputSchema.safeParse({
      action_id: 'a1', status: 'completed',
    }).success).toBe(true);
  });

  it('AcknowledgeResearchAlertInputSchema requires only a non-empty fingerprint', () => {
    expect(schemas.AcknowledgeResearchAlertInputSchema.safeParse({}).success).toBe(false);
    expect(schemas.AcknowledgeResearchAlertInputSchema.safeParse({ fingerprint: '' }).success).toBe(false);
    expect(schemas.AcknowledgeResearchAlertInputSchema.safeParse({ fingerprint: 'research.alert.example' }).success).toBe(true);
  });
});

describe('Research Loop tool implementations', () => {
  async function buildToolHarness() {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    return { modeSvc, researchSvc };
  }

  async function makeTool<T>(
    cls: new (
      research: import('#/features/aitpResearch/research/agentResearch').IAgentResearchService,
      mode: import('#/features/aitpResearch/mode/agentAitpMode').IAgentAitpModeService,
    ) => T,
    researchSvc: import('#/features/aitpResearch/research/agentResearch').IAgentResearchService,
    modeSvc: import('#/features/aitpResearch/mode/agentAitpMode').IAgentAitpModeService,
  ): Promise<T> {
    const mod = await import('#/features/aitpResearch/tools/researchToolsImpl');
    const ToolCls = (mod as unknown as Record<string, new (
      research: import('#/features/aitpResearch/research/agentResearch').IAgentResearchService,
      mode: import('#/features/aitpResearch/mode/agentAitpMode').IAgentAitpModeService,
    ) => T>)[cls.name];
    if (ToolCls === undefined) throw new Error(`Tool ${cls.name} not found`);
    return new ToolCls(researchSvc, modeSvc);
  }

  it('PlanResearchAction returns scientific language output and action id', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('orienting');
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).PlanResearchActionTool,
      researchSvc, modeSvc,
    );
    const exec = tool.resolveExecution({
      kind: 'experiment',
      purpose: 'Test the hypothesis about X',
      expected_evidence: [],
      stop_condition: 'p < 0.05',
      allowed_tool_kinds: [],
      requires_human_approval: false,
    });
    const result = await runnableExecution(exec).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('Planned experiment action');
    expect(output).toMatch(/Action ID: [0-9a-f-]{36}/);
    expect(output).toContain('Purpose: Test the hypothesis about X');
    expect(output).toContain('Stop condition: p < 0.05');
    expect(output).toContain('Next step');
  });

  it('BeginResearchAction atomically plans and starts a non-gated action', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('orienting');
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).BeginResearchActionTool,
      researchSvc, modeSvc,
    );
    const exec = tool.resolveExecution({
      kind: 'simulation',
      purpose: 'Run the bounded simulation for the current hypothesis',
      expected_evidence: ['simulation output'],
      stop_condition: 'the output is reproducible',
      allowed_tool_kinds: ['Bash'],
      requires_human_approval: false,
    });
    const result = await runnableExecution(exec).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    expect(researchSvc.getSnapshot().phase).toBe('action_executing');
    expect(result.output).toContain('Started simulation action');
    expect(result.output).toMatch(/Action ID: [0-9a-f-]{36}/);
  });

  it('ConcludeResearchAction reports physical work first and completes the loop in one call', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('orienting');
    const actionTool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).BeginResearchActionTool,
      researchSvc, modeSvc,
    );
    const begin = await runnableExecution(actionTool.resolveExecution({
      kind: 'derivation',
      purpose: 'Derive the constrained response',
      expected_evidence: ['consistent coefficients'],
      stop_condition: 'the coefficients satisfy the identity',
      allowed_tool_kinds: [],
      requires_human_approval: false,
    })).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(begin.isError).toBeFalsy();
    const actionId = researchSvc.getSnapshot().currentAction?.actionId;
    expect(actionId).toBeDefined();

    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).ConcludeResearchActionTool,
      researchSvc, modeSvc,
    );
    const result = await runnableExecution(tool.resolveExecution({
      action_id: actionId!,
      status: 'completed',
      headline: 'Response constraint derived',
      motivation: 'The current question requires a constrained response.',
      work_performed: 'Derived the response from the Ward identity and checked coefficients.',
      result: 'All coefficients satisfy the identity.',
      mainline_impact: 'The result supports the current symmetry hypothesis.',
      uncertainties: [],
      next_action: 'Compare the relation with the numerical output.',
      detail: {
        derivation: 'Matched the independent tensor structures.',
        tests: ['Coefficient check passed'],
      },
    })).execute({ turnId: 1, toolCallId: 'tc2', signal: new AbortController().signal });

    expect(result.isError).toBeFalsy();
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output.startsWith('Scientific work:')).toBe(true);
    expect(output).toContain('Ward identity');
    expect(output).toContain('All coefficients satisfy the identity');
    expect(output).toContain('Coefficient check passed');
    expect(output).toContain('Mainline impact');
    expect(researchSvc.getSnapshot().phase).toBe('state_updated');
    expect(researchSvc.getSnapshot().currentAction?.status).toBe('completed');
  });

  it('SetResearchPhase reports transition, reason, and next-step significance without ids', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).SetResearchPhaseTool,
      researchSvc, modeSvc,
    );
    const exec = tool.resolveExecution({
      phase: 'orienting',
      reason: 'Begin by mapping the evidence gap before choosing an action',
    });
    const result = await runnableExecution(exec).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('idle');
    expect(output).toContain('orienting');
    expect(output).toContain('Begin by mapping the evidence gap');
    expect(output).toContain('Next step significance');
    expect(output).not.toMatch(/\brevision\b/i);
    expect(output).not.toMatch(/\b(?:id|gate_id|action_id)\b/i);
  });

  it('StartResearchAction reports phase and action purpose', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('gap_analysis');
    const action = researchSvc.planAction({
      kind: 'derivation', purpose: 'derive the formula', stopCondition: 'consistent',
    });
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).StartResearchActionTool,
      researchSvc, modeSvc,
    );
    const exec = tool.resolveExecution({ action_id: action.actionId });
    const result = await runnableExecution(exec).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('Started action');
    expect(output).toContain('derive the formula');
    expect(output).toContain('executing phase');
  });

  it('CompleteResearchAction returns mainline impact guidance', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('gap_analysis');
    const action = researchSvc.planAction({
      kind: 'experiment', purpose: 'test something here', stopCondition: 'done',
    });
    researchSvc.startAction(action.actionId);
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).CompleteResearchActionTool,
      researchSvc, modeSvc,
    );
    const exec = tool.resolveExecution({ action_id: action.actionId, status: 'completed' });
    const result = await runnableExecution(exec).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('marked as completed');
    expect(output).toContain('Mainline impact');
    expect(output).toContain('RecordResearchProgress');
  });

  it('RecordResearchProgress returns result, mainline impact, and next step', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).RecordResearchProgressTool,
      researchSvc, modeSvc,
    );
    const exec = tool.resolveExecution({
      headline: 'Gap identified in literature',
      motivation: 'No prior work covers this',
      work_performed: 'Reviewed 5 papers',
      result: 'Clear gap in existing approaches',
      mainline_impact: 'Opens a new research direction',
      uncertainties: ['scope of gap unclear'],
      next_action: 'Formalize the research question',
    });
    const result = await runnableExecution(exec).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('Recorded progress: Gap identified in literature');
    expect(output).toContain('Clear gap in existing approaches');
    expect(output).toContain('Opens a new research direction');
    expect(output).toContain('scope of gap unclear');
    expect(output).toContain('Formalize the research question');
  });

  it('RequestResearchDecision reports awaiting-human state', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('orienting');
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).RequestResearchDecisionTool,
      researchSvc, modeSvc,
    );
    const exec = tool.resolveExecution({
      kind: 'approval',
      prompt: 'Should we proceed with this experiment?',
    });
    const result = await runnableExecution(exec).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('Human approval requested');
    expect(output).toContain('Should we proceed with this experiment?');
    expect(output).toContain('awaiting');
  });

  it('ResolveResearchDecision reports the human decision and restored phase', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('orienting');
    const gate = researchSvc.requestHumanDecision({
      kind: 'decision', prompt: 'Choose the next research direction',
    });
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).ResolveResearchDecisionTool,
      researchSvc, modeSvc,
    );
    const exec = tool.resolveExecution({
      gate_id: gate.gateId,
      resolution: 'Continue with the measured path',
      next_phase: 'gap_analysis',
    });
    const result = await runnableExecution(exec).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('Human decision recorded: Continue with the measured path');
    expect(output).toContain('Research phase restored to gap_analysis');
    expect(output).toContain('Next step significance');
  });

  it('all tools reject when mode is inactive', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    // mode not entered → inactive
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).PlanResearchActionTool,
      researchSvc, modeSvc,
    );
    const exec = tool.resolveExecution({
      kind: 'experiment',
      purpose: 'long enough purpose',
      expected_evidence: [],
      stop_condition: 'done',
      allowed_tool_kinds: [],
      requires_human_approval: false,
    });
    const result = await runnableExecution(exec).execute({ turnId: 1, toolCallId: 'tc1', signal: new AbortController().signal });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Injection Brief/Detail verbosity and scientific content
// ---------------------------------------------------------------------------

describe('injection Brief/Detail and scientific content', () => {
  it('brief on new turn contains full guidance and scientific state', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    researchSvc.createQuestion({ lineSlug: 'main', wording: 'What causes X?' });
    researchSvc.setPhase('orienting');
    researchSvc.recordProgress({
      headline: 'Initial orientation done',
      motivation: 'Need to understand the problem',
      workPerformed: 'Literature scan',
      result: 'Problem space mapped',
      mainlineImpact: 'Ready for gap analysis',
      uncertainties: ['scope unclear'],
      nextAction: 'Identify specific gaps',
    });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const output = providers.call(0, { isNewTurn: true })!;
    expect(output).toContain('Phase: orienting');
    expect(output).toContain('What causes X?');
    expect(output).toContain('Initial orientation done');
    expect(output).toContain('Problem space mapped');
    expect(output).toContain('Ready for gap analysis');
    expect(output).toContain('Identify specific gaps');
    expect(output).toContain('Research state guidance');
  });

  it('brief does not contain AITP audit fields (entry/hash/revision/checkpoint id)', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const output = providers.call(0, { isNewTurn: true })!;
    expect(output).not.toMatch(/\bentry[_ ]id\b/i);
    expect(output).not.toMatch(/\bcheckpoint[_ ]id\b/i);
    expect(output).not.toMatch(/\brevision\b/i);
    expect(output).not.toMatch(/\bidempotency\b/i);
  });

  it('no semantic change returns undefined (no duplicate text appended)', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    researchSvc.setPhase('orienting');

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const brief = providers.call(0, { isNewTurn: true })!;
    expect(brief).toContain('Research state guidance');

    // Same turn, same phase, no progress, no action/run/next-step/attention
    // change → the provider returns undefined instead of appending anything.
    const sameTurn = providers.call(0, {
      isNewTurn: false,
      lastDisclosure: {
        verbosity: 'brief',
        snapshotRevision: researchSvc.getSnapshot().revision,
        phase: researchSvc.getSnapshot().phase,
        progressRecordedAt: undefined,
      },
    });
    expect(sameTurn).toBeUndefined();
  });

  it('progress change triggers brief even on same turn', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    researchSvc.setPhase('orienting');

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    // First call (new turn) → brief
    const firstOutput = providers.call(0, { isNewTurn: true })!;
    expect(firstOutput).toContain('Research state guidance');

    // Record new progress after the first injection
    researchSvc.recordProgress({
      headline: 'New finding',
      motivation: 'm', workPerformed: 'w', result: 'r',
      mainlineImpact: 'impact', uncertainties: [],
    });
    const newProgressAt = researchSvc.getSnapshot().latestProgress?.recordedAt;

    // Same turn but progress changed → brief
    const secondOutput = providers.call(0, {
      isNewTurn: false,
      lastDisclosure: {
        verbosity: 'brief',
        snapshotRevision: researchSvc.getSnapshot().revision - 1,
        phase: 'orienting',
        progressRecordedAt: undefined, // old: no progress
      },
    })!;
    expect(secondOutput).toContain('New finding');
    expect(secondOutput).toContain('Research state guidance');
    expect(newProgressAt).toBeDefined();
  });

  it('human gate is displayed when pending', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    researchSvc.setPhase('orienting');
    researchSvc.requestHumanDecision({
      kind: 'approval',
      prompt: 'Approve the experimental design?',
    });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const output = providers.call(0, { isNewTurn: true })!;
    expect(output).toContain('Pending human gate');
    expect(output).toContain('Approve the experimental design?');
    expect(output).toContain('paused');
  });

  it('resolved human gate remains traceable without blocking injection', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    researchSvc.setPhase('orienting');
    const gate = researchSvc.requestHumanDecision({
      kind: 'decision', prompt: 'Choose the next research direction',
    });
    researchSvc.resolveHumanDecision({
      gateId: gate.gateId,
      resolution: 'Continue with the measured path',
      nextPhase: 'gap_analysis',
    });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const output = providers.call(0, { isNewTurn: true })!;
    expect(output).toContain('Resolved gate');
    expect(output).toContain('Continue with the measured path');
    expect(output).not.toContain('Pending human gate');
    expect(output).not.toContain('paused pending this decision');
    expect(researchSvc.getSnapshot().humanGate?.resolvedAt).toBeDefined();
  });

  it('inactive mode returns undefined (zero disclosure)', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, false);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    expect(providers.call(0, { isNewTurn: true })).toBeUndefined();
    expect(providers.call(0, { isNewTurn: false })).toBeUndefined();
  });

  it('phase change triggers brief even on same turn (no progress change)', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    // New turn → brief with phase idle
    providers.call(0, { isNewTurn: true });

    // Change phase
    researchSvc.setPhase('orienting');

    // Same turn, phase changed → brief
    const output = providers.call(0, {
      isNewTurn: false,
      lastDisclosure: {
        verbosity: 'brief',
        snapshotRevision: researchSvc.getSnapshot().revision - 1,
        phase: 'idle',
        progressRecordedAt: undefined,
      },
    })!;
    expect(output).toContain('Research state guidance');
    expect(output).toContain('Phase: orienting');
  });

  it('missing lastDisclosure re-arms brief (compaction / undo fallback)', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    researchSvc.setPhase('orienting');

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    // Same turn, but the prior disclosure was dropped (compaction/undo) → brief again.
    const output = providers.call(0, { isNewTurn: false });
    expect(output).toContain('Research state guidance');
    expect(output).toContain('Phase: orienting');
  });

  it('action identity change triggers brief', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    researchSvc.setPhase('action_planned');

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const firstAction = researchSvc.planAction({
      kind: 'simulation',
      purpose: 'Run the bounded scheduler calculation for the current question.',
      stopCondition: 'Stop after the analyzer has produced the required evidence.',
    });
    const first = providers.call(0, { isNewTurn: true })!;
    expect(first).toContain('Action: simulation');
    expect(first).toContain('Stop:');
    const firstDisclosure = providers.call(0, { isNewTurn: true, returnDisclosure: true })!;

    // Same turn, same phase, no progress; complete the first action, return to
    // a planning phase, and plan a fresh action → the currentActionId changed →
    // brief re-states the action.
    researchSvc.startAction(firstAction.actionId);
    researchSvc.completeAction(firstAction.actionId, 'completed');
    researchSvc.setPhase('state_updated');
    researchSvc.setPhase('gap_analysis');
    const secondAction = researchSvc.planAction({
      kind: 'derivation',
      purpose: 'Derive the symmetry constraint.',
      stopCondition: 'Stop when the derivation is written out.',
    });
    const output = providers.call(0, {
      isNewTurn: false,
      lastDisclosure: firstDisclosure as never,
    })!;
    expect(output).toContain('Action: derivation');
    expect(output).toContain('Derive the symmetry constraint.');
    expect(secondAction.actionId).not.toBe(firstAction.actionId);
  });

  it('attention-only change emits a delta (maintenance)', async () => {
    const modeSvc = await buildRealModeService();
    const coordinator = {
      _serviceBrand: undefined,
      onDidUpdate: vi.fn(() => ({ dispose: vi.fn() })),
      refresh: vi.fn(),
      snapshot: vi.fn(),
      reset: vi.fn(),
    };
    const cleanReceipt: AitpMaintenanceReceipt = {
      status: 'ready',
      refreshedAt: 1,
      memoryStatus: 'available',
      workstream: 'main',
      latestWorkingNoteAt: Date.now() - 3_600_000,
      activeNewerThanWorkingNote: false,
      unresolvedFailureCount: 0,
      unresolvedFailures: [],
      nextAction: undefined,
      warningSummaries: [],
      check: {
        status: 'clean',
        counts: { entries: 0, notes: 0, errors: 0, warnings: 0 },
        findingCodes: [],
      },
    };
    const issueReceipt: AitpMaintenanceReceipt = {
      ...cleanReceipt,
      activeNewerThanWorkingNote: true,
      nextAction: 'Review the current state',
    };
    let currentReceipt: AitpMaintenanceReceipt = cleanReceipt;
    coordinator.snapshot.mockImplementation(() => currentReceipt);

    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      modeSvc,
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
      coordinator as never,
    );
    await modeSvc.enter({ actor: 'user' });
    researchSvc.setPhase('orienting');
    // A progress next-action pins the effective next step, so a maintenance
    // change does not move it — only the attention changes.
    researchSvc.recordProgress({
      headline: 'Orientation reviewed',
      motivation: 'm', workPerformed: 'w', result: 'r',
      mainlineImpact: 'impact', uncertainties: [],
      nextAction: 'Identify specific gaps',
    });

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, true);
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const brief = providers.call(0, { isNewTurn: true })!;
    expect(brief).toContain('Research state guidance');
    expect(brief).not.toContain('AITP maintenance:');
    // The injected disclosure is what the next step actually compares against.
    const firstDisclosure = providers.call(0, { isNewTurn: true, returnDisclosure: true })!;

    // Maintenance gains issues without any scientific-state change → delta
    // carries only the attention, no guidance restatement.
    currentReceipt = issueReceipt;
    const output = providers.call(0, {
      isNewTurn: false,
      lastDisclosure: firstDisclosure as never,
    })!;
    expect(output).toContain('(update)');
    expect(output).not.toContain('Research state guidance');
    expect(output).toContain('AITP maintenance:');
    expect(output).toContain('Active entries are newer than the latest Working Note;');
  });
});

// ---------------------------------------------------------------------------
// ResearchLoopCoordinator — minimal lifecycle coordinator
// ---------------------------------------------------------------------------

describe('ResearchLoopCoordinator', () => {
  async function buildCoordinatorHarness(opts?: {
    readonly agentId?: string;
    readonly enterMode?: boolean;
    readonly pauseLoop?: boolean;
  }) {
    const adapter = makeStubAdapter();
    const modeSvc = await buildRealModeService(adapter);
    const researchSvc = await buildRealResearchService(modeSvc, adapter);
    if (opts?.enterMode !== false) {
      await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    }
    if (opts?.pauseLoop) {
      modeSvc.pauseLoop(wire.getModel(ResearchModel).current.revision);
    }
    const { ResearchLoopCoordinator } = await import('#/features/aitpResearch/loop/researchLoopCoordinator');
    const scopeCtx = makeAgentScopeContext({
      agentId: opts?.agentId ?? MAIN_AGENT_ID,
      agentScope: '',
    });
    const maintenance = {
      _serviceBrand: undefined,
      onDidUpdate: vi.fn(() => ({ dispose: vi.fn() })),
      refresh: vi.fn().mockResolvedValue({
        status: 'ready',
        refreshedAt: 1,
        memoryStatus: 'available',
        activeNewerThanWorkingNote: false,
        unresolvedFailureCount: 0,
        unresolvedFailures: [],
        warningSummaries: [],
        check: { status: 'clean', findingCodes: [] },
      }),
      snapshot: vi.fn(),
      reset: vi.fn(),
    };
    const { ResearchTurnAdmission } = await import('#/features/aitpResearch/loop/researchTurnAdmission');
    const admission = new ResearchTurnAdmission(
      eventBus,
      scopeCtx,
      modeSvc,
    );
    disposables.add(admission);
    const coordinator = new ResearchLoopCoordinator(
      eventBus,
      researchSvc,
      modeSvc,
      scopeCtx,
      admission,
      maintenance as never,
    );
    disposables.add(coordinator);
    return { modeSvc, researchSvc, coordinator, adapter, maintenance };
  }

  function turnStarted(turnId: number, origin: TurnStartedEvent['origin'] = { kind: 'user' }) {
    eventBus.publish({
      type: 'turn.started',
      turnId,
      origin,
      intent: origin.kind === 'system_trigger' && origin.name === 'goal_continuation'
        ? GOAL_CONTINUATION_INTENT
        : undefined,
    });
  }

  function turnEnded(turnId: number, reason: 'completed' | 'cancelled' | 'failed' = 'completed') {
    eventBus.publish({ type: 'turn.ended', turnId, reason });
  }

  it('turn.started advances idle → orienting for an admitted research turn', async () => {
    const { researchSvc } = await buildCoordinatorHarness();
    expect(researchSvc.getSnapshot().phase).toBe('idle');

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);

    expect(researchSvc.getSnapshot().phase).toBe('orienting');
  });

  it('does not advance when mode is inactive', async () => {
    const { researchSvc } = await buildCoordinatorHarness({ enterMode: false });

    turnStarted(1);

    expect(researchSvc.getSnapshot().phase).toBe('idle');
  });

  it('does not advance when loop is paused', async () => {
    const { researchSvc } = await buildCoordinatorHarness({ pauseLoop: true });

    turnStarted(1);

    expect(researchSvc.getSnapshot().phase).toBe('idle');
  });

  it('does not advance for a subagent', async () => {
    const { researchSvc } = await buildCoordinatorHarness({ agentId: 'subagent-1' });

    turnStarted(1);

    expect(researchSvc.getSnapshot().phase).toBe('idle');
  });

  it('does not advance when phase is already non-idle', async () => {
    const { researchSvc } = await buildCoordinatorHarness();
    researchSvc.setPhase('orienting');
    researchSvc.setPhase('gap_analysis');

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);

    expect(researchSvc.getSnapshot().phase).toBe('gap_analysis');
  });

  it('duplicate turn.started is idempotent', async () => {
    const { researchSvc } = await buildCoordinatorHarness();

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    expect(researchSvc.getSnapshot().phase).toBe('orienting');
    const revisionAfterFirst = researchSvc.getSnapshot().revision;

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    expect(researchSvc.getSnapshot().revision).toBe(revisionAfterFirst);
  });

  it('turn.ended refreshes maintenance without changing or completing the action', async () => {
    const { researchSvc, adapter, maintenance } = await buildCoordinatorHarness();
    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    researchSvc.setPhase('gap_analysis');
    const action = researchSvc.planAction({
      kind: 'experiment', purpose: 'test something here', stopCondition: 'done',
    });
    researchSvc.startAction(action.actionId);
    expect(researchSvc.getSnapshot().currentAction?.status).toBe('in_progress');

    const showSpy = vi.spyOn(adapter, 'show');
    const checkSpy = vi.spyOn(adapter, 'check');

    turnEnded(1, 'completed');

    expect(researchSvc.getSnapshot().phase).toBe('action_executing');
    expect(researchSvc.getSnapshot().currentAction?.status).toBe('in_progress');
    expect(maintenance.refresh).toHaveBeenCalledWith({ workstream: 'main', force: true });
    expect(showSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
  });

  it('turn.ended with failure refreshes maintenance without inventing alerts', async () => {
    const { researchSvc, maintenance } = await buildCoordinatorHarness();
    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    const before = researchSvc.getSnapshot();

    turnEnded(1, 'failed');

    const after = researchSvc.getSnapshot();
    expect(after.phase).toBe(before.phase);
    expect(after.alerts).toEqual(before.alerts);
    expect(after.revision).toBe(before.revision);
    expect(maintenance.refresh).toHaveBeenCalledOnce();
  });

  it('turn.ended skips maintenance when research state did not change', async () => {
    const { researchSvc, maintenance } = await buildCoordinatorHarness();
    researchSvc.setPhase('orienting');
    turnStarted(1, GOAL_CONTINUATION_ORIGIN);

    const updatedEvents: { type: string }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => updatedEvents.push(e as never)));

    turnEnded(1, 'completed');

    expect(maintenance.refresh).not.toHaveBeenCalled();
    expect(updatedEvents).toHaveLength(0);
    expect(researchSvc.getSnapshot().phase).toBe('orienting');
  });

  it('subscription persists across mode exit/re-enter (no re-registration)', async () => {
    const { modeSvc, researchSvc } = await buildCoordinatorHarness();

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    expect(researchSvc.getSnapshot().phase).toBe('orienting');

    await modeSvc.exit();
    await modeSvc.enter({ actor: 'user' });

    researchSvc.setPhase('idle');

    turnStarted(2, GOAL_CONTINUATION_ORIGIN);
    expect(researchSvc.getSnapshot().phase).toBe('orienting');
  });

  it('ordinary user turn abstains: no idle → orienting even while mode is active', async () => {
    const { researchSvc } = await buildCoordinatorHarness();
    expect(researchSvc.getSnapshot().phase).toBe('idle');

    turnStarted(1);

    expect(researchSvc.getSnapshot().phase).toBe('idle');
  });

  it('ordinary user turn that mutates research does not trigger turn-end AITP maintenance', async () => {
    const { researchSvc, maintenance } = await buildCoordinatorHarness();

    turnStarted(1);
    researchSvc.createLine({ slug: 'side-line', title: 'Ordinary side work' });
    researchSvc.createQuestion({ lineSlug: 'side-line', wording: 'Unrelated question' });

    turnEnded(1, 'completed');

    expect(maintenance.refresh).not.toHaveBeenCalled();
  });

  it('non-goal system trigger turn abstains from orienting', async () => {
    const { researchSvc } = await buildCoordinatorHarness();

    turnStarted(3, { kind: 'system_trigger', name: 'some_other_system_event' });

    expect(researchSvc.getSnapshot().phase).toBe('idle');
  });

  it('cron turn abstains from orienting', async () => {
    const { researchSvc } = await buildCoordinatorHarness();

    turnStarted(4, {
      kind: 'cron_job',
      jobId: 'job-1',
      cron: '* * * * *',
      recurring: true,
      coalescedCount: 0,
      stale: false,
    });

    expect(researchSvc.getSnapshot().phase).toBe('idle');
  });

  it('a granted research lease is released so a later ordinary turn abstains', async () => {
    const { researchSvc } = await buildCoordinatorHarness();

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    expect(researchSvc.getSnapshot().phase).toBe('orienting');
    researchSvc.setPhase('idle');
    turnEnded(1, 'completed');

    turnStarted(2);
    expect(researchSvc.getSnapshot().phase).toBe('idle');
  });

  it('each admitted turn start notes the same period once (loop count, no duplicate period)', async () => {
    const { researchSvc } = await buildCoordinatorHarness();
    const first = researchSvc.getPeriod();
    expect(first).toMatchObject({ lineSlug: 'main', loopCount: 0 });

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    turnEnded(1, 'completed');
    turnStarted(2, GOAL_CONTINUATION_ORIGIN);
    turnEnded(2, 'completed');

    const period = researchSvc.getPeriod();
    expect(period?.id).toBe(first?.id);
    expect(period?.loopCount).toBe(2);
    expect(researchSvc.getSnapshot().period?.id).toBe(first?.id);
  });

  it('an ordinary turn never touches the period', async () => {
    const { researchSvc } = await buildCoordinatorHarness();
    const first = researchSvc.getPeriod();

    turnStarted(1);
    turnEnded(1, 'completed');

    expect(researchSvc.getPeriod()).toEqual(first);
  });
});

describe('ResearchTurnAdmission', () => {
  async function buildAdmissionHarness(opts?: {
    readonly agentId?: string;
    readonly enterMode?: boolean;
    readonly pauseLoop?: boolean;
    readonly goalContinuation?: boolean;
  }) {
    const modeSvc = await buildRealModeService();
    if (opts?.enterMode !== false) {
      await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    }
    if (opts?.pauseLoop) {
      modeSvc.pauseLoop(wire.getModel(ResearchModel).current.revision);
    }
    const { ResearchTurnAdmission } = await import('#/features/aitpResearch/loop/researchTurnAdmission');
    const admission = new ResearchTurnAdmission(
      eventBus,
      makeAgentScopeContext({ agentId: opts?.agentId ?? MAIN_AGENT_ID, agentScope: '' }),
      modeSvc,
    );
    disposables.add(admission);
    return { modeSvc, admission };
  }

  function startTurn(
    turnId: number,
    origin: TurnStartedEvent['origin'] = { kind: 'user' },
    withGoalIntent = true,
  ) {
    eventBus.publish({
      type: 'turn.started',
      turnId,
      origin,
      intent: withGoalIntent && origin.kind === 'system_trigger' && origin.name === 'goal_continuation'
        ? GOAL_CONTINUATION_INTENT
        : undefined,
    });
  }

  function endTurn(turnId: number) {
    eventBus.publish({ type: 'turn.ended', turnId, reason: 'completed' });
  }

  it('admits a Goal research continuation while mode is active and loop is running', async () => {
    const { admission } = await buildAdmissionHarness();
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.isTurnAdmitted(1)).toBe(true);
    expect(admission.isCurrentResearchTurn()).toBe(true);
  });

  it('does not admit an ordinary user turn even while mode is active', async () => {
    const { admission } = await buildAdmissionHarness();
    startTurn(1);
    expect(admission.isTurnAdmitted(1)).toBe(false);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('does not admit when mode is inactive', async () => {
    const { admission } = await buildAdmissionHarness({ enterMode: false });
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('does not admit when the loop is paused', async () => {
    const { admission } = await buildAdmissionHarness({ pauseLoop: true });
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('does not admit when the adapter health is degraded', async () => {
    const { modeSvc, admission } = await buildAdmissionHarness();
    modeSvc.setPhase('degraded');
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('does not admit a trigger without a Goal continuation lease', async () => {
    const { admission } = await buildAdmissionHarness({ goalContinuation: false });
    startTurn(1, GOAL_CONTINUATION_ORIGIN, false);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('is inert for a subagent instance', async () => {
    const { admission } = await buildAdmissionHarness({ agentId: 'subagent-1' });
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('releases the lease on turn.ended so a later turn is not admitted', async () => {
    const { admission } = await buildAdmissionHarness();
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.isCurrentResearchTurn()).toBe(true);
    endTurn(1);
    expect(admission.isCurrentResearchTurn()).toBe(false);
    startTurn(2);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });
});

function maintenanceReceipt(
  overrides?: Partial<AitpMaintenanceReceipt>,
): AitpMaintenanceReceipt {
  return {
    status: 'ready',
    refreshedAt: 1000,
    memoryStatus: 'available',
    activeNewerThanWorkingNote: false,
    unresolvedFailureCount: 0,
    unresolvedFailures: [],
    warningSummaries: [],
    check: { status: 'clean', findingCodes: [] },
    ...overrides,
  };
}

function makeCoordinatorStub(initial?: AitpMaintenanceReceipt) {
  const emitter = new Emitter<AitpMaintenanceReceipt>();
  let receipt: AitpMaintenanceReceipt | undefined = initial;
  return {
    coordinator: {
      _serviceBrand: undefined as undefined,
      onDidUpdate: emitter.event,
      refresh: vi.fn(),
      snapshot: () => receipt,
      reset: vi.fn(),
    },
    emit(next: AitpMaintenanceReceipt): void {
      receipt = next;
      emitter.fire(next);
    },
  };
}

describe('Research Program and Period layers', () => {
  it('mode enter with a line opens a period and the snapshot carries program/period/status', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    const snapshot = researchSvc.getSnapshot();
    expect(snapshot.period).toMatchObject({ lineSlug: 'main', loopCount: 0 });
    expect(snapshot.period?.endedAt).toBeUndefined();
    expect(snapshot.period?.id).toBeTruthy();
    expect(researchSvc.getPeriod()).toEqual(snapshot.period);
    // No AITP enter topic has been observed: the program is not fabricated.
    expect(snapshot.program).toBeUndefined();
    expect(researchSvc.getProgram()).toBeNull();
    expect(snapshot.status).toMatchObject({
      currentLineSlug: 'main',
      phase: 'idle',
      health: 'ok',
      attention: [],
    });
  });

  it('snapshot stays backward compatible while adding the layered fields', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    researchSvc.createQuestion({ lineSlug: 'main', wording: 'Q1' });

    const snapshot = researchSvc.getSnapshot();
    expect(snapshot).toMatchObject({
      mode: 'ready',
      loopStatus: 'active',
      currentLineSlug: 'main',
      openQuestionCount: 1,
      activeQuestionCount: 0,
      blockedQuestionCount: 0,
      phase: 'idle',
      aitpHealth: expect.objectContaining({ phase: 'ready' }),
    });
    expect(snapshot.questions).toHaveLength(1);
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.revision).toBeGreaterThanOrEqual(1);
    expect(snapshot).toHaveProperty('program');
    expect(snapshot).toHaveProperty('period');
    expect(snapshot).toHaveProperty('status');
    expect(snapshot.program).toBeUndefined();
    expect(snapshot.period?.lineSlug).toBe('main');
  });

  it('forms the program only from a real enter topic and never fabricates one', async () => {
    const modeSvc = await buildRealModeService();
    const stub = makeCoordinatorStub();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      modeSvc,
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
      stub.coordinator,
    );
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    expect(svc.getSnapshot().program).toBeUndefined();

    // A degraded receipt without a topic must not fabricate a program.
    stub.emit(maintenanceReceipt({ status: 'degraded' }));
    expect(svc.getSnapshot().program).toBeUndefined();

    // A ready receipt with a topic establishes the program.
    const topic = { id: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md' };
    stub.emit(maintenanceReceipt({ topic }));
    const program = svc.getSnapshot().program;
    expect(program).toMatchObject({
      topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md',
    });
    const establishedAt = program!.establishedAt;

    // The identical topic is a no-op: establishedAt stays stable.
    stub.emit(maintenanceReceipt({ topic }));
    expect(svc.getSnapshot().program!.establishedAt).toBe(establishedAt);

    // A different topic replaces the program outright.
    stub.emit(maintenanceReceipt({
      topic: { id: 'topic-b', title: 'Topic B', goalText: 'Prove Y', goalSource: 'TOPIC.md' },
    }));
    expect(svc.getSnapshot().program).toMatchObject({ topicId: 'topic-b', title: 'Topic B' });
  });

  it('line switch archives the old period with its focus intact and opens a fresh one', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    const q1 = researchSvc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    researchSvc.setFocus(q1.id);
    researchSvc.noteLoopBoundary();
    researchSvc.createLine({ slug: 'alt', title: 'Alt' });
    researchSvc.switchLine('alt');

    const history = wire.getModel(ResearchModel).current.periodHistory;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      lineSlug: 'main',
      currentQuestionId: q1.id,
      loopCount: 1,
      endedAt: expect.any(Number),
    });
    const period = researchSvc.getPeriod();
    expect(period).toMatchObject({ lineSlug: 'alt', loopCount: 0 });
    expect(period?.currentQuestionId).toBeUndefined();
    expect(researchSvc.getSnapshot().period?.lineSlug).toBe('alt');
  });

  it('undo restores the local program and period working state', async () => {
    const modeSvc = await buildRealModeService();
    const stub = makeCoordinatorStub();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      modeSvc,
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
      stub.coordinator,
    );
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
    svc.noteLoopBoundary();
    stub.emit(maintenanceReceipt({
      topic: { id: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md' },
    }));
    expect(svc.getSnapshot().period?.loopCount).toBe(1);
    expect(svc.getSnapshot().program).toBeDefined();

    wire.dispatch(contextUndo({ count: 1 }));
    eventBus.publish({ type: 'context.undone', turns: 1 });

    const snapshot = svc.getSnapshot();
    expect(snapshot.period?.loopCount).toBe(0);
    expect(snapshot.program).toBeUndefined();
  });

  it('the status projection stays isolated to the current workstream', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    researchSvc.createLine({ slug: 'alt', title: 'Alt' });
    const q1 = researchSvc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    researchSvc.switchLine('alt');
    const q2 = researchSvc.createQuestion({ lineSlug: 'alt', wording: 'Q2' });
    researchSvc.setFocus(q2.id);
    researchSvc.steer({
      kind: 'block_question',
      questionId: q1.id,
      expectedRevision: researchSvc.getSnapshot().revision,
    });

    const snapshot = researchSvc.getSnapshot();
    expect(snapshot.status).toMatchObject({
      currentLineSlug: 'alt',
      currentQuestionId: q2.id,
      health: 'ok',
      attention: [],
    });
    // The blocked question on the other line stays in the audit surface…
    expect(snapshot.alerts.some((alert) => alert.questionId === q1.id)).toBe(true);
    // …but never leaks into the current workstream's display projection.
    expect(snapshot.status?.attention).not.toContain(
      `Question ${q1.id} is blocked; resolve its blocking condition before continuing.`,
    );
  });
});

describe('Session AITP current-state maintenance coordinator', () => {
  function enteredResult(): AitpEnterResult {
    return {
      schema: 'aitp/enter-0.2',
      memory_status: 'partial',
      root: '/workspace',
      topic: {
        id: 'topic-secret',
        title: 'Test topic',
        goal: { text: 'Keep the next step explicit', source: '.aitp/topic/TOPIC.md' },
      },
      recent_entries: [],
      unresolved_failures: [],
      next_action: {
        text: 'Review the unresolved failure before the next bounded action',
        entry_id: 'entry-secret',
        authority: 'agent',
        created_at: '2026-08-24T20:00:00.000Z',
        source: '.aitp/topic/entries/entry-secret.md',
      },
      latest_working_note: {
        id: 'note-secret',
        created_at: '2026-08-24T20:00:00.000Z',
        source: '.aitp/topic/notes/note-secret.md',
      },
      recent_notes: [],
      counts: {
        active: 3,
        superseded: 1,
        unresolved_failures: 2,
        malformed: 0,
        omitted_active: 0,
        active_newer_than_latest_working_note: 1,
      },
      warnings: [{
        code: 'legacy_warning',
        path: '/private/path',
        message: 'private warning message',
      }],
    };
  }

  function checkReport(overrides?: {
    readonly status?: 'clean' | 'findings';
    readonly counts?: {
      readonly entries: number;
      readonly notes: number;
      readonly errors: number;
      readonly warnings: number;
    };
    readonly findings?: AitpCheckReport['findings'];
  }): AitpCheckReport {
    return {
      schema: 'aitp/check-report-0.1',
      root: '/workspace',
      status: overrides?.status ?? 'clean',
      counts: overrides?.counts ?? { entries: 3, notes: 1, errors: 0, warnings: 0 },
      findings: overrides?.findings ?? [],
    };
  }

  it('runs enter before check and projects only safe maintenance data', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    const entered = enteredResult();
    const order: string[] = [];
    const enterSpy = vi.spyOn(adapter, 'enter').mockImplementation(async () => {
      order.push('enter');
      return entered;
    });
    const checkSpy = vi.spyOn(adapter, 'check').mockImplementation(async () => {
      order.push('check');
      return checkReport({
        status: 'findings',
        counts: { entries: 3, notes: 1, errors: 0, warnings: 1 },
        findings: [{
          level: 'warning',
          code: 'policy_warning',
          path: '/private/check-path',
          message: 'private check message',
        }],
      });
    });
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const updates: AitpMaintenanceReceipt[] = [];
    disposables.add(coordinator.onDidUpdate((receipt) => updates.push(receipt)));

    const receipt = await coordinator.refresh({ workstream: 'main', force: true });

    expect(enterSpy).toHaveBeenCalledWith({ workstream: 'main', signal: expect.any(AbortSignal) });
    expect(checkSpy).toHaveBeenCalledWith({ workstream: 'main', signal: expect.any(AbortSignal) });
    expect(order).toEqual(['enter', 'check']);
    expect(receipt).toMatchObject({
      status: 'ready',
      memoryStatus: 'partial',
      workstream: 'main',
      latestWorkingNoteAt: Date.parse('2026-08-24T20:00:00.000Z'),
      activeNewerThanWorkingNote: true,
      unresolvedFailureCount: 2,
      nextAction: 'Review the unresolved failure before the next bounded action',
      warningSummaries: [{ level: 'warning', code: 'legacy_warning' }],
      check: {
        status: 'findings',
        counts: { entries: 3, notes: 1, errors: 0, warnings: 1 },
        findingCodes: ['policy_warning'],
      },
    });
    expect(receipt.nextActionDetails).toMatchObject({ entryId: 'entry-secret', authority: 'agent' });
    expect(receipt.topic).toEqual({
      id: 'topic-secret',
      title: 'Test topic',
      goalText: 'Keep the next step explicit',
      goalSource: '.aitp/topic/TOPIC.md',
    });
    expect(updates).toEqual([receipt]);
    expect(JSON.stringify(receipt)).not.toContain('/private/check-path');
    expect(JSON.stringify(receipt)).not.toContain('private check message');
  });

  it('omits the topic from the receipt when the topic memory is not established', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    vi.spyOn(adapter, 'enter').mockResolvedValue({
      ...enteredResult(),
      memory_status: 'not_established',
    });
    vi.spyOn(adapter, 'check').mockResolvedValue(checkReport());
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);

    const receipt = await coordinator.refresh({ workstream: 'main', force: true });

    expect(receipt.status).toBe('ready');
    expect(receipt.topic).toBeUndefined();
  });

  it('keeps valid check findings ready, including error findings', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    vi.spyOn(adapter, 'enter').mockResolvedValue(enteredResult());
    const checkSpy = vi.spyOn(adapter, 'check').mockResolvedValue(checkReport());
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);

    const ready = await coordinator.refresh({ workstream: 'main', force: true });
    expect(ready.status).toBe('ready');

    checkSpy.mockResolvedValue(checkReport({
      status: 'findings',
      counts: { entries: 3, notes: 1, errors: 1, warnings: 0 },
      findings: [{
        level: 'error',
        code: 'missing_refs',
        path: '/private/error-path',
        message: 'private error message',
      }],
    }));
    const findings = await coordinator.refresh({ workstream: 'main', force: true });

    expect(findings).toMatchObject({
      status: 'ready',
      check: { status: 'findings', findingCodes: ['missing_refs'] },
    });
    expect(checkSpy).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent refreshes and caches non-forced reads', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    let releaseEnter!: (result: AitpEnterResult) => void;
    const enterSpy = vi.spyOn(adapter, 'enter').mockReturnValue(new Promise((resolve) => {
      releaseEnter = resolve;
    }));
    const checkSpy = vi.spyOn(adapter, 'check').mockResolvedValue(checkReport());
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);

    const first = coordinator.refresh({ workstream: 'main', force: true });
    const second = coordinator.refresh({ workstream: 'main', force: true });
    expect(second).toBe(first);

    releaseEnter(enteredResult());
    const firstReceipt = await first;
    const cachedReceipt = await coordinator.refresh({ workstream: 'main' });

    expect(firstReceipt.status).toBe('ready');
    expect(cachedReceipt).toBe(firstReceipt);
    expect(enterSpy).toHaveBeenCalledOnce();
    expect(checkSpy).toHaveBeenCalledOnce();
  });

  it('does not call AITP when the adapter is not ready', async () => {
    const adapter = makeStubAdapter();
    const enterSpy = vi.spyOn(adapter, 'enter');
    const checkSpy = vi.spyOn(adapter, 'check');
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);

    const receipt = await coordinator.refresh({ workstream: 'main' });

    expect(receipt).toMatchObject({
      status: 'degraded',
      degradedReason: 'adapter_not_ready',
      check: { status: 'unavailable', findingCodes: [] },
    });
    expect(enterSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
  });

  it('fails closed without a bound workstream: no enter/check and no Topic read', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    const enterSpy = vi.spyOn(adapter, 'enter');
    const checkSpy = vi.spyOn(adapter, 'check');
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);

    const forced = await coordinator.refresh({ force: true });
    expect(forced).toMatchObject({
      status: 'degraded',
      degradedReason: 'workstream_unbound',
      workstream: undefined,
      check: { status: 'unavailable', findingCodes: [] },
    });
    expect(enterSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();

    // A non-forced unbound read reuses the fail-closed receipt, never spawns.
    const cached = await coordinator.refresh();
    expect(cached).toBe(forced);
    expect(enterSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
  });

  it('recovers once a workstream is bound after an unbound refresh', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    const enterSpy = vi.spyOn(adapter, 'enter').mockResolvedValue(enteredResult());
    const checkSpy = vi.spyOn(adapter, 'check').mockResolvedValue(checkReport());
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);

    const unbound = await coordinator.refresh({ force: true });
    expect(unbound).toMatchObject({ status: 'degraded', degradedReason: 'workstream_unbound' });
    expect(enterSpy).not.toHaveBeenCalled();

    const bound = await coordinator.refresh({ workstream: 'main', force: true });
    expect(bound).toMatchObject({ status: 'ready', workstream: 'main' });
    expect(enterSpy).toHaveBeenCalledWith({ workstream: 'main', signal: expect.any(AbortSignal) });
    expect(checkSpy).toHaveBeenCalledWith({ workstream: 'main', signal: expect.any(AbortSignal) });
  });

  it('does not let a late refresh from another workstream become current', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    const releases = new Map<string, (result: AitpEnterResult) => void>();
    vi.spyOn(adapter, 'enter').mockImplementation((options) => new Promise((resolve) => {
      releases.set(options?.workstream ?? '__default__', resolve);
    }));
    vi.spyOn(adapter, 'check').mockResolvedValue(checkReport());
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const updates: AitpMaintenanceReceipt[] = [];
    disposables.add(coordinator.onDidUpdate((value) => updates.push(value)));

    const main = coordinator.refresh({ workstream: 'main', force: true });
    const alt = coordinator.refresh({ workstream: 'alt', force: true });
    releases.get('alt')!(enteredResult());
    await alt;
    releases.get('main')!(enteredResult());
    await main;

    expect(coordinator.snapshot()?.workstream).toBe('alt');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.workstream).toBe('alt');
  });

  it('does not let reset allow an obsolete refresh to repopulate state', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    let releaseEnter!: (result: AitpEnterResult) => void;
    vi.spyOn(adapter, 'enter').mockReturnValue(new Promise((resolve) => {
      releaseEnter = resolve;
    }));
    const checkSpy = vi.spyOn(adapter, 'check');
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);

    const pending = coordinator.refresh({ workstream: 'main', force: true });
    coordinator.reset();
    releaseEnter(enteredResult());

    await expect(pending).resolves.toMatchObject({ degradedReason: 'stale_generation' });
    expect(checkSpy).not.toHaveBeenCalled();
    expect(coordinator.snapshot()).toBeUndefined();
  });
});

describe('Research maintenance lifecycle projection', () => {
  function receipt(status: 'ready' | 'degraded' = 'ready'): AitpMaintenanceReceipt {
    return {
      status,
      refreshedAt: Date.now(),
      memoryStatus: 'available',
      workstream: 'main',
      latestWorkingNoteAt: Date.now() - 3_600_000,
      activeNewerThanWorkingNote: true,
      unresolvedFailureCount: 2,
      unresolvedFailures: [],
      nextAction: 'Inspect the failed bounded action',
      warningSummaries: [{ level: 'warning', code: 'policy_warning' }],
      check: {
        status: status === 'ready' ? 'findings' : 'unavailable',
        counts: status === 'ready'
          ? { entries: 2, notes: 1, errors: 0, warnings: 1 }
          : undefined,
        findingCodes: status === 'ready' ? ['policy_warning'] : [],
      },
      degradedReason: status === 'ready' ? undefined : 'check_unavailable',
    };
  }

  function coordinatorStub(value: AitpMaintenanceReceipt) {
    return {
      _serviceBrand: undefined,
      onDidUpdate: vi.fn(() => ({ dispose: vi.fn() })),
      refresh: vi.fn().mockResolvedValue(value),
      snapshot: vi.fn().mockReturnValue(value),
      reset: vi.fn(),
    };
  }

  it('refreshes maintenance only after a ready probe and maps degraded receipt to mode', async () => {
    const adapter = makeStubAdapter();
    const calls: string[] = [];
    vi.spyOn(adapter, 'probe').mockImplementation(async () => {
      calls.push('probe');
      adapter._setHealth({ phase: 'ready' });
      return adapter.health;
    });
    const coordinator = coordinatorStub(receipt());
    coordinator.refresh.mockImplementation(async () => {
      calls.push('refresh');
      return receipt();
    });
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      { enabled: () => true } as never,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator as never,
    );

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    expect(calls).toEqual(['probe', 'refresh']);
    expect(coordinator.refresh).toHaveBeenCalledWith({ workstream: 'main', force: true });
    expect(modeSvc.phase).toBe('ready');

    coordinator.refresh.mockResolvedValue(receipt('degraded'));
    await modeSvc.exit();
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    expect(modeSvc.phase).toBe('degraded');
  });

  it('fails closed on unbound enter: no spawn/read and degraded reason workstream_unbound', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    const enterSpy = vi.spyOn(adapter, 'enter');
    const checkSpy = vi.spyOn(adapter, 'check');
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      { enabled: () => true } as never,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator,
    );

    await modeSvc.enter({ actor: 'user' });

    expect(modeSvc.phase).toBe('degraded');
    expect(modeSvc.maintenanceDegradedReason).toBe('workstream_unbound');
    expect(enterSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
    expect(coordinator.snapshot()).toMatchObject({ status: 'degraded', degradedReason: 'workstream_unbound' });
  });

  it('passes the bound line as the workstream on enter', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    const enterSpy = vi.spyOn(adapter, 'enter').mockResolvedValue({
      schema: 'aitp/enter-0.3',
      workstream: 'main',
      memory_status: 'available',
      root: '/workspace',
      topic: { id: 't1', title: 'T', goal: { text: 'g', source: '.aitp/topic/TOPIC.md' } },
      recent_entries: [],
      unresolved_failures: [],
      next_action: { status: 'not_established', source: null },
      latest_working_note: null,
      recent_notes: [],
      counts: { active: 0, superseded: 0, unresolved_failures: 0, malformed: 0, omitted_active: 0, active_newer_than_latest_working_note: null },
      warnings: [],
    } satisfies AitpEnterResult);
    const checkSpy = vi.spyOn(adapter, 'check').mockResolvedValue({
      schema: 'aitp/check-report-0.2',
      workstream: 'main',
      root: '/workspace',
      status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0, by_code: {}, outside_scope: { errors: 0, warnings: 0 } },
      findings: [],
    } satisfies AitpCheckReport);
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      { enabled: () => true } as never,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator,
    );

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    expect(enterSpy).toHaveBeenCalledWith({ workstream: 'main', signal: expect.any(AbortSignal) });
    expect(checkSpy).toHaveBeenCalledWith({ workstream: 'main', signal: expect.any(AbortSignal) });
    expect(modeSvc.phase).toBe('ready');
    expect(coordinator.snapshot()).toMatchObject({ status: 'ready', workstream: 'main' });
  });

  it('re-scopes maintenance to the switched line without reusing the old receipt', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    const entered: AitpEnterResult = {
      schema: 'aitp/enter-0.3',
      workstream: 'main',
      memory_status: 'available',
      root: '/workspace',
      topic: { id: 't1', title: 'T', goal: { text: 'g', source: '.aitp/topic/TOPIC.md' } },
      recent_entries: [],
      unresolved_failures: [],
      next_action: { status: 'not_established', source: null },
      latest_working_note: null,
      recent_notes: [],
      counts: { active: 0, superseded: 0, unresolved_failures: 0, malformed: 0, omitted_active: 0, active_newer_than_latest_working_note: null },
      warnings: [],
    };
    const enteredAlt: AitpEnterResult = { ...entered, workstream: 'alt' };
    const checkClean: AitpCheckReport = {
      schema: 'aitp/check-report-0.2',
      root: '/workspace',
      workstream: 'main',
      status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0, by_code: {}, outside_scope: { errors: 0, warnings: 0 } },
      findings: [],
    };
    const enterSpy = vi.spyOn(adapter, 'enter')
      .mockResolvedValueOnce(entered)
      .mockResolvedValueOnce(enteredAlt);
    const checkSpy = vi.spyOn(adapter, 'check')
      .mockResolvedValueOnce(checkClean)
      .mockResolvedValueOnce({ ...checkClean, workstream: 'alt' });
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      { enabled: () => true } as never,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator,
    );
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter,
      makeToolExecutorStub(), makeStubGoalService(), coordinator,
    );

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    expect(coordinator.snapshot()).toMatchObject({ status: 'ready', workstream: 'main' });
    expect(enterSpy).toHaveBeenCalledTimes(1);
    expect(checkSpy).toHaveBeenCalledTimes(1);

    // Switch to a second line: maintenance must re-run under the new workstream,
    // and the new receipt must not be the old line's receipt.
    researchSvc.createLine({ slug: 'alt', title: 'Alt' });
    researchSvc.switchLine('alt');
    await vi.waitFor(() => {
      expect(enterSpy).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(checkSpy).toHaveBeenCalledTimes(2);
    });

    expect(enterSpy).toHaveBeenLastCalledWith({ workstream: 'alt', signal: expect.any(AbortSignal) });
    expect(checkSpy).toHaveBeenLastCalledWith({ workstream: 'alt', signal: expect.any(AbortSignal) });
    expect(coordinator.snapshot()).toMatchObject({ status: 'ready', workstream: 'alt' });
    expect(modeSvc.phase).toBe('ready');
  });

  it('resets maintenance before exit events and forces refresh on active restore', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready' });
    const coordinator = coordinatorStub(receipt());
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      { enabled: () => true } as never,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator as never,
    );

    await modeSvc.enter({ actor: 'user' });
    coordinator.refresh.mockClear();
    coordinator.reset.mockClear();
    let resetWasVisibleAtExitEvent = false;
    disposables.add(eventBus.subscribe('aitp_mode.updated', () => {
      if (!modeSvc.isActive) resetWasVisibleAtExitEvent = coordinator.reset.mock.calls.length > 0;
    }));

    await modeSvc.exit();
    expect(coordinator.reset).toHaveBeenCalledOnce();
    expect(resetWasVisibleAtExitEvent).toBe(true);

    await modeSvc.enter({ actor: 'user' });
    coordinator.refresh.mockClear();
    await wire.restore();
    expect(coordinator.refresh).toHaveBeenCalledWith({ workstream: undefined, force: true });
  });

  it('projects the coordinator receipt into the Research snapshot and injection', async () => {
    const coordinator = coordinatorStub(receipt());
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
      coordinator as never,
    );

    const snapshot = researchSvc.getSnapshot();
    expect(snapshot.aitpMaintenance).toBe(coordinator.snapshot.mock.results[0]!.value);
    const content = renderResearchInjection(snapshot, 'brief').content;

    // Brief keeps only the attention the model must handle — no full receipt,
    // no counts/check detail, no entry/hash/path leaks.
    expect(content).toContain('AITP maintenance:');
    expect(content).toContain('Active entries are newer than the latest Working Note;');
    expect(content).toContain('2 unresolved failure(s).');
    expect(content).toContain('Next AITP action: Inspect the failed bounded action');
    expect(content).toContain('Warnings: policy_warning');
    expect(content).not.toContain('Unresolved failures: 2');
    expect(content).not.toContain('Finding codes:');
    expect(content).not.toContain('Working Note age:');
    expect(content).not.toContain('Check:');
  });
});

describe('Research lifecycle alerts', () => {
  it('produces stable blocked and reopened alerts, clears conditions, and consumes transitions on progress', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    const question = researchSvc.createQuestion({ lineSlug: 'main', wording: 'Q1' });

    const blocked = researchSvc.updateQuestion({
      questionId: question.id,
      expectedRevision: question.revision,
      workflow: 'blocked',
    });
    const blockedAlert = researchSvc.getSnapshot().alerts.find((alert) => alert.kind === 'blocked');
    expect(blockedAlert).toMatchObject({
      kind: 'blocked',
      questionId: question.id,
      lineSlug: 'main',
    });
    expect(blockedAlert?.fingerprint).toContain(question.id);
    expect(blockedAlert?.createdAt).toEqual(expect.any(Number));
    const stableRevision = researchSvc.getSnapshot().revision;
    expect(researchSvc.getSnapshot().revision).toBe(stableRevision);

    researchSvc.updateQuestion({
      questionId: question.id,
      expectedRevision: blocked.revision,
      workflow: 'closed',
    });
    expect(researchSvc.getSnapshot().alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'blocked', questionId: question.id, state: 'cleared' }),
    ]));

    researchSvc.reopenQuestion(question.id, 'new evidence', researchSvc.getSnapshot().revision);
    const reopened = researchSvc.getSnapshot().alerts.find((alert) => alert.kind === 'reopened');
    expect(reopened).toMatchObject({ kind: 'reopened', questionId: question.id, lineSlug: 'main' });

    researchSvc.recordProgress({
      headline: 'Reopened question reviewed',
      motivation: 'The question needs a fresh bounded assessment',
      workPerformed: 'Reviewed the current research state',
      result: 'The lifecycle transition is recorded',
      mainlineImpact: 'Continue with an explicit bounded action',
      uncertainties: [],
    });
    const afterProgress = researchSvc.getSnapshot();
    expect(afterProgress.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'reopened', questionId: question.id, state: 'cleared' }),
    ]));
    expect(afterProgress.alerts.some((alert) => alert.kind === 'contradiction')).toBe(false);
  });

  it('acknowledges an alert while retaining it in the snapshot and hiding it from injection', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    const question = researchSvc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    researchSvc.updateQuestion({ questionId: question.id, workflow: 'blocked' });

    const before = researchSvc.getSnapshot().alerts.find((alert) => alert.kind === 'blocked');
    expect(before).toBeDefined();
    researchSvc.acknowledgeAlert(before!.fingerprint);

    const snapshot = researchSvc.getSnapshot();
    const retained = snapshot.alerts.find((alert) => alert.fingerprint === before!.fingerprint);
    expect(retained).toMatchObject({ fingerprint: before!.fingerprint, acknowledgedAt: expect.any(Number) });
    expect(renderResearchInjection(snapshot, 'brief').content).not.toContain(before!.message);
  });

  it.each(['show', 'check'] as const)('records commit_failed and degraded alerts when the %s barrier fails', async (barrier) => {
    const adapter = makeStubAdapter();
    if (barrier === 'show') {
      vi.spyOn(adapter, 'show').mockRejectedValue(new Error('show failed'));
    } else {
      vi.spyOn(adapter, 'check').mockResolvedValue({
        schema: 'aitp/check-report-0.1',
        root: '/workspace',
        status: 'findings',
        counts: { entries: 1, notes: 0, errors: 1, warnings: 0 },
        findings: [{ level: 'error', code: 'missing_refs', path: 'entry.md', message: 'missing refs' }],
      } as AitpCheckReport);
    }
    const modeSvc = await buildRealModeService(adapter);
    const researchSvc = await buildRealResearchService(modeSvc, adapter);
    await modeSvc.enter({ actor: 'user' });
    const checkpoint = researchSvc.proposeCheckpoint({});
    bindCompleteCheckpointReceipt(checkpoint.checkpointId);

    await expect(researchSvc.commitCheckpoint({ checkpointId: checkpoint.checkpointId, entryId: 'e1' })).rejects.toThrow();

    const failed = researchSvc.getSnapshot();
    expect(modeSvc.phase).toBe('degraded');
    expect(failed.alerts.some((alert) => alert.kind === 'commit_failed')).toBe(true);
    expect(failed.alerts.some((alert) => alert.kind === 'degraded')).toBe(true);
    expect(failed.pendingCheckpoint?.checkpointId).toBe(checkpoint.checkpointId);
    expect(failed.latestCommittedCheckpoint).toBeUndefined();

    modeSvc.setPhase('ready');
    expect(researchSvc.getSnapshot().alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'degraded', state: 'cleared' }),
      expect.objectContaining({ kind: 'commit_failed', state: 'active' }),
    ]));
  });

  it('reconciles maintenance stale and unresolved-failure alerts on true/false transitions', async () => {
    const makeReceipt = (activeNewerThanWorkingNote: boolean, unresolvedFailureCount: number): AitpMaintenanceReceipt => ({
      status: 'ready',
      refreshedAt: 1,
      memoryStatus: 'available',
      activeNewerThanWorkingNote,
      unresolvedFailureCount,
      unresolvedFailures: [],
      warningSummaries: [],
      check: {
        status: 'clean',
        counts: { entries: 0, notes: 0, errors: 0, warnings: 0 },
        findingCodes: [],
      },
    });
    let current = makeReceipt(true, 2);
    const coordinatorUpdate = new Emitter<AitpMaintenanceReceipt>();
    const coordinator = {
      _serviceBrand: undefined,
      onDidUpdate: coordinatorUpdate.event,
      refresh: vi.fn(),
      snapshot: vi.fn(() => current),
      reset: vi.fn(),
    };
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const service = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'ready' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
      coordinator as never,
    );

    // Maintenance receipt changes are a lifecycle event: firing `onDidUpdate`
    // runs the reconcile, then the published snapshot is read back purely.
    coordinatorUpdate.fire(current);
    let snapshot = service.getSnapshot();
    expect(snapshot.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'stale', classification: 'warning' }),
      expect.objectContaining({
        kind: 'stale',
        classification: 'historical_unresolved',
        message: expect.stringContaining('2 historical unresolved failure'),
      }),
    ]));

    current = makeReceipt(false, 0);
    coordinatorUpdate.fire(current);
    snapshot = service.getSnapshot();
    expect(snapshot.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ fingerprint: 'research.alert.stale.maintenance', state: 'cleared' }),
      expect.objectContaining({ fingerprint: 'research.alert.blocked.aitp-failure', state: 'cleared' }),
    ]));
  });

  it('clears disappeared AITP warnings while retaining their history', async () => {
    let current: AitpMaintenanceReceipt = {
      status: 'ready',
      refreshedAt: 1,
      memoryStatus: 'available',
      activeNewerThanWorkingNote: false,
      unresolvedFailureCount: 0,
      unresolvedFailures: [],
      warningSummaries: [{ level: 'warning', code: 'invalid_timestamp' }],
      check: {
        status: 'findings',
        counts: { entries: 1, notes: 0, errors: 0, warnings: 1 },
        findingCodes: ['invalid_timestamp'],
      },
    };
    const coordinatorUpdate = new Emitter<AitpMaintenanceReceipt>();
    const coordinator = {
      _serviceBrand: undefined,
      onDidUpdate: coordinatorUpdate.event,
      refresh: vi.fn(),
      snapshot: vi.fn(() => current),
      reset: vi.fn(),
    };
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const service = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'ready' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
      coordinator as never,
    );

    coordinatorUpdate.fire(current);
    expect(service.getSnapshot().alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fingerprint: 'research.alert.warning.aitp.invalid_timestamp',
        classification: 'warning',
        state: 'active',
      }),
    ]));
    current = {
      ...current,
      warningSummaries: [],
      check: {
        ...current.check,
        status: 'clean',
        counts: { entries: 1, notes: 0, errors: 0, warnings: 0 },
        findingCodes: [],
      },
    };
    coordinatorUpdate.fire(current);
    expect(service.getSnapshot().alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fingerprint: 'research.alert.warning.aitp.invalid_timestamp',
        state: 'cleared',
      }),
    ]));
  });

  it('restores alert state through conversation undo, including cleared history', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const service = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'ready' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    service.createLine({ slug: 'main', title: 'Main' });
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
    const question = service.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    service.updateQuestion({ questionId: question.id, workflow: 'blocked' });
    expect(service.getSnapshot().alerts.some((alert) => alert.kind === 'blocked')).toBe(true);

    wire.dispatch(contextUndo({ count: 1 }));
    const restored = service.getSnapshot();
    expect(restored.questions).toHaveLength(0);
    expect(restored.alerts.some((alert) => alert.kind === 'blocked')).toBe(false);
  });

  it('replays persisted alert state during wire restore', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const service = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'ready' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    service.createLine({ slug: 'main', title: 'Main' });
    const question = service.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    service.updateQuestion({ questionId: question.id, workflow: 'blocked' });
    const beforeRestore = service.getSnapshot().alerts.find((alert) => alert.kind === 'blocked');
    await wire.flush();
    await wire.restore();

    const afterRestore = service.getSnapshot().alerts.find((alert) => alert.kind === 'blocked');
    expect(afterRestore).toMatchObject({
      fingerprint: beforeRestore?.fingerprint,
      createdAt: beforeRestore?.createdAt,
      questionId: question.id,
    });
  });

  it('AcknowledgeResearchAlert returns semantic output without making the fingerprint the main text', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    const question = researchSvc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    researchSvc.updateQuestion({ questionId: question.id, workflow: 'blocked' });
    const alert = researchSvc.getSnapshot().alerts.find((item) => item.kind === 'blocked')!;

    const tool = await (async () => {
      const mod = await import('#/features/aitpResearch/tools/researchToolsImpl');
      return new mod.AcknowledgeResearchAlertTool(researchSvc, modeSvc);
    })();
    const result = await runnableExecution(tool.resolveExecution({ fingerprint: alert.fingerprint })).execute({
      turnId: 1,
      toolCallId: 'ack-alert',
      signal: new AbortController().signal,
    });
    const output = typeof result.output === 'string' ? result.output : '';
    expect(result.isError).toBeFalsy();
    expect(output).toContain('Acknowledged the blocked alert');
    expect(output).toContain(`question ${question.id}`);
    expect(output).not.toContain(alert.fingerprint);
    expect(researchSvc.getSnapshot().alerts.find((item) => item.fingerprint === alert.fingerprint)?.acknowledgedAt).toBeDefined();
  });
});

describe('ResearchPlan bridge', () => {
  function planService(): IAgentPlanService {
    return {
      _serviceBrand: undefined,
      enter: async (id = 'research-plan') => {
        wire.dispatch(planModeEnter({ id }));
      },
      cancel: () => {},
      clear: async () => {},
      exit: () => {
        wire.dispatch(planModeExit({}));
      },
      recordRevision: async () => {},
      recordResolution: (outcome, selectedLabel) => {
        const plan = wire.getModel(PlanModel).current;
        wire.dispatch(planResolution({
          planId: plan.id!,
          planRevision: plan.revisionCount?.[plan.id!] ?? 0,
          outcome,
          selectedLabel,
        }));
      },
      getResolution: () => wire.getModel(PlanModel).current.resolution ?? null,
      status: async () => {
        const plan = wire.getModel(PlanModel).current;
        return plan.active ? { id: plan.id!, content: '# Research plan', path: '/tmp/research-plan.md' } : null;
      },
    };
  }

  function makeResearchService(plan: IAgentPlanService) {
    return new (requireResearchService())(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
      undefined,
      undefined,
      undefined,
      plan,
    );
  }

  function requireResearchService(): typeof import('#/features/aitpResearch/research/agentResearchService').AgentResearchService {
    throw new Error('unreachable');
  }

  it('keeps a prepared draft pending after the nested Plan exits', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const plan = planService();
    const service = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(),
      makeToolExecutorStub(), makeStubGoalService(), undefined, undefined, undefined, plan,
    );
    service.createLine({ slug: 'main', title: 'Main' });
    const question = service.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    const draft = await service.prepareResearchPlan({
      questionId: question.id,
      objective: 'Bound the next calculation',
      steps: ['Compute', 'Compare'],
      expectedEvidence: ['A converged result'],
      stopCondition: 'Stop after one comparison',
      usePlanMode: true,
    });
    expect(wire.getModel(PlanModel).current.active).toBe(true);
    plan.recordResolution?.('approved');
    plan.exit();
    expect(service.getResearchPlan()).toEqual(draft);
    expect(service.getResearchPlan()?.status).toBe('draft');
  });

  it('finalizes only after an approved Plan resolution and rejects stale Research state', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const plan = planService();
    const service = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(),
      makeToolExecutorStub(), makeStubGoalService(), undefined, undefined, undefined, plan,
    );
    service.createLine({ slug: 'main', title: 'Main' });
    const question = service.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    await service.prepareResearchPlan({
      questionId: question.id, objective: 'Objective', steps: ['Step'],
      expectedEvidence: ['Evidence'], stopCondition: 'Stop', usePlanMode: true,
    });
    plan.recordResolution?.('approved');
    plan.exit();
    const revision = service.getSnapshot().revision;
    service.updateQuestion({ questionId: question.id, assessment: 'Changed' });
    await expect(service.finalizeResearchPlan()).rejects.toThrow('stale');
    expect(service.getResearchPlan()?.status).toBe('draft');
    expect(service.getSnapshot().revision).toBeGreaterThan(revision);
  });

  it('finalizes explicitly, discards, and restores a draft through conversation undo', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const plan = planService();
    const service = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(),
      makeToolExecutorStub(), makeStubGoalService(), undefined, undefined, undefined, plan,
    );
    service.createLine({ slug: 'main', title: 'Main' });
    const question = service.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    await service.prepareResearchPlan({
      questionId: question.id, objective: 'Objective', steps: ['Step'],
      expectedEvidence: ['Evidence'], stopCondition: 'Stop', usePlanMode: true,
    });
    plan.recordResolution?.('approved');
    plan.exit();
    await expect(service.finalizeResearchPlan()).resolves.toMatchObject({ status: 'finalized' });

    const discarded = service.discardResearchPlan();
    expect(discarded?.status).toBe('discarded');
    wire.dispatch(contextAppendMessage({
      message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
    }));
    const draft = await service.prepareResearchPlan({
      questionId: question.id, objective: 'New objective', steps: ['New step'],
      expectedEvidence: ['New evidence'], stopCondition: 'New stop',
    });
    expect(draft.status).toBe('draft');
    wire.dispatch(contextAppendMessage({
      message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
    }));
    service.discardResearchPlan();
    wire.dispatch(contextUndo({ count: 1 }));
    expect(service.getResearchPlan()?.status).toBe('draft');
  });
});
