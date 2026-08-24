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

import { IHostProcessService, type HostProcessError } from '#/os/interface/hostProcess';

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
const MAX_STDOUT_BYTES = 1_000_000;
const MAX_STDERR_BYTES = 200_000;

type AllowedExits = readonly number[];

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

  async probePython(): Promise<string | null> {
    for (const candidate of this.options.pythonPath
      ? [this.options.pythonPath]
      : PYTHON_CANDIDATES) {
      try {
        const result = await this.runRaw(candidate, ['-c', 'import sys; print(sys.version_info[:3])']);
        if (result.exitCode !== 0) continue;
        const match = result.stdout.match(/\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match === null) continue;
        const major = parseInt(match[1]!, 10);
        const minor = parseInt(match[2]!, 10);
        const patch = parseInt(match[3]!, 10);
        if (this.versionGte([major, minor, patch], MIN_PYTHON_VERSION)) {
          return candidate;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  async enter(workstream?: string, recent?: number): Promise<AitpLaunchResult<AitpEnterResult>> {
    const args = ['enter', '--json'];
    if (recent !== undefined) args.push('--recent', String(recent));
    if (workstream !== undefined) args.push('--workstream', workstream);
    return this.runValidated(args, [0], parseEnterResult);
  }

  async list(
    workstream?: string,
    kind?: AitpEntryKind,
    since?: string,
  ): Promise<AitpLaunchResult<AitpListResult>> {
    const args = ['list', '--json'];
    if (workstream !== undefined) args.push('--workstream', workstream);
    if (kind !== undefined) args.push('--kind', kind);
    if (since !== undefined) args.push('--since', since);
    return this.runValidated(args, [0], parseListResult);
  }

  async show(id: string): Promise<AitpLaunchResult<AitpShowResult>> {
    return this.runValidated(['show', id, '--json'], [0], parseShowResult);
  }

  async check(workstream?: string): Promise<AitpLaunchResult<AitpCheckReport>> {
    const args = ['check', '--json'];
    if (workstream !== undefined) args.push('--workstream', workstream);
    return this.runValidated(args, [0, 1], parseCheckReport);
  }

  async recordPrepare(params: {
    readonly kind: AitpEntryKind;
    readonly authority?: AitpAuthority;
    readonly createdBy?: string;
    readonly idempotencyKey?: string;
    readonly workstreams?: readonly string[];
  }): Promise<AitpLaunchResult<AitpRecordPrepareResult>> {
    const args = ['record', 'prepare', '--kind', params.kind, '--json'];
    if (params.authority !== undefined) args.push('--authority', params.authority);
    if (params.createdBy !== undefined) args.push('--created-by', params.createdBy);
    if (params.idempotencyKey !== undefined) args.push('--idempotency-key', params.idempotencyKey);
    for (const ws of params.workstreams ?? []) {
      args.push('--workstream', ws);
    }
    return this.runValidated(args, [0], parseRecordPrepareResult);
  }

  async recordSave(draftPath: string): Promise<AitpLaunchResult<AitpRecordSaveResult>> {
    return this.runValidated(['record', 'save', draftPath, '--json'], [0], parseRecordSaveResult);
  }

  async notePrepare(params: {
    readonly mode: AitpNoteMode;
    readonly title: string;
    readonly createdBy: string;
    readonly workstreams?: readonly string[];
  }): Promise<AitpLaunchResult<AitpNotePrepareResult>> {
    const args = ['note', 'prepare', '--mode', params.mode, '--title', params.title, '--created-by', params.createdBy, '--json'];
    for (const ws of params.workstreams ?? []) {
      args.push('--workstream', ws);
    }
    return this.runValidated(args, [0], parseNotePrepareResult);
  }

  async noteSave(draftPath: string): Promise<AitpLaunchResult<AitpNoteSaveResult>> {
    return this.runValidated(['note', 'save', draftPath, '--json'], [0], parseNoteSaveResult);
  }

  private async runValidated<T>(
    args: readonly string[],
    allowedExits: AllowedExits,
    parse: (raw: unknown) => T,
  ): Promise<AitpLaunchResult<T>> {
    const python = await this.resolvePython();
    const fullArgs = [this.options.launcherScript, ...args];
    const result = await this.runRaw(python, fullArgs);

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

  private async resolvePython(): Promise<string> {
    if (this.options.pythonPath) return this.options.pythonPath;
    const found = await this.probePython();
    if (found === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_SPAWN_FAILED,
        'No suitable Python 3.11+ found for AITP',
      );
    }
    return found;
  }

  private async runRaw(command: string, args: readonly string[]): Promise<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let proc;
    try {
      proc = await this.hostProcess.spawn(command, args, {
        cwd: this.options.cwd,
        shell: false,
        timeout: timeoutMs,
        env: this.options.env,
        mergeStderr: false,
      });
    } catch (error) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_SPAWN_FAILED,
        `Failed to spawn AITP process: ${(error as HostProcessError).message}`,
      );
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let timedOut = false;

    proc.stdout.on('data', (chunk: Buffer) => {
      if (stdoutSize >= MAX_STDOUT_BYTES) return;
      stdoutSize += chunk.length;
      stdoutChunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      if (stderrSize >= MAX_STDERR_BYTES) return;
      stderrSize += chunk.length;
      stderrChunks.push(chunk);
    });

    const exitPromise = proc.wait();

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        void proc.kill('SIGTERM').then(() => {
          setTimeout(() => {
            void proc.kill('SIGKILL').catch(() => {});
          }, 3_000);
        });
        reject(new AitpResearchError(AitpResearchErrors.codes.AITP_ADAPTER_TIMEOUT, `AITP timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      void exitPromise.finally(() => {
        clearTimeout(timer);
      });
    });

    let exitCode: number;
    try {
      exitCode = await Promise.race([exitPromise, timeoutPromise]);
    } catch (error) {
      await Promise.resolve().then(() => proc.dispose()).catch(() => undefined);
      throw error;
    }

    await Promise.resolve().then(() => proc.dispose()).catch(() => undefined);

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    const stderr = Buffer.concat(stderrChunks).toString('utf8');

    if (timedOut) {
      throw new AitpResearchError(AitpResearchErrors.codes.AITP_ADAPTER_TIMEOUT, `AITP timed out after ${timeoutMs}ms`);
    }

    return { exitCode, stdout, stderr };
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

export function isAitpNotInitializedError(error: unknown): boolean {
  return error instanceof AitpResearchError
    && error.details?.['aitpCode'] === AITP_NOT_INITIALIZED_CODE;
}
