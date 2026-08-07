import { readFileSync } from 'node:fs';

export type ReadTextFile = (path: string) => string;

const readTextFile: ReadTextFile = (path) => readFileSync(path, 'utf8');

export function isWSL(
  env: NodeJS.ProcessEnv = process.env,
  readFile: ReadTextFile = readTextFile,
): boolean {
  if (env['WSL_DISTRO_NAME'] !== undefined || env['WSLENV'] !== undefined) return true;
  try {
    return /microsoft|wsl/i.test(readFile('/proc/version'));
  } catch {
    return false;
  }
}
