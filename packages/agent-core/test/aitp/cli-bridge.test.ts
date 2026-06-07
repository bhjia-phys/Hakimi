import { describe, expect, it } from 'vitest';

import {
  AitpCliBridgeError,
  buildAitpArtifactAttachArgs,
  buildAitpCodeStateAutoArgs,
  buildAitpEvidenceRecordArgs,
  buildAitpExploratoryRecordArgs,
  buildAitpHumanCheckpointRequestArgs,
  buildAitpProcessGraphSliceArgs,
  buildAitpProofObligationCreateArgs,
  buildAitpReferenceLocationRecordArgs,
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
