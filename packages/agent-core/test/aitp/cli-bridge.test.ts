import { describe, expect, it } from 'vitest';

import {
  AITP_CURATED_RAG_CATALOG_VERSION,
  AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
  AitpCliBridgeError,
  AitpCuratedRagParseError,
  AitpRuntimePayloadProfilesParseError,
  aitpRuntimePayloadProfileById,
  buildAitpArtifactAttachArgs,
  buildAitpArtifactAttachAutoArgs,
  buildAitpCodeStateAutoArgs,
  buildAitpCuratedRagCorpusArgs,
  buildAitpCuratedRagIngestArgs,
  buildAitpCuratedRagPromotionDraftArgs,
  buildAitpCuratedRagSearchArgs,
  buildAitpEvidenceRecordArgs,
  buildAitpExploratoryRecordArgs,
  buildAitpHumanCheckpointRequestArgs,
  buildAitpProcessGraphSliceArgs,
  buildAitpProofObligationCreateArgs,
  buildAitpRecordRefLookupArgs,
  buildAitpReferenceLocationRecordArgs,
  buildAitpRuntimePayloadProfilesArgs,
  buildAitpSourceAssetAutoArgs,
  buildAitpSourceAssetRegisterArgs,
  buildAitpSourceReconstructionReviewResultRecordArgs,
  buildAitpToolRunAutoArgs,
  buildAitpToolRunRecordArgs,
  buildAitpTrustPreflightArgs,
  buildAitpValidationContractCreateArgs,
  buildAitpValidationResultRecordArgs,
  createAitpCliBridge,
  createAitpCliProcessGraphSliceProvider,
  parseAitpCuratedRagCorpus,
  parseAitpCuratedRagIngestResult,
  parseAitpCuratedRagPromotionDraft,
  parseAitpCuratedRagSearchResult,
  parseAitpRuntimePayloadProfilesCatalog,
  resolveAitpScopeFromWorkFrame,
  type AitpCommandRunner,
} from '../../src/aitp';

