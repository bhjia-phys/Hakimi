/**
 * `subagent` domain — `ISessionSubagentService` contract: driving turns
 * on other agents, plus the hook / event surface those runs announce.
 *
 * Owns *runs* — one agent driving a turn on another and the requester-side
 * announcements that come with it. The `onWillStartAgentTask` hook slot, the
 * `onDidStopAgentTask` event, and the run-lifecycle events
 * (`onDidStartAgentRun` / `onDidFinishAgentRun` with their `notifyAgentRun*`
 * publish methods) announce a run's start, stop, and ledger facts. The
 * run-lifecycle events are Session-internal: they carry no `type` discriminator
 * and live only on this Session service, so mirror/recorder consumers never
 * touch the per-agent `IEventBus` and the events can never reach the WebSocket
 * wire. The external-hook commands are translated from the hook slot and the
 * stop event. A run's completion reports the agent's cumulative `usage` (the
 * legacy wire semantics) plus the per-run `runUsage` delta reserved for the
 * internal ledger; its timing snapshot covers the initial and any summary-
 * continuation turns. Session-scoped — one instance per session.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type { Event } from '#/_base/event';
import type { TokenUsage } from '#/kosong/contract/usage';
import type { AgentProfileSummaryPolicy } from '#/app/agentProfileCatalog/agentProfileCatalog';
import type { Turn } from '#/agent/loop/loop';
import type { Hooks } from '#/hooks';

export type AgentRunRequest =
  | { readonly kind: 'prompt'; readonly prompt: string }
  | { readonly kind: 'retry'; readonly trigger?: string };

export interface RunAgentOptions {
  readonly signal: AbortSignal;
  readonly summaryPolicy?: AgentProfileSummaryPolicy;
  readonly onReady?: () => void;
}

export interface AgentRunCompletion {
  readonly summary: string;
  readonly usage?: TokenUsage;
  readonly runUsage?: TokenUsage;
}

export interface AgentRunTimingEvidence {
  readonly llmRequestCount: number;
  readonly firstTokenLatencySampleCount: number;
  readonly averageFirstTokenLatencyMs?: number;
}

export interface AgentRunHandle {
  readonly agentId: string;
  readonly turn: Turn;
  readonly baseline: TokenUsage;
  readonly timingEvidence: () => AgentRunTimingEvidence;
  readonly completion: Promise<AgentRunCompletion>;
}

export interface AgentTaskStartHookContext {
  readonly agentName: string;
  readonly prompt: string;
  readonly signal: AbortSignal;
}

export interface AgentTaskStopHookContext {
  readonly agentName: string;
  readonly response: string;
}

export type AgentTaskHooks = {
  readonly onWillStartAgentTask: AgentTaskStartHookContext;
};

export type AgentRunStatus = 'completed' | 'failed' | 'cancelled';

export interface AgentRunStartedEvent {
  readonly runId: string;
  readonly childAgentId: string;
  readonly parentAgentId: string;
  readonly profileName: string;
  readonly modelAlias?: string;
  readonly thinkingEffort?: string;
  readonly startedAt: number;
}

export interface AgentRunFinishedEvent {
  readonly runId: string;
  readonly status: AgentRunStatus;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly usage?: TokenUsage;
  readonly contextTokens?: number;
  readonly averageFirstTokenLatencyMs?: number;
  readonly firstTokenLatencySampleCount?: number;
  readonly llmRequestCount?: number;
  readonly errorCode?: string;
}

export interface ISessionSubagentService {
  readonly _serviceBrand: undefined;

  readonly hooks: Hooks<AgentTaskHooks>;

  readonly onDidStopAgentTask: Event<AgentTaskStopHookContext>;
  readonly onDidStartAgentRun: Event<AgentRunStartedEvent>;
  readonly onDidFinishAgentRun: Event<AgentRunFinishedEvent>;

  run(agentId: string, request: AgentRunRequest, opts: RunAgentOptions): Promise<AgentRunHandle>;

  notifyAgentTaskStopped(context: AgentTaskStopHookContext): void;
  notifyAgentRunStarted(event: AgentRunStartedEvent): void;
  notifyAgentRunFinished(event: AgentRunFinishedEvent): void;
}

export const ISessionSubagentService: ServiceIdentifier<ISessionSubagentService> =
  createDecorator<ISessionSubagentService>('sessionSubagentService');
