/**
 * Scenario: `mirrorAgentRun` run lifecycle — every mirror owns a unique
 * `runId`, emits exactly one internal `AgentRunStartedEvent` and one
 * `AgentRunFinishedEvent` (completed / failed / cancelled) through the Session
 * service's notify surface, and finishes even when abort or rate-limit
 * suppression hides the UI failure signal. The internal events never touch the
 * per-agent `IEventBus` — the bus only carries the unchanged UI
 * `subagent.started` / `subagent.completed` / `subagent.failed` signals.
 * Finished events carry only a sanitized error code — never the error message,
 * summary, or user content — plus the incremental `runUsage` delta, while the
 * UI completed event and the mirror's return value keep the cumulative `usage`
 * contract and never expose `runUsage`. An ordinary start-hook failure counts
 * as `failed`; only aborts are `cancelled`.
 * Wiring: a fake requester handle with a fake bus, fake subagent-hooks
 * service, and a fake lifecycle serving a fake child profile/usage; the SUT
 * is the exported pure function.
 * Run with `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run
 * test/session/subagent/mirrorAgentRun.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type IDisposable } from '#/_base/di/lifecycle';
import { abortError, userCancellationReason } from '#/_base/utils/abort';
import { createHooks, type Hooks } from '#/hooks';
import type { IAgentScopeHandle } from '#/_base/di/scope';
import { IEventBus, type DomainEvent } from '#/app/event/eventBus';
import { APIProviderRateLimitError } from '#/kosong/contract/errors';
import type { TokenUsage } from '#/kosong/contract/usage';
import { IAgentTokenCountingService } from '#/agent/tokenCounting/tokenCounting';
import { IAgentProfileService } from '#/agent/profile/profile';
import { IAgentUsageService } from '#/agent/usage/usage';
import { IAgentLifecycleService } from '#/session/agentLifecycle/agentLifecycle';
import type { Turn } from '#/agent/loop/loop';

import { mirrorAgentRun } from '#/session/subagent/mirrorAgentRun';
import {
  type AgentRunFinishedEvent,
  type AgentRunHandle,
  type AgentRunStartedEvent,
  type AgentRunTimingEvidence,
  type AgentTaskHooks,
  ISessionSubagentService,
} from '#/session/subagent/subagent';

const ZERO = { inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0 };

class FakeBus implements IEventBus {
  declare readonly _serviceBrand: undefined;
  readonly published: DomainEvent[] = [];
  private readonly handlers = new Set<{ type?: string; fn: (event: DomainEvent) => void }>();

  get listenerCount(): number {
    return this.handlers.size;
  }

  publish(event: DomainEvent): void {
    this.published.push(event);
    for (const h of [...this.handlers]) {
      if (h.type === undefined || h.type === event.type) h.fn(event);
    }
  }

  subscribe(arg1: unknown, arg2?: unknown): IDisposable {
    const entry =
      typeof arg1 === 'string'
        ? { type: arg1, fn: arg2 as (event: DomainEvent) => void }
        : { fn: arg1 as (event: DomainEvent) => void };
    this.handlers.add(entry);
    return { dispose: () => this.handlers.delete(entry) };
  }
}

function fakeChildHandle(
  total: () => TokenUsage | undefined,
  eventBus: IEventBus,
): IAgentScopeHandle {
  const profile: IAgentProfileService = {
    _serviceBrand: undefined,
    data: () => ({ modelAlias: 'child-model', profileName: 'explore' }),
    getEffectiveThinkingLevel: () => 'high',
  } as unknown as IAgentProfileService;
  const tokens: IAgentTokenCountingService = {
    _serviceBrand: undefined,
    statusSize: () => 555,
  } as unknown as IAgentTokenCountingService;
  const usage: IAgentUsageService = {
    _serviceBrand: undefined,
    status: () => ({ total: total() }),
    record: vi.fn(),
    onDidRecord: undefined as never,
  };
  return {
    id: 'agent-child',
    kind: 'agent',
    accessor: {
      get: (token: unknown) => {
        if (token === IAgentProfileService) return profile;
        if (token === IAgentTokenCountingService) return tokens;
        if (token === IAgentUsageService) return usage;
        if (token === IEventBus) return eventBus;
        return undefined;
      },
    },
    dispose: () => {},
  } as unknown as IAgentScopeHandle;
}

function runHandle(
  completion: Promise<{ summary: string; usage?: TokenUsage; runUsage?: TokenUsage }>,
  timing: AgentRunTimingEvidence = {
    llmRequestCount: 0,
    firstTokenLatencySampleCount: 0,
  },
): AgentRunHandle {
  return {
    agentId: 'agent-child',
    turn: { id: 1 } as Turn,
    baseline: { ...ZERO },
    timingEvidence: () => timing,
    completion,
  };
}

function setup(options: { total?: () => TokenUsage | undefined } = {}): {
  bus: FakeBus;
  childBus: FakeBus;
  requester: IAgentScopeHandle;
  hooks: Hooks<AgentTaskHooks>;
  cancel: ReturnType<typeof vi.fn>;
  stopped: ReturnType<typeof vi.fn>;
  startedEvents: AgentRunStartedEvent[];
  finishedEvents: AgentRunFinishedEvent[];
} {
  const bus = new FakeBus();
  const childBus = new FakeBus();
  const hooks = createHooks<AgentTaskHooks, keyof AgentTaskHooks>(['onWillStartAgentTask']);
  const stopped = vi.fn();
  const startedEvents: AgentRunStartedEvent[] = [];
  const finishedEvents: AgentRunFinishedEvent[] = [];
  const subagents: ISessionSubagentService = {
    _serviceBrand: undefined,
    hooks,
    onDidStopAgentTask: undefined as never,
    onDidStartAgentRun: undefined as never,
    onDidFinishAgentRun: undefined as never,
    run: vi.fn(),
    notifyAgentTaskStopped: stopped as ISessionSubagentService['notifyAgentTaskStopped'],
    notifyAgentRunStarted: (event) => startedEvents.push(event),
    notifyAgentRunFinished: (event) => finishedEvents.push(event),
  };
  const lifecycle = {
    get: () => fakeChildHandle(options.total ?? (() => undefined), childBus),
    list: () => [],
  } as unknown as IAgentLifecycleService;
  const cancel = vi.fn();
  const requester = {
    id: 'main',
    kind: 'agent',
    accessor: {
      get: (token: unknown) => {
        if (token === IEventBus) return bus;
        if (token === ISessionSubagentService) return subagents;
        if (token === IAgentLifecycleService) return lifecycle;
        return undefined;
      },
    },
    dispose: () => {},
  } as unknown as IAgentScopeHandle;
  return { bus, childBus, requester, hooks, cancel, stopped, startedEvents, finishedEvents };
}

function singleStarted(startedEvents: AgentRunStartedEvent[]): AgentRunStartedEvent {
  expect(startedEvents).toHaveLength(1);
  return startedEvents[0]!;
}

function singleFinished(finishedEvents: AgentRunFinishedEvent[]): AgentRunFinishedEvent {
  expect(finishedEvents).toHaveLength(1);
  return finishedEvents[0]!;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('mirrorAgentRun run lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('feeds the ledger the per-run runUsage while the UI/return keep cumulative usage', async () => {
    const { bus, requester, stopped, startedEvents, finishedEvents } = setup();
    const cumulative = { inputOther: 100, output: 30, inputCacheRead: 10, inputCacheCreation: 5 };
    const runUsage = { inputOther: 11, output: 4, inputCacheRead: 2, inputCacheCreation: 1 };
    const outcome = await mirrorAgentRun(
      requester,
      runHandle(Promise.resolve({ summary: 'done', usage: cumulative, runUsage })),
      { profileName: 'explore', signal: new AbortController().signal },
    );

    const started = singleStarted(startedEvents);
    expect(started.runId).toBeTruthy();
    expect(started.childAgentId).toBe('agent-child');
    expect(started.parentAgentId).toBe('main');
    expect(started.profileName).toBe('explore');
    expect(started.modelAlias).toBe('child-model');
    expect(started.thinkingEffort).toBe('high');

    const finished = singleFinished(finishedEvents);
    expect(finished.runId).toBe(started.runId);
    expect(finished.startedAt).toBe(started.startedAt);
    expect(finished.status).toBe('completed');
    expect(finished.endedAt).toBeGreaterThanOrEqual(finished.startedAt);
    expect(finished.durationMs).toBe(finished.endedAt - finished.startedAt);
    expect(finished.usage).toEqual(runUsage);
    expect(finished.contextTokens).toBe(555);
    expect(stopped).toHaveBeenCalledWith({ agentName: 'explore', response: 'done' });

    const completedEvent = bus.published.find(
      (event): event is DomainEvent & { usage?: TokenUsage } => event.type === 'subagent.completed',
    );
    expect(completedEvent?.usage).toEqual(cumulative);

    expect(bus.published.map((event) => event.type)).toEqual(['subagent.started', 'subagent.completed']);
    expect(bus.published.some((event) => 'runId' in event)).toBe(false);
    expect(outcome.usage).toEqual(cumulative);
    expect('runUsage' in outcome).toBe(false);
  });

  it('records timing evidence when the child run completed before mirroring began', async () => {
    const { childBus, requester, finishedEvents } = setup();
    const run = runHandle(
      Promise.resolve({ summary: 'done' }),
      {
        llmRequestCount: 3,
        firstTokenLatencySampleCount: 2,
        averageFirstTokenLatencyMs: 200,
      },
    );

    await run.completion;
    await mirrorAgentRun(requester, run, {
      profileName: 'explore',
      signal: new AbortController().signal,
    });

    expect(singleFinished(finishedEvents)).toMatchObject({
      llmRequestCount: 3,
      firstTokenLatencySampleCount: 2,
      averageFirstTokenLatencyMs: 200,
    });
    expect(childBus.listenerCount).toBe(0);
  });

  it('records partial timing samples separately from total requests', async () => {
    const { requester, finishedEvents } = setup();
    await mirrorAgentRun(
      requester,
      runHandle(
        Promise.resolve({ summary: 'done' }),
        {
          llmRequestCount: 4,
          firstTokenLatencySampleCount: 1,
          averageFirstTokenLatencyMs: 120,
        },
      ),
      { profileName: 'explore', signal: new AbortController().signal },
    );

    expect(singleFinished(finishedEvents)).toMatchObject({
      llmRequestCount: 4,
      firstTokenLatencySampleCount: 1,
      averageFirstTokenLatencyMs: 120,
    });
  });

  it('records requests without timing while leaving the latency aggregate absent', async () => {
    const { requester, finishedEvents } = setup();
    await mirrorAgentRun(
      requester,
      runHandle(Promise.resolve({ summary: 'done' }), {
        llmRequestCount: 1,
        firstTokenLatencySampleCount: 0,
      }),
      { profileName: 'explore', signal: new AbortController().signal },
    );

    const finished = singleFinished(finishedEvents);
    expect(finished.llmRequestCount).toBe(1);
    expect(finished.firstTokenLatencySampleCount).toBeUndefined();
    expect(finished.averageFirstTokenLatencyMs).toBeUndefined();
  });

  it('keeps aggregate timing evidence on failed and cancelled runs', async () => {
    const failedCompletion = deferred<{ summary: string }>();
    const failedSetup = setup();
    const failed = mirrorAgentRun(
      failedSetup.requester,
      runHandle(failedCompletion.promise, {
        llmRequestCount: 2,
        firstTokenLatencySampleCount: 1,
        averageFirstTokenLatencyMs: 120,
      }),
      { profileName: 'explore', signal: new AbortController().signal },
    );
    failedCompletion.reject(new APIProviderRateLimitError('limited', 'req-metrics'));
    await expect(failed).rejects.toThrow('limited');
    expect(singleFinished(failedSetup.finishedEvents)).toMatchObject({
      status: 'failed',
      llmRequestCount: 2,
      firstTokenLatencySampleCount: 1,
      averageFirstTokenLatencyMs: 120,
    });

    const cancelledCompletion = deferred<{ summary: string }>();
    const cancelledSetup = setup();
    const cancelled = mirrorAgentRun(
      cancelledSetup.requester,
      runHandle(cancelledCompletion.promise, {
        llmRequestCount: 1,
        firstTokenLatencySampleCount: 1,
        averageFirstTokenLatencyMs: 80,
      }),
      { profileName: 'explore', signal: new AbortController().signal },
    );
    cancelledCompletion.reject(abortError('Aborted'));
    await expect(cancelled).rejects.toThrow('Aborted');
    expect(singleFinished(cancelledSetup.finishedEvents)).toMatchObject({
      status: 'cancelled',
      llmRequestCount: 1,
      firstTokenLatencySampleCount: 1,
      averageFirstTokenLatencyMs: 80,
    });
  });

  it('assigns a unique runId per mirror', async () => {
    const { requester, startedEvents } = setup();
    await mirrorAgentRun(requester, runHandle(Promise.resolve({ summary: 'a' })), {
      profileName: 'explore',
      signal: new AbortController().signal,
    });
    await mirrorAgentRun(requester, runHandle(Promise.resolve({ summary: 'b' })), {
      profileName: 'explore',
      signal: new AbortController().signal,
    });
    expect(startedEvents).toHaveLength(2);
    expect(startedEvents[0]!.runId).not.toBe(startedEvents[1]!.runId);
  });

  it('finishes failed with a sanitized error code and never the message', async () => {
    const { bus, requester, finishedEvents } = setup({
      total: () => ({ inputOther: 30, output: 7, inputCacheRead: 2, inputCacheCreation: 1 }),
    });
    const run = runHandle(Promise.reject(new APIProviderRateLimitError('too many requests', 'req-1')));

    await expect(mirrorAgentRun(requester, run, {
      profileName: 'explore',
      signal: new AbortController().signal,
    })).rejects.toThrow('too many requests');

    const finished = singleFinished(finishedEvents);
    expect(finished.status).toBe('failed');
    expect(finished.errorCode).toBe('provider.rate_limit');
    expect(finished.usage).toEqual({ inputOther: 30, output: 7, inputCacheRead: 2, inputCacheCreation: 1 });
    const serialized = JSON.stringify({ ...finished });
    expect(serialized).not.toContain('too many requests');
    expect(serialized).not.toContain('message');
    expect(serialized).not.toContain('summary');
    expect(bus.published.some((event) => event.type === 'subagent.failed')).toBe(true);
    expect(bus.published.some((event) => 'runId' in event)).toBe(false);
  });

  it('finishes cancelled when the run is aborted before completion', async () => {
    const { bus, requester, cancel, finishedEvents } = setup();
    const controller = new AbortController();
    controller.abort(userCancellationReason());
    const run = runHandle(Promise.resolve({ summary: 'never awaited' }));

    await expect(mirrorAgentRun(requester, run, {
      profileName: 'explore',
      prompt: 'Investigate',
      signal: controller.signal,
      cancel: cancel as (reason?: unknown) => void,
    })).rejects.toThrow();

    const finished = singleFinished(finishedEvents);
    expect(finished.status).toBe('cancelled');
    expect(cancel).toHaveBeenCalledWith(controller.signal.reason);
    expect(bus.published.some((event) => event.type === 'subagent.failed')).toBe(false);
    expect(bus.published.some((event) => event.type === 'subagent.completed')).toBe(false);
  });

  it('finishes cancelled when the completion rejects with an abort error', async () => {
    const { bus, requester, finishedEvents } = setup();
    const run = runHandle(Promise.reject(abortError('Aborted')));

    await expect(mirrorAgentRun(requester, run, {
      profileName: 'explore',
      signal: new AbortController().signal,
    })).rejects.toThrow('Aborted');

    expect(singleFinished(finishedEvents).status).toBe('cancelled');
    expect(bus.published.some((event) => event.type === 'subagent.failed')).toBe(false);
  });

  it('still finishes failed internally when rate-limit suppression hides the UI event', async () => {
    const { bus, requester, finishedEvents } = setup();
    const run = runHandle(Promise.reject(new APIProviderRateLimitError('slow down', 'req-2')));

    await expect(mirrorAgentRun(requester, run, {
      profileName: 'explore',
      suppressRateLimitFailureEvent: true,
      signal: new AbortController().signal,
    })).rejects.toThrow('slow down');

    const finished = singleFinished(finishedEvents);
    expect(finished.status).toBe('failed');
    expect(finished.errorCode).toBe('provider.rate_limit');
    expect(bus.published.some((event) => event.type === 'subagent.failed')).toBe(false);
  });

  it('finishes failed when the start hook throws and still cancels the child', async () => {
    const { bus, requester, hooks, cancel, startedEvents, finishedEvents } = setup();
    hooks.onWillStartAgentTask.register('boom', async () => {
      throw new Error('hook boom');
    });

    await expect(mirrorAgentRun(requester, runHandle(Promise.resolve({ summary: 'unused' })), {
      profileName: 'explore',
      prompt: 'Investigate',
      signal: new AbortController().signal,
      cancel: cancel as (reason?: unknown) => void,
    })).rejects.toThrow('hook boom');

    const finished = singleFinished(finishedEvents);
    expect(finished.status).toBe('failed');
    expect(cancel).toHaveBeenCalled();
    expect(singleStarted(startedEvents).runId).toBe(finished.runId);
    expect(bus.published.some((event) => 'runId' in event)).toBe(false);
  });
});