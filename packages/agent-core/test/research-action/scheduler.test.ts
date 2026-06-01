import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESEARCH_ACTIONS,
  recommendResearchActions,
  type ResearchObligation,
} from '../../src/research-action';

describe('research action scheduler', () => {
  it('prioritizes open blocking convention and dimension checks before advisory work', () => {
    const recommendations = recommendResearchActions({
      actions: DEFAULT_RESEARCH_ACTIONS,
      obligations: [
        obligation('obl.dimension', 'dimension_check', 'blocking', 'validate.check_dimension'),
        obligation('obl.convention', 'convention_check', 'blocking', 'validate.check_convention'),
        obligation('obl.note', 'human_decision', 'advisory', 'scope.open_work_frame'),
      ],
    });

    expect(recommendations.map((item) => item.action.id)).toEqual([
      'validate.check_convention',
      'validate.check_dimension',
      'scope.open_work_frame',
    ]);
    expect(recommendations[0]?.obligationIds).toEqual(['obl.convention']);
  });

  it('ignores closed obligations and supports limits', () => {
    const recommendations = recommendResearchActions({
      actions: DEFAULT_RESEARCH_ACTIONS,
      obligations: [
        obligation('obl.open', 'dependency_closure', 'important', 'validate.check_dependency_closure'),
        {
          ...obligation('obl.closed', 'convention_check', 'blocking', 'validate.check_convention'),
          status: 'passed',
        },
      ],
      limit: 1,
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.action.id).toBe('validate.check_dependency_closure');
  });
});

function obligation(
  id: string,
  kind: ResearchObligation['kind'],
  severity: ResearchObligation['severity'],
  requiredActionId: string,
): ResearchObligation {
  return {
    id,
    kind,
    domain: 'topological-order',
    topic: 'fqhe-cs-effective-theory',
    targetObjectId: 'formula.fqhe.flux-quantization',
    severity,
    reason: `${kind} required`,
    requiredActionId,
    status: 'open',
  };
}
