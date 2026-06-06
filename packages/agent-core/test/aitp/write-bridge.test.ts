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
