import type {
  AitpEvidenceWriteResult,
  AitpExploratoryRecordWriteResult,
  AitpHumanCheckpointWriteResult,
  AitpProofObligationWriteResult,
  AitpReferenceLocationWriteResult,
  AitpSourceAssetWriteResult,
  AitpToolRunWriteResult,
  AitpValidationContractWriteResult,
  AitpValidationResultWriteResult,
  CreateAitpValidationContractInput,
  CreateAitpProofObligationInput,
  RecordAitpEvidenceInput,
  RecordAitpValidationResultInput,
  RecordAitpExploratoryRecordInput,
  RecordAitpReferenceLocationInput,
  RecordAitpToolRunInput,
  RegisterAitpSourceAssetInput,
  RequestAitpHumanCheckpointInput,
} from './cli-bridge';
import type { AitpSourceAssetType } from './cli-bridge';
import type { AitpExplorationStatus, AitpExplorationType } from './types';

export const AITP_WRITE_BRIDGE_OPERATIONS = [
  'recordExploratoryRecord',
  'registerSourceAsset',
  'recordEvidence',
  'recordToolRun',
  'recordReferenceLocation',
  'createProofObligation',
  'createValidationContract',
  'recordValidationResult',
  'requestHumanCheckpoint',
] as const;

export type AitpWriteBridgeOperation = (typeof AITP_WRITE_BRIDGE_OPERATIONS)[number];

export type AitpWriteBridgeExecutionInput =
  | {
      readonly operation: 'recordExploratoryRecord';
      readonly payload: RecordAitpExploratoryRecordInput;
    }
  | {
      readonly operation: 'registerSourceAsset';
      readonly payload: RegisterAitpSourceAssetInput;
    }
  | {
      readonly operation: 'recordEvidence';
      readonly payload: RecordAitpEvidenceInput;
    }
  | {
      readonly operation: 'recordToolRun';
      readonly payload: RecordAitpToolRunInput;
    }
  | {
      readonly operation: 'recordReferenceLocation';
      readonly payload: RecordAitpReferenceLocationInput;
    }
  | {
      readonly operation: 'createProofObligation';
      readonly payload: CreateAitpProofObligationInput;
    }
  | {
      readonly operation: 'createValidationContract';
      readonly payload: CreateAitpValidationContractInput;
    }
  | {
      readonly operation: 'recordValidationResult';
      readonly payload: RecordAitpValidationResultInput;
    }
  | {
      readonly operation: 'requestHumanCheckpoint';
      readonly payload: RequestAitpHumanCheckpointInput;
    };

export type AitpWriteBridgeExecutionResult =
  | AitpExploratoryRecordWriteResult
  | AitpSourceAssetWriteResult
  | AitpEvidenceWriteResult
  | AitpToolRunWriteResult
  | AitpReferenceLocationWriteResult
  | AitpProofObligationWriteResult
  | AitpValidationContractWriteResult
  | AitpValidationResultWriteResult
  | AitpHumanCheckpointWriteResult;

export interface AitpWriteBridgeExecutor {
  executeWrite(
    input: AitpWriteBridgeExecutionInput,
  ): Promise<AitpWriteBridgeExecutionResult>;
}

export interface AitpWriteBridgeCliTarget {
  recordExploratoryRecord(
    input: RecordAitpExploratoryRecordInput,
  ): Promise<AitpExploratoryRecordWriteResult>;
  registerSourceAsset(
    input: RegisterAitpSourceAssetInput,
  ): Promise<AitpSourceAssetWriteResult>;
  recordEvidence(input: RecordAitpEvidenceInput): Promise<AitpEvidenceWriteResult>;
  recordToolRun(input: RecordAitpToolRunInput): Promise<AitpToolRunWriteResult>;
  recordReferenceLocation(
    input: RecordAitpReferenceLocationInput,
  ): Promise<AitpReferenceLocationWriteResult>;
  createProofObligation(
    input: CreateAitpProofObligationInput,
  ): Promise<AitpProofObligationWriteResult>;
  createValidationContract(
    input: CreateAitpValidationContractInput,
  ): Promise<AitpValidationContractWriteResult>;
  recordValidationResult(
    input: RecordAitpValidationResultInput,
  ): Promise<AitpValidationResultWriteResult>;
  requestHumanCheckpoint(
    input: RequestAitpHumanCheckpointInput,
  ): Promise<AitpHumanCheckpointWriteResult>;
}

