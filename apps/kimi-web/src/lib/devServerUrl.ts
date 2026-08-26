// apps/kimi-web/src/lib/devServerUrl.ts
// Pure local dev-server URL detection for tool output.
//
// Tool output is noisy terminal text: ANSI color codes, curl progress bars,
// quoting, trailing punctuation, and multiple candidate URLs. This module
// extracts the URLs that are SAFE to embed in an iframe — http(s) URLs on the
// loopback interface with an explicitly written port — and canonicalizes them
// into a deterministic embeddable form. Embedding a random host would be an
// SSRF-ish footgun (a preview iframe with scripts + same-origin can touch the
// surrounding app context), so anything that is not a clearly-local dev server
// is rejected outright.
//
// INPUT SHAPE: detectDevServerUrls() takes ONE continuous string and makes no
// assumption about lines vs chunks. The byte-faithful stream comes from
// `ToolCall.outputText` (verbatim chunk concatenation); consumers with only
// line-shaped data must '\n'-join it themselves (see lib comments).

import type { WebPreviewTarget } from '../types';

// CSI sequences (`\x1b[...m`) and OSC sequences (`\x1b]...\x07` / `\x1b]\...ESC\`),
// which surround text in rich terminal output.
const ANSI_RE = /\u001B\[[0-9;?]*[ -/]*[@-~]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;
// A URL run: `http(s)://` plus everything up to whitespace or a strong
// delimiter (quotes / angle brackets / backtick). Parentheses/brackets stay in
// the run and are trimmed from the END later, so `[::1]:5173` survives while
// `(http://localhost:5173)` cleans its wrapper.
const URL_RE = /https?:\/\/[^\s"'`<>\\]+/gi;
// Trimmable trailing punctuation after extraction: sentence/display wrappers
// and markdown/plain-text closers. Applied repeatedly (e.g. `),`).
const TRAILING_PUNCT_RE = /[.,;:!?)\]}»"'`]+$/;

// Hosts that are NOT a concrete loopback address but are used by dev servers
// to mean "listen everywhere" — mapped to a concrete loopback host before URL
// parsing (`*` is not even parseable by the WHATWG URL parser).
const WILDCARD_HOSTS: Record<string, string> = {
  '0.0.0.0': '127.0.0.1',
  '*': '127.0.0.1',
  '::': '::1',
};

function isLoopbackV4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return (
    parts[0] === '127' &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
}

/** Whether the CANONICAL hostname (as the URL parser serializes it) names a
 *  local interface we are willing to embed. */
function isAllowedLoopbackHost(host: string): boolean {
  if (host === 'localhost' || host === '::1') return true;
  return isLoopbackV4(host);
}

/**
 * Parse + validate one candidate URL. Returns the canonical embeddable URL,
 * or null when it is not a local http(s) dev-server URL.
 *
 * The raw authority is inspected for the pieces the WHATWG URL parser cannot
 * answer for us — userinfo, the explicitly written port (URL.port clears
 * default 80/443 even when they were written out), unbracketed IPv6, and the
 * wildcard host map — then a WHATWG `URL` parse canonicalizes the authority
 * (lowercasing, IPv4 shorthand classes, IPv6 compression) and validates that a
 * browser would accept it at all.
 */
export function normalizeDevServerUrl(input: string): string | null {
  const m = /^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(input);
  if (!m) return null;
  const protocol = m[1]!.toLowerCase();
  const authority = m[2]!;

  // Username/password are never acceptable in an embeddable URL.
  if (authority.includes('@')) return null;

  // Split the raw authority into host + port. The port MUST be written out
  // explicitly (a bare `http://localhost` could name anything via /etc/hosts
  // and is not a dev-server URL) and be a plain 1..65535 number. The raw text
  // is authoritative because WHATWG URL drops default ports (80/443) from
  // `URL.port` even when they were written explicitly.
  let host: string;
  let port = '';
  if (authority.startsWith('[')) {
    // Bracketed IPv6: `[::1]` or `[::1]:5173`
    const close = authority.indexOf(']');
    if (close === -1) return null;
    host = authority.slice(1, close);
    const rest = authority.slice(close + 1);
    if (rest !== '' && !rest.startsWith(':')) return null;
    port = rest.startsWith(':') ? rest.slice(1) : '';
  } else {
    const colon = authority.lastIndexOf(':');
    if (colon === -1) return null; // no explicit port
    const maybePort = authority.slice(colon + 1);
    if (!/^\d+$/.test(maybePort)) return null;
    // A colon left in the host part means UNBRACKETED IPv6 (`::1:5173`) —
    // not something a browser accepts, so it never reaches the URL parser.
    if (authority.slice(0, colon).includes(':')) return null;
    host = authority.slice(0, colon);
    port = maybePort;
  }
  const portNum = Number(port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return null;

  // Wildcard / unspecified hosts -> concrete loopback (may already be there).
  host = WILDCARD_HOSTS[host.toLowerCase()] ?? host;

  const hostPart = host.includes(':') ? `[${host}]` : host;
  let u: URL;
  try {
    u = new URL(`${protocol}://${hostPart}:${port}${m[3] ?? ''}${m[4] ?? ''}${m[5] ?? ''}`);
  } catch {
    return null; // browser-unacceptable authority (e.g. a bad IPv4 form)
  }
  // URL.hostname lowercases and canonicalizes; IPv6 keeps its brackets.
  const canonicalHost = u.hostname.replaceAll(/^\[|\]$/g, '');
  if (!isAllowedLoopbackHost(canonicalHost)) return null;

  // Serialize canonically. Preserve the port even when it is the scheme
  // default (HTTP 80 / HTTPS 443) — it was explicit in the output, and the
  // panel contract is "loopback URL with an explicit port".
  const portOut = u.port !== '' ? u.port : String(portNum);
  const hostOut = canonicalHost.includes(':') ? `[${canonicalHost}]` : canonicalHost;
  return `${u.protocol}//${hostOut}:${portOut}${u.pathname}${u.search}${u.hash}`;
}

/**
 * Detect local http(s) dev-server URLs in one continuous output text.
 *
 * The caller is responsible for the input's semantics — this function makes
 * NO guess about lines vs chunks. Pass the byte-faithful stream: prefer
 * `ToolCall.outputText` (the exact verbatim concatenation of the tool's
 * streamed chunks, see eventReducer / messagesToTurns); when only line-shaped
 * data exists, '\n'-join the lines FIRST so adjacent lines stay separated (a
 * raw join('') here would glue them into false paths). Scan: ANSI codes
 * stripped, candidates extracted, display punctuation trimmed, validated
 * against the local-host allowlist (localhost / 127.0.0.0/8 / ::1, plus the
 * wildcard forms 0.0.0.0, `*`, `::` normalized to loopback), explicit numeric
 * port required, userinfo forbidden. Results are deduped preserving
 * first-seen order.
 */
export function detectDevServerUrls(stream: string): WebPreviewTarget[] {
  if (stream.length === 0) return [];
  const seen = new Set<string>();
  const out: WebPreviewTarget[] = [];
  for (const match of stream.replace(ANSI_RE, '').matchAll(URL_RE)) {
    let candidate = match[0];
    // Trim trailing wrapper/punctuation characters repeatedly (`).`, `).]`…)
    let prev: string;
    do {
      prev = candidate;
      candidate = candidate.replace(TRAILING_PUNCT_RE, '');
    } while (candidate !== prev);
    const url = normalizeDevServerUrl(candidate);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url });
  }
  return out;
}