import { spawn, type ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export const CLOUDFLARED_URL_TIMEOUT_MS = 30_000;
export const CLOUDFLARED_LOG_BUFFER_LIMIT_BYTES = 1024 * 1024;
export const CLOUDFLARED_SHUTDOWN_TIMEOUT_MS = 5_000;
export const CLOUDFLARED_KILL_TIMEOUT_MS = 1_000;
/** Bounded tail kept from cloudflared stdout/stderr for unhealthy-exit diagnostics. */
export const CLOUDFLARED_LOG_TAIL_LIMIT_BYTES = 64 * 1024;

const TRYCLOUDFLARE_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/giu;

export interface CloudflaredSpawnOptions {
  /**
   * Optional `--metrics` listen address. The persistent serve passes
   * `127.0.0.1:0` so the OS assigns a free loopback port (the temporary
   * runners keep cloudflared's default). Spawning with a metrics flag changes
   * nothing else in the process contract.
   */
  readonly metrics?: string;
}

export function spawnCloudflared(
  executable: string,
  actualPort: number,
  options: CloudflaredSpawnOptions = {},
): ChildProcess {
  const args = [
    'tunnel',
    '--no-autoupdate',
    '--output',
    'json',
    '--url',
    `http://127.0.0.1:${actualPort}`,
  ];
  if (options.metrics !== undefined) {
    args.push('--metrics', options.metrics);
  }
  return spawn(executable, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
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

export interface CloudflaredMetricsAddress {
  readonly host: '127.0.0.1';
  readonly port: number;
}

export interface WaitForMetricsAddressOptions {
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
  readonly signal?: AbortSignal;
}

/**
 * cloudflared (`--output json`, zerolog) announces its bound metrics listener
 * as `Starting metrics server on <addr>/metrics` — verified against
 * cloudflared's own `metrics/metrics.go` (`ServeMetrics`). Persistent serve
 * explicitly binds `127.0.0.1:0`, so only that exact IPv4 loopback address and
 * a legal port are accepted. A stray log line can never steer the fixed-IPv4
 * readiness probe to an arbitrary address.
 */
const METRICS_ADDRESS_PATTERN = /^Starting metrics server on (127\.0\.0\.1):(\d{1,5})\/metrics$/u;

export function waitForMetricsAddress(
  child: ChildProcess,
  options: WaitForMetricsAddressOptions = {},
): Promise<CloudflaredMetricsAddress> {
  const timeoutMs = options.timeoutMs ?? CLOUDFLARED_URL_TIMEOUT_MS;
  const maxBufferBytes = options.maxBufferBytes ?? CLOUDFLARED_LOG_BUFFER_LIMIT_BYTES;

  return new Promise<CloudflaredMetricsAddress>((resolve, reject) => {
    const buffers = new Map<NodeJS.ReadableStream, string>();
    let bytesRead = 0;
    let settled = false;

    const finish = (error: Error | undefined, address?: CloudflaredMetricsAddress): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off('error', onError);
      child.off('close', onClose);
      options.signal?.removeEventListener('abort', onAbort);
      for (const stream of buffers.keys()) stream.off('data', onData);
      if (error !== undefined) reject(error);
      else resolve(address!);
    };

    const inspectLine = (line: string): CloudflaredMetricsAddress | undefined => {
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        return undefined;
      }
      if (record === null || typeof record !== 'object' || Array.isArray(record)) return undefined;
      const fields = record as Record<string, unknown>;
      const message = fields['message'];
      if (typeof message !== 'string') return undefined;
      const match = METRICS_ADDRESS_PATTERN.exec(message);
      if (match === null) return undefined;
      const port = Number(match[2]);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) return undefined;
      return { host: '127.0.0.1', port };
    };

    const consumeLines = (stream: NodeJS.ReadableStream): CloudflaredMetricsAddress | undefined => {
      const lines = (buffers.get(stream) ?? '').split(/\r?\n/u);
      buffers.set(stream, lines.pop() ?? '');
      for (const line of lines) {
        if (line.length === 0) continue;
        const address = inspectLine(line);
        if (address !== undefined) return address;
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
      const address = consumeLines(this);
      if (address !== undefined) finish(undefined, address);
    };

    const onError = (error: Error): void => {
      finish(new Error(`failed to start cloudflared: ${error.message}`, { cause: error }));
    };

    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      finish(
        new Error(
          `cloudflared exited before publishing a metrics address (${formatExit(code, signal)})`,
        ),
      );
    };

    const onAbort = (): void => {
      finish(new Error('cloudflared metrics address wait was cancelled'));
    };

    const timeout = setTimeout(() => {
      finish(new Error(`timed out waiting ${timeoutMs}ms for a cloudflared metrics address`));
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

export interface TunnelReadinessProbeResult {
  readonly ok: boolean;
  readonly detail: string;
}

export interface ProbeTunnelReadinessOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/**
 * Probe cloudflared's loopback `/ready` endpoint. Requires no auth: the
 * endpoint is loopback-only and the probe URL is built from a port already
 * validated as a parsed loopback metrics address. The response body is always
 * consumed (released); `redirect: 'error'` refuses any follow so the probe can
 * never be steered off-loopback.
 */
export async function probeTunnelReadiness(
  port: number,
  options: ProbeTunnelReadinessOptions = {},
): Promise<TunnelReadinessProbeResult> {
  if (options.signal?.aborted === true) {
    return { ok: false, detail: 'probe aborted before start' };
  }
  const timeoutMs = options.timeoutMs ?? 2_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`/ready probe timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const onParentAbort = (): void => {
    controller.abort(options.signal?.reason);
  };
  options.signal?.addEventListener('abort', onParentAbort, { once: true });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/ready`, {
      signal: controller.signal,
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
    // Read only a bounded head of the body and always release the rest, so a
    // pathological response can neither grow memory nor leak into `detail`.
    const readyConnections = parseReadyConnections(await readResponseHead(response, 256));
    if (!response.ok) {
      const suffix =
        readyConnections !== undefined ? `, readyConnections ${readyConnections}` : '';
      return { ok: false, detail: `ready ${response.status}${suffix}` };
    }
    if (typeof readyConnections === 'number' && readyConnections >= 1) {
      return { ok: true, detail: `readyConnections ${readyConnections}` };
    }
    return {
      ok: false,
      detail:
        readyConnections === undefined
          ? 'ready body lacks a numeric readyConnections'
          : `readyConnections ${readyConnections}`,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, detail: `probe aborted: ${errorMessage(error)}` };
    }
    return { ok: false, detail: `probe failed: ${errorMessage(error)}` };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onParentAbort);
  }
}

/** Read up to `capBytes` bytes of a response body, always releasing the rest. */
async function readResponseHead(response: Response, capBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (total < capBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const retained = value.subarray(0, capBytes - total);
      chunks.push(Buffer.from(retained));
      total += retained.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

function parseReadyConnections(head: string): number | undefined {
  try {
    const value = (JSON.parse(head) as { readyConnections?: unknown }).readyConnections;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    return undefined;
  } catch {
    return undefined;
  }
}

export interface TunnelLogTailOptions {
  readonly limitBytes?: number;
  /**
   * Applied per line AT WRITE TIME so a truncated line can never carry a
   * half-redacted secret (dropping the content is safer than a split slice).
   */
  readonly redact?: (text: string) => string;
}

export interface TunnelLogTail {
  /** Attach to ONE stream; separate tails keep independent half-line buffers. */
  readonly onChunk: (chunk: Buffer | string) => void;
  /**
   * Bounded trailing log view, newest line last. Every stored line is already
   * redacted; `maxBytes` is honoured per line and in total.
   */
  readonly dump: (options?: { readonly maxBytes?: number }) => string;
}

export function createTunnelLogTail(options: TunnelLogTailOptions = {}): TunnelLogTail {
  const limitBytes = options.limitBytes ?? CLOUDFLARED_LOG_TAIL_LIMIT_BYTES;
  const redact = options.redact;
  const decoder = new StringDecoder('utf8');
  const lines: string[] = [];
  let bytes = 0;
  let partial = '';
  let discardUntilNewline = false;
  const truncatedMarker = '[truncated log line]';

  const pushLine = (raw: string): void => {
    if (raw.length === 0) return;
    let line = redact !== undefined ? redact(raw) : raw;
    if (Buffer.byteLength(line) > limitBytes) {
      // Never retain a prefix/suffix of an oversized line: either a fixed
      // marker fits in full or the line is dropped entirely.
      line = truncatedMarker;
    }
    const lineBytes = Buffer.byteLength(line);
    if (lineBytes > limitBytes) return;
    bytes += lineBytes + (lines.length > 0 ? 1 : 0);
    lines.push(line);
    while (bytes > limitBytes && lines.length > 0) {
      const removed = lines.shift()!;
      bytes -= Buffer.byteLength(removed);
      if (lines.length > 0) bytes -= 1;
    }
  };

  const onChunk = (chunk: Buffer | string): void => {
    let text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
    if (discardUntilNewline) {
      const newline = text.indexOf('\n');
      if (newline < 0) return;
      discardUntilNewline = false;
      text = text.slice(newline + 1);
    }

    for (;;) {
      const newline = text.indexOf('\n');
      if (newline < 0) {
        if (Buffer.byteLength(partial) + Buffer.byteLength(text) > limitBytes) {
          partial = '';
          discardUntilNewline = true;
          pushLine(truncatedMarker);
        } else {
          partial += text;
        }
        return;
      }
      pushLine(partial + text.slice(0, newline));
      partial = '';
      text = text.slice(newline + 1);
    }
  };

  const dump: TunnelLogTail['dump'] = (options = {}) => {
    const maxBytes = options.maxBytes ?? limitBytes;
    if (maxBytes <= 0) return '';
    // Incomplete lines are deliberately omitted. They may contain a credential
    // split at an arbitrary chunk boundary and are not safe diagnostic units.
    const picked: string[] = [];
    let pickedBytes = 0;
    for (let index = lines.length - 1; index >= 0; index--) {
      const line = lines[index]!;
      const lineBytes = Buffer.byteLength(line);
      const required = lineBytes + (picked.length > 0 ? 1 : 0);
      if (required > maxBytes) continue;
      if (pickedBytes + required > maxBytes) continue;
      picked.unshift(line);
      pickedBytes += required;
    }
    return picked.join('\n');
  };

  return { onChunk, dump };
}

/**
 * Redact credentials from diagnostic text before it can reach logs. The
 * optional known token is replaced exactly (without word-boundary assumptions)
 * before generic fragment/query, `Bearer`, URL-userinfo, JSON-field, and
 * token-shaped fallbacks run. Over-redaction is fine here — under-redaction is
 * not.
 */
export function redactDiagnosticText(text: string, knownToken?: string): string {
  const knownRedacted =
    knownToken !== undefined && knownToken.length > 0
      ? text.replaceAll(knownToken, '[REDACTED]')
      : text;
  return knownRedacted
    .replaceAll(/\b[A-Za-z0-9_-]{43}\b/gu, '[REDACTED]')
    .replaceAll(
      /([?#&](?:token|access_token|refresh_token|client_secret|api[_-]?key|key|secret|auth|password|credential)=)[^&\s"'<>]+/giu,
      '$1[REDACTED]',
    )
    .replaceAll(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/giu, '$1[REDACTED]')
    .replaceAll(/([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/giu, '$1[REDACTED]@')
    .replaceAll(
      /("(?:token|access_token|refresh_token|client_secret|api[_-]?key|key|secret|auth|password|credential|authorization)"\s*:\s*")[^"]*(")/giu,
      '$1[REDACTED]$2',
    );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
