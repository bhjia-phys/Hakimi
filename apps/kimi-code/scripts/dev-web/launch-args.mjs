/**
 * Shared Node launcher arguments for the source dev session.
 *
 * Plain JS (not TS) on purpose: the extensionless repo-root `dev` wrapper
 * imports this without a loader of its own, and index.ts uses the same helpers
 * so the wrapper, the orchestrator and the source server can never drift apart.
 *
 * tsx runs as an **in-process ESM loader hook** (`node --import <tsx>`), NOT as
 * the `tsx` CLI. The CLI leaves an extra middle process whose `relaySignals`
 * SIGKILLs the real child ~100ms after SIGINT/SIGTERM, which would truncate the
 * session's graceful-shutdown grace (and hide the real process from the
 * orchestrator's PID tracking). With the loader hook the signal lands on the
 * actual process. The dev tsconfig travels via `TSX_TSCONFIG_PATH` because
 * there is no CLI flag to carry it.
 */

import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
/** Dev tsconfig: its `include` covers packages/*\/src so DI decorators transform. */
const TS_CONFIG_PATH = join(APP_ROOT, 'tsconfig.dev.json');
const RAW_TEXT_LOADER_PATH = join(REPO_ROOT, 'build', 'register-raw-text-loader.mjs');

const require = createRequire(import.meta.url);

/**
 * Absolute path of the tsx in-process loader entry (`node --import <this>`).
 * @returns {string}
 */
export function resolveTsxLoader() {
  return require.resolve('tsx');
}

/**
 * `node` argv tail that runs `entry` (TypeScript) in-process.
 * `extra` is passed to the entry as its own arguments.
 * @param {string} entry
 * @param {readonly string[]} [extra]
 * @returns {string[]}
 */
export function tsxNodeArgs(entry, extra = []) {
  return [
    '--import',
    pathToFileURL(resolveTsxLoader()).href,
    // Registered after tsx so raw-text imports still go through the repo loader.
    '--import',
    pathToFileURL(RAW_TEXT_LOADER_PATH).href,
    entry,
    ...extra,
  ];
}

/**
 * Environment for a tsx-launched child: same env as the caller, plus the dev
 * tsconfig for tsx and any per-child overrides (e.g. `KIMI_CODE_DEV_SERVER`).
 * @param {NodeJS.ProcessEnv} [base]
 * @param {NodeJS.ProcessEnv} [overrides]
 * @returns {NodeJS.ProcessEnv}
 */
export function tsxChildEnv(base = process.env, overrides = {}) {
  return { ...base, TSX_TSCONFIG_PATH: TS_CONFIG_PATH, ...overrides };
}