export class AitpCliWriteBridgeExecutor implements AitpWriteBridgeExecutor {
  constructor(private readonly bridge: AitpWriteBridgeCliTarget) {}

  async executeWrite(
    input: AitpWriteBridgeExecutionInput,
  ): Promise<AitpWriteBridgeExecutionResult> {
    switch (input.operation) {
      case 'recordExploratoryRecord':
        return this.bridge.recordExploratoryRecord(input.payload);
      case 'registerSourceAsset':
        return this.bridge.registerSourceAsset(input.payload);
      case 'recordEvidence':
        return this.bridge.recordEvidence(input.payload);
      case 'recordToolRun':
        return this.bridge.recordToolRun(input.payload);
      case 'recordReferenceLocation':
        return this.bridge.recordReferenceLocation(input.payload);
      case 'createProofObligation':
        return this.bridge.createProofObligation(input.payload);
      case 'createValidationContract':
        return this.bridge.createValidationContract(input.payload);
      case 'recordValidationResult':
        return this.bridge.recordValidationResult(input.payload);
      case 'requestHumanCheckpoint':
        return this.bridge.requestHumanCheckpoint(input.payload);
    }
  }
}

export function createAitpCliWriteBridgeExecutor(
  bridge: AitpWriteBridgeCliTarget,
): AitpWriteBridgeExecutor {
  return new AitpCliWriteBridgeExecutor(bridge);
}

