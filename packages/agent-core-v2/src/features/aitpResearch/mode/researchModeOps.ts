/**
 * `aitpResearch` domain — the persisted Research memory-mode toggle.
 *
 * Stores only enabled, independently of the retired Research state machine.
 * An absent toggle permits a read-only interpretation of old mode history.
 */

import { z } from 'zod';
import { defineModel } from '#/wire/model';
import type { ResearchModeSnapshot } from './agentAitpMode';

export const ResearchModeModel = defineModel<{ readonly enabled: boolean | null }>(
  'researchMode',
  () => ({ enabled: null }),
);

export const researchModeSetEnabled = ResearchModeModel.defineOp('research_mode.set_enabled', {
  schema: z.object({ enabled: z.boolean() }).strict(),
  apply: (_state, payload) => ({ enabled: payload.enabled }),
});

declare module '#/wire/types' {
  interface PersistedOpMap {
    'research_mode.set_enabled': typeof researchModeSetEnabled;
  }
}

declare module '#/app/event/eventBus' {
  interface DomainEventMap {
    'research_mode.updated': { readonly snapshot: ResearchModeSnapshot };
  }
}
