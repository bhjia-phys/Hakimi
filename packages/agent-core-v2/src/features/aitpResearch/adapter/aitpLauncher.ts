/**
 * `aitpResearch` domain — AITP CLI launcher: argv-only process spawning.
 *
 * A self-contained launcher that spawns the AITP Python CLI with strict
 * `shell: false`, argv separation, bounded timeout, SIGTERM grace → SIGKILL,
 * stdout/stderr size limits, and Zod-validated transport schemas with
 * per-command allowed exit codes. The Python probe sequence is
 * `python3.13 → 3.12 → 3.11 → python3`, verifying ≥ 3.11 before running the
 * launcher. No shell, no string concat of arguments. Exit code 2 on `check`
 * is an argparse misuse / AITPError envelope (stdout JSON); on other commands
 * it is an AITPError envelope on stdout. Non-success exits first attempt to
 * parse the stdout error envelope, preserving the AITP `code`/`message`/
 * `details` in a coded `AitpResearchError`; if stdout is not JSON, an
 * argparse-style stderr-only fallback is used. Scope-agnostic.
 */

import {
  IHostProcessService,
  type IHostProcess,
} from '#/os/interface/hostProcess';

import { AitpResearchError, AitpResearchErrors } from '../errors';
import type {
  AitpAuthority,
  AitpCheckReport,
  AitpEnterResult,
  AitpEntryKind,
  AitpListResult,
  AitpNoteMode,
  AitpNotePrepareResult,
  AitpNoteSaveResult,
  AitpRecordPrepareResult,
  AitpRecordSaveResult,
  AitpShowResult,
} from '../types';
import {
  parseCheckReport,
  parseEnterResult,
  parseErrorEnvelope,
  parseListResult,
  parseNotePrepareResult,
  parseNoteSaveResult,
  parseRecordPrepareResult,
  parseRecordSaveResult,
  parseShowResult,
} from '../types';

const PYTHON_CANDIDATES = ['python3.13', 'python3.12', 'python3.11', 'python3'];
const MIN_PYTHON_VERSION = [3, 11, 0];
const DEFAULT_TIMEOUT_MS = 30_000;
const SIGTERM_GRACE_MS = 3_000;
const MAX_STDOUT_BYTES = 1_000_000;
const MAX_STDERR_BYTES = 200_000;

type AllowedExits = readonly number[];

interface ScopedResponse {
  readonly schema: string;
  readonly workstream?: string;
}

type ProcessWaitOutcome =
  | { readonly kind: 'exit'; readonly exitCode: number }
  | { readonly kind: 'wait_error'; readonly error: unknown };

type OutputObservation =
  | { readonly kind: 'end' }
  | { readonly kind: 'stream_error'; readonly error: unknown };

interface OutputCapture {
  readonly chunks: Buffer[];
  readonly done: Promise<OutputObservation>;
  dispose(): void;
}

type TerminationReason =
  | { readonly kind: 'timeout' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'output_limit'; readonly stream: 'stdout' | 'stderr'; readonly limitBytes: number };

function assertScopeCorrelation(
  response: ScopedResponse,
  requestedWorkstream: string | undefined,
  globalSchema: string,
  scopedSchema: string,
): void {
  const expectedSchema = requestedWorkstream === undefined ? globalSchema : scopedSchema;
  if (response.schema !== expectedSchema) {
    throw new Error(`expected ${expectedSchema}, received ${response.schema}`);
  }
  if (requestedWorkstream !== undefined && response.workstream !== requestedWorkstream) {
    throw new Error(`expected workstream ${requestedWorkstream}`);
  }
}

function observeOutput(
  stream: IHostProcess['stdout'],
  maxBytes: number,
  onOverflow: () => void,
): OutputCapture {
  const chunks: Buffer[] = [];
  let size = 0;
  let overflowed = false;
  let settled = false;
  let resolveDone!: (observation: OutputObservation) => void;
  const done = new Promise<OutputObservation>((resolve) => {
    resolveDone = resolve;
  });

  const onData = (chunk: string | Uint8Array): void => {
    if (settled || overflowed) return;
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
    if (size + buffer.byteLength > maxBytes) {
      overflowed = true;
      onOverflow();
      return;
    }
    size += buffer.byteLength;
    chunks.push(buffer);
  };
  const onEnd = (): void => {
    finish({ kind: 'end' });
  };
  const onClose = (): void => {
    finish({ kind: 'end' });
  };
  const onError = (error: unknown): void => {
    finish({ kind: 'stream_error', error });
  };
  const cleanup = (): void => {
    stream.off('data', onData);
    stream.off('end', onEnd);
    stream.off('close', onClose);
    stream.off('error', onError);
  };
  const finish = (observation: OutputObservation): void => {
    if (settled) return;
    settled = true;
    cleanup();
    resolveDone(observation);
  };

  stream.on('data', onData);
  stream.once('end', onEnd);
  stream.once('close', onClose);
  stream.once('error', onError);

  return {
    chunks,
    done,
    dispose: () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolveDone({ kind: 'end' });
      } else {
        cleanup();
      }
    },
  };
}

