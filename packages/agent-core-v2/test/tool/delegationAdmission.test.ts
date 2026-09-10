import { describe, expect, it } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { createDecorator } from '#/_base/di/instantiation';
import { InstantiationService } from '#/_base/di/instantiationService';
import { Service } from '#/_base/di/service';
import { ServiceCollection } from '#/_base/di/serviceCollection';
import { DelegationAdmissionService } from '#/agent/tools/agent/delegationAdmissionService';
import { DelegationGuardContribution, IDelegationAdmission } from '#/agent/tools/agent/delegationContribution';

const ITestDecision = createDecorator<Service>('delegation-test-decision');
class Decision extends Service {
  constructor() {
    super();
    this.provide(DelegationGuardContribution, {
      guard: ({ taskScope }) => taskScope === 'a' ? 'Decision A pending' : undefined,
    });
  }
}

describe('session delegation admission', () => {
  it('shares a main-agent contribution with siblings but not another session', () => {
    const app = new InstantiationService(new ServiceCollection(), true);
    try {
      const sessionA = app.createChild(new ServiceCollection()) as InstantiationService;
      const sessionB = app.createChild(new ServiceCollection()) as InstantiationService;
      for (const session of [sessionA, sessionB]) {
        session.provide(IDelegationAdmission, new SyncDescriptor(DelegationAdmissionService));
      }
      const main = sessionA.createChild(new ServiceCollection()) as InstantiationService;
      main.provide(ITestDecision, new SyncDescriptor(Decision));
      main.invokeFunction(a => a.get(ITestDecision));
      const sibling = sessionA.createChild(new ServiceCollection()) as InstantiationService;
      const admission = sibling.invokeFunction(a => a.get(IDelegationAdmission));
      expect(admission.blocker({ callerAgentId: 'child', taskScope: 'a' })).toBe('Decision A pending');
      expect(admission.blocker({ callerAgentId: 'child', taskScope: 'b' })).toBeUndefined();
      expect(sessionB.invokeFunction(a => a.get(IDelegationAdmission))
        .blocker({ callerAgentId: 'main', taskScope: 'a' })).toBeUndefined();
      main.dispose();
      expect(admission.blocker({ callerAgentId: 'child', taskScope: 'a' })).toBeUndefined();
    } finally {
      app.dispose();
    }
  });
});
