/**
 * Klient-level agent-scope events — the public, typed, namespaced event
 * surface of one agent. All registrations filter the per-agent `events`
 * scope stream by `type`; the payload is the whole flat `{ type, ... }`
 * event (schemas keep the `type` literal so listeners receive it intact).
 * Payload shapes mirror `protocol/src/events.ts`; events that are loose in
 * the engine (or absent from the protocol union) are `z.looseObject`s.
 */

import { z } from 'zod';

import type { EventRegistration } from '../types.js';
import { researchStatusSnapshotSchema } from './researchSchemas.js';
import { goalActorSchema, goalSnapshotSchema, goalStatusSchema } from './services.js';

/**
 * Scope-stream registration (`kind: 'stream'`). Declared structurally here
 * until `EventRegistration` in `../types.js` gains the `stream` variant;
 * compatible with `src/core/events/hub.ts`, which already switches on it.
 */
interface StreamEventRegistration {
  readonly kind: 'stream';
  readonly name: string;
  readonly type?: string;
  readonly schema: z.ZodType;
}

type AgentEventRegistration = EventRegistration | StreamEventRegistration;

// ── payload schemas ─────────────────────────────────────────────────────────

export const turnStartedEventSchema = z.object({
  type: z.literal('turn.started'),
  turnId: z.number(),
  /** Protocol `PromptOrigin` union — mirrored as `unknown`. */
  origin: z.unknown(),
  /** The turn's extracted prompt text (present when the turn opened with a text part). */
  prompt: z.string().optional(),
});

export const turnEndedEventSchema = z.object({
  type: z.literal('turn.ended'),
  turnId: z.number(),
  reason: z.enum(['completed', 'cancelled', 'failed', 'blocked']),
  /** Protocol `KimiErrorPayload` — mirrored as `unknown`. */
  error: z.unknown().optional(),
  durationMs: z.number().optional(),
  /** Why a non-completed turn stopped early; absent on completion. */
  interruptReason: z
    .enum(['user_cancelled', 'aborted', 'max_steps', 'error', 'filtered', 'blocked'])
    .optional(),
});

export const assistantDeltaEventSchema = z.object({
  type: z.literal('assistant.delta'),
  turnId: z.number(),
  delta: z.string(),
});

export const thinkingDeltaEventSchema = z.object({
  type: z.literal('thinking.delta'),
  turnId: z.number(),
  delta: z.string(),
});

export const toolCallStartedEventSchema = z.object({
  type: z.literal('tool.call.started'),
  turnId: z.number(),
  toolCallId: z.string(),
  name: z.string(),
  args: z.unknown(),
  description: z.string().optional(),
  /** Protocol `ToolInputDisplay` — mirrored as `unknown`. */
  display: z.unknown().optional(),
});

export const toolCallDeltaEventSchema = z.object({
  type: z.literal('tool.call.delta'),
  turnId: z.number(),
  toolCallId: z.string(),
  name: z.string().optional(),
  argumentsPart: z.string().optional(),
});

export const toolProgressEventSchema = z.object({
  type: z.literal('tool.progress'),
  turnId: z.number(),
  toolCallId: z.string(),
  /** Protocol `ToolUpdate` — mirrored field-for-field. */
  update: z.object({
    kind: z.enum(['stdout', 'stderr', 'progress', 'status', 'custom']),
    text: z.string().optional(),
    percent: z.number().optional(),
    customKind: z.string().optional(),
    customData: z.unknown().optional(),
  }),
});

export const toolResultEventSchema = z.object({
  type: z.literal('tool.result'),
  turnId: z.number(),
  toolCallId: z.string(),
  output: z.unknown(),
  isError: z.boolean().optional(),
  synthetic: z.boolean().optional(),
});

export const promptCompletedEventSchema = z.object({
  type: z.literal('prompt.completed'),
  promptId: z.string(),
  /** ISO 8601 datetime string on the wire. */
  finishedAt: z.string(),
  reason: z.enum(['completed', 'failed', 'blocked']).optional(),
});

export const promptAbortedEventSchema = z.object({
  type: z.literal('prompt.aborted'),
  promptId: z.string(),
  /** ISO 8601 datetime string on the wire. */
  abortedAt: z.string(),
});

export const compactionStartedEventSchema = z.object({
  type: z.literal('compaction.started'),
  trigger: z.enum(['manual', 'auto']),
  instruction: z.string().optional(),
});

export const compactionBlockedEventSchema = z.object({
  type: z.literal('compaction.blocked'),
  turnId: z.number().optional(),
});

