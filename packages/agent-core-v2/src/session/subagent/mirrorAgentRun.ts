/**
 * `subagent` domain — caller-side mirroring of an agent run.
 *
 * When one agent drives another through `ISessionSubagentService.run`, the
 * *requesting* agent surfaces that run
 * on its own record stream so the UI can nest the child transcript under the
 * launching tool call, external hooks fire, and telemetry is tracked. That
 * requester ↔ target association is business data of this wrapper layer — the
 * lifecycle registry itself stays flat and knows nothing about it.
 *
 * External hooks (`SubagentStart` / `SubagentStop`) fire by observation, like
 * every other external hook: this wrapper announces "a run is about to start"
 * / "...has stopped" through the `ISessionSubagentService` agent-run hook
 * slot and stop event.
 *
 * Wire shape note: the signals are still named `subagent.spawned / started /
 * completed / failed` and telemetry still tracks `subagent_created` so existing
 * session recordings and dashboards stay valid. The spawned signal also
 * reports the child's bound model alias and its effective thinking effort, so
 * clients can render both at spawn instead of waiting for the first
 * `agent.status.updated` frame.
 *
 * Alongside the UI signals, each mirror owns a unique `runId` and announces
 * the run through the Session service's internal run-lifecycle events
 * (`ISessionSubagentService.notifyAgentRunStarted` / `notifyAgentRunFinished`),
 * which the Session-scoped `agentRunUsage` recorder folds into the persistent
 * ledger. These events stay off the per-agent `IEventBus` entirely, so they
 * can never leak onto the WebSocket wire. Every mirror emits exactly
 * one started and (when the process survives) one finished event —
 * completed / failed / cancelled — regardless of abort or rate-limit
 * suppression of the UI signals, so a crash after started alone is the only
 * incomplete run. An ordinary start-hook failure counts as `failed`; only
 * aborts (`signal.aborted` or an abort-shaped error) are `cancelled`.
 */

import { randomUUID } from 'node:crypto';

import type { IAgentScopeHandle } from '#/_base/di/scope';
import { isAbortError, userCancellationReason } from '#/_base/utils/abort';
import { IAgentTokenCountingService } from '#/agent/tokenCounting/tokenCounting';
import { IAgentProfileService } from '#/agent/profile/profile';
import { isProviderRateLimitError } from '#/kosong/contract/errors';
import { type TokenUsage } from '#/kosong/contract/usage';
import { ITelemetryService } from '#/app/telemetry/telemetry';
import { IEventBus } from '#/app/event/eventBus';
import { isError2 } from '#/errors';
import { IAgentLifecycleService } from '#/session/agentLifecycle/agentLifecycle';

import { runUsageSince } from './runAgentTurn';
import {
  type AgentRunHandle,
  type AgentRunStartedEvent,
  type AgentRunStatus,
  ISessionSubagentService,
} from './subagent';

export interface SubagentSpawnedEvent {
  readonly type: 'subagent.spawned';
  readonly subagentId: string;
  readonly subagentName: string;
  readonly parentToolCallId: string;
  readonly parentToolCallUuid?: string;
  readonly parentAgentId?: string;
  readonly callerAgentId?: string;
  readonly description?: string;
  readonly swarmIndex?: number;
  readonly runInBackground: boolean;
  readonly model?: string;
  readonly thinkingEffort?: string;
}

export interface SubagentStartedEvent {
  readonly type: 'subagent.started';
  readonly subagentId: string;
}

export interface SubagentCompletedEvent {
  readonly type: 'subagent.completed';
  readonly subagentId: string;
  readonly resultSummary: string;
  readonly usage?: TokenUsage;
  readonly contextTokens?: number;
}

export interface SubagentFailedEvent {
  readonly type: 'subagent.failed';
  readonly subagentId: string;
  readonly error: string;
}

declare module '#/app/event/eventBus' {
  interface DomainEventMap {
    'subagent.spawned': SubagentSpawnedEvent;
    'subagent.started': SubagentStartedEvent;
    'subagent.completed': SubagentCompletedEvent;
    'subagent.failed': SubagentFailedEvent;
  }
}

export interface AgentRunSpawnedMeta {
  readonly profileName: string;
  readonly parentToolCallId?: string;
  readonly parentToolCallUuid?: string;
  readonly description?: string;
  readonly swarmIndex?: number;
  readonly runInBackground?: boolean;
  readonly model?: string;
}

export interface MirrorAgentRunOptions {
  readonly profileName: string;
  readonly prompt?: string;
  readonly suppressRateLimitFailureEvent?: boolean;
  readonly signal: AbortSignal;
  readonly cancel?: (reason?: unknown) => void;
}

