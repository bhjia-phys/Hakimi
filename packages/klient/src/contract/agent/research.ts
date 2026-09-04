/**
 * Agent-scope AITP Research Mode service contracts. Mirror the engine's
 * `IAgentResearchService` and `IAgentAitpModeService` method signatures the
 * research facade calls: `getSnapshot` (read), `steer` (dispatch a
 * `HumanSteeringCommand`), `setFocus`, `createQuestion`, `createLine`,
 * `updateLine`, `updateQuestion`, `reopenQuestion`, `acknowledgeAlert`,
 * `resolveHumanDecision`, `proposeCheckpoint`, `discardHistoricalCheckpoint`,
 * `commitCheckpoint` on the
 * research service; `enter`, `exit`, `pauseLoop`, `resumeLoop` on the mode
 * service. The `HumanSteeringCommand` union and the snapshot shape are
 * mirrored as zod schemas in `./researchSchemas.ts`.
 */

import { z } from 'zod';

import { maybe, noResult } from '../helpers.js';
import type { ServiceContract } from '../types.js';
import {
  humanSteeringCommandSchema,
  researchCommittedCursorSchema,
  researchCheckpointSchema,
  researchLineCreationInputSchema,
  researchLineSchema,
  researchLineWorkstreamBindingSchema,
  researchLineUpdateInputSchema,
  researchQuestionSchema,
  researchStatusSnapshotSchema,
  researchAlertFingerprintSchema,
  resolveHumanDecisionInputSchema,
  researchHumanGateSchema,
  researchEvidencePacketSchema,
  researchEvidenceReviewSchema,
  researchRunStageSchema,
  researchSchedulerStateSchema,
  researchRunStateSchema,
  researchPlanSchema,
  prepareResearchPlanInputSchema,
  researchPlanV2Schema,
  prepareResearchPlanV2InputSchema,
  transitionResearchPlanV2InputSchema,
  researchPlanningPolicySchema,
  researchActionSpecSchema,
  planActionInputSchema,
  concludeActionInputSchema,
  researchActionConclusionSchema,
  type AitpModeEntryOptions,
  type CommitCheckpointInput,
  type DiscardHistoricalCheckpointInput,
  type CreateQuestionInput,
  type ProposeCheckpointInput,
  type UpdateQuestionInput,
} from './researchSchemas.js';
import type {
  ClearLineWorkstreamBindingInput,
  ClearGoalAlignmentInput,
  ConfirmLineWorkstreamBindingInput,
  ConfirmGoalAlignmentInput,
  ObserveResearchRunInput,
  UpdateLineInput,
} from '@moonshot-ai/agent-core-v2/features/aitpResearch/research/agentResearch';

// ── input schemas (declared before use) ─────────────────────────────────────

const researchWireStringListSchema = z.array(z.string().max(500)).max(50);

const createQuestionInputSchema = z.object({
  id: z.string().optional(),
  lineSlug: z.string(),
  wording: z.string(),
  assessment: z.string().optional(),
  priority: z.number().optional(),
  neededEvidence: z.array(z.string()).optional(),
}) satisfies z.ZodType<CreateQuestionInput>;

const updateQuestionInputSchema = z.object({
  questionId: z.string(),
  expectedRevision: z.number().optional(),
  wording: z.string().optional(),
  assessment: z.string().optional(),
  priority: z.number().optional(),
  workflow: z.enum(['open', 'active', 'deferred', 'blocked', 'closed', 'cancelled']).optional(),
  epistemic: z
    .enum(['unknown', 'candidate', 'supported', 'contradicted', 'inconclusive'])
    .optional(),
  neededEvidence: z.array(z.string()).optional(),
  nextBoundedAction: z.string().optional(),
  evidenceRefs: z.array(z.string()).optional(),
  falsifierRefs: z.array(z.string()).optional(),
  reason: z.string().optional(),
}) satisfies z.ZodType<UpdateQuestionInput>;

const updateLineInputSchema = researchLineUpdateInputSchema satisfies z.ZodType<UpdateLineInput>;

const proposeCheckpointInputSchema = z.object({
  expectedRevision: z.number(),
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
  assessment: z.string().optional(),
  nextAction: z.string().optional(),
}) satisfies z.ZodType<ProposeCheckpointInput>;

