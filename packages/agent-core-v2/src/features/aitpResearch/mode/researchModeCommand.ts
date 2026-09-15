/**
 * `aitpResearch` domain — shared edge dispatch for the Research toggle.
 * All historical execution commands fail explicitly without resolving the
 * retired Research service or modifying its records.
 */

import type { IAgentAitpModeService, ResearchModeSnapshot } from './agentAitpMode';
import { retiredResearchOperation } from './retiredResearch';

export async function dispatchResearchModeCommand(
  mode: IAgentAitpModeService,
  command: { readonly kind: string; readonly actor?: 'user' | 'model'; readonly lineSlug?: string },
): Promise<ResearchModeSnapshot> {
  switch (command.kind) {
    case 'enter_mode':
      await mode.enter({ actor: command.actor ?? 'user', lineSlug: command.lineSlug });
      break;
    case 'exit_mode':
      await mode.exit();
      break;
    default:
      retiredResearchOperation();
  }
  return mode.getSnapshot();
}
