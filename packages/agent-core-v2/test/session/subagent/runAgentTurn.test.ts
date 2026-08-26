/**
 * Scenario: `runAgentTurn` usage accounting — the baseline snapped before the
 * run, the cumulative total on the completion's `usage` (the legacy wire
 * semantics) alongside the non-negative per-run delta on `runUsage`, the same
 * delta covering summary-continuation turns, incremental attribution for
 * resumed/retried agents, and `runUsageSince` deriving the partial delta for
 * failed/cancelled runs.
 * Wiring: a fake agent handle whose accessor serves scripted prompt / loop /
 * context-memory / usage fakes; the SUT is the exported pure function.
 * Run with `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run
 * test/session/subagent/runAgentTurn.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IAgentScopeHandle } from '#/_base/di/scope';
import { IAgentLoopService, type Turn } from '#/agent/loop/loop';
import { IAgentPromptService, type PromptHandle } from '#/agent/prompt/prompt';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import { IAgentUsageService } from '#/agent/usage/usage';
import type { TokenUsage } from '#/kosong/contract/usage';
import type { AgentProfileSummaryPolicy } from '#/app/agentProfileCatalog/agentProfileCatalog';

import { runAgentTurn, runUsageSince } from '#/session/subagent/runAgentTurn';

const ZERO = { inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0 };

type TurnResult = { readonly type: 'completed'; readonly steps: number; readonly truncated: boolean };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

class FakeAgentHandle {
  readonly accessor;

  constructor(readonly id: string, services: Map<unknown, unknown>) {
    this.accessor = { get: (token: unknown) => services.get(token) };
  }
}

function fakeTurn(id: number, result: Promise<TurnResult>): Turn {
  return {
    id,
    signal: new AbortController().signal,
    ready: Promise.resolve(),
    result,
    cancel: () => true,
  };
}

class FakePromptService {
  steps: Array<{ readonly method: 'enqueue' | 'retry'; readonly turn: Turn }> = [];
  private index = 0;

  async enqueue(): Promise<PromptHandle> {
    const step = this.steps[this.index++]!;
    if (step.method !== 'enqueue') throw new Error('expected enqueue');
    return {
      launched: Promise.resolve(step.turn),
      completion: Promise.resolve({ turnId: step.turn.id }),
    } as unknown as PromptHandle;
  }

  async retry(): Promise<Turn | undefined> {
    const step = this.steps[this.index++]!;
    if (step.method !== 'retry') throw new Error('expected retry');
    return step.turn;
  }
}

describe('runAgentTurn usage accounting', () => {
  let total: TokenUsage;
  let handle: IAgentScopeHandle;
  let prompt: FakePromptService;
  let latestSummary: string;

  beforeEach(() => {
    total = { ...ZERO };
    latestSummary = 'child summary';
    const loop = { cancel: () => true };
    prompt = new FakePromptService();
    const memory = {
      get: () => [{ role: 'assistant', content: latestSummary } as never],
    };
    const usage: IAgentUsageService = {
      _serviceBrand: undefined,
      status: () => ({ total: { ...total } }),
      record: vi.fn(),
      onDidRecord: undefined as never,
    };
    const services = new Map<unknown, unknown>([
      [IAgentPromptService, prompt],
      [IAgentLoopService, loop],
      [IAgentContextMemoryService, memory],
      [IAgentUsageService, usage],
    ]);
    handle = new FakeAgentHandle('agent-child', services) as unknown as IAgentScopeHandle;
  });

  it('reports the full first-run total as cumulative usage and as the runUsage delta', async () => {
    const done = deferred<TurnResult>();
    prompt.steps.push({ method: 'enqueue', turn: fakeTurn(1, done.promise) });
    const run = await runAgentTurn(handle, { kind: 'prompt', prompt: 'hello' }, {
      signal: new AbortController().signal,
    });
    expect(run.baseline).toEqual(ZERO);

    total = { inputOther: 90, output: 25, inputCacheRead: 10, inputCacheCreation: 5 };
    done.resolve({ type: 'completed', steps: 1, truncated: false });

    const outcome = await run.completion;
    expect(outcome.usage).toEqual({
      inputOther: 90,
      output: 25,
      inputCacheRead: 10,
      inputCacheCreation: 5,
    });
    expect(outcome.runUsage).toEqual({
      inputOther: 90,
      output: 25,
      inputCacheRead: 10,
      inputCacheCreation: 5,
    });
  });

  it('keeps cumulative usage and reports only the incremental delta as runUsage for a resumed agent', async () => {
    total = { inputOther: 500, output: 200, inputCacheRead: 100, inputCacheCreation: 50 };
    const done = deferred<TurnResult>();
    prompt.steps.push({ method: 'enqueue', turn: fakeTurn(1, done.promise) });
    const run = await runAgentTurn(handle, { kind: 'prompt', prompt: 'continue' }, {
      signal: new AbortController().signal,
    });
    expect(run.baseline).toEqual({ inputOther: 500, output: 200, inputCacheRead: 100, inputCacheCreation: 50 });

    total = { inputOther: 530, output: 210, inputCacheRead: 100, inputCacheCreation: 55 };
    done.resolve({ type: 'completed', steps: 1, truncated: false });

    const outcome = await run.completion;
    expect(outcome.usage).toEqual({
      inputOther: 530,
      output: 210,
      inputCacheRead: 100,
      inputCacheCreation: 55,
    });
    expect(outcome.runUsage).toEqual({ inputOther: 30, output: 10, inputCacheRead: 0, inputCacheCreation: 5 });
  });

  it('covers summary-continuation turns in a single delta without double attribution', async () => {
    const first = deferred<TurnResult>();
    const second = deferred<TurnResult>();
    prompt.steps.push({ method: 'enqueue', turn: fakeTurn(1, first.promise) });
    prompt.steps.push({ method: 'enqueue', turn: fakeTurn(2, second.promise) });
    const policy: AgentProfileSummaryPolicy = {
      minChars: 100,
      continuationPrompt: 'please continue',
      retries: 2,
    };
    latestSummary = 'short';
    const run = await runAgentTurn(handle, { kind: 'prompt', prompt: 'hello' }, {
      signal: new AbortController().signal,
      summaryPolicy: policy,
    });

    total = { inputOther: 80, output: 22, inputCacheRead: 5, inputCacheCreation: 3 };
    latestSummary =
      'a sufficiently long summary that satisfies the minimum length policy of the agent profile and therefore stops the continuation loop right after this attempt';
    first.resolve({ type: 'completed', steps: 1, truncated: false });
    second.resolve({ type: 'completed', steps: 1, truncated: false });

    const outcome = await run.completion;
    expect(outcome.summary).toBe(
      'a sufficiently long summary that satisfies the minimum length policy of the agent profile and therefore stops the continuation loop right after this attempt',
    );
    expect(outcome.usage).toEqual({
      inputOther: 80,
      output: 22,
      inputCacheRead: 5,
      inputCacheCreation: 3,
    });
    expect(outcome.runUsage).toEqual({
      inputOther: 80,
      output: 22,
      inputCacheRead: 5,
      inputCacheCreation: 3,
    });
  });

  it('attributes a retry run incrementally from its baseline in runUsage', async () => {
    total = { inputOther: 300, output: 100, inputCacheRead: 40, inputCacheCreation: 20 };
    const done = deferred<TurnResult>();
    prompt.steps.push({ method: 'retry', turn: fakeTurn(3, done.promise) });
    const run = await runAgentTurn(handle, { kind: 'retry' }, {
      signal: new AbortController().signal,
    });
    expect(run.baseline).toEqual({ inputOther: 300, output: 100, inputCacheRead: 40, inputCacheCreation: 20 });

    total = { inputOther: 315, output: 105, inputCacheRead: 40, inputCacheCreation: 22 };
    done.resolve({ type: 'completed', steps: 1, truncated: false });

    const outcome = await run.completion;
    expect(outcome.usage).toEqual({
      inputOther: 315,
      output: 105,
      inputCacheRead: 40,
      inputCacheCreation: 22,
    });
    expect(outcome.runUsage).toEqual({ inputOther: 15, output: 5, inputCacheRead: 0, inputCacheCreation: 2 });
  });

  it('runUsageSince derives the partial delta and clamps to non-negative', () => {
    expect(runUsageSince(handle, { inputOther: 20, output: 5, inputCacheRead: 2, inputCacheCreation: 1 })).toEqual({
      inputOther: 0,
      output: 0,
      inputCacheRead: 0,
      inputCacheCreation: 0,
    });
    total = { inputOther: 30, output: 8, inputCacheRead: 2, inputCacheCreation: 3 };
    expect(runUsageSince(handle, { inputOther: 20, output: 5, inputCacheRead: 4, inputCacheCreation: 1 })).toEqual({
      inputOther: 10,
      output: 3,
      inputCacheRead: 0,
      inputCacheCreation: 2,
    });
  });
});