const commitCheckpointInputSchema = z.object({
  checkpointId: z.string(),
  entryId: z.string(),
}) satisfies z.ZodType<CommitCheckpointInput>;

const discardHistoricalCheckpointInputSchema = z.object({
  checkpointId: z.string(),
  expectedRevision: z.number().int().nonnegative(),
}) satisfies z.ZodType<DiscardHistoricalCheckpointInput>;

const confirmGoalAlignmentInputSchema = z.object({
  relation: z.enum(['same_program_goal', 'goal_parent_of_program', 'goal_milestone_in_program', 'unrelated']),
  expectedRevision: z.number().int().nonnegative(),
  goalId: z.string(),
  topicId: z.string(),
  observedRevision: z.number().int().positive(),
}).strict() satisfies z.ZodType<ConfirmGoalAlignmentInput>;

const clearGoalAlignmentInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  goalId: z.string(),
  topicId: z.string(),
  observedRevision: z.number().int().positive(),
}).strict() satisfies z.ZodType<ClearGoalAlignmentInput>;

const confirmLineWorkstreamBindingInputSchema = z.object({
  lineSlug: z.string().min(1).max(200),
  workstream: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  expectedRevision: z.number().int().nonnegative(),
  confirmedBy: z.literal('user'),
}).strict() satisfies z.ZodType<ConfirmLineWorkstreamBindingInput>;

const clearLineWorkstreamBindingInputSchema = z.object({
  lineSlug: z.string().min(1).max(200),
  expectedConfirmationId: z.string().min(1).max(200),
  expectedRevision: z.number().int().nonnegative(),
}).strict() satisfies z.ZodType<ClearLineWorkstreamBindingInput>;

const observeResearchRunInputSchema = z.object({
  actionId: z.string(),
  expectedRevision: z.number().int().nonnegative(),
  campaign: z.string().min(1).max(500),
  jobId: z.string().min(1).max(200),
  sourcePin: z.string().max(500).optional(),
  binaryPin: z.string().max(500).optional(),
  stage: researchRunStageSchema,
  schedulerState: researchSchedulerStateSchema,
  nextCheckAt: z.number().optional(),
  terminalState: z.enum(['completed', 'failed', 'cancelled']).optional(),
  artifactRefs: researchWireStringListSchema.optional(),
}).strict() satisfies z.ZodType<ObserveResearchRunInput>;

const aitpModeEntryOptionsSchema = z.object({
  actor: z.enum(['user', 'model']),
  lineSlug: z.string().optional(),
}) satisfies z.ZodType<AitpModeEntryOptions>;

// ── contracts ───────────────────────────────────────────────────────────────

const setFocusArgsSchema = z.union([
  z.tuple([z.string()]),
  z.tuple([z.string(), z.string()]),
  z.tuple([z.string(), z.number()]),
  z.tuple([z.string(), z.string(), z.number()]),
]);

const reopenQuestionArgsSchema = z.union([
  z.tuple([z.string()]),
  z.tuple([z.string(), z.string()]),
  z.tuple([z.string(), z.number()]),
  z.tuple([z.string(), z.string(), z.number()]),
]);