async function disposeProcess(proc: IHostProcess): Promise<void> {
  try {
    await proc.dispose();
  } catch {
  }
}

async function killProcess(proc: IHostProcess, signal: NodeJS.Signals): Promise<void> {
  try {
    await proc.kill(signal);
  } catch {
  }
}

function waitForExitWithin(waitPromise: Promise<ProcessWaitOutcome>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });
  return Promise.race([waitPromise.then(() => true), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

async function terminateProcess(proc: IHostProcess, waitPromise: Promise<ProcessWaitOutcome>): Promise<void> {
  await killProcess(proc, 'SIGTERM');
  const exited = await waitForExitWithin(waitPromise, SIGTERM_GRACE_MS);
  if (!exited) await killProcess(proc, 'SIGKILL');
}

const AITP_NOT_INITIALIZED_CODE = 'not_initialized';

export interface AitpLauncherOptions {
  readonly pythonPath?: string;
  readonly launcherScript: string;
  readonly cwd: string;
  readonly env?: Record<string, string>;
  readonly timeoutMs?: number;
}

export interface AitpLaunchResult<T> {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly data: T;
}

export class AitpLauncher {
  constructor(
    private readonly hostProcess: IHostProcessService,
    private readonly options: AitpLauncherOptions,
  ) {}

  async probePython(options?: { readonly signal?: AbortSignal }): Promise<string | null> {
    for (const candidate of this.options.pythonPath
      ? [this.options.pythonPath]
      : PYTHON_CANDIDATES) {
      try {
        const result = await this.runRaw(candidate, ['-c', 'import sys; print(sys.version_info[:3])'], options?.signal);
        if (result.exitCode !== 0) continue;
        const match = result.stdout.trim().match(/^\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (match === null) continue;
        const major = parseInt(match[1]!, 10);
        const minor = parseInt(match[2]!, 10);
        const patch = parseInt(match[3]!, 10);
        if (this.versionGte([major, minor, patch], MIN_PYTHON_VERSION)) {
          return candidate;
        }
      } catch (error) {
        if (isOperationCancelled(error)) throw error;
        continue;
      }
    }
    return null;
  }

  async enter(workstream?: string, recent?: number, options?: { readonly signal?: AbortSignal }): Promise<AitpLaunchResult<AitpEnterResult>> {
    const args = ['enter', '--json'];
    if (recent !== undefined) args.push('--recent', String(recent));
    if (workstream !== undefined) args.push('--workstream', workstream);
    return this.runValidated(args, [0], (raw) => {
      const result = parseEnterResult(raw);
      assertScopeCorrelation(result, workstream, 'aitp/enter-0.2', 'aitp/enter-0.3');
      return result;
    }, options?.signal);
  }

  async list(
    workstream?: string,
    kind?: AitpEntryKind,
    since?: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AitpLaunchResult<AitpListResult>> {
    const args = ['list', '--json'];
    if (workstream !== undefined) args.push('--workstream', workstream);
    if (kind !== undefined) args.push('--kind', kind);
    if (since !== undefined) args.push('--since', since);
    return this.runValidated(args, [0], (raw) => {
      const result = parseListResult(raw);
      assertScopeCorrelation(result, workstream, 'aitp/list-0.1', 'aitp/list-0.2');
      return result;
    }, options?.signal);
  }

  async show(id: string, options?: { readonly signal?: AbortSignal }): Promise<AitpLaunchResult<AitpShowResult>> {
    return this.runValidated(['show', id, '--json'], [0], parseShowResult, options?.signal);
  }

  async check(workstream?: string, options?: { readonly signal?: AbortSignal }): Promise<AitpLaunchResult<AitpCheckReport>> {
    const args = ['check', '--json'];
    if (workstream !== undefined) args.push('--workstream', workstream);
    return this.runValidated(args, [0, 1], (raw) => {
      const result = parseCheckReport(raw);
      assertScopeCorrelation(result, workstream, 'aitp/check-report-0.1', 'aitp/check-report-0.2');
      return result;
    }, options?.signal);
  }

  async recordPrepare(params: {
    readonly kind: AitpEntryKind;
    readonly authority?: AitpAuthority;
    readonly createdBy?: string;
    readonly idempotencyKey?: string;
    readonly workstreams?: readonly string[];
  }, options?: { readonly signal?: AbortSignal }): Promise<AitpLaunchResult<AitpRecordPrepareResult>> {
    const args = ['record', 'prepare', '--kind', params.kind, '--json'];
    if (params.authority !== undefined) args.push('--authority', params.authority);
    if (params.createdBy !== undefined) args.push('--created-by', params.createdBy);
    if (params.idempotencyKey !== undefined) args.push('--idempotency-key', params.idempotencyKey);
    for (const ws of params.workstreams ?? []) {
      args.push('--workstream', ws);
    }
    return this.runValidated(args, [0], parseRecordPrepareResult, options?.signal);
  }

  async recordSave(params: {
    readonly draftPath: string;
    readonly expectedTopic?: string;
    readonly exactWorkstream?: string;
  }, options?: { readonly signal?: AbortSignal }): Promise<AitpLaunchResult<AitpRecordSaveResult>> {
    const args = ['record', 'save', params.draftPath, '--json'];
    if (params.expectedTopic !== undefined) args.push('--expected-topic', params.expectedTopic);
    if (params.exactWorkstream !== undefined) args.push('--exact-workstream', params.exactWorkstream);
    return this.runValidated(args, [0], parseRecordSaveResult, options?.signal);
  }

  async notePrepare(params: {
    readonly mode: AitpNoteMode;
    readonly title: string;
    readonly createdBy: string;
    readonly workstreams?: readonly string[];
  }, options?: { readonly signal?: AbortSignal }): Promise<AitpLaunchResult<AitpNotePrepareResult>> {
    const args = ['note', 'prepare', '--mode', params.mode, '--title', params.title, '--created-by', params.createdBy, '--json'];
    for (const ws of params.workstreams ?? []) {
      args.push('--workstream', ws);
    }
    return this.runValidated(args, [0], parseNotePrepareResult, options?.signal);
  }

  async noteSave(draftPath: string, options?: { readonly signal?: AbortSignal }): Promise<AitpLaunchResult<AitpNoteSaveResult>> {
    return this.runValidated(['note', 'save', draftPath, '--json'], [0], parseNoteSaveResult, options?.signal);
  }

  private async runValidated<T>(
    args: readonly string[],
    allowedExits: AllowedExits,
    parse: (raw: unknown) => T,
    signal?: AbortSignal,
  ): Promise<AitpLaunchResult<T>> {
    const python = this.options.pythonPath ?? await this.resolvePython(signal);
    const fullArgs = [this.options.launcherScript, ...args];
    const result = await this.runRaw(python, fullArgs, signal);

    if (allowedExits.includes(result.exitCode)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_ADAPTER_CONTRACT_UNKNOWN,
          `AITP returned non-JSON output: ${result.stdout.slice(0, 200)}`,
        );
      }
      let data: T;
      try {
        data = parse(parsed);
      } catch {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_ADAPTER_CONTRACT_UNKNOWN,
          `AITP returned data that failed schema validation: ${result.stdout.slice(0, 200)}`,
        );
      }
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, data };
    }

    throw this.commandFailureError(result, args[0] ?? 'aitp');
  }

  private commandFailureError(
    result: { readonly exitCode: number; readonly stdout: string; readonly stderr: string },
    command: string,
  ): AitpResearchError {
    const envelope = (() => {
      if (result.stdout.trim().length === 0) return null;
      try {
        return parseErrorEnvelope(JSON.parse(result.stdout));
      } catch {
        return null;
      }
    })();
    if (envelope !== null) {
      return new AitpResearchError(
        envelope.code === AITP_NOT_INITIALIZED_CODE
          ? AitpResearchErrors.codes.AITP_ADAPTER_NOT_INITIALIZED
          : AitpResearchErrors.codes.AITP_ADAPTER_COMMAND_FAILED,
        `AITP command "${command}" failed: ${envelope.message} (code: ${envelope.code})`,
        { details: { aitpCode: envelope.code } },
      );
    }

    const stderrSummary = result.stderr.slice(0, 500).trim();
    const message = stderrSummary.length > 0
      ? `AITP command "${command}" failed (exit ${result.exitCode}): ${stderrSummary}`
      : `AITP command "${command}" failed (exit ${result.exitCode})`;
    return new AitpResearchError(
      AitpResearchErrors.codes.AITP_ADAPTER_COMMAND_FAILED,
      message,
    );
  }

  private async resolvePython(signal?: AbortSignal): Promise<string> {
    if (this.options.pythonPath) return this.options.pythonPath;
    const found = await this.probePython({ signal });
    if (found === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_SPAWN_FAILED,
        'No suitable Python 3.11+ found for AITP',
      );
    }
    return found;
  }

  private async runRaw(command: string, args: readonly string[], signal?: AbortSignal): Promise<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }> {
    if (signal?.aborted) throw operationCancelledError();
    const timeoutMs = Math.max(0, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let proc: IHostProcess;
    try {
      proc = await this.hostProcess.spawn(command, args, {
        cwd: this.options.cwd,
        shell: false,
        timeout: timeoutMs,
        env: this.options.env,
        mergeStderr: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_SPAWN_FAILED,
        `Failed to spawn AITP process: ${message}`,
        { cause: error },
      );
    }

    let resolveTermination!: (reason: TerminationReason) => void;
    const termination = new Promise<TerminationReason>((resolve) => {
      resolveTermination = resolve;
    });
    const stdoutCapture = observeOutput(proc.stdout, MAX_STDOUT_BYTES, () => {
      resolveTermination({ kind: 'output_limit', stream: 'stdout', limitBytes: MAX_STDOUT_BYTES });
    });
    const stderrCapture = observeOutput(proc.stderr, MAX_STDERR_BYTES, () => {
      resolveTermination({ kind: 'output_limit', stream: 'stderr', limitBytes: MAX_STDERR_BYTES });
    });
    const waitPromise: Promise<ProcessWaitOutcome> = Promise.resolve()
      .then(() => proc.wait())
      .then(
        (exitCode): ProcessWaitOutcome => ({ kind: 'exit', exitCode }),
        (error): ProcessWaitOutcome => ({ kind: 'wait_error', error }),
      );
    const completed = Promise.all([waitPromise, stdoutCapture.done, stderrCapture.done]).then(
      ([waitResult, stdoutResult, stderrResult]) => {
        if (waitResult.kind === 'wait_error') return waitResult;
        if (stdoutResult.kind === 'stream_error') return stdoutResult;
        if (stderrResult.kind === 'stream_error') return stderrResult;
        return waitResult;
      },
    );
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<TerminationReason>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ kind: 'timeout' });
      }, timeoutMs);
    });
    const onAbort = (): void => {
      resolveTermination({ kind: 'cancelled' });
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    let disposed = false;
    const dispose = async (): Promise<void> => {
      if (disposed) return;
      disposed = true;
      stdoutCapture.dispose();
      stderrCapture.dispose();
      await disposeProcess(proc);
    };

    try {
      const outcome = await Promise.race([completed, timeout, termination]);
      if (outcome.kind === 'wait_error') {
        const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_ADAPTER_SPAWN_FAILED,
          `AITP process failed while waiting: ${message}`,
          { cause: outcome.error },
        );
      }
      if (outcome.kind === 'stream_error') {
        const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_ADAPTER_SPAWN_FAILED,
          `AITP process output stream failed: ${message}`,
          { cause: outcome.error },
        );
      }
      if (outcome.kind === 'exit') {
        return {
          exitCode: outcome.exitCode,
          stdout: Buffer.concat(stdoutCapture.chunks).toString('utf8'),
          stderr: Buffer.concat(stderrCapture.chunks).toString('utf8'),
        };
      }

      await terminateProcess(proc, waitPromise);
      if (outcome.kind === 'timeout') {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_ADAPTER_TIMEOUT,
          `AITP timed out after ${timeoutMs}ms`,
        );
      }
      if (outcome.kind === 'cancelled') throw operationCancelledError();
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_OUTPUT_LIMIT,
        `AITP ${outcome.stream} output exceeded the ${outcome.limitBytes}-byte limit`,
        { details: { stream: outcome.stream, limitBytes: outcome.limitBytes } },
      );
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      await dispose();
    }
  }

  private versionGte(actual: readonly number[], minimum: readonly number[]): boolean {
    for (let i = 0; i < minimum.length; i++) {
      const a = actual[i] ?? 0;
      const m = minimum[i]!;
      if (a > m) return true;
      if (a < m) return false;
    }
    return true;
  }
}

function operationCancelledError(): AitpResearchError {
  return new AitpResearchError(
    AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
    'AITP operation was cancelled before a result could be returned.',
  );
}

function isOperationCancelled(error: unknown): boolean {
  return error instanceof AitpResearchError
    && error.code === AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED;
}

export function isAitpNotInitializedError(error: unknown): boolean {
  return error instanceof AitpResearchError
    && error.details?.['aitpCode'] === AITP_NOT_INITIALIZED_CODE;
}
