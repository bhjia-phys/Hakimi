/**
 * `agentRunUsage` domain — `IAgentRunUsageService` implementation.
 *
 * Appends started/finished run-ledger records through the append-log store at
 * `bootstrap.scope('store')` under key `agent-run-usage/runs.jsonl` and
 * exposes read-only iteration plus the by-`runId` fold over schema- and
 * version-validated records. Pairs live started/finished runIds in process,
 * fires `onDidFinishRun` once per completed pair, and bounds the live tracking
 * state (started records are dropped on completion; the started map is
 * capacity-capped so the ledger's in-process view never grows without bound
 * over the App lifetime). All persistence goes through `IAppendLogStore`.
 * Append/flush failures emit a fixed warn through `log`; the log is retained
 * indefinitely. Bound at App scope.
 */

import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { Disposable } from '#/_base/di/lifecycle';
import { Emitter, type Event } from '#/_base/event';
import { IBootstrapService } from '#/app/bootstrap/bootstrap';
import { ILogService } from '#/_base/log/log';
import { IAppendLogStore, type AppendLogOptions } from '#/persistence/interface/appendLogStore';

import {
  AGENT_RUN_USAGE_LOG_KEY,
  foldAgentRunUsage,
  type AgentRunUsageEntry,
  type AgentRunUsageFinishedRecord,
  type AgentRunUsageRecord,
  type AgentRunUsageStartedRecord,
  IAgentRunUsageService,
  parseAgentRunUsageRecord,
} from './agentRunUsage';

export const MAX_LIVE_STARTED_RUNS = 4096;

export class AgentRunUsageService extends Disposable implements IAgentRunUsageService {
  declare readonly _serviceBrand: undefined;

  private readonly scope: string;
  private readonly appendOptions: AppendLogOptions;
  private readonly startedByRunId = new Map<string, AgentRunUsageStartedRecord>();
  private readonly _onDidFinishRun = new Emitter<AgentRunUsageEntry>('agentRunUsage.onDidFinishRun');
  readonly onDidFinishRun: Event<AgentRunUsageEntry> = this._onDidFinishRun.event;

  constructor(
    @IBootstrapService bootstrap: IBootstrapService,
    @IAppendLogStore private readonly appendLog: IAppendLogStore,
    @ILogService private readonly log: ILogService,
  ) {
    super();
    this.scope = bootstrap.scope('store');
    this._register(this.appendLog.acquire(this.scope, AGENT_RUN_USAGE_LOG_KEY));
    this._register(this._onDidFinishRun);
    this.appendOptions = { onError: () => this.onAppendError() };
  }

  appendStarted(record: AgentRunUsageStartedRecord): void {
    if (!this.startedByRunId.has(record.runId) && this.startedByRunId.size >= MAX_LIVE_STARTED_RUNS) {
      const oldest = this.startedByRunId.keys().next().value;
      if (oldest !== undefined) this.startedByRunId.delete(oldest);
    }
    this.startedByRunId.set(record.runId, record);
    this.appendLog.append<AgentRunUsageStartedRecord>(
      this.scope,
      AGENT_RUN_USAGE_LOG_KEY,
      record,
      this.appendOptions,
    );
  }

  appendFinished(record: AgentRunUsageFinishedRecord): void {
    const started = this.startedByRunId.get(record.runId);
    if (started !== undefined) {
      this.startedByRunId.delete(record.runId);
      this._onDidFinishRun.fire({ started, finished: record });
    }
    this.appendLog.append<AgentRunUsageFinishedRecord>(
      this.scope,
      AGENT_RUN_USAGE_LOG_KEY,
      record,
      this.appendOptions,
    );
  }

  async *iterate(): AsyncIterable<AgentRunUsageRecord> {
    for await (const raw of this.appendLog.read<unknown>(this.scope, AGENT_RUN_USAGE_LOG_KEY)) {
      const record = parseAgentRunUsageRecord(raw);
      if (record !== undefined) yield record;
    }
  }

  async read(): Promise<readonly AgentRunUsageEntry[]> {
    const records: AgentRunUsageRecord[] = [];
    for await (const record of this.iterate()) records.push(record);
    return foldAgentRunUsage(records);
  }

  private onAppendError(): void {
    this.log.warn('agent-run usage ledger flush failed');
  }
}

registerScopedService(
  LifecycleScope.App,
  IAgentRunUsageService,
  AgentRunUsageService,
  ScopeActivation.OnScopeCreated,
  'agentRunUsage',
);