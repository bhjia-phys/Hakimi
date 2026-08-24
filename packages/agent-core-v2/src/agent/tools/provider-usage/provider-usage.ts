/**
 * `tools` domain — `IGetProviderUsageTool` contract (the `GetProviderUsage`
 * tool).
 *
 * Public contract of the `GetProviderUsage` builtin tool: the model-facing
 * `GetProviderUsageInputSchema` / `GetProviderUsageInput` and the
 * `IGetProviderUsageTool` DI decorator. The tool is a read-only wrapper over
 * the App-scope `IProviderUsageService` (`providerUsage` domain) and is
 * registered for the main agent only. Bound at Agent scope.
 */

import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import { type AgentTool } from '#/tool/toolContract';

export const GetProviderUsageInputSchema = z.object({
  provider: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Provider id to query. When omitted, every configured supported usage provider is queried.',
    ),
});

export type GetProviderUsageInput = z.infer<typeof GetProviderUsageInputSchema>;

export interface IGetProviderUsageTool extends AgentTool<GetProviderUsageInput> {
  readonly _serviceBrand: undefined;
}
export const IGetProviderUsageTool = createDecorator<IGetProviderUsageTool>('getProviderUsageTool');