/**
 * Agent-scope AITP Research Mode service contracts. Mirror the engine's
 * `IAgentResearchService` and `IAgentAitpModeService` method signatures the
 * research facade calls: `getSnapshot` (read), `steer` (dispatch a
 * `HumanSteeringCommand`), `setFocus`, `createQuestion`, `createLine`,
 * `updateLine`, `updateQuestion`, `reopenQuestion`, `acknowledgeAlert`,
 * `resolveHumanDecision`, `proposeCheckpoint`, `commitCheckpoint` on the
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
  researchLineUpdateInputSchema,
  researchQuestionSchema,
  researchStatusSnapshotSchema,
  researchAlertFingerprintSchema,
  resolveHumanDecisionInputSchema,
  researchHumanGateSchema,
  type AitpModeEntryOptions,
  type CommitCheckpointInput,
  type CreateQuestionInput,
  type ProposeCheckpointInput,
  type UpdateQuestionInput,
} from './researchSchemas.js';
import type { UpdateLineInput } from '@moonshot-ai/agent-core-v2/features/aitpResearch/research/agentResearch';

// ── input schemas (declared before use) ─────────────────────────────────────

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
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
  assessment: z.string().optional(),
  nextAction: z.string().optional(),
}) satisfies z.ZodType<ProposeCheckpointInput>;

const commitCheckpointInputSchema = z.object({
  checkpointId: z.string(),
  entryId: z.string(),
}) satisfies z.ZodType<CommitCheckpointInput>;

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
  commitCheckpoint: {
    input: z.tuple([commitCheckpointInputSchema]),
    output: noResult,
  },
} satisfies ServiceContract;

export const agentAitpModeContract = {
  enter: { input: z.tuple([aitpModeEntryOptionsSchema]), output: noResult },
  exit: { input: z.tuple([]), output: noResult },
  pauseLoop: { input: z.tuple([z.number()]), output: noResult },
  resumeLoop: { input: z.tuple([z.number()]), output: noResult },
} satisfies ServiceContract;
