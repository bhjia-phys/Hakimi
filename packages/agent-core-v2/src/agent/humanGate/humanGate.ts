/**
 * `humanGate` domain — shared human-interaction contract.
 *
 * Defines the common approval, review, and decision vocabulary used by transient
 * tool approvals and durable domain-specific gates. The contract deliberately
 * does not own research state or plan state; those domains retain their own
 * durable records while sharing the same interaction transport. Scope-agnostic.
 */

import { createDecorator } from '#/_base/di/instantiation';
import type { ApprovalResponse, PermissionPolicyResult } from '#/agent/permissionPolicy/types';
import type {
  BeforeExecuteDecision,
  ResolvedToolExecutionHookContext,
} from '#/agent/toolExecutor/toolHooks';

export type HumanGateKind = 'approval' | 'review' | 'decision';

export interface HumanGateRequest {
  readonly kind: HumanGateKind;
  readonly origin: string;
}

export interface IAgentHumanGateService {
  readonly _serviceBrand: undefined;

  request(
    context: ResolvedToolExecutionHookContext,
    result: Extract<PermissionPolicyResult, { kind: 'ask' }>,
    request: HumanGateRequest,
  ): Promise<BeforeExecuteDecision | undefined>;

  formatRejection(
    toolName: string,
    result: Pick<ApprovalResponse, 'decision' | 'feedback'>,
  ): string;
}

export const IAgentHumanGateService = createDecorator<IAgentHumanGateService>(
  'agentHumanGateService',
);