export function coerceAitpWriteBridgeInput(
  operation: AitpWriteBridgeOperation,
  payload: unknown,
  signal?: AbortSignal,
): AitpWriteBridgeExecutionInput {
  const record = requireRecord(payload, 'aitp_payload');
  switch (operation) {
    case 'recordExploratoryRecord':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          explorationType: requiredString(
            record,
            'explorationType',
            'exploration_type',
          ) as AitpExplorationType,
          title: requiredString(record, 'title'),
          focalQuestion: requiredString(record, 'focalQuestion', 'focal_question'),
          summary: requiredString(record, 'summary'),
          claimId: optionalString(record, 'claimId', 'claim_id'),
          sessionId: optionalString(record, 'sessionId', 'session_id'),
          originalQuestion: optionalString(record, 'originalQuestion', 'original_question'),
          localQuestion: optionalString(record, 'localQuestion', 'local_question'),
          status: optionalString(record, 'status') as AitpExplorationStatus | undefined,
          objectIds: optionalStringArray(record, 'objectIds', 'object_ids'),
          relationIds: optionalStringArray(record, 'relationIds', 'relation_ids'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          parentRecordIds: optionalStringArray(record, 'parentRecordIds', 'parent_record_ids'),
          derivedRecordIds: optionalStringArray(record, 'derivedRecordIds', 'derived_record_ids'),
          candidatePaths: optionalStringArray(record, 'candidatePaths', 'candidate_paths'),
          unresolvedPoints: optionalStringArray(record, 'unresolvedPoints', 'unresolved_points'),
          nextActions: optionalStringArray(record, 'nextActions', 'next_actions'),
          humanSteering: optionalString(record, 'humanSteering', 'human_steering'),
          metadata: optionalRecord(record, 'metadata'),
          signal,
        },
      };
    case 'registerSourceAsset':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          assetType: requiredString(record, 'assetType', 'asset_type', 'type') as AitpSourceAssetType,
          uri: requiredString(record, 'uri'),
          title: requiredString(record, 'title'),
          claimId: optionalString(record, 'claimId', 'claim_id'),
          label: optionalString(record, 'label'),
          contentHash: optionalString(record, 'contentHash', 'content_hash'),
          hashAlgorithm: optionalString(record, 'hashAlgorithm', 'hash_algorithm'),
          versionAnchor: optionalRecord(record, 'versionAnchor', 'version_anchor'),
          acquiredAt: optionalString(record, 'acquiredAt', 'acquired_at'),
          sourceKind: optionalString(record, 'sourceKind', 'source_kind'),
          summary: optionalString(record, 'summary'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          codeStateIds: optionalStringArray(record, 'codeStateIds', 'code_state_ids'),
          referenceLocationIds: optionalStringArray(
            record,
            'referenceLocationIds',
            'reference_location_ids',
          ),
          derivedFrom: optionalStringArray(record, 'derivedFrom', 'derived_from'),
          metadata: optionalRecord(record, 'metadata'),
          linkedRecords: optionalRecord(record, 'linkedRecords', 'linked_records'),
          signal,
        },
      };
    case 'recordEvidence':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          evidenceType: requiredString(record, 'evidenceType', 'evidence_type', 'type'),
          status: requiredString(record, 'status'),
          summary: requiredString(record, 'summary'),
          supportsOutputs: optionalStringArray(
            record,
            'supportsOutputs',
            'supports_outputs',
            'supportsOutput',
            'supports_output',
          ),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          toolRunIds: optionalStringArray(record, 'toolRunIds', 'tool_run_ids'),
          validationResultIds: optionalStringArray(
            record,
            'validationResultIds',
            'validation_result_ids',
          ),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          signal,
        },
      };
    case 'recordToolRun':
      return {
        operation,
        payload: {
          recipeId: requiredString(record, 'recipeId', 'recipe_id', 'recipe'),
          toolFamily: requiredString(record, 'toolFamily', 'tool_family', 'family'),
          toolName: requiredString(record, 'toolName', 'tool_name', 'name'),
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          inputs: optionalRecord(record, 'inputs', 'inputs_json'),
          outputs: optionalRecord(record, 'outputs', 'outputs_json'),
          environment: optionalRecord(record, 'environment', 'environment_json'),
          evidenceStatus: optionalString(record, 'evidenceStatus', 'evidence_status'),
          codeStateIds: optionalStringArray(record, 'codeStateIds', 'code_state_ids'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          signal,
        },
      };
    case 'recordReferenceLocation':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          connectorId: requiredString(record, 'connectorId', 'connector_id', 'connector'),
          locationType: requiredString(record, 'locationType', 'location_type', 'type'),
          uri: requiredString(record, 'uri'),
          label: requiredString(record, 'label'),
          claimId: optionalString(record, 'claimId', 'claim_id'),
          sourceRef: optionalString(record, 'sourceRef', 'source_ref'),
          externalId: optionalString(record, 'externalId', 'external_id'),
          status: optionalString(record, 'status'),
          summary: optionalString(record, 'summary'),
          metadata: optionalRecord(record, 'metadata', 'metadata_json'),
          linkedRecords: optionalRecord(record, 'linkedRecords', 'linked_records', 'linked_records_json'),
          signal,
        },
      };
    case 'createProofObligation':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          statement: requiredString(record, 'statement'),
          obligationType: requiredString(record, 'obligationType', 'obligation_type', 'type'),
          status: requiredString(record, 'status'),
          maturityLevel: requiredString(record, 'maturityLevel', 'maturity_level'),
          nextAction: requiredString(record, 'nextAction', 'next_action'),
          requiredEvidence: optionalStringArray(record, 'requiredEvidence', 'required_evidence'),
          proofStrategy: optionalStringArray(record, 'proofStrategy', 'proof_strategy'),
          failureModes: optionalStringArray(record, 'failureModes', 'failure_modes'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          evidenceRefs: optionalStringArray(record, 'evidenceRefs', 'evidence_refs'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          signal,
        },
      };
    case 'createValidationContract':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          requiredChecks: requiredStringArray(record, 'requiredChecks', 'required_checks'),
          failureModes: requiredStringArray(record, 'failureModes', 'failure_modes'),
          requiredEvidenceOutputs: requiredStringArray(
            record,
            'requiredEvidenceOutputs',
            'required_evidence_outputs',
            'required_outputs',
          ),
          toolRecipeIds: optionalStringArray(record, 'toolRecipeIds', 'tool_recipe_ids'),
          executorIds: optionalStringArray(record, 'executorIds', 'executor_ids'),
          validatorRole: optionalString(record, 'validatorRole', 'validator_role'),
          signal,
        },
      };
    case 'recordValidationResult':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          contractId: requiredString(record, 'contractId', 'contract_id', 'contract'),
          toolRunId: requiredString(record, 'toolRunId', 'tool_run_id', 'tool_run'),
          status: requiredString(record, 'status'),
          summary: requiredString(record, 'summary'),
          checkedOutputs: optionalStringArray(record, 'checkedOutputs', 'checked_outputs'),
          coveredFailureModes: optionalStringArray(
            record,
            'coveredFailureModes',
            'covered_failure_modes',
          ),
          failureModesObserved: optionalStringArray(
            record,
            'failureModesObserved',
            'failure_modes_observed',
            'failure_modes',
          ),
          evidenceRefs: optionalStringArray(record, 'evidenceRefs', 'evidence_refs'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          signal,
        },
      };
    case 'requestHumanCheckpoint':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          reason: requiredString(record, 'reason'),
          requestedBy: requiredString(record, 'requestedBy', 'requested_by'),
          options: requiredStringArray(record, 'options'),
          signal,
        },
      };
  }
}

