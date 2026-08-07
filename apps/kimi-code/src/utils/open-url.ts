import { execFile } from 'node:child_process';

import { isWSL } from '#/utils/platform';

export type OpenUrlCommand = [command: string, args: string[]];

export interface OpenUrlOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exec?: typeof execFile;
}

export function resolveOpenUrlCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
  wsl = platform === 'linux' && isWSL(),
): OpenUrlCommand {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  if (platform === 'linux' && wsl) {
    // Avoid both `cmd.exe /c start` (which parses URL metacharacters such as `&`)
    // and `explorer.exe` (which WSL can path-translate into a File Explorer
    // target). The Windows URL protocol handler receives the URL as a direct arg.
    return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  }
  return ['xdg-open', [url]];
}

export function openUrl(url: string, options: OpenUrlOptions = {}): void {
  const platform = options.platform ?? process.platform;
  const wsl = platform === 'linux' && isWSL(options.env ?? process.env);
  const command = resolveOpenUrlCommand(url, platform, wsl);
  const run = options.exec ?? execFile;
  run(command[0], command[1], (error) => {
    // Windows URL handlers may return a numeric non-zero exit after dispatching
    // successfully. Fall back only when WSL interop itself failed to spawn.
    if (
      typeof error?.code === 'string' &&
      platform === 'linux' &&
      command[0] === 'rundll32.exe'
    ) {
      run('xdg-open', [url], () => {});
    }
  });
}
