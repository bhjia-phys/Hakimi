import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { renderResearchContextPackReminder } from '../../src/agent/workframe/context-pack';
import { ProviderManager } from '../../src/session/provider-manager';
import {
  WorkflowRecipeRegistry,
  compileAitpProcessGraphSlice,
  parseAitpClaimRelationMap,
  parseAitpLiteratureSourceReviewHandoff,
  type AitpClaimRelationMapProvider,
  type AitpCuratedRagProvider,
  type AitpCuratedRagSearchResult,
  type AitpLiteratureSourceReviewHandoffProvider,
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

  it('opens an implicit AITP topic recovery frame before the first model turn', async () => {
    const processGraphCalls: string[][] = [];
    const relationCalls: string[][] = [];
    const aitpProcessGraphProvider: AitpProcessGraphSliceProvider = {
      async getProcessGraphSlice(input) {
        processGraphCalls.push([...input.workFrame.sourceRefs]);
        return null;
      },
    };
    const aitpClaimRelationMapProvider: AitpClaimRelationMapProvider = {
      async getClaimRelationMap(input) {
        relationCalls.push([...input.workFrame.sourceRefs]);
        return parseAitpClaimRelationMap(aitpClaimRelationMapPayload());
      },
    };
    const agent = makeAgent(undefined, {
      aitpProcessGraphProvider,
      aitpClaimRelationMapProvider,
    });
    agent.config.update({
      cwd: 'F:/AI_Workspace/Theoretical-Physics',
    });

    agent.context.appendUserMessage([
      {
        type: 'text',
        text:
          '请作为一个全新的研究会话，恢复理论物理工作区里 `qsgw-ac-error-molecules` 的当前研究状态。请基于 AITP v5 typed records 给出简报。',
      },
    ]);
    await agent.injection.inject();

    expect(agent.workFrames.active).toMatchObject({
      id: 'frame.aitp.qsgw-ac-error-molecules',
      domain: 'theoretical-physics/general',
      topic: 'qsgw-ac-error-molecules',
      sourceRefs: ['aitp:topic:qsgw-ac-error-molecules'],
    });
    expect(processGraphCalls).toEqual([['aitp:topic:qsgw-ac-error-molecules']]);
    expect(relationCalls).toEqual([['aitp:topic:qsgw-ac-error-molecules']]);
    const pack = agent.researchContext.listPacks().at(-1);
    expect(pack?.aitp?.claimRelationMap?.claimId).toBe('claim-ridge-pade-h2o');
    expect(pack?.aitp?.canonicalBasePath).toBe(
      'F:/AI_Workspace/Theoretical-Physics/research/aitp-topics',
    );
    const lastMessage = agent.context.history.at(-1);
    const reminder = (lastMessage?.content[0] as { text: string }).text;
    expect(reminder).toContain('AITP research context is active.');
    expect(reminder).toContain('AITP recovery discipline');
    expect(reminder).toContain('do not probe root .aitp');
    expect(reminder).toContain('AITP relation map: claim=claim-ridge-pade-h2o');
    expect(reminder).toContain('AITP relation map is the current-state boundary for recovery');
    expect(reminder).toContain('use topic token topic:qsgw-ac-error-molecules');
    expect(reminder).toContain(
      'AITP canonical MCP base: F:/AI_Workspace/Theoretical-Physics/research/aitp-topics',
    );
    expect(reminder).toContain(
      'base="F:/AI_Workspace/Theoretical-Physics/research/aitp-topics"',
    );
    expect(reminder).toContain('never pass the .aitp directory itself as the base');
    expect(reminder).toContain('runtime/application failures');
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
        claimRelationMap: parseAitpClaimRelationMap(aitpClaimRelationMapPayload()),
      },
      { source: 'controller' },
    );

    expect(pack.aitp?.contextLines.join('\n')).toContain('Source gaps: claim-fqhe');
    expect(pack.aitp?.contextLines.join('\n')).toContain('AITP claim relation map');
    expect(pack.aitp?.claimRelationMap?.notTestedCount).toBe(1);
    expect(pack.aitp?.claimRelationMap?.cannotSay.join('\n')).toContain(
      'runtime/application failures',
    );
    expect(pack.aitp?.sourceAssetIds).toEqual(['source-asset-edge-counting']);
    expect(pack.aitp?.sourceAssetMissingHashIds).toEqual(['source-asset-edge-counting']);
    expect(pack.aitp?.sourceStackCoverageClaimIds).toEqual(['claim-fqhe']);
    expect(pack.aitp?.sourceStackEvidenceGapClaimIds).toEqual(['claim-fqhe']);
    expect(pack.aitp?.sourceStackReconstructionGapClaimIds).toEqual(['claim-fqhe']);
    expect(pack.aitp?.sourceReconstructionReviewClaimIds).toEqual(['claim-fqhe']);
    expect(pack.aitp?.sourceReconstructionReviewOpenClaimIds).toEqual(['claim-fqhe']);
    expect(pack.aitp?.sourceReconstructionReviewPacketClaimIds).toEqual(['claim-fqhe']);
    expect(pack.actionBindings.map((item) => item.actionId)).toEqual(
      expect.arrayContaining([
        'trace.audit_original_question_drift',
        'trace.follow_source_dependency',
      ]),
    );
  });

  it('fetches AITP process graph slices before research context injection', async () => {
    const calls: string[] = [];
    const relationCalls: string[] = [];
    const aitpProcessGraphProvider: AitpProcessGraphSliceProvider = {
      async getProcessGraphSlice(input) {
        calls.push(input.workFrame.id);
        return compileAitpProcessGraphSlice(aitpSlicePayload(), {
          activeContext: input.prompt.map((part) => part.text ?? ''),
        });
      },
    };
    const aitpClaimRelationMapProvider: AitpClaimRelationMapProvider = {
      async getClaimRelationMap(input) {
        relationCalls.push(input.workFrame.id);
        return parseAitpClaimRelationMap(aitpClaimRelationMapPayload());
      },
    };
    const agent = makeAgent(undefined, {
      aitpProcessGraphProvider,
      aitpClaimRelationMapProvider,
    });
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
    expect(relationCalls).toEqual(['frame.aitp']);
    const lastMessage = agent.context.history.at(-1);
    const reminder = (lastMessage?.content[0] as { text: string }).text;
    expect(reminder).toContain('AITP process graph: truth_source=typed_records');
    expect(reminder).toContain('AITP recovery discipline');
    expect(reminder).toContain('AITP relation map: claim=claim-ridge-pade-h2o');
    expect(reminder).toContain('AITP active claim statement (not a trust promotion)');
    expect(reminder).toContain('H2O one-iteration LibRPA QSGW');
    expect(reminder).toContain('restate the active claim statement/content');
    expect(reminder).toContain('current-state boundary for recovery');
    expect(reminder).toContain('use the bound AITP session/topic refs');
    expect(reminder).toContain('canonical topics root');
    expect(reminder).toContain('AITP relation map cannot say');
    expect(reminder).toContain('runtime/application failures');
    expect(reminder).toContain('AITP relation map next valid actions');
    expect(reminder).toContain('thiele baseline');
    expect(reminder).toContain('AITP open obligations');
    expect(reminder).toContain('AITP live routes: route-source-first');
    expect(reminder).toContain('AITP blocked routes: route-direct-proof');
    expect(reminder).toContain('AITP pivot-required routes: route-source-first');
    expect(reminder).toContain('AITP provenance gaps: gap-code-state');
    expect(reminder).toContain('AITP code provenance gaps: gap-code-state');
    expect(reminder).toContain('AITP source assets: source-asset-edge-counting');
    expect(reminder).toContain('AITP source assets missing hashes: source-asset-edge-counting');
    expect(reminder).toContain('AITP source stack coverage: claim-fqhe');
    expect(reminder).toContain('AITP source stack evidence gaps: claim-fqhe');
    expect(reminder).toContain('AITP source stack reconstruction gaps: claim-fqhe');
    expect(reminder).toContain('AITP source stack next actions: record_evidence_for_required_outputs:claim-fqhe');
    expect(reminder).toContain('AITP source reconstruction review: claim-fqhe');
    expect(reminder).toContain('AITP source reconstruction review open: claim-fqhe');
    expect(reminder).toContain('AITP source reconstruction review next actions: source_reconstruction_review:claim-fqhe');
    expect(reminder).toContain('Theory reasoning for');
    expect(reminder).toContain('source_dependency_backtrace');
    expect(reminder).toContain('original_question_continuity_guard');
    expect(agent.researchContext.listPacks().at(-1)?.aitp?.suggestedActionIds).toEqual(
      expect.arrayContaining([
        'trace.audit_original_question_drift',
        'aitp.capture_code_state_auto',
        'code.capture_git_diff_observation',
        'trace.follow_source_dependency',
      ]),
    );
  });

  it('automatically injects AITP curated RAG for background-oriented prompts', async () => {
    const searchCuratedRagCorpus = vi.fn(async (input: { query: string; limit?: number }) =>
      fakeCuratedRagSearchResult(input.query),
    );
    const aitpCuratedRagProvider: AitpCuratedRagProvider = {
      async getCuratedRagCorpus() {
        throw new Error('not used');
      },
      searchCuratedRagCorpus,
    };
    const agent = makeAgent(undefined, { aitpCuratedRagProvider });
    agent.workFrames.open(
      {
        id: 'frame.rag',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Use curated background to explain FQHE source backtrace without treating it as evidence.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text: 'Explain from scratch the source backtrace idea for FQHE literature.',
      },
    ]);
    await agent.injection.inject();

    expect(searchCuratedRagCorpus).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 3,
        query: expect.stringContaining('Explain from scratch'),
      }),
    );
    const pack = agent.researchContext.listPacks().at(-1);
    expect(pack?.curatedRag).toMatchObject({
      resultRole: 'heuristic_context',
      readSurfaceEffect: 'orientation_only',
      recordsValidationResult: false,
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
      requiresPromotionForClaimSupport: true,
      reasonIds: expect.arrayContaining([
        'conceptual_scaffolding',
        'literature_orientation',
        'source_backtrace_suggestions',
      ]),
    });
    expect(pack?.curatedRag?.results.map((item) => item.chunkId)).toEqual(['chunk.fqhe.source']);
    const lastMessage = agent.context.history.at(-1);
    const reminder = (lastMessage?.content[0] as { text: string }).text;
    expect(reminder).toContain('AITP curated RAG');
    expect(reminder).toContain('chunk.fqhe.source');
    expect(reminder).toContain('heuristic_context only');
    expect(reminder).toContain('promote via AITP source_asset');
  });

  it('suggests curated RAG promotion draft actions for claim-support review turns', async () => {
    const searchCuratedRagCorpus = vi.fn(async (input: { query: string; limit?: number }) =>
      fakeCuratedRagSearchResult(input.query),
    );
    const aitpCuratedRagProvider: AitpCuratedRagProvider = {
      async getCuratedRagCorpus() {
        throw new Error('not used');
      },
      searchCuratedRagCorpus,
    };
    const agent = makeAgent(undefined, { aitpCuratedRagProvider });
    agent.workFrames.open(
      {
        id: 'frame.rag-promotion',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Review whether curated source context should support claim-fqhe.',
        sourceRefs: ['aitp:claim:claim-fqhe'],
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text: 'Should this retrieved source chunk become claim support for claim-fqhe?',
      },
    ]);
    await agent.injection.inject();

    expect(searchCuratedRagCorpus).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 3,
        query: expect.stringContaining('claim support'),
      }),
    );
    const pack = agent.researchContext.listPacks().at(-1);
    expect(pack?.curatedRag).toMatchObject({
      resultRole: 'heuristic_context',
      readSurfaceEffect: 'orientation_only',
      promotionDraftSuggested: true,
      promotionDraftBindingIds: [
        'binding.aitp.curated-rag-promotion-draft.chunk.fqhe.source',
      ],
    });
    expect(pack?.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'draft_aitp_curated_rag_promotion',
        params: expect.objectContaining({
          ragChunkId: 'chunk.fqhe.source',
          aitpTopicId: 'fqhe-literature',
          aitpClaimId: 'claim-fqhe',
          draftCreatesRecords: false,
          recordsValidationResult: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
          requiresUserOrModelDecisionBeforeWrite: true,
        }),
      }),
    );
    expect(pack?.sourceRefs).toEqual(['aitp:claim:claim-fqhe']);
    const lastMessage = agent.context.history.at(-1);
    const reminder = (lastMessage?.content[0] as { text: string }).text;
    expect(reminder).toContain('AITP curated RAG promotion draft actions');
    expect(reminder).toContain('ResearchAction.draft_aitp_curated_rag_promotion');
    expect(reminder).toContain('explicit later write choice');
  });

  it('injects carried-ref repair sequence reminders for malformed handoff repair turns', async () => {
    const agent = makeAgent();
    agent.workFrames.open(
      {
        id: 'frame.carried-ref-repair',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Repair curated RAG carried-ref promotion handoff inputs.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text: 'Fix malformed promotion_carried_ref_handoffs after carried_ref_handoff_failure code="evidence_ref_record_id_mismatch" path="promotion_carried_ref_handoffs[0].evidence_ref" mismatch.',
      },
    ]);
    await agent.injection.inject();

    const pack = agent.researchContext.listPacks().at(-1);
    expect(pack?.curatedRagCarriedRefRepair).toMatchObject({
      active: true,
      taxonomyAction: 'ResearchAction.list_actions',
      draftAction: 'ResearchAction.draft_aitp_curated_rag_write_bridge_call',
      readinessAction: 'ResearchAction.inspect_aitp_write_bridge_handoff_readiness',
      executeAction: 'ResearchAction.execute_aitp_write_bridge',
      executesWriteNow: false,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
      failureCode: 'evidence_ref_record_id_mismatch',
      failurePath: 'promotion_carried_ref_handoffs[0].evidence_ref',
    });
    expect(pack?.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'draft_aitp_curated_rag_write_bridge_call',
        adapterId: 'aitp.curated-rag.carried-ref-repair-draft',
        params: expect.objectContaining({
          failureCode: 'evidence_ref_record_id_mismatch',
          failurePath: 'promotion_carried_ref_handoffs[0].evidence_ref',
          requiresFreshDraftAction: true,
          requiresExplicitChunkSelection: true,
          requiresExplicitPromotionStageOrOperationSelection: true,
          requiresReviewedOverrides: true,
          requiresReadinessInspection: true,
          requiresExplicitExecuteCall: true,
          infersPayloadValues: false,
          executesWriteNow: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
        }),
      }),
    );
    const lastMessage = agent.context.history.at(-1);
    const reminder = (lastMessage?.content[0] as { text: string }).text;
    expect(reminder).toContain('AITP curated RAG carried-ref repair');
    expect(reminder).toContain('ResearchAction.list_actions');
    expect(reminder).toContain('ResearchAction.draft_aitp_curated_rag_write_bridge_call');
    expect(reminder).toContain('ResearchAction.inspect_aitp_write_bridge_handoff_readiness');
    expect(reminder).toContain('separate explicit call');
    expect(reminder).toContain('do not render suggestions, mutate payloads, call bridges, validate');
    expect(reminder).toContain('Action bindings');
    expect(reminder).toContain('draft_aitp_curated_rag_write_bridge_call');
  });

  it('does not bind carried-ref repair drafts without concrete failure code and path', async () => {
    const agent = makeAgent();
    agent.workFrames.open(
      {
        id: 'frame.carried-ref-repair-generic',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Repair curated RAG carried-ref promotion handoff inputs.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text: 'Fix malformed promotion_carried_ref_handoffs after a carried_ref_handoff_failure mismatch.',
      },
    ]);
    await agent.injection.inject();

    const pack = agent.researchContext.listPacks().at(-1);
    expect(pack?.curatedRagCarriedRefRepair).toMatchObject({
      active: true,
      executesWriteNow: false,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
    });
    expect(pack?.curatedRagCarriedRefRepair?.failureCode).toBeUndefined();
    expect(pack?.curatedRagCarriedRefRepair?.failurePath).toBeUndefined();
    expect(pack?.actionBindings.map((item) => item.adapterId)).not.toContain(
      'aitp.curated-rag.carried-ref-repair-draft',
    );
  });

  it('injects carried-ref repair result continuation bindings from prior tool output', async () => {
    const agent = makeAgent();
    agent.workFrames.open(
      {
        id: 'frame.carried-ref-repair-result',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Continue curated RAG promotion after a repaired carried-ref write result.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text:
          'Continue after <carried_ref_repair_result_summary source="execute_aitp_write_bridge_result" handoff_id="curated-rag-write-handoff.chunk.evidence.hash" confirmation_id="curated-rag-confirmation.chunk.evidence.hash" completed_stage="evidence" completed_operation="recordEvidence" result_kind="evidence" record_id="evidence-reviewed-curated-rag" canonical_ref="evidence:evidence-reviewed-curated-rag" evidence_ref="aitp:evidence:evidence-reviewed-curated-rag" ref_kind="evidence" repair_hint_operations="recordReferenceLocation" selected_write_differs_from_repair_hints="true" readiness_checklist_id="readiness-checklist.curated_rag_write_call_draft.curated-rag-write-handoff.chunk.evidence.hash" reviewed_overrides_required="true" readiness_inspection_required="true" explicit_execute_precheck_passed="true" bridge_called="true" result_written_by_aitp="true" next_payload_mutated_now="false" next_write_executed_now="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" can_update_claim_trust="false" requires_explicit_next_draft="true">.',
      },
    ]);
    await agent.injection.inject();

    const pack = agent.researchContext.listPacks().at(-1);
    expect(pack?.curatedRagCarriedRefRepairResult).toMatchObject({
      source: 'execute_aitp_write_bridge_result',
      handoffId: 'curated-rag-write-handoff.chunk.evidence.hash',
      completedOperation: 'recordEvidence',
      canonicalRef: 'evidence:evidence-reviewed-curated-rag',
      evidenceRef: 'aitp:evidence:evidence-reviewed-curated-rag',
      refKind: 'evidence',
      bridgeCalled: true,
      resultWrittenByAitp: true,
      nextPayloadMutatedNow: false,
      nextWriteExecutedNow: false,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
      requiresExplicitNextDraft: true,
    });
    expect(pack?.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'source.review_context',
        adapterId: 'aitp.curated-rag.carried-ref-repair-result-source-context-review',
        params: expect.objectContaining({
          toolAction: 'ResearchAction.plan_primitive_tools',
          actionId: 'source.review_context',
          continuationSource: 'carried_ref_repair_result_summary',
          reviewBeforeDraft: true,
          requiresFreshDraftActionAfterReview: true,
          infersPayloadValues: false,
          mutatesNextPayloadNow: false,
          executesWriteNow: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
        }),
      }),
    );
    expect(pack?.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'draft_aitp_curated_rag_write_bridge_call',
        adapterId: 'aitp.curated-rag.carried-ref-repair-result-continuation',
        params: expect.objectContaining({
          continuationSource: 'carried_ref_repair_result_summary',
          candidateReviewedOverrideRef: 'evidence:evidence-reviewed-curated-rag',
          requiresFreshDraftAction: true,
          requiresExplicitChunkSelection: true,
          requiresExplicitPromotionStageOrOperationSelection: true,
          requiresReviewedOverrides: true,
          requiresReadinessInspection: true,
          requiresExplicitExecuteCall: true,
          infersPayloadValues: false,
          mutatesNextPayloadNow: false,
          executesWriteNow: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
        }),
      }),
    );
    const lastMessage = agent.context.history.at(-1);
    const reminder = (lastMessage?.content[0] as { text: string }).text;
    expect(reminder).toContain('AITP carried-ref repair result');
    expect(reminder).toContain('evidence:evidence-reviewed-curated-rag');
    expect(reminder).toContain('first review source text, chunk scope, and claim scope');
    expect(reminder).toContain('fresh curated RAG write-bridge draft');
    expect(reminder).toContain('do not infer chunk/stage, mutate payloads, execute another write');
  });

  it('does not call AITP curated RAG provider for ordinary action prompts', async () => {
    const aitpCuratedRagProvider: AitpCuratedRagProvider = {
      async getCuratedRagCorpus() {
        throw new Error('not used');
      },
      searchCuratedRagCorpus: vi.fn(),
    };
    const agent = makeAgent(undefined, { aitpCuratedRagProvider });
    agent.workFrames.open(
      {
        id: 'frame.plain',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-implementation',
        goal: 'Make a small runtime change.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([{ type: 'text', text: 'Continue the implementation.' }]);
    await agent.injection.inject();

    expect(aitpCuratedRagProvider.searchCuratedRagCorpus).not.toHaveBeenCalled();
    expect(agent.researchContext.listPacks().at(-1)?.curatedRag).toBeUndefined();
  });

  it('injects source context review outcome routing from prior tool output', async () => {
    const agent = makeAgent();
    agent.workFrames.open(
      {
        id: 'frame.source-review-outcome',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Route a reviewed source context decision.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text:
          'Continue after <source_context_review_outcome source="ResearchAction.finish_action_call" action_id="source.review_context" call_id="call.source-review" outcome="inconclusive" decision="validate_check_source_support" reviewed_canonical_ref="evidence:evidence-reviewed-curated-rag" reviewed_evidence_ref="aitp:evidence:evidence-reviewed-curated-rag" claim_scope="claim:claim-fqhe" chunk_scope="chunk:chunk-fqhe-flux" rationale="Needs explicit source-support validation." next_action_id="validate.check_source_support" requires_explicit_next_action="true" bridge_called="false" executes_write_now="false" mutates_next_payload_now="false" infers_payload_values="false" records_validation_result="false" source_support_result="false" claim_trust_mutation="none" can_update_claim_trust="false">.',
      },
    ]);
    await agent.injection.inject();

    const pack = agent.researchContext.listPacks().at(-1);
    expect(pack?.sourceContextReviewOutcome).toMatchObject({
      source: 'ResearchAction.finish_action_call',
      actionId: 'source.review_context',
      callId: 'call.source-review',
      decision: 'validate_check_source_support',
      nextActionId: 'validate.check_source_support',
      bridgeCalled: false,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
    });
    expect(pack?.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'validate.check_source_support',
        adapterId: 'aitp.curated-rag.source-context-review-outcome',
        params: expect.objectContaining({
          continuationSource: 'source_context_review_outcome',
          requiresExplicitNextAction: true,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
        }),
      }),
    );
    const lastMessage = agent.context.history.at(-1);
    const reminder = (lastMessage?.content[0] as { text: string }).text;
    expect(reminder).toContain('AITP source context review outcome');
    expect(reminder).toContain('decision=validate_check_source_support');
    expect(reminder).toContain('runtime routing only');
    expect(reminder).toContain('do not record validation results, prove source support');
  });

  it('renders literature source review handoff reminders from explicit context options', async () => {
    const agent = makeAgent();
    agent.workFrames.open(
      {
        id: 'frame.literature-handoff-reminder',
        domain: 'topological-order/fqhe-cs',
        topic: 'qg',
        goal: 'Use literature handoff context for source review.',
      },
      { source: 'controller' },
    );

    const pack = agent.researchContext.compileForWorkFrame(
      {
        literatureSourceReviewHandoff: parseAitpLiteratureSourceReviewHandoff(
          fakeLiteratureSourceReviewHandoff(),
        ),
      },
      { source: 'controller' },
    );

    expect(pack.literatureSourceReviewHandoff).toMatchObject({
      sessionId: 'session-qg',
      claimId: 'claim-mipt',
      literatureLabel: 'Observer algebra source',
      readOnly: true,
      bridgeCalled: false,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
    });
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'source.review_context',
        adapterId: 'aitp.literature.source-review-handoff',
        params: expect.objectContaining({
          continuationSource: 'literature_source_review_handoff',
          executesWriteNow: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
        }),
      }),
    );
    const reminder = renderResearchContextPackReminder(pack);
    expect(reminder).toContain('AITP literature source review handoff');
    expect(reminder).toContain('Observer algebra source');
    expect(reminder).toContain('source.review_context');
    expect(reminder).toContain('binding.aitp.literature-source-review-handoff');
    expect(reminder).toContain('read-only context');
    expect(reminder).toContain('do not prove source support, record validation, execute writes');
  });

  it('requests literature source review handoff context from explicit AITP request cues', async () => {
    const getLiteratureSourceReviewHandoff = vi.fn(async () =>
      parseAitpLiteratureSourceReviewHandoff(fakeLiteratureSourceReviewHandoff()),
    );
    const aitpLiteratureSourceReviewHandoffProvider: AitpLiteratureSourceReviewHandoffProvider = {
      getLiteratureSourceReviewHandoff,
    };
    const agent = makeAgent(undefined, { aitpLiteratureSourceReviewHandoffProvider });
    agent.workFrames.open(
      {
        id: 'frame.literature-handoff-request',
        domain: 'quantum-gravity/source-review',
        topic: 'qg',
        goal: 'Review source context for observer algebra literature.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text:
          'Prepare bounded review context for <aitp_literature_source_review_request session_id="session-qg" uri="https://arxiv.org/abs/2601.00001" label="Observer algebra source" external_id="arXiv:2601.00001" short_summary="Close prior art for source reconstruction." detected_relevance="explicit claim scope relevance" claim_id="claim-mipt" scoped_output="source_chain" reviewed_refs="source_asset:asset-reviewed,reference_location:loc-reviewed" read_surface_effect="handoff_context_only" read_only="true" requires_explicit_next_action="true" bridge_called="false" executes_write_now="false" mutates_next_payload_now="false" infers_payload_values="false" summary_inputs_trusted="false" orientation_only="true" can_update_kernel_state="false" records_validation_result="false" source_support_result="false" evidence_created="false" validation_created="false" write_executed="false" trust_update_forbidden="true" claim_trust_mutation="none" can_update_claim_trust="false">.',
      },
    ]);
    await agent.injection.inject();

    expect(getLiteratureSourceReviewHandoff).toHaveBeenCalledWith({
      sessionId: 'session-qg',
      uri: 'https://arxiv.org/abs/2601.00001',
      label: 'Observer algebra source',
      externalId: 'arXiv:2601.00001',
      shortSummary: 'Close prior art for source reconstruction.',
      detectedRelevance: 'explicit claim scope relevance',
      optionalClaimId: 'claim-mipt',
      scopedOutput: 'source_chain',
      reviewedRefs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
    });
    const pack = agent.researchContext.listPacks().at(-1);
    expect(pack?.literatureSourceReviewHandoff).toMatchObject({
      sessionId: 'session-qg',
      literatureLabel: 'Observer algebra source',
      bridgeCalled: false,
      executesWriteNow: false,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
    });
    expect(pack?.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'source.review_context',
        adapterId: 'aitp.literature.source-review-handoff',
      }),
    );
    const injected = agent.context.history.at(-1);
    const reminder = (injected?.content[0] as { text: string }).text;
    expect(reminder).toContain('AITP literature source review handoff');
    expect(reminder).toContain('Observer algebra source');
    expect(reminder).toContain('read-only context');
  });

  it('does not request literature handoff context for ordinary literature prompts', async () => {
    const aitpLiteratureSourceReviewHandoffProvider: AitpLiteratureSourceReviewHandoffProvider = {
      getLiteratureSourceReviewHandoff: vi.fn(),
    };
    const agent = makeAgent(undefined, { aitpLiteratureSourceReviewHandoffProvider });
    agent.workFrames.open(
      {
        id: 'frame.literature-ordinary',
        domain: 'quantum-gravity/source-review',
        topic: 'qg',
        goal: 'Discuss observer algebra literature.',
      },
      { source: 'controller' },
    );

    agent.context.appendUserMessage([
      {
        type: 'text',
        text: 'Review the literature around observer algebras, but do not use an AITP handoff cue.',
      },
    ]);
    await agent.injection.inject();

    expect(
      aitpLiteratureSourceReviewHandoffProvider.getLiteratureSourceReviewHandoff,
    ).not.toHaveBeenCalled();
    expect(agent.researchContext.listPacks().at(-1)?.literatureSourceReviewHandoff).toBeUndefined();
  });

  it('fails closed on incomplete or unsafe literature handoff request cues', async () => {
    const aitpLiteratureSourceReviewHandoffProvider: AitpLiteratureSourceReviewHandoffProvider = {
      getLiteratureSourceReviewHandoff: vi.fn(),
    };
    const missingRequired = makeAgent(undefined, { aitpLiteratureSourceReviewHandoffProvider });
    missingRequired.workFrames.open(
      {
        id: 'frame.literature-missing-request',
        domain: 'quantum-gravity/source-review',
        topic: 'qg',
        goal: 'Review source context for observer algebra literature.',
      },
      { source: 'controller' },
    );
    missingRequired.context.appendUserMessage([
      {
        type: 'text',
        text:
          'Prepare <aitp_literature_source_review_request session_id="session-qg" uri="https://arxiv.org/abs/2601.00001" label="Observer algebra source" short_summary="Close prior art." read_surface_effect="handoff_context_only" read_only="true" requires_explicit_next_action="true" bridge_called="false" executes_write_now="false" mutates_next_payload_now="false" infers_payload_values="false" summary_inputs_trusted="false" orientation_only="true" can_update_kernel_state="false" records_validation_result="false" source_support_result="false" evidence_created="false" validation_created="false" write_executed="false" trust_update_forbidden="true" claim_trust_mutation="none" can_update_claim_trust="false">.',
      },
    ]);
    await missingRequired.injection.inject();

    const unsafeFlag = makeAgent(undefined, { aitpLiteratureSourceReviewHandoffProvider });
    unsafeFlag.workFrames.open(
      {
        id: 'frame.literature-unsafe-request',
        domain: 'quantum-gravity/source-review',
        topic: 'qg',
        goal: 'Review source context for observer algebra literature.',
      },
      { source: 'controller' },
    );
    unsafeFlag.context.appendUserMessage([
      {
        type: 'text',
        text:
          'Prepare <aitp_literature_source_review_request session_id="session-qg" uri="https://arxiv.org/abs/2601.00001" label="Observer algebra source" short_summary="Close prior art." detected_relevance="explicit claim scope relevance" read_surface_effect="handoff_context_only" read_only="true" requires_explicit_next_action="true" bridge_called="true" executes_write_now="false" mutates_next_payload_now="false" infers_payload_values="false" summary_inputs_trusted="false" orientation_only="true" can_update_kernel_state="false" records_validation_result="false" source_support_result="false" evidence_created="false" validation_created="false" write_executed="false" trust_update_forbidden="true" claim_trust_mutation="none" can_update_claim_trust="false">.',
      },
    ]);
    await unsafeFlag.injection.inject();

    expect(
      aitpLiteratureSourceReviewHandoffProvider.getLiteratureSourceReviewHandoff,
    ).not.toHaveBeenCalled();
    expect(
      missingRequired.researchContext.listPacks().at(-1)?.literatureSourceReviewHandoff,
    ).toBeUndefined();
    expect(unsafeFlag.researchContext.listPacks().at(-1)?.literatureSourceReviewHandoff).toBeUndefined();
  });
});

