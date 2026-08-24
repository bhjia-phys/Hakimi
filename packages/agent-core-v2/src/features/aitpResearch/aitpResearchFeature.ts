/**
 * `aitpResearch` domain — `AitpResearchFeature`: the AITP Research Mode
 * capability assembled as one App-scope Feature unit.
 *
 * Contributes the per-Agent `IAgentAitpModeService` and `IAgentResearchService`,
 * the Session-scope `ISessionAitpAdapter`, the mode/Research/AITP adapter
 * tools through the `features` base-class seams, and the AITP skill
 * visibility filter. The `aitp_research_mode` flag (`features/aitpResearch/flag`)
 * and the `aitpResearch.*` / `research.*` wire vocabulary
 * (`features/aitpResearch/aitpResearchOps`) stay on their static
 * import=register channels. `EnterAITPMode` is permanently registered but
 * flag-gated through its `when` predicate; all other tools are active-only
 * (their `when` checks `mode.isActive`). Registered into the feature table at
 * import.
 */

import { Feature } from '#/features/feature';
import { registerFeature } from '#/features/featureRegistry';
import { LifecycleScope } from '#/app/scopes';
import { IFlagService } from '#/app/flag/flag';
import type { ServicesAccessor } from '#/_base/di/instantiation';
import { SkillVisibilityContribution } from '#/agent/skillVisibility/skillVisibility';

import './flag';
import { ISessionAitpAdapter } from './adapter/sessionAitpAdapter';
import { SessionAitpAdapterService } from './adapter/sessionAitpAdapterService';
import { IAgentAitpModeService } from './mode/agentAitpMode';
import { AgentAitpModeService } from './mode/agentAitpModeService';
import { IAgentResearchService } from './research/agentResearch';
import { AgentResearchService } from './research/agentResearchService';
import { AitpResearchInjection } from './injection/aitpResearchInjection';
import { IAitpResearchInjection } from './injection/aitpResearchInjectionContract';

import {
  IEnterAITPModeTool,
  IExitAITPModeTool,
} from './tools/aitpModeTools';
import { EnterAITPModeTool, ExitAITPModeTool } from './tools/aitpModeToolsImpl';
import {
  ICommitResearchCheckpointTool,
  ICreateResearchLineTool,
  ICreateResearchQuestionTool,
  IGetResearchStatusTool,
  IProposeResearchCheckpointTool,
  ISetResearchFocusTool,
  IUpdateResearchLineTool,
  IUpdateResearchQuestionTool,
} from './tools/researchTools';
import {
  CommitResearchCheckpointTool,
  CreateResearchLineTool,
  CreateResearchQuestionTool,
  GetResearchStatusTool,
  ProposeResearchCheckpointTool,
  SetResearchFocusTool,
  UpdateResearchLineTool,
  UpdateResearchQuestionTool,
} from './tools/researchToolsImpl';
import {
  IAitpCheckTool,
  IAitpEnterTool,
  IAitpListTool,
  IAitpNotePrepareTool,
  IAitpNoteSaveTool,
  IAitpRecordPrepareTool,
  IAitpRecordSaveTool,
  IAitpShowTool,
  AitpCheckTool,
  AitpEnterTool,
  AitpListTool,
  AitpNotePrepareTool,
  AitpNoteSaveTool,
  AitpRecordPrepareTool,
  AitpRecordSaveTool,
  AitpShowTool,
} from './tools/aitpAdapterTools';

const AITP_PLUGIN_ID = 'aitp-research-protocol';

function isAitpResearchModeEnabled(accessor: ServicesAccessor): boolean {
  return accessor.get(IFlagService).enabled('aitp_research_mode');
}

function isAitpModeActive(accessor: ServicesAccessor): boolean {
  return accessor.get(IAgentAitpModeService).isActive;
}

export class AitpResearchFeature extends Feature {
  static override readonly name = 'aitpResearch';

  constructor() {
    super();

    this.contributeService(LifecycleScope.Session, ISessionAitpAdapter, SessionAitpAdapterService);

    this.contributeAgentService(IAgentAitpModeService, AgentAitpModeService);
    this.contributeAgentService(IAgentResearchService, AgentResearchService);

    this.contributeAgentService(IAitpResearchInjection, AitpResearchInjection);

    this.contributeTool(IEnterAITPModeTool, EnterAITPModeTool, {
      name: 'EnterAITPMode',
      domain: 'aitpResearch',
      when: (accessor) => isAitpResearchModeEnabled(accessor),
    });

    this.contributeTool(IExitAITPModeTool, ExitAITPModeTool, {
      name: 'ExitAITPMode',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IGetResearchStatusTool, GetResearchStatusTool, {
      name: 'GetResearchStatus',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(ICreateResearchLineTool, CreateResearchLineTool, {
      name: 'CreateResearchLine',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(ICreateResearchQuestionTool, CreateResearchQuestionTool, {
      name: 'CreateResearchQuestion',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IUpdateResearchLineTool, UpdateResearchLineTool, {
      name: 'UpdateResearchLine',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IUpdateResearchQuestionTool, UpdateResearchQuestionTool, {
      name: 'UpdateResearchQuestion',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(ISetResearchFocusTool, SetResearchFocusTool, {
      name: 'SetResearchFocus',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IProposeResearchCheckpointTool, ProposeResearchCheckpointTool, {
      name: 'ProposeResearchCheckpoint',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(ICommitResearchCheckpointTool, CommitResearchCheckpointTool, {
      name: 'CommitResearchCheckpoint',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });

    this.contributeTool(IAitpEnterTool, AitpEnterTool, {
      name: 'aitp_enter',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IAitpListTool, AitpListTool, {
      name: 'aitp_list',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IAitpShowTool, AitpShowTool, {
      name: 'aitp_show',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IAitpCheckTool, AitpCheckTool, {
      name: 'aitp_check',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IAitpRecordPrepareTool, AitpRecordPrepareTool, {
      name: 'aitp_record_prepare',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IAitpRecordSaveTool, AitpRecordSaveTool, {
      name: 'aitp_record_save',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IAitpNotePrepareTool, AitpNotePrepareTool, {
      name: 'aitp_note_prepare',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IAitpNoteSaveTool, AitpNoteSaveTool, {
      name: 'aitp_note_save',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });

    this.contribute(SkillVisibilityContribution, {
      id: 'aitpResearch',
      isVisible(skill, accessor) {
        if (skill.plugin?.id === AITP_PLUGIN_ID) {
          return accessor.get(IAgentAitpModeService).isActive;
        }
        return true;
      },
      describeHidden(skill, accessor) {
        if (skill.plugin?.id === AITP_PLUGIN_ID && !accessor.get(IAgentAitpModeService).isActive) {
          return 'AITP Research Mode is not active. Call EnterAITPMode first.';
        }
        return undefined;
      },
    });
  }
}

registerFeature(AitpResearchFeature);
