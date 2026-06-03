import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
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

  it('does not expose code-capable tools from a domain name alone', () => {
    const plan = buildRuntimeToolExposurePlan(
      makePack({
        domain: 'librpa',
      }),
    );

    expect(plan.activeToolNames).toEqual(
      expect.arrayContaining(['PhysicsMemory', 'ResearchLedger', 'ResearchAction']),
    );
    expect(plan.activeToolNames).not.toContain('Bash');
    expect(plan.activeToolNames).not.toContain('Write');
    expect(plan.activeToolNames).not.toContain('Edit');
    expect(plan.reason).toContain('theory-oriented');
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

  it('adds primitive plan tools from action bindings to runtime exposure', () => {
    const literaturePlan = buildRuntimeToolExposurePlan(
      makePack({
        actionBindings: [
          {
            id: 'binding.source.search',
            actionId: 'source.search_literature',
          },
        ],
      }),
    );
    const patchPlan = buildRuntimeToolExposurePlan(
      makePack({
        actionBindings: [
          {
            id: 'binding.code.patch',
            actionId: 'code.prepare_patch',
          },
        ],
      }),
    );

    expect(literaturePlan.activeToolNames).toEqual(
      expect.arrayContaining(['WebSearch', 'FetchURL', 'ResearchLedger', 'ResearchAction']),
    );
    expect(literaturePlan.activeToolNames).not.toContain('Bash');
    expect(literaturePlan.activeToolNames).not.toContain('Edit');
    expect(patchPlan.activeToolNames).toEqual(
      expect.arrayContaining(['Read', 'Grep', 'Edit', 'Write', 'Bash']),
    );
    expect(patchPlan.reason).toContain('code/benchmark-oriented');
  });

  it('adds primitive plan tools from domain pack action ids', () => {
    const plan = buildRuntimeToolExposurePlan(
      makePack({
        actionBindings: [],
        domainPack: {
          id: 'domain-pack.librpa-head-wing.test',
          domain: 'librpa/head-wing',
          profileIds: ['domain.librpa-head-wing'],
          workflowIds: ['workflow.librpa.patch'],
          capsuleIds: [],
          bridgeCapsuleIds: [],
          evalCaseIds: ['eval.librpa.head-wing'],
          actionBindingIds: ['binding.librpa.patch'],
          actionIds: ['code.prepare_patch'],
          requiredTools: [],
          contextTags: ['librpa'],
          diagnostics: [],
          compiledAt: 1,
        },
      }),
    );

    expect(plan.activeToolNames).toEqual(
      expect.arrayContaining(['Read', 'Grep', 'Edit', 'Write', 'Bash']),
    );
    expect(plan.reason).toContain('code/benchmark-oriented');
  });

  it('freezes turn base tools while allowing runtime exposure to update the step list', () => {
    const agent = makeAgent({ webTools: true });
    agent.tools.setActiveTools([
      'Read',
      'Bash',
      'WebSearch',
      'FetchURL',
      'ResearchAction',
    ]);
    const buildTurnTools = agent.tools.createTurnLoopToolBuilder();

    agent.tools.setActiveTools([]);
    expect(buildTurnTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['Bash', 'Read']),
    );

    agent.tools.applyRuntimeToolExposure(
      buildRuntimeToolExposurePlan(
        makePack({
          actionBindings: [
            {
              id: 'binding.source.search',
              actionId: 'source.search_literature',
            },
          ],
        }),
      ),
      { source: 'controller' },
    );
    const literatureNames = buildTurnTools().map((tool) => tool.name);
    expect(literatureNames).toEqual(
      expect.arrayContaining(['ResearchAction', 'WebSearch', 'FetchURL']),
    );
    expect(literatureNames).not.toContain('Bash');

    agent.tools.applyRuntimeToolExposure(null, { source: 'controller' });
    expect(buildTurnTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['Bash', 'Read']),
    );
  });

  it('replaces primitive tool exposure when switching between topic packs', () => {
    const agent = makeAgent({ webTools: true });
    agent.tools.setActiveTools([
      'Read',
      'Grep',
      'Glob',
      'WebSearch',
      'FetchURL',
      'Bash',
      'Edit',
      'Write',
      'PhysicsMemory',
      'ResearchLedger',
      'ResearchAction',
    ]);

    const literatureExposure = buildRuntimeToolExposurePlan(
      makePack({
        id: 'context.literature',
        workFrameId: 'frame.literature',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        actionBindings: [
          {
            id: 'binding.source.search',
            actionId: 'source.search_literature',
          },
        ],
      }),
    );
    const patchExposure = buildRuntimeToolExposurePlan(
      makePack({
        id: 'context.patch',
        workFrameId: 'frame.patch',
        domain: 'librpa',
        topic: 'head-wing-patch',
        actionBindings: [
          {
            id: 'binding.code.patch',
            actionId: 'code.prepare_patch',
          },
        ],
      }),
    );

    agent.tools.applyRuntimeToolExposure(literatureExposure, { source: 'controller' });
    expect(infoMap(agent).get('WebSearch')?.active).toBe(true);
    expect(infoMap(agent).get('FetchURL')?.active).toBe(true);
    expect(infoMap(agent).get('Bash')?.active).toBe(false);
    expect(infoMap(agent).get('Edit')?.active).toBe(false);
    expect(infoMap(agent).get('Write')?.active).toBe(false);

    agent.tools.applyRuntimeToolExposure(patchExposure, { source: 'controller' });
    expect(infoMap(agent).get('WebSearch')?.active).toBe(false);
    expect(infoMap(agent).get('FetchURL')?.active).toBe(false);
    expect(infoMap(agent).get('Bash')?.active).toBe(true);
    expect(infoMap(agent).get('Edit')?.active).toBe(true);
    expect(infoMap(agent).get('Write')?.active).toBe(true);

    agent.tools.applyRuntimeToolExposure(literatureExposure, { source: 'controller' });
    expect(infoMap(agent).get('WebSearch')?.active).toBe(true);
    expect(infoMap(agent).get('FetchURL')?.active).toBe(true);
    expect(infoMap(agent).get('Bash')?.active).toBe(false);
    expect(infoMap(agent).get('Edit')?.active).toBe(false);
    expect(infoMap(agent).get('Write')?.active).toBe(false);
  });

  it('keeps primitive runtime exposure isolated between agent sessions', () => {
    const literatureAgent = makeAgent();
    const patchAgent = makeAgent();
    const baselineTools = [
      'Read',
      'Grep',
      'Glob',
      'Bash',
      'Edit',
      'Write',
      'PhysicsMemory',
      'ResearchLedger',
      'ResearchAction',
    ];
    literatureAgent.tools.setActiveTools(baselineTools);
    patchAgent.tools.setActiveTools(baselineTools);

    literatureAgent.tools.applyRuntimeToolExposure(
      buildRuntimeToolExposurePlan(
        makePack({
          id: 'context.literature',
          workFrameId: 'frame.literature',
          domain: 'topological-order/fqhe-cs',
          topic: 'fqhe-literature',
          actionBindings: [
            {
              id: 'binding.source.search',
              actionId: 'source.search_literature',
            },
          ],
        }),
      ),
      { source: 'controller' },
    );
    patchAgent.tools.applyRuntimeToolExposure(
      buildRuntimeToolExposurePlan(
        makePack({
          id: 'context.patch',
          workFrameId: 'frame.patch',
          domain: 'librpa',
          topic: 'head-wing-patch',
          actionBindings: [
            {
              id: 'binding.code.patch',
              actionId: 'code.prepare_patch',
            },
          ],
        }),
      ),
      { source: 'controller' },
    );

    expect(infoMap(literatureAgent).get('Bash')?.active).toBe(false);
    expect(infoMap(literatureAgent).get('Edit')?.active).toBe(false);
    expect(infoMap(patchAgent).get('Bash')?.active).toBe(true);
    expect(infoMap(patchAgent).get('Edit')?.active).toBe(true);
    expect(infoMap(literatureAgent).get('ResearchAction')?.active).toBe(true);
    expect(infoMap(patchAgent).get('ResearchAction')?.active).toBe(true);
  });

  it('replays primitive runtime exposure without leaking between persisted sessions', async () => {
    const baselineTools = [
      'Read',
      'Grep',
      'Glob',
      'WebSearch',
      'FetchURL',
      'Bash',
      'Edit',
      'Write',
      'PhysicsMemory',
      'ResearchLedger',
      'ResearchAction',
    ];
    const literatureRecords: AgentRecord[] = [];
    const patchRecords: AgentRecord[] = [];
    const literatureAgent = makeAgent({ webTools: true, records: literatureRecords });
    const patchAgent = makeAgent({ webTools: true, records: patchRecords });
    literatureAgent.tools.setActiveTools(baselineTools);
    patchAgent.tools.setActiveTools(baselineTools);

    literatureAgent.tools.applyRuntimeToolExposure(
      buildRuntimeToolExposurePlan(
        makePack({
          id: 'context.literature',
          workFrameId: 'frame.literature',
          domain: 'topological-order/fqhe-cs',
          topic: 'fqhe-literature',
          actionBindings: [
            {
              id: 'binding.source.search',
              actionId: 'source.search_literature',
            },
          ],
        }),
      ),
      { source: 'controller' },
    );
    patchAgent.tools.applyRuntimeToolExposure(
      buildRuntimeToolExposurePlan(
        makePack({
          id: 'context.patch',
          workFrameId: 'frame.patch',
          domain: 'librpa',
          topic: 'head-wing-patch',
          actionBindings: [
            {
              id: 'binding.code.patch',
              actionId: 'code.prepare_patch',
            },
          ],
        }),
      ),
      { source: 'controller' },
    );

    const restoredLiteratureAgent = makeAgent({
      webTools: true,
      configure: false,
      persistence: new InMemoryAgentRecordPersistence(literatureRecords),
    });
    const restoredPatchAgent = makeAgent({
      webTools: true,
      configure: false,
      persistence: new InMemoryAgentRecordPersistence(patchRecords),
    });
    await restoredLiteratureAgent.records.replay();
    await restoredPatchAgent.records.replay();

    expect(infoMap(restoredLiteratureAgent).get('WebSearch')?.active).toBe(true);
    expect(infoMap(restoredLiteratureAgent).get('FetchURL')?.active).toBe(true);
    expect(infoMap(restoredLiteratureAgent).get('Bash')?.active).toBe(false);
    expect(infoMap(restoredLiteratureAgent).get('Edit')?.active).toBe(false);
    expect(infoMap(restoredPatchAgent).get('WebSearch')?.active).toBe(false);
    expect(infoMap(restoredPatchAgent).get('FetchURL')?.active).toBe(false);
    expect(infoMap(restoredPatchAgent).get('Bash')?.active).toBe(true);
    expect(infoMap(restoredPatchAgent).get('Edit')?.active).toBe(true);
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

function makeAgent(
  options: {
    readonly webTools?: boolean;
    readonly records?: AgentRecord[];
    readonly persistence?: InMemoryAgentRecordPersistence;
    readonly configure?: boolean;
  } = {},
): Agent {
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
    persistence:
      options.persistence ??
      new InMemoryAgentRecordPersistence([], {
        onRecord: (record) => options.records?.push(record),
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
    toolServices:
      options.webTools === true
        ? {
            webSearcher: {
              search: async () => [],
            },
            urlFetcher: {
              fetch: async () => ({ content: 'ok', kind: 'passthrough' }),
            },
          }
        : undefined,
    physicsMemory: new PhysicsMemoryRegistry(),
    researchLedger: new ResearchLedgerRegistry(),
  });
  if (options.configure !== false) {
    agent.config.update({
      cwd: process.cwd(),
      modelAlias: MOCK_PROVIDER.model,
    });
  }
  return agent;
}
