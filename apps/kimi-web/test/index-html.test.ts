// apps/kimi-web/test/index-html.test.ts
// CSP regression guard: kap-server serves the built bundle with
// `Content-Security-Policy: default-src 'self'; …` (see securityHeaders.ts),
// which forbids inline scripts and inline event handlers. index.html must
// therefore stay free of both, and the anti-FOUC color-scheme bootstrap must
// load from the external /boot.js.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  assertCanonicalViteEnvironment,
  CANONICAL_VITE_ENVIRONMENT,
  canonicalViteEnvDir,
} from '../vite.config';

const indexHtml = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf-8');
const bootJsPath = fileURLToPath(new URL('../public/boot.js', import.meta.url));

describe('index.html CSP hygiene', () => {
  it('has no <script> tag without a src attribute', () => {
    const scriptTags = indexHtml.match(/<script\b[^>]*>/gi) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) {
      expect(tag).toMatch(/\bsrc\s*=/);
    }
  });

  it('has no inline event-handler attributes', () => {
    expect(indexHtml).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('loads the anti-FOUC bootstrap from the external /boot.js', () => {
    expect(indexHtml).toContain('<script src="/boot.js"></script>');
    expect(existsSync(bootJsPath)).toBe(true);
  });
});

describe('canonical Vite environment', () => {
  const canonicalEnv = {
    KIMI_WEB_CANONICAL_BUILD: '1',
    ...CANONICAL_VITE_ENVIRONMENT,
  };

  it('disables workspace env files and accepts only fixed canonical values', () => {
    expect(assertCanonicalViteEnvironment(canonicalEnv)).toBe(true);
    expect(canonicalViteEnvDir(canonicalEnv)).toBe(false);
    expect(canonicalViteEnvDir({})).toBeUndefined();
  });

  it('rejects extra VITE variables and overridden canonical values', () => {
    expect(() =>
      assertCanonicalViteEnvironment({ ...canonicalEnv, VITE_POISONED: 'leak' }),
    ).toThrow(/unexpected environment variable VITE_POISONED/);
    expect(() =>
      assertCanonicalViteEnvironment({ ...canonicalEnv, KIMI_WEB_DESKTOP: '1' }),
    ).toThrow(/requires KIMI_WEB_DESKTOP="0"/);
  });
});
