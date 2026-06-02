import { describe, expect, it, vi } from 'vitest';

import { Agent } from '../../src/agent';
import { buildRuntimeToolExposurePlan } from '../../src/agent/tool-exposure';
import type { ResearchContextPack } from '../../src/research-context';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { PhysicsMemoryRegistry } from '../../src/physics-memory';
import { ResearchLedgerRegistry } from '../../src/research-ledger';
import { ProviderManager } from '../../src/session/provider-manager';
import { testKaos } from '../fixtures/test-kaos';

const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('Runtime tool exposure', () => {
  it('narrows managed tools for theory-oriented research packs', () => {
    const agent = makeAgent();
    agent.tools.setActiveTools([
      'Read',
      'Grep',
      'Glob',
      'Bash',
      'Edit',
      'Write',
      'PhysicsMemory',
      'ResearchLedger',
      'ResearchAction',
    ]);

    agent.tools.applyRuntimeToolExposure(
      buildRuntimeToolExposurePlan(makePack({ domain: 'topological-order/fqhe-cs' })),
      { source: 'controller' },
    );

    const info = infoMap(agent);
    expect(info.get('PhysicsMemory')?.active).toBe(true);
    expect(info.get('ResearchLedger')?.active).toBe(true);
    expect(info.get('ResearchAction')?.active).toBe(true);
    expect(info.get('Bash')?.active).toBe(false);
    expect(info.get('Write')?.active).toBe(false);
    expect(info.get('Edit')?.active).toBe(false);
    expect(info.get('Read')?.active).toBe(true);
  });

  it('exposes code-capable tools for code-oriented research packs', () => {
    const agent = makeAgent();
    agent.tools.setActiveTools([
      'Read',
      'Grep',
      'Glob',
      'Bash',
      'Edit',
      'Write',
      'PhysicsMemory',
      'ResearchLedger',
      'ResearchAction',
    ]);

    agent.tools.applyRuntimeToolExposure(
      buildRuntimeToolExposurePlan(
        makePack({
          domain: 'librpa',
          workflows: [
            {
              id: 'workflow.librpa.formula-code-mapping',
              title: 'Formula to code mapping',
              status: 'raw',
              sourceRefs: ['ref:librpa'],
              actionBindingIds: ['binding.code.inspect'],
              requiredCapsules: [],
              requiredTools: ['Bash', 'Write'],
              failureModes: [],
            },
          ],
        }),
      ),
      { source: 'controller' },
    );

    const info = infoMap(agent);
    expect(info.get('PhysicsMemory')?.active).toBe(true);
    expect(info.get('ResearchLedger')?.active).toBe(true);
    expect(info.get('ResearchAction')?.active).toBe(true);
    expect(info.get('Bash')?.active).toBe(true);
    expect(info.get('Write')?.active).toBe(true);
    expect(info.get('Edit')?.active).toBe(true);
  });
});

function makePack(overrides: Partial<ResearchContextPack>): ResearchContextPack {
  return {
    id: 'context.test',
    workFrameId: 'frame.test',
    domain: 'topological-order/fqhe-cs',
    topic: 'test-topic',
    goal: 'Test context pack.',
    focusObjectIds: [],
    assumptionIds: [],
    conventionIds: [],
    sourceRefs: [],
    profiles: [],
    workflows: [],
    physics: {
      requestedFocus: [],
      includedFocus: [],
      capsules: [],
    },
    ledger: {
      includeStatuses: ['captured'],
      proposals: [],
    },
    actionBindings: [],
    diagnostics: [],
    compiledAt: Date.now(),
    ...overrides,
  };
}

function infoMap(agent: Agent) {
  return new Map(agent.tools.data().map((tool) => [tool.name, tool]));
}

function makeAgent(): Agent {
  vi.stubEnv('KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY', '1');
  vi.stubEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER', '1');
  vi.stubEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION', '1');
  const agent = new Agent({
    kaos: testKaos,
    rpc: {
      emitEvent: vi.fn(),
      requestApproval: vi.fn(),
      requestQuestion: vi.fn(),
      toolCall: vi.fn(),
    },
    persistence: new InMemoryAgentRecordPersistence([]),
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
    physicsMemory: new PhysicsMemoryRegistry(),
    researchLedger: new ResearchLedgerRegistry(),
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  return agent;
}
