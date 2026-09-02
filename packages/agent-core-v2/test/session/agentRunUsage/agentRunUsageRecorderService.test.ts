/**
 * Scenario: the Session-scoped `agentRunUsage` recorder — subscribes to the
 * Session service's internal run-lifecycle events and folds them into ledger
 * records stamped with session/workspace identity and the active `[subagent]`
 * preset, dedupes in-process, and stops writing once disposed.
 * Wiring: the real recorder through a Session scope; a fake
 * `ISessionSubagentService` carrying event emitters + notify methods, a
 * stubbed `IAgentRunUsageService` capturing appended records, and a stubbed
 * `IConfigService` holding the active preset. No per-agent `IEventBus` is
 * involved anywhere in the recording path.
 * Run with `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run
 * test/session/agentRunUsage/agentRunUsageRecorderService.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Emitter, Event } from '#/_base/event';
import { LifecycleScope } from '#/app/scopes';
import {
  _clearScopedRegistryForTests,
  ScopeActivation,
  registerScopedService,
  type Scope,
} from '#/_base/di/scope';
import { createScopedTestHost, stubPair, type ScopedTestHost } from '#/_base/di/test';
import { createHooks } from '#/hooks';
import { ISessionContext, makeSessionContext } from '#/session/sessionContext/sessionContext';
import { IConfigService } from '#/app/config/config';
import {
  type AgentRunFinishedEvent,
  type AgentRunStartedEvent,
  type AgentTaskHooks,
  type AgentTaskStopHookContext,
  ISessionSubagentService,
} from '#/session/subagent/subagent';
import {
  type AgentRunUsageEntry,
  type AgentRunUsageFinishedRecord,
  type AgentRunUsageRecord,
  type AgentRunUsageStartedRecord,
  foldAgentRunUsage,
  IAgentRunUsageService,
} from '#/app/agentRunUsage/agentRunUsage';
import {
  AgentRunUsageRecorderService,
  IAgentRunUsageRecorderService,
} from '#/session/agentRunUsage/agentRunUsageRecorderService';

class FakeSubagentService implements ISessionSubagentService {
  declare readonly _serviceBrand: undefined;
  readonly hooks = createHooks<AgentTaskHooks, keyof AgentTaskHooks>(['onWillStartAgentTask']);
  readonly onDidStopAgentTask = Event.None as Event<AgentTaskStopHookContext>;
  readonly onDidStartAgentRunEmitter = new Emitter<AgentRunStartedEvent>();
  readonly onDidFinishAgentRunEmitter = new Emitter<AgentRunFinishedEvent>();
  readonly onDidStartAgentRun = this.onDidStartAgentRunEmitter.event;
  readonly onDidFinishAgentRun = this.onDidFinishAgentRunEmitter.event;

  run(): Promise<never> {
    throw new Error('not implemented');
  }

  notifyAgentTaskStopped(): void {}

  notifyAgentRunStarted(event: AgentRunStartedEvent): void {
    this.onDidStartAgentRunEmitter.fire(event);
  }

  notifyAgentRunFinished(event: AgentRunFinishedEvent): void {
    this.onDidFinishAgentRunEmitter.fire(event);
  }
}

class FakeUsageService implements IAgentRunUsageService {
  declare readonly _serviceBrand: undefined;
  readonly appended: AgentRunUsageRecord[] = [];
  readonly onDidFinishRun = Event.None as Event<AgentRunUsageEntry>;

  appendStarted(record: AgentRunUsageStartedRecord): void {
    this.appended.push(record);
  }

  appendFinished(record: AgentRunUsageFinishedRecord): void {
    this.appended.push(record);
  }

  async *iterate(): AsyncIterable<AgentRunUsageRecord> {
    yield* this.appended;
  }

  async read(): Promise<readonly AgentRunUsageEntry[]> {
    return foldAgentRunUsage(this.appended);
  }
}

const SESSION_ID = 'session-1';
const WORKSPACE_ID = 'workspace-1';

function sessionContext(): ISessionContext {
  return makeSessionContext({
    sessionId: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    sessionDir: '/sessions/session-1',
    sessionScope: 'sessions/session-1',
    cwd: '/work',
    metaScope: 'sessions/session-1/meta',
  });
}

function configService(preset: () => string | undefined): IConfigService {
  return {
    get: (domain: string) => (domain === 'subagent' ? { preset: preset() } : undefined),
  } as unknown as IConfigService;
}

const STARTED: AgentRunStartedEvent = {
  runId: 'run-1',
  childAgentId: 'agent-child',
  parentAgentId: 'main',
  profileName: 'explore',
  modelAlias: 'provider/secondary',
  thinkingEffort: 'high',
  startedAt: 1000,
};

const FINISHED: AgentRunFinishedEvent = {
  runId: 'run-1',
  status: 'completed',
  startedAt: 1000,
  endedAt: 2000,
  durationMs: 1000,
};

describe('IAgentRunUsageRecorderService (Session scope)', () => {
  let host: ScopedTestHost;
  let session: Scope;
  let subagents: FakeSubagentService;
  let usage: FakeUsageService;
  let activePreset: string | undefined;

  beforeEach(() => {
    _clearScopedRegistryForTests();
    registerScopedService(
      LifecycleScope.Session,
      IAgentRunUsageRecorderService,
      AgentRunUsageRecorderService,
      ScopeActivation.OnScopeCreated,
      'agentRunUsage',
    );

    activePreset = 'balanced';
    host = createScopedTestHost();
    subagents = new FakeSubagentService();
    usage = new FakeUsageService();
    session = host.child(LifecycleScope.Session, SESSION_ID, [
      stubPair(ISessionContext, sessionContext()),
      stubPair(IConfigService, configService(() => activePreset)),
      stubPair(ISessionSubagentService, subagents),
      stubPair(IAgentRunUsageService, usage),
    ]);
  });

  afterEach(() => host.dispose());

  it('folds internal run events into records stamped with session identity and preset', () => {
    subagents.notifyAgentRunStarted(STARTED);
    subagents.notifyAgentRunFinished({
      ...FINISHED,
      status: 'completed',
      usage: { inputOther: 10, output: 5, inputCacheRead: 2, inputCacheCreation: 1 },
      contextTokens: 4000,
      averageFirstTokenLatencyMs: 240,
      firstTokenLatencySampleCount: 2,
      llmRequestCount: 3,
    });

    expect(usage.appended).toHaveLength(2);
    expect(usage.appended[0]).toMatchObject({
      kind: 'started',
      runId: 'run-1',
      childAgentId: 'agent-child',
      parentAgentId: 'main',
      profileName: 'explore',
      modelAlias: 'provider/secondary',
      thinkingEffort: 'high',
      preset: 'balanced',
      sessionId: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      startedAt: 1000,
      version: 1,
    });
    expect(usage.appended[1]).toMatchObject({
      kind: 'finished',
      runId: 'run-1',
      status: 'completed',
      startedAt: 1000,
      endedAt: 2000,
      durationMs: 1000,
      contextTokens: 4000,
      averageFirstTokenLatencyMs: 240,
      firstTokenLatencySampleCount: 2,
      llmRequestCount: 3,
      version: 1,
    });
    expect((usage.appended[1] as AgentRunUsageFinishedRecord).usage).toEqual({
      inputOther: 10,
      output: 5,
      inputCacheRead: 2,
      inputCacheCreation: 1,
    });
  });

  it('captures the active preset at started time', () => {
    activePreset = 'codex-heavy';
    subagents.notifyAgentRunStarted(STARTED);
    const startedRecord = usage.appended[0] as AgentRunUsageStartedRecord;
    expect(startedRecord.preset).toBe('codex-heavy');
  });

  it('dedupes the same runId + kind in-process', () => {
    subagents.notifyAgentRunStarted(STARTED);
    subagents.notifyAgentRunStarted(STARTED);
    expect(usage.appended).toHaveLength(1);
    subagents.notifyAgentRunFinished(FINISHED);
    subagents.notifyAgentRunFinished(FINISHED);
    expect(usage.appended).toHaveLength(2);
  });

  it('records a finished event carrying only a sanitized error code, never the message', () => {
    subagents.notifyAgentRunStarted(STARTED);
    subagents.notifyAgentRunFinished({
      runId: 'run-1',
      status: 'failed',
      startedAt: 1000,
      endedAt: 2000,
      durationMs: 1000,
      errorCode: 'provider.rate_limit',
      usage: { inputOther: 3, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
    });

    const finishedRecord = usage.appended[1] as AgentRunUsageFinishedRecord;
    expect(finishedRecord.errorCode).toBe('provider.rate_limit');
    expect(JSON.stringify(finishedRecord)).not.toContain('message');
    expect(JSON.stringify(finishedRecord)).not.toContain('summary');
    expect(JSON.stringify(finishedRecord)).not.toContain('/work');
  });

  it('stops writing after the session is disposed', () => {
    session.dispose();
    subagents.notifyAgentRunStarted(STARTED);
    expect(usage.appended).toHaveLength(0);
  });
});