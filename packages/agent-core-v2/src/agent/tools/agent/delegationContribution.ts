/**
 * `tools` domain — execution-time participation in Agent delegation.
 *
 * Contributors observe captured caller, target and task ownership without
 * coupling the generic Agent tool to a research protocol. The collection is
 * folded before launch; it does not grant permissions or manage running tasks.
 */

import { collection } from '#/_base/di/collection';
import { createDecorator } from '#/_base/di/instantiation';

export interface DelegationInput {
  readonly callerAgentId: string;
  readonly resumeAgentId?: string;
  readonly taskScope?: string;
  readonly goalDependencies?: readonly string[];
}

export interface DelegationGuardContribution {
  readonly guard: (input: DelegationInput) => string | undefined;
}

export const DelegationGuardContribution = collection<DelegationGuardContribution>(
  'agent-delegation-guard',
);

export interface IDelegationAdmission {
  readonly _serviceBrand: undefined;
  blocker(input: DelegationInput): string | undefined;
}

export const IDelegationAdmission = createDecorator<IDelegationAdmission>('delegationAdmission');

export function delegationBlocker(
  guards: Iterable<DelegationGuardContribution>,
  input: DelegationInput,
): string | undefined {
  for (const guard of guards) {
    const reason = guard.guard(input);
    if (reason !== undefined) return reason;
  }
  return undefined;
}
