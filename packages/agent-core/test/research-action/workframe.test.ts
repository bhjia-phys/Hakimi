import { describe, expect, it } from 'vitest';

import { addOpenObligation, closeOpenObligation, createWorkFrame } from '../../src/research-action';

describe('work frame', () => {
  it('creates an exploratory frame and tracks open obligations immutably', () => {
    const frame = createWorkFrame({
      id: 'frame.fqhe',
      domain: 'topological-order',
      topic: 'fqhe-cs-effective-theory',
      goal: 'Relate Laughlin wavefunction to CS response.',
    });

    const withObligation = addOpenObligation(frame, 'obl.check-convention');
    const unchanged = addOpenObligation(withObligation, 'obl.check-convention');
    const closed = closeOpenObligation(withObligation, 'obl.check-convention');

    expect(frame.openObligationIds).toEqual([]);
    expect(withObligation.openObligationIds).toEqual(['obl.check-convention']);
    expect(unchanged).toBe(withObligation);
    expect(closed.openObligationIds).toEqual([]);
  });
});
