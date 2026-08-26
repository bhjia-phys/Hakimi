/**
 * `aitpResearch` domain — `AitpResearchFeature`: the AITP Research Mode
 * capability assembled as one App-scope Feature unit.
 *
 * Contributes the per-Agent `IAgentAitpModeService` and `IAgentResearchService`,
 * the per-Agent `IResearchLoopCoordinator` (minimal turn-lifecycle coordinator),
 * the Session-scope `ISessionAitpAdapter` and current-state maintenance
 * coordinator, the mode/Research/AITP adapter
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
import { ISessionAitpLifecycleCoordinator } from './coordinator/sessionAitpLifecycleCoordinator';
import { SessionAitpLifecycleCoordinatorService } from './coordinator/sessionAitpLifecycleCoordinatorService';
import { IAgentAitpModeService } from './mode/agentAitpMode';
import { AgentAitpModeService } from './mode/agentAitpModeService';
import { IAgentResearchService } from './research/agentResearch';
import { AgentResearchService } from './research/agentResearchService';
import { AitpResearchInjection } from './injection/aitpResearchInjection';
import { IAitpResearchInjection } from './injection/aitpResearchInjectionContract';
import { IResearchLoopCoordinator, ResearchLoopCoordinator } from './loop/researchLoopCoordinator';

import {
  IEnterAITPModeTool,
  IExitAITPModeTool,
} from './tools/aitpModeTools';
import { EnterAITPModeTool, ExitAITPModeTool } from './tools/aitpModeToolsImpl';
import {
  ICommitResearchCheckpointTool,
  ICompleteResearchActionTool,
  ICreateResearchLineTool,
  ICreateResearchQuestionTool,
  IGetResearchStatusTool,
  IAcknowledgeResearchAlertTool,
  IPlanResearchActionTool,
  IProposeResearchCheckpointTool,
  IRecordResearchProgressTool,
  IRequestResearchDecisionTool,
  IResolveResearchDecisionTool,
  ISetResearchFocusTool,
  ISetResearchPhaseTool,
  IStartResearchActionTool,
  IUpdateResearchLineTool,
  IUpdateResearchQuestionTool,
} from './tools/researchTools';
import {
  CommitResearchCheckpointTool,
  CompleteResearchActionTool,
  CreateResearchLineTool,
  CreateResearchQuestionTool,
  GetResearchStatusTool,
  AcknowledgeResearchAlertTool,
  PlanResearchActionTool,
  ProposeResearchCheckpointTool,
  RecordResearchProgressTool,
  RequestResearchDecisionTool,
  ResolveResearchDecisionTool,
  SetResearchFocusTool,
  SetResearchPhaseTool,
  StartResearchActionTool,
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
    this.contributeService(
      LifecycleScope.Session,
      ISessionAitpLifecycleCoordinator,
      SessionAitpLifecycleCoordinatorService,
    );

    this.contributeAgentService(IAgentAitpModeService, AgentAitpModeService);
    this.contributeAgentService(IAgentResearchService, AgentResearchService);

    this.contributeAgentService(IAitpResearchInjection, AitpResearchInjection);
    this.contributeAgentService(IResearchLoopCoordinator, ResearchLoopCoordinator);

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
    this.contributeTool(IAcknowledgeResearchAlertTool, AcknowledgeResearchAlertTool, {
      name: 'AcknowledgeResearchAlert',
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
    this.contributeTool(ISetResearchPhaseTool, SetResearchPhaseTool, {
      name: 'SetResearchPhase',
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
    this.contributeTool(IPlanResearchActionTool, PlanResearchActionTool, {
      name: 'PlanResearchAction',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IStartResearchActionTool, StartResearchActionTool, {
      name: 'StartResearchAction',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(ICompleteResearchActionTool, CompleteResearchActionTool, {
      name: 'CompleteResearchAction',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IRecordResearchProgressTool, RecordResearchProgressTool, {
      name: 'RecordResearchProgress',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IRequestResearchDecisionTool, RequestResearchDecisionTool, {
      name: 'RequestResearchDecision',
      domain: 'aitpResearch',
      when: isAitpModeActive,
    });
    this.contributeTool(IResolveResearchDecisionTool, ResolveResearchDecisionTool, {
      name: 'ResolveResearchDecision',
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
