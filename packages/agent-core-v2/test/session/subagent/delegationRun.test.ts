import { afterEach, describe, expect, it, vi } from 'vitest';

import { DisposableStore } from '#/_base/di/lifecycle';
import { createServices } from '#/_base/di/test';
import { IAgentLifecycleService } from '#/session/agentLifecycle/agentLifecycle';
import { ISessionAgentProfileCatalog } from '#/session/sessionAgentProfileCatalog/sessionAgentProfileCatalog';
import { ISessionMetadata } from '#/session/sessionMetadata/sessionMetadata';
import { IDelegationAdmission } from '#/agent/tools/agent/delegationContribution';
import { researchDelegationBlocker } from '#/features/aitpResearch/research/delegationDecision';
import { ISessionSubagentService } from '#/session/subagent/subagent';
import { SessionSubagentService } from '#/session/subagent/subagentService';

describe('shared subagent execution admission', () => {
  const disposables = new DisposableStore();
  afterEach(() => disposables.clear());

  it.each(['prompt', 'retry'] as const)('rejects dependent %s before touching the target loop', async kind => {
    const access = vi.fn();
    const ix = createServices(disposables, { additionalServices: reg => {
      reg.define(ISessionSubagentService, SessionSubagentService);
      reg.definePartialInstance(IAgentLifecycleService, { get: () => ({ id: 'child', accessor: { get: access } }) as never });
      reg.definePartialInstance(ISessionAgentProfileCatalog, {});
      reg.definePartialInstance(ISessionMetadata, { read: async () => ({ agents: {
        child: { labels: { parentAgentId: 'main', goalDependencies: '["A"]' } },
      } }) as never });
      reg.defineInstance(IDelegationAdmission, {
        _serviceBrand: undefined,
        blocker: input => researchDelegationBlocker({ dependentGoalIds: ['A'] }, input.goalDependencies),
      });
    } });
    await expect(ix.get(ISessionSubagentService).run('child',
      kind === 'prompt' ? { kind, prompt: 'Must not execute' } : { kind },
      { signal: new AbortController().signal },
    )).rejects.toMatchObject({ code: 'agent.delegation_blocked' });
    expect(access).not.toHaveBeenCalled();
  });
});
