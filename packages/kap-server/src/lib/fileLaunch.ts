import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

export interface LaunchCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly shell?: boolean;
  readonly windowsVerbatimArguments?: boolean;
  /** Tried only when spawning `command` fails with ENOENT (the executable is
   *  not installed). Real failures of an existing command never fall back. */
  readonly fallback?: LaunchCommand;
}

export function openFileCommandFor(
  absolutePath: string,
  line?: number,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): LaunchCommand {
  const editor = resolveEditorCommand(env);
  if (editor !== undefined) {
    const target = supportsLineTarget(editor) && line !== undefined
      ? `${absolutePath}:${line}`
      : absolutePath;
    return {
      command: `${editor} ${quoteShellArg(target, platform)}`,
      args: [],
      shell: true,
    };
  }

  switch (platform) {
    case 'darwin':
      return { command: 'open', args: [absolutePath] };
    case 'win32':
      return { command: 'cmd', args: ['/c', 'start', '""', absolutePath] };
    default:
      return wslOpen(absolutePath, env) ?? linuxOpen(absolutePath);
  }
}

/** xdg-open with a `gio open` fallback — minimal Linux images (and some Nix
 *  environments) ship glib but not xdg-utils. */
function linuxOpen(target: string): LaunchCommand {
  return {
    command: 'xdg-open',
    args: [target],
    fallback: { command: 'gio', args: ['open', target] },
  };
}

/** WSL sets WSL_DISTRO_NAME and WSL_INTEROP in every session. xdg-open there
 *  resolves to wslview at best (and is often not installed at all — a silent
 *  no-op from the user's perspective), so open/reveal go through Windows
 *  Explorer over the WSL interop instead. */
function isWsl(env: Record<string, string | undefined>): boolean {
  return env['WSL_DISTRO_NAME'] !== undefined || env['WSL_INTEROP'] !== undefined;
}

/** Bound on the wslpath conversion — a wedged interop must not stall the
 *  route handler. */
const WSLPATH_TIMEOUT_MS = 2_000;

/**
 * Convert an absolute Linux path to its Windows form via the real
 * `wslpath -w` (argv exec, no shell). wslpath owns the actual mount table —
 * drvfs drive mappings, custom automount roots, and the distro UNC root — so
 * no mapping is derived by hand here. Returns undefined when wslpath is
 * missing, times out, or fails; callers then keep the plain Linux opener.
 */
