/**
 * `tools` domain — `ISetSubagentPresetTool` implementation (the
 * `SetSubagentPreset` tool).
 *
 * Validates a configured routing preset through `config` and `modelCatalog`,
 * then delegates activation to the shared App-scope preset writer. The writer
 * serializes manual and automatic selection, revalidates against live config,
 * atomically commits the preset with a persistent manual lock, and best-effort
 * aligns an existing Memory overlay. The result never reports cancellation
 * after the User-layer commit starts, never changes the main/default model or
 * global thinking, and reports
 * `main_model_changed: false`. Registered for the main agent only. Bound at
 * Agent scope.
 */

import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { IConfigService } from '#/app/config/config';
import { IModelCatalog } from '#/kosong/model/catalog';
import {
  SUBAGENT_SECTION,
  type SubagentConfig,
  type SubagentModelConfig,
} from '#/session/subagent/configSection';
import {
  ISubagentPresetActivationService,
  validateSubagentPreset,
} from '#/session/subagent/presetActivation';
import {
  ToolAccesses,
  type ExecutableToolContext,
  type ExecutableToolResult,
  type ToolExecution,
} from '#/tool/toolContract';

import {
  ISetSubagentPresetTool,
  SetSubagentPresetInputSchema,
  type SetSubagentPresetInput,
} from './subagent-preset';
import DESCRIPTION from './subagent-preset.md?raw';

export class SetSubagentPresetTool implements ISetSubagentPresetTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'SetSubagentPreset' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(SetSubagentPresetInputSchema);

  constructor(
    @IConfigService private readonly config: IConfigService,
    @IModelCatalog private readonly modelCatalog: IModelCatalog,
    @ISubagentPresetActivationService
    private readonly activation: ISubagentPresetActivationService,
  ) {}

  resolveExecution(args: SetSubagentPresetInput): ToolExecution {
    const invalid = validateSubagentPreset(this.config, this.modelCatalog, args.preset);
    if (invalid !== undefined) {
      return { isError: true, output: invalid };
    }
    return {
      accesses: ToolAccesses.none(),
      description: `Activating subagent preset ${args.preset}`,
      approvalRule: this.name,
      execute: (ctx) => this.execution(args, ctx),
    };
  }

  private async execution(
    args: SetSubagentPresetInput,
    { signal }: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    const result = await this.activation.activate(args.preset, signal);
    if (result.kind !== 'activated') {
      return { isError: true, output: result.message };
    }
    const routes = this.readRoutes(args.preset);
    return {
      output: JSON.stringify(
        {
          preset: args.preset,
          routes,
          main_model_changed: false,
          warning: result.warning,
        },
        null,
        2,
      ),
    };
  }

  private readRoutes(preset: string): Record<string, SubagentModelConfig> {
    const subagent = this.config.get<SubagentConfig | undefined>(SUBAGENT_SECTION);
    const routes = subagent?.presets?.[preset] ?? {};
    const compact: Record<string, SubagentModelConfig> = {};
    for (const [profile, route] of Object.entries(routes)) {
      const entry: SubagentModelConfig = {};
      if (route.model !== undefined) entry.model = route.model;
      if (route.thinkingEffort !== undefined) entry.thinkingEffort = route.thinkingEffort;
      compact[profile] = entry;
    }
    return compact;
  }
}

registerAgentToolService(ISetSubagentPresetTool, SetSubagentPresetTool, {
  name: 'SetSubagentPreset',
  domain: 'subagent',
  when: (accessor) => accessor.get(IAgentScopeContext).agentId === 'main',
});