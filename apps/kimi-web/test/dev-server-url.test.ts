// apps/kimi-web/test/dev-server-url.test.ts
import { describe, expect, it } from 'vitest';
import { detectDevServerUrls, normalizeDevServerUrl } from '../src/lib/devServerUrl';

const urls = (...list: string[]) => list.map((url) => ({ url }));

describe('normalizeDevServerUrl', () => {
  it('accepts localhost, 127/8, ::1 with an explicit port', () => {
    expect(normalizeDevServerUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(normalizeDevServerUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080/');
    expect(normalizeDevServerUrl('http://127.42.0.9:3000/x')).toBe('http://127.42.0.9:3000/x');
    expect(normalizeDevServerUrl('http://[::1]:5173/')).toBe('http://[::1]:5173/');
    expect(normalizeDevServerUrl('https://localhost:8443/')).toBe('https://localhost:8443/');
  });

  it('canonicalizes the full IPv6 loopback form to ::1', () => {
    expect(normalizeDevServerUrl('http://[0:0:0:0:0:0:0:1]:5173/')).toBe('http://[::1]:5173/');
    expect(normalizeDevServerUrl('http://[0:0:0:0:0:0:0:1]:8080/a')).toBe('http://[::1]:8080/a');
  });

  it('canonicalizes browser-accepted IPv4 shorthand forms to dotted-quad', () => {
    expect(normalizeDevServerUrl('http://127.1:5173/')).toBe('http://127.0.0.1:5173/');
    expect(normalizeDevServerUrl('http://LOCALHOST:5173/')).toBe('http://localhost:5173/');
  });

  it('normalizes wildcard / unspecified hosts to loopback', () => {
    expect(normalizeDevServerUrl('http://0.0.0.0:5173/')).toBe('http://127.0.0.1:5173/');
    expect(normalizeDevServerUrl('http://*:4173/')).toBe('http://127.0.0.1:4173/');
    expect(normalizeDevServerUrl('http://[::]:5173/')).toBe('http://[::1]:5173/');
  });

  it('preserves path, query and hash', () => {
    expect(normalizeDevServerUrl('http://localhost:5173/admin/users?tab=active#top')).toBe(
      'http://localhost:5173/admin/users?tab=active#top',
    );
    expect(normalizeDevServerUrl('http://localhost:5173/?q=1#x')).toBe('http://localhost:5173/?q=1#x');
  });

  it('requires an explicit valid port', () => {
    expect(normalizeDevServerUrl('http://localhost')).toBeNull();
    expect(normalizeDevServerUrl('http://localhost/')).toBeNull();
    expect(normalizeDevServerUrl('http://localhost:0/')).toBeNull();
    expect(normalizeDevServerUrl('http://localhost:65536/')).toBeNull();
    expect(normalizeDevServerUrl('http://localhost:abc/')).toBeNull();
    expect(normalizeDevServerUrl('http://localhost:99999x/')).toBeNull();
  });

  it('keeps explicit default ports (80/443) — URL.port clears them but they were written out', () => {
    expect(normalizeDevServerUrl('http://localhost:80')).toBe('http://localhost:80/');
    expect(normalizeDevServerUrl('http://localhost:80/x')).toBe('http://localhost:80/x');
    expect(normalizeDevServerUrl('https://localhost:443/')).toBe('https://localhost:443/');
  });

  it('rejects userinfo (username/password)', () => {
    expect(normalizeDevServerUrl('http://user@localhost:5173/')).toBeNull();
    expect(normalizeDevServerUrl('http://user:pass@localhost:5173/')).toBeNull();
  });

  it('rejects unbracketed IPv6, even when the host is a loopback', () => {
    expect(normalizeDevServerUrl('http://::1:5173/')).toBeNull();
    expect(normalizeDevServerUrl('http://[::1]:5173/')).toBe('http://[::1]:5173/');
  });

  it('rejects non-local hosts and non-http(s) schemes', () => {
    expect(normalizeDevServerUrl('http://example.com:5173/')).toBeNull();
    expect(normalizeDevServerUrl('https://github.com:443/')).toBeNull();
    expect(normalizeDevServerUrl('http://192.168.1.10:5173/')).toBeNull();
    expect(normalizeDevServerUrl('http://10.0.0.2:5173/')).toBeNull();
    expect(normalizeDevServerUrl('http://[::2]:5173/')).toBeNull();
    expect(normalizeDevServerUrl('http://[fe80::1]:5173/')).toBeNull();
    expect(normalizeDevServerUrl('ftp://localhost:5173/')).toBeNull();
    expect(normalizeDevServerUrl('file://localhost:5173/')).toBeNull();
  });

  it('rejects malformed authority forms', () => {
    expect(normalizeDevServerUrl('http://')).toBeNull();
    expect(normalizeDevServerUrl('http://:5173/')).toBeNull();
    expect(normalizeDevServerUrl('http://[::1')).toBeNull();
    // Browser-unacceptable IPv4 (an octet > 255 — the WHATWG parser fails).
    expect(normalizeDevServerUrl('http://127.0.0.999:5173/')).toBeNull();
    expect(normalizeDevServerUrl('http://127.0.0.1.2:5173/')).toBeNull();
    // Junk right after a bracketed host is not `:port`.
    expect(normalizeDevServerUrl('http://[::1]x:5173/')).toBeNull();
  });
});

describe('detectDevServerUrls — single continuous string', () => {
  it('returns an empty list for an empty stream', () => {
    expect(detectDevServerUrls('')).toEqual([]);
  });

  it('finds a plain URL inside the text', () => {
    expect(detectDevServerUrls('Local: http://localhost:5173/')).toEqual(
      urls('http://localhost:5173/'),
    );
  });

  // The caller joins stream chunks WITHOUT a separator into the continuous
  // text (ToolCall.outputText is exactly this verbatim concatenation).
  describe('chunk-joined streams (join(""))', () => {
    it('recovers a URL split across two chunks, incl. `:51` + `73/` ports', () => {
      const stream = ['Local: http://local', 'host:5173/'].join('');
      expect(detectDevServerUrls(stream)).toEqual(urls('http://localhost:5173/'));
      // The final-review regression: the port digits themselves are split —
      // the detector must read the joined text, never a `:51`-only prefix.
      const splitPort = ['Local: http://localhost:51', '73/'].join('');
      expect(detectDevServerUrls(splitPort)).toEqual(urls('http://localhost:5173/'));
    });

    it('recovers a URL split right before the path (`:5173` + `/admin`)', () => {
      const stream = ['Local: http://localhost:5173', '/admin'].join('');
      expect(detectDevServerUrls(stream)).toEqual(urls('http://localhost:5173/admin'));
    });

    it('recovers a URL split across many chunks and per character', () => {
      expect(detectDevServerUrls(['Local: http://', 'local', 'host:5', '173/ welcome'].join(''))).toEqual(
        urls('http://localhost:5173/'),
      );
      expect(detectDevServerUrls('http://localhost:5173/'.split('').join(''))).toEqual(
        urls('http://localhost:5173/'),
      );
    });

    it('recovers a later split URL while a complete URL precedes it', () => {
      const stream = ['Local: http://localhost:5173/ ', 'http://[::', '1]:8080/'].join('');
      expect(detectDevServerUrls(stream)).toEqual(
        urls('http://localhost:5173/', 'http://[::1]:8080/'),
      );
    });

    it('recovers ANSI sequences split across chunk boundaries', () => {
      expect(detectDevServerUrls(['\u001B[3', '2mLocal: http://localhost:5173/\u001B[0m'].join(''))).toEqual(
        urls('http://localhost:5173/'),
      );
      expect(detectDevServerUrls(['http://localhost:5173/ \u001B[', '0m'].join(''))).toEqual(
        urls('http://localhost:5173/'),
      );
    });

    it('dedupes repeated URLs while preserving first-seen order', () => {
      const stream = [
        'http://localhost:5173/a\nhttp://localhost:5173/a\n',
        'http://[::1]:8080/b\nhttp://localhost:5173/c\n',
        'http://[::1]:8080/b',
      ].join('');
      expect(detectDevServerUrls(stream)).toEqual(
        urls('http://localhost:5173/a', 'http://[::1]:8080/b', 'http://localhost:5173/c'),
      );
    });

    it('merges a no-whitespace stream into ONE run (caller must keep line breaks)', () => {
      // Without any separator the run extends to the next whitespace. This is
      // the caller's contract: join('\n') restored lines, only join('') raw
      // stream chunks — never a bare join('') of complete lines.
      expect(detectDevServerUrls('http://localhost:5173/ahttp://localhost:5173/b')).toEqual(
        urls('http://localhost:5173/ahttp://localhost:5173/b'),
      );
    });
  });

  describe('line-joined restored output (join("\\n"))', () => {
    it('does not glue a line-end URL to the next line', () => {
      // Restored transcript lines: 'Local: http://localhost:5173/' followed by
      // an unrelated next line. '\n'-joined, the run must stop at the newline.
      const lines = ['Local: http://localhost:5173/', 'ready in 320 ms'];
      expect(detectDevServerUrls(lines.join('\n'))).toEqual(urls('http://localhost:5173/'));
      // Same URL duplicated on later lines dedupes.
      const dup = ['http://localhost:5173/x', 'http://localhost:5173/x'];
      expect(detectDevServerUrls(dup.join('\n'))).toEqual(urls('http://localhost:5173/x'));
    });

    it('still respects the newline between two line-shaped restored lines', () => {
      // Two '\n'-joined lines where a URL "looks" split: the '\n' boundary is
      // a hard run stop, so the first line yields its URL and the second
      // line's text is not glued on.
      expect(detectDevServerUrls('http://localhost:5173\n/admin')).toEqual(
        urls('http://localhost:5173/'),
      );
    });
  });

  it('strips trailing punctuation and wrappers', () => {
    expect(detectDevServerUrls('see (http://localhost:5173), please')).toEqual(
      urls('http://localhost:5173/'),
    );
    expect(detectDevServerUrls('ok: http://localhost:5173/.')).toEqual(urls('http://localhost:5173/'));
    expect(detectDevServerUrls('[http://localhost:5173/path]')).toEqual(
      urls('http://localhost:5173/path'),
    );
    expect(detectDevServerUrls('(http://localhost:5173/test),')).toEqual(
      urls('http://localhost:5173/test'),
    );
  });

  it('does not over-trim query strings / fragments', () => {
    expect(detectDevServerUrls('open http://localhost:5173/app?tab=1#sec — now')).toEqual(
      urls('http://localhost:5173/app?tab=1#sec'),
    );
  });

  it('normalizes wildcard hosts inside output text', () => {
    expect(detectDevServerUrls('Server running at http://*:4173/')).toEqual(
      urls('http://127.0.0.1:4173/'),
    );
    expect(detectDevServerUrls('http://0.0.0.0:5173/')).toEqual(urls('http://127.0.0.1:5173/'));
  });

  it('handles several different URLs on one line', () => {
    expect(detectDevServerUrls('one http://localhost:5173/ two http://127.0.0.1:8080/x three')).toEqual(
      urls('http://localhost:5173/', 'http://127.0.0.1:8080/x'),
    );
  });

  it('ignores non-local URLs even when they carry a port', () => {
    expect(detectDevServerUrls('Deploy URL: https://preview.example.com:443/.')).toEqual([]);
    expect(detectDevServerUrls('curl http://127.0.0.1:5173/ -o out')).toEqual(
      urls('http://127.0.0.1:5173/'),
    );
  });

  it('ignores bare URLs without a port in real log lines', () => {
    expect(detectDevServerUrls('docs at https://localhost/x')).toEqual([]);
  });

  it('does not treat usernames in scp-style command output as URLs', () => {
    expect(detectDevServerUrls('scp file user@localhost:5173/tmp/x')).toEqual([]);
  });
});