function wslWindowsPath(absolutePath: string): string | undefined {
  try {
    const result = spawnSync('wslpath', ['-w', absolutePath], {
      encoding: 'utf8',
      timeout: WSLPATH_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.error !== undefined || result.status !== 0) return undefined;
    const converted = result.stdout.trim();
    return converted.length > 0 ? converted : undefined;
  } catch {
    return undefined;
  }
}

/** WSL open: hand the Windows path to explorer.exe, which resolves the file's
 *  default handler on the Windows side. Falls back to xdg-open/gio when
 *  explorer.exe is absent (interop disabled). */
function wslOpen(absolutePath: string, env: Record<string, string | undefined>): LaunchCommand | undefined {
  if (!isWsl(env)) return undefined;
  const winPath = wslWindowsPath(absolutePath);
  if (winPath === undefined) return undefined;
  return {
    command: 'explorer.exe',
    args: [winPath],
    fallback: linuxOpen(absolutePath),
  };
}

/** WSL reveal: open the CONTAINING folder in Windows Explorer. explorer.exe
 *  parses `/select,` off its raw command line, and the exact quoting that
 *  form needs on win32 (see explorerSelectArg) cannot be reproduced through
 *  the WSL interop's argv→command-line joining — rather than risk silently
 *  opening the Documents folder, reveal deliberately opens the folder
 *  itself, which is a plain path argument. */
function wslReveal(absolutePath: string, env: Record<string, string | undefined>): LaunchCommand | undefined {
  if (!isWsl(env)) return undefined;
  const winDir = wslWindowsPath(path.dirname(absolutePath));
  if (winDir === undefined) return undefined;
  return {
    command: 'explorer.exe',
    args: [winDir],
    fallback: linuxOpen(path.dirname(absolutePath)),
  };
}

export function revealFileCommandFor(
  absolutePath: string,
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): LaunchCommand {
  switch (platform) {
    case 'darwin':
      return { command: 'open', args: ['-R', absolutePath] };
    case 'win32':
      // explorer.exe parses its RAW command line (not argv), so Node's
      // default spawn quoting breaks `/select,` whenever the path contains
      // spaces: the command line becomes `"/select,\"C:\some dir\f.txt\""`,
      // which explorer's parser rejects, silently opening the Documents
      // folder. `windowsVerbatimArguments: true` keeps the command line in
      // the documented `/select,"C:\some dir\f.txt"` form.
      return {
        command: 'explorer.exe',
        args: [explorerSelectArg(absolutePath)],
        windowsVerbatimArguments: true,
      };
    default:
      return wslReveal(absolutePath, env) ?? linuxOpen(path.dirname(absolutePath));
  }
}

export type OpenInAppId =
  | 'finder'
  | 'cursor'
  | 'vscode'
  | 'iterm'
  | 'terminal';

export const OPEN_IN_APP_IDS: readonly OpenInAppId[] = [
  'finder',
  'cursor',
  'vscode',
  'iterm',
  'terminal',
];

export interface OpenInAppOptions {
  readonly line?: number;
  readonly isDirectory?: boolean;
}

export function openInAppCommandFor(
  appId: OpenInAppId,
  absolutePath: string,
  options: OpenInAppOptions = {},
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): LaunchCommand {
  switch (appId) {
    case 'vscode':
      return openInVsCodeLike('code', absolutePath, options.line, platform);
    case 'cursor':
      return openInVsCodeLike('cursor', absolutePath, options.line, platform);
    case 'finder':
      return openInFinder(absolutePath, options.isDirectory, platform, env);
    case 'iterm':
      return openInMacApp('iTerm', absolutePath, platform);
    case 'terminal':
      return openInMacApp('Terminal', absolutePath, platform);
  }
}

export function getAvailableOpenInApps(
  platform: NodeJS.Platform = process.platform,
): readonly OpenInAppId[] {
  return OPEN_IN_APP_IDS.filter((appId) => isOpenInAppAvailable(appId, platform));
}

function isOpenInAppAvailable(
  appId: OpenInAppId,
  platform: NodeJS.Platform,
): boolean {
  switch (appId) {
    case 'finder':
    case 'terminal':
      return platform === 'darwin';
    case 'iterm':
      if (platform !== 'darwin') return false;
      return (
        existsSync('/Applications/iTerm.app') ||
        existsSync(`${process.env['HOME'] ?? ''}/Applications/iTerm.app`)
      );
    case 'vscode':
      return commandExists('code', platform);
    case 'cursor':
      return commandExists('cursor', platform);
  }
}

function commandExists(command: string, platform: NodeJS.Platform): boolean {
  try {
    if (platform === 'win32') {
      const result = spawnSync('cmd', ['/c', 'where', command], {
        stdio: 'ignore',
      });
      return result.status === 0;
    }
    const result = spawnSync('command', ['-v', command], {
      stdio: 'ignore',
      shell: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function openInVsCodeLike(
  binary: string,
  absolutePath: string,
  line: number | undefined,
  platform: NodeJS.Platform,
): LaunchCommand {
  const target = line !== undefined ? `${absolutePath}:${line}` : absolutePath;
  const flag = line !== undefined ? '-g ' : '';
  return {
    command: `${binary} ${flag}${quoteShellArg(target, platform)}`,
    args: [],
    shell: true,
  };
}

function openInFinder(
  absolutePath: string,
  isDirectory: boolean | undefined,
  platform: NodeJS.Platform,
  env: Record<string, string | undefined> = process.env,
): LaunchCommand {
  switch (platform) {
    case 'darwin':
      return isDirectory
        ? { command: 'open', args: [absolutePath] }
        : { command: 'open', args: ['-R', absolutePath] };
    case 'win32':
      return isDirectory
        ? { command: 'explorer.exe', args: [absolutePath] }
        : {
            command: 'explorer.exe',
            args: [explorerSelectArg(absolutePath)],
            windowsVerbatimArguments: true,
          };
    default:
      if (isDirectory) {
        return wslOpen(absolutePath, env) ?? linuxOpen(absolutePath);
      }
      return wslReveal(absolutePath, env) ?? linuxOpen(path.dirname(absolutePath));
  }
}

function openInMacApp(
  appName: string,
  absolutePath: string,
  platform: NodeJS.Platform,
): LaunchCommand {
  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', appName, absolutePath] };
  }
  // These apps are macOS-only in the UI; fall back to the platform default.
  return openFileCommandFor(absolutePath, undefined, process.env, platform);
}

export async function launchDetached(cmd: LaunchCommand): Promise<void> {
  // Walk the whole fallback chain (e.g. WSL: explorer.exe → xdg-open → gio).
  // Only a missing executable (ENOENT) advances — a real failure of an
  // existing opener must surface, not be masked by the next fallback.
  const failures: string[] = [];
  let current: LaunchCommand | undefined = cmd;
  for (;;) {
    if (current === undefined) {
      throw new Error(
        `no usable system file opener: ${failures.join('; ')}. ` +
          `Install xdg-utils (xdg-open) or glib (gio open) to enable opening files.`,
      );
    }
    try {
      await spawnDetached(current);
      return;
    } catch (error) {
      if (isEnoent(error)) {
        failures.push(`'${current.command}' is not installed`);
        current = current.fallback;
        continue;
      }
      // Non-ENOENT: the executable exists but failed. The primary's failure
      // surfaces as-is; a fallback's failure is reported with the chain.
      if (failures.length === 0) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `no usable system file opener: ${failures.join('; ')}; ` +
          `'${current.command}' failed: ${detail}. ` +
          `Install xdg-utils (xdg-open) or glib (gio open) to enable opening files.`,
        { cause: error },
      );
    }
  }
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

function spawnDetached(cmd: LaunchCommand): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const child = spawn(cmd.command, cmd.args, {
      detached: true,
      stdio: 'ignore',
      shell: cmd.shell,
      windowsVerbatimArguments: cmd.windowsVerbatimArguments,
    });
    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.once('spawn', () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
  });
}

function resolveEditorCommand(env: Record<string, string | undefined>): string | undefined {
  for (const key of ['KIMI_CODE_EDITOR', 'VISUAL', 'EDITOR']) {
    const value = env[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function supportsLineTarget(command: string): boolean {
  const first = command.trim().split(/\s+/)[0] ?? '';
  return /(?:^|\/)(code|cursor|windsurf)(?:\.cmd|\.exe)?$/i.test(first);
}

/**
 * Build the single `/select,` argument for explorer.exe, quoting only the
 * path: `/select,"C:\some dir\f.txt"`. Must be launched with
 * `windowsVerbatimArguments: true` — explorer parses its raw command line,
 * and Node's default quoting would wrap the whole argument as
 * `"/select,\"C:\...\""`, which explorer rejects (it then silently opens the
 * Documents folder). A trailing backslash is dropped so it cannot escape the
 * closing quote.
 */
function explorerSelectArg(absolutePath: string): string {
  const trimmed = absolutePath.replace(/\\+$/, '');
  return `/select,"${trimmed}"`;
}

function quoteShellArg(value: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') return `"${value.replaceAll('"', '\\"')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
