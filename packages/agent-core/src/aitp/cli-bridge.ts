import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { compileAitpProcessGraphSlice, type CompileAitpProcessGraphSliceOptions } from './compiler';
import type {
  AitpExplorationStatus,
  AitpExplorationType,
  CompiledAitpProcessGraphSlice,
} from './types';
import { AITP_EXPLORATION_STATUSES, AITP_EXPLORATION_TYPES } from './types';
import type { WorkFrame } from '../research-action';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function killProcess(child: ChildProcessWithoutNullStreams): void {
  try {
    child.kill('SIGTERM');
  } catch {}
}
