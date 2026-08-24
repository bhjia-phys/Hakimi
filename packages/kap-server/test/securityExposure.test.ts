import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type RunningServer, startServer } from '../src/start';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';

describe('server-v2 exposure hardening hooks', () => {
  let server: RunningServer | undefined;
  let home: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kimi-server-v2-exposure-'));
  });

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (home !== undefined) {
      await rm(home, { recursive: true, force: true });
      home = undefined;
    }
  });

  it('rejects a disallowed Host header with 40301', async () => {
    server = await startServer({ hostIdentity: TEST_HOST_IDENTITY, host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/v1/healthz',
      headers: { host: 'evil.com' },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as Record<string, unknown>;
    expect(body['code']).toBe(40301);
  });

  it('allows the default loopback Host header', async () => {
    server = await startServer({ hostIdentity: TEST_HOST_IDENTITY, host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/healthz' });
    expect(res.statusCode).toBe(200);
  });

  it('echoes CORS headers for a same-origin request', async () => {
    server = await startServer({ hostIdentity: TEST_HOST_IDENTITY, host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/v1/healthz',
      headers: { origin: 'http://localhost:80', host: 'localhost:80' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:80');
  });

  it('refuses to bind non-loopback hosts without TLS opt-out', async () => {
    await expect(
      startServer({ hostIdentity: TEST_HOST_IDENTITY, host: '0.0.0.0', port: 0, homeDir: home, logLevel: 'silent' }),
    ).rejects.toThrow(/Refusing to bind 0\.0\.0\.0/);
  });

  it('sets security headers on a non-loopback bind without HSTS', async () => {
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '0.0.0.0',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
      insecureNoTls: true,
    });
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
    );
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('caches content-hashed assets and revalidates the SPA document and stable assets', async () => {
    const assetsDir = join(home as string, 'web-assets');
    const hashedAssetsDir = join(assetsDir, 'assets');
    await mkdir(hashedAssetsDir, { recursive: true });
    await writeFile(join(assetsDir, 'index.html'), '<!doctype html><div id="app"></div>');
    await writeFile(join(assetsDir, 'boot.js'), 'console.log("boot")');
    await writeFile(join(hashedAssetsDir, 'app-abc12345.js'), 'console.log("app")');
    await writeFile(join(hashedAssetsDir, 'runtime-config.js'), 'console.log("config")');
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '0.0.0.0',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
      insecureNoTls: true,
      webAssetsDir: assetsDir,
    });

    const document = await server.app.inject({ method: 'GET', url: '/sessions/example' });
    expect(document.statusCode).toBe(200);
    expect(document.headers['cache-control']).toBe('no-cache');
    expect(document.headers['content-security-policy']).toContain(
      "connect-src 'self' ws: wss:",
    );

    const hashedScript = await server.app.inject({
      method: 'GET',
      url: '/assets/app-abc12345.js',
    });
    expect(hashedScript.statusCode).toBe(200);
    expect(hashedScript.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );

    const stableAsset = await server.app.inject({
      method: 'GET',
      url: '/assets/runtime-config.js',
    });
    expect(stableAsset.statusCode).toBe(200);
    expect(stableAsset.headers['cache-control']).toBe('no-cache');

    const rootScript = await server.app.inject({ method: 'GET', url: '/boot.js' });
    expect(rootScript.statusCode).toBe(200);
    expect(rootScript.headers['cache-control']).toBe('no-cache');
  });

  it('does not set security headers on a loopback bind', async () => {
    server = await startServer({ hostIdentity: TEST_HOST_IDENTITY, host: '127.0.0.1', port: 0, homeDir: home, logLevel: 'silent' });
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBeUndefined();
    expect(res.headers['referrer-policy']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('does not register shutdown or terminal routes on non-loopback by default', async () => {
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '0.0.0.0',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
      insecureNoTls: true,
    });
    const token = server.authTokenService.getToken();
    const shutdown = await server.app.inject({
      method: 'POST',
      url: '/api/v1/shutdown',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(shutdown.statusCode).toBe(404);

    const terminals = await server.app.inject({
      method: 'GET',
      url: '/api/v1/sessions/missing/terminals',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(terminals.statusCode).toBe(404);
  });

  it('can explicitly re-enable terminal routes on non-loopback', async () => {
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '0.0.0.0',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
      insecureNoTls: true,
      allowRemoteTerminals: true,
    });
    const token = server.authTokenService.getToken();
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/v1/sessions/missing/terminals',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json() as Record<string, unknown>;
    expect(body['code']).toBe(40401);
  });
});
