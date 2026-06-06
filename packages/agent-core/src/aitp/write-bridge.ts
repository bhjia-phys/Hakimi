import type {
  AitpExploratoryRecordWriteResult,
  AitpHumanCheckpointWriteResult,
  AitpProofObligationWriteResult,
  CreateAitpProofObligationInput,
  RecordAitpExploratoryRecordInput,
  RequestAitpHumanCheckpointInput,
} from './cli-bridge';
import type { AitpExplorationStatus, AitpExplorationType } from './types';

export const AITP_WRITE_BRIDGE_OPERATIONS = [
  'recordExploratoryRecord',
  'createProofObligation',
  'requestHumanCheckpoint',
] as const;

export type AitpWriteBridgeOperation = (typeof AITP_WRITE_BRIDGE_OPERATIONS)[number];

export type AitpWriteBridgeExecutionInput =
  | {
      readonly operation: 'recordExploratoryRecord';
      readonly payload: RecordAitpExploratoryRecordInput;
    }
  | {
      readonly operation: 'createProofObligation';
      readonly payload: CreateAitpProofObligationInput;
    }
  | {
      readonly operation: 'requestHumanCheckpoint';
      readonly payload: RequestAitpHumanCheckpointInput;
    };

export type AitpWriteBridgeExecutionResult =
  | AitpExploratoryRecordWriteResult
  | AitpProofObligationWriteResult
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
  createProofObligation(
    input: CreateAitpProofObligationInput,
  ): Promise<AitpProofObligationWriteResult>;
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
      case 'createProofObligation':
        return this.bridge.createProofObligation(input.payload);
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
    case 'createProofObligation':
      return 'aitp.create_open_obligation';
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
    case 'proof_obligation':
      return [`aitp:proof_obligation:${result.obligationId}`];
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
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = record[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
