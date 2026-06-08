import { describe, expect, it } from 'vitest';

import {
  AITP_CURATED_RAG_CATALOG_VERSION,
  AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
  aitpRuntimePayloadProfileById,
  createDynamicAitpCliCuratedRagProvider,
  createDynamicAitpCliProcessGraphSliceProvider,
  createDynamicAitpCliRecordRefLookupProvider,
  createDynamicAitpCliRuntimePayloadProfilesProvider,
  createDynamicAitpCliWriteBridgeExecutor,
  createDynamicAitpMcpFirstCuratedRagProvider,
  createDynamicAitpMcpFirstProcessGraphSliceProvider,
  createDynamicAitpMcpFirstRecordRefLookupProvider,
  createDynamicAitpMcpFirstRuntimePayloadProfilesProvider,
  createDynamicAitpMcpFirstWriteBridgeExecutor,
  mcpArgsForAitpProcessGraphSliceRead,
  type AitpCommandRunner,
} from '../../src/aitp';
import type { WorkFrame } from '../../src/research-action';

describe('AITP dynamic session bridge', () => {
  it('does not call AITP when a WorkFrame has no explicit AITP scope', async () => {
    const calls: string[][] = [];
    const provider = createDynamicAitpCliProcessGraphSliceProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(calls),
    });

    await expect(
      provider.getProcessGraphSlice({
        workFrame: workFrame({ sourceRefs: [] }),
        prompt: [],
      }),
    ).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it('uses the latest base path for graph reads and write-bridge calls', async () => {
    const calls: string[][] = [];
    let basePath = 'F:/project-a';
    const runner = recordingRunner(calls);
    const provider = createDynamicAitpCliProcessGraphSliceProvider({
      basePath: () => basePath,
      runner,
      limit: 5,
    });
    const writeBridge = createDynamicAitpCliWriteBridgeExecutor({
      basePath: () => basePath,
      runner,
    });

    const compiled = await provider.getProcessGraphSlice({
      workFrame: workFrame({
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
      }),
      prompt: [{ type: 'text', text: 'Trace source dependency.' }],
    });
    basePath = 'F:/project-b';
    const result = await writeBridge.executeWrite({
      operation: 'requestHumanCheckpoint',
      payload: {
        topicId: 'qg',
        claimId: 'claim-mipt',
        reason: 'Trust boundary before using the traced source as support.',
        requestedBy: 'hakimi',
        options: ['keep provisional'],
      },
    });

    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(result).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-qg',
    });
    expect(calls[0]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project-a',
      'graph',
      'slice',
      'session-qg',
      '--limit',
      '5',
      '--claim',
      'claim-mipt',
    ]);
    expect(calls[1]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project-b',
      'checkpoint',
      'request',
      '--topic',
      'qg',
      '--claim',
      'claim-mipt',
      '--reason',
      'Trust boundary before using the traced source as support.',
      '--requested-by',
      'hakimi',
      '--option',
      'keep provisional',
    ]);
  });

  it('uses the latest base path for MCP-first write-bridge calls', async () => {
    const calls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    let basePath = 'F:/project-a';
    const writeBridge = createDynamicAitpMcpFirstWriteBridgeExecutor({
      basePath: () => basePath,
      runner: recordingRunner([]),
      mcpTransport: {
        async callTool(input) {
          calls.push({ toolName: input.toolName, args: input.args });
          return {
            ok: true,
            kind: 'human_checkpoint',
            checkpoint_id: 'checkpoint-qg-mcp',
            topic_id: 'qg',
            claim_id: 'claim-mipt',
            status: 'requested',
          };
        },
      },
    });

    basePath = 'F:/project-b';
    const result = await writeBridge.executeWrite({
      operation: 'requestHumanCheckpoint',
      payload: {
        topicId: 'qg',
        claimId: 'claim-mipt',
        reason: 'Trust boundary before using the traced source as support.',
        requestedBy: 'hakimi',
        options: ['keep provisional'],
      },
    });

    expect(result).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-qg-mcp',
    });
    expect(calls).toEqual([
      {
        toolName: 'aitp_v5_request_human_checkpoint',
        args: {
          base: 'F:/project-b',
          topic_id: 'qg',
          claim_id: 'claim-mipt',
          reason: 'Trust boundary before using the traced source as support.',
          requested_by: 'hakimi',
          options: ['keep provisional'],
        },
      },
    ]);
  });

  it('uses AITP-owned curated RAG ingestion through dynamic write bridges', async () => {
    const cliCalls: string[][] = [];
    const writeBridge = createDynamicAitpCliWriteBridgeExecutor({
      basePath: () => 'F:/project',
      runner: recordingRunner(cliCalls),
    });
    const cliResult = await writeBridge.executeWrite({
      operation: 'ingestCuratedRagCorpus',
      payload: {
        paths: ['notes/dmft.md'],
        corpusId: 'aitp.curated.dmft.v1',
        tags: ['dmft'],
        topicHints: ['gw-dmft'],
        chunkTokenLimit: 180,
      },
    });

    expect(cliResult).toMatchObject({
      kind: 'curated_rag_ingest_result',
      stateEffect: 'curated_rag_manifest_write',
      canUpdateClaimTrust: false,
    });
    expect(cliCalls[0]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project',
      'curated-rag',
      'ingest',
      '--path',
      'notes/dmft.md',
      '--corpus-id',
      'aitp.curated.dmft.v1',
      '--tag',
      'dmft',
      '--topic-hint',
      'gw-dmft',
      '--chunk-token-limit',
      '180',
    ]);

    const mcpCalls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    const mcpBridge = createDynamicAitpMcpFirstWriteBridgeExecutor({
      basePath: () => 'F:/project',
      runner: recordingRunner([]),
      mcpTransport: {
        async callTool(input) {
          mcpCalls.push({ toolName: input.toolName, args: input.args });
          return fakeCuratedRagIngestResult();
        },
      },
    });

    const mcpResult = await mcpBridge.executeWrite({
      operation: 'ingestCuratedRagCorpus',
      payload: {
        paths: ['notes/dmft.md'],
        corpusId: 'aitp.curated.dmft.v1',
        tags: ['dmft'],
        rebuildIndex: true,
      },
    });

    expect(mcpResult.kind).toBe('curated_rag_ingest_result');
    expect(mcpCalls).toEqual([
      {
        toolName: 'aitp_v5_ingest_curated_rag_corpus',
        args: {
          base: 'F:/project',
          paths: ['notes/dmft.md'],
          corpus_id: 'aitp.curated.dmft.v1',
          tags: ['dmft'],
          rebuild_index: true,
        },
      },
    ]);
  });

  it('uses MCP-first transport for process graph reads', async () => {
    const cliCalls: string[][] = [];
    const mcpCalls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    let basePath = 'F:/project-a';
    const provider = createDynamicAitpMcpFirstProcessGraphSliceProvider({
      basePath: () => basePath,
      runner: recordingRunner(cliCalls),
      limit: 7,
      mcpTransport: {
        async callTool(input) {
          mcpCalls.push({ toolName: input.toolName, args: input.args });
          return fakeSlicePayload();
        },
      },
    });

    basePath = 'F:/project-b';
    const compiled = await provider.getProcessGraphSlice({
      workFrame: workFrame({
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
      }),
      prompt: [{ type: 'text', text: 'Trace source dependency.' }],
    });

    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(cliCalls).toEqual([]);
    expect(mcpCalls).toEqual([
      {
        toolName: 'aitp_v5_get_process_graph_slice',
        args: {
          base: 'F:/project-b',
          session_id: 'session-qg',
          claim_id: 'claim-mipt',
          limit: 7,
        },
      },
    ]);
  });

  it('falls back to CLI process graph reads when MCP fails', async () => {
    const cliCalls: string[][] = [];
    const provider = createDynamicAitpMcpFirstProcessGraphSliceProvider({
      basePath: () => 'F:/project-cli',
      runner: recordingRunner(cliCalls),
      limit: 3,
      mcpTransport: {
        async callTool() {
          throw new Error('MCP unavailable');
        },
      },
    });

    const compiled = await provider.getProcessGraphSlice({
      workFrame: workFrame({
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
      }),
      prompt: [{ type: 'text', text: 'Trace source dependency.' }],
    });

    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(cliCalls[0]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project-cli',
      'graph',
      'slice',
      'session-qg',
      '--limit',
      '3',
      '--claim',
      'claim-mipt',
    ]);
  });

  it('builds process graph read MCP args from AITP scope', () => {
    expect(
      mcpArgsForAitpProcessGraphSliceRead(
        'F:/project',
        { sessionId: 'session-qg', claimId: 'claim-mipt' },
        11,
      ),
    ).toEqual({
      base: 'F:/project',
      session_id: 'session-qg',
      claim_id: 'claim-mipt',
      limit: 11,
    });
  });

  it('reads runtime payload profiles through dynamic CLI fallback', async () => {
    const calls: string[][] = [];
    const provider = createDynamicAitpCliRuntimePayloadProfilesProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(calls),
    });

    const catalog = await provider.getRuntimePayloadProfiles();

    expect(calls[0]).toEqual(['aitp-v5', 'adapter', 'payload-profiles']);
    expect(catalog.catalogVersion).toBe(AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION);
    expect(catalog.profileCount).toBe(2);
    expect(
      aitpRuntimePayloadProfileById(catalog, 'primitive_tool_lifecycle_to_tool_run')
        ?.capturePolicy.requiresToolCallId,
    ).toBe(true);
    expect(catalog.canUpdateClaimTrust).toBe(false);
  });

  it('uses MCP-first transport for runtime payload profile reads without scope args', async () => {
    const cliCalls: string[][] = [];
    const mcpCalls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    const provider = createDynamicAitpMcpFirstRuntimePayloadProfilesProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(cliCalls),
      mcpTransport: {
        async callTool(input) {
          mcpCalls.push({ toolName: input.toolName, args: input.args });
          return {
            ok: true,
            runtime_payload_profiles: fakeRuntimePayloadProfilesCatalog(),
          };
        },
      },
    });

    const catalog = await provider.getRuntimePayloadProfiles();

    expect(cliCalls).toEqual([]);
    expect(mcpCalls).toEqual([
      {
        toolName: 'aitp_v5_get_runtime_payload_profiles',
        args: {},
      },
    ]);
    expect(catalog.profileIndex).toEqual([
      'benchmark_adapter_run_to_tool_run',
      'primitive_tool_lifecycle_to_tool_run',
    ]);
  });

  it('falls back to CLI runtime payload profile reads when MCP fails', async () => {
    const cliCalls: string[][] = [];
    const provider = createDynamicAitpMcpFirstRuntimePayloadProfilesProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(cliCalls),
      mcpTransport: {
        async callTool() {
          throw new Error('MCP unavailable');
        },
      },
    });

    const catalog = await provider.getRuntimePayloadProfiles();

    expect(catalog.profileCount).toBe(2);
    expect(cliCalls[0]).toEqual(['aitp-v5', 'adapter', 'payload-profiles']);
  });

  it('looks up AITP record refs through dynamic CLI fallback', async () => {
    const calls: string[][] = [];
    const provider = createDynamicAitpCliRecordRefLookupProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(calls),
    });

    const lookup = await provider.lookupRecordRefs({
      refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
    });

    expect(calls[0]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project',
      'adapter',
      'record-ref-lookup',
      'source_asset:asset-reviewed',
      'reference_location:loc-reviewed',
    ]);
    expect(lookup.kind).toBe('record_ref_lookup');
    expect(lookup.lookupScope).toBe('typed_record_existence_only');
    expect(lookup.claimTrustMutation).toBe('none');
    expect(lookup.refs[0]?.recordConfirmed).toBe(true);
  });

  it('uses MCP-first transport for AITP record-ref lookup reads', async () => {
    const cliCalls: string[][] = [];
    const mcpCalls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    const provider = createDynamicAitpMcpFirstRecordRefLookupProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(cliCalls),
      mcpTransport: {
        async callTool(input) {
          mcpCalls.push({ toolName: input.toolName, args: input.args });
          return fakeRecordRefLookup(['source_asset:asset-reviewed'], {
            foundRefs: ['source_asset:asset-reviewed'],
          });
        },
      },
    });

    const lookup = await provider.lookupRecordRefs({
      refs: ['source_asset:asset-reviewed'],
    });

    expect(cliCalls).toEqual([]);
    expect(mcpCalls).toEqual([
      {
        toolName: 'aitp_v5_lookup_record_refs',
        args: {
          base: 'F:/project',
          refs: ['source_asset:asset-reviewed'],
        },
      },
    ]);
    expect(lookup.foundCount).toBe(1);
    expect(lookup.recordsValidationResult).toBe(false);
  });

  it('reads curated RAG through dynamic CLI fallback', async () => {
    const calls: string[][] = [];
    const provider = createDynamicAitpCliCuratedRagProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(calls),
    });

    const corpus = await provider.getCuratedRagCorpus();
    const search = await provider.searchCuratedRagCorpus({
      query: 'source backtrace',
      limit: 1,
    });
    const draft = await provider.draftCuratedRagPromotion?.({
      chunkId: 'curated_rag_chunk:source_backtrace_orientation:0001',
      topicId: 'qg',
      claimId: 'claim-mipt',
      connectorId: 'local_pdf',
    });

    expect(calls[0]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project',
      'adapter',
      'curated-rag-corpus',
    ]);
    expect(calls[1]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project',
      'adapter',
      'curated-rag-search',
      'source backtrace',
      '--limit',
      '1',
    ]);
    expect(calls[2]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project',
      'adapter',
      'curated-rag-promotion-draft',
      'curated_rag_chunk:source_backtrace_orientation:0001',
      '--topic',
      'qg',
      '--claim',
      'claim-mipt',
      '--connector',
      'local_pdf',
    ]);
    expect(corpus.catalogVersion).toBe(AITP_CURATED_RAG_CATALOG_VERSION);
    expect(corpus.retrievalPolicy.resultRole).toBe('heuristic_context');
    expect(corpus.retrievalPolicy.forbiddenUses).toContain('final_gate_satisfaction');
    expect(search.resultRole).toBe('heuristic_context');
    expect(search.claimTrustMutation).toBe('none');
    expect(draft?.kind).toBe('curated_rag_promotion_draft');
    expect(draft?.draftCreatesRecords).toBe(false);
  });

  it('uses MCP-first transport for curated RAG reads and searches without base args', async () => {
    const cliCalls: string[][] = [];
    const mcpCalls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    const provider = createDynamicAitpMcpFirstCuratedRagProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(cliCalls),
      mcpTransport: {
        async callTool(input) {
          mcpCalls.push({ toolName: input.toolName, args: input.args });
          if (input.toolName === 'aitp_v5_search_curated_rag_corpus') {
            return {
              ok: true,
              curated_rag_search_result: fakeCuratedRagSearchResult('source backtrace', 1),
            };
          }
          if (input.toolName === 'aitp_v5_draft_curated_rag_promotion') {
            return {
              ok: true,
              curated_rag_promotion_draft: fakeCuratedRagPromotionDraft(
                'curated_rag_chunk:source_backtrace_orientation:0001',
                {
                  topicId: 'qg',
                  claimId: 'claim-mipt',
                  connectorId: 'local_pdf',
                },
              ),
            };
          }
          return {
            ok: true,
            curated_rag_corpus: fakeCuratedRagCorpus(),
          };
        },
      },
    });

    const corpus = await provider.getCuratedRagCorpus();
    const search = await provider.searchCuratedRagCorpus({
      query: 'source backtrace',
      limit: 1,
    });
    const draft = await provider.draftCuratedRagPromotion?.({
      chunkId: 'curated_rag_chunk:source_backtrace_orientation:0001',
      topicId: 'qg',
      claimId: 'claim-mipt',
      connectorId: 'local_pdf',
    });

    expect(cliCalls).toEqual([]);
    expect(mcpCalls).toEqual([
      {
        toolName: 'aitp_v5_get_curated_rag_corpus',
        args: { base: 'F:/project' },
      },
      {
        toolName: 'aitp_v5_search_curated_rag_corpus',
        args: { base: 'F:/project', query: 'source backtrace', limit: 1 },
      },
      {
        toolName: 'aitp_v5_draft_curated_rag_promotion',
        args: {
          base: 'F:/project',
          chunk_id: 'curated_rag_chunk:source_backtrace_orientation:0001',
          topic_id: 'qg',
          claim_id: 'claim-mipt',
          connector_id: 'local_pdf',
        },
      },
    ]);
    expect(corpus.retrievalPolicy.readSurfaceEffect).toBe('orientation_only');
    expect(search.requiresPromotionForClaimSupport).toBe(true);
    expect(draft?.stateEffect).toBe('read_only');
  });

  it('falls back to CLI curated RAG reads when MCP fails', async () => {
    const cliCalls: string[][] = [];
    const provider = createDynamicAitpMcpFirstCuratedRagProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(cliCalls),
      mcpTransport: {
        async callTool() {
          throw new Error('MCP unavailable');
        },
      },
    });

    const corpus = await provider.getCuratedRagCorpus();
    const search = await provider.searchCuratedRagCorpus({ query: 'source backtrace' });
    const draft = await provider.draftCuratedRagPromotion?.({
      chunkId: 'curated_rag_chunk:source_backtrace_orientation:0001',
    });

    expect(corpus.chunkCount).toBe(2);
    expect(search.resultCount).toBe(2);
    expect(cliCalls[0]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project',
      'adapter',
      'curated-rag-corpus',
    ]);
    expect(cliCalls[1]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project',
      'adapter',
      'curated-rag-search',
      'source backtrace',
    ]);
    expect(cliCalls[2]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project',
      'adapter',
      'curated-rag-promotion-draft',
      'curated_rag_chunk:source_backtrace_orientation:0001',
    ]);
    expect(draft?.requiredContextBeforeWrite).toEqual(['topic_id', 'claim_id']);
  });
});

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
      if (args.includes('record-ref-lookup')) {
        const start = args.indexOf('record-ref-lookup') + 1;
        return {
          exitCode: 0,
          stdout: JSON.stringify(
            fakeRecordRefLookup(args.slice(start), {
              foundRefs: ['source_asset:asset-reviewed'],
            }),
          ),
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
        const queryIndex = args.indexOf('curated-rag-search') + 1;
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            curated_rag_search_result: fakeCuratedRagSearchResult(String(args[queryIndex] ?? ''), 2),
          }),
          stderr: '',
        };
      }
      if (args.includes('curated-rag-promotion-draft')) {
        const chunkIndex = args.indexOf('curated-rag-promotion-draft') + 1;
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            curated_rag_promotion_draft: fakeCuratedRagPromotionDraft(
              String(args[chunkIndex] ?? ''),
              {
                topicId: argAfter(args, '--topic'),
                claimId: argAfter(args, '--claim'),
                connectorId: argAfter(args, '--connector'),
              },
            ),
          }),
          stderr: '',
        };
      }
      if (args.includes('curated-rag') && args.includes('ingest')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(fakeCuratedRagIngestResult()),
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

function workFrame(input: { readonly sourceRefs: readonly string[] }): WorkFrame {
  return {
    id: 'frame.qg',
    domain: 'theoretical-physics/general',
    topic: 'qg',
    goal: 'Trace QG/MIPT relation.',
    activeObjectIds: [],
    assumptionIds: [],
    conventionIds: [],
    sourceRefs: input.sourceRefs,
    openObligationIds: [],
    trustState: 'exploratory',
  };
}

function argAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  return value === undefined || value.trim().length === 0 ? undefined : value;
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
      capture_policy: {
        capture_mode: 'controlled_auto',
        host_trigger: 'ResearchAction.run_benchmark_adapter',
        requires_configured_bridge: true,
        requires_scoped_topic_and_claim: true,
        requires_tool_call_id: false,
        capture_granularity: 'one_tool_run_per_adapter_run',
        missing_scope_behavior: 'skip_with_reason',
        bulk_auto_capture: false,
        records_validation_result: false,
        claim_trust_mutation: 'none',
        summary_inputs_trusted: false,
        can_update_claim_trust: false,
      },
      payload_template: {
        recipe_id: 'benchmark_adapter:<adapter_id>:<case_id>',
        tool_family: 'benchmark_adapter',
        tool_name: '<adapter_id>',
        evidence_status: 'unreviewed',
      },
      result_semantics: {
        record_kind: 'tool_run',
        evidence_ref_prefix: 'aitp:tool_run',
        records_validation_result: false,
        claim_trust_mutation: 'none',
        can_update_claim_trust: false,
        summary_inputs_trusted: false,
      },
      strict_boundary:
        'benchmark adapter outcome is tool-run provenance only; validation remains explicit',
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
      capture_policy: {
        capture_mode: 'explicit_request',
        host_trigger: 'ResearchAction.capture_primitive_tool_run',
        requires_configured_bridge: true,
        requires_scoped_topic_and_claim: true,
        requires_tool_call_id: true,
        capture_granularity: 'one_tool_run_per_explicit_tool_call_id',
        missing_scope_behavior: 'skip_with_reason',
        bulk_auto_capture: false,
        records_validation_result: false,
        claim_trust_mutation: 'none',
        summary_inputs_trusted: false,
        can_update_claim_trust: false,
      },
      payload_template: {
        recipe_id: 'primitive_tool:<tool_name>:<tool_call_id>',
        tool_family: 'primitive_tool',
        tool_name: '<tool_name>',
        evidence_status: 'unreviewed',
      },
      result_semantics: {
        record_kind: 'tool_run',
        evidence_ref_prefix: 'aitp:tool_run',
        records_validation_result: false,
        claim_trust_mutation: 'none',
        can_update_claim_trust: false,
        summary_inputs_trusted: false,
      },
      strict_boundary:
        'primitive tool lifecycle output is tool-run provenance only; trust remains explicit',
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
      unsupported_count: 0,
      malformed_count: 0,
      refs: items,
      supported_ref_kinds: ['reference_location', 'source_asset'],
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
  return {
    ref,
    ref_kind: refKind,
    record_id: recordId,
    id_field: refKind === 'source_asset' ? 'asset_id' : 'location_id',
    surface: refKind === 'source_asset' ? 'source_asset_record' : 'reference_location_record',
    record_role: 'orientation_only_record',
    store_scope: `registry/${refKind}s`,
    status: found ? 'found' : 'not_found',
    record_confirmed: found,
    topic_id: found ? 'qg' : '',
    claim_id: found ? 'claim-mipt' : '',
    record_kind: found ? refKind : '',
    orientation_only_record: found,
    can_update_record_claim_trust: false,
    read_surface_effect: 'record_existence_check_only',
    records_validation_result: false,
    source_support_result: false,
    claim_trust_mutation: 'none',
    can_update_claim_trust: false,
    diagnostic: found ? 'record exists in typed store' : '',
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

function fakeCuratedRagIngestResult(): any {
  return {
    ok: true,
    kind: 'curated_rag_ingest_result',
    catalog_version: AITP_CURATED_RAG_CATALOG_VERSION,
    state_effect: 'curated_rag_manifest_write',
    truth_source: 'curated_rag_ingestion',
    corpus_id: 'aitp.curated.dmft.v1',
    manifest_path: 'F:/project/.aitp/curated_rag/corpus.json',
    index_path: 'F:/project/.aitp/curated_rag/indexes/lexical_index.json',
    manifest_hash: 'sha256:curated-dmft',
    index_status: 'fresh',
    document_count: 1,
    chunk_count: 2,
    document_ids: ['curated_rag_doc:dmft'],
    chunk_ids: ['curated_rag_chunk:dmft:0001', 'curated_rag_chunk:dmft:0002'],
    source_paths: ['F:/project/notes/dmft.md'],
    rebuild_index: true,
    retrieval_role: 'heuristic_context',
    orientation_only: true,
    summary_inputs_trusted: false,
    can_update_claim_trust: false,
    records_validation_result: false,
    claim_trust_mutation: 'none',
    requires_promotion_for_claim_support: true,
    forbidden_uses: [
      'evidence_support',
      'validation_result',
      'claim_trust_update',
      'trust_apply',
      'final_gate_satisfaction',
    ],
    promotion_required_before_claim_support: true,
    promotion_path: [
      'source_asset',
      'reference_location',
      'evidence',
      'validation',
      'trust_preflight',
    ],
  };
}
