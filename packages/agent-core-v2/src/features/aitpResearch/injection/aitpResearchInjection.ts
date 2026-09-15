/**
 * `aitpResearch` domain — brief local knowledge and research memory guidance.
 *
 * Reconciles through contextInjector and reads only the mode toggle. Reuses
 * the old injection variant to supersede stale execution instructions after
 * cold restore, compaction, or exit. No research executor or turn lease.
 */

import { Service } from '#/_base/di/service';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { systemReminderContent } from '#/agent/systemReminder/systemReminder';
import { IAgentAitpModeService } from '../mode/agentAitpMode';
import type { IAitpResearchInjection } from './aitpResearchInjectionContract';

const RETIRED = 'Earlier Research phase, Begin/Conclude, checkpoint, loop, and Goal-alignment instructions are retired. Ordinary tools need no Research action; normal Goal, Plan, approvals, and path permissions still apply.';
const ENABLED = [
  'Research Mode: local knowledge + research long-term memory.',
  'Read the project entry points and existing knowledge first, using ordinary file tools. Use official AITP Skills and their CLI fallback to recover relevant evidence and decisions; the Skill owns CLI version and path resolution.',
  'Save only genuinely new knowledge or meaningful progress, decisions, failures, and corrections, with sources and necessary links to current knowledge. No delta means no write. Do not force an Entry → Note → card pipeline, scan the whole workspace, or start background maintenance.',
  RETIRED,
].join('\n');
const DISABLED = `Research Mode is off. ${RETIRED}`;

export class AitpResearchInjection extends Service implements IAitpResearchInjection {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IAgentContextInjectorService injector: IAgentContextInjectorService,
    @IAgentAitpModeService mode: IAgentAitpModeService,
  ) {
    super();
    this._register(injector.register('aitp_research', async (context) => {
      const previous = context.lastInjection === undefined
        ? undefined : systemReminderContent(context.lastInjection);
      const snapshot = await mode.getSnapshot();
      const content = snapshot.enabled
        ? `${ENABLED}${snapshot.skillsAvailable ? '' : '\nOfficial AITP Skills are unavailable. Install or enable the official plugin before using research memory; CLI health has not been checked.'}`
        : DISABLED;
      if (!snapshot.enabled && previous === undefined) return undefined;
      if (previous === content) return undefined;
      return { content };
    }));
  }
}
