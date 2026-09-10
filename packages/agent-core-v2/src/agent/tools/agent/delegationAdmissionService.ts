/**
 * `tools` domain — session-local delegation participation.
 *
 * Folds live contributions across this session's agent scopes so sibling and
 * nested agents consult the same decision owner without a task scheduler or
 * cross-session state. Bound at Session scope.
 */

import type { CollectionView } from '#/_base/di/collection';
import { registerScopedService, ScopeActivation } from '#/_base/di/scope';
import { LifecycleScope } from '#/app/scopes';

import {
  DelegationGuardContribution,
  delegationBlocker,
  IDelegationAdmission,
  type DelegationInput,
} from './delegationContribution';

export class DelegationAdmissionService implements IDelegationAdmission {
  declare readonly _serviceBrand: undefined;

  constructor(
    @DelegationGuardContribution private readonly guards: CollectionView<DelegationGuardContribution>,
  ) {}

  blocker(input: DelegationInput): string | undefined {
    return delegationBlocker(this.guards.items, input);
  }
}

registerScopedService(
  LifecycleScope.Session,
  IDelegationAdmission,
  DelegationAdmissionService,
  ScopeActivation.OnDemand,
  'delegationAdmission',
);
