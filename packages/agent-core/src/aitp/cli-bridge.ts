import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { compileAitpProcessGraphSlice, type CompileAitpProcessGraphSliceOptions } from './compiler';
import type {
  AitpExplorationStatus,
  AitpExplorationType,
  CompiledAitpProcessGraphSlice,
} from './types';
import { AITP_EXPLORATION_STATUSES, AITP_EXPLORATION_TYPES } from './types';
import type { WorkFrame } from '../research-action';

export const AITP_SOURCE_ASSET_TYPES = [
  'paper',
  'lecture',
  'note',
  'book',
  'code_repo',
  'code_snapshot',
  'dataset',
  'generated_artifact',
  'web_page',
  'correspondence',
  'other',
] as const;

export type AitpSourceAssetType = (typeof AITP_SOURCE_ASSET_TYPES)[number];

export interface AitpCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean | undefined;
}

export interface AitpCommandRunner {
  run(
    command: string,
    args: readonly string[],
    options: AitpCommandRunnerOptions,
  ): Promise<AitpCommandResult>;
}

export interface AitpCommandRunnerOptions {
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpCliBridgeOptions {
  readonly basePath: string;
  readonly command?: string | undefined;
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly runner?: AitpCommandRunner | undefined;
}

export interface AitpProcessGraphPromptPart {
  readonly type?: string | undefined;
  readonly text?: string | undefined;
}

export interface AitpProcessGraphSliceProviderInput {
  readonly workFrame: WorkFrame;
  readonly prompt: readonly AitpProcessGraphPromptPart[];
  readonly signal?: AbortSignal | undefined;
}

export interface AitpProcessGraphSliceProvider {
  getProcessGraphSlice(
    input: AitpProcessGraphSliceProviderInput,
  ): Promise<CompiledAitpProcessGraphSlice | null | undefined>;
}

export interface AitpWorkFrameScope {
  readonly sessionId: string;
  readonly claimId?: string | undefined;
}

export interface AitpCliProcessGraphSliceProviderOptions extends AitpCliBridgeOptions {
  readonly limit?: number | undefined;
  readonly resolveScope?:
    | ((workFrame: WorkFrame) => AitpWorkFrameScope | null | undefined)
    | undefined;
}

export interface ReadAitpProcessGraphSliceInput extends CompileAitpProcessGraphSliceOptions {
  readonly sessionId: string;
  readonly claimId?: string | undefined;
  readonly limit?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface RecordAitpExploratoryRecordInput {
  readonly topicId: string;
  readonly explorationType: AitpExplorationType;
  readonly title: string;
  readonly focalQuestion: string;
  readonly summary: string;
  readonly claimId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly originalQuestion?: string | undefined;
  readonly localQuestion?: string | undefined;
  readonly status?: AitpExplorationStatus | undefined;
  readonly objectIds?: readonly string[] | undefined;
  readonly relationIds?: readonly string[] | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly artifactIds?: readonly string[] | undefined;
  readonly parentRecordIds?: readonly string[] | undefined;
  readonly derivedRecordIds?: readonly string[] | undefined;
  readonly candidatePaths?: readonly string[] | undefined;
  readonly unresolvedPoints?: readonly string[] | undefined;
  readonly nextActions?: readonly string[] | undefined;
  readonly humanSteering?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface RegisterAitpSourceAssetInput {
  readonly topicId: string;
  readonly assetType: AitpSourceAssetType;
  readonly uri: string;
  readonly title: string;
  readonly claimId?: string | undefined;
  readonly label?: string | undefined;
  readonly contentHash?: string | undefined;
  readonly hashAlgorithm?: string | undefined;
  readonly versionAnchor?: Readonly<Record<string, unknown>> | undefined;
  readonly acquiredAt?: string | undefined;
  readonly sourceKind?: string | undefined;
  readonly summary?: string | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly artifactIds?: readonly string[] | undefined;
  readonly codeStateIds?: readonly string[] | undefined;
  readonly referenceLocationIds?: readonly string[] | undefined;
  readonly derivedFrom?: readonly string[] | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly linkedRecords?: Readonly<Record<string, unknown>> | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface RecordAitpEvidenceInput {
  readonly topicId: string;
  readonly claimId: string;
  readonly evidenceType: string;
  readonly status: string;
  readonly summary: string;
  readonly supportsOutputs?: readonly string[] | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly toolRunIds?: readonly string[] | undefined;
  readonly validationResultIds?: readonly string[] | undefined;
  readonly artifactIds?: readonly string[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface RecordAitpToolRunInput {
  readonly recipeId: string;
  readonly toolFamily: string;
  readonly toolName: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly inputs?: Readonly<Record<string, unknown>> | undefined;
  readonly outputs?: Readonly<Record<string, unknown>> | undefined;
  readonly environment?: Readonly<Record<string, unknown>> | undefined;
  readonly evidenceStatus?: string | undefined;
  readonly codeStateIds?: readonly string[] | undefined;
  readonly artifactIds?: readonly string[] | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface CaptureAitpCodeStateAutoInput {
  readonly worktreePath: string;
  readonly repoId?: string | undefined;
  readonly topicId?: string | undefined;
  readonly claimId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly buildConfig?: Readonly<Record<string, unknown>> | undefined;
  readonly runtimeEnvironment?: Readonly<Record<string, unknown>> | undefined;
  readonly linkedRecords?: Readonly<Record<string, unknown>> | undefined;
  readonly knownDivergence?: string | undefined;
  readonly writePatchArtifact?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AttachAitpArtifactInput {
  readonly topicId: string;
  readonly claimId: string;
  readonly artifactType: string;
  readonly uri: string;
  readonly summary: string;
  readonly sizeBytes?: number | string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface RecordAitpReferenceLocationInput {
  readonly topicId: string;
  readonly connectorId: string;
  readonly locationType: string;
  readonly uri: string;
  readonly label: string;
  readonly claimId?: string | undefined;
  readonly sourceRef?: string | undefined;
  readonly externalId?: string | undefined;
  readonly status?: string | undefined;
  readonly summary?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly linkedRecords?: Readonly<Record<string, unknown>> | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface RequestAitpHumanCheckpointInput {
  readonly topicId: string;
  readonly claimId: string;
  readonly reason: string;
  readonly requestedBy: string;
  readonly options: readonly string[];
  readonly signal?: AbortSignal | undefined;
}

export interface PreflightAitpTrustUpdateInput {
  readonly action: string;
  readonly sessionId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly requestedState?: string | undefined;
  readonly sourceKind?: string | undefined;
  readonly sourceRef?: string | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
  readonly codeStateIds?: readonly string[] | undefined;
  readonly rationale?: string | undefined;
  readonly requestId?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface CreateAitpProofObligationInput {
  readonly topicId: string;
  readonly claimId: string;
  readonly statement: string;
  readonly obligationType: string;
  readonly status: string;
  readonly maturityLevel: string;
  readonly nextAction: string;
  readonly requiredEvidence?: readonly string[] | undefined;
  readonly proofStrategy?: readonly string[] | undefined;
  readonly failureModes?: readonly string[] | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
  readonly artifactIds?: readonly string[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface CreateAitpValidationContractInput {
  readonly topicId: string;
  readonly claimId: string;
  readonly requiredChecks: readonly string[];
  readonly failureModes: readonly string[];
  readonly requiredEvidenceOutputs: readonly string[];
  readonly toolRecipeIds?: readonly string[] | undefined;
  readonly executorIds?: readonly string[] | undefined;
  readonly validatorRole?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface RecordAitpValidationResultInput {
  readonly topicId: string;
  readonly claimId: string;
  readonly contractId: string;
  readonly toolRunId: string;
  readonly status: string;
  readonly summary: string;
  readonly checkedOutputs?: readonly string[] | undefined;
  readonly coveredFailureModes?: readonly string[] | undefined;
  readonly failureModesObserved?: readonly string[] | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
  readonly artifactIds?: readonly string[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface RecordAitpSourceReconstructionReviewResultInput {
  readonly claimId: string;
  readonly status: string;
  readonly reviewedComponents: readonly string[];
  readonly summary: string;
  readonly basisRefs?: readonly string[] | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
  readonly validationResultIds?: readonly string[] | undefined;
  readonly referenceLocationIds?: readonly string[] | undefined;
  readonly objectIds?: readonly string[] | undefined;
  readonly relationIds?: readonly string[] | undefined;
  readonly remainingActions?: readonly string[] | undefined;
  readonly reviewerRole?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpExploratoryRecordWriteResult {
  readonly ok: boolean;
  readonly kind: 'exploratory_record';
  readonly recordId: string;
  readonly topicId: string;
  readonly explorationType: AitpExplorationType;
  readonly orientationOnly: boolean;
  readonly canUpdateClaimTrust: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpSourceAssetWriteResult {
  readonly ok: boolean;
  readonly kind: 'source_asset';
  readonly assetId: string;
  readonly topicId: string;
  readonly assetType: AitpSourceAssetType;
  readonly orientationOnly: boolean;
  readonly canUpdateClaimTrust: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpEvidenceWriteResult {
  readonly ok: boolean;
  readonly kind: 'evidence';
  readonly evidenceId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly evidenceType: string;
  readonly status: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpToolRunWriteResult {
  readonly ok: boolean;
  readonly kind: 'tool_run';
  readonly runId: string;
  readonly recipeId: string;
  readonly toolFamily: string;
  readonly toolName: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly evidenceStatus: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpCodeStateWriteResult {
  readonly ok: boolean;
  readonly kind: 'code_state';
  readonly codeStateId: string;
  readonly repoId: string;
  readonly upstreamRemote: string;
  readonly upstreamBranch: string;
  readonly upstreamCommit: string;
  readonly localBranch: string;
  readonly worktreePath: string;
  readonly dirty: boolean;
  readonly patchId: string;
  readonly diffHash: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpArtifactWriteResult {
  readonly ok: boolean;
  readonly kind: 'artifact';
  readonly artifactId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly artifactType: string;
  readonly uri: string;
  readonly summary: string;
  readonly sizeBytes: number;
  readonly canUpdateClaimTrust: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpReferenceLocationWriteResult {
  readonly ok: boolean;
  readonly kind: 'reference_location';
  readonly locationId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly connectorId: string;
  readonly locationType: string;
  readonly uri: string;
  readonly label: string;
  readonly status: string;
  readonly orientationOnly: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpHumanCheckpointWriteResult {
  readonly ok: boolean;
  readonly kind: 'human_checkpoint';
  readonly checkpointId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly status: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpTrustPreflightWriteResult {
  readonly ok: boolean;
  readonly kind: 'trust_update_preflight';
  readonly requestId: string;
  readonly action: string;
  readonly sessionId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly requestedState: string;
  readonly allowed: boolean;
  readonly mutationAllowedAfterPreflight: boolean;
  readonly requiredActions: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly codeStateIds: readonly string[];
  readonly preflightToken: string;
  readonly canUpdateKernelState: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpProofObligationWriteResult {
  readonly ok: boolean;
  readonly kind: 'proof_obligation';
  readonly obligationId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly status: string;
  readonly canUpdateClaimTrust: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpValidationContractWriteResult {
  readonly ok: boolean;
  readonly kind: 'validation_contract';
  readonly contractId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly status: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpValidationResultWriteResult {
  readonly ok: boolean;
  readonly kind: 'validation_result';
  readonly resultId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly contractId: string;
  readonly toolRunId: string;
  readonly status: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpSourceReconstructionReviewResultWriteResult {
  readonly ok: boolean;
  readonly kind: 'source_reconstruction_review_result';
  readonly resultId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly status: string;
  readonly canUpdateClaimTrust: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}

export class AitpCliBridgeError extends Error {
  constructor(
    message: string,
    readonly details: {
      readonly command?: string | undefined;
      readonly args?: readonly string[] | undefined;
      readonly exitCode?: number | undefined;
      readonly stderr?: string | undefined;
    } = {},
  ) {
    super(message);
    this.name = 'AitpCliBridgeError';
  }
}

export class AitpCliBridge {
  private readonly command: string;
  private readonly runner: AitpCommandRunner;

  constructor(private readonly options: AitpCliBridgeOptions) {
    requireNonEmpty(options.basePath, 'basePath');
    this.command = options.command ?? 'aitp-v5';
    this.runner = options.runner ?? new SpawnAitpCommandRunner();
  }

  async readProcessGraphSlice(
    input: ReadAitpProcessGraphSliceInput,
  ): Promise<CompiledAitpProcessGraphSlice> {
    const args = buildAitpProcessGraphSliceArgs({
      basePath: this.options.basePath,
      sessionId: input.sessionId,
      claimId: input.claimId,
      limit: input.limit,
    });
    const payload = await this.runJson(args, input.signal);
    return compileAitpProcessGraphSlice(payload, {
      prompt: input.prompt,
      activeContext: input.activeContext,
      maxContextItems: input.maxContextItems,
    });
  }

  async recordExploratoryRecord(
    input: RecordAitpExploratoryRecordInput,
  ): Promise<AitpExploratoryRecordWriteResult> {
    const args = buildAitpExploratoryRecordArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseExploratoryRecordWriteResult(payload);
  }

  async registerSourceAsset(
    input: RegisterAitpSourceAssetInput,
  ): Promise<AitpSourceAssetWriteResult> {
    const args = buildAitpSourceAssetRegisterArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseSourceAssetWriteResult(payload);
  }

  async recordEvidence(
    input: RecordAitpEvidenceInput,
  ): Promise<AitpEvidenceWriteResult> {
    const args = buildAitpEvidenceRecordArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseEvidenceWriteResult(payload);
  }

  async recordToolRun(
    input: RecordAitpToolRunInput,
  ): Promise<AitpToolRunWriteResult> {
    const args = buildAitpToolRunRecordArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseToolRunWriteResult(payload);
  }

  async captureCodeStateAuto(
    input: CaptureAitpCodeStateAutoInput,
  ): Promise<AitpCodeStateWriteResult> {
    const args = buildAitpCodeStateAutoArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseCodeStateWriteResult(payload);
  }

  async attachArtifact(input: AttachAitpArtifactInput): Promise<AitpArtifactWriteResult> {
    const args = buildAitpArtifactAttachArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseArtifactWriteResult(payload);
  }

  async recordReferenceLocation(
    input: RecordAitpReferenceLocationInput,
  ): Promise<AitpReferenceLocationWriteResult> {
    const args = buildAitpReferenceLocationRecordArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseReferenceLocationWriteResult(payload);
  }

  async requestHumanCheckpoint(
    input: RequestAitpHumanCheckpointInput,
  ): Promise<AitpHumanCheckpointWriteResult> {
    const args = buildAitpHumanCheckpointRequestArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseHumanCheckpointWriteResult(payload);
  }

  async preflightTrustUpdate(
    input: PreflightAitpTrustUpdateInput,
  ): Promise<AitpTrustPreflightWriteResult> {
    const args = buildAitpTrustPreflightArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseTrustPreflightWriteResult(payload);
  }

  async createProofObligation(
    input: CreateAitpProofObligationInput,
  ): Promise<AitpProofObligationWriteResult> {
    const args = buildAitpProofObligationCreateArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseProofObligationWriteResult(payload);
  }

  async createValidationContract(
    input: CreateAitpValidationContractInput,
  ): Promise<AitpValidationContractWriteResult> {
    const args = buildAitpValidationContractCreateArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseValidationContractWriteResult(payload);
  }

  async recordValidationResult(
    input: RecordAitpValidationResultInput,
  ): Promise<AitpValidationResultWriteResult> {
    const args = buildAitpValidationResultRecordArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseValidationResultWriteResult(payload);
  }

  async recordSourceReconstructionReviewResult(
    input: RecordAitpSourceReconstructionReviewResultInput,
  ): Promise<AitpSourceReconstructionReviewResultWriteResult> {
    const args = buildAitpSourceReconstructionReviewResultRecordArgs({
      basePath: this.options.basePath,
      ...input,
    });
    const payload = await this.runJson(args, input.signal);
    return parseSourceReconstructionReviewResultWriteResult(payload);
  }

  private async runJson(args: readonly string[], signal?: AbortSignal): Promise<unknown> {
    const result = await this.runner.run(this.command, args, {
      cwd: this.options.cwd,
      timeoutMs: this.options.timeoutMs,
      signal,
    });
    if (result.exitCode !== 0) {
      throw new AitpCliBridgeError('AITP command failed.', {
        command: this.command,
        args,
        exitCode: result.exitCode,
        stderr: result.stderr,
      });
    }
    return parseJsonOutput(result.stdout, {
      command: this.command,
      args,
      stderr: result.stderr,
    });
  }
}

export function createAitpCliBridge(options: AitpCliBridgeOptions): AitpCliBridge {
  return new AitpCliBridge(options);
}

export function createAitpCliProcessGraphSliceProvider(
  options: AitpCliProcessGraphSliceProviderOptions,
): AitpProcessGraphSliceProvider {
  const bridge = createAitpCliBridge(options);
  const resolveScope = options.resolveScope ?? resolveAitpScopeFromWorkFrame;
  return {
    async getProcessGraphSlice(input) {
      const scope = resolveScope(input.workFrame);
      if (scope === null || scope === undefined) return null;
      return bridge.readProcessGraphSlice({
        sessionId: scope.sessionId,
        claimId: scope.claimId,
        limit: options.limit,
        activeContext: promptText(input.prompt),
        signal: input.signal,
      });
    },
  };
}

export function resolveAitpScopeFromWorkFrame(
  workFrame: WorkFrame,
): AitpWorkFrameScope | undefined {
  const sessionId = refValue(workFrame.sourceRefs, 'aitp:session:');
  if (sessionId === undefined) return undefined;
  return {
    sessionId,
    claimId: refValue(workFrame.sourceRefs, 'aitp:claim:'),
  };
}

export function buildAitpProcessGraphSliceArgs(input: {
  readonly basePath: string;
  readonly sessionId: string;
  readonly claimId?: string | undefined;
  readonly limit?: number | undefined;
}): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.sessionId, 'sessionId');
  const limit = input.limit ?? 80;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new AitpCliBridgeError('AITP graph slice limit must be a positive integer.');
  }
  const args = ['--base', input.basePath, 'graph', 'slice', input.sessionId, '--limit', String(limit)];
  if (input.claimId !== undefined && input.claimId.trim().length > 0) {
    args.push('--claim', input.claimId.trim());
  }
  return args;
}

export function buildAitpExploratoryRecordArgs(
  input: RecordAitpExploratoryRecordInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.title, 'title');
  requireNonEmpty(input.focalQuestion, 'focalQuestion');
  requireNonEmpty(input.summary, 'summary');
  requireAllowed(input.explorationType, AITP_EXPLORATION_TYPES, 'explorationType');
  requireAllowed(input.status ?? 'open', AITP_EXPLORATION_STATUSES, 'status');

  const args = [
    '--base',
    input.basePath,
    'exploration',
    'record',
    '--topic',
    input.topicId.trim(),
    '--type',
    input.explorationType,
    '--title',
    input.title.trim(),
    '--focal-question',
    input.focalQuestion.trim(),
    '--summary',
    input.summary.trim(),
    '--status',
    input.status ?? 'open',
  ];

  pushOptional(args, '--claim', input.claimId);
  pushOptional(args, '--session', input.sessionId);
  pushOptional(args, '--original-question', input.originalQuestion);
  pushOptional(args, '--local-question', input.localQuestion);
  pushOptional(args, '--human-steering', input.humanSteering);
  pushRepeated(args, '--object-id', input.objectIds);
  pushRepeated(args, '--relation-id', input.relationIds);
  pushRepeated(args, '--source-ref', input.sourceRefs);
  pushRepeated(args, '--artifact-id', input.artifactIds);
  pushRepeated(args, '--parent-record-id', input.parentRecordIds);
  pushRepeated(args, '--derived-record-id', input.derivedRecordIds);
  pushRepeated(args, '--candidate-path', input.candidatePaths);
  pushRepeated(args, '--unresolved-point', input.unresolvedPoints);
  pushRepeated(args, '--next-action', input.nextActions);
  if (input.metadata !== undefined) {
    args.push('--metadata-json', JSON.stringify(input.metadata));
  }
  return args;
}

export function buildAitpSourceAssetRegisterArgs(
  input: RegisterAitpSourceAssetInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.topicId, 'topicId');
  requireAllowed(input.assetType, AITP_SOURCE_ASSET_TYPES, 'assetType');
  requireNonEmpty(input.uri, 'uri');
  requireNonEmpty(input.title, 'title');

  const args = [
    '--base',
    input.basePath,
    'asset',
    'register',
    '--topic',
    input.topicId.trim(),
    '--type',
    input.assetType,
    '--uri',
    input.uri.trim(),
    '--title',
    input.title.trim(),
  ];

  pushOptional(args, '--claim', input.claimId);
  pushOptional(args, '--label', input.label);
  pushOptional(args, '--content-hash', input.contentHash);
  pushOptional(args, '--hash-algorithm', input.hashAlgorithm);
  pushOptional(args, '--acquired-at', input.acquiredAt);
  pushOptional(args, '--source-kind', input.sourceKind);
  pushOptional(args, '--summary', input.summary);
  pushRepeated(args, '--source-ref', input.sourceRefs);
  pushRepeated(args, '--artifact-id', input.artifactIds);
  pushRepeated(args, '--code-state-id', input.codeStateIds);
  pushRepeated(args, '--reference-location-id', input.referenceLocationIds);
  pushRepeated(args, '--derived-from', input.derivedFrom);
  if (input.versionAnchor !== undefined) {
    args.push('--version-anchor-json', JSON.stringify(input.versionAnchor));
  }
  if (input.metadata !== undefined) {
    args.push('--metadata-json', JSON.stringify(input.metadata));
  }
  if (input.linkedRecords !== undefined) {
    args.push('--linked-records-json', JSON.stringify(input.linkedRecords));
  }
  return args;
}

export function buildAitpEvidenceRecordArgs(
  input: RecordAitpEvidenceInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.claimId, 'claimId');
  requireNonEmpty(input.evidenceType, 'evidenceType');
  requireNonEmpty(input.status, 'status');
  requireNonEmpty(input.summary, 'summary');
  const args = [
    '--base',
    input.basePath,
    'evidence',
    'record',
    '--topic',
    input.topicId.trim(),
    '--claim',
    input.claimId.trim(),
    '--type',
    input.evidenceType.trim(),
    '--status',
    input.status.trim(),
    '--summary',
    input.summary.trim(),
  ];
  pushRepeated(args, '--supports-output', input.supportsOutputs);
  pushRepeated(args, '--source-ref', input.sourceRefs);
  pushRepeated(args, '--tool-run-id', input.toolRunIds);
  pushRepeated(args, '--validation-result-id', input.validationResultIds);
  pushRepeated(args, '--artifact-id', input.artifactIds);
  return args;
}

export function buildAitpToolRunRecordArgs(
  input: RecordAitpToolRunInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.recipeId, 'recipeId');
  requireNonEmpty(input.toolFamily, 'toolFamily');
  requireNonEmpty(input.toolName, 'toolName');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.claimId, 'claimId');
  const args = [
    '--base',
    input.basePath,
    'tool',
    'run',
    'record',
    '--recipe',
    input.recipeId.trim(),
    '--family',
    input.toolFamily.trim(),
    '--name',
    input.toolName.trim(),
    '--topic',
    input.topicId.trim(),
    '--claim',
    input.claimId.trim(),
  ];
  if (input.inputs !== undefined) args.push('--inputs-json', JSON.stringify(input.inputs));
  if (input.outputs !== undefined) args.push('--outputs-json', JSON.stringify(input.outputs));
  if (input.environment !== undefined) {
    args.push('--environment-json', JSON.stringify(input.environment));
  }
  pushOptional(args, '--evidence-status', input.evidenceStatus);
  pushRepeated(args, '--code-state-id', input.codeStateIds);
  pushRepeated(args, '--artifact-id', input.artifactIds);
  pushRepeated(args, '--source-ref', input.sourceRefs);
  return args;
}

export function buildAitpCodeStateAutoArgs(
  input: CaptureAitpCodeStateAutoInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.worktreePath, 'worktreePath');
  const args = [
    '--base',
    input.basePath,
    'code',
    'state',
    'auto',
    '--worktree-path',
    input.worktreePath.trim(),
  ];
  pushOptional(args, '--repo-id', input.repoId);
  pushOptional(args, '--topic', input.topicId);
  pushOptional(args, '--claim', input.claimId);
  pushOptional(args, '--session', input.sessionId);
  if (input.buildConfig !== undefined) {
    args.push('--build-config-json', JSON.stringify(input.buildConfig));
  }
  if (input.runtimeEnvironment !== undefined) {
    args.push('--runtime-environment-json', JSON.stringify(input.runtimeEnvironment));
  }
  if (input.linkedRecords !== undefined) {
    args.push('--linked-records-json', JSON.stringify(input.linkedRecords));
  }
  pushOptional(args, '--known-divergence', input.knownDivergence);
  if (input.writePatchArtifact === true) args.push('--write-patch-artifact');
  return args;
}

export function buildAitpArtifactAttachArgs(
  input: AttachAitpArtifactInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.claimId, 'claimId');
  requireNonEmpty(input.artifactType, 'artifactType');
  requireNonEmpty(input.uri, 'uri');
  requireNonEmpty(input.summary, 'summary');
  const args = [
    '--base',
    input.basePath,
    'research-state',
    'attach-artifact',
    '--topic',
    input.topicId.trim(),
    '--claim',
    input.claimId.trim(),
    '--type',
    input.artifactType.trim(),
    '--uri',
    input.uri.trim(),
    '--summary',
    input.summary.trim(),
  ];
  if (input.sizeBytes !== undefined) {
    args.push('--size-bytes', String(input.sizeBytes));
  }
  if (input.metadata !== undefined) {
    args.push('--metadata-json', JSON.stringify(input.metadata));
  }
  return args;
}

export function buildAitpReferenceLocationRecordArgs(
  input: RecordAitpReferenceLocationInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.connectorId, 'connectorId');
  requireNonEmpty(input.locationType, 'locationType');
  requireNonEmpty(input.uri, 'uri');
  requireNonEmpty(input.label, 'label');
  const args = [
    '--base',
    input.basePath,
    'reference',
    'location',
    'record',
    '--topic',
    input.topicId.trim(),
    '--connector',
    input.connectorId.trim(),
    '--type',
    input.locationType.trim(),
    '--uri',
    input.uri.trim(),
    '--label',
    input.label.trim(),
  ];
  pushOptional(args, '--claim', input.claimId);
  pushOptional(args, '--source-ref', input.sourceRef);
  pushOptional(args, '--external-id', input.externalId);
  pushOptional(args, '--status', input.status);
  pushOptional(args, '--summary', input.summary);
  if (input.metadata !== undefined) {
    args.push('--metadata-json', JSON.stringify(input.metadata));
  }
  if (input.linkedRecords !== undefined) {
    args.push('--linked-records-json', JSON.stringify(input.linkedRecords));
  }
  return args;
}

export function buildAitpHumanCheckpointRequestArgs(
  input: RequestAitpHumanCheckpointInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.claimId, 'claimId');
  requireNonEmpty(input.reason, 'reason');
  requireNonEmpty(input.requestedBy, 'requestedBy');
  const options = input.options.map((option) => option.trim()).filter((option) => option.length > 0);
  if (options.length === 0) {
    throw new AitpCliBridgeError('AITP checkpoint options are required.');
  }
  const args = [
    '--base',
    input.basePath,
    'checkpoint',
    'request',
    '--topic',
    input.topicId.trim(),
    '--claim',
    input.claimId.trim(),
    '--reason',
    input.reason.trim(),
    '--requested-by',
    input.requestedBy.trim(),
  ];
  pushRepeated(args, '--option', options);
  return args;
}

export function buildAitpTrustPreflightArgs(
  input: PreflightAitpTrustUpdateInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.action, 'action');
  requireNonEmpty(input.sessionId, 'sessionId');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.claimId, 'claimId');
  const args = [
    '--base',
    input.basePath,
    'trust',
    'preflight',
    input.action.trim(),
    '--session',
    input.sessionId.trim(),
    '--topic',
    input.topicId.trim(),
    '--claim',
    input.claimId.trim(),
  ];
  pushOptional(args, '--requested-state', input.requestedState);
  pushOptional(args, '--source-kind', input.sourceKind);
  pushOptional(args, '--source-ref', input.sourceRef);
  pushRepeated(args, '--evidence-ref', input.evidenceRefs);
  pushRepeated(args, '--code-state-id', input.codeStateIds);
  pushOptional(args, '--rationale', input.rationale);
  pushOptional(args, '--request-id', input.requestId);
  return args;
}

export function buildAitpProofObligationCreateArgs(
  input: CreateAitpProofObligationInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.claimId, 'claimId');
  requireNonEmpty(input.statement, 'statement');
  requireNonEmpty(input.obligationType, 'obligationType');
  requireNonEmpty(input.status, 'status');
  requireNonEmpty(input.maturityLevel, 'maturityLevel');
  requireNonEmpty(input.nextAction, 'nextAction');
  const args = [
    '--base',
    input.basePath,
    'research-state',
    'create-proof-obligation',
    '--topic',
    input.topicId.trim(),
    '--claim',
    input.claimId.trim(),
    '--statement',
    input.statement.trim(),
    '--type',
    input.obligationType.trim(),
    '--status',
    input.status.trim(),
    '--maturity-level',
    input.maturityLevel.trim(),
    '--next-action',
    input.nextAction.trim(),
  ];
  pushRepeated(args, '--required-evidence', input.requiredEvidence);
  pushRepeated(args, '--proof-strategy', input.proofStrategy);
  pushRepeated(args, '--failure-mode', input.failureModes);
  pushRepeated(args, '--source-ref', input.sourceRefs);
  pushRepeated(args, '--evidence-ref', input.evidenceRefs);
  pushRepeated(args, '--artifact-id', input.artifactIds);
  return args;
}

export function buildAitpValidationContractCreateArgs(
  input: CreateAitpValidationContractInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.claimId, 'claimId');
  requireNonEmptyList(input.requiredChecks, 'requiredChecks');
  requireNonEmptyList(input.failureModes, 'failureModes');
  requireNonEmptyList(input.requiredEvidenceOutputs, 'requiredEvidenceOutputs');
  const args = [
    '--base',
    input.basePath,
    'validation',
    'contract',
    'create',
    '--topic',
    input.topicId.trim(),
    '--claim',
    input.claimId.trim(),
  ];
  pushRepeated(args, '--required-check', input.requiredChecks);
  pushRepeated(args, '--failure-mode', input.failureModes);
  pushRepeated(args, '--required-output', input.requiredEvidenceOutputs);
  pushRepeated(args, '--recipe-id', input.toolRecipeIds);
  pushRepeated(args, '--executor-id', input.executorIds);
  pushOptional(args, '--validator-role', input.validatorRole);
  return args;
}

export function buildAitpValidationResultRecordArgs(
  input: RecordAitpValidationResultInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.topicId, 'topicId');
  requireNonEmpty(input.claimId, 'claimId');
  requireNonEmpty(input.contractId, 'contractId');
  requireNonEmpty(input.toolRunId, 'toolRunId');
  requireNonEmpty(input.status, 'status');
  requireNonEmpty(input.summary, 'summary');
  const args = [
    '--base',
    input.basePath,
    'validation',
    'result',
    'record',
    '--topic',
    input.topicId.trim(),
    '--claim',
    input.claimId.trim(),
    '--contract',
    input.contractId.trim(),
    '--tool-run',
    input.toolRunId.trim(),
    '--status',
    input.status.trim(),
    '--summary',
    input.summary.trim(),
  ];
  pushRepeated(args, '--checked-output', input.checkedOutputs);
  pushRepeated(args, '--covered-failure-mode', input.coveredFailureModes);
  pushRepeated(args, '--failure-mode', input.failureModesObserved);
  pushRepeated(args, '--evidence-ref', input.evidenceRefs);
  pushRepeated(args, '--artifact-id', input.artifactIds);
  return args;
}

export function buildAitpSourceReconstructionReviewResultRecordArgs(
  input: RecordAitpSourceReconstructionReviewResultInput & { readonly basePath: string },
): readonly string[] {
  requireNonEmpty(input.basePath, 'basePath');
  requireNonEmpty(input.claimId, 'claimId');
  requireNonEmpty(input.status, 'status');
  requireNonEmptyList(input.reviewedComponents, 'reviewedComponents');
  requireNonEmpty(input.summary, 'summary');
  const hasBasis =
    hasNonEmpty(input.basisRefs) ||
    hasNonEmpty(input.evidenceRefs) ||
    hasNonEmpty(input.validationResultIds) ||
    hasNonEmpty(input.referenceLocationIds) ||
    hasNonEmpty(input.objectIds) ||
    hasNonEmpty(input.relationIds);
  if (!hasBasis) {
    throw new AitpCliBridgeError(
      'AITP source reconstruction review result must include at least one basis ref.',
    );
  }
  const args = [
    '--base',
    input.basePath,
    'source',
    'reconstruction-review-result',
    '--claim',
    input.claimId.trim(),
    '--status',
    input.status.trim(),
  ];
  pushRepeated(args, '--reviewed-component', input.reviewedComponents);
  pushRepeated(args, '--basis-ref', input.basisRefs);
  pushRepeated(args, '--evidence-ref', input.evidenceRefs);
  pushRepeated(args, '--validation-result-id', input.validationResultIds);
  pushRepeated(args, '--reference-location-id', input.referenceLocationIds);
  pushRepeated(args, '--object-id', input.objectIds);
  pushRepeated(args, '--relation-id', input.relationIds);
  pushRepeated(args, '--remaining-action', input.remainingActions);
  pushOptional(args, '--reviewer-role', input.reviewerRole);
  args.push('--summary', input.summary.trim());
  return args;
}

class SpawnAitpCommandRunner implements AitpCommandRunner {
  async run(
    command: string,
    args: readonly string[],
    options: AitpCommandRunnerOptions,
  ): Promise<AitpCommandResult> {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, [...args], {
        cwd: options.cwd,
        shell: false,
        stdio: 'pipe',
      });
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      };
    }

    return new Promise<AitpCommandResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timeout =
        options.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              settle({ exitCode: 124, stdout, stderr, timedOut: true });
              killProcess(child);
            }, options.timeoutMs);

      const onAbort = (): void => {
        settle({ exitCode: 130, stdout, stderr });
        killProcess(child);
      };

      const cleanup = (): void => {
        if (timeout !== undefined) clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onAbort);
      };

      const settle = (result: AitpCommandResult): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted === true) {
        onAbort();
        return;
      }

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (error) => {
        settle({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` });
      });
      child.on('close', (code) => {
        settle({ exitCode: code ?? 0, stdout, stderr });
      });
    });
  }
}

function parseExploratoryRecordWriteResult(payload: unknown): AitpExploratoryRecordWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP exploratory record payload must be an object.');
  }
  if (payload['kind'] !== 'exploratory_record') {
    throw new AitpCliBridgeError('AITP exploratory record payload has the wrong kind.');
  }
  const explorationType = stringValue(payload['exploration_type']);
  requireAllowed(explorationType, AITP_EXPLORATION_TYPES, 'exploration_type');
  return {
    ok: payload['ok'] === true,
    kind: 'exploratory_record',
    recordId: requiredPayloadString(payload, 'record_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    explorationType,
    orientationOnly: payload['orientation_only'] === true,
    canUpdateClaimTrust: payload['can_update_claim_trust'] === true,
    raw: payload,
  };
}

function parseSourceAssetWriteResult(payload: unknown): AitpSourceAssetWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP source asset payload must be an object.');
  }
  if (payload['kind'] !== 'source_asset') {
    throw new AitpCliBridgeError('AITP source asset payload has the wrong kind.');
  }
  const assetType = stringValue(payload['asset_type']);
  requireAllowed(assetType, AITP_SOURCE_ASSET_TYPES, 'asset_type');
  return {
    ok: payload['ok'] === true,
    kind: 'source_asset',
    assetId: requiredPayloadString(payload, 'asset_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    assetType,
    orientationOnly: payload['orientation_only'] === true,
    canUpdateClaimTrust: payload['can_update_claim_trust'] === true,
    raw: payload,
  };
}

function parseEvidenceWriteResult(payload: unknown): AitpEvidenceWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP evidence payload must be an object.');
  }
  if (payload['kind'] !== 'evidence') {
    throw new AitpCliBridgeError('AITP evidence payload has the wrong kind.');
  }
  return {
    ok: payload['ok'] === true,
    kind: 'evidence',
    evidenceId: requiredPayloadString(payload, 'evidence_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: requiredPayloadString(payload, 'claim_id'),
    evidenceType: requiredPayloadString(payload, 'evidence_type'),
    status: requiredPayloadString(payload, 'status'),
    raw: payload,
  };
}

function parseToolRunWriteResult(payload: unknown): AitpToolRunWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP tool run payload must be an object.');
  }
  if (payload['kind'] !== 'tool_run') {
    throw new AitpCliBridgeError('AITP tool run payload has the wrong kind.');
  }
  return {
    ok: payload['ok'] === true,
    kind: 'tool_run',
    runId: requiredPayloadString(payload, 'run_id'),
    recipeId: requiredPayloadString(payload, 'recipe_id'),
    toolFamily: requiredPayloadString(payload, 'tool_family'),
    toolName: requiredPayloadString(payload, 'tool_name'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: requiredPayloadString(payload, 'claim_id'),
    evidenceStatus: requiredPayloadString(payload, 'evidence_status'),
    raw: payload,
  };
}

function parseCodeStateWriteResult(payload: unknown): AitpCodeStateWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP code state payload must be an object.');
  }
  if (payload['kind'] !== 'code_state') {
    throw new AitpCliBridgeError('AITP code state payload has the wrong kind.');
  }
  return {
    ok: payload['ok'] === true,
    kind: 'code_state',
    codeStateId: requiredPayloadString(payload, 'code_state_id'),
    repoId: requiredPayloadString(payload, 'repo_id'),
    upstreamRemote: requiredPayloadString(payload, 'upstream_remote'),
    upstreamBranch: requiredPayloadString(payload, 'upstream_branch'),
    upstreamCommit: requiredPayloadString(payload, 'upstream_commit'),
    localBranch: requiredPayloadString(payload, 'local_branch'),
    worktreePath: requiredPayloadString(payload, 'worktree_path'),
    dirty: payload['dirty'] === true,
    patchId: stringValue(payload['patch_id']) ?? '',
    diffHash: stringValue(payload['diff_hash']) ?? '',
    raw: payload,
  };
}

function parseArtifactWriteResult(payload: unknown): AitpArtifactWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP artifact payload must be an object.');
  }
  if (payload['kind'] !== 'artifact') {
    throw new AitpCliBridgeError('AITP artifact payload has the wrong kind.');
  }
  const sizeBytes = Number(payload['size_bytes']);
  const metadata = isRecord(payload['metadata']) ? payload['metadata'] : {};
  return {
    ok: payload['ok'] === true,
    kind: 'artifact',
    artifactId: requiredPayloadString(payload, 'artifact_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: requiredPayloadString(payload, 'claim_id'),
    artifactType: requiredPayloadString(payload, 'artifact_type'),
    uri: requiredPayloadString(payload, 'uri'),
    summary: requiredPayloadString(payload, 'summary'),
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    canUpdateClaimTrust: metadata['can_update_claim_trust'] === true,
    raw: payload,
  };
}

function parseReferenceLocationWriteResult(payload: unknown): AitpReferenceLocationWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP reference location payload must be an object.');
  }
  if (payload['kind'] !== 'reference_location') {
    throw new AitpCliBridgeError('AITP reference location payload has the wrong kind.');
  }
  return {
    ok: payload['ok'] === true,
    kind: 'reference_location',
    locationId: requiredPayloadString(payload, 'location_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: stringValue(payload['claim_id']) ?? '',
    connectorId: requiredPayloadString(payload, 'connector_id'),
    locationType: requiredPayloadString(payload, 'location_type'),
    uri: requiredPayloadString(payload, 'uri'),
    label: requiredPayloadString(payload, 'label'),
    status: requiredPayloadString(payload, 'status'),
    orientationOnly: payload['orientation_only'] === true,
    raw: payload,
  };
}

function parseHumanCheckpointWriteResult(payload: unknown): AitpHumanCheckpointWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP human checkpoint payload must be an object.');
  }
  if (payload['kind'] !== 'human_checkpoint') {
    throw new AitpCliBridgeError('AITP human checkpoint payload has the wrong kind.');
  }
  return {
    ok: payload['ok'] === true,
    kind: 'human_checkpoint',
    checkpointId: requiredPayloadString(payload, 'checkpoint_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: requiredPayloadString(payload, 'claim_id'),
    status: requiredPayloadString(payload, 'status'),
    raw: payload,
  };
}

function parseTrustPreflightWriteResult(payload: unknown): AitpTrustPreflightWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP trust preflight payload must be an object.');
  }
  if (payload['kind'] !== 'trust_update_preflight') {
    throw new AitpCliBridgeError('AITP trust preflight payload has the wrong kind.');
  }
  return {
    ok: payload['ok'] === true,
    kind: 'trust_update_preflight',
    requestId: requiredPayloadString(payload, 'request_id'),
    action: requiredPayloadString(payload, 'action'),
    sessionId: requiredPayloadString(payload, 'session_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: requiredPayloadString(payload, 'claim_id'),
    requestedState: stringValue(payload['requested_state']) ?? '',
    allowed: payload['allowed'] === true,
    mutationAllowedAfterPreflight: payload['mutation_allowed_after_preflight'] === true,
    requiredActions: stringArrayValue(payload['required_actions']),
    evidenceRefs: stringArrayValue(payload['evidence_refs']),
    codeStateIds: stringArrayValue(payload['code_state_ids']),
    preflightToken: requiredPayloadString(payload, 'preflight_token'),
    canUpdateKernelState: payload['can_update_kernel_state'] === true,
    raw: payload,
  };
}

function parseProofObligationWriteResult(payload: unknown): AitpProofObligationWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP proof obligation payload must be an object.');
  }
  if (payload['kind'] !== 'proof_obligation') {
    throw new AitpCliBridgeError('AITP proof obligation payload has the wrong kind.');
  }
  return {
    ok: payload['ok'] === true,
    kind: 'proof_obligation',
    obligationId: requiredPayloadString(payload, 'obligation_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: requiredPayloadString(payload, 'claim_id'),
    status: requiredPayloadString(payload, 'status'),
    canUpdateClaimTrust: payload['can_update_claim_trust'] === true,
    raw: payload,
  };
}

function parseValidationContractWriteResult(payload: unknown): AitpValidationContractWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP validation contract payload must be an object.');
  }
  if (payload['kind'] !== 'validation_contract') {
    throw new AitpCliBridgeError('AITP validation contract payload has the wrong kind.');
  }
  return {
    ok: payload['ok'] === true,
    kind: 'validation_contract',
    contractId: requiredPayloadString(payload, 'contract_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: requiredPayloadString(payload, 'claim_id'),
    status: requiredPayloadString(payload, 'status'),
    raw: payload,
  };
}

function parseValidationResultWriteResult(payload: unknown): AitpValidationResultWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError('AITP validation result payload must be an object.');
  }
  if (payload['kind'] !== 'validation_result') {
    throw new AitpCliBridgeError('AITP validation result payload has the wrong kind.');
  }
  return {
    ok: payload['ok'] === true,
    kind: 'validation_result',
    resultId: requiredPayloadString(payload, 'result_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: requiredPayloadString(payload, 'claim_id'),
    contractId: requiredPayloadString(payload, 'contract_id'),
    toolRunId: requiredPayloadString(payload, 'tool_run_id'),
    status: requiredPayloadString(payload, 'status'),
    raw: payload,
  };
}

function parseSourceReconstructionReviewResultWriteResult(
  payload: unknown,
): AitpSourceReconstructionReviewResultWriteResult {
  if (!isRecord(payload)) {
    throw new AitpCliBridgeError(
      'AITP source reconstruction review result payload must be an object.',
    );
  }
  if (payload['kind'] !== 'source_reconstruction_review_result') {
    throw new AitpCliBridgeError(
      'AITP source reconstruction review result payload has the wrong kind.',
    );
  }
  return {
    ok: payload['ok'] === true,
    kind: 'source_reconstruction_review_result',
    resultId: requiredPayloadString(payload, 'result_id'),
    topicId: requiredPayloadString(payload, 'topic_id'),
    claimId: requiredPayloadString(payload, 'claim_id'),
    status: requiredPayloadString(payload, 'status'),
    canUpdateClaimTrust: payload['can_update_claim_trust'] === true,
    raw: payload,
  };
}

function parseJsonOutput(
  stdout: string,
  details: Pick<AitpCliBridgeError['details'], 'command' | 'args' | 'stderr'>,
): unknown {
  const text = stdout.trim();
  if (text.length === 0) {
    throw new AitpCliBridgeError('AITP command produced no JSON output.', details);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {}
  for (const line of text.split(/\r?\n/g).toReversed()) {
    const candidate = line.trim();
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {}
  }
  throw new AitpCliBridgeError('AITP command output was not valid JSON.', details);
}

function pushOptional(args: string[], flag: string, value: string | undefined): void {
  if (value === undefined) return;
  const trimmed = value.trim();
  if (trimmed.length === 0) return;
  args.push(flag, trimmed);
}

function pushRepeated(args: string[], flag: string, values: readonly string[] | undefined): void {
  if (values === undefined) return;
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) args.push(flag, trimmed);
  }
}

function promptText(prompt: readonly AitpProcessGraphPromptPart[]): readonly string[] {
  return prompt
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text!.trim())
    .filter((text) => text.length > 0);
}

function refValue(values: readonly string[], prefix: string): string | undefined {
  for (const value of values) {
    if (!value.startsWith(prefix)) continue;
    const ref = value.slice(prefix.length).trim();
    if (ref.length > 0) return ref;
  }
  return undefined;
}

function requireNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new AitpCliBridgeError(`AITP ${label} is required.`);
  }
}

function requireNonEmptyList(values: readonly string[], label: string): void {
  if (values.some((value) => value.trim().length > 0)) return;
  throw new AitpCliBridgeError(`AITP ${label} must contain at least one value.`);
}

function hasNonEmpty(values: readonly string[] | undefined): boolean {
  return values !== undefined && values.some((value) => value.trim().length > 0);
}

function requireAllowed<T extends readonly string[]>(
  value: string | undefined,
  allowed: T,
  label: string,
): asserts value is T[number] {
  if (value !== undefined && allowed.includes(value)) return;
  throw new AitpCliBridgeError(
    `AITP ${label} must be one of: ${allowed.join(', ')}.`,
  );
}

function requiredPayloadString(payload: Record<string, unknown>, key: string): string {
  const value = stringValue(payload[key]);
  if (value !== undefined) return value;
  throw new AitpCliBridgeError(`AITP payload is missing "${key}".`);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function killProcess(child: ChildProcessWithoutNullStreams): void {
  try {
    child.kill('SIGTERM');
  } catch {}
}
