import { describe, expect, it } from 'vitest';

import {
  AitpWriteBridgePayloadError,
  coerceAitpWriteBridgeInput,
  createAitpCliWriteBridgeExecutor,
  evidenceRefsForAitpWriteBridgeResult,
  generatedObligationIdsForAitpWriteBridgeResult,
  type AitpWriteBridgeCliTarget,
} from '../../src';

describe('AITP write bridge executor', () => {
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

    expect(sourceAsset).toMatchObject({
      operation: 'registerSourceAsset',
      payload: {
        topicId: 'qg-algebra-mipt',
        assetType: 'paper',
        versionAnchor: { arxiv_version: 'v1' },
        linkedRecords: { claim_id: 'claim-mipt-observer-algebra' },
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
    expect(reference).toMatchObject({
      operation: 'recordReferenceLocation',
      payload: {
        connectorId: 'local_pdf',
        locationType: 'paper_pdf',
        linkedRecords: { claim_id: 'claim-mipt-observer-algebra' },
      },
    });
  });

  it('delegates supported writes to the configured CLI bridge target', async () => {
    const calls: string[] = [];
    const target: AitpWriteBridgeCliTarget = {
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
    };
    const executor = createAitpCliWriteBridgeExecutor(target);

    const result = await executor.executeWrite({
      operation: 'requestHumanCheckpoint',
      payload: {
        topicId: 'qg',
        claimId: 'claim-qg',
        reason: 'Trust boundary.',
        requestedBy: 'hakimi',
        options: ['keep provisional'],
      },
    });

    expect(calls).toEqual(['requestHumanCheckpoint']);
    expect(result).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-qg',
    });
    expect(evidenceRefsForAitpWriteBridgeResult(result)).toEqual([
      'aitp:human_checkpoint:checkpoint-qg',
    ]);
    expect(generatedObligationIdsForAitpWriteBridgeResult(result)).toEqual([]);
  });

  it('returns evidence refs for new AITP record surfaces', () => {
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
  });
});