function makeAgent(
  records?: AgentRecord[],
  options: {
    readonly workflowRecipes?: WorkflowRecipeRegistry | undefined;
    readonly aitpProcessGraphProvider?: AitpProcessGraphSliceProvider | undefined;
    readonly aitpClaimRelationMapProvider?: AitpClaimRelationMapProvider | undefined;
    readonly aitpCuratedRagProvider?: AitpCuratedRagProvider | undefined;
    readonly aitpLiteratureSourceReviewHandoffProvider?:
      | AitpLiteratureSourceReviewHandoffProvider
      | undefined;
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
    aitpClaimRelationMapProvider: options.aitpClaimRelationMapProvider,
    aitpCuratedRagProvider: options.aitpCuratedRagProvider,
    aitpLiteratureSourceReviewHandoffProvider:
      options.aitpLiteratureSourceReviewHandoffProvider,
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  return agent;
}

function fakeLiteratureSourceReviewHandoff(): any {
  return {
    ok: true,
    kind: 'literature_source_review_handoff',
    session_id: 'session-qg',
    topic_id: 'qg',
    claim_id: 'claim-mipt',
    literature_intake_suggestion: {
      ok: true,
      kind: 'literature_intake_suggestion',
      session_id: 'session-qg',
      topic_id: 'qg',
      active_claim: 'claim-mipt',
      recommended_action: 'record_reference_plus_evidence_candidate',
      reference_candidate: {
        location_id: 'reference-location-observer-algebra',
        topic_id: 'qg',
        claim_id: 'claim-mipt',
        connector_id: 'literature_search',
        location_type: 'paper',
        uri: 'https://arxiv.org/abs/2601.00001',
        label: 'Observer algebra source',
        external_id: 'arXiv:2601.00001',
        status: 'candidate',
        summary: 'Close prior art for source reconstruction.',
        metadata: { detected_relevance: 'explicit claim scope relevance' },
        linked_records: { claim_id: 'claim-mipt' },
        orientation_only: true,
      },
      guarded_next_steps: [],
      mcp_templates: {},
      cli_templates: [],
      risk_notes: ['not_a_supports_claim_by_default'],
      forbidden_without_preflight: ['aitp_v5_preflight_trust_update'],
      trust_update_forbidden: true,
      summary_inputs_trusted: false,
      orientation_only: true,
      can_update_kernel_state: false,
      can_update_claim_trust: false,
      truth_source: 'session_binding_and_agent_supplied_literature_metadata',
    },
    record_ref_lookup: {
      kind: 'record_ref_lookup',
      lookup_scope: 'typed_record_existence_only',
      lookup_count: 1,
      found_count: 1,
      missing_count: 0,
      unsupported_count: 0,
      malformed_count: 0,
      refs: [
        {
          ref: 'source_asset:asset-reviewed',
          ref_kind: 'source_asset',
          record_id: 'asset-reviewed',
          id_field: 'asset_id',
          surface: 'source_asset_record',
          record_role: 'orientation_only_record',
          store_scope: 'registry/source_assets',
          status: 'found',
          record_confirmed: true,
          topic_id: 'qg',
          claim_id: 'claim-mipt',
          record_kind: 'source_asset',
          orientation_only_record: true,
          can_update_record_claim_trust: false,
          read_surface_effect: 'record_existence_check_only',
          records_validation_result: false,
          source_support_result: false,
          claim_trust_mutation: 'none',
          can_update_claim_trust: false,
          suggested_next_operation: '',
          suggested_next_entrypoint: '',
          suggested_next_surface: '',
          suggested_next_reason: '',
          diagnostic: 'record exists in typed store',
        },
      ],
      supported_ref_kinds: ['source_asset'],
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
    source_stack_coverage_item: {
      claim_id: 'claim-mipt',
      coverage_status: 'incomplete',
      missing_count: 1,
    },
    source_reconstruction_review_packet: {
      kind: 'source_reconstruction_review_packet',
      claim_id: 'claim-mipt',
      review_status: 'needs_review',
    },
    recommended_next_entrypoints: [
      {
        entrypoint: 'record_reference_location',
        surface: 'reference_location_record',
        reason: 'record the literature location before using it as source context',
      },
    ],
    handoff_policy: {
      source: 'composed_read_only_aitp_surfaces',
      host_may_use_for: [
        'literature_orientation',
        'source_context_review',
        'record_ref_existence_check',
        'source_stack_gap_review',
        'next_action_selection',
      ],
      requires_explicit_next_entrypoint: true,
      allowed_next_entrypoints: [
        'record_reference_location',
        'register_source_asset',
        'record_evidence',
        'create_validation_contract',
        'record_validation_result',
        'record_source_reconstruction_review_result',
        'preflight_trust_update',
      ],
      forbidden_uses: [
        'evidence_support',
        'source_support_result',
        'validation_result',
        'write_execution',
        'final_gate_satisfaction',
        'claim_trust_update',
        'trust_apply',
      ],
    },
    allowed_next_tool_call: {
      action: 'plan_primitive_tools',
      action_id: 'source.review_context',
      requires_explicit_next_action: true,
      records_validation_result: false,
      source_support_result: false,
      claim_trust_mutation: 'none',
    },
    read_surface_effect: 'handoff_context_only',
    read_only: true,
    requires_explicit_next_action: true,
    bridge_called: false,
    executes_write_now: false,
    mutates_next_payload_now: false,
    infers_payload_values: false,
    summary_inputs_trusted: false,
    orientation_only: true,
    can_update_kernel_state: false,
    can_update_claim_trust: false,
    records_validation_result: false,
    source_support_result: false,
    evidence_created: false,
    validation_created: false,
    write_executed: false,
    trust_update_forbidden: true,
    claim_trust_mutation: 'none',
    truth_source: 'composed_typed_records_and_agent_supplied_literature_metadata',
  };
}

function fakeCuratedRagSearchResult(query: string): AitpCuratedRagSearchResult {
  return {
    kind: 'curated_rag_search_result',
    catalogVersion: 'aitp.v5.curated_rag_corpus.v1',
    query,
    indexMode: 'lexical_file_backed',
    resultRole: 'heuristic_context',
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
    recordsValidationResult: false,
    claimTrustMutation: 'none',
    requiresPromotionForClaimSupport: true,
    indexStatus: 'fresh',
    staleIndexDiagnostics: [],
    resultCount: 1,
    results: [
      {
        chunkId: 'chunk.fqhe.source',
        documentId: 'doc.fqhe.lecture',
        score: 2.5,
        retrievalRole: 'heuristic_context',
        orientationOnly: true,
        canUpdateClaimTrust: false,
        summary: 'Background orientation for source backtrace in FQHE literature.',
        text: 'Use this as a conceptual hint, not as claim evidence.',
        anchor: { section: 'source backtrace' },
        tags: ['fqhe', 'source-backtrace'],
        contentHash: 'sha256:chunk-fqhe-source',
        raw: {},
      },
    ],
    raw: {},
  };
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
    route_state: {
      active_route_id: 'route-source-first',
      routes: [
        {
          route_id: 'route-source-first',
          topic_id: 'fqhe-literature',
          claim_id: 'claim-fqhe',
          title: 'Source-first route',
          route_type: 'source_backtrace',
          status: 'live',
          active: true,
          rationale: 'Follow source dependency before direct proof.',
          parent_route_ids: ['route-direct-proof'],
          pivot_reason: 'direct proof is missing a reference location',
        },
        {
          route_id: 'route-direct-proof',
          topic_id: 'fqhe-literature',
          claim_id: 'claim-fqhe',
          title: 'Direct proof route',
          route_type: 'derivation',
          status: 'blocked',
          rationale: 'Try direct proof from the current relation.',
          failure_modes: ['missing reference location'],
          lesson: 'Keep source dependency explicit before direct proof.',
        },
      ],
      live_route_ids: ['route-source-first'],
      blocked_route_ids: ['route-direct-proof'],
      abandoned_route_ids: [],
      pivot_required_route_ids: ['route-source-first'],
    },
    provenance_gaps: [
      {
        gap_id: 'gap-code-state',
        gap_type: 'code_state_missing',
        provenance_kind: 'code',
        reason: 'code-dependent route has no git code state',
        topic_id: 'fqhe-literature',
        claim_id: 'claim-fqhe',
        target_type: 'claim',
        target_id: 'claim-fqhe',
        target_refs: ['claim:claim-fqhe'],
        recommended_actions: ['aitp.capture_code_state_auto'],
        recommended_entrypoints: ['aitp_v5_capture_code_state_auto'],
        severity: 'recommended',
        required_now: false,
        required_before_trust_change: false,
        strict_boundary: 'before_using_as_evidence_validation_benchmark_memory_or_checked_conclusion',
        blocking_when_used_as: ['benchmark_basis'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
    ],
    source_asset_index: [
      {
        asset_id: 'source-asset-edge-counting',
        topic_id: 'fqhe-literature',
        claim_id: 'claim-fqhe',
        asset_type: 'paper',
        uri: 'arxiv:2601.00001',
        title: 'Edge counting source asset',
        source_kind: 'literature',
        hash_status: 'missing',
        target_refs: ['source_asset:source-asset-edge-counting'],
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
          topic_id: 'fqhe-literature',
          claim_id: 'claim-fqhe',
          claim_statement: 'Sector counting identifies the edge CFT.',
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
            'record_evidence_for_required_outputs:claim-fqhe',
            'complete_source_reconstruction:claim-fqhe',
            'review_source_reconstruction:claim-fqhe',
          ],
          can_update_claim_trust: false,
        },
      ],
      next_actions: [
        'record_evidence_for_required_outputs:claim-fqhe',
        'complete_source_reconstruction:claim-fqhe',
        'review_source_reconstruction:claim-fqhe',
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
          topic_id: 'fqhe-literature',
          claim_id: 'claim-fqhe',
          claim_statement: 'Sector counting identifies the edge CFT.',
          source_reconstruction_status: 'incomplete',
          missing_components: ['reconstruction_path'],
          review_status: 'pending',
          review_result_ids: [],
          latest_review_result: {},
          reviewed_components: [],
          remaining_actions: [],
          review_packet_cli: 'aitp-v5 source reconstruction-review --claim claim-fqhe',
          result_cli: 'aitp-v5 source reconstruction-review-result --claim claim-fqhe <args>',
          next_actions: ['source_reconstruction_review', 'complete_source_reconstruction'],
          can_update_claim_trust: false,
        },
      ],
      next_actions: ['source_reconstruction_review:claim-fqhe'],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
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

function aitpClaimRelationMapPayload() {
  return {
    kind: 'claim_relation_map',
    topic_id: 'qsgw-ac-error-molecules',
    session_id: 'qsgw-si-recovery',
    claim_id: 'claim-ridge-pade-h2o',
    claim_statement:
      'H2O one-iteration LibRPA QSGW ridge-regularized Pade reduces AC error amplification versus Thiele.',
    confidence_state: 'hypothesis',
    evidence_profile: 'code_method',
    latest_claim_status: {
      claim_status: 'hypothesis_with_runtime_blocker',
    },
    supported_by: [
      {
        record_kind: 'evidence',
        record_id: 'evidence-h2o-replay',
        relation_to_claim: 'supports_claim',
        status: 'supports',
        summary: 'H2O dump and one-iteration replay support AC error-amplification reduction.',
        reason: 'positive H2O replay evidence',
        source_refs: ['artifact:h2o-dump'],
        evidence_refs: ['evidence-h2o-replay'],
        tool_run_ids: ['tool-run-h2o-replay'],
        artifact_ids: [],
      },
    ],
    limited_by: [
      {
        record_kind: 'evidence',
        record_id: 'evidence-h2o-gap-audit',
        relation_to_claim: 'limits_claim',
        status: 'mixed',
        summary: 'Strong ridge parameters may alter the gap.',
        reason: 'gap bias limitation',
        source_refs: ['artifact:h2o-gap-audit'],
        evidence_refs: ['evidence-h2o-gap-audit'],
        tool_run_ids: [],
        artifact_ids: [],
      },
    ],
    contradicted_by: [],
    not_tested_by: [
      {
        record_kind: 'evidence',
        record_id: 'evidence-si-runtime',
        relation_to_claim: 'does_not_test_algorithm',
        status: 'negative',
        summary:
          'Si job 2023865 failed before analytic continuation because of ScaLAPACK Wc executable path.',
        reason: 'runtime/application failure before AC',
        source_refs: ['slurm:2023865'],
        evidence_refs: ['evidence-si-runtime'],
        tool_run_ids: ['tool-run-si-runtime'],
        artifact_ids: [],
      },
    ],
    object_relations: [],
    current_conclusion: {
      can_say: ['H2O evidence supports reduced AC amplification within the tested setup.'],
      cannot_say: [
        'runtime/application failures cannot support or refute the ridge algorithm.',
        'cannot say ridge preserves the Si gap before a completed Si AC comparison.',
      ],
    },
    current_blockers: ['ScaLAPACK Wc executable path'],
    next_valid_actions: ['Reproduce Si thiele baseline with the same executable, then rerun ridge.'],
    source_records: {
      claims: ['claim-ridge-pade-h2o'],
      evidence: ['evidence-h2o-replay', 'evidence-h2o-gap-audit', 'evidence-si-runtime'],
      tool_runs: ['tool-run-h2o-replay', 'tool-run-si-runtime'],
      claim_statuses: ['claim-status-si-runtime'],
      proof_obligations: [],
      object_relations: [],
    },
    derived_from: ['claim_status_records', 'evidence_records', 'tool_run_records'],
    truth_source: false,
    orientation_only: true,
    summary_inputs_trusted: false,
    can_update_kernel_state: false,
    can_update_claim_trust: false,
    trust_update_allowed: false,
  };
}
