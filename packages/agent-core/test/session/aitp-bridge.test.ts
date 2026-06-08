import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentOptions } from '../../src/agent';
import {
  AITP_CURATED_RAG_CATALOG_VERSION,
  AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
  type AitpCommandRunner,
} from '../../src/aitp';
import type { SDKSessionRPC } from '../../src/rpc';
import { Session } from '../../src/session';
import { testKaos } from '../fixtures/test-kaos';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
  }
});

describe('Session AITP bridge wiring', () => {
  it('configures dynamic AITP read and write bridges by default', async () => {
    const workDir = await makeTempDir('hakimi-aitp-work-a-');
    const nextWorkDir = await makeTempDir('hakimi-aitp-work-b-');
    const sessionDir = await makeTempDir('hakimi-aitp-session-');
    const calls: string[][] = [];
    const session = new Session({
      id: 'test-aitp-bridge',
      kaos: testKaos.withCwd(workDir),
      homedir: sessionDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      aitp: {
        runner: recordingRunner(calls),
        graphSliceLimit: 6,
      },
    });

    const { agent } = await session.createAgent({ type: 'main' });
    agent.config.update({ cwd: nextWorkDir });
    agent.workFrames.open(
      {
        id: 'frame.qg',
        domain: 'theoretical-physics/general',
        topic: 'qg',
        goal: 'Trace QG/MIPT relation.',
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
      },
      { source: 'controller' },
    );

    const compiled = await agent.aitpProcessGraphProvider?.getProcessGraphSlice({
      workFrame: agent.workFrames.requireFrame('frame.qg'),
      prompt: [{ type: 'text', text: 'Open the source backtrace.' }],
    });
    const catalog = await agent.aitpRuntimePayloadProfilesProvider?.getRuntimePayloadProfiles();
    const ragCorpus = await agent.aitpCuratedRagProvider?.getCuratedRagCorpus();
    const ragSearch = await agent.aitpCuratedRagProvider?.searchCuratedRagCorpus({
      query: 'source backtrace',
      limit: 1,
    });
    const result = await agent.aitpWriteBridge?.executeWrite({
      operation: 'requestHumanCheckpoint',
      payload: {
        topicId: 'qg',
        claimId: 'claim-mipt',
        reason: 'Trust boundary before using this source chain as support.',
        requestedBy: 'hakimi',
        options: ['keep provisional'],
      },
    });

    expect(agent.aitpProcessGraphProvider).toBeDefined();
    expect(agent.aitpRuntimePayloadProfilesProvider).toBeDefined();
    expect(agent.aitpCuratedRagProvider).toBeDefined();
    expect(agent.aitpWriteBridge).toBeDefined();
    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(catalog?.profileIndex).toEqual([
      'benchmark_adapter_run_to_tool_run',
      'primitive_tool_lifecycle_to_tool_run',
    ]);
    expect(ragCorpus?.catalogVersion).toBe(AITP_CURATED_RAG_CATALOG_VERSION);
    expect(ragCorpus?.retrievalPolicy.resultRole).toBe('heuristic_context');
    expect(ragCorpus?.retrievalPolicy.forbiddenUses).toContain('final_gate_satisfaction');
    expect(ragSearch?.resultRole).toBe('heuristic_context');
    expect(ragSearch?.requiresPromotionForClaimSupport).toBe(true);
    expect(result).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-qg',
    });
    expect(calls[0]).toEqual(
      expect.arrayContaining(['--base', nextWorkDir, 'graph', 'slice', 'session-qg']),
    );
    expect(calls[0]).toEqual(expect.arrayContaining(['--limit', '6']));
    expect(calls[1]).toEqual(
      expect.arrayContaining(['adapter', 'payload-profiles']),
    );
    expect(calls[2]).toEqual(
      expect.arrayContaining(['adapter', 'curated-rag-corpus']),
    );
    expect(calls[3]).toEqual(
      expect.arrayContaining(['adapter', 'curated-rag-search', 'source backtrace']),
    );
    expect(calls[4]).toEqual(
      expect.arrayContaining(['--base', nextWorkDir, 'checkpoint', 'request']),
    );
  });

  it('keeps explicit AgentOptions bridges ahead of the default Session bridge', async () => {
    const workDir = await makeTempDir('hakimi-aitp-work-');
    const sessionDir = await makeTempDir('hakimi-aitp-session-');
    const writeBridge = {
      executeWrite: vi.fn(),
    } satisfies NonNullable<AgentOptions['aitpWriteBridge']>;
    const processGraphProvider = {
      getProcessGraphSlice: vi.fn(),
    } satisfies NonNullable<AgentOptions['aitpProcessGraphProvider']>;
    const runtimePayloadProfilesProvider = {
      getRuntimePayloadProfiles: vi.fn(),
    } satisfies NonNullable<AgentOptions['aitpRuntimePayloadProfilesProvider']>;
    const curatedRagProvider = {
      getCuratedRagCorpus: vi.fn(),
      searchCuratedRagCorpus: vi.fn(),
    } satisfies NonNullable<AgentOptions['aitpCuratedRagProvider']>;
    const session = new Session({
      id: 'test-aitp-explicit-bridge',
      kaos: testKaos.withCwd(workDir),
      homedir: sessionDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
    });

    const { agent } = await session.createAgent({
      type: 'main',
      aitpProcessGraphProvider: processGraphProvider,
      aitpRuntimePayloadProfilesProvider: runtimePayloadProfilesProvider,
      aitpCuratedRagProvider: curatedRagProvider,
      aitpWriteBridge: writeBridge,
    });

    expect(agent.aitpProcessGraphProvider).toBe(processGraphProvider);
    expect(agent.aitpRuntimePayloadProfilesProvider).toBe(runtimePayloadProfilesProvider);
    expect(agent.aitpCuratedRagProvider).toBe(curatedRagProvider);
    expect(agent.aitpWriteBridge).toBe(writeBridge);
  });

  it('can disable automatic AITP bridge configuration', async () => {
    const workDir = await makeTempDir('hakimi-aitp-work-');
    const sessionDir = await makeTempDir('hakimi-aitp-session-');
    const session = new Session({
      id: 'test-aitp-disabled',
      kaos: testKaos.withCwd(workDir),
      homedir: sessionDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      aitp: { enabled: false },
    });

    const { agent } = await session.createAgent({ type: 'main' });

    expect(agent.aitpProcessGraphProvider).toBeUndefined();
    expect(agent.aitpRuntimePayloadProfilesProvider).toBeUndefined();
    expect(agent.aitpCuratedRagProvider).toBeUndefined();
    expect(agent.aitpWriteBridge).toBeUndefined();
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createSessionRpc(): SDKSessionRPC {
  return {
    emitEvent: vi.fn(),
    requestApproval: vi.fn(),
    requestQuestion: vi.fn(),
    toolCall: vi.fn(),
  } as unknown as SDKSessionRPC;
}

function recordingRunner(calls: string[][]): AitpCommandRunner {
  return {
    async run(command, args) {
      calls.push([command, ...args]);
      if (args.includes('graph')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(fakeSlicePayload()),
          stderr: '',
        };
      }
      if (args.includes('payload-profiles')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            runtime_payload_profiles: fakeRuntimePayloadProfilesCatalog(),
          }),
          stderr: '',
        };
      }
      if (args.includes('curated-rag-corpus')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            curated_rag_corpus: fakeCuratedRagCorpus(),
          }),
          stderr: '',
        };
      }
      if (args.includes('curated-rag-search')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            curated_rag_search_result: fakeCuratedRagSearchResult(String(args[2] ?? ''), 1),
          }),
          stderr: '',
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          kind: 'human_checkpoint',
          checkpoint_id: 'checkpoint-qg',
          topic_id: 'qg',
          claim_id: 'claim-mipt',
          status: 'requested',
        }),
        stderr: '',
      };
    },
  };
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
      required_host_fields: ['adapter_id', 'case_id', 'action_id', 'outcome', 'observation', 'output', 'topic_id', 'claim_id'],
      optional_host_fields: ['benchmark_payload', 'check_results', 'evidence_refs', 'artifact_refs', 'source_refs', 'primitive_tool_call_ids'],
      payload_key_case: 'camel_or_snake',
      capture_policy: fakeCapturePolicy('controlled_auto', 'ResearchAction.run_benchmark_adapter', false, 'one_tool_run_per_adapter_run'),
      payload_template: { tool_family: 'benchmark_adapter', evidence_status: 'unreviewed' },
      result_semantics: fakeResultSemantics(),
      strict_boundary: 'benchmark adapter outcome is tool-run provenance only',
    },
    {
      profile_id: 'primitive_tool_lifecycle_to_tool_run',
      host_event: 'primitive_tool_lifecycle_completed',
      target_operation: 'recordToolRun',
      target_entrypoint: 'aitp_v5_record_tool_run',
      target_record_action: 'record_tool_run',
      target_surface: 'tool_run_record',
      required_host_fields: ['tool_call_id', 'tool_name', 'status', 'output_summary', 'topic_id', 'claim_id'],
      optional_host_fields: ['args_summary', 'cwd', 'turn_id', 'step_uuid', 'duration_ms', 'artifact_refs', 'source_refs', 'workframe_id', 'action_call_id'],
      payload_key_case: 'camel_or_snake',
      capture_policy: fakeCapturePolicy('explicit_request', 'ResearchAction.capture_primitive_tool_run', true, 'one_tool_run_per_explicit_tool_call_id'),
      payload_template: { tool_family: 'primitive_tool', evidence_status: 'unreviewed' },
      result_semantics: fakeResultSemantics(),
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
      allowed_uses: ['payload_construction', 'capture_policy_diagnostics', 'bridge_readiness_diagnostics'],
      forbidden_uses: ['evidence_support', 'validation_result', 'claim_trust_update', 'trust_apply', 'bulk_auto_capture'],
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
  const results = corpus.chunks.slice(0, limit).map((chunk: any, index: number) => ({
    chunk_id: chunk.chunk_id,
    document_id: chunk.document_id,
    score: index + 1,
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

function fakeCapturePolicy(
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

function fakeResultSemantics(): Record<string, unknown> {
  return {
    record_kind: 'tool_run',
    evidence_ref_prefix: 'aitp:tool_run',
    records_validation_result: false,
    claim_trust_mutation: 'none',
    can_update_claim_trust: false,
    summary_inputs_trusted: false,
  };
}

function fakeSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [
      {
        id: 'claim:claim-mipt',
        type: 'claim',
        record: {
          statement: 'MIPT observer role may be represented by an algebraic split.',
          status: 'hypothesis',
        },
      },
    ],
    edges: [],
    open_obligations: [],
    source_backtrace: [
      {
        claim_id: 'claim-mipt',
        complete: false,
        missing_components: ['source theorem'],
      },
    ],
    relation_neighborhood: [],
    exploratory_records: [],
    trust_boundary_reasons: ['source_support'],
    recommended_moments: [],
  };
}
