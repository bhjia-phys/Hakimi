import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path, { delimiter } from 'node:path';

import type { McpServerConfig } from '../config';
import type { SessionMcpConfig } from '../mcp';

const DEFAULT_AITP_MCP_SERVER_NAME = 'aitp';
const DEFAULT_AITP_REMOTE_URL = 'https://github.com/bhjia-phys/AITP-Research-Protocol.git';
const DEFAULT_SKILL_FILES = ['using-aitp.md', 'aitp-runtime.md'] as const;
const DEFAULT_GIT_TIMEOUT_MS = 15_000;
const DEFAULT_UV_COMMAND = 'uv';

export interface DefaultAitpRuntime {
  readonly repoPath: string;
  readonly topicsRoot: string;
  readonly targetRoot: string;
  readonly skillDir?: string;
  readonly remoteSync: DefaultAitpRemoteSyncResult;
  readonly mcpServerName: string;
  readonly mcpServer: McpServerConfig;
}

export type DefaultAitpRemoteSyncStatus =
  | 'disabled'
  | 'cloned'
  | 'updated'
  | 'skipped_dirty'
  | 'skipped_unmanaged'
  | 'skipped_unavailable';

export interface DefaultAitpRemoteSyncResult {
  readonly status: DefaultAitpRemoteSyncStatus;
  readonly remoteUrl?: string;
}

export interface ResolveDefaultAitpRuntimeOptions {
  readonly workDir: string;
  readonly homeDir: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly mcpServerName?: string;
  readonly readText?: (filePath: string) => Promise<string>;
  readonly writeText?: (filePath: string, content: string) => Promise<void>;
  readonly mkdir?: (dirPath: string) => Promise<void>;
  readonly isFile?: (filePath: string) => Promise<boolean>;
  readonly isDir?: (dirPath: string) => Promise<boolean>;
  readonly runGit?: (args: readonly string[], options: AitpGitRunOptions) => Promise<AitpGitRunResult>;
}

export interface AitpGitRunOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

export interface AitpGitRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
}

export async function resolveDefaultAitpRuntime(
  options: ResolveDefaultAitpRuntimeOptions,
): Promise<DefaultAitpRuntime | undefined> {
  const env = options.env ?? process.env;
  if (isTruthyEnv(env['HAKIMI_AITP_DEFAULT_DISABLED'])) return undefined;

  const isFile = options.isFile ?? defaultIsFile;
  const isDir = options.isDir ?? defaultIsDir;
  const runGit = options.runGit ?? runGitCommand;
  const remoteUrl = nonEmpty(env['HAKIMI_AITP_REMOTE'])
    ?? nonEmpty(env['AITP_REMOTE_URL'])
    ?? DEFAULT_AITP_REMOTE_URL;
  const prepared = await prepareDefaultAitpRepoPath({
    workDir: options.workDir,
    homeDir: options.homeDir,
    env,
    remoteUrl,
    isFile,
    isDir,
    mkdir: options.mkdir,
    runGit,
  });
  if (prepared === undefined) return undefined;
  const { repoPath, remoteSync } = prepared;

  const topicsRoot = await resolveDefaultAitpTopicsRoot({
    workDir: options.workDir,
    env,
    isDir,
  });
  const targetRoot = inferDefaultAitpTargetRoot(options.workDir, topicsRoot);
  const skillDir = await renderDefaultAitpSkills({
    repoPath,
    topicsRoot,
    targetRoot,
    homeDir: options.homeDir,
    readText: options.readText,
    writeText: options.writeText,
    mkdir: options.mkdir,
    isFile,
    isDir,
  }).catch(() => undefined);
  const mcpServerName = nonEmpty(env['HAKIMI_AITP_MCP_SERVER_NAME'])
    ?? options.mcpServerName
    ?? DEFAULT_AITP_MCP_SERVER_NAME;

  return {
    repoPath,
    topicsRoot,
    targetRoot,
    skillDir,
    remoteSync,
    mcpServerName,
    mcpServer: buildDefaultAitpMcpServer({
      repoPath,
      topicsRoot,
      env,
    }),
  };
}

export function mergeDefaultAitpMcpConfig(
  base: SessionMcpConfig | undefined,
  runtime: DefaultAitpRuntime | undefined,
): SessionMcpConfig | undefined {
  if (runtime === undefined) return base;
  if (base?.servers[runtime.mcpServerName] !== undefined) return base;
  return {
    servers: {
      ...base?.servers,
      [runtime.mcpServerName]: runtime.mcpServer,
    },
  };
}

