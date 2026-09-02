/**
 * `aitpResearch` domain — versioned multi-loop Research Plan wire operation.
 *
 * The plan lives inside the checkpointed ResearchModel so plan revisions follow
 * conversation undo and advance the one Research snapshot revision. It remains
 * Hakimi-local working state and never writes AITP or schedules execution.
 */

import { ResearchPlanV2Schema, type ResearchPlanV2 } from '#/features/research/types';
import { ResearchModel } from './aitpResearchOps';

declare module '#/wire/types' {
  interface PersistedOpMap {
    'research.plan_v2.put': typeof researchPutPlanV2;
  }
}

export const researchPutPlanV2 = ResearchModel.defineOp('research.plan_v2.put', {
  schema: ResearchPlanV2Schema,
  apply: (s, p) => {
    const current = s.current.researchPlanV2;
    if (current !== null && current.planId === p.planId && current.revision >= p.revision) {
      return s;
    }
    if (
      current !== null &&
      current.planId !== p.planId &&
      current.status !== 'completed' &&
      current.status !== 'discarded'
    ) {
      return s;
    }
    return {
      ...s,
      current: {
        ...s.current,
        researchPlanV2: copyResearchPlanV2(p),
        revision: s.current.revision + 1,
      },
    };
  },
});

function copyResearchPlanV2(plan: ResearchPlanV2): ResearchPlanV2 {
  return {
    ...plan,
    milestones: plan.milestones.map((milestone) => ({
      ...milestone,
      evidenceRequirements: [...milestone.evidenceRequirements],
    })),
    evidenceRequirements: [...plan.evidenceRequirements],
    decisionPoints: plan.decisionPoints.map((decision) => ({ ...decision })),
    assumptions: [...plan.assumptions],
    stopConditions: [...plan.stopConditions],
    replanConditions: [...plan.replanConditions],
  };
}
