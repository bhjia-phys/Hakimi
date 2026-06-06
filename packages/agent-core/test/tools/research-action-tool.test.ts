import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import {
  compileAitpProcessGraphSlice,
  type AitpWriteBridgeExecutor,
} from '../../src/aitp';
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
    expect(literature.output).toContain('action="start_action_call"');
    expect(literature.output).toContain('action="finish_action_call"');
    expect(literature.output).toContain('If WebSearch is unavailable');
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

  it('infers call ids for model-facing action lifecycle calls', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    const started = await execute(tool, {
      action: 'start_action_call',
      action_id: 'source.search_literature',
    });
    const recorded = await execute(tool, {
      action: 'record_action_result',
      action_id: 'source.search_literature',
      outcome: 'blocked',
      primitive_tool_call_ids: ['tool_call_search_failed'],
    });
    const finished = await execute(tool, {
      action: 'finish_action_call',
      action_id: 'source.search_literature',
      outcome: 'blocked',
      primitive_tool_call_ids: ['tool_call_search_failed'],
    });

    expect(started.output).toContain('call_id_source="generated"');
    expect(recorded.output).toContain('call_id_source="active"');
    expect(finished.output).toContain('call_id_source="active"');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        callId: expect.stringMatching(/^call\.source.search_literature\./),
        outcome: 'blocked',
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.call_finished',
        callId: expect.stringMatching(/^call\.source.search_literature\./),
        outcome: 'blocked',
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

  it('renders AITP route_state in loaded ContextPack XML', async () => {
    const agent = makeAgent();
    const tool = new ResearchActionTool(agent.researchAction);

    agent.workFrames.open(
      {
        id: 'frame.route',
        domain: 'theoretical-physics/qg-algebra',
        topic: 'route-state',
        goal: 'Carry AITP route_state through context XML.',
      },
      { source: 'controller' },
    );
    const pack = agent.researchContext.compileForWorkFrame(
      {
        aitp: compileAitpProcessGraphSlice(routeStateSlicePayload()),
      },
      { source: 'controller' },
    );

    const loaded = await execute(tool, {
      action: 'load_context_pack',
      context_pack_id: pack.id,
    });

    expect(loaded.output).toContain('<live_routes>');
    expect(loaded.output).toContain('<route>route-live</route>');
    expect(loaded.output).toContain('<blocked_routes>');
    expect(loaded.output).toContain('<route>route-blocked</route>');
    expect(loaded.output).toContain('<pivot_required_routes>');
    expect(loaded.output).toContain('<route>route-live</route>');
    expect(loaded.output).toContain('<source_assets>');
    expect(loaded.output).toContain('<source_asset>source-asset-route-paper</source_asset>');
    expect(loaded.output).toContain('<source_assets_missing_hashes>');
    expect(loaded.output).toContain('<source_asset>source-asset-route-paper</source_asset>');
    expect(loaded.output).toContain('<source_stack_coverage>');
    expect(loaded.output).toContain('<claim>claim-route</claim>');
    expect(loaded.output).toContain('<source_stack_evidence_gaps>');
    expect(loaded.output).toContain('<source_stack_reconstruction_gaps>');
    expect(loaded.output).toContain('<source_stack_next_actions>');
    expect(loaded.output).toContain('<action>record_evidence_for_required_outputs:claim-route</action>');
    expect(loaded.output).toContain('<source_reconstruction_review>');
    expect(loaded.output).toContain('<source_reconstruction_review_open>');
    expect(loaded.output).toContain('<source_reconstruction_review_packets>');
    expect(loaded.output).toContain('<source_reconstruction_review_next_actions>');
    expect(loaded.output).toContain('<action>source_reconstruction_review:claim-route</action>');
    expect(loaded.output).toContain('aitp.record_route_choice');
    expect(loaded.output).toContain('aitp.record_failed_route_lesson');
    expect(loaded.output).toContain('aitp.checkpoint_before_route_switch');
  });

  it('executes configured AITP write-bridge operations as research action results', async () => {
    const records: AgentRecord[] = [];
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const aitpWriteBridge: AitpWriteBridgeExecutor = {
      async executeWrite(input) {
        bridgeCalls.push(input);
        if (input.operation === 'registerSourceAsset') {
          return {
            ok: true,
            kind: 'source_asset',
            assetId: 'source-asset-algebra-paper',
            topicId: 'qg-algebra-mipt',
            assetType: 'paper',
            orientationOnly: true,
            canUpdateClaimTrust: false,
            raw: {},
          };
        }
        if (input.operation === 'recordValidationResult') {
          return {
            ok: true,
            kind: 'validation_result',
            resultId: 'validation-result-source-audit',
            topicId: 'qg-algebra-mipt',
            claimId: 'claim-mipt-observer-algebra',
            contractId: 'validation-contract-source-audit',
            toolRunId: 'tool-run-source-audit',
            status: 'partial',
            raw: {},
          };
        }
        if (input.operation === 'recordSourceReconstructionReviewResult') {
          return {
            ok: true,
            kind: 'source_reconstruction_review_result',
            resultId: 'source-review-result-algebra',
            topicId: 'qg-algebra-mipt',
            claimId: 'claim-mipt-observer-algebra',
            status: 'needs_revision',
            canUpdateClaimTrust: false,
            raw: {},
          };
        }
        if (input.operation === 'recordEvidence') {
          return {
            ok: true,
            kind: 'evidence',
            evidenceId: 'evidence-source-audit',
            topicId: 'qg-algebra-mipt',
            claimId: 'claim-mipt-observer-algebra',
            evidenceType: 'source_reconstruction',
            status: 'supports',
            raw: {},
          };
        }
        if (input.operation === 'recordToolRun') {
          return {
            ok: true,
            kind: 'tool_run',
            runId: 'tool-run-source-audit',
            recipeId: 'recipe-source-audit',
            toolFamily: 'source_audit',
            toolName: 'definition_backtrace',
            topicId: 'qg-algebra-mipt',
            claimId: 'claim-mipt-observer-algebra',
            evidenceStatus: 'captured',
            raw: {},
          };
        }
        if (input.operation === 'captureCodeStateAuto') {
          return {
            ok: true,
            kind: 'code_state',
            codeStateId: 'code-state-librpa',
            repoId: 'librpa',
            upstreamRemote: 'origin',
            upstreamBranch: 'main',
            upstreamCommit: 'abc123',
            localBranch: 'feature/provenance',
            worktreePath: 'F:/repo/librpa',
            dirty: true,
            patchId: 'artifact-git_patch-librpa',
            diffHash: 'd'.repeat(64),
            raw: {},
          };
        }
        if (input.operation === 'attachArtifact') {
          return {
            ok: true,
            kind: 'artifact',
            artifactId: 'artifact-source-audit-log',
            topicId: 'qg-algebra-mipt',
            claimId: 'claim-mipt-observer-algebra',
            artifactType: 'benchmark_log',
            uri: 'runs/qg/source-audit.log',
            summary: 'Source audit log.',
            sizeBytes: 2048,
            canUpdateClaimTrust: false,
            raw: {},
          };
        }
        if (input.operation === 'recordReferenceLocation') {
          return {
            ok: true,
            kind: 'reference_location',
            locationId: 'reference-location-algebra-paper',
            topicId: 'qg-algebra-mipt',
            claimId: 'claim-mipt-observer-algebra',
            connectorId: 'arxiv',
            locationType: 'paper_section',
            uri: 'arxiv:2601.00001#sec-2',
            label: 'Algebraic observer source section',
            status: 'located',
            orientationOnly: true,
            raw: {},
          };
        }
        return {
          ok: true,
          kind: 'proof_obligation',
          obligationId: 'proof-obligation-algebra-source-chain',
          topicId: 'qg-algebra-mipt',
          claimId: 'claim-mipt-observer-algebra',
          status: 'open',
          canUpdateClaimTrust: false,
          raw: {},
        };
      },
    };
    const agent = makeAgent(records, { aitpWriteBridge });
    const tool = new ResearchActionTool(agent.researchAction);

    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.qg-mipt',
      domain: 'theoretical-physics/qg-algebra',
      topic: 'qg-algebra-mipt',
      goal: 'Trace observer algebra source support.',
    });
    const result = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'createProofObligation',
      aitp_payload: {
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        statement: 'Backtrace algebraic split source support.',
        obligation_type: 'source_support',
        status: 'open',
        maturity_level: 'hypothesis',
        next_action: 'follow source dependency',
        required_evidence: ['source reconstruction'],
      },
    });
    const sourceAsset = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'registerSourceAsset',
      aitp_payload: {
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        asset_type: 'paper',
        uri: 'arxiv:2601.00001',
        title: 'Algebraic observer source',
        version_anchor: { arxiv_version: 'v1' },
      },
    });
    const evidence = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordEvidence',
      aitp_payload: {
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        evidence_type: 'source_reconstruction',
        status: 'supports',
        summary: 'Source reconstruction evidence for the algebraic split path.',
        supports_outputs: ['definition path'],
        source_refs: ['reference_location:reference-location-algebra-paper'],
      },
    });
    const toolRun = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordToolRun',
      aitp_payload: {
        recipe_id: 'recipe-source-audit',
        tool_family: 'source_audit',
        tool_name: 'definition_backtrace',
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        inputs: { target: 'split property' },
        outputs: { located: true },
        evidence_status: 'captured',
      },
    });
    const codeState = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'captureCodeStateAuto',
      aitp_payload: {
        worktree_path: 'F:/repo/librpa',
        repo_id: 'librpa',
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        build_config: { cmake: 'release' },
        write_patch_artifact: true,
      },
    });
    const artifact = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'attachArtifact',
      aitp_payload: {
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        artifact_type: 'benchmark_log',
        artifact_uri: 'runs/qg/source-audit.log',
        artifact_summary: 'Source audit log.',
        size_bytes: '2048',
      },
    });
    const referenceLocation = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordReferenceLocation',
      aitp_payload: {
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        connector_id: 'arxiv',
        location_type: 'paper_section',
        uri: 'arxiv:2601.00001#sec-2',
        label: 'Algebraic observer source section',
        status: 'located',
      },
    });
    const validation = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordValidationResult',
      aitp_payload: {
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        contract_id: 'validation-contract-source-audit',
        tool_run_id: 'tool-run-source-audit',
        status: 'partial',
        summary: 'Source audit partially closed the definition path.',
        checked_outputs: ['source chain transcript'],
      },
    });
    const reviewResult = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordSourceReconstructionReviewResult',
      aitp_payload: {
        claim_id: 'claim-mipt-observer-algebra',
        status: 'needs_revision',
        reviewed_components: ['definitions', 'source_locations'],
        basis_refs: ['source_asset:source-asset-algebra-paper'],
        reference_location_ids: ['reference-location-algebra-paper'],
        summary: 'Definitions and source locations reviewed; theorem dependency needs revision.',
      },
    });

    expect(result.output).toContain('<aitp_write_bridge');
    expect(result.output).toContain('operation="createProofObligation"');
    expect(result.output).toContain('aitp:proof_obligation:proof-obligation-algebra-source-chain');
    expect(sourceAsset.output).toContain('operation="registerSourceAsset"');
    expect(sourceAsset.output).toContain('aitp:source_asset:source-asset-algebra-paper');
    expect(evidence.output).toContain('operation="recordEvidence"');
    expect(evidence.output).toContain('aitp:evidence:evidence-source-audit');
    expect(toolRun.output).toContain('operation="recordToolRun"');
    expect(toolRun.output).toContain('aitp:tool_run:tool-run-source-audit');
    expect(codeState.output).toContain('operation="captureCodeStateAuto"');
    expect(codeState.output).toContain('aitp:code_state:code-state-librpa');
    expect(artifact.output).toContain('operation="attachArtifact"');
    expect(artifact.output).toContain('aitp:artifact:artifact-source-audit-log');
    expect(referenceLocation.output).toContain('operation="recordReferenceLocation"');
    expect(referenceLocation.output).toContain(
      'aitp:reference_location:reference-location-algebra-paper',
    );
    expect(validation.output).toContain('operation="recordValidationResult"');
    expect(validation.output).toContain('aitp:validation_result:validation-result-source-audit');
    expect(reviewResult.output).toContain('operation="recordSourceReconstructionReviewResult"');
    expect(reviewResult.output).toContain(
      'aitp:source_reconstruction_review_result:source-review-result-algebra',
    );
    expect(bridgeCalls).toHaveLength(9);
    expect(bridgeCalls[0]).toMatchObject({
      operation: 'createProofObligation',
      payload: {
        topicId: 'qg-algebra-mipt',
        claimId: 'claim-mipt-observer-algebra',
        requiredEvidence: ['source reconstruction'],
      },
    });
    expect(bridgeCalls[1]).toMatchObject({
      operation: 'registerSourceAsset',
      payload: {
        assetType: 'paper',
        versionAnchor: { arxiv_version: 'v1' },
      },
    });
    expect(bridgeCalls[2]).toMatchObject({
      operation: 'recordEvidence',
      payload: {
        evidenceType: 'source_reconstruction',
        supportsOutputs: ['definition path'],
        sourceRefs: ['reference_location:reference-location-algebra-paper'],
      },
    });
    expect(bridgeCalls[3]).toMatchObject({
      operation: 'recordToolRun',
      payload: {
        recipeId: 'recipe-source-audit',
        inputs: { target: 'split property' },
        outputs: { located: true },
      },
    });
    expect(bridgeCalls[4]).toMatchObject({
      operation: 'captureCodeStateAuto',
      payload: {
        worktreePath: 'F:/repo/librpa',
        repoId: 'librpa',
        buildConfig: { cmake: 'release' },
        writePatchArtifact: true,
      },
    });
    expect(bridgeCalls[5]).toMatchObject({
      operation: 'attachArtifact',
      payload: {
        artifactType: 'benchmark_log',
        uri: 'runs/qg/source-audit.log',
        summary: 'Source audit log.',
        sizeBytes: '2048',
      },
    });
    expect(bridgeCalls[6]).toMatchObject({
      operation: 'recordReferenceLocation',
      payload: {
        connectorId: 'arxiv',
        locationType: 'paper_section',
        status: 'located',
      },
    });
    expect(bridgeCalls[7]).toMatchObject({
      operation: 'recordValidationResult',
      payload: {
        contractId: 'validation-contract-source-audit',
        checkedOutputs: ['source chain transcript'],
      },
    });
    expect(bridgeCalls[8]).toMatchObject({
      operation: 'recordSourceReconstructionReviewResult',
      payload: {
        claimId: 'claim-mipt-observer-algebra',
        reviewedComponents: ['definitions', 'source_locations'],
        basisRefs: ['source_asset:source-asset-algebra-paper'],
        referenceLocationIds: ['reference-location-algebra-paper'],
      },
    });
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.create_open_obligation',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:proof_obligation:proof-obligation-algebra-source-chain'],
        generatedObligationIds: ['proof-obligation-algebra-source-chain'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.register_source_asset',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:source_asset:source-asset-algebra-paper'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.record_evidence',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:evidence:evidence-source-audit'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.record_tool_run',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:tool_run:tool-run-source-audit'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.capture_code_state_auto',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:code_state:code-state-librpa'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.attach_artifact',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:artifact:artifact-source-audit-log'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.record_reference_location',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:reference_location:reference-location-algebra-paper'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.record_validation_result',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:validation_result:validation-result-source-audit'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.record_source_reconstruction_review_result',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: [
          'aitp:source_reconstruction_review_result:source-review-result-algebra',
        ],
      }),
    );
  });

  it('fails AITP write-bridge execution when no bridge is configured', async () => {
    const tool = new ResearchActionTool(makeAgent().researchAction);

    const result = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'requestHumanCheckpoint',
      aitp_payload: {
        topicId: 'qg',
        claimId: 'claim-qg',
        reason: 'Trust boundary.',
        requestedBy: 'hakimi',
        options: ['keep provisional'],
      },
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('AITP write bridge is not configured');
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
  it('exposes ResearchAction by default and hides it on explicit opt-out', () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'];
    try {
      process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'] = '0';
      const hidden = makeAgent();
      expect(hidden.tools.data().find((tool) => tool.name === 'ResearchAction')).toBeUndefined();

      delete process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'];
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
    readonly aitpWriteBridge?: AitpWriteBridgeExecutor | undefined;
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
    aitpWriteBridge: options.aitpWriteBridge,
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  agent.tools.initializeBuiltinTools();
  return agent;
}

function routeStateSlicePayload() {
  return {
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [],
    edges: [],
    open_obligations: [],
    source_backtrace: [],
    relation_neighborhood: [],
    exploratory_records: [],
    route_state: {
      active_route_id: 'route-live',
      routes: [
        {
          route_id: 'route-live',
          topic_id: 'route-state',
          claim_id: 'claim-route',
          title: 'Live route',
          route_type: 'source_backtrace',
          status: 'live',
          active: true,
          rationale: 'Backtrace first.',
          parent_route_ids: ['route-blocked'],
          pivot_reason: 'blocked route needs source backtrace',
        },
        {
          route_id: 'route-blocked',
          topic_id: 'route-state',
          claim_id: 'claim-route',
          title: 'Blocked route',
          route_type: 'derivation',
          status: 'blocked',
          rationale: 'Try direct derivation.',
          failure_modes: ['missing source'],
          lesson: 'Backtrace first.',
        },
      ],
      live_route_ids: ['route-live'],
      blocked_route_ids: ['route-blocked'],
      abandoned_route_ids: [],
      pivot_required_route_ids: ['route-live'],
    },
    source_asset_index: [
      {
        asset_id: 'source-asset-route-paper',
        topic_id: 'route-state',
        claim_id: 'claim-route',
        asset_type: 'paper',
        uri: 'arxiv:2601.00001',
        title: 'Route paper',
        hash_status: 'missing',
        target_refs: ['source_asset:source-asset-route-paper'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
    ],
    source_stack_coverage: {
      kind: 'source_stack_coverage_manifest',
      claim_count: 1,
      coverage_status_counts: {
        complete: 0,
        evidence_gap: 1,
        reconstruction_gap: 0,
        review_gap: 0,
      },
      missing_required_output_counts: {
        scoped_claim: 1,
        evidence_or_provenance: 1,
      },
      source_component_gap_counts: {
        reconstruction_path: 1,
      },
      source_review_status_counts: {
        pending: 1,
      },
      items: [
        {
          topic_id: 'route-state',
          claim_id: 'claim-route',
          claim_statement: 'Route claim requires source stack coverage.',
          risk_level: 'guided',
          required_outputs: ['scoped_claim', 'evidence_or_provenance'],
          satisfied_required_outputs: [],
          missing_required_outputs: ['scoped_claim', 'evidence_or_provenance'],
          evidence_ids_by_output: {
            scoped_claim: [],
            evidence_or_provenance: [],
          },
          source_reconstruction_complete: false,
          missing_source_components: ['reconstruction_path'],
          source_reconstruction_review_status: 'pending',
          latest_source_review_result_id: '',
          coverage_status: 'evidence_gap',
          next_actions: [
            'record_evidence_for_required_outputs:claim-route',
            'complete_source_reconstruction:claim-route',
            'review_source_reconstruction:claim-route',
          ],
          can_update_claim_trust: false,
        },
      ],
      next_actions: [
        'record_evidence_for_required_outputs:claim-route',
        'complete_source_reconstruction:claim-route',
        'review_source_reconstruction:claim-route',
      ],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    source_reconstruction_review: {
      kind: 'source_reconstruction_review_manifest',
      claim_count: 1,
      review_progress: {
        passed: 0,
        needs_revision: 0,
        inconclusive: 0,
        pending: 1,
      },
      items: [
        {
          topic_id: 'route-state',
          claim_id: 'claim-route',
          claim_statement: 'Route claim requires source reconstruction review.',
          source_reconstruction_status: 'incomplete',
          missing_components: ['reconstruction_path'],
          review_status: 'pending',
          review_result_ids: [],
          latest_review_result: {},
          reviewed_components: [],
          remaining_actions: [],
          review_packet_cli: 'aitp-v5 source reconstruction-review --claim claim-route',
          result_cli: 'aitp-v5 source reconstruction-review-result --claim claim-route <args>',
          next_actions: ['source_reconstruction_review', 'complete_source_reconstruction'],
          can_update_claim_trust: false,
        },
      ],
      next_actions: ['source_reconstruction_review:claim-route'],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    trust_boundary_reasons: [],
    recommended_moments: [],
    moment_policy: {
      kind: 'host_agnostic_moment_policy',
      decisions: [],
      recommended_moments: [],
    },
  };
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
