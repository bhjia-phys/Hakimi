import { spawn, type ChildProcess } from 'node:child_process';

export const CLOUDFLARED_URL_TIMEOUT_MS = 30_000;
export const CLOUDFLARED_LOG_BUFFER_LIMIT_BYTES = 1024 * 1024;
export const CLOUDFLARED_SHUTDOWN_TIMEOUT_MS = 5_000;
export const CLOUDFLARED_KILL_TIMEOUT_MS = 1_000;

const TRYCLOUDFLARE_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/giu;

export function spawnCloudflared(executable: string, actualPort: number): ChildProcess {
  return spawn(
    executable,
    [
      'tunnel',
      '--no-autoupdate',
      '--output',
      'json',
      '--url',
      `http://127.0.0.1:${actualPort}`,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
}

export interface WaitForTryCloudflareUrlOptions {
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
  readonly signal?: AbortSignal;
}

export function waitForTryCloudflareUrl(
  child: ChildProcess,
  options: WaitForTryCloudflareUrlOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? CLOUDFLARED_URL_TIMEOUT_MS;
  const maxBufferBytes = options.maxBufferBytes ?? CLOUDFLARED_LOG_BUFFER_LIMIT_BYTES;

  return new Promise<string>((resolve, reject) => {
    const buffers = new Map<NodeJS.ReadableStream, string>();
    let bytesRead = 0;
    let settled = false;

    const finish = (error: Error | undefined, url?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off('error', onError);
      child.off('close', onClose);
      options.signal?.removeEventListener('abort', onAbort);
      for (const stream of buffers.keys()) stream.off('data', onData);
      if (error !== undefined) reject(error);
      else resolve(url!);
    };

    const inspectLine = (line: string): string | undefined => {
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        return undefined;
      }
      if (record === null || typeof record !== 'object' || Array.isArray(record)) return undefined;
      const fields = record as Record<string, unknown>;
      for (const key of ['url', 'message']) {
        const value = fields[key];
        if (typeof value !== 'string') continue;
        for (const match of value.matchAll(TRYCLOUDFLARE_URL_PATTERN)) {
          const url = validateTryCloudflareUrl(match[0]);
          if (url !== undefined) return url;
        }
      }
      return undefined;
    };

    const consumeLines = (stream: NodeJS.ReadableStream): string | undefined => {
      const lines = (buffers.get(stream) ?? '').split(/\r?\n/u);
      buffers.set(stream, lines.pop() ?? '');
      for (const line of lines) {
        if (line.length === 0) continue;
        const url = inspectLine(line);
        if (url !== undefined) return url;
      }
      return undefined;
    };

    const onData = function (this: NodeJS.ReadableStream, chunk: string | Buffer): void {
      bytesRead += Buffer.byteLength(chunk);
      if (bytesRead > maxBufferBytes) {
        finish(new Error(`cloudflared JSON log buffer exceeded ${maxBufferBytes} bytes`));
        return;
      }
      buffers.set(this, (buffers.get(this) ?? '') + chunk.toString());
      const url = consumeLines(this);
      if (url !== undefined) finish(undefined, url);
    };

    const onError = (error: Error): void => {
      finish(new Error(`failed to start cloudflared: ${error.message}`, { cause: error }));
    };

    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      finish(
        new Error(
          `cloudflared exited before publishing a tunnel URL (${formatExit(code, signal)})`,
        ),
      );
    };

    const onAbort = (): void => {
      finish(new Error('cloudflared startup was cancelled'));
    };

    const timeout = setTimeout(() => {
      finish(new Error(`timed out waiting ${timeoutMs}ms for a trycloudflare.com URL`));
    }, timeoutMs);

    for (const stream of [child.stdout, child.stderr]) {
      if (stream === null) continue;
      buffers.set(stream, '');
      stream.on('data', onData);
    }
    child.once('error', onError);
    child.once('close', onClose);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted === true) onAbort();
  });
}

export async function terminateCloudflared(
  child: ChildProcess,
  gracefulTimeoutMs = CLOUDFLARED_SHUTDOWN_TIMEOUT_MS,
  killTimeoutMs = CLOUDFLARED_KILL_TIMEOUT_MS,
): Promise<void> {
  if (hasExited(child)) return;
  try {
    child.kill('SIGTERM');
  } catch {
    // Continue to the bounded wait and SIGKILL fallback.
  }
  if (await waitForClose(child, gracefulTimeoutMs)) return;

  try {
    child.kill('SIGKILL');
  } catch {
    return;
  }
  await waitForClose(child, killTimeoutMs);
}

export function validateTryCloudflareUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return undefined;
    if (!/^[a-z0-9-]+\.trycloudflare\.com$/u.test(url.hostname)) return undefined;
    if (url.username !== '' || url.password !== '' || url.port !== '') return undefined;
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForClose(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (closed: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off('close', onClose);
      // oxlint-disable-next-line promise/no-multiple-resolved -- settled guards the single resolve.
      resolve(closed);
    };
    const onClose = (): void => {
      finish(true);
    };
    const timeout = setTimeout(() => {
      finish(hasExited(child));
    }, timeoutMs);
    child.once('close', onClose);
  });
}

function formatExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal !== null) return `signal ${signal}`;
  if (code !== null) return `exit code ${code}`;
  return 'unknown status';
}