export const agentResearchContract = {
  getSnapshot: { input: z.tuple([]), output: researchStatusSnapshotSchema },
  getQuestions: { input: z.tuple([]), output: z.array(researchQuestionSchema) },
  getLines: { input: z.tuple([]), output: z.array(researchLineSchema) },
  getPendingCheckpoint: { input: z.tuple([]), output: maybe(researchCheckpointSchema) },
  getCommittedCursor: { input: z.tuple([]), output: maybe(researchCommittedCursorSchema) },
  getResearchPlan: { input: z.tuple([]), output: maybe(researchPlanSchema) },
  getResearchPlanV2: { input: z.tuple([]), output: maybe(researchPlanV2Schema) },
  getPlanningPolicy: { input: z.tuple([]), output: researchPlanningPolicySchema },
  setPlanningPolicy: {
    input: z.tuple([researchPlanningPolicySchema, z.number().int().nonnegative()]),
    output: noResult,
  },
  confirmGoalAlignment: { input: z.tuple([confirmGoalAlignmentInputSchema]), output: noResult },
  clearGoalAlignment: { input: z.tuple([clearGoalAlignmentInputSchema]), output: noResult },
  confirmLineWorkstreamBinding: {
    input: z.tuple([confirmLineWorkstreamBindingInputSchema]),
    output: researchLineWorkstreamBindingSchema,
  },
  clearLineWorkstreamBinding: {
    input: z.tuple([clearLineWorkstreamBindingInputSchema]),
    output: noResult,
  },
  planAndStartAction: {
    input: z.tuple([planActionInputSchema]),
    output: researchActionSpecSchema,
  },
  startAction: { input: z.tuple([z.string()]), output: noResult },
  completeAction: {
    input: z.tuple([z.string(), z.enum(['completed', 'abandoned'])]),
    output: noResult,
  },
  concludeAction: {
    input: z.tuple([concludeActionInputSchema]),
    output: researchActionConclusionSchema,
  },
  prepareResearchPlan: {
    input: z.tuple([prepareResearchPlanInputSchema]),
    output: researchPlanSchema,
  },
  finalizeResearchPlan: { input: z.tuple([]), output: researchPlanSchema },
  discardResearchPlan: { input: z.tuple([]), output: maybe(researchPlanSchema) },
  prepareResearchPlanV2: {
    input: z.tuple([prepareResearchPlanV2InputSchema]),
    output: researchPlanV2Schema,
  },
  activateResearchPlanV2: {
    input: z.tuple([transitionResearchPlanV2InputSchema]),
    output: researchPlanV2Schema,
  },
  completeResearchPlanV2: {
    input: z.tuple([transitionResearchPlanV2InputSchema]),
    output: researchPlanV2Schema,
  },
  discardResearchPlanV2: {
    input: z.tuple([transitionResearchPlanV2InputSchema]),
    output: researchPlanV2Schema,
  },
  createQuestion: {
    input: z.tuple([createQuestionInputSchema]),
    output: researchQuestionSchema,
  },
  createLine: {
    input: z.tuple([researchLineCreationInputSchema]),
    output: researchLineSchema,
  },
  updateLine: {
    input: z.tuple([updateLineInputSchema]),
    output: researchLineSchema,
  },
  updateQuestion: {
    input: z.tuple([updateQuestionInputSchema]),
    output: researchQuestionSchema,
  },
  setFocus: {
    input: setFocusArgsSchema,
    output: noResult,
  },
  switchLine: { input: z.tuple([z.string(), z.number().optional()]), output: noResult },
  steer: {
    input: z.tuple([humanSteeringCommandSchema]),
    output: noResult,
  },
  reopenQuestion: {
    input: reopenQuestionArgsSchema,
    output: noResult,
  },
  acknowledgeAlert: {
    input: z.tuple([researchAlertFingerprintSchema]),
    output: noResult,
  },
  resolveHumanDecision: {
    input: z.tuple([resolveHumanDecisionInputSchema]),
    output: researchHumanGateSchema,
  },
  proposeCheckpoint: {
    input: z.tuple([proposeCheckpointInputSchema]),
    output: researchCheckpointSchema,
  },
  discardHistoricalCheckpoint: {
    input: z.tuple([discardHistoricalCheckpointInputSchema]),
    output: researchCheckpointSchema,
  },
  commitCheckpoint: {
    input: z.tuple([commitCheckpointInputSchema]),
    output: noResult,
  },
  reviewEvidencePacket: {
    input: z.tuple([researchEvidencePacketSchema, z.number()]),
    output: researchEvidenceReviewSchema,
  },
  observeRun: {
    input: z.tuple([observeResearchRunInputSchema]),
    output: researchRunStateSchema,
  },
} satisfies ServiceContract;

export const agentAitpModeContract = {
  enter: { input: z.tuple([aitpModeEntryOptionsSchema]), output: noResult },
  exit: { input: z.tuple([]), output: noResult },
  pauseLoop: { input: z.tuple([z.number()]), output: noResult },
  resumeLoop: { input: z.tuple([z.number()]), output: noResult },
} satisfies ServiceContract;
