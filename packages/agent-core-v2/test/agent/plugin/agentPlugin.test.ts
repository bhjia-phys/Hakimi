/**
 * Scenario: main-agent plugin session-start reminder wiring.
 *
 * Exercises initial injection and source-specific refresh behavior through the
 * real `AgentPluginService`, with plugin and session catalog boundaries stubbed.
 * Run: `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run
 * test/agent/plugin/agentPlugin.test.ts`.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { Emitter } from '#/_base/event';
import { IAgentPluginService } from '#/agent/plugin/agentPlugin';
import { AgentPluginService } from '#/agent/plugin/agentPluginService';
import { USER_PROMPT_ORIGIN } from '#/agent/contextMemory/types';
import { IAgentLoopService } from '#/agent/loop/loop';
import { IEventBus } from '#/app/event/eventBus';
import { IBootstrapService } from '#/app/bootstrap/bootstrap';
import { IPluginService } from '#/app/plugin/plugin';
import { PluginService } from '#/app/plugin/pluginService';
import type {
  EnabledPluginSessionStart,
  PluginMutationSummary,
  ReloadSummary,
} from '#/app/plugin/types';
import { ISkillDiscovery } from '#/app/skillCatalog/skillDiscovery';
import { InMemorySkillCatalog } from '#/app/skillCatalog/registry';
import { IProviderService } from '#/kosong/provider/provider';
import { summarizeSkill } from '#/app/skillCatalog/types';
import type { SkillDefinition } from '#/app/skillCatalog/types';
import { ISessionSkillCatalog } from '#/session/sessionSkillCatalog/skillCatalog';

import { agentService, appService, createTestAgent, skillServices, type TestAgentContext } from '../../harness';
import { stubBootstrap } from '../../app/bootstrap/stubs';
import { stubPluginService } from '../../app/plugin/stubs';
import { stubProviderService } from '../../app/provider/stubs';

function pluginSkill(): SkillDefinition {
  return {
    name: 'demo-skill',
    description: 'A plugin skill',
    path: '/plugins/demo/skills/demo-skill/SKILL.md',
    dir: '/plugins/demo/skills/demo-skill',
    content: 'Do the demo thing.',
    metadata: {},
    source: 'extra',
    plugin: { id: 'demo', instructions: 'Always be helpful.' },
  };
}

function findPluginSessionStartMessages(ctx: TestAgentContext) {
  return ctx.contextData().history.filter(
    (message) =>
      message.origin?.kind === 'injection' && message.origin.variant === 'plugin_session_start',
  );
}

function messageText(message: { readonly content: readonly { readonly type: string; readonly text?: string }[] }): string {
  return message.content.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('');
}

async function runInjectionBoundary(ctx: TestAgentContext): Promise<void> {
  await ctx.get(IAgentLoopService).hooks.onWillBeginStep.run({
    turnId: 0,
    step: 1,
    firstStepOfTurn: true,
    signal: new AbortController().signal,
  });
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

describe('AgentPluginService plugin session-start wiring', () => {
  let ctx: TestAgentContext | undefined;

  afterEach(async () => {
    if (ctx !== undefined) await ctx.dispose();
    ctx = undefined;
  });

  it('injects the plugin session-start reminder through the real service registration', async () => {
    const catalog = new InMemorySkillCatalog();
    catalog.register(pluginSkill());

    ctx = createTestAgent(
      { autoConfigure: true },
      appService(
        IPluginService,
        stubPluginService({ sessionStarts: [{ pluginId: 'demo', skillName: 'demo-skill' }] }),
      ),
      skillServices(catalog),
      agentService(
        IAgentPluginService,
        new SyncDescriptor(AgentPluginService),
      ),
    );

    ctx.get(IAgentPluginService);

    await runInjectionBoundary(ctx);

    const injected = findPluginSessionStartMessages(ctx).at(-1);
    expect(injected).toBeDefined();
    const text = injected === undefined ? '' : messageText(injected);
    expect(text).toContain('<plugin_session_start plugin="demo" skill="demo-skill">');
    expect(text).toContain('Do the demo thing.');
    expect(text).toContain('Always be helpful.');
  });

  it('does not re-inject the plugin session-start reminder on later turns while it remains live', async () => {
    const catalog = new InMemorySkillCatalog();
    catalog.register(pluginSkill());

    ctx = createTestAgent(
      { autoConfigure: true },
      appService(
        IPluginService,
        stubPluginService({ sessionStarts: [{ pluginId: 'demo', skillName: 'demo-skill' }] }),
      ),
      skillServices(catalog),
      agentService(
        IAgentPluginService,
        new SyncDescriptor(AgentPluginService),
      ),
    );

    ctx.get(IAgentPluginService);

    await runInjectionBoundary(ctx);
    ctx.get(IEventBus).publish({
      type: 'turn.started',
      turnId: 2,
      origin: USER_PROMPT_ORIGIN,
    });
    await runInjectionBoundary(ctx);

    expect(findPluginSessionStartMessages(ctx)).toHaveLength(1);
  });

  it('refreshes the frozen session-start guidance through the explicit service path', async () => {
    const catalog = new InMemorySkillCatalog();
    catalog.register(pluginSkill());

    ctx = createTestAgent(
      { autoConfigure: true },
      appService(
        IPluginService,
        stubPluginService({
          sessionStarts: [{ pluginId: 'demo', skillName: 'demo-skill' }],
        }),
      ),
      skillServices(catalog),
      agentService(IAgentPluginService, new SyncDescriptor(AgentPluginService)),
    );

    const plugins = ctx.get(IAgentPluginService);
    await runInjectionBoundary(ctx);
    expect(messageText(findPluginSessionStartMessages(ctx).at(-1)!)).toContain(
      'Do the demo thing.',
    );

    catalog.register(
      { ...pluginSkill(), content: 'Do the explicitly refreshed demo thing.' },
      { replace: true },
    );
    await plugins.refreshSessionStart();

    const messages = findPluginSessionStartMessages(ctx);
    expect(messages).toHaveLength(2);
    expect(messageText(messages.at(-1)!)).toContain(
      'Do the explicitly refreshed demo thing.',
    );
    expect(messageText(messages.at(-1)!)).toContain(
      'supersedes any earlier plugin_session_start reminder',
    );
  });

  it('does not inject when no plugin session starts are enabled', async () => {
    const catalog = new InMemorySkillCatalog();
    catalog.register(pluginSkill());

    ctx = createTestAgent(
      { autoConfigure: true },
      appService(IPluginService, stubPluginService({ sessionStarts: [] })),
      skillServices(catalog),
      agentService(
        IAgentPluginService,
        new SyncDescriptor(AgentPluginService),
      ),
    );

    ctx.get(IAgentPluginService);

    await runInjectionBoundary(ctx);

    expect(findPluginSessionStartMessages(ctx)).toHaveLength(0);
  });

  it('re-appends a fresh reminder when the plugin skill source finishes refreshing', async () => {
    const catalog = new InMemorySkillCatalog();
    catalog.register(pluginSkill());
    const sinkChange = new Emitter<string>();
    const skillCatalog: ISessionSkillCatalog = {
      _serviceBrand: undefined,
      catalog,
      ready: Promise.resolve(),
      onDidChange: sinkChange.event,
      load: async () => {},
      reload: async () => {},
      list: async () => catalog.listSkills().map(summarizeSkill),
    };

    ctx = createTestAgent(
      { autoConfigure: true },
      appService(
        IPluginService,
        stubPluginService({
          sessionStarts: [{ pluginId: 'demo', skillName: 'demo-skill' }],
        }),
      ),
      skillServices(skillCatalog),
      agentService(
        IAgentPluginService,
        new SyncDescriptor(AgentPluginService),
      ),
    );

    ctx.get(IAgentPluginService);

    await runInjectionBoundary(ctx);

    expect(findPluginSessionStartMessages(ctx)).toHaveLength(1);

    sinkChange.fire('plugin');
    expect(findPluginSessionStartMessages(ctx)).toHaveLength(1);
    await runInjectionBoundary(ctx);

    const messages = findPluginSessionStartMessages(ctx);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    const latest = messageText(messages.at(-1)!);
    expect(latest).toContain('<plugin_session_start plugin="demo" skill="demo-skill">');
    expect(latest).toContain('supersedes any earlier plugin_session_start reminder');
    sinkChange.dispose();
  });

  it('appends only for the plugin source when unrelated and plugin changes arrive together', async () => {
    const catalog = new InMemorySkillCatalog();
    catalog.register(pluginSkill());
    const sinkChange = new Emitter<string>();
    const skillCatalog: ISessionSkillCatalog = {
      _serviceBrand: undefined,
      catalog,
      ready: Promise.resolve(),
      onDidChange: sinkChange.event,
      load: async () => {},
      reload: async () => {},
      list: async () => catalog.listSkills().map(summarizeSkill),
    };

    ctx = createTestAgent(
      { autoConfigure: true },
      appService(
        IPluginService,
        stubPluginService({
          sessionStarts: [{ pluginId: 'demo', skillName: 'demo-skill' }],
        }),
      ),
      skillServices(skillCatalog),
      agentService(
        IAgentPluginService,
        new SyncDescriptor(AgentPluginService),
      ),
    );

    ctx.get(IAgentPluginService);

    await runInjectionBoundary(ctx);
    expect(findPluginSessionStartMessages(ctx)).toHaveLength(1);

    sinkChange.fire('user');
    sinkChange.fire('plugin');
    await runInjectionBoundary(ctx);

    expect(findPluginSessionStartMessages(ctx)).toHaveLength(2);
    sinkChange.dispose();
  });

  it('reconciles the current plugin guidance after undo removes its latest render', async () => {
    const catalog = new InMemorySkillCatalog();
    catalog.register(pluginSkill());
    const sinkChange = new Emitter<string>();
    const skillCatalog: ISessionSkillCatalog = {
      _serviceBrand: undefined,
      catalog,
      ready: Promise.resolve(),
      onDidChange: sinkChange.event,
      load: async () => {},
      reload: async () => {},
      list: async () => catalog.listSkills().map(summarizeSkill),
    };

    ctx = createTestAgent(
      { autoConfigure: true },
      appService(
        IPluginService,
        stubPluginService({
          sessionStarts: [{ pluginId: 'demo', skillName: 'demo-skill' }],
        }),
      ),
      skillServices(skillCatalog),
      agentService(IAgentPluginService, new SyncDescriptor(AgentPluginService)),
    );
    ctx.get(IAgentPluginService);

    ctx.mockNextResponse({ type: 'text', text: 'first answer' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'first prompt' }] });
    await ctx.untilTurnEnd();

    catalog.register(
      { ...pluginSkill(), content: 'Do the updated demo thing.' },
      { replace: true },
    );
    sinkChange.fire('plugin');
    ctx.mockNextResponse({ type: 'text', text: 'second answer' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'second prompt' }] });
    await ctx.untilTurnEnd();

    await ctx.undoHistory(1);
    ctx.mockNextResponse({ type: 'text', text: 'third answer' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'third prompt' }] });
    await ctx.untilTurnEnd();

    const latest = findPluginSessionStartMessages(ctx).at(-1);
    expect(latest).toBeDefined();
    expect(messageText(latest!)).toContain('Do the updated demo thing.');
    expect(messageText(latest!)).toContain(
      'supersedes any earlier plugin_session_start reminder',
    );
    sinkChange.dispose();
  });
});

describe('AgentPluginService plugin-change reminder', () => {
  let ctx: TestAgentContext | undefined;

  afterEach(async () => {
    if (ctx !== undefined) await ctx.dispose();
    ctx = undefined;
  });

  function findPluginChangeMessages(context: TestAgentContext) {
    return context.contextData().history.filter(
      (message) =>
        message.origin?.kind === 'injection' && message.origin.variant === 'plugin_change',
    );
  }

  it('appends a plugin_change system reminder when the plugin set mutates', async () => {
    const mutateEmitter = new Emitter<PluginMutationSummary>();
    ctx = createTestAgent(
      { autoConfigure: true },
      appService(IPluginService, stubPluginService({ sessionStarts: [], mutateEmitter })),
      skillServices(new InMemorySkillCatalog()),
      agentService(IAgentPluginService, new SyncDescriptor(AgentPluginService)),
    );
    ctx.get(IAgentPluginService);

    mutateEmitter.fire({
      added: [],
      removed: [],
      errors: [],
      mutation: { kind: 'enable', id: 'demo' },
    });

    const messages = findPluginChangeMessages(ctx);
    expect(messages).toHaveLength(1);
    expect(messageText(messages[0]!)).toContain('Plugin "demo" was enabled.');
    expect(messageText(messages[0]!)).toContain('run /new or /reload to apply the change');
    mutateEmitter.dispose();
  });

  it('does not append the plugin_change reminder on an explicit reload', async () => {
    const reloadEmitter = new Emitter<ReloadSummary>();
    ctx = createTestAgent(
      { autoConfigure: true },
      appService(IPluginService, stubPluginService({ sessionStarts: [], reloadEmitter })),
      skillServices(new InMemorySkillCatalog()),
      agentService(IAgentPluginService, new SyncDescriptor(AgentPluginService)),
    );
    ctx.get(IAgentPluginService);

    reloadEmitter.fire({ added: [], removed: [], errors: [] });

    expect(findPluginChangeMessages(ctx)).toHaveLength(0);
    reloadEmitter.dispose();
  });

  it('clears a stale mutation marker before an explicit reload catalog change', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kimi-agent-plugin-home-'));
    try {
      const pluginRoot = join(home, 'demo-plugin');
      await mkdir(join(home, 'plugins'), { recursive: true });
      await mkdir(pluginRoot, { recursive: true });
      await writeFile(
        join(pluginRoot, 'kimi.plugin.json'),
        JSON.stringify({ name: 'demo', sessionStart: { skill: 'demo-skill' } }),
        'utf8',
      );
      await writeFile(
        join(home, 'plugins', 'installed.json'),
        JSON.stringify({
          version: 1,
          plugins: [
            {
              id: 'demo',
              root: pluginRoot,
              source: 'local-path',
              enabled: true,
              installedAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              originalSource: pluginRoot,
            },
          ],
        }),
        'utf8',
      );

      const catalog = new InMemorySkillCatalog();
      catalog.register(pluginSkill());
      const sinkChange = new Emitter<string>();
      ctx = createTestAgent(
        { autoConfigure: true },
        appService(IBootstrapService, stubBootstrap(home)),
        appService(
          IProviderService,
          stubProviderService({
            'test-provider': {
              type: 'kimi',
              apiKey: 'test-key',
              baseUrl: 'https://api.example.test/v1',
              modelSource: 'static',
            },
          }),
        ),
        appService(ISkillDiscovery, {
          _serviceBrand: undefined,
          discover: async () => ({
            skills: [],
            skipped: [],
            scannedRoots: [],
            scannedDirectories: [],
          }),
        }),
        appService(IPluginService, new SyncDescriptor(PluginService)),
        skillServices(skillCatalogWithChange(catalog, sinkChange)),
        agentService(IAgentPluginService, new SyncDescriptor(AgentPluginService)),
      );
      const plugins = ctx.get(IPluginService);
      ctx.get(IAgentPluginService);
      await runInjectionBoundary(ctx);
      expect(findPluginSessionStartMessages(ctx)).toHaveLength(1);

      // A real mutation emits both reload and mutation notifications. The
      // catalog source is deliberately quiet, so the mutation marker remains
      // pending until the explicit reload below supersedes it.
      await plugins.setPluginEnabled({ id: 'demo', enabled: false });
      await plugins.reloadPlugins();

      sinkChange.fire('plugin');
      await runInjectionBoundary(ctx);

      expect(findPluginSessionStartMessages(ctx)).toHaveLength(2);
      expect(messageText(findPluginSessionStartMessages(ctx).at(-1)!)).toContain(
        'There are currently no active plugin session starts.',
      );
      sinkChange.dispose();
    } finally {
      if (ctx !== undefined) {
        await ctx.dispose();
        ctx = undefined;
      }
      await rm(home, { recursive: true, force: true });
    }
  });

  function skillCatalogWithChange(catalog: InMemorySkillCatalog, change: Emitter<string>) {
    const skillCatalog: ISessionSkillCatalog = {
      _serviceBrand: undefined,
      catalog,
      ready: Promise.resolve(),
      onDidChange: change.event,
      load: async () => {},
      reload: async () => {},
      list: async () => catalog.listSkills().map(summarizeSkill),
    };
    return skillCatalog;
  }

  function fireMutation(mutateEmitter: Emitter<PluginMutationSummary>, id: string): void {
    mutateEmitter.fire({
      added: [],
      removed: [],
      errors: [],
      mutation: { kind: 'install', id },
    });
  }

  it('suppresses the session-start refresh for mutation-driven catalog changes', async () => {
    const catalog = new InMemorySkillCatalog();
    catalog.register(pluginSkill());
    const sinkChange = new Emitter<string>();
    const mutateEmitter = new Emitter<PluginMutationSummary>();
    let sessionStarts: readonly EnabledPluginSessionStart[] = [
      { pluginId: 'demo', skillName: 'demo-skill' },
    ];
    ctx = createTestAgent(
      { autoConfigure: true },
      appService(
        IPluginService,
        {
          ...stubPluginService({ sessionStarts, mutateEmitter }),
          enabledSessionStarts: async () => sessionStarts,
        },
      ),
      skillServices(skillCatalogWithChange(catalog, sinkChange)),
      agentService(IAgentPluginService, new SyncDescriptor(AgentPluginService)),
    );
    ctx.get(IAgentPluginService);
    await runInjectionBoundary(ctx);
    expect(findPluginSessionStartMessages(ctx)).toHaveLength(1);

    // Production ordering: onDidMutate fires synchronously inside the
    // mutation's onDidReload; the catalog change arrives after the async
    // re-scan.
    fireMutation(mutateEmitter, 'demo');
    sessionStarts = [];
    sinkChange.fire('plugin');
    await runInjectionBoundary(ctx);

    expect(findPluginChangeMessages(ctx)).toHaveLength(1);
    expect(findPluginSessionStartMessages(ctx)).toHaveLength(1);

    // An explicit reload (no mutation) still refreshes the guidance: the
    // catalog change sets the refresh signal and the next injection boundary
    // re-renders with the supersedes suffix.
    sinkChange.fire('plugin');
    await runInjectionBoundary(ctx);
    expect(findPluginSessionStartMessages(ctx).length).toBeGreaterThanOrEqual(2);

    sinkChange.dispose();
    mutateEmitter.dispose();
  });

  it('suppresses one session-start refresh per mutation when mutations arrive back to back', async () => {
    const catalog = new InMemorySkillCatalog();
    catalog.register(pluginSkill());
    const sinkChange = new Emitter<string>();
    const mutateEmitter = new Emitter<PluginMutationSummary>();
    ctx = createTestAgent(
      { autoConfigure: true },
      appService(
        IPluginService,
        stubPluginService({
          sessionStarts: [{ pluginId: 'demo', skillName: 'demo-skill' }],
          mutateEmitter,
        }),
      ),
      skillServices(skillCatalogWithChange(catalog, sinkChange)),
      agentService(IAgentPluginService, new SyncDescriptor(AgentPluginService)),
    );
    ctx.get(IAgentPluginService);
    await runInjectionBoundary(ctx);
    expect(findPluginSessionStartMessages(ctx)).toHaveLength(1);

    fireMutation(mutateEmitter, 'demo');
    fireMutation(mutateEmitter, 'demo');
    sinkChange.fire('plugin');
    sinkChange.fire('plugin');
    await flushMicrotasks();

    expect(findPluginChangeMessages(ctx)).toHaveLength(2);
    expect(findPluginSessionStartMessages(ctx)).toHaveLength(1);

    sinkChange.dispose();
    mutateEmitter.dispose();
  });
});