export const compactionCancelledEventSchema = z.object({
  type: z.literal('compaction.cancelled'),
});

/**
 * Protocol `CompactionResult` — mirrored field-for-field. The engine's
 * internal result additionally carries `contextSummary`, but the service
 * strips it before publishing (`fullCompactionService.ts`), so it never
 * reaches the wire.
 */
export const compactionCompletedEventSchema = z.object({
  type: z.literal('compaction.completed'),
  result: z.object({
    summary: z.string(),
    compactedCount: z.number(),
    tokensBefore: z.number(),
    tokensAfter: z.number(),
    keptUserMessageCount: z.number().optional(),
    keptHeadUserMessageCount: z.number().optional(),
    droppedCount: z.number().optional(),
  }),
});

/** Engine `permission.approval.requested` — not in the protocol union; loose. */
export const permissionApprovalRequestedEventSchema = z.looseObject({
  turnId: z.number(),
  toolCallId: z.string(),
  toolName: z.string(),
  action: z.string(),
});

/** Engine `permission.approval.resolved` — not in the protocol union; loose. */
export const permissionApprovalResolvedEventSchema = z.looseObject({
  turnId: z.number(),
  toolCallId: z.string(),
});

/** `error` payloads carry the full `KimiErrorPayload`; kept loose. */
export const errorEventSchema = z.looseObject({
  message: z.string(),
});

export const warningEventSchema = z.object({
  type: z.literal('warning'),
  message: z.string(),
  code: z.string().optional(),
});

/** `agent.status.updated` carries a wide optional status bag; kept loose. */
export const agentStatusUpdatedEventSchema = z.looseObject({
  phase: z.string().optional(),
});

/** `research.updated` carries the full post-dispatch snapshot. */
export const researchUpdatedEventSchema = z.object({
  type: z.literal('research.updated'),
  snapshot: researchStatusSnapshotSchema,
});

/** `aitp_mode.updated` is a bare signal (no payload). */
export const aitpModeUpdatedEventSchema = z.object({
  type: z.literal('aitp_mode.updated'),
});

/** Protocol `GoalChangeStats` — mirrored field-for-field. */
export const goalChangeStatsSchema = z.object({
  turnsUsed: z.number(),
  tokensUsed: z.number(),
  wallClockMs: z.number(),
});

/** Protocol `GoalChange` — mirrored field-for-field. */
export const goalChangeSchema = z.object({
  kind: z.enum(['lifecycle', 'completion', 'continuation']),
  status: goalStatusSchema.optional(),
  reason: z.string().optional(),
  stats: goalChangeStatsSchema.optional(),
  actor: goalActorSchema.optional(),
});

/**
 * Same value as `GOAL_MUTATION_MAX_AT` in `@moonshot-ai/protocol`'s events.ts
 * (and the engine's goal Ops) — the largest epoch-ms that survives
 * `new Date(at).toISOString()`; mirrored locally (klient keeps no runtime
 * protocol import).
 */
export const GOAL_MUTATION_MAX_AT = 8_640_000_000_000_000;

/**
 * Protocol `GoalMutation` — mirrored field-for-field. Bounded to the valid
 * Date range so transcript marker projections can never throw on it.
 */
export const goalMutationSchema = z.object({
  id: z.string(),
  at: z
    .number()
    .finite()
    .nonnegative()
    .max(GOAL_MUTATION_MAX_AT)
    .refine((value) => Number.isFinite(new Date(value).getTime()), {
      message: 'at must be a valid Date epoch-ms',
    }),
  kind: z.enum(['create', 'update', 'clear']),
  goalId: z.string(),
  status: goalStatusSchema.optional(),
});

/** Protocol `GoalUpdatedEvent` — mirrored field-for-field. */
export const goalUpdatedEventSchema = z.object({
  type: z.literal('goal.updated'),
  snapshot: goalSnapshotSchema.nullable(),
  change: goalChangeSchema.optional(),
  mutation: goalMutationSchema.optional(),
});

// ── registrations ───────────────────────────────────────────────────────────

