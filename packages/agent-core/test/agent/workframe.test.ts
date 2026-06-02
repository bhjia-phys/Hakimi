import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { ProviderManager } from '../../src/session/provider-manager';
import { testKaos } from '../fixtures/test-kaos';

const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('WorkFrameManager', () => {
  it('opens, switches, closes, records, and restores active frames', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);

    const fqhe = agent.workFrames.open(
      {
        id: 'frame.fqhe',
        domain: 'topological-order',
        topic: 'fqhe-cs',
        goal: 'Relate Laughlin wavefunction and CS response.',
        activeObjectIds: ['formula:ab-phase'],
        sourceRefs: ['ledger:event.fqhe.source'],
      },
      { source: 'controller' },
    );
    agent.workFrames.open(
      {
        id: 'frame.librpa',
        domain: 'librpa',
        topic: 'head-wing',
        goal: 'Check head-wing code impact.',
      },
      { source: 'controller' },
    );
    agent.workFrames.switch(fqhe.id, { source: 'controller' });
    agent.workFrames.close('frame.librpa', { source: 'controller' });

    expect(agent.workFrames.active?.id).toBe('frame.fqhe');
    expect(agent.workFrames.list().map((frame) => frame.id)).toEqual(['frame.fqhe']);
    expect(records.filter((record) => record.type !== 'metadata').map((record) => record.type)).toEqual([
      'config.update',
      'workframe.opened',
      'workframe.opened',
      'workframe.switched',
      'workframe.closed',
    ]);

    const restored = makeAgent();
    for (const record of records) {
      restored.records.restore(record);
    }
    expect(restored.workFrames.active?.id).toBe('frame.fqhe');
    expect(restored.workFrames.requireFrame('frame.fqhe')).toMatchObject({
      domain: 'topological-order',
      activeObjectIds: ['formula:ab-phase'],
      sourceRefs: ['ledger:event.fqhe.source'],
    });
  });

  it('restores active ResearchAction calls around WorkFrames', () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    agent.workFrames.open(
      {
        id: 'frame.librpa',
        domain: 'librpa',
        topic: 'head-wing',
        goal: 'Check head-wing action traces.',
      },
      { source: 'controller' },
    );

    agent.researchAction.startActionCall(
      {
        actionId: 'code.map_formula_to_code_region',
        callId: 'call.map-head-wing',
        input: { formulaId: 'formula.head-wing' },
      },
      { source: 'controller' },
    );
    expect(agent.researchAction.activeActionCall).toMatchObject({
      actionId: 'code.map_formula_to_code_region',
      callId: 'call.map-head-wing',
      workFrameId: 'frame.librpa',
    });

    const restoredStarted = makeAgent();
    for (const record of records) {
      restoredStarted.records.restore(record);
    }
    expect(restoredStarted.researchAction.activeActionCall?.callId).toBe('call.map-head-wing');

    agent.researchAction.finishActionCall(
      {
        actionId: 'code.map_formula_to_code_region',
        callId: 'call.map-head-wing',
        outcome: 'pass',
        ledgerEventIds: ['event.librpa.mapping'],
        primitiveToolCallIds: ['tool_call_read_mapping'],
      },
      { source: 'controller' },
    );
    expect(agent.researchAction.activeActionCall).toBeUndefined();

    const restoredFinished = makeAgent();
    for (const record of records) {
      restoredFinished.records.restore(record);
    }
    expect(restoredFinished.researchAction.activeActionCall).toBeUndefined();
  });

  it('switches the active WorkFrame by prompt-sensitive context injection', async () => {
    const agent = makeAgent();
    agent.workFrames.open(
      {
        id: 'frame.fqhe',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-cs-effective-theory',
        goal: 'Relate Laughlin wavefunction and CS response.',
      },
      { source: 'controller' },
    );
    agent.workFrames.open(
      {
        id: 'frame.librpa',
        domain: 'librpa',
        topic: 'head-wing',
        goal: 'Check LibRPA head-wing code impact.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text: 'I need to inspect the Librpa head-wing change and its code impact.',
      },
    ]);
    await agent.injection.inject();
    expect(agent.workFrames.active?.id).toBe('frame.librpa');

    agent.context.appendUserMessage([
      {
        type: 'text',
        text: 'Now switch back to the FQHE Chern-Simons wavefunction question.',
      },
    ]);
    await agent.injection.inject();
    expect(agent.workFrames.active?.id).toBe('frame.fqhe');
  });
});

function makeAgent(records?: AgentRecord[]): Agent {
  const agent = new Agent({
    kaos: testKaos,
    rpc: {
      emitEvent: vi.fn(),
      requestApproval: vi.fn(),
      requestQuestion: vi.fn(),
      toolCall: vi.fn(),
    },
    persistence:
      records === undefined
        ? undefined
        : new InMemoryAgentRecordPersistence([], {
            onRecord: (record) => records.push(record),
          }),
    modelProvider: new ProviderManager({
      config: {
        providers: {
          test: {
            type: MOCK_PROVIDER.type,
            apiKey: MOCK_PROVIDER.apiKey,
          },
        },
        models: {
          [MOCK_PROVIDER.model]: {
            provider: 'test',
            model: MOCK_PROVIDER.model,
            maxContextSize: 1_000_000,
          },
        },
      },
    }),
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  return agent;
}
