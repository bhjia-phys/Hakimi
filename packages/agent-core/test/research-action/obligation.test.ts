import { describe, expect, it } from 'vitest';

import {
  blockingOpenObligations,
  finalAnswerIsBlocked,
  transitionObligation,
  type ResearchObligation,
} from '../../src/research-action';

describe('research obligations', () => {
  it('transitions obligation status and blocks final answers only on open blocking obligations', () => {
    const obligation: ResearchObligation = {
      id: 'obl.flux-convention',
      kind: 'convention_check',
      domain: 'topological-order',
      topic: 'fqhe-cs-effective-theory',
      targetObjectId: 'formula.fqhe.flux-quantization',
      severity: 'blocking',
      reason: 'Flux quantum convention affects CS level normalization.',
      requiredActionId: 'validate.check_convention',
      status: 'open',
    };
    const advisory: ResearchObligation = {
      ...obligation,
      id: 'obl.note-polish',
      severity: 'advisory',
    };

    expect(blockingOpenObligations([obligation, advisory]).map((item) => item.id)).toEqual([
      'obl.flux-convention',
    ]);
    expect(finalAnswerIsBlocked([obligation, advisory])).toBe(true);
    expect(finalAnswerIsBlocked([transitionObligation(obligation, 'passed'), advisory])).toBe(
      false,
    );
  });
});
