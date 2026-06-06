import { describe, expect, it } from 'vitest';

import {
  AitpCliBridgeError,
  buildAitpExploratoryRecordArgs,
  buildAitpHumanCheckpointRequestArgs,
  buildAitpProcessGraphSliceArgs,
  buildAitpProofObligationCreateArgs,
  buildAitpSourceAssetRegisterArgs,
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
