/**
 * `tools` domain — `ISetSubagentPresetTool` implementation (the
 * `SetSubagentPreset` tool).
 *
 * Activates a configured `[subagent]` routing preset: validates that the
 * preset exists, that its name is non-empty, and that every route model alias
 * resolves through `IModelCatalog`, then persists the active preset through
 * `IConfigService.set(SUBAGENT_SECTION, { preset })`. Validation runs again
 * immediately before and after the write so a concurrent config change cannot
 * silently apply a preset that was deleted or whose route models were broken
 * (TOCTOU guard). Print/headless mode overlays the whole subagent section in
 * `ConfigTarget.Memory` (`applyPrintModeConfigDefaults`), so when a memory
 * overlay exists the same `{ preset }` patch is applied there too — only the
 * preset key, never clobbering overlaid values such as the timeout — and the
 * effective (overlay-merged) preset is verified to equal the request. The
 * next `Agent` / `AgentSwarm` spawn reads the routing live, so no session
 * reload is needed. Never touches the main or default model, global thinking,
 * or the TUI preset manager; the result reports `main_model_changed: false`.
 * Registered for the main agent only, mirroring v1's `agent.type === 'main'`
 * gate. Bound at Agent scope.
 */

import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { ConfigTarget, IConfigService } from '#/app/config/config';
import { IModelCatalog } from '#/kosong/model/catalog';
import {
  SUBAGENT_SECTION,
  type SubagentConfig,
  type SubagentModelConfig,
} from '#/session/subagent/configSection';
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
  ) {}

  resolveExecution(args: SetSubagentPresetInput): ToolExecution {
    const invalid = this.validatePreset(args.preset);
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

  private validatePreset(preset: string): string | undefined {
    const subagent = this.config.get<SubagentConfig | undefined>(SUBAGENT_SECTION);
    const presets = subagent?.presets ?? {};
    if (Object.keys(presets).length === 0) {
      return 'No [subagent].presets are configured.';
    }
    if (!Object.hasOwn(presets, preset)) {
      return `Invalid subagent preset "${preset}". Available presets: ${Object.keys(presets).join(', ')}.`;
    }
    const routes = presets[preset]!;
    for (const [profile, route] of Object.entries(routes)) {
      if (route.model === undefined) continue;
      try {
        this.modelCatalog.get(route.model);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return `Subagent preset "${preset}" route "${profile}" model "${route.model}" could not be resolved: ${reason}`;
      }
    }
    return undefined;
  }

  private async execution(
    args: SetSubagentPresetInput,
    { signal }: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    if (signal.aborted) return { isError: true, output: 'Preset activation cancelled.' };
    // TOCTOU guard: the effective config may have changed since validation in
    // resolveExecution — re-validate against the live state before writing.
    const preInvalid = this.validatePreset(args.preset);
    if (preInvalid !== undefined) {
      return { isError: true, output: preInvalid };
    }
    try {
      await this.config.set(SUBAGENT_SECTION, { preset: args.preset }, ConfigTarget.User);
      if (this.config.inspect<SubagentConfig>(SUBAGENT_SECTION).memoryValue !== undefined) {
        await this.config.set(SUBAGENT_SECTION, { preset: args.preset }, ConfigTarget.Memory);
      }
    } catch {
      if (signal.aborted) return { isError: true, output: 'Preset activation cancelled.' };
      return { isError: true, output: 'Failed to activate subagent preset.' };
    }
    if (signal.aborted) return { isError: true, output: 'Preset activation cancelled.' };
    // Post-write verification: the effective (overlay-merged) config must
    // still carry a valid preset of the requested name.
    const postInvalid = this.validatePreset(args.preset);
    if (postInvalid !== undefined) {
      return { isError: true, output: postInvalid };
    }
    if (this.config.get<SubagentConfig | undefined>(SUBAGENT_SECTION)?.preset !== args.preset) {
      return { isError: true, output: 'Subagent preset activation was not applied.' };
    }
    const routes = this.readRoutes(args.preset);
    return {
      output: JSON.stringify(
        { preset: args.preset, routes, main_model_changed: false },
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