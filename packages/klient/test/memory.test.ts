import { rm } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { defineKlientConformance } from './helpers/conformance.js';
import { createKlient } from '../src/transports/memory/index.js';
import { createMemoryDispatcher } from '../src/transports/memory/dispatcher.js';
import { RPCError } from '../src/core/errors.js';
import { makeEngine } from './helpers/engine.js';

defineKlientConformance('memory', async () => {
  const { homeDir, app } = await makeEngine();
  const klient = createKlient({ scope: app });
  return {
    klient,
    app,
    cleanup: async () => {
      await klient.close();
      app.dispose();
      await rm(homeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
    },
  };
});

describe('memory dispatcher specifics', () => {
  it('rejects unknown services and methods with RPCError(40001)', async () => {
    const { homeDir, app } = await makeEngine();
    const dispatcher = createMemoryDispatcher(app);
    await expect(dispatcher.call({}, 'noSuchService', 'get', [])).rejects.toMatchObject({
      name: 'RPCError',
      code: 40001,
    });
    await expect(dispatcher.call({}, 'sessionIndex', 'noSuchMethod', [])).rejects.toMatchObject({
      name: 'RPCError',
      code: 40001,
    });
    app.dispose();
    await rm(homeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  });

  it('reads non-function members as properties', async () => {
    const { homeDir, app } = await makeEngine();
    const dispatcher = createMemoryDispatcher(app);
    await expect(dispatcher.call({}, 'bootstrapService', 'platform', [])).resolves.toBe(
      process.platform,
    );
    app.dispose();
    await rm(homeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  });

  it('rejects session/agent scopes for now', async () => {
    const { homeDir, app } = await makeEngine();
    const dispatcher = createMemoryDispatcher(app);
    await expect(
      dispatcher.call({ sessionId: 's1' }, 'sessionIndex', 'list', [{}]),
    ).rejects.toBeInstanceOf(RPCError);
    app.dispose();
    await rm(homeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  });

  it('delivers wire-cloned payloads (no live object identity)', async () => {
    const { homeDir, app } = await makeEngine();
    const klient = createKlient({ scope: app });
    const list = await klient.global.workspaces.list();
    // Mutating the result must not affect what a second call returns.
    (list as unknown[]).push({ id: 'polluted' });
    const again = await klient.global.workspaces.list();
    expect(again.some((w) => w.id === 'polluted')).toBe(false);
    app.dispose();
    await rm(homeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  });
});

describe('memory dispatcher contract allowlist', () => {
  async function setup() {
    const { homeDir, app } = await makeEngine();
    const klient = createKlient({ scope: app });
    const created = await klient.global.sessions.create({ workDir: process.cwd() });
    const dispatcher = createMemoryDispatcher(app);
    return {
      homeDir,
      app,
      klient,
      dispatcher,
      sessionId: created.id,
      agentScope: { sessionId: created.id, agentId: 'main' },
    };
  }

  async function teardown(ctx: Awaited<ReturnType<typeof setup>>): Promise<void> {
    await ctx.klient.session(ctx.sessionId).close();
    await ctx.klient.close();
    ctx.app.dispose();
    await rm(ctx.homeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  }

  it('rejects goal members that are not on the wire contract', async () => {
    const ctx = await setup();
    try {
      // A legitimate contract call still dispatches.
      await expect(
        ctx.dispatcher.call(ctx.agentScope, 'agentGoalService', 'getGoal', []),
      ).resolves.toEqual({ goal: null });

      // Engine-owned lifecycle transitions stay off the wire…
      for (const method of ['markComplete', 'markBlocked', 'pauseActiveGoal']) {
        await expect(
          ctx.dispatcher.call(ctx.agentScope, 'agentGoalService', method, []),
        ).rejects.toMatchObject({ name: 'RPCError', code: 40001 });
      }
      // …so do engine methods the contract never exposes…
      await expect(
        ctx.dispatcher.call(ctx.agentScope, 'agentGoalService', 'isGoalToolTarget', [1, 'g1']),
      ).rejects.toMatchObject({ name: 'RPCError', code: 40001 });
      // …and private getters are not property reads.
      await expect(
        ctx.dispatcher.call(ctx.agentScope, 'agentGoalService', 'goalState', []),
      ).rejects.toMatchObject({ name: 'RPCError', code: 40001 });
    } finally {
      await teardown(ctx);
    }
  });

  it('rejects smuggled extra arguments (the engine actor parameter)', async () => {
    const ctx = await setup();
    try {
      await ctx.dispatcher.call(ctx.agentScope, 'agentGoalService', 'createGoal', [
        { objective: 'guarded' },
      ]);
      // The wire tuple is exact-length: a trailing `actor` never reaches the engine.
      await expect(
        ctx.dispatcher.call(ctx.agentScope, 'agentGoalService', 'pauseGoal', [{}, 'model']),
      ).rejects.toMatchObject({
        name: 'RPCError',
        code: 40001,
        message: expect.stringContaining('input validation failed'),
      });
      // The goal is untouched: still active, not paused by a forged 'model' actor.
      await expect(
        ctx.dispatcher.call(ctx.agentScope, 'agentGoalService', 'getGoal', []),
      ).resolves.toMatchObject({ goal: { status: 'active' } });
    } finally {
      await teardown(ctx);
    }
  });

  it('rejects Research wire limits at the dispatcher boundary', async () => {
    const ctx = await setup();
    try {
      await expect(
        ctx.dispatcher.call(ctx.agentScope, 'agentResearchService', 'prepareResearchPlan', [
          {
            objective: '',
            steps: ['step'],
            expectedEvidence: ['evidence'],
            stopCondition: 'stop',
          },
        ]),
      ).rejects.toMatchObject({
        name: 'RPCError',
        code: 40001,
        message: expect.stringContaining('input validation failed'),
      });
      await expect(
        ctx.dispatcher.call(ctx.agentScope, 'agentResearchService', 'planAndStartAction', [
          {
            kind: 'experiment',
            purpose: 'purpose',
            stopCondition: 'stop',
            expectedEvidence: Array.from({ length: 51 }, () => 'evidence'),
          },
        ]),
      ).rejects.toMatchObject({ name: 'RPCError', code: 40001 });
    } finally {
      await teardown(ctx);
    }
  });

  it('rejects call/stream type mismatches', async () => {
    const ctx = await setup();
    try {
      // A streaming procedure cannot be invoked through call…
      await expect(
        ctx.dispatcher.call({}, 'modelResolver', 'generate', [
          'm',
          { systemPrompt: 's', messages: [] },
        ]),
      ).rejects.toMatchObject({ name: 'RPCError', code: 40001 });
      // …and a non-streaming procedure cannot be streamed (fails on first next).
      const iterator = ctx.dispatcher
        .stream({}, 'sessionIndex', 'list', [{}])
        [Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toMatchObject({ name: 'RPCError', code: 40001 });
    } finally {
      await teardown(ctx);
    }
  });
});
