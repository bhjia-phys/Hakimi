/**
 * `agentRunUsage` domain — persistent subagent-run usage ledger contract.
 *
 * Defines the versioned `started` / `finished` record shapes appended to the
 * run-usage log, the schema/version validation guards used when reading it
 * back (unknown versions and malformed records are skipped), the fold that
 * joins records by `runId` while preserving started-only incomplete runs, and
 * the `IAgentRunUsageService` that appends records and exposes read-only
 * iteration plus the folded read. Records carry token usage, duration, role,
 * model alias, thinking effort, the active `[subagent]` preset, and result
 * status only — never prompts, summaries, tool arguments, paths, error
 * messages, or user content — and `costUsd` is intentionally left out until a
 * trusted pricing table exists. Validation rejects empty identity strings and
 * non-finite or negative durations/token counts. Bound at App scope.
 */

import type { TokenUsage } from '#/kosong/contract/usage';

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';

export const AGENT_RUN_USAGE_LOG_VERSION = 1 as const;
export const AGENT_RUN_USAGE_LOG_KEY = 'agent-run-usage/runs.jsonl';

export type AgentRunUsageStatus = 'completed' | 'failed' | 'cancelled';

export interface AgentRunUsageStartedRecord {
  readonly version: 1;
  readonly kind: 'started';
  readonly runId: string;
  readonly childAgentId: string;
  readonly parentAgentId: string;
  readonly profileName: string;
  readonly modelAlias?: string;
  readonly thinkingEffort?: string;
  readonly preset?: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly startedAt: number;
}

export interface AgentRunUsageFinishedRecord {
  readonly version: 1;
  readonly kind: 'finished';
  readonly runId: string;
  readonly status: AgentRunUsageStatus;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly usage?: TokenUsage;
  readonly contextTokens?: number;
  readonly errorCode?: string;
}

export type AgentRunUsageRecord = AgentRunUsageStartedRecord | AgentRunUsageFinishedRecord;

export interface AgentRunUsageEntry {
  readonly started: AgentRunUsageStartedRecord;
  readonly finished?: AgentRunUsageFinishedRecord;
}

export interface IAgentRunUsageService {
  readonly _serviceBrand: undefined;

  appendStarted(record: AgentRunUsageStartedRecord): void;
  appendFinished(record: AgentRunUsageFinishedRecord): void;
  iterate(): AsyncIterable<AgentRunUsageRecord>;
  read(): Promise<readonly AgentRunUsageEntry[]>;
}

export const IAgentRunUsageService: ServiceIdentifier<IAgentRunUsageService> =
  createDecorator<IAgentRunUsageService>('agentRunUsageService');

export function parseAgentRunUsageRecord(value: unknown): AgentRunUsageRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record['version'] !== AGENT_RUN_USAGE_LOG_VERSION) return undefined;
  switch (record['kind']) {
    case 'started':
      return parseStarted(record);
    case 'finished':
      return parseFinished(record);
  }
  return undefined;
}

export function foldAgentRunUsage(
  records: readonly AgentRunUsageRecord[],
): readonly AgentRunUsageEntry[] {
  const byRunId = new Map<string, MutableEntry>();
  for (const record of records) {
    if (record.kind === 'started') {
      if (byRunId.has(record.runId)) continue;
      byRunId.set(record.runId, { started: record });
      continue;
    }
    const entry = byRunId.get(record.runId);
    if (entry === undefined) continue;
    entry.finished ??= record;
  }
  return [...byRunId.values()];
}

interface MutableEntry {
  started: AgentRunUsageStartedRecord;
  finished?: AgentRunUsageFinishedRecord;
}

function parseStarted(record: Record<string, unknown>): AgentRunUsageStartedRecord | undefined {
  if (!isNonEmptyString(record['runId'])) return undefined;
  if (!isNonEmptyString(record['childAgentId'])) return undefined;
  if (!isNonEmptyString(record['parentAgentId'])) return undefined;
  if (!isNonEmptyString(record['profileName'])) return undefined;
  if (!isNonEmptyString(record['sessionId'])) return undefined;
  if (!isNonEmptyString(record['workspaceId'])) return undefined;
  if (!isOptionalNonEmptyString(record['modelAlias'])) return undefined;
  if (!isOptionalNonEmptyString(record['thinkingEffort'])) return undefined;
  if (!isOptionalNonEmptyString(record['preset'])) return undefined;
  if (!isNonNegativeNumber(record['startedAt'])) return undefined;
  return {
    version: 1,
    kind: 'started',
    runId: record['runId'],
    childAgentId: record['childAgentId'],
    parentAgentId: record['parentAgentId'],
    profileName: record['profileName'],
    modelAlias: record['modelAlias'],
    thinkingEffort: record['thinkingEffort'],
    preset: record['preset'],
    sessionId: record['sessionId'],
    workspaceId: record['workspaceId'],
    startedAt: record['startedAt'],
  };
}

function parseFinished(record: Record<string, unknown>): AgentRunUsageFinishedRecord | undefined {
  if (!isNonEmptyString(record['runId'])) return undefined;
  if (!isFinishStatus(record['status'])) return undefined;
  if (!isNonNegativeNumber(record['startedAt'])) return undefined;
  if (!isNonNegativeNumber(record['endedAt'])) return undefined;
  if (!isNonNegativeNumber(record['durationMs'])) return undefined;
  if (!isOptionalUsage(record['usage'])) return undefined;
  if (record['contextTokens'] !== undefined && !isNonNegativeNumber(record['contextTokens'])) {
    return undefined;
  }
  if (!isOptionalNonEmptyString(record['errorCode'])) return undefined;
  return {
    version: 1,
    kind: 'finished',
    runId: record['runId'],
    status: record['status'],
    startedAt: record['startedAt'],
    endedAt: record['endedAt'],
    durationMs: record['durationMs'],
    usage: record['usage'],
    contextTokens: record['contextTokens'],
    errorCode: record['errorCode'],
  };
}

function isFinishStatus(value: unknown): value is AgentRunUsageStatus {
  return value === 'completed' || value === 'failed' || value === 'cancelled';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isOptionalUsage(value: unknown): value is TokenUsage | undefined {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const usage = value as Record<string, unknown>;
  return (
    isNonNegativeNumber(usage['inputOther']) &&
    isNonNegativeNumber(usage['output']) &&
    isNonNegativeNumber(usage['inputCacheRead']) &&
    isNonNegativeNumber(usage['inputCacheCreation'])
  );
}