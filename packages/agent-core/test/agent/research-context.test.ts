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

describe('ResearchContextManager', () => {
  it('compiles ContextPacks, attaches them to WorkFrames, records, and restores them', () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    agent.workFrames.open(
      {
        id: 'frame.fqhe',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-cs-effective-theory',
        goal: 'Relate FQHE wavefunctions and CS theory.',
        activeObjectIds: ['formula.fqhe.flux-quantization'],
      },
      { source: 'controller' },
    );

    const pack = agent.researchContext.compileForWorkFrame(
      {},
      { source: 'controller', toolCallId: 'tool.context' },
    );

    expect(agent.workFrames.active?.contextPackId).toBe(pack.id);
    expect(agent.researchContext.requirePack(pack.id)).toBe(pack);
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_context.context_compiled',
        source: 'controller',
        workFrameId: 'frame.fqhe',
        contextPackId: pack.id,
        toolCallId: 'tool.context',
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.context_attached',
        frameId: 'frame.fqhe',
        contextPackId: pack.id,
      }),
    );

    const restored = makeAgent();
    for (const record of records) {
      restored.records.restore(record);
    }
    expect(restored.workFrames.active?.contextPackId).toBe(pack.id);
    expect(restored.researchContext.requirePack(pack.id)).toMatchObject({
      id: pack.id,
      workFrameId: 'frame.fqhe',
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