export function emitAgentRunSpawned(
  requester: IAgentScopeHandle,
  targetAgentId: string,
  meta: AgentRunSpawnedMeta,
): void {
  const childProfile = requester.accessor
    .get(IAgentLifecycleService)
    ?.get(targetAgentId)
    ?.accessor.get(IAgentProfileService);
  requester.accessor.get(IEventBus)?.publish({
    type: 'subagent.spawned',
    subagentId: targetAgentId,
    subagentName: meta.profileName,
    parentToolCallId: meta.parentToolCallId ?? '',
    parentToolCallUuid: meta.parentToolCallUuid,
    parentAgentId: requester.id,
    callerAgentId: requester.id,
    description: meta.description,
    swarmIndex: meta.swarmIndex,
    runInBackground: meta.runInBackground ?? false,
    model: meta.model,
    thinkingEffort: childProfile?.getEffectiveThinkingLevel(),
  });
  childProfile?.republishStatus();
  requester.accessor.get(ITelemetryService)?.track2('subagent_created', {
    subagent_name: meta.profileName,
    run_in_background: meta.runInBackground ?? false,
    agent_id: targetAgentId,
    parent_agent_id: requester.id,
    parent_tool_call_id: meta.parentToolCallId ?? '',
  });
}

export async function mirrorAgentRun(
  requester: IAgentScopeHandle,
  run: AgentRunHandle,
  options: MirrorAgentRunOptions,
): Promise<{ summary: string; usage?: TokenUsage }> {
  const eventBus = requester.accessor.get(IEventBus);
  const subagents = requester.accessor.get(ISessionSubagentService);
  const agentLifecycle = requester.accessor.get(IAgentLifecycleService);
  const runId = randomUUID();
  const startedAt = Date.now();
  const childProfile = agentLifecycle?.get(run.agentId)?.accessor.get(IAgentProfileService);
  let finished = false;
  const finish = (
    status: AgentRunStatus,
    outcome: {
      readonly usage?: TokenUsage;
      readonly contextTokens?: number;
      readonly errorCode?: string;
    },
  ): void => {
    if (finished) return;
    finished = true;
    const endedAt = Date.now();
    subagents?.notifyAgentRunFinished({
      runId,
      status,
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - startedAt),
      usage: outcome.usage,
      contextTokens: outcome.contextTokens,
      errorCode: outcome.errorCode,
    });
  };
  eventBus?.publish({ type: 'subagent.started', subagentId: run.agentId });
  const started: AgentRunStartedEvent = {
    runId,
    childAgentId: run.agentId,
    parentAgentId: requester.id,
    profileName: options.profileName,
    modelAlias: childProfile?.data().modelAlias,
    thinkingEffort: childProfile?.getEffectiveThinkingLevel(),
    startedAt,
  };
  subagents?.notifyAgentRunStarted(started);
  if (options.prompt !== undefined) {
    const cancelAndRethrow = (reason: unknown): never => {
      options.cancel?.(reason);
      void run.completion.catch(() => {});
      finish(runFinishStatus(options, reason), {
        usage: childUsageSince(agentLifecycle, run),
        contextTokens: childContextTokens(agentLifecycle, run.agentId),
        errorCode: runErrorCode(reason),
      });
      throw reason;
    };
    try {
      await subagents?.hooks.onWillStartAgentTask.run({
        agentName: options.profileName,
        prompt: options.prompt,
        signal: options.signal,
      });
    } catch (error) {
      cancelAndRethrow(error);
    }
    if (options.signal.aborted) {
      cancelAndRethrow(options.signal.reason ?? userCancellationReason());
    }
  }
  try {
    const result = await run.completion;
    const contextTokens = childContextTokens(agentLifecycle, run.agentId);
    finish('completed', { usage: result.runUsage, contextTokens });
    eventBus?.publish({
      type: 'subagent.completed',
      subagentId: run.agentId,
      resultSummary: result.summary,
      usage: result.usage,
      contextTokens,
    });
    subagents?.notifyAgentTaskStopped({
      agentName: options.profileName,
      response: result.summary,
    });
    return { summary: result.summary, usage: result.usage };
  } catch (error) {
    if (!isAbortError(error) && !shouldSuppressFailure(options, error)) {
      eventBus?.publish({
        type: 'subagent.failed',
        subagentId: run.agentId,
        error: errorMessage(error),
      });
    }
    finish(runFinishStatus(options, error), {
      usage: childUsageSince(agentLifecycle, run),
      contextTokens: childContextTokens(agentLifecycle, run.agentId),
      errorCode: runErrorCode(error),
    });
    throw error;
  }
}

function runFinishStatus(options: MirrorAgentRunOptions, error: unknown): AgentRunStatus {
  if (options.signal.aborted || isAbortError(error)) return 'cancelled';
  return 'failed';
}

function runErrorCode(error: unknown): string | undefined {
  return isError2(error) ? error.code : undefined;
}

function childUsageSince(
  agentLifecycle: IAgentLifecycleService,
  run: AgentRunHandle,
): TokenUsage | undefined {
  const child = agentLifecycle.get(run.agentId);
  if (child === undefined) return undefined;
  return runUsageSince(child, run.baseline);
}

function shouldSuppressFailure(options: MirrorAgentRunOptions, error: unknown): boolean {
  if (options.suppressRateLimitFailureEvent !== true) return false;
  if (isProviderRateLimitError(error)) return true;
  return isAbortError(error) || options.signal.aborted;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function childContextTokens(
  agentLifecycle: IAgentLifecycleService,
  agentId: string,
): number | undefined {
  const child = agentLifecycle.get(agentId);
  return child?.accessor.get(IAgentTokenCountingService)?.statusSize();
}
