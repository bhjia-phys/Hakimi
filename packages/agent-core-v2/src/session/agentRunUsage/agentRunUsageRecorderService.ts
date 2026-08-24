/**
 * `agentRunUsage` domain — session-side run-ledger recorder.
 *
 * Subscribes to the Session service's internal run-lifecycle events
 * (`ISessionSubagentService.onDidStartAgentRun` / `onDidFinishAgentRun`) and
 * folds them into `agentRunUsage` records: stamping started records with the
 * session/workspace identity from `sessionContext` and the active `[subagent]`
 * preset read from `config` at started time, deduping in-process by `runId`
 * plus record kind, and stopping writes on dispose. The events live only on
 * the Session service — never on a per-agent `IEventBus` — so the ledger
 * channel cannot leak onto the WebSocket wire. Bound at Session scope.
 */

import { Disposable } from '#/_base/di/lifecycle';
import { LifecycleScope } from '#/app/scopes';
import {
  ScopeActivation,
  registerScopedService,
} from '#/_base/di/scope';
import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import { ISessionContext } from '#/session/sessionContext/sessionContext';
import { IConfigService } from '#/app/config/config';
import { SUBAGENT_SECTION, type SubagentConfig } from '#/session/subagent/configSection';
import {
  type AgentRunFinishedEvent,
  type AgentRunStartedEvent,
  ISessionSubagentService,
} from '#/session/subagent/subagent';

import {
  AGENT_RUN_USAGE_LOG_VERSION,
  type AgentRunUsageFinishedRecord,
  type AgentRunUsageStartedRecord,
  IAgentRunUsageService,
} from '#/app/agentRunUsage/agentRunUsage';

export interface IAgentRunUsageRecorderService {
  readonly _serviceBrand: undefined;
}

export const IAgentRunUsageRecorderService: ServiceIdentifier<IAgentRunUsageRecorderService> =
  createDecorator<IAgentRunUsageRecorderService>('agentRunUsageRecorderService');

export class AgentRunUsageRecorderService extends Disposable implements IAgentRunUsageRecorderService {
  declare readonly _serviceBrand: undefined;

  private readonly seen = new Set<string>();

  constructor(
    @ISessionContext private readonly ctx: ISessionContext,
    @IAgentRunUsageService private readonly usage: IAgentRunUsageService,
    @ISessionSubagentService private readonly subagents: ISessionSubagentService,
    @IConfigService private readonly config: IConfigService,
  ) {
    super();
    this._register(this.subagents.onDidStartAgentRun((event) => this.onRunStarted(event)));
    this._register(this.subagents.onDidFinishAgentRun((event) => this.onRunFinished(event)));
  }

  private onRunStarted(event: AgentRunStartedEvent): void {
    if (!this.markSeen(event.runId, 'started')) return;
    const preset = this.config.get<SubagentConfig | undefined>(SUBAGENT_SECTION)?.preset;
    const record: AgentRunUsageStartedRecord = {
      version: AGENT_RUN_USAGE_LOG_VERSION,
      kind: 'started',
      runId: event.runId,
      childAgentId: event.childAgentId,
      parentAgentId: event.parentAgentId,
      profileName: event.profileName,
      modelAlias: event.modelAlias,
      thinkingEffort: event.thinkingEffort,
      preset,
      sessionId: this.ctx.sessionId,
      workspaceId: this.ctx.workspaceId,
      startedAt: event.startedAt,
    };
    this.usage.appendStarted(record);
  }

  private onRunFinished(event: AgentRunFinishedEvent): void {
    if (!this.markSeen(event.runId, 'finished')) return;
    const record: AgentRunUsageFinishedRecord = {
      version: AGENT_RUN_USAGE_LOG_VERSION,
      kind: 'finished',
      runId: event.runId,
      status: event.status,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      durationMs: event.durationMs,
      usage: event.usage,
      contextTokens: event.contextTokens,
      errorCode: event.errorCode,
    };
    this.usage.appendFinished(record);
  }

  private markSeen(runId: string, kind: 'started' | 'finished'): boolean {
    const key = `${runId}:${kind}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}

registerScopedService(
  LifecycleScope.Session,
  IAgentRunUsageRecorderService,
  AgentRunUsageRecorderService,
  ScopeActivation.OnScopeCreated,
  'agentRunUsage',
);