export function buildDefaultAitpMcpServer(input: {
  readonly repoPath: string;
  readonly topicsRoot: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): McpServerConfig {
  const env = input.env ?? process.env;
  const command =
    nonEmpty(env['HAKIMI_AITP_MCP_COMMAND'])
    ?? nonEmpty(env['AITP_UV_COMMAND'])
    ?? DEFAULT_UV_COMMAND;
  const nativeMcpPath = path.join(input.repoPath, 'brain', 'v5', 'native_mcp.py');
  const args = isPythonCommand(command)
    ? [nativeMcpPath]
    : [
        'run',
        '--with',
        'pyyaml',
        '--with',
        'jsonschema',
        '--with',
        'fastmcp',
        'python',
        nativeMcpPath,
      ];

  return {
    transport: 'stdio',
    command,
    args,
    cwd: input.repoPath,
    env: {
      PYTHONPATH: joinPathEnv(input.repoPath, env['PYTHONPATH']),
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      AITP_REPO_ROOT: input.repoPath,
      HAKIMI_AITP_REPO: input.repoPath,
      AITP_TOPICS_ROOT: input.topicsRoot,
    },
    startupTimeoutMs: 30_000,
  };
}

async function prepareDefaultAitpRepoPath(input: {
  readonly workDir: string;
  readonly homeDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly remoteUrl: string;
  readonly isFile: (filePath: string) => Promise<boolean>;
  readonly isDir: (dirPath: string) => Promise<boolean>;
  readonly mkdir?: (dirPath: string) => Promise<void>;
  readonly runGit: (args: readonly string[], options: AitpGitRunOptions) => Promise<AitpGitRunResult>;
}): Promise<{ readonly repoPath: string; readonly remoteSync: DefaultAitpRemoteSyncResult } | undefined> {
  if (isTruthyEnv(input.env['HAKIMI_AITP_REMOTE_UPDATE_DISABLED'])) {
    const repoPath = await resolveLocalAitpRepoPath(input);
    return repoPath === undefined
      ? undefined
      : { repoPath, remoteSync: { status: 'disabled' } };
  }

  for (const key of ['HAKIMI_AITP_REPO', 'AITP_REPO_ROOT', 'AITP_V5_REPO']) {
    const explicit = nonEmpty(input.env[key]);
    if (explicit === undefined) continue;
    const prepared = await syncOrCloneAitpRepo({
      repoPath: path.resolve(explicit),
      remoteUrl: input.remoteUrl,
      managed: false,
      isFile: input.isFile,
      isDir: input.isDir,
      mkdir: input.mkdir,
      runGit: input.runGit,
    });
    if (prepared !== undefined) return prepared;
  }

  const managedRepoPath = path.join(input.homeDir, 'aitp', 'runtime', 'AITP-Research-Protocol');
  const managed = await syncOrCloneAitpRepo({
    repoPath: managedRepoPath,
    remoteUrl: input.remoteUrl,
    managed: true,
    isFile: input.isFile,
    isDir: input.isDir,
    mkdir: input.mkdir,
    runGit: input.runGit,
  });
  if (managed !== undefined) return managed;

  const localRepoPath = await findAitpRepoFrom(input.workDir, input.isFile);
  if (localRepoPath === undefined) return undefined;
  const local = await syncOrCloneAitpRepo({
    repoPath: localRepoPath,
    remoteUrl: input.remoteUrl,
    managed: false,
    isFile: input.isFile,
    isDir: input.isDir,
    mkdir: input.mkdir,
    runGit: input.runGit,
  });
  return local ?? {
    repoPath: localRepoPath,
    remoteSync: { status: 'skipped_unavailable', remoteUrl: input.remoteUrl },
  };
}

async function resolveLocalAitpRepoPath(input: {
  readonly workDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly isFile: (filePath: string) => Promise<boolean>;
}): Promise<string | undefined> {
  for (const key of ['HAKIMI_AITP_REPO', 'AITP_REPO_ROOT', 'AITP_V5_REPO']) {
    const explicit = nonEmpty(input.env[key]);
    if (explicit !== undefined && await isAitpRepoRoot(explicit, input.isFile)) {
      return path.resolve(explicit);
    }
  }
  return findAitpRepoFrom(input.workDir, input.isFile);
}

async function syncOrCloneAitpRepo(input: {
  readonly repoPath: string;
  readonly remoteUrl: string;
  readonly managed: boolean;
  readonly isFile: (filePath: string) => Promise<boolean>;
  readonly isDir: (dirPath: string) => Promise<boolean>;
  readonly mkdir?: (dirPath: string) => Promise<void>;
  readonly runGit: (
    args: readonly string[],
    options: AitpGitRunOptions,
  ) => Promise<AitpGitRunResult>;
}): Promise<{ readonly repoPath: string; readonly remoteSync: DefaultAitpRemoteSyncResult } | undefined> {
  const repoPath = path.resolve(input.repoPath);
  const hasGitDir = await input.isDir(path.join(repoPath, '.git'));
  if (!hasGitDir) {
    if (await isAitpRepoRoot(repoPath, input.isFile)) {
      return {
        repoPath,
        remoteSync: { status: 'skipped_unmanaged', remoteUrl: input.remoteUrl },
      };
    }
    const mkdir = input.mkdir
      ?? ((dirPath: string) => fs.mkdir(dirPath, { recursive: true }).then(() => {}));
    await mkdir(path.dirname(repoPath));
    const clone = await safeRunGit(input.runGit, [
      'clone',
      '--depth',
      '1',
      input.remoteUrl,
      repoPath,
    ]);
    if (clone === undefined || clone.exitCode !== 0) return undefined;
    if (!(await isAitpRepoRoot(repoPath, input.isFile))) return undefined;
    return {
      repoPath,
      remoteSync: { status: 'cloned', remoteUrl: input.remoteUrl },
    };
  }

  if (!(await isAitpRepoRoot(repoPath, input.isFile))) return undefined;

  const status = await safeRunGit(input.runGit, ['-C', repoPath, 'status', '--porcelain']);
  if (status === undefined) {
    return {
      repoPath,
      remoteSync: { status: 'skipped_unavailable', remoteUrl: input.remoteUrl },
    };
  }
  if (status.exitCode !== 0 || status.stdout.trim().length > 0) {
    return {
      repoPath,
      remoteSync: { status: 'skipped_dirty', remoteUrl: input.remoteUrl },
    };
  }

  if (input.managed) {
    await safeRunGit(input.runGit, ['-C', repoPath, 'remote', 'set-url', 'origin', input.remoteUrl]);
  }
  const pull = await safeRunGit(input.runGit, ['-C', repoPath, 'pull', '--ff-only', '--quiet']);
  if (pull === undefined || pull.exitCode !== 0) {
    return {
      repoPath,
      remoteSync: { status: 'skipped_unavailable', remoteUrl: input.remoteUrl },
    };
  }
  return {
    repoPath,
    remoteSync: { status: 'updated', remoteUrl: input.remoteUrl },
  };
}

function safeRunGit(
  runGit: (args: readonly string[], options: AitpGitRunOptions) => Promise<AitpGitRunResult>,
  args: readonly string[],
): Promise<AitpGitRunResult | undefined> {
  return runGit(args, { timeoutMs: DEFAULT_GIT_TIMEOUT_MS }).catch(() => undefined);
}

function runGitCommand(
  args: readonly string[],
  options: AitpGitRunOptions,
): Promise<AitpGitRunResult> {
  return new Promise((resolveResult) => {
    const child = spawn('git', [...args], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolveResult({
        exitCode: 124,
        stdout,
        stderr,
        timedOut: true,
      });
    }, options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS);
    timeout.unref?.();

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveResult({
        exitCode: 127,
        stdout,
        stderr: [stderr.trim(), error.message].filter((part) => part.length > 0).join('\n'),
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveResult({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function resolveDefaultAitpTopicsRoot(input: {
  readonly workDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly isDir: (dirPath: string) => Promise<boolean>;
}): Promise<string> {
  for (const key of ['HAKIMI_AITP_TOPICS_ROOT', 'AITP_TOPICS_ROOT']) {
    const explicit = nonEmpty(input.env[key]);
    if (explicit !== undefined) return path.resolve(explicit);
  }

  let current = path.resolve(input.workDir);
  for (let depth = 0; depth < 8; depth += 1) {
    const canonical = path.join(current, 'research', 'aitp-topics');
    if (await input.isDir(path.join(canonical, '.aitp'))) return canonical;
    if (path.basename(current) === 'aitp-topics' && await input.isDir(path.join(current, '.aitp'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return path.resolve(input.workDir);
}

async function renderDefaultAitpSkills(input: {
  readonly repoPath: string;
  readonly topicsRoot: string;
  readonly targetRoot: string;
  readonly homeDir: string;
  readonly readText?: (filePath: string) => Promise<string>;
  readonly writeText?: (filePath: string, content: string) => Promise<void>;
  readonly mkdir?: (dirPath: string) => Promise<void>;
  readonly isFile: (filePath: string) => Promise<boolean>;
  readonly isDir: (dirPath: string) => Promise<boolean>;
}): Promise<string | undefined> {
  const sourceDir = await firstExistingSkillTemplateDir(input.repoPath, input.isDir);
  if (sourceDir === undefined) return undefined;

  const readText = input.readText ?? ((filePath: string) => fs.readFile(filePath, 'utf-8'));
  const writeText =
    input.writeText ?? ((filePath: string, content: string) => fs.writeFile(filePath, content));
  const mkdir =
    input.mkdir ?? ((dirPath: string) => fs.mkdir(dirPath, { recursive: true }).then(() => {}));
  const skillDir = path.join(input.homeDir, 'aitp', 'skills', 'default');
  await mkdir(skillDir);

  let renderedAny = false;
  for (const fileName of DEFAULT_SKILL_FILES) {
    const sourcePath = path.join(sourceDir, fileName);
    if (!(await input.isFile(sourcePath))) continue;
    const rendered = renderAitpSkillTemplate(await readText(sourcePath), {
      repoPath: input.repoPath,
      topicsRoot: input.topicsRoot,
      targetRoot: input.targetRoot,
    });
    await writeTextIfChanged(path.join(skillDir, fileName), rendered, readText, writeText);
    renderedAny = true;
  }

  return renderedAny ? skillDir : undefined;
}

async function firstExistingSkillTemplateDir(
  repoPath: string,
  isDir: (dirPath: string) => Promise<boolean>,
): Promise<string | undefined> {
  const candidates = [
    path.join(repoPath, 'deploy', 'templates', 'kimi-code'),
    path.join(repoPath, 'deploy', 'skills'),
  ];
  for (const candidate of candidates) {
    if (await isDir(candidate)) return candidate;
  }
  return undefined;
}

function renderAitpSkillTemplate(
  template: string,
  values: {
    readonly repoPath: string;
    readonly topicsRoot: string;
    readonly targetRoot: string;
  },
): string {
  return template
    .replaceAll('{{REPO_ROOT}}', portablePath(values.repoPath))
    .replaceAll('{{TOPICS_ROOT}}', portablePath(values.topicsRoot))
    .replaceAll('{{TARGET_ROOT}}', portablePath(values.targetRoot));
}

async function writeTextIfChanged(
  filePath: string,
  content: string,
  readText: (filePath: string) => Promise<string>,
  writeText: (filePath: string, content: string) => Promise<void>,
): Promise<void> {
  try {
    if (await readText(filePath) === content) return;
  } catch {}
  await writeText(filePath, content);
}

async function findAitpRepoFrom(
  start: string,
  isFile: (filePath: string) => Promise<boolean>,
): Promise<string | undefined> {
  let current = path.resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (await isAitpRepoRoot(current, isFile)) return current;

    const directSibling = path.join(current, 'AITP-Research-Protocol');
    if (await isAitpRepoRoot(directSibling, isFile)) return path.resolve(directSibling);

    const reposSibling = path.join(current, 'repos', 'AITP-Research-Protocol');
    if (await isAitpRepoRoot(reposSibling, isFile)) return path.resolve(reposSibling);

    const siblingFromParent = path.join(path.dirname(current), 'AITP-Research-Protocol');
    if (await isAitpRepoRoot(siblingFromParent, isFile)) return path.resolve(siblingFromParent);

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

async function isAitpRepoRoot(
  repoPath: string,
  isFile: (filePath: string) => Promise<boolean>,
): Promise<boolean> {
  return (
    await isFile(path.join(repoPath, 'brain', 'v5', 'cli.py')) &&
    await isFile(path.join(repoPath, 'brain', 'v5', 'native_mcp.py'))
  );
}

function inferDefaultAitpTargetRoot(workDir: string, topicsRoot: string): string {
  const resolvedTopicsRoot = path.resolve(topicsRoot);
  if (
    path.basename(resolvedTopicsRoot) === 'aitp-topics' &&
    path.basename(path.dirname(resolvedTopicsRoot)) === 'research'
  ) {
    return path.dirname(path.dirname(resolvedTopicsRoot));
  }
  return path.resolve(workDir);
}

function joinPathEnv(first: string, rest: string | undefined): string {
  const trimmed = rest?.trim();
  if (trimmed === undefined || trimmed.length === 0) return first;
  return [first, trimmed].join(delimiter);
}

function isPythonCommand(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === 'python' || base === 'python.exe' || base === 'python3' || base === 'python3.exe';
}

function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function portablePath(value: string): string {
  return path.resolve(value).replaceAll('\\', '/');
}

async function defaultIsFile(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function defaultIsDir(dirPath: string): Promise<boolean> {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}
