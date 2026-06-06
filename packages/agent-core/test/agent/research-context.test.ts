import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { ProviderManager } from '../../src/session/provider-manager';
import {
  WorkflowRecipeRegistry,
  compileAitpProcessGraphSlice,
  type AitpProcessGraphSliceProvider,
  type WorkflowRecipe,
} from '../../src';
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

  it('injects a research context reminder and selects the matching WorkFrame for a prompt', async () => {
    const agent = makeAgent();
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
        text: 'Please help me reason about the FQHE wavefunction and Chern-Simons theory link.',
      },
    ]);
    await agent.injection.inject();

    expect(agent.workFrames.active?.id).toBe('frame.fqhe');
    expect(agent.workFrames.active?.contextPackId).toBeDefined();
    const lastMessage = agent.context.history.at(-1);
    expect(lastMessage?.origin).toEqual({
      kind: 'injection',
      variant: 'research_context',
    });
    expect(lastMessage?.content[0]).toMatchObject({
      type: 'text',
    });
    expect((lastMessage?.content[0] as { text: string }).text).toContain('AITP research context is active.');
    expect((lastMessage?.content[0] as { text: string }).text).toContain('frame.fqhe');
  });

  it('threads primitive tool plan hints through context injection and action attribution', async () => {
    const records: AgentRecord[] = [];
    const workflowRecipes = new WorkflowRecipeRegistry();
    workflowRecipes.register(sourceSearchWorkflow());
    const agent = makeAgent(records, { workflowRecipes });
    agent.workFrames.open(
      {
        id: 'frame.sources',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Find source support for the FQHE flux insertion argument.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text: 'Search the literature for source support on FQHE flux insertion.',
      },
    ]);
    await agent.injection.inject();

    const injected = agent.context.history.at(-1);
    const reminder = (injected?.content[0] as { text: string }).text;
    expect(reminder).toContain('source.search_literature [tools: WebSearch');
    expect(reminder).toContain('ResearchAction.plan_primitive_tools');
    expect(agent.workFrames.active?.contextPackId).toBeDefined();

    agent.researchAction.startActionCall(
      {
        actionId: 'source.search_literature',
        callId: 'call.source-search',
        input: { query: 'FQHE flux insertion' },
      },
      { source: 'controller', toolCallId: 'tool.research-action.start' },
    );
    agent.researchAction.finishActionCall(
      {
        actionId: 'source.search_literature',
        callId: 'call.source-search',
        outcome: 'pass',
        evidenceRefs: ['source:paper.fqhe.flux-insertion'],
        ledgerEventIds: ['event.fqhe.source-search'],
        primitiveToolCallIds: ['tool.web-search.fqhe', 'tool.fetch-url.fqhe'],
        nextSuggestedActions: ['source.capture_source_excerpt'],
      },
      { source: 'controller', toolCallId: 'tool.research-action.finish' },
    );

    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.call_finished',
        actionId: 'source.search_literature',
        callId: 'call.source-search',
        workFrameId: 'frame.sources',
        evidenceRefs: ['source:paper.fqhe.flux-insertion'],
        ledgerEventIds: ['event.fqhe.source-search'],
        primitiveToolCallIds: ['tool.web-search.fqhe', 'tool.fetch-url.fqhe'],
        nextSuggestedActions: ['source.capture_source_excerpt'],
      }),
    );
    expect(agent.researchAction.recentEvidence(5, { workFrameId: 'frame.sources' })).toEqual([
      'source:paper.fqhe.flux-insertion',
    ]);
  });

  it('passes AITP compiled slices through ResearchContextManager', () => {
    const agent = makeAgent();
    agent.workFrames.open(
      {
        id: 'frame.aitp',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Trace a literature dependency without losing the original question.',
      },
      { source: 'controller' },
    );

    const pack = agent.researchContext.compileForWorkFrame(
      {
        aitp: compileAitpProcessGraphSlice(aitpSlicePayload(), {
          prompt: 'Follow the source dependency and audit original question drift.',
        }),
      },
      { source: 'controller' },
    );

    expect(pack.aitp?.contextLines.join('\n')).toContain('Source gaps: claim-fqhe');
    expect(pack.actionBindings.map((item) => item.actionId)).toEqual(
      expect.arrayContaining([
        'trace.audit_original_question_drift',
        'trace.follow_source_dependency',
      ]),
    );
  });

  it('fetches AITP process graph slices before research context injection', async () => {
    const calls: string[] = [];
    const aitpProcessGraphProvider: AitpProcessGraphSliceProvider = {
      async getProcessGraphSlice(input) {
        calls.push(input.workFrame.id);
        return compileAitpProcessGraphSlice(aitpSlicePayload(), {
          activeContext: input.prompt.map((part) => part.text ?? ''),
        });
      },
    };
    const agent = makeAgent(undefined, { aitpProcessGraphProvider });
    agent.workFrames.open(
      {
        id: 'frame.aitp',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Trace a literature dependency without losing the original question.',
        sourceRefs: ['aitp:session:session-fqhe', 'aitp:claim:claim-fqhe'],
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text: 'Follow the source dependency and keep the original counting question in scope.',
      },
    ]);
    await agent.injection.inject();

    expect(calls).toEqual(['frame.aitp']);
    const lastMessage = agent.context.history.at(-1);
    const reminder = (lastMessage?.content[0] as { text: string }).text;
    expect(reminder).toContain('AITP process graph: truth_source=typed_records');
    expect(reminder).toContain('AITP open obligations');
    expect(reminder).toContain('Theory reasoning for');
    expect(reminder).toContain('source_dependency_backtrace');
    expect(reminder).toContain('original_question_continuity_guard');
    expect(agent.researchContext.listPacks().at(-1)?.aitp?.suggestedActionIds).toEqual(
      expect.arrayContaining([
        'trace.audit_original_question_drift',
        'trace.follow_source_dependency',
      ]),
    );
  });
});

