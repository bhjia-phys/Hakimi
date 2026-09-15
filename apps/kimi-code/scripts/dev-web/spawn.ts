/**
 * Child-process plumbing for the source dev session.
 *
 * Kept apart from ./index.ts so the wiring there stays a thin deps assembly,
 * and so tests can drive a *real* spawned child through the same helpers the
 * session uses (including the ready report on the IPC channel).
 */

import type { ChildProcess } from 'node:child_process';

import { describeExit, type BackendReady, type ManagedProcess } from './orchestrator';

/** Adapt a Node child process to the small surface the session tracks. */
export function toManagedProcess(child: ChildProcess): ManagedProcess {
  return {
    pid: child.pid,
    kill(signal) {
      try {
        // Targets exactly this pid — never a process group, so no other
        // Hakimi/Vite instance can be hit.
        child.kill(signal);
      } catch {
        // Already gone; there is nothing left to clean up.
      }
    },
    onExit(listener) {
      child.on('exit', (code, signal) => {
        listener(code, signal);
      });
    },
    onError(listener) {
      child.on('error', (error) => {
        listener(error);
      });
    },
  };
}

interface BackendReadyReport {
  type: 'ready';
  origin: string;
  token: string | undefined;
}

interface BackendErrorReport {
  type: 'error';
  message: string;
}

function parseBackendReport(message: unknown): BackendReadyReport | BackendErrorReport | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  const report = message as {
    type?: unknown;
    origin?: unknown;
    token?: unknown;
    message?: unknown;
  };
  if (report.type === 'ready' && typeof report.origin === 'string') {
    return {
      type: 'ready',
      origin: report.origin,
      token: typeof report.token === 'string' ? report.token : undefined,
    };
  }
  if (report.type === 'error' && typeof report.message === 'string') {
    return { type: 'error', message: report.message };
  }
  return undefined;
}

/**
 * Resolve with the origin the child reported over its IPC channel. Rejects when
 * the child fails, exits before reporting, or stays silent past `timeoutMs` —
 * the session never has to scrape logs or guess a port.
 */
export function waitForBackendReady(
  child: ChildProcess,
  timeoutMs: number,
): Promise<BackendReady> {
  return new Promise<BackendReady>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`the source server did not report readiness within ${timeoutMs / 1000}s`));
    }, timeoutMs);
    const settle = (action: () => void): void => {
      clearTimeout(timer);
      action();
    };
    child.on('message', (message: unknown) => {
      const report = parseBackendReport(message);
      if (report === undefined) return;
      if (report.type === 'ready') {
        settle(() => {
          resolve({ origin: report.origin, token: report.token });
        });
      } else {
        settle(() => {
          reject(new Error(report.message));
        });
      }
    });
    child.on('error', (error) => {
      settle(() => {
        reject(error);
      });
    });
    child.on('exit', (code, signal) => {
      settle(() => {
        reject(
          new Error(`the source server exited before it was ready (${describeExit(code, signal)})`),
        );
      });
    });
  });
}
