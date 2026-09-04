/**
 * `aitpResearch` domain — bounded post-commit distillation handoff implementation.
 *
 * Resolves the exact AITP plugin Skill through `sessionSkillCatalog`, applies
 * the existing model-invocation gates through `skillVisibility`, records the
 * activation through `agentSkill`, and returns one same-turn steer for only
 * the touched Entry. It also records one monotonic, non-checkpointed receipt
 * for the latest committed cursor so public Research snapshots can distinguish
 * a requested review from an unavailable handoff. The receipt is observational
 * only: it owns no scheduler, retry, trigger, Method-card, or decision state.
 * Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import { IAgentSkillService } from '#/agent/skill/skill';
import { IAgentSkillVisibilityService } from '#/agent/skillVisibility/skillVisibility';
import { executeResolvedModelSkill } from '#/agent/tools/skill/skillTool';
import { ISessionContext } from '#/session/sessionContext/sessionContext';
import { ISessionSkillCatalog } from '#/session/sessionSkillCatalog/skillCatalog';
import { IWireService } from '#/wire/wire';
import {
  ResearchCursorModel,
  researchRecordDistillationAttention,
} from '#/features/aitpResearch/aitpResearchOps';

import {
  IAitpDistillationHandoffService,
  type DistillationHandoffInput,
  type DistillationHandoffResult,
} from './distillationHandoff';

const AITP_PLUGIN_ID = 'aitp-research-protocol';
const DISTILLING_METHODS_SKILL = 'distilling-methods';

export class AitpDistillationHandoffService
  extends Service
  implements IAitpDistillationHandoffService
{
  declare readonly _serviceBrand: undefined;

  constructor(
    @ISessionSkillCatalog private readonly skillCatalog: ISessionSkillCatalog,
    @IAgentSkillService private readonly skill: IAgentSkillService,
    @IAgentSkillVisibilityService private readonly visibility: IAgentSkillVisibilityService,
    @ISessionContext private readonly sessionContext: ISessionContext,
    @IWireService private readonly wire: IWireService,
  ) {
    super();
  }

  async prepare(input: DistillationHandoffInput): Promise<DistillationHandoffResult> {
    try {
      await this.skillCatalog.ready;
      const skill = this.skillCatalog.catalog.getPluginSkill(
        AITP_PLUGIN_ID,
        DISTILLING_METHODS_SKILL,
      );
      if (skill === undefined) {
        return this.finish(input, {
          status: 'unavailable',
          reason: 'The external AITP distilling-methods Skill is unavailable.',
        });
      }
      const result = await executeResolvedModelSkill(
        this.skillCatalog,
        this.skill,
        this.visibility,
        skill,
        renderBoundedReviewArgs(input),
        0,
        this.sessionContext.sessionId,
      );
      if (result.isError === true || result.delivery === undefined) {
        return this.finish(input, {
          status: 'unavailable',
          reason: 'The external AITP distilling-methods Skill could not be loaded.',
        });
      }
      return this.finish(input, { status: 'scheduled', delivery: result.delivery });
    } catch {
      return this.finish(input, {
        status: 'unavailable',
        reason: 'The external AITP distilling-methods Skill handoff failed.',
      });
    }
  }

  private finish(
    input: DistillationHandoffInput,
    result: DistillationHandoffResult,
  ): DistillationHandoffResult {
    try {
      const committed = this.wire.getModel(ResearchCursorModel);
      if (
        committed.revision < 1
        || committed.cursor?.checkpointId !== input.checkpointId
        || committed.cursor.entryId !== input.entryId
      ) return result;
      const common = {
        checkpointId: input.checkpointId,
        entryId: input.entryId,
        recordedAt: Date.now(),
        commitRevision: committed.revision,
      };
      this.wire.dispatch(researchRecordDistillationAttention(
        result.status === 'scheduled'
          ? { ...common, status: 'review_requested' }
          : { ...common, status: 'handoff_unavailable', reason: result.reason },
      ));
    } catch {
      // Observability must never turn a successful commit or Skill handoff into
      // a failure. A missing receipt remains an explicit best-effort limit.
    }
    return result;
  }
}

function renderBoundedReviewArgs(input: DistillationHandoffInput): string {
  return [
    `Review only the newly committed AITP Entry ${input.entryId}`,
    `from Hakimi checkpoint ${input.checkpointId}.`,
    'Treat this as one bounded best-effort review of touched evidence.',
    'Apply the Skill triggers and provenance rules exactly; no eligible trigger is a no-op.',
  ].join(' ');
}
