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
