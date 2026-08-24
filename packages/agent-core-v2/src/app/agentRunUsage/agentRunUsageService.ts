/**
 * `agentRunUsage` domain — `IAgentRunUsageService` implementation.
 *
 * Appends started/finished run-ledger records to the shared append-log at
 * `bootstrap.scope('store')` under key `agent-run-usage/runs.jsonl` and
 * exposes read-only iteration plus the by-`runId` fold over schema- and
 * version-validated records. All persistence goes through `IAppendLogStore`;
 * no file or JSONL handling lives here. The log's append buffer is acquired
 * at construction and released on disposal, flushing any pending appends when
 * the App scope tears the service down; append/flush failures emit a fixed warn
 * through `log` without the error, record, path, or user content, so a failing
 * ledger never fails silently. The log is retained indefinitely. Bound at App
 * scope.
 */

import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { Disposable } from '#/_base/di/lifecycle';
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

export class AgentRunUsageService extends Disposable implements IAgentRunUsageService {
  declare readonly _serviceBrand: undefined;

  private readonly scope: string;
  private readonly appendOptions: AppendLogOptions;

  constructor(
    @IBootstrapService bootstrap: IBootstrapService,
    @IAppendLogStore private readonly appendLog: IAppendLogStore,
    @ILogService private readonly log: ILogService,
  ) {
    super();
    this.scope = bootstrap.scope('store');
    this._register(this.appendLog.acquire(this.scope, AGENT_RUN_USAGE_LOG_KEY));
    this.appendOptions = { onError: () => this.onAppendError() };
  }

  appendStarted(record: AgentRunUsageStartedRecord): void {
    this.appendLog.append<AgentRunUsageStartedRecord>(
      this.scope,
      AGENT_RUN_USAGE_LOG_KEY,
      record,
      this.appendOptions,
    );
  }

  appendFinished(record: AgentRunUsageFinishedRecord): void {
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