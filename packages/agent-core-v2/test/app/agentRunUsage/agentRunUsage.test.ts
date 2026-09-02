/**
 * Scenario: the App-scoped `agentRunUsage` ledger — append via
 * `IAppendLogStore`, schema/version validation on read (non-empty identity
 * strings, finite + non-negative durations/token counts, unknown-version and
 * malformed records skipped), the by-`runId` fold that preserves started-only
 * incomplete runs, and flush-on-dispose of the acquired log handle.
 * Wiring: the real `AppendLogStore` over in-memory storage and a stubbed
 * `IBootstrapService`; the SUT is resolved by interface.
 * Run with `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run
 * test/app/agentRunUsage/agentRunUsage.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { DisposableStore } from '#/_base/di/lifecycle';
import { TestInstantiationService } from '#/_base/di/test';
import { IBootstrapService } from '#/app/bootstrap/bootstrap';
import { ILogService } from '#/_base/log/log';
import { IAppendLogStore, type AppendLogOptions } from '#/persistence/interface/appendLogStore';
import { IFileSystemStorageService } from '#/persistence/interface/storage';
import { AppendLogStore } from '#/persistence/backends/node-fs/appendLogStore';
import { InMemoryStorageService } from '#/persistence/backends/memory/inMemoryStorageService';

import {
  AGENT_RUN_USAGE_LOG_KEY,
  type AgentRunUsageEntry,
  type AgentRunUsageFinishedRecord,
  type AgentRunUsageStartedRecord,
  IAgentRunUsageService,
} from '#/app/agentRunUsage/agentRunUsage';
import { AgentRunUsageService, MAX_LIVE_STARTED_RUNS } from '#/app/agentRunUsage/agentRunUsageService';

const SCOPE = 'store';
const ZERO = { inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0 };

function started(runId: string, startedAt: number): AgentRunUsageStartedRecord {
  return {
    version: 1,
    kind: 'started',
    runId,
    childAgentId: 'agent-child',
    parentAgentId: 'main',
    profileName: 'explore',
    modelAlias: 'provider/secondary',
    thinkingEffort: 'high',
    preset: 'balanced',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    startedAt,
  };
}

function finished(
  runId: string,
  startedAt: number,
  patch: Partial<AgentRunUsageFinishedRecord> = {},
): AgentRunUsageFinishedRecord {
  return {
    version: 1,
    kind: 'finished',
    runId,
    status: 'completed',
    startedAt,
    endedAt: startedAt + 1000,
    durationMs: 1000,
    usage: ZERO,
    contextTokens: 4000,
    ...patch,
  };
}

describe('AgentRunUsageService (App ledger)', () => {
  let disposables: DisposableStore;
  let ix: TestInstantiationService;
  let storage: InMemoryStorageService;
  let service: IAgentRunUsageService;

  beforeEach(() => {
    disposables = new DisposableStore();
    ix = disposables.add(new TestInstantiationService());
    storage = new InMemoryStorageService();
    ix.stub(IFileSystemStorageService, storage);
    ix.stub(IBootstrapService, { scope: () => SCOPE } as unknown as IBootstrapService);
    ix.stub(ILogService, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: () => ({} as ILogService),
      level: 'warn',
      setLevel: () => {},
      flush: async () => {},
      _serviceBrand: undefined,
    } as unknown as ILogService);
    ix.set(IAppendLogStore, new SyncDescriptor(AppendLogStore));
    ix.set(IAgentRunUsageService, new SyncDescriptor(AgentRunUsageService));
    service = ix.get(IAgentRunUsageService);
  });

  afterEach(() => disposables.dispose());

  async function readRaw(): Promise<readonly unknown[]> {
    const out: unknown[] = [];
    for await (const raw of ix.get(IAppendLogStore).read<unknown>(SCOPE, AGENT_RUN_USAGE_LOG_KEY)) {
      out.push(raw);
    }
    return out;
  }

  it('round-trips started + finished records and folds them by runId', async () => {
    service.appendStarted(started('run-1', 1000));
    service.appendFinished(finished('run-1', 1000, {
      errorCode: undefined,
      usage: undefined,
      averageFirstTokenLatencyMs: 250,
      firstTokenLatencySampleCount: 3,
      llmRequestCount: 4,
    }));

    const entries = await service.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.started.runId).toBe('run-1');
    expect(entries[0]?.started.sessionId).toBe('session-1');
    expect(entries[0]?.started.preset).toBe('balanced');
    expect(entries[0]?.finished?.status).toBe('completed');
    expect(entries[0]?.finished?.durationMs).toBe(1000);
    expect(entries[0]?.finished?.averageFirstTokenLatencyMs).toBe(250);
    expect(entries[0]?.finished?.firstTokenLatencySampleCount).toBe(3);
    expect(entries[0]?.finished?.llmRequestCount).toBe(4);
  });

  it('continues to read v1 finished records that omit aggregate latency fields', async () => {
    service.appendStarted(started('legacy-run', 1000));
    service.appendFinished(finished('legacy-run', 1000));

    const entries = await service.read();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.finished?.averageFirstTokenLatencyMs).toBeUndefined();
    expect(entries[0]?.finished?.firstTokenLatencySampleCount).toBeUndefined();
    expect(entries[0]?.finished?.llmRequestCount).toBeUndefined();
  });

  it('preserves started-only incomplete runs', async () => {
    service.appendStarted(started('run-1', 1000));

    const entries = await service.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.started.runId).toBe('run-1');
    expect(entries[0]?.finished).toBeUndefined();
  });

  it('drops finished records without a matching started', async () => {
    service.appendFinished(finished('orphan', 1000));

    const entries = await service.read();
    expect(entries).toHaveLength(0);
  });

  it('keeps the first started and first finished for a duplicated runId', async () => {
    service.appendStarted(started('run-1', 1000));
    service.appendStarted(started('run-1', 1000));
    service.appendFinished(finished('run-1', 1000, { status: 'failed' }));
    service.appendFinished(finished('run-1', 1000, { status: 'cancelled' }));

    const entries = await service.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.finished?.status).toBe('failed');
  });

  it('skips records with an unknown version, unknown kind, or malformed fields', async () => {
    service.appendStarted(started('run-1', 1000));
    service.appendFinished(finished('run-1', 1000));

    const appendLog = ix.get(IAppendLogStore);
    appendLog.append(SCOPE, AGENT_RUN_USAGE_LOG_KEY, { version: 999, kind: 'started', runId: 'future' });
    appendLog.append(SCOPE, AGENT_RUN_USAGE_LOG_KEY, { version: 1, kind: 'paused', runId: 'run-x' });
    appendLog.append(SCOPE, AGENT_RUN_USAGE_LOG_KEY, { version: 1, kind: 'started', runId: 42 });
    appendLog.append(SCOPE, AGENT_RUN_USAGE_LOG_KEY, { version: 1, kind: 'finished', runId: 'run-y', status: 'exploded', startedAt: 0, endedAt: 1, durationMs: 1 });

    const entries = await service.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.started.runId).toBe('run-1');
    const raw = await readRaw();
    expect(raw).toHaveLength(6);
  });

  it('rejects empty identity strings and negative or non-finite numbers', async () => {
    const appendLog = ix.get(IAppendLogStore);
    const invalid = [
      () => started('', 1000),
      () => started('run-1', -5),
      () => ({ ...started('run-1', 1000), childAgentId: '' }),
      () => ({ ...started('run-1', 1000), sessionId: '' }),
      () => ({ ...started('run-1', 1000), workspaceId: '  ' }),
      () => ({ ...started('run-1', 1000), modelAlias: '' }),
      () => finished('run-1', 1000, { durationMs: -1 }),
      () => finished('run-1', 1000, { endedAt: Number.NaN }),
      () => finished('run-1', 1000, { contextTokens: -3 }),
      () => finished('run-1', 1000, { averageFirstTokenLatencyMs: -1 }),
      () => finished('run-1', 1000, { averageFirstTokenLatencyMs: Number.NaN }),
      () => finished('run-1', 1000, { firstTokenLatencySampleCount: -1 }),
      () => finished('run-1', 1000, { firstTokenLatencySampleCount: 1.5 }),
      () => finished('run-1', 1000, { llmRequestCount: -1 }),
      () => finished('run-1', 1000, { llmRequestCount: 1.5 }),
      () => finished('run-1', 1000, { usage: { inputOther: -1, output: 0, inputCacheRead: 0, inputCacheCreation: 0 } }),
      () => finished('run-1', 1000, { usage: { inputOther: Number.POSITIVE_INFINITY, output: 0, inputCacheRead: 0, inputCacheCreation: 0 } }),
      () => finished('', 1000, {}),
    ];
    for (const make of invalid) appendLog.append(SCOPE, AGENT_RUN_USAGE_LOG_KEY, make());

    const entries = await service.read();
    expect(entries).toHaveLength(0);
    expect((await readRaw()).length).toBe(invalid.length);
  });

  it('flushes pending appends when the service is disposed', async () => {
    const concrete = ix.get(IAgentRunUsageService) as AgentRunUsageService;
    concrete.appendStarted(started('run-1', 1000));
    concrete.appendStarted(started('run-2', 1000));
    concrete.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const bytes = await storage.read(SCOPE, AGENT_RUN_USAGE_LOG_KEY);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('"runId":"run-1"');
    expect(text).toContain('"runId":"run-2"');
  });

  it('warns when the ledger flush fails instead of failing silently', () => {
    const captured: string[] = [];
    const log = {
      warn: vi.fn((message: string) => captured.push(message)),
    } as unknown as ILogService;
    const failingAppendLog: IAppendLogStore = {
      append: (_scope: string, _key: string, _record: unknown, options?: AppendLogOptions) => {
        options?.onError?.(new Error('storage exploded'));
      },
      acquire: () => ({ dispose: () => {} }),
    } as unknown as IAppendLogStore;
    const ix2 = disposables.add(new TestInstantiationService());
    ix2.stub(IBootstrapService, { scope: () => SCOPE } as unknown as IBootstrapService);
    ix2.stub(IAppendLogStore, failingAppendLog);
    ix2.stub(ILogService, log);
    ix2.set(IAgentRunUsageService, new SyncDescriptor(AgentRunUsageService));
    const svc = ix2.get(IAgentRunUsageService);

    svc.appendStarted(started('run-x', 1000));
    svc.appendFinished(finished('run-x', 1000));
    expect(captured.some((message) => message.includes('agent-run usage ledger flush failed'))).toBe(true);
  });

  it('fires the completion event once per live runId and never for orphans', async () => {
    const seen: AgentRunUsageEntry[] = [];
    disposables.add(service.onDidFinishRun((entry) => seen.push(entry)));

    service.appendStarted(started('run-1', 1000));
    service.appendFinished(finished('run-1', 1000));
    // A duplicate finished for the same runId must not fire again.
    service.appendFinished(finished('run-1', 1000, { status: 'cancelled' }));
    // A finished without a matching live started is an orphan and stays silent.
    service.appendFinished(finished('orphan', 1000));

    expect(seen).toHaveLength(1);
    expect(seen[0]?.started.runId).toBe('run-1');
    expect(seen[0]?.finished?.status).toBe('completed');
  });

  it('fires the completion event only after both sides of a run are seen', async () => {
    const seen: AgentRunUsageEntry[] = [];
    disposables.add(service.onDidFinishRun((entry) => seen.push(entry)));

    // Started-only: no event yet.
    service.appendStarted(started('run-2', 1000));
    expect(seen).toHaveLength(0);

    service.appendFinished(finished('run-2', 1000));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.started.runId).toBe('run-2');
  });

  it('drops the live started state on completion so repeats stay silent', async () => {
    const seen: AgentRunUsageEntry[] = [];
    disposables.add(service.onDidFinishRun((entry) => seen.push(entry)));

    service.appendStarted(started('run-3', 1000));
    service.appendFinished(finished('run-3', 1000));
    service.appendFinished(finished('run-3', 1000, { status: 'cancelled' }));

    expect(seen).toHaveLength(1);
    expect(seen[0]?.finished?.status).toBe('completed');
  });

  it('caps the live started state so an evicted runId no longer fires', async () => {
    const seen: AgentRunUsageEntry[] = [];
    disposables.add(service.onDidFinishRun((entry) => seen.push(entry)));

    for (let i = 0; i <= MAX_LIVE_STARTED_RUNS; i += 1) {
      service.appendStarted(started(`cap-${i}`, 1000));
    }
    // The first started was evicted by the capacity cap; its finish is an
    // orphan and stays silent, while the ledger still retains every record.
    service.appendFinished(finished('cap-0', 1000));
    const entries = await service.read();
    expect(entries).toHaveLength(MAX_LIVE_STARTED_RUNS + 1);

    service.appendFinished(finished(`cap-${MAX_LIVE_STARTED_RUNS}`, 1000));
    expect(seen.map((entry) => entry.started.runId)).toEqual([`cap-${MAX_LIVE_STARTED_RUNS}`]);
  });

  it('iterate yields validated records only', async () => {
    service.appendStarted(started('run-1', 1000));
    ix.get(IAppendLogStore).append(SCOPE, AGENT_RUN_USAGE_LOG_KEY, { version: 999, kind: 'started' });

    const seen: string[] = [];
    for await (const record of service.iterate()) seen.push(record.kind);
    expect(seen).toEqual(['started']);
  });
});