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
