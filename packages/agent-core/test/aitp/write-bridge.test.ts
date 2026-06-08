import { describe, expect, it, vi } from 'vitest';

import {
  AITP_CURATED_RAG_CATALOG_VERSION,
  AITP_RUNTIME_BRIDGE_TARGETS,
  AitpWriteBridgePayloadError,
  buildPrimitiveToolLifecycleAitpToolRunPayload,
  aitpRuntimeBridgeTargetForOperation,
  coerceAitpWriteBridgeInput,
  createAitpCliWriteBridgeExecutor,
  createAitpMcpFirstWriteBridgeExecutor,
  evidenceRefsForAitpWriteBridgeResult,
  generatedObligationIdsForAitpWriteBridgeResult,
  mcpArgsForAitpWriteBridgeInput,
  PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE,
  type AitpCuratedRagIngestResult,
  type AitpWriteBridgeCliTarget,
} from '../../src';

describe('AITP write bridge executor', () => {
  it('projects AITP runtime bridge targets as MCP-first with CLI fallback', () => {
    const byOperation = new Map(
      AITP_RUNTIME_BRIDGE_TARGETS.map((target) => [target.operation, target]),
    );

    expect(byOperation.get('readProcessGraphSlice')).toMatchObject({
      entrypointKey: 'process_graph_slice',
      mcpTool: 'aitp_v5_get_process_graph_slice',
      cliFallback: 'aitp-v5 graph slice <session-id>',
      surface: 'process_graph_slice',
      preferredTransport: 'mcp',
      fallbackTransport: 'cli',
      mcpInvocation: {
        tool: 'aitp_v5_get_process_graph_slice',
        argumentStyle: 'json_object',
        baseArgument: 'base',
        payloadKeyCase: 'snake_case',
        resultSurface: 'process_graph_slice',
        resultContentType: 'json_object',
        fallbackPolicy: 'use_cli_when_mcp_transport_unavailable_or_call_fails',
      },
      executionRole: 'read',
      stateEffect: 'read_only',
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
      mcpArguments: {
        required: ['base', 'session_id'],
        optional: ['claim_id', 'limit'],
        source: 'aitp_v5_get_process_graph_slice',
      },
    });
    expect(byOperation.get('readMomentPolicy')).toMatchObject({
      entrypointKey: 'host_agnostic_moment_policy',
      mcpTool: 'aitp_v5_get_host_agnostic_moment_policy',
      cliFallback: 'aitp-v5 graph moment-policy <session-id>',
      surface: 'host_agnostic_moment_policy',
      executionRole: 'read',
      stateEffect: 'read_only',
      mcpArguments: {
        required: ['base', 'session_id'],
        optional: ['claim_id', 'limit'],
        source: 'aitp_v5_get_host_agnostic_moment_policy',
      },
    });
    expect(byOperation.get('readRuntimePayloadProfiles')).toMatchObject({
      entrypointKey: 'runtime_payload_profiles',
      mcpTool: 'aitp_v5_get_runtime_payload_profiles',
      cliFallback: 'aitp-v5 adapter payload-profiles',
      surface: 'runtime_payload_profiles',
      preferredTransport: 'mcp',
      fallbackTransport: 'cli',
      mcpInvocation: {
        tool: 'aitp_v5_get_runtime_payload_profiles',
        argumentStyle: 'json_object',
        baseArgument: 'base',
        payloadKeyCase: 'snake_case',
        resultSurface: 'runtime_payload_profiles',
        resultContentType: 'json_object',
        fallbackPolicy: 'use_cli_when_mcp_transport_unavailable_or_call_fails',
      },
      executionRole: 'read',
      stateEffect: 'read_only',
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
      mcpArguments: {
        required: [],
        optional: [],
        source: 'aitp_v5_get_runtime_payload_profiles',
      },
    });
    expect(aitpRuntimeBridgeTargetForOperation('recordEvidence')).toMatchObject({
      operation: 'recordEvidence',
      entrypointKey: 'record_evidence',
      mcpTool: 'aitp_v5_record_evidence',
      cliFallback: 'aitp-v5 evidence record <args>',
      surface: 'evidence_record',
      executionRole: 'write',
      stateEffect: 'typed_record_write',
      canonicalStore: '.aitp',
      mcpInvocation: {
        tool: 'aitp_v5_record_evidence',
        argumentStyle: 'json_object',
        baseArgument: 'base',
        payloadKeyCase: 'snake_case',
        resultSurface: 'evidence_record',
        resultContentType: 'json_object',
        fallbackPolicy: 'use_cli_when_mcp_transport_unavailable_or_call_fails',
      },
    });
    expect(aitpRuntimeBridgeTargetForOperation('captureSourceAssetAuto')).toMatchObject({
      operation: 'captureSourceAssetAuto',
      entrypointKey: 'capture_source_asset_auto',
      mcpTool: 'aitp_v5_capture_source_asset_auto',
      cliFallback: 'aitp-v5 asset capture-auto <args>',
      surface: 'source_asset_record',
      executionRole: 'write',
      stateEffect: 'typed_record_write',
      claimTrustMutation: 'none',
    });
    expect(aitpRuntimeBridgeTargetForOperation('captureToolRunAuto')).toMatchObject({
      operation: 'captureToolRunAuto',
      entrypointKey: 'capture_tool_run_auto',
      mcpTool: 'aitp_v5_capture_tool_run_auto',
      cliFallback: 'aitp-v5 tool run capture-auto <args>',
      surface: 'tool_run_record',
      executionRole: 'write',
      stateEffect: 'typed_record_write',
      claimTrustMutation: 'none',
    });
    expect(aitpRuntimeBridgeTargetForOperation('attachArtifactAuto')).toMatchObject({
      operation: 'attachArtifactAuto',
      entrypointKey: 'attach_artifact_auto',
      mcpTool: 'aitp_v5_attach_artifact_auto',
      cliFallback: 'aitp-v5 research-state attach-artifact-auto <args>',
      surface: 'artifact_record',
      executionRole: 'write',
      stateEffect: 'typed_record_write',
      claimTrustMutation: 'none',
    });
    expect(aitpRuntimeBridgeTargetForOperation('ingestCuratedRagCorpus')).toMatchObject({
      operation: 'ingestCuratedRagCorpus',
      entrypointKey: 'ingest_curated_rag_corpus',
      mcpTool: 'aitp_v5_ingest_curated_rag_corpus',
      cliFallback: 'aitp-v5 curated-rag ingest <args>',
      surface: 'curated_rag_ingest_result',
      executionRole: 'write',
      stateEffect: 'curated_rag_manifest_write',
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
    });
    expect(aitpRuntimeBridgeTargetForOperation('preflightTrustUpdate')).toMatchObject({
      operation: 'preflightTrustUpdate',
      entrypointKey: 'trust_preflight',
      mcpTool: 'aitp_v5_preflight_trust_update',
      cliFallback: 'aitp-v5 trust preflight <args>',
      stateEffect: 'preflight_only',
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
    });
    expect([...byOperation.keys()]).not.toContain('trustApply');
  });

  it('builds MCP write args with the AITP base argument and snake_case payload keys', () => {
    const input = coerceAitpWriteBridgeInput('recordEvidence', {
      topic_id: 'qg',
      claim_id: 'claim-qg',
      evidence_type: 'source_reconstruction',
      status: 'supports',
      summary: 'Source chain reconstructed.',
      supports_outputs: ['definition path'],
      validation_result_ids: ['validation-result-qg'],
    });

    expect(mcpArgsForAitpWriteBridgeInput(input, 'F:/aitp-workspace')).toEqual({
      base: 'F:/aitp-workspace',
      topic_id: 'qg',
      claim_id: 'claim-qg',
      evidence_type: 'source_reconstruction',
      status: 'supports',
      summary: 'Source chain reconstructed.',
      supports_outputs: ['definition path'],
      validation_result_ids: ['validation-result-qg'],
    });
  });

  it('coerces curated RAG ingestion payloads into heuristic manifest writes', () => {
    const input = coerceAitpWriteBridgeInput('ingestCuratedRagCorpus', {
      path: 'F:/sources/lecture-notes.md',
      corpus_id: 'physics-foundations',
      tag: 'operator-algebra',
      domain_hints: ['theoretical-physics'],
      topicHints: ['qg-algebra'],
      language: 'en',
      priority: 'high',
      chunk_token_limit: 180,
      titlePrefix: 'Curated',
      asset_type: 'lecture',
      rebuild_index: false,
    });

    expect(input).toMatchObject({
      operation: 'ingestCuratedRagCorpus',
      payload: {
        paths: ['F:/sources/lecture-notes.md'],
        corpusId: 'physics-foundations',
        tags: ['operator-algebra'],
        domainHints: ['theoretical-physics'],
        topicHints: ['qg-algebra'],
        language: 'en',
        priority: 'high',
        chunkTokenLimit: 180,
        titlePrefix: 'Curated',
        assetType: 'lecture',
        rebuildIndex: false,
      },
    });
    expect(mcpArgsForAitpWriteBridgeInput(input, 'F:/aitp-workspace')).toEqual({
      base: 'F:/aitp-workspace',
      paths: ['F:/sources/lecture-notes.md'],
      corpus_id: 'physics-foundations',
      tags: ['operator-algebra'],
      domain_hints: ['theoretical-physics'],
      topic_hints: ['qg-algebra'],
      language: 'en',
      priority: 'high',
      chunk_token_limit: 180,
      title_prefix: 'Curated',
      asset_type: 'lecture',
      rebuild_index: false,
    });
  });

  it('builds AITP tool-run payloads from primitive tool lifecycle envelopes', () => {
    const payload = buildPrimitiveToolLifecycleAitpToolRunPayload(
      {
        started: {
          source: 'loop',
          turnId: 7,
          step: 2,
          stepUuid: 'step-read',
          toolCallId: 'call_read_mapping',
          toolName: 'Read',
          cwd: 'F:/project',
          argsSummary: '{"path":"src/kernel.ts"}',
          workFrameId: 'frame-gw',
          actionCallId: 'call-action',
          startedAt: 100,
        },
        completed: {
          source: 'loop',
          turnId: 7,
          step: 2,
          stepUuid: 'step-read',
          toolCallId: 'call_read_mapping',
          toolName: 'Read',
          cwd: 'F:/project',
          status: 'passed',
          isError: false,
          outputKind: 'text',
          outputSummary: 'kernel.ts contains the head-wing update.',
          durationMs: 25,
          completedAt: 125,
          workFrameId: 'frame-gw',
          actionCallId: 'call-action',
          artifactRefs: ['aitp:artifact:artifact-read-log', 'local:ignored'],
        },
      },
      {
        id: 'frame-gw',
        domain: 'librpa',
        topic: 'gw',
        goal: 'Inspect GW code path.',
        activeObjectIds: [],
        assumptionIds: [],
        conventionIds: [],
        openObligationIds: [],
        sourceRefs: ['aitp:claim:claim-gw', 'source_asset:paper-gw'],
        trustState: 'exploratory',
      },
    );

    expect(payload).toMatchObject({
      recipeId: 'primitive_tool:Read:call_read_mapping',
      toolFamily: 'primitive_tool',
      toolName: 'Read',
      topicId: 'gw',
      claimId: 'claim-gw',
      inputs: {
        argsSummary: '{"path":"src/kernel.ts"}',
        cwd: 'F:/project',
      },
      outputs: {
        toolCallId: 'call_read_mapping',
        toolName: 'Read',
        status: 'passed',
        outputSummary: 'kernel.ts contains the head-wing update.',
        durationMs: 25,
        workFrameId: 'frame-gw',
        actionCallId: 'call-action',
      },
      environment: {
        captureTool: 'hakimi.primitive_tool_lifecycle',
        payloadProfile: PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE,
        summaryInputsTrusted: false,
        canUpdateClaimTrust: false,
      },
      evidenceStatus: 'unreviewed',
      artifactIds: ['artifact-read-log'],
      sourceRefs: [
        'aitp:claim:claim-gw',
        'source_asset:paper-gw',
        'tool:Read',
        'tool_call:call_read_mapping',
      ],
    });
  });

  it('does not build primitive tool payloads without AITP topic and claim scope', () => {
    const payload = buildPrimitiveToolLifecycleAitpToolRunPayload({
      started: undefined,
      completed: {
        source: 'loop',
        turnId: 1,
        toolCallId: 'call_ls',
        toolName: 'LS',
        status: 'passed',
        isError: false,
        outputKind: 'empty',
        outputSummary: '',
        completedAt: 10,
        artifactRefs: [],
      },
    });

    expect(payload).toBeUndefined();
  });

  it('prefers MCP for write execution and parses MCP text JSON results', async () => {
    const fallback = {
      executeWrite: vi.fn(),
    };
    const calls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    const executor = createAitpMcpFirstWriteBridgeExecutor({
      basePath: () => 'F:/aitp-workspace',
      fallback,
      transport: {
        async callTool(input) {
          calls.push({ toolName: input.toolName, args: input.args });
          return {
            isError: false,
            content: [
              { type: 'text', text: 'AITP write completed.' },
              {
                type: 'text',
                text: JSON.stringify({
                  ok: true,
                  kind: 'evidence',
                  evidence_id: 'evidence-qg',
                  topic_id: 'qg',
                  claim_id: 'claim-qg',
                  evidence_type: 'source_reconstruction',
                  status: 'supports',
                }),
              },
            ],
          };
        },
      },
    });

    const result = await executor.executeWrite({
      operation: 'recordEvidence',
      payload: {
        topicId: 'qg',
        claimId: 'claim-qg',
        evidenceType: 'source_reconstruction',
        status: 'supports',
        summary: 'Source chain reconstructed.',
        supportsOutputs: ['definition path'],
      },
    });

    expect(result).toMatchObject({
      kind: 'evidence',
      evidenceId: 'evidence-qg',
      topicId: 'qg',
      claimId: 'claim-qg',
    });
    expect(calls).toEqual([
      {
        toolName: 'aitp_v5_record_evidence',
        args: {
          base: 'F:/aitp-workspace',
          topic_id: 'qg',
          claim_id: 'claim-qg',
          evidence_type: 'source_reconstruction',
          status: 'supports',
          summary: 'Source chain reconstructed.',
          supports_outputs: ['definition path'],
        },
      },
    ]);
    expect(fallback.executeWrite).not.toHaveBeenCalled();
  });

  it('falls back to CLI writes when MCP execution fails', async () => {
    const fallback = {
      executeWrite: vi.fn(async () => ({
        ok: true,
        kind: 'human_checkpoint' as const,
        checkpointId: 'checkpoint-cli',
        topicId: 'qg',
        claimId: 'claim-qg',
        status: 'requested',
        raw: {},
      })),
    };
    const executor = createAitpMcpFirstWriteBridgeExecutor({
      basePath: () => 'F:/aitp-workspace',
      fallback,
      transport: {
        async callTool() {
          throw new Error('MCP unavailable');
        },
      },
    });

    await expect(
      executor.executeWrite({
        operation: 'requestHumanCheckpoint',
        payload: {
          topicId: 'qg',
          claimId: 'claim-qg',
          reason: 'Trust boundary.',
          requestedBy: 'hakimi',
          options: ['keep provisional'],
        },
      }),
    ).resolves.toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-cli',
    });
    expect(fallback.executeWrite).toHaveBeenCalledTimes(1);
  });

  it('falls back to CLI writes when MCP returns an error envelope', async () => {
    const fallback = {
      executeWrite: vi.fn(async () => ({
        ok: true,
        kind: 'evidence' as const,
        evidenceId: 'evidence-cli',
        topicId: 'qg',
        claimId: 'claim-qg',
        evidenceType: 'source_reconstruction',
        status: 'supports',
        raw: {},
      })),
    };
    const executor = createAitpMcpFirstWriteBridgeExecutor({
      basePath: () => 'F:/aitp-workspace',
      fallback,
      transport: {
        async callTool() {
          return {
            isError: true,
            structuredContent: {
              ok: true,
              kind: 'evidence',
              evidence_id: 'evidence-should-not-parse',
            },
          };
        },
      },
    });

    await expect(
      executor.executeWrite({
        operation: 'recordEvidence',
        payload: {
          topicId: 'qg',
          claimId: 'claim-qg',
          evidenceType: 'source_reconstruction',
          status: 'supports',
          summary: 'Source chain reconstructed.',
        },
      }),
    ).resolves.toMatchObject({
      kind: 'evidence',
      evidenceId: 'evidence-cli',
    });
    expect(fallback.executeWrite).toHaveBeenCalledTimes(1);
  });

  it('coerces model-facing payloads into narrow AITP proof-obligation writes', () => {
    const input = coerceAitpWriteBridgeInput('createProofObligation', {
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      statement: 'Keep the source gap explicit.',
      obligation_type: 'source_support',
      status: 'open',
      maturity_level: 'hypothesis',
      next_action: 'follow source dependency',
      required_evidence: ['source reconstruction'],
      proof_strategy: ['trace definition source'],
      failure_modes: ['analogy mistaken for derivation'],
      source_refs: ['source_asset:asset-algebra-paper'],
    });

    expect(input).toMatchObject({
      operation: 'createProofObligation',
      payload: {
        topicId: 'qg-algebra-mipt',
        claimId: 'claim-mipt-observer-algebra',
        obligationType: 'source_support',
        requiredEvidence: ['source reconstruction'],
      },
    });
  });

  it('coerces source assets and validation payloads into AITP writes', () => {
    const sourceAsset = coerceAitpWriteBridgeInput('registerSourceAsset', {
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      asset_type: 'paper',
      uri: 'arxiv:2601.00001',
      title: 'Algebraic observer source',
      version_anchor: { arxiv_version: 'v1' },
      source_refs: ['paper:observer-algebra'],
      linked_records: { claim_id: 'claim-mipt-observer-algebra' },
    });
    const sourceAssetAuto = coerceAitpWriteBridgeInput('captureSourceAssetAuto', {
      path: 'F:/sources/operator-algebra-notes.md',
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      asset_type: 'note',
      title: 'Operator algebra notes',
      source_kind: 'local_file_auto',
      source_refs: ['local:notes'],
      linked_records: { claim_id: 'claim-mipt-observer-algebra' },
    });
    const toolRunAuto = coerceAitpWriteBridgeInput('captureToolRunAuto', {
      path: 'F:/runs/source-audit/transcript.txt',
      recipe_id: 'recipe-source-audit',
      tool_family: 'literature',
      tool_name: 'source-audit',
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      inputs: { source: 'operator algebra notes' },
      summary: 'Local source-audit transcript.',
      max_preview_chars: 800,
    });
    const contract = coerceAitpWriteBridgeInput('createValidationContract', {
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      required_checks: ['source reconstruction', 'definition closure'],
      failure_modes: ['analogy mistaken for derivation'],
      required_evidence_outputs: ['source chain transcript'],
      validator_role: 'adversarial_reviewer',
    });
    const result = coerceAitpWriteBridgeInput('recordValidationResult', {
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      contract_id: 'validation-contract-qg',
      tool_run_id: 'tool-run-source-audit',
      status: 'partial',
      summary: 'Definition source traced; theorem dependency remains open.',
      checked_outputs: ['source chain transcript'],
      covered_failure_modes: ['analogy mistaken for derivation'],
      evidence_refs: ['evidence-source-chain'],
    });
    const reviewResult = coerceAitpWriteBridgeInput('recordSourceReconstructionReviewResult', {
      claim_id: 'claim-mipt-observer-algebra',
      status: 'needs_revision',
      reviewed_components: ['definitions', 'source_locations'],
      basis_refs: ['source_asset:asset-algebra-paper'],
      reference_location_ids: ['reference-location-algebra-paper'],
      remaining_actions: ['trace theorem dependency'],
      reviewer_role: 'adversarial_reviewer',
      summary: 'Definitions reviewed; theorem dependency needs revision.',
    });

    expect(sourceAsset).toMatchObject({
      operation: 'registerSourceAsset',
      payload: {
        topicId: 'qg-algebra-mipt',
        assetType: 'paper',
        versionAnchor: { arxiv_version: 'v1' },
        linkedRecords: { claim_id: 'claim-mipt-observer-algebra' },
      },
    });
    expect(sourceAssetAuto).toMatchObject({
      operation: 'captureSourceAssetAuto',
      payload: {
        path: 'F:/sources/operator-algebra-notes.md',
        topicId: 'qg-algebra-mipt',
        claimId: 'claim-mipt-observer-algebra',
        assetType: 'note',
        title: 'Operator algebra notes',
        sourceRefs: ['local:notes'],
        linkedRecords: { claim_id: 'claim-mipt-observer-algebra' },
      },
    });
    expect(toolRunAuto).toMatchObject({
      operation: 'captureToolRunAuto',
      payload: {
        path: 'F:/runs/source-audit/transcript.txt',
        recipeId: 'recipe-source-audit',
        toolFamily: 'literature',
        toolName: 'source-audit',
        topicId: 'qg-algebra-mipt',
        claimId: 'claim-mipt-observer-algebra',
        inputs: { source: 'operator algebra notes' },
        summary: 'Local source-audit transcript.',
        maxPreviewChars: 800,
      },
    });
    expect(contract).toMatchObject({
      operation: 'createValidationContract',
      payload: {
        requiredChecks: ['source reconstruction', 'definition closure'],
        validatorRole: 'adversarial_reviewer',
      },
    });
    expect(result).toMatchObject({
      operation: 'recordValidationResult',
      payload: {
        contractId: 'validation-contract-qg',
        toolRunId: 'tool-run-source-audit',
        checkedOutputs: ['source chain transcript'],
      },
    });
    expect(reviewResult).toMatchObject({
      operation: 'recordSourceReconstructionReviewResult',
      payload: {
        claimId: 'claim-mipt-observer-algebra',
        status: 'needs_revision',
        reviewedComponents: ['definitions', 'source_locations'],
        basisRefs: ['source_asset:asset-algebra-paper'],
        referenceLocationIds: ['reference-location-algebra-paper'],
        remainingActions: ['trace theorem dependency'],
        reviewerRole: 'adversarial_reviewer',
      },
    });
  });

  it('coerces AITP evidence, tool-run, and reference-location payloads', () => {
    const evidence = coerceAitpWriteBridgeInput('recordEvidence', {
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      evidence_type: 'source_reconstruction',
      status: 'supports',
      summary: 'Definition source chain reconstructed.',
      supports_outputs: ['source chain transcript'],
      source_refs: ['reference_location:split-paper'],
      tool_run_ids: ['tool-run-source-audit'],
    });
    const toolRun = coerceAitpWriteBridgeInput('recordToolRun', {
      recipe_id: 'recipe-source-audit',
      tool_family: 'literature',
      tool_name: 'source-audit',
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      inputs: { source: 'split paper' },
      outputs: { closed: true },
      evidence_status: 'supports',
      source_refs: ['reference_location:split-paper'],
    });
    const codeState = coerceAitpWriteBridgeInput('captureCodeStateAuto', {
      worktree_path: 'F:/repo/librpa',
      repo_id: 'librpa',
      topic_id: 'gw',
      claim_id: 'claim-gw',
      session_id: 'session-gw',
      build_config: { cmake: 'release' },
      runtime_environment: { os: 'windows' },
      linked_records: { claim_id: 'claim-gw' },
      known_divergence: 'local validation patch',
      write_patch_artifact: true,
    });
    const artifact = coerceAitpWriteBridgeInput('attachArtifact', {
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      artifact_type: 'benchmark_log',
      artifact_uri: 'runs/qg/benchmark.log',
      artifact_summary: 'Benchmark log for the source reconstruction check.',
      size_bytes: '2048',
      metadata: { role: 'benchmark_output' },
    });
    const artifactAuto = coerceAitpWriteBridgeInput('attachArtifactAuto', {
      path: 'F:/runs/qg/source-audit.log',
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      artifact_type: 'benchmark_log',
      artifact_summary: 'Source audit log.',
      metadata: { role: 'benchmark_output' },
    });
    const reference = coerceAitpWriteBridgeInput('recordReferenceLocation', {
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      connector: 'local_pdf',
      type: 'paper_pdf',
      uri: 'file:///papers/split.pdf',
      label: 'Split property paper',
      source_ref: 'paper:split',
      linked_records: { claim_id: 'claim-mipt-observer-algebra' },
    });

    expect(evidence).toMatchObject({
      operation: 'recordEvidence',
      payload: {
        evidenceType: 'source_reconstruction',
        supportsOutputs: ['source chain transcript'],
        toolRunIds: ['tool-run-source-audit'],
      },
    });
    expect(toolRun).toMatchObject({
      operation: 'recordToolRun',
      payload: {
        recipeId: 'recipe-source-audit',
        inputs: { source: 'split paper' },
        outputs: { closed: true },
        evidenceStatus: 'supports',
      },
    });
    expect(codeState).toMatchObject({
      operation: 'captureCodeStateAuto',
      payload: {
        worktreePath: 'F:/repo/librpa',
        repoId: 'librpa',
        buildConfig: { cmake: 'release' },
        runtimeEnvironment: { os: 'windows' },
        linkedRecords: { claim_id: 'claim-gw' },
        writePatchArtifact: true,
      },
    });
    expect(artifact).toMatchObject({
      operation: 'attachArtifact',
      payload: {
        topicId: 'qg-algebra-mipt',
        claimId: 'claim-mipt-observer-algebra',
        artifactType: 'benchmark_log',
        uri: 'runs/qg/benchmark.log',
        summary: 'Benchmark log for the source reconstruction check.',
        sizeBytes: '2048',
        metadata: { role: 'benchmark_output' },
      },
    });
    expect(artifactAuto).toMatchObject({
      operation: 'attachArtifactAuto',
      payload: {
        path: 'F:/runs/qg/source-audit.log',
        topicId: 'qg-algebra-mipt',
        claimId: 'claim-mipt-observer-algebra',
        artifactType: 'benchmark_log',
        summary: 'Source audit log.',
        metadata: { role: 'benchmark_output' },
      },
    });
    expect(reference).toMatchObject({
      operation: 'recordReferenceLocation',
      payload: {
        connectorId: 'local_pdf',
        locationType: 'paper_pdf',
        linkedRecords: { claim_id: 'claim-mipt-observer-algebra' },
      },
    });
    const preflight = coerceAitpWriteBridgeInput('preflightTrustUpdate', {
      action: 'change_claim_confidence',
      session_id: 'session-qg',
      topic_id: 'qg-algebra-mipt',
      claim_id: 'claim-mipt-observer-algebra',
      requested_state: 'supported',
      source_kind: 'proof_obligation_record',
      source_ref: 'proof_obligation:obl-source',
      evidence_refs: ['evidence-source-chain'],
      code_state_ids: ['code-state-qg'],
      rationale: 'Trust-sensitive final answer would treat source support as checked.',
    });
    expect(preflight).toMatchObject({
      operation: 'preflightTrustUpdate',
      payload: {
        action: 'change_claim_confidence',
        sessionId: 'session-qg',
        requestedState: 'supported',
        sourceRef: 'proof_obligation:obl-source',
      },
    });
  });

  it('delegates supported writes to the configured CLI bridge target', async () => {
    const calls: string[] = [];
    const target: AitpWriteBridgeCliTarget = {
      async ingestCuratedRagCorpus() {
        calls.push('ingestCuratedRagCorpus');
        return fakeCuratedRagIngestResult();
      },
      async recordExploratoryRecord() {
        calls.push('recordExploratoryRecord');
        return {
          ok: true,
          kind: 'exploratory_record',
          recordId: 'explore-qg',
          topicId: 'qg',
          explorationType: 'relation_path_brainstorm',
          orientationOnly: true,
          canUpdateClaimTrust: false,
          raw: {},
        };
      },
      async registerSourceAsset() {
        calls.push('registerSourceAsset');
        return {
          ok: true,
          kind: 'source_asset',
          assetId: 'source-asset-qg',
          topicId: 'qg',
          assetType: 'paper',
          orientationOnly: true,
          canUpdateClaimTrust: false,
          raw: {},
        };
      },
      async captureSourceAssetAuto() {
        calls.push('captureSourceAssetAuto');
        return {
          ok: true,
          kind: 'source_asset',
          assetId: 'source-asset-qg-auto',
          topicId: 'qg',
          assetType: 'note',
          orientationOnly: true,
          canUpdateClaimTrust: false,
          raw: {},
        };
      },
      async recordEvidence() {
        calls.push('recordEvidence');
        return {
          ok: true,
          kind: 'evidence',
          evidenceId: 'evidence-qg',
          topicId: 'qg',
          claimId: 'claim-qg',
          evidenceType: 'source_reconstruction',
          status: 'supports',
          raw: {},
        };
      },
      async recordToolRun() {
        calls.push('recordToolRun');
        return {
          ok: true,
          kind: 'tool_run',
          runId: 'tool-run-qg',
          recipeId: 'recipe-qg',
          toolFamily: 'literature',
          toolName: 'source-audit',
          topicId: 'qg',
          claimId: 'claim-qg',
          evidenceStatus: 'supports',
          raw: {},
        };
      },
      async captureToolRunAuto() {
        calls.push('captureToolRunAuto');
        return {
          ok: true,
          kind: 'tool_run',
          runId: 'tool-run-qg-auto',
          recipeId: 'recipe-qg',
          toolFamily: 'literature',
          toolName: 'source-audit',
          topicId: 'qg',
          claimId: 'claim-qg',
          evidenceStatus: 'unreviewed',
          raw: {},
        };
      },
      async captureCodeStateAuto() {
        calls.push('captureCodeStateAuto');
        return {
          ok: true,
          kind: 'code_state',
          codeStateId: 'code-state-qg',
          repoId: 'librpa',
          upstreamRemote: 'origin',
          upstreamBranch: 'main',
          upstreamCommit: 'abc123',
          localBranch: 'feature/provenance',
          worktreePath: 'F:/repo/librpa',
          dirty: true,
          patchId: 'artifact-git_patch-qg',
          diffHash: 'd'.repeat(64),
          raw: {},
        };
      },
      async attachArtifact() {
        calls.push('attachArtifact');
        return {
          ok: true,
          kind: 'artifact',
          artifactId: 'artifact-qg-log',
          topicId: 'qg',
          claimId: 'claim-qg',
          artifactType: 'benchmark_log',
          uri: 'runs/qg/benchmark.log',
          summary: 'Benchmark log.',
          sizeBytes: 2048,
          canUpdateClaimTrust: false,
          raw: {},
        };
      },
      async attachArtifactAuto() {
        calls.push('attachArtifactAuto');
        return {
          ok: true,
          kind: 'artifact',
          artifactId: 'artifact-qg-log-auto',
          topicId: 'qg',
          claimId: 'claim-qg',
          artifactType: 'benchmark_log',
          uri: 'file:///F:/runs/qg/benchmark.log',
          summary: 'Benchmark log.',
          sizeBytes: 2048,
          canUpdateClaimTrust: false,
          raw: {},
        };
      },
      async recordReferenceLocation() {
        calls.push('recordReferenceLocation');
        return {
          ok: true,
          kind: 'reference_location',
          locationId: 'reference-location-qg',
          topicId: 'qg',
          claimId: 'claim-qg',
          connectorId: 'local_pdf',
          locationType: 'paper_pdf',
          uri: 'file:///papers/qg.pdf',
          label: 'QG source',
          status: 'located',
          orientationOnly: true,
          raw: {},
        };
      },
      async createProofObligation() {
        calls.push('createProofObligation');
        return {
          ok: true,
          kind: 'proof_obligation',
          obligationId: 'obl-qg',
          topicId: 'qg',
          claimId: 'claim-qg',
          status: 'open',
          canUpdateClaimTrust: false,
          raw: {},
        };
      },
      async createValidationContract() {
        calls.push('createValidationContract');
        return {
          ok: true,
          kind: 'validation_contract',
          contractId: 'validation-contract-qg',
          topicId: 'qg',
          claimId: 'claim-qg',
          status: 'open',
          raw: {},
        };
      },
      async recordValidationResult() {
        calls.push('recordValidationResult');
        return {
          ok: true,
          kind: 'validation_result',
          resultId: 'validation-result-qg',
          topicId: 'qg',
          claimId: 'claim-qg',
          contractId: 'validation-contract-qg',
          toolRunId: 'tool-run-qg',
          status: 'partial',
          raw: {},
        };
      },
      async recordSourceReconstructionReviewResult() {
        calls.push('recordSourceReconstructionReviewResult');
        return {
          ok: true,
          kind: 'source_reconstruction_review_result',
          resultId: 'source-review-result-qg',
          topicId: 'qg',
          claimId: 'claim-qg',
          status: 'inconclusive',
          canUpdateClaimTrust: false,
          raw: {},
        };
      },
      async requestHumanCheckpoint() {
        calls.push('requestHumanCheckpoint');
        return {
          ok: true,
          kind: 'human_checkpoint',
          checkpointId: 'checkpoint-qg',
          topicId: 'qg',
          claimId: 'claim-qg',
          status: 'requested',
          raw: {},
        };
      },
      async preflightTrustUpdate() {
        calls.push('preflightTrustUpdate');
        return {
          ok: true,
          kind: 'trust_update_preflight',
          requestId: 'trust-request-qg',
          action: 'change_claim_confidence',
          sessionId: 'session-qg',
          topicId: 'qg',
          claimId: 'claim-qg',
          requestedState: 'supported',
          allowed: false,
          mutationAllowedAfterPreflight: false,
          requiredActions: ['record typed evidence'],
          evidenceRefs: ['evidence-qg'],
          codeStateIds: [],
          preflightToken: 'trust-preflight-token-qg',
          canUpdateKernelState: false,
          raw: {},
        };
      },
    };
    const executor = createAitpCliWriteBridgeExecutor(target);

    const ingest = await executor.executeWrite({
      operation: 'ingestCuratedRagCorpus',
      payload: {
        paths: ['F:/sources/lecture-notes.md'],
        corpusId: 'physics-foundations',
        tags: ['operator-algebra'],
      },
    });
    const autoSource = await executor.executeWrite({
      operation: 'captureSourceAssetAuto',
      payload: {
        path: 'F:/sources/operator-algebra-notes.md',
        topicId: 'qg',
        claimId: 'claim-qg',
      },
    });
    const artifact = await executor.executeWrite({
      operation: 'attachArtifact',
      payload: {
        topicId: 'qg',
        claimId: 'claim-qg',
        artifactType: 'benchmark_log',
        uri: 'runs/qg/benchmark.log',
        summary: 'Benchmark log.',
      },
    });
    const toolRunAuto = await executor.executeWrite({
      operation: 'captureToolRunAuto',
      payload: {
        path: 'F:/runs/source-audit/transcript.txt',
        recipeId: 'recipe-qg',
        toolFamily: 'literature',
        toolName: 'source-audit',
        topicId: 'qg',
        claimId: 'claim-qg',
      },
    });
    const artifactAuto = await executor.executeWrite({
      operation: 'attachArtifactAuto',
      payload: {
        path: 'F:/runs/qg/benchmark.log',
        topicId: 'qg',
        claimId: 'claim-qg',
        artifactType: 'benchmark_log',
        summary: 'Benchmark log.',
      },
    });
    const result = await executor.executeWrite({
      operation: 'recordSourceReconstructionReviewResult',
      payload: {
        claimId: 'claim-qg',
        status: 'inconclusive',
        reviewedComponents: ['definitions'],
        basisRefs: ['source_asset:asset-qg'],
        summary: 'Definitions reviewed; source location remains open.',
      },
    });
    const preflight = await executor.executeWrite({
      operation: 'preflightTrustUpdate',
      payload: {
        action: 'change_claim_confidence',
        sessionId: 'session-qg',
        topicId: 'qg',
        claimId: 'claim-qg',
        requestedState: 'supported',
      },
    });

    expect(calls).toEqual([
      'ingestCuratedRagCorpus',
      'captureSourceAssetAuto',
      'attachArtifact',
      'captureToolRunAuto',
      'attachArtifactAuto',
      'recordSourceReconstructionReviewResult',
      'preflightTrustUpdate',
    ]);
    expect(ingest).toMatchObject({
      kind: 'curated_rag_ingest_result',
      corpusId: 'physics-foundations',
      stateEffect: 'curated_rag_manifest_write',
      retrievalRole: 'heuristic_context',
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
    });
    expect(evidenceRefsForAitpWriteBridgeResult(ingest)).toEqual([
      'aitp:curated_rag_corpus:physics-foundations',
      'aitp:curated_rag_document:doc-lecture-notes',
    ]);
    expect(autoSource).toMatchObject({
      kind: 'source_asset',
      assetId: 'source-asset-qg-auto',
      assetType: 'note',
    });
    expect(evidenceRefsForAitpWriteBridgeResult(autoSource)).toEqual([
      'aitp:source_asset:source-asset-qg-auto',
    ]);
    expect(artifact).toMatchObject({
      kind: 'artifact',
      artifactId: 'artifact-qg-log',
      canUpdateClaimTrust: false,
    });
    expect(evidenceRefsForAitpWriteBridgeResult(artifact)).toEqual([
      'aitp:artifact:artifact-qg-log',
    ]);
    expect(toolRunAuto).toMatchObject({
      kind: 'tool_run',
      runId: 'tool-run-qg-auto',
      evidenceStatus: 'unreviewed',
    });
    expect(evidenceRefsForAitpWriteBridgeResult(toolRunAuto)).toEqual([
      'aitp:tool_run:tool-run-qg-auto',
    ]);
    expect(artifactAuto).toMatchObject({
      kind: 'artifact',
      artifactId: 'artifact-qg-log-auto',
      canUpdateClaimTrust: false,
    });
    expect(evidenceRefsForAitpWriteBridgeResult(artifactAuto)).toEqual([
      'aitp:artifact:artifact-qg-log-auto',
    ]);
    expect(result).toMatchObject({
      kind: 'source_reconstruction_review_result',
      resultId: 'source-review-result-qg',
    });
    expect(evidenceRefsForAitpWriteBridgeResult(result)).toEqual([
      'aitp:source_reconstruction_review_result:source-review-result-qg',
    ]);
    expect(preflight).toMatchObject({
      kind: 'trust_update_preflight',
      preflightToken: 'trust-preflight-token-qg',
      canUpdateKernelState: false,
    });
    expect(evidenceRefsForAitpWriteBridgeResult(preflight)).toEqual([
      'aitp:trust_preflight:trust-preflight-token-qg',
    ]);
    expect(generatedObligationIdsForAitpWriteBridgeResult(result)).toEqual([]);
  });

  it('returns evidence refs for new AITP record surfaces', () => {
    expect(
      evidenceRefsForAitpWriteBridgeResult({
        ...fakeCuratedRagIngestResult(),
      }),
    ).toEqual([
      'aitp:curated_rag_corpus:physics-foundations',
      'aitp:curated_rag_document:doc-lecture-notes',
    ]);
    expect(
      evidenceRefsForAitpWriteBridgeResult({
        ok: true,
        kind: 'evidence',
        evidenceId: 'evidence-qg',
        topicId: 'qg',
        claimId: 'claim-qg',
        evidenceType: 'source_reconstruction',
        status: 'supports',
        raw: {},
      }),
    ).toEqual(['aitp:evidence:evidence-qg']);
    expect(
      evidenceRefsForAitpWriteBridgeResult({
        ok: true,
        kind: 'tool_run',
        runId: 'tool-run-qg',
        recipeId: 'recipe-qg',
        toolFamily: 'literature',
        toolName: 'source-audit',
        topicId: 'qg',
        claimId: 'claim-qg',
        evidenceStatus: 'supports',
        raw: {},
      }),
    ).toEqual(['aitp:tool_run:tool-run-qg']);
    expect(
      evidenceRefsForAitpWriteBridgeResult({
        ok: true,
        kind: 'code_state',
        codeStateId: 'code-state-qg',
        repoId: 'librpa',
        upstreamRemote: 'origin',
        upstreamBranch: 'main',
        upstreamCommit: 'abc123',
        localBranch: 'feature/provenance',
        worktreePath: 'F:/repo/librpa',
        dirty: true,
        patchId: 'artifact-git_patch-qg',
        diffHash: 'd'.repeat(64),
        raw: {},
      }),
    ).toEqual(['aitp:code_state:code-state-qg']);
    expect(
      evidenceRefsForAitpWriteBridgeResult({
        ok: true,
        kind: 'artifact',
        artifactId: 'artifact-qg-log',
        topicId: 'qg',
        claimId: 'claim-qg',
        artifactType: 'benchmark_log',
        uri: 'runs/qg/benchmark.log',
        summary: 'Benchmark log.',
        sizeBytes: 2048,
        canUpdateClaimTrust: false,
        raw: {},
      }),
    ).toEqual(['aitp:artifact:artifact-qg-log']);
    expect(
      evidenceRefsForAitpWriteBridgeResult({
        ok: true,
        kind: 'reference_location',
        locationId: 'reference-location-qg',
        topicId: 'qg',
        claimId: 'claim-qg',
        connectorId: 'local_pdf',
        locationType: 'paper_pdf',
        uri: 'file:///papers/qg.pdf',
        label: 'QG source',
        status: 'located',
        orientationOnly: true,
        raw: {},
      }),
    ).toEqual(['aitp:reference_location:reference-location-qg']);
    expect(
      evidenceRefsForAitpWriteBridgeResult({
        ok: true,
        kind: 'source_reconstruction_review_result',
        resultId: 'source-review-result-qg',
        topicId: 'qg',
        claimId: 'claim-qg',
        status: 'inconclusive',
        canUpdateClaimTrust: false,
        raw: {},
      }),
    ).toEqual(['aitp:source_reconstruction_review_result:source-review-result-qg']);
  });

  it('rejects incomplete payloads before reaching AITP', () => {
    expect(() =>
      coerceAitpWriteBridgeInput('requestHumanCheckpoint', {
        topicId: 'qg',
        claimId: 'claim-qg',
        reason: 'Trust boundary.',
        requestedBy: 'hakimi',
        options: [],
      }),
    ).toThrow(AitpWriteBridgePayloadError);
    expect(() =>
      coerceAitpWriteBridgeInput('recordSourceReconstructionReviewResult', {
        claimId: 'claim-qg',
        status: 'inconclusive',
        reviewedComponents: ['definitions'],
        summary: 'Missing basis.',
      }),
    ).toThrow(AitpWriteBridgePayloadError);
  });
});

function fakeCuratedRagIngestResult(): AitpCuratedRagIngestResult {
  return {
    ok: true,
    kind: 'curated_rag_ingest_result',
    catalogVersion: AITP_CURATED_RAG_CATALOG_VERSION,
    stateEffect: 'curated_rag_manifest_write',
    truthSource: 'curated_rag_ingestion',
    corpusId: 'physics-foundations',
    manifestPath: 'F:/project/.aitp/curated_rag/corpus.json',
    indexPath: 'F:/project/.aitp/curated_rag/indexes/lexical_index.json',
    manifestHash: 'c'.repeat(64),
    indexStatus: 'rebuilt',
    documentCount: 1,
    chunkCount: 1,
    documentIds: ['doc-lecture-notes'],
    chunkIds: ['chunk-lecture-notes-0001'],
    sourcePaths: ['F:/sources/lecture-notes.md'],
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
