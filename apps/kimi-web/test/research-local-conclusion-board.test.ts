import { describe, expect, it } from 'vitest';
import type { ResearchStatusSnapshot } from '../src/api/types';
import { buildResearchBoardCompactSlots } from '../src/lib/researchBoardPresentation';
import { localConclusion } from './fixtures/local-conclusion';

function snapshot(): ResearchStatusSnapshot {
  return {
    mode: 'ready', loopStatus: 'active', planningPolicy: 'collaborative',
    phase: 'state_updated', revision: 8, questions: [], lines: [],
    lineWorkstreamBindings: [], alerts: [], openQuestionCount: 0,
    activeQuestionCount: 0, blockedQuestionCount: 0, aitpHealth: { phase: 'ready' },
    localConclusion, currentAction: localConclusion.action,
    latestProgress: localConclusion.progress,
  };
}

describe('retained local conclusion Board', () => {
  it('shows the result, terminal action, ownership next step and no false AITP commit', () => {
    const slots = buildResearchBoardCompactSlots(snapshot());
    expect(slots).toHaveLength(4);
    expect(slots.find((slot) => slot.kind === 'cycle')).toMatchObject({
      stage: 'confirm_ownership', mode: 'ready', loopStatus: 'active',
      planningPolicy: 'collaborative', actionStatus: 'completed',
      current: { source: 'local_conclusion', text: localConclusion.progress.headline },
    });
    expect(slots.find((slot) => slot.kind === 'attention')).toMatchObject({
      source: 'local_conclusion', additionalCount: 0,
      text: expect.stringContaining('not recorded in AITP'),
    });
    expect(slots.find((slot) => slot.kind === 'next')).toMatchObject({
      source: 'aitp_maintenance', freshness: 'blocked',
      text: expect.stringContaining('Research Manager'),
      derivedFrom: { actionId: 'primitive-audit' },
    });
    expect(JSON.stringify(slots)).not.toContain('Validate a narrowly scoped correction');
  });

  it('does not present a foreign Line result as the current science', () => {
    const original = snapshot();
    const slots = buildResearchBoardCompactSlots({
      ...original, currentLineSlug: 'other', latestProgress: undefined,
      localConclusion: { ...localConclusion, action: { ...localConclusion.action, lineSlug: 'original' } },
    });
    expect(slots.find((slot) => slot.kind === 'cycle')).not.toMatchObject({
      current: { text: localConclusion.progress.headline },
    });
    expect(slots.find((slot) => slot.kind === 'next')).toMatchObject({
      freshness: 'blocked', derivedFrom: { lineSlug: 'original' },
    });
  });

  it('keeps an unresolved human decision ahead of ownership adoption', () => {
    const original = snapshot();
    const slots = buildResearchBoardCompactSlots({
      ...original,
      humanGate: { gateId: 'gate', kind: 'approval', prompt: 'Choose the physical convention', createdAt: 5 },
      effectiveNextStep: {
        text: 'Resolve the physical convention', source: 'human_gate', freshness: 'blocked',
        observedAt: 5, derivedFrom: {},
      },
    });
    expect(slots.find((slot) => slot.kind === 'attention')).toMatchObject({ source: 'human_gate' });
    expect(slots.find((slot) => slot.kind === 'next')).toMatchObject({ source: 'human_gate' });
  });
});
