import { readApiErrorMessage } from './api-error';

export interface UsageFetchHints {
  /** Message used for HTTP 401 responses. */
  readonly unauthorized: string;
  /** Message used for HTTP 404 responses. */
  readonly notFound: string;
  /** Prefix used for other HTTP statuses (`<prefix> HTTP <status>`) and for
   * network / parse failures (`<prefix>: <detail>`). */
  readonly statusPrefix: string;
}

export interface UsageFetchOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export type UsageFetchResult =
  | { readonly kind: 'ok'; readonly json: unknown }
  | { readonly kind: 'error'; readonly status?: number; readonly message: string };

/**
 * Shared Bearer-token usage fetch used by the non-managed usage adapters
 * (`codex-usage`, `opencode-usage`). Owns the credential-bearing fetch
 * boundary: AbortSignal/timeout, redirect refusal (`redirect: 'error'` — a
 * 30x is never followed, so the credential cannot leak to another host),
 * HTTP/network/non-JSON handling, and credential redaction from any error
 * text built from untrusted input (a misbehaving or attacker-controlled
 * server echoing the token back must never leak it into a caller's output or
 * logs). Optional extra headers (e.g. `ChatGPT-Account-Id`) may be merged in
 * but never override the `Authorization` / `Accept` pair.
 */
export async function fetchBearerUsageJson(
  url: string,
  credential: string,
  headers: Readonly<Record<string, string>>,
  hints: UsageFetchHints,
  opts: UsageFetchOptions = {},
): Promise<UsageFetchResult> {
  if (isCallerAborted(opts.signal)) {
    return { kind: 'error', message: 'Usage query cancelled.' };
  }
  const controller = new AbortController();
  const onExternalAbort = (): void => {
    controller.abort();
  };
  if (opts.signal !== undefined) {
    if (opts.signal.aborted) {
      controller.abort();
    } else {
      opts.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  const timer = setTimeout(() => {
    controller.abort();
  }, opts.timeoutMs ?? 8000);
  try {
    const requestHeaders = new Headers(headers);
    requestHeaders.set('Authorization', `Bearer ${credential}`);
    requestHeaders.set('Accept', 'application/json');
    const res = await fetch(url, {
      // Never follow a redirect: the credential must not leak to a different
      // host, so any 30x fails the request instead of being re-sent.
      redirect: 'error',
      headers: requestHeaders,
      signal: controller.signal,
    });
    if (!res.ok) {
      const status = res.status;
      const hint =
        status === 401
          ? hints.unauthorized
          : status === 404
            ? hints.notFound
            : `${hints.statusPrefix} HTTP ${String(status)}`;
      return {
        kind: 'error',
        status,
        message: redactCredential(credential, await readApiErrorMessage(res, hint)),
      };
    }
    const json: unknown = await res.json();
    return { kind: 'ok', json };
  } catch (error) {
    if (isCallerAborted(opts.signal)) {
      return { kind: 'error', message: 'Usage query cancelled.' };
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return { kind: 'error', message: `${hints.statusPrefix}: request timed out.` };
    }
    const msg = error instanceof Error ? error.message : String(error);
    return {
      kind: 'error',
      message: redactCredential(credential, `${hints.statusPrefix}: ${msg}`),
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}

function redactCredential(credential: string, message: string): string {
  if (credential.length === 0) return message;
  return message.split(credential).join('[redacted]');
}

function isCallerAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}