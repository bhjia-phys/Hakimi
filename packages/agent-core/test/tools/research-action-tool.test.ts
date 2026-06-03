import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import {
  PhysicsMemoryRegistry,
  type PhysicsCapsule,
  type PhysicsCapsuleKind,
} from '../../src/physics-memory';
import {
  ResearchLedgerRegistry,
  type ResearchLedgerEvent,
} from '../../src/research-ledger';
import { ProviderManager } from '../../src/session/provider-manager';
import { ResearchActionTool } from '../../src/tools/builtin/collaboration/research-action-tool';
import { testKaos } from '../fixtures/test-kaos';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;
const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('ResearchActionTool', () => {
  it('lists default actions and recommends next actions from obligations', async () => {
    const tool = new ResearchActionTool();

    const actions = await execute(tool, {
      action: 'list_actions',
      category: 'physics',
      exposure: 'direct',
    });
    const recommendations = await execute(tool, {
      action: 'recommend_next_actions',
      obligations: [
        {
          id: 'obl.convention',
          kind: 'convention_check',
          domain: 'topological-order',
          topic: 'fqhe-cs-effective-theory',
          targetObjectId: 'formula.fqhe.flux-quantization',
          severity: 'blocking',
          reason: 'Flux convention affects CS normalization.',
          requiredActionId: 'validate.check_convention',
          status: 'open',
        },
      ],
    });

    expect(actions.output).toContain('validate.check_convention');
    expect(actions.output).toContain('primitive_tool_policy="none"');
    expect(recommendations.output).toContain('action_id="validate.check_convention"');
    expect(recommendations.output).toContain('obl.convention');
    expect(recommendations.output).toContain('primitive_tools="PhysicsMemory,ResearchLedger,ResearchAction"');
  });

  it('renders primitive tool plans for native research workflows', async () => {
    const tool = new ResearchActionTool();

    const literature = await execute(tool, {
      action: 'plan_primitive_tools',
      action_id: 'source.search_literature',
    });
    const patch = await execute(tool, {
      action: 'plan_primitive_tools',
      action_id: 'code.prepare_patch',
    });

    expect(literature.output).toContain('<primitive_tool_plan');
    expect(literature.output).toContain('action_id="source.search_literature"');
    expect(literature.output).toContain('<tool>WebSearch</tool>');
    expect(literature.output).toContain('<tool>FetchURL</tool>');
    expect(literature.output).toContain('primitive_tool_call_ids_required="true"');
    expect(patch.output).toContain('primitive_tool_policy="write-gated"');
    expect(patch.output).toContain('approval="write"');
    expect(patch.output).toContain('<tool>Edit</tool>');
    expect(patch.output).toContain('<tool>Write</tool>');
  });

  it('records model-reported action results through AgentRecords', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'record_action_result',
      action_id: 'validate.check_convention',
      call_id: 'research_action_call_1',
      outcome: 'pass',
      evidence_refs: ['ledger:event.fqhe.convention-check'],
      ledger_event_ids: ['event.fqhe.convention-check'],
      generated_obligation_ids: ['obl.known-limit'],
      primitive_tool_call_ids: ['tool_call_primitive_1'],
      next_suggested_actions: ['validate.check_known_limit'],
    });

    expect(result.output).toContain('research_action_recorded');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        source: 'model',
        actionId: 'validate.check_convention',
        callId: 'research_action_call_1',
        outcome: 'pass',
        ledgerEventIds: ['event.fqhe.convention-check'],
        evidenceRefs: ['ledger:event.fqhe.convention-check'],
        generatedObligationIds: ['obl.known-limit'],
        primitiveToolCallIds: ['tool_call_primitive_1'],
        nextSuggestedActions: ['validate.check_known_limit'],
        toolCallId: 'call_research_action',
      }),
    );
  });

  it('starts and finishes ResearchAction calls with WorkFrame and ledger attribution', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.librpa',
      domain: 'librpa',
      topic: 'head-wing',
      goal: 'Check head-wing code impact.',
    });
    const started = await execute(tool, {
      action: 'start_action_call',
      action_id: 'code.map_formula_to_code_region',
      call_id: 'call.map-head-wing',
      action_input: { formula_id: 'formula.head-wing' },
    });
    const finished = await execute(tool, {
      action: 'finish_action_call',
      action_id: 'code.map_formula_to_code_region',
      call_id: 'call.map-head-wing',
      outcome: 'inconclusive',
      ledger_event_ids: ['event.librpa.mapping-note'],
      evidence_refs: ['ledger:event.librpa.mapping-note'],
      primitive_tool_call_ids: ['tool_call_read_head_wing'],
      next_suggested_actions: ['benchmark.run_minimal_case'],
      action_output: { status: 'needs_benchmark' },
    });

    expect(started.output).toContain('work_frame_id="frame.librpa"');
    expect(finished.output).toContain('research_action_call_finished');
    expect(agent.researchAction.activeActionCall).toBeUndefined();
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.call_started',
        actionId: 'code.map_formula_to_code_region',
        callId: 'call.map-head-wing',
        workFrameId: 'frame.librpa',
        input: { formula_id: 'formula.head-wing' },
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.call_finished',
        actionId: 'code.map_formula_to_code_region',
        callId: 'call.map-head-wing',
        outcome: 'inconclusive',
        workFrameId: 'frame.librpa',
        ledgerEventIds: ['event.librpa.mapping-note'],
        evidenceRefs: ['ledger:event.librpa.mapping-note'],
        primitiveToolCallIds: ['tool_call_read_head_wing'],
      }),
    );
  });

  it('lists and loads evidence refs through the active WorkFrame scope', async () => {
    const records: AgentRecord[] = [];
    const ledger = new ResearchLedgerRegistry();
    ledger.register(
      ledgerEvent({
        id: 'event.fqhe.source',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-cs',
        body: 'FQHE source body',
      }),
    );
    ledger.register(
      ledgerEvent({
        id: 'event.librpa.patch',
        domain: 'librpa',
        topic: 'head-wing',
        body: 'LibRPA patch body',
      }),
    );
    const agent = makeAgent(records, { researchLedger: ledger });
    const tool = new ResearchActionTool(agent.researchAction);

    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.fqhe',
      domain: 'topological-order/fqhe-cs',
      topic: 'fqhe-cs',
      goal: 'Read FQHE source evidence.',
    });
    await execute(tool, {
      action: 'record_action_result',
      action_id: 'source.search_literature',
      call_id: 'call.fqhe-source',
      outcome: 'pass',
      evidence_refs: ['ledger:event.fqhe.source'],
    });
    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.librpa',
      domain: 'librpa',
      topic: 'head-wing',
      goal: 'Inspect LibRPA patch evidence.',
    });
    await execute(tool, {
      action: 'record_action_result',
      action_id: 'code.prepare_patch',
      call_id: 'call.librpa-patch',
      outcome: 'pass',
      evidence_refs: ['ledger:event.librpa.patch'],
    });
    await execute(tool, {
      action: 'switch_work_frame',
      frame_id: 'frame.fqhe',
    });

    const listed = await execute(tool, { action: 'list_evidence_refs' });
    const loaded = await execute(tool, {
      action: 'load_evidence_ref',
      evidence_ref: 'ledger:event.fqhe.source',
    });
    const leaked = await execute(tool, {
      action: 'load_evidence_ref',
      evidence_ref: 'ledger:event.librpa.patch',
    });

    expect(listed.output).toContain('scope="work_frame"');
    expect(listed.output).toContain('work_frame_id="frame.fqhe"');
    expect(listed.output).toContain('ledger:event.fqhe.source');
    expect(listed.output).not.toContain('ledger:event.librpa.patch');
    expect(loaded.output).toContain('<research_ledger_event id="event.fqhe.source"');
    expect(loaded.output).toContain('FQHE source body');
    expect(leaked).toMatchObject({ isError: true });
    expect(leaked.output).toContain('outside the requested domain');
    expect(leaked.output).not.toContain('LibRPA patch body');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_ledger.event_loaded',
        source: 'model-tool',
        eventId: 'event.fqhe.source',
        toolCallId: 'call_research_action',
      }),
    );
    expect(records).not.toContainEqual(
      expect.objectContaining({
        type: 'research_ledger.event_loaded',
        eventId: 'event.librpa.patch',
      }),
    );
  });

  it('requires a WorkFrame or complete domain/topic scope for evidence access', async () => {
    const agent = makeAgent([], { researchLedger: new ResearchLedgerRegistry() });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'list_evidence_refs',
      domain: 'librpa',
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('requires both domain and topic');
  });

  it('opens, lists, switches, and closes WorkFrames through the session manager', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    const openedFqhe = await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.fqhe',
      domain: 'topological-order',
      topic: 'fqhe-cs',
      goal: 'Relate Laughlin wavefunction and CS response.',
      active_object_ids: ['formula:ab-phase'],
      source_refs: ['ledger:event.fqhe.source'],
    });
    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.librpa',
      domain: 'librpa',
      topic: 'head-wing',
      goal: 'Check head-wing code impact.',
    });
    const switched = await execute(tool, {
      action: 'switch_work_frame',
      frame_id: 'frame.fqhe',
    });
    const listed = await execute(tool, { action: 'list_work_frames' });
    const closed = await execute(tool, {
      action: 'close_work_frame',
      frame_id: 'frame.librpa',
    });

    expect(openedFqhe.output).toContain('active="true"');
    expect(switched.output).toContain('frame.fqhe');
    expect(listed.output).toContain('active_id="frame.fqhe"');
    expect(listed.output).toContain('frame.librpa');
    expect(closed.output).toContain('work_frame_closed');
    expect(agent.workFrames.active?.id).toBe('frame.fqhe');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.opened',
        source: 'model-tool',
        toolCallId: 'call_research_action',
        frame: expect.objectContaining({
          id: 'frame.fqhe',
          activeObjectIds: ['formula:ab-phase'],
          sourceRefs: ['ledger:event.fqhe.source'],
        }),
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.switched',
        frameId: 'frame.fqhe',
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.closed',
        frameId: 'frame.librpa',
      }),
    );
  });

  it('compiles, lists, and loads ContextPacks through the session manager', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.fqhe',
      domain: 'topological-order/fqhe-cs',
      topic: 'fqhe-cs-effective-theory',
      goal: 'Relate Laughlin wavefunction and CS response.',
      active_object_ids: ['formula.fqhe.flux-quantization'],
    });
    const compiled = await execute(tool, {
      action: 'compile_context_pack',
      frame_id: 'frame.fqhe',
      max_capsules: 4,
      max_ledger_proposals: 4,
      max_action_bindings: 4,
    });
    const contextPackId = agent.workFrames.active?.contextPackId;
    const listed = await execute(tool, { action: 'list_context_packs' });
    const loaded = await execute(tool, {
      action: 'load_context_pack',
      context_pack_id: contextPackId,
    });
    const inspected = await execute(tool, {
      action: 'inspect_domain_pack',
      context_pack_id: contextPackId,
    });

    expect(contextPackId).toMatch(/^context\.frame\.fqhe\.[a-f0-9]{12}$/);
    expect(compiled.output).toContain('<context_pack');
    expect(compiled.output).toContain('domain="topological-order/fqhe-cs"');
    expect(listed.output).toContain(`id="${contextPackId}`);
    expect(loaded.output).toContain(`id="${contextPackId}`);
    expect(inspected.output).toContain('<domain_pack_inspection');
    expect(inspected.output).toContain('domain="topological-order/fqhe-cs"');
    expect(inspected.output).toContain('domain-profile-registry-disabled');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_context.context_compiled',
        source: 'model-tool',
        workFrameId: 'frame.fqhe',
        contextPackId,
        toolCallId: 'call_research_action',
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.context_attached',
        frameId: 'frame.fqhe',
        contextPackId,
      }),
    );
  });

  it('runs a registered benchmark adapter and records the evidence as a research action', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'run_benchmark_adapter',
      adapter_id: 'adapter.librpa.head-wing-smoke',
      benchmark_case_id: 'case.librpa.head-wing-smoke',
      benchmark_payload: {
        expected: { head: 1, wing: 0.25 },
        observed: { head: 1, wing: 0.25 },
        tolerance: 1e-6,
      },
      capsule_refs: ['formula.librpa.head-wing.update'],
    });

    expect(result.output).toContain('<benchmark_adapter_run');
    expect(result.output).toContain('outcome="pass"');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'benchmark.run_minimal_case',
        outcome: 'pass',
        capsuleRefs: ['formula.librpa.head-wing.update'],
        evidenceRefs: expect.arrayContaining([
          'benchmark:case.librpa.head-wing-smoke',
          'adapter.librpa.head-wing-smoke',
        ]),
      }),
    );
  });

  it('normalizes external job submissions through the default adapter contract', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'run_benchmark_adapter',
      action_id: 'benchmark.submit_external_job',
      call_id: 'call.external-submit-adapter',
      adapter_id: 'adapter.external.job-submission',
      benchmark_case_id: 'case.external.submit',
      benchmark_payload: {
        backend: {
          kind: 'scheduler',
          name: 'slurm',
          command: 'sbatch job.sh',
        },
        jobScript: 'job.sh',
        schedulerOutput: 'Submitted batch job 4242',
        artifactRefs: ['artifact:slurm-4242.out'],
        evidenceRefs: ['ledger:event.head-wing-submit'],
      },
      source_refs: ['tool:Bash', 'job:4242'],
    });

    expect(result.output).toContain('adapter_id="adapter.external.job-submission"');
    expect(result.output).toContain('action_id="benchmark.submit_external_job"');
    expect(result.output).toContain('outcome="pass"');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'benchmark.submit_external_job',
        callId: 'call.external-submit-adapter',
        outcome: 'pass',
        evidenceRefs: expect.arrayContaining([
          'adapter.external.job-submission',
          'external-job-backend:scheduler',
          'external-job-backend:slurm',
          'external-job-receipt:scheduler_output',
          'job:4242',
          'ledger:event.head-wing-submit',
        ]),
      }),
    );
  });

  it('executes graph dependency queries through the active physics-memory registry', async () => {
    const records: AgentRecord[] = [];
    const registry = new PhysicsMemoryRegistry();
    registry.register(capsule('definition.fqhe.laughlin', 'Definition'));
    registry.register(capsule('formula.fqhe.kmatrix', 'Formula', ['definition.fqhe.laughlin']));
    const agent = makeAgent(records, { physicsMemory: registry });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'query_physics_graph',
      graph_query: 'dependency_closure',
      start_ids: ['formula.fqhe.kmatrix'],
      max_depth: 1,
    });

    expect(result.output).toContain('<physics_graph_query query="dependency_closure">');
    expect(result.output).toContain('<node>definition.fqhe.laughlin</node>');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'graph.query_dependency_closure',
        outcome: 'pass',
        graphRefs: expect.arrayContaining([
          expect.objectContaining({ id: 'formula.fqhe.kmatrix' }),
          expect.objectContaining({ id: 'definition.fqhe.laughlin' }),
        ]),
      }),
    );
  });

  it('exports a formalization blueprint through ResearchAction and keeps readiness conservative', async () => {
    const records: AgentRecord[] = [];
    const registry = new PhysicsMemoryRegistry();
    registry.register(capsule('definition.fqhe.laughlin', 'Definition'));
    registry.register(capsule('formula.fqhe.kmatrix', 'Formula', ['definition.fqhe.laughlin']));
    const agent = makeAgent(records, { physicsMemory: registry });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'build_formalization_plan',
      formalization_target_ids: ['formula.fqhe.kmatrix'],
      include_dependency_closure: true,
    });

    expect(result.output).toContain('<formalization_plan format="aitp-formalization-blueprint/v0">');
    expect(result.output).toContain('readiness="formalization_ready"');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'formalization.build_blueprint',
        outcome: 'pass',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('formalization:aitp-formalization-blueprint/v0'),
        ]),
      }),
    );
  });

  it('returns a tool error when record_action_result is missing required ids', async () => {
    const tool = new ResearchActionTool();

    const result = await execute(tool, {
      action: 'record_action_result',
      call_id: 'call',
      outcome: 'pass',
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('action_id');
  });
});

