/**
 * `tools` domain — `IGetProviderUsageTool` implementation (the
 * `GetProviderUsage` tool).
 *
 * Wraps the App-scope `IProviderUsageService` (`providerUsage` domain) into a
 * model-facing read-only tool: it queries the requested (or every configured
 * supported usage) provider and returns the structured result as stable JSON.
 * Query failures surface as `isError` with a sanitized message — the service
 * already redacts credentials from per-provider error entries, and this layer
 * never forwards raw exception text. Registered for the main agent only,
 * mirroring v1's `agent.type === 'main'` gate. Bound at Agent scope.
 */

import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import {
  ToolAccesses,
  type ExecutableToolContext,
  type ExecutableToolResult,
  type ToolExecution,
} from '#/tool/toolContract';
import { IProviderUsageService } from '#/app/providerUsage/providerUsage';

import {
  GetProviderUsageInputSchema,
  IGetProviderUsageTool,
  type GetProviderUsageInput,
} from './provider-usage';
import DESCRIPTION from './provider-usage.md?raw';

export class GetProviderUsageTool implements IGetProviderUsageTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'GetProviderUsage' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(GetProviderUsageInputSchema);

  constructor(@IProviderUsageService private readonly usage: IProviderUsageService) {}

  resolveExecution(args: GetProviderUsageInput): ToolExecution {
    return {
      accesses: ToolAccesses.none(),
      description: args.provider === undefined ? 'Querying provider usage' : `Querying ${args.provider} usage`,
      approvalRule: this.name,
      execute: (ctx) => this.execution(args, ctx),
    };
  }

  private async execution(
    args: GetProviderUsageInput,
    { signal }: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (signal.aborted) return { isError: true, output: 'Query cancelled.' };
    try {
      const results = await this.usage.queryUsage(args.provider, { signal });
      // A mid-flight abort may have produced a partial query (including a
      // cancellation error entry); report it as a cancellation, never as a
      // successful query result.
      if (signal.aborted) return { isError: true, output: 'Query cancelled.' };
      return { output: JSON.stringify(results, null, 2) };
    } catch {
      if (signal.aborted) return { isError: true, output: 'Query cancelled.' };
      return { isError: true, output: 'Failed to query provider usage.' };
    }
  }
}

registerAgentToolService(IGetProviderUsageTool, GetProviderUsageTool, {
  name: 'GetProviderUsage',
  domain: 'providerUsage',
  when: (accessor) => accessor.get(IAgentScopeContext).agentId === 'main',
});