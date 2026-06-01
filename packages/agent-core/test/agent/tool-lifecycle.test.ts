import type { ToolCall } from '@moonshot-ai/kosong';
import { describe, expect, it } from 'vitest';

import { createCommandKaos, testAgent } from './harness/agent';

describe('primitive tool lifecycle records', () => {
  it('records started and completed audit events around real tool execution', async () => {
    const bashCall: ToolCall = {
      type: 'function',
      id: 'call_bash',
      name: 'Bash',
      arguments: '{"command":"printf lifecycle-result","timeout":60}',
    };
    const ctx = testAgent({ kaos: createCommandKaos('lifecycle-result') });
    ctx.configure({ tools: ['Bash'] });
    ctx.agent.workFrames.open(
      {
        id: 'frame.librpa',
        domain: 'librpa',
        topic: 'head-wing',
        goal: 'Trace primitive tool attribution.',
      },
      { source: 'controller' },
    );
    ctx.agent.researchAction.startActionCall(
      {
        actionId: 'code.map_formula_to_code_region',
        callId: 'call.map-head-wing',
      },
      { source: 'controller' },
    );

    ctx.mockNextResponse({ type: 'text', text: 'I will run Bash.' }, bashCall);
    await ctx.rpc.prompt({
      input: [{ type: 'text', text: 'Run the lifecycle smoke command' }],
    });
    await ctx.untilApproval(true);

    ctx.mockNextResponse({ type: 'text', text: 'Done.' });
    await ctx.untilTurnEnd();

    const started = findWireEvent(ctx.allEvents, 'tool_lifecycle.started');
    const completed = findWireEvent(ctx.allEvents, 'tool_lifecycle.completed');

    expect(started).toMatchObject({
      source: 'loop',
      turnId: 0,
      step: 1,
      toolCallId: 'call_bash',
      toolName: 'Bash',
      cwd: process.cwd(),
      argsSummary: '{"command":"printf lifecycle-result","timeout":60}',
      description: 'Running: printf lifecycle-result',
      workFrameId: 'frame.librpa',
      actionCallId: 'call.map-head-wing',
      startedAt: expect.any(Number),
      time: expect.any(Number),
    });
    expect(completed).toMatchObject({
      source: 'loop',
      turnId: 0,
      step: 1,
      toolCallId: 'call_bash',
      toolName: 'Bash',
      cwd: process.cwd(),
      status: 'passed',
      isError: false,
      outputKind: 'text',
      outputSummary: 'lifecycle-result',
      durationMs: expect.any(Number),
      workFrameId: 'frame.librpa',
      actionCallId: 'call.map-head-wing',
      completedAt: expect.any(Number),
      artifactRefs: [],
      time: expect.any(Number),
    });
    expect(ctx.agent.toolLifecycle.listRecent()).toHaveLength(1);
    expect(ctx.agent.toolLifecycle.listRecent()[0]?.completed.toolCallId).toBe('call_bash');
  });
});

function findWireEvent(
  events: readonly { readonly type: string; readonly event: string; readonly args: unknown }[],
  name: string,
): unknown {
  return events.find((event) => event.type === '[wire]' && event.event === name)?.args;
}