describe('ToolManager ResearchAction registration', () => {
  it('keeps ResearchAction hidden unless the feature flag is enabled', () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'];
    try {
      delete process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'];
      const hidden = makeAgent();
      expect(hidden.tools.data().find((tool) => tool.name === 'ResearchAction')).toBeUndefined();

      process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'] = '1';
      const visible = makeAgent();
      visible.tools.setActiveTools(['ResearchAction']);
      expect(visible.tools.data().find((tool) => tool.name === 'ResearchAction')).toMatchObject({
        name: 'ResearchAction',
        active: true,
        source: 'builtin',
      });
      expect(visible.tools.loopTools.find((tool) => tool.name === 'ResearchAction')).toBeInstanceOf(
        ResearchActionTool,
      );
    } finally {
      if (oldFlag === undefined) {
        delete process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'];
      } else {
        process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'] = oldFlag;
      }
    }
  });
});

function execute(tool: ResearchActionTool, args: Parameters<typeof tool.resolveExecution>[0]) {
  return executeTool(tool, {
    turnId: '0',
    toolCallId: 'call_research_action',
    args,
    signal,
  });
}

function makeAgent(
  records?: AgentRecord[],
  options: {
    readonly physicsMemory?: PhysicsMemoryRegistry | undefined;
    readonly researchLedger?: ResearchLedgerRegistry | undefined;
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
    physicsMemory: options.physicsMemory,
    researchLedger: options.researchLedger,
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  agent.tools.initializeBuiltinTools();
  return agent;
}

function ledgerEvent(input: {
  readonly id: string;
  readonly domain: string;
  readonly topic: string;
  readonly body: string;
}): ResearchLedgerEvent {
  return {
    path: `/tmp/${input.id}.md`,
    body: input.body,
    root: {
      path: '/tmp/research-ledger',
      source: 'project',
    },
    metadata: {
      id: input.id,
      type: 'source_excerpt',
      domain: input.domain,
      topic: input.topic,
      status: 'captured',
      sourceRefs: ['local:test'],
      dependsOn: [],
      openQuestions: [],
      relatedObjects: [],
    },
  };
}

function capsule(
  id: string,
  kind: PhysicsCapsuleKind,
  dependsOn: readonly string[] = [],
): PhysicsCapsule {
  return {
    path: `/tmp/${id}.md`,
    source: 'project',
    body: `${kind} ${id}`,
    metadata: {
      id,
      kind,
      domain: 'topological-order/fqhe-cs',
      title: id,
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn,
      sourceRefs: ['local:test'],
      graphRefs: [],
      expansionHandles: [],
      requiredChecks: [],
      actionAffordances: [],
      allowCrossDomain: false,
    },
  };
}
