import {
  createDefaultAitpCommandRunner,
  inspectAitpRuntime,
  type AitpCommandRunner,
  type AitpCommandResult,
  type AitpRuntimeDoctorReport,
} from '@moonshot-ai/agent-core';
import type { Command } from 'commander';
import { resolve } from 'node:path';

interface WritableLike {
  write(chunk: string): boolean;
}

export interface AitpCommandDeps {
  readonly cwd: () => string;
  readonly stdout: WritableLike;
  readonly stderr: WritableLike;
  readonly exit: (code: number) => never;
  readonly runner: AitpCommandRunner;
  readonly fileExists?: ((path: string) => boolean) | undefined;
}

export interface AitpDoctorOptions {
  readonly base?: string | undefined;
  readonly command?: string | undefined;
  readonly init?: boolean | undefined;
  readonly json?: boolean | undefined;
}

export interface AitpInitOptions {
  readonly base?: string | undefined;
  readonly command?: string | undefined;
  readonly json?: boolean | undefined;
}

export interface AitpInitReport {
  readonly ok: boolean;
  readonly basePath: string;
  readonly workspaceRoot?: string | undefined;
  readonly command: string;
  readonly fallbackUsed?: boolean | undefined;
  readonly resolvedCommand?: string | undefined;
  readonly resolvedCwd?: string | undefined;
  readonly error?: string | undefined;
}

export function registerAitpCommand(parent: Command, deps?: Partial<AitpCommandDeps>): void {
  const aitp = parent
    .command('aitp')
    .description('Manage Hakimi AITP runtime integration.');

  aitp
    .command('init')
    .description('Create or open the canonical .aitp workspace at the selected base path.')
    .option('--base <dir>', 'AITP workspace base path. Defaults to the current working directory.')
    .option('--command <cmd>', 'AITP CLI command. Defaults to aitp-v5.')
    .option('--json', 'Print a JSON report.', false)
    .action(async (options: AitpInitOptions) => {
      await runAitpInitCommand(deps, options);
    });

  aitp
    .command('doctor')
    .description('Check default AITP discovery and CLI fallback readiness.')
    .option('--base <dir>', 'AITP workspace base path. Defaults to the current working directory.')
    .option('--command <cmd>', 'AITP CLI command. Defaults to aitp-v5.')
    .option('--init', 'Create or open the selected .aitp workspace before checking readiness.', false)
    .option('--json', 'Print a JSON report.', false)
    .action(async (options: AitpDoctorOptions) => {
      await runAitpDoctorCommand(deps, options);
    });
}

export async function handleAitpInit(
  deps: Partial<AitpCommandDeps> | undefined,
  options: AitpInitOptions,
): Promise<number> {
  const resolved = resolveDeps(deps);
  const report = await initializeAitpWorkspace(resolved, options);
  const output = options.json === true
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatAitpInitReport(report);
  if (report.ok) {
    resolved.stdout.write(output);
    return 0;
  }
  resolved.stderr.write(output);
  return 1;
}

export async function handleAitpDoctor(
  deps: Partial<AitpCommandDeps> | undefined,
  options: AitpDoctorOptions,
): Promise<number> {
  const resolved = resolveDeps(deps);
  const initReport = options.init === true
    ? await initializeAitpWorkspace(resolved, options)
    : undefined;
  if (initReport !== undefined && !initReport.ok) {
    const output = options.json === true
      ? `${JSON.stringify({ initialization: initReport }, null, 2)}\n`
      : formatAitpInitReport(initReport);
    resolved.stderr.write(output);
    return 1;
  }
  const report = await inspectAitpRuntime({
    basePath: options.base ?? resolved.cwd(),
    command: options.command,
    cwd: resolved.cwd(),
    runner: resolved.runner,
    fileExists: resolved.fileExists,
  });
  const output = options.json === true
    ? `${JSON.stringify(initReport === undefined ? report : { ...report, initialization: initReport }, null, 2)}\n`
    : formatAitpDoctorReport(report, initReport);
  if (report.status === 'ready') {
    resolved.stdout.write(output);
    return 0;
  }
  resolved.stderr.write(output);
  return 1;
}

async function runAitpInitCommand(
  deps: Partial<AitpCommandDeps> | undefined,
  options: AitpInitOptions,
): Promise<void> {
  const resolved = resolveDeps(deps);
  const code = await handleAitpInit(resolved, options);
  if (code !== 0) resolved.exit(code);
}

async function runAitpDoctorCommand(
  deps: Partial<AitpCommandDeps> | undefined,
  options: AitpDoctorOptions,
): Promise<void> {
  const resolved = resolveDeps(deps);
  const code = await handleAitpDoctor(resolved, options);
  if (code !== 0) resolved.exit(code);
}

