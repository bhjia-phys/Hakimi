/**
 * `aitpResearch` domain — dynamic model-facing AITP skill listing.
 *
 * Reconciles the active AITP plugin skills through the existing context-injection
 * boundary. The profile's initial skill listing remains frozen; this fragment
 * adds the current AITP availability after entry and neutralizes a prior listing
 * after exit without rebuilding the rest of the system prompt. Bound at Agent
 * scope.
 */

import { Service } from '#/_base/di/service';
import {
  IAgentContextInjectorService,
  type ContextInjectionContext,
  type ContextInjectionResult,
} from '#/agent/contextInjector/contextInjector';
import { IAgentSkillVisibilityService } from '#/agent/skillVisibility/skillVisibility';
import { ISessionSkillCatalog } from '#/session/sessionSkillCatalog/skillCatalog';
import { systemReminderContent } from '#/agent/systemReminder/systemReminder';

import { IAitpSkillVisibilityInjection } from './aitpSkillVisibilityInjectionContract';

const AITP_PLUGIN_ID = 'aitp-research-protocol';
const AITP_SKILL_VISIBILITY_VARIANT = 'aitp_skill_visibility';
const SUPERSEDES_SUFFIX =
  'This supersedes any earlier aitp_skill_visibility reminder in this session.';
const NO_ACTIVE_AITP_SKILLS =
  `There are currently no active AITP Research skills. ${SUPERSEDES_SUFFIX}`;

export class AitpSkillVisibilityInjection
  extends Service
  implements IAitpSkillVisibilityInjection
{
  declare readonly _serviceBrand: undefined;

  constructor(
    @IAgentContextInjectorService injector: IAgentContextInjectorService,
    @ISessionSkillCatalog private readonly skillCatalog: ISessionSkillCatalog,
    @IAgentSkillVisibilityService private readonly visibility: IAgentSkillVisibilityService,
  ) {
    super();
    this._register(
      injector.register(AITP_SKILL_VISIBILITY_VARIANT, (context) =>
        this.render(context),
      ),
    );
  }

  private async render(
    context: ContextInjectionContext,
  ): Promise<ContextInjectionResult | undefined> {
    await this.skillCatalog.ready;
    const listing = this.skillCatalog.catalog.getModelSkillListing((skill) =>
      skill.plugin?.id === AITP_PLUGIN_ID && this.visibility.isSkillVisible(skill),
    );
    const previous = context.lastInjection === undefined
      ? undefined
      : systemReminderContent(context.lastInjection);

    if (listing.length === 0) {
      if (previous === undefined || previous === NO_ACTIVE_AITP_SKILLS) return undefined;
      return { content: NO_ACTIVE_AITP_SKILLS };
    }
    if (previous === listing || previous === `${listing}\n\n${SUPERSEDES_SUFFIX}`) {
      return undefined;
    }
    return {
      content: previous === undefined ? listing : `${listing}\n\n${SUPERSEDES_SUFFIX}`,
    };
  }
}
