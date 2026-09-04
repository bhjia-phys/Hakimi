/**
 * `aitpResearch` domain — checkpointed Research planning-policy operation.
 *
 * The Hakimi-local collaborative/dreaming choice lives in ResearchModel, so
 * it follows conversation undo, survives compaction and cold replay, and
 * advances the single Research snapshot revision. It has no AITP side effect.
 */

import { ResearchPlanningPolicySchema } from '#/features/research/types';
import { ResearchModel } from './aitpResearchOps';

declare module '#/wire/types' {
  interface PersistedOpMap {
    'research.planning_policy.set': typeof researchSetPlanningPolicy;
  }
}

export const researchSetPlanningPolicy = ResearchModel.defineOp(
  'research.planning_policy.set',
  {
    schema: ResearchPlanningPolicySchema,
    apply: (state, policy) => {
      if (state.current.planningPolicy === policy) return state;
      return {
        ...state,
        current: {
          ...state.current,
          planningPolicy: policy,
          revision: state.current.revision + 1,
        },
      };
    },
  },
);