export function actionIdForAitpWriteBridgeOperation(
  operation: AitpWriteBridgeOperation,
): string {
  switch (operation) {
    case 'recordExploratoryRecord':
      return 'aitp.record_exploratory_record';
    case 'registerSourceAsset':
      return 'aitp.register_source_asset';
    case 'recordEvidence':
      return 'aitp.record_evidence';
    case 'recordToolRun':
      return 'aitp.record_tool_run';
    case 'recordReferenceLocation':
      return 'aitp.record_reference_location';
    case 'createProofObligation':
      return 'aitp.create_open_obligation';
    case 'createValidationContract':
      return 'aitp.create_validation_contract';
    case 'recordValidationResult':
      return 'aitp.record_validation_result';
    case 'requestHumanCheckpoint':
      return 'aitp.request_human_checkpoint';
  }
}

export function evidenceRefsForAitpWriteBridgeResult(
  result: AitpWriteBridgeExecutionResult,
): readonly string[] {
  switch (result.kind) {
    case 'exploratory_record':
      return [`aitp:exploratory_record:${result.recordId}`];
    case 'source_asset':
      return [`aitp:source_asset:${result.assetId}`];
    case 'evidence':
      return [`aitp:evidence:${result.evidenceId}`];
    case 'tool_run':
      return [`aitp:tool_run:${result.runId}`];
    case 'reference_location':
      return [`aitp:reference_location:${result.locationId}`];
    case 'proof_obligation':
      return [`aitp:proof_obligation:${result.obligationId}`];
    case 'validation_contract':
      return [`aitp:validation_contract:${result.contractId}`];
    case 'validation_result':
      return [`aitp:validation_result:${result.resultId}`];
    case 'human_checkpoint':
      return [`aitp:human_checkpoint:${result.checkpointId}`];
  }
}

export function generatedObligationIdsForAitpWriteBridgeResult(
  result: AitpWriteBridgeExecutionResult,
): readonly string[] {
  return result.kind === 'proof_obligation' ? [result.obligationId] : [];
}

export class AitpWriteBridgePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpWriteBridgePayloadError';
  }
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  throw new AitpWriteBridgePayloadError(`${label} must be an object.`);
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): string {
  const value = optionalString(record, ...keys);
  if (value !== undefined) return value;
  throw new AitpWriteBridgePayloadError(`aitp_payload.${keys[0]} is required.`);
}

function optionalString(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function requiredStringArray(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): readonly string[] {
  const value = optionalStringArray(record, ...keys);
  if (value !== undefined && value.length > 0) return value;
  throw new AitpWriteBridgePayloadError(`aitp_payload.${keys[0]} must contain at least one value.`);
}

function optionalStringArray(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): readonly string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    const items = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (items.length > 0) return items;
  }
  return undefined;
}

function optionalRecord(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): Readonly<Record<string, unknown>> | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Readonly<Record<string, unknown>>;
    }
  }
  return undefined;
}
