import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import {
  AITP_CURATED_RAG_CATALOG_VERSION,
  AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
  compileAitpProcessGraphSlice,
  parseAitpCuratedRagCorpus,
  parseAitpCuratedRagChunk,
  parseAitpCuratedRagPromotionDraft,
  parseAitpCuratedRagSearchResult,
  parseAitpRecordRefLookup,
  parseAitpRuntimePayloadProfilesCatalog,
  type AitpCuratedRagProvider,
  type AitpRecordRefLookupProvider,
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
type ResearchActionToolArgs = Parameters<ResearchActionTool['resolveExecution']>[0];

describe('ResearchActionTool', () => {
  it('documents guarded AITP handoff remediation steps in the tool description', () => {
    const tool = new ResearchActionTool();

    expect(tool.description).toContain('handoff_guard_failure');
    expect(tool.description).toContain('carried_ref_handoff_failure');
    expect(tool.description).toContain('carried_ref_handoff_diagnostic_taxonomy');
    expect(tool.description).toContain('remediation_summary');
    expect(tool.description).toContain('copy_missing_handoff_field_from_draft');
    expect(tool.description).toContain('align_explicit_execute_args_with_handoff_tool_call');
    expect(tool.description).toContain('redraft_handoff_or_restore_hash_input');
    expect(tool.description).toContain('redraft_or_resolve_blocking_diagnostics');
    expect(tool.description).toContain('inspect_handoff_guard_remediation_taxonomy');
    expect(tool.description).toContain('repair hints only');
    expect(tool.description).toContain('never mutate the handoff');
  });

  it('inspects handoff guard remediation taxonomy without listing all actions', async () => {
    const tool = new ResearchActionTool();

    const taxonomy = await execute(tool, {
      action: 'inspect_handoff_guard_remediation_taxonomy',
    });

    expect(taxonomy.output).toContain('<handoff_guard_remediation_taxonomy');
    expect(taxonomy.output).toContain('kind="curated_rag_write_bridge_handoff"');
    expect(taxonomy.output).toContain('read_only="true"');
    expect(taxonomy.output).toContain('executes_write_now="false"');
    expect(taxonomy.output).toContain('mutates_handoff_now="false"');
    expect(taxonomy.output).toContain('records_evidence="false"');
    expect(taxonomy.output).toContain('validates_claim="false"');
    expect(taxonomy.output).toContain('claim_trust_mutation="none"');
    expect(taxonomy.output).toContain(
      '<failure code="missing_hash_input_json" next_step="copy_missing_handoff_field_from_draft" retry_requires_explicit_execute_call="true" />',
    );
    expect(taxonomy.output).toContain(
      '<failure code="hash_input_tool_call_mismatch" next_step="redraft_handoff_or_restore_hash_input" retry_requires_explicit_execute_call="true" />',
    );
    expect(taxonomy.output).not.toContain('<action id=');
    expect(taxonomy.output).not.toContain('trustApply');
  });

  it('lists handoff guard remediation taxonomy as read-only machine-readable metadata', async () => {
    const tool = new ResearchActionTool();

    const actions = await execute(tool, {
      action: 'list_actions',
    });

    expect(actions.output).toContain('<handoff_guard_remediation_taxonomy');
    expect(actions.output).toContain('kind="curated_rag_write_bridge_handoff"');
    expect(actions.output).toContain('read_only="true"');
    expect(actions.output).toContain('executes_write_now="false"');
    expect(actions.output).toContain('mutates_handoff_now="false"');
    expect(actions.output).toContain('records_evidence="false"');
    expect(actions.output).toContain('validates_claim="false"');
    expect(actions.output).toContain('claim_trust_mutation="none"');
    expect(actions.output).toContain(
      '<failure code="missing_handoff_id" next_step="copy_missing_handoff_field_from_draft" retry_requires_explicit_execute_call="true" />',
    );
    expect(actions.output).toContain(
      '<failure code="tool_call_payload_mismatch" next_step="align_explicit_execute_args_with_handoff_tool_call" retry_requires_explicit_execute_call="true" />',
    );
    expect(actions.output).toContain(
      '<failure code="diagnostic_hash_mismatch" next_step="redraft_handoff_or_restore_hash_input" retry_requires_explicit_execute_call="true" />',
    );
    expect(actions.output).toContain(
      '<failure code="blocked_handoff" next_step="redraft_or_resolve_blocking_diagnostics" retry_requires_explicit_execute_call="true" />',
    );
    expect(actions.output).toContain(
      '<failure code="unsupported_confirmation_status" next_step="inspect_handoff_guard_failure" retry_requires_explicit_execute_call="true" />',
    );
    expect(actions.output).not.toContain('trustApply');
  });

  it('lists carried-ref handoff diagnostic taxonomy as read-only metadata', async () => {
    const tool = new ResearchActionTool();

    const actions = await execute(tool, {
      action: 'list_actions',
    });

    expect(actions.output).toContain('<carried_ref_handoff_diagnostic_taxonomy');
    expect(actions.output).toContain('kind="promotion_carried_ref_handoff"');
    expect(actions.output).toContain('read_only="true"');
    expect(actions.output).toContain('executes_write_now="false"');
    expect(actions.output).toContain('renders_suggestion_now="false"');
    expect(actions.output).toContain('renders_next_call_pointer_now="false"');
    expect(actions.output).toContain('records_validation_result="false"');
    expect(actions.output).toContain('source_support_result="false"');
    expect(actions.output).toContain('claim_trust_mutation="none"');
    expect(actions.output).toContain(
      '<failure code="missing_canonical_ref" next_step="copy_required_handoff_field_from_execute_result" retry_requires_fresh_draft_action="true" />',
    );
    expect(actions.output).toContain(
      '<failure code="canonical_ref_dialect_or_kind_mismatch" next_step="use_next_payload_canonical_ref" retry_requires_fresh_draft_action="true" />',
    );
    expect(actions.output).toContain(
      '<failure code="evidence_ref_record_id_mismatch" next_step="use_evidence_ref_for_same_record" retry_requires_fresh_draft_action="true" />',
    );
    expect(actions.output).not.toContain('trustApply');
  });

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

  it('renders source context review outcomes as non-evidentiary routing', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.source-review',
      domain: 'topological-order/fqhe-cs',
      topic: 'fqhe-literature',
      goal: 'Review a carried ref before choosing the next action.',
    });
    const result = await execute(tool, {
      action: 'finish_action_call',
      action_id: 'source.review_context',
      call_id: 'call.source-review',
      outcome: 'inconclusive',
      action_output: {
        kind: 'source_review_context',
        decision: 'fresh_aitp_draft',
        rationale: 'The source looks relevant but the next support draft still needs explicit review.',
        reviewedRefs: [
          'evidence:evidence-reviewed-curated-rag',
          'aitp:evidence:evidence-reviewed-curated-rag',
          'claim:claim-fqhe',
          'chunk:chunk-fqhe-flux',
        ],
        candidateReviewedOverrideRefs: ['evidence:evidence-reviewed-curated-rag'],
        nextSuggestedActions: ['draft_aitp_curated_rag_write_bridge_call'],
        nonEvidentiaryBoundary: {
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
        },
      },
    });

    expect(result.output).toContain('<source_context_review_outcome');
    expect(result.output).toContain('decision="fresh_aitp_draft"');
    expect(result.output).toContain('next_action_id="draft_aitp_curated_rag_write_bridge_call"');
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('executes_write_now="false"');
    expect(result.output).toContain('records_validation_result="false"');
    expect(result.output).toContain('source_support_result="false"');
    expect(result.output).toContain('claim_trust_mutation="none"');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.call_finished',
        actionId: 'source.review_context',
        callId: 'call.source-review',
        outcome: 'inconclusive',
        workFrameId: 'frame.source-review',
        evidenceRefs: [],
        nextSuggestedActions: ['draft_aitp_curated_rag_write_bridge_call'],
        output: expect.objectContaining({
          kind: 'source_review_context',
          decision: 'fresh_aitp_draft',
          nonEvidentiaryBoundary: {
            recordsValidationResult: false,
            sourceSupportResult: false,
            claimTrustMutation: 'none',
            canUpdateClaimTrust: false,
          },
        }),
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

  it('renders curated RAG promotion draft suggestions in loaded ContextPack XML', async () => {
    const agent = makeAgent();
    const tool = new ResearchActionTool(agent.researchAction);

    agent.workFrames.open(
      {
        id: 'frame.rag-promotion',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Review whether a retrieved chunk should support claim-fqhe.',
        sourceRefs: ['aitp:claim:claim-fqhe'],
      },
      { source: 'controller' },
    );
    const pack = agent.researchContext.compileForWorkFrame(
      {
        curatedRag: typedCuratedRagSearchResult('claim support for FQHE'),
        curatedRagReasonIds: ['source_backtrace_suggestions'],
      },
      { source: 'controller' },
    );

    const loaded = await execute(tool, {
      action: 'load_context_pack',
      context_pack_id: pack.id,
    });

    expect(loaded.output).toContain('<aitp_curated_rag');
    expect(loaded.output).toContain('promotion_draft_suggested="true"');
    expect(loaded.output).toContain('<promotion_draft_bindings>');
    expect(loaded.output).toContain(
      '<binding>binding.aitp.curated-rag-promotion-draft.curated_rag_chunk-source_backtrace_orientation-0001</binding>',
    );
    expect(loaded.output).toContain('action_id="draft_aitp_curated_rag_promotion"');
    expect(loaded.output).toContain('&quot;ragChunkId&quot;:&quot;curated_rag_chunk:source_backtrace_orientation:0001&quot;');
    expect(loaded.output).toContain('&quot;draftCreatesRecords&quot;:false');
    expect(loaded.output).toContain('&quot;canUpdateClaimTrust&quot;:false');
    expect(loaded.output).toContain('&quot;requiresUserOrModelDecisionBeforeWrite&quot;:true');
  });

  it('renders carried-ref repair sequence reminders in loaded ContextPack XML', async () => {
    const agent = makeAgent();
    const tool = new ResearchActionTool(agent.researchAction);

    agent.workFrames.open(
      {
        id: 'frame.carried-ref-repair',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Repair curated RAG carried-ref promotion handoff inputs.',
      },
      { source: 'controller' },
    );
    const pack = agent.researchContext.compileForWorkFrame(
      {
        curatedRagCarriedRefRepairActive: true,
        curatedRagCarriedRefRepairTriggerTerms: [
          'promotion_carried_ref_handoffs',
          'mismatch',
        ],
        curatedRagCarriedRefRepairFailureCode: 'evidence_ref_record_id_mismatch',
        curatedRagCarriedRefRepairFailurePath: 'promotion_carried_ref_handoffs[0].evidence_ref',
      },
      { source: 'controller' },
    );

    const loaded = await execute(tool, {
      action: 'load_context_pack',
      context_pack_id: pack.id,
    });

    expect(loaded.output).toContain('<curated_rag_carried_ref_repair_sequence');
    expect(loaded.output).toContain('failure_code="evidence_ref_record_id_mismatch"');
    expect(loaded.output).toContain('failure_path="promotion_carried_ref_handoffs[0].evidence_ref"');
    expect(loaded.output).toContain('taxonomy_action="ResearchAction.list_actions"');
    expect(loaded.output).toContain('draft_action="ResearchAction.draft_aitp_curated_rag_write_bridge_call"');
    expect(loaded.output).toContain('readiness_action="ResearchAction.inspect_aitp_write_bridge_handoff_readiness"');
    expect(loaded.output).toContain('execute_action="ResearchAction.execute_aitp_write_bridge"');
    expect(loaded.output).toContain('executes_write_now="false"');
    expect(loaded.output).toContain('records_validation_result="false"');
    expect(loaded.output).toContain('source_support_result="false"');
    expect(loaded.output).toContain('claim_trust_mutation="none"');
    expect(loaded.output).toContain('<step>inspect taxonomy metadata</step>');
    expect(loaded.output).toContain('<step>execute only with explicit execute_aitp_write_bridge call</step>');
    expect(loaded.output).toContain('action_id="draft_aitp_curated_rag_write_bridge_call"');
    expect(loaded.output).toContain('adapter_id="aitp.curated-rag.carried-ref-repair-draft"');
    expect(loaded.output).toContain('&quot;failureCode&quot;:&quot;evidence_ref_record_id_mismatch&quot;');
    expect(loaded.output).toContain('&quot;failurePath&quot;:&quot;promotion_carried_ref_handoffs[0].evidence_ref&quot;');
    expect(loaded.output).toContain('&quot;requiresFreshDraftAction&quot;:true');
    expect(loaded.output).toContain('&quot;requiresExplicitChunkSelection&quot;:true');
    expect(loaded.output).toContain('&quot;requiresExplicitPromotionStageOrOperationSelection&quot;:true');
    expect(loaded.output).toContain('&quot;requiresReviewedOverrides&quot;:true');
    expect(loaded.output).toContain('&quot;requiresReadinessInspection&quot;:true');
    expect(loaded.output).toContain('&quot;requiresExplicitExecuteCall&quot;:true');
    expect(loaded.output).toContain('&quot;infersPayloadValues&quot;:false');
    expect(loaded.output).toContain('&quot;executesWriteNow&quot;:false');
    expect(loaded.output).toContain('&quot;recordsValidationResult&quot;:false');
    expect(loaded.output).toContain('&quot;sourceSupportResult&quot;:false');
    expect(loaded.output).toContain('&quot;claimTrustMutation&quot;:&quot;none&quot;');
  });

  it('renders carried-ref repair result continuation bindings in loaded ContextPack XML', async () => {
    const agent = makeAgent();
    const tool = new ResearchActionTool(agent.researchAction);

    agent.workFrames.open(
      {
        id: 'frame.carried-ref-repair-result',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Continue a repaired carried-ref promotion path.',
      },
      { source: 'controller' },
    );
    const pack = agent.researchContext.compileForWorkFrame(
      {
        curatedRagCarriedRefRepairResult: {
          source: 'execute_aitp_write_bridge_result',
          handoffId: 'curated-rag-write-handoff.chunk.evidence.hash',
          confirmationId: 'curated-rag-confirmation.chunk.evidence.hash',
          completedStage: 'evidence',
          completedOperation: 'recordEvidence',
          resultKind: 'evidence',
          recordId: 'evidence-reviewed-curated-rag',
          canonicalRef: 'evidence:evidence-reviewed-curated-rag',
          evidenceRef: 'aitp:evidence:evidence-reviewed-curated-rag',
          refKind: 'evidence',
          repairHintOperations: ['recordReferenceLocation'],
          selectedWriteDiffersFromRepairHints: true,
          readinessChecklistId:
            'readiness-checklist.curated_rag_write_call_draft.curated-rag-write-handoff.chunk.evidence.hash',
          reviewedOverridesRequired: true,
          readinessInspectionRequired: true,
          explicitExecutePrecheckPassed: true,
          bridgeCalled: true,
          resultWrittenByAitp: true,
          nextPayloadMutatedNow: false,
          nextWriteExecutedNow: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
          requiresExplicitNextDraft: true,
        },
      },
      { source: 'controller' },
    );

    const loaded = await execute(tool, {
      action: 'load_context_pack',
      context_pack_id: pack.id,
    });

    expect(loaded.output).toContain('<curated_rag_carried_ref_repair_result');
    expect(loaded.output).toContain('source="execute_aitp_write_bridge_result"');
    expect(loaded.output).toContain('completed_operation="recordEvidence"');
    expect(loaded.output).toContain('canonical_ref="evidence:evidence-reviewed-curated-rag"');
    expect(loaded.output).toContain('evidence_ref="aitp:evidence:evidence-reviewed-curated-rag"');
    expect(loaded.output).toContain('next_payload_mutated_now="false"');
    expect(loaded.output).toContain('next_write_executed_now="false"');
    expect(loaded.output).toContain('records_validation_result="false"');
    expect(loaded.output).toContain('source_support_result="false"');
    expect(loaded.output).toContain('claim_trust_mutation="none"');
    expect(loaded.output).toContain('requires_explicit_next_draft="true"');
    expect(loaded.output).toContain(
      'adapter_id="aitp.curated-rag.carried-ref-repair-result-source-context-review"',
    );
    expect(loaded.output).toContain('action_id="source.review_context"');
    expect(loaded.output).toContain('&quot;toolAction&quot;:&quot;ResearchAction.plan_primitive_tools&quot;');
    expect(loaded.output).toContain('&quot;reviewBeforeDraft&quot;:true');
    expect(loaded.output).toContain('&quot;requiresFreshDraftActionAfterReview&quot;:true');
    expect(loaded.output).toContain('adapter_id="aitp.curated-rag.carried-ref-repair-result-continuation"');
    expect(loaded.output).toContain('&quot;continuationSource&quot;:&quot;carried_ref_repair_result_summary&quot;');
    expect(loaded.output).toContain('&quot;candidateReviewedOverrideRef&quot;:&quot;evidence:evidence-reviewed-curated-rag&quot;');
    expect(loaded.output).toContain('&quot;requiresExplicitChunkSelection&quot;:true');
    expect(loaded.output).toContain('&quot;requiresExplicitPromotionStageOrOperationSelection&quot;:true');
    expect(loaded.output).toContain('&quot;mutatesNextPayloadNow&quot;:false');
    expect(loaded.output).toContain('&quot;executesWriteNow&quot;:false');
    expect(loaded.output).toContain('&quot;recordsValidationResult&quot;:false');
    expect(loaded.output).toContain('&quot;sourceSupportResult&quot;:false');
    expect(loaded.output).toContain('&quot;claimTrustMutation&quot;:&quot;none&quot;');
  });

  it('renders source context review outcome routing in loaded ContextPack XML', async () => {
    const agent = makeAgent();
    const tool = new ResearchActionTool(agent.researchAction);

    agent.workFrames.open(
      {
        id: 'frame.source-review-context-pack',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Load source review routing context.',
      },
      { source: 'controller' },
    );
    const pack = agent.researchContext.compileForWorkFrame(
      {
        sourceContextReviewOutcome: {
          source: 'ResearchAction.finish_action_call',
          actionId: 'source.review_context',
          callId: 'call.source-review',
          outcome: 'inconclusive',
          decision: 'validate_check_source_support',
          reviewedCanonicalRef: 'evidence:evidence-reviewed-curated-rag',
          reviewedEvidenceRef: 'aitp:evidence:evidence-reviewed-curated-rag',
          claimScope: 'claim:claim-fqhe',
          chunkScope: 'chunk:chunk-fqhe-flux',
          rationale: 'Needs source-support validation.',
          nextActionId: 'validate.check_source_support',
          requiresExplicitNextAction: true,
          bridgeCalled: false,
          executesWriteNow: false,
          mutatesNextPayloadNow: false,
          infersPayloadValues: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
        },
      },
      { source: 'controller' },
    );

    const loaded = await execute(tool, {
      action: 'load_context_pack',
      context_pack_id: pack.id,
    });

    expect(loaded.output).toContain('<source_context_review_outcome');
    expect(loaded.output).toContain('decision="validate_check_source_support"');
    expect(loaded.output).toContain('next_action_id="validate.check_source_support"');
    expect(loaded.output).toContain('records_validation_result="false"');
    expect(loaded.output).toContain('source_support_result="false"');
    expect(loaded.output).toContain('claim_trust_mutation="none"');
    expect(loaded.output).toContain('adapter_id="aitp.curated-rag.source-context-review-outcome"');
    expect(loaded.output).toContain('&quot;continuationSource&quot;:&quot;source_context_review_outcome&quot;');
    expect(loaded.output).toContain('&quot;requiresExplicitNextAction&quot;:true');
    expect(loaded.output).toContain('&quot;recordsValidationResult&quot;:false');
    expect(loaded.output).toContain('&quot;sourceSupportResult&quot;:false');
    expect(loaded.output).toContain('&quot;claimTrustMutation&quot;:&quot;none&quot;');
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
    const inspectedChunk = await execute(tool, {
      action: 'inspect_aitp_curated_rag_chunk',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
    });
    const drafted = await execute(tool, {
      action: 'draft_aitp_curated_rag_promotion',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
    });

    expect(inspected).toMatchObject({ isError: true });
    expect(inspected.output).toContain('AITP curated RAG provider is not configured');
    expect(searched).toMatchObject({ isError: true });
    expect(searched.output).toContain('AITP curated RAG provider is not configured');
    expect(inspectedChunk).toMatchObject({ isError: true });
    expect(inspectedChunk.output).toContain('AITP curated RAG provider is not configured');
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
        async getCuratedRagChunk(input) {
          calls.push(`chunk:${input.chunkId}`);
          return parseAitpCuratedRagChunk(fakeCuratedRagChunkLookup(input.chunkId));
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
    const inspectedChunk = await execute(tool, {
      action: 'inspect_aitp_curated_rag_chunk',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
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
      'chunk:curated_rag_chunk:source_backtrace_orientation:0001',
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
    expect(inspectedChunk.output).toContain('<aitp_curated_rag_chunk');
    expect(inspectedChunk.output).toContain('chunk_id="curated_rag_chunk:source_backtrace_orientation:0001"');
    expect(inspectedChunk.output).toContain('document_id="curated_rag_doc:source_backtrace_orientation"');
    expect(inspectedChunk.output).toContain('mcp_tool="aitp_v5_get_curated_rag_chunk"');
    expect(inspectedChunk.output).toContain('surface="curated_rag_chunk"');
    expect(inspectedChunk.output).toContain('lookup_creates_records="false"');
    expect(inspectedChunk.output).toContain('records_validation_result="false"');
    expect(inspectedChunk.output).toContain('lookup_can_update_claim_trust="false"');
    expect(inspectedChunk.output).toContain('content_hash="sha256:curated-rag-chunk-source-backtrace-0001"');
    expect(inspectedChunk.output).toContain('source_uri="aitp://curated-rag/source-backtrace-orientation"');
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

  it('drafts AITP curated RAG promotion from a ContextPack action binding', async () => {
    const records: AgentRecord[] = [];
    const calls: string[] = [];
    const agent = makeAgent(records, {
      aitpCuratedRagProvider: {
        async getCuratedRagCorpus() {
          throw new Error('not used');
        },
        async searchCuratedRagCorpus() {
          throw new Error('not used');
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
    agent.workFrames.open(
      {
        id: 'frame.rag-promotion',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Review whether a retrieved chunk should support claim-fqhe.',
        sourceRefs: ['aitp:claim:claim-fqhe'],
      },
      { source: 'controller' },
    );
    const pack = agent.researchContext.compileForWorkFrame(
      {
        curatedRag: typedCuratedRagSearchResult('claim support for FQHE'),
        curatedRagReasonIds: ['source_backtrace_suggestions'],
      },
      { source: 'controller' },
    );
    const bindingId = pack.curatedRag?.promotionDraftBindingIds[0];

    const drafted = await execute(tool, {
      action: 'draft_aitp_curated_rag_promotion',
      context_pack_id: pack.id,
      action_binding_id: bindingId,
    });

    expect(calls).toEqual([
      'draft:curated_rag_chunk:source_backtrace_orientation:0001:fqhe-literature:claim-fqhe',
    ]);
    expect(drafted.output).toContain('<aitp_curated_rag_promotion_draft');
    expect(drafted.output).toContain(`action_binding_id="${bindingId}"`);
    expect(drafted.output).toContain('<promotion_decision_tree');
    expect(drafted.output).toContain('selected_write_executed="false"');
    expect(drafted.output).toContain('requires_explicit_next_write_choice="true"');
    expect(drafted.output).toContain('<promotion_write_sequence');
    expect(drafted.output).toContain('source="aitp_curated_rag_promotion_draft"');
    expect(drafted.output).toContain('step_count="5"');
    expect(drafted.output).toContain('output_ref="source_asset:&lt;asset_id&gt;"');
    expect(drafted.output).toContain('requires_prior_refs="source_asset:&lt;asset_id&gt;,reference_location:&lt;location_id&gt;"');
    expect(drafted.output).toContain('next_research_action="execute_aitp_write_bridge" aitp_operation="registerSourceAsset"');
    expect(drafted.output).toContain('aitp_operation="recordReferenceLocation"');
    expect(drafted.output).toContain('aitp_operation="recordEvidence"');
    expect(drafted.output).toContain('aitp_operation="createValidationContract"');
    expect(drafted.output).toContain('aitp_operation="preflightTrustUpdate"');
    expect(drafted.output).toContain('Only execute this as a separate explicit AITP write/preflight bridge call');
    expect(drafted.output).toContain('<canonical_identity_alignment');
    expect(drafted.output).toContain('alignment_role="promotion_draft"');
    expect(drafted.output).toContain('draft_creates_records="false"');
    expect(drafted.output).toContain('future_record_kind="source_asset_record"');
    expect(drafted.output).toContain('canonical_ref_prefix="source_asset:"');
    expect(drafted.output).toContain('future_record_kind="reference_location_record"');
    expect(drafted.output).toContain('canonical_ref_prefix="reference_location:"');
    expect(drafted.output).toContain('future_record_kind="evidence_record"');
    expect(drafted.output).toContain('canonical_ref_prefix="evidence:"');
    expect(drafted.output).toContain('id_source="aitp_write_result_after_explicit_execute"');
    expect(records).not.toContainEqual(
      expect.objectContaining({ type: 'research_action.result_recorded' }),
    );
  });

  it('drafts a selected curated RAG promotion option as an unexecuted write-bridge call', async () => {
    const records: AgentRecord[] = [];
    const calls: string[] = [];
    const agent = makeAgent(records, {
      aitpCuratedRagProvider: {
        async getCuratedRagCorpus() {
          throw new Error('not used');
        },
        async searchCuratedRagCorpus() {
          throw new Error('not used');
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
      aitpWriteBridge: {
        async executeWrite() {
          throw new Error('write bridge must not be called by draft action');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);
    agent.workFrames.open(
      {
        id: 'frame.rag-write-draft',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Review whether a retrieved chunk should support claim-fqhe.',
        sourceRefs: ['aitp:claim:claim-fqhe'],
      },
      { source: 'controller' },
    );
    const pack = agent.researchContext.compileForWorkFrame(
      {
        curatedRag: typedCuratedRagSearchResult('claim support for FQHE'),
        curatedRagReasonIds: ['source_backtrace_suggestions'],
      },
      { source: 'controller' },
    );
    const bindingId = pack.curatedRag?.promotionDraftBindingIds[0];

    const result = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      context_pack_id: pack.id,
      action_binding_id: bindingId,
      promotion_draft_stage: 'evidence',
    });

    expect(calls).toEqual([
      'draft:curated_rag_chunk:source_backtrace_orientation:0001:fqhe-literature:claim-fqhe',
    ]);
    expect(result.output).toContain('<aitp_curated_rag_write_bridge_call_draft');
    expect(result.output).toContain(`action_binding_id="${bindingId}"`);
    expect(result.output).toContain('stage="evidence"');
    expect(result.output).toContain('aitp_operation="recordEvidence"');
    expect(result.output).toContain('confirmation_status="blocked"');
    expect(result.output).toContain('execute_call_allowed_after_explicit_confirmation="false"');
    expect(result.output).toContain('executes_write_now="false"');
    expect(result.output).toContain('selected_write_executed="false"');
    expect(result.output).toContain('<promotion_write_sequence');
    expect(result.output).toContain('requires_explicit_execute_call="true"');
    expect(result.output).toContain('stage="evidence" operation="recordEvidence"');
    expect(result.output).toContain('selected="true"');
    expect(result.output).toContain('output_ref="evidence:&lt;evidence_id&gt;"');
    expect(result.output).toContain('requires_prior_refs="source_asset:&lt;asset_id&gt;,reference_location:&lt;location_id&gt;"');
    expect(result.output).toContain('<canonical_identity_alignment');
    expect(result.output).toContain('alignment_role="selected_write_bridge_call"');
    expect(result.output).toContain('draft_creates_records="false"');
    expect(result.output).toContain('future_record_kind="evidence_record"');
    expect(result.output).toContain('canonical_ref_prefix="evidence:"');
    expect(result.output).toContain('existing_record_required_count="2"');
    expect(result.output).toContain('placeholder_ref_count="2"');
    expect(result.output).toContain('confirmation_source="syntax_only"');
    expect(result.output).toContain('aitp_lookup_performed="false"');
    expect(result.output).toContain('requires_aitp_lookup_before_execution="true"');
    expect(result.output).toContain('<record>source_asset_record</record>');
    expect(result.output).toContain('<record>reference_location_record</record>');
    expect(result.output).toContain('<field>source_refs</field>');
    expect(result.output).toContain('<payload_ref_readiness');
    expect(result.output).toContain('<ref status="placeholder" aitp_record_confirmed="false">&lt;source_asset_id&gt;</ref>');
    expect(result.output).toContain('<ref status="placeholder" aitp_record_confirmed="false">&lt;reference_location_id&gt;</ref>');
    expect(result.output).toContain('<confirmation_preflight status="blocked"');
    expect(result.output).toContain('missing_ref_repair_hint_count="0"');
    expect(result.output).toContain('missing_ref_repair_checklist_present="false"');
    expect(result.output).toContain('repair_hint_operation_count="0"');
    expect(result.output).toContain('repair_hint_operations=""');
    expect(result.output).toContain('selected_write_differs_from_repair_hints="false"');
    expect(result.output).toContain('<hard_blocking_diagnostics');
    expect(result.output).toMatch(
      /handoff_id="curated-rag-write-handoff\.curated_rag_chunk-source_backtrace_orientation-0001\.evidence\.recordEvidence\.[0-9a-f]{16}"/,
    );
    expect(result.output).toMatch(/confirmation_id="curated-rag-confirmation\.[^"]+\.[0-9a-f]{16}"/);
    expect(result.output).toMatch(/diagnostic_hash="sha256:[0-9a-f]{16}"/);
    expect(result.output).toContain('<readiness_call_pointer');
    expect(result.output).toContain('action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(result.output).toContain('source="execute_aitp_write_bridge_handoff.readiness_call_json"');
    expect(result.output).toContain('read_only="true"');
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('source_support_result="false"');
    expect(result.output).toContain('<readiness_inspection_summary');
    expect(result.output).toContain('draft_family="curated_rag_write_call_draft"');
    expect(result.output).toContain('root_pointer="readiness_call_pointer"');
    expect(result.output).toContain('nested_call="execute_aitp_write_bridge_handoff.readiness_call_json"');
    expect(result.output).toContain('inspection_only="true"');
    expect(result.output).toContain('<readiness_inspection_checklist');
    expect(result.output).toContain(
      'checklist_id="readiness-checklist.curated_rag_write_call_draft.curated-rag-write-handoff.',
    );
    expect(result.output).toContain('draft_family="curated_rag_write_call_draft"');
    expect(result.output).toContain('id_source="handoff_id+draft_family"');
    expect(result.output).toContain('item_count="2"');
    expect(result.output).toContain('execute_call_authorized="false"');
    expect(result.output).toContain(
      '<inspection_item order="1" action="inspect_aitp_write_bridge_handoff_readiness"',
    );
    expect(result.output).toContain('copy_call_from="execute_aitp_write_bridge_handoff.readiness_call_json"');
    expect(result.output).toContain(
      '<inspection_item order="2" action="execute_aitp_write_bridge" source="tool_call_json" allowed_only_after_readiness_passes="true"',
    );
    expect(result.output).toContain('checklist_authorizes_execution="false"');
    const pointerIndex = String(result.output).indexOf('<readiness_call_pointer');
    const summaryIndex = String(result.output).indexOf('<readiness_inspection_summary');
    const checklistIndex = String(result.output).indexOf('<readiness_inspection_checklist');
    const handoffIndex = String(result.output).indexOf('<execute_aitp_write_bridge_handoff');
    expect(pointerIndex).toBeLessThan(summaryIndex);
    expect(summaryIndex).toBeLessThan(checklistIndex);
    expect(checklistIndex).toBeLessThan(handoffIndex);
    expect(result.output).toContain('<execute_aitp_write_bridge_handoff');
    expect(result.output).toContain('confirmation_status="blocked"');
    expect(result.output).toContain('hash_algorithm="sha256"');
    expect(result.output).toContain('handoff_executed="false"');
    expect(result.output).toContain('non_execution_provenance="draft_only"');
    expect(result.output).toContain('<non_execution_provenance_json>');
    expect(result.output).toContain('<readiness_call_json>');
    expect(result.output).toContain('&quot;action&quot;:&quot;inspect_aitp_write_bridge_handoff_readiness&quot;');
    expect(result.output).toContain('&quot;requiresExplicitExecuteCall&quot;:true');
    expect(result.output).toContain('&quot;action&quot;:&quot;execute_aitp_write_bridge&quot;');
    expect(result.output).toContain('&quot;aitp_operation&quot;:&quot;recordEvidence&quot;');
    expect(result.output).toContain('&quot;source_refs&quot;:[&quot;&lt;source_asset_id&gt;&quot;,&quot;&lt;reference_location_id&gt;&quot;]');
    expect(result.output).toContain('code="placeholder_value" field="source_refs[0]"');
    expect(result.output).toContain('code="requires_existing_record" field="source_asset_record"');
    expect(result.output).toContain('code="manual_review_required"');
    expect(records).not.toContainEqual(
      expect.objectContaining({ type: 'research_action.result_recorded' }),
    );
  });

  it('accepts concrete carried-ref repair bindings for curated RAG write-call drafts', async () => {
    const records: AgentRecord[] = [];
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(records, {
      aitpCuratedRagProvider: curatedRagPromotionDraftProvider(),
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          throw new Error('write bridge must not be called by draft action');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);
    agent.workFrames.open(
      {
        id: 'frame.rag-carried-ref-repair-draft',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Repair a carried-ref handoff failure for claim-fqhe.',
      },
      { source: 'controller' },
    );
    const pack = agent.researchContext.compileForWorkFrame(
      {
        curatedRagCarriedRefRepairActive: true,
        curatedRagCarriedRefRepairTriggerTerms: [
          'carried_ref_handoff_failure',
          'mismatch',
        ],
        curatedRagCarriedRefRepairFailureCode: 'evidence_ref_record_id_mismatch',
        curatedRagCarriedRefRepairFailurePath: 'promotion_carried_ref_handoffs[0].evidence_ref',
      },
      { source: 'controller' },
    );
    const bindingId = pack.actionBindings.find(
      (binding) => binding.adapterId === 'aitp.curated-rag.carried-ref-repair-draft',
    )?.id;

    const result = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      context_pack_id: pack.id,
      action_binding_id: bindingId,
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_stage: 'evidence',
      promotion_reviewed_overrides: {
        source_refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
      },
    });

    expect(result.output).toContain('<aitp_curated_rag_write_bridge_call_draft');
    expect(result.output).toContain(`action_binding_id="${bindingId}"`);
    expect(result.output).toContain('stage="evidence"');
    expect(result.output).toContain('aitp_operation="recordEvidence"');
    expect(result.output).toContain('executes_write_now="false"');
    expect(result.output).toContain('selected_write_executed="false"');
    expect(result.output).toContain('requires_explicit_execute_call="true"');
    expect(bridgeCalls).toEqual([]);
    expect(records).not.toContainEqual(
      expect.objectContaining({ type: 'research_action.result_recorded' }),
    );
  });

  it('compares reviewed overrides against the original curated RAG write-bridge call draft', async () => {
    const records: AgentRecord[] = [];
    const calls: string[] = [];
    const agent = makeAgent(records, {
      aitpCuratedRagProvider: {
        async getCuratedRagCorpus() {
          throw new Error('not used');
        },
        async searchCuratedRagCorpus() {
          throw new Error('not used');
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
      aitpWriteBridge: {
        async executeWrite() {
          throw new Error('write bridge must not be called by draft action');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_operation: 'recordEvidence',
      promotion_reviewed_overrides: {
        source_refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
        summary: 'Reviewed source passage supports only the scoped claim fragment.',
      },
    });

    expect(calls).toEqual([
      'draft:curated_rag_chunk:source_backtrace_orientation:0001:fqhe-literature:claim-fqhe',
    ]);
    expect(result.output).toContain('reviewed_override_count="2"');
    expect(result.output).toContain('original_unresolved_placeholder_count="2"');
    expect(result.output).toContain('unresolved_placeholder_count="0"');
    expect(result.output).toContain('confirmation_status="needs_explicit_confirmation"');
    expect(result.output).toContain('execute_call_allowed_after_explicit_confirmation="true"');
    expect(result.output).toContain('reviewed_overrides_executed="false"');
    expect(result.output).toContain('<canonical_identity_alignment');
    expect(result.output).toContain('alignment_role="selected_write_bridge_call"');
    expect(result.output).toContain('future_record_kind="evidence_record"');
    expect(result.output).toContain('placeholder_ref_count="0"');
    expect(result.output).toContain('concrete_ref_count="4"');
    expect(result.output).toContain('confirmation_source="syntax_only"');
    expect(result.output).toContain('aitp_lookup_performed="false"');
    expect(result.output).toContain('requires_aitp_lookup_before_execution="true"');
    expect(result.output).toContain('<ref status="concrete" aitp_record_confirmed="false">source_asset:asset-reviewed</ref>');
    expect(result.output).toContain('<ref status="concrete" aitp_record_confirmed="false">reference_location:loc-reviewed</ref>');
    expect(result.output).toContain('<confirmation_preflight status="needs_explicit_confirmation"');
    expect(result.output).toContain('missing_ref_repair_hint_count="0"');
    expect(result.output).toContain('missing_ref_repair_checklist_present="false"');
    expect(result.output).toContain('repair_hint_operation_count="0"');
    expect(result.output).toContain('repair_hint_operations=""');
    expect(result.output).toContain('selected_write_differs_from_repair_hints="false"');
    expect(result.output).toContain('hard_blocking_count="0"');
    expect(result.output).toContain('<hard_blocking_diagnostics />');
    expect(result.output).toContain('<confirmation_required_diagnostics');
    expect(result.output).toMatch(
      /handoff_id="curated-rag-write-handoff\.curated_rag_chunk-source_backtrace_orientation-0001\.evidence\.recordEvidence\.[0-9a-f]{16}"/,
    );
    expect(result.output).toMatch(/diagnostic_hash="sha256:[0-9a-f]{16}"/);
    expect(result.output).toContain('<readiness_call_pointer');
    expect(result.output).toContain('action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(result.output).toContain('source="execute_aitp_write_bridge_handoff.readiness_call_json"');
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('<readiness_inspection_summary');
    expect(result.output).toContain('draft_family="curated_rag_write_call_draft"');
    expect(result.output).toContain('inspection_action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(result.output).toContain('inspection_only="true"');
    expect(result.output).toContain('<execute_aitp_write_bridge_handoff');
    expect(result.output).toContain('confirmation_status="needs_explicit_confirmation"');
    expect(result.output).toContain('handoff_executed="false"');
    expect(result.output).toContain('requires_explicit_execute_call="true"');
    expect(result.output).toContain('<tool_call_json>');
    expect(result.output).toContain('<non_execution_provenance_json>');
    expect(result.output).toContain('&quot;reviewedOverrideCount&quot;:2');
    expect(result.output).toContain('&quot;handoffExecuted&quot;:false');
    expect(result.output).toContain('<original_payload_json>');
    expect(result.output).toContain('&quot;source_refs&quot;:[&quot;&lt;source_asset_id&gt;&quot;,&quot;&lt;reference_location_id&gt;&quot;]');
    expect(result.output).toContain('<reviewed_overrides_json>');
    expect(result.output).toContain('source_asset:asset-reviewed');
    expect(result.output).toContain('<reviewed_payload_json>');
    expect(result.output).toContain('Reviewed source passage supports only the scoped claim fragment.');
    expect(result.output).toContain('code="reviewed_override_applied" field="source_refs"');
    expect(result.output).toContain('code="reviewed_override_resolves_placeholder" field="source_refs[0]"');
    expect(result.output).toContain('code="reviewed_overrides_not_executed"');
    expect(result.output).not.toContain('code="missing_sequence_prior_ref"');
    expect(result.output).not.toContain('code="placeholder_value" field="source_refs[0]"');
    expect(records).not.toContainEqual(
      expect.objectContaining({ type: 'research_action.result_recorded' }),
    );
  });

  it('blocks curated RAG evidence call drafts that miss AITP sequence prior refs', async () => {
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: curatedRagPromotionDraftProvider(),
      aitpWriteBridge: {
        async executeWrite() {
          throw new Error('write bridge must not be called by draft action');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_operation: 'recordEvidence',
      promotion_reviewed_overrides: {
        source_refs: ['source_asset:asset-reviewed'],
        summary: 'Reviewed source passage supports only the scoped claim fragment.',
      },
    });

    expect(result.output).toContain('confirmation_status="blocked"');
    expect(result.output).toContain('execute_call_allowed_after_explicit_confirmation="false"');
    expect(result.output).toContain('code="missing_sequence_prior_ref" field="reference_location"');
    expect(result.output).toContain(
      'AITP promotion_write_sequence requires a reference_location ref matching reference_location:&lt;location_id&gt; before executing recordEvidence.',
    );
    expect(result.output).toContain('<promotion_write_sequence');
    expect(result.output).toContain('stage="evidence" operation="recordEvidence"');
    expect(result.output).toContain('selected="true"');
    expect(result.output).not.toContain('code="missing_sequence_prior_ref" field="source_asset"');
  });

  it('renders carried refs as reviewed override suggestions without mutating the draft payload', async () => {
    const records: AgentRecord[] = [];
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(records, {
      aitpCuratedRagProvider: curatedRagPromotionDraftProvider(),
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          throw new Error('write bridge must not be called by draft action');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_operation: 'recordEvidence',
      promotion_carried_ref_handoffs: [
        {
          canonical_ref: 'source_asset:asset-reviewed',
          evidence_ref: 'aitp:source_asset:asset-reviewed',
          ref_kind: 'source_asset',
          record_id: 'asset-reviewed',
          completed_stage: 'source_asset',
        },
        {
          canonical_ref: 'reference_location:loc-reviewed',
          evidence_ref: 'aitp:reference_location:loc-reviewed',
          ref_kind: 'reference_location',
          record_id: 'loc-reviewed',
          completed_stage: 'reference_location',
        },
      ],
    });

    expect(result.output).toContain('reviewed_override_count="0"');
    expect(result.output).toContain('confirmation_status="blocked"');
    expect(result.output).toContain('<promotion_carried_ref_suggestions');
    expect(result.output).toContain('carried_ref_count="2"');
    expect(result.output).toContain('used_ref_count="2"');
    expect(result.output).toContain('unused_ref_count="0"');
    expect(result.output).toContain('target_field="source_refs"');
    expect(result.output).toContain('applied_to_payload="false"');
    expect(result.output).toContain('applied_by_reviewed_override="false"');
    expect(result.output).toContain('carry_into="promotion_reviewed_overrides"');
    expect(result.output).toContain('requires_reviewed_override="true"');
    expect(result.output).toContain('executes_write_now="false"');
    expect(result.output).toContain('next_write_executed_now="false"');
    expect(result.output).toContain('records_validation_result="false"');
    expect(result.output).toContain('source_support_result="false"');
    expect(result.output).toContain('claim_trust_mutation="none"');
    expect(result.output).toContain('can_update_claim_trust="false"');
    expect(result.output).toContain('requires_explicit_execute_call="true"');
    expect(result.output).toContain('<ref>source_asset:asset-reviewed</ref>');
    expect(result.output).toContain('<ref>reference_location:loc-reviewed</ref>');
    expect(result.output).toContain(
      '<suggested_reviewed_overrides_json>{&quot;source_refs&quot;:[&quot;source_asset:asset-reviewed&quot;,&quot;reference_location:loc-reviewed&quot;]}</suggested_reviewed_overrides_json>',
    );
    expect(result.output).toContain('<carried_ref_next_call_pointer');
    expect(result.output).toContain('action="draft_aitp_curated_rag_write_bridge_call"');
    expect(result.output).toContain('rag_chunk_id="curated_rag_chunk:source_backtrace_orientation:0001"');
    expect(result.output).toContain('topic_id="fqhe-literature"');
    expect(result.output).toContain('claim_id="claim-fqhe"');
    expect(result.output).toContain('promotion_draft_stage="evidence"');
    expect(result.output).toContain('promotion_draft_operation="recordEvidence"');
    expect(result.output).toContain('copy_reviewed_overrides_from="suggested_reviewed_overrides_json"');
    expect(result.output).toContain('requires_fresh_draft_action="true"');
    expect(result.output).toContain('requires_readiness_inspection="true"');
    expect(result.output).toContain('<carried_ref_repair_readiness_echo');
    expect(result.output).toContain('source="promotion_carried_ref_suggestions"');
    expect(result.output).toContain('review_status="needs_reviewed_overrides"');
    expect(result.output).toContain('readiness_status="needs_reviewed_overrides"');
    expect(result.output).toContain('reviewed_override_applied="false"');
    expect(result.output).toContain('read_only="true"');
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('checklist_authorizes_execution="false"');
    expect(result.output).toContain('<draft_call_json>');
    expect(result.output).toContain('&quot;action&quot;:&quot;draft_aitp_curated_rag_write_bridge_call&quot;');
    expect(result.output).toContain('&quot;promotion_reviewed_overrides&quot;:{&quot;source_refs&quot;:[&quot;source_asset:asset-reviewed&quot;,&quot;reference_location:loc-reviewed&quot;]}');
    expect(result.output).toContain('<reviewed_payload_json>');
    expect(result.output).toContain('&quot;source_refs&quot;:[&quot;&lt;source_asset_id&gt;&quot;,&quot;&lt;reference_location_id&gt;&quot;]');
    expect(result.output).toContain('code="placeholder_value" field="source_refs[0]"');
    expect(result.output).toContain('bridge_called="false"');
    expect(bridgeCalls).toEqual([]);
    expect(records).not.toContainEqual(
      expect.objectContaining({ type: 'research_action.result_recorded' }),
    );
  });

  it('fails closed for malformed carried-ref handoff objects', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: curatedRagPromotionDraftProvider(),
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          throw new Error('write bridge must not be called by draft action');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const cases: readonly {
      readonly handoff: Record<string, string>;
      readonly expected: string;
      readonly code: string;
      readonly path: string;
    }[] = [
      {
        handoff: {
          evidence_ref: 'aitp:source_asset:asset-reviewed',
          ref_kind: 'source_asset',
          record_id: 'asset-reviewed',
        },
        expected: 'requires canonical_ref',
        code: 'missing_canonical_ref',
        path: 'promotion_carried_ref_handoffs[0].canonical_ref',
      },
      {
        handoff: {
          canonical_ref: 'source_asset:asset-reviewed',
          ref_kind: 'source_asset',
          record_id: 'asset-reviewed',
        },
        expected: 'requires evidence_ref',
        code: 'missing_evidence_ref',
        path: 'promotion_carried_ref_handoffs[0].evidence_ref',
      },
      {
        handoff: {
          canonical_ref: 'source_asset:asset-reviewed',
          evidence_ref: 'aitp:source_asset:asset-reviewed',
          record_id: 'asset-reviewed',
        },
        expected: 'requires ref_kind',
        code: 'missing_ref_kind',
        path: 'promotion_carried_ref_handoffs[0].ref_kind',
      },
      {
        handoff: {
          canonical_ref: 'aitp:source_asset:asset-reviewed',
          evidence_ref: 'aitp:source_asset:asset-reviewed',
          ref_kind: 'source_asset',
          record_id: 'asset-reviewed',
        },
        expected: 'canonical_ref must use the next-payload ref dialect',
        code: 'canonical_ref_dialect_or_kind_mismatch',
        path: 'promotion_carried_ref_handoffs[0].canonical_ref',
      },
      {
        handoff: {
          canonical_ref: 'source_asset:asset-reviewed',
          evidence_ref: 'aitp:source_asset:asset-reviewed',
          ref_kind: 'reference_location',
          record_id: 'asset-reviewed',
        },
        expected: 'canonical_ref must use the next-payload ref dialect and match ref_kind',
        code: 'canonical_ref_dialect_or_kind_mismatch',
        path: 'promotion_carried_ref_handoffs[0].canonical_ref',
      },
      {
        handoff: {
          canonical_ref: 'source_asset:asset-reviewed',
          evidence_ref: 'aitp:reference_location:asset-reviewed',
          ref_kind: 'source_asset',
          record_id: 'asset-reviewed',
        },
        expected: 'evidence_ref must match ref_kind',
        code: 'evidence_ref_kind_mismatch',
        path: 'promotion_carried_ref_handoffs[0].evidence_ref',
      },
      {
        handoff: {
          canonical_ref: 'source_asset:asset-reviewed',
          evidence_ref: 'aitp:source_asset:asset-reviewed',
          ref_kind: 'source_asset',
        },
        expected: 'requires record_id',
        code: 'missing_record_id',
        path: 'promotion_carried_ref_handoffs[0].record_id',
      },
      {
        handoff: {
          canonical_ref: 'source_asset:other-asset',
          evidence_ref: 'aitp:source_asset:asset-reviewed',
          ref_kind: 'source_asset',
          record_id: 'asset-reviewed',
        },
        expected: 'canonical_ref record id must match record_id',
        code: 'canonical_ref_record_id_mismatch',
        path: 'promotion_carried_ref_handoffs[0].canonical_ref',
      },
      {
        handoff: {
          canonical_ref: 'source_asset:asset-reviewed',
          evidence_ref: 'aitp:source_asset:other-asset',
          ref_kind: 'source_asset',
          record_id: 'asset-reviewed',
        },
        expected: 'evidence_ref record id must match record_id',
        code: 'evidence_ref_record_id_mismatch',
        path: 'promotion_carried_ref_handoffs[0].evidence_ref',
      },
    ];

    for (const malformed of cases) {
      const result = await execute(tool, {
        action: 'draft_aitp_curated_rag_write_bridge_call',
        rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
        aitp_topic_id: 'fqhe-literature',
        aitp_claim_id: 'claim-fqhe',
        promotion_draft_operation: 'recordEvidence',
        promotion_carried_ref_handoffs: [malformed.handoff],
      });

      expect(result).toMatchObject({ isError: true });
      expect(result.output).toContain('<carried_ref_handoff_failure');
      expect(result.output).toContain(`code="${malformed.code}"`);
      expect(result.output).toContain(`path="${malformed.path}"`);
      expect(result.output).toContain('<remediation_summary');
      expect(result.output).toContain(malformed.expected);
      expect(result.output).toContain('suggestion_rendered="false"');
      expect(result.output).toContain('next_call_pointer_rendered="false"');
      expect(result.output).toContain('bridge_called="false"');
      expect(result.output).toContain('executes_write_now="false"');
      expect(result.output).not.toContain('<promotion_carried_ref_suggestions');
      expect(result.output).not.toContain('<carried_ref_next_call_pointer');
    }
    expect(bridgeCalls).toEqual([]);
  });

  it('marks carried ref suggestions applied only when explicit reviewed overrides carry them', async () => {
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: curatedRagPromotionDraftProvider(),
      aitpWriteBridge: {
        async executeWrite() {
          throw new Error('write bridge must not be called by draft action');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_operation: 'recordEvidence',
      promotion_carried_refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
      promotion_reviewed_overrides: {
        source_refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
        summary: 'Reviewed source passage supports only the scoped claim fragment.',
      },
    });

    expect(result.output).toContain('reviewed_override_count="2"');
    expect(result.output).toContain('confirmation_status="needs_explicit_confirmation"');
    expect(result.output).toContain('<promotion_carried_ref_suggestions');
    expect(result.output).toContain('applied_to_payload="false"');
    expect(result.output).toContain('applied_by_reviewed_override="true"');
    expect(result.output).toContain('<carried_ref_repair_readiness_echo');
    expect(result.output).toContain('source="promotion_carried_ref_suggestions"');
    expect(result.output).toContain('review_status="reviewed_overrides_applied"');
    expect(result.output).toContain('readiness_status="ready_for_readiness_inspection"');
    expect(result.output).toContain('reviewed_override_applied="true"');
    expect(result.output).toContain('readiness_checklist_id="readiness-checklist.curated_rag_write_call_draft.curated-rag-write-handoff.');
    expect(result.output).toContain('next_readiness_action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(result.output).toContain('next_execute_action="execute_aitp_write_bridge"');
    expect(result.output).toContain('checklist_authorizes_execution="false"');
    expect(result.output).toContain('target_field="source_refs"');
    expect(result.output).toContain(
      '<suggested_reviewed_overrides_json>{&quot;source_refs&quot;:[&quot;source_asset:asset-reviewed&quot;,&quot;reference_location:loc-reviewed&quot;]}</suggested_reviewed_overrides_json>',
    );
    expect(result.output).toContain('code="reviewed_override_applied" field="source_refs"');
    expect(result.output).toContain('code="reviewed_overrides_not_executed"');
    expect(result.output).not.toContain('code="missing_sequence_prior_ref"');
    expect(result.output).toContain('bridge_called="false"');
  });

  it('renders AITP-owned record-ref lookup confirmation for reviewed curated RAG refs', async () => {
    const mutableLookupCalls: string[][] = [];
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: curatedRagPromotionDraftProvider(),
      aitpRecordRefLookupProvider: {
        async lookupRecordRefs(input) {
          mutableLookupCalls.push([...input.refs]);
          return parseAitpRecordRefLookup(
            fakeRecordRefLookup(input.refs, {
              foundRefs: ['source_asset:asset-reviewed'],
            }),
          );
        },
      },
      aitpWriteBridge: {
        async executeWrite() {
          throw new Error('write bridge must not be called by draft action');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_operation: 'recordEvidence',
      promotion_reviewed_overrides: {
        source_refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
        summary: 'Reviewed source passage supports only the scoped claim fragment.',
      },
    });

    expect(mutableLookupCalls).toEqual([
      ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
    ]);
    expect(result.output).toContain('confirmation_source="aitp_record_ref_lookup"');
    expect(result.output).toContain('aitp_lookup_performed="true"');
    expect(result.output).toContain('lookup_scope="typed_record_existence_only"');
    expect(result.output).toContain('found_count="1"');
    expect(result.output).toContain('missing_count="1"');
    expect(result.output).toContain('confirmed_ref_count="1"');
    expect(result.output).toContain('requires_aitp_lookup_before_execution="false"');
    expect(result.output).toContain('missing_ref_repair_hint_count="1"');
    expect(result.output).toContain('missing_ref_repair_checklist_present="true"');
    expect(result.output).toContain('repair_hint_operation_count="1"');
    expect(result.output).toContain('repair_hint_operations="recordReferenceLocation"');
    expect(result.output).toContain('repair_hint_summary_source="missing_ref_repair_checklist"');
    expect(result.output).toContain('selected_write_differs_from_repair_hints="true"');
    expect(result.output).toContain('repair_action_hint_only="true"');
    expect(result.output).toContain('selected_write_call_unchanged="true"');
    expect(result.output).toContain(
      '<ref status="concrete" aitp_record_confirmed="true" lookup_status="found" ref_kind="source_asset" record_id="asset-reviewed" surface="source_asset_record" read_surface_effect="record_existence_check_only" records_validation_result="false" source_support_result="false" claim_trust_mutation="none">source_asset:asset-reviewed</ref>',
    );
    expect(result.output).toContain(
      '<ref status="concrete" aitp_record_confirmed="false" lookup_status="not_found" ref_kind="reference_location" record_id="loc-reviewed" surface="reference_location_record" read_surface_effect="record_existence_check_only" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" suggested_next_operation="recordReferenceLocation" suggested_next_entrypoint="record_reference_location" suggested_next_surface="reference_location_record" suggested_next_reason="record a normal AITP reference location before using this ref as source context">reference_location:loc-reviewed</ref>',
    );
    expect(result.output).toContain(
      '<missing_ref_repair_checklist item_count="1" source="aitp_record_ref_lookup" read_only="true" executes_write_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" requires_explicit_execute_call="true" repair_action_hint_only="true" selected_write_call_unchanged="true">',
    );
    expect(result.output).toContain(
      '<repair_item ref="reference_location:loc-reviewed" ref_kind="reference_location" record_id="loc-reviewed" suggested_next_operation="recordReferenceLocation" suggested_next_entrypoint="record_reference_location" suggested_next_surface="reference_location_record" next_research_action="execute_aitp_write_bridge" next_aitp_operation="recordReferenceLocation" next_operation_source="aitp_record_ref_lookup" repair_action_hint_only="true" selected_write_call_unchanged="true" next_step="record a normal AITP reference location before using this ref as source context" />',
    );
    expect(result.output).toContain('aitp_operation="recordEvidence"');
    expect(result.output).toContain('records_validation_result="false"');
    expect(result.output).toContain('claim_trust_mutation="none"');
  });

  it('fails closed when a curated RAG write-bridge call draft has no selected option', async () => {
    const calls: string[] = [];
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: {
        async getCuratedRagCorpus() {
          throw new Error('not used');
        },
        async searchCuratedRagCorpus() {
          throw new Error('not used');
        },
        async draftCuratedRagPromotion() {
          calls.push('draft');
          throw new Error('should not draft');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('requires promotion_draft_stage or promotion_draft_operation');
    expect(calls).toEqual([]);
  });

  it('drafts guardable missing reference-location repair write-bridge calls without immediate execution', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(undefined, {
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          return {
            ok: true,
            kind: 'reference_location',
            locationId: 'loc-reviewed',
            topicId: 'fqhe-literature',
            claimId: 'claim-fqhe',
            connectorId: 'curated-rag',
            locationType: 'curated_rag_chunk',
            uri: 'aitp-curated-rag://curated_rag_chunk/source_backtrace_orientation/0001',
            label: 'Reviewed curated RAG chunk source backtrace orientation 0001',
            status: 'located',
            orientationOnly: false,
            raw: {},
          };
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'draft_aitp_record_ref_repair_write_bridge_call',
      repair_ref: 'reference_location:loc-reviewed',
      repair_operation: 'recordReferenceLocation',
      repair_reason: 'record a normal AITP reference location before using this ref as source context',
      aitp_payload: {
        topic_id: 'fqhe-literature',
        claim_id: 'claim-fqhe',
        connector_id: 'curated-rag',
        location_type: 'curated_rag_chunk',
        uri: 'aitp-curated-rag://curated_rag_chunk/source_backtrace_orientation/0001',
        label: 'Reviewed curated RAG chunk source backtrace orientation 0001',
        source_ref: 'source_asset:asset-reviewed',
        status: 'located',
        summary: 'Reviewed reference location for source backtrace orientation chunk.',
      },
    });

    expect(result.output).toContain('<aitp_record_ref_repair_write_bridge_call_draft');
    expect(result.output).toContain('repair_ref="reference_location:loc-reviewed"');
    expect(result.output).toContain('repair_operation="recordReferenceLocation"');
    expect(result.output).toContain('next_research_action="execute_aitp_write_bridge"');
    expect(result.output).toContain('aitp_operation="recordReferenceLocation"');
    expect(result.output).toContain('repair_operation_source="aitp_record_ref_lookup"');
    expect(result.output).toContain('repair_action_hint_only="true"');
    expect(result.output).toContain('selected_write_call_unchanged="true"');
    expect(result.output).toContain('reviewed_payload_executed="false"');
    expect(result.output).toContain('executes_write_now="false"');
    expect(result.output).toContain('handoff_id="record-ref-repair-handoff.reference_location-loc-reviewed.recordReferenceLocation.');
    expect(result.output).toContain('diagnostic_hash="sha256:');
    expect(result.output).toContain('records_validation_result="false"');
    expect(result.output).toContain('source_support_result="false"');
    expect(result.output).toContain('claim_trust_mutation="none"');
    expect(result.output).toContain('requires_explicit_execute_call="true"');
    expect(result.output).toContain('<tool_call_json>');
    expect(result.output).toContain('&quot;action&quot;:&quot;execute_aitp_write_bridge&quot;');
    expect(result.output).toContain('&quot;aitp_operation&quot;:&quot;recordReferenceLocation&quot;');
    expect(result.output).toContain('&quot;connectorId&quot;:&quot;curated-rag&quot;');
    expect(result.output).toContain('&quot;sourceRef&quot;:&quot;source_asset:asset-reviewed&quot;');
    expect(result.output).toContain('<readiness_call_pointer');
    expect(result.output).toContain('action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(result.output).toContain('source="execute_aitp_write_bridge_handoff.readiness_call_json"');
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('<readiness_inspection_summary');
    expect(result.output).toContain('draft_family="record_ref_repair_write_call_draft"');
    expect(result.output).toContain('root_pointer="readiness_call_pointer"');
    expect(result.output).toContain('nested_call="execute_aitp_write_bridge_handoff.readiness_call_json"');
    expect(result.output).toContain('inspection_only="true"');
    expect(result.output).toContain('<readiness_inspection_checklist');
    expect(result.output).toContain(
      'checklist_id="readiness-checklist.record_ref_repair_write_call_draft.record-ref-repair-handoff.',
    );
    expect(result.output).toContain('draft_family="record_ref_repair_write_call_draft"');
    expect(result.output).toContain('id_source="handoff_id+draft_family"');
    expect(result.output).toContain('item_count="2"');
    expect(result.output).toContain('execute_call_authorized="false"');
    expect(result.output).toContain(
      '<inspection_item order="1" action="inspect_aitp_write_bridge_handoff_readiness"',
    );
    expect(result.output).toContain(
      '<inspection_item order="2" action="execute_aitp_write_bridge" source="tool_call_json" allowed_only_after_readiness_passes="true"',
    );
    const pointerIndex = String(result.output).indexOf('<readiness_call_pointer');
    const summaryIndex = String(result.output).indexOf('<readiness_inspection_summary');
    const checklistIndex = String(result.output).indexOf('<readiness_inspection_checklist');
    const handoffIndex = String(result.output).indexOf('<execute_aitp_write_bridge_handoff');
    expect(pointerIndex).toBeLessThan(summaryIndex);
    expect(summaryIndex).toBeLessThan(checklistIndex);
    expect(checklistIndex).toBeLessThan(handoffIndex);
    expect(result.output).toContain('<execute_aitp_write_bridge_handoff');
    expect(result.output).toContain('confirmation_status="ready_for_explicit_execute"');
    expect(result.output).toContain('<hash_input_json>');
    expect(result.output).toContain('<readiness_call_json>');
    expect(result.output).toContain('&quot;action&quot;:&quot;inspect_aitp_write_bridge_handoff_readiness&quot;');
    expect(result.output).toContain('repair_draft_only');
    expect(result.output).toContain('<repair_boundary');
    expect(result.output).toContain('requires_separate_explicit_execute_call="true"');
    expect(bridgeCalls).toEqual([]);

    const handoff = extractCuratedRagHandoff(result.output);
    const executed = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordReferenceLocation',
      aitp_payload: toolCallPayload(handoff),
      aitp_handoff: handoff.guard,
    });

    expect(executed.output).toContain('<handoff_execution_precheck');
    expect(executed.output).toContain('kind="record_ref_repair_write_bridge_handoff"');
    expect(executed.output).toContain('status="passed"');
    expect(executed.output).toContain('selected_aitp_operation="recordReferenceLocation"');
    expect(executed.output).toContain('bridge_called="true"');
    expect(executed.output).toContain('<readiness_checklist_result');
    expect(executed.output).toContain(
      'checklist_id="readiness-checklist.record_ref_repair_write_call_draft.record-ref-repair-handoff.',
    );
    expect(executed.output).toContain('item_order="2"');
    expect(executed.output).toContain('item_action="execute_aitp_write_bridge"');
    expect(executed.output).toContain('item_status="followed"');
    expect(executed.output).toContain('previous_item_action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(executed.output).toContain('execution_precheck_status="passed"');
    expect(executed.output).toContain('explicit_execute_call_observed="true"');
    expect(executed.output).toContain('executes_write_now="false"');
    expect(executed.output).toContain('checklist_authorizes_execution="false"');
    expect(executed.output).toContain('checklist_mutated_now="false"');
    expect(executed.output).toContain(
      'readiness_checklist_id="readiness-checklist.record_ref_repair_write_call_draft.record-ref-repair-handoff.',
    );
    expect(executed.output).toContain('readiness_checklist_item_order="2"');
    expect(executed.output).toContain('readiness_checklist_item_action="execute_aitp_write_bridge"');
    expect(executed.output).toContain('readiness_checklist_item_status="followed"');
    expect(executed.output).toContain('readiness_checklist_reference_source="handoff_execution_precheck"');
    expect(executed.output).toContain('<aitp_write_bridge operation="recordReferenceLocation"');
    expect(bridgeCalls).toHaveLength(1);
    expect(bridgeCalls[0]).toMatchObject({
      operation: 'recordReferenceLocation',
      payload: expect.objectContaining({
        connectorId: 'curated-rag',
        sourceRef: 'source_asset:asset-reviewed',
      }),
    });
  });

  it('drafts guardable missing source-asset repair write-bridge calls without immediate execution', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(undefined, {
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          return {
            ok: true,
            kind: 'source_asset',
            assetId: 'asset-reviewed',
            topicId: 'fqhe-literature',
            assetType: 'paper',
            uri: 'arxiv:2601.00001',
            title: 'Reviewed anyon source',
            orientationOnly: false,
            canUpdateClaimTrust: false,
            raw: {},
          };
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'draft_aitp_record_ref_repair_write_bridge_call',
      repair_ref: 'source_asset:asset-reviewed',
      repair_operation: 'registerSourceAsset',
      repair_reason: 'register or auto-capture a normal AITP source asset before using this ref as source context',
      aitp_payload: {
        topic_id: 'fqhe-literature',
        claim_id: 'claim-fqhe',
        asset_type: 'paper',
        uri: 'arxiv:2601.00001',
        title: 'Reviewed anyon source',
        version_anchor: { arxiv_version: 'v1' },
        source_refs: ['curated_rag_chunk:source_backtrace_orientation:0001'],
        linked_records: { claim_id: 'claim-fqhe' },
      },
    });

    expect(result.output).toContain('<aitp_record_ref_repair_write_bridge_call_draft');
    expect(result.output).toContain('repair_ref="source_asset:asset-reviewed"');
    expect(result.output).toContain('repair_operation="registerSourceAsset"');
    expect(result.output).toContain('aitp_operation="registerSourceAsset"');
    expect(result.output).toContain('handoff_id="record-ref-repair-handoff.source_asset-asset-reviewed.registerSourceAsset.');
    expect(result.output).toContain('diagnostic_hash="sha256:');
    expect(result.output).toContain('reviewed_payload_executed="false"');
    expect(result.output).toContain('executes_write_now="false"');
    expect(result.output).toContain('records_validation_result="false"');
    expect(result.output).toContain('source_support_result="false"');
    expect(result.output).toContain('claim_trust_mutation="none"');
    expect(result.output).toContain('&quot;aitp_operation&quot;:&quot;registerSourceAsset&quot;');
    expect(result.output).toContain('&quot;assetType&quot;:&quot;paper&quot;');
    expect(result.output).toContain('&quot;sourceRefs&quot;:[&quot;curated_rag_chunk:source_backtrace_orientation:0001&quot;]');
    expect(result.output).toContain('<readiness_call_pointer');
    expect(result.output).toContain('action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(result.output).toContain('source="execute_aitp_write_bridge_handoff.readiness_call_json"');
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('<readiness_inspection_summary');
    expect(result.output).toContain('draft_family="record_ref_repair_write_call_draft"');
    expect(result.output).toContain('inspection_only="true"');
    expect(result.output).toContain('<execute_aitp_write_bridge_handoff');
    expect(result.output).toContain('confirmation_status="ready_for_explicit_execute"');
    expect(result.output).toContain('<readiness_call_json>');
    expect(result.output).toContain('&quot;action&quot;:&quot;inspect_aitp_write_bridge_handoff_readiness&quot;');
    expect(result.output).toContain('repair_draft_only');
    expect(bridgeCalls).toEqual([]);

    const handoff = extractCuratedRagHandoff(result.output);
    const executed = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'registerSourceAsset',
      aitp_payload: toolCallPayload(handoff),
      aitp_handoff: handoff.guard,
    });

    expect(executed.output).toContain('<handoff_execution_precheck');
    expect(executed.output).toContain('kind="record_ref_repair_write_bridge_handoff"');
    expect(executed.output).toContain('status="passed"');
    expect(executed.output).toContain('selected_aitp_operation="registerSourceAsset"');
    expect(executed.output).toContain('bridge_called="true"');
    expect(executed.output).toContain('<readiness_checklist_result');
    expect(executed.output).toContain(
      'checklist_id="readiness-checklist.record_ref_repair_write_call_draft.record-ref-repair-handoff.',
    );
    expect(executed.output).toContain('item_order="2"');
    expect(executed.output).toContain('item_action="execute_aitp_write_bridge"');
    expect(executed.output).toContain('item_status="followed"');
    expect(executed.output).toContain('execution_precheck_status="passed"');
    expect(executed.output).toContain('explicit_execute_call_observed="true"');
    expect(executed.output).toContain('executes_write_now="false"');
    expect(executed.output).toContain('checklist_authorizes_execution="false"');
    expect(executed.output).toContain('checklist_mutated_now="false"');
    expect(executed.output).toContain(
      'readiness_checklist_id="readiness-checklist.record_ref_repair_write_call_draft.record-ref-repair-handoff.',
    );
    expect(executed.output).toContain('readiness_checklist_item_order="2"');
    expect(executed.output).toContain('readiness_checklist_item_action="execute_aitp_write_bridge"');
    expect(executed.output).toContain('readiness_checklist_item_status="followed"');
    expect(executed.output).toContain('readiness_checklist_reference_source="handoff_execution_precheck"');
    expect(executed.output).toContain('<aitp_write_bridge operation="registerSourceAsset"');
    expect(bridgeCalls).toHaveLength(1);
    expect(bridgeCalls[0]).toMatchObject({
      operation: 'registerSourceAsset',
      payload: expect.objectContaining({
        assetType: 'paper',
        uri: 'arxiv:2601.00001',
        title: 'Reviewed anyon source',
        sourceRefs: ['curated_rag_chunk:source_backtrace_orientation:0001'],
      }),
    });
  });

  it('inspects guarded repair handoff readiness without calling the write bridge', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(undefined, {
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          throw new Error('readiness inspection must not call bridge');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);
    const draft = await execute(tool, {
      action: 'draft_aitp_record_ref_repair_write_bridge_call',
      repair_ref: 'source_asset:asset-reviewed',
      repair_operation: 'registerSourceAsset',
      repair_reason: 'register or auto-capture a normal AITP source asset before using this ref as source context',
      aitp_payload: {
        topic_id: 'fqhe-literature',
        claim_id: 'claim-fqhe',
        asset_type: 'paper',
        uri: 'arxiv:2601.00001',
        title: 'Reviewed anyon source',
      },
    });
    const handoff = extractCuratedRagHandoff(draft.output);

    const readiness = await execute(tool, handoff.readinessCall);

    expect(readiness.output).toContain('<aitp_write_bridge_handoff_readiness');
    expect(readiness.output).toContain('kind="record_ref_repair_write_bridge_handoff"');
    expect(readiness.output).toContain('status="passed"');
    expect(readiness.output).toContain('selected_aitp_operation="registerSourceAsset"');
    expect(readiness.output).toContain('bridge_call_allowed="true"');
    expect(readiness.output).toContain('bridge_called="false"');
    expect(readiness.output).toContain('executes_write_now="false"');
    expect(readiness.output).toContain('requires_explicit_execute_call="true"');
    expect(readiness.output).toContain('records_validation_result="false"');
    expect(readiness.output).toContain('source_support_result="false"');
    expect(readiness.output).toContain('claim_trust_mutation="none"');
    expect(readiness.output).toContain('<readiness_checklist_result');
    expect(readiness.output).toContain(
      'checklist_id="readiness-checklist.record_ref_repair_write_call_draft.record-ref-repair-handoff.',
    );
    expect(readiness.output).toContain('item_order="1"');
    expect(readiness.output).toContain('item_action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(readiness.output).toContain('item_status="satisfied"');
    expect(readiness.output).toContain('next_item_action="execute_aitp_write_bridge"');
    expect(readiness.output).toContain('checklist_mutated_now="false"');
    expect(readiness.output).toContain('Call ResearchAction.execute_aitp_write_bridge');
    expect(bridgeCalls).toEqual([]);
  });

  it('reports handoff readiness failures without calling the write bridge', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(undefined, {
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          throw new Error('failed readiness inspection must not call bridge');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);
    const draft = await execute(tool, {
      action: 'draft_aitp_record_ref_repair_write_bridge_call',
      repair_ref: 'source_asset:asset-reviewed',
      repair_operation: 'registerSourceAsset',
      aitp_payload: {
        topic_id: 'fqhe-literature',
        asset_type: 'paper',
        uri: 'arxiv:2601.00001',
        title: 'Reviewed anyon source',
      },
    });
    const handoff = extractCuratedRagHandoff(draft.output);

    const readiness = await execute(tool, {
      action: 'inspect_aitp_write_bridge_handoff_readiness',
      aitp_operation: 'registerSourceAsset',
      aitp_payload: {
        ...toolCallPayload(handoff),
        title: 'Tampered source title',
      },
      aitp_handoff: handoff.guard,
    });

    expect(readiness.isError).not.toBe(true);
    expect(readiness.output).toContain('<aitp_write_bridge_handoff_readiness');
    expect(readiness.output).toContain('status="failed"');
    expect(readiness.output).toContain('code="tool_call_payload_mismatch"');
    expect(readiness.output).toContain('bridge_call_allowed="false"');
    expect(readiness.output).toContain('bridge_called="false"');
    expect(readiness.output).toContain('executes_write_now="false"');
    expect(readiness.output).toContain('retry_requires_explicit_execute_call="true"');
    expect(readiness.output).toContain('repair_target="aitp_handoff.tool_call_json.aitp_payload"');
    expect(readiness.output).toContain('<readiness_checklist_result');
    expect(readiness.output).toContain('checklist_id_available="false"');
    expect(readiness.output).toContain('item_order="1"');
    expect(readiness.output).toContain('item_action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(readiness.output).toContain('item_status="failed"');
    expect(readiness.output).toContain('checklist_mutated_now="false"');
    expect(bridgeCalls).toEqual([]);
  });

  it('executes curated RAG write-bridge handoffs only after guard verification passes', async () => {
    const records: AgentRecord[] = [];
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(records, {
      aitpCuratedRagProvider: {
        async getCuratedRagCorpus() {
          throw new Error('not used');
        },
        async searchCuratedRagCorpus() {
          throw new Error('not used');
        },
        async draftCuratedRagPromotion(input) {
          return parseAitpCuratedRagPromotionDraft(
            fakeCuratedRagPromotionDraft(input.chunkId, {
              topicId: input.topicId,
              claimId: input.claimId,
              connectorId: input.connectorId,
            }),
          );
        },
      },
      aitpRecordRefLookupProvider: {
        async lookupRecordRefs(input) {
          return parseAitpRecordRefLookup(
            fakeRecordRefLookup(input.refs, {
              foundRefs: ['source_asset:asset-reviewed'],
            }),
          );
        },
      },
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          return {
            ok: true,
            kind: 'evidence',
            evidenceId: 'evidence-reviewed-curated-rag',
            topicId: 'fqhe-literature',
            claimId: 'claim-fqhe',
            evidenceType: 'source_text_review',
            status: 'unreviewed',
            raw: {},
          };
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);
    const draft = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_operation: 'recordEvidence',
      promotion_reviewed_overrides: {
        source_refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
        summary: 'Reviewed source passage supports only the scoped claim fragment.',
      },
    });
    const handoff = extractCuratedRagHandoff(draft.output);

    const readiness = await execute(tool, handoff.readinessCall);

    expect(readiness.output).toContain('<aitp_write_bridge_handoff_readiness');
    expect(readiness.output).toContain('kind="curated_rag_write_bridge_handoff"');
    expect(readiness.output).toContain('status="passed"');
    expect(readiness.output).toContain('selected_aitp_operation="recordEvidence"');
    expect(readiness.output).toContain('bridge_call_allowed="true"');
    expect(readiness.output).toContain('bridge_called="false"');
    expect(readiness.output).toContain('executes_write_now="false"');
    expect(readiness.output).toContain('<carried_ref_repair_readiness_echo');
    expect(readiness.output).toContain('source="aitp_write_bridge_handoff_readiness"');
    expect(readiness.output).toContain('review_status="reviewed_overrides_applied"');
    expect(readiness.output).toContain('readiness_status="readiness_inspection_passed"');
    expect(readiness.output).toContain('next_execute_action="execute_aitp_write_bridge"');
    expect(readiness.output).toContain('checklist_authorizes_execution="false"');
    expect(bridgeCalls).toEqual([]);

    const result = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordEvidence',
      aitp_payload: toolCallPayload(handoff),
      aitp_handoff: handoff.guard,
    });

    expect(result.output).toContain('<aitp_write_bridge operation="recordEvidence"');
    expect(result.output).toContain('<handoff_execution_precheck');
    expect(result.output).toContain('status="passed"');
    expect(result.output).toContain('selected_aitp_operation="recordEvidence"');
    expect(result.output).toContain('missing_ref_repair_hint_count="1"');
    expect(result.output).toContain('missing_ref_repair_checklist_present="true"');
    expect(result.output).toContain('repair_hint_operation_count="1"');
    expect(result.output).toContain('repair_hint_operations="recordReferenceLocation"');
    expect(result.output).toContain('selected_write_differs_from_repair_hints="true"');
    expect(result.output).toContain('bridge_call_allowed="true"');
    expect(result.output).toContain('bridge_called="true"');
    expect(result.output).toContain('retry_requires_explicit_execute_call="false"');
    expect(result.output).toContain('handoff_mutated_now="false"');
    expect(result.output).toContain('records_validation_result="false"');
    expect(result.output).toContain('source_support_result="false"');
    expect(result.output).toContain('claim_trust_mutation="none"');
    expect(result.output).toContain('<carried_ref_repair_readiness_echo');
    expect(result.output).toContain('source="handoff_execution_precheck"');
    expect(result.output).toContain('review_status="reviewed_overrides_applied"');
    expect(result.output).toContain('readiness_status="explicit_execute_precheck_passed"');
    expect(result.output).toContain('explicit_execute_call_observed="true"');
    expect(result.output).toContain('checklist_authorizes_execution="false"');
    expect(result.output).toContain('<readiness_checklist_result');
    expect(result.output).toContain(
      'checklist_id="readiness-checklist.curated_rag_write_call_draft.curated-rag-write-handoff.',
    );
    expect(result.output).toContain('item_order="2"');
    expect(result.output).toContain('item_action="execute_aitp_write_bridge"');
    expect(result.output).toContain('item_status="followed"');
    expect(result.output).toContain('previous_item_action="inspect_aitp_write_bridge_handoff_readiness"');
    expect(result.output).toContain('execution_precheck_status="passed"');
    expect(result.output).toContain('explicit_execute_call_observed="true"');
    expect(result.output).toContain('executes_write_now="false"');
    expect(result.output).toContain('checklist_authorizes_execution="false"');
    expect(result.output).toContain('checklist_mutated_now="false"');
    expect(result.output).toContain('<handoff_guard');
    expect(result.output).toContain('status="passed"');
    expect(result.output).toContain(`handoff_id="${String(handoff.guard['handoff_id'])}"`);
    expect(result.output).toContain(
      'readiness_checklist_id="readiness-checklist.curated_rag_write_call_draft.curated-rag-write-handoff.',
    );
    expect(result.output).toContain('readiness_checklist_item_order="2"');
    expect(result.output).toContain('readiness_checklist_item_action="execute_aitp_write_bridge"');
    expect(result.output).toContain('readiness_checklist_item_status="followed"');
    expect(result.output).toContain('readiness_checklist_reference_source="handoff_execution_precheck"');
    expect(result.output).toContain('confirmation_status="needs_explicit_confirmation"');
    expect(result.output).toContain('<aitp_curated_rag_carried_ref_handoff');
    expect(result.output).toContain('source="execute_aitp_write_bridge_result"');
    expect(result.output).toContain(`handoff_id="${String(handoff.guard['handoff_id'])}"`);
    expect(result.output).toContain('chunk_id="curated_rag_chunk:source_backtrace_orientation:0001"');
    expect(result.output).toContain('completed_stage="evidence"');
    expect(result.output).toContain('completed_operation="recordEvidence"');
    expect(result.output).toContain('canonical_ref="evidence:evidence-reviewed-curated-rag"');
    expect(result.output).toContain('evidence_ref="aitp:evidence:evidence-reviewed-curated-rag"');
    expect(result.output).toContain('ref_kind="evidence"');
    expect(result.output).toContain('record_id="evidence-reviewed-curated-rag"');
    expect(result.output).toContain('feeds_next_stages="validation,trust_preflight"');
    expect(result.output).toContain('next_research_action="draft_aitp_curated_rag_write_bridge_call"');
    expect(result.output).toContain('carry_into="promotion_reviewed_overrides"');
    expect(result.output).toContain('next_payload_mutated_now="false"');
    expect(result.output).toContain('next_write_executed_now="false"');
    expect(result.output).toContain('requires_reviewed_payload="true"');
    expect(result.output).toContain('requires_explicit_execute_call="true"');
    expect(result.output).toContain('<carried_ref_repair_result_summary');
    expect(result.output).toContain('source="execute_aitp_write_bridge_result"');
    expect(result.output).toContain(`handoff_id="${String(handoff.guard['handoff_id'])}"`);
    expect(result.output).toContain('completed_stage="evidence"');
    expect(result.output).toContain('completed_operation="recordEvidence"');
    expect(result.output).toContain('result_kind="evidence"');
    expect(result.output).toContain('record_id="evidence-reviewed-curated-rag"');
    expect(result.output).toContain('canonical_ref="evidence:evidence-reviewed-curated-rag"');
    expect(result.output).toContain('evidence_ref="aitp:evidence:evidence-reviewed-curated-rag"');
    expect(result.output).toContain('ref_kind="evidence"');
    expect(result.output).toContain('repair_hint_operations="recordReferenceLocation"');
    expect(result.output).toContain('explicit_execute_precheck_passed="true"');
    expect(result.output).toContain('bridge_called="true"');
    expect(result.output).toContain('result_written_by_aitp="true"');
    expect(result.output).toContain('next_payload_mutated_now="false"');
    expect(result.output).toContain('next_write_executed_now="false"');
    expect(result.output).toContain('records_validation_result="false"');
    expect(result.output).toContain('source_support_result="false"');
    expect(result.output).toContain('claim_trust_mutation="none"');
    expect(result.output).toContain('requires_explicit_next_draft="true"');
    expect(handoff.hashInput).toMatchObject({
      missingRefRepairHintCount: 1,
      missingRefRepairChecklistPresent: true,
      repairHintOperations: ['recordReferenceLocation'],
      selectedWriteDiffersFromRepairHints: true,
    });
    expect(bridgeCalls).toHaveLength(1);
    expect(bridgeCalls[0]).toMatchObject({
      operation: 'recordEvidence',
      payload: expect.objectContaining({
        sourceRefs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
      }),
    });
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        actionId: 'aitp.record_evidence',
        evidenceRefs: expect.arrayContaining(['aitp:evidence:evidence-reviewed-curated-rag']),
      }),
    );
  });

  it('renders carried source refs after explicit curated RAG source writes', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: curatedRagPromotionDraftProvider(),
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          return {
            ok: true,
            kind: 'source_asset',
            assetId: 'asset-reviewed-curated-rag',
            topicId: 'fqhe-literature',
            assetType: 'paper',
            orientationOnly: true,
            canUpdateClaimTrust: false,
            raw: {},
          };
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);

    const draft = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_operation: 'registerSourceAsset',
      promotion_reviewed_overrides: {
        title: 'Reviewed source title',
      },
    });

    expect(draft.output).not.toContain('<aitp_curated_rag_carried_ref_handoff');
    const handoff = extractCuratedRagHandoff(draft.output);

    const result = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'registerSourceAsset',
      aitp_payload: toolCallPayload(handoff),
      aitp_handoff: handoff.guard,
    });

    expect(result.output).toContain('<aitp_write_bridge operation="registerSourceAsset"');
    expect(result.output).toContain('<record_id>asset-reviewed-curated-rag</record_id>');
    expect(result.output).toContain('<evidence_ref>aitp:source_asset:asset-reviewed-curated-rag</evidence_ref>');
    expect(result.output).toContain('<aitp_curated_rag_carried_ref_handoff');
    expect(result.output).toContain('source="execute_aitp_write_bridge_result"');
    expect(result.output).toContain('completed_stage="source_asset"');
    expect(result.output).toContain('completed_operation="registerSourceAsset"');
    expect(result.output).toContain('canonical_ref="source_asset:asset-reviewed-curated-rag"');
    expect(result.output).toContain('evidence_ref="aitp:source_asset:asset-reviewed-curated-rag"');
    expect(result.output).toContain('ref_kind="source_asset"');
    expect(result.output).toContain('feeds_next_stages="reference_location,evidence"');
    expect(result.output).toContain('carry_into="promotion_reviewed_overrides"');
    expect(result.output).toContain('next_payload_mutated_now="false"');
    expect(result.output).toContain('next_write_executed_now="false"');
    expect(result.output).toContain('records_validation_result="false"');
    expect(result.output).toContain('source_support_result="false"');
    expect(result.output).toContain('claim_trust_mutation="none"');
    expect(result.output).toContain('requires_reviewed_payload="true"');
    expect(result.output).toContain('requires_explicit_execute_call="true"');
    expect(result.output).not.toContain('<carried_ref_repair_result_summary');
    expect(bridgeCalls).toHaveLength(1);
  });

  it('rejects blocked curated RAG handoffs before calling the write bridge', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: {
        async getCuratedRagCorpus() {
          throw new Error('not used');
        },
        async searchCuratedRagCorpus() {
          throw new Error('not used');
        },
        async draftCuratedRagPromotion(input) {
          return parseAitpCuratedRagPromotionDraft(
            fakeCuratedRagPromotionDraft(input.chunkId, {
              topicId: input.topicId,
              claimId: input.claimId,
              connectorId: input.connectorId,
            }),
          );
        },
      },
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          throw new Error('blocked handoff must fail before bridge execution');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);
    const draft = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_stage: 'evidence',
    });
    const handoff = extractCuratedRagHandoff(draft.output);

    const result = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordEvidence',
      aitp_payload: toolCallPayload(handoff),
      aitp_handoff: handoff.guard,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('<handoff_execution_precheck');
    expect(result.output).toContain('status="failed"');
    expect(result.output).toContain('code="blocked_handoff"');
    expect(result.output).toContain('bridge_call_allowed="false"');
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('retry_requires_explicit_execute_call="true"');
    expect(result.output).toContain('handoff_mutated_now="false"');
    expect(result.output).toContain('<readiness_checklist_result');
    expect(result.output).toContain('checklist_id_available="false"');
    expect(result.output).toContain('item_order="2"');
    expect(result.output).toContain('item_action="execute_aitp_write_bridge"');
    expect(result.output).toContain('item_status="not_followed"');
    expect(result.output).toContain('execution_precheck_status="failed"');
    expect(result.output).toContain('checklist_authorizes_execution="false"');
    expect(result.output).toContain('checklist_mutated_now="false"');
    expect(result.output).toContain('<handoff_guard_failure');
    expect(result.output).toContain('code="blocked_handoff"');
    expect(result.output).toContain('field="confirmation_status"');
    expect(result.output).toContain('path="aitp_handoff.confirmation_status"');
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('<remediation_summary');
    expect(result.output).toContain('next_step="redraft_or_resolve_blocking_diagnostics"');
    expect(result.output).toContain('retry_requires_explicit_execute_call="true"');
    expect(result.output).toContain('mutates_handoff_now="false"');
    expect(result.output).toContain('handoff guard failed');
    expect(result.output).toContain('refuses blocked handoff');
    expect(bridgeCalls).toEqual([]);
  });

  it('rejects tampered curated RAG handoffs before calling the write bridge', async () => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: {
        async getCuratedRagCorpus() {
          throw new Error('not used');
        },
        async searchCuratedRagCorpus() {
          throw new Error('not used');
        },
        async draftCuratedRagPromotion(input) {
          return parseAitpCuratedRagPromotionDraft(
            fakeCuratedRagPromotionDraft(input.chunkId, {
              topicId: input.topicId,
              claimId: input.claimId,
              connectorId: input.connectorId,
            }),
          );
        },
      },
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          throw new Error('tampered handoff must fail before bridge execution');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);
    const draft = await execute(tool, {
      action: 'draft_aitp_curated_rag_write_bridge_call',
      rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
      aitp_topic_id: 'fqhe-literature',
      aitp_claim_id: 'claim-fqhe',
      promotion_draft_operation: 'recordEvidence',
      promotion_reviewed_overrides: {
        source_refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
        summary: 'Reviewed source passage supports only the scoped claim fragment.',
      },
    });
    const handoff = extractCuratedRagHandoff(draft.output);
    const tamperedToolCall = {
      ...handoff.toolCall,
      aitp_operation: 'registerSourceAsset',
    };

    const result = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordEvidence',
      aitp_payload: toolCallPayload(handoff),
      aitp_handoff: {
        ...handoff.guard,
        tool_call_json: tamperedToolCall,
      },
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('<handoff_guard_failure');
    expect(result.output).toContain('code="tool_call_operation_mismatch"');
    expect(result.output).toContain('path="aitp_handoff.tool_call_json.aitp_operation"');
    expect(result.output).toContain('tool_call_json.aitp_operation does not match');
    expect(bridgeCalls).toEqual([]);
  });

  it.each([
    {
      name: 'missing tool_call_json',
      code: 'missing_tool_call_json',
      path: 'aitp_handoff.tool_call_json',
      nextStep: 'copy_missing_handoff_field_from_draft',
      mutate(handoff: ReturnType<typeof extractCuratedRagHandoff>) {
        const { tool_call_json: _toolCallJson, ...guard } = handoff.guard;
        return guard;
      },
      expected: 'requires tool_call_json/toolCall object',
    },
    {
      name: 'missing hash_input_json',
      code: 'missing_hash_input_json',
      path: 'aitp_handoff.hash_input_json',
      nextStep: 'copy_missing_handoff_field_from_draft',
      mutate(handoff: ReturnType<typeof extractCuratedRagHandoff>) {
        const { hash_input_json: _hashInputJson, ...guard } = handoff.guard;
        return guard;
      },
      expected: 'requires hash_input_json/hashInput object',
    },
    {
      name: 'tampered payload',
      code: 'tool_call_payload_mismatch',
      path: 'aitp_handoff.tool_call_json.aitp_payload',
      nextStep: 'align_explicit_execute_args_with_handoff_tool_call',
      mutate(handoff: ReturnType<typeof extractCuratedRagHandoff>) {
        return {
          ...handoff.guard,
          tool_call_json: {
            ...handoff.toolCall,
            aitp_payload: {
              ...toolCallPayload(handoff),
              summary: 'Tampered summary that no longer matches the explicit payload.',
            },
          },
        };
      },
      expected: 'tool_call_json.aitp_payload does not match explicit aitp_payload',
    },
    {
      name: 'tampered diagnostic hash',
      code: 'diagnostic_hash_mismatch',
      path: 'aitp_handoff.diagnostic_hash',
      nextStep: 'redraft_handoff_or_restore_hash_input',
      mutate(handoff: ReturnType<typeof extractCuratedRagHandoff>) {
        return {
          ...handoff.guard,
          diagnostic_hash: 'sha256:0000000000000000',
        };
      },
      expected: 'diagnostic_hash does not match hash_input_json',
    },
    {
      name: 'invalid diagnostic hash algorithm',
      code: 'invalid_diagnostic_hash_algorithm',
      path: 'aitp_handoff.diagnostic_hash',
      nextStep: 'redraft_handoff_or_restore_hash_input',
      mutate(handoff: ReturnType<typeof extractCuratedRagHandoff>) {
        return {
          ...handoff.guard,
          diagnostic_hash: 'md5:not-allowed',
        };
      },
      expected: 'requires diagnostic_hash to use sha256:&lt;digest&gt;',
    },
    {
      name: 'unsupported confirmation status',
      code: 'unsupported_confirmation_status',
      path: 'aitp_handoff.confirmation_status',
      nextStep: 'inspect_handoff_guard_failure',
      mutate(handoff: ReturnType<typeof extractCuratedRagHandoff>) {
        return {
          ...handoff.guard,
          confirmation_status: 'auto_execute',
        };
      },
      expected: 'has unsupported confirmation_status=&quot;auto_execute&quot;',
    },
    {
      name: 'tampered hash input tool call',
      code: 'diagnostic_hash_mismatch',
      path: 'aitp_handoff.diagnostic_hash',
      nextStep: 'redraft_handoff_or_restore_hash_input',
      mutate(handoff: ReturnType<typeof extractCuratedRagHandoff>) {
        return {
          ...handoff.guard,
          hash_input_json: {
            ...handoff.hashInput,
            toolCall: {
              ...handoff.toolCall,
              aitp_operation: 'registerSourceAsset',
            },
          },
        };
      },
      expected: 'diagnostic_hash does not match hash_input_json',
    },
  ])('rejects curated RAG handoff guard case: $name', async ({ mutate, expected, code, path, nextStep }) => {
    const bridgeCalls: Parameters<AitpWriteBridgeExecutor['executeWrite']>[0][] = [];
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: curatedRagPromotionDraftProvider(),
      aitpWriteBridge: {
        async executeWrite(input) {
          bridgeCalls.push(input);
          throw new Error('invalid handoff must fail before bridge execution');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);
    const draft = await reviewedCuratedRagWriteBridgeCallDraft(tool);
    const handoff = extractCuratedRagHandoff(draft.output);

    const result = await execute(tool, {
      action: 'execute_aitp_write_bridge',
      aitp_operation: 'recordEvidence',
      aitp_payload: toolCallPayload(handoff),
      aitp_handoff: mutate(handoff),
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('<handoff_execution_precheck');
    expect(result.output).toContain(`code="${code}"`);
    expect(result.output).toContain(`path="${path}"`);
    expect(result.output).toContain(`next_step="${nextStep}"`);
    expect(result.output).toContain('bridge_call_allowed="false"');
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('handoff_mutated_now="false"');
    expect(result.output).toContain('<readiness_checklist_result');
    expect(result.output).toContain('checklist_id_available="false"');
    expect(result.output).toContain('item_order="2"');
    expect(result.output).toContain('item_action="execute_aitp_write_bridge"');
    expect(result.output).toContain('item_status="not_followed"');
    expect(result.output).toContain('execution_precheck_status="failed"');
    expect(result.output).toContain('checklist_authorizes_execution="false"');
    expect(result.output).toContain('checklist_mutated_now="false"');
    expect(result.output).toContain('<handoff_guard_failure');
    expect(result.output).toContain(`code="${code}"`);
    expect(result.output).toContain(`path="${path}"`);
    expect(result.output).toContain('bridge_called="false"');
    expect(result.output).toContain('<remediation_summary');
    expect(result.output).toContain(`next_step="${nextStep}"`);
    expect(result.output).toContain(`repair_target="${path}"`);
    expect(result.output).toContain('retry_requires_explicit_execute_call="true"');
    expect(result.output).toContain('mutates_handoff_now="false"');
    expect(result.output).toContain('handoff guard failed');
    expect(result.output).toContain(expected);
    expect(bridgeCalls).toEqual([]);
  });

  it('rejects non-promotion action bindings for curated RAG promotion drafts', async () => {
    const agent = makeAgent(undefined, {
      aitpCuratedRagProvider: {
        async getCuratedRagCorpus() {
          throw new Error('not used');
        },
        async searchCuratedRagCorpus() {
          throw new Error('not used');
        },
        async draftCuratedRagPromotion() {
          throw new Error('should not draft');
        },
      },
    });
    const tool = new ResearchActionTool(agent.researchAction);
    agent.workFrames.open(
      {
        id: 'frame.wrong-binding',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Render a wrong binding.',
      },
      { source: 'controller' },
    );
    const pack = agent.researchContext.compileForWorkFrame(
      {
        curatedRag: typedCuratedRagSearchResult('conceptual background'),
        curatedRagReasonIds: ['conceptual_scaffolding'],
      },
      { source: 'controller' },
    );

    const result = await execute(tool, {
      action: 'draft_aitp_curated_rag_promotion',
      context_pack_id: pack.id,
      action_binding_id: 'missing-binding',
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('does not contain action binding "missing-binding"');
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

function execute(tool: ResearchActionTool, args: ResearchActionToolArgs) {
  return executeTool(tool, {
    turnId: '0',
    toolCallId: 'call_research_action',
    args,
    signal,
  });
}

function curatedRagPromotionDraftProvider(): AitpCuratedRagProvider {
  return {
    async getCuratedRagCorpus() {
      throw new Error('not used');
    },
    async searchCuratedRagCorpus() {
      throw new Error('not used');
    },
    async draftCuratedRagPromotion(input) {
      return parseAitpCuratedRagPromotionDraft(
        fakeCuratedRagPromotionDraft(input.chunkId, {
          topicId: input.topicId,
          claimId: input.claimId,
          connectorId: input.connectorId,
        }),
      );
    },
  };
}

function reviewedCuratedRagWriteBridgeCallDraft(tool: ResearchActionTool) {
  return execute(tool, {
    action: 'draft_aitp_curated_rag_write_bridge_call',
    rag_chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
    aitp_topic_id: 'fqhe-literature',
    aitp_claim_id: 'claim-fqhe',
    promotion_draft_operation: 'recordEvidence',
    promotion_reviewed_overrides: {
      source_refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
      summary: 'Reviewed source passage supports only the scoped claim fragment.',
    },
  });
}

function extractCuratedRagHandoff(output: unknown): {
  readonly guard: Record<string, unknown>;
  readonly toolCall: Record<string, unknown>;
  readonly hashInput: Record<string, unknown>;
  readonly readinessCall: ResearchActionToolArgs;
} {
  expect(typeof output).toBe('string');
  const text = typeof output === 'string' ? output : '';
  const openTag = text.match(/<execute_aitp_write_bridge_handoff ([^>]*)>/);
  expect(openTag).not.toBeNull();
  const attrs = openTag?.[1] ?? '';
  expect(attrs.length).toBeGreaterThan(0);
  const handoffId = xmlAttr(attrs, 'handoff_id');
  const confirmationId = xmlAttr(attrs, 'confirmation_id');
  const confirmationStatus = xmlAttr(attrs, 'confirmation_status');
  const diagnosticHash = xmlAttr(attrs, 'diagnostic_hash');
  const toolCall = JSON.parse(xmlElementText(text, 'tool_call_json')) as Record<string, unknown>;
  const hashInput = JSON.parse(xmlElementText(text, 'hash_input_json')) as Record<string, unknown>;
  const readinessCall = JSON.parse(xmlElementText(text, 'readiness_call_json')) as ResearchActionToolArgs;
  return {
    guard: {
      handoff_id: handoffId,
      confirmation_id: confirmationId,
      confirmation_status: confirmationStatus,
      diagnostic_hash: diagnosticHash,
      tool_call_json: toolCall,
      hash_input_json: hashInput,
    },
    toolCall,
    hashInput,
    readinessCall,
  };
}

function xmlAttr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  expect(match).not.toBeNull();
  const value = match?.[1];
  expect(value).toBeDefined();
  return unescapeXml(value ?? '');
}

function xmlElementText(output: string, tag: string): string {
  const match = output.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  expect(match).not.toBeNull();
  const value = match?.[1];
  expect(value).toBeDefined();
  return unescapeXml(value ?? '');
}

function toolCallPayload(handoff: { readonly toolCall: Record<string, unknown> }): Record<string, unknown> {
  const payload = handoff.toolCall['aitp_payload'];
  expect(payload).toEqual(expect.any(Object));
  return payload as Record<string, unknown>;
}

function unescapeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function makeAgent(
  records?: AgentRecord[],
  options: {
    readonly physicsMemory?: PhysicsMemoryRegistry | undefined;
    readonly researchLedger?: ResearchLedgerRegistry | undefined;
    readonly aitpRuntimePayloadProfilesProvider?: AitpRuntimePayloadProfilesProvider | undefined;
    readonly aitpRecordRefLookupProvider?: AitpRecordRefLookupProvider | undefined;
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
    aitpRecordRefLookupProvider: options.aitpRecordRefLookupProvider,
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

function fakeRecordRefLookup(
  refs: readonly string[],
  options: { readonly foundRefs?: readonly string[] } = {},
): any {
  const foundRefs = new Set(options.foundRefs ?? []);
  const items = refs.map((ref) => fakeRecordRefLookupItem(ref, foundRefs.has(ref)));
  return {
    ok: true,
    record_ref_lookup: {
      kind: 'record_ref_lookup',
      lookup_scope: 'typed_record_existence_only',
      lookup_count: items.length,
      found_count: items.filter((item) => item.status === 'found').length,
      missing_count: items.filter((item) => item.status === 'not_found').length,
      unsupported_count: items.filter((item) => item.status === 'unsupported_kind').length,
      malformed_count: items.filter((item) => item.status === 'malformed_ref').length,
      refs: items,
      supported_ref_kinds: ['evidence', 'reference_location', 'source_asset'],
      read_surface_effect: 'record_existence_check_only',
      records_validation_result: false,
      source_support_result: false,
      evidence_created: false,
      validation_created: false,
      claim_trust_mutation: 'none',
      can_update_claim_trust: false,
      summary_inputs_trusted: false,
      orientation_only: true,
    },
  };
}

function fakeRecordRefLookupItem(ref: string, found: boolean): any {
  const [refKind = '', recordId = ''] = ref.split(':');
  const surface =
    refKind === 'source_asset'
      ? 'source_asset_record'
      : refKind === 'reference_location'
        ? 'reference_location_record'
        : `${refKind}_record`;
  return {
    ref,
    ref_kind: refKind,
    record_id: recordId,
    id_field: refKind === 'source_asset' ? 'asset_id' : 'location_id',
    surface,
    record_role: 'orientation_only_record',
    store_scope: `registry/${refKind}s`,
    status: found ? 'found' : 'not_found',
    record_confirmed: found,
    topic_id: found ? 'fqhe-literature' : '',
    claim_id: found ? 'claim-fqhe' : '',
    record_kind: found ? refKind : '',
    orientation_only_record: found,
    can_update_record_claim_trust: false,
    read_surface_effect: 'record_existence_check_only',
    records_validation_result: false,
    source_support_result: false,
    claim_trust_mutation: 'none',
    can_update_claim_trust: false,
    suggested_next_operation: found ? '' : suggestedNextOperationForRefKind(refKind),
    suggested_next_entrypoint: found ? '' : suggestedNextEntrypointForRefKind(refKind),
    suggested_next_surface: found ? '' : suggestedNextSurfaceForRefKind(refKind),
    suggested_next_reason: found ? '' : suggestedNextReasonForRefKind(refKind),
    diagnostic: found ? 'record exists in typed store' : '',
  };
}

function suggestedNextOperationForRefKind(refKind: string): string {
  if (refKind === 'source_asset') return 'registerSourceAsset';
  if (refKind === 'reference_location') return 'recordReferenceLocation';
  return '';
}

function suggestedNextEntrypointForRefKind(refKind: string): string {
  if (refKind === 'source_asset') return 'register_source_asset';
  if (refKind === 'reference_location') return 'record_reference_location';
  return '';
}

function suggestedNextSurfaceForRefKind(refKind: string): string {
  if (refKind === 'source_asset') return 'source_asset_record';
  if (refKind === 'reference_location') return 'reference_location_record';
  return '';
}

function suggestedNextReasonForRefKind(refKind: string): string {
  if (refKind === 'source_asset') {
    return 'register or auto-capture a normal AITP source asset before using this ref as source context';
  }
  if (refKind === 'reference_location') {
    return 'record a normal AITP reference location before using this ref as source context';
  }
  return '';
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

function fakeCuratedRagChunkLookup(chunkId: string): any {
  const corpus = fakeCuratedRagCorpus();
  const chunk = corpus.chunks.find((item: any) => item.chunk_id === chunkId) ?? corpus.chunks[0];
  const document =
    corpus.documents.find((item: any) => item.document_id === chunk.document_id) ?? corpus.documents[0];
  return {
    kind: 'curated_rag_chunk',
    catalog_version: AITP_CURATED_RAG_CATALOG_VERSION,
    truth_source: 'curated_rag_chunk_manifest',
    state_effect: 'read_only',
    retrieval_role: 'heuristic_context',
    read_surface_effect: 'orientation_only',
    summary_inputs_trusted: false,
    can_update_claim_trust: false,
    records_validation_result: false,
    claim_trust_mutation: 'none',
    requires_promotion_for_claim_support: true,
    promotion_required_before_claim_support: true,
    lookup_creates_records: false,
    corpus_id: corpus.corpus_id,
    chunk_id: chunk.chunk_id,
    document_id: document.document_id,
    index_mode: 'lexical_fixture',
    stale_index_diagnostics: [],
    chunk,
    document,
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
      lookup_is_evidence: false,
      lookup_records_validation_result: false,
      lookup_satisfies_final_gate: false,
      lookup_can_update_claim_trust: false,
      requires_user_or_model_decision_before_write: true,
    },
  };
}

function typedCuratedRagSearchResult(query: string): any {
  return {
    kind: 'curated_rag_search_result',
    catalogVersion: AITP_CURATED_RAG_CATALOG_VERSION,
    query,
    indexMode: 'lexical_fixture',
    resultRole: 'heuristic_context',
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
    recordsValidationResult: false,
    claimTrustMutation: 'none',
    requiresPromotionForClaimSupport: true,
    staleIndexDiagnostics: [],
    resultCount: 1,
    results: [
      {
        chunkId: 'curated_rag_chunk:source_backtrace_orientation:0001',
        documentId: 'curated_rag_doc:source_backtrace_orientation',
        score: 2,
        retrievalRole: 'heuristic_context',
        orientationOnly: true,
        canUpdateClaimTrust: false,
        summary: 'Retrieved passages suggest source reconstruction, not claim support.',
        text: 'Retrieved passages can suggest where to look next, but claim support needs explicit reference locations and evidence records.',
        anchor: { section: '1' },
        tags: ['source-backtrace'],
        contentHash: 'sha256:chunk-source-backtrace',
        raw: {},
      },
    ],
    raw: {},
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
  const sourceSummary =
    `Promotion draft for curated RAG chunk ${chunk.chunk_id}. The chunk remains heuristic context until ordinary AITP source, evidence, validation, and trust-preflight records are created.`;
  const sourceAssetPayload = {
    topic_id: topicId,
    claim_id: claimId,
    asset_type: document.asset_type,
    uri: document.source_uri,
    title: document.title,
    label: document.title,
    content_hash: document.content_hash,
    hash_algorithm: 'sha256',
    version_anchor: document.version_anchor,
    source_kind: 'curated_rag_promotion_draft',
    summary: sourceSummary,
    source_refs: [chunk.chunk_id],
    artifact_ids: [],
    code_state_ids: [],
    reference_location_ids: [],
    derived_from: [document.document_id, chunk.chunk_id],
    metadata: {
      curated_rag_corpus_id: corpus.corpus_id,
      curated_rag_document_id: document.document_id,
      curated_rag_chunk_id: chunk.chunk_id,
      retrieval_role: 'heuristic_context',
      promotion_intent: 'claim_support_review',
    },
    linked_records: { topic_id: topicId, claim_id: claimId },
  };
  const referencePayload = {
    topic_id: topicId,
    claim_id: claimId,
    connector_id: connectorId,
    location_type: 'paper_section',
    uri: document.source_uri,
    label: document.title,
    source_ref: chunk.chunk_id,
    external_id: document.document_id,
    status: 'located',
    summary: chunk.summary,
    metadata: {
      curated_rag_corpus_id: corpus.corpus_id,
      curated_rag_document_id: document.document_id,
      curated_rag_chunk_id: chunk.chunk_id,
      anchor: chunk.anchor,
      content_hash: chunk.content_hash,
      retrieval_role: 'heuristic_context',
    },
    linked_records: { topic_id: topicId, claim_id: claimId },
  };
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
      fakeDraftOperation(
        'source_asset',
        'registerSourceAsset',
        'aitp_v5_register_source_asset',
        'source_asset_record',
        [],
        { payloadDraft: sourceAssetPayload },
      ),
      fakeDraftOperation(
        'reference_location',
        'recordReferenceLocation',
        'aitp_v5_record_reference_location',
        'reference_location_record',
        [],
        { payloadDraft: referencePayload },
      ),
      fakeDraftOperation('evidence', 'recordEvidence', 'aitp_v5_record_evidence', 'evidence_record', [
        'source_asset_record',
        'reference_location_record',
      ], {
        payloadTemplate: {
          topic_id: topicId,
          claim_id: claimId,
          evidence_type: 'source_text_review',
          status: 'unreviewed',
          summary: chunk.summary,
          supports_outputs: [],
          source_refs: ['<source_asset_id>', '<reference_location_id>'],
          tool_run_ids: [],
          validation_result_ids: [],
          artifact_ids: [],
        },
      }),
      fakeDraftOperation(
        'validation',
        'createValidationContract',
        'aitp_v5_create_validation_contract',
        'validation_contract_record',
        ['evidence_record'],
        {
          payloadTemplate: {
            topic_id: topicId,
            claim_id: claimId,
            required_checks: ['verify_source_text_supports_claim_scope'],
            failure_modes: [
              'retrieved_chunk_is_only_background',
              'source_context_changes_claim_meaning',
            ],
            required_evidence_outputs: ['source_text_claim_support_assessment'],
            tool_recipe_ids: [],
            executor_ids: [],
            validator_role: 'adversarial_reviewer',
          },
        },
      ),
      fakeDraftOperation(
        'trust_preflight',
        'preflightTrustUpdate',
        'aitp_v5_preflight_trust_update',
        'trust_update_preflight',
        ['evidence_record', 'validation_result_record'],
        {
          payloadTemplate: {
            action: 'change_claim_confidence',
            topic_id: topicId,
            claim_id: claimId,
            source_kind: 'typed_records',
            source_ref: '<evidence_id>',
            evidence_refs: ['<evidence_id>'],
            code_state_ids: [],
            rationale: 'Only after source/evidence/validation records exist.',
          },
        },
      ),
    ],
    promotion_write_sequence: fakePromotionWriteSequence(),
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

function fakePromotionWriteSequence(): any[] {
  return [
    fakePromotionWriteStep(1, 'source_asset', 'registerSourceAsset', 'source_asset_record', 'source_asset:<asset_id>', [], ['reference_location', 'evidence']),
    fakePromotionWriteStep(2, 'reference_location', 'recordReferenceLocation', 'reference_location_record', 'reference_location:<location_id>', ['source_asset:<asset_id>'], ['evidence']),
    fakePromotionWriteStep(3, 'evidence', 'recordEvidence', 'evidence_record', 'evidence:<evidence_id>', ['source_asset:<asset_id>', 'reference_location:<location_id>'], ['validation', 'trust_preflight']),
    fakePromotionWriteStep(4, 'validation', 'createValidationContract', 'validation_contract_record', 'validation_contract:<contract_id>', ['evidence:<evidence_id>'], ['trust_preflight']),
    fakePromotionWriteStep(5, 'trust_preflight', 'preflightTrustUpdate', 'trust_update_preflight', 'trust_preflight:<preflight_token>', ['evidence:<evidence_id>', 'validation_result:<result_id>'], []),
  ];
}

function fakePromotionWriteStep(
  order: number,
  stage: string,
  operation: string,
  surface: string,
  outputRef: string,
  requiresPriorRefs: readonly string[],
  feedsNextStages: readonly string[],
): Record<string, unknown> {
  return {
    order,
    stage,
    operation,
    surface,
    output_ref: outputRef,
    requires_prior_refs: requiresPriorRefs,
    feeds_next_stages: feedsNextStages,
    requires_explicit_execute_call: true,
    executes_write_now: false,
    records_validation_result: false,
    claim_trust_mutation: 'none',
  };
}

function fakeDraftOperation(
  stage: string,
  operation: string,
  mcpTool: string,
  surface: string,
  requiresExistingRecords: readonly string[] = [],
  payload: {
    readonly payloadDraft?: Record<string, unknown> | undefined;
    readonly payloadTemplate?: Record<string, unknown> | undefined;
  } = {},
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
    ...(payload.payloadDraft === undefined
      ? { payload_template: payload.payloadTemplate ?? {} }
      : { payload_draft: payload.payloadDraft }),
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
