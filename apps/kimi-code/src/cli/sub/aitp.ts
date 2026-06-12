import {
  createDefaultAitpCommandRunner,
  inspectAitpRuntime,
  type AitpCommandRunner,
  type AitpRuntimeDoctorReport,
} from '@moonshot-ai/agent-core';
import type { Command } from 'commander';

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
  readonly json?: boolean | undefined;
}

export function registerAitpCommand(parent: Command, deps?: Partial<AitpCommandDeps>): void {
  const aitp = parent
    .command('aitp')
    .description('Inspect Hakimi AITP runtime integration.');

  aitp
    .command('doctor')
    .description('Check default AITP discovery and CLI fallback readiness.')
    .option('--base <dir>', 'AITP workspace base path. Defaults to the current working directory.')
    .option('--command <cmd>', 'AITP CLI command. Defaults to aitp-v5.')
    .option('--json', 'Print a JSON report.', false)
    .action(async (options: AitpDoctorOptions) => {
      await runAitpDoctorCommand(deps, options);
    });
}

export async function handleAitpDoctor(
  deps: Partial<AitpCommandDeps> | undefined,
  options: AitpDoctorOptions,
): Promise<number> {
  const resolved = resolveDeps(deps);
  const report = await inspectAitpRuntime({
    basePath: options.base ?? resolved.cwd(),
    command: options.command,
    cwd: resolved.cwd(),
    runner: resolved.runner,
    fileExists: resolved.fileExists,
  });
  const output = options.json === true
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatAitpDoctorReport(report);
  if (report.status === 'ready') {
    resolved.stdout.write(output);
    return 0;
  }
  resolved.stderr.write(output);
  return 1;
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

function formatAitpDoctorReport(report: AitpRuntimeDoctorReport): string {
  return [
    `Hakimi AITP doctor: ${report.status}`,
    '',
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
