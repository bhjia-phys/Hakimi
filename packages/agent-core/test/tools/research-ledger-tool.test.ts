import { describe, expect, it, vi } from 'vitest';

import { Agent } from '../../src/agent';
import { ResearchLedgerRegistry, type ResearchLedgerEvent } from '../../src/research-ledger';
import { ProviderManager } from '../../src/session/provider-manager';
import { ResearchLedgerTool } from '../../src/tools/builtin/collaboration/research-ledger-tool';
import { testKaos } from '../fixtures/test-kaos';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;
const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('ResearchLedgerTool', () => {
  it('lists topics and events, loads an event, and compiles proposals', async () => {
    const registry = new ResearchLedgerRegistry();
    registry.register(
      event('event.fqhe.source', {
        type: 'source_excerpt',
        status: 'linked',
        candidateCapsuleKind: 'Definition',
        openQuestions: [],
        body: 'Laughlin wavefunction source excerpt.',
      }),
    );
    registry.register(
      event('event.fqhe.flux-step', {
        status: 'linked',
        candidateCapsuleKind: 'DerivationStep',
        openQuestions: ['check flux quantum convention'],
        body: 'Flux attachment derivation scratch.',
      }),
    );
    const tool = new ResearchLedgerTool(registry);

    const topics = await execute(tool, { action: 'list_topics', domain: 'topological-order' });
    const events = await execute(tool, {
      action: 'list_events',
      topic: 'fqhe-cs-effective-theory',
      status: 'linked',
    });
    const loaded = await execute(tool, {
      action: 'load_event',
      id: 'event.fqhe.flux-step',
      include_body: true,
    });
    const proposals = await execute(tool, {
      action: 'compile_proposals',
      topic: 'fqhe-cs-effective-theory',
      domain: 'topological-order',
    });

    expect(topics.output).toContain('<topic id="fqhe-cs-effective-theory" />');
    expect(events.output).toContain('event.fqhe.flux-step');
    expect(loaded.output).toContain('Flux attachment derivation scratch.');
    expect(proposals.isError).toBeUndefined();
    expect(proposals.output).toContain('proposal.event.fqhe.flux-step.derivationstep');
    expect(proposals.output).toContain('unresolved-open-question');
  });

  it('returns a tool error when load_event has no id', async () => {
    const tool = new ResearchLedgerTool(new ResearchLedgerRegistry());

    const result = await execute(tool, { action: 'load_event' });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('requires an id');
  });
});

describe('ToolManager ResearchLedger registration', () => {
  it('keeps ResearchLedger hidden unless the feature flag and registry are both present', () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'];
    try {
      delete process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'];
      const hidden = makeAgent(new ResearchLedgerRegistry());
      expect(hidden.tools.data().find((tool) => tool.name === 'ResearchLedger')).toBeUndefined();

      process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'] = '1';
      const missingRegistry = makeAgent();
      expect(missingRegistry.tools.data().find((tool) => tool.name === 'ResearchLedger')).toBeUndefined();

      const visible = makeAgent(new ResearchLedgerRegistry());
      visible.tools.setActiveTools(['ResearchLedger']);
      expect(visible.tools.data().find((tool) => tool.name === 'ResearchLedger')).toMatchObject({
        name: 'ResearchLedger',
        active: true,
        source: 'builtin',
      });
      expect(visible.tools.loopTools.find((tool) => tool.name === 'ResearchLedger')).toBeInstanceOf(
        ResearchLedgerTool,
      );
    } finally {
      if (oldFlag === undefined) {
        delete process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'];
      } else {
        process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER'] = oldFlag;
      }
    }
  });
});

function execute(tool: ResearchLedgerTool, args: Parameters<typeof tool.resolveExecution>[0]) {
  return executeTool(tool, {
    turnId: '0',
    toolCallId: 'call_research_ledger',
    args,
    signal,
  });
}

function makeAgent(researchLedger?: ResearchLedgerRegistry): Agent {
  const agent = new Agent({
    kaos: testKaos,
    rpc: {
      emitEvent: vi.fn(),
      requestApproval: vi.fn(),
      requestQuestion: vi.fn(),
      toolCall: vi.fn(),
    },
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
    researchLedger,
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  agent.tools.initializeBuiltinTools();
  return agent;
}

function event(
  id: string,
  overrides: Partial<ResearchLedgerEvent['metadata']> & {
    readonly body?: string;
  } = {},
): ResearchLedgerEvent {
  return {
    path: `/tmp/${id}.md`,
    body: overrides.body ?? '',
    root: { path: '/tmp', source: 'project' },
    metadata: {
      id,
      type: 'derivation_scratch',
      topic: 'fqhe-cs-effective-theory',
      domain: 'topological-order',
      status: 'linked',
      sourceRefs: ['local:test'],
      dependsOn: [],
      candidateCapsuleKind: 'DerivationStep',
      openQuestions: [],
      relatedObjects: [],
      ...overrides,
    },
  };
}
