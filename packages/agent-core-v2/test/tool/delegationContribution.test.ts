import { describe, expect, it, vi } from 'vitest';

import { delegationBlocker } from '#/agent/tools/agent/delegationContribution';

describe('delegation participation', () => {
  it('leaves ordinary delegation unchanged without participants', () => {
    expect(delegationBlocker([], { callerAgentId: 'main' })).toBeUndefined();
  });

  it('keeps an explicit wait local to its target scope', () => {
    const guard = ({ taskScope }: { taskScope?: string }) =>
      taskScope === 'research-line:a' ? 'Waiting for decision A' : undefined;
    expect(delegationBlocker([{ guard }], {
      callerAgentId: 'main', taskScope: 'research-line:a',
    })).toBe('Waiting for decision A');
    expect(delegationBlocker([{ guard }], {
      callerAgentId: 'main', taskScope: 'research-line:b',
    })).toBeUndefined();
  });

  it('passes captured resume identity and stops at the first denial', () => {
    const guard = vi.fn(() => 'Waiting');
    const later = vi.fn();
    const input = { callerAgentId: 'agent-0', resumeAgentId: 'agent-1', taskScope: 'original' };
    expect(delegationBlocker([{ guard }, { guard: later }], input)).toBe('Waiting');
    expect(guard).toHaveBeenCalledWith(input);
    expect(later).not.toHaveBeenCalled();
  });
});
