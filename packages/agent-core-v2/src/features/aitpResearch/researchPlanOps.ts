/**
 * `aitpResearch` domain — checkpointed ResearchPlan wire state.
 *
 * Stores the local typed plan draft and its explicit finalized/discarded
 * resolution. These records are replayable conversation state only; they never
 * represent an AITP commit or execute a Research action. Scope-agnostic.
 */

import { z } from 'zod';

import {
  defineCheckpointedModel,
  type Checkpointed,
} from '#/agent/contextMemory/conversationTime';
import {
  ResearchPlanSchema,
  type ResearchPlan,
} from '#/features/research/types';

export type ResearchPlanModelState = Checkpointed<ResearchPlan | null>;

export const ResearchPlanModel = defineCheckpointedModel<ResearchPlan | null>(
  'researchPlan',
  () => null,
);

const ResearchPlanFieldsSchema = ResearchPlanSchema.omit({
  status: true,
  resolution: true,
});

const ResearchPlanDraftSchema = ResearchPlanFieldsSchema.extend({
  status: z.literal('draft'),
  resolution: z.undefined().optional(),
}).strict();

const ResearchPlanFinalizedSchema = ResearchPlanFieldsSchema.extend({
  status: z.literal('finalized'),
  resolution: z.object({
    planId: z.string().min(1).max(200),
    planRevision: z.number().int().nonnegative(),
    outcome: z.literal('approved'),
    selectedLabel: z.string().min(1).max(80).optional(),
  }).strict(),
}).strict();

const ResearchPlanDiscardedSchema = ResearchPlanFieldsSchema.extend({
  status: z.literal('discarded'),
  resolution: z.undefined().optional(),
}).strict();

declare module '#/wire/types' {
  interface PersistedOpMap {
    'research_plan.draft': typeof researchPlanDraft;
    'research_plan.finalize': typeof researchPlanFinalize;
    'research_plan.discard': typeof researchPlanDiscard;
  }
}

export const researchPlanDraft = ResearchPlanModel.defineOp('research_plan.draft', {
  schema: ResearchPlanDraftSchema,
  apply: (s, p) => {
    const next: ResearchPlan = { ...p, steps: [...p.steps], expectedEvidence: [...p.expectedEvidence] };
    return s.current !== null && JSON.stringify(s.current) === JSON.stringify(next)
      ? s
      : { ...s, current: next };
  },
});

export const researchPlanFinalize = ResearchPlanModel.defineOp('research_plan.finalize', {
  schema: ResearchPlanFinalizedSchema,
  apply: (s, p) => {
    const next: ResearchPlan = { ...p, steps: [...p.steps], expectedEvidence: [...p.expectedEvidence] };
    return s.current !== null && JSON.stringify(s.current) === JSON.stringify(next)
      ? s
      : { ...s, current: next };
  },
});

export const researchPlanDiscard = ResearchPlanModel.defineOp('research_plan.discard', {
  schema: ResearchPlanDiscardedSchema,
  apply: (s, p) => {
    const next: ResearchPlan = { ...p, steps: [...p.steps], expectedEvidence: [...p.expectedEvidence] };
    return s.current !== null && JSON.stringify(s.current) === JSON.stringify(next)
      ? s
      : { ...s, current: next };
  },
});
