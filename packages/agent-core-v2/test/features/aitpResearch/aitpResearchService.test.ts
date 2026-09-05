import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DisposableStore } from '#/_base/di/lifecycle';
import { Emitter, Event } from '#/_base/event';
import { SyncDescriptor } from '#/_base/di/descriptors';
import { createServices, TestInstantiationService } from '#/_base/di/test';
import { ILogService } from '#/_base/log/log';
import { IAgentGoalService } from '#/agent/goal/goal';
import { IAgentSkillService } from '#/agent/skill/skill';
import { IAgentSkillVisibilityService } from '#/agent/skillVisibility/skillVisibility';
import type {
  IAgentPermissionModeService,
  PermissionModeChangedContext,
} from '#/agent/permissionMode/permissionMode';
import type { PermissionMode } from '#/agent/permissionPolicy/types';
import { IAgentPlanService } from '#/features/plan/plan';
import type { GoalSnapshot, GoalStatus } from '#/agent/goal/types';
import { GoalModel } from '#/agent/goal/goalOps';
import { contextAppendMessage, contextUndo } from '#/agent/contextMemory/contextOps';
import { IAgentScopeContext, makeAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentProfileService } from '#/agent/profile/profile';
import { BeforeToolExecuteEventImpl } from '#/agent/toolExecutor/beforeToolExecuteEvent';
import { AgentToolExecutorService } from '#/agent/toolExecutor/toolExecutorService';
import { IAgentToolExecutorService } from '#/agent/toolExecutor/toolExecutor';
import { AgentStateService } from '#/agent/state/agentStateService';
import { IAgentStateService } from '#/agent/state/agentState';
import { AgentToolRegistryService } from '#/agent/toolRegistry/toolRegistryService';
import { IAgentToolRegistryService } from '#/agent/toolRegistry/toolRegistry';
import { IAgentToolResultTruncationService } from '#/agent/toolResultTruncation/toolResultTruncation';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import { ITelemetryService, noopTelemetryService } from '#/app/telemetry/telemetry';
import type { ExecutableTool } from '#/tool/toolContract';
import { ToolAccesses } from '#/tool/toolContract';
import type { TurnStartedEvent } from '#/agent/loop/turnEvents';
import type { ToolExecution, RunnableToolExecution } from '#/tool/toolContract';
import { IEventBus } from '#/app/event/eventBus';
import { EventBusService } from '#/app/event/eventBusService';
import { InMemorySkillCatalog } from '#/app/skillCatalog/registry';
import { SessionAitpAdapterService } from '#/features/aitpResearch/adapter/sessionAitpAdapterService';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import { SessionAitpLifecycleCoordinatorService } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinatorService';
import { ISessionAitpLifecycleCoordinator } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinator';
import { IDurableCommitService } from '#/features/aitpResearch/research/durableCommit';
import { DurableCommitService } from '#/features/aitpResearch/research/durableCommitService';
import { IAitpDistillationHandoffService } from '#/features/aitpResearch/research/distillationHandoff';
import { AitpDistillationHandoffService } from '#/features/aitpResearch/research/distillationHandoffService';
import { createExternalFactFacade } from '#/features/aitpResearch/research/externalFactService';
import { IAitpExternalFactService } from '#/features/aitpResearch/research/externalFact';
import { IResearchTurnAdmission } from '#/features/aitpResearch/loop/researchTurnAdmission';
import { IResearchLoopCoordinator } from '#/features/aitpResearch/loop/researchLoopCoordinator';
import {
  AitpModeModel,
  ResearchModel,
  ResearchCursorModel,
  ResearchDistillationModel,
  aitpModeEnter,
  aitpModeSetLine,
  aitpModeSetPhase,
  aitpModeSetLoopStatus,
  researchProposeCheckpoint,
  researchBindCheckpointEntry,
  researchBindCheckpointReceipt,
  researchCommitCheckpoint,
  researchRecordDistillationAttention,
  researchAcknowledgeCheckpoint,
  researchCreateLine,
  researchCreateQuestion,
  researchUpdateQuestion,
  researchSetProgram,
  researchRequestHumanDecision,
  researchObserveRun,
} from '#/features/aitpResearch/aitpResearchOps';
import { PlanModel, planModeEnter, planModeExit, planResolution, planRevision } from '#/features/plan/planOps';
import { ResearchPlanModel } from '#/features/aitpResearch/researchPlanOps';
import { researchPutPlanV2 } from '#/features/aitpResearch/researchPlanV2Ops';
import { researchConfirmWorkstreamBinding } from '#/features/aitpResearch/researchWorkstreamBindingOps';
import { AitpResearchError, AitpResearchErrors } from '#/features/aitpResearch/errors';
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
  ResearchCheckpoint,
  ResearchLineWorkstreamBinding,
  ResearchStatusSnapshot,
} from '#/features/aitpResearch/types';
import {
  renderResearchInjection,
  resolveResearchVerbosity,
} from '#/features/aitpResearch/injection/researchInjectionPresenter';
import { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { IHostProcessService, type IHostProcess } from '#/os/interface/hostProcess';
import { IAgentResearchService, type ConcludeResearchActionInput } from '#/features/aitpResearch/research/agentResearch';
import type { AgentResearchService } from '#/features/aitpResearch/research/agentResearchService';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import {
  ICommitResearchCheckpointTool,
  IObserveResearchRunTool,
  BeginResearchActionInputSchema,
  ResolveResearchDecisionInputSchema,
} from '#/features/aitpResearch/tools/researchTools';
import { CommitResearchCheckpointTool, ObserveResearchRunTool } from '#/features/aitpResearch/tools/researchToolsImpl';
import { AppendLogStore } from '#/persistence/backends/node-fs/appendLogStore';
import { InMemoryStorageService } from '#/persistence/backends/memory/inMemoryStorageService';
import { IAppendLogStore } from '#/persistence/interface/appendLogStore';
import { IFileSystemStorageService } from '#/persistence/interface/storage';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { ISessionContext, makeSessionContext } from '#/session/sessionContext/sessionContext';
import { ISessionSkillCatalog } from '#/session/sessionSkillCatalog/skillCatalog';
import { IWireService } from '#/wire/wire';
import type { WireRecord } from '#/wire/record';

import { stubLog } from '../../_base/log/stubs';
import { stubPermissionModeService } from '../../agent/permissionMode/stubs';
import { stubToolExecutorEvents } from '../../agent/toolExecutor/stubs';
import { stubSkill } from '../../app/skillCatalog/stubs';
import { recordingWireLog, registerTestAgentWire, testWireScope } from '../../wire/stubs';

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
const USER_TURN_INTENT = { kind: 'user' as const };

function replayFixture(name: string): WireRecord[] {
  return readFileSync(
    new URL(`./fixtures/replay/${name}.jsonl`, import.meta.url),
    'utf8',
  ).trim().split('\n').map((line) => JSON.parse(line) as WireRecord);
}

function runnableExecution(execution: ToolExecution): RunnableToolExecution {
  if (!('execute' in execution)) throw new Error('Expected runnable tool execution');
  return execution;
}

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

function buildReplayWire(name: string): IWireService {
  eventBus = new EventBusService();
  const ix = disposables.add(new TestInstantiationService());
  return registerTestAgentWire(ix, testWireScope(SCOPE, `fixture-${name}`), {
    log: recordingWireLog([...replayFixture(name)]),
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
  readonly catalog?: InMemorySkillCatalog;
  readonly catalogReady?: Promise<void>;
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
        catalog: options?.catalog ?? catalog,
        ready: options?.catalogReady ?? Promise.resolve(),
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
  it('waits for cold-restore skill discovery before deciding the contract is unavailable', async () => {
    const catalog = new InMemorySkillCatalog();
    let release!: () => void;
    const loaded = new Promise<void>((resolve) => { release = resolve; });
    const ready = loaded.then(() => {
      catalog.register(stubSkill('aitp', {
        path: `${SKILL_DIR}/SKILL.md`,
        dir: SKILL_DIR,
        source: 'extra',
        plugin: { id: 'aitp-research-protocol' },
      }));
    });
    const { adapter, spawn } = buildManagedPluginAdapter({ catalog, catalogReady: ready });
    const probe = adapter.probe();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(adapter.health.phase).toBe('probing');
    expect(spawn).not.toHaveBeenCalled();
    release();
    await expect(probe).resolves.toMatchObject({ phase: 'ready', contractVersion: '0.1' });
    expect(spawn).toHaveBeenCalledOnce();
  });

  it('cancels a pending catalog wait on reset and never revives its probe', async () => {
    let release!: () => void;
    const loaded = new Promise<void>((resolve) => { release = resolve; });
    const { adapter, spawn } = buildManagedPluginAdapter({ catalogReady: loaded });
    const oldProbe = adapter.probe();
    const cancelled = expect(oldProbe).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
    });
    adapter.reset();
    await cancelled;
    expect(adapter.health.phase).toBe('inactive');
    expect(spawn).not.toHaveBeenCalled();
    const newProbe = adapter.probe();
    release();
    await expect(newProbe).resolves.toMatchObject({ phase: 'ready' });
    expect(spawn).toHaveBeenCalledOnce();
  });

  it('reports catalog initialization failure without probing Python', async () => {
    const { adapter, spawn } = buildManagedPluginAdapter({
      catalogReady: Promise.reject(new Error('Skill catalog initialization failed')),
    });
    await expect(adapter.probe()).resolves.toMatchObject({
      phase: 'degraded',
      lastError: 'Skill catalog initialization failed',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('resolves the legacy 0.8/contract-0.1 layout and probes Python', async () => {
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
        schema: 'aitp/adapter-contract-0.3',
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

  it('resolves contract-0.2 and sends atomic checkpoint save preconditions', async () => {
    const spawn = vi.fn<IHostProcessService['spawn']>(async (_command, args) =>
      completedProcess(
        args?.includes('-c')
          ? '(3, 13, 0)\n'
          : JSON.stringify(GOLDEN_RECORD_SAVE),
      ));
    const { adapter } = buildManagedPluginAdapter({
      contract: {
        schema: 'aitp/adapter-contract-0.2',
        plugin: { name: 'aitp-research-protocol', version: '0.9.0' },
        python: { launcher: 'scripts/aitp.py' },
      },
      manifest: {
        name: 'aitp-research-protocol',
        version: '0.9.0',
        skills: './skills/',
      },
      spawn,
    });

    await expect(adapter.probe()).resolves.toMatchObject({
      phase: 'ready',
      contractVersion: '0.2',
      pluginVersion: '0.9.0',
    });
    await expect(adapter.recordSave({
      draftPath: '.aitp/local/drafts/entry.md',
      expectedTopic: 'nio',
      exactWorkstream: 'crpa',
    })).resolves.toEqual(GOLDEN_RECORD_SAVE);
    const command = spawn.mock.calls.find((call) => !(call[1] as readonly string[]).includes('-c'));
    expect(command?.[1]).toEqual([
      `${PLUGIN_ROOT}/scripts/aitp.py`,
      'record',
      'save',
      '.aitp/local/drafts/entry.md',
      '--json',
      '--expected-topic',
      'nio',
      '--exact-workstream',
      'crpa',
    ]);
  });

  it('rejects atomic checkpoint save on contract-0.1 before spawning a save', async () => {
    const { adapter, spawn } = buildManagedPluginAdapter();
    await adapter.probe();

    await expect(adapter.recordSave({
      draftPath: '.aitp/local/drafts/entry.md',
      expectedTopic: 'nio',
      exactWorkstream: 'crpa',
    })).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_CONTRACT_UNKNOWN,
    });
    expect(spawn.mock.calls.filter((call) => !(call[1] as readonly string[]).includes('-c'))).toHaveLength(0);
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

  it('reports an indeterminate external result when reset races a completed save process', async () => {
    let releaseSave!: (exitCode: number) => void;
    const saveWait = new Promise<number>((resolve) => {
      releaseSave = resolve;
    });
    const saveStdout = new PassThrough();
    const saveStderr = new PassThrough();
    saveStdout.end(JSON.stringify(GOLDEN_RECORD_SAVE));
    saveStderr.end();
    const saveProcess: IHostProcess = {
      _serviceBrand: undefined,
      pid: 2,
      exitCode: null,
      stdin: new PassThrough(),
      stdout: saveStdout,
      stderr: saveStderr,
      wait: () => saveWait,
      kill: async () => {},
      dispose: () => {},
    };
    let commandCalls = 0;
    const spawn = vi.fn<IHostProcessService['spawn']>(async (_command, args) => {
      if (args?.includes('-c')) return completedProcess('(3, 13, 0)\n');
      commandCalls += 1;
      return saveProcess;
    });
    const { adapter } = buildManagedPluginAdapter({ spawn });
    await adapter.probe();

    const save = adapter.recordSave({ draftPath: '.aitp/local/drafts/entry.md' });
    await vi.waitFor(() => expect(commandCalls).toBe(1));
    adapter.reset();
    releaseSave(0);

    await expect(save).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
      message: expect.stringContaining('may have completed externally'),
    });
    expect(adapter.health.phase).toBe('inactive');
  });
});

function makeScopeCtx(agentId = MAIN_AGENT_ID) {
  return makeAgentScopeContext({ agentId, agentScope: '' });
}

function makeMutablePermissionMode(initial: PermissionMode): {
  readonly service: IAgentPermissionModeService;
  readonly setMode: (mode: PermissionMode) => void;
} {
  let mode = initial;
  const changed = disposables.add(new Emitter<PermissionModeChangedContext>());
  const setMode = (next: PermissionMode): void => {
    const previousMode = mode;
    if (next === previousMode) return;
    mode = next;
    changed.fire({ mode: next, previousMode });
  };
  return {
    service: {
      _serviceBrand: undefined,
      get mode() {
        return mode;
      },
      setMode,
      setModeAndBroadcast: setMode,
      onDidChangeMode: changed.event,
    },
    setMode,
  };
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
    onDidChange: Event.None as import('#/_base/event').Event<void>,
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
    async reconcileCurrentTopicBinding(expectedLineSlug?: string) {
      const lineSlug = expectedLineSlug ?? wire.getModel(AitpModeModel).current.currentLineSlug;
      if (lineSlug === undefined) return undefined;
      const state = wire.getModel(ResearchModel).current;
      const binding = state.lineWorkstreamBindings?.[lineSlug];
      const program = state.program;
      return binding !== undefined &&
        binding.lineSlug === lineSlug &&
        program !== null &&
        binding.topicId === program.topicId &&
        binding.observedRevision === (program.observedRevision ?? 1)
        ? binding
        : undefined;
    },
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
    frontmatter: { topic: 't1', workstreams: ['aitp-main'] },
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

function seedConfirmedWorkstreamBinding(input?: {
  readonly confirmationId?: string;
  readonly lineSlug?: string;
  readonly workstream?: string;
  readonly topicId?: string;
  readonly topicTitle?: string;
  readonly goalText?: string;
  readonly goalSource?: string;
  readonly establishedAt?: number;
  readonly confirmedBy?: ResearchLineWorkstreamBinding['confirmedBy'];
  readonly confirmedAt?: number;
}): ResearchLineWorkstreamBinding {
  const lineSlug = input?.lineSlug ?? 'main';
  const topicId = input?.topicId ?? 't1';
  wire.dispatch(researchCreateLine({ slug: lineSlug, title: lineSlug, createdAt: 1 }));
  wire.dispatch(researchSetProgram({
    topicId,
    title: input?.topicTitle ?? 'Test',
    goalText: input?.goalText ?? 'Not established yet',
    goalSource: input?.goalSource ?? '.aitp/topic/TOPIC.md',
    establishedAt: input?.establishedAt ?? 2,
  }));
  const program = wire.getModel(ResearchModel).current.program!;
  const binding: ResearchLineWorkstreamBinding = {
    confirmationId: input?.confirmationId ?? 'confirmation-1',
    lineSlug,
    workstream: input?.workstream ?? `aitp-${lineSlug}`,
    topicId,
    observedRevision: program.observedRevision ?? 1,
    confirmedBy: input?.confirmedBy ?? 'main_agent',
    confirmedAt: input?.confirmedAt ?? 3,
  };
  wire.dispatch(researchConfirmWorkstreamBinding({
    ...binding,
    expectedRevision: wire.getModel(ResearchModel).current.revision,
  }));
  return binding;
}

function seedCurrentConfirmedWorkstream(input?: Parameters<typeof seedConfirmedWorkstreamBinding>[0]) {
  const binding = seedConfirmedWorkstreamBinding(input);
  const mode = wire.getModel(AitpModeModel).current;
  if (mode.phase === 'inactive') {
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: binding.lineSlug }));
  } else {
    wire.dispatch(aitpModeSetLine({ lineSlug: binding.lineSlug }));
  }
  return binding;
}

function proposeBoundCheckpoint(input: {
  readonly checkpointId: string;
  readonly idempotencyKey: string;
  readonly createdAt: number;
  readonly questionId?: string;
  readonly lineSlug?: string;
}) {
  const lineSlug = input.lineSlug ?? 'main';
  const workstreamBinding = seedCurrentConfirmedWorkstream({ lineSlug, workstream: `aitp-${lineSlug}` });
  wire.dispatch(researchProposeCheckpoint({
    ...input,
    lineSlug,
    workstreamBinding,
  }));
  return workstreamBinding;
}

async function buildResearchBindingHarness(input?: {
  readonly lineSlug?: string;
  readonly workstream?: string;
}) {
  const adapter = makeStubAdapter();
  const modeSvc = await buildRealModeService(adapter);
  const researchSvc = await buildRealResearchService(modeSvc, adapter);
  const lineSlug = input?.lineSlug ?? 'local-line';
  await modeSvc.enter({ actor: 'user', lineSlug });
  return {
    adapter,
    modeSvc,
    researchSvc,
    lineSlug,
    workstream: input?.workstream ?? 'aitp-workstream',
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
          workstreams: pending.workstreamBinding === undefined
            ? undefined
            : [pending.workstreamBinding.workstream],
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

function makeToolHookContext(
  toolName: string,
  args: unknown,
  batchToolNames: readonly string[] = [toolName],
): ResolvedToolExecutionHookContext {
  return {
    turnId: 1,
    signal: new AbortController().signal,
    toolCall: { type: 'function', id: 'tc1', name: toolName, arguments: JSON.stringify(args) },
    toolCalls: batchToolNames.map((name, index) => ({
      type: 'function',
      id: `tc${index + 1}`,
      name,
      arguments: '{}',
    })),
    args,
    execution: {} as never,
  };
}

function makeVetoEvent(
  toolName: string,
  args: unknown,
  batchToolNames: readonly string[] = [toolName],
): BeforeToolExecuteEventImpl {
  return new BeforeToolExecuteEventImpl(makeToolHookContext(toolName, args, batchToolNames));
}

async function buildNoteTools(
  adapter: ISessionAitpAdapter,
  mode: IAgentAitpModeService,
  research: IAgentResearchService,
) {
  const { IAitpNotePrepareTool, AitpNotePrepareTool, IAitpNoteSaveTool, AitpNoteSaveTool } =
    await import('#/features/aitpResearch/tools/aitpAdapterTools');
  const ix = createServices(disposables, {
    additionalServices: (reg) => {
      reg.defineInstance(ISessionAitpAdapter, adapter);
      reg.defineInstance(IAgentAitpModeService, mode);
      reg.defineInstance(IAgentResearchService, research);
      reg.define(IAitpNotePrepareTool, AitpNotePrepareTool);
      reg.define(IAitpNoteSaveTool, AitpNoteSaveTool);
    },
  });
  return { prepare: ix.get(IAitpNotePrepareTool), save: ix.get(IAitpNoteSaveTool) };
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
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
      frontmatter: { topic: 'topic-a', workstreams: ['main'] }, body: '',
    });
    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'clean',
      counts: { entries: 1, notes: 0, errors: 0, warnings: 0 }, findings: [],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    const durable = new DurableCommitService(adapter);

    await durable.verifyEntry('e1', 'main', 'topic-a');
    const result = await durable.checkAfterSave({
      workstream: 'main',
      preSaveCheck: {
        status: 'clean', errors: 0, warnings: 0,
        findingFingerprints: [], errorFindingFingerprints: [], checkedAt: 100,
      },
    });

    expect(showSpy).toHaveBeenCalledWith({ id: 'e1' });
    expect(checkSpy).toHaveBeenCalledWith({ workstream: 'main' });
    expect(result.postSaveCheck).toMatchObject({ status: 'clean', errors: 0, warnings: 0 });
  });

  it('rejects an active Entry without explicit membership in the captured workstream', async () => {
    const unscoped = new DurableCommitService(makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
        frontmatter: { topic: 'topic-a' }, body: '',
      }),
    }));
    await expect(unscoped.verifyEntry('e1', 'main', 'topic-a')).rejects.toThrow(
      'does not use the exact confirmed workstream main',
    );

    const mismatched = new DurableCommitService(makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
        frontmatter: { topic: 'topic-a', workstreams: ['other'] }, body: '',
      }),
    }));
    await expect(mismatched.verifyEntry('e1', 'main', 'topic-a')).rejects.toThrow(
      'does not use the exact confirmed workstream main',
    );

    const extraScope = new DurableCommitService(makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
        frontmatter: { topic: 'topic-a', workstreams: ['main', 'shared'] }, body: '',
      }),
    }));
    await expect(extraScope.verifyEntry('e1', 'main', 'topic-a')).rejects.toThrow(
      'does not use the exact confirmed workstream main',
    );
  });

  it('rejects an active Entry from a different Topic', async () => {
    const durable = new DurableCommitService(makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
        frontmatter: { topic: 'topic-b', workstreams: ['main'] }, body: '',
      }),
    }));

    await expect(durable.verifyEntry('e1', 'main', 'topic-a')).rejects.toThrow(
      'belongs to Topic topic-b, not captured Topic topic-a',
    );
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

    await expect(durable.checkAfterSave({ workstream: 'main', preSaveCheck: baseline })).resolves.toMatchObject({
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
    await expect(newDurable.checkAfterSave({ workstream: 'main', preSaveCheck: baseline })).rejects.toThrow('new error finding');
  });

  it('contributes an Agent-scoped verifier that the Research service consumes', async () => {
    const binding = seedConfirmedWorkstreamBinding();
    const adapter = makeStubAdapter({
      show: async ({ id }) => ({
        schema: 'aitp/show-0.1', root: '/workspace', id, status: 'active',
        source: `.aitp/topic/entries/entry-${id}.md`, legacy_derived: false,
        frontmatter: { topic: binding.topicId, workstreams: [binding.workstream] }, body: '',
      }),
    });
    const durable: IDurableCommitService = new DurableCommitService(adapter);
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'cp1',
      lineSlug: binding.lineSlug,
      workstreamBinding: binding,
      idempotencyKey: 'key1',
      createdAt: 1000,
    }));
    bindCompleteCheckpointReceipt('cp1');
    const verifyEntry = vi.spyOn(durable, 'verifyEntry');
    const checkAfterSave = vi.spyOn(durable, 'checkAfterSave');
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService(), undefined, durable,
    );

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });

    expect(verifyEntry).toHaveBeenCalledWith('e1', binding.workstream, binding.topicId);
    expect(checkAfterSave).toHaveBeenCalledWith(expect.objectContaining({
      workstream: binding.workstream,
    }));
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
  async function buildRunServices() {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const adapter = makeStubAdapter();
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(IWireService, wire);
        reg.defineInstance(IAgentScopeContext, makeScopeCtx());
        reg.defineInstance(IEventBus, eventBus);
        reg.defineInstance(ISessionAitpAdapter, adapter);
        reg.defineInstance(IAgentProfileService, makeProfileServiceStub());
        reg.defineInstance(IAgentToolExecutorService, makeToolExecutorStub());
        reg.defineInstance(IAgentGoalService, makeStubGoalService());
        reg.define(IAgentAitpModeService, AgentAitpModeService);
        reg.define(IAgentResearchService, AgentResearchService);
      },
    });
    const mode = ix.get(IAgentAitpModeService);
    const svc = ix.get(IAgentResearchService);
    return { svc, mode, adapter };
  }

  async function buildObservedRun(status: 'completed' | 'abandoned') {
    const { svc, mode, adapter } = await buildRunServices();
    await mode.enter({ actor: 'user' });
    expect(svc.getSnapshot().mode).toBe('ready');
    const action = svc.planAndStartAction({
      kind: 'simulation', purpose: 'Inspect one externally owned job.',
      stopCondition: 'Record this inspection; do not submit a job.',
    });
    const observation = {
      actionId: action.actionId, campaign: 'fixture-campaign', jobId: 'fixture-job',
      sourcePin: 'source-a', binaryPin: 'binary-a', stage: 'running' as const,
      schedulerState: 'running' as const, artifactRefs: ['run/initial-observation.txt'],
    };
    svc.observeRun({ ...observation, expectedRevision: svc.getSnapshot().revision });
    svc.concludeAction({
      actionId: action.actionId, status,
      progress: {
        headline: 'Inspection ended; the external job is still running',
        motivation: 'The external job outlives this bounded inspection.',
        workPerformed: 'Read the existing observation without submitting work.',
        result: 'No terminal or scientific result is available.',
        mainlineImpact: 'Keep the existing job identity for a later observation.',
        nextAction: 'Observe the same job when fresh status is available.',
      },
      durability: { status: 'no_durable_delta', rationale: 'Re-read of an existing running observation.' },
    });
    return { svc, mode, adapter, observation };
  }

  it.each(['completed', 'abandoned'] as const)(
    'recovers the same run after its action is %s without reopening or rewriting the conclusion', async (status) => {
      const { svc, observation } = await buildObservedRun(status);
      const before = svc.getSnapshot();
      const run = svc.observeRun({
        ...observation, expectedRevision: before.revision,
        stage: 'completed', schedulerState: 'completed', terminalState: 'completed',
        artifactRefs: ['run/terminal-observation.txt'],
      });
      expect(run).toMatchObject({
        actionId: observation.actionId, jobId: observation.jobId, terminalState: 'completed',
      });
      const after = svc.getSnapshot();
      expect(after.phase).toBe(before.phase);
      expect(after.currentAction).toEqual({ ...before.currentAction, run });
      expect(after.latestProgress).toEqual(before.latestProgress);
      expect(after.recentStateChange).toEqual(before.recentStateChange);
      expect(after.pendingCheckpoint).toEqual(before.pendingCheckpoint);
      expect(svc.planAndStartAction({
        kind: 'data_analysis', purpose: 'Evaluate the observed result.', stopCondition: 'One bounded evaluation.',
      }).status).toBe('in_progress');
    },
  );

  it.each([
    { campaign: 'different-campaign' },
    { jobId: 'different-job' },
    { sourcePin: 'different-source' },
    { binaryPin: 'different-binary' },
    { actionId: 'different-action' },
  ])('rejects a different retained identity in live validation and replay: %j', async (change) => {
    const { svc, observation } = await buildObservedRun('completed');
    const before = structuredClone(wire.getModel(ResearchModel).current);
    const input = { ...observation, ...change, expectedRevision: svc.getSnapshot().revision };
    expect(() => svc.observeRun(input)).toThrow();
    const { expectedRevision: _, ...payload } = input;
    wire.dispatch(researchObserveRun({ ...payload, lastObservedAt: Date.now() }));
    expect(wire.getModel(ResearchModel).current).toEqual(before);
  });

  it('retains omitted source and binary pins when updating an existing closed-action run', async () => {
    const { svc, observation } = await buildObservedRun('completed');
    expect(svc.observeRun({
      ...observation, expectedRevision: svc.getSnapshot().revision,
      sourcePin: undefined, binaryPin: undefined,
    })).toMatchObject({ sourcePin: observation.sourcePin, binaryPin: observation.binaryPin });
    expect(svc.getSnapshot().currentAction?.status).toBe('completed');
  });

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'does not reopen or replace a retained %s terminal outcome', async (terminalState) => {
      const { svc, observation } = await buildObservedRun('completed');
      svc.observeRun({
        ...observation, expectedRevision: svc.getSnapshot().revision,
        stage: terminalState === 'completed' ? 'completed' : 'failed',
        schedulerState: terminalState, terminalState,
      });
      const before = structuredClone(wire.getModel(ResearchModel).current);
      expect(() => svc.observeRun({ ...observation, expectedRevision: svc.getSnapshot().revision })).toThrow('cannot be reopened');
      expect(() => svc.observeRun({
        ...observation, expectedRevision: svc.getSnapshot().revision,
        schedulerState: terminalState === 'failed' ? 'completed' : 'failed',
        terminalState: terminalState === 'failed' ? 'completed' : 'failed',
      })).toThrow('different terminal outcome');
      wire.dispatch(researchObserveRun({ ...observation, lastObservedAt: Date.now() }));
      expect(wire.getModel(ResearchModel).current).toEqual(before);
    },
  );

  it('rejects stale revisions, contradictory terminal evidence and missing or conflicting retained runs', async () => {
    const { svc, observation } = await buildObservedRun('completed');
    const before = structuredClone(wire.getModel(ResearchModel).current);
    expect(() => svc.observeRun({ ...observation, expectedRevision: svc.getSnapshot().revision - 1 })).toThrow('revision is stale');
    expect(() => svc.observeRun({
      ...observation, expectedRevision: svc.getSnapshot().revision, terminalState: 'completed',
    })).toThrow('must agree');
    expect(wire.getModel(ResearchModel).current).toEqual(before);

    const state = wire.getModel(ResearchModel).current;
    Object.assign(state, { currentAction: { ...state.currentAction, run: { ...state.currentRun, jobId: 'conflicting-job' } } });
    expect(() => svc.observeRun({ ...observation, expectedRevision: svc.getSnapshot().revision })).toThrow('disagree');
    Object.assign(state, { currentRun: null, currentAction: { ...before.currentAction, run: undefined } });
    expect(() => svc.observeRun({ ...observation, expectedRevision: svc.getSnapshot().revision })).toThrow('cannot introduce');
  });

  it.each([
    { stage: 'completed' as const },
    { stage: 'failed' as const },
    { stage: 'completed' as const, schedulerState: 'failed' as const, terminalState: 'failed' as const },
  ])('rejects a terminal stage without consistent retained-run evidence: %j', async (change) => {
    const { svc, observation } = await buildObservedRun('completed');
    const before = structuredClone(wire.getModel(ResearchModel).current);
    const input = { ...observation, ...change, expectedRevision: svc.getSnapshot().revision };
    expect(() => svc.observeRun(input)).toThrow('consistent explicit terminal evidence');
    const { expectedRevision: _, ...payload } = input;
    wire.dispatch(researchObserveRun({ ...payload, lastObservedAt: Date.now() }));
    expect(wire.getModel(ResearchModel).current).toEqual(before);
  });

  it('keeps live-action run registration blocked while the loop is paused', async () => {
    const { svc, mode } = await buildRunServices();
    await mode.enter({ actor: 'user' });
    const action = svc.planAndStartAction({
      kind: 'simulation', purpose: 'Inspect a run.', stopCondition: 'No new job.',
    });
    wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'paused' }));
    const before = structuredClone(wire.getModel(ResearchModel).current);
    expect(() => svc.observeRun({
      actionId: action.actionId, expectedRevision: svc.getSnapshot().revision,
      campaign: 'fixture-campaign', jobId: 'fixture-job', stage: 'running',
      schedulerState: 'running', artifactRefs: [],
    })).toThrow();
    expect(wire.getModel(ResearchModel).current).toEqual(before);
  });

  it('allows retained observations while paused without resolving a human gate or granting new work', async () => {
    const { svc, mode, observation } = await buildObservedRun('abandoned');
    wire.dispatch(researchRequestHumanDecision({
      gateId: 'fixture-human-gate', kind: 'review', prompt: 'Review the scientific interpretation.', createdAt: Date.now(),
    }));
    wire.dispatch(aitpModeSetLoopStatus({ loopStatus: 'paused' }));
    const before = svc.getSnapshot();
    svc.observeRun({
      ...observation, expectedRevision: before.revision,
      schedulerState: 'failed', stage: 'failed', terminalState: 'failed',
    });
    const after = svc.getSnapshot();
    expect(after.humanGate).toEqual(before.humanGate);
    expect(after.phase).toBe(before.phase);
    expect(after.latestProgress).toEqual(before.latestProgress);
    expect(after.currentAction?.status).toBe('abandoned');
    expect(() => svc.planAndStartAction({
      kind: 'experiment', purpose: 'Not authorized while paused.', stopCondition: 'Do not execute.',
    })).toThrow();
    await mode.exit();
    expect(() => svc.observeRun({
      ...observation, expectedRevision: svc.getSnapshot().revision,
    })).toThrow();
  });

  it('restores the full running/concluded journal and retains the subsequent terminal observation', async () => {
    const records: WireRecord[] = [];
    const log = recordingWireLog(records);
    const originalContainer = disposables.add(new TestInstantiationService());
    wire = registerTestAgentWire(originalContainer, testWireScope(SCOPE, 'run-original'), { log, eventBus });
    const { svc, observation } = await buildObservedRun('completed');
    const original = structuredClone(wire.getModel(ResearchModel).current);
    await wire.flush();

    const restoredContainer = disposables.add(new TestInstantiationService());
    wire = registerTestAgentWire(restoredContainer, testWireScope(SCOPE, 'run-restored'), { log, eventBus });
    await wire.restore();
    expect(wire.getModel(ResearchModel).current).toEqual(original);
    const restored = await buildRunServices();
    restored.svc.observeRun({
      ...observation, expectedRevision: restored.svc.getSnapshot().revision,
      stage: 'completed', schedulerState: 'completed', terminalState: 'completed',
    });
    const terminal = structuredClone(wire.getModel(ResearchModel).current);
    await wire.flush();
    const terminalContainer = disposables.add(new TestInstantiationService());
    wire = registerTestAgentWire(terminalContainer, testWireScope(SCOPE, 'run-terminal-restored'), { log, eventBus });
    await wire.restore();
    expect(wire.getModel(ResearchModel).current).toEqual(terminal);
    expect(terminal.currentAction?.status).toBe('completed');
    expect(terminal.latestProgress).toEqual(svc.getSnapshot().latestProgress);
  });

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
    proposeBoundCheckpoint({ checkpointId: 'cp-missing', idempotencyKey: 'key1', createdAt: 1000 });
    const adapter = makeStubAdapter();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp-missing', entryId: 'e1' })).rejects.toThrow(
      'no complete AITP prepare/save receipt',
    );
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
  });

  it('calls show + check before advancing the cursor', async () => {
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp1');

    const showSpy = vi.fn<(opts: { id: string }) => Promise<AitpShowResult>>().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
      frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
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

    seedCurrentConfirmedWorkstream();
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    const checkpoint = svc.proposeCheckpoint({ expectedRevision: 0, questionId: question.id });
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

    seedCurrentConfirmedWorkstream();
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    const checkpoint = svc.proposeCheckpoint({ expectedRevision: 0, questionId: question.id });
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

    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
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

    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
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

    seedCurrentConfirmedWorkstream();
    const first = svc.proposeCheckpoint({ expectedRevision: 0 });
    expect(() => svc.proposeCheckpoint({ expectedRevision: 0 })).toThrow('already pending');
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe(first.checkpointId);
  });

  it.each([
    ['a different entry id', 'e2', 'active'],
    ['a superseded entry', 'e1', 'superseded'],
  ] as const)('keeps the pending checkpoint when show returns %s', async (_case, entryId, status) => {
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp1');

    const showSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: entryId, status,
      source: `.aitp/topic/entries/entry-${entryId}.md`, legacy_derived: false,
      frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
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
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp1');

    const showSpy = vi.fn<(opts: { id: string }) => Promise<AitpShowResult>>().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
      frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
    });
    const checkSpy = vi.fn().mockResolvedValue({
      schema: 'aitp/check-report-0.1', root: '/workspace', status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0 }, findings: [],
    } as AitpCheckReport);
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' }))
      .resolves.toEqual({ status: 'committed' });
    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' }))
      .resolves.toEqual({ status: 'already_committed' });

    expect(showSpy).toHaveBeenCalledOnce();
    expect(checkSpy).toHaveBeenCalledOnce();
    expect(wire.getModel(ResearchCursorModel).cursor).toMatchObject({ checkpointId: 'cp1', entryId: 'e1' });
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();
  });

  it('rejects a canonical Entry saved under a different Topic', async () => {
    proposeBoundCheckpoint({ checkpointId: 'cp-topic', idempotencyKey: 'key-topic', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp-topic');
    const checkSpy = vi.fn();
    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
        frontmatter: { topic: 't2', workstreams: ['aitp-main'] }, body: '',
      }),
      check: checkSpy,
    });
    const modeSvc = makeStubModeSvc();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );

    await expect(svc.commitCheckpoint({ checkpointId: 'cp-topic', entryId: 'e1' })).rejects.toThrow(
      'Topic t1',
    );
    expect(checkSpy).not.toHaveBeenCalled();
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });

  it('rejects a canonical checkpoint Entry with any additional workstream', async () => {
    proposeBoundCheckpoint({
      checkpointId: 'cp-extra-scope',
      idempotencyKey: 'key-extra-scope',
      createdAt: 1000,
    });
    bindCompleteCheckpointReceipt('cp-extra-scope');
    const checkSpy = vi.fn();
    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
        frontmatter: { topic: 't1', workstreams: ['aitp-main', 'other'] }, body: '',
      }),
      check: checkSpy,
    });
    const modeSvc = makeStubModeSvc();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );

    await expect(svc.commitCheckpoint({
      checkpointId: 'cp-extra-scope',
      entryId: 'e1',
    })).rejects.toThrow('active matching entry');
    expect(checkSpy).not.toHaveBeenCalled();
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });

  it('re-observes the Topic and performs zero show/check I/O before commit after a Topic switch', async () => {
    proposeBoundCheckpoint({ checkpointId: 'cp-fresh-topic', idempotencyKey: 'key-topic', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp-fresh-topic');
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
    const showSpy = vi.fn();
    const checkSpy = vi.fn();
    const adapter = makeStubAdapter({ show: showSpy, check: checkSpy });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    vi.spyOn(adapter, 'enter').mockResolvedValue({
      schema: 'aitp/enter-0.2',
      memory_status: 'available',
      root: '/workspace',
      topic: {
        id: 't2',
        title: 'Changed Topic',
        goal: { text: 'Changed goal', source: '.aitp/topic/TOPIC.md' },
      },
      recent_entries: [],
      unresolved_failures: [],
      next_action: { status: 'not_established', source: null },
      latest_working_note: null,
      recent_notes: [],
      counts: {
        active: 0,
        superseded: 0,
        unresolved_failures: 0,
        malformed: 0,
        omitted_active: 0,
        active_newer_than_latest_working_note: null,
      },
      warnings: [],
    });
    const modeSvc = await buildRealModeService(adapter);
    const researchSvc = await buildRealResearchService(modeSvc, adapter);

    await expect(researchSvc.commitCheckpoint({
      checkpointId: 'cp-fresh-topic',
      entryId: 'e1',
    })).rejects.toThrow('freshly observed AITP Topic');

    expect(showSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
    expect(researchSvc.getCommittedCursor()).toBeNull();
    expect(researchSvc.getLineWorkstreamAlignment('main')).toMatchObject({ status: 'conflict' });
  });

  it('does not overwrite a committed cursor with a different entry', async () => {
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp1');

    const showSpy = vi.fn<(opts: { id: string }) => Promise<AitpShowResult>>().mockResolvedValue({
      schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
      frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
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
    // First checkpoint: propose → bind full receipt → commit.
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp1', 'e1');

    const adapter = makeStubAdapter({
      show: async ({ id }: { id: string }) => ({
        schema: 'aitp/show-0.1', root: '/workspace', id, status: 'active',
        source: `.aitp/topic/entries/entry-${id}.md`, legacy_derived: false,
        frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
      }),
    });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(wire, makeScopeCtx(), eventBus, makeStubModeSvc(), adapter, makeToolExecutorStub(), makeStubGoalService());

    await svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' });
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();

    // Second, independent checkpoint: a new proposal is accepted after commit,
    // bound to a different AITP entry, and appended to the history.
    const second = svc.proposeCheckpoint({ expectedRevision: 0 });
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
    let releaseShow!: (result: AitpShowResult) => void;
    const showResult: AitpShowResult = {
      schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
      source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
      frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
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
    seedCurrentConfirmedWorkstream();
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    const checkpoint = svc.proposeCheckpoint({ expectedRevision: 0, questionId: question.id });
    bindCompleteCheckpointReceipt(checkpoint.checkpointId);

    const commitPromise = svc.commitCheckpoint({ checkpointId: checkpoint.checkpointId, entryId: 'e1' });
    await vi.waitFor(() => expect(showSpy).toHaveBeenCalledWith({ id: 'e1' }));
    svc.updateQuestion({ questionId: question.id, assessment: 'Concurrent revision update' });
    releaseShow(showResult);

    await expect(commitPromise).rejects.toThrow('changed while the AITP show barrier was running');
    expect(checkSpy).not.toHaveBeenCalled();
    expect(modeSvc._setPhaseCalls).not.toContain('degraded');
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe(checkpoint.checkpointId);
  });

  it('rechecks the committed cursor after the asynchronous check barrier', async () => {
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
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
    proposeBoundCheckpoint({ checkpointId: 'cp-existing', idempotencyKey: 'key1', createdAt: 1000 });
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
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
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
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
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

  it('degrades before show when fresh Topic reconciliation fails', async () => {
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp1');

    const adapter = makeStubAdapter();
    const showSpy = vi.spyOn(adapter, 'show');
    const checkSpy = vi.spyOn(adapter, 'check');
    const modeSvc = makeStubModeSvc();
    modeSvc.reconcileCurrentTopicBinding = vi.fn().mockRejectedValue(new Error('enter failed'));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );

    await expect(svc.commitCheckpoint({ checkpointId: 'cp1', entryId: 'e1' }))
      .rejects.toThrow('AITP commit barrier failed: enter failed');
    expect(showSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
    expect(wire.getModel(ResearchCursorModel).cursor).toBeNull();
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.checkpointId).toBe('cp1');
    expect(wire.getModel(ResearchModel).current.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'commit_failed', state: 'active' }),
      expect.objectContaining({ kind: 'degraded' }),
    ]));
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });
});

describe('S8 distillation attention snapshot', () => {
  it('projects only the latest committed handoff receipt and flags unavailable review', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'ready' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    wire.dispatch(researchCommitCheckpoint({
      checkpointId: 'cp-attention-1',
      entryId: 'entry-attention-1',
      committedAt: 1000,
    }));
    const revisionBeforeReceipt = svc.getSnapshot().revision;
    wire.dispatch(researchRecordDistillationAttention({
      status: 'review_requested',
      checkpointId: 'cp-attention-1',
      entryId: 'entry-attention-1',
      recordedAt: 1100,
      commitRevision: 1,
    }));
    expect(svc.getSnapshot().distillationAttention).toMatchObject({
      schema: 'hakimi/research-distillation-attention-0.1',
      status: 'review_requested',
      checkpointId: 'cp-attention-1',
      entryId: 'entry-attention-1',
    });
    expect(svc.getSnapshot().revision).toBeGreaterThan(revisionBeforeReceipt);

    wire.dispatch(researchCommitCheckpoint({
      checkpointId: 'cp-attention-2',
      entryId: 'entry-attention-2',
      committedAt: 2000,
    }));
    expect(svc.getSnapshot().distillationAttention).toBeUndefined();
    wire.dispatch(researchRecordDistillationAttention({
      status: 'handoff_unavailable',
      checkpointId: 'cp-attention-1',
      entryId: 'entry-attention-1',
      reason: 'stale result',
      recordedAt: 2100,
      commitRevision: 1,
    }));
    expect(wire.getModel(ResearchDistillationModel).attention).toMatchObject({
      status: 'review_requested',
      checkpointId: 'cp-attention-1',
    });

    wire.dispatch(researchRecordDistillationAttention({
      status: 'handoff_unavailable',
      checkpointId: 'cp-attention-2',
      entryId: 'entry-attention-2',
      reason: 'The external Skill is hidden.',
      recordedAt: 2200,
      commitRevision: 2,
    }));
    const snapshot = svc.getSnapshot();
    expect(snapshot.distillationAttention).toMatchObject({
      status: 'handoff_unavailable',
      checkpointId: 'cp-attention-2',
      entryId: 'entry-attention-2',
      reason: 'The external Skill is hidden.',
    });
    expect(snapshot.status).toMatchObject({ health: 'attention' });
    expect(snapshot.status?.attention).toContain(
      'Method review handoff unavailable for Entry entry-attention-2: The external Skill is hidden.',
    );
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

describe('explicit Research Line to AITP workstream binding', () => {
  it('preserves cancellation when confirmation reconciliation is invalidated', async () => {
    wire.dispatch(researchCreateLine({ slug: 'local-line', title: 'Local line', createdAt: 1 }));
    wire.dispatch(researchSetProgram({
      topicId: 't1', title: 'Test', goalText: 'Bounded goal',
      goalSource: '.aitp/topic/TOPIC.md', establishedAt: 2,
    }));
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'local-line' }));
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    modeSvc.reconcileCurrentTopicBinding = vi.fn().mockRejectedValue(new AitpResearchError(
      AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
      'The observation was superseded.',
    ));
    const coordinator = makeCoordinatorStub().coordinator;
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter,
      makeToolExecutorStub(), makeStubGoalService(), coordinator,
    );

    await expect(researchSvc.confirmLineWorkstreamBinding({
      lineSlug: 'local-line',
      workstream: 'aitp-workstream',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'user',
    })).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
    });
    expect(modeSvc._setPhaseCalls).toEqual([]);
    expect(coordinator.refresh).not.toHaveBeenCalled();
  });

  it('does not invisibly advance the public revision for a same-Topic no-op observation', async () => {
    const { researchSvc, modeSvc, lineSlug, workstream } = await buildResearchBindingHarness();
    const before = researchSvc.getSnapshot().revision;

    await expect(modeSvc.reconcileCurrentTopicBinding(lineSlug)).resolves.toBeUndefined();
    expect(researchSvc.getSnapshot().revision).toBe(before);
    await expect(researchSvc.confirmLineWorkstreamBinding({
      lineSlug,
      workstream,
      expectedRevision: before,
      confirmedBy: 'user',
    })).resolves.toMatchObject({ lineSlug, workstream });
  });

  it('starts unbound, rejects a stale confirmation, and persists only an explicit different workstream slug', async () => {
    const { researchSvc, lineSlug, workstream } = await buildResearchBindingHarness();
    const unbound = researchSvc.getSnapshot();
    expect(unbound.currentWorkstreamBinding).toMatchObject({
      lineSlug,
      status: 'unbound',
    });
    expect(unbound.lineWorkstreamBindings).toEqual([]);

    await expect(researchSvc.confirmLineWorkstreamBinding({
      lineSlug,
      workstream,
      expectedRevision: unbound.revision + 1,
      confirmedBy: 'user',
    })).rejects.toThrow('Research revision is stale');

    const binding = await researchSvc.confirmLineWorkstreamBinding({
      lineSlug,
      workstream,
      expectedRevision: unbound.revision,
      confirmedBy: 'user',
    });
    const bound = researchSvc.getSnapshot();
    expect(binding).toMatchObject({
      lineSlug,
      workstream,
      topicId: 't1',
      observedRevision: 1,
      confirmedBy: 'user',
    });
    expect(workstream).not.toBe(lineSlug);
    expect(bound.currentWorkstreamBinding).toMatchObject({ status: 'bound', binding });
    expect(bound.lineWorkstreamBindings).toEqual([binding]);

    const revision = bound.revision;
    await expect(researchSvc.confirmLineWorkstreamBinding({
      lineSlug,
      workstream,
      expectedRevision: revision,
      confirmedBy: 'user',
    })).resolves.toEqual(binding);
    expect(researchSvc.getSnapshot().revision).toBe(revision);
  });

  it('re-observes the Topic before post-confirmation scoped maintenance', async () => {
    const adapter = makeStubAdapter();
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire, makeScopeCtx(), adapter, eventBus, makeProfileServiceStub(), coordinator,
    );
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(),
      makeStubGoalService(), coordinator,
    );
    await modeSvc.enter({ actor: 'user', lineSlug: 'line-a' });
    const topicB: AitpEnterResult = {
      ...await adapter.enter(),
      topic: {
        id: 'topic-b',
        title: 'Topic B',
        goal: { text: 'Goal B', source: '.aitp/topic/TOPIC.md' },
      },
    };
    const enterSpy = vi.spyOn(adapter, 'enter').mockResolvedValue(topicB);
    const checkSpy = vi.spyOn(adapter, 'check');

    await expect(researchSvc.confirmLineWorkstreamBinding({
      lineSlug: 'line-a',
      workstream: 'workstream-a',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'user',
    })).rejects.toThrow('freshly observed AITP Topic');

    expect(enterSpy).toHaveBeenCalledWith();
    expect(enterSpy.mock.calls.filter(([options]) => options?.workstream !== undefined)).toHaveLength(0);
    expect(checkSpy).not.toHaveBeenCalled();
    expect(researchSvc.getProgram()).toMatchObject({ topicId: 'topic-b' });
    expect(researchSvc.getLineWorkstreamAlignment('line-a')).toMatchObject({ status: 'conflict' });
    expect(modeSvc.phase).toBe('degraded');
    expect(coordinator.snapshot()).toBeUndefined();
  });

  it('rejects a post-confirmation scoped receipt from a different Topic', async () => {
    const adapter = makeStubAdapter();
    const enteredT1 = await adapter.enter();
    const scopedT2: AitpEnterResult = {
      ...enteredT1,
      schema: 'aitp/enter-0.3',
      workstream: 'workstream-a',
      topic: {
        id: 'topic-b',
        title: 'Topic B',
        goal: { text: 'Goal B', source: '.aitp/topic/TOPIC.md' },
      },
    };
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire, makeScopeCtx(), adapter, eventBus, makeProfileServiceStub(), coordinator,
    );
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(),
      makeStubGoalService(), coordinator,
    );
    await modeSvc.enter({ actor: 'user', lineSlug: 'line-a' });
    const enterSpy = vi.spyOn(adapter, 'enter').mockImplementation(async (options) =>
      options?.workstream === undefined ? enteredT1 : scopedT2);

    await expect(researchSvc.confirmLineWorkstreamBinding({
      lineSlug: 'line-a',
      workstream: 'workstream-a',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'user',
    })).rejects.toThrow('different Topic than the fresh Program');

    expect(enterSpy).toHaveBeenCalledWith();
    expect(enterSpy).toHaveBeenCalledWith({
      workstream: 'workstream-a',
      signal: expect.any(AbortSignal),
    });
    expect(researchSvc.getProgram()).toMatchObject({ topicId: 't1' });
    expect(researchSvc.getLineWorkstreamAlignment('line-a')).toMatchObject({ status: 'bound' });
    expect(coordinator.snapshot()).toBeUndefined();
    expect(modeSvc.phase).toBe('degraded');
  });

  it('requires clear-before-rebind and derives stale, conflict, and unavailable states from Topic changes', async () => {
    const { researchSvc, lineSlug, workstream } = await buildResearchBindingHarness();
    const binding = await researchSvc.confirmLineWorkstreamBinding({
      lineSlug,
      workstream,
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'main_agent',
    });

    await expect(researchSvc.confirmLineWorkstreamBinding({
      lineSlug,
      workstream: 'different-workstream',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'main_agent',
    })).rejects.toThrow('clear it explicitly before rebinding');

    wire.dispatch(researchSetProgram({
      topicId: 't1', title: 'Test', goalText: 'Changed goal',
      goalSource: '.aitp/topic/TOPIC.md', establishedAt: 2,
    }));
    expect(researchSvc.getLineWorkstreamAlignment(lineSlug)).toMatchObject({
      status: 'stale',
      binding,
    });

    wire.dispatch(researchSetProgram({
      topicId: 'topic-b', title: 'Topic B', goalText: 'Other goal',
      goalSource: '.aitp/topic/TOPIC.md', establishedAt: 4,
    }));
    expect(researchSvc.getLineWorkstreamAlignment(lineSlug)).toMatchObject({
      status: 'conflict',
      binding,
    });

    wire.dispatch(researchSetProgram({ clear: true }));
    expect(researchSvc.getLineWorkstreamAlignment(lineSlug)).toMatchObject({
      status: 'unavailable',
      binding,
    });
  });

  it('recovers an exact legacy binding whose persisted map key and embedded Line disagree', async () => {
    wire.dispatch(researchCreateLine({ slug: 'line-a', title: 'Line A', createdAt: 1 }));
    wire.dispatch(researchCreateLine({ slug: 'line-b', title: 'Line B', createdAt: 2 }));
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'line-a' }));
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
    wire.dispatch(researchSetProgram({
      topicId: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md', establishedAt: 3,
    }));
    const malformed = {
      confirmationId: 'confirmation-legacy',
      lineSlug: 'line-b',
      workstream: 'ws-b',
      topicId: 'topic-a',
      observedRevision: 1,
      confirmedBy: 'user' as const,
      confirmedAt: 4,
    };
    Object.assign(wire.getModel(ResearchModel).current.lineWorkstreamBindings!, {
      'line-a': malformed,
    });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'ready' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
    );
    const conflicted = researchSvc.getSnapshot();
    expect(conflicted.currentWorkstreamBinding).toMatchObject({
      lineSlug: 'line-a',
      status: 'conflict',
      binding: malformed,
    });
    expect(conflicted.lineWorkstreamBindings).toEqual([]);

    researchSvc.clearLineWorkstreamBinding({
      lineSlug: 'line-a',
      expectedRevision: conflicted.revision,
      expectedConfirmationId: malformed.confirmationId,
    });

    expect(researchSvc.getLineWorkstreamAlignment('line-a')).toMatchObject({ status: 'unbound' });
    expect(wire.getModel(ResearchModel).current.lineWorkstreamBindings).toEqual({});
  });

  it('clears only at the current Research revision and makes repeated clear a no-op', async () => {
    const { researchSvc, lineSlug, workstream } = await buildResearchBindingHarness();
    const binding = await researchSvc.confirmLineWorkstreamBinding({
      lineSlug,
      workstream,
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'user',
    });
    const confirmed = researchSvc.getSnapshot();

    expect(() => researchSvc.clearLineWorkstreamBinding({
      lineSlug,
      expectedRevision: confirmed.revision - 1,
      expectedConfirmationId: binding.confirmationId,
    })).toThrow('Research revision is stale');
    expect(() => researchSvc.clearLineWorkstreamBinding({
      lineSlug,
      expectedRevision: confirmed.revision,
      expectedConfirmationId: 'abandoned-confirmation',
    })).toThrow('workstream confirmation changed');
    researchSvc.clearLineWorkstreamBinding({
      lineSlug,
      expectedRevision: confirmed.revision,
      expectedConfirmationId: binding.confirmationId,
    });
    const cleared = researchSvc.getSnapshot();
    expect(cleared.currentWorkstreamBinding).toMatchObject({ status: 'unbound' });
    expect(cleared.lineWorkstreamBindings).toEqual([]);

    researchSvc.clearLineWorkstreamBinding({
      lineSlug,
      expectedRevision: cleared.revision,
      expectedConfirmationId: binding.confirmationId,
    });
    expect(researchSvc.getSnapshot().revision).toBe(cleared.revision);
  });

  it('rejects a pre-undo confirmation identity after rebranching to the same binding tuple', async () => {
    const { researchSvc, lineSlug } = await buildResearchBindingHarness();
    wire.dispatch(contextAppendMessage({
      message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
    }));
    const bindingA = await researchSvc.confirmLineWorkstreamBinding({
      lineSlug,
      workstream: 'workstream-a',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'user',
    });
    const abandonedRevision = researchSvc.getSnapshot().revision;

    wire.dispatch(contextUndo({ count: 1 }));
    expect(researchSvc.getSnapshot().revision).toBe(abandonedRevision);
    expect(researchSvc.getLineWorkstreamAlignment(lineSlug).status).toBe('unbound');
    const bindingB = await researchSvc.confirmLineWorkstreamBinding({
      lineSlug,
      workstream: 'workstream-a',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'user',
    });
    expect(bindingB.confirmationId).not.toBe(bindingA.confirmationId);

    expect(() => researchSvc.clearLineWorkstreamBinding({
      lineSlug,
      expectedRevision: researchSvc.getSnapshot().revision,
      expectedConfirmationId: bindingA.confirmationId,
    })).toThrow('workstream confirmation changed');
    expect(researchSvc.getLineWorkstreamAlignment(lineSlug)).toMatchObject({
      status: 'bound',
      binding: bindingB,
    });
  });

  it('does not let a cleared binding receive a late stale-generation maintenance result', async () => {
    const adapter = makeStubAdapter();
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator,
    );
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      modeSvc,
      adapter,
      makeToolExecutorStub(),
      makeStubGoalService(),
      coordinator,
    );
    await modeSvc.enter({ actor: 'user', lineSlug: 'local-line' });
    const unscopedEntered = await adapter.enter();
    const scopedEntered: AitpEnterResult = {
      ...unscopedEntered,
      schema: 'aitp/enter-0.3',
      workstream: 'aitp-workstream',
    };

    let releaseEnter!: (result: AitpEnterResult) => void;
    const scopedEnter = new Promise<AitpEnterResult>((resolve) => {
      releaseEnter = resolve;
    });
    const enterSpy = vi.spyOn(adapter, 'enter').mockImplementation(async (options) =>
      options?.workstream === undefined ? unscopedEntered : scopedEnter);
    const pending = researchSvc.confirmLineWorkstreamBinding({
      lineSlug: 'local-line',
      workstream: 'aitp-workstream',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'user',
    });
    await vi.waitFor(() => expect(enterSpy).toHaveBeenCalledWith(expect.objectContaining({
      workstream: 'aitp-workstream',
    })));

    researchSvc.clearLineWorkstreamBinding({
      lineSlug: 'local-line',
      expectedRevision: researchSvc.getSnapshot().revision,
      expectedConfirmationId: researchSvc.getSnapshot().currentWorkstreamBinding!.binding!.confirmationId,
    });
    releaseEnter(scopedEntered);

    await expect(pending).rejects.toThrow(
      'binding changed while scoped maintenance was running',
    );
    expect(researchSvc.getSnapshot().currentWorkstreamBinding).toMatchObject({
      lineSlug: 'local-line',
      status: 'unbound',
    });
    expect(modeSvc.phase).toBe('ready');
    expect(coordinator.snapshot()).toBeUndefined();
  });

  it('does not let a cleared binding receive a late unscoped Topic observation', async () => {
    const adapter = makeStubAdapter();
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator,
    );
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      modeSvc,
      adapter,
      makeToolExecutorStub(),
      makeStubGoalService(),
      coordinator,
    );
    await modeSvc.enter({ actor: 'user', lineSlug: 'local-line' });
    const entered = await adapter.enter();
    let releaseEnter!: (result: AitpEnterResult) => void;
    const delayedEnter = new Promise<AitpEnterResult>((resolve) => {
      releaseEnter = resolve;
    });
    const enterSpy = vi.spyOn(adapter, 'enter').mockImplementation(async (options) =>
      options?.workstream === undefined ? delayedEnter : entered);

    const pending = researchSvc.confirmLineWorkstreamBinding({
      lineSlug: 'local-line',
      workstream: 'aitp-workstream',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'user',
    });
    await vi.waitFor(() => expect(enterSpy).toHaveBeenCalledWith());
    const binding = researchSvc.getSnapshot().currentWorkstreamBinding!.binding!;
    researchSvc.clearLineWorkstreamBinding({
      lineSlug: 'local-line',
      expectedRevision: researchSvc.getSnapshot().revision,
      expectedConfirmationId: binding.confirmationId,
    });
    releaseEnter(entered);

    await expect(pending).rejects.toThrow(
      'newly confirmed workstream no longer matches',
    );
    expect(researchSvc.getSnapshot().currentWorkstreamBinding).toMatchObject({
      lineSlug: 'local-line',
      status: 'unbound',
    });
    expect(modeSvc.phase).toBe('ready');
    expect(coordinator.snapshot()).toBeUndefined();
  });

  it('does not let a late confirmation refresh overwrite the phase of a newly selected bound line', async () => {
    wire.dispatch(researchCreateLine({ slug: 'line-a', title: 'Line A', createdAt: 1 }));
    wire.dispatch(researchCreateLine({ slug: 'line-b', title: 'Line B', createdAt: 2 }));
    wire.dispatch(researchSetProgram({
      topicId: 't1',
      title: 'Test',
      goalText: 'Bounded goal',
      goalSource: '.aitp/topic/TOPIC.md',
      establishedAt: 3,
    }));
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'line-a' }));
    seedConfirmedWorkstreamBinding({ lineSlug: 'line-b', workstream: 'ws-b' });
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    let releaseRefresh!: (receipt: AitpMaintenanceReceipt) => void;
    const refresh = vi.fn(() => new Promise<AitpMaintenanceReceipt>((resolve) => {
      releaseRefresh = resolve;
    }));
    const coordinator = {
      _serviceBrand: undefined,
      onDidUpdate: Event.None as import('#/_base/event').Event<AitpMaintenanceReceipt>,
      refresh,
      snapshot: vi.fn<() => AitpMaintenanceReceipt | undefined>(() => undefined),
      reset: vi.fn(),
    };
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      modeSvc,
      adapter,
      makeToolExecutorStub(),
      makeStubGoalService(),
      coordinator,
    );

    const pending = researchSvc.confirmLineWorkstreamBinding({
      lineSlug: 'line-a',
      workstream: 'ws-a',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'user',
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    wire.dispatch(aitpModeSetLine({ lineSlug: 'line-b' }));
    releaseRefresh({
      status: 'degraded',
      refreshedAt: 4,
      memoryStatus: 'unknown',
      workstream: 'ws-a',
      latestWorkingNoteAt: undefined,
      activeNewerThanWorkingNote: null,
      unresolvedFailureCount: 0,
      unresolvedFailures: [],
      nextAction: undefined,
      nextActionDetails: undefined,
      warningSummaries: [],
      check: { status: 'unavailable', counts: undefined, findingCodes: [] },
      degradedReason: 'check_unavailable',
    });

    await expect(pending).resolves.toMatchObject({ lineSlug: 'line-a', workstream: 'ws-a' });
    expect(modeSvc._setPhaseCalls).toEqual([]);
    expect(researchSvc.getSnapshot().currentLineSlug).toBe('line-b');
    expect(researchSvc.getSnapshot().currentWorkstreamBinding).toMatchObject({
      status: 'bound',
      binding: { workstream: 'ws-b' },
    });
  });

  it('follows conversation undo and restores the exact confirmation on a cold replay', async () => {
    const first = await buildResearchBindingHarness();
    wire.dispatch(contextAppendMessage({
      message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
    }));
    await first.researchSvc.confirmLineWorkstreamBinding({
      lineSlug: first.lineSlug,
      workstream: first.workstream,
      expectedRevision: first.researchSvc.getSnapshot().revision,
      confirmedBy: 'main_agent',
    });
    wire.dispatch(contextUndo({ count: 1 }));
    expect(first.researchSvc.getSnapshot().currentWorkstreamBinding).toMatchObject({ status: 'unbound' });

    const current = first.researchSvc.getSnapshot();
    const binding = await first.researchSvc.confirmLineWorkstreamBinding({
      lineSlug: first.lineSlug,
      workstream: first.workstream,
      expectedRevision: current.revision,
      confirmedBy: 'main_agent',
    });
    await wire.restore();

    expect(first.researchSvc.getSnapshot().currentWorkstreamBinding).toMatchObject({
      status: 'bound',
      binding,
    });
    expect(first.researchSvc.getSnapshot().lineWorkstreamBindings).toEqual([binding]);
  });
});

describe('Goal display projection', () => {
  it('omits Goal projections when there is no current Goal', async () => {
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
    expect(svc.getSnapshot().researchGoal).toBeUndefined();
  });

  it('projects one Research Goal bound to the current generic Goal and Research scope', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    wire.dispatch(researchSetProgram({
      topicId: 'topic-1', title: 'Topic', goalText: 'AITP goal', goalSource: 'enter', establishedAt: 1,
    }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active', 3, {
        completionCriterion: 'Obtain a converged result.',
        continuation: {
          state: 'held',
          owner: 'aitpResearch',
          reason: 'A research checkpoint is pending commit.',
        },
      })),
    );
    svc.createLine({ slug: 'main', title: 'Main line' });
    wire.dispatch(researchConfirmWorkstreamBinding({
      confirmationId: 'confirmation-goal',
      lineSlug: 'main',
      workstream: 'goal-workstream',
      topicId: 'topic-1',
      observedRevision: 1,
      confirmedBy: 'main_agent',
      confirmedAt: 2,
      expectedRevision: wire.getModel(ResearchModel).current.revision,
    }));
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Which result converges?' });
    svc.setFocus(question.id);
    const before = svc.getSnapshot();
    svc.confirmGoalAlignment({
      relation: 'goal_milestone_in_program',
      expectedRevision: before.revision,
      goalId: 'goal-1',
      topicId: 'topic-1',
      observedRevision: 1,
    });

    expect(svc.getSnapshot().researchGoal).toMatchObject({
      schema: 'hakimi/research-goal-0.1',
      goalId: 'goal-1',
      objective: 'Test goal',
      completionCriterion: 'Obtain a converged result.',
      scope: { programTopicId: 'topic-1', lineSlug: 'main', questionId: question.id },
      nonGoals: [],
      budget: { turnBudget: 3, remainingTurns: 3, turnBudgetReached: false },
      status: 'active',
      continuation: {
        state: 'held',
        owner: 'aitpResearch',
        reason: 'A research checkpoint is pending commit.',
      },
      programRelation: { status: 'aligned' },
      humanGates: [],
      persistenceGuards: [
        { code: 'research.checkpoint.pending', status: 'clear' },
        { code: 'research.mode.ready', status: 'clear' },
        { code: 'research.goal-alignment.aligned', status: 'clear' },
        { code: 'research.workstream-binding.bound', status: 'clear' },
      ],
    });
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

      expect(svc.getSnapshot().goalSummary).toMatchObject({
        goalId: 'goal-1',
        objective: 'Test goal',
        status,
        turnBudget: 3,
        remainingTurns: 3,
      });
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

    expect(svc.getSnapshot().goalSummary).toMatchObject({
      goalId: 'goal-1',
      objective: 'Test goal',
      status: 'active',
    });
  });

  it('projects Goal completion, terminal, waiting, and exhausted-turn facts', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('blocked', 0, {
        completionCriterion: 'Obtain a converged solution.',
        terminalReason: 'The available evidence is contradictory.',
        waitingFor: { taskIds: ['task-1', 'task-2'], policy: 'all' },
      })),
    );

    expect(svc.getSnapshot().goalSummary).toMatchObject({
      goalId: 'goal-1',
      objective: 'Test goal',
      completionCriterion: 'Obtain a converged solution.',
      status: 'blocked',
      turnBudget: 0,
      remainingTurns: 0,
      terminalReason: 'The available evidence is contradictory.',
      waitingFor: { taskIds: ['task-1', 'task-2'], policy: 'all' },
    });
  });

  it('requires explicit confirmation even when Goal and Program text match', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    wire.dispatch(researchSetProgram({
      topicId: 'topic-1', title: 'Topic', goalText: 'Test goal', goalSource: 'enter', establishedAt: 1,
    }));
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );
    expect(svc.getSnapshot().goalAlignment).toMatchObject({ status: 'confirmation_required' });
  });

  it('projects restored action recovery ahead of checkpoint and Goal alignment blockers', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    wire.dispatch(researchSetProgram({
      topicId: 'topic-1', title: 'Topic', goalText: 'A different AITP goal', goalSource: 'enter', establishedAt: 1,
    }));
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true, phase: 'ready' }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );
    const action = svc.planAndStartAction({
      actionId: 'action-restored',
      kind: 'other',
      purpose: 'Audit the restored bounded action state',
      stopCondition: 'the restored action is classified',
    });
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'checkpoint-restored',
      idempotencyKey: 'checkpoint-restored-key',
      createdAt: 2,
    }));

    // Simulate a cold-restored legacy snapshot produced before live-action
    // phase guards were enforced. The projection must recover it without
    // silently rewriting persisted Research state.
    const restored = wire.getModel(ResearchModel).current as unknown as { phase: 'gap_analysis' };
    restored.phase = 'gap_analysis';

    const snapshot = svc.getSnapshot();
    expect(snapshot).toMatchObject({
      goalAlignment: { status: 'confirmation_required' },
      pendingCheckpoint: { checkpointId: 'checkpoint-restored' },
      effectiveNextStep: {
        source: 'research_action',
        freshness: 'blocked',
        observedAt: action.createdAt,
        derivedFrom: { actionId: 'action-restored' },
      },
      status: {
        health: 'blocked',
        nextStep: expect.stringContaining('Recover action action-restored'),
      },
    });
    expect(snapshot.status?.attention).toEqual([
      expect.stringContaining('Recover action action-restored'),
      expect.stringContaining('Checkpoint checkpoint-restored is pending durable commit'),
      expect.stringContaining('Goal alignment is confirmation_required'),
    ]);
  });

  it('projects a pending checkpoint ahead of Goal alignment when no action needs recovery', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    wire.dispatch(
      researchSetProgram({
        topicId: 'topic-1', title: 'Topic', goalText: 'A different AITP goal', goalSource: 'enter', establishedAt: 1,
      }),
      researchProposeCheckpoint({
        checkpointId: 'checkpoint-pending',
        idempotencyKey: 'checkpoint-pending-key',
        createdAt: 3,
      }),
    );
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true, phase: 'ready' }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );

    expect(svc.getSnapshot()).toMatchObject({
      effectiveNextStep: {
        source: 'aitp_maintenance',
        freshness: 'blocked',
        observedAt: 3,
        text: expect.stringContaining('Checkpoint checkpoint-pending is pending durable commit'),
      },
      status: { health: 'blocked' },
    });
  });

  it('accepts only transition-authorized phase exits from the model human-gate tool', () => {
    for (const next_phase of ['idle', 'gap_analysis', 'action_planned', 'action_executing', 'evaluating']) {
      expect(ResolveResearchDecisionInputSchema.parse({
        gate_id: 'gate-1', resolution: 'Continue.', next_phase,
      })).toMatchObject({ next_phase });
    }
    for (const next_phase of ['orienting', 'state_updated', 'checkpoint_pending', 'awaiting_human']) {
      expect(ResolveResearchDecisionInputSchema.safeParse({
        gate_id: 'gate-1', resolution: 'Reject.', next_phase,
      }).success).toBe(false);
    }
  });

  it('automatically discards an unbound historical checkpoint at the mutation boundary', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true, phase: 'ready' }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );
    svc.createLine({ slug: 'main', title: 'Main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Which bounded result survives?' });
    svc.setFocus(question.id);
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'checkpoint-historical',
      questionId: question.id,
      lineSlug: 'main',
      idempotencyKey: 'checkpoint-historical-key',
      createdAt: 3,
    }));
    svc.updateQuestion({ questionId: question.id, assessment: 'Newer evidence supersedes the proposal.' });

    const snapshot = svc.getSnapshot();
    expect(snapshot.pendingCheckpoint).toBeUndefined();
    expect(snapshot.currentQuestion).toMatchObject({
      assessment: 'Newer evidence supersedes the proposal.',
      persistence: 'working',
      revision: 4,
    });
    expect(snapshot.researchGoal?.persistenceGuards.find(
      (guard) => guard.code === 'research.checkpoint.pending',
    )).toMatchObject({ status: 'clear' });
    expect(snapshot.status?.attention.some((message) =>
      message.includes('checkpoint-historical'))).toBe(false);
  });

  it('discards a stale line-only checkpoint locally before allowing its binding to clear', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const adapter = makeStubAdapter();
    const enterSpy = vi.spyOn(adapter, 'enter');
    const prepareSpy = vi.spyOn(adapter, 'recordPrepare');
    const saveSpy = vi.spyOn(adapter, 'recordSave');
    const binding = seedConfirmedWorkstreamBinding({ lineSlug: 'main' });
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'checkpoint-line-only-stale',
      lineSlug: 'main',
      workstreamBinding: binding,
      idempotencyKey: 'checkpoint-line-only-stale-key',
      createdAt: 4,
    }));
    wire.dispatch(researchSetProgram({
      topicId: 'topic-2', title: 'Replacement', goalText: 'Replacement goal', goalSource: 'enter', establishedAt: 5,
    }));
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true, phase: 'ready' }), adapter, makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );

    const discarded = svc.discardHistoricalCheckpoint({
      checkpointId: 'checkpoint-line-only-stale',
      expectedRevision: svc.getSnapshot().revision,
    });
    expect(discarded).toMatchObject({ checkpointId: 'checkpoint-line-only-stale', questionId: undefined });
    expect(svc.getPendingCheckpoint()).toBeNull();
    expect(enterSpy).not.toHaveBeenCalled();
    expect(prepareSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();

    svc.clearLineWorkstreamBinding({
      lineSlug: 'main',
      expectedConfirmationId: binding.confirmationId,
      expectedRevision: svc.getSnapshot().revision,
    });
    expect(svc.getSnapshot().lineWorkstreamBindings).toEqual([]);
  });

  it('discards a question-bound checkpoint when its captured binding is stale without revising the question', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const adapter = makeStubAdapter();
    const prepareSpy = vi.spyOn(adapter, 'recordPrepare');
    const saveSpy = vi.spyOn(adapter, 'recordSave');
    const binding = seedConfirmedWorkstreamBinding({ lineSlug: 'main' });
    wire.dispatch(researchCreateQuestion({
      id: 'question-binding-stale', lineSlug: 'main', wording: 'Does binding staleness release this proposal?', priority: 0, neededEvidence: [],
    }));
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'checkpoint-question-binding-stale',
      questionId: 'question-binding-stale',
      lineSlug: 'main',
      workstreamBinding: binding,
      idempotencyKey: 'checkpoint-question-binding-stale-key',
      createdAt: 4,
    }));
    const questionRevision = wire.getModel(ResearchModel).current.questions['question-binding-stale']!.revision;
    wire.dispatch(researchSetProgram({
      topicId: 't1', title: 'Observed again', goalText: 'Changed observation', goalSource: 'enter', establishedAt: 5,
    }));
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true, phase: 'ready' }), adapter, makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );

    svc.discardHistoricalCheckpoint({
      checkpointId: 'checkpoint-question-binding-stale',
      expectedRevision: svc.getSnapshot().revision,
    });
    expect(svc.getPendingCheckpoint()).toBeNull();
    expect(wire.getModel(ResearchModel).current.questions['question-binding-stale']).toMatchObject({
      persistence: 'working',
      revision: questionRevision + 1,
    });
    expect(prepareSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('refuses to discard a current checkpoint proposal', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true, phase: 'ready' }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );
    svc.createLine({ slug: 'main', title: 'Main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Is this checkpoint current?' });
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'checkpoint-current',
      questionId: question.id,
      lineSlug: 'main',
      idempotencyKey: 'checkpoint-current-key',
      createdAt: 3,
    }));

    expect(() => svc.discardHistoricalCheckpoint({
      checkpointId: 'checkpoint-current',
      expectedRevision: svc.getSnapshot().revision,
    })).toThrow('not a safely discardable historical proposal');
    expect(svc.getPendingCheckpoint()).toMatchObject({ checkpointId: 'checkpoint-current' });
  });

  it('retains a historical checkpoint after an AITP save receipt exists', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true, phase: 'ready' }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );
    svc.createLine({ slug: 'main', title: 'Main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Did this save cross the boundary?' });
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'checkpoint-saved',
      questionId: question.id,
      lineSlug: 'main',
      idempotencyKey: 'checkpoint-saved-key',
      createdAt: 3,
    }));
    bindCompleteCheckpointReceipt('checkpoint-saved', 'entry-saved');
    svc.updateQuestion({ questionId: question.id, assessment: 'The question advanced after save.' });

    expect(() => svc.discardHistoricalCheckpoint({
      checkpointId: 'checkpoint-saved',
      expectedRevision: svc.getSnapshot().revision,
    })).toThrow('proposals with AITP receipts must be committed or recovered explicitly');
    expect(svc.getPendingCheckpoint()).toMatchObject({
      checkpointId: 'checkpoint-saved',
      committedEntryId: 'entry-saved',
      receipt: { save: { status: 'saved' } },
    });

  });

  it('acknowledges a proposal whose checkpoint id is already in committed cursor history', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true, phase: 'ready' }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );
    svc.createLine({ slug: 'main', title: 'Main' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Did this checkpoint reach the committed cursor?' });
    wire.dispatch(
      researchProposeCheckpoint({
        checkpointId: 'checkpoint-in-history', questionId: question.id, lineSlug: 'main',
        idempotencyKey: 'checkpoint-in-history-key', createdAt: 3,
      }),
      researchCommitCheckpoint({ checkpointId: 'checkpoint-in-history', entryId: 'entry-history', committedAt: 4 }),
    );
    svc.updateQuestion({ questionId: question.id, assessment: 'The Question changed after the external commit.' });

    expect(() => svc.discardHistoricalCheckpoint({
      checkpointId: 'checkpoint-in-history',
      expectedRevision: svc.getSnapshot().revision,
    })).toThrow('not a safely discardable historical proposal');
    expect(svc.getPendingCheckpoint()).toBeNull();
    expect(svc.getCommittedCursor()).toMatchObject({
      checkpointId: 'checkpoint-in-history',
      entryId: 'entry-history',
    });
    expect(wire.getModel(ResearchModel).current.questions[question.id]).toMatchObject({
      persistence: 'committed',
    });
  });

  it('confirms explicitly different Goal and Program text, then detects goal and topic staleness', async () => {
    let currentGoal: GoalSnapshot | null = makeGoalSnapshot('active', 3, { objective: 'Deliver the parent project goal.' });
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    wire.dispatch(researchSetProgram({
      topicId: 'topic-1', title: 'Topic', goalText: 'Prove the bounded subproblem.', goalSource: 'enter', establishedAt: 1,
    }));
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(() => currentGoal),
    );
    const before = svc.getSnapshot();
    expect(() => svc.confirmGoalAlignment({
      relation: 'goal_parent_of_program', expectedRevision: before.revision + 1, goalId: 'goal-1', topicId: 'topic-1', observedRevision: 1,
    })).toThrow('Goal alignment confirmation is stale');
    svc.confirmGoalAlignment({
      relation: 'goal_parent_of_program', expectedRevision: before.revision, goalId: 'goal-1', topicId: 'topic-1', observedRevision: 1,
    });
    expect(svc.getSnapshot().goalAlignment).toMatchObject({ status: 'aligned', binding: { goalId: 'goal-1', observedRevision: 1 } });

    currentGoal = makeGoalSnapshot('active', 3, { goalId: 'goal-2', objective: 'A replacement Goal.' });
    expect(svc.getSnapshot().goalAlignment).toMatchObject({ status: 'stale' });

    currentGoal = makeGoalSnapshot('active', 3, { objective: 'Deliver the parent project goal.' });
    wire.dispatch(researchSetProgram({
      topicId: 'topic-2', title: 'Other topic', goalText: 'A different bounded subproblem.', goalSource: 'enter', establishedAt: 2,
    }));
    expect(svc.getSnapshot().goalAlignment).toMatchObject({ status: 'stale' });
  });

  it('clears a binding only against the current Goal and Program revision', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    wire.dispatch(researchSetProgram({
      topicId: 'topic-1', title: 'Topic', goalText: 'AITP goal', goalSource: 'enter', establishedAt: 1,
    }));
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );
    const before = svc.getSnapshot();
    svc.confirmGoalAlignment({
      relation: 'same_program_goal', expectedRevision: before.revision, goalId: 'goal-1', topicId: 'topic-1', observedRevision: 1,
    });
    const confirmed = svc.getSnapshot();
    expect(() => svc.clearGoalAlignment({
      expectedRevision: confirmed.revision, goalId: 'goal-1', topicId: 'topic-1', observedRevision: 2,
    })).toThrow('Goal alignment clear request is stale');
    svc.clearGoalAlignment({
      expectedRevision: confirmed.revision, goalId: 'goal-1', topicId: 'topic-1', observedRevision: 1,
    });
    expect(svc.getSnapshot().goalAlignment).toMatchObject({ status: 'confirmation_required' });
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
      goalSummary: {
        objective: 'Test goal',
        status: 'paused',
        turnBudget: 2,
        remainingTurns: 2,
      },
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

  it('rejects Line switching until the current Research cycle is resolved', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    svc.createLine({ slug: 'alt', title: 'Alternative' });
    const action = svc.planAction({
      kind: 'experiment',
      purpose: 'Test the current hypothesis',
      stopCondition: 'The bounded result is available',
    });

    expect(() => svc.switchLine('alt')).toThrow(
      `Cannot switch to Research Line alt while action ${action.actionId} is planned. Conclude or abandon the action before switching lines.`,
    );
    expect(svc.getSnapshot()).toMatchObject({
      currentLineSlug: 'main',
      currentAction: { actionId: action.actionId, status: 'planned' },
      phase: 'action_planned',
    });
  });

  it('projects an impossible cross-Line focus out of the current snapshot', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    svc.createLine({ slug: 'alt', title: 'Alternative' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Main question' });
    svc.setFocus(question.id);

    wire.dispatch(aitpModeSetLine({ lineSlug: 'alt' }));

    const snapshot = svc.getSnapshot();
    expect(snapshot.currentLineSlug).toBe('alt');
    expect(snapshot.currentFocus).toBeUndefined();
    expect(snapshot.currentQuestion).toBeUndefined();
    expect(snapshot.status?.currentQuestionId).toBeUndefined();
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
      () => svc.proposeCheckpoint({ expectedRevision: 0 }),
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
    modeSvc.pauseLoop(svc.getSnapshot().revision);

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
    expect(() => svc.proposeCheckpoint({ expectedRevision: 0, questionId: question.id })).toThrow(
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
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

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

    expect(() => svc.proposeCheckpoint({ expectedRevision: 0, questionId: question.id, lineSlug: 'alt' })).toThrow(
      `Line alt does not own question ${question.id}`,
    );
    expect(svc.getPendingCheckpoint()).toBeNull();
  });

  it('accepts the zero expected revision sentinel after Research advances', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    seedCurrentConfirmedWorkstream();

    expect(svc.getSnapshot().revision).toBeGreaterThan(0);
    const checkpoint = svc.proposeCheckpoint({ expectedRevision: 0, lineSlug: 'main' });

    expect(svc.getPendingCheckpoint()).toMatchObject({
      checkpointId: checkpoint.checkpointId,
      lineSlug: 'main',
    });
  });

  it('rejects a stale checkpoint proposal without creating pending state', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.createLine({ slug: 'main', title: 'Main' });
    const expectedRevision = svc.getSnapshot().revision;
    expect(expectedRevision).toBeGreaterThan(0);

    svc.createLine({ slug: 'alt', title: 'Alternative' });
    expect(svc.getSnapshot().revision).toBeGreaterThan(expectedRevision);

    let staleError: unknown;
    try {
      svc.proposeCheckpoint({ expectedRevision, lineSlug: 'main' });
    } catch (error) {
      staleError = error;
    }
    expect(staleError).toMatchObject({
      code: AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
    });
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
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
    );

    await modeSvc.exit();
    expect(wire.getModel(AitpModeModel).current.phase).toBe('inactive');
    expect(adapter.health.phase).toBe('inactive');
  });

  it('rejects setPhase(inactive) without dispatching or resetting the adapter', async () => {
    const adapter = makeStubAdapter();
    const modeSvc = await buildRealModeService(adapter);
    const dispatch = vi.spyOn(wire, 'dispatch');
    const reset = vi.spyOn(adapter, 'reset');
    let changes = 0;
    const subscription = modeSvc.onDidChange(() => changes++);

    let thrown: unknown;
    try {
      modeSvc.setPhase('inactive');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
    });
    expect(thrown).toHaveProperty(
      'message',
      expect.stringContaining('Use exit()'),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(changes).toBe(0);
    expect(modeSvc.phase).toBe('inactive');
    subscription.dispose();
  });

  it('does not let a stale phase writer revive an inactive mode', async () => {
    const modeSvc = await buildRealModeService();
    const dispatch = vi.spyOn(wire, 'dispatch');

    expect(() => modeSvc.setPhase('degraded')).toThrow('after the mode has exited');

    expect(dispatch).not.toHaveBeenCalled();
    expect(modeSvc.phase).toBe('inactive');
  });
});

describe('mode visibility changes', () => {
  it('emits only for inactive/active transitions', async () => {
    const modeSvc = await buildRealModeService();
    let changes = 0;
    const subscription = modeSvc.onDidChange?.(() => changes++);

    await modeSvc.enter({ actor: 'user' });
    expect(changes).toBe(1);
    await modeSvc.exit();
    expect(changes).toBe(2);
    await modeSvc.exit();
    expect(changes).toBe(2);
    subscription?.dispose();
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
        'ReviewResearchEvidence',
        'ObserveResearchRun',
        'DiscardHistoricalResearchCheckpoint',
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
        'ReviewResearchEvidence',
        'ObserveResearchRun',
        'DiscardHistoricalResearchCheckpoint',
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
  it.each(['inactive', 'ready'] as const)(
    'does not reset the session adapter when a %s child mode restores or undoes',
    async (phase) => {
      const adapter = makeStubAdapter();
      adapter._setHealth({ phase: 'ready', contractVersion: '0.2', pluginVersion: '0.9.0' });
      const health = adapter.health;
      const reset = vi.spyOn(adapter, 'reset');
      const probe = vi.spyOn(adapter, 'probe');
      const resetMaintenance = vi.fn();
      const childWire = buildWire(`operator-${phase}`);
      if (phase === 'ready') {
        childWire.dispatch(aitpModeEnter({ actor: 'user' }));
        childWire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
      }
      const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
      const addActiveTool = vi.fn();
      const ix = createServices(disposables, {
        additionalServices: (reg) => {
          reg.defineInstance(IWireService, childWire);
          reg.defineInstance(IAgentScopeContext, makeScopeCtx('operator-1'));
          reg.defineInstance(ISessionAitpAdapter, adapter);
          reg.definePartialInstance(ISessionAitpLifecycleCoordinator, { reset: resetMaintenance });
          reg.defineInstance(IEventBus, eventBus);
          reg.defineInstance(IAgentProfileService, makeProfileServiceStub(addActiveTool));
          reg.define(IAgentAitpModeService, AgentAitpModeService);
        },
      });
      const child = ix.get(IAgentAitpModeService);
      const modeEvents = vi.fn();
      disposables.add(eventBus.subscribe('aitp_mode.updated', modeEvents));

      await childWire.restore();
      eventBus.publish({ type: 'context.undone', turns: 1 });
      await new Promise((resolve) => setImmediate(resolve));

      expect(reset).not.toHaveBeenCalled();
      expect(resetMaintenance).not.toHaveBeenCalled();
      expect(probe).not.toHaveBeenCalled();
      expect(adapter.health).toBe(health);
      expect(modeEvents).not.toHaveBeenCalled();
      expect(addActiveTool).not.toHaveBeenCalled();
      await expect(child.enter({ actor: 'model' })).rejects.toThrow('only available on the main agent');
    },
  );

  it('keeps an inactive cold restore silent with the initial public revision', async () => {
    const adapter = makeStubAdapter();
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeService = new AgentAitpModeService(
      wire, makeScopeCtx(), adapter, eventBus, makeProfileServiceStub(),
    );
    const researchService = await buildRealResearchService(modeService, adapter);
    const modeEvents: unknown[] = [];
    const researchEvents: unknown[] = [];
    disposables.add(eventBus.subscribe('aitp_mode.updated', (event) => modeEvents.push(event)));
    disposables.add(eventBus.subscribe('research.updated', (event) => researchEvents.push(event)));

    await wire.restore();

    expect(modeService.isActive).toBe(false);
    expect(adapter.health.phase).toBe('inactive');
    expect(modeEvents).toEqual([]);
    expect(researchEvents).toEqual([]);
    expect(researchService.getSnapshot().revision).toBe(0);
  });

  it('reconcileAfterRestore resets adapter when mode is inactive after undo', async () => {
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));

    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1' });

    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeService = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
    );
    const researchService = await buildRealResearchService(modeService, adapter);
    const activeRevision = researchService.getSnapshot().revision;
    const researchEvents: Array<{ snapshot?: ResearchStatusSnapshot }> = [];
    disposables.add(eventBus.subscribe('research.updated', (event) => {
      researchEvents.push(event as { snapshot?: ResearchStatusSnapshot });
    }));

    wire.dispatch(contextUndo({ count: 1 }));
    eventBus.publish({ type: 'context.undone', turns: 1 });
    expect(modeService.isActive).toBe(false);
    expect(wire.getModel(AitpModeModel).current.phase).toBe('inactive');
    expect(adapter.health.phase).toBe('inactive');
    await vi.waitFor(() => expect(researchEvents.some(
      (event) => event.snapshot?.mode === 'inactive',
    )).toBe(true));
    const inactive = researchEvents.findLast((event) => event.snapshot?.mode === 'inactive');
    expect(inactive?.snapshot?.revision).toBeGreaterThan(activeRevision);
    expect(inactive?.snapshot?.revision).toBe(researchService.getSnapshot().revision);
  });

  it('retains the fresh Program and binding across a real active cold restore', async () => {
    const records: import('#/wire/record').WireRecord[] = [];
    const persistedLog = recordingWireLog(records);
    const seedBus = new EventBusService();
    const seedIx = disposables.add(new TestInstantiationService());
    const seedWire = registerTestAgentWire(seedIx, testWireScope(SCOPE, 'active-cold-seed'), {
      log: persistedLog,
      eventBus: seedBus,
    });
    await seedWire.seal();
    seedWire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
    seedWire.dispatch(researchSetProgram({
      topicId: 't1',
      title: 'Test',
      goalText: 'Not established yet',
      goalSource: '.aitp/topic/TOPIC.md',
      establishedAt: 2,
    }));
    const observedRevision = seedWire.getModel(ResearchModel).current.program?.observedRevision ?? 1;
    seedWire.dispatch(researchConfirmWorkstreamBinding({
      confirmationId: 'confirmation-cold-restore',
      lineSlug: 'main',
      workstream: 'aitp-main',
      topicId: 't1',
      observedRevision,
      confirmedBy: 'main_agent',
      confirmedAt: 3,
      expectedRevision: seedWire.getModel(ResearchModel).current.revision,
    }));
    seedWire.dispatch(
      aitpModeEnter({ actor: 'user', lineSlug: 'main' }),
      aitpModeSetPhase({ phase: 'ready' }),
    );
    const persistedResearchRevision = seedWire.getModel(ResearchModel).current.revision;

    eventBus = new EventBusService();
    const replayIx = disposables.add(new TestInstantiationService());
    wire = registerTestAgentWire(replayIx, testWireScope(SCOPE, 'active-cold-seed'), {
      log: persistedLog,
      eventBus,
    });
    const adapter = makeStubAdapter();
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeService = new AgentAitpModeService(
      wire, makeScopeCtx(), adapter, eventBus, makeProfileServiceStub(), coordinator,
    );
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchService = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeService, adapter,
      makeToolExecutorStub(), makeStubGoalService(), coordinator,
    );
    const researchEvents: Array<{ snapshot?: ResearchStatusSnapshot }> = [];
    disposables.add(eventBus.subscribe('research.updated', (event) => {
      researchEvents.push(event as { snapshot?: ResearchStatusSnapshot });
    }));

    await wire.restore();

    expect(modeService.phase).toBe('ready');
    expect(researchService.getProgram()).toMatchObject({
      topicId: 't1',
      observedRevision,
    });
    expect(researchService.getLineWorkstreamAlignment('main')).toMatchObject({
      status: 'bound',
      binding: {
        confirmationId: 'confirmation-cold-restore',
        workstream: 'aitp-main',
      },
    });
    expect(researchEvents.at(-1)?.snapshot).toMatchObject({
      mode: 'ready',
      program: { topicId: 't1', observedRevision },
      currentWorkstreamBinding: { status: 'bound' },
    });
    expect(researchEvents.at(-1)?.snapshot?.revision).toBeGreaterThan(persistedResearchRevision);
  });

  it('degrades an active cold restore when fresh unscoped enter fails', async () => {
    seedCurrentConfirmedWorkstream({ lineSlug: 'main', workstream: 'ws-main', topicId: 't1' });
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const checkSpy = vi.spyOn(adapter, 'check');
    vi.spyOn(adapter, 'enter').mockRejectedValue(new Error('enter failed after restore'));
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeService = new AgentAitpModeService(
      wire, makeScopeCtx(), adapter, eventBus, makeProfileServiceStub(), coordinator,
    );

    await expect(wire.restore()).resolves.toBeUndefined();

    expect(modeService.phase).toBe('degraded');
    expect(checkSpy).not.toHaveBeenCalled();
    expect(coordinator.snapshot()).toBeUndefined();
  });

  it('keeps Research Mode active when restore finds an active Plan', async () => {
    wire.dispatch(aitpModeEnter({ actor: 'user' }));
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
    const adapter = makeStubAdapter();
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
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

  it('reconciles the latest Line when it changes while the initial mode probe is pending', async () => {
    const adapter = makeStubAdapter();
    const entered = await adapter.enter();
    let releaseProbe!: (health: AitpAdapterHealth) => void;
    vi.spyOn(adapter, 'probe').mockImplementation(() => new Promise((resolve) => {
      releaseProbe = resolve;
    }));
    const enterSpy = vi.spyOn(adapter, 'enter').mockResolvedValue(entered);
    const modeSvc = await buildRealModeService(adapter);
    const researchSvc = await buildRealResearchService(modeSvc, adapter);

    const entering = modeSvc.enter({ actor: 'user', lineSlug: 'line-a' });
    await vi.waitFor(() => expect(adapter.probe).toHaveBeenCalledOnce());
    researchSvc.createLine({ slug: 'line-b', title: 'Line B' });
    researchSvc.switchLine('line-b');

    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    releaseProbe(adapter.health);
    await entering;

    expect(enterSpy).toHaveBeenCalledWith();
    expect(researchSvc.getSnapshot().currentLineSlug).toBe('line-b');
    expect(researchSvc.getProgram()).toMatchObject({ topicId: 't1' });
    expect(modeSvc.phase).toBe('ready');
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

  it('advances the public revision and enters probing before active undo reconciliation settles', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    let releaseProbe!: (health: AitpAdapterHealth) => void;
    const probe = vi.spyOn(adapter, 'probe').mockImplementation(() => new Promise((resolve) => {
      releaseProbe = resolve;
    }));
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeService = new AgentAitpModeService(
      wire, makeScopeCtx(), adapter, eventBus, makeProfileServiceStub(),
    );
    const researchService = await buildRealResearchService(modeService, adapter);

    wire.dispatch(researchCreateLine({ slug: 'main', title: 'Main', createdAt: 1 }));
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
    wire.dispatch(researchSetProgram({
      topicId: 't1',
      title: 'Test',
      goalText: 'Not established yet',
      goalSource: '.aitp/topic/TOPIC.md',
      establishedAt: 2,
    }));
    wire.dispatch(contextAppendMessage({
      message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
    }));
    researchService.createQuestion({ lineSlug: 'main', wording: 'Abandoned branch question' });
    const abandonedRevision = researchService.getSnapshot().revision;

    wire.dispatch(contextUndo({ count: 1 }));
    eventBus.publish({ type: 'context.undone', turns: 1 });
    await Promise.resolve();

    expect(probe).toHaveBeenCalledOnce();
    expect(modeService.phase).toBe('probing');
    expect(researchService.getSnapshot().revision).toBeGreaterThan(abandonedRevision);
    expect(() => researchService.clearLineWorkstreamBinding({
      lineSlug: 'main',
      expectedRevision: abandonedRevision,
      expectedConfirmationId: 'abandoned-confirmation',
    })).toThrow('Research revision is stale');

    releaseProbe({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    await vi.waitFor(() => expect(modeService.phase).toBe('ready'));
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
    seedCurrentConfirmedWorkstream();
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
    seedCurrentConfirmedWorkstream();
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

  it('blocks Goal completion while an ordinary research action is live', async () => {
    seedCurrentConfirmedWorkstream();
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

    expect(result).toMatchObject({
      allow: false,
      code: 'research.action.live',
      nextStep: 'ConcludeResearchAction',
    });
  });

  it('denies completion for unconfirmed, stale, and conflicting active Goal-to-Program alignment', async () => {
    let currentGoal: GoalSnapshot | null = makeGoalSnapshot('active');
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    wire.dispatch(researchSetProgram({
      topicId: 'topic-1', title: 'Topic', goalText: 'AITP goal', goalSource: 'enter', establishedAt: 1,
    }));
    seedCurrentConfirmedWorkstream({
      topicId: 'topic-1',
      topicTitle: 'Topic',
      goalText: 'AITP goal',
      goalSource: 'enter',
      establishedAt: 1,
      workstream: 'goal-workstream',
    });
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(() => currentGoal),
    );
    const input = { goalId: 'goal-1', objective: 'work', actor: 'model' as const };
    expect(await guardOf(svc)(input)).toMatchObject({ code: 'research.goal-alignment.confirmation_required' });

    const before = svc.getSnapshot();
    svc.confirmGoalAlignment({
      relation: 'unrelated', expectedRevision: before.revision, goalId: 'goal-1', topicId: 'topic-1', observedRevision: 1,
    });
    expect(await guardOf(svc)(input)).toMatchObject({ code: 'research.goal-alignment.conflict' });

    currentGoal = makeGoalSnapshot('active', 3, { goalId: 'goal-2' });
    expect(await guardOf(svc)({ ...input, goalId: 'goal-2' })).toMatchObject({
      code: 'research.goal-alignment.stale',
    });
  });

  it('allows completion when no pending checkpoint', async () => {
    seedCurrentConfirmedWorkstream();

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

  async function buildResearchSandboxHarness(opts?: {
    readonly isActive?: boolean;
    readonly lease?: 'none' | 'interactive_research' | 'autonomous_research';
    readonly phase?: AitpAdapterHealth['phase'];
    readonly loopStatus?: import('#/features/aitpResearch/types').ResearchLoopStatus;
    readonly goal?: GoalSnapshot | null;
    readonly adapter?: ISessionAitpAdapter;
    readonly durableVerifier?: boolean;
  }) {
    const executor = stubToolExecutorEvents();
    const isActive = opts?.isActive ?? true;
    const modeSvc = makeStubModeSvc({
      isActive,
      phase: opts?.phase ?? (isActive ? 'ready' : 'inactive'),
      loopStatus: opts?.loopStatus ?? 'active',
    });
    const lease = opts?.lease ?? 'interactive_research';
    const admission = {
      _serviceBrand: undefined,
      leaseForTurn: (turnId: number) => turnId === 1 ? lease : 'none',
      currentLease: () => lease,
      isTurnAdmitted: (turnId: number) => turnId === 1 && lease !== 'none',
      isCurrentResearchTurn: () => lease !== 'none',
    } as import('#/features/aitpResearch/loop/researchTurnAdmission').IResearchTurnAdmission;
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const adapter = opts?.adapter ?? makeStubAdapter();
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(IWireService, wire);
        reg.defineInstance(IAgentScopeContext, makeScopeCtx());
        reg.defineInstance(IEventBus, eventBus);
        reg.defineInstance(IAgentAitpModeService, modeSvc);
        reg.defineInstance(ISessionAitpAdapter, adapter);
        reg.defineInstance(IAgentToolExecutorService, executor.executor);
        reg.defineInstance(IAgentGoalService, makeStubGoalService(opts?.goal));
        reg.defineInstance(IAitpExternalFactService, createExternalFactFacade(wire));
        reg.defineInstance(IResearchTurnAdmission, admission);
        if (opts?.durableVerifier === true) reg.define(IDurableCommitService, DurableCommitService);
        reg.define(IAgentResearchService, AgentResearchService);
      },
    });
    const svc = ix.get(IAgentResearchService) as AgentResearchService;
    return { executor, modeSvc, svc, adapter, ix };
  }

  async function buildResearchSandboxWithProductionExecutor(phase: AitpAdapterHealth['phase'] = 'ready') {
    const modeSvc = makeStubModeSvc({
      isActive: true,
      phase,
      loopStatus: 'active',
    });
    const admission = {
      _serviceBrand: undefined,
      leaseForTurn: (turnId: number) => turnId === 1 ? 'interactive_research' : 'none',
      currentLease: () => 'interactive_research',
      isTurnAdmitted: (turnId: number) => turnId === 1,
      isCurrentResearchTurn: () => true,
    } as import('#/features/aitpResearch/loop/researchTurnAdmission').IResearchTurnAdmission;
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const adapter = makeStubAdapter();
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(IWireService, wire);
        reg.defineInstance(IAgentScopeContext, makeScopeCtx());
        reg.defineInstance(IEventBus, eventBus);
        reg.defineInstance(IAgentAitpModeService, modeSvc);
        reg.defineInstance(ISessionAitpAdapter, adapter);
        reg.defineInstance(IAgentGoalService, makeStubGoalService());
        reg.defineInstance(IResearchTurnAdmission, admission);
        reg.defineInstance(ITelemetryService, noopTelemetryService);
        reg.defineInstance(ILogService, stubLog());
        reg.definePartialInstance(IAgentToolResultTruncationService, { truncateForModel: async (input) => input.result });
        reg.define(IAgentToolRegistryService, AgentToolRegistryService);
        reg.define(IAgentStateService, AgentStateService);
        reg.define(IAgentToolExecutorService, AgentToolExecutorService);
        reg.define(IAgentResearchService, AgentResearchService);
      },
    });
    return {
      executor: ix.get(IAgentToolExecutorService), registry: ix.get(IAgentToolRegistryService),
      svc: ix.get(IAgentResearchService) as AgentResearchService, adapter, modeSvc,
    };
  }

  async function beginSandboxAction(
    svc: AgentResearchService,
    allowedToolKinds: readonly string[],
  ) {
    svc.createLine({ slug: 'main', title: 'Main' });
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Which bounded test distinguishes the hypotheses?' });
    svc.setFocus(question.id, 'run one discriminating test');
    return svc.planAndStartAction({
      questionId: question.id,
      kind: 'experiment',
      purpose: 'Run one bounded discriminating test.',
      expectedEvidence: ['One attributable observation.'],
      stopCondition: 'The observation is captured or the declared gate fails.',
      allowedToolKinds,
    });
  }

  async function commitReviewCheckpoint(svc: IAgentResearchService) {
    proposeBoundCheckpoint({ checkpointId: 'checkpoint-review', idempotencyKey: 'key-review', createdAt: 10 });
    bindCompleteCheckpointReceipt('checkpoint-review');
    await expect(svc.commitCheckpoint({ checkpointId: 'checkpoint-review', entryId: 'e1' }))
      .resolves.toEqual({ status: 'committed' });
    wire.dispatch(researchRecordDistillationAttention({
      status: 'review_requested', checkpointId: 'checkpoint-review', entryId: 'e1',
      recordedAt: 20, commitRevision: wire.getModel(ResearchCursorModel).revision,
    }));
  }

  it.each([
    { name: 'unverified human suggestion', entryKind: 'observation', authority: 'human', provenance: 'human_assertion' },
    { name: 'checked human workaround', entryKind: 'result', authority: 'agent', provenance: 'agent_verification' },
    { name: 'refuted human conjecture', entryKind: 'result', authority: 'agent', provenance: 'agent_verification' },
    { name: 'one reproducible failure', entryKind: 'failure', authority: 'tool', provenance: 'tool_verification' },
    { name: 'source evidence', entryKind: 'source', authority: 'source', provenance: 'source_assessment' },
    { name: 'explicit human decision', entryKind: 'decision', authority: 'human', provenance: 'human_decision' },
  ] as const)('keeps $name provenance through the durable barrier and hands off only once', async (example) => {
    const adapter = makeStubAdapter({
      show: async ({ id }) => ({
        schema: 'aitp/show-0.1', root: '/workspace', id, status: 'active',
        source: `.aitp/topic/entries/${id}.md`, legacy_derived: false,
        frontmatter: {
          topic: 't1', workstreams: ['aitp-main'], kind: example.entryKind,
          authority: example.authority,
          created_by: example.authority === 'agent' ? 'agent:main' : undefined,
        },
        body: `Fixture: ${example.name}. Attribution and validation are separate.`,
      }),
    });
    adapter._setHealth({ phase: 'ready' });
    const prepareSpy = vi.spyOn(adapter, 'recordPrepare');
    const saveSpy = vi.spyOn(adapter, 'recordSave');
    const noteSpy = vi.spyOn(adapter, 'notePrepare');
    const { svc, modeSvc } = await buildResearchSandboxHarness({ adapter });
    seedCurrentConfirmedWorkstream();
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'What evidence supports or refutes the suggestion?' });
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      lineSlug: 'main', questionId: question.id, kind: 'other',
      purpose: `Inspect one ${example.name} fixture.`,
      stopCondition: 'Attribution and the bounded observation have been captured.',
    });
    const conclusion = svc.concludeAction({
      actionId: action.actionId, status: 'completed',
      progress: {
        headline: `Recorded ${example.name}`,
        motivation: 'Separate attribution from verification.',
        workPerformed: 'Exercised fixture provenance; this is not a real scientific run.',
        result: example.name,
        mainlineImpact: 'Preserve the evidence category without claiming publication or card validation.',
      },
      durability: {
        status: 'durable_delta', entryKind: example.entryKind, authority: example.authority,
        provenance: example.provenance, rationale: 'The fixture records one attributable durable observation.',
      },
    });
    const checkpointId = svc.getPendingCheckpoint()!.checkpointId;
    const handoff = vi.fn(async () => {
      expect(svc.getPendingCheckpoint()).toBeNull();
      expect(svc.getCommittedCursor()?.receipt?.postSaveCheck?.status).toBe('clean');
      return { status: 'unavailable' as const, reason: 'Fixture has no external Skill.' };
    });
    const { IAitpRecordPrepareTool, AitpRecordPrepareTool, IAitpRecordSaveTool, AitpRecordSaveTool } =
      await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(ISessionAitpAdapter, adapter);
        reg.defineInstance(IAgentAitpModeService, modeSvc);
        reg.defineInstance(IAgentResearchService, svc);
        reg.definePartialInstance(IAitpDistillationHandoffService, { prepare: handoff });
        reg.define(IAitpRecordPrepareTool, AitpRecordPrepareTool);
        reg.define(IAitpRecordSaveTool, AitpRecordSaveTool);
        reg.define(ICommitResearchCheckpointTool, CommitResearchCheckpointTool);
      },
    });
    const context = { turnId: 1, toolCallId: 'tc-provenance', signal: new AbortController().signal };
    const commit = async () => runnableExecution(await ix.get(ICommitResearchCheckpointTool).resolveExecution({
      checkpoint_id: checkpointId, entry_id: 'entry-test',
    })).execute(context);
    expect((await commit()).isError).toBe(true);
    expect(handoff).not.toHaveBeenCalled();
    const createdBy = example.authority === 'agent' ? 'agent:main' : undefined;
    const prepared = await runnableExecution(await ix.get(IAitpRecordPrepareTool).resolveExecution({
      kind: example.entryKind, authority: example.authority, created_by: createdBy,
      workstreams: ['aitp-main'], checkpoint_id: checkpointId,
    })).execute(context);
    expect(prepared.isError).toBeFalsy();
    expect(prepareSpy).toHaveBeenCalledWith(expect.objectContaining({
      kind: example.entryKind, authority: example.authority, createdBy,
    }));
    const saved = await runnableExecution(await ix.get(IAitpRecordSaveTool).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md', checkpoint_id: checkpointId,
    })).execute(context);
    expect(saved.isError).toBeFalsy();
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      expectedTopic: 't1', exactWorkstream: 'aitp-main',
    }));
    expect(handoff).not.toHaveBeenCalled();
    expect((await commit()).isError).toBeFalsy();
    expect((await commit()).isError).toBeFalsy();
    expect(handoff).toHaveBeenCalledExactlyOnceWith({ checkpointId, entryId: 'entry-test' });
    expect(svc.getSnapshot().latestProgress).toEqual(conclusion.progress);
    expect(noteSpy).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'decision', authority: 'agent', created_by: 'agent:main' },
    { kind: 'result', authority: 'human', created_by: 'agent:main' },
    { kind: 'result', authority: 'agent', created_by: 'agent:child' },
    { kind: 'result', authority: undefined, created_by: 'agent:main' },
  ].flatMap((frontmatter) => [true, false].map((durableVerifier) => ({ frontmatter, durableVerifier }))))(
    'keeps saved candidate drift pending with durableVerifier=$durableVerifier and $frontmatter',
    async ({ frontmatter, durableVerifier }) => {
      const adapter = makeStubAdapter({
        show: async ({ id }) => ({
          schema: 'aitp/show-0.1', root: '/workspace', id, status: 'active',
          source: `.aitp/topic/entries/entry-${id}.md`, legacy_derived: false,
          frontmatter: { topic: 't1', workstreams: ['aitp-main'], ...frontmatter }, body: '',
        }),
      });
      const { svc } = await buildResearchSandboxHarness({ adapter, durableVerifier });
      seedCurrentConfirmedWorkstream();
      svc.setPhase('gap_analysis');
      const action = svc.planAndStartAction({
        lineSlug: 'main', kind: 'other', purpose: 'Check one attributable fixture result.',
        stopCondition: 'The fixture result has been attributed.',
      });
      svc.concludeAction({
        actionId: action.actionId, status: 'completed',
        progress: {
          headline: 'Fixture result attributed', motivation: 'Test candidate provenance.',
          workPerformed: 'Inspected a fixture.', result: 'One bounded fixture result.',
          mainlineImpact: 'Test only; no physical claim.',
        },
        durability: {
          status: 'durable_delta', entryKind: 'result', authority: 'agent',
          provenance: 'agent_verification', rationale: 'A fixture needs an attributable record.',
        },
      });
      const checkpointId = svc.getPendingCheckpoint()!.checkpointId;
      bindCompleteCheckpointReceipt(checkpointId);
      const receipt = svc.getPendingCheckpoint()!.receipt;
      const save = vi.spyOn(adapter, 'recordSave');
      await expect(svc.commitCheckpoint({ checkpointId, entryId: 'e1' }))
        .rejects.toThrow('does not match the assessed candidate');
      expect(svc.getCommittedCursor()).toBeNull();
      expect(svc.getPendingCheckpoint()).toMatchObject({ checkpointId, committedEntryId: 'e1', receipt });
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('does not let a committed review prepare a Note for a different current Line', async () => {
    const { svc, executor } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    seedCurrentConfirmedWorkstream({ lineSlug: 'other', workstream: 'aitp-other' });
    const result = await executor.fireBeforeExecute(makeToolHookContext('aitp_note_prepare', {
      mode: 'theory', title: 'Method card: old review', created_by: 'agent:main', workstreams: ['aitp-other'],
    }));
    expect(result?.veto?.output).toContain('current post-commit');
  });

  const reviewNoteInput = {
    mode: 'theory' as const,
    title: 'Method card: scoped review',
    createdBy: 'agent:main',
    workstreams: ['aitp-main'],
  };
  const reviewNoteToolArgs = {
    mode: 'theory' as const,
    title: reviewNoteInput.title,
    created_by: reviewNoteInput.createdBy,
    workstreams: reviewNoteInput.workstreams,
  };

  function beginEvidenceNoteAction(svc: AgentResearchService, input?: {
    readonly evidenceRefs?: readonly string[];
    readonly falsifierRefs?: readonly string[];
    readonly allowedToolKinds?: readonly string[];
  }) {
    seedCurrentConfirmedWorkstream();
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'What has the finite-size evidence established, and what remains open?' });
    svc.updateQuestion({
      questionId: question.id, evidenceRefs: input?.evidenceRefs ?? ['e1'], falsifierRefs: input?.falsifierRefs,
    });
    svc.setFocus(question.id, 'Synthesize verified records, without a new scientific claim.');
    return svc.planAndStartAction({
      questionId: question.id, kind: 'other', purpose: 'Write a scoped stage Note from the selected recorded evidence.',
      expectedEvidence: ['An AITP Note with pinned basis refs and explicit unresolved questions.'],
      stopCondition: 'The Note is saved or the selected evidence cannot be verified.',
      allowedToolKinds: input?.allowedToolKinds ?? ['tool:aitp_note_prepare', 'tool:aitp_note_save'],
    });
  }

  it('organizes legacy committed evidence in a fresh bounded Note Action without manufacturing a new Entry', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.2', pluginVersion: '0.9.0' });
    const { svc, executor, modeSvc } = await buildResearchSandboxHarness({ adapter });
    wire.dispatch(researchCommitCheckpoint({ checkpointId: 'legacy-cp', entryId: 'e1', committedAt: 1 }));
    const cursor = svc.getCommittedCursor();
    const action = beginEvidenceNoteAction(svc);
    const shown = vi.spyOn(adapter, 'show');
    const record = vi.spyOn(adapter, 'recordPrepare');
    const tools = await buildNoteTools(adapter, modeSvc, svc);
    const executionContext = { turnId: 1, toolCallId: 'stage-note', signal: new AbortController().signal };
    expect(await executor.fireBeforeExecute(makeToolHookContext('aitp_note_prepare', reviewNoteToolArgs))).toBeUndefined();
    const prepared = await runnableExecution(await tools.prepare.resolveExecution(reviewNoteToolArgs)).execute(executionContext);
    expect(prepared.isError).not.toBe(true);
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
    expect(await executor.fireBeforeExecute(makeToolHookContext('Edit', { path: '.aitp/local/drafts/note-test.md' }))).toBeUndefined();
    const saved = await runnableExecution(await tools.save.resolveExecution({ draft_path: '.aitp/local/drafts/note-test.md' })).execute(executionContext);
    expect(saved.isError).not.toBe(true);
    expect(shown).toHaveBeenCalledTimes(2);
    expect((await executor.fireBeforeExecute(makeToolHookContext('Edit', { path: '.aitp/local/drafts/note-test.md' })))?.veto).toBeDefined();
    expect(svc.getCommittedCursor()).toEqual(cursor);
    expect(svc.getSnapshot().currentAction?.actionId).toBe(action.actionId);
    expect(svc.getSnapshot().pendingCheckpoint).toBeUndefined();
    expect(record).not.toHaveBeenCalled();
  });

  it('requires evidence refs before a fresh Note Action instead of retargeting the captured Question revision', async () => {
    const { svc, adapter, executor } = await buildResearchSandboxHarness();
    const action = beginEvidenceNoteAction(svc, { evidenceRefs: [] });
    const prepare = vi.spyOn(adapter, 'notePrepare');
    const record = vi.spyOn(adapter, 'recordPrepare');
    const denied = await executor.fireBeforeExecute(makeToolHookContext('aitp_note_prepare', reviewNoteToolArgs));
    expect(denied?.veto?.output).toContain('before beginning a fresh Question-bound Note Action');
    svc.updateQuestion({ questionId: action.questionId!, evidenceRefs: ['e1'] });
    expect((await executor.fireBeforeExecute(makeToolHookContext('aitp_note_prepare', reviewNoteToolArgs)))?.veto).toBeDefined();
    expect(prepare).not.toHaveBeenCalled();
    svc.concludeAction({
      actionId: action.actionId, status: 'abandoned',
      progress: {
        headline: 'Rebind synthesis to the selected evidence', motivation: 'Organize existing records.',
        workPerformed: 'Selected the canonical source Entry.', result: 'No Note was prepared.',
        mainlineImpact: 'Scientific evidence remains unchanged.',
      },
      durability: { status: 'no_durable_delta', rationale: 'Only the local evidence selection changed.' },
    });
    svc.planAndStartAction({
      questionId: action.questionId, kind: 'other', purpose: 'Synthesize the selected records.',
      expectedEvidence: ['One scoped working Note.'], stopCondition: 'Save the Note or stop on inconsistent evidence.',
      allowedToolKinds: ['tool:aitp_note_prepare', 'tool:aitp_note_save'],
    });
    expect(await executor.fireBeforeExecute(makeToolHookContext('aitp_note_prepare', reviewNoteToolArgs))).toBeUndefined();
    await expect(svc.prepareReviewNote(reviewNoteInput)).resolves.toMatchObject({ status: 'prepared' });
    expect(prepare).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled();
    expect(svc.getSnapshot().pendingCheckpoint).toBeUndefined();
  });

  it('revalidates source Entries after cold restore instead of restoring old Note draft permission', async () => {
    const records: WireRecord[] = [];
    const openWire = () => {
      eventBus = new EventBusService();
      const ix = disposables.add(new TestInstantiationService());
      return registerTestAgentWire(ix, testWireScope(SCOPE, 'note-recovery'), {
        log: recordingWireLog(records), eventBus,
      });
    };
    wire = openWire();
    const original = await buildResearchSandboxHarness();
    const { svc, adapter } = original;
    beginEvidenceNoteAction(svc);
    const shown = vi.spyOn(adapter, 'show');
    await svc.prepareReviewNote(reviewNoteInput);
    await wire.flush();
    const before = svc.getSnapshot();
    original.ix.dispose();
    wire = openWire();
    const restored = await buildResearchSandboxHarness({ adapter });
    await wire.restore();
    expect(restored.svc.getSnapshot().questions).toEqual(before.questions);
    expect(restored.svc.getSnapshot().currentAction).toEqual(before.currentAction);
    expect((await restored.executor.fireBeforeExecute(makeToolHookContext('Edit', { path: '.aitp/local/drafts/note-test.md' })))?.veto).toBeDefined();
    await expect(restored.svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' })).rejects.toThrow('no current post-commit');
    expect(await restored.executor.fireBeforeExecute(makeToolHookContext('aitp_note_prepare', reviewNoteToolArgs))).toBeUndefined();
    await expect(restored.svc.prepareReviewNote(reviewNoteInput)).resolves.toMatchObject({ status: 'prepared' });
    expect(shown).toHaveBeenCalledTimes(2);
    await expect(restored.svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' })).resolves.toMatchObject({ status: 'saved' });
  });

  it.each([
    { evidenceRefs: [] },
    { allowedToolKinds: ['workspace_write'] },
    { allowedToolKinds: ['tool:aitp_note_prepare'] },
  ])('does not grant Note persistence for an incomplete Action contract: %j', async (input) => {
    const { svc, adapter } = await buildResearchSandboxHarness();
    beginEvidenceNoteAction(svc, input);
    const prepare = vi.spyOn(adapter, 'notePrepare');
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('bounded Note Action');
    expect(prepare).not.toHaveBeenCalled();
  });

  it.each([
    { id: 'different-entry' },
    { status: 'superseded' as const },
    { frontmatter: { topic: 'different-topic', workstreams: ['aitp-main'] } },
    { frontmatter: { topic: 't1', workstreams: ['other-line'] } },
    { frontmatter: { topic: 't1' } },
  ])('rejects unverifiable or out-of-scope Note basis without preparing a draft: %j', async (change) => {
    const { svc, adapter } = await buildResearchSandboxHarness();
    beginEvidenceNoteAction(svc);
    const source = await adapter.show({ id: 'e1' });
    if (source.status === 'malformed') throw new Error('Expected the active source fixture');
    vi.spyOn(adapter, 'show').mockResolvedValue({ ...source, ...change });
    const prepare = vi.spyOn(adapter, 'notePrepare');
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('Note basis Entry e1 is not active');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('checks each selected basis and falsifier once, without scanning unrelated ledger records', async () => {
    const { svc, adapter } = await buildResearchSandboxHarness();
    beginEvidenceNoteAction(svc, { evidenceRefs: ['e1', 'e1'], falsifierRefs: ['counterexample'] });
    const source = await adapter.show({ id: 'e1' });
    const shown = vi.spyOn(adapter, 'show').mockImplementation(async ({ id }) => ({ ...source, id }));
    const list = vi.spyOn(adapter, 'list');
    const check = vi.spyOn(adapter, 'check');
    await svc.prepareReviewNote(reviewNoteInput);
    expect(shown.mock.calls.map(([input]) => input.id)).toEqual(['e1', 'counterexample']);
    expect(list).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  it('does not convert a failed canonical read into Note write permission', async () => {
    const { svc, adapter, executor } = await buildResearchSandboxHarness();
    beginEvidenceNoteAction(svc);
    vi.spyOn(adapter, 'show').mockRejectedValue(new Error('canonical source unavailable'));
    const prepare = vi.spyOn(adapter, 'notePrepare');
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('canonical source unavailable');
    expect(prepare).not.toHaveBeenCalled();
    expect((await executor.fireBeforeExecute(makeToolHookContext('Edit', { path: '.aitp/local/drafts/note-test.md' })))?.veto).toBeDefined();
  });

  it('executes owned Note tools through the production executor but rejects unowned and same-batch writes', async () => {
    const { svc, adapter, modeSvc, executor, registry } = await buildResearchSandboxWithProductionExecutor();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.2', pluginVersion: '0.9.0' });
    const tools = await buildNoteTools(adapter, modeSvc, svc);
    registry.register(tools.prepare);
    registry.register(tools.save);
    const prepare = vi.spyOn(adapter, 'notePrepare');
    const save = vi.spyOn(adapter, 'noteSave');
    const execute = async (calls: { name: string; args: unknown }[]) => {
      const results = [];
      for await (const item of executor.execute(calls.map(({ name, args }, index) => ({
        type: 'function' as const, id: `note-${index}`, name, arguments: JSON.stringify(args),
      })), { turnId: 1, signal: new AbortController().signal })) results.push(item.result);
      return results;
    };
    expect(await execute([{ name: 'aitp_note_prepare', args: reviewNoteToolArgs }]))
      .toEqual([expect.objectContaining({ isError: true })]);
    expect(prepare).not.toHaveBeenCalled();
    beginEvidenceNoteAction(svc);
    await execute([
      { name: 'BeginResearchAction', args: {} },
      { name: 'aitp_note_prepare', args: reviewNoteToolArgs },
    ]);
    expect(prepare).not.toHaveBeenCalled();
    const prepared = await execute([{ name: 'aitp_note_prepare', args: reviewNoteToolArgs }]);
    expect(prepared[0]?.isError).not.toBe(true);
    expect(prepare).toHaveBeenCalledOnce();
    const saved = await execute([{ name: 'aitp_note_save', args: { draft_path: '.aitp/local/drafts/note-test.md' } }]);
    expect(saved[0]?.isError).not.toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });

  it.each(['gate', 'paused', 'degraded', 'concluded'] as const)(
    'revokes a Note Action draft when its execution scope becomes %s', async (change) => {
      const { svc, adapter, modeSvc, executor } = await buildResearchSandboxHarness();
      const action = beginEvidenceNoteAction(svc);
      await svc.prepareReviewNote(reviewNoteInput);
      const save = vi.spyOn(adapter, 'noteSave');
      if (change === 'gate') svc.requestHumanDecision({ kind: 'review', prompt: 'Choose between conflicting interpretations.' });
      if (change === 'paused') modeSvc.loopStatus = 'paused';
      if (change === 'degraded') modeSvc.phase = 'degraded';
      if (change === 'concluded') svc.concludeAction({
        actionId: action.actionId, status: 'abandoned',
        progress: {
          headline: 'Synthesis deferred', motivation: 'Summarize existing evidence.', workPerformed: 'Prepared a draft only.',
          result: 'No Note was saved.', mainlineImpact: 'Canonical evidence is unchanged.',
        },
        durability: { status: 'no_durable_delta', rationale: 'No new scientific finding or saved synthesis.' },
      });
      await expect(svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' })).rejects.toThrow();
      expect(save).not.toHaveBeenCalled();
      expect((await executor.fireBeforeExecute(makeToolHookContext('Edit', { path: '.aitp/local/drafts/note-test.md' })))?.veto).toBeDefined();
    },
  );

  it('rejects Note save when its selected evidence was superseded after prepare', async () => {
    const { svc, adapter } = await buildResearchSandboxHarness();
    beginEvidenceNoteAction(svc);
    await svc.prepareReviewNote(reviewNoteInput);
    const source = await adapter.show({ id: 'e1' });
    if (source.status === 'malformed') throw new Error('Expected the active source fixture');
    vi.spyOn(adapter, 'show').mockResolvedValue({ ...source, status: 'superseded' });
    const save = vi.spyOn(adapter, 'noteSave');
    await expect(svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' })).rejects.toThrow('not active');
    expect(save).not.toHaveBeenCalled();
  });

  it('revokes Note ownership when the source Question changes during canonical inspection', async () => {
    const { svc, adapter, executor } = await buildResearchSandboxHarness();
    const action = beginEvidenceNoteAction(svc);
    const source = await adapter.show({ id: 'e1' });
    vi.spyOn(adapter, 'show').mockImplementation(async () => {
      svc.updateQuestion({ questionId: action.questionId!, assessment: 'The selected scientific interpretation changed.' });
      return source;
    });
    const prepare = vi.spyOn(adapter, 'notePrepare');
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('scope changed');
    expect(prepare).not.toHaveBeenCalled();
    expect((await executor.fireBeforeExecute(makeToolHookContext('Edit', { path: '.aitp/local/drafts/note-test.md' })))?.veto).toBeDefined();
  });

  it('does not infer Note ownership from a restored cursor and review marker', async () => {
    const { svc, adapter } = await buildResearchSandboxHarness();
    seedCurrentConfirmedWorkstream();
    wire.dispatch(researchCommitCheckpoint({ checkpointId: 'restored', entryId: 'e1', committedAt: 1 }));
    wire.dispatch(researchRecordDistillationAttention({
      status: 'review_requested', checkpointId: 'restored', entryId: 'e1', recordedAt: 2, commitRevision: 1,
    }));
    const prepare = vi.spyOn(adapter, 'notePrepare');
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('no current post-commit');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('does not resurrect a Note review after switching away and back to its original Line', async () => {
    const { svc, executor } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    await svc.prepareReviewNote(reviewNoteInput);
    svc.createLine({ slug: 'other', title: 'Other question' });
    svc.switchLine('other');
    svc.switchLine('main');
    const edit = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-test.md',
    }));
    expect(edit?.veto?.output).toContain('not owned');
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('no current post-commit');
  });

  it('revokes a Note draft on conversation undo without relying on a restore callback', async () => {
    const { svc, executor } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    await svc.prepareReviewNote(reviewNoteInput);
    eventBus.publish({ type: 'context.undone', turns: 1 });
    const edit = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-test.md',
    }));
    expect(edit?.veto?.output).toContain('not owned');
    await expect(svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' }))
      .rejects.toThrow('no current post-commit');
  });

  it('revokes a Note review when the same Line is explicitly rebound, even to the same workstream', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.2', pluginVersion: '0.9.0' });
    const { svc } = await buildResearchSandboxHarness({ adapter });
    await commitReviewCheckpoint(svc);
    const original = svc.getCurrentWorkstreamAlignment()!.binding!;
    svc.clearLineWorkstreamBinding({
      lineSlug: 'main', expectedRevision: svc.getSnapshot().revision, expectedConfirmationId: original.confirmationId,
    });
    const rebound = await svc.confirmLineWorkstreamBinding({
      lineSlug: 'main', workstream: original.workstream, expectedRevision: svc.getSnapshot().revision, confirmedBy: 'user',
    });
    expect(rebound.confirmationId).not.toBe(original.confirmationId);
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('no current post-commit');
  });

  it('does not resurrect Note review permission after a degraded-to-ready transition', async () => {
    const { svc, modeSvc } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    modeSvc.phase = 'degraded';
    eventBus.publish({ type: 'aitp_mode.updated' });
    modeSvc.phase = 'ready';
    eventBus.publish({ type: 'aitp_mode.updated' });
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('no current post-commit');
  });

  it('revokes a prepared Note when a different checkpoint becomes the committed cursor', async () => {
    const { svc, executor } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    await svc.prepareReviewNote(reviewNoteInput);
    wire.dispatch(researchCommitCheckpoint({ checkpointId: 'new-cursor', entryId: 'e2', committedAt: 40 }));
    const edit = await executor.fireBeforeExecute(makeToolHookContext('Edit', { path: '.aitp/local/drafts/note-test.md' }));
    expect(edit?.veto?.output).toContain('not owned');
  });

  it('does not retain a Note draft when a cancelled prepare still reports success', async () => {
    const { svc, adapter, executor } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    const controller = new AbortController();
    const prepared = await adapter.notePrepare(reviewNoteInput);
    vi.spyOn(adapter, 'notePrepare').mockImplementation(async () => {
      controller.abort();
      return prepared;
    });
    await expect(svc.prepareReviewNote({ ...reviewNoteInput, signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    const edit = await executor.fireBeforeExecute(makeToolHookContext('Edit', { path: prepared.path }));
    expect(edit?.veto?.output).toContain('not owned');
  });

  it.each(['prepare', 'save'] as const)('rechecks Note %s ownership at actual execution after an allowed preflight', async (operation) => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.2', pluginVersion: '0.9.0' });
    const { svc, executor, modeSvc } = await buildResearchSandboxHarness({ adapter });
    await commitReviewCheckpoint(svc);
    if (operation === 'save') await svc.prepareReviewNote(reviewNoteInput);
    const tools = await buildNoteTools(adapter, modeSvc, svc);
    const args = operation === 'prepare' ? reviewNoteToolArgs : { draft_path: '.aitp/local/drafts/note-test.md' };
    expect(await executor.fireBeforeExecute(makeToolHookContext(`aitp_note_${operation}`, args))).toBeUndefined();
    const execution = operation === 'prepare'
      ? tools.prepare.resolveExecution(reviewNoteToolArgs)
      : tools.save.resolveExecution({ draft_path: '.aitp/local/drafts/note-test.md' });
    svc.createLine({ slug: 'other', title: 'Other question' });
    svc.switchLine('other');
    const prepare = vi.spyOn(adapter, 'notePrepare');
    const save = vi.spyOn(adapter, 'noteSave');
    const result = await runnableExecution(await execution).execute({
      signal: new AbortController().signal, turnId: 1, toolCallId: 'queued-note',
    });
    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('no current post-commit');
    expect(prepare).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('executes Note tools for the unchanged post-commit scope without creating another Action', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.2', pluginVersion: '0.9.0' });
    const { svc, executor, modeSvc } = await buildResearchSandboxHarness({ adapter });
    await commitReviewCheckpoint(svc);
    const tools = await buildNoteTools(adapter, modeSvc, svc);
    const prepare = vi.spyOn(adapter, 'notePrepare');
    const save = vi.spyOn(adapter, 'noteSave');
    const executionContext = { turnId: 1, toolCallId: 'review-note', signal: new AbortController().signal };
    const prepared = await runnableExecution(await tools.prepare.resolveExecution(reviewNoteToolArgs)).execute(executionContext);
    expect(prepared.isError).not.toBe(true);
    expect(JSON.parse(prepared.output as string)).toMatchObject({ status: 'prepared', path: '.aitp/local/drafts/note-test.md' });
    expect(await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-test.md',
    }))).toBeUndefined();
    const saved = await runnableExecution(await tools.save.resolveExecution({
      draft_path: '.aitp/local/drafts/note-test.md',
    })).execute(executionContext);
    expect(saved.isError).not.toBe(true);
    expect(JSON.parse(saved.output as string)).toMatchObject({ status: 'saved' });
    expect(prepare).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(wire.getModel(ResearchModel).current.currentAction).toBeNull();
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint).toBeNull();
  });

  it('rejects a freshly observed Topic mismatch before Note I/O', async () => {
    const { svc, modeSvc, adapter } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    const original = svc.getCurrentWorkstreamAlignment()!.binding!;
    modeSvc.reconcileCurrentTopicBinding = vi.fn(async () => ({ ...original, topicId: 'different-topic' }));
    const prepare = vi.spyOn(adapter, 'notePrepare');
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('scope changed before AITP Note I/O');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('does not grant a draft lease from a Note prepare that returns after undo', async () => {
    const { svc, adapter, executor } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    let release!: (value: AitpNotePrepareResult) => void;
    const prepare = vi.spyOn(adapter, 'notePrepare').mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const operation = svc.prepareReviewNote(reviewNoteInput);
    const result = expect(operation).rejects.toThrow('No draft permission remains and no rollback is claimed');
    await vi.waitFor(() => { expect(prepare).toHaveBeenCalledOnce(); });
    eventBus.publish({ type: 'context.undone', turns: 1 });
    release({ status: 'prepared', id: 'note-late', path: '.aitp/local/drafts/note-late.md', save_command: 'aitp note save .aitp/local/drafts/note-late.md' });
    await result;
    const edit = await executor.fireBeforeExecute(makeToolHookContext('Edit', { path: '.aitp/local/drafts/note-late.md' }));
    expect(edit?.veto?.output).toContain('not owned');
  });

  it('serializes Note persistence with local Line changes but permits them after I/O finishes', async () => {
    const { svc, adapter } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    svc.createLine({ slug: 'other', title: 'Other' });
    let release!: (value: AitpNotePrepareResult) => void;
    const prepare = vi.spyOn(adapter, 'notePrepare').mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const operation = svc.prepareReviewNote(reviewNoteInput);
    await vi.waitFor(() => { expect(prepare).toHaveBeenCalledOnce(); });
    expect(() => { svc.switchLine('other'); }).toThrow('persistence operation is in flight');
    expect(() => {
      svc.clearLineWorkstreamBinding({
        lineSlug: 'main', expectedRevision: svc.getSnapshot().revision,
        expectedConfirmationId: svc.getCurrentWorkstreamAlignment()!.binding!.confirmationId,
      });
    }).toThrow('persistence operation is in flight');
    await expect(svc.prepareReviewNote(reviewNoteInput)).rejects.toThrow('another Note persistence operation is in flight');
    release({ status: 'prepared', id: 'note-test', path: '.aitp/local/drafts/note-test.md', save_command: 'aitp note save .aitp/local/drafts/note-test.md' });
    await operation;
    expect(() => { svc.switchLine('other'); }).not.toThrow();
  });

  it('retains a failed Note save for an exact retry in the unchanged scope', async () => {
    const { svc, adapter, executor } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    await svc.prepareReviewNote(reviewNoteInput);
    const save = vi.spyOn(adapter, 'noteSave').mockRejectedValueOnce(new Error('validation failed'));
    await expect(svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' })).rejects.toThrow('validation failed');
    expect(await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-test.md',
    }))).toBeUndefined();
    await expect(svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' })).resolves.toMatchObject({ status: 'saved' });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('reports a late Note save honestly without restoring its write permission', async () => {
    const { svc, adapter } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    await svc.prepareReviewNote(reviewNoteInput);
    let release!: (value: AitpNoteSaveResult) => void;
    const save = vi.spyOn(adapter, 'noteSave').mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const operation = svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' });
    const result = expect(operation).rejects.toThrow('"status":"saved","path":".aitp/topic/notes/note-test.md"');
    await vi.waitFor(() => { expect(save).toHaveBeenCalledOnce(); });
    eventBus.publish({ type: 'context.undone', turns: 1 });
    release({ status: 'saved', path: '.aitp/topic/notes/note-test.md' });
    await result;
    await expect(svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' })).rejects.toThrow('no current post-commit');
    expect(save).toHaveBeenCalledOnce();
  });

  it('hard-vetoes WebSearch through the executor when no ResearchAction owns it', async () => {
    const { executor } = await buildResearchSandboxHarness();

    const decision = await executor.fireBeforeExecute(makeToolHookContext('WebSearch', { query: 'test' }));

    expect(decision?.veto).toMatchObject({ isError: true });
    expect(decision?.veto?.output).toContain('no in-progress ResearchAction');
  });

  it('executes retained run observation through the executor without restoring closed-action work permissions', async () => {
    const { svc, modeSvc, executor, registry } = await buildResearchSandboxWithProductionExecutor();
    const action = svc.planAndStartAction({
      kind: 'simulation', purpose: 'Inspect an external fixture job.',
      stopCondition: 'One inspection.', allowedToolKinds: ['shell'],
    });
    svc.observeRun({
      actionId: action.actionId, expectedRevision: svc.getSnapshot().revision,
      campaign: 'fixture-campaign', jobId: 'fixture-job', stage: 'running', schedulerState: 'running',
    });
    svc.concludeAction({
      actionId: action.actionId, status: 'completed',
      progress: {
        headline: 'Inspection ended', motivation: 'Inspect a long-lived job.',
        workPerformed: 'Read one existing observation.', result: 'The job is still running.',
        mainlineImpact: 'Retain its identity, not an execution permission.',
      },
      durability: { status: 'no_durable_delta', rationale: 'No new scientific evidence.' },
    });
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(IAgentResearchService, svc);
        reg.defineInstance(IAgentAitpModeService, modeSvc);
        reg.define(IObserveResearchRunTool, ObserveResearchRunTool);
      },
    });
    registry.register(ix.get(IObserveResearchRunTool));
    const shell = vi.fn(async () => ({ output: 'Must not execute.' }));
    registry.register({
      name: 'Bash', description: 'Count executions.', parameters: { type: 'object' },
      resolveExecution: () => ({ approvalRule: 'Bash', accesses: ToolAccesses.all(), execute: shell }),
    });
    const results = [];
    for await (const result of executor.execute([
      { type: 'function', id: 'retained-observation', name: 'ObserveResearchRun', arguments: JSON.stringify({
        action_id: action.actionId, expected_revision: svc.getSnapshot().revision,
        campaign: 'fixture-campaign', job_id: 'fixture-job', stage: 'completed',
        scheduler_state: 'completed', terminal_state: 'completed', artifact_refs: [],
      }) },
      { type: 'function', id: 'closed-action-shell', name: 'Bash', arguments: '{}' },
    ], { turnId: 1, signal: new AbortController().signal })) results.push(result.result);
    expect(results.filter((result) => result.isError !== true)).toHaveLength(1);
    expect(svc.getSnapshot().currentRun?.terminalState).toBe('completed');
    expect(svc.getSnapshot().currentAction?.status).toBe('completed');
    expect(shell).not.toHaveBeenCalled();
  });

  it('executes narrow recorded-knowledge inspection but prevents unowned web, workspace, and shell callbacks', async () => {
    const { executor, registry } = await buildResearchSandboxWithProductionExecutor();
    const calls: string[] = [];
    for (const name of ['WebSearch', 'Read', 'Bash', 'Grep', 'Edit', 'Write']) {
      const tool: ExecutableTool<Record<string, unknown>> = {
        name,
        description: `Count executions of ${name}.`,
        parameters: { type: 'object', additionalProperties: true },
        resolveExecution: () => ({
          approvalRule: name,
          accesses: ToolAccesses.all(),
          execute: async () => {
            calls.push(name);
            return { output: `${name} executed` };
          },
        }),
      };
      registry.register(tool);
    }

    const results = [];
    for await (const result of executor.execute(
      ['WebSearch', 'Read', 'Bash'].map((name, index) => ({
        type: 'function' as const,
        id: `unowned-${index}`,
        name,
        arguments: '{}',
      })),
      { turnId: 1, signal: new AbortController().signal },
    )) {
      results.push(result.result);
    }

    expect(calls).toEqual([]);
    expect(results).toHaveLength(3);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ isError: true, output: expect.stringContaining('no in-progress ResearchAction') }),
    ]));

    const inspectionResults = [];
    const inspectionCalls = [
      { name: 'Read', args: { path: '.aitp/topic/notes/note-card.md' } },
      { name: 'Grep', args: { path: '.aitp/topic/', pattern: '^> method-card:' } },
      { name: 'Read', args: { path: 'new-results.dat' } },
      { name: 'Read', args: { path: '/other/.aitp/topic/notes/note-card.md' } },
      { name: 'Grep', args: { path: '.aitp/topic/', pattern: '.*' } },
      { name: 'Edit', args: { path: '.aitp/topic/notes/note-card.md' } },
      { name: 'Write', args: { path: '.aitp/topic/notes/note-card.md' } },
    ];
    for await (const result of executor.execute(
      inspectionCalls.map(({ name, args }, index) => ({
        type: 'function' as const,
        id: `inspection-${index}`,
        name,
        arguments: JSON.stringify(args),
      })),
      { turnId: 1, signal: new AbortController().signal },
    )) {
      inspectionResults.push(result.result);
    }
    expect(calls.toSorted()).toEqual(['Grep', 'Read']);
    expect(inspectionResults.filter((result) => result.isError !== true)).toHaveLength(2);
    expect(inspectionResults.filter((result) => result.isError === true)).toHaveLength(5);
  });

  it('recovers the exported stale-checkpoint and human-gate shape before denying unowned web work', async () => {
    const { executor, svc } = await buildResearchSandboxHarness();
    svc.createLine({ slug: 'main', title: 'Main' });
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    const question = svc.createQuestion({
      lineSlug: 'main',
      wording: 'Which bounded test distinguishes the physical explanations?',
    });
    svc.setFocus(question.id, 'run one discriminating test');
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      questionId: question.id,
      kind: 'experiment',
      purpose: 'Run one bounded discriminating test.',
      expectedEvidence: ['One attributable observation.'],
      stopCondition: 'The observation is captured or the declared gate fails.',
      allowedToolKinds: ['web_search'],
    });
    svc.completeAction(action.actionId, 'completed');
    svc.recordProgress({
      headline: 'The bounded action reached evaluation.',
      motivation: 'Preserve the real export recovery shape.',
      workPerformed: 'The previous action completed before checkpoint persistence.',
      result: 'A checkpoint proposal remained local.',
      mainlineImpact: 'The next turn must reconcile ownership before new research work.',
      uncertainties: [],
      phaseChange: { from: 'evaluating', to: 'state_updated' },
    });

    // The three user exports captured a revision-4 proposal beside revision 7,
    // no receipt/history, an unresolved Question-bound gate, and a completed
    // action. Dispatch the old journal shape without invoking live service
    // boundaries, then let the normal turn-boundary reconciliation repair it.
    svc.updateQuestion({ questionId: question.id, assessment: 'Revision two.' });
    svc.updateQuestion({ questionId: question.id, assessment: 'Revision three.' });
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'checkpoint-exported-stale',
      questionId: question.id,
      lineSlug: 'main',
      idempotencyKey: 'checkpoint-exported-stale-key',
      createdAt: 10,
    }));
    for (const assessment of ['Revision five.', 'Revision six.', 'Revision seven.']) {
      const current = wire.getModel(ResearchModel).current.questions[question.id]!;
      wire.dispatch(researchUpdateQuestion({
        questionId: question.id,
        expectedRevision: current.revision,
        assessment,
        actor: 'model',
      }));
    }
    wire.dispatch(researchRequestHumanDecision({
      gateId: 'gate-exported-unresolved',
      kind: 'decision',
      questionId: question.id,
      prompt: 'Choose the next bounded scientific direction.',
      createdAt: 11,
    }));
    const restored = wire.getModel(ResearchModel).current as unknown as {
      phase: 'state_updated';
    };
    restored.phase = 'state_updated';

    expect(wire.getModel(ResearchModel).current).toMatchObject({
      phase: 'state_updated',
      pendingCheckpoint: {
        checkpointId: 'checkpoint-exported-stale',
        questionRevision: 4,
      },
      questions: { [question.id]: { revision: 7 } },
      currentAction: { actionId: action.actionId, status: 'completed' },
      humanGate: { gateId: 'gate-exported-unresolved' },
    });
    expect(wire.getModel(ResearchModel).current.pendingCheckpoint?.receipt).toBeUndefined();
    expect(wire.getModel(ResearchModel).current.humanGate?.resolvedAt).toBeUndefined();

    svc.noteLoopBoundary();

    expect(svc.getSnapshot()).toMatchObject({
      phase: 'awaiting_human',
      currentAction: { actionId: action.actionId, status: 'completed' },
      humanGate: { gateId: 'gate-exported-unresolved', resolvedAt: undefined },
    });
    expect(svc.getPendingCheckpoint()).toBeNull();
    svc.resolveHumanDecision({
      gateId: 'gate-exported-unresolved',
      resolution: 'Return to bounded gap analysis.',
      nextPhase: 'gap_analysis',
    });

    const decision = await executor.fireBeforeExecute(makeToolHookContext(
      'WebSearch',
      { query: 'continue without a new action' },
    ));
    expect(decision?.veto).toMatchObject({ isError: true });
    expect(decision?.veto?.output).toContain('no in-progress ResearchAction');
  });

  it('keeps the executor action policy inert while Research Mode is inactive', async () => {
    const { executor } = await buildResearchSandboxHarness({ isActive: false });

    const decision = await executor.fireBeforeExecute(makeToolHookContext('WebSearch', { query: 'test' }));

    expect(decision).toBeUndefined();
  });

  it('does not let a held Goal continuation bypass action ownership with generic tools', async () => {
    const { executor, svc } = await buildResearchSandboxHarness({
      goal: makeGoalSnapshot('active'),
      lease: 'autonomous_research',
    });
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'checkpoint-holds-goal',
      idempotencyKey: 'checkpoint-holds-goal-key',
      createdAt: 12,
    }));

    const continuation = await decideOf(svc)({
      goalId: 'goal-1',
      objective: 'Test goal',
      turnsUsed: 1,
    });
    const decision = await executor.fireBeforeExecute(makeToolHookContext(
      'Read',
      { path: '/workspace/new-research-input.dat' },
    ));

    expect(continuation).toMatchObject({
      decision: 'hold',
      reason: expect.stringContaining('checkpoint is pending commit'),
    });
    expect(decision?.veto?.output).toContain('no in-progress ResearchAction');
  });

  it('denies BeginResearchAction and research work in the same tool batch', async () => {
    const { executor } = await buildResearchSandboxHarness();

    const decision = await executor.fireBeforeExecute(makeToolHookContext(
      'WebSearch',
      { query: 'test' },
      ['BeginResearchAction', 'WebSearch'],
    ));

    expect(decision?.veto).toMatchObject({ isError: true });
    expect(decision?.veto?.output).toContain('cannot share one tool batch');
  });

  it('allows only capabilities granted by the live bounded action', async () => {
    const { executor, svc } = await buildResearchSandboxHarness();
    await beginSandboxAction(svc, ['web_search', 'tool:mcp__papers__lookup']);

    const search = await executor.fireBeforeExecute(makeToolHookContext('WebSearch', { query: 'test' }));
    const fetch = await executor.fireBeforeExecute(makeToolHookContext('FetchURL', { url: 'https://example.test' }));
    const exactMcp = await executor.fireBeforeExecute(makeToolHookContext('mcp__papers__lookup', { id: 'paper' }));
    const unknownMcp = await executor.fireBeforeExecute(makeToolHookContext('mcp__compute__submit', { job: 'x' }));

    expect(search).toBeUndefined();
    expect(exactMcp).toBeUndefined();
    expect(fetch?.veto?.output).toContain('does not grant capability web_fetch');
    expect(unknownMcp?.veto?.output).toContain('tool:mcp__compute__submit');
  });

  it('revokes action work while a scientific human gate is unresolved', async () => {
    const { executor, svc } = await buildResearchSandboxHarness();
    const action = await beginSandboxAction(svc, ['web_search']);
    const gate = svc.requestHumanDecision({
      kind: 'decision',
      actionId: action.actionId,
      questionId: action.questionId,
      prompt: 'Choose which physical convention the next calculation must use.',
    });

    const decision = await executor.fireBeforeExecute(makeToolHookContext(
      'WebSearch',
      { query: 'continue while the convention is undecided' },
    ));

    expect(decision?.veto?.output).toContain(`human gate ${gate.gateId} is unresolved`);
  });

  it('revokes a live action capability when its captured Question revision changes', async () => {
    const { executor, svc } = await buildResearchSandboxHarness();
    const action = await beginSandboxAction(svc, ['workspace_read']);
    const question = svc.getQuestions().find((candidate) => candidate.id === action.questionId)!;
    svc.updateQuestion({
      questionId: question.id,
      expectedRevision: question.revision,
      assessment: 'New evidence changed the question context.',
    });

    const decision = await executor.fireBeforeExecute(makeToolHookContext('Read', {
      path: '/workspace/result.dat',
    }));

    expect(decision?.veto?.output).toContain('cannot prove a fresh Research Question revision');
  });

  it.each([
    { label: 'no Research turn lease', opts: { lease: 'none' as const }, message: 'no Research lease' },
    { label: 'paused Research Loop', opts: { loopStatus: 'paused' as const }, message: 'Research Loop is paused' },
    { label: 'degraded AITP mode without an Action', opts: { phase: 'degraded' as const }, message: 'no in-progress ResearchAction' },
  ])('revokes action work for $label', async ({ opts, message }) => {
    const { executor } = await buildResearchSandboxHarness(opts);

    const decision = await executor.fireBeforeExecute(makeToolHookContext('Read', { path: '/workspace/result.dat' }));

    expect(decision?.veto?.output).toContain(message);
    const noteRead = await executor.fireBeforeExecute(makeToolHookContext('Read', {
      path: '.aitp/topic/notes/note-card.md',
    }));
    const markerLookup = await executor.fireBeforeExecute(makeToolHookContext('Grep', {
      path: '.aitp/topic/', pattern: '^> method-card:',
    }));
    if (opts.phase === 'degraded') {
      expect(noteRead?.veto?.output).toContain('AITP Research Mode is degraded');
      expect(markerLookup?.veto?.output).toContain('no in-progress ResearchAction');
    } else {
      expect(noteRead).toBeUndefined();
      expect(markerLookup).toBeUndefined();
    }
  });

  it('never treats direct canonical AITP file access as action work', async () => {
    const { executor, svc } = await buildResearchSandboxHarness();
    await beginSandboxAction(svc, ['workspace_read']);

    const decision = await executor.fireBeforeExecute(makeToolHookContext('Read', {
      path: '/workspace/.aitp/topic/entries/entry-test.md',
    }));

    expect(decision?.veto?.output).toContain('canonical AITP files must be accessed through AITP tools');

    const traversal = await executor.fireBeforeExecute(makeToolHookContext('Read', {
      path: '.aitp/local/../topic/entries/entry-test.md',
    }));
    expect(traversal?.veto?.output).toContain('canonical AITP files must be accessed through AITP tools');
    const noteRead = await executor.fireBeforeExecute(makeToolHookContext('Read', {
      path: '.aitp/topic/notes/note-card.md',
    }));
    expect(noteRead).toBeUndefined();
  });

  it('allows bounded interactive exploration while AITP is degraded without allowing persistence', async () => {
    const { svc, executor, adapter } = await buildResearchSandboxHarness({ phase: 'degraded' });
    const action = await beginSandboxAction(svc, ['workspace_read', 'workspace_write', 'web_search', 'web_fetch', 'shell']);
    const prepare = vi.spyOn(adapter, 'recordPrepare');
    const save = vi.spyOn(adapter, 'recordSave');
    for (const [name, args] of [
      ['Read', { path: 'analysis/hamiltonian.py' }],
      ['Grep', { path: 'analysis', pattern: 'commutator' }],
      ['WebSearch', { query: 'finite spin chain conserved charge' }],
      ['FetchURL', { url: 'https://example.com/paper' }],
      ['Write', { path: 'scratch/derivation.md', content: 'Provisional derivation' }],
      ['Bash', { command: 'python analysis/small_chain.py' }],
    ] as const) {
      expect(await executor.fireBeforeExecute(makeToolHookContext(name, args))).toBeUndefined();
    }
    for (const [name, args] of [
      ['aitp_record_prepare', { kind: 'result' }],
      ['aitp_record_save', { draft_path: '.aitp/local/drafts/entry-test.md' }],
      ['aitp_note_prepare', { mode: 'theory', title: 'Note', created_by: 'agent:main' }],
      ['aitp_note_save', { draft_path: '.aitp/local/drafts/note-test.md' }],
      ['CommitResearchCheckpoint', { checkpoint_id: 'pending', entry_id: 'e1' }],
      ['Write', { path: '.aitp/topic/entries/entry-forged.md', content: 'result' }],
    ] as const) {
      const denied = await executor.fireBeforeExecute(makeToolHookContext(name, args));
      expect(denied?.veto?.output).toContain('degraded');
    }
    expect(svc.getSnapshot()).toMatchObject({ mode: 'degraded', currentAction: { actionId: action.actionId, status: 'in_progress' } });
    expect(prepare).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('holds already-admitted autonomous work when AITP degrades during the turn', async () => {
    const { svc, executor, modeSvc } = await buildResearchSandboxHarness({ lease: 'autonomous_research' });
    await beginSandboxAction(svc, ['web_search']);
    const context = makeToolHookContext('WebSearch', { query: 'finite spin chain' });
    expect(await executor.fireBeforeExecute(context)).toBeUndefined();
    modeSvc.phase = 'degraded';
    expect((await executor.fireBeforeExecute(context))?.veto?.output).toContain('Automatic Goal work is held');
  });

  it('executes only Action-owned provisional callbacks through the production executor', async () => {
    const { svc, executor, registry } = await buildResearchSandboxWithProductionExecutor('degraded');
    const search = vi.fn(async () => ({ output: 'One candidate source found.' }));
    const save = vi.fn(async () => ({ output: 'This must never execute.' }));
    for (const [name, execute] of [['WebSearch', search], ['aitp_record_save', save]] as const) {
      registry.register({
        name, description: name, parameters: { type: 'object' },
        resolveExecution: () => ({ approvalRule: name, accesses: ToolAccesses.all(), execute }),
      });
    }
    const executeBatch = async (id: string) => {
      const results = [];
      for await (const result of executor.execute(
        ['WebSearch', 'aitp_record_save'].map((name) => ({ type: 'function' as const, id: `${id}-${name}`, name, arguments: '{}' })),
        { turnId: 1, signal: new AbortController().signal },
      )) results.push(result.result);
      return results;
    };
    expect(await executeBatch('unowned')).toEqual([
      expect.objectContaining({ isError: true }), expect.objectContaining({ isError: true }),
    ]);
    expect(search).not.toHaveBeenCalled();
    await beginSandboxAction(svc, ['web_search']);
    const results = await executeBatch('owned');
    expect(results.filter((result) => result.isError !== true)).toHaveLength(1);
    expect(search).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it('still enforces action permissions and freshness during degraded exploration', async () => {
    const { svc, executor } = await buildResearchSandboxHarness({ phase: 'degraded' });
    const action = await beginSandboxAction(svc, ['workspace_read']);
    expect((await executor.fireBeforeExecute(makeToolHookContext('WebSearch', { query: 'new work' })))?.veto?.output)
      .toContain('does not grant capability web_search');
    const question = svc.getQuestions().find((candidate) => candidate.id === action.questionId)!;
    svc.updateQuestion({ questionId: question.id, expectedRevision: question.revision, assessment: 'The candidate changed.' });
    expect((await executor.fireBeforeExecute(makeToolHookContext('Read', { path: 'analysis/result.dat' })))?.veto?.output)
      .toContain('cannot prove a fresh Research Question revision');
  });

  it.each(['no_durable_delta', 'durable_delta'] as const)(
    'retains a degraded interactive conclusion as %s without canonical writes', async (durabilityStatus) => {
      const { svc, executor, adapter, modeSvc } = await buildResearchSandboxHarness({ phase: 'degraded' });
      seedCurrentConfirmedWorkstream();
      const question = svc.createQuestion({ lineSlug: 'main', wording: 'Does the finite-size check reproduce the observation?' });
      const action = svc.planAndStartAction({
        questionId: question.id, lineSlug: 'main', kind: 'experiment',
        purpose: 'Run one bounded check.', expectedEvidence: ['One measured residual'],
        stopCondition: 'The residual is measured or the calculation fails.', allowedToolKinds: ['shell'],
      });
      const prepare = vi.spyOn(adapter, 'recordPrepare');
      const save = vi.spyOn(adapter, 'recordSave');
      const input = {
        actionId: action.actionId, status: 'completed' as const,
        progress: {
          headline: 'Bounded check evaluated', motivation: 'Distinguish the candidate from the benchmark.',
          workPerformed: 'Evaluated the finite-size residual.', result: 'The residual rejects this candidate.',
          mainlineImpact: 'Revise the candidate, without a general no-go claim.', nextAction: 'Review the finite-size limitation.',
          detail: { observations: ['Finite-size residual exceeds the declared tolerance.'] },
        },
        durability: durabilityStatus === 'no_durable_delta'
          ? { status: 'no_durable_delta' as const, rationale: 'This reproduces the already recorded check.' }
          : { status: 'durable_delta' as const, entryKind: 'failure' as const, authority: 'agent' as const,
            provenance: 'agent_verification' as const, rationale: 'This new counterexample changes the candidate assessment.' },
      };
      const conclusion = svc.concludeAction(input);
      const after = svc.getSnapshot();
      expect(after.currentAction?.status).toBe('completed');
      expect(after.latestProgress?.result).toBe(input.progress.result);
      expect(svc.concludeAction(input)).toEqual(conclusion);
      expect(svc.getSnapshot()).toEqual(after);
      if (durabilityStatus === 'durable_delta') {
        expect(after.pendingCheckpoint?.commitCandidate).toMatchObject({ entryKind: 'failure', sourceActionId: action.actionId });
        const context = makeToolHookContext('aitp_record_prepare', {
          checkpoint_id: after.pendingCheckpoint!.checkpointId, kind: 'failure', created_by: 'agent:main', workstreams: ['aitp-main'],
        });
        expect((await executor.fireBeforeExecute(context))?.veto?.output).toContain('degraded');
        modeSvc.phase = 'ready';
        expect(await executor.fireBeforeExecute(context)).toBeUndefined();
        expect(svc.getSnapshot().pendingCheckpoint?.checkpointId).toBe(after.pendingCheckpoint!.checkpointId);
      } else {
        expect(after.pendingCheckpoint).toBeUndefined();
      }
      expect(prepare).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('retains an unbound durable conclusion locally and closes its Action without an AITP checkpoint', async () => {
    const { svc } = await buildResearchSandboxHarness({ phase: 'degraded' });
    const action = await beginSandboxAction(svc, ['shell']);
    const input: ConcludeResearchActionInput = {
      actionId: action.actionId, status: 'completed',
      progress: {
        headline: 'New counterexample', motivation: 'Check the conjecture.', workPerformed: 'Measured a residual.',
        result: 'The candidate fails.', mainlineImpact: 'Revise this candidate.', nextAction: 'Confirm record ownership.',
      },
      durability: { status: 'durable_delta', entryKind: 'failure', authority: 'agent', provenance: 'agent_verification', rationale: 'New evidence.' },
    };
    const conclusion = svc.concludeAction(input);
    const after = svc.getSnapshot();
    expect(after.currentAction?.status).toBe('completed');
    expect(after.phase).toBe('state_updated');
    expect(after.latestProgress?.result).toBe('The candidate fails.');
    expect(after.localConclusion?.candidate).toMatchObject({ sourceActionId: action.actionId, entryKind: 'failure' });
    expect(after.localConclusion?.progress).toEqual(after.latestProgress);
    expect(after.pendingCheckpoint).toBeUndefined();
    expect(conclusion.commitCandidate).toBeUndefined();
    expect(conclusion.localConclusion).toEqual(after.localConclusion);
    expect(svc.concludeAction(input)).toEqual(conclusion);
    expect(svc.getSnapshot()).toEqual(after);
    expect(() => svc.concludeAction({ ...input, progress: { ...input.progress, result: 'Different claim.' } })).toThrow();
    expect(svc.getSnapshot()).toEqual(after);
  });

  async function retainLocalCounterexample(svc: AgentResearchService, unscoped = false) {
    const action = unscoped
      ? svc.planAndStartAction({
          kind: 'experiment', purpose: 'Check the primitive spin algebra.',
          expectedEvidence: ['Exact counterexample or agreement.'], stopCondition: 'One tiny check completes.',
          allowedToolKinds: ['shell'],
        })
      : await beginSandboxAction(svc, ['shell']);
    return svc.concludeAction({
      actionId: action.actionId, status: 'completed',
      progress: {
        headline: 'Primitive check failed', motivation: 'Validate the scientific premise.',
        workPerformed: 'Checked the single-spin identity.', result: 'The identity has a counterexample.',
        mainlineImpact: 'The affected calculation is not validated.', nextAction: 'Review the primitive before any large rerun.',
        detail: { observations: ['The square of the x-spin operator does not match one quarter of the identity.'],
          limitations: ['This does not settle the general physical conjecture.'], artifactRefs: ['/tmp/example-primitive-check/report.md'] },
      },
      durability: { status: 'durable_delta', entryKind: 'failure', authority: 'agent',
        provenance: 'agent_verification', rationale: 'New counterevidence changes the assessment.' },
    });
  }

  it('retains the real unscoped closeout shape and revokes work without canonical I/O', async () => {
    const { svc, executor, adapter } = await buildResearchSandboxHarness();
    const prepare = vi.spyOn(adapter, 'recordPrepare');
    const save = vi.spyOn(adapter, 'recordSave');
    const conclusion = await retainLocalCounterexample(svc, true);
    const snapshot = svc.getSnapshot();
    expect(snapshot.localConclusion).toEqual(conclusion.localConclusion);
    expect(snapshot.localConclusion?.action.lineSlug).toBeUndefined();
    expect(snapshot.localConclusion?.action.questionId).toBeUndefined();
    expect(snapshot.effectiveNextStep).toMatchObject({ source: 'aitp_maintenance', freshness: 'blocked' });
    expect(snapshot.effectiveNextStep?.text).toContain('not recorded in AITP');
    expect(snapshot.status?.health).toBe('blocked');
    expect((await executor.fireBeforeExecute(makeToolHookContext('Bash', { command: 'python another_run.py' })))?.veto).toBeDefined();
    expect(await guardOf(svc)({ goalId: 'goal-1', objective: 'work', actor: 'model' }))
      .toMatchObject({ allow: false, code: 'research.local-conclusion.pending' });
    expect(await decideOf(svc)({ goalId: 'goal-1', objective: 'work', turnsUsed: 1 }))
      .toMatchObject({ decision: 'hold' });
    expect(() => svc.planAndStartAction({ kind: 'experiment', purpose: 'Another test', stopCondition: 'Done' })).toThrow('Local conclusion');
    expect(() => svc.recordProgress(conclusion.progress)).toThrow('Local conclusion');
    expect(prepare).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(svc.getSnapshot()).toEqual(snapshot);
  });

  it.each([false, true])('adopts retained evidence only through explicit human scope confirmation (unscoped=%s)', async (unscoped) => {
    const { svc, adapter } = await buildResearchSandboxHarness();
    const prepare = vi.spyOn(adapter, 'recordPrepare');
    const save = vi.spyOn(adapter, 'recordSave');
    const conclusion = await retainLocalCounterexample(svc, unscoped);
    const local = conclusion.localConclusion!;
    seedConfirmedWorkstreamBinding({ confirmedAt: Date.now(), confirmedBy: 'user' });
    const before = svc.getSnapshot();
    expect(before.localConclusion).toEqual(local);
    expect(before.pendingCheckpoint).toBeUndefined();
    const command = {
      expectedRevision: before.revision, localConclusionId: local.candidate.sourceActionId,
      confirmedBy: 'user' as const, lineSlug: 'main', questionId: local.action.questionId,
    };
    expect(() => svc.proposeCheckpoint({ ...command, expectedRevision: 0 })).toThrow('exact current Research revision');
    expect(() => svc.proposeCheckpoint({ ...command, localConclusionId: undefined, confirmedBy: undefined })).toThrow('explicit user confirmation');
    expect(() => svc.proposeCheckpoint({ ...command, assessment: 'A different result' })).toThrow('preserve the original');
    expect(svc.getSnapshot()).toEqual(before);
    const checkpoint = svc.proposeCheckpoint(command);
    const after = svc.getSnapshot();
    expect(checkpoint.commitCandidate).toEqual(local.candidate);
    expect(checkpoint.assessment).toBe(local.progress.mainlineImpact);
    expect(checkpoint.nextAction).toBe(local.progress.nextAction);
    expect(after.latestProgress).toEqual(local.progress);
    expect(after.localConclusion).toBeUndefined();
    expect(after.currentLineSlug).toBe('main');
    expect(after.currentAction?.status).toBe('completed');
    expect(prepare).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(() => svc.proposeCheckpoint(command)).toThrow();
    expect(svc.getSnapshot()).toEqual(after);
  });

  it('cold-replays a retained local conclusion without restoring work or draft permission', async () => {
    const records: WireRecord[] = [];
    const openWire = () => {
      eventBus = new EventBusService();
      const ix = disposables.add(new TestInstantiationService());
      return registerTestAgentWire(ix, testWireScope(SCOPE, 'local-conclusion-recovery'), {
        log: recordingWireLog(records), eventBus,
      });
    };
    wire = openWire();
    const original = await buildResearchSandboxHarness();
    const local = (await retainLocalCounterexample(original.svc, true)).localConclusion!;
    await wire.flush();
    original.ix.dispose();
    wire = openWire();
    const restored = await buildResearchSandboxHarness();
    await wire.restore();
    expect(restored.svc.getSnapshot().localConclusion).toEqual(local);
    expect(restored.svc.getSnapshot().currentAction?.status).toBe('completed');
    expect(restored.svc.getSnapshot().pendingCheckpoint).toBeUndefined();
    for (const name of ['Bash', 'Edit', 'aitp_record_prepare']) {
      expect((await restored.executor.fireBeforeExecute(makeToolHookContext(name, { path: '.aitp/local/drafts/example.md' })))?.veto).toBeDefined();
    }
    wire.dispatch(contextAppendMessage({
      message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
    }));
    seedConfirmedWorkstreamBinding({ confirmedAt: Date.now(), confirmedBy: 'user' });
    restored.svc.proposeCheckpoint({ expectedRevision: restored.svc.getSnapshot().revision,
      localConclusionId: local.candidate.sourceActionId, confirmedBy: 'user', lineSlug: 'main' });
    expect(restored.svc.getSnapshot().localConclusion).toBeUndefined();
    wire.dispatch(contextUndo({ count: 1 }));
    expect(restored.svc.getSnapshot().localConclusion).toEqual(local);
    expect(restored.svc.getSnapshot().pendingCheckpoint).toBeUndefined();
    expect(restored.svc.getSnapshot().committedCheckpointHistory).toEqual([]);
  });

  it.each(['line', 'question', 'program', 'wrong_line', 'missing_confirmation'] as const)(
    'keeps the local conclusion intact when adoption sees %s drift', async (change) => {
      const { svc } = await buildResearchSandboxHarness();
      wire.dispatch(researchSetProgram({ topicId: 't1', title: 'Test', goalText: 'Not established yet',
        goalSource: '.aitp/topic/TOPIC.md', establishedAt: 2 }));
      const local = (await retainLocalCounterexample(svc)).localConclusion!;
      seedConfirmedWorkstreamBinding({ confirmedAt: Date.now(), confirmedBy: 'user' });
      if (change === 'line') svc.updateLine({ slug: 'main', title: 'Different scientific scope' });
      if (change === 'question') svc.updateQuestion({ questionId: local.action.questionId!, assessment: 'A different assessment.' });
      if (change === 'program') wire.dispatch(researchSetProgram({ topicId: 't1', title: 'Changed title',
        goalText: 'Different goal', goalSource: '.aitp/topic/TOPIC.md', establishedAt: 2 }));
      if (change === 'wrong_line') seedConfirmedWorkstreamBinding({ lineSlug: 'other', confirmedAt: Date.now() });
      const before = svc.getSnapshot();
      expect(() => svc.proposeCheckpoint({
        expectedRevision: before.revision, localConclusionId: local.candidate.sourceActionId,
        confirmedBy: change === 'missing_confirmation' ? undefined : 'user',
        lineSlug: change === 'wrong_line' ? 'other' : 'main', questionId: local.action.questionId,
      })).toThrow();
      expect(svc.getSnapshot()).toEqual(before);
      expect(before.localConclusion).toEqual(local);
    },
  );

  it('limits post-action checkpoint persistence to the captured checkpoint and prepared draft', async () => {
    const { executor } = await buildResearchSandboxHarness();
    proposeBoundCheckpoint({ checkpointId: 'checkpoint-current', idempotencyKey: 'key-current', createdAt: 10 });

    const prepare = await executor.fireBeforeExecute(makeToolHookContext('aitp_record_prepare', {
      checkpoint_id: 'checkpoint-current',
      kind: 'result',
      created_by: 'agent:main',
      workstreams: ['aitp-main'],
    }));
    const prematureSave = await executor.fireBeforeExecute(makeToolHookContext('aitp_record_save', {
      checkpoint_id: 'checkpoint-current',
      draft_path: '.aitp/local/drafts/entry-current.md',
    }));
    expect(prepare).toBeUndefined();
    expect(prematureSave?.veto?.output).toContain('prepare checkpoint checkpoint-current in an earlier tool batch');

    wire.dispatch(researchBindCheckpointReceipt({
      checkpointId: 'checkpoint-current',
      receipt: {
        prepare: {
          status: 'prepared',
          id: 'entry-current',
          path: '.aitp/local/drafts/entry-current.md',
          idempotencyKey: 'key-current',
          workstreams: ['aitp-main'],
        },
      },
    }));
    const draftEdit = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/entry-current.md',
    }));
    const otherDraft = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/entry-other.md',
    }));
    const exactSave = await executor.fireBeforeExecute(makeToolHookContext('aitp_record_save', {
      checkpoint_id: 'checkpoint-current',
      draft_path: '.aitp/local/drafts/entry-current.md',
    }));
    const prematureCommit = await executor.fireBeforeExecute(makeToolHookContext('CommitResearchCheckpoint', {
      checkpoint_id: 'checkpoint-current',
      entry_id: 'entry-current',
    }));

    expect(draftEdit).toBeUndefined();
    expect(otherDraft?.veto?.output).toContain('not owned by the current checkpoint');
    expect(exactSave).toBeUndefined();
    expect(prematureCommit?.veto?.output).toContain('save checkpoint checkpoint-current in an earlier tool batch');

    bindCompleteCheckpointReceipt('checkpoint-current', 'entry-current');
    const commit = await executor.fireBeforeExecute(makeToolHookContext('CommitResearchCheckpoint', {
      checkpoint_id: 'checkpoint-current',
      entry_id: 'entry-current',
    }));
    expect(commit).toBeUndefined();
  });

  it('limits Note persistence to the current post-commit distillation handoff', async () => {
    const { executor, svc } = await buildResearchSandboxHarness();
    const beforeHandoff = await executor.fireBeforeExecute(makeToolHookContext('aitp_note_prepare', {
      mode: 'theory',
      title: 'Method card: test',
      created_by: 'agent:main',
      workstreams: ['aitp-main'],
    }));
    expect(beforeHandoff?.veto?.output).toContain('no current post-commit distillation handoff');

    await commitReviewCheckpoint(svc);

    expect(wire.getModel(ResearchModel).current.currentAction).toBeNull();
    for (const [name, args] of [
      ['Read', { path: '.aitp/topic/notes/note-card.md' }],
      ['Grep', { path: '.aitp/topic/', pattern: '^> method-card:' }],
      ['Grep', { path: '.aitp/topic/entries/', pattern: '^> method-observation:' }],
    ] as const) {
      expect(await executor.fireBeforeExecute(makeToolHookContext(name, args))).toBeUndefined();
    }
    for (const [name, args] of [
      ['WebSearch', { query: 'new research' }],
      ['Read', { path: 'new-results.dat' }],
      ['Grep', { path: 'src', pattern: 'Hamiltonian' }],
    ] as const) {
      const denied = await executor.fireBeforeExecute(makeToolHookContext(name, args));
      expect(denied?.veto?.output).toContain('no in-progress ResearchAction');
    }

    const prepare = await executor.fireBeforeExecute(makeToolHookContext('aitp_note_prepare', {
      mode: 'theory',
      title: 'Method card: test',
      created_by: 'agent:main',
      workstreams: ['aitp-main'],
    }));
    const prematureSave = await executor.fireBeforeExecute(makeToolHookContext('aitp_note_save', {
      draft_path: '.aitp/local/drafts/note-test.md',
    }));
    const wrongScope = await executor.fireBeforeExecute(makeToolHookContext('aitp_note_prepare', {
      mode: 'theory',
      title: 'Method card: test',
      created_by: 'agent:main',
      workstreams: ['other'],
    }));
    await svc.prepareReviewNote({
      mode: 'theory', title: 'Method card: test', createdBy: 'agent:main', workstreams: ['aitp-main'],
    });
    const draftEdit = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-test.md',
    }));
    const otherDraftEdit = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-other.md',
    }));
    const save = await executor.fireBeforeExecute(makeToolHookContext('aitp_note_save', {
      draft_path: '.aitp/local/drafts/note-test.md',
    }));

    expect(prepare).toBeUndefined();
    expect(prematureSave?.veto?.output).toContain('exact draft returned by aitp_note_prepare');
    expect(wrongScope?.veto?.output).toContain('exactly the current explicitly bound AITP workstream');
    expect(draftEdit).toBeUndefined();
    expect(otherDraftEdit?.veto?.output).toContain('not owned by the current checkpoint or distillation handoff');
    expect(save).toBeUndefined();

    await svc.saveReviewNote({ draftPath: '.aitp/local/drafts/note-test.md' });
    const repeatedSave = await executor.fireBeforeExecute(makeToolHookContext('aitp_note_save', {
      draft_path: '.aitp/local/drafts/note-test.md',
    }));
    expect(repeatedSave?.veto?.output).toContain('exact draft returned by aitp_note_prepare');
  });

  it('does not retain a transient distillation draft lease across cold restore', async () => {
    const { executor, svc } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    await svc.prepareReviewNote({
      mode: 'theory',
      title: 'Method card: restored lease test',
      createdBy: 'agent:main',
      workstreams: ['aitp-main'],
    });
    const beforeRestore = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-test.md',
    }));
    expect(beforeRestore).toBeUndefined();

    await wire.flush();
    await wire.restore();

    const afterRestore = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-test.md',
    }));
    expect(afterRestore?.veto?.output).toContain('not owned by the current checkpoint or distillation handoff');
  });

  it('does not retain a transient distillation draft lease across mode exit and re-entry', async () => {
    const { executor, modeSvc, svc } = await buildResearchSandboxHarness();
    await commitReviewCheckpoint(svc);
    await svc.prepareReviewNote({
      mode: 'theory', title: 'Method card: mode exit lease test', createdBy: 'agent:main', workstreams: ['aitp-main'],
    });
    const beforeExit = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-test.md',
    }));
    expect(beforeExit).toBeUndefined();

    modeSvc.isActive = false;
    eventBus.publish({ type: 'aitp_mode.updated' });
    modeSvc.isActive = true;
    eventBus.publish({ type: 'aitp_mode.updated' });

    const afterReentry = await executor.fireBeforeExecute(makeToolHookContext('Edit', {
      path: '.aitp/local/drafts/note-test.md',
    }));
    expect(afterReentry?.veto?.output).toContain('not owned by the current checkpoint or distillation handoff');
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
    (svc as unknown as { guardToolExecution: (e: BeforeToolExecuteEventImpl) => void }).guardToolExecution(event);

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

  it('replays an anonymized 0.21 single-Line journal without inventing continuation', async () => {
    const records = replayFixture('legacy-0.21-single-line');
    expect(records.filter((record) => record.type.startsWith('goal.'))
      .every((record) => !Object.hasOwn(record, 'continuation'))).toBe(true);
    wire = buildReplayWire('legacy-0.21-single-line');
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active', 3, {
        objective: 'Validate one bounded scientific workflow from pinned inputs.',
      })),
    );

    await wire.restore();

    expect(wire.getModel(GoalModel)).toMatchObject({
      goalId: 'legacy-goal',
      status: 'active',
      tokensUsed: 512,
    });
    const snapshot = svc.getSnapshot();
    expect(snapshot).toMatchObject({
      currentLineSlug: 'primary-line',
      currentQuestion: { id: 'question-primary', lineSlug: 'primary-line' },
      researchGoal: { status: 'active' },
    });
    expect(snapshot.researchGoal?.continuation).toBeUndefined();
    const injection = renderResearchInjection(snapshot, 'brief').content;
    expect(injection).toContain('status: active');
    expect(injection).not.toContain('continuation held');
    expect(injection).not.toContain('continuation running');
    expect(injection).not.toContain('status: complete');
  });

  it('replays two Lines, repairs the exact foreground owner, and holds ambiguous action outcome', async () => {
    wire = buildReplayWire('legacy-0.21-two-line-stranded-action');
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );

    await wire.restore();

    const snapshot = svc.getSnapshot();
    expect(snapshot).toMatchObject({
      currentLineSlug: 'active-line',
      currentQuestion: { id: 'question-active', lineSlug: 'active-line' },
      phase: 'action_executing',
      currentAction: { actionId: 'action-active', status: 'in_progress' },
      humanGate: { gateId: 'gate-active', resolution: 'Use the checked diagnostic evidence.' },
      effectiveNextStep: {
        source: 'research_action',
        freshness: 'blocked',
        derivedFrom: { actionId: 'action-active', lineSlug: 'active-line' },
      },
      status: {
        currentLineSlug: 'active-line',
        currentQuestionId: 'question-active',
        currentActionId: 'action-active',
        health: 'blocked',
      },
    });
    expect(snapshot.lines.map((line) => line.slug)).toEqual(['active-line', 'other-line']);
    expect(snapshot.effectiveNextStep?.text).toContain('Do not start another action');
    expect(snapshot.recentStateChange?.summary).toContain('[research-action-recovery]');

    const injection = renderResearchInjection(snapshot, 'brief').content;
    expect(injection).toContain('Recovery owns this turn');
    expect(injection).toContain('Run the active-line diagnostic.');
    expect(injection).not.toContain('Independent archived line');
    expect(injection).not.toContain('What is the unrelated line status?');

    const continuation = await decideOf(svc)({
      goalId: 'goal-1', objective: 'work', turnsUsed: 1,
    });
    expect(continuation).toMatchObject({
      decision: 'hold',
      owner: 'aitpResearch',
      reason: expect.stringContaining('recovered from a stranded action/phase state'),
    });
    const completion = await guardOf(svc)({
      goalId: 'goal-1', objective: 'work', actor: 'model',
    });
    expect(completion).toMatchObject({ allow: false, code: 'research.action.live' });

    const before = {
      research: wire.getModel(ResearchModel).current.revision,
      mode: wire.getModel(AitpModeModel).current.revision,
    };
    (svc as unknown as { reconcile: () => void }).reconcile();
    expect({
      research: wire.getModel(ResearchModel).current.revision,
      mode: wire.getModel(AitpModeModel).current.revision,
    }).toEqual(before);
  });

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

  it('holds completion and continuation while Research Mode is probing', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'probing' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );

    const completion = await guardOf(svc)({ goalId: 'goal-1', objective: 'work', actor: 'model' });
    const continuation = await decideOf(svc)({ goalId: 'goal-1', objective: 'work', turnsUsed: 1 });

    expect(completion).toMatchObject({ allow: false, code: 'research.mode.probing' });
    expect(continuation).toMatchObject({ decision: 'hold', reason: expect.stringContaining('probing') });
  });

  it('holds goal continuation while a research checkpoint is pending commit', async () => {
    wire.dispatch(researchProposeCheckpoint({
      checkpointId: 'checkpoint-1', idempotencyKey: 'checkpoint-key', createdAt: 1,
    }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );

    const result = await decideOf(svc)({ goalId: 'goal-1', objective: 'work', turnsUsed: 1 });

    expect(result).toMatchObject({
      decision: 'hold',
      reason: expect.stringContaining('checkpoint is pending commit'),
    });
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

  it('holds goal continuation for unconfirmed, stale, and conflicting active Goal-to-Program alignment', async () => {
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    wire.dispatch(researchSetProgram({
      topicId: 'topic-1', title: 'Topic', goalText: 'AITP goal', goalSource: 'enter', establishedAt: 1,
    }));
    const svc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(), makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
    );
    const input = { goalId: 'goal-1', objective: 'work', turnsUsed: 1 };
    expect(await decideOf(svc)(input)).toMatchObject({ decision: 'hold' });

    const before = svc.getSnapshot();
    svc.confirmGoalAlignment({
      relation: 'unrelated', expectedRevision: before.revision, goalId: 'goal-1', topicId: 'topic-1', observedRevision: 1,
    });
    expect(await decideOf(svc)(input)).toMatchObject({ decision: 'hold', reason: expect.stringContaining('unrelated') });

    wire.dispatch(researchSetProgram({
      topicId: 'topic-1', title: 'Topic', goalText: 'Changed AITP goal', goalSource: 'enter', establishedAt: 1,
    }));
    expect(await decideOf(svc)(input)).toMatchObject({ decision: 'hold', reason: expect.stringContaining('changed') });
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
  it('enter signals each mode op and one changed Topic observation', async () => {
    const modeEvents: { type: string }[] = [];
    disposables.add(eventBus.subscribe('aitp_mode.updated', (e) => modeEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    await modeSvc.enter({ actor: 'user' });

    // Enter and ready are mode ops; the fresh Topic observation is one
    // additional signal so full Research snapshots cannot remain stale.
    expect(modeEvents).toHaveLength(3);
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

  it('undo publishes probing then ready mode/status boundaries (toEvent is silent on replay)', async () => {
    const modePhases: string[] = [];
    const statusEvents: { type: string }[] = [];

    const modeSvc = await buildRealModeService();
    await modeSvc.enter({ actor: 'user' });
    disposables.add(eventBus.subscribe('aitp_mode.updated', () => modePhases.push(modeSvc.phase)));
    disposables.add(eventBus.subscribe('agent.status.updated', (e) => statusEvents.push(e as never)));
    wire.dispatch(contextAppendMessage({ message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } } }));

    wire.dispatch(contextUndo({ count: 1 }));
    eventBus.publish({ type: 'context.undone', turns: 1 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(modePhases).toEqual(['probing', 'ready']);
    expect(statusEvents).toHaveLength(2);
  });

  it('research.updated is published on every mode signal with a complete line snapshot', async () => {
    const researchEvents: {
      type: string;
      snapshot?: { lines: readonly { slug: string }[] };
    }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => researchEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    // The line is created before aitp_mode.enter, so every mode-triggered
    // research.updated snapshot already contains the selected line.
    expect(researchEvents.length).toBeGreaterThanOrEqual(2);
    for (const e of researchEvents) {
      expect(e.snapshot?.lines.some((line) => line.slug === 'main')).toBe(true);
    }
  });

  it('research.updated snapshot reflects mode phase after pause/resume', async () => {
    const researchEvents: {
      type: string;
      snapshot?: { mode: string; loopStatus: string; revision: number };
    }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => researchEvents.push(e as never)));

    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);

    await modeSvc.enter({ actor: 'user' });
    researchEvents.length = 0;

    modeSvc.pauseLoop(researchSvc.getSnapshot().revision);
    const pausedSnapshot = researchEvents[researchEvents.length - 1]!.snapshot;
    expect(pausedSnapshot!.loopStatus).toBe('paused');
    expect(pausedSnapshot!.revision).toBe(researchSvc.getSnapshot().revision);

    modeSvc.resumeLoop(pausedSnapshot!.revision);
    const resumedSnapshot = researchEvents[researchEvents.length - 1]!.snapshot;
    expect(resumedSnapshot!.loopStatus).toBe('active');
    expect(resumedSnapshot!.revision).toBe(researchSvc.getSnapshot().revision);
  });

  it('publishes strictly increasing tokens when a mode signal queues multiple Research ops', async () => {
    const researchEvents: { snapshot?: { revision: number; loopStatus: string } }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (event) => {
      researchEvents.push(event as never);
    }));
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    wire.dispatch(researchSetProgram({
      topicId: 'legacy-topic',
      title: 'Legacy Topic',
      goalText: 'Legacy goal',
      goalSource: 'legacy',
      establishedAt: 1,
    }));
    const legacyRevision = researchSvc.getSnapshot().revision;

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    const enterRevisions = researchEvents.map((event) => event.snapshot!.revision);
    expect(enterRevisions.length).toBeGreaterThanOrEqual(3);
    expect(enterRevisions[0]).toBeGreaterThan(legacyRevision);
    for (let index = 1; index < enterRevisions.length; index += 1) {
      expect(enterRevisions[index]).toBeGreaterThan(enterRevisions[index - 1]!);
    }
    const enteredRevision = enterRevisions.at(-1)!;
    expect(enteredRevision).toBe(researchSvc.getSnapshot().revision);

    modeSvc.pauseLoop(enteredRevision);
    const paused = researchEvents.at(-1)!.snapshot!;
    expect(paused.loopStatus).toBe('paused');
    expect(paused.revision).toBeGreaterThan(enteredRevision);
    expect(paused.revision).toBe(researchSvc.getSnapshot().revision);
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

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    await researchSvc.confirmLineWorkstreamBinding({
      lineSlug: 'main',
      workstream: 'aitp-main',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'main_agent',
    });
    const checkpoint = researchSvc.proposeCheckpoint({ expectedRevision: 0, lineSlug: 'main' });
    bindCompleteCheckpointReceipt(checkpoint.checkpointId);

    const researchEvents: { type: string; snapshot?: { mode: string } }[] = [];
    disposables.add(eventBus.subscribe('research.updated', (e) => researchEvents.push(e as never)));

    await expect(researchSvc.commitCheckpoint({ checkpointId: checkpoint.checkpointId, entryId: 'e1' })).rejects.toThrow('error finding');

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
    expect(output).toContain('simplest sufficient explanation');
    expect(output).toContain('cheapest decisive evidence');
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

  it('renders guidance for an interactive user Research turn', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    researchSvc.createQuestion({ lineSlug: 'main', wording: 'What causes X?' });
    researchSvc.setPhase('orienting');

    const { AitpResearchInjection } = await import('#/features/aitpResearch/injection/aitpResearchInjection');
    const providers = captureProviders();
    const admission = await makeInjectionAdmission(modeSvc, 'interactive_research');
    new AitpResearchInjection(providers.stub as never, modeSvc, researchSvc, admission);

    const output = providers.call(0, { isNewTurn: true });
    expect(output).toContain('Research state guidance');
    expect(admission.currentLease()).toBe('interactive_research');
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
  extras: Partial<GoalSnapshot> = {},
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
    ...extras,
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
  admitted: boolean | 'interactive_research',
): Promise<import('#/features/aitpResearch/loop/researchTurnAdmission').IResearchTurnAdmission> {
  const { ResearchTurnAdmission } = await import('#/features/aitpResearch/loop/researchTurnAdmission');
  const admission = new ResearchTurnAdmission(
    eventBus,
    makeAgentScopeContext({ agentId: MAIN_AGENT_ID, agentScope: '' }),
    modeSvc,
  );
  disposables.add(admission);
  if (admitted) {
    const interactive = admitted === 'interactive_research';
    eventBus.publish({
      type: 'turn.started',
      turnId: 1,
      origin: interactive ? { kind: 'user' } : GOAL_CONTINUATION_ORIGIN,
      intent: interactive ? USER_TURN_INTENT : GOAL_CONTINUATION_INTENT,
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
    makeScopeCtx(),
    adapter ?? makeStubAdapter(),
    eventBus,
    profile,
  );
}

async function buildRealResearchService(
  modeSvc: Awaited<ReturnType<typeof buildRealModeService>>,
  adapter?: ReturnType<typeof makeStubAdapter>,
  permissionMode?: IAgentPermissionModeService,
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
    undefined,
    undefined,
    undefined,
    undefined,
    permissionMode,
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

describe('checkpoint adapter exact binding', () => {
  const binding: ResearchLineWorkstreamBinding = {
    confirmationId: 'confirmation-checkpoint',
    lineSlug: 'line-a',
    workstream: 'ws-a',
    topicId: 'topic-a',
    observedRevision: 1,
    confirmedBy: 'user',
    confirmedAt: 100,
  };

  function cleanScopedCheck(): AitpCheckReport {
    return {
      schema: 'aitp/check-report-0.2',
      root: '/workspace',
      status: 'clean',
      counts: {
        entries: 1,
        notes: 0,
        errors: 0,
        warnings: 0,
        by_code: {},
        outside_scope: { errors: 0, warnings: 0 },
      },
      findings: [],
      workstream: binding.workstream,
    };
  }

  function makeResearchHarness(
    prepareWorkstreams?: readonly string[],
    commitCandidate?: ResearchCheckpoint['commitCandidate'],
  ) {
    let status: 'bound' | 'stale' = 'bound';
    let checkpoint: ResearchCheckpoint = {
      checkpointId: 'checkpoint-a',
      lineSlug: binding.lineSlug,
      workstreamBinding: binding,
      commitCandidate,
      idempotencyKey: 'idempotency-a',
      persistence: 'pending_commit',
      receipt: prepareWorkstreams === undefined
        ? undefined
        : {
            prepare: {
              status: 'prepared',
              id: 'entry-test',
              path: '.aitp/local/drafts/entry-test.md',
              idempotencyKey: 'idempotency-a',
              workstreams: prepareWorkstreams,
            },
          },
      createdAt: 100,
    };
    const bindPendingCheckpointReceipt = vi.fn((receipt: ResearchCheckpoint['receipt']) => {
      checkpoint = {
        ...checkpoint,
        committedEntryId: receipt?.prepare?.id ?? checkpoint.committedEntryId,
        receipt: {
          ...checkpoint.receipt,
          ...receipt,
        },
      };
      return checkpoint;
    });
    const research = {
      getPendingCheckpoint: () => checkpoint,
      getLineWorkstreamAlignment: () => status === 'bound'
        ? { lineSlug: binding.lineSlug, status, reason: 'confirmed', binding }
        : { lineSlug: binding.lineSlug, status, reason: 'topic revision changed', binding },
      bindPendingCheckpointReceipt,
    } as unknown as IAgentResearchService;
    const mode = {
      ...makeStubModeSvc({ isActive: true, phase: 'ready' }),
      async reconcileCurrentTopicBinding() {
        return status === 'bound' ? binding : undefined;
      },
    } as IAgentAitpModeService;
    return {
      research,
      mode,
      bindPendingCheckpointReceipt,
      setStatus(next: 'bound' | 'stale') { status = next; },
    };
  }

  const executionContext = {
    turnId: 1,
    toolCallId: 'checkpoint-binding',
    signal: new AbortController().signal,
  };

  it('blocks all adapter reads during Research Mode probing before adapter I/O', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const mode = makeStubModeSvc({ isActive: true, phase: 'probing' });
    const enter = vi.spyOn(adapter, 'enter');
    const list = vi.spyOn(adapter, 'list');
    const show = vi.spyOn(adapter, 'show');
    const check = vi.spyOn(adapter, 'check');
    const {
      AitpEnterTool,
      AitpListTool,
      AitpShowTool,
      AitpCheckTool,
    } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const results = await Promise.all([
      runnableExecution(new AitpEnterTool(adapter, mode).resolveExecution({})).execute(executionContext),
      runnableExecution(new AitpListTool(adapter, mode).resolveExecution({})).execute(executionContext),
      runnableExecution(new AitpShowTool(adapter, mode).resolveExecution({ id: 'entry-a' })).execute(executionContext),
      runnableExecution(new AitpCheckTool(adapter, mode).resolveExecution({})).execute(executionContext),
    ]);

    expect(results).toEqual(results.map(() => expect.objectContaining({ isError: true })));
    expect(enter).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  it('blocks all canonical writes while Research Mode is degraded even when the adapter is ready', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const mode = makeStubModeSvc({ isActive: true, phase: 'degraded' });
    const research = makeResearchHarness().research;
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const recordSave = vi.spyOn(adapter, 'recordSave');
    const notePrepare = vi.spyOn(adapter, 'notePrepare');
    const noteSave = vi.spyOn(adapter, 'noteSave');
    const {
      AitpRecordPrepareTool,
      AitpRecordSaveTool,
    } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const noteTools = await buildNoteTools(adapter, mode, research);

    const results = await Promise.all([
      runnableExecution(new AitpRecordPrepareTool(adapter, mode, research).resolveExecution({
        kind: 'result',
        created_by: 'agent:main',
      })).execute(executionContext),
      runnableExecution(new AitpRecordSaveTool(adapter, mode, research).resolveExecution({
        draft_path: '.aitp/local/drafts/entry-a.md',
      })).execute(executionContext),
      runnableExecution(await noteTools.prepare.resolveExecution({
        mode: 'working',
        title: 'Working state',
        created_by: 'agent:main',
      })).execute(executionContext),
      runnableExecution(await noteTools.save.resolveExecution({
        draft_path: '.aitp/local/drafts/note-a.md',
      })).execute(executionContext),
    ]);

    expect(results).toEqual(results.map(() => expect.objectContaining({ isError: true })));
    expect(recordPrepare).not.toHaveBeenCalled();
    expect(recordSave).not.toHaveBeenCalled();
    expect(notePrepare).not.toHaveBeenCalled();
    expect(noteSave).not.toHaveBeenCalled();
  });

  it('rechecks the write gate after checkpoint prepare reconciliation', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const harness = makeResearchHarness();
    const mode = harness.mode as IAgentAitpModeService & { phase: AitpAdapterHealth['phase'] };
    mode.reconcileCurrentTopicBinding = vi.fn(async () => {
      mode.phase = 'degraded';
      return binding;
    });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordPrepareTool(
      adapter, mode, harness.research,
    ).resolveExecution({
      kind: 'result', created_by: 'agent:main', workstreams: ['ws-a'],
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(recordPrepare).not.toHaveBeenCalled();
  });

  it('rechecks the write gate after checkpoint save barriers', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const harness = makeResearchHarness(['ws-a']);
    const mode = harness.mode as IAgentAitpModeService & { phase: AitpAdapterHealth['phase'] };
    mode.reconcileCurrentTopicBinding = vi.fn(async () => {
      mode.phase = 'degraded';
      return binding;
    });
    const check = vi.spyOn(adapter, 'check');
    const recordSave = vi.spyOn(adapter, 'recordSave');
    const { AitpRecordSaveTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordSaveTool(
      adapter, mode, harness.research,
    ).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(check).toHaveBeenCalledOnce();
    expect(recordSave).not.toHaveBeenCalled();
  });

  it('propagates turn cancellation into record and note save without swallowing abort', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const mode = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const research = makeResearchHarness().research;
    const waitForAbort = (signal: AbortSignal | undefined): Promise<never> => new Promise((_, reject) => {
      if (signal === undefined) throw new Error('missing tool abort signal');
      const rejectCancelled = () => reject(new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
        'AITP operation cancelled',
      ));
      if (signal.aborted) rejectCancelled();
      else signal.addEventListener('abort', rejectCancelled, { once: true });
    });
    const recordSave = vi.spyOn(adapter, 'recordSave').mockImplementation(({ signal }) =>
      waitForAbort(signal));
    const noteSave = vi.spyOn(adapter, 'noteSave').mockImplementation(({ signal }) =>
      waitForAbort(signal));
    const { AitpRecordSaveTool } = await import(
      '#/features/aitpResearch/tools/aitpAdapterTools'
    );
    const noteTools = await buildNoteTools(adapter, mode, {
      ...research,
      saveReviewNote: (input) => adapter.noteSave(input),
    });

    const recordController = new AbortController();
    const recordExecution = runnableExecution(new AitpRecordSaveTool(
      adapter, mode, research,
    ).resolveExecution({ draft_path: '.aitp/local/drafts/entry-test.md' })).execute({
      ...executionContext,
      signal: recordController.signal,
    });
    await vi.waitFor(() => expect(recordSave).toHaveBeenCalledOnce());
    expect(recordSave).toHaveBeenCalledWith(expect.objectContaining({
      signal: recordController.signal,
    }));
    recordController.abort();
    await expect(recordExecution).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
    });

    const noteController = new AbortController();
    const noteExecution = runnableExecution(await noteTools.save.resolveExecution({
      draft_path: '.aitp/local/drafts/note-test.md',
    })).execute({
      ...executionContext,
      signal: noteController.signal,
    });
    await vi.waitFor(() => expect(noteSave).toHaveBeenCalledOnce());
    expect(noteSave).toHaveBeenCalledWith(expect.objectContaining({
      signal: noteController.signal,
    }));
    noteController.abort();
    await expect(noteExecution).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
    });
  });

  it.each([
    ['missing', undefined],
    ['multiple', ['ws-a', 'ws-b']],
    ['mismatched', ['ws-b']],
  ] as const)('rejects %s checkpoint prepare workstreams before adapter I/O', async (_label, workstreams) => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const harness = makeResearchHarness();
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const result = await runnableExecution(new AitpRecordPrepareTool(
      adapter,
      harness.mode,
      harness.research,
    ).resolveExecution({
      kind: 'result',
      created_by: 'agent:main',
      workstreams: workstreams === undefined ? undefined : [...workstreams],
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(recordPrepare).not.toHaveBeenCalled();
    expect(harness.bindPendingCheckpointReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ['kind', { kind: 'failure' as const, authority: 'agent' as const, created_by: 'agent:main' }],
    ['authority', { kind: 'result' as const, authority: 'tool' as const, created_by: undefined }],
    ['created_by', { kind: 'result' as const, authority: 'agent' as const, created_by: 'agent:other' }],
  ])('rejects candidate %s mismatch before adapter I/O', async (_label, intent) => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.2', pluginVersion: '0.9.0' });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const harness = makeResearchHarness(undefined, {
      sourceActionId: 'action-a',
      progressRecordedAt: 100,
      entryKind: 'result',
      authority: 'agent',
      provenance: 'agent_verification',
      rationale: 'The checked result is a durable delta.',
    });
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const result = await runnableExecution(new AitpRecordPrepareTool(
      adapter,
      harness.mode,
      harness.research,
    ).resolveExecution({
      ...intent,
      workstreams: ['ws-a'],
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(recordPrepare).not.toHaveBeenCalled();
    expect(harness.bindPendingCheckpointReceipt).not.toHaveBeenCalled();
  });

  it('uses the exact assessed candidate intent for checkpoint prepare', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.2', pluginVersion: '0.9.0' });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const harness = makeResearchHarness(undefined, {
      sourceActionId: 'action-a',
      progressRecordedAt: 100,
      entryKind: 'result',
      authority: 'agent',
      provenance: 'agent_verification',
      rationale: 'The checked result is a durable delta.',
    });
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const result = await runnableExecution(new AitpRecordPrepareTool(
      adapter,
      harness.mode,
      harness.research,
    ).resolveExecution({
      kind: 'result',
      authority: 'agent',
      created_by: 'agent:main',
      workstreams: ['ws-a'],
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result.isError).toBeFalsy();
    expect(recordPrepare).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'result',
      authority: 'agent',
      createdBy: 'agent:main',
      workstreams: ['ws-a'],
    }));
    expect(harness.bindPendingCheckpointReceipt).toHaveBeenCalledOnce();
  });

  it('rejects a stale captured binding before checkpoint prepare I/O', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const harness = makeResearchHarness();
    harness.setStatus('stale');
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const result = await runnableExecution(new AitpRecordPrepareTool(
      adapter,
      harness.mode,
      harness.research,
    ).resolveExecution({
      kind: 'result',
      created_by: 'agent:main',
      workstreams: ['ws-a'],
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(recordPrepare).not.toHaveBeenCalled();
    expect(harness.bindPendingCheckpointReceipt).not.toHaveBeenCalled();
  });

  it('degrades and performs zero prepare I/O when fresh Topic observation fails', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const current = seedCurrentConfirmedWorkstream({
      lineSlug: 'line-a', workstream: 'ws-a', topicId: 't1',
    });
    const modeSvc = await buildRealModeService(adapter);
    modeSvc.setPhase('ready');
    const researchSvc = await buildRealResearchService(modeSvc, adapter);
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: current.lineSlug,
    });
    vi.spyOn(adapter, 'enter').mockRejectedValue(new Error('fresh enter failed'));
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordPrepareTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      kind: 'result', created_by: 'agent:main', workstreams: ['ws-a'],
      checkpoint_id: checkpoint.checkpointId,
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(recordPrepare).not.toHaveBeenCalled();
    expect(researchSvc.getPendingCheckpoint()?.receipt).toBeUndefined();
    expect(modeSvc.phase).toBe('degraded');
  });

  it('degrades and performs zero check/save I/O when fresh Topic observation fails', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const current = seedCurrentConfirmedWorkstream({
      lineSlug: 'line-a', workstream: 'ws-a', topicId: 't1',
    });
    const modeSvc = await buildRealModeService(adapter);
    modeSvc.setPhase('ready');
    const researchSvc = await buildRealResearchService(modeSvc, adapter);
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: current.lineSlug,
    });
    researchSvc.bindPendingCheckpointReceipt({
      prepare: {
        status: 'prepared', id: 'entry-test', path: '.aitp/local/drafts/entry-test.md',
        idempotencyKey: checkpoint.idempotencyKey, workstreams: ['ws-a'],
      },
    });
    vi.spyOn(adapter, 'enter').mockRejectedValue(new Error('fresh enter failed'));
    const checkSpy = vi.spyOn(adapter, 'check');
    const recordSave = vi.spyOn(adapter, 'recordSave');
    const { AitpRecordSaveTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordSaveTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: checkpoint.checkpointId,
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(checkSpy).not.toHaveBeenCalled();
    expect(recordSave).not.toHaveBeenCalled();
    expect(researchSvc.getPendingCheckpoint()?.receipt).toEqual({
      prepare: expect.objectContaining({ path: '.aitp/local/drafts/entry-test.md' }),
    });
    expect(modeSvc.phase).toBe('degraded');
  });

  it('does not revive Research Mode when exit invalidates fresh Topic observation', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const current = seedCurrentConfirmedWorkstream({
      lineSlug: 'line-a', workstream: 'ws-a', topicId: 't1',
    });
    const modeSvc = await buildRealModeService(adapter);
    modeSvc.setPhase('ready');
    const researchSvc = await buildRealResearchService(modeSvc, adapter);
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: current.lineSlug,
    });
    const entered = await adapter.enter();
    let releaseEnter!: (result: AitpEnterResult) => void;
    const enterSpy = vi.spyOn(adapter, 'enter').mockReturnValue(new Promise((resolve) => {
      releaseEnter = resolve;
    }));
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const execution = runnableExecution(new AitpRecordPrepareTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      kind: 'result', created_by: 'agent:main', workstreams: ['ws-a'],
      checkpoint_id: checkpoint.checkpointId,
    })).execute(executionContext);
    await vi.waitFor(() => expect(enterSpy).toHaveBeenCalledOnce());
    await modeSvc.exit();
    releaseEnter(entered);

    await expect(execution).resolves.toMatchObject({ isError: true });
    expect(recordPrepare).not.toHaveBeenCalled();
    expect(modeSvc.phase).toBe('inactive');
    expect(adapter.health.phase).toBe('inactive');
  });

  it('rejects a Line switch while checkpoint reconciliation is pending', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const mainBinding = seedCurrentConfirmedWorkstream({
      lineSlug: 'main', workstream: 'ws-main', topicId: 't1',
    });
    wire.dispatch(researchCreateLine({ slug: 'alt', title: 'Alt', createdAt: 4 }));
    seedConfirmedWorkstreamBinding({ lineSlug: 'alt', workstream: 'ws-alt', topicId: 't1' });
    let releaseObservation!: (binding: ResearchLineWorkstreamBinding | undefined) => void;
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    modeSvc.reconcileCurrentTopicBinding = vi.fn(() => new Promise<ResearchLineWorkstreamBinding | undefined>((resolve) => {
      releaseObservation = resolve;
    }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: mainBinding.lineSlug,
    });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const execution = runnableExecution(new AitpRecordPrepareTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      kind: 'result', created_by: 'agent:main', workstreams: ['ws-main'],
      checkpoint_id: checkpoint.checkpointId,
    })).execute(executionContext);
    await vi.waitFor(() => expect(modeSvc.reconcileCurrentTopicBinding).toHaveBeenCalledOnce());
    expect(() => researchSvc.switchLine('alt')).toThrow(
      `Cannot switch to Research Line alt while checkpoint ${checkpoint.checkpointId} is pending. Commit it or undo its proposal before switching lines.`,
    );
    releaseObservation(undefined);

    await expect(execution).resolves.toMatchObject({ isError: true });
    expect(recordPrepare).not.toHaveBeenCalled();
    expect(modeSvc._setPhaseCalls).toEqual(['degraded']);
    expect(researchSvc.getSnapshot().currentLineSlug).toBe('main');
    expect(researchSvc.getSnapshot().currentWorkstreamBinding).toMatchObject({
      status: 'bound', binding: { workstream: 'ws-main' },
    });
  });

  it('keeps repeated blocked Line switches idempotent while checkpoint observation settles', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const mainBinding = seedCurrentConfirmedWorkstream({
      lineSlug: 'main', workstream: 'ws-main', topicId: 't1',
    });
    seedConfirmedWorkstreamBinding({
      confirmationId: 'confirmation-alt',
      lineSlug: 'alt',
      workstream: 'ws-alt',
      topicId: 't1',
      confirmedAt: 4,
    });
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
    const entered = await adapter.enter();
    let releaseOldObservation!: (value: AitpEnterResult) => void;
    const oldObservation = new Promise<AitpEnterResult>((resolve) => {
      releaseOldObservation = resolve;
    });
    const enterSpy = vi.spyOn(adapter, 'enter')
      .mockReturnValueOnce(oldObservation)
      .mockResolvedValue(entered);
    const coordinator = makeCoordinatorStub().coordinator;
    coordinator.refresh.mockImplementation(async ({ workstream }: { workstream: string }) =>
      maintenanceReceipt({
        workstream,
        topic: {
          id: 't1',
          title: 'Test',
          goalText: 'Not established yet',
          goalSource: '.aitp/topic/TOPIC.md',
        },
      }));
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire, makeScopeCtx(), adapter, eventBus, makeProfileServiceStub(), coordinator as never,
    );
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter,
      makeToolExecutorStub(), makeStubGoalService(), coordinator as never,
    );
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: mainBinding.lineSlug,
    });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const execution = runnableExecution(new AitpRecordPrepareTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      kind: 'result', created_by: 'agent:main', workstreams: ['ws-main'],
      checkpoint_id: checkpoint.checkpointId,
    })).execute(executionContext);
    await vi.waitFor(() => expect(enterSpy).toHaveBeenCalledTimes(1));

    expect(() => researchSvc.switchLine('alt')).toThrow('Commit it or undo its proposal before switching lines.');
    expect(() => researchSvc.switchLine('alt')).toThrow('Commit it or undo its proposal before switching lines.');
    expect(enterSpy).toHaveBeenCalledTimes(1);
    releaseOldObservation(entered);

    await expect(execution).resolves.toBeDefined();
    expect(recordPrepare).toHaveBeenCalledOnce();
    expect(modeSvc.phase).toBe('ready');
    expect(researchSvc.getSnapshot().currentLineSlug).toBe('main');
    expect(researchSvc.getSnapshot().currentWorkstreamBinding).toMatchObject({
      status: 'bound', binding: { confirmationId: mainBinding.confirmationId },
    });
  });

  it('re-observes the Topic and performs zero prepare I/O after an external Topic switch', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const currentBinding = seedCurrentConfirmedWorkstream({
      lineSlug: 'line-a',
      workstream: 'ws-a',
      topicId: 'topic-a',
      topicTitle: 'Topic A',
      goalText: 'Goal A',
    });
    wire.dispatch(aitpModeSetPhase({ phase: 'ready' }));
    const modeSvc = await buildRealModeService(adapter);
    const researchSvc = await buildRealResearchService(modeSvc, adapter);
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: currentBinding.lineSlug,
    });
    vi.spyOn(adapter, 'enter').mockResolvedValue({
      schema: 'aitp/enter-0.2',
      memory_status: 'available',
      root: '/workspace',
      topic: {
        id: 'topic-b',
        title: 'Topic B',
        goal: { text: 'Goal B', source: '.aitp/topic/TOPIC.md' },
      },
      recent_entries: [],
      unresolved_failures: [],
      next_action: { status: 'not_established', source: null },
      latest_working_note: null,
      recent_notes: [],
      counts: {
        active: 0,
        superseded: 0,
        unresolved_failures: 0,
        malformed: 0,
        omitted_active: 0,
        active_newer_than_latest_working_note: null,
      },
      warnings: [],
    });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordPrepareTool(
      adapter,
      modeSvc,
      researchSvc,
    ).resolveExecution({
      kind: 'result',
      created_by: 'agent:main',
      workstreams: ['ws-a'],
      checkpoint_id: checkpoint.checkpointId,
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(recordPrepare).not.toHaveBeenCalled();
    expect(researchSvc.getProgram()).toMatchObject({ topicId: 'topic-b' });
    expect(researchSvc.getLineWorkstreamAlignment('line-a')).toMatchObject({ status: 'conflict' });
  });

  it('keeps ordinary prepare and check tools independent from a pending checkpoint', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const check = vi.spyOn(adapter, 'check');
    const harness = makeResearchHarness();
    harness.setStatus('stale');
    const { AitpCheckTool, AitpRecordPrepareTool } = await import(
      '#/features/aitpResearch/tools/aitpAdapterTools'
    );
    const mode = harness.mode;

    await runnableExecution(new AitpRecordPrepareTool(adapter, mode, harness.research).resolveExecution({
      kind: 'result',
      created_by: 'agent:main',
      workstreams: ['ws-a', 'ws-b'],
    })).execute(executionContext);
    await runnableExecution(new AitpCheckTool(adapter, mode).resolveExecution({
      workstream: 'ws-b',
    })).execute(executionContext);

    expect(recordPrepare).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: undefined,
      workstreams: ['ws-a', 'ws-b'],
    }));
    expect(check).toHaveBeenCalledWith({
      workstream: 'ws-b',
      signal: expect.any(AbortSignal),
    });
    expect(harness.bindPendingCheckpointReceipt).not.toHaveBeenCalled();
  });

  it('stops before save when the captured binding becomes stale during pre-save check', async () => {
    const harness = makeResearchHarness(['ws-a']);
    const adapter = makeStubAdapter({
      check: async () => {
        harness.setStatus('stale');
        return cleanScopedCheck();
      },
    });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const recordSave = vi.spyOn(adapter, 'recordSave');
    const { AitpRecordSaveTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const result = await runnableExecution(new AitpRecordSaveTool(
      adapter,
      harness.mode,
      harness.research,
    ).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(recordSave).not.toHaveBeenCalled();
    expect(harness.bindPendingCheckpointReceipt).not.toHaveBeenCalled();
  });

  it('keeps the checkpoint pending without a save receipt when an atomic precondition fails', async () => {
    const harness = makeResearchHarness(['ws-a']);
    const adapter = makeStubAdapter({
      recordSave: async () => {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_ADAPTER_COMMAND_FAILED,
          'AITP command failed: exact workstream changed',
          { details: { aitpCode: 'workstream_precondition_failed' } },
        );
      },
    });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.2', pluginVersion: '0.9.0' });
    const { AitpRecordSaveTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordSaveTool(
      adapter,
      harness.mode,
      harness.research,
    ).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result).toMatchObject({
      isError: true,
      output: expect.stringContaining('exact workstream changed'),
    });
    expect(harness.bindPendingCheckpointReceipt).toHaveBeenCalledWith({
      preSaveCheck: expect.objectContaining({ status: 'clean', errors: 0 }),
    }, undefined);
    expect(harness.research.getPendingCheckpoint()?.receipt?.save).toBeUndefined();
  });

  it('retains a successful canonical save when the captured binding becomes stale during record save', async () => {
    const harness = makeResearchHarness(['ws-a']);
    const adapter = makeStubAdapter({
      recordSave: async () => {
        harness.setStatus('stale');
        return { status: 'saved', path: '.aitp/topic/entries/entry-test.md' };
      },
    });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const mode = harness.mode;
    const { AitpRecordSaveTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const result = await runnableExecution(new AitpRecordSaveTool(
      adapter,
      mode,
      harness.research,
    ).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result).not.toHaveProperty('isError');
    expect(typeof result.output).toBe('string');
    if (typeof result.output !== 'string') throw new Error('Expected text tool output');
    expect(JSON.parse(result.output)).toMatchObject({
      status: 'saved',
      path: '.aitp/topic/entries/entry-test.md',
      hakimi_checkpoint: {
        status: 'receipt_retained_checkpoint_stale',
        checkpoint_id: 'checkpoint-a',
        next_action: expect.stringContaining('Undo'),
      },
    });
    expect(harness.bindPendingCheckpointReceipt).toHaveBeenLastCalledWith({
      save: {
        status: 'saved',
        draftPath: '.aitp/local/drafts/entry-test.md',
        path: '.aitp/topic/entries/entry-test.md',
        source: 'record_save',
      },
    }, 'checkpoint-a');
  });

  it.each([
    ['missing', []],
    ['multiple', ['ws-a', 'ws-b']],
    ['mismatched', ['ws-b']],
  ] as const)('rejects a %s checkpoint prepare receipt before pre-save check', async (_label, workstreams) => {
    const harness = makeResearchHarness(workstreams);
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const check = vi.spyOn(adapter, 'check');
    const recordSave = vi.spyOn(adapter, 'recordSave');
    const { AitpRecordSaveTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const result = await runnableExecution(new AitpRecordSaveTool(
      adapter,
      harness.mode,
      harness.research,
    ).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: 'checkpoint-a',
    })).execute(executionContext);

    expect(result).toMatchObject({ isError: true });
    expect(check).not.toHaveBeenCalled();
    expect(recordSave).not.toHaveBeenCalled();
  });
});

describe('checkpoint receipt tool integration', () => {
  it('keeps a completed prepare/save tuple immutable when prepare is repeated', async () => {
    const adapter = makeStubAdapter({
      show: async ({ id }: { id: string }) => ({
        schema: 'aitp/show-0.1', root: '/workspace', id, status: 'active',
        source: `.aitp/topic/entries/${id}.md`, legacy_derived: false,
        frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
      }),
    });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const binding = seedCurrentConfirmedWorkstream();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );
    const checkpoint = researchSvc.proposeCheckpoint({ expectedRevision: 0, lineSlug: binding.lineSlug });
    researchSvc.bindPendingCheckpointReceipt({
      prepare: {
        status: 'prepared', id: 'entry-test', path: '.aitp/local/drafts/entry-test.md',
        idempotencyKey: checkpoint.idempotencyKey, workstreams: [binding.workstream],
      },
      preSaveCheck: {
        status: 'clean', errors: 0, warnings: 0,
        findingFingerprints: [], errorFindingFingerprints: [], checkedAt: 10,
      },
      save: {
        status: 'saved', draftPath: '.aitp/local/drafts/entry-test.md',
        path: '.aitp/topic/entries/entry-test.md', source: 'record_save',
      },
    });
    const recordPrepare = vi.spyOn(adapter, 'recordPrepare');
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordPrepareTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      kind: 'result', created_by: 'agent:main', workstreams: [binding.workstream],
      checkpoint_id: checkpoint.checkpointId,
    })).execute({ turnId: 1, toolCallId: 'repeat-prepare', signal: new AbortController().signal });

    expect(recordPrepare).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('isError');
    expect(researchSvc.getPendingCheckpoint()?.receipt).toMatchObject({
      prepare: { status: 'prepared', path: '.aitp/local/drafts/entry-test.md' },
      save: {
        status: 'saved',
        draftPath: '.aitp/local/drafts/entry-test.md',
        path: '.aitp/topic/entries/entry-test.md',
      },
      preSaveCheck: { checkedAt: 10 },
    });
    await expect(researchSvc.commitCheckpoint({
      checkpointId: checkpoint.checkpointId,
      entryId: 'entry-test',
    })).resolves.toEqual({ status: 'committed' });
  });

  it('keeps the first pre-save baseline across an already-saved retry', async () => {
    const dirtyFinding = {
      level: 'error' as const,
      code: 'new-error',
      path: '.aitp/topic/entries/entry-test.md',
      message: 'new error after ambiguous save',
    };
    const adapter = makeStubAdapter({
      recordSave: async () => ({
        status: 'already_saved',
        path: '.aitp/topic/entries/entry-test.md',
      }),
      show: async ({ id }: { id: string }) => ({
        schema: 'aitp/show-0.1', root: '/workspace', id, status: 'active',
        source: `.aitp/topic/entries/${id}.md`, legacy_derived: false,
        frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
      }),
      check: async () => ({
        schema: 'aitp/check-report-0.2', root: '/workspace', workstream: 'aitp-main',
        status: 'findings',
        counts: {
          entries: 1, notes: 0, errors: 1, warnings: 0,
          by_code: { 'new-error': { errors: 1, warnings: 0 } },
          outside_scope: { errors: 0, warnings: 0 },
        },
        findings: [dirtyFinding],
      }),
    });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const binding = seedCurrentConfirmedWorkstream();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );
    const checkpoint = researchSvc.proposeCheckpoint({ expectedRevision: 0, lineSlug: binding.lineSlug });
    researchSvc.bindPendingCheckpointReceipt({
      prepare: {
        status: 'prepared', id: 'entry-test', path: '.aitp/local/drafts/entry-test.md',
        idempotencyKey: checkpoint.idempotencyKey, workstreams: [binding.workstream],
      },
      preSaveCheck: {
        status: 'clean', errors: 0, warnings: 0,
        findingFingerprints: [], errorFindingFingerprints: [], checkedAt: 10,
      },
    });
    const checkSpy = vi.spyOn(adapter, 'check');
    const { AitpRecordSaveTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordSaveTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: checkpoint.checkpointId,
    })).execute({ turnId: 1, toolCallId: 'retry-save', signal: new AbortController().signal });

    expect(result).not.toHaveProperty('isError');
    expect(checkSpy).not.toHaveBeenCalled();
    expect(researchSvc.getPendingCheckpoint()?.receipt?.preSaveCheck).toMatchObject({
      status: 'clean', errors: 0, checkedAt: 10,
    });
    await expect(researchSvc.commitCheckpoint({
      checkpointId: checkpoint.checkpointId,
      entryId: 'entry-test',
    })).rejects.toThrow('new error finding');
    expect(checkSpy).toHaveBeenCalledOnce();
    expect(researchSvc.getCommittedCursor()).toBeNull();
  });

  it('reports recovery when the checkpoint question changes during canonical save', async () => {
    let researchSvc!: AgentResearchService;
    let questionId = '';
    const adapter = makeStubAdapter({
      recordSave: async () => {
        researchSvc.updateQuestion({
          questionId,
          assessment: 'Changed during save',
        });
        return { status: 'saved', path: '.aitp/topic/entries/entry-test.md' };
      },
    });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const binding = seedCurrentConfirmedWorkstream();
    const { AgentResearchService: ResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    researchSvc = new ResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );
    const question = researchSvc.createQuestion({ lineSlug: binding.lineSlug, wording: 'Question' });
    questionId = question.id;
    const checkpoint = researchSvc.proposeCheckpoint({
      questionId,
      expectedRevision: researchSvc.getSnapshot().revision,
      lineSlug: binding.lineSlug,
    });
    researchSvc.bindPendingCheckpointReceipt({
      prepare: {
        status: 'prepared', id: 'entry-test', path: '.aitp/local/drafts/entry-test.md',
        idempotencyKey: checkpoint.idempotencyKey, workstreams: [binding.workstream],
      },
    });
    const { AitpRecordSaveTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordSaveTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: checkpoint.checkpointId,
    })).execute({ turnId: 1, toolCallId: 'question-race-save', signal: new AbortController().signal });

    expect(typeof result.output).toBe('string');
    if (typeof result.output !== 'string') throw new Error('Expected text tool output');
    expect(JSON.parse(result.output)).toMatchObject({
      status: 'saved',
      hakimi_checkpoint: {
        status: 'receipt_retained_checkpoint_stale',
        reason: expect.stringContaining('question changed'),
      },
    });
    expect(researchSvc.getPendingCheckpoint()?.receipt?.save).toBeDefined();
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });

  it.each([
    ['active lifecycle', false],
    ['exited lifecycle', true],
  ] as const)('does not degrade the %s after canonical save outlives its pending checkpoint', async (_label, exitMode) => {
    let checkpointId = '';
    let modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const adapter = makeStubAdapter({
      recordSave: async () => {
        wire.dispatch(researchAcknowledgeCheckpoint({ checkpointId }));
        if (exitMode) {
          modeSvc.isActive = false;
          modeSvc.phase = 'inactive';
        }
        return { status: 'saved', path: '.aitp/topic/entries/entry-test.md' };
      },
    });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const binding = seedCurrentConfirmedWorkstream();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: binding.lineSlug,
    });
    checkpointId = checkpoint.checkpointId;
    researchSvc.bindPendingCheckpointReceipt({
      prepare: {
        status: 'prepared', id: 'entry-test', path: '.aitp/local/drafts/entry-test.md',
        idempotencyKey: checkpoint.idempotencyKey, workstreams: [binding.workstream],
      },
      preSaveCheck: {
        status: 'clean', errors: 0, warnings: 0,
        findingFingerprints: [], errorFindingFingerprints: [], checkedAt: 10,
      },
    });
    const { AitpRecordSaveTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordSaveTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-test.md',
      checkpoint_id: checkpoint.checkpointId,
    })).execute({ turnId: 1, toolCallId: 'late-save', signal: new AbortController().signal });

    expect(typeof result.output).toBe('string');
    if (typeof result.output !== 'string') throw new Error('Expected text tool output');
    expect(JSON.parse(result.output)).toMatchObject({
      status: 'saved',
      hakimi_checkpoint: {
        status: 'recovery_required',
        checkpoint_id: checkpoint.checkpointId,
      },
    });
    expect(researchSvc.getPendingCheckpoint()).toBeNull();
    expect(modeSvc._setPhaseCalls).toEqual([]);
  });

  it('captures a post-write save receipt and degrades when the Program changed during adapter I/O', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const binding = seedCurrentConfirmedWorkstream({ workstream: 'magnetic-symmetry' });
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
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: binding.lineSlug,
    });
    researchSvc.bindPendingCheckpointReceipt({
      prepare: {
        status: 'prepared',
        id: 'entry-test',
        path: '.aitp/local/drafts/entry-test.md',
        idempotencyKey: checkpoint.idempotencyKey,
        workstreams: [binding.workstream],
      },
      preSaveCheck: {
        status: 'clean',
        errors: 0,
        warnings: 0,
        findingFingerprints: [],
        errorFindingFingerprints: [],
        checkedAt: 4,
      },
    });
    wire.dispatch(researchSetProgram({
      topicId: binding.topicId,
      title: 'Changed Topic title',
      goalText: 'Not established yet',
      goalSource: '.aitp/topic/TOPIC.md',
      establishedAt: 5,
    }));

    const captured = researchSvc.bindPendingCheckpointReceipt({
      save: {
        status: 'saved',
        draftPath: '.aitp/local/drafts/entry-test.md',
        path: '.aitp/topic/entries/entry-test.md',
        source: 'record_save',
      },
    }, checkpoint.checkpointId);

    expect(captured.receipt?.save).toMatchObject({
      status: 'saved',
      path: '.aitp/topic/entries/entry-test.md',
    });
    expect(modeSvc._setPhaseCalls).toContain('degraded');
    expect(researchSvc.getSnapshot().alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fingerprint: 'research.alert.commit_failed.checkpoint',
        classification: 'active_blocker',
        message: expect.stringContaining('save completed'),
      }),
    ]));
  });

  it('binds prepare, pre-save check, and save receipts to the pending checkpoint', async () => {
    const adapter = makeStubAdapter();
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const binding = seedConfirmedWorkstreamBinding({ workstream: 'magnetic-symmetry' });
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
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: binding.lineSlug,
    });
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
    expect(checkSpy).toHaveBeenCalledWith({
      workstream: 'magnetic-symmetry',
      signal: expect.any(AbortSignal),
    });
    expect(recordSaveSpy).toHaveBeenCalledWith({
      draftPath: '.aitp/local/drafts/entry-test.md',
      expectedTopic: binding.topicId,
      exactWorkstream: 'magnetic-symmetry',
      signal: expect.any(AbortSignal),
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
    const binding = seedConfirmedWorkstreamBinding();
    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1',
        root: '/workspace',
        id: 'entry-e1',
        status: 'active',
        source: '.aitp/topic/entries/entry-e1.md',
        legacy_derived: false,
        frontmatter: { topic: binding.topicId, workstreams: [binding.workstream] },
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
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: binding.lineSlug,
    });
    checkpointIdempotencyKey = checkpoint.idempotencyKey;
    researchSvc.bindPendingCheckpointReceipt({
      prepare: {
        status: 'prepared',
        id: 'entry-e1',
        path: '.aitp/local/drafts/entry-e1.md',
        idempotencyKey: checkpoint.idempotencyKey,
        workstreams: [binding.workstream],
      },
      preSaveCheck: {
        status: 'clean',
        errors: 0,
        warnings: 0,
        findingFingerprints: [],
        errorFindingFingerprints: [],
        checkedAt: 10,
      },
    });
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    await runnableExecution(new AitpRecordPrepareTool(adapter, modeSvc, researchSvc).resolveExecution({
      kind: 'result',
      authority: 'agent',
      created_by: 'agent:main',
      workstreams: [binding.workstream],
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

  it('atomically retains a canonical-existing receipt when the checkpoint question changes', async () => {
    let researchSvc!: AgentResearchService;
    let questionId = '';
    let checkpointIdempotencyKey = '';
    const binding = seedCurrentConfirmedWorkstream();
    const adapter = makeStubAdapter({
      recordPrepare: async () => {
        researchSvc.updateQuestion({ questionId, assessment: 'Changed during prepare retry' });
        return {
          status: 'existing',
          path: '.aitp/topic/entries/entry-e1.md',
          idempotency_key: checkpointIdempotencyKey,
        };
      },
    });
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    const modeSvc = makeStubModeSvc({ isActive: true, phase: 'ready' });
    const { AgentResearchService: ResearchService } = await import(
      '#/features/aitpResearch/research/agentResearchService'
    );
    researchSvc = new ResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );
    const question = researchSvc.createQuestion({ lineSlug: binding.lineSlug, wording: 'Question' });
    questionId = question.id;
    const checkpoint = researchSvc.proposeCheckpoint({
      questionId,
      expectedRevision: researchSvc.getSnapshot().revision,
      lineSlug: binding.lineSlug,
    });
    checkpointIdempotencyKey = checkpoint.idempotencyKey;
    researchSvc.bindPendingCheckpointReceipt({
      prepare: {
        status: 'prepared', id: 'entry-e1', path: '.aitp/local/drafts/entry-e1.md',
        idempotencyKey: checkpoint.idempotencyKey, workstreams: [binding.workstream],
      },
      preSaveCheck: {
        status: 'clean', errors: 0, warnings: 0,
        findingFingerprints: [], errorFindingFingerprints: [], checkedAt: 10,
      },
    });
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');

    const result = await runnableExecution(new AitpRecordPrepareTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      kind: 'result', authority: 'agent', created_by: 'agent:main',
      workstreams: [binding.workstream], checkpoint_id: checkpoint.checkpointId,
    })).execute({ turnId: 1, toolCallId: 'prepare-existing-race', signal: new AbortController().signal });

    expect(typeof result.output).toBe('string');
    if (typeof result.output !== 'string') throw new Error('Expected text tool output');
    expect(JSON.parse(result.output)).toMatchObject({
      status: 'existing',
      hakimi_checkpoint: {
        status: 'receipt_retained_checkpoint_stale',
        reason: expect.stringContaining('question changed'),
      },
    });
    expect(researchSvc.getPendingCheckpoint()?.receipt).toMatchObject({
      prepare: { status: 'existing', path: '.aitp/topic/entries/entry-e1.md' },
      save: {
        status: 'already_saved', source: 'prepare_existing',
        path: '.aitp/topic/entries/entry-e1.md',
      },
      preSaveCheck: { checkedAt: 10 },
    });
    expect(modeSvc._setPhaseCalls).toContain('degraded');
  });

  it('retains canonical-existing without inventing a missing pre-save baseline', async () => {
    let checkpointIdempotencyKey = '';
    const binding = seedCurrentConfirmedWorkstream();
    const adapter = makeStubAdapter({
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
      wire, makeScopeCtx(), eventBus, modeSvc, adapter, makeToolExecutorStub(), makeStubGoalService(),
    );
    const checkpoint = researchSvc.proposeCheckpoint({
      expectedRevision: 0,
      lineSlug: binding.lineSlug,
    });
    checkpointIdempotencyKey = checkpoint.idempotencyKey;
    researchSvc.bindPendingCheckpointReceipt({
      prepare: {
        status: 'prepared', id: 'entry-e1', path: '.aitp/local/drafts/entry-e1.md',
        idempotencyKey: checkpoint.idempotencyKey, workstreams: [binding.workstream],
      },
    });
    const { AitpRecordPrepareTool } = await import('#/features/aitpResearch/tools/aitpAdapterTools');
    await runnableExecution(new AitpRecordPrepareTool(
      adapter, modeSvc, researchSvc,
    ).resolveExecution({
      kind: 'result', authority: 'agent', created_by: 'agent:main',
      workstreams: [binding.workstream], checkpoint_id: checkpoint.checkpointId,
    })).execute({ turnId: 1, toolCallId: 'prepare-existing-no-baseline', signal: new AbortController().signal });

    expect(researchSvc.getPendingCheckpoint()?.receipt).toMatchObject({
      save: { status: 'already_saved', source: 'prepare_existing' },
    });
    expect(researchSvc.getPendingCheckpoint()?.receipt?.preSaveCheck).toBeUndefined();
    await expect(researchSvc.commitCheckpoint({
      checkpointId: checkpoint.checkpointId,
      entryId: 'entry-e1',
    })).rejects.toThrow('no complete AITP prepare/save receipt');
  });
});

describe('launcher argv precision', () => {
  it('pins the compatible Python after probe instead of probing again before a command', async () => {
    const { adapter, spawn } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_RECORD_SAVE), exitCode: 0 },
    ]);

    await adapter.probe();
    await adapter.recordSave({ draftPath: '.aitp/local/drafts/entry-x.md' });

    const pythonProbes = spawn.mock.calls.filter((call) =>
      (call[1] as readonly string[]).includes('-c'));
    expect(pythonProbes).toHaveLength(1);
    expect(findCommandCall(spawn)?.[0]).toBe('python3.13');
  });

  it('enter passes --recent and --workstream', async () => {
    const { adapter, spawn } = buildScriptedAdapter([
      {
        stdout: JSON.stringify({ ...GOLDEN_ENTER_0_2, schema: 'aitp/enter-0.3', workstream: 'ws-1' }),
        exitCode: 0,
      },
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
      {
        stdout: JSON.stringify({ ...GOLDEN_LIST_0_1, schema: 'aitp/list-0.2', workstream: 'ws-1' }),
        exitCode: 0,
      },
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

  it('ordinary record save passes only draft positional (no checkpoint preconditions)', async () => {
    const { adapter, spawn } = buildScriptedAdapter([
      { stdout: JSON.stringify(GOLDEN_RECORD_SAVE), exitCode: 0 },
    ]);
    await adapter.probe();
    await adapter.recordSave({ draftPath: '.aitp/local/drafts/entry-x.md' });
    const saveCall = findCommandCall(spawn);
    const argv = saveCall?.[1] as string[];
    expect(argv).not.toContain('--idempotency-key');
    expect(argv).not.toContain('--expected-topic');
    expect(argv).not.toContain('--exact-workstream');
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
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp1');

    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
        frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
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
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp1');

    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
        frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
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
    proposeBoundCheckpoint({ checkpointId: 'cp1', idempotencyKey: 'key1', createdAt: 1000 });
    bindCompleteCheckpointReceipt('cp1');

    const adapter = makeStubAdapter({
      show: async () => ({
        schema: 'aitp/show-0.1', root: '/workspace', id: 'e1', status: 'active',
        source: '.aitp/topic/entries/entry-e1.md', legacy_derived: false,
        frontmatter: { topic: 't1', workstreams: ['aitp-main'] }, body: '',
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
    expect(output).toContain('using-aitp Skill');
    expect(output).toContain('generic marker');
    expect(output).toContain('distilling-methods Skill');
    expect(output).toContain('only the touched Entry');
    expect(output).toContain('duplicate commit');
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

  it.each(['completed', 'abandoned'] as const)(
    'begins the next action directly after a %s no-delta conclusion', async (status) => {
      const modeSvc = await buildRealModeService();
      const svc = await buildRealResearchService(modeSvc);
      await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
      svc.createLine({ slug: 'main', title: 'Main' });
      const question = svc.createQuestion({ lineSlug: 'main', wording: 'Which explanation survives?' });
      const input = {
        questionId: question.id, kind: 'derivation' as const,
        purpose: 'Check one limiting case.', stopCondition: 'The limiting case is classified.',
      };
      const previous = svc.planAndStartAction(input);
      svc.concludeAction({
        actionId: previous.actionId, status,
        progress: {
          headline: 'Existing limiting case checked', motivation: 'Choose the next discriminating test.',
          workPerformed: 'Revisited the recorded limiting case.', result: 'No new result.',
          mainlineImpact: 'A different candidate needs a bounded check.',
        },
        durability: { status: 'no_durable_delta', rationale: 'Only existing evidence was reviewed.' },
      });
      const before = svc.getSnapshot();
      expect(before.phase).toBe('state_updated');
      expect(() => svc.planAndStartAction({
        ...input, planningLevel: 'planned', actionPlanId: 'missing-plan', actionPlanRevision: 1,
      })).toThrow();
      expect(svc.getSnapshot()).toEqual(before);

      const next = svc.planAndStartAction({ ...input, purpose: 'Check the next candidate.' });

      expect(next.actionId).not.toBe(previous.actionId);
      expect(svc.getSnapshot()).toMatchObject({
        phase: 'action_executing',
        currentAction: { actionId: next.actionId, questionId: question.id, status: 'in_progress' },
        latestProgress: before.latestProgress,
      });
      expect(wire.getModel(ResearchModel).current.revision).toBe(before.revision + 1);
      expect(svc.getPendingCheckpoint()).toBeNull();
    },
  );

  it('keeps explicit approval when beginning after a conclusion boundary', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    Object.assign(wire.getModel(ResearchModel).current, { phase: 'state_updated' });
    const action = svc.planAndStartAction({
      kind: 'experiment', purpose: 'Run a human-reviewed test.', stopCondition: 'One result.',
      requiresHumanApproval: true,
    });
    expect(action.status).toBe('planned');
    expect(svc.getSnapshot()).toMatchObject({
      phase: 'awaiting_human', humanGate: { actionId: action.actionId, kind: 'approval' },
    });
    expect(svc.getSnapshot().humanGate?.resolvedAt).toBeUndefined();
  });

  it.each(['pending', 'gate', 'run', 'action-run'] as const)(
    'does not replace a concluded action with an unresolved %s', async (blocker) => {
      const modeSvc = await buildRealModeService();
      const svc = await buildRealResearchService(modeSvc);
      await modeSvc.enter({ actor: 'user' });
      const run = { jobId: 'job-pending', schedulerState: 'running', stage: 'running', updatedAt: 1 };
      Object.assign(wire.getModel(ResearchModel).current, {
        phase: 'state_updated',
        pendingCheckpoint: blocker === 'pending' ? { checkpointId: 'cp-pending' } : null,
        humanGate: blocker === 'gate' ? { gateId: 'human-pending', kind: 'approval' } : null,
        currentRun: blocker === 'run' ? run : null,
        currentAction: blocker === 'action-run'
          ? { actionId: 'old-action', status: 'completed', run } : null,
      });
      const before = structuredClone(wire.getModel(ResearchModel).current);
      for (const begin of [false, true]) {
        const input = { kind: 'derivation' as const, purpose: 'Next test', stopCondition: 'One result.' };
        expect(() => begin ? svc.planAndStartAction(input) : svc.planAction(input)).toThrow();
        expect(wire.getModel(ResearchModel).current).toEqual(before);
      }
    },
  );

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

  it('keeps standalone phase and progress mutations from stranding a live action', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      kind: 'experiment',
      purpose: 'Run one bounded compatibility check.',
      stopCondition: 'The compatibility result is available.',
    });
    const before = svc.getSnapshot();

    expect(() => svc.setPhase('evaluating')).toThrow('Use ConcludeResearchAction');
    expect(() => svc.recordProgress({
      headline: 'Compatibility check finished',
      motivation: 'Attempt to bypass the action conclusion boundary.',
      workPerformed: 'Ran the compatibility check.',
      result: 'A result is available.',
      mainlineImpact: 'The action still needs a conclusion.',
    })).toThrow('Use ConcludeResearchAction');
    expect(svc.getSnapshot()).toEqual(before);
    expect(svc.getSnapshot().currentAction).toMatchObject({
      actionId: action.actionId,
      status: 'in_progress',
    });
  });

  it('concludes a legacy in-progress action after its phase drifted', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      kind: 'experiment',
      purpose: 'Run one legacy bounded check.',
      stopCondition: 'The legacy check has a classified outcome.',
    });
    Object.assign(wire.getModel(ResearchModel).current, { phase: 'gap_analysis' });

    const conclusion = svc.concludeAction({
      actionId: action.actionId,
      status: 'abandoned',
      progress: {
        headline: 'Recovered the stranded legacy action',
        motivation: 'The action remained live after an older phase mutation.',
        workPerformed: 'Classified the stale action and closed it without a scientific claim.',
        result: 'The stale action no longer blocks the next bounded action.',
        mainlineImpact: 'Research Loop continuation can resume from the current evidence.',
        nextAction: 'Plan the next bounded action from the current Research state.',
      },
      durability: {
        status: 'no_durable_delta',
        rationale: 'State-machine recovery creates no new scientific evidence.',
      },
    });

    expect(conclusion.action.status).toBe('abandoned');
    expect(svc.getSnapshot()).toMatchObject({
      phase: 'state_updated',
      currentAction: { actionId: action.actionId, status: 'abandoned' },
      latestProgress: { headline: 'Recovered the stranded legacy action' },
    });
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
      durability: {
        status: 'no_durable_delta',
        rationale: 'This lifecycle regression does not exercise AITP persistence.',
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
      durability: {
        status: 'no_durable_delta',
        rationale: 'This lifecycle regression does not exercise AITP persistence.',
      },
    });

    expect(conclusion.action.status).toBe('abandoned');
    expect(svc.getSnapshot().phase).toBe('state_updated');
    expect(svc.getSnapshot().latestProgress?.uncertainties).toHaveLength(1);
  });

  it('concludeAction makes no AITP call for no durable delta and blocks duplicate progress', async () => {
    const check = vi.fn(async (): Promise<AitpCheckReport> => ({
      schema: 'aitp/check-report-0.1',
      root: '/workspace',
      status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0 },
      findings: [],
    }));
    const recordPrepare = vi.fn(async (): Promise<AitpRecordPrepareResult> => ({
      status: 'prepared',
      id: 'entry-test',
      path: '.aitp/local/drafts/entry-test.md',
      save_command: 'aitp record save .aitp/local/drafts/entry-test.md',
    }));
    const recordSave = vi.fn(async (): Promise<AitpRecordSaveResult> => ({
      status: 'saved',
      path: '.aitp/topic/entries/entry-test.md',
    }));
    const adapter = makeStubAdapter({ check, recordPrepare, recordSave });
    const modeSvc = await buildRealModeService(adapter);
    const svc = await buildRealResearchService(modeSvc, adapter);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      kind: 'data_analysis',
      purpose: 'Inspect the bounded diagnostic without claiming a milestone.',
      stopCondition: 'The diagnostic has been classified.',
    });
    vi.clearAllMocks();

    const conclusion = svc.concludeAction({
      actionId: action.actionId,
      status: 'completed',
      progress: {
        headline: 'Diagnostic inspected',
        motivation: 'The current state needed one bounded inspection.',
        workPerformed: 'Inspected the diagnostic and found no scientific change.',
        result: 'The diagnostic restates the already recorded state.',
        mainlineImpact: 'No durable scientific state changed.',
      },
      durability: {
        status: 'no_durable_delta',
        rationale: 'The observation is a restatement with no new durable evidence.',
      },
    });

    expect(conclusion.commitCandidate).toBeUndefined();
    expect(svc.getPendingCheckpoint()).toBeNull();
    expect(check).not.toHaveBeenCalled();
    expect(recordPrepare).not.toHaveBeenCalled();
    expect(recordSave).not.toHaveBeenCalled();
    expect(() => svc.recordProgress({
      headline: 'Diagnostic inspected again',
      motivation: 'Attempt to duplicate the conclusion.',
      workPerformed: 'Repeated the same summary.',
      result: 'No additional result.',
      mainlineImpact: 'No additional impact.',
    })).toThrow('already concluded with its progress report');
  });

  it('concludeAction atomically emits one typed durable candidate and retries idempotently', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    seedCurrentConfirmedWorkstream({ lineSlug: 'main', workstream: 'verified-work' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Does the bounded result pass?' });
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      questionId: question.id,
      lineSlug: 'main',
      kind: 'simulation',
      purpose: 'Run and verify one bounded local calculation.',
      stopCondition: 'The output and validation check are available.',
    });
    const input = {
      actionId: action.actionId,
      status: 'completed' as const,
      progress: {
        headline: 'Bounded calculation verified',
        motivation: 'The active question requires a checked calculation.',
        workPerformed: 'Ran the local calculation and checked its output.',
        result: 'The output passed the declared validation check.',
        mainlineImpact: 'The verified result advances the current milestone.',
        nextAction: 'Persist and inspect the canonical result Entry.',
        detail: { tests: ['Validation check passed'], artifactRefs: ['output.log'] },
      },
      durability: {
        status: 'durable_delta' as const,
        entryKind: 'result' as const,
        authority: 'agent' as const,
        provenance: 'agent_verification' as const,
        rationale: 'A new checked result changes the durable scientific state.',
      },
    };

    const first = svc.concludeAction(input);
    const firstSnapshot = svc.getSnapshot();
    const firstCheckpoint = firstSnapshot.pendingCheckpoint;
    expect(first.commitCandidate).toMatchObject({
      sourceActionId: action.actionId,
      entryKind: 'result',
      authority: 'agent',
      provenance: 'agent_verification',
    });
    expect(firstCheckpoint).toMatchObject({
      lineSlug: 'main',
      workstreamBinding: { workstream: 'verified-work' },
      commitCandidate: first.commitCandidate,
    });
    expect(first.commitCandidate?.progressRecordedAt).toBe(first.progress.recordedAt);

    const repeated = svc.concludeAction(input);
    expect(repeated.commitCandidate).toEqual(first.commitCandidate);
    expect(svc.getSnapshot()).toEqual(firstSnapshot);
    expect(() => svc.concludeAction({
      ...input,
      durability: { ...input.durability, rationale: 'A different retry assessment must fail closed.' },
    })).toThrow("not in 'in_progress' status");
  });

  it('carries a concluded candidate through prepare, save, show, check, and checkpoint commit', async () => {
    const check = vi.fn(async ({ workstream }: { workstream?: string } = {}): Promise<AitpCheckReport> => ({
      schema: workstream === undefined ? 'aitp/check-report-0.1' : 'aitp/check-report-0.2',
      root: '/workspace',
      status: 'clean',
      counts: workstream === undefined
        ? { entries: 0, notes: 0, errors: 0, warnings: 0 }
        : {
            entries: 1,
            notes: 0,
            errors: 0,
            warnings: 0,
            by_code: {},
            outside_scope: { errors: 0, warnings: 0 },
          },
      findings: [],
      workstream,
    } as AitpCheckReport));
    const adapter = makeStubAdapter({
      check,
      show: async ({ id }) => ({
        schema: 'aitp/show-0.1',
        root: '/workspace',
        id,
        status: 'active',
        source: `.aitp/topic/entries/entry-${id}.md`,
        legacy_derived: false,
        frontmatter: {
          topic: 't1', workstreams: ['verified-work'],
          kind: 'result', authority: 'agent', created_by: 'agent:main',
        },
        body: 'Verified result.',
      }),
      recordPrepare: async () => ({
        status: 'prepared',
        id: 'entry-durable',
        path: '.aitp/local/drafts/entry-durable.md',
        save_command: 'aitp record save .aitp/local/drafts/entry-durable.md',
      }),
      recordSave: async () => ({
        status: 'saved',
        path: '.aitp/topic/entries/entry-entry-durable.md',
      }),
    });
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const { IAgentProfileService } = await import('#/agent/profile/profile');
    const { IAitpRecordPrepareTool, AitpRecordPrepareTool, IAitpRecordSaveTool, AitpRecordSaveTool } =
      await import('#/features/aitpResearch/tools/aitpAdapterTools');
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(IWireService, wire);
        reg.defineInstance(IAgentScopeContext, makeScopeCtx());
        reg.defineInstance(IEventBus, eventBus);
        reg.defineInstance(IAgentProfileService, makeProfileServiceStub());
        reg.defineInstance(ISessionAitpAdapter, adapter);
        reg.defineInstance(IAgentToolExecutorService, makeToolExecutorStub());
        reg.defineInstance(IAgentGoalService, makeStubGoalService());
        reg.define(IAgentAitpModeService, AgentAitpModeService);
        reg.define(IAgentResearchService, AgentResearchService);
        reg.define(IDurableCommitService, DurableCommitService);
        reg.define(IAitpRecordPrepareTool, AitpRecordPrepareTool);
        reg.define(IAitpRecordSaveTool, AitpRecordSaveTool);
        reg.define(ICommitResearchCheckpointTool, CommitResearchCheckpointTool);
      },
    });
    const modeSvc = ix.get(IAgentAitpModeService);
    const svc = ix.get(IAgentResearchService);
    await modeSvc.enter({ actor: 'user' });
    seedCurrentConfirmedWorkstream({ lineSlug: 'main', workstream: 'verified-work' });
    const question = svc.createQuestion({
      lineSlug: 'main', wording: 'Does the bounded output reproduce the fixed reference?',
      assessment: 'The bounded output has not yet been checked.',
      neededEvidence: ['Checked output', 'Independent physical convergence'],
    });
    svc.setFocus(question.id);
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      lineSlug: 'main',
      questionId: question.id,
      kind: 'simulation',
      purpose: 'Produce one checked durable result.',
      stopCondition: 'The result and check are available.',
    });
    const conclusion = svc.concludeAction({
      actionId: action.actionId,
      status: 'completed',
      progress: {
        headline: 'Durable result checked',
        motivation: 'The active line needs one checked result.',
        workPerformed: 'Produced and checked the bounded output.',
        result: 'The bounded output passed its validation check.',
        mainlineImpact: 'The checked output advances the active line.',
      },
      durability: {
        status: 'durable_delta',
        entryKind: 'result',
        authority: 'agent',
        provenance: 'agent_verification',
        rationale: 'The checked output is new durable evidence.',
      },
    });
    const checkpointId = svc.getPendingCheckpoint()!.checkpointId;
    const context = { turnId: 1, toolCallId: 'tc-s6-barrier', signal: new AbortController().signal };

    const prepared = await runnableExecution(await ix.get(IAitpRecordPrepareTool).resolveExecution({
      kind: 'result',
      authority: 'agent',
      created_by: 'agent:main',
      workstreams: ['verified-work'],
      checkpoint_id: checkpointId,
    })).execute(context);
    expect(prepared.isError).toBeFalsy();
    const saved = await runnableExecution(await ix.get(IAitpRecordSaveTool).resolveExecution({
      draft_path: '.aitp/local/drafts/entry-durable.md',
      checkpoint_id: checkpointId,
    })).execute(context);
    expect(saved.isError).toBeFalsy();
    const committed = await runnableExecution(await ix.get(ICommitResearchCheckpointTool)
      .resolveExecution({ checkpoint_id: checkpointId, entry_id: 'entry-durable' })).execute(context);

    expect(committed.isError).toBeFalsy();
    const afterCommit = svc.getSnapshot().currentQuestion!;
    expect(committed.output).toContain(`question_id=${question.id}, expected_revision=${afterCommit.revision}`);
    expect(committed.output).toContain('saved Entry entry-durable');
    expect(afterCommit.assessment).toBe(question.assessment);
    expect(afterCommit.evidenceRefs).toEqual([]);
    expect(afterCommit.epistemic).toBe(question.epistemic);
    const checksBeforeSynthesis = check.mock.calls.length;
    svc.updateQuestion({
      questionId: question.id, expectedRevision: afterCommit.revision,
      assessment: 'Reference reproduced; physical convergence remains untested.',
      evidenceRefs: ['entry-durable'],
      neededEvidence: ['Independent physical convergence'],
      nextBoundedAction: 'Choose a discriminating convergence test, not a repeat of this output check.',
    });
    expect(svc.getSnapshot().currentQuestion).toMatchObject({
      assessment: 'Reference reproduced; physical convergence remains untested.',
      evidenceRefs: ['entry-durable'], neededEvidence: ['Independent physical convergence'],
      epistemic: question.epistemic,
    });
    expect(check).toHaveBeenCalledTimes(checksBeforeSynthesis);
    expect(svc.getPendingCheckpoint()).toBeNull();
    expect(svc.getCommittedCursor()).toMatchObject({
      checkpointId,
      entryId: 'entry-durable',
      receipt: {
        prepare: { status: 'prepared' },
        save: { status: 'saved' },
        preSaveCheck: { status: 'clean' },
        postSaveCheck: { status: 'clean' },
      },
    });
    expect(conclusion.commitCandidate?.progressRecordedAt).toBe(conclusion.progress.recordedAt);
    expect(svc.getSnapshot().phase).toBe('state_updated');
    expect(svc.planAndStartAction({
      lineSlug: 'main', kind: 'derivation', purpose: 'Interpret the next limiting case.',
      stopCondition: 'The next bounded test has a classified outcome.',
    }).status).toBe('in_progress');
    expect(svc.getCommittedCursor()?.entryId).toBe('entry-durable');
  });

  it('rejects inconsistent candidate provenance without concluding the action', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    seedCurrentConfirmedWorkstream({ lineSlug: 'main', workstream: 'verified-work' });
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      lineSlug: 'main',
      kind: 'derivation',
      purpose: 'Check one bounded derivation.',
      stopCondition: 'The identity has been checked.',
    });

    expect(() => svc.concludeAction({
      actionId: action.actionId,
      status: 'completed',
      progress: {
        headline: 'Identity checked',
        motivation: 'The identity needs verification.',
        workPerformed: 'Derived and checked the identity.',
        result: 'The identity holds in the stated domain.',
        mainlineImpact: 'The derivation supports the active line.',
      },
      durability: {
        status: 'durable_delta',
        entryKind: 'result',
        authority: 'human',
        provenance: 'agent_verification',
        rationale: 'This intentionally mismatched provenance must be rejected.',
      },
    })).toThrow('Keep human assertions/decisions separate');
    expect(svc.getSnapshot()).toMatchObject({
      phase: 'action_executing',
      currentAction: { actionId: action.actionId, status: 'in_progress' },
    });
    expect(svc.getPendingCheckpoint()).toBeNull();
  });

  it('blocks dependent Question and Line closure until a durable candidate commits', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    seedCurrentConfirmedWorkstream({ lineSlug: 'main', workstream: 'verified-work' });
    const question = svc.createQuestion({ lineSlug: 'main', wording: 'Can this line close?' });
    svc.setPhase('gap_analysis');
    const action = svc.planAndStartAction({
      questionId: question.id,
      lineSlug: 'main',
      kind: 'derivation',
      purpose: 'Establish the final bounded relation.',
      stopCondition: 'The relation has been checked.',
    });
    svc.concludeAction({
      actionId: action.actionId,
      status: 'completed',
      progress: {
        headline: 'Final relation checked',
        motivation: 'The question needs a final relation.',
        workPerformed: 'Derived and independently checked the relation.',
        result: 'The relation passes the declared check.',
        mainlineImpact: 'The question may close only after durable persistence.',
      },
      durability: {
        status: 'durable_delta',
        entryKind: 'result',
        authority: 'agent',
        provenance: 'agent_verification',
        rationale: 'The checked relation is a new durable result.',
      },
    });

    expect(() => svc.updateQuestion({ questionId: question.id, workflow: 'closed' }))
      .toThrow('pending durable commit');
    expect(() => svc.steer({
      kind: 'close_question',
      questionId: question.id,
      expectedRevision: svc.getSnapshot().revision,
    })).toThrow('pending durable commit');
    expect(() => svc.updateLine({ slug: 'main', status: 'completed' }))
      .toThrow('pending durable commit');
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
      durability: {
        status: 'no_durable_delta',
        rationale: 'An action that never started cannot produce a durable delta.',
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

  it('restores awaiting_human before resolving a cold-replayed unresolved gate with phase drift', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('orienting');
    const gate = svc.requestHumanDecision({
      kind: 'decision', prompt: 'Choose the next bounded research action',
    });

    const restored = wire.getModel(ResearchModel).current as unknown as {
      phase: 'state_updated';
    };
    restored.phase = 'state_updated';

    svc.noteLoopBoundary();

    expect(svc.getSnapshot()).toMatchObject({
      phase: 'awaiting_human',
      humanGate: { gateId: gate.gateId, resolvedAt: undefined },
      recentStateChange: {
        beforePhase: 'state_updated',
        afterPhase: 'awaiting_human',
        summary: expect.stringContaining(`Recovered unresolved human gate ${gate.gateId}`),
      },
    });
    svc.resolveHumanDecision({
      gateId: gate.gateId,
      resolution: 'Continue with the bounded evidence check.',
      nextPhase: 'gap_analysis',
    });
    expect(svc.getSnapshot().phase).toBe('gap_analysis');
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

  it('starts a matching approval-gated action when permission mode switches to auto', async () => {
    const modeSvc = await buildRealModeService();
    const permissionMode = makeMutablePermissionMode('manual');
    const svc = await buildRealResearchService(modeSvc, undefined, permissionMode.service);
    await modeSvc.enter({ actor: 'user' });
    const action = svc.planAction({
      kind: 'simulation',
      purpose: 'run the bounded remote diagnostic',
      stopCondition: 'the diagnostic artifact is available',
      requiresHumanApproval: true,
    });
    svc.requestHumanDecision({
      kind: 'approval',
      actionId: action.actionId,
      prompt: 'Approve the bounded remote diagnostic',
    });

    permissionMode.setMode('auto');

    expect(svc.getSnapshot()).toMatchObject({
      phase: 'action_executing',
      currentAction: { actionId: action.actionId, status: 'in_progress' },
      humanGate: {
        actionId: action.actionId,
        resolution: expect.stringContaining('Standing auto permission applied'),
        resolvedAt: expect.any(Number),
      },
    });
  });

  it('does not start a matching approval-gated action while the Research loop is paused', async () => {
    const modeSvc = await buildRealModeService();
    const permissionMode = makeMutablePermissionMode('manual');
    const svc = await buildRealResearchService(modeSvc, undefined, permissionMode.service);
    await modeSvc.enter({ actor: 'user' });
    const action = svc.planAction({
      kind: 'simulation',
      purpose: 'run the bounded remote diagnostic after the loop resumes',
      stopCondition: 'the diagnostic artifact is available',
      requiresHumanApproval: true,
    });
    const gate = svc.requestHumanDecision({
      kind: 'approval',
      actionId: action.actionId,
      prompt: 'Approve the bounded remote diagnostic',
    });
    modeSvc.pauseLoop(svc.getSnapshot().revision);

    permissionMode.setMode('auto');

    expect(svc.getSnapshot()).toMatchObject({
      loopStatus: 'paused',
      phase: 'awaiting_human',
      currentAction: { actionId: action.actionId, status: 'planned' },
      humanGate: { gateId: gate.gateId },
    });
    expect(svc.getSnapshot().humanGate?.resolvedAt).toBeUndefined();

    modeSvc.resumeLoop(svc.getSnapshot().revision);
    expect(svc.getSnapshot()).toMatchObject({
      loopStatus: 'active',
      phase: 'action_executing',
      currentAction: { actionId: action.actionId, status: 'in_progress' },
      humanGate: {
        gateId: gate.gateId,
        resolution: expect.stringContaining('Standing auto permission applied'),
        resolvedAt: expect.any(Number),
      },
    });
  });

  it.each([
    { kind: 'decision' as const, prompt: 'Choose between the competing physical interpretations' },
    { kind: 'approval' as const, prompt: 'Approve an action-less protocol exception' },
  ])('keeps an action-less $kind gate unresolved when permission mode switches to auto', async ({ kind, prompt }) => {
    const modeSvc = await buildRealModeService();
    const permissionMode = makeMutablePermissionMode('manual');
    const svc = await buildRealResearchService(modeSvc, undefined, permissionMode.service);
    await modeSvc.enter({ actor: 'user' });
    svc.setPhase('orienting');
    const gate = svc.requestHumanDecision({
      kind,
      prompt,
    });

    permissionMode.setMode('auto');

    expect(svc.getSnapshot()).toMatchObject({
      phase: 'awaiting_human',
      humanGate: { gateId: gate.gateId },
    });
    expect(svc.getSnapshot().humanGate?.resolvedAt).toBeUndefined();
  });

  it('keeps an action-linked review gate unresolved when permission mode switches to auto', async () => {
    const modeSvc = await buildRealModeService();
    const permissionMode = makeMutablePermissionMode('manual');
    const svc = await buildRealResearchService(modeSvc, undefined, permissionMode.service);
    await modeSvc.enter({ actor: 'user' });
    const action = svc.planAction({
      kind: 'data_analysis',
      purpose: 'review the competing physical interpretations',
      stopCondition: 'the review records a choice',
      requiresHumanApproval: true,
    });
    const gate = svc.requestHumanDecision({
      kind: 'review',
      actionId: action.actionId,
      prompt: 'Review the competing physical interpretations',
    });

    permissionMode.setMode('auto');

    expect(svc.getSnapshot()).toMatchObject({
      phase: 'awaiting_human',
      currentAction: { actionId: action.actionId, status: 'planned' },
      humanGate: { gateId: gate.gateId, kind: 'review' },
    });
    expect(svc.getSnapshot().humanGate?.resolvedAt).toBeUndefined();
  });

  it('recovers a matching approval-gated action after an auto-mode cold restore', async () => {
    const modeSvc = await buildRealModeService();
    await modeSvc.enter({ actor: 'user' });
    const legacySvc = await buildRealResearchService(modeSvc);
    const action = legacySvc.planAction({
      kind: 'experiment',
      purpose: 'run the legacy bounded diagnostic',
      stopCondition: 'the legacy diagnostic completes',
      requiresHumanApproval: true,
    });
    legacySvc.requestHumanDecision({
      kind: 'approval',
      actionId: action.actionId,
      prompt: 'Approve the legacy bounded diagnostic',
    });
    legacySvc.dispose();
    await wire.flush();

    const restoredSvc = await buildRealResearchService(
      modeSvc,
      undefined,
      stubPermissionModeService(() => 'auto'),
    );
    await wire.restore();

    expect(restoredSvc.getSnapshot()).toMatchObject({
      phase: 'action_executing',
      currentAction: { actionId: action.actionId, status: 'in_progress' },
      humanGate: {
        actionId: action.actionId,
        resolution: expect.stringContaining('Standing auto permission applied'),
        resolvedAt: expect.any(Number),
      },
    });
  });

  it('keeps a matching approval gate unresolved after an auto-mode paused restore', async () => {
    const modeSvc = await buildRealModeService();
    await modeSvc.enter({ actor: 'user' });
    const legacySvc = await buildRealResearchService(modeSvc);
    const action = legacySvc.planAction({
      kind: 'experiment',
      purpose: 'run the restored diagnostic only after the loop resumes',
      stopCondition: 'the restored diagnostic completes',
      requiresHumanApproval: true,
    });
    const gate = legacySvc.requestHumanDecision({
      kind: 'approval',
      actionId: action.actionId,
      prompt: 'Approve the restored diagnostic',
    });
    modeSvc.pauseLoop(legacySvc.getSnapshot().revision);
    legacySvc.dispose();
    await wire.flush();

    const restoredSvc = await buildRealResearchService(
      modeSvc,
      undefined,
      stubPermissionModeService(() => 'auto'),
    );
    await wire.restore();

    expect(restoredSvc.getSnapshot()).toMatchObject({
      loopStatus: 'paused',
      phase: 'awaiting_human',
      currentAction: { actionId: action.actionId, status: 'planned' },
      humanGate: { gateId: gate.gateId },
    });
    expect(restoredSvc.getSnapshot().humanGate?.resolvedAt).toBeUndefined();
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

  it('rejects a new gate resolution that would strand a live action', async () => {
    const modeSvc = await buildRealModeService();
    const svc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    const action = svc.planAndStartAction({
      kind: 'experiment',
      purpose: 'Run one bounded diagnostic.',
      stopCondition: 'The diagnostic has a checked result.',
    });
    const gate = svc.requestHumanDecision({
      kind: 'decision',
      actionId: action.actionId,
      prompt: 'Choose how to interpret the diagnostic evidence.',
    });

    expect(() => svc.resolveHumanDecision({
      gateId: gate.gateId,
      resolution: 'Continue with the checked evidence.',
      nextPhase: 'gap_analysis',
    })).toThrow('resolve its gate to action_executing');
    expect(svc.getSnapshot()).toMatchObject({
      phase: 'awaiting_human',
      currentAction: { actionId: action.actionId, status: 'in_progress' },
      humanGate: { gateId: gate.gateId, resolvedAt: undefined },
    });

    svc.resolveHumanDecision({
      gateId: gate.gateId,
      resolution: 'Continue with the checked evidence.',
      nextPhase: 'action_executing',
    });
    expect(svc.getSnapshot()).toMatchObject({
      phase: 'action_executing',
      currentAction: { actionId: action.actionId, status: 'in_progress' },
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
      gateId: gate.gateId, resolution: 'ignored', nextPhase: 'state_updated' as never,
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
      kind: 'experiment', purpose: 'long enough purpose', expected_evidence: ['measured output'], stop_condition: 'done',
    }).success).toBe(true);
    expect(schemas.PlanResearchActionInputSchema.safeParse({
      kind: 'experiment', purpose: 'long enough purpose', stop_condition: 'done',
    }).success).toBe(false);
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
      durability: {
        status: 'no_durable_delta',
        rationale: 'This schema example does not claim a durable scientific delta.',
      },
    };
    expect(schemas.ConcludeResearchActionInputSchema.safeParse(base).success).toBe(true);
    expect(schemas.ConcludeResearchActionInputSchema.safeParse({
      ...base,
      durability: undefined,
    }).success).toBe(false);
    expect(schemas.ConcludeResearchActionInputSchema.safeParse({
      ...base,
      phase_change: { from: 'evaluating', to: 'state_updated' },
    }).success).toBe(false);
    expect(schemas.ConcludeResearchActionInputSchema.safeParse({
      ...base,
      human_decision: 'Do not merge this human decision into agent verification.',
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
      durability: {
        status: 'no_durable_delta',
        rationale: 'This schema example does not claim a durable scientific delta.',
      },
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

  it('PrepareResearchPlanV2InputSchema rejects stale milestone references', async () => {
    const { PrepareResearchPlanV2InputSchema } = await import(
      '#/features/aitpResearch/tools/researchPlanV2Tools'
    );
    const input = {
      objective: 'Validate one milestone.',
      milestones: [{
        milestone_id: 'm1',
        title: 'Run and validate',
        objective: 'Run one calculation.',
        completion_criterion: 'Validation passes.',
        evidence_requirements: [],
      }],
      evidence_requirements: [],
      decision_points: [],
      assumptions: [],
      current_milestone_id: 'missing',
      stop_conditions: ['Stop on failure.'],
      replan_conditions: ['Replan on drift.'],
    };
    expect(PrepareResearchPlanV2InputSchema.safeParse(input).success).toBe(false);
    expect(PrepareResearchPlanV2InputSchema.safeParse({
      ...input,
      current_milestone_id: 'm1',
    }).success).toBe(true);
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
    permissionMode?: IAgentPermissionModeService,
  ): Promise<T> {
    const mod = await import('#/features/aitpResearch/tools/researchToolsImpl');
    const ToolCls = (mod as unknown as Record<string, new (
      research: import('#/features/aitpResearch/research/agentResearch').IAgentResearchService,
      mode: import('#/features/aitpResearch/mode/agentAitpMode').IAgentAitpModeService,
      permissionMode?: IAgentPermissionModeService,
    ) => T>)[cls.name];
    if (ToolCls === undefined) throw new Error(`Tool ${cls.name} not found`);
    return new ToolCls(researchSvc, modeSvc, permissionMode);
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
      expected_evidence: ['measured hypothesis response'],
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
    expect(tool.description).toContain('first read the relevant canonical Entries');
    expect(tool.description).toContain('through UpdateResearchQuestion, then begin a fresh Question-bound Note Action');
    expect(tool.description).toContain('changing its refs afterward invalidates that scope');
    expect(tool.description).toContain('Reuse an adequate existing Note when there is no durable delta');
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
    expect(result.output).toContain('retrieve applicable Method cards by their generic marker');
  });

  it('PlanResearchAction normalizes a requested approval to false in auto mode', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('orienting');
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).PlanResearchActionTool,
      researchSvc,
      modeSvc,
      stubPermissionModeService(() => 'auto'),
    );

    const result = await runnableExecution(tool.resolveExecution({
      kind: 'simulation',
      purpose: 'Plan the routine remote diagnostic inside the requested scope',
      expected_evidence: ['diagnostic output'],
      stop_condition: 'the diagnostic output is available',
      allowed_tool_kinds: ['Bash'],
      requires_human_approval: true,
    })).execute({ turnId: 1, toolCallId: 'tc-auto-plan', signal: new AbortController().signal });

    expect(result.isError).toBeFalsy();
    expect(researchSvc.getSnapshot()).toMatchObject({
      phase: 'action_planned',
      currentAction: { status: 'planned', requiresHumanApproval: false },
    });
    expect(researchSvc.getSnapshot().humanGate).toBeUndefined();
  });

  it('BeginResearchAction starts instead of gating a routine action in auto mode', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('orienting');
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).BeginResearchActionTool,
      researchSvc,
      modeSvc,
      stubPermissionModeService(() => 'auto'),
    );

    const result = await runnableExecution(tool.resolveExecution({
      kind: 'simulation',
      purpose: 'Run the routine remote diagnostic inside the requested scope',
      expected_evidence: ['diagnostic output'],
      stop_condition: 'the diagnostic output is available',
      allowed_tool_kinds: ['Bash'],
      requires_human_approval: true,
    })).execute({ turnId: 1, toolCallId: 'tc-auto-begin', signal: new AbortController().signal });

    expect(result.isError).toBeFalsy();
    expect(researchSvc.getSnapshot()).toMatchObject({
      phase: 'action_executing',
      currentAction: { status: 'in_progress', requiresHumanApproval: false },
    });
    expect(researchSvc.getSnapshot().humanGate).toBeUndefined();
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
      durability: {
        status: 'no_durable_delta',
        rationale: 'This tool-output regression does not exercise AITP persistence.',
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
    expect(output).toContain('update the local Question only where its assessment, evidence, or next step is behind');
    expect(output).not.toContain('Finish this checkpoint before updating');
  });

  it('ConcludeResearchAction returns the exact same-turn durable commit route', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    seedCurrentConfirmedWorkstream({ lineSlug: 'main', workstream: 'verified-work' });
    researchSvc.setPhase('orienting');
    const actionTool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).BeginResearchActionTool,
      researchSvc, modeSvc,
    );
    await runnableExecution(actionTool.resolveExecution({
      line_slug: 'main',
      kind: 'simulation',
      purpose: 'Run and verify one bounded calculation.',
      expected_evidence: ['validated output'],
      stop_condition: 'the validated output is available',
      allowed_tool_kinds: [],
      requires_human_approval: false,
    })).execute({ turnId: 1, toolCallId: 'tc-durable-begin', signal: new AbortController().signal });
    const actionId = researchSvc.getSnapshot().currentAction!.actionId;
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).ConcludeResearchActionTool,
      researchSvc, modeSvc,
    );

    const result = await runnableExecution(tool.resolveExecution({
      action_id: actionId,
      status: 'completed',
      headline: 'Calculation output verified',
      motivation: 'The active line needs one checked result.',
      work_performed: 'Ran the calculation and checked the output.',
      result: 'The output passed the declared validation check.',
      mainline_impact: 'The checked result advances the current line.',
      uncertainties: [],
      durability: {
        status: 'durable_delta',
        entry_kind: 'result',
        authority: 'agent',
        provenance: 'agent_verification',
        rationale: 'A new checked result changes the durable scientific state.',
      },
    })).execute({ turnId: 1, toolCallId: 'tc-durable-end', signal: new AbortController().signal });

    expect(result.isError).toBeFalsy();
    expect(typeof result.output).toBe('string');
    if (typeof result.output !== 'string') throw new Error('Expected text tool output');
    const output = result.output;
    const checkpoint = researchSvc.getPendingCheckpoint()!;
    expect(output).toContain(`Pending checkpoint: ${checkpoint.checkpointId}`);
    expect(output).toContain('kind=result, authority=agent, created_by=agent:main');
    expect(output).toContain('workstreams=[verified-work]');
    expect(output).toContain('external distilling-methods Skill');
    expect(output).toContain('exact-pins a retrieved card or carries an observation marker');
    expect(output).toContain('Do not call RecordResearchProgress again');
    expect(output).toContain('Finish this checkpoint before updating its captured Question');
    expect(output).not.toContain('only if the scientific interpretation changed');
  });

  it('ConcludeResearchAction retains unbound counterevidence without claiming an AITP commit route', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('orienting');
    const action = researchSvc.planAndStartAction({
      kind: 'derivation', purpose: 'Check one exact limiting case.',
      expectedEvidence: ['A checked scalar counterexample'], stopCondition: 'The comparison is decided.',
    });
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).ConcludeResearchActionTool,
      researchSvc, modeSvc,
    );
    const result = await runnableExecution(tool.resolveExecution({
      action_id: action.actionId, status: 'completed', headline: 'One exact counterexample',
      motivation: 'Test the candidate identity.', work_performed: 'Compared exact coefficients.',
      result: 'The coefficients disagree.', mainline_impact: 'Revalidate the affected convention.',
      uncertainties: [],
      detail: { tests: ['Exact scalar comparison'], limitations: ['Not a many-body obstruction proof.'] },
      durability: {
        status: 'durable_delta', entry_kind: 'failure', authority: 'agent',
        provenance: 'agent_verification', rationale: 'A verified counterexample changes the assessment.',
      },
    })).execute({ turnId: 1, toolCallId: 'tc-local-conclude', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output.startsWith('Scientific work:')).toBe(true);
    expect(output).toContain('The coefficients disagree.');
    expect(output).toContain('Not a many-body obstruction proof.');
    expect(output).toContain(`Local conclusion ID: ${action.actionId}`);
    expect(output).toContain('not in the AITP ledger');
    expect(output).toContain('Ask the researcher once to confirm record ownership');
    expect(output).not.toContain('Pending checkpoint:');
    expect(output).not.toContain('call aitp_record_prepare');
    expect(output).not.toContain('Durability: no durable delta');
    expect(researchSvc.getSnapshot()).toMatchObject({
      phase: 'state_updated', currentAction: { status: 'completed' },
      localConclusion: { candidate: { sourceActionId: action.actionId, entryKind: 'failure' } },
    });
    expect(researchSvc.getPendingCheckpoint()).toBeNull();
  });

  it.each([
    'current', 'other_line', 'other_question', 'new_revision', 'pending_again',
    'new_cursor', 'paused', 'degraded', 'no_question',
  ])('scopes post-commit Question synthesis guidance to the settled current context: %s', async (scenario) => {
    const { researchSvc } = await buildToolHarness();
    const question = researchSvc.createQuestion({
      wording: 'Does the fixed benchmark reproduce?', lineSlug: 'main',
      assessment: 'Not yet checked.',
    });
    const checkpoint: ResearchCheckpoint = {
      checkpointId: 'cp-synthesis', questionId: scenario === 'no_question' ? undefined : question.id,
      questionRevision: question.revision, lineSlug: 'main', idempotencyKey: 'synthesis-key',
      persistence: 'pending_commit', createdAt: 1,
    };
    const snapshot: ResearchStatusSnapshot = {
      ...researchSvc.getSnapshot(),
      mode: scenario === 'degraded' ? 'degraded' : 'ready',
      loopStatus: scenario === 'paused' ? 'paused' : 'active',
      currentLineSlug: scenario === 'other_line' ? 'other' : 'main',
      currentQuestion: {
        ...question, id: scenario === 'other_question' ? 'another-question' : question.id,
        revision: question.revision + (scenario === 'new_revision' ? 2 : 1),
      },
      pendingCheckpoint: scenario === 'pending_again' ? checkpoint : undefined,
      latestCommittedCheckpoint: {
        checkpointId: scenario === 'new_cursor' ? 'new-checkpoint' : checkpoint.checkpointId,
        entryId: 'entry-synthesis', committedAt: 2,
      },
    };
    const before = structuredClone(snapshot);
    const commitCheckpoint = vi.fn()
      .mockResolvedValueOnce({ status: 'committed' })
      .mockResolvedValueOnce({ status: 'already_committed' });
    const updateQuestion = vi.fn();
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.definePartialInstance(IAgentResearchService, {
          commitCheckpoint, updateQuestion,
          getPendingCheckpoint: () => checkpoint,
          getSnapshot: () => snapshot,
        });
        reg.definePartialInstance(IAgentAitpModeService, { isActive: true });
        reg.definePartialInstance(IAitpDistillationHandoffService, {
          prepare: async () => ({ status: 'unavailable', reason: 'Fixture has no Skill.' }),
        });
        reg.define(ICommitResearchCheckpointTool, CommitResearchCheckpointTool);
      },
    });
    const result = await runnableExecution(await ix.get(ICommitResearchCheckpointTool).resolveExecution({
      checkpoint_id: checkpoint.checkpointId, entry_id: 'entry-synthesis',
    })).execute({ turnId: 1, toolCallId: 'tc-synthesis', signal: new AbortController().signal });
    expect(result.isError).toBeFalsy();
    if (scenario === 'current') {
      expect(result.output).toContain(`question_id=${question.id}, expected_revision=${question.revision + 1}`);
      expect(result.output).toContain('saved Entry entry-synthesis');
      expect(result.output).toContain('preserve relevant existing evidence_refs');
      expect(result.output).toContain('not scientific acceptance');
    } else {
      expect(result.output).not.toContain('UpdateResearchQuestion');
    }
    expect(updateQuestion).not.toHaveBeenCalled();
    expect(snapshot).toEqual(before);
    const duplicate = await runnableExecution(await ix.get(ICommitResearchCheckpointTool).resolveExecution({
      checkpoint_id: checkpoint.checkpointId, entry_id: 'entry-synthesis',
    })).execute({ turnId: 1, toolCallId: 'tc-synthesis-duplicate', signal: new AbortController().signal });
    expect(duplicate.output).toContain('no-op for this duplicate commit');
    expect(duplicate.output).not.toContain('UpdateResearchQuestion');
  });

  it('schedules one bounded post-commit handoff and no-ops on a duplicate commit', async () => {
    const commitCheckpoint = vi.fn()
      .mockResolvedValueOnce({ status: 'committed' })
      .mockResolvedValueOnce({ status: 'already_committed' });
    const delivery = {
      kind: 'steer' as const,
      message: { role: 'user' as const, content: [{ type: 'text' as const, text: 'loaded' }] },
    };
    const prepare = vi.fn().mockResolvedValue({ status: 'scheduled', delivery });
    const ix = createServices(disposables, {
      strict: true,
      additionalServices: (reg) => {
        reg.definePartialInstance(IAgentResearchService, {
          commitCheckpoint,
          getPendingCheckpoint: () => null,
        });
        reg.definePartialInstance(IAgentAitpModeService, { isActive: true });
        reg.definePartialInstance(IAitpDistillationHandoffService, { prepare });
        reg.define(ICommitResearchCheckpointTool, CommitResearchCheckpointTool);
      },
    });
    const tool = ix.get(ICommitResearchCheckpointTool);
    const context = {
      turnId: 1,
      toolCallId: 'tc-s7-handoff',
      signal: new AbortController().signal,
    };

    const first = await runnableExecution(await tool.resolveExecution({
      checkpoint_id: 'cp-s7',
      entry_id: 'entry-s7',
    })).execute(context);
    const duplicate = await runnableExecution(await tool.resolveExecution({
      checkpoint_id: 'cp-s7',
      entry_id: 'entry-s7',
    })).execute(context);

    expect(first.isError).toBeFalsy();
    expect(first.delivery).toEqual(delivery);
    expect(first.output).toContain('one bounded review scheduled for touched Entry entry-s7');
    expect(duplicate.delivery).toBeUndefined();
    expect(duplicate.output).toContain('no-op for this duplicate commit');
    expect(duplicate.output).not.toContain('UpdateResearchQuestion');
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledWith({ checkpointId: 'cp-s7', entryId: 'entry-s7' });
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

  it('RequestResearchDecision keeps non-delegable Research decisions human-owned in auto mode', async () => {
    const { modeSvc, researchSvc } = await buildToolHarness();
    researchSvc.setPhase('orienting');
    const tool = await makeTool(
      (await import('#/features/aitpResearch/tools/researchToolsImpl')).RequestResearchDecisionTool,
      researchSvc,
      modeSvc,
      stubPermissionModeService(() => 'auto'),
    );

    const result = await runnableExecution(tool.resolveExecution({
      kind: 'decision',
      prompt: 'Which physical convention should define the observable?',
    })).execute({ turnId: 1, toolCallId: 'tc-auto-request', signal: new AbortController().signal });

    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('Human decision requested');
    expect(result.output).toContain('Which physical convention should define the observable?');
    expect(researchSvc.getSnapshot().phase).toBe('awaiting_human');
    expect(researchSvc.getSnapshot().humanGate?.kind).toBe('decision');
    expect(researchSvc.getSnapshot().humanGate?.prompt).toBe('Which physical convention should define the observable?');
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
      expected_evidence: ['bounded action result'],
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
  it('brief distinguishes the AITP goal from the Hakimi Research Goal on a new turn', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    const snapshot: ResearchStatusSnapshot = {
      ...researchSvc.getSnapshot(),
      program: {
        topicId: 'topic-example',
        title: 'Example research program',
        goalText: 'Establish the bounded research result.',
        goalSource: '.aitp/topic/TOPIC.md',
        establishedAt: 1,
        observedRevision: 1,
      },
      researchGoal: {
        schema: 'hakimi/research-goal-0.1',
        goalId: 'goal-1',
        objective: 'Validate the next bounded overlap diagnostic.',
        completionCriterion: 'The diagnostic passes its bounded acceptance checks.',
        scope: {
          programTopicId: 'topic-example',
          lineSlug: 'main',
          questionId: 'question-1',
        },
        nonGoals: [],
        budget: {
          tokenBudget: null,
          turnBudget: 4,
          wallClockBudgetMs: null,
          remainingTokens: null,
          remainingTurns: 3,
          remainingWallClockMs: null,
          tokenBudgetReached: false,
          turnBudgetReached: false,
          wallClockBudgetReached: false,
          overBudget: false,
        },
        stopConditions: [{
          code: 'goal.budget.turns',
          reached: false,
          reason: 'The Goal turn budget remains available.',
        }],
        status: 'active',
        programRelation: {
          status: 'aligned',
          reason: 'Confirmed as goal_parent_of_program.',
        },
        humanGates: [],
        persistenceGuards: [{
          code: 'research.checkpoint.pending',
          status: 'blocked',
          reason: 'A research checkpoint is pending commit.',
        }],
        researchRevision: 3,
      },
    };

    const output = renderResearchInjection(snapshot, 'brief').content;

    expect(output).toContain(
      'AITP Research Goal (observed): Establish the bounded research result.',
    );
    expect(output).toContain('Hakimi Research Goal: Validate the next bounded overlap diagnostic.');
    expect(output).toContain('scope: program topic-example · line main · question question-1');
    expect(output).toContain('persistence blockers: A research checkpoint is pending commit.');
    expect(output).toContain('Local Research Loop: current line/question and bounded action state.');
    expect(output).not.toContain('Confirmed as');
  });

  it('requests a new brief when Goal alignment changes within a turn', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    const before: ResearchStatusSnapshot = {
      ...researchSvc.getSnapshot(),
      goalAlignment: {
        status: 'confirmation_required',
        reason: 'Confirm the explicit relationship.',
      },
    };
    const disclosure = renderResearchInjection(before, 'brief').disclosure;
    const after: ResearchStatusSnapshot = {
      ...before,
      goalAlignment: {
        status: 'aligned',
        reason: 'Confirmed as goal_parent_of_program.',
        binding: {
          relation: 'goal_parent_of_program', goalId: 'goal-1', topicId: 'topic-1', observedRevision: 1, confirmedAt: 1,
        },
      },
    };

    expect(resolveResearchVerbosity({ isNewTurn: false, lastDisclosure: disclosure }, after)).toBe('brief');
    expect(renderResearchInjection(before, 'brief').content).toContain('Goal alignment: confirmation_required');
  });

  it('requests a new brief when the Research goal changes within a turn', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    const before: ResearchStatusSnapshot = {
      ...researchSvc.getSnapshot(),
      program: {
        topicId: 'topic-example',
        title: 'Example research program',
        goalText: 'Establish the bounded research result.',
        goalSource: '.aitp/topic/TOPIC.md',
        establishedAt: 1,
        observedRevision: 1,
      },
    };
    const disclosure = renderResearchInjection(before, 'brief').disclosure;
    const after: ResearchStatusSnapshot = {
      ...before,
      program: {
        ...before.program!,
        goalText: 'Establish and validate the bounded research result.',
      },
    };

    const verbosity = resolveResearchVerbosity(
      { isNewTurn: false, lastDisclosure: disclosure },
      after,
    );

    expect(verbosity).toBe('brief');
  });

  it('requests a new brief when the Research Goal projection changes within a turn', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    const before: ResearchStatusSnapshot = {
      ...researchSvc.getSnapshot(),
      goalSummary: {
        goalId: 'goal-1',
        objective: 'Validate the overlap diagnostic.',
        status: 'active',
      },
    };
    const disclosure = renderResearchInjection(before, 'brief').disclosure;
    const after: ResearchStatusSnapshot = {
      ...before,
      goalSummary: {
        goalId: 'goal-1',
        objective: 'Validate the reciprocal-space reference.',
        status: 'active',
      },
    };

    const verbosity = resolveResearchVerbosity(
      { isNewTurn: false, lastDisclosure: disclosure },
      after,
    );

    expect(verbosity).toBe('brief');
  });

  it('routes collaborative planning through the question broker and makes dreaming assumptions explicit', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user' });
    const collaborative = researchSvc.getSnapshot();
    const disclosure = renderResearchInjection(collaborative, 'brief').disclosure;
    const collaborativeText = renderResearchInjection(collaborative, 'brief').content;
    expect(collaborativeText).toContain('Planning policy: collaborative');
    expect(collaborativeText).toContain('ask through AskUserQuestion only when a consequential unknown');
    expect(collaborativeText).toContain('cannot be resolved from the active Goal');
    expect(collaborativeText).toContain('permission mode suppresses AskUserQuestion');
    expect(collaborativeText).toContain('remains human-owned in every permission mode');
    expect(collaborativeText).toContain('Never ask the user to restate or re-approve them');

    researchSvc.setPlanningPolicy('dreaming', collaborative.revision);
    const dreaming = researchSvc.getSnapshot();
    expect(resolveResearchVerbosity({ isNewTurn: false, lastDisclosure: disclosure }, dreaming)).toBe('brief');
    const dreamingText = renderResearchInjection(dreaming, 'brief').content;
    expect(dreamingText).toContain('Planning policy: dreaming');
    expect(dreamingText).toContain('continue the project through Goal-owned Research turns without per-step confirmation');
    expect(dreamingText).toContain('record every chosen default in Research Plan v2 assumptions');
    expect(dreamingText).toContain('Never dream through expensive or irreversible work');
    expect(dreamingText).toContain('AITP/human gate');
    expect(dreamingText).toContain('Research planning policy and tool permission mode are orthogonal');
    expect(dreamingText).toContain('auto removes routine tool-risk prompts');
    expect(dreamingText).toContain('cannot grant a Research capability');
  });

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
      lastDisclosure: renderResearchInjection(researchSvc.getSnapshot(), 'brief').disclosure,
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
        planningPolicy: 'collaborative',
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
        planningPolicy: 'collaborative',
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
      topic: {
        id: 't1',
        title: 'Test',
        goalText: 'Not established yet',
        goalSource: '.aitp/topic/TOPIC.md',
      },
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
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    seedConfirmedWorkstreamBinding({ workstream: 'main' });
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
    readonly bindWorkstream?: boolean;
  }) {
    const adapter = makeStubAdapter();
    const modeSvc = await buildRealModeService(adapter);
    const researchSvc = await buildRealResearchService(modeSvc, adapter);
    if (opts?.enterMode !== false) {
      await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
      if (opts?.bindWorkstream !== false) {
        await researchSvc.confirmLineWorkstreamBinding({
          lineSlug: 'main',
          workstream: 'aitp-main',
          expectedRevision: researchSvc.getSnapshot().revision,
          confirmedBy: 'main_agent',
        });
      }
    }
    if (opts?.pauseLoop) {
      modeSvc.pauseLoop(researchSvc.getSnapshot().revision);
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
        workstream: 'aitp-main',
        topic: {
          id: 't1',
          title: 'Test',
          goalText: 'Not established yet',
          goalSource: '.aitp/topic/TOPIC.md',
        },
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
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(IEventBus, eventBus);
        reg.defineInstance(IAgentScopeContext, scopeCtx);
        reg.defineInstance(IAgentAitpModeService, modeSvc);
        reg.defineInstance(IAgentResearchService, researchSvc);
        reg.defineInstance(ISessionAitpLifecycleCoordinator, maintenance);
        reg.define(IResearchTurnAdmission, ResearchTurnAdmission);
        reg.define(IResearchLoopCoordinator, ResearchLoopCoordinator);
      },
    });
    const coordinator = ix.get(IResearchLoopCoordinator);
    return { modeSvc, researchSvc, coordinator, adapter, maintenance };
  }

  function turnStarted(turnId: number, origin: TurnStartedEvent['origin'] = { kind: 'user' }) {
    eventBus.publish({
      type: 'turn.started',
      turnId,
      origin,
      intent: origin.kind === 'system_trigger' && origin.name === 'goal_continuation'
        ? GOAL_CONTINUATION_INTENT
        : origin.kind === 'user'
          ? USER_TURN_INTENT
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

  it('updates the local period and Board for degraded user exploration without canonical writes', async () => {
    const { modeSvc, researchSvc, adapter, maintenance } = await buildCoordinatorHarness();
    adapter._setHealth({ phase: 'degraded', lastError: 'Adapter temporarily unavailable' });
    modeSvc.setPhase('degraded');
    const prepare = vi.spyOn(adapter, 'recordPrepare');
    const save = vi.spyOn(adapter, 'recordSave');
    turnStarted(1);
    expect(researchSvc.getSnapshot()).toMatchObject({
      mode: 'degraded', phase: 'orienting', period: { loopCount: 1 }, status: { health: 'degraded' },
    });
    researchSvc.setPhase('gap_analysis');
    researchSvc.planAndStartAction({
      kind: 'derivation', purpose: 'Check a local symmetry identity.',
      expectedEvidence: ['One equality or counterexample'], stopCondition: 'The identity is checked.',
      allowedToolKinds: ['workspace_read'],
    });
    expect(researchSvc.getSnapshot()).toMatchObject({
      mode: 'degraded', phase: 'action_executing', status: { health: 'degraded' },
    });
    turnEnded(1);
    await Promise.resolve();
    expect(prepare).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(maintenance.refresh).not.toHaveBeenCalled();
    turnStarted(2, GOAL_CONTINUATION_ORIGIN);
    expect(researchSvc.getSnapshot().period?.loopCount).toBe(1);
  });

  it('does not advance when mode is inactive', async () => {
    const { researchSvc } = await buildCoordinatorHarness({ enterMode: false });

    turnStarted(1);

    expect(researchSvc.getSnapshot().phase).toBe('idle');
  });

  it('performs one local boundary when Research Mode is entered within the user turn', async () => {
    const { modeSvc, researchSvc } = await buildCoordinatorHarness({ enterMode: false });
    turnStarted(1);
    await modeSvc.enter({ actor: 'model', lineSlug: 'main' });
    expect(researchSvc.getSnapshot().phase).toBe('orienting');
    const period = researchSvc.getPeriod();
    expect(period).not.toBeNull();
    modeSvc.setPhase('degraded');
    modeSvc.setPhase('ready');
    expect(researchSvc.getPeriod()).toEqual(period);
    turnEnded(1);
    modeSvc.setPhase('degraded');
    modeSvc.setPhase('ready');
    expect(researchSvc.getPeriod()).toEqual(period);
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

  it('reconciles stranded action structure before the admitted turn is projected', async () => {
    const { researchSvc } = await buildCoordinatorHarness();
    researchSvc.setPhase('orienting');
    researchSvc.setPhase('gap_analysis');
    const action = researchSvc.planAndStartAction({
      actionId: 'action-before-answer',
      kind: 'other',
      purpose: 'Classify the bounded legacy state',
      stopCondition: 'The current action is resolved from evidence.',
    });
    const restored = wire.getModel(ResearchModel).current as unknown as {
      phase: 'gap_analysis';
    };
    restored.phase = 'gap_analysis';

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);

    expect(researchSvc.getSnapshot()).toMatchObject({
      phase: 'action_executing',
      currentAction: { actionId: action.actionId, status: 'in_progress' },
      recentStateChange: {
        summary: expect.stringContaining('[research-action-recovery]'),
      },
    });
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

    const enterSpy = vi.spyOn(adapter, 'enter');
    const showSpy = vi.spyOn(adapter, 'show');
    const checkSpy = vi.spyOn(adapter, 'check');

    turnEnded(1, 'completed');

    expect(researchSvc.getSnapshot().phase).toBe('action_executing');
    expect(researchSvc.getSnapshot().currentAction?.status).toBe('in_progress');
    await vi.waitFor(() => {
      expect(maintenance.refresh).toHaveBeenCalledWith({ workstream: 'aitp-main', force: true });
    });
    expect(enterSpy.mock.calls).toEqual([[]]);
    expect(enterSpy.mock.invocationCallOrder[0]).toBeLessThan(
      maintenance.refresh.mock.invocationCallOrder[0]!,
    );
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
    await vi.waitFor(() => {
      expect(maintenance.refresh).toHaveBeenCalledOnce();
    });
  });

  it('turn.ended re-observes a changed Topic and performs zero scoped maintenance with the stale binding', async () => {
    const { researchSvc, adapter, maintenance } = await buildCoordinatorHarness();
    const entered = await adapter.enter();
    const changedTopic: AitpEnterResult = {
      ...entered,
      topic: {
        id: 't2',
        title: 'Changed Topic',
        goal: { text: 'Changed goal', source: '.aitp/topic/TOPIC.md' },
      },
    };
    const enterSpy = vi.spyOn(adapter, 'enter').mockResolvedValue(changedTopic);

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    researchSvc.createQuestion({ lineSlug: 'main', wording: 'Observe the changed Topic' });
    turnEnded(1, 'completed');

    await vi.waitFor(() => {
      expect(researchSvc.getProgram()?.topicId).toBe('t2');
    });
    expect(enterSpy.mock.calls).toEqual([[]]);
    expect(researchSvc.getSnapshot().currentWorkstreamBinding).toMatchObject({
      status: 'conflict',
    });
    expect(maintenance.refresh).not.toHaveBeenCalled();
  });

  it('turn.ended degrades and drops scoped maintenance from a different Topic', async () => {
    const { modeSvc, researchSvc, maintenance } = await buildCoordinatorHarness();
    maintenance.refresh.mockResolvedValue({
      status: 'ready',
      refreshedAt: 2,
      memoryStatus: 'available',
      workstream: 'aitp-main',
      topic: {
        id: 't2',
        title: 'Other Topic',
        goalText: 'Other goal',
        goalSource: '.aitp/topic/TOPIC.md',
      },
      activeNewerThanWorkingNote: true,
      unresolvedFailureCount: 0,
      unresolvedFailures: [],
      nextAction: 'Use only T2 evidence',
      warningSummaries: [],
      check: {
        status: 'clean',
        counts: { entries: 1, notes: 0, errors: 0, warnings: 0 },
        findingCodes: [],
      },
    });

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    researchSvc.createQuestion({ lineSlug: 'main', wording: 'Trigger exact maintenance' });
    turnEnded(1, 'completed');

    await vi.waitFor(() => expect(modeSvc.phase).toBe('degraded'));
    expect(maintenance.reset).toHaveBeenCalledOnce();
    expect(researchSvc.getProgram()).toMatchObject({ topicId: 't1' });
  });

  it('turn.ended maps unavailable scoped maintenance to degraded mode', async () => {
    const { modeSvc, researchSvc, maintenance } = await buildCoordinatorHarness();
    maintenance.refresh.mockResolvedValue({
      status: 'degraded',
      refreshedAt: 2,
      memoryStatus: 'unknown',
      workstream: 'aitp-main',
      activeNewerThanWorkingNote: null,
      unresolvedFailureCount: 0,
      unresolvedFailures: [],
      warningSummaries: [],
      check: { status: 'unavailable', findingCodes: [] },
      degradedReason: 'check_unavailable',
    });

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    researchSvc.createQuestion({ lineSlug: 'main', wording: 'Trigger unavailable maintenance' });
    turnEnded(1, 'completed');

    await vi.waitFor(() => expect(modeSvc.phase).toBe('degraded'));
    expect(maintenance.reset).not.toHaveBeenCalled();
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

  it('turn.ended keeps local exploration available but performs zero scoped maintenance while the current line is unbound', async () => {
    const { researchSvc, adapter, maintenance } = await buildCoordinatorHarness({ bindWorkstream: false });
    expect(researchSvc.getSnapshot().currentWorkstreamBinding).toMatchObject({ status: 'unbound' });
    const enterSpy = vi.spyOn(adapter, 'enter');

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    researchSvc.createQuestion({ lineSlug: 'main', wording: 'Locally explore the unbound question' });
    turnEnded(1, 'completed');

    await vi.waitFor(() => {
      expect(enterSpy).toHaveBeenCalledOnce();
    });
    expect(researchSvc.getSnapshot().phase).toBe('orienting');
    expect(enterSpy.mock.calls).toEqual([[]]);
    expect(maintenance.refresh).not.toHaveBeenCalled();
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

  it('interactive user turn advances idle → orienting while mode is active', async () => {
    const { researchSvc } = await buildCoordinatorHarness();
    expect(researchSvc.getSnapshot().phase).toBe('idle');

    turnStarted(1);

    expect(researchSvc.getSnapshot().phase).toBe('orienting');
  });

  it('unclassified user-origin event abstains at the coordinator boundary', async () => {
    const { researchSvc } = await buildCoordinatorHarness();

    eventBus.publish({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } });

    expect(researchSvc.getSnapshot().phase).toBe('idle');
  });

  it('interactive user turn that mutates research triggers turn-end AITP maintenance', async () => {
    const { researchSvc, maintenance } = await buildCoordinatorHarness();

    turnStarted(1);
    researchSvc.createLine({ slug: 'side-line', title: 'Ordinary side work' });
    researchSvc.createQuestion({ lineSlug: 'side-line', wording: 'Unrelated question' });

    turnEnded(1, 'completed');

    await vi.waitFor(() => {
      expect(maintenance.refresh).toHaveBeenCalledWith({ workstream: 'aitp-main', force: true });
    });
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

  it('an autonomous lease is released before a later interactive lease is acquired', async () => {
    const { researchSvc } = await buildCoordinatorHarness();

    turnStarted(1, GOAL_CONTINUATION_ORIGIN);
    expect(researchSvc.getSnapshot().phase).toBe('orienting');
    researchSvc.setPhase('idle');
    turnEnded(1, 'completed');

    turnStarted(2);
    expect(researchSvc.getSnapshot().phase).toBe('orienting');
  });

  it('interactive and autonomous iterations each increment the same period once', async () => {
    const { researchSvc } = await buildCoordinatorHarness();
    const first = researchSvc.getPeriod();
    expect(first).toMatchObject({ lineSlug: 'main', loopCount: 0 });

    turnStarted(1);
    turnEnded(1, 'completed');
    turnStarted(2, GOAL_CONTINUATION_ORIGIN);
    turnEnded(2, 'completed');

    const period = researchSvc.getPeriod();
    expect(period?.id).toBe(first?.id);
    expect(period?.loopCount).toBe(2);
    expect(researchSvc.getSnapshot().period?.id).toBe(first?.id);
  });

  it('an interactive turn increments the current period once', async () => {
    const { researchSvc } = await buildCoordinatorHarness();
    const first = researchSvc.getPeriod();

    turnStarted(1);
    turnEnded(1, 'completed');

    expect(researchSvc.getPeriod()).toMatchObject({ id: first?.id, loopCount: 1 });
  });
});

describe('ResearchTurnAdmission', () => {
  async function buildAdmissionHarness(opts?: {
    readonly agentId?: string;
    readonly enterMode?: boolean;
    readonly pauseLoop?: boolean;
  }) {
    const modeSvc = await buildRealModeService();
    if (opts?.enterMode !== false) {
      await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    }
    if (opts?.pauseLoop) {
      modeSvc.pauseLoop(wire.getModel(ResearchModel).current.revision);
    }
    const { ResearchTurnAdmission } = await import('#/features/aitpResearch/loop/researchTurnAdmission');
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(IEventBus, eventBus);
        reg.defineInstance(IAgentScopeContext, makeAgentScopeContext({ agentId: opts?.agentId ?? MAIN_AGENT_ID, agentScope: '' }));
        reg.defineInstance(IAgentAitpModeService, modeSvc);
        reg.define(IResearchTurnAdmission, ResearchTurnAdmission);
      },
    });
    const admission = ix.get(IResearchTurnAdmission);
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
        : withGoalIntent && origin.kind === 'user'
          ? USER_TURN_INTENT
          : undefined,
    });
  }

  function endTurn(turnId: number) {
    eventBus.publish({ type: 'turn.ended', turnId, reason: 'completed' });
  }

  it('grants an autonomous lease to a post-guard Goal continuation', async () => {
    const { admission } = await buildAdmissionHarness();
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.leaseForTurn(1)).toBe('autonomous_research');
    expect(admission.currentLease()).toBe('autonomous_research');
    expect(admission.isTurnAdmitted(1)).toBe(true);
    expect(admission.isCurrentResearchTurn()).toBe(true);
  });

  it('grants an interactive lease to a typed main-agent user turn without requiring Goal state', async () => {
    const { admission } = await buildAdmissionHarness();
    startTurn(1);
    expect(admission.leaseForTurn(1)).toBe('interactive_research');
    expect(admission.currentLease()).toBe('interactive_research');
    expect(admission.isTurnAdmitted(1)).toBe(true);
    expect(admission.isCurrentResearchTurn()).toBe(true);
  });

  it('does not infer an interactive lease from display origin alone', async () => {
    const { admission } = await buildAdmissionHarness();
    startTurn(1, { kind: 'user' }, false);
    expect(admission.currentLease()).toBe('none');
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('does not admit when mode is inactive', async () => {
    const { admission } = await buildAdmissionHarness({ enterMode: false });
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('admits the same typed user turn after Research Mode entry settles', async () => {
    const { admission, modeSvc } = await buildAdmissionHarness({ enterMode: false });
    startTurn(1);
    expect(admission.currentLease()).toBe('none');
    await modeSvc.enter({ actor: 'model', lineSlug: 'main' });
    expect(admission.leaseForTurn(1)).toBe('interactive_research');
    await modeSvc.exit();
    expect(admission.currentLease()).toBe('none');
    await modeSvc.enter({ actor: 'model', lineSlug: 'main' });
    expect(admission.leaseForTurn(1)).toBe('interactive_research');
    endTurn(1);
    modeSvc.setPhase('degraded');
    modeSvc.setPhase('ready');
    expect(admission.currentLease()).toBe('none');
  });

  it('does not mint an autonomous lease after entry or revive it after degraded recovery', async () => {
    const { admission, modeSvc } = await buildAdmissionHarness({ enterMode: false });
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    await modeSvc.enter({ actor: 'model', lineSlug: 'main' });
    expect(admission.currentLease()).toBe('none');
    endTurn(1);
    startTurn(2, GOAL_CONTINUATION_ORIGIN);
    expect(admission.currentLease()).toBe('autonomous_research');
    modeSvc.setPhase('degraded');
    expect(admission.currentLease()).toBe('none');
    modeSvc.setPhase('ready');
    expect(admission.currentLease()).toBe('none');
  });

  it.each([
    { origin: { kind: 'user' as const }, typed: false },
    { origin: { kind: 'system_trigger' as const, name: 'maintenance' }, typed: true },
  ])('does not turn non-Research ingress into a lease after mode entry: $origin', async ({ origin, typed }) => {
    const { admission, modeSvc } = await buildAdmissionHarness({ enterMode: false });
    startTurn(1, origin, typed);
    await modeSvc.enter({ actor: 'model', lineSlug: 'main' });
    expect(admission.currentLease()).toBe('none');
  });

  it('waits for probing to settle and obeys loop pause within the same user turn', async () => {
    const { admission, modeSvc } = await buildAdmissionHarness();
    modeSvc.setPhase('probing');
    startTurn(1);
    expect(admission.currentLease()).toBe('none');
    modeSvc.setPhase('degraded');
    expect(admission.currentLease()).toBe('interactive_research');
    modeSvc.pauseLoop(wire.getModel(ResearchModel).current.revision);
    expect(admission.currentLease()).toBe('none');
    modeSvc.setPhase('ready');
    expect(admission.currentLease()).toBe('none');
    modeSvc.resumeLoop(wire.getModel(ResearchModel).current.revision);
    expect(admission.currentLease()).toBe('interactive_research');
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

  it('admits user-directed provisional exploration while degraded but not a new Goal continuation', async () => {
    const { modeSvc, admission } = await buildAdmissionHarness();
    modeSvc.setPhase('degraded');
    startTurn(1);
    expect(admission.currentLease()).toBe('interactive_research');
    endTurn(1);
    startTurn(2, GOAL_CONTINUATION_ORIGIN);
    expect(admission.currentLease()).toBe('none');
  });

  it('does not admit while the adapter is still probing', async () => {
    const { modeSvc, admission } = await buildAdmissionHarness();
    modeSvc.setPhase('probing');
    startTurn(1);
    expect(admission.currentLease()).toBe('none');
  });

  it('does not admit a trigger without a Goal continuation lease', async () => {
    const { admission } = await buildAdmissionHarness();
    startTurn(1, GOAL_CONTINUATION_ORIGIN, false);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('is inert for a subagent instance', async () => {
    const { admission } = await buildAdmissionHarness({ agentId: 'subagent-1' });
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.isCurrentResearchTurn()).toBe(false);
  });

  it('releases the lease on turn.ended before classifying the next turn', async () => {
    const { admission } = await buildAdmissionHarness();
    startTurn(1, GOAL_CONTINUATION_ORIGIN);
    expect(admission.isCurrentResearchTurn()).toBe(true);
    endTurn(1);
    expect(admission.currentLease()).toBe('none');
    expect(admission.isCurrentResearchTurn()).toBe(false);
    startTurn(2, { kind: 'system_trigger', name: 'maintenance' });
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
    // Mode entry performs one unscoped Topic-only observation, but does not
    // infer a workstream or run scoped maintenance for the local Line.
    expect(snapshot.program).toMatchObject({ topicId: 't1', observedRevision: 1 });
    expect(researchSvc.getProgram()).toEqual(snapshot.program);
    expect(snapshot.currentWorkstreamBinding).toMatchObject({ status: 'unbound' });
    expect(snapshot.status).toMatchObject({
      currentLineSlug: 'main',
      phase: 'idle',
      health: 'attention',
    });
    expect(snapshot.status?.attention[0]).toContain('no explicitly confirmed AITP workstream');
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
    expect(snapshot.program).toMatchObject({ topicId: 't1', observedRevision: 1 });
    expect(snapshot.currentWorkstreamBinding).toMatchObject({ status: 'unbound' });
    expect(snapshot.period?.lineSlug).toBe('main');
  });

  it('keeps the unscoped enter observation as Program authority across scoped receipts', async () => {
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

    expect(svc.getSnapshot().program).toMatchObject({ topicId: 't1', observedRevision: 1 });

    // Scoped receipts only project maintenance. Missing or contradictory
    // scoped Topic fields cannot clear or replace the global observation.
    stub.emit(maintenanceReceipt({ status: 'degraded' }));
    expect(svc.getSnapshot().program).toMatchObject({ topicId: 't1', observedRevision: 1 });

    const topic = { id: 'topic-a', title: 'Topic A', goalText: 'Prove X', goalSource: 'TOPIC.md' };
    stub.emit(maintenanceReceipt({ topic }));
    expect(svc.getSnapshot().program).toMatchObject({ topicId: 't1', observedRevision: 1 });
  });

  it('retains Program and Goal alignment when scoped maintenance loses its topic', async () => {
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
      makeStubGoalService(makeGoalSnapshot('active')),
      stub.coordinator,
    );
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    const observed = svc.getSnapshot();
    expect(observed.program).toMatchObject({ topicId: 't1', observedRevision: 1 });
    svc.confirmGoalAlignment({
      relation: 'same_program_goal',
      expectedRevision: observed.revision,
      goalId: 'goal-1',
      topicId: 't1',
      observedRevision: observed.program!.observedRevision,
    });
    expect(svc.getSnapshot().goalAlignment).toMatchObject({ status: 'aligned' });

    stub.emit(maintenanceReceipt({ status: 'degraded' }));

    const snapshot = svc.getSnapshot();
    expect(snapshot.program).toMatchObject({ topicId: 't1', observedRevision: 1 });
    expect(snapshot.goalAlignment).toMatchObject({ status: 'aligned' });
    expect(snapshot.goalAlignment?.binding).toMatchObject({ topicId: 't1' });
    expect(snapshot.status).toMatchObject({ health: 'attention' });
  });

  it('clears the checkpointed program and Goal binding before a degraded re-entry settles', async () => {
    const adapter = makeStubAdapter();
    let probeCount = 0;
    vi.spyOn(adapter, 'probe').mockImplementation(async () => {
      const health: AitpAdapterHealth = probeCount++ === 0
        ? { phase: 'ready', contractVersion: '0.1' }
        : { phase: 'degraded', lastError: 'probe unavailable' };
      adapter._setHealth(health);
      return health;
    });
    const modeSvc = await buildRealModeService(adapter);
    const stub = makeCoordinatorStub();
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const svc = new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      modeSvc,
      adapter,
      makeToolExecutorStub(),
      makeStubGoalService(makeGoalSnapshot('active')),
      stub.coordinator,
    );

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    const observed = svc.getSnapshot();
    svc.confirmGoalAlignment({
      relation: 'same_program_goal',
      expectedRevision: observed.revision,
      goalId: 'goal-1',
      topicId: 't1',
      observedRevision: observed.program!.observedRevision,
    });
    expect(svc.getSnapshot().goalAlignment).toMatchObject({ status: 'aligned' });

    await modeSvc.exit();
    expect(svc.getProgram()).toMatchObject({ topicId: 't1' });
    expect(wire.getModel(ResearchModel).current.goalProgramBinding).not.toBeNull();

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    expect(probeCount).toBe(2);
    expect(modeSvc.phase).toBe('degraded');
    expect(svc.getProgram()).toBeNull();
    expect(wire.getModel(ResearchModel).current.goalProgramBinding).toBeNull();
    expect(svc.getSnapshot().goalAlignment).toMatchObject({ status: 'unavailable' });
  });

  it('line switch archives the old period with its focus intact and opens a fresh one', async () => {
    const modeSvc = await buildRealModeService();
    const researchSvc = await buildRealResearchService(modeSvc);
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    const q1 = researchSvc.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    researchSvc.setFocus(q1.id);
    researchSvc.noteLoopBoundary();
    researchSvc.recordProgress({
      headline: 'Main Line cycle reached a bounded conclusion',
      motivation: 'Preserve the resolved cycle before changing Lines.',
      workPerformed: 'Checked the bounded evidence.',
      result: 'The current cycle is ready to archive.',
      mainlineImpact: 'The alternative Line can now be selected.',
      uncertainties: [],
    });
    researchSvc.createLine({ slug: 'alt', title: 'Alt' });
    researchSvc.switchLine('alt');

    const history = wire.getModel(ResearchModel).current.periodHistory;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      lineSlug: 'main',
      currentQuestionId: q1.id,
      loopCount: 1,
      summary: 'Main Line cycle reached a bounded conclusion',
      endedAt: expect.any(Number),
    });
    const period = researchSvc.getPeriod();
    expect(period).toMatchObject({ lineSlug: 'alt', loopCount: 0 });
    expect(period?.currentQuestionId).toBeUndefined();
    expect(researchSvc.getSnapshot().period?.lineSlug).toBe('alt');

    researchSvc.switchLine('alt');
    expect(researchSvc.getPeriod()?.id).toBe(period?.id);
    expect(wire.getModel(ResearchModel).current.periodHistory).toHaveLength(1);
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
    expect(snapshot.program).toMatchObject({ topicId: 't1', observedRevision: 1 });
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
      health: 'attention',
    });
    expect(snapshot.status?.attention[0]).toContain('Research Line alt has no explicitly confirmed AITP workstream');
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

  it('keeps observed Topic identity even when scoped ledger memory is not established', async () => {
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
    expect(receipt.memoryStatus).toBe('not_established');
    expect(receipt.topic).toMatchObject({
      id: 'topic-secret',
      title: 'Test topic',
      goalText: 'Keep the next step explicit',
    });
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
      workstream: 'aitp-main',
      topic: status === 'ready'
        ? {
            id: 't1',
            title: 'Test',
            goalText: 'Not established yet',
            goalSource: '.aitp/topic/TOPIC.md',
          }
        : undefined,
      latestWorkingNoteAt: status === 'ready' ? Date.now() - 3_600_000 : undefined,
      activeNewerThanWorkingNote: status === 'ready' ? true : null,
      unresolvedFailureCount: status === 'ready' ? 2 : 0,
      unresolvedFailures: [],
      nextAction: status === 'ready' ? 'Inspect the failed bounded action' : undefined,
      warningSummaries: status === 'ready' ? [{ level: 'warning', code: 'policy_warning' }] : [],
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
    const binding = seedConfirmedWorkstreamBinding({ workstream: 'aitp-main' });
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
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator as never,
    );

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    expect(calls).toEqual(['probe', 'refresh']);
    expect(coordinator.refresh).toHaveBeenCalledWith({ workstream: binding.workstream, force: true });
    expect(modeSvc.phase).toBe('ready');

    coordinator.refresh.mockResolvedValue(receipt('degraded'));
    await modeSvc.exit();
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    expect(modeSvc.phase).toBe('degraded');
  });

  it('keeps unbound mode ready after one Topic-only enter and performs zero scoped maintenance on enter or cold restore', async () => {
    const adapter = makeStubAdapter();
    const enterSpy = vi.spyOn(adapter, 'enter');
    const checkSpy = vi.spyOn(adapter, 'check');
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator,
    );

    await modeSvc.enter({ actor: 'user' });

    expect(modeSvc.phase).toBe('ready');
    expect(modeSvc.maintenanceDegradedReason).toBeUndefined();
    expect(enterSpy.mock.calls).toEqual([[]]);
    expect(checkSpy).not.toHaveBeenCalled();
    expect(coordinator.snapshot()).toBeUndefined();
    expect(wire.getModel(ResearchModel).current.program).toMatchObject({ topicId: 't1' });

    await wire.restore();

    expect(modeSvc.phase).toBe('ready');
    expect(enterSpy.mock.calls).toEqual([[], []]);
    expect(checkSpy).not.toHaveBeenCalled();
    expect(coordinator.snapshot()).toBeUndefined();
  });

  it('uses only the explicit binding, not the Line slug, for scoped enter and check', async () => {
    const adapter = makeStubAdapter();
    const binding = seedConfirmedWorkstreamBinding({ workstream: 'aitp-main' });
    const scopedEnter = {
      schema: 'aitp/enter-0.3',
      workstream: binding.workstream,
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
    } satisfies AitpEnterResult;
    const unscopedEnter = {
      ...scopedEnter,
      schema: 'aitp/enter-0.2',
      workstream: undefined,
    } as AitpEnterResult;
    const enterSpy = vi.spyOn(adapter, 'enter').mockImplementation(async (options) =>
      options?.workstream === undefined ? unscopedEnter : scopedEnter);
    const checkSpy = vi.spyOn(adapter, 'check').mockResolvedValue({
      schema: 'aitp/check-report-0.2',
      workstream: binding.workstream,
      root: '/workspace',
      status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0, by_code: {}, outside_scope: { errors: 0, warnings: 0 } },
      findings: [],
    } satisfies AitpCheckReport);
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator,
    );

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    expect(enterSpy.mock.calls[0]).toEqual([]);
    expect(enterSpy).toHaveBeenLastCalledWith({ workstream: binding.workstream, signal: expect.any(AbortSignal) });
    expect(checkSpy).toHaveBeenCalledWith({ workstream: binding.workstream, signal: expect.any(AbortSignal) });
    expect(enterSpy).toHaveBeenCalledTimes(2);
    expect(modeSvc.phase).toBe('ready');
    expect(coordinator.snapshot()).toMatchObject({ status: 'ready', workstream: binding.workstream });
  });

  it('fails closed when scoped maintenance observes a different Topic than the fresh Program', async () => {
    const adapter = makeStubAdapter();
    const binding = seedConfirmedWorkstreamBinding({ workstream: 'aitp-main' });
    const enteredT1 = await adapter.enter();
    const enteredT2: AitpEnterResult = {
      ...enteredT1,
      schema: 'aitp/enter-0.3',
      workstream: binding.workstream,
      topic: {
        id: 't2',
        title: 'Changed Topic',
        goal: { text: 'Changed goal', source: '.aitp/topic/TOPIC.md' },
      },
      unresolved_failures: [{
        id: 'failure-from-t2',
        kind: 'failure',
        summary: 'This failure belongs only to T2',
        limitations: [],
        authority: 'tool',
        created_at: '2026-09-01T00:00:00.000Z',
        refs: [],
        source: '.aitp/topic/entries/entry-failure-from-t2.md',
        legacy_derived: false,
      }],
      next_action: {
        text: 'Follow the T2-only next action',
        entry_id: 'failure-from-t2',
        authority: 'tool',
        created_at: '2026-09-01T00:00:00.000Z',
        source: '.aitp/topic/entries/entry-failure-from-t2.md',
      },
      counts: {
        ...enteredT1.counts,
        unresolved_failures: 1,
        active_newer_than_latest_working_note: 1,
      },
    };
    vi.spyOn(adapter, 'enter').mockImplementation(async (options) =>
      options?.workstream === undefined ? enteredT1 : enteredT2);
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
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
    const researchEvents: Array<{ snapshot?: ResearchStatusSnapshot }> = [];
    disposables.add(eventBus.subscribe('research.updated', (event) => {
      researchEvents.push(event as { snapshot?: ResearchStatusSnapshot });
    }));

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    const snapshot = researchSvc.getSnapshot();
    expect(modeSvc.phase).toBe('degraded');
    expect(modeSvc.maintenanceDegradedReason).toBe('stale_generation');
    expect(coordinator.snapshot()).toBeUndefined();
    expect(snapshot.program).toMatchObject({ topicId: 't1', observedRevision: 1 });
    expect(snapshot.aitpMaintenance).toBeUndefined();
    expect(snapshot.effectiveNextStep?.text ?? '').not.toContain('T2-only');
    expect(snapshot.alerts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ relatedEntryId: 'failure-from-t2' }),
    ]));
    expect(researchEvents.every((event) => event.snapshot?.aitpMaintenance === undefined)).toBe(true);
  });

  it('re-scopes maintenance to the switched line without reusing the old receipt', async () => {
    const adapter = makeStubAdapter();
    const mainBinding = seedConfirmedWorkstreamBinding({ lineSlug: 'main', workstream: 'aitp-main' });
    const altBinding = seedConfirmedWorkstreamBinding({ lineSlug: 'alt', workstream: 'aitp-alt', confirmedAt: 4 });
    const unscopedEntered: AitpEnterResult = {
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
    const entered: AitpEnterResult = {
      schema: 'aitp/enter-0.3',
      workstream: mainBinding.workstream,
      memory_status: 'available',
      root: '/workspace',
      topic: unscopedEntered.topic,
      recent_entries: [],
      unresolved_failures: [],
      next_action: { status: 'not_established', source: null },
      latest_working_note: null,
      recent_notes: [],
      counts: { active: 0, superseded: 0, unresolved_failures: 0, malformed: 0, omitted_active: 0, active_newer_than_latest_working_note: null },
      warnings: [],
    };
    const enteredAlt: AitpEnterResult = { ...entered, workstream: altBinding.workstream };
    const checkClean: AitpCheckReport = {
      schema: 'aitp/check-report-0.2',
      root: '/workspace',
      workstream: mainBinding.workstream,
      status: 'clean',
      counts: { entries: 0, notes: 0, errors: 0, warnings: 0, by_code: {}, outside_scope: { errors: 0, warnings: 0 } },
      findings: [],
    };
    const enterSpy = vi.spyOn(adapter, 'enter').mockImplementation(async (options) => {
      if (options?.workstream === undefined) return unscopedEntered;
      return options.workstream === mainBinding.workstream ? entered : enteredAlt;
    });
    const checkSpy = vi.spyOn(adapter, 'check').mockImplementation(async (options) =>
      options?.workstream === mainBinding.workstream
        ? checkClean
        : { ...checkClean, workstream: altBinding.workstream });
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
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
    expect(coordinator.snapshot()).toMatchObject({ status: 'ready', workstream: mainBinding.workstream });
    expect(enterSpy).toHaveBeenCalledTimes(2);
    expect(checkSpy).toHaveBeenCalledTimes(1);

    // Switch to a second line: maintenance must re-run under the new workstream,
    // and the new receipt must not be the old line's receipt.
    researchSvc.switchLine('alt');
    expect(coordinator.snapshot()).toBeUndefined();
    expect(researchSvc.getSnapshot().aitpMaintenance).toBeUndefined();
    await vi.waitFor(() => {
      expect(enterSpy).toHaveBeenCalledTimes(4);
    });
    await vi.waitFor(() => {
      expect(checkSpy).toHaveBeenCalledTimes(2);
    });

    expect(enterSpy.mock.calls[2]).toEqual([]);
    expect(enterSpy).toHaveBeenLastCalledWith({ workstream: altBinding.workstream, signal: expect.any(AbortSignal) });
    expect(checkSpy).toHaveBeenLastCalledWith({ workstream: altBinding.workstream, signal: expect.any(AbortSignal) });
    expect(coordinator.snapshot()).toMatchObject({ status: 'ready', workstream: altBinding.workstream });
    expect(modeSvc.phase).toBe('ready');
  });

  it('does not let a stale old-Line reconciliation invalidate a newer Line refresh', async () => {
    const adapter = makeStubAdapter();
    const entered = await adapter.enter();
    seedConfirmedWorkstreamBinding({ lineSlug: 'main', workstream: 'aitp-main' });
    const altBinding = seedConfirmedWorkstreamBinding({
      confirmationId: 'confirmation-alt',
      lineSlug: 'alt',
      workstream: 'aitp-alt',
      confirmedAt: 4,
    });
    const coordinator = coordinatorStub(receipt());
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator as never,
    );
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter,
      makeToolExecutorStub(), makeStubGoalService(), coordinator as never,
    );

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    coordinator.refresh.mockClear();
    coordinator.refresh.mockImplementation(async ({ workstream }: { workstream: string }) => ({
      ...receipt(),
      workstream,
    }));
    let releaseAltObservation!: (value: AitpEnterResult) => void;
    const altObservation = new Promise<AitpEnterResult>((resolve) => {
      releaseAltObservation = resolve;
    });
    const enterSpy = vi.spyOn(adapter, 'enter').mockReturnValue(altObservation);

    researchSvc.switchLine('alt');
    await vi.waitFor(() => expect(enterSpy).toHaveBeenCalledOnce());

    await expect(modeSvc.reconcileCurrentTopicBinding('main')).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
    });
    expect(enterSpy).toHaveBeenCalledOnce();

    releaseAltObservation(entered);
    await vi.waitFor(() => {
      expect(coordinator.refresh).toHaveBeenCalledWith({
        workstream: altBinding.workstream,
        force: true,
      });
    });
    expect(modeSvc.phase).toBe('ready');
  });

  it('retains a newer Line receipt after an older Line observation settles late', async () => {
    const adapter = makeStubAdapter();
    const entered = await adapter.enter();
    seedConfirmedWorkstreamBinding({ lineSlug: 'main', workstream: 'aitp-main' });
    const altBinding = seedConfirmedWorkstreamBinding({
      confirmationId: 'confirmation-alt',
      lineSlug: 'alt',
      workstream: 'aitp-alt',
      confirmedAt: 4,
    });
    let currentReceipt: AitpMaintenanceReceipt | undefined;
    const coordinator = coordinatorStub(receipt());
    coordinator.refresh.mockImplementation(async ({ workstream }: { workstream: string }) => {
      currentReceipt = { ...receipt(), workstream };
      return currentReceipt;
    });
    coordinator.snapshot.mockImplementation(() => currentReceipt);
    coordinator.reset.mockImplementation(() => {
      currentReceipt = undefined;
    });
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator as never,
    );
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const researchSvc = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, modeSvc, adapter,
      makeToolExecutorStub(), makeStubGoalService(), coordinator as never,
    );

    await modeSvc.enter({ actor: 'user', lineSlug: 'alt' });
    coordinator.refresh.mockClear();
    coordinator.reset.mockClear();
    let releaseMainObservation!: (value: AitpEnterResult) => void;
    const mainObservation = new Promise<AitpEnterResult>((resolve) => {
      releaseMainObservation = resolve;
    });
    const enterSpy = vi.spyOn(adapter, 'enter')
      .mockReturnValueOnce(mainObservation)
      .mockResolvedValue(entered);

    researchSvc.switchLine('main');
    await vi.waitFor(() => expect(enterSpy).toHaveBeenCalledOnce());
    researchSvc.switchLine('alt');
    await vi.waitFor(() => {
      expect(coordinator.refresh).toHaveBeenCalledWith({
        workstream: altBinding.workstream,
        force: true,
      });
    });
    expect(currentReceipt?.workstream).toBe(altBinding.workstream);
    const resetsBeforeLateObservation = coordinator.reset.mock.calls.length;

    releaseMainObservation(entered);
    await mainObservation;
    await Promise.resolve();
    await Promise.resolve();

    expect(coordinator.reset).toHaveBeenCalledTimes(resetsBeforeLateObservation);
    expect(currentReceipt?.workstream).toBe(altBinding.workstream);
    expect(modeSvc.phase).toBe('ready');
  });

  it('invalidates an old scoped receipt when a fresh unscoped observation changes Program', async () => {
    const adapter = makeStubAdapter();
    const binding = seedConfirmedWorkstreamBinding({ workstream: 'aitp-main' });
    const enteredT1 = await adapter.enter();
    const enteredT2: AitpEnterResult = {
      ...enteredT1,
      topic: {
        id: 't2',
        title: 'Changed Topic',
        goal: { text: 'Changed goal', source: '.aitp/topic/TOPIC.md' },
      },
    };
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
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
    let releaseOldScopedEnter!: (value: AitpEnterResult) => void;
    const oldScopedEnter = new Promise<AitpEnterResult>((resolve) => {
      releaseOldScopedEnter = resolve;
    });
    const enterSpy = vi.spyOn(adapter, 'enter').mockImplementation((options) =>
      options?.workstream === binding.workstream
        ? oldScopedEnter
        : Promise.resolve(enteredT2));
    const checkSpy = vi.spyOn(adapter, 'check');
    const researchEvents: Array<{ snapshot?: ResearchStatusSnapshot }> = [];
    disposables.add(eventBus.subscribe('research.updated', (event) => {
      researchEvents.push(event as { snapshot?: ResearchStatusSnapshot });
    }));

    const oldRefresh = coordinator.refresh({ workstream: binding.workstream, force: true });
    await vi.waitFor(() => {
      expect(enterSpy).toHaveBeenCalledWith({
        workstream: binding.workstream,
        signal: expect.any(AbortSignal),
      });
    });
    await expect(modeSvc.reconcileCurrentTopicBinding('main')).resolves.toBeUndefined();
    expect(researchSvc.getProgram()).toMatchObject({ topicId: 't2' });
    expect(researchSvc.getLineWorkstreamAlignment('main')).toMatchObject({ status: 'conflict' });
    const eventsAfterT2 = researchEvents.length;

    releaseOldScopedEnter({
      ...enteredT1,
      schema: 'aitp/enter-0.3',
      workstream: binding.workstream,
    });
    await expect(oldRefresh).resolves.toMatchObject({ degradedReason: 'stale_generation' });
    await Promise.resolve();

    expect(checkSpy).not.toHaveBeenCalled();
    expect(coordinator.snapshot()).toBeUndefined();
    expect(researchSvc.getProgram()).toMatchObject({ topicId: 't2' });
    expect(researchEvents).toHaveLength(eventsAfterT2);
  });

  it('does not let an older same-Line probe failure overwrite a newer reconciliation', async () => {
    const adapter = makeStubAdapter();
    let rejectProbe!: (reason: unknown) => void;
    vi.spyOn(adapter, 'probe').mockReturnValue(new Promise((_resolve, reject) => {
      rejectProbe = reject;
    }));
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
    );

    const entering = modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    await vi.waitFor(() => expect(adapter.probe).toHaveBeenCalledOnce());
    adapter._setHealth({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' });
    await expect(modeSvc.reconcileCurrentTopicBinding('main')).resolves.toBeUndefined();
    modeSvc.setPhase('ready');

    rejectProbe(new Error('obsolete probe failed'));
    await entering;

    expect(modeSvc.phase).toBe('ready');
    expect(wire.getModel(ResearchModel).current.program).toMatchObject({ topicId: 't1' });
  });

  it('drops an older same-Line maintenance status after a newer Topic reconciliation starts', async () => {
    const adapter = makeStubAdapter();
    const binding = seedConfirmedWorkstreamBinding({ workstream: 'aitp-main' });
    const enteredT1 = await adapter.enter();
    const enteredT2: AitpEnterResult = {
      ...enteredT1,
      topic: {
        id: 't2',
        title: 'Changed Topic',
        goal: { text: 'Changed goal', source: '.aitp/topic/TOPIC.md' },
      },
    };
    const coordinator = coordinatorStub(receipt());
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator as never,
    );
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });

    let releaseOldMaintenance!: (value: AitpMaintenanceReceipt) => void;
    const oldMaintenance = new Promise<AitpMaintenanceReceipt>((resolve) => {
      releaseOldMaintenance = resolve;
    });
    coordinator.refresh.mockReturnValue(oldMaintenance);
    coordinator.refresh.mockClear();
    vi.spyOn(adapter, 'enter')
      .mockResolvedValueOnce(enteredT1)
      .mockResolvedValue(enteredT2);
    const internal = modeSvc as unknown as {
      refreshReconciledMaintenance(lineSlug: string): Promise<'ready' | 'degraded' | undefined>;
    };

    const staleStatus = internal.refreshReconciledMaintenance('main');
    await vi.waitFor(() => expect(coordinator.refresh).toHaveBeenCalledOnce());
    releaseOldMaintenance({
      ...receipt(),
      workstream: binding.workstream,
    });
    const freshReconciliation = modeSvc.reconcileCurrentTopicBinding('main');

    await expect(freshReconciliation).resolves.toBeUndefined();
    await expect(staleStatus).resolves.toBeUndefined();
    expect(wire.getModel(ResearchModel).current.program).toMatchObject({ topicId: 't2' });
  });

  it('ignores a late prior-Line Topic observation and performs zero scoped calls after the switched Line becomes conflicting', async () => {
    const adapter = makeStubAdapter();
    seedConfirmedWorkstreamBinding({ lineSlug: 'main', workstream: 'aitp-main' });
    seedConfirmedWorkstreamBinding({ lineSlug: 'alt', workstream: 'aitp-alt', confirmedAt: 4 });
    const enteredT1 = await adapter.enter();
    const enteredT2: AitpEnterResult = {
      ...enteredT1,
      topic: {
        id: 't2',
        title: 'Changed Topic',
        goal: { text: 'Changed goal', source: '.aitp/topic/TOPIC.md' },
      },
    };
    const coordinator = new SessionAitpLifecycleCoordinatorService(adapter);
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
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
    let releaseOldObservation!: (value: AitpEnterResult) => void;
    const oldObservation = new Promise<AitpEnterResult>((resolve) => {
      releaseOldObservation = resolve;
    });
    const enterSpy = vi.spyOn(adapter, 'enter')
      .mockReturnValueOnce(oldObservation)
      .mockResolvedValue(enteredT2);
    const checkSpy = vi.spyOn(adapter, 'check');

    const staleMainObservation = modeSvc.reconcileCurrentTopicBinding('main');
    await vi.waitFor(() => {
      expect(enterSpy).toHaveBeenCalledOnce();
    });
    researchSvc.switchLine('alt');

    await vi.waitFor(() => {
      expect(researchSvc.getProgram()?.topicId).toBe('t2');
    });
    releaseOldObservation(enteredT1);
    await expect(staleMainObservation).rejects.toMatchObject({
      code: AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
    });

    expect(enterSpy.mock.calls).toEqual([[], []]);
    expect(checkSpy).not.toHaveBeenCalled();
    expect(researchSvc.getLineWorkstreamAlignment('alt')).toMatchObject({
      status: 'conflict',
    });
    expect(researchSvc.getProgram()?.topicId).toBe('t2');
    expect(coordinator.snapshot()).toBeUndefined();
  });

  it('resets maintenance before exit events and forces refresh on active restore', async () => {
    const adapter = makeStubAdapter();
    const binding = seedConfirmedWorkstreamBinding({ workstream: 'aitp-main' });
    const coordinator = coordinatorStub(receipt());
    const { AgentAitpModeService } = await import('#/features/aitpResearch/mode/agentAitpModeService');
    const modeSvc = new AgentAitpModeService(
      wire,
      makeScopeCtx(),
      adapter,
      eventBus,
      makeProfileServiceStub(),
      coordinator as never,
    );

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    coordinator.refresh.mockClear();
    coordinator.reset.mockClear();
    let resetWasVisibleAtExitEvent = false;
    disposables.add(eventBus.subscribe('aitp_mode.updated', () => {
      if (!modeSvc.isActive) resetWasVisibleAtExitEvent = coordinator.reset.mock.calls.length > 0;
    }));

    await modeSvc.exit();
    expect(coordinator.reset).toHaveBeenCalledOnce();
    expect(resetWasVisibleAtExitEvent).toBe(true);

    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    coordinator.refresh.mockClear();
    await wire.restore();
    expect(coordinator.refresh).toHaveBeenCalledWith({ workstream: binding.workstream, force: true });
  });

  it('projects the coordinator receipt into the Research snapshot and injection', async () => {
    const coordinator = coordinatorStub({ ...receipt(), workstream: 'main' });
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    seedConfirmedWorkstreamBinding({ workstream: 'main' });
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
    expect(snapshot.aitpMaintenance).toEqual(coordinator.snapshot());
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

  it('wakes Goal continuation only for an exact ready maintenance receipt', async () => {
    seedCurrentConfirmedWorkstream({ workstream: 'main' });
    let current: AitpMaintenanceReceipt = { ...receipt(), workstream: 'main' };
    const updates = new Emitter<AitpMaintenanceReceipt>();
    const coordinator = {
      _serviceBrand: undefined,
      onDidUpdate: updates.event,
      refresh: vi.fn(),
      snapshot: vi.fn(() => current),
      reset: vi.fn(),
    };
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    new AgentResearchService(
      wire,
      makeScopeCtx(),
      eventBus,
      makeStubModeSvc({ isActive: true, phase: 'ready' }),
      makeStubAdapter(),
      makeToolExecutorStub(),
      makeStubGoalService(),
      coordinator as never,
    );
    const notifications: boolean[] = [];
    disposables.add(eventBus.subscribe('research.revision_advanced', ({ notifyGoal }) => {
      notifications.push(notifyGoal);
    }));

    updates.fire(current);
    expect(notifications.at(-1)).toBe(true);

    current = {
      ...current,
      topic: {
        id: 't2',
        title: 'Other Topic',
        goalText: 'Other goal',
        goalSource: '.aitp/topic/TOPIC.md',
      },
    };
    updates.fire(current);
    expect(notifications.at(-1)).toBe(false);

    current = { ...receipt('degraded'), workstream: 'main' };
    updates.fire(current);
    expect(notifications.at(-1)).toBe(false);
    expect(notifications).toEqual([true, false, false]);
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
    await modeSvc.enter({ actor: 'user', lineSlug: 'main' });
    await researchSvc.confirmLineWorkstreamBinding({
      lineSlug: 'main',
      workstream: 'aitp-main',
      expectedRevision: researchSvc.getSnapshot().revision,
      confirmedBy: 'main_agent',
    });
    const checkpoint = researchSvc.proposeCheckpoint({ expectedRevision: 0, lineSlug: 'main' });
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
    seedCurrentConfirmedWorkstream({ workstream: 'main' });
    const makeReceipt = (activeNewerThanWorkingNote: boolean, unresolvedFailureCount: number): AitpMaintenanceReceipt => ({
      status: 'ready',
      refreshedAt: 1,
      memoryStatus: 'available',
      workstream: 'main',
      topic: {
        id: 't1',
        title: 'Test',
        goalText: 'Not established yet',
        goalSource: '.aitp/topic/TOPIC.md',
      },
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
    seedCurrentConfirmedWorkstream({ workstream: 'main' });
    let current: AitpMaintenanceReceipt = {
      status: 'ready',
      refreshedAt: 1,
      memoryStatus: 'available',
      workstream: 'main',
      topic: {
        id: 't1',
        title: 'Test',
        goalText: 'Not established yet',
        goalSource: '.aitp/topic/TOPIC.md',
      },
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
    // A mismatched receipt is absence of admissible evidence, not proof that
    // the previous Topic's warning disappeared.
    current = {
      ...current,
      topic: {
        id: 't2',
        title: 'Other Topic',
        goalText: 'Other goal',
        goalSource: '.aitp/topic/TOPIC.md',
      },
      warningSummaries: [],
    };
    coordinatorUpdate.fire(current);
    expect(service.getSnapshot().alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fingerprint: 'research.alert.warning.aitp.invalid_timestamp',
        state: 'active',
      }),
    ]));
    current = {
      ...current,
      topic: {
        id: 't1',
        title: 'Test',
        goalText: 'Not established yet',
        goalSource: '.aitp/topic/TOPIC.md',
      },
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

    const dispatch = vi.spyOn(wire, 'dispatch');
    dispatch.mockClear();
    coordinatorUpdate.fire(current);
    const replayedOpTypes = dispatch.mock.calls.flatMap((ops) =>
      ops.map((op) => op.type),
    );
    expect(replayedOpTypes).not.toContain('research.clear_alert');
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
      getRevision: (id) => wire.getModel(PlanModel).current.revisionCount?.[id] ?? 0,
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

  async function setupResearchPlanV2() {
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    wire.dispatch(researchSetProgram({
      topicId: 'topic-1',
      title: 'Topic',
      goalText: 'AITP goal',
      goalSource: 'enter',
      establishedAt: 1,
      observedRevision: 1,
    }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const plan = planService();
    const service = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(),
      makeToolExecutorStub(), makeStubGoalService(makeGoalSnapshot('active', 3)),
      undefined, undefined, undefined, plan,
    );
    service.createLine({ slug: 'main', title: 'Main' });
    const question = service.createQuestion({ lineSlug: 'main', wording: 'Q1' });
    service.setFocus(question.id);
    const snapshot = service.getSnapshot();
    service.confirmGoalAlignment({
      relation: 'goal_milestone_in_program',
      expectedRevision: snapshot.revision,
      goalId: 'goal-1',
      topicId: 'topic-1',
      observedRevision: 1,
    });
    const draft = service.prepareResearchPlanV2({
      objective: 'Resolve the current program milestone',
      completionCriterion: 'Validated evidence is available.',
      milestones: [{
        milestoneId: 'm1',
        title: 'Validate one calculation',
        objective: 'Run and assess one bounded calculation.',
        completionCriterion: 'The output passes the declared checks.',
        evidenceRequirements: ['Input, output, and validation log'],
      }],
      evidenceRequirements: ['A reproducible result'],
      decisionPoints: [{
        decisionId: 'd1',
        milestoneId: 'm1',
        prompt: 'Is the result physically usable?',
        condition: 'Ask after validation exposes an ambiguity.',
      }],
      assumptions: ['The current fixture is representative.'],
      currentMilestoneId: 'm1',
      stopConditions: ['Stop on validation failure.'],
      replanConditions: ['Replan when the Program revision changes.'],
    });
    const active = service.activateResearchPlanV2({
      planId: draft.planId,
      expectedRevision: draft.revision,
    });
    return { service, plan, question, active };
  }

  async function finalizeReviewedActionPlan(
    service: IAgentResearchService,
    plan: IAgentPlanService,
    questionId: string,
  ) {
    const draft = await service.prepareResearchPlan({
      questionId,
      objective: 'Execute the next bounded calculation',
      steps: ['Run one calculation', 'Validate its output'],
      expectedEvidence: ['Input, output, and validation log'],
      stopCondition: 'Stop after validation.',
      usePlanMode: true,
    });
    wire.dispatch(planRevision({
      id: draft.planId,
      version: 1,
      path: 'plan/revision-1.md',
      sha256: 'a'.repeat(64),
      bytes: 1,
    }));
    plan.recordResolution?.('approved');
    plan.exit();
    return service.finalizeResearchPlan();
  }

  async function setupActionPlanOnly(goal?: GoalSnapshot | null) {
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    const { IAgentPermissionModeService } = await import('#/agent/permissionMode/permissionMode');
    const { IResearchTurnAdmission } = await import('#/features/aitpResearch/loop/researchTurnAdmission');
    const plan = planService();
    const executor = stubToolExecutorEvents();
    const ix = createServices(disposables, {
      strict: true,
      additionalServices: (reg) => {
        reg.defineInstance(IWireService, wire);
        reg.defineInstance(IAgentScopeContext, makeScopeCtx());
        reg.defineInstance(IEventBus, eventBus);
        reg.defineInstance(IAgentAitpModeService, makeStubModeSvc({ isActive: true }));
        reg.defineInstance(ISessionAitpAdapter, makeStubAdapter());
        reg.defineInstance(IAgentToolExecutorService, executor.executor);
        reg.defineInstance(IAgentGoalService, makeStubGoalService(goal));
        reg.definePartialInstance(ISessionAitpLifecycleCoordinator, {
          onDidUpdate: () => ({ dispose: () => {} }),
          snapshot: () => undefined,
        });
        reg.definePartialInstance(IDurableCommitService, {});
        reg.defineInstance(IAitpExternalFactService, createExternalFactFacade(wire));
        reg.defineInstance(IAgentPlanService, plan);
        reg.defineInstance(IAgentPermissionModeService, stubPermissionModeService(() => 'auto'));
        reg.definePartialInstance(IResearchTurnAdmission, {
          leaseForTurn: (turnId) => turnId === 1 ? 'interactive_research' : 'none',
        });
        reg.define(IAgentResearchService, AgentResearchService);
      },
    });
    const service = ix.get(IAgentResearchService);
    service.createLine({ slug: 'main', title: 'Main' });
    const question = service.createQuestion({ lineSlug: 'main', wording: 'Which convention matches the limiting case?' });
    service.setFocus(question.id);
    const actionPlan = await finalizeReviewedActionPlan(service, plan, question.id);
    const input = {
      questionId: question.id,
      lineSlug: 'main',
      kind: 'derivation' as const,
      purpose: 'Compare two conventions against the limiting case.',
      expectedEvidence: ['An independently checked limiting case'],
      stopCondition: 'Stop after comparing the two conventions.',
      planningLevel: 'planned' as const,
      actionPlanId: actionPlan.planId,
      actionPlanRevision: actionPlan.resolution!.planRevision,
    };
    return { service, plan, question, actionPlan, input, executor };
  }

  it('executes a reviewed local Action Plan without inventing a Goal or Research Plan', async () => {
    const { service, actionPlan, input } = await setupActionPlanOnly();
    const action = service.planAndStartAction(input);
    expect(action.status).toBe('in_progress');
    expect(action.researchPlanBinding).toBeUndefined();
    expect(action.actionPlanBinding).toMatchObject({
      kind: 'reviewed_plan', planId: actionPlan.planId, planRevision: 1,
    });
    service.concludeAction({
      actionId: action.actionId,
      status: 'completed',
      progress: {
        headline: 'The two conventions agree in the already documented limit.',
        motivation: 'Check the existing convention before broader exploration.',
        workPerformed: 'Compared the two equivalent local expressions.',
        result: 'The existing limit is reproduced; no new claim was established.',
        mainlineImpact: 'Continue the open question with the existing convention.',
      },
      durability: { status: 'no_durable_delta', rationale: 'This check only reproduces existing evidence.' },
    });
    expect(service.getSnapshot()).toMatchObject({ currentAction: { status: 'completed' } });
    expect(service.getResearchPlanV2()).toBeNull();
    expect(service.getSnapshot().researchGoal).toBeUndefined();
    expect(service.getPendingCheckpoint()).toBeNull();
  });

  it.each([false, true])('adopts a reviewed-plan result after only explicit scope establishment (hadProgram=%s)', async (hadProgram) => {
    if (hadProgram) wire.dispatch(researchSetProgram({
      topicId: 't1', title: 'Test', goalText: 'Not established yet',
      goalSource: '.aitp/topic/TOPIC.md', establishedAt: 2,
    }));
    const { service, input } = await setupActionPlanOnly();
    const action = service.planAndStartAction(input);
    const result = service.concludeAction({
      actionId: action.actionId, status: 'completed',
      progress: {
        headline: 'A limiting-case counterexample was found', motivation: 'Check the convention',
        workPerformed: 'Compared exact coefficients', result: 'The candidate identity fails',
        mainlineImpact: 'Revalidate this convention before proceeding',
      },
      durability: {
        status: 'durable_delta', entryKind: 'failure', authority: 'agent',
        provenance: 'agent_verification', rationale: 'Exact counterexample',
      },
    });
    expect(result.localConclusion).toBeDefined();
    seedConfirmedWorkstreamBinding({ confirmedBy: 'user', confirmedAt: Date.now() });
    const checkpoint = service.proposeCheckpoint({
      localConclusionId: action.actionId, confirmedBy: 'user',
      lineSlug: 'main', questionId: action.questionId,
      expectedRevision: service.getSnapshot().revision,
    });
    expect(checkpoint.commitCandidate).toEqual(result.localConclusion!.candidate);
    expect(service.getSnapshot().localConclusion).toBeUndefined();
    expect(service.getSnapshot().latestProgress).toEqual(result.progress);
  });

  it.each(['plan_revision', 'question', 'line', 'program'] as const)(
    'does not relax %s freshness while adopting a reviewed-plan conclusion', async (drift) => {
      wire.dispatch(researchSetProgram({
        topicId: 't1', title: 'Test', goalText: 'Not established yet',
        goalSource: '.aitp/topic/TOPIC.md', establishedAt: 2,
      }));
      const { service, input, actionPlan, question } = await setupActionPlanOnly();
      const action = service.planAndStartAction(input);
      const result = service.concludeAction({
        actionId: action.actionId, status: 'completed',
        progress: {
          headline: 'A checked counterexample', motivation: 'Check the convention',
          workPerformed: 'Compared exact coefficients', result: 'The candidate identity fails',
          mainlineImpact: 'Revalidate the affected convention',
        },
        durability: {
          status: 'durable_delta', entryKind: 'failure', authority: 'agent',
          provenance: 'agent_verification', rationale: 'Exact counterexample',
        },
      });
      seedConfirmedWorkstreamBinding({ confirmedBy: 'user', confirmedAt: Date.now() });
      if (drift === 'plan_revision') wire.dispatch(planRevision({
        id: actionPlan.planId, version: 2, path: 'plan/revision-2.md', sha256: 'b'.repeat(64), bytes: 1,
      }));
      if (drift === 'question') service.updateQuestion({ questionId: question.id, assessment: 'A changed assessment.' });
      if (drift === 'line') service.updateLine({ slug: 'main', objective: 'A different scientific problem.' });
      if (drift === 'program') wire.dispatch(researchSetProgram({
        topicId: 't1', title: 'Test', goalText: 'A different scientific goal',
        goalSource: '.aitp/topic/TOPIC.md', establishedAt: 2,
      }));
      const before = service.getSnapshot();
      expect(() => service.proposeCheckpoint({
        localConclusionId: action.actionId, confirmedBy: 'user', lineSlug: 'main',
        questionId: question.id, expectedRevision: before.revision,
      })).toThrow();
      expect(service.getSnapshot()).toEqual(before);
      expect(before.localConclusion).toEqual(result.localConclusion);
      expect(service.getPendingCheckpoint()).toBeNull();
    },
  );

  it.each(['researchPlanId', 'researchPlanRevision', 'milestoneId'] as const)(
    'rejects a partial optional parent binding containing only %s before starting work',
    async (field) => {
      const { service, input } = await setupActionPlanOnly();
      expect(() => service.planAndStartAction({
        ...input,
        [field]: field === 'researchPlanRevision' ? 1 : 'parent',
      })).toThrow('together');
      expect(service.getSnapshot().currentAction).toBeUndefined();
    },
  );

  it('retains local Plan revision freshness without a parent Research Plan', async () => {
    const { service, actionPlan, input } = await setupActionPlanOnly();
    const action = service.planAction(input);
    wire.dispatch(planRevision({
      id: actionPlan.planId, version: 2, path: 'plan/revision-2.md', sha256: 'b'.repeat(64), bytes: 1,
    }));
    expect(() => { service.startAction(action.actionId); }).toThrow('stale local Action Plan revision');
    expect(service.getSnapshot().currentAction?.status).toBe('planned');
  });

  it('retains Question freshness without a parent Research Plan', async () => {
    const { service, question, input } = await setupActionPlanOnly();
    const action = service.planAction(input);
    service.updateQuestion({ questionId: question.id, assessment: 'A new source changes the comparison.' });
    expect(() => { service.startAction(action.actionId); }).toThrow('stale Research context');
    expect(service.getSnapshot().currentAction?.status).toBe('planned');
  });

  it('enforces capabilities and plan freshness on tools owned by a local-only reviewed action', async () => {
    const { service, input, actionPlan, executor } = await setupActionPlanOnly();
    service.planAndStartAction({ ...input, allowedToolKinds: ['workspace_read'] });
    const read = await executor.fireBeforeExecute(makeToolHookContext('Read', { path: 'derivation.md' }));
    expect(read?.veto).toBeUndefined();
    const denied = await executor.fireBeforeExecute(makeToolHookContext('WebSearch', { query: 'new work' }));
    expect(denied?.veto?.output).toContain('does not grant capability web_search');
    wire.dispatch(planRevision({
      id: actionPlan.planId, version: 2, path: 'plan/revision-2.md', sha256: 'b'.repeat(64), bytes: 1,
    }));
    const stale = await executor.fireBeforeExecute(makeToolHookContext('Read', { path: 'derivation.md' }));
    expect(stale?.veto?.output).toContain('stale local Action Plan revision');
  });

  it.each(['active', 'paused'] as const)('does not force a full Research Plan merely because a Goal is %s', async (status) => {
    const { service, input } = await setupActionPlanOnly(makeGoalSnapshot(status, 3));
    expect(service.planAndStartAction(input).status).toBe('in_progress');
    expect(service.getResearchPlanV2()).toBeNull();
    expect(service.getSnapshot().researchGoal?.status).toBe(status);
  });

  it('does not omit a still-active Research Plan when executing a reviewed local plan', async () => {
    const { service, plan, question } = await setupResearchPlanV2();
    const actionPlan = await finalizeReviewedActionPlan(service, plan, question.id);
    expect(() => service.planAndStartAction({
      questionId: question.id, lineSlug: 'main', kind: 'derivation',
      purpose: 'A non-trivial action under the existing Research Plan.',
      expectedEvidence: ['One checked equality'], stopCondition: 'Stop at the comparison.',
      planningLevel: 'planned', actionPlanId: actionPlan.planId, actionPlanRevision: 1,
    })).toThrow('current Research Plan');
    expect(service.getSnapshot().currentAction).toBeUndefined();
  });

  it.each(['draft', 'completed', 'discarded'] as const)('handles a %s parent without silently binding or bypassing it', async (status) => {
    const { service, plan, question, active } = await setupResearchPlanV2();
    wire.dispatch(researchPutPlanV2({
      ...active,
      status,
      revision: active.revision + 1,
      updatedAt: active.updatedAt + 1,
      milestones: active.milestones.map((milestone) => ({ ...milestone, evidenceRequirements: [...milestone.evidenceRequirements] })),
      evidenceRequirements: [...active.evidenceRequirements],
      decisionPoints: active.decisionPoints.map((decision) => ({ ...decision })),
      assumptions: [...active.assumptions], stopConditions: [...active.stopConditions], replanConditions: [...active.replanConditions],
    }));
    expect(service.getResearchPlanV2()?.status).toBe(status);
    const actionPlan = await finalizeReviewedActionPlan(service, plan, question.id);
    const input = {
      questionId: question.id, lineSlug: 'main', kind: 'derivation' as const,
      purpose: 'Review the next bounded comparison.', stopCondition: 'Stop after the comparison.',
      planningLevel: 'planned' as const, actionPlanId: actionPlan.planId, actionPlanRevision: 1,
    };
    if (status === 'draft') {
      expect(() => service.planAndStartAction(input)).toThrow('current Research Plan');
    } else {
      const action = service.planAndStartAction(input);
      expect(action.status).toBe('in_progress');
      expect(action.researchPlanBinding).toBeUndefined();
      expect(service.getResearchPlanV2()?.status).toBe(status);
    }
  });

  it('accepts a local-only reviewed plan at the model tool boundary without accepting partial parent bindings', () => {
    const input = {
      kind: 'derivation', purpose: 'Compare the two candidate conventions.',
      expected_evidence: ['One checked limit'], stop_condition: 'Stop after the comparison.',
      planning_level: 'planned', action_plan_id: 'local-plan', action_plan_revision: 1,
    };
    expect(BeginResearchActionInputSchema.safeParse(input).success).toBe(true);
    expect(BeginResearchActionInputSchema.safeParse({ ...input, milestone_id: 'm1' }).success).toBe(false);
    expect(BeginResearchActionInputSchema.safeParse({ ...input, action_plan_revision: undefined }).success).toBe(false);
  });

  it('persists planning policy with optimistic concurrency and keeps same-policy writes idempotent', async () => {
    const modeSvc = await buildRealModeService();
    const service = await buildRealResearchService(modeSvc);
    const initial = service.getSnapshot();
    expect(initial.planningPolicy).toBe('collaborative');

    service.setPlanningPolicy('dreaming', initial.revision);
    const changed = service.getSnapshot();
    expect(changed.planningPolicy).toBe('dreaming');
    expect(changed.revision).toBe(initial.revision + 1);

    let staleError: unknown;
    try {
      service.setPlanningPolicy('collaborative', initial.revision);
    } catch (error) {
      staleError = error;
    }
    expect(staleError).toMatchObject({
      code: AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
    });
    service.setPlanningPolicy('dreaming', changed.revision);
    expect(service.getSnapshot().revision).toBe(changed.revision);
  });

  it('persists and undoes Research Plan v2 revisions without completing Question, checkpoint, or Goal', async () => {
    const { service, active, question } = await setupResearchPlanV2();
    expect(service.getSnapshot()).toMatchObject({
      researchPlanV2: {
        schema: 'hakimi/research-plan-0.2',
        planId: active.planId,
        revision: 2,
        status: 'active',
        goalId: 'goal-1',
        programId: 'topic-1',
        currentMilestoneId: 'm1',
      },
    });
    wire.dispatch(contextAppendMessage({
      message: { role: 'user', content: [], toolCalls: [], origin: { kind: 'user' } },
    }));
    const completed = service.completeResearchPlanV2({
      planId: active.planId,
      expectedRevision: active.revision,
    });
    expect(completed.status).toBe('completed');
    expect(service.getQuestions().find((item) => item.id === question.id)?.workflow).toBe('open');
    expect(service.getPendingCheckpoint()).toBeNull();
    expect(service.getSnapshot().researchGoal?.status).toBe('active');
    wire.dispatch(contextUndo({ count: 1 }));
    expect(service.getResearchPlanV2()?.status).toBe('active');
    expect(service.getResearchPlanV2()?.revision).toBe(2);
  });

  it('blocks Research Plan v2 completion while durability is pending', async () => {
    const { service, active, question } = await setupResearchPlanV2();
    const checkpointId = 'plan-v2-pending-checkpoint';
    wire.dispatch(researchProposeCheckpoint({
      checkpointId,
      questionId: question.id,
      lineSlug: 'main',
      assessment: 'A verified milestone still needs canonical persistence.',
      idempotencyKey: 'plan-v2-pending-key',
      createdAt: Date.now(),
    }));

    expect(() => service.completeResearchPlanV2({
      planId: active.planId,
      expectedRevision: active.revision,
    })).toThrow(`checkpoint ${checkpointId} is pending durable commit`);
    expect(service.getResearchPlanV2()?.status).toBe('active');
  });

  it('binds a planned action to both plan revisions and rejects a stale Research Plan before start', async () => {
    const { service, plan, question, active } = await setupResearchPlanV2();
    const actionPlan = await finalizeReviewedActionPlan(service, plan, question.id);
    const action = service.planAction({
      questionId: question.id,
      lineSlug: 'main',
      kind: 'simulation',
      purpose: 'Run the reviewed bounded calculation.',
      expectedEvidence: ['Input, output, and validation log'],
      stopCondition: 'Stop after validation.',
      planningLevel: 'planned',
      researchPlanId: active.planId,
      researchPlanRevision: active.revision,
      milestoneId: active.currentMilestoneId,
      actionPlanId: actionPlan.planId,
      actionPlanRevision: actionPlan.resolution!.planRevision,
    });
    expect(action).toMatchObject({
      researchPlanBinding: {
        planId: active.planId,
        planRevision: active.revision,
        milestoneId: 'm1',
      },
      actionPlanBinding: {
        schema: 'hakimi/action-plan-binding-0.1',
        kind: 'reviewed_plan',
        planId: actionPlan.planId,
        planRevision: 1,
      },
    });
    expect(() => service.prepareResearchPlanV2({
      planId: active.planId,
      expectedRevision: active.revision,
      objective: active.objective,
      completionCriterion: active.completionCriterion,
      milestones: active.milestones,
      evidenceRequirements: active.evidenceRequirements,
      decisionPoints: active.decisionPoints,
      assumptions: active.assumptions,
      currentMilestoneId: active.currentMilestoneId,
      stopConditions: active.stopConditions,
      replanConditions: active.replanConditions,
    })).toThrow('cannot change while action');
    expect(() => service.completeResearchPlanV2({
      planId: active.planId,
      expectedRevision: active.revision,
    })).toThrow('cannot change while action');
    expect(() => service.discardResearchPlanV2({
      planId: active.planId,
      expectedRevision: active.revision,
    })).toThrow('cannot change while action');
    wire.dispatch(researchPutPlanV2({
      ...active,
      revision: active.revision + 1,
      status: 'draft',
      updatedAt: active.updatedAt + 1,
      milestones: active.milestones.map((milestone) => ({
        ...milestone,
        evidenceRequirements: [...milestone.evidenceRequirements],
      })),
      evidenceRequirements: [...active.evidenceRequirements],
      decisionPoints: active.decisionPoints.map((decision) => ({ ...decision })),
      assumptions: [...active.assumptions],
      stopConditions: [...active.stopConditions],
      replanConditions: [...active.replanConditions],
    }));
    expect(() => service.startAction(action.actionId)).toThrow('stale');
  });

  it('rejects a stale local Plan revision at conclusion while simple actions keep a minimal plan', async () => {
    const { service, plan, question, active } = await setupResearchPlanV2();
    const actionPlan = await finalizeReviewedActionPlan(service, plan, question.id);
    const action = service.planAndStartAction({
      questionId: question.id,
      lineSlug: 'main',
      kind: 'simulation',
      purpose: 'Run the reviewed bounded calculation.',
      expectedEvidence: ['Input, output, and validation log'],
      stopCondition: 'Stop after validation.',
      planningLevel: 'planned',
      researchPlanId: active.planId,
      researchPlanRevision: active.revision,
      milestoneId: active.currentMilestoneId,
      actionPlanId: actionPlan.planId,
      actionPlanRevision: actionPlan.resolution!.planRevision,
    });
    wire.dispatch(planRevision({
      id: actionPlan.planId,
      version: 2,
      path: 'plan/revision-2.md',
      sha256: 'b'.repeat(64),
      bytes: 1,
    }));
    expect(() => service.concludeAction({
      actionId: action.actionId,
      status: 'completed',
      progress: {
        headline: 'Validated run',
        motivation: 'Test the plan binding.',
        workPerformed: 'Ran and checked the calculation.',
        result: 'The calculation completed.',
        mainlineImpact: 'Evidence is available.',
      },
      durability: {
        status: 'no_durable_delta',
        rationale: 'The stale binding must fail before any durability action.',
      },
    })).toThrow('stale local Action Plan revision');

    wire = buildWire('research-plan-v2-minimal');
    const { AgentResearchService } = await import('#/features/aitpResearch/research/agentResearchService');
    wire.dispatch(aitpModeEnter({ actor: 'user', lineSlug: 'main' }));
    const minimalService = new AgentResearchService(
      wire, makeScopeCtx(), eventBus, makeStubModeSvc({ isActive: true }), makeStubAdapter(),
      makeToolExecutorStub(), makeStubGoalService(),
    );
    minimalService.createLine({ slug: 'main', title: 'Main' });
    const minimal = minimalService.planAndStartAction({
      kind: 'derivation',
      purpose: 'Check one algebraic identity.',
      expectedEvidence: ['One checked equality'],
      stopCondition: 'Stop after one equality.',
    });
    expect(minimal.actionPlanBinding).toMatchObject({
      schema: 'hakimi/action-plan-binding-0.1',
      kind: 'minimal',
      planRevision: 1,
    });
  });
});

describe('bounded S7 distillation handoff', () => {
  function buildHandoff(input: {
    readonly pluginSkill?: ReturnType<typeof stubSkill>;
    readonly shadowSkill?: ReturnType<typeof stubSkill>;
    readonly visible?: boolean;
  }) {
    const catalog = new InMemorySkillCatalog();
    if (input.pluginSkill !== undefined) {
      catalog.register(input.pluginSkill, { replace: true });
    }
    if (input.shadowSkill !== undefined) {
      catalog.register(input.shadowSkill, { replace: true });
    }
    const recordModelToolActivation = vi.fn();
    const ix = createServices(disposables, {
      strict: true,
      additionalServices: (reg) => {
        reg.definePartialInstance(ISessionSkillCatalog, {
          catalog,
          ready: Promise.resolve(),
        });
        reg.definePartialInstance(IAgentSkillService, { recordModelToolActivation });
        reg.definePartialInstance(IAgentSkillVisibilityService, {
          isSkillVisible: () => input.visible ?? true,
          hiddenReason: () => 'hidden by Research Mode',
        });
        reg.defineInstance(ISessionContext, makeSessionContext({
          sessionId: 'session-s7',
          workspaceId: 'workspace-s7',
          sessionDir: '/sessions/session-s7',
          sessionScope: 'session-s7',
          cwd: '/workspace',
        }));
        reg.defineInstance(IWireService, wire);
        reg.define(IAitpDistillationHandoffService, AitpDistillationHandoffService);
      },
    });
    return {
      service: ix.get(IAitpDistillationHandoffService),
      recordModelToolActivation,
    };
  }

  it('loads the exact AITP plugin Skill and passes only the touched Entry review', async () => {
    const pluginSkill = stubSkill('distilling-methods', {
      path: '/plugins/aitp/skills/distilling-methods/SKILL.md',
      dir: '/plugins/aitp/skills/distilling-methods',
      content: 'AITP distillation rules.',
      source: 'extra',
      plugin: { id: 'aitp-research-protocol' },
    });
    const shadowSkill = stubSkill('distilling-methods', {
      content: 'Unrelated workspace shadow.',
      source: 'project',
    });
    const { service, recordModelToolActivation } = buildHandoff({
      pluginSkill,
      shadowSkill,
    });
    wire.dispatch(researchCommitCheckpoint({
      checkpointId: 'cp-touched',
      entryId: 'entry-touched',
      committedAt: 1000,
    }));

    const result = await service.prepare({
      checkpointId: 'cp-touched',
      entryId: 'entry-touched',
    });

    expect(result.status).toBe('scheduled');
    if (result.status !== 'scheduled') throw new Error('Expected scheduled handoff');
    const message = JSON.stringify(result.delivery.message);
    expect(message).toContain('AITP distillation rules.');
    expect(message).not.toContain('Unrelated workspace shadow.');
    expect(message).toContain('entry-touched');
    expect(message).toContain('cp-touched');
    expect(message).toContain('no eligible trigger is a no-op');
    expect(recordModelToolActivation).toHaveBeenCalledOnce();
    expect(recordModelToolActivation.mock.calls[0]?.[0]).toMatchObject({
      skillName: 'distilling-methods',
      skillPath: '/plugins/aitp/skills/distilling-methods/SKILL.md',
      trigger: 'model-tool',
    });
    expect(wire.getModel(ResearchDistillationModel).attention).toMatchObject({
      schema: 'hakimi/research-distillation-attention-0.1',
      status: 'review_requested',
      checkpointId: 'cp-touched',
      entryId: 'entry-touched',
    });
  });

  it('no-ops when the exact external Skill is absent, hidden, or model-disabled', async () => {
    const shadowSkill = stubSkill('distilling-methods', {
      content: 'Unrelated workspace shadow.',
      source: 'project',
    });
    const absent = buildHandoff({ shadowSkill });
    wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp1', entryId: 'e1', committedAt: 1000 }));
    await expect(absent.service.prepare({ checkpointId: 'cp1', entryId: 'e1' }))
      .resolves.toMatchObject({ status: 'unavailable' });
    expect(absent.recordModelToolActivation).not.toHaveBeenCalled();
    expect(wire.getModel(ResearchDistillationModel).attention).toMatchObject({
      status: 'handoff_unavailable', checkpointId: 'cp1', entryId: 'e1',
    });

    const hidden = buildHandoff({
      pluginSkill: stubSkill('distilling-methods', {
        source: 'extra',
        plugin: { id: 'aitp-research-protocol' },
      }),
      visible: false,
    });
    wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp2', entryId: 'e2', committedAt: 2000 }));
    await expect(hidden.service.prepare({ checkpointId: 'cp2', entryId: 'e2' }))
      .resolves.toMatchObject({ status: 'unavailable' });
    expect(hidden.recordModelToolActivation).not.toHaveBeenCalled();
    expect(wire.getModel(ResearchDistillationModel).attention).toMatchObject({
      status: 'handoff_unavailable', checkpointId: 'cp2', entryId: 'e2',
    });

    const modelDisabled = buildHandoff({
      pluginSkill: stubSkill('distilling-methods', {
        source: 'extra',
        plugin: { id: 'aitp-research-protocol' },
        metadata: { disableModelInvocation: true },
      }),
    });
    wire.dispatch(researchCommitCheckpoint({ checkpointId: 'cp3', entryId: 'e3', committedAt: 3000 }));
    await expect(modelDisabled.service.prepare({ checkpointId: 'cp3', entryId: 'e3' }))
      .resolves.toMatchObject({ status: 'unavailable' });
    expect(modelDisabled.recordModelToolActivation).not.toHaveBeenCalled();
    expect(wire.getModel(ResearchDistillationModel).attention).toMatchObject({
      status: 'handoff_unavailable', checkpointId: 'cp3', entryId: 'e3',
    });
  });
});
