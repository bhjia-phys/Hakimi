/**
 * `aitpResearch` domain — `EnterAITPModeTool` / `ExitAITPModeTool` implementations.
 *
 * `EnterAITPMode` checks the flag, main-agent-only, and Plan conflict, then
 * delegates to `IAgentAitpModeService.enter`. In `auto` permission mode the
 * entry is auto-approved; other postures defer to a cold `waitUntil` review.
 * `ExitAITPMode` delegates to `IAgentAitpModeService.exit`. Bound at Agent
 * scope.
 */

import type { ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
import { IAgentToolApprovalService } from '#/agent/toolApproval/toolApproval';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentPlanService } from '#/features/plan/plan';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { IFlagService } from '#/app/flag/flag';

import {
  IEnterAITPModeTool,
  IExitAITPModeTool,
  EnterAITPModeInputSchema,
  ExitAITPModeInputSchema,
  type EnterAITPModeInput,
  type ExitAITPModeInput,
} from './aitpModeTools';

const ENTER_DESCRIPTION = [
  'Enter AITP Research Mode — a joint research capability backed by the AITP evidence ledger.',
  'When active, Research tools and AITP adapter tools become available.',
  'Plan mode and Research Mode are mutually exclusive.',
  '',
  'Call this tool before any research, repository inspection, literature search, or direct .aitp access when the user explicitly asks to enter Research Mode, start an AITP-backed research session, or focus the session on a research line.',
  'Do not simulate Research Mode by reading .aitp files directly while the mode is inactive.',
  '',
  'Parameters:',
  '  line_slug (optional): The research line (workstream) to activate.',
].join('\n');

const EXIT_DESCRIPTION = [
  'Exit AITP Research Mode.',
  'Withdraws AITP tools and Research activation; does not delete already-saved AITP records.',
].join('\n');

export class EnterAITPModeTool implements IEnterAITPModeTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'EnterAITPMode' as const;
  readonly description: string = ENTER_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(EnterAITPModeInputSchema);

  constructor(
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentPermissionModeService private readonly modeService: IAgentPermissionModeService,
    @IAgentToolApprovalService private readonly toolApproval: IAgentToolApprovalService,
    @IAgentScopeContext private readonly scopeCtx: IAgentScopeContext,
    @IFlagService private readonly flags: IFlagService,
    @IAgentPlanService private readonly planService: IAgentPlanService,
  ) {}

  resolveExecution(args: EnterAITPModeInput): ToolExecution {
    return {
      description: 'Requesting to enter AITP Research Mode',
      approvalRule: this.name,
      execute: async () => {
        if (!this.flags.enabled('aitp_research_mode')) {
          return {
            isError: true,
            output: 'AITP Research Mode is not enabled. Set KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE=true.',
          };
        }
        if (this.scopeCtx.agentId !== MAIN_AGENT_ID) {
          return {
            isError: true,
            output: 'AITP Research Mode is only available on the main agent.',
          };
        }
        const planStatus = await this.planService.status();
        if (planStatus !== null) {
          return {
            isError: true,
            output: 'Plan mode is active. Exit Plan mode before entering AITP Research Mode.',
          };
        }
        if (this.mode.isActive) {
          return {
            isError: true,
            output: 'AITP Research Mode is already active. Use ExitAITPMode to exit.',
          };
        }

        try {
          await this.mode.enter({ actor: 'model', lineSlug: args.line_slug });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to enter AITP Research Mode.';
          return { isError: true, output: `Failed to enter AITP Research Mode: ${message}` };
        }

        return {
          output: [
            'AITP Research Mode is now active.',
            '',
            'Your workflow:',
            '1. Use GetResearchStatus to review the current research state.',
            '2. Create or update research questions with CreateResearchQuestion / UpdateResearchQuestion.',
            '3. Set the current focus with SetResearchFocus.',
            '4. Use aitp_list / aitp_show / aitp_check to inspect the AITP evidence ledger.',
            '5. At durable boundaries, propose and commit checkpoints.',
            '',
            'Do NOT write AITP canonical files directly. Use aitp_record_prepare/save and aitp_note_prepare/save.',
          ].join('\n'),
        };
      },
    };
  }
}

export class ExitAITPModeTool implements IExitAITPModeTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ExitAITPMode' as const;
  readonly description: string = EXIT_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ExitAITPModeInputSchema);

  constructor(@IAgentAitpModeService private readonly mode: IAgentAitpModeService) {}

  resolveExecution(_args: ExitAITPModeInput): ToolExecution {
    return {
      description: 'Exiting AITP Research Mode',
      approvalRule: this.name,
      execute: async () => {
        if (!this.mode.isActive) {
          return { isError: true, output: 'AITP Research Mode is not active.' };
        }
        await this.mode.exit();
        return { output: 'AITP Research Mode exited. AITP tools and Research Board are now hidden.' };
      },
    };
  }
}