describe('AITP CLI bridge', () => {
  it('builds narrow graph-slice commands and compiles JSON output', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(command, args) {
        calls.push({ command, args });
        return {
          exitCode: 0,
          stdout: JSON.stringify(fakeSlicePayload()),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      command: 'aitp-v5',
      runner,
    });

    const compiled = await bridge.readProcessGraphSlice({
      sessionId: 'session-qg',
      claimId: 'claim-mipt',
      limit: 12,
      prompt: 'We need to backtrace the source dependency and brainstorm relation paths.',
    });

    expect(calls).toEqual([
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'graph',
          'slice',
          'session-qg',
          '--limit',
          '12',
          '--claim',
          'claim-mipt',
        ],
      },
    ]);
    expect(compiled.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(compiled.actionRecommendations.map((item) => item.actionId)).toEqual(
      expect.arrayContaining([
        'physics.brainstorm_relation_path',
        'trace.follow_source_dependency',
      ]),
    );
  });

  it('records exploratory records through AITP without inventing a Hakimi schema', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'exploratory_record',
            record_id: 'exploratory-qg-path',
            topic_id: 'qg',
            exploration_type: 'relation_path_brainstorm',
            orientation_only: true,
            can_update_claim_trust: false,
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.recordExploratoryRecord({
      topicId: 'qg',
      claimId: 'claim-mipt',
      sessionId: 'session-qg',
      explorationType: 'relation_path_brainstorm',
      title: 'Trace algebra to observer relation',
      focalQuestion: 'Can the algebraic split and observer role share a definition path?',
      summary: 'Keep candidate relation paths local and unresolved.',
      candidatePaths: ['von Neumann algebra -> split property -> observer factorization'],
      unresolvedPoints: ['which theorem carries the split assumption'],
      nextActions: ['open source dependency backtrace'],
      metadata: { surface: 'hakimi' },
    });

    expect(result).toMatchObject({
      kind: 'exploratory_record',
      recordId: 'exploratory-qg-path',
      orientationOnly: true,
      canUpdateClaimTrust: false,
    });
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining([
        'exploration',
        'record',
        '--type',
        'relation_path_brainstorm',
        '--candidate-path',
        'von Neumann algebra -> split property -> observer factorization',
        '--metadata-json',
        '{"surface":"hakimi"}',
      ]),
    );
  });

  it('reads runtime payload profile catalogs through the read-only adapter command', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(command, args) {
        calls.push({ command, args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            runtime_payload_profiles: fakeRuntimePayloadProfilesCatalog(),
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const catalog = await bridge.readRuntimePayloadProfiles();
    const primitive = aitpRuntimePayloadProfileById(
      catalog,
      'primitive_tool_lifecycle_to_tool_run',
    );

    expect(calls).toEqual([
      {
        command: 'aitp-v5',
        args: ['adapter', 'payload-profiles'],
      },
    ]);
    expect(buildAitpRuntimePayloadProfilesArgs()).toEqual(['adapter', 'payload-profiles']);
    expect(catalog.catalogVersion).toBe(AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION);
    expect(catalog.profileIndex).toEqual([
      'benchmark_adapter_run_to_tool_run',
      'primitive_tool_lifecycle_to_tool_run',
    ]);
    expect(catalog.summaryInputsTrusted).toBe(false);
    expect(catalog.canUpdateClaimTrust).toBe(false);
    expect(catalog.hostUsagePolicy.readSurfaceEffect).toBe('metadata_only');
    expect(catalog.hostUsagePolicy.forbiddenUses).toContain('trust_apply');
    expect(primitive?.capturePolicy.captureMode).toBe('explicit_request');
    expect(primitive?.capturePolicy.recordsValidationResult).toBe(false);
    expect(primitive?.resultSemantics.claimTrustMutation).toBe('none');
  });

  it('reads curated RAG corpus, search results, and promotion drafts as heuristic context only', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(command, args) {
        calls.push({ command, args });
        if (args.includes('curated-rag-search')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              curated_rag_search_result: fakeCuratedRagSearchResult('source backtrace', 1),
            }),
            stderr: '',
          };
        }
        if (args.includes('curated-rag-promotion-draft')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              curated_rag_promotion_draft: fakeCuratedRagPromotionDraft(
                'curated_rag_chunk:source_backtrace_orientation:0001',
                {
                  topicId: 'qg',
                  claimId: 'claim-mipt',
                  connectorId: 'local_pdf',
                },
              ),
            }),
            stderr: '',
          };
        }
        if (args.includes('record-ref-lookup')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(
              fakeRecordRefLookup(['source_asset:asset-reviewed', 'reference_location:loc-reviewed'], {
                foundRefs: ['source_asset:asset-reviewed'],
              }),
            ),
            stderr: '',
          };
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            curated_rag_corpus: fakeCuratedRagCorpus(),
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const corpus = await bridge.readCuratedRagCorpus();
    const search = await bridge.searchCuratedRagCorpus({ query: 'source backtrace', limit: 1 });
    const lookup = await bridge.lookupRecordRefs({
      refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
    });
    const draft = await bridge.draftCuratedRagPromotion({
      chunkId: 'curated_rag_chunk:source_backtrace_orientation:0001',
      topicId: 'qg',
      claimId: 'claim-mipt',
      connectorId: 'local_pdf',
    });

    expect(calls).toEqual([
      {
        command: 'aitp-v5',
        args: ['--base', 'F:/project', 'adapter', 'curated-rag-corpus'],
      },
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'adapter',
          'curated-rag-search',
          'source backtrace',
          '--limit',
          '1',
        ],
      },
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'adapter',
          'record-ref-lookup',
          'source_asset:asset-reviewed',
          'reference_location:loc-reviewed',
        ],
      },
      {
        command: 'aitp-v5',
        args: [
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
        ],
      },
    ]);
    expect(buildAitpCuratedRagCorpusArgs()).toEqual(['adapter', 'curated-rag-corpus']);
    expect(buildAitpCuratedRagCorpusArgs({ basePath: 'F:/project' })).toEqual([
      '--base',
      'F:/project',
      'adapter',
      'curated-rag-corpus',
    ]);
    expect(buildAitpCuratedRagSearchArgs({ query: 'source backtrace', limit: 1 })).toEqual([
      'adapter',
      'curated-rag-search',
      'source backtrace',
      '--limit',
      '1',
    ]);
    expect(
      buildAitpRecordRefLookupArgs({
        basePath: 'F:/project',
        refs: ['source_asset:asset-reviewed', 'reference_location:loc-reviewed'],
      }),
    ).toEqual([
      '--base',
      'F:/project',
      'adapter',
      'record-ref-lookup',
      'source_asset:asset-reviewed',
      'reference_location:loc-reviewed',
    ]);
    expect(
      buildAitpCuratedRagSearchArgs({
        basePath: 'F:/project',
        query: 'source backtrace',
        limit: 1,
      }),
    ).toEqual([
      '--base',
      'F:/project',
      'adapter',
      'curated-rag-search',
      'source backtrace',
      '--limit',
      '1',
    ]);
    expect(
      buildAitpCuratedRagPromotionDraftArgs({
        basePath: 'F:/project',
        chunkId: 'curated_rag_chunk:source_backtrace_orientation:0001',
        topicId: 'qg',
        claimId: 'claim-mipt',
        connectorId: 'local_pdf',
        promotionIntent: 'claim_support_review',
      }),
    ).toEqual([
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
      '--intent',
      'claim_support_review',
    ]);
    expect(corpus.catalogVersion).toBe(AITP_CURATED_RAG_CATALOG_VERSION);
    expect(corpus.retrievalPolicy.resultRole).toBe('heuristic_context');
    expect(corpus.retrievalPolicy.readSurfaceEffect).toBe('orientation_only');
    expect(corpus.retrievalPolicy.forbiddenUses).toContain('final_gate_satisfaction');
    expect(corpus.retrievalPolicy.requiresPromotionForClaimSupport).toBe(true);
    expect(search.resultRole).toBe('heuristic_context');
    expect(search.claimTrustMutation).toBe('none');
    expect(search.requiresPromotionForClaimSupport).toBe(true);
    expect(search.results[0]?.retrievalRole).toBe('heuristic_context');
    expect(lookup.kind).toBe('record_ref_lookup');
    expect(lookup.lookupScope).toBe('typed_record_existence_only');
    expect(lookup.readSurfaceEffect).toBe('record_existence_check_only');
    expect(lookup.claimTrustMutation).toBe('none');
    expect(lookup.refs[0]?.recordConfirmed).toBe(true);
    expect(draft.kind).toBe('curated_rag_promotion_draft');
    expect(draft.stateEffect).toBe('read_only');
    expect(draft.draftCreatesRecords).toBe(false);
    expect(draft.draftOperations.map((operation) => operation.stage)).toEqual([
      'source_asset',
      'reference_location',
      'evidence',
      'validation',
      'trust_preflight',
    ]);
    expect(draft.draftOperations.every((operation) => operation.createsRecordNow === false)).toBe(true);
    expect(draft.promotionBoundary.draftCanUpdateClaimTrust).toBe(false);
  });

  it('rejects curated RAG payloads that would become evidence or trust authority', () => {
    const corpus = fakeCuratedRagCorpus();

    expect(() =>
      parseAitpCuratedRagCorpus({
        ...corpus,
        retrieval_policy: {
          ...corpus.retrieval_policy,
          forbidden_uses: corpus.retrieval_policy.forbidden_uses.filter(
            (use: string) => use !== 'final_gate_satisfaction',
          ),
        },
      }),
    ).toThrow(AitpCuratedRagParseError);
    expect(() =>
      parseAitpCuratedRagSearchResult({
        ...fakeCuratedRagSearchResult('source backtrace', 1),
        can_update_claim_trust: true,
      }),
    ).toThrow(AitpCuratedRagParseError);
    expect(() =>
      parseAitpCuratedRagPromotionDraft({
        ...fakeCuratedRagPromotionDraft('curated_rag_chunk:source_backtrace_orientation:0001'),
        draft_creates_records: true,
      }),
    ).toThrow(AitpCuratedRagParseError);
    const draft = fakeCuratedRagPromotionDraft('curated_rag_chunk:source_backtrace_orientation:0001');
    expect(() =>
      parseAitpCuratedRagPromotionDraft({
        ...draft,
        draft_operations: [
          {
            ...draft.draft_operations[0],
            creates_record_now: true,
          },
          ...draft.draft_operations.slice(1),
        ],
      }),
    ).toThrow(AitpCuratedRagParseError);
  });

  it('ingests curated RAG files through an AITP-owned manifest write bridge', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(command, args) {
        calls.push({ command, args });
        return {
          exitCode: 0,
          stdout: JSON.stringify(fakeCuratedRagIngestResult()),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.ingestCuratedRagCorpus({
      paths: ['notes/dmft.md'],
      corpusId: 'aitp.curated.dmft.v1',
      tags: ['dmft'],
      domainHints: ['theoretical-physics/condensed-matter'],
      topicHints: ['gw-dmft'],
      language: 'en',
      priority: 'high',
      chunkTokenLimit: 180,
      titlePrefix: 'Curated',
      assetType: 'note',
      rebuildIndex: false,
    });

    expect(calls).toEqual([
      {
        command: 'aitp-v5',
        args: [
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
          '--domain-hint',
          'theoretical-physics/condensed-matter',
          '--topic-hint',
          'gw-dmft',
          '--language',
          'en',
          '--priority',
          'high',
          '--chunk-token-limit',
          '180',
          '--title-prefix',
          'Curated',
          '--asset-type',
          'note',
          '--no-rebuild-index',
        ],
      },
    ]);
    expect(
      buildAitpCuratedRagIngestArgs({
        basePath: 'F:/project',
        paths: ['notes/dmft.md'],
        tags: ['dmft'],
        chunkTokenLimit: 180,
      }),
    ).toEqual([
      '--base',
      'F:/project',
      'curated-rag',
      'ingest',
      '--path',
      'notes/dmft.md',
      '--tag',
      'dmft',
      '--chunk-token-limit',
      '180',
    ]);
    expect(result.kind).toBe('curated_rag_ingest_result');
    expect(result.stateEffect).toBe('curated_rag_manifest_write');
    expect(result.retrievalRole).toBe('heuristic_context');
    expect(result.recordsValidationResult).toBe(false);
    expect(result.claimTrustMutation).toBe('none');
    expect(result.requiresPromotionForClaimSupport).toBe(true);
    expect(result.forbiddenUses).toContain('final_gate_satisfaction');
    expect(result.promotionPath).toEqual([
      'source_asset',
      'reference_location',
      'evidence',
      'validation',
      'trust_preflight',
    ]);
  });

  it('rejects curated RAG ingestion payloads that would become claim support', () => {
    const result = fakeCuratedRagIngestResult();

    expect(() =>
      parseAitpCuratedRagIngestResult({
        ...result,
        claim_trust_mutation: 'trust_apply',
      }),
    ).toThrow(AitpCuratedRagParseError);
    expect(() =>
      parseAitpCuratedRagIngestResult({
        ...result,
        promotion_path: ['source_asset', 'evidence'],
      }),
    ).toThrow(AitpCuratedRagParseError);
  });

  it('accepts file-backed curated RAG index metadata without relaxing trust boundaries', () => {
    const fileBackedCorpus = {
      ...fakeCuratedRagCorpus(),
      corpus_id: 'aitp.curated.user_background.v1',
      index_policy: {
        ...fakeCuratedRagCorpus().index_policy,
        active_index_mode: 'lexical_file_backed',
        supported_index_modes: ['lexical_file_backed'],
        index_source: 'file_backed_corpus_manifest',
        index_path: 'F:/project/.aitp/curated_rag/indexes/lexical_index.json',
        manifest_hash: 'sha256:file-backed',
        index_status: 'stale',
        stale_index_diagnostics: [
          {
            code: 'curated_rag_index_stale',
            message: 'lexical index manifest_hash does not match',
          },
        ],
      },
    };
    const fileBackedSearch = {
      ...fakeCuratedRagSearchResult('source backtrace', 1),
      index_mode: 'lexical_file_backed',
      index_status: 'stale',
      stale_index_diagnostics: [
        {
          code: 'curated_rag_index_stale',
          message: 'lexical index manifest_hash does not match',
        },
      ],
    };

    const parsedCorpus = parseAitpCuratedRagCorpus(fileBackedCorpus);
    const parsedSearch = parseAitpCuratedRagSearchResult(fileBackedSearch);

    expect(parsedCorpus.indexPolicy.activeIndexMode).toBe('lexical_file_backed');
    expect(parsedCorpus.indexPolicy.indexStatus).toBe('stale');
    expect(parsedCorpus.indexPolicy.staleIndexDiagnostics[0]?.['code']).toBe(
      'curated_rag_index_stale',
    );
    expect(parsedCorpus.retrievalPolicy.forbiddenUses).toContain('final_gate_satisfaction');
    expect(parsedSearch.indexMode).toBe('lexical_file_backed');
    expect(parsedSearch.indexStatus).toBe('stale');
    expect(parsedSearch.canUpdateClaimTrust).toBe(false);
  });

  it('rejects runtime payload catalogs that would turn provenance into trust', () => {
    const catalog = fakeRuntimePayloadProfilesCatalog();
    const primitive = catalog.profiles[1]!;
    const tampered = {
      ...catalog,
      profiles: [
        catalog.profiles[0],
        {
          ...primitive,
          result_semantics: {
            ...primitive.result_semantics,
            can_update_claim_trust: true,
          },
        },
      ],
    };

    expect(() => parseAitpRuntimePayloadProfilesCatalog(tampered)).toThrow(
      AitpRuntimePayloadProfilesParseError,
    );
  });

  it('rejects runtime payload host usage policies that expand metadata-only use', () => {
    const catalog = fakeRuntimePayloadProfilesCatalog();

    expect(() =>
      parseAitpRuntimePayloadProfilesCatalog({
        ...catalog,
        host_usage_policy: {
          ...catalog.host_usage_policy,
          allowed_uses: [...catalog.host_usage_policy.allowed_uses, 'validation_diagnostics'],
        },
      }),
    ).toThrow(AitpRuntimePayloadProfilesParseError);
    expect(() =>
      parseAitpRuntimePayloadProfilesCatalog({
        ...catalog,
        host_usage_policy: {
          ...catalog.host_usage_policy,
          forbidden_uses: catalog.host_usage_policy.forbidden_uses.filter(
            (use: string) => use !== 'bulk_auto_capture',
          ),
        },
      }),
    ).toThrow(AitpRuntimePayloadProfilesParseError);
  });

  it('rejects unsupported exploratory record types before running AITP', () => {
    expect(() =>
      buildAitpExploratoryRecordArgs({
        basePath: 'F:/project',
        topicId: 'qg',
        // @ts-expect-error verifies runtime validation for external input.
        explorationType: 'private_hakimi_schema',
        title: 'Bad schema',
        focalQuestion: 'Can Hakimi invent a record type?',
        summary: 'No.',
      }),
    ).toThrow(AitpCliBridgeError);
  });

  it('registers source assets through AITP without creating a Hakimi asset store', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'source_asset',
            asset_id: 'source-asset-qg-paper',
            topic_id: 'qg',
            asset_type: 'paper',
            uri: 'arxiv:2601.00001',
            title: 'Algebraic observer source',
            orientation_only: true,
            can_update_claim_trust: false,
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.registerSourceAsset({
      topicId: 'qg',
      claimId: 'claim-mipt',
      assetType: 'paper',
      uri: 'arxiv:2601.00001',
      title: 'Algebraic observer source',
      sourceKind: 'literature',
      summary: 'Paper identity for source backtrace.',
      versionAnchor: { arxiv_version: 'v1' },
      sourceRefs: ['paper:observer-algebra'],
      linkedRecords: { claim_id: 'claim-mipt' },
    });

    expect(result).toMatchObject({
      kind: 'source_asset',
      assetId: 'source-asset-qg-paper',
      assetType: 'paper',
      orientationOnly: true,
      canUpdateClaimTrust: false,
    });
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining([
        'asset',
        'register',
        '--type',
        'paper',
        '--uri',
        'arxiv:2601.00001',
        '--version-anchor-json',
        '{"arxiv_version":"v1"}',
        '--linked-records-json',
        '{"claim_id":"claim-mipt"}',
      ]),
    );
  });

  it('auto-captures local source assets through AITP without hand-filled hashes', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'source_asset',
            asset_id: 'source-asset-qg-notes',
            topic_id: 'qg',
            asset_type: 'note',
            uri: 'file://F:/sources/operator-algebra-notes.md',
            title: 'Operator algebra notes',
            orientation_only: true,
            can_update_claim_trust: false,
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.captureSourceAssetAuto({
      path: 'F:/sources/operator-algebra-notes.md',
      topicId: 'qg',
      claimId: 'claim-mipt',
      assetType: 'note',
      title: 'Operator algebra notes',
      sourceKind: 'local_file_auto',
      summary: 'Local source identity for source backtrace.',
      sourceRefs: ['local:operator-notes'],
      linkedRecords: { claim_id: 'claim-mipt' },
    });

    expect(result).toMatchObject({
      kind: 'source_asset',
      assetId: 'source-asset-qg-notes',
      assetType: 'note',
      orientationOnly: true,
      canUpdateClaimTrust: false,
    });
    expect(calls[0]?.args).toEqual(
      buildAitpSourceAssetAutoArgs({
        basePath: 'F:/project',
        path: 'F:/sources/operator-algebra-notes.md',
        topicId: 'qg',
        claimId: 'claim-mipt',
        assetType: 'note',
        title: 'Operator algebra notes',
        sourceKind: 'local_file_auto',
        summary: 'Local source identity for source backtrace.',
        sourceRefs: ['local:operator-notes'],
        linkedRecords: { claim_id: 'claim-mipt' },
      }),
    );
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining([
        'asset',
        'capture-auto',
        '--path',
        'F:/sources/operator-algebra-notes.md',
        '--linked-records-json',
        '{"claim_id":"claim-mipt"}',
      ]),
    );
  });

  it('auto-captures local tool-run transcripts through AITP without hand-filled hashes', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'tool_run',
            run_id: 'tool-run-librpa-si-gw',
            recipe_id: 'recipe-librpa-si-gw',
            tool_family: 'code',
            tool_name: 'pytest',
            topic_id: 'gw',
            claim_id: 'claim-gw',
            evidence_status: 'unreviewed',
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.captureToolRunAuto({
      path: 'F:/runs/si-gw/transcript.txt',
      recipeId: 'recipe-librpa-si-gw',
      toolFamily: 'code',
      toolName: 'pytest',
      topicId: 'gw',
      claimId: 'claim-gw',
      inputs: { test: 'tests/test_si_gw.py' },
      summary: 'Local benchmark transcript.',
      maxPreviewChars: 800,
    });

    expect(result).toMatchObject({
      kind: 'tool_run',
      runId: 'tool-run-librpa-si-gw',
      recipeId: 'recipe-librpa-si-gw',
      toolFamily: 'code',
      toolName: 'pytest',
      evidenceStatus: 'unreviewed',
    });
    expect(calls[0]?.args).toEqual(
      buildAitpToolRunAutoArgs({
        basePath: 'F:/project',
        path: 'F:/runs/si-gw/transcript.txt',
        recipeId: 'recipe-librpa-si-gw',
        toolFamily: 'code',
        toolName: 'pytest',
        topicId: 'gw',
        claimId: 'claim-gw',
        inputs: { test: 'tests/test_si_gw.py' },
        summary: 'Local benchmark transcript.',
        maxPreviewChars: 800,
      }),
    );
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining([
        'tool',
        'run',
        'capture-auto',
        '--path',
        'F:/runs/si-gw/transcript.txt',
        '--inputs-json',
        '{"test":"tests/test_si_gw.py"}',
        '--max-preview-chars',
        '800',
      ]),
    );
  });

  it('captures git code state through the AITP auto code-state command', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'code_state',
            code_state_id: 'code-state-librpa-abc123',
            repo_id: 'librpa',
            upstream_remote: 'origin',
            upstream_branch: 'main',
            upstream_commit: 'abc123',
            local_branch: 'feature/provenance',
            worktree_path: 'F:/repo/librpa',
            dirty: true,
            patch_id: 'artifact-git_patch-abc123',
            diff_hash: 'd'.repeat(64),
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.captureCodeStateAuto({
      worktreePath: 'F:/repo/librpa',
      repoId: 'librpa',
      topicId: 'gw',
      claimId: 'claim-gw',
      sessionId: 'session-gw',
      buildConfig: { cmake: 'release' },
      runtimeEnvironment: { os: 'windows' },
      linkedRecords: { claim_id: 'claim-gw' },
      knownDivergence: 'local validation patch',
      writePatchArtifact: true,
    });

    expect(result).toMatchObject({
      kind: 'code_state',
      codeStateId: 'code-state-librpa-abc123',
      repoId: 'librpa',
      dirty: true,
      patchId: 'artifact-git_patch-abc123',
    });
    expect(calls[0]?.args).toEqual([
      '--base',
      'F:/project',
      'code',
      'state',
      'auto',
      '--worktree-path',
      'F:/repo/librpa',
      '--repo-id',
      'librpa',
      '--topic',
      'gw',
      '--claim',
      'claim-gw',
      '--session',
      'session-gw',
      '--build-config-json',
      '{"cmake":"release"}',
      '--runtime-environment-json',
      '{"os":"windows"}',
      '--linked-records-json',
      '{"claim_id":"claim-gw"}',
      '--known-divergence',
      'local validation patch',
      '--write-patch-artifact',
    ]);
    expect(buildAitpCodeStateAutoArgs({
      basePath: 'F:/project',
      worktreePath: 'F:/repo/librpa',
      repoId: 'librpa',
    })).toEqual([
      '--base',
      'F:/project',
      'code',
      'state',
      'auto',
      '--worktree-path',
      'F:/repo/librpa',
      '--repo-id',
      'librpa',
    ]);
  });

  it('attaches artifacts through the AITP research-state artifact command', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'artifact',
            artifact_id: 'artifact-benchmark-log',
            topic_id: 'qg',
            claim_id: 'claim-mipt',
            artifact_type: 'benchmark_log',
            uri: 'runs/qg/benchmark.log',
            summary: 'Benchmark log for the source reconstruction check.',
            size_bytes: 2048,
            metadata: {
              can_update_claim_trust: false,
              sha256: 'a'.repeat(64),
            },
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.attachArtifact({
      topicId: 'qg',
      claimId: 'claim-mipt',
      artifactType: 'benchmark_log',
      uri: 'runs/qg/benchmark.log',
      summary: 'Benchmark log for the source reconstruction check.',
      sizeBytes: 2048,
      metadata: { role: 'benchmark_output' },
    });

    expect(result).toMatchObject({
      kind: 'artifact',
      artifactId: 'artifact-benchmark-log',
      artifactType: 'benchmark_log',
      sizeBytes: 2048,
      canUpdateClaimTrust: false,
    });
    expect(calls[0]?.args).toEqual([
      '--base',
      'F:/project',
      'research-state',
      'attach-artifact',
      '--topic',
      'qg',
      '--claim',
      'claim-mipt',
      '--type',
      'benchmark_log',
      '--uri',
      'runs/qg/benchmark.log',
      '--summary',
      'Benchmark log for the source reconstruction check.',
      '--size-bytes',
      '2048',
      '--metadata-json',
      '{"role":"benchmark_output"}',
    ]);
    expect(buildAitpArtifactAttachArgs({
      basePath: 'F:/project',
      topicId: 'qg',
      claimId: 'claim-mipt',
      artifactType: 'result_json',
      uri: 'results/check.json',
      summary: 'Finite-size result file.',
    })).toEqual([
      '--base',
      'F:/project',
      'research-state',
      'attach-artifact',
      '--topic',
      'qg',
      '--claim',
      'claim-mipt',
      '--type',
      'result_json',
      '--uri',
      'results/check.json',
      '--summary',
      'Finite-size result file.',
    ]);
  });

  it('auto-attaches local artifacts through AITP without hand-filled hashes', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'artifact',
            artifact_id: 'artifact-benchmark-log-auto',
            topic_id: 'qg',
            claim_id: 'claim-mipt',
            artifact_type: 'benchmark_log',
            uri: 'file:///F:/runs/qg/benchmark.log',
            summary: 'Benchmark log for the source reconstruction check.',
            size_bytes: 2048,
            metadata: {
              can_update_claim_trust: false,
              capture_tool: 'aitp_v5_attach_artifact_auto',
              sha256: 'a'.repeat(64),
            },
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.attachArtifactAuto({
      path: 'F:/runs/qg/benchmark.log',
      topicId: 'qg',
      claimId: 'claim-mipt',
      artifactType: 'benchmark_log',
      summary: 'Benchmark log for the source reconstruction check.',
      metadata: { role: 'benchmark_output' },
    });

    expect(result).toMatchObject({
      kind: 'artifact',
      artifactId: 'artifact-benchmark-log-auto',
      artifactType: 'benchmark_log',
      uri: 'file:///F:/runs/qg/benchmark.log',
      sizeBytes: 2048,
      canUpdateClaimTrust: false,
    });
    expect(calls[0]?.args).toEqual(
      buildAitpArtifactAttachAutoArgs({
        basePath: 'F:/project',
        path: 'F:/runs/qg/benchmark.log',
        topicId: 'qg',
        claimId: 'claim-mipt',
        artifactType: 'benchmark_log',
        summary: 'Benchmark log for the source reconstruction check.',
        metadata: { role: 'benchmark_output' },
      }),
    );
    expect(calls[0]?.args).toEqual([
      '--base',
      'F:/project',
      'research-state',
      'attach-artifact-auto',
      '--path',
      'F:/runs/qg/benchmark.log',
      '--topic',
      'qg',
      '--claim',
      'claim-mipt',
      '--type',
      'benchmark_log',
      '--summary',
      'Benchmark log for the source reconstruction check.',
      '--metadata-json',
      '{"role":"benchmark_output"}',
    ]);
  });

  it('records evidence, tool runs, and reference locations through canonical AITP records', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        if (args.includes('evidence')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              kind: 'evidence',
              evidence_id: 'evidence-source-chain',
              topic_id: 'qg',
              claim_id: 'claim-mipt',
              evidence_type: 'source_reconstruction',
              status: 'supports',
              summary: 'Definition source chain reconstructed.',
              supports_outputs: ['source_chain'],
              source_refs: ['reference_location:split-paper'],
              tool_run_ids: ['tool-run-source-audit'],
              validation_result_ids: [],
              artifact_ids: [],
            }),
            stderr: '',
          };
        }
        if (args.includes('tool')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              kind: 'tool_run',
              run_id: 'tool-run-source-audit',
              recipe_id: 'recipe-source-audit',
              tool_family: 'literature',
              tool_name: 'source-audit',
              topic_id: 'qg',
              claim_id: 'claim-mipt',
              evidence_status: 'supports',
              inputs: { source: 'split paper' },
              outputs: { closed: true },
              environment: {},
              code_state_ids: [],
              artifact_ids: [],
              source_refs: ['reference_location:split-paper'],
            }),
            stderr: '',
          };
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'reference_location',
            location_id: 'reference-location-split-paper',
            topic_id: 'qg',
            claim_id: 'claim-mipt',
            connector_id: 'local_pdf',
            location_type: 'paper_pdf',
            uri: 'file:///papers/split.pdf',
            label: 'Split property paper',
            source_ref: 'paper:split',
            external_id: '',
            status: 'located',
            summary: 'Definition source pointer.',
            metadata: {},
            linked_records: {},
            orientation_only: true,
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const evidence = await bridge.recordEvidence({
      topicId: 'qg',
      claimId: 'claim-mipt',
      evidenceType: 'source_reconstruction',
      status: 'supports',
      summary: 'Definition source chain reconstructed.',
      supportsOutputs: ['source_chain'],
      sourceRefs: ['reference_location:split-paper'],
      toolRunIds: ['tool-run-source-audit'],
    });
    const toolRun = await bridge.recordToolRun({
      recipeId: 'recipe-source-audit',
      toolFamily: 'literature',
      toolName: 'source-audit',
      topicId: 'qg',
      claimId: 'claim-mipt',
      inputs: { source: 'split paper' },
      outputs: { closed: true },
      evidenceStatus: 'supports',
      sourceRefs: ['reference_location:split-paper'],
    });
    const reference = await bridge.recordReferenceLocation({
      topicId: 'qg',
      claimId: 'claim-mipt',
      connectorId: 'local_pdf',
      locationType: 'paper_pdf',
      uri: 'file:///papers/split.pdf',
      label: 'Split property paper',
      sourceRef: 'paper:split',
      summary: 'Definition source pointer.',
    });

    expect(evidence).toMatchObject({
      kind: 'evidence',
      evidenceId: 'evidence-source-chain',
      evidenceType: 'source_reconstruction',
      status: 'supports',
    });
    expect(toolRun).toMatchObject({
      kind: 'tool_run',
      runId: 'tool-run-source-audit',
      recipeId: 'recipe-source-audit',
      evidenceStatus: 'supports',
    });
    expect(reference).toMatchObject({
      kind: 'reference_location',
      locationId: 'reference-location-split-paper',
      orientationOnly: true,
    });
    expect(calls.map((call) => call.args)).toEqual([
      [
        '--base',
        'F:/project',
        'evidence',
        'record',
        '--topic',
        'qg',
        '--claim',
        'claim-mipt',
        '--type',
        'source_reconstruction',
        '--status',
        'supports',
        '--summary',
        'Definition source chain reconstructed.',
        '--supports-output',
        'source_chain',
        '--source-ref',
        'reference_location:split-paper',
        '--tool-run-id',
        'tool-run-source-audit',
      ],
      [
        '--base',
        'F:/project',
        'tool',
        'run',
        'record',
        '--recipe',
        'recipe-source-audit',
        '--family',
        'literature',
        '--name',
        'source-audit',
        '--topic',
        'qg',
        '--claim',
        'claim-mipt',
        '--inputs-json',
        '{"source":"split paper"}',
        '--outputs-json',
        '{"closed":true}',
        '--evidence-status',
        'supports',
        '--source-ref',
        'reference_location:split-paper',
      ],
      [
        '--base',
        'F:/project',
        'reference',
        'location',
        'record',
        '--topic',
        'qg',
        '--connector',
        'local_pdf',
        '--type',
        'paper_pdf',
        '--uri',
        'file:///papers/split.pdf',
        '--label',
        'Split property paper',
        '--claim',
        'claim-mipt',
        '--source-ref',
        'paper:split',
        '--summary',
        'Definition source pointer.',
      ],
    ]);
  });

  it('requests AITP human checkpoints through a constrained command', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'human_checkpoint',
            checkpoint_id: 'checkpoint-trust-qg',
            topic_id: 'qg',
            claim_id: 'claim-mipt',
            status: 'requested',
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.requestHumanCheckpoint({
      topicId: 'qg',
      claimId: 'claim-mipt',
      reason: 'Trust boundary before updating claim status.',
      requestedBy: 'hakimi',
      options: ['approve validation path', 'keep provisional'],
    });

    expect(result).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-trust-qg',
      status: 'requested',
    });
    expect(calls[0]?.args).toEqual([
      '--base',
      'F:/project',
      'checkpoint',
      'request',
      '--topic',
      'qg',
      '--claim',
      'claim-mipt',
      '--reason',
      'Trust boundary before updating claim status.',
      '--requested-by',
      'hakimi',
      '--option',
      'approve validation path',
      '--option',
      'keep provisional',
    ]);
  });

  it('runs AITP trust preflight through a constrained non-mutating command', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'trust_update_preflight',
            request_id: 'trust-request-qg',
            action: 'change_claim_confidence',
            session_id: 'session-qg',
            topic_id: 'qg',
            claim_id: 'claim-mipt',
            requested_state: 'supported',
            allowed: false,
            mutation_allowed_after_preflight: false,
            required_actions: ['record typed evidence'],
            evidence_refs: ['evidence-source-chain'],
            code_state_ids: ['code-state-qg'],
            preflight_token: 'trust-preflight-token-qg',
            can_update_kernel_state: false,
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });
    expect(
      buildAitpTrustPreflightArgs({
        basePath: 'F:/project',
        action: 'change_claim_confidence',
        sessionId: 'session-qg',
        topicId: 'qg',
        claimId: 'claim-mipt',
      }),
    ).toEqual([
      '--base',
      'F:/project',
      'trust',
      'preflight',
      'change_claim_confidence',
      '--session',
      'session-qg',
      '--topic',
      'qg',
      '--claim',
      'claim-mipt',
    ]);

    const result = await bridge.preflightTrustUpdate({
      action: 'change_claim_confidence',
      sessionId: 'session-qg',
      topicId: 'qg',
      claimId: 'claim-mipt',
      requestedState: 'supported',
      sourceKind: 'proof_obligation_record',
      sourceRef: 'proof_obligation:obl-source',
      evidenceRefs: ['evidence-source-chain'],
      codeStateIds: ['code-state-qg'],
      rationale: 'Trust-sensitive final answer would treat source support as checked.',
      requestId: 'trust-request-qg',
    });

    expect(result).toMatchObject({
      kind: 'trust_update_preflight',
      requestId: 'trust-request-qg',
      action: 'change_claim_confidence',
      allowed: false,
      mutationAllowedAfterPreflight: false,
      requiredActions: ['record typed evidence'],
      preflightToken: 'trust-preflight-token-qg',
      canUpdateKernelState: false,
    });
    expect(calls[0]?.args).toEqual([
      '--base',
      'F:/project',
      'trust',
      'preflight',
      'change_claim_confidence',
      '--session',
      'session-qg',
      '--topic',
      'qg',
      '--claim',
      'claim-mipt',
      '--requested-state',
      'supported',
      '--source-kind',
      'proof_obligation_record',
      '--source-ref',
      'proof_obligation:obl-source',
      '--evidence-ref',
      'evidence-source-chain',
      '--code-state-id',
      'code-state-qg',
      '--rationale',
      'Trust-sensitive final answer would treat source support as checked.',
      '--request-id',
      'trust-request-qg',
    ]);
  });

  it('creates proof obligations through AITP research-state records', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'proof_obligation',
            obligation_id: 'proof-obligation-sector-match',
            topic_id: 'fqhe',
            claim_id: 'claim-edge-counting',
            status: 'open',
            can_update_claim_trust: false,
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.createProofObligation({
      topicId: 'fqhe',
      claimId: 'claim-edge-counting',
      statement: 'Derive that finite-size sector matching is not aliasing.',
      obligationType: 'proof_gap',
      status: 'open',
      maturityLevel: 'theorem-candidate',
      nextAction: 'derive sector-matching constraints',
      requiredEvidence: ['analytic derivation'],
      proofStrategy: ['trace momentum-sector decomposition'],
      failureModes: ['wrong momentum sector'],
      sourceRefs: ['source_asset:edge-counting-paper'],
    });

    expect(result).toMatchObject({
      kind: 'proof_obligation',
      obligationId: 'proof-obligation-sector-match',
      status: 'open',
      canUpdateClaimTrust: false,
    });
    expect(calls[0]?.args).toEqual([
      '--base',
      'F:/project',
      'research-state',
      'create-proof-obligation',
      '--topic',
      'fqhe',
      '--claim',
      'claim-edge-counting',
      '--statement',
      'Derive that finite-size sector matching is not aliasing.',
      '--type',
      'proof_gap',
      '--status',
      'open',
      '--maturity-level',
      'theorem-candidate',
      '--next-action',
      'derive sector-matching constraints',
      '--required-evidence',
      'analytic derivation',
      '--proof-strategy',
      'trace momentum-sector decomposition',
      '--failure-mode',
      'wrong momentum sector',
      '--source-ref',
      'source_asset:edge-counting-paper',
    ]);
  });

  it('creates validation contracts through AITP validation records', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'validation_contract',
            contract_id: 'validation-contract-sector-match',
            topic_id: 'fqhe',
            claim_id: 'claim-edge-counting',
            status: 'open',
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.createValidationContract({
      topicId: 'fqhe',
      claimId: 'claim-edge-counting',
      requiredChecks: ['dimension check', 'known limit check'],
      failureModes: ['wrong momentum sector'],
      requiredEvidenceOutputs: ['derivation transcript'],
      toolRecipeIds: ['recipe-sector-validation'],
      executorIds: ['manual-derivation-review'],
      validatorRole: 'adversarial_reviewer',
    });

    expect(result).toMatchObject({
      kind: 'validation_contract',
      contractId: 'validation-contract-sector-match',
      status: 'open',
    });
    expect(calls[0]?.args).toEqual([
      '--base',
      'F:/project',
      'validation',
      'contract',
      'create',
      '--topic',
      'fqhe',
      '--claim',
      'claim-edge-counting',
      '--required-check',
      'dimension check',
      '--required-check',
      'known limit check',
      '--failure-mode',
      'wrong momentum sector',
      '--required-output',
      'derivation transcript',
      '--recipe-id',
      'recipe-sector-validation',
      '--executor-id',
      'manual-derivation-review',
      '--validator-role',
      'adversarial_reviewer',
    ]);
  });

  it('records validation results through AITP validation records', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'validation_result',
            result_id: 'validation-result-sector-match',
            topic_id: 'fqhe',
            claim_id: 'claim-edge-counting',
            contract_id: 'validation-contract-sector-match',
            tool_run_id: 'tool-run-derivation-review',
            status: 'partial',
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.recordValidationResult({
      topicId: 'fqhe',
      claimId: 'claim-edge-counting',
      contractId: 'validation-contract-sector-match',
      toolRunId: 'tool-run-derivation-review',
      status: 'partial',
      checkedOutputs: ['derivation transcript'],
      coveredFailureModes: ['wrong momentum sector'],
      evidenceRefs: ['evidence-sector-derivation'],
      artifactIds: ['artifact-derivation-log'],
      summary: 'Known-limit check passed; one source support check remains open.',
    });

    expect(result).toMatchObject({
      kind: 'validation_result',
      resultId: 'validation-result-sector-match',
      contractId: 'validation-contract-sector-match',
      status: 'partial',
    });
    expect(calls[0]?.args).toEqual([
      '--base',
      'F:/project',
      'validation',
      'result',
      'record',
      '--topic',
      'fqhe',
      '--claim',
      'claim-edge-counting',
      '--contract',
      'validation-contract-sector-match',
      '--tool-run',
      'tool-run-derivation-review',
      '--status',
      'partial',
      '--summary',
      'Known-limit check passed; one source support check remains open.',
      '--checked-output',
      'derivation transcript',
      '--covered-failure-mode',
      'wrong momentum sector',
      '--evidence-ref',
      'evidence-sector-derivation',
      '--artifact-id',
      'artifact-derivation-log',
    ]);
  });

  it('records source reconstruction review results through AITP source records', async () => {
    const calls: { args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(_command, args) {
        calls.push({ args });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            kind: 'source_reconstruction_review_result',
            result_id: 'source-review-result-sector-match',
            topic_id: 'fqhe',
            claim_id: 'claim-edge-counting',
            status: 'inconclusive',
            can_update_claim_trust: false,
          }),
          stderr: '',
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      runner,
    });

    const result = await bridge.recordSourceReconstructionReviewResult({
      claimId: 'claim-edge-counting',
      status: 'inconclusive',
      reviewedComponents: ['definitions', 'source_locations'],
      basisRefs: ['source_asset:asset-edge-paper'],
      evidenceRefs: ['evidence-source-audit'],
      validationResultIds: ['validation-result-sector-match'],
      referenceLocationIds: ['reference-location-edge-paper'],
      objectIds: ['object-edge-counting'],
      relationIds: ['relation-counting-cft'],
      remainingActions: ['trace theorem dependency'],
      reviewerRole: 'adversarial_reviewer',
      summary: 'Definitions and source locations were reviewed; theorem dependency remains open.',
    });

    expect(result).toMatchObject({
      kind: 'source_reconstruction_review_result',
      resultId: 'source-review-result-sector-match',
      claimId: 'claim-edge-counting',
      status: 'inconclusive',
      canUpdateClaimTrust: false,
    });
    expect(calls[0]?.args).toEqual([
      '--base',
      'F:/project',
      'source',
      'reconstruction-review-result',
      '--claim',
      'claim-edge-counting',
      '--status',
      'inconclusive',
      '--reviewed-component',
      'definitions',
      '--reviewed-component',
      'source_locations',
      '--basis-ref',
      'source_asset:asset-edge-paper',
      '--evidence-ref',
      'evidence-source-audit',
      '--validation-result-id',
      'validation-result-sector-match',
      '--reference-location-id',
      'reference-location-edge-paper',
      '--object-id',
      'object-edge-counting',
      '--relation-id',
      'relation-counting-cft',
      '--remaining-action',
      'trace theorem dependency',
      '--reviewer-role',
      'adversarial_reviewer',
      '--summary',
      'Definitions and source locations were reviewed; theorem dependency remains open.',
    ]);
  });

  it('keeps source asset and checkpoint args validated before running AITP', () => {
    expect(() =>
      buildAitpSourceAssetRegisterArgs({
        basePath: 'F:/project',
        topicId: 'qg',
        // @ts-expect-error verifies runtime validation for external input.
        assetType: 'private_asset',
        uri: 'arxiv:2601.00001',
        title: 'Bad asset',
      }),
    ).toThrow(AitpCliBridgeError);
    expect(() =>
      buildAitpHumanCheckpointRequestArgs({
        basePath: 'F:/project',
        topicId: 'qg',
        claimId: 'claim-mipt',
        reason: 'No options.',
        requestedBy: 'hakimi',
        options: [],
      }),
    ).toThrow(AitpCliBridgeError);
    expect(() =>
      buildAitpEvidenceRecordArgs({
        basePath: 'F:/project',
        topicId: 'qg',
        claimId: 'claim-mipt',
        evidenceType: 'source_reconstruction',
        status: 'supports',
        summary: '',
      }),
    ).toThrow(AitpCliBridgeError);
    expect(() =>
      buildAitpToolRunRecordArgs({
        basePath: 'F:/project',
        recipeId: '',
        toolFamily: 'literature',
        toolName: 'source-audit',
        topicId: 'qg',
        claimId: 'claim-mipt',
      }),
    ).toThrow(AitpCliBridgeError);
    expect(() =>
      buildAitpReferenceLocationRecordArgs({
        basePath: 'F:/project',
        topicId: 'qg',
        connectorId: 'local_pdf',
        locationType: 'paper_pdf',
        uri: '',
        label: 'Split paper',
      }),
    ).toThrow(AitpCliBridgeError);
    expect(() =>
      buildAitpProofObligationCreateArgs({
        basePath: 'F:/project',
        topicId: 'fqhe',
        claimId: 'claim-edge-counting',
        statement: '',
        obligationType: 'proof_gap',
        status: 'open',
        maturityLevel: 'theorem-candidate',
        nextAction: 'derive sector-matching constraints',
      }),
    ).toThrow(AitpCliBridgeError);
    expect(() =>
      buildAitpValidationContractCreateArgs({
        basePath: 'F:/project',
        topicId: 'fqhe',
        claimId: 'claim-edge-counting',
        requiredChecks: [],
        failureModes: ['wrong momentum sector'],
        requiredEvidenceOutputs: ['derivation transcript'],
      }),
    ).toThrow(AitpCliBridgeError);
    expect(() =>
      buildAitpValidationResultRecordArgs({
        basePath: 'F:/project',
        topicId: 'fqhe',
        claimId: 'claim-edge-counting',
        contractId: 'validation-contract-sector-match',
        toolRunId: 'tool-run-derivation-review',
        status: 'partial',
        summary: '',
      }),
    ).toThrow(AitpCliBridgeError);
    expect(() =>
      buildAitpSourceReconstructionReviewResultRecordArgs({
        basePath: 'F:/project',
        claimId: 'claim-mipt',
        status: 'inconclusive',
        reviewedComponents: ['definitions'],
        summary: 'Missing basis.',
      }),
    ).toThrow(AitpCliBridgeError);
  });

  it('keeps graph slice args deterministic', () => {
    expect(
      buildAitpProcessGraphSliceArgs({
        basePath: 'F:/project',
        sessionId: 's1',
      }),
    ).toEqual(['--base', 'F:/project', 'graph', 'slice', 's1', '--limit', '80']);
  });

  it('creates a WorkFrame-scoped process graph provider without guessing scope', async () => {
    const runner: AitpCommandRunner = {
      async run() {
        return {
          exitCode: 0,
          stdout: JSON.stringify(fakeSlicePayload()),
          stderr: '',
        };
      },
    };
    const provider = createAitpCliProcessGraphSliceProvider({
      basePath: 'F:/project',
      runner,
      limit: 8,
    });

    await expect(
      provider.getProcessGraphSlice({
        workFrame: {
          id: 'frame.no-scope',
          domain: 'theoretical-physics/general',
          topic: 'qg',
          goal: 'No AITP scope yet.',
          activeObjectIds: [],
          assumptionIds: [],
          conventionIds: [],
          sourceRefs: [],
          openObligationIds: [],
          trustState: 'exploratory',
        },
        prompt: [],
      }),
    ).resolves.toBeNull();

    const compiled = await provider.getProcessGraphSlice({
      workFrame: {
        id: 'frame.qg',
        domain: 'theoretical-physics/general',
        topic: 'qg',
        goal: 'Trace QG/MIPT relation.',
        activeObjectIds: [],
        assumptionIds: [],
        conventionIds: [],
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
        openObligationIds: [],
        trustState: 'exploratory',
      },
      prompt: [{ type: 'text', text: 'Brainstorm relation path.' }],
    });

    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
  });

  it('resolves explicit AITP scope refs from WorkFrame source refs', () => {
    expect(
      resolveAitpScopeFromWorkFrame({
        id: 'frame.qg',
        domain: 'theoretical-physics/general',
        topic: 'qg',
        goal: 'Trace QG/MIPT relation.',
        activeObjectIds: [],
        assumptionIds: [],
        conventionIds: [],
        sourceRefs: ['paper:foo', 'aitp:session:session-qg', 'aitp:claim:claim-mipt'],
        openObligationIds: [],
        trustState: 'exploratory',
      }),
    ).toEqual({ sessionId: 'session-qg', claimId: 'claim-mipt' });
  });
});

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
        missing_components: ['reference_location'],
        complete: false,
      },
    ],
    relation_neighborhood: [
      {
        relation_id: 'rel-algebra-observer',
        status: 'hypothesis',
        relation_type: 'connects',
        subject_id: 'object-algebra',
        object_id: 'object-observer',
      },
    ],
    exploratory_records: [],
    trust_boundary_reasons: ['this API cannot update claim trust'],
    recommended_moments: [
      {
        moment: 'brainstorm_relation_path',
        target_type: 'object_relation',
        target_id: 'rel-algebra-observer',
        reason: 'relation is still only a hypothesis',
      },
    ],
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
      {
        stage: 'source_asset',
        operation: 'registerSourceAsset',
        mcp_tool: 'aitp_v5_register_source_asset',
        cli_template: 'aitp-v5 asset register <args>',
        surface: 'source_asset_record',
        draft_only: true,
        creates_record_now: false,
        claim_support_created: false,
        payload_draft: {
          topic_id: topicId,
          claim_id: claimId,
          asset_type: document.asset_type,
          uri: document.source_uri,
          title: document.title,
          content_hash: document.content_hash,
          derived_from: [document.document_id, chunk.chunk_id],
        },
      },
      {
        stage: 'reference_location',
        operation: 'recordReferenceLocation',
        mcp_tool: 'aitp_v5_record_reference_location',
        cli_template: 'aitp-v5 reference location record <args>',
        surface: 'reference_location_record',
        draft_only: true,
        creates_record_now: false,
        claim_support_created: false,
        payload_draft: {
          topic_id: topicId,
          claim_id: claimId,
          connector_id: connectorId,
          uri: document.source_uri,
          source_ref: chunk.chunk_id,
        },
      },
      {
        stage: 'evidence',
        operation: 'recordEvidence',
        mcp_tool: 'aitp_v5_record_evidence',
        cli_template: 'aitp-v5 evidence record <args>',
        surface: 'evidence_record',
        draft_only: true,
        creates_record_now: false,
        claim_support_created: false,
        requires_existing_records: ['source_asset_record', 'reference_location_record'],
        payload_template: { topic_id: topicId, claim_id: claimId },
      },
      {
        stage: 'validation',
        operation: 'createValidationContract',
        mcp_tool: 'aitp_v5_create_validation_contract',
        cli_template: 'aitp-v5 validation contract create <args>',
        surface: 'validation_contract_record',
        draft_only: true,
        creates_record_now: false,
        claim_support_created: false,
        requires_existing_records: ['evidence_record'],
        payload_template: { topic_id: topicId, claim_id: claimId },
      },
      {
        stage: 'trust_preflight',
        operation: 'preflightTrustUpdate',
        mcp_tool: 'aitp_v5_preflight_trust_update',
        cli_template: 'aitp-v5 trust preflight <args>',
        surface: 'trust_update_preflight',
        draft_only: true,
        creates_record_now: false,
        claim_support_created: false,
        requires_existing_records: ['evidence_record', 'validation_result_record'],
        payload_template: { topic_id: topicId, claim_id: claimId },
      },
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
