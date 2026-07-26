import { cp, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { normalizeWorkDir, SessionStore } from '@moonshot-ai/agent-core/session/store';
import type { Command } from 'commander';

interface ImportedSession {
  readonly id: string;
  readonly sourceDir: string;
  readonly workDir: string;
  readonly updatedAt: number;
}

interface ImportPlan extends ImportedSession {
  readonly targetDir: string;
  readonly exists: boolean;
}

export interface ImportKimiSessionsOptions {
  readonly sourceHome: string;
  readonly targetHome: string;
  readonly sessionId?: string | undefined;
  readonly dryRun?: boolean | undefined;
}

export interface ImportKimiSessionsResult {
  readonly sourceHome: string;
  readonly targetHome: string;
  readonly selected: readonly ImportedSession[];
  readonly copied: number;
  readonly preserved: number;
  readonly dryRun: boolean;
  readonly reindex?: {
    readonly scanned: number;
    readonly added: number;
    readonly repaired: number;
  };
}

/**
 * Fork Kimi Code sessions into an isolated Hakimi home.
 *
 * Only individual session directories are copied. Provider config, OAuth
 * tokens, logs, caches, and every other source-home file stay untouched.
 */
export async function importKimiSessions(
  options: ImportKimiSessionsOptions,
): Promise<ImportKimiSessionsResult> {
  const sourceHome = resolve(options.sourceHome);
  const targetHome = resolve(options.targetHome);
  assertSeparateHomes(sourceHome, targetHome);

  const sourceSessionsDir = join(sourceHome, 'sessions');
  const discovered = await discoverSessions(sourceSessionsDir);
  const selected =
    options.sessionId === undefined
      ? discovered
      : discovered.filter((session) => session.id === options.sessionId);
  if (selected.length === 0) {
    throw new Error(
      options.sessionId === undefined
        ? `No current-format sessions were found under ${sourceSessionsDir}`
        : `Session "${options.sessionId}" was not found under ${sourceSessionsDir}`,
    );
  }
  assertUniqueSessionIds(selected);

  const targetStore = new SessionStore(targetHome);
  const targetPathsById = await discoverSessionPaths(join(targetHome, 'sessions'));
  const plans: ImportPlan[] = [];
  for (const session of selected) {
    const targetDir = targetStore.sessionDirFor({
      id: session.id,
      workDir: session.workDir,
    });
    const existingPaths = targetPathsById.get(session.id) ?? [];
    if (existingPaths.length > 1 || (existingPaths[0] !== undefined && !samePath(existingPaths[0], targetDir))) {
      throw new Error(
        `Session "${session.id}" already exists at a different location in the Hakimi home.`,
      );
    }
    const targetExists = existingPaths.length === 1 || (await pathExists(targetDir));
    if (targetExists) {
      const existing = await readSession(targetDir);
      if (existing === undefined || !sameWorkDir(existing.workDir, session.workDir)) {
        throw new Error(`Refusing to replace incompatible existing session: ${targetDir}`);
      }
    }
    plans.push({ ...session, targetDir, exists: targetExists });
  }

  if (options.dryRun === true) {
    return {
      sourceHome,
      targetHome,
      selected,
      copied: plans.filter((plan) => !plan.exists).length,
      preserved: plans.filter((plan) => plan.exists).length,
      dryRun: true,
    };
  }

  let copied = 0;
  let preserved = 0;
  for (const plan of plans) {
    if (plan.exists) {
      preserved += 1;
      continue;
    }
    await mkdir(dirname(plan.targetDir), { recursive: true, mode: 0o700 });
    await cp(plan.sourceDir, plan.targetDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });
    copied += 1;
  }

  const reindex = await targetStore.reindex();
  return {
    sourceHome,
    targetHome,
    selected,
    copied,
    preserved,
    dryRun: false,
    reindex,
  };
}