/** Public event name → payload type. Keys must stay in sync with `agentEvents`. */
export interface AgentEventPayloads {
  'turn.started': z.infer<typeof turnStartedEventSchema>;
  'turn.ended': z.infer<typeof turnEndedEventSchema>;
  'assistant.delta': z.infer<typeof assistantDeltaEventSchema>;
  'thinking.delta': z.infer<typeof thinkingDeltaEventSchema>;
  'tool.call.started': z.infer<typeof toolCallStartedEventSchema>;
  'tool.call.delta': z.infer<typeof toolCallDeltaEventSchema>;
  'tool.progress': z.infer<typeof toolProgressEventSchema>;
  'tool.result': z.infer<typeof toolResultEventSchema>;
  'prompt.completed': z.infer<typeof promptCompletedEventSchema>;
  'prompt.aborted': z.infer<typeof promptAbortedEventSchema>;
  'compaction.started': z.infer<typeof compactionStartedEventSchema>;
  'compaction.blocked': z.infer<typeof compactionBlockedEventSchema>;
  'compaction.cancelled': z.infer<typeof compactionCancelledEventSchema>;
  'compaction.completed': z.infer<typeof compactionCompletedEventSchema>;
  'permission.approval.requested': z.infer<typeof permissionApprovalRequestedEventSchema>;
  'permission.approval.resolved': z.infer<typeof permissionApprovalResolvedEventSchema>;
  error: z.infer<typeof errorEventSchema>;
  warning: z.infer<typeof warningEventSchema>;
  'agent.status.updated': z.infer<typeof agentStatusUpdatedEventSchema>;
  'research.updated': z.infer<typeof researchUpdatedEventSchema>;
  'aitp_mode.updated': z.infer<typeof aitpModeUpdatedEventSchema>;
  'goal.updated': z.infer<typeof goalUpdatedEventSchema>;
}

export type AgentEventName = keyof AgentEventPayloads;

/** Public event name → stream binding + payload schema. */
export const agentEvents = {
  'turn.started': { kind: 'stream', name: 'events', type: 'turn.started', schema: turnStartedEventSchema },
  'turn.ended': { kind: 'stream', name: 'events', type: 'turn.ended', schema: turnEndedEventSchema },
  'assistant.delta': { kind: 'stream', name: 'events', type: 'assistant.delta', schema: assistantDeltaEventSchema },
  'thinking.delta': { kind: 'stream', name: 'events', type: 'thinking.delta', schema: thinkingDeltaEventSchema },
  'tool.call.started': { kind: 'stream', name: 'events', type: 'tool.call.started', schema: toolCallStartedEventSchema },
  'tool.call.delta': { kind: 'stream', name: 'events', type: 'tool.call.delta', schema: toolCallDeltaEventSchema },
  'tool.progress': { kind: 'stream', name: 'events', type: 'tool.progress', schema: toolProgressEventSchema },
  'tool.result': { kind: 'stream', name: 'events', type: 'tool.result', schema: toolResultEventSchema },
  'prompt.completed': { kind: 'stream', name: 'events', type: 'prompt.completed', schema: promptCompletedEventSchema },
  'prompt.aborted': { kind: 'stream', name: 'events', type: 'prompt.aborted', schema: promptAbortedEventSchema },
  'compaction.started': {
    kind: 'stream',
    name: 'events',
    type: 'compaction.started',
    schema: compactionStartedEventSchema,
  },
  'compaction.blocked': {
    kind: 'stream',
    name: 'events',
    type: 'compaction.blocked',
    schema: compactionBlockedEventSchema,
  },
  'compaction.cancelled': {
    kind: 'stream',
    name: 'events',
    type: 'compaction.cancelled',
    schema: compactionCancelledEventSchema,
  },
  'compaction.completed': {
    kind: 'stream',
    name: 'events',
    type: 'compaction.completed',
    schema: compactionCompletedEventSchema,
  },
  'permission.approval.requested': {
    kind: 'stream',
    name: 'events',
    type: 'permission.approval.requested',
    schema: permissionApprovalRequestedEventSchema,
  },
  'permission.approval.resolved': {
    kind: 'stream',
    name: 'events',
    type: 'permission.approval.resolved',
    schema: permissionApprovalResolvedEventSchema,
  },
  error: { kind: 'stream', name: 'events', type: 'error', schema: errorEventSchema },
  warning: { kind: 'stream', name: 'events', type: 'warning', schema: warningEventSchema },
  'agent.status.updated': {
    kind: 'stream',
    name: 'events',
    type: 'agent.status.updated',
    schema: agentStatusUpdatedEventSchema,
  },
  'research.updated': {
    kind: 'stream',
    name: 'events',
    type: 'research.updated',
    schema: researchUpdatedEventSchema,
  },
  'aitp_mode.updated': {
    kind: 'stream',
    name: 'events',
    type: 'aitp_mode.updated',
    schema: aitpModeUpdatedEventSchema,
  },
  'goal.updated': {
    kind: 'stream',
    name: 'events',
    type: 'goal.updated',
    schema: goalUpdatedEventSchema,
  },
} satisfies Record<AgentEventName, AgentEventRegistration>;