function resolveDeps(
  deps: Partial<AitpCommandDeps> | AitpCommandDeps | undefined,
): AitpCommandDeps {
  return {
    cwd: deps?.cwd ?? (() => process.cwd()),
    stdout: deps?.stdout ?? process.stdout,
    stderr: deps?.stderr ?? process.stderr,
    exit: deps?.exit ?? ((code) => process.exit(code)),
    runner: deps?.runner ?? createDefaultAitpCommandRunner(),
    fileExists: deps?.fileExists,
  };
}

async function initializeAitpWorkspace(
  resolved: AitpCommandDeps,
  options: AitpInitOptions,
): Promise<AitpInitReport> {
  const basePath = resolve(options.base ?? resolved.cwd());
  const command = options.command ?? 'aitp-v5';
  const result = await resolved.runner.run(command, ['init', basePath], {
    cwd: resolved.cwd(),
    timeoutMs: 10000,
  });
  const baseReport = {
    basePath,
    command,
    fallbackUsed: result.fallbackUsed,
    resolvedCommand: result.resolvedCommand,
    resolvedCwd: result.resolvedCwd,
  };
  if (result.exitCode !== 0) {
    return {
      ...baseReport,
      ok: false,
      error: commandFailureDetail(result),
    };
  }
  const parsed = parseJsonObject(result.stdout);
  if (parsed === undefined) {
    return {
      ...baseReport,
      ok: false,
      error: 'AITP init output could not be parsed as a JSON object.',
    };
  }
  const ok = parsed['ok'] === true;
  const workspaceRoot = optionalString(parsed, 'workspace_root', 'workspaceRoot');
  return {
    ...baseReport,
    ok,
    workspaceRoot,
    error: ok ? undefined : `AITP init returned ok=${String(parsed['ok'])}.`,
  };
}

function formatAitpInitReport(report: AitpInitReport): string {
  return [
    `Hakimi AITP init: ${report.ok ? 'ready' : 'failed'}`,
    '',
    `base: ${report.basePath}`,
    `command: ${report.command}`,
    report.workspaceRoot === undefined ? undefined : `workspace_root: ${report.workspaceRoot}`,
    report.resolvedCommand === undefined ? undefined : `resolved_command: ${report.resolvedCommand}`,
    report.resolvedCwd === undefined ? undefined : `resolved_cwd: ${report.resolvedCwd}`,
    `default_fallback_used: ${report.fallbackUsed === true ? 'yes' : 'no'}`,
    report.error === undefined ? undefined : `error: ${report.error}`,
    '',
  ].filter((line): line is string => line !== undefined).join('\n');
}

function formatAitpDoctorReport(
  report: AitpRuntimeDoctorReport,
  initReport?: AitpInitReport | undefined,
): string {
  return [
    `Hakimi AITP doctor: ${report.status}`,
    '',
    initReport === undefined ? undefined : `initialization: ${initReport.ok ? 'ready' : 'failed'}`,
    initReport?.workspaceRoot === undefined ? undefined : `initialized_workspace_root: ${initReport.workspaceRoot}`,
    initReport === undefined ? undefined : '',
    `base: ${report.basePath}`,
    `command: ${report.command}`,
    report.resolvedCommand === undefined ? undefined : `resolved_command: ${report.resolvedCommand}`,
    report.resolvedCwd === undefined ? undefined : `resolved_cwd: ${report.resolvedCwd}`,
    `default_fallback_used: ${report.fallbackUsed === true ? 'yes' : 'no'}`,
    `canonical_store: ${report.canonicalStore}`,
    `transport: preferred=${report.preferredTransport} fallback=${report.fallbackTransport}`,
    '',
    ...report.checks.flatMap((check) => {
      const lines = [`${check.status.toUpperCase()} ${check.id}  ${check.summary}`];
      if (check.detail !== undefined && check.detail.length > 0) lines.push(`  ${check.detail}`);
      return lines;
    }),
    '',
    'next steps:',
    ...report.nextSteps.map((step) => `- ${step}`),
    '',
  ].filter((line): line is string => line !== undefined).join('\n');
}

function parseJsonObject(text: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Readonly<Record<string, unknown>>;
    }
  } catch {}
  return undefined;
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

function commandFailureDetail(result: AitpCommandResult): string {
  const parts = [`exit_code=${String(result.exitCode)}`];
  if (result.timedOut === true) parts.push('timed_out=true');
  if (result.stderr.trim().length > 0) parts.push(`stderr=${result.stderr.trim()}`);
  if (result.stdout.trim().length > 0) parts.push(`stdout=${result.stdout.trim()}`);
  return parts.join(' ');
}
