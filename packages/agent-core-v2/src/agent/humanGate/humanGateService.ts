/**
 * `humanGate` domain — shared human-interaction implementation.
 *
 * Adapts the existing tool-approval broker to the common Human Gate contract,
 * preserving the broker's cancellation, telemetry, and permission-rule
 * behavior. Durable Research and Plan state remains owned by their domains.
 * Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { IAgentToolApprovalService } from '#/agent/toolApproval/toolApproval';
import type {
  ApprovalResponse,
  PermissionPolicyResult,
} from '#/agent/permissionPolicy/types';
import type {
  BeforeExecuteDecision,
  ResolvedToolExecutionHookContext,
} from '#/agent/toolExecutor/toolHooks';

import {
  IAgentHumanGateService,
  type HumanGateRequest,
} from './humanGate';

export class AgentHumanGateService extends Service implements IAgentHumanGateService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IAgentToolApprovalService private readonly approvals: IAgentToolApprovalService,
  ) {
    super();
  }

  request(
    context: ResolvedToolExecutionHookContext,
    result: Extract<PermissionPolicyResult, { kind: 'ask' }>,
    request: HumanGateRequest,
  ): Promise<BeforeExecuteDecision | undefined> {
    return this.approvals.requestToolApproval(context, result, request.origin);
  }

  formatRejection(
    toolName: string,
    result: Pick<ApprovalResponse, 'decision' | 'feedback'>,
  ): string {
    return this.approvals.formatApprovalRejectionMessage(toolName, result);
  }
}

registerScopedService(
  LifecycleScope.Agent,
  IAgentHumanGateService,
  AgentHumanGateService,
  ScopeActivation.OnScopeCreated,
  'humanGate',
);
