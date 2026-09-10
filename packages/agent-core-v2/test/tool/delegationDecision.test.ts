import { describe, expect, it } from 'vitest';

import { researchDelegationBlocker } from '#/features/aitpResearch/research/delegationDecision';
import { labelsFromAgentMeta, subagentGoalDependencies, subagentLabels } from '#/session/agentLifecycle/subagentMetadata';

describe('delegated Goal dependencies', () => {
  it('holds A but not explicit B or independent work', () => {
    const gate = { dependentGoalIds: ['A'] };
    expect(researchDelegationBlocker(gate, ['A'])).toContain('explicitly depends');
    expect(researchDelegationBlocker(gate, ['B'])).toBeUndefined();
    expect(researchDelegationBlocker(gate, [])).toBeUndefined();
    expect(researchDelegationBlocker(gate, undefined)).toContain('unknown');
  });

  it('keeps unknown historical decisions unresolved', () => {
    const gate = {};
    expect(researchDelegationBlocker(gate, ['A'])).toContain('unknown');
    expect(researchDelegationBlocker(gate, [])).toBeUndefined();
    expect(gate).toEqual({});
    expect(researchDelegationBlocker({ resolvedAt: 1 }, ['A'])).toBeUndefined();
    expect(researchDelegationBlocker(null, undefined)).toBeUndefined();
  });

  it('preserves explicit and unknown declarations through metadata restore', () => {
    for (const goals of [undefined, [], ['A', 'B']]) {
      const meta = { labels: subagentLabels('main', { goalDependencies: goals }) };
      expect(subagentGoalDependencies({ labels: labelsFromAgentMeta(meta) })).toEqual(goals);
    }
    for (const raw of ['bad-json', 'null', '[1]', '[""]']) {
      expect(subagentGoalDependencies({ labels: { goalDependencies: raw } })).toBeUndefined();
    }
  });
});
