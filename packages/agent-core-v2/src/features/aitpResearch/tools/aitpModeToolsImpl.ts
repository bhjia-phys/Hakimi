/**
 * `aitpResearch` domain — `EnterAITPModeTool` / `ExitAITPModeTool` implementations.
 *
 * `EnterAITPMode` checks main-agent-only, then delegates to
 * `IAgentAitpModeService.enter`; its interaction posture is decided by the
 * normal permission-policy chain. Research Mode is a long-lived scientific
 * context and may nest under an active Plan overlay. `ExitAITPMode` delegates
 * to `IAgentAitpModeService.exit`. Bound at Agent scope.
 */

import type { ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';

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
  'Research Mode is a long-lived scientific context; a Plan overlay may be entered later without exiting it.',
  '',
  'Call this tool before any research, repository inspection, literature search, or direct .aitp access when the user explicitly asks to enter Research Mode, start an AITP-backed research session, or focus the session on a research line.',
  'Do not simulate Research Mode by reading .aitp files directly while the mode is inactive.',
  '',
  'Parameters:',
  '  line_slug (optional): The local Research Line to activate. It is never inferred to be an AITP workstream; confirm that binding separately.',
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
    @IAgentScopeContext private readonly scopeCtx: IAgentScopeContext,
  ) {}

  resolveExecution(args: EnterAITPModeInput): ToolExecution {
    return {
      description: 'Requesting to enter AITP Research Mode',
      approvalRule: this.name,
      execute: async () => {
        if (this.scopeCtx.agentId !== MAIN_AGENT_ID) {
          return {
            isError: true,
            output: 'AITP Research Mode is only available on the main agent.',
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
