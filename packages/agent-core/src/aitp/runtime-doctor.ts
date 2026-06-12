import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { DEFAULT_AITP_COMMAND } from './cli-bridge';
import { parseAitpRuntimePayloadProfilesCatalog } from './runtime-payload-profiles';
import type { AitpCommandRunner, AitpCommandResult } from './cli-bridge';

export const DEFAULT_AITP_DOCTOR_TIMEOUT_MS = 5000;

export type AitpRuntimeDoctorStatus = 'ready' | 'degraded' | 'missing';

export interface AitpRuntimeDoctorOptions {
  readonly basePath: string;
  readonly command?: string | undefined;
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly runner?: AitpCommandRunner | undefined;
  readonly fileExists?: ((path: string) => boolean) | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpRuntimeDoctorCheck {
  readonly id: string;
  readonly status: 'ok' | 'warn' | 'error';
  readonly summary: string;
  readonly detail?: string | undefined;
}

export interface AitpRuntimeDoctorReport {
  readonly status: AitpRuntimeDoctorStatus;
  readonly basePath: string;
  readonly command: string;
  readonly preferredTransport: 'mcp';
  readonly fallbackTransport: 'cli';
  readonly canonicalStore: '.aitp';
  readonly checks: readonly AitpRuntimeDoctorCheck[];
  readonly nextSteps: readonly string[];
  readonly payloadProfilesReadable: boolean;
  readonly profileCount?: number | undefined;
  readonly fallbackUsed?: boolean | undefined;
  readonly resolvedCommand?: string | undefined;
  readonly resolvedCwd?: string | undefined;
  readonly rawPayloadProfilesResult?: AitpCommandResult | undefined;
}

export async function inspectAitpRuntime(
  options: AitpRuntimeDoctorOptions,
): Promise<AitpRuntimeDoctorReport> {
  const command = options.command ?? DEFAULT_AITP_COMMAND;
  const basePath = resolve(options.basePath);
  const fileExists = options.fileExists ?? existsSync;
  const checks: AitpRuntimeDoctorCheck[] = [];

  const aitpDir = resolve(basePath, '.aitp');
  if (fileExists(aitpDir)) {
    checks.push({
      id: 'canonical-store',
      status: 'ok',
      summary: '.aitp canonical store is present',
      detail: aitpDir,
    });
  } else {
    checks.push({
      id: 'canonical-store',
      status: 'warn',
      summary: '.aitp canonical store was not found at the selected base path',
      detail: aitpDir,
    });
  }

  if (options.runner === undefined) {
    checks.push({
      id: 'cli-runner',
      status: 'warn',
      summary: 'No AITP command runner was provided for runtime probing',
      detail: 'Hakimi sessions can still use MCP-first wiring, but this doctor call cannot verify CLI fallback.',
    });
    return finalizeReport({
      basePath,
      command,
      checks,
      payloadProfilesReadable: false,
      rawPayloadProfilesResult: undefined,
    });
  }

  const result = await options.runner.run(command, ['adapter', 'payload-profiles'], {
    cwd: options.cwd ?? basePath,
    timeoutMs: options.timeoutMs ?? DEFAULT_AITP_DOCTOR_TIMEOUT_MS,
    signal: options.signal,
  });

  if (result.exitCode !== 0) {
    checks.push({
      id: 'payload-profiles',
      status: 'error',
      summary: 'AITP payload profile read failed',
      detail: commandFailureDetail(result),
    });
    return finalizeReport({
      basePath,
      command,
      checks,
      payloadProfilesReadable: false,
      rawPayloadProfilesResult: result,
    });
  }

  try {
    const parsed: unknown = JSON.parse(result.stdout);
    const catalog = parseAitpRuntimePayloadProfilesCatalog(parsed);
    checks.push({
      id: 'payload-profiles',
      status: 'ok',
      summary: 'AITP runtime payload profiles are readable',
      detail: payloadProfileDetail(catalog.profileCount, result),
    });
    return finalizeReport({
      basePath,
      command,
      checks,
      payloadProfilesReadable: true,
      profileCount: catalog.profileCount,
      rawPayloadProfilesResult: result,
    });
  } catch (error) {
    checks.push({
      id: 'payload-profiles',
      status: 'error',
      summary: 'AITP payload profile output could not be parsed',
      detail: error instanceof Error ? error.message : String(error),
    });
    return finalizeReport({
      basePath,
      command,
      checks,
      payloadProfilesReadable: false,
      rawPayloadProfilesResult: result,
    });
  }
}

function finalizeReport(input: {
  readonly basePath: string;
  readonly command: string;
  readonly checks: readonly AitpRuntimeDoctorCheck[];
  readonly payloadProfilesReadable: boolean;
  readonly profileCount?: number | undefined;
  readonly rawPayloadProfilesResult: AitpCommandResult | undefined;
}): AitpRuntimeDoctorReport {
  const hasError = input.checks.some((check) => check.status === 'error');
  const hasWarn = input.checks.some((check) => check.status === 'warn');
  const status: AitpRuntimeDoctorStatus =
    hasError ? 'missing' : hasWarn ? 'degraded' : 'ready';
  return {
    status,
    basePath: input.basePath,
    command: input.command,
    preferredTransport: 'mcp',
    fallbackTransport: 'cli',
    canonicalStore: '.aitp',
    checks: input.checks,
    nextSteps: nextStepsForStatus(status),
    payloadProfilesReadable: input.payloadProfilesReadable,
    profileCount: input.profileCount,
    fallbackUsed: input.rawPayloadProfilesResult?.fallbackUsed,
    resolvedCommand: input.rawPayloadProfilesResult?.resolvedCommand,
    resolvedCwd: input.rawPayloadProfilesResult?.resolvedCwd,
    rawPayloadProfilesResult: input.rawPayloadProfilesResult,
  };
}

function payloadProfileDetail(profileCount: number, result: AitpCommandResult): string {
  const parts = [`${String(profileCount)} profiles`];
  if (result.fallbackUsed === true) parts.push('default fallback used');
  if (result.resolvedCommand !== undefined) parts.push(`command=${result.resolvedCommand}`);
  if (result.resolvedCwd !== undefined) parts.push(`cwd=${result.resolvedCwd}`);
  return parts.join('; ');
}

function nextStepsForStatus(status: AitpRuntimeDoctorStatus): readonly string[] {
  if (status === 'ready') {
    return [
      'Use ResearchAction.inspect_aitp_runtime_payload_profiles before write planning.',
      'Use ResearchAction.draft_aitp_write_bridge_call before execute_aitp_write_bridge.',
    ];
  }
  if (status === 'degraded') {
    return [
      'Check that the selected --base points at the intended AITP workspace.',
      'Run the same command from a Hakimi session to verify MCP-first behavior.',
    ];
  }
  return [
    'Install or expose the aitp-v5 command for Hakimi CLI fallback.',
    'Check that the selected --base contains the intended AITP project state.',
  ];
}

function commandFailureDetail(result: AitpCommandResult): string {
  const parts = [`exit_code=${String(result.exitCode)}`];
  if (result.timedOut === true) parts.push('timed_out=true');
  if (result.stderr.trim().length > 0) parts.push(`stderr=${result.stderr.trim()}`);
  if (result.stdout.trim().length > 0) parts.push(`stdout=${result.stdout.trim()}`);
  return parts.join(' ');
}
