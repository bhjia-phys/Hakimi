/**
 * Scenario: plugin session-start rendering and restored-history deduplication.
 *
 * Exercises the real agent injection and wire replay path through the shared
 * test-agent harness, with plugin contributions supplied in memory.
 * Run: `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run
 * test/app/skillCatalog/plugin-session-start.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { Emitter, Event } from '#/_base/event';
import { SyncDescriptor } from '#/_base/di/descriptors';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { IAgentProfileService } from '#/agent/profile/profile';
import { IAgentSkillVisibilityService } from '#/agent/skillVisibility/skillVisibility';
import { AgentSkillVisibilityService } from '#/agent/skillVisibility/skillVisibilityService';
import type { ContextMessage } from '#/agent/contextMemory/types';
import { DEFAULT_AGENT_PROFILE_NAME } from '#/app/agentProfileCatalog/agentProfileCatalog';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import type { LogContext, LogPayload } from '#/_base/log/log';
import { IPluginService } from '#/app/plugin/plugin';
import type { EnabledPluginSessionStart } from '#/app/plugin/types';
import { InMemorySkillCatalog } from '#/app/skillCatalog/registry';
import type { SkillDefinition } from '#/app/skillCatalog/types';
import {
  agentService,
  appService,
  logServices,
  sessionService,
  skillServices,
  testAgent,
  createTestAgent,
} from '../../harness';
import { stubPluginService } from '../plugin/stubs';
import { stubSkill } from './stubs';

interface CapturedWarn {
  readonly message: string;
  readonly payload?: LogPayload;
}

interface RecordingLogger {
  warn(message: string, payload?: LogPayload): void;
  info(message: string, payload?: LogPayload): void;
  debug(message: string, payload?: LogPayload): void;
  error(message: string, payload?: LogPayload): void;
  createChild(ctx: LogContext): RecordingLogger;
}

const CURRENT_PLUGIN_SESSION_START_REMINDER = `<system-reminder>
<plugin_session_start plugin="superpowers" skill="using-superpowers">
body
</plugin_session_start>
</system-reminder>`;

function skill(
  name: string,
  body: string,
  plugin?: SkillDefinition['plugin'],
): SkillDefinition {
  return stubSkill(name, {
    description: '',
    path: `/fake/${name}/SKILL.md`,
    dir: `/fake/${name}`,
    content: body,
    metadata: {},
    source: 'extra',
    plugin,
  });
}

function recordingLogger(warnings: CapturedWarn[]): RecordingLogger {
  return {
    warn: (message, payload) => {
      warnings.push({ message, payload });
    },
    info: () => {},
    debug: () => {},
    error: () => {},
    createChild: (_ctx: LogContext) => recordingLogger(warnings),
  };
}

function sessionStartRuntime(input: {
  readonly sessionStarts: readonly EnabledPluginSessionStart[];
  readonly skills: readonly SkillDefinition[];
  readonly history?: readonly ContextMessage[];
  readonly visibility?: IAgentSkillVisibilityService;
}): {
  readonly ctx: ReturnType<typeof testAgent>;
  readonly warnings: readonly CapturedWarn[];
} {
  const warnings: CapturedWarn[] = [];
  const skills = new InMemorySkillCatalog();
  for (const skill of input.skills) {
    skills.register(skill);
  }
  const ctx = testAgent(
    appService(IPluginService, stubPluginService({ sessionStarts: input.sessionStarts })),
    skillServices(skills),
    logServices(recordingLogger(warnings)),
    ...(input.visibility === undefined ? [] : [agentService(IAgentSkillVisibilityService, input.visibility)]),
  );
  if (input.history !== undefined) {
    ctx.context.append(...input.history);
  }
  return { ctx, warnings };
}

async function injectDynamic(ctx: ReturnType<typeof testAgent>): Promise<void> {
  await ctx.get(IAgentContextInjectorService).reconcileWhenIdle('plugin_session_start');
}

async function injectAitpVisibility(ctx: ReturnType<typeof testAgent>): Promise<void> {
  await ctx.get(IAgentContextInjectorService).reconcileWhenIdle('aitp_skill_visibility');
}

function lastReminder(ctx: ReturnType<typeof testAgent>): string {
  const last = ctx.context.get().findLast((message) => message.role === 'user');
  return last?.content.map((part) => (part.type === 'text' ? part.text : '')).join('') ?? '';
}

function messageText(message: { readonly content: readonly { readonly type: string; readonly text?: string }[] }): string {
  return message.content.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('');
}

function pluginSessionStartMessages(ctx: ReturnType<typeof testAgent>) {
  return ctx.context.get().filter(
    (message) =>
      message.origin?.kind === 'injection' && message.origin.variant === 'plugin_session_start',
  );
}

function aitpSkillVisibilityMessages(ctx: ReturnType<typeof testAgent>) {
  return ctx.context.get().filter(
    (message) =>
      message.origin?.kind === 'injection' && message.origin.variant === 'aitp_skill_visibility',
  );
}

describe('plugin session-start dynamic injection', () => {
  it('injects one <plugin_session_start> block per declared sessionStart on first call', async () => {
    const { ctx } = sessionStartRuntime({
      sessionStarts: [{ pluginId: 'superpowers', skillName: 'using-superpowers' }],
      skills: [
        skill('using-superpowers', 'body of skill', {
          id: 'superpowers',
          instructions: 'Use AskUserQuestion and TodoList.',
        }),
      ],
    });

    await injectDynamic(ctx);

    const text = lastReminder(ctx);
    expect(text).toContain('<plugin_session_start plugin="superpowers" skill="using-superpowers">');
    expect(text).toContain('<plugin-instructions plugin="superpowers">');
    expect(text).toContain('AskUserQuestion');
    expect(text).toContain('TodoList');
    expect(text).toContain('body of skill');
    expect(text).toContain('</plugin_session_start>');
    expect(ctx.context.get().at(-1)?.origin).toEqual({
      kind: 'injection',
      variant: 'plugin_session_start',
    });
  });

  it('does not inject active-only plugin session starts while AITP mode is inactive', async () => {
    const modeChange = new Emitter<void>();
    const active = false;
    const visibility: IAgentSkillVisibilityService = {
      _serviceBrand: undefined,
      onDidChange: modeChange.event,
      isSkillVisible: (candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol',
      isSkillVisibleInFrozenListing: (candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol',
      hiddenReason: () => undefined,
      filterVisible: (skills) => skills.filter((candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol'),
    };
    const { ctx, warnings } = sessionStartRuntime({
      sessionStarts: [{ pluginId: 'aitp-research-protocol', skillName: 'aitp' }],
      skills: [skill('aitp', 'AITP guidance', { id: 'aitp-research-protocol' })],
      visibility,
    });

    await injectDynamic(ctx);

    expect(pluginSessionStartMessages(ctx)).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('neutralizes active-only plugin session starts after AITP mode exits', async () => {
    const modeChange = new Emitter<void>();
    let active = true;
    const visibility: IAgentSkillVisibilityService = {
      _serviceBrand: undefined,
      onDidChange: modeChange.event,
      isSkillVisible: (candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol',
      isSkillVisibleInFrozenListing: (candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol',
      hiddenReason: () => undefined,
      filterVisible: (skills) => skills.filter((candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol'),
    };
    const { ctx } = sessionStartRuntime({
      sessionStarts: [{ pluginId: 'aitp-research-protocol', skillName: 'aitp' }],
      skills: [skill('aitp', 'AITP guidance', { id: 'aitp-research-protocol' })],
      visibility,
    });

    await injectDynamic(ctx);
    expect(lastReminder(ctx)).toContain('AITP guidance');

    active = false;
    modeChange.fire();
    await injectDynamic(ctx);

    expect(lastReminder(ctx)).toContain('no active plugin session starts');
    expect(lastReminder(ctx)).toContain('supersedes any earlier plugin_session_start reminder');
  });

  it('adds the dynamic AITP model skill listing when the mode enters', async () => {
    const modeChange = new Emitter<void>();
    let active = false;
    const visibility: IAgentSkillVisibilityService = {
      _serviceBrand: undefined,
      onDidChange: modeChange.event,
      isSkillVisible: (candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol',
      isSkillVisibleInFrozenListing: (candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol',
      hiddenReason: () => undefined,
      filterVisible: (skills) => skills.filter((candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol'),
    };
    const { ctx } = sessionStartRuntime({
      sessionStarts: [],
      skills: [skill('aitp', 'AITP listing body', { id: 'aitp-research-protocol' })],
      visibility,
    });

    await injectAitpVisibility(ctx);
    expect(aitpSkillVisibilityMessages(ctx)).toHaveLength(0);

    active = true;
    modeChange.fire();
    await injectAitpVisibility(ctx);
    const listing = aitpSkillVisibilityMessages(ctx).at(-1);
    expect(listing).toBeDefined();
    expect(messageText(listing!)).toContain('aitp');
    expect(messageText(listing!)).toContain('/fake/aitp/SKILL.md');
  });

  it('neutralizes the dynamic AITP model skill listing when the mode exits', async () => {
    const modeChange = new Emitter<void>();
    let active = true;
    const visibility: IAgentSkillVisibilityService = {
      _serviceBrand: undefined,
      onDidChange: modeChange.event,
      isSkillVisible: (candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol',
      isSkillVisibleInFrozenListing: (candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol',
      hiddenReason: () => undefined,
      filterVisible: (skills) => skills.filter((candidate) => active || candidate.plugin?.id !== 'aitp-research-protocol'),
    };
    const { ctx } = sessionStartRuntime({
      sessionStarts: [],
      skills: [skill('aitp', 'AITP listing body', { id: 'aitp-research-protocol' })],
      visibility,
    });

    await injectAitpVisibility(ctx);
    expect(aitpSkillVisibilityMessages(ctx)).toHaveLength(1);

    active = false;
    modeChange.fire();
    await injectAitpVisibility(ctx);
    const neutralizer = aitpSkillVisibilityMessages(ctx).at(-1);
    expect(messageText(neutralizer!)).toContain('no active AITP Research skills');
    expect(messageText(neutralizer!)).toContain('supersedes any earlier aitp_skill_visibility reminder');
  });

  it('does not hard-code Superpowers guidance when the skill has no plugin instructions', async () => {
    const { ctx } = sessionStartRuntime({
      sessionStarts: [{ pluginId: 'superpowers', skillName: 'using-superpowers' }],
      skills: [skill('using-superpowers', 'body', { id: 'superpowers' })],
    });

    await injectDynamic(ctx);

    const text = lastReminder(ctx);
    expect(text).toContain('<plugin_session_start plugin="superpowers" skill="using-superpowers">');
    expect(text).toContain('body');
    expect(text).not.toContain('<plugin-instructions plugin="superpowers">');
    expect(text).not.toContain('AskUserQuestion');
  });

  it('does not re-inject on subsequent calls within the same session', async () => {
    const { ctx } = sessionStartRuntime({
      sessionStarts: [{ pluginId: 'superpowers', skillName: 'using-superpowers' }],
      skills: [skill('using-superpowers', 'body', { id: 'superpowers' })],
    });

    await injectDynamic(ctx);
    await injectDynamic(ctx);

    expect(pluginSessionStartMessages(ctx)).toHaveLength(1);
  });

  it('does not re-inject when live-spliced history contains the current plugin sessionStart', async () => {
    const { ctx } = sessionStartRuntime({
      sessionStarts: [{ pluginId: 'superpowers', skillName: 'using-superpowers' }],
      skills: [skill('using-superpowers', 'body', { id: 'superpowers' })],
      history: [
        {
          role: 'user',
          content: [{ type: 'text', text: CURRENT_PLUGIN_SESSION_START_REMINDER }],
          toolCalls: [],
          origin: { kind: 'injection', variant: 'plugin_session_start' },
        },
      ],
    });

    await injectDynamic(ctx);

    expect(pluginSessionStartMessages(ctx)).toHaveLength(1);
  });

  it('does not re-inject after wire replay restores the current plugin sessionStart', async () => {
    const { ctx } = sessionStartRuntime({
      sessionStarts: [{ pluginId: 'superpowers', skillName: 'using-superpowers' }],
      skills: [skill('using-superpowers', 'body', { id: 'superpowers' })],
    });

    await ctx.restore([{
      type: 'context.append_message',
      time: 1,
      message: {
        role: 'user',
        content: [{ type: 'text', text: CURRENT_PLUGIN_SESSION_START_REMINDER }],
        toolCalls: [],
        origin: { kind: 'injection', variant: 'plugin_session_start' },
      },
    }]);

    await injectDynamic(ctx);

    expect(pluginSessionStartMessages(ctx)).toHaveLength(1);
  });

  it('skips a sessionStart whose skill is not registered and warns', async () => {
    const { ctx, warnings } = sessionStartRuntime({
      sessionStarts: [
        { pluginId: 'demo', skillName: 'missing' },
        { pluginId: 'superpowers', skillName: 'using-superpowers' },
      ],
      skills: [skill('using-superpowers', 'body', { id: 'superpowers' })],
    });

    await injectDynamic(ctx);

    const text = lastReminder(ctx);
    expect(text).not.toContain('plugin="demo"');
    expect(text).toContain('plugin="superpowers"');
    expect(warnings).toContainEqual(
      expect.objectContaining({
        message: 'plugin sessionStart skill not found',
        payload: expect.objectContaining({ pluginId: 'demo', skillName: 'missing' }),
      }),
    );
  });

  it('warns only once for a missing skill across repeated reconciliations', async () => {
    const { ctx, warnings } = sessionStartRuntime({
      sessionStarts: [{ pluginId: 'demo', skillName: 'missing' }],
      skills: [],
    });

    await injectDynamic(ctx);
    await injectDynamic(ctx);
    await injectDynamic(ctx);

    expect(
      warnings.filter((warning) => warning.message === 'plugin sessionStart skill not found'),
    ).toHaveLength(1);
  });

  it('emits nothing when no sessionStart declarations are present', async () => {
    const { ctx } = sessionStartRuntime({ sessionStarts: [], skills: [] });

    await injectDynamic(ctx);

    expect(ctx.context.get()).toEqual([]);
  });

  it('resolves sessionStart skills by plugin identity when names collide', async () => {
    const { ctx } = sessionStartRuntime({
      sessionStarts: [{ pluginId: 'superpowers', skillName: 'using-superpowers' }],
      skills: [
        skill('using-superpowers', 'project body'),
        skill('using-superpowers', 'plugin body', { id: 'superpowers' }),
      ],
    });

    await injectDynamic(ctx);

    const text = lastReminder(ctx);
    expect(text).toContain('plugin body');
    expect(text).not.toContain('project body');
  });
});

describe('AITP skill visibility feature wiring', () => {
  it('keeps AITP skills dynamic-only while preserving ordinary skills', async () => {
    const catalog = new InMemorySkillCatalog();
    const aitpSkill = skill('aitp', 'AITP listing body', { id: 'aitp-research-protocol' });
    const ordinarySkill = skill('ordinary', 'ordinary listing body');
    catalog.register(aitpSkill);
    catalog.register(ordinarySkill);

    const adapter = {
      _serviceBrand: undefined,
      health: { phase: 'ready', contractVersion: '0.1' },
      probe: async () => ({ phase: 'ready', contractVersion: '0.1' }),
      reset: () => {},
      isReady: () => true,
      isDegraded: () => false,
      resolveContractIdentity: () => null,
    } as unknown as ISessionAitpAdapter;
    const ctx = createTestAgent(
      { autoConfigure: true },
      skillServices(catalog),
      agentService(
        IAgentSkillVisibilityService,
        new SyncDescriptor(AgentSkillVisibilityService),
      ),
      sessionService(ISessionAitpAdapter, adapter),
    );

    try {
      const profile = ctx.get(IAgentProfileService);
      const visibility = ctx.get(IAgentSkillVisibilityService);
      const mode = ctx.get(IAgentAitpModeService);
      const injector = ctx.get(IAgentContextInjectorService);
      await profile.bind({ profile: DEFAULT_AGENT_PROFILE_NAME, model: 'mock-model' });

      expect(visibility.isSkillVisible(aitpSkill)).toBe(false);
      expect(visibility.isSkillVisible(ordinarySkill)).toBe(true);
      expect(profile.getSystemPrompt()).not.toContain('/fake/aitp/SKILL.md');
      expect(profile.getSystemPrompt()).toContain('/fake/ordinary/SKILL.md');

      let visibilityChanges = 0;
      const visibilitySubscription = visibility.onDidChange(() => visibilityChanges++);
      await mode.enter({ actor: 'user' });
      expect(visibilityChanges).toBe(1);
      expect(visibility.isSkillVisible(aitpSkill)).toBe(true);
      expect(visibility.isSkillVisibleInFrozenListing(aitpSkill)).toBe(false);
      expect(profile.getSystemPrompt()).not.toContain('/fake/aitp/SKILL.md');

      await injector.reconcileWhenIdle('aitp_skill_visibility');
      const activeListing = aitpSkillVisibilityMessages(ctx).at(-1);
      expect(activeListing).toBeDefined();
      expect(messageText(activeListing!)).toContain('aitp');
      expect(messageText(activeListing!)).toContain('/fake/aitp/SKILL.md');
      expect(messageText(activeListing!)).not.toContain('/fake/ordinary/SKILL.md');

      await mode.exit();
      expect(visibilityChanges).toBe(2);
      expect(visibility.isSkillVisible(aitpSkill)).toBe(false);
      expect(visibility.isSkillVisible(ordinarySkill)).toBe(true);
      await injector.reconcileWhenIdle('aitp_skill_visibility');
      const neutralizer = aitpSkillVisibilityMessages(ctx).at(-1);
      expect(neutralizer).toBeDefined();
      expect(messageText(neutralizer!)).toContain('no active AITP Research skills');
      expect(messageText(neutralizer!)).toContain(
        'supersedes any earlier aitp_skill_visibility reminder',
      );
      visibilitySubscription.dispose();
    } finally {
      await ctx.dispose();
    }
  });
});
