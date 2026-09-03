import { z } from 'zod';

export const goalStatusSchema = z.enum(['active', 'paused', 'blocked', 'complete']);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const goalBudgetReportSchema = z.object({
  tokenBudget: z.number().nullable(),
  turnBudget: z.number().nullable(),
  wallClockBudgetMs: z.number().nullable(),
  remainingTokens: z.number().nullable(),
  remainingTurns: z.number().nullable(),
  remainingWallClockMs: z.number().nullable(),
  tokenBudgetReached: z.boolean(),
  turnBudgetReached: z.boolean(),
  wallClockBudgetReached: z.boolean(),
  overBudget: z.boolean(),
});
export type GoalBudgetReport = z.infer<typeof goalBudgetReportSchema>;

export const goalWaitLeaseSchema = z
  .object({
    taskIds: z.array(z.string().min(1)).min(1).max(32),
    policy: z.enum(['any', 'all']),
  })
  .strict();

export const goalContinuationSnapshotSchema = z.object({
  state: z.enum(['idle', 'deciding', 'enqueued', 'running', 'held', 'waiting']),
  owner: z.string().optional(),
  reason: z.string().optional(),
});

export const goalSnapshotSchema = z.object({
  goalId: z.string(),
  objective: z.string(),
  completionCriterion: z.string().optional(),
  status: goalStatusSchema,
  turnsUsed: z.number(),
  tokensUsed: z.number(),
  wallClockMs: z.number(),
  budget: goalBudgetReportSchema,
  waitingFor: goalWaitLeaseSchema.optional(),
  continuation: goalContinuationSnapshotSchema.optional(),
  terminalReason: z.string().optional(),
});
export type GoalSnapshotWire = z.infer<typeof goalSnapshotSchema>;
