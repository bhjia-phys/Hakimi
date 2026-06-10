export { MCP_OAUTH_AUTHORIZATION_URL_TOOL_UPDATE } from '@moonshot-ai/protocol';

import type { AgentEvent as ProtocolAgentEvent } from '@moonshot-ai/protocol';
import type { AutoresearchSnapshot } from '../agent/autoresearch';

export type {
  AgentStatusUpdatedEvent,
  AssistantDeltaEvent,
  BackgroundTaskStartedEvent,
  BackgroundTaskTerminatedEvent,
  CompactionBlockedEvent,
  CompactionCancelledEvent,
  CompactionCompletedEvent,
  CompactionResult,
  CompactionStartedEvent,
  CronFiredEvent,
  ErrorEvent,
  GoalUpdatedEvent,
  HookResultEvent,
  McpOAuthAuthorizationUrlUpdateData,
  McpServerStatusEvent,
  McpServerStatusPayload,
  PluginCommandActivatedEvent,
  SessionCreatedEvent,
  SessionMetaUpdatedEvent,
  SessionStatusChangedEvent,
  SessionWorkChangedEvent,
  SkillActivatedEvent,
  SubagentCompletedEvent,
  SubagentFailedEvent,
  SubagentSpawnedEvent,
  SubagentStartedEvent,
  SubagentSuspendedEvent,
  ThinkingDeltaEvent,
  ToolCallDeltaEvent,
  ToolCallStartedEvent,
  ToolInputDisplay,
  ToolListUpdatedEvent,
  ToolListUpdatedReason,
  ToolProgressEvent,
  ToolResultEvent,
  ToolUpdate,
  TurnEndedEvent,
  TurnEndReason,
  TurnStartedEvent,
  TurnStepCompletedEvent,
  TurnStepInterruptedEvent,
  TurnStepRetryingEvent,
  TurnStepStartedEvent,
  UsageStatus,
  WarningEvent,
} from '@moonshot-ai/protocol';

export interface AutoresearchUpdatedEvent {
  readonly type: 'autoresearch.updated';
  readonly snapshot: AutoresearchSnapshot | null;
}

export type AgentEvent = ProtocolAgentEvent | AutoresearchUpdatedEvent;
export type Event = AgentEvent & { readonly agentId: string; readonly sessionId: string };

export type { KimiErrorPayload } from '../errors';