function makeAgent(
  records?: AgentRecord[],
  options: {
    readonly workflowRecipes?: WorkflowRecipeRegistry | undefined;
    readonly aitpProcessGraphProvider?: AitpProcessGraphSliceProvider | undefined;
  } = {},
): Agent {
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
    workflowRecipes: options.workflowRecipes,
    aitpProcessGraphProvider: options.aitpProcessGraphProvider,
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  return agent;
}

function sourceSearchWorkflow(): WorkflowRecipe {
  return {
    metadata: {
      id: 'workflow.fqhe.source-search',
      kind: 'workflow_recipe',
      title: 'FQHE source search',
      domain: 'topological-order/fqhe-cs',
      status: 'checked',
      sourceRefs: ['local:workflow'],
      actionBindings: [
        {
          id: 'binding.fqhe.source-search',
          actionId: 'source.search_literature',
          domainId: 'topological-order/fqhe-cs',
          workflowId: 'workflow.fqhe.source-search',
          priority: 'high',
        },
      ],
      requiredCapsules: [],
      requiredTools: [],
      failureModes: [],
    },
    path: 'workflow.md',
    body: 'Search source literature and record primitive tool call ids.',
    source: 'project',
  };
}

function aitpSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [
      {
        id: 'claim:claim-fqhe',
        type: 'claim',
        record: {
          statement: 'Sector counting identifies the edge CFT.',
          status: 'hypothesis',
        },
      },
    ],
    edges: [],
    open_obligations: [
      {
        obligation_id: 'obligation-source',
        claim_id: 'claim-fqhe',
        status: 'open',
        obligation_type: 'source_support',
        statement: 'Find the source supporting the sector-counting relation.',
        next_action: 'follow source dependency',
      },
    ],
    source_backtrace: [
      {
        claim_id: 'claim-fqhe',
        missing_components: ['reference_location'],
        complete: false,
      },
    ],
    relation_neighborhood: [],
    exploratory_records: [
      {
        record_id: 'exploration-drift',
        exploration_type: 'backtrace_step',
        focal_question: 'Does this dependency still answer the original counting question?',
        original_question: 'Does sector counting identify the edge CFT?',
        local_question: 'Follow one source dependency.',
        status: 'open',
        reasoning_moves: ['source dependency backtrace', 'original-question continuity check'],
        backtrace_targets: ['claim:claim-fqhe'],
        source_dependency_questions: ['Which paper defines the sector-counting relation?'],
        original_question_guard: ['Keep source lookup tied to sector-counting identification.'],
        unresolved_points: ['dependency may be only historical context'],
      },
    ],
    trust_boundary_reasons: ['this API cannot update claim trust'],
    recommended_moments: [
      {
        moment: 'audit_original_question_drift',
        reason: 'backtrace is branching away from the original question',
        target_type: 'claim',
        target_id: 'claim-fqhe',
      },
    ],
  };
}