export function registerSessionCommand(parent: Command): void {
  const session = parent.command('session').description('Manage Hakimi sessions.');
  session
    .command('import-kimi')
    .description('Copy Kimi Code sessions into an isolated Hakimi home.')
    .option(
      '--source-home <path>',
      'Kimi Code home.',
      process.env['KIMI_CODE_HOME'] ?? join(homedir(), '.kimi-code'),
    )
    .option(
      '--target-home <path>',
      'Hakimi home.',
      process.env['HAKIMI_HOME'] ?? join(homedir(), '.hakimi'),
    )
    .option('--session-id <id>', 'Import only one session id.')
    .option('--dry-run', 'Inspect the import without copying anything.', false)
    .action(
      async (options: {
        sourceHome: string;
        targetHome: string;
        sessionId?: string;
        dryRun?: boolean;
      }) => {
        try {
          const result = await importKimiSessions({
            sourceHome: options.sourceHome,
            targetHome: options.targetHome,
            sessionId: options.sessionId,
            dryRun: options.dryRun === true,
          });
          printImportResult(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          process.stderr.write(`Session import failed: ${message}\n`);
          process.exitCode = 1;
        }
      },
    );
}

function printImportResult(result: ImportKimiSessionsResult): void {
  process.stdout.write(`Source: ${result.sourceHome}\nTarget: ${result.targetHome}\n`);
  process.stdout.write(`Selected sessions: ${result.selected.length}\n`);
  if (result.dryRun) {
    process.stdout.write(
      `Dry run: ${result.copied} would be copied; ${result.preserved} already imported.\n`,
    );
  } else {
    process.stdout.write(`Copied: ${result.copied}; already imported: ${result.preserved}\n`);
  }
  for (const imported of result.selected.slice(0, 10)) {
    process.stdout.write(`  ${resumeCommand(imported, result.targetHome)}\n`);
  }
  if (result.selected.length > 10) {
    process.stdout.write(`  ... ${result.selected.length - 10} more\n`);
  }
}

async function discoverSessions(sessionsDir: string): Promise<ImportedSession[]> {
  let buckets;
  try {
    buckets = await readdir(sessionsDir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Kimi Code sessions directory was not found: ${sessionsDir}`, {
      cause: error,
    });
  }

  const sessions: ImportedSession[] = [];
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const bucketDir = join(sessionsDir, bucket.name);
    let entries;
    try {
      entries = await readdir(bucketDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const imported = await readSession(join(bucketDir, entry.name));
      if (imported !== undefined) sessions.push(imported);
    }
  }
  sessions.sort((left, right) => right.updatedAt - left.updatedAt);
  return sessions;
}

async function readSession(sessionDir: string): Promise<ImportedSession | undefined> {
  let state: unknown;
  try {
    state = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf8')) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(state)) return undefined;
  const custom = isRecord(state['custom']) ? state['custom'] : undefined;
  const rawWorkDir =
    typeof state['workDir'] === 'string'
      ? state['workDir']
      : typeof custom?.['cwd'] === 'string'
        ? custom['cwd']
        : undefined;
  if (rawWorkDir === undefined || rawWorkDir.trim().length === 0) return undefined;

  let workDir: string;
  try {
    workDir = normalizeWorkDir(rawWorkDir);
  } catch {
    return undefined;
  }
  const info = await stat(sessionDir);
  return {
    id: basename(sessionDir),
    sourceDir: sessionDir,
    workDir,
    updatedAt: info.mtimeMs,
  };
}

async function discoverSessionPaths(sessionsDir: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  let buckets;
  try {
    buckets = await readdir(sessionsDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return out;
    throw error;
  }
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const bucketDir = join(sessionsDir, bucket.name);
    let entries;
    try {
      entries = await readdir(bucketDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const paths = out.get(entry.name) ?? [];
      paths.push(join(bucketDir, entry.name));
      out.set(entry.name, paths);
    }
  }
  return out;
}

function assertSeparateHomes(sourceHome: string, targetHome: string): void {
  if (
    samePath(sourceHome, targetHome) ||
    pathContains(sourceHome, targetHome) ||
    pathContains(targetHome, sourceHome)
  ) {
    throw new Error('Source and target homes must be separate, non-nested directories.');
  }
}

function assertUniqueSessionIds(sessions: readonly ImportedSession[]): void {
  const seen = new Set<string>();
  for (const session of sessions) {
    if (seen.has(session.id)) {
      throw new Error(`Kimi Code contains more than one session named "${session.id}".`);
    }
    seen.add(session.id);
  }
}

function pathContains(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function sameWorkDir(left: string, right: string): boolean {
  const a = normalizeWorkDir(left);
  const b = normalizeWorkDir(right);
  return /^[A-Za-z]:\//.test(a) || a.startsWith('//')
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isMissingPathError(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function resumeCommand(session: ImportedSession, targetHome: string): string {
  if (process.platform === 'win32') {
    return [
      `$env:HAKIMI_HOME=${powershellQuote(targetHome)};`,
      `Set-Location -LiteralPath ${powershellQuote(session.workDir)};`,
      `hakimi --session ${powershellQuote(session.id)} --model openai-codex/gpt-5.5`,
    ].join(' ');
  }
  return `cd ${shellQuote(session.workDir)} && HAKIMI_HOME=${shellQuote(targetHome)} hakimi --session ${shellQuote(session.id)} --model openai-codex/gpt-5.5`;
}
