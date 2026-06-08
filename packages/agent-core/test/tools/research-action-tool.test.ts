import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import {
  AITP_CURATED_RAG_CATALOG_VERSION,
  AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
  compileAitpProcessGraphSlice,
  parseAitpCuratedRagCorpus,
  parseAitpCuratedRagPromotionDraft,
  parseAitpCuratedRagSearchResult,
  parseAitpRuntimePayloadProfilesCatalog,
  type AitpCuratedRagProvider,
  type AitpRuntimePayloadProfilesProvider,
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
        if (input.operation === 'ingestCuratedRagCorpus') {
          return {
            ok: true,
            kind: 'curated_rag_ingest_result',
            catalogVersion: 'aitp.v5.curated_rag_corpus.v1',
            stateEffect: 'curated_rag_manifest_write',
            truthSource: 'curated_rag_ingestion',
            corpusId: 'aitp.curated.qg_background.v1',
            manifestPath: 'F:/project/.aitp/curated_rag/corpus.json',
            indexPath: 'F:/project/.aitp/curated_rag/indexes/lexical_index.json',
            manifestHash: 'sha256:qg-background',
            indexStatus: 'fresh',
            documentCount: 1,
            chunkCount: 2,
            documentIds: ['curated_rag_doc:qg_notes'],
            chunkIds: ['curated_rag_chunk:qg_notes:0001', 'curated_rag_chunk:qg_notes:0002'],
            sourcePaths: ['F:/project/notes/qg.md'],
            rebuildIndex: true,
            retrievalRole: 'heuristic_context',
            orientationOnly: true,
            summaryInputsTrusted: false,
            canUpdateClaimTrust: false,
            recordsValidationResult: false,
            claimTrustMutation: 'none',
            requiresPromotionForClaimSupport: true,
            forbiddenUses: [
              'evidence_support',
              'validation_result',
              'claim_trust_update',
              'trust_apply',
              'final_gate_satisfaction',
            ],
            promotionRequiredBeforeClaimSupport: true,
            promotionPath: [
              'source_asset',
              'reference_location',
              'evidence',
              'validation',
              'trust_preflight',
            ],
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
        if (input.operation === 'captureToolRunAuto') {
          return {
            ok: true,
            kind: 'tool_run',
            runId: 'tool-run-source-audit-auto',
            recipeId: 'recipe-source-audit',
            toolFamily: 'source_audit',
            toolName: 'definition_backtrace',
            topicId: 'qg-algebra-mipt',
            claimId: 'claim-mipt-observer-algebra',
            evidenceStatus: 'unreviewed',
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
        if (input.operation === 'attachArtifactAuto') {
          return {
            ok: true,
            kind: 'artifact',
            artifactId: 'artifact-source-audit-log-auto',
            topicId: 'qg-algebra-mipt',
            claimId: 'claim-mipt-observer-algebra',
            artifactType: 'benchmark_log',
            uri: 'file:///F:/runs/qg/source-audit.log',
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
    const curatedRagIngest = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'ingestCuratedRagCorpus',
      aitp_payload: {
        paths: ['F:/project/notes/qg.md'],
        corpus_id: 'aitp.curated.qg_background.v1',
        tags: ['qg', 'orientation'],
        topic_hints: ['qg-algebra-mipt'],
        chunk_token_limit: 160,
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
    const toolRunAuto = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'captureToolRunAuto',
      aitp_payload: {
        path: 'F:/runs/source-audit/transcript.txt',
        recipe_id: 'recipe-source-audit',
        tool_family: 'source_audit',
        tool_name: 'definition_backtrace',
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        inputs: { target: 'split property' },
        summary: 'Source audit transcript.',
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
    const artifactAuto = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'attachArtifactAuto',
      aitp_payload: {
        path: 'F:/runs/qg/source-audit.log',
        topic_id: 'qg-algebra-mipt',
        claim_id: 'claim-mipt-observer-algebra',
        artifact_type: 'benchmark_log',
        artifact_summary: 'Source audit log.',
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
    expect(result.output).toContain('mcp_tool="aitp_v5_create_proof_obligation"');
    expect(result.output).toContain(
      'cli_fallback="aitp-v5 research-state create-proof-obligation &lt;args&gt;"',
    );
    expect(result.output).toContain('aitp:proof_obligation:proof-obligation-algebra-source-chain');
    expect(sourceAsset.output).toContain('operation="registerSourceAsset"');
    expect(sourceAsset.output).toContain('aitp:source_asset:source-asset-algebra-paper');
    expect(curatedRagIngest.output).toContain('operation="ingestCuratedRagCorpus"');
    expect(curatedRagIngest.output).toContain('state_effect="curated_rag_manifest_write"');
    expect(curatedRagIngest.output).toContain('mcp_tool="aitp_v5_ingest_curated_rag_corpus"');
    expect(curatedRagIngest.output).toContain('manifest_path="F:/project/.aitp/curated_rag/corpus.json"');
    expect(curatedRagIngest.output).toContain('retrieval_role="heuristic_context"');
    expect(curatedRagIngest.output).toContain('claim_trust_mutation="none"');
    expect(curatedRagIngest.output).toContain('must be promoted through source_asset');
    expect(curatedRagIngest.output).toContain('aitp:curated_rag_corpus:aitp.curated.qg_background.v1');
    expect(evidence.output).toContain('operation="recordEvidence"');
    expect(evidence.output).toContain('entrypoint_key="record_evidence"');
    expect(evidence.output).toContain('mcp_tool="aitp_v5_record_evidence"');
    expect(evidence.output).toContain('preferred_transport="mcp"');
    expect(evidence.output).toContain('fallback_transport="cli"');
    expect(evidence.output).toContain('state_effect="typed_record_write"');
    expect(evidence.output).toContain('claim_trust_mutation="none"');
    expect(evidence.output).toContain('aitp:evidence:evidence-source-audit');
    expect(toolRun.output).toContain('operation="recordToolRun"');
    expect(toolRun.output).toContain('aitp:tool_run:tool-run-source-audit');
    expect(toolRunAuto.output).toContain('operation="captureToolRunAuto"');
    expect(toolRunAuto.output).toContain('mcp_tool="aitp_v5_capture_tool_run_auto"');
    expect(toolRunAuto.output).toContain('aitp:tool_run:tool-run-source-audit-auto');
    expect(codeState.output).toContain('operation="captureCodeStateAuto"');
    expect(codeState.output).toContain('aitp:code_state:code-state-librpa');
    expect(artifact.output).toContain('operation="attachArtifact"');
    expect(artifact.output).toContain('aitp:artifact:artifact-source-audit-log');
    expect(artifactAuto.output).toContain('operation="attachArtifactAuto"');
    expect(artifactAuto.output).toContain('mcp_tool="aitp_v5_attach_artifact_auto"');
    expect(artifactAuto.output).toContain('aitp:artifact:artifact-source-audit-log-auto');
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
    expect(bridgeCalls).toHaveLength(12);
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
      operation: 'ingestCuratedRagCorpus',
      payload: {
        paths: ['F:/project/notes/qg.md'],
        corpusId: 'aitp.curated.qg_background.v1',
        tags: ['qg', 'orientation'],
        topicHints: ['qg-algebra-mipt'],
        chunkTokenLimit: 160,
      },
    });
    expect(bridgeCalls[3]).toMatchObject({
      operation: 'recordEvidence',
      payload: {
        evidenceType: 'source_reconstruction',
        supportsOutputs: ['definition path'],
        sourceRefs: ['reference_location:reference-location-algebra-paper'],
      },
    });
    expect(bridgeCalls[4]).toMatchObject({
      operation: 'recordToolRun',
      payload: {
        recipeId: 'recipe-source-audit',
        inputs: { target: 'split property' },
        outputs: { located: true },
      },
    });
    expect(bridgeCalls[5]).toMatchObject({
      operation: 'captureToolRunAuto',
      payload: {
        path: 'F:/runs/source-audit/transcript.txt',
        recipeId: 'recipe-source-audit',
        inputs: { target: 'split property' },
        summary: 'Source audit transcript.',
      },
    });
    expect(bridgeCalls[6]).toMatchObject({
      operation: 'captureCodeStateAuto',
      payload: {
        worktreePath: 'F:/repo/librpa',
        repoId: 'librpa',
        buildConfig: { cmake: 'release' },
        writePatchArtifact: true,
      },
    });
    expect(bridgeCalls[7]).toMatchObject({
      operation: 'attachArtifact',
      payload: {
        artifactType: 'benchmark_log',
        uri: 'runs/qg/source-audit.log',
        summary: 'Source audit log.',
        sizeBytes: '2048',
      },
    });
    expect(bridgeCalls[8]).toMatchObject({
      operation: 'attachArtifactAuto',
      payload: {
        path: 'F:/runs/qg/source-audit.log',
        artifactType: 'benchmark_log',
        summary: 'Source audit log.',
      },
    });
    expect(bridgeCalls[9]).toMatchObject({
      operation: 'recordReferenceLocation',
      payload: {
        connectorId: 'arxiv',
        locationType: 'paper_section',
        status: 'located',
      },
    });
    expect(bridgeCalls[10]).toMatchObject({
      operation: 'recordValidationResult',
      payload: {
        contractId: 'validation-contract-source-audit',
        checkedOutputs: ['source chain transcript'],
      },
    });
    expect(bridgeCalls[11]).toMatchObject({
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
        actionId: 'aitp.capture_tool_run_auto',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:tool_run:tool-run-source-audit-auto'],
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
        actionId: 'aitp.attach_artifact_auto',
        outcome: 'pass',
        workFrameId: 'frame.qg-mipt',
        evidenceRefs: ['aitp:artifact:artifact-source-audit-log-auto'],
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

  it('fails AITP runtime payload profile inspection when no provider is configured', async () => {
    const tool = new ResearchActionTool(makeAgent().researchAction);

    const result = await execute(tool, {
      action: 'inspect_aitp_runtime_payload_profiles',
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('AITP runtime payload profiles provider is not configured');
  });

  it('inspects AITP runtime payload profiles without recording evidence', async () => {
    const records: AgentRecord[] = [];
    const calls: string[] = [];
    const agent = makeAgent(records, {
      aitpRuntimePayloadProfilesProvider: {
        async getRuntimePayloadProfiles() {
          calls.push('read');
          return compileRuntimePayloadProfilesCatalogForTest();
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'inspect_aitp_runtime_payload_profiles',
    });

    expect(calls).toEqual(['read']);
    expect(result.output).toContain('<aitp_runtime_payload_profiles');
    expect(result.output).toContain('read_surface_effect="metadata_only"');
    expect(result.output).toContain('claim_trust_mutation="none"');
    expect(result.output).toContain('<use>trust_apply</use>');
    expect(result.output).toContain('profile_id="benchmark_adapter_run_to_tool_run"');
    expect(result.output).toContain('profile_id="primitive_tool_lifecycle_to_tool_run"');
    expect(result.output).toContain('action="capture_primitive_tool_run"');
    expect(records).not.toContainEqual(
      expect.objectContaining({ type: 'research_action.result_recorded' }),
    );
  });

  it('fails AITP curated RAG inspection and search when no provider is configured', async () => {
    const tool = new ResearchActionTool(makeAgent().researchAction);

    const inspected = await execute(tool, {
      action: 'inspect_aitp_curated_rag_corpus',
    });
    const searched = await execute(tool, {
      action: 'search_aitp_curated_rag_corpus',
      rag_query: 'source backtrace',
    });
    const drafted = await execute(tool, {
      action: 'draft_aitp_curated_rag_promotion',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
    });

    expect(inspected).toMatchObject({ isError: true });
    expect(inspected.output).toContain('AITP curated RAG provider is not configured');
    expect(searched).toMatchObject({ isError: true });
    expect(searched.output).toContain('AITP curated RAG provider is not configured');
    expect(drafted).toMatchObject({ isError: true });
    expect(drafted.output).toContain('AITP curated RAG provider is not configured');
  });

  it('inspects and searches AITP curated RAG as heuristic context without recording evidence', async () => {
    const records: AgentRecord[] = [];
    const calls: string[] = [];
    const agent = makeAgent(records, {
      aitpCuratedRagProvider: {
        async getCuratedRagCorpus() {
          calls.push('corpus');
          return parseAitpCuratedRagCorpus(fakeCuratedRagCorpus());
        },
        async searchCuratedRagCorpus(input) {
          calls.push(`search:${input.query}:${String(input.limit ?? '')}`);
          return parseAitpCuratedRagSearchResult(fakeCuratedRagSearchResult(input.query, input.limit));
        },
        async draftCuratedRagPromotion(input) {
          calls.push(`draft:${input.chunkId}:${input.topicId ?? ''}:${input.claimId ?? ''}`);
          return parseAitpCuratedRagPromotionDraft(
            fakeCuratedRagPromotionDraft(input.chunkId, {
              topicId: input.topicId,
              claimId: input.claimId,
              connectorId: input.connectorId,
            }),
          );
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const inspected = await execute(tool, {
      action: 'inspect_aitp_curated_rag_corpus',
    });
    const searched = await execute(tool, {
      action: 'search_aitp_curated_rag_corpus',
      rag_query: 'source backtrace',
      rag_limit: 1,
    });
    const drafted = await execute(tool, {
      action: 'draft_aitp_curated_rag_promotion',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'qg-algebra-mipt',
      aitp_claim_id: 'claim-mipt',
      aitp_connector_id: 'local_pdf',
    });

    expect(calls).toEqual([
      'corpus',
      'search:source backtrace:1',
      'draft:curated_rag_chunk:source_backtrace_orientation:0001:qg-algebra-mipt:claim-mipt',
    ]);
    expect(inspected.output).toContain('<aitp_curated_rag_corpus');
    expect(inspected.output).toContain('result_role="heuristic_context"');
    expect(inspected.output).toContain('read_surface_effect="orientation_only"');
    expect(inspected.output).toContain('claim_trust_mutation="none"');
    expect(inspected.output).toContain('requires_promotion_for_claim_support="true"');
    expect(inspected.output).toContain('<use>final_gate_satisfaction</use>');
    expect(inspected.output).toContain('mcp_tool="aitp_v5_get_curated_rag_corpus"');
    expect(searched.output).toContain('<aitp_curated_rag_search_result');
    expect(searched.output).toContain('query="source backtrace"');
    expect(searched.output).toContain('result_role="heuristic_context"');
    expect(searched.output).toContain('mcp_tool="aitp_v5_search_curated_rag_corpus"');
    expect(searched.output).toContain('Curated RAG is heuristic_context only');
    expect(searched.output).toContain('Retrieved passages suggest source reconstruction, not claim support.');
    expect(drafted.output).toContain('<aitp_curated_rag_promotion_draft');
    expect(drafted.output).toContain('chunk_id="curated_rag_chunk:source_backtrace_orientation:0001"');
    expect(drafted.output).toContain('topic_id="qg-algebra-mipt"');
    expect(drafted.output).toContain('claim_id="claim-mipt"');
    expect(drafted.output).toContain('mcp_tool="aitp_v5_draft_curated_rag_promotion"');
    expect(drafted.output).toContain('draft_creates_records="false"');
    expect(drafted.output).toContain('operation="registerSourceAsset"');
    expect(drafted.output).toContain('operation="recordReferenceLocation"');
    expect(drafted.output).toContain('operation="recordEvidence"');
    expect(drafted.output).toContain('operation="createValidationContract"');
    expect(drafted.output).toContain('operation="preflightTrustUpdate"');
    expect(drafted.output).toContain('creates_record_now="false"');
    expect(drafted.output).toContain('draft_can_update_claim_trust="false"');
    expect(records).not.toContainEqual(
      expect.objectContaining({ type: 'research_action.result_recorded' }),
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
    expect(result.output).toContain('<aitp_tool_run_capture status="skipped"');
    expect(result.output).toContain('AITP write bridge is not configured');
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

  it('records benchmark adapter runs as AITP tool_run provenance when the bridge is configured', async () => {
    const records: AgentRecord[] = [];
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const aitpWriteBridge: AitpWriteBridgeExecutor = {
      async executeWrite(input) {
        bridgeCalls.push(input);
        return {
          ok: true,
          kind: 'tool_run',
          runId: 'tool-run-benchmark',
          recipeId: 'benchmark_adapter:adapter.librpa.head-wing-smoke:case.librpa.head-wing-smoke',
          toolFamily: 'benchmark_adapter',
          toolName: 'adapter.librpa.head-wing-smoke',
          topicId: 'librpa-gw',
          claimId: 'claim-gw',
          evidenceStatus: 'unreviewed',
          raw: {},
        };
      },
    };
    const agent = makeAgent(records, { aitpWriteBridge });
    const tool = new ResearchActionTool(agent.researchAction);

    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.librpa-gw',
      domain: 'librpa',
      topic: 'librpa-gw',
      goal: 'Capture benchmark provenance for the GW claim.',
      active_object_ids: ['aitp:claim:claim-gw'],
    });
    const result = await execute(tool, {
      action: 'run_benchmark_adapter',
      adapter_id: 'adapter.librpa.head-wing-smoke',
      benchmark_case_id: 'case.librpa.head-wing-smoke',
      benchmark_payload: {
        expected: { head: 1, wing: 0.25 },
        observed: { head: 1, wing: 0.25 },
        tolerance: 1e-6,
      },
      source_refs: ['tool:vitest'],
    });

    expect(result.output).toContain('<aitp_tool_run_capture status="recorded"');
    expect(result.output).toContain('aitp:tool_run:tool-run-benchmark');
    expect(bridgeCalls).toHaveLength(1);
    expect(bridgeCalls[0]).toMatchObject({
      operation: 'recordToolRun',
      actionId: 'aitp.record_tool_run',
      callId: 'call.benchmark.run_minimal_case.call_research_action.aitp-tool-run',
      payload: {
        topicId: 'librpa-gw',
        claimId: 'claim-gw',
        recipeId: 'benchmark_adapter:adapter.librpa.head-wing-smoke:case.librpa.head-wing-smoke',
        toolFamily: 'benchmark_adapter',
        toolName: 'adapter.librpa.head-wing-smoke',
        outputs: {
          outcome: 'pass',
        },
        environment: {
          payloadProfile: 'benchmark_adapter_run_to_tool_run',
          canUpdateClaimTrust: false,
        },
      },
    });
    expect(bridgeCalls.some((call) => call.operation === 'recordValidationResult')).toBe(false);
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.record_tool_run',
        outcome: 'pass',
        evidenceRefs: ['aitp:tool_run:tool-run-benchmark'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'benchmark.run_minimal_case',
        outcome: 'pass',
        evidenceRefs: expect.arrayContaining([
          'benchmark:case.librpa.head-wing-smoke',
          'adapter.librpa.head-wing-smoke',
          'aitp:tool_run:tool-run-benchmark',
        ]),
      }),
    );
  });

  it('explicitly captures primitive tool lifecycle runs as AITP tool_run provenance', async () => {
    const records: AgentRecord[] = [];
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const aitpWriteBridge: AitpWriteBridgeExecutor = {
      async executeWrite(input) {
        bridgeCalls.push(input);
        return {
          ok: true,
          kind: 'tool_run',
          runId: 'tool-run-primitive-read',
          recipeId: 'primitive_tool:Read:call_read_mapping',
          toolFamily: 'primitive_tool',
          toolName: 'Read',
          topicId: 'librpa-gw',
          claimId: 'claim-gw',
          evidenceStatus: 'unreviewed',
          raw: {},
        };
      },
    };
    const agent = makeAgent(records, { aitpWriteBridge });
    const tool = new ResearchActionTool(agent.researchAction);

    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.librpa-gw',
      domain: 'librpa',
      topic: 'librpa-gw',
      goal: 'Capture primitive tool provenance for the GW claim.',
      active_object_ids: ['aitp:claim:claim-gw'],
      source_refs: ['source_asset:librpa-paper'],
    });
    await recordPrimitiveLifecycle(agent, {
      toolCallId: 'call_read_mapping',
      toolName: 'Read',
      outputSummary: 'Read src/gw/head-wing.ts and found the update.',
    });

    const result = await execute(tool, {
      action: 'capture_primitive_tool_run',
      primitive_tool_call_id: 'call_read_mapping',
      source_refs: ['tool:Read'],
    });

    expect(result.output).toContain('<aitp_primitive_tool_run_capture status="recorded"');
    expect(result.output).toContain('aitp:tool_run:tool-run-primitive-read');
    expect(bridgeCalls).toHaveLength(1);
    expect(bridgeCalls[0]).toMatchObject({
      operation: 'recordToolRun',
      actionId: 'aitp.record_tool_run',
      callId: 'call.aitp.capture_primitive_tool_run.call_research_action.aitp-tool-run',
      payload: {
        topicId: 'librpa-gw',
        claimId: 'claim-gw',
        recipeId: 'primitive_tool:Read:call_read_mapping',
        toolFamily: 'primitive_tool',
        toolName: 'Read',
        inputs: {
          argsSummary: '{"path":"src/gw/head-wing.ts"}',
          cwd: process.cwd(),
          sourceRefs: [
            'tool:Read',
            'source_asset:librpa-paper',
            'aitp:claim:claim-gw',
            'tool_call:call_read_mapping',
          ],
        },
        outputs: {
          toolCallId: 'call_read_mapping',
          status: 'passed',
          outputSummary: 'Read src/gw/head-wing.ts and found the update.',
        },
        environment: {
          captureTool: 'hakimi.primitive_tool_lifecycle',
          payloadProfile: 'primitive_tool_lifecycle_to_tool_run',
          summaryInputsTrusted: false,
          canUpdateClaimTrust: false,
        },
        evidenceStatus: 'unreviewed',
        sourceRefs: [
          'tool:Read',
          'source_asset:librpa-paper',
          'aitp:claim:claim-gw',
          'tool_call:call_read_mapping',
        ],
      },
    });
    expect(bridgeCalls.some((call) => call.operation === 'recordValidationResult')).toBe(false);
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.record_tool_run',
        outcome: 'pass',
        evidenceRefs: ['aitp:tool_run:tool-run-primitive-read'],
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.capture_primitive_tool_run',
        outcome: 'pass',
        primitiveToolCallIds: ['call_read_mapping'],
        evidenceRefs: ['aitp:tool_run:tool-run-primitive-read'],
      }),
    );
  });

  it('skips primitive tool AITP capture when no bridge is configured', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    await recordPrimitiveLifecycle(agent, {
      toolCallId: 'call_read_mapping',
      toolName: 'Read',
      outputSummary: 'Read output.',
    });
    const result = await execute(tool, {
      action: 'capture_primitive_tool_run',
      primitive_tool_call_id: 'call_read_mapping',
      topic: 'librpa-gw',
      aitp_payload: { claimId: 'claim-gw' },
    });

    expect(result.output).toContain('<aitp_primitive_tool_run_capture status="skipped"');
    expect(result.output).toContain('AITP write bridge is not configured');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.capture_primitive_tool_run',
        outcome: 'blocked',
        primitiveToolCallIds: ['call_read_mapping'],
        evidenceRefs: [],
      }),
    );
    expect(records).not.toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.record_tool_run',
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
    readonly aitpRuntimePayloadProfilesProvider?: AitpRuntimePayloadProfilesProvider | undefined;
    readonly aitpCuratedRagProvider?: AitpCuratedRagProvider | undefined;
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
    aitpRuntimePayloadProfilesProvider: options.aitpRuntimePayloadProfilesProvider,
    aitpCuratedRagProvider: options.aitpCuratedRagProvider,
    aitpWriteBridge: options.aitpWriteBridge,
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  agent.tools.initializeBuiltinTools();
  return agent;
}

function compileRuntimePayloadProfilesCatalogForTest() {
  return parseAitpRuntimePayloadProfilesCatalog(fakeRuntimePayloadProfilesCatalog());
}

function fakeRuntimePayloadProfilesCatalog(): any {
  const profiles = [
    {
      profile_id: 'benchmark_adapter_run_to_tool_run',
      host_event: 'benchmark_adapter_run',
      target_operation: 'recordToolRun',
      target_entrypoint: 'aitp_v5_record_tool_run',
      target_record_action: 'record_tool_run',
      target_surface: 'tool_run_record',
      required_host_fields: [
        'adapter_id',
        'case_id',
        'action_id',
        'outcome',
        'observation',
        'output',
        'topic_id',
        'claim_id',
      ],
      optional_host_fields: [
        'benchmark_payload',
        'check_results',
        'evidence_refs',
        'artifact_refs',
        'source_refs',
        'primitive_tool_call_ids',
      ],
      payload_key_case: 'camel_or_snake',
      capture_policy: fakeRuntimePayloadCapturePolicy(
        'controlled_auto',
        'ResearchAction.run_benchmark_adapter',
        false,
        'one_tool_run_per_adapter_run',
      ),
      payload_template: { tool_family: 'benchmark_adapter', evidence_status: 'unreviewed' },
      result_semantics: fakeRuntimePayloadResultSemantics(),
      strict_boundary: 'benchmark adapter outcome is tool-run provenance only',
    },
    {
      profile_id: 'primitive_tool_lifecycle_to_tool_run',
      host_event: 'primitive_tool_lifecycle_completed',
      target_operation: 'recordToolRun',
      target_entrypoint: 'aitp_v5_record_tool_run',
      target_record_action: 'record_tool_run',
      target_surface: 'tool_run_record',
      required_host_fields: [
        'tool_call_id',
        'tool_name',
        'status',
        'output_summary',
        'topic_id',
        'claim_id',
      ],
      optional_host_fields: [
        'args_summary',
        'cwd',
        'turn_id',
        'step_uuid',
        'duration_ms',
        'artifact_refs',
        'source_refs',
        'workframe_id',
        'action_call_id',
      ],
      payload_key_case: 'camel_or_snake',
      capture_policy: fakeRuntimePayloadCapturePolicy(
        'explicit_request',
        'ResearchAction.capture_primitive_tool_run',
        true,
        'one_tool_run_per_explicit_tool_call_id',
      ),
      payload_template: { tool_family: 'primitive_tool', evidence_status: 'unreviewed' },
      result_semantics: fakeRuntimePayloadResultSemantics(),
      strict_boundary: 'primitive tool lifecycle output is tool-run provenance only',
    },
  ];
  return {
    kind: 'runtime_payload_profiles',
    catalog_version: AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
    truth_source: 'runtime_payload_profile_catalog',
    summary_inputs_trusted: false,
    can_update_claim_trust: false,
    host_usage_policy: {
      read_surface_effect: 'metadata_only',
      allowed_uses: [
        'payload_construction',
        'capture_policy_diagnostics',
        'bridge_readiness_diagnostics',
      ],
      forbidden_uses: [
        'evidence_support',
        'validation_result',
        'claim_trust_update',
        'trust_apply',
        'bulk_auto_capture',
      ],
      records_validation_result: false,
      claim_trust_mutation: 'none',
      summary_inputs_trusted: false,
      can_update_claim_trust: false,
    },
    profile_count: profiles.length,
    profile_index: profiles.map((profile) => profile.profile_id),
    profiles,
  };
}

function fakeRuntimePayloadCapturePolicy(
  captureMode: string,
  hostTrigger: string,
  requiresToolCallId: boolean,
  captureGranularity: string,
): Record<string, unknown> {
  return {
    capture_mode: captureMode,
    host_trigger: hostTrigger,
    requires_configured_bridge: true,
    requires_scoped_topic_and_claim: true,
    requires_tool_call_id: requiresToolCallId,
    capture_granularity: captureGranularity,
    missing_scope_behavior: 'skip_with_reason',
    bulk_auto_capture: false,
    records_validation_result: false,
    claim_trust_mutation: 'none',
    summary_inputs_trusted: false,
    can_update_claim_trust: false,
  };
}

function fakeRuntimePayloadResultSemantics(): Record<string, unknown> {
  return {
    record_kind: 'tool_run',
    evidence_ref_prefix: 'aitp:tool_run',
    records_validation_result: false,
    claim_trust_mutation: 'none',
    can_update_claim_trust: false,
    summary_inputs_trusted: false,
  };
}

function fakeCuratedRagCorpus(): any {
  const documents = [
    {
      document_id: 'curated_rag_doc:theory_methods_orientation',
      title: 'Theory methods orientation shelf',
      asset_type: 'note',
      source_uri: 'aitp://curated-rag/theory-methods-orientation',
      version_anchor: { catalog_version: AITP_CURATED_RAG_CATALOG_VERSION, revision: 'v1' },
      content_hash: 'sha256:curated-rag-theory-methods-orientation-v1',
      tags: ['theoretical-physics', 'methods', 'orientation'],
      domain_hints: ['theoretical-physics/general'],
      topic_hints: ['method-selection', 'derivation-scaffolding'],
      language: 'en',
      priority: 'high',
      intended_use: 'background_rag',
      trust_status: 'heuristic_context',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    {
      document_id: 'curated_rag_doc:source_backtrace_orientation',
      title: 'Source backtrace orientation shelf',
      asset_type: 'lecture',
      source_uri: 'aitp://curated-rag/source-backtrace-orientation',
      version_anchor: { catalog_version: AITP_CURATED_RAG_CATALOG_VERSION, revision: 'v1' },
      content_hash: 'sha256:curated-rag-source-backtrace-orientation-v1',
      tags: ['source-reconstruction', 'literature', 'orientation'],
      domain_hints: ['theoretical-physics/general'],
      topic_hints: ['source-backtrace', 'literature-orientation'],
      language: 'en',
      priority: 'medium',
      intended_use: 'background_rag',
      trust_status: 'heuristic_context',
      orientation_only: true,
      can_update_claim_trust: false,
    },
  ];
  const chunks = [
    {
      chunk_id: 'curated_rag_chunk:theory_methods_orientation:0001',
      document_id: 'curated_rag_doc:theory_methods_orientation',
      anchor: { section: 'method-selection', ordinal: 1 },
      text: 'When a theory problem feels underdetermined, first separate definitions, assumptions, calculational handles, and validation targets.',
      summary: 'Use method selection to separate definitions, assumptions, handles, and validation.',
      tags: ['method-selection', 'problem-framing'],
      token_estimate: 32,
      content_hash: 'sha256:curated-rag-chunk-theory-methods-0001',
      retrieval_role: 'heuristic_context',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    {
      chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      document_id: 'curated_rag_doc:source_backtrace_orientation',
      anchor: { section: 'source-backtrace', ordinal: 1 },
      text: 'Retrieved passages can suggest where to look next, but claim support needs explicit reference locations and evidence records.',
      summary: 'Retrieved passages suggest source reconstruction, not claim support.',
      tags: ['source-backtrace', 'trust-boundary'],
      token_estimate: 38,
      content_hash: 'sha256:curated-rag-chunk-source-backtrace-0001',
      retrieval_role: 'heuristic_context',
      orientation_only: true,
      can_update_claim_trust: false,
    },
  ];
  return {
    kind: 'curated_rag_corpus',
    catalog_version: AITP_CURATED_RAG_CATALOG_VERSION,
    truth_source: 'curated_rag_corpus_catalog',
    summary_inputs_trusted: false,
    can_update_claim_trust: false,
    retrieval_policy: {
      result_role: 'heuristic_context',
      read_surface_effect: 'orientation_only',
      allowed_uses: [
        'conceptual_scaffolding',
        'literature_orientation',
        'derivation_scaffolding',
        'method_selection',
        'source_backtrace_suggestions',
      ],
      forbidden_uses: [
        'evidence_support',
        'validation_result',
        'claim_trust_update',
        'trust_apply',
        'final_gate_satisfaction',
      ],
      records_validation_result: false,
      claim_trust_mutation: 'none',
      summary_inputs_trusted: false,
      can_update_claim_trust: false,
      requires_promotion_for_claim_support: true,
    },
    index_policy: {
      active_index_mode: 'lexical_fixture',
      supported_index_modes: ['lexical_fixture'],
      embedding_index_required: false,
      index_is_derived: true,
      derived_from: 'curated_rag_chunk_manifest',
      stale_index_behavior: 'return_diagnostic_not_trust',
    },
    corpus_id: 'aitp.curated.heuristic_background.v1',
    document_count: documents.length,
    chunk_count: chunks.length,
    document_index: documents.map((document) => document.document_id),
    chunk_index: chunks.map((chunk) => chunk.chunk_id),
    documents,
    chunks,
  };
}

function fakeCuratedRagSearchResult(query: string, limit = 5): any {
  const corpus = fakeCuratedRagCorpus();
  const terms = query
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .split(/\s+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
  const scored = corpus.chunks
    .map((chunk: any) => {
      const haystack = [chunk.text, chunk.summary, chunk.tags.join(' '), chunk.document_id]
        .join(' ')
        .toLowerCase();
      return {
        chunk,
        score: Math.max(1, terms.filter((term) => haystack.includes(term)).length),
      };
    })
    .toSorted((left: any, right: any) => right.score - left.score);
  const results = scored.slice(0, limit).map(({ chunk, score }: any) => ({
    chunk_id: chunk.chunk_id,
    document_id: chunk.document_id,
    score,
    retrieval_role: 'heuristic_context',
    orientation_only: true,
    can_update_claim_trust: false,
    summary: chunk.summary,
    text: chunk.text,
    anchor: chunk.anchor,
    tags: chunk.tags,
    content_hash: chunk.content_hash,
  }));
  return {
    kind: 'curated_rag_search_result',
    catalog_version: AITP_CURATED_RAG_CATALOG_VERSION,
    query,
    index_mode: 'lexical_fixture',
    result_role: 'heuristic_context',
    summary_inputs_trusted: false,
    can_update_claim_trust: false,
    records_validation_result: false,
    claim_trust_mutation: 'none',
    requires_promotion_for_claim_support: true,
    result_count: results.length,
    results,
  };
}

function fakeCuratedRagPromotionDraft(
  chunkId: string,
  options: {
    readonly topicId?: string | undefined;
    readonly claimId?: string | undefined;
    readonly connectorId?: string | undefined;
  } = {},
): any {
  const corpus = fakeCuratedRagCorpus();
  const chunk = corpus.chunks.find((item: any) => item.chunk_id === chunkId) ?? corpus.chunks[0];
  const document =
    corpus.documents.find((item: any) => item.document_id === chunk.document_id) ?? corpus.documents[0];
  const topicId = options.topicId ?? '';
  const claimId = options.claimId ?? '';
  const connectorId = options.connectorId ?? 'curated_rag';
  return {
    kind: 'curated_rag_promotion_draft',
    catalog_version: AITP_CURATED_RAG_CATALOG_VERSION,
    truth_source: 'curated_rag_chunk_manifest',
    state_effect: 'read_only',
    draft_role: 'promotion_planning',
    retrieval_role: 'heuristic_context',
    read_surface_effect: 'orientation_only',
    summary_inputs_trusted: false,
    can_update_claim_trust: false,
    records_validation_result: false,
    claim_trust_mutation: 'none',
    requires_promotion_for_claim_support: true,
    promotion_required_before_claim_support: true,
    draft_creates_records: false,
    corpus_id: corpus.corpus_id,
    chunk_id: chunk.chunk_id,
    document_id: document.document_id,
    topic_id: topicId,
    claim_id: claimId,
    connector_id: connectorId,
    promotion_intent: 'claim_support_review',
    required_context_before_write: [topicId.length === 0 ? 'topic_id' : '', claimId.length === 0 ? 'claim_id' : ''].filter(Boolean),
    index_mode: 'lexical_fixture',
    stale_index_diagnostics: [],
    chunk: {
      chunk_id: chunk.chunk_id,
      document_id: chunk.document_id,
      anchor: chunk.anchor,
      summary: chunk.summary,
      text: chunk.text,
      tags: chunk.tags,
      content_hash: chunk.content_hash,
      retrieval_role: 'heuristic_context',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    document: {
      document_id: document.document_id,
      title: document.title,
      asset_type: document.asset_type,
      source_uri: document.source_uri,
      version_anchor: document.version_anchor,
      content_hash: document.content_hash,
      tags: document.tags,
      domain_hints: document.domain_hints,
      topic_hints: document.topic_hints,
      language: document.language,
      priority: document.priority,
      trust_status: 'heuristic_context',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    draft_operations: [
      fakeDraftOperation('source_asset', 'registerSourceAsset', 'aitp_v5_register_source_asset', 'source_asset_record'),
      fakeDraftOperation(
        'reference_location',
        'recordReferenceLocation',
        'aitp_v5_record_reference_location',
        'reference_location_record',
      ),
      fakeDraftOperation('evidence', 'recordEvidence', 'aitp_v5_record_evidence', 'evidence_record', [
        'source_asset_record',
        'reference_location_record',
      ]),
      fakeDraftOperation(
        'validation',
        'createValidationContract',
        'aitp_v5_create_validation_contract',
        'validation_contract_record',
        ['evidence_record'],
      ),
      fakeDraftOperation(
        'trust_preflight',
        'preflightTrustUpdate',
        'aitp_v5_preflight_trust_update',
        'trust_update_preflight',
        ['evidence_record', 'validation_result_record'],
      ),
    ],
    promotion_path: [
      'source_asset',
      'reference_location',
      'evidence',
      'validation',
      'trust_preflight',
    ],
    forbidden_uses: [
      'evidence_support',
      'validation_result',
      'claim_trust_update',
      'trust_apply',
      'final_gate_satisfaction',
    ],
    promotion_boundary: {
      retrieval_is_claim_support: false,
      draft_is_evidence: false,
      draft_records_validation_result: false,
      draft_satisfies_final_gate: false,
      draft_can_update_claim_trust: false,
      requires_user_or_model_decision_before_write: true,
    },
  };
}

function fakeDraftOperation(
  stage: string,
  operation: string,
  mcpTool: string,
  surface: string,
  requiresExistingRecords: readonly string[] = [],
): Record<string, unknown> {
  return {
    stage,
    operation,
    mcp_tool: mcpTool,
    cli_template: `aitp-v5 ${stage} <args>`,
    surface,
    draft_only: true,
    creates_record_now: false,
    claim_support_created: false,
    requires_existing_records: requiresExistingRecords,
    payload_template: {},
  };
}

async function recordPrimitiveLifecycle(
  agent: Agent,
  input: {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly outputSummary: string;
  },
): Promise<void> {
  agent.toolLifecycle.recordStarted({
    source: 'loop',
    turnId: 7,
    step: 2,
    stepUuid: 'step-read',
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    args: { path: 'src/gw/head-wing.ts' },
    cwd: process.cwd(),
  });
  await agent.toolLifecycle.recordCompleted({
    source: 'loop',
    turnId: 7,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    result: {
      output: input.outputSummary,
    },
  });
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
