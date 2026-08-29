import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { getLiveSessionById } from '@moonshot-ai/agent-core-v2/app/sessionManager/sessionLookup';
import { IAgentLifecycleService } from '@moonshot-ai/agent-core-v2/session/agentLifecycle/agentLifecycle';

import { defineKlientConformance } from './helpers/conformance.js';
import { createKlient, serveKlientIpc, type KlientIpcHost } from '../src/transports/ipc/index.js';
import { IpcChannel } from '../src/transports/ipc/channel.js';
import { RPCError } from '../src/core/errors.js';
import { makeEngine, type TestEngine } from './helpers/engine.js';

defineKlientConformance('ipc', async () => {
  const { homeDir, app } = await makeEngine();
  const socketPath = join(homeDir, 'klient.sock');
  const host = await serveKlientIpc({ scope: app, socketPath });
  const klient = createKlient({ socketPath });
  return {
    klient,
    app,
    cleanup: async () => {
      await klient.close();
      await host.close();
      app.dispose();
      await rm(homeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
    },
  };
});

describe('ipc transport specifics', () => {
  let homeDir: string;
  let app: TestEngine['app'];
  let host: KlientIpcHost | undefined;

  async function setup(opts: { token?: string } = {}): Promise<string> {
    ({ homeDir, app } = await makeEngine());
    const socketPath = join(homeDir, 'klient.sock');
    host = await serveKlientIpc({ scope: app, socketPath, token: opts.token });
    return socketPath;
  }

  async function teardown(): Promise<void> {
    await host?.close();
    host = undefined;
    app.dispose();
    await rm(homeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  }

  it('rejects calls when the socket path does not exist', async () => {
    const klient = createKlient({ socketPath: join(tmpdir(), 'klient-no-such.sock') });
    await expect(klient.global.env()).rejects.toThrow();
    await klient.close();
  });

  it('rejects calls made after close', async () => {
    const socketPath = await setup();
    const klient = createKlient({ socketPath });
    await klient.global.env();
    await klient.close();
    // env() is served from its frozen-snapshot cache after the first call, so
    // probe the closed channel with an uncached method instead.
    await expect(klient.global.workspaces.list()).rejects.toThrow('ipc closed');
    await teardown();
  });

  it('drops clients whose hello token mismatches', async () => {
    const socketPath = await setup({ token: 'right' });
    const klient = createKlient({ socketPath, token: 'wrong' });
    await expect(klient.global.env()).rejects.toThrow();
    await klient.close();

    const ok = createKlient({ socketPath, token: 'right' });
    await expect(ok.global.env()).resolves.toMatchObject({ platform: process.platform });
    await ok.close();
    await teardown();
  });

  it('enforces the contract allowlist for raw socket calls', async () => {
    const socketPath = await setup();
    const klient = createKlient({ socketPath });
    const created = await klient.global.sessions.create({ workDir: process.cwd() });
    const raw = new IpcChannel({ socketPath });
    const agentScope = { sessionId: created.id, agentId: 'main' };
    try {
      // Same allowlist as the in-process dispatcher: engine-only goal members fail.
      for (const method of ['markComplete', 'markBlocked', 'pauseActiveGoal', 'goalState']) {
        await expect(raw.call(agentScope, 'agentGoalService', method, [])).rejects.toMatchObject({
          name: 'RPCError',
          code: 40001,
        });
      }
      // A smuggled extra arg (the engine `actor`) fails host-side input validation…
      await expect(
        raw.call(agentScope, 'agentGoalService', 'pauseGoal', [{}, 'model']),
      ).rejects.toMatchObject({
        name: 'RPCError',
        code: 40001,
        message: expect.stringContaining('input validation failed'),
      });
      // A checkpoint proposal must carry the revision even when the raw socket
      // caller bypasses the klient facade.
      await expect(
        raw.call(agentScope, 'agentResearchService', 'proposeCheckpoint', [{}]),
      ).rejects.toMatchObject({
        name: 'RPCError',
        code: 40001,
        message: expect.stringContaining('input validation failed'),
      });
      // …while a legitimate raw call succeeds.
      await expect(raw.call(agentScope, 'agentGoalService', 'getGoal', [])).resolves.toEqual({
        goal: null,
      });
    } finally {
      await raw.close();
      await klient.session(created.id).close();
      await klient.close();
      await teardown();
    }
  });

  it('round-trips coded engine error details over the socket', async () => {
    const socketPath = await setup();
    const klient = createKlient({ socketPath });
    const created = await klient.global.sessions.create({ workDir: process.cwd() });
    const raw = new IpcChannel({ socketPath });
    try {
      await klient.session(created.id).agent('main').goal.create({ objective: 'first' });

      // Duplicate create → engine Error2(goal.already_exists) → coded RPCError.
      const dup = await raw
        .call({ sessionId: created.id, agentId: 'main' }, 'agentGoalService', 'createGoal', [
          { objective: 'second' },
        ])
        .then(
          () => {
            throw new Error('expected createGoal to reject');
          },
          (error: unknown) => error as RPCError,
        );
      expect(dup).toMatchObject({
        name: 'RPCError',
        code: 40001,
        message: 'A goal already exists; use replace to start a new one',
      });
      expect(dup.details).toEqual({ code: 'goal.already_exists' });

      // Subagent goal access → Error2(goal.unsupported_agent); its original
      // details survive the socket round-trip.
      const sessionScope = getLiveSessionById(app.accessor, created.id);
      if (sessionScope === undefined) throw new Error('expected a live session scope');
      await sessionScope.accessor.get(IAgentLifecycleService).create({ agentId: 'ipc-sub' });
      const unsupported = await raw
        .call({ sessionId: created.id, agentId: 'ipc-sub' }, 'agentGoalService', 'getGoal', [])
        .then(
          () => {
            throw new Error('expected getGoal to reject');
          },
          (error: unknown) => error as RPCError,
        );
      expect(unsupported).toMatchObject({
        name: 'RPCError',
        code: 40001,
        message: 'Goals are only supported by the main agent',
      });
      expect(unsupported.details).toEqual({
        code: 'goal.unsupported_agent',
        details: { agentId: 'ipc-sub' },
      });
    } finally {
      await raw.close();
      await klient.session(created.id).close();
      await klient.close();
      await teardown();
    }
  });
});
