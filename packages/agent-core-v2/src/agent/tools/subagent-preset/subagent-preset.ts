/**
 * `tools` domain — `ISetSubagentPresetTool` contract (the `SetSubagentPreset`
 * tool).
 *
 * Public contract of the `SetSubagentPreset` builtin tool: the model-facing
 * `SetSubagentPresetInputSchema` / `SetSubagentPresetInput` and the
 * `ISetSubagentPresetTool` DI decorator. The tool activates a configured
 * `[subagent]` routing preset for subsequent subagent spawns and is registered
 * for the main agent only. Bound at Agent scope.
 */

import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import { type AgentTool } from '#/tool/toolContract';

export const SetSubagentPresetInputSchema = z.object({
  preset: z
    .string()
    .min(1)
    .describe('Name of a configured `[subagent].presets` entry to activate for future subagent spawns.'),
});

export type SetSubagentPresetInput = z.infer<typeof SetSubagentPresetInputSchema>;

export interface ISetSubagentPresetTool extends AgentTool<SetSubagentPresetInput> {
  readonly _serviceBrand: undefined;
}
export const ISetSubagentPresetTool = createDecorator<ISetSubagentPresetTool>(
  'setSubagentPresetTool',
);