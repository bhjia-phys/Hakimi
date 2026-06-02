import { describe, expect, it } from 'vitest';

import type { ResearchObligation } from '../../src/research-action';
import { testAgent } from './harness/agent';

describe('final gate lifecycle integration', () => {
  it('continues the turn with a concise final-gate correction when blocking checks remain open', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.workFrames.open(
      {
        id: 'frame.fqhe',
        domain: 'topological-order',
        topic: 'fqhe-cs-effective-theory',
        goal: 'Check flux convention before final claim.',
        trustState: 'checking',
        openObligationIds: ['obl.flux-convention'],
      },
      { source: 'controller' },
    );
    ctx.agent.researchAction.registerObligations([blockingObligation()]);

    ctx.mockNextResponse({ type: 'text', text: 'Everything is solved.' });
    ctx.mockNextResponse({
      type: 'text',
      text: 'Status: provisional. Flux convention still needs to be checked.',
    });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Can we conclude now?' }] });
    await ctx.untilTurnEnd();

    expect(ctx.llmCalls).toHaveLength(2);
    expect(ctx.llmCalls[1]?.history).toContainEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: expect.stringContaining('status="provisional"'),
        },
      ],
      toolCalls: [],
    });
    expect(ctx.llmCalls[1]?.history).toContainEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: expect.stringContaining('validate.check_convention'),
        },
      ],
      toolCalls: [],
    });
    expect(ctx.agent.context.data().history).toContainEqual(
      expect.objectContaining({
        role: 'user',
        origin: { kind: 'system_trigger', name: 'final_gate' },
      }),
    );
  });

  it('keeps lightweight turns natural when no final-gate conditions apply', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.mockNextResponse({ type: 'text', text: 'A simple answer.' });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'What is a wavefunction?' }] });
    await ctx.untilTurnEnd();

    expect(ctx.llmCalls).toHaveLength(1);
    expect(
      ctx.agent.context.data().history.some(
        (message) => message.origin?.kind === 'system_trigger' && message.origin.name === 'final_gate',
      ),
    ).toBe(false);
  });
});

function blockingObligation(): ResearchObligation {
  return {
    id: 'obl.flux-convention',
    kind: 'convention_check',
    domain: 'topological-order',
    topic: 'fqhe-cs-effective-theory',
    targetObjectId: 'formula.fqhe.flux-quantization',
    severity: 'blocking',
    reason: 'Flux convention must be checked.',
    requiredActionId: 'validate.check_convention',
    status: 'open',
  };
}
