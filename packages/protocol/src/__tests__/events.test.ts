import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  GOAL_MUTATION_MAX_AT,
  agentEventSchema,
  assistantDeltaEventSchema,
  eventSchema,
  goalMutationSchema,
  goalWaitLeaseSchema,
  shellCompletedEventSchema,
  toolCallStartedEventSchema,
} from '../events';
import type { Event } from '../events';
import type { ToolInputDisplay } from '../display';

type _AssertEventNonNever = Event extends never ? never : true;
const _assertEvent: _AssertEventNonNever = true;

type _AssertToolInputDisplayNonNever = ToolInputDisplay extends never ? never : true;
const _assertDisplay: _AssertToolInputDisplayNonNever = true;

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const sdkPackageName = ['@moonshot-ai', 'kimi-code-sdk'].join('/');

function readPackageFiles(): string {
  const files = ['package.json', ...sourceFiles(join(packageRoot, 'src'))];
  return files
    .map((file) => readFileSync(join(packageRoot, file), 'utf8'))
    .join('\n');
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(relative(packageRoot, full));
    }
  }
  return files;
}

describe('events / display re-exports', () => {
  it('does not depend on the node SDK package', () => {
    expect(readPackageFiles()).not.toContain(sdkPackageName);
  });

  it('Event re-export is non-never (compile-time check passed)', () => {
    expect(_assertEvent).toBe(true);
  });

  it('ToolInputDisplay re-export is non-never (12-arm union preserved)', () => {
    expect(_assertDisplay).toBe(true);
  });

  it('validates concrete agent event payloads with Zod schemas', () => {
    expect(
      assistantDeltaEventSchema.parse({
        type: 'assistant.delta',
        turnId: 1,
        delta: 'hello',
      }),
    ).toEqual({
      type: 'assistant.delta',
      turnId: 1,
      delta: 'hello',
    });

    expect(
      toolCallStartedEventSchema.safeParse({
        type: 'tool.call.started',
        turnId: 1,
        toolCallId: 'call_1',
        name: 'bash',
        args: { command: 'pwd' },
        display: { kind: 'command', command: 'pwd', language: 'bash' },
      }).success,
    ).toBe(true);

    expect(
      shellCompletedEventSchema.parse({
        type: 'shell.completed',
        commandId: 'cmd-1',
        isError: false,
      }),
    ).toEqual({ type: 'shell.completed', commandId: 'cmd-1', isError: false });
    expect(
      agentEventSchema.safeParse({
        type: 'shell.completed',
        commandId: 'cmd-1',
        isError: true,
        taskId: 'task-1',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown event types through the full agent event union', () => {
    expect(
      agentEventSchema.safeParse({
        type: 'unknown.event',
        turnId: 1,
      }).success,
    ).toBe(false);
  });

  it('validates session-scoped daemon events with agentId and sessionId', () => {
    const parsed = eventSchema.parse({
      type: 'turn.started',
      agentId: 'agent_1',
      sessionId: 'sess_1',
      turnId: 1,
      origin: { kind: 'user' },
    });

    expect(parsed.agentId).toBe('agent_1');
    expect(parsed.sessionId).toBe('sess_1');
  });

  it('round-trips goal.updated with its mutation payload', () => {
    const mutation = {
      id: 'mutation-1',
      at: 1000,
      kind: 'update',
      goalId: 'g1',
      status: 'blocked',
    } as const;
    const parsed = eventSchema.parse({
      type: 'goal.updated',
      agentId: 'main',
      sessionId: 'sess_1',
      snapshot: null,
      mutation,
    });

    expect(parsed.type).toBe('goal.updated');
    expect((parsed as { mutation?: unknown }).mutation).toEqual(mutation);

    // The epoch floor round-trips too.
    const atZero = eventSchema.parse({
      type: 'goal.updated',
      agentId: 'main',
      sessionId: 'sess_1',
      snapshot: null,
      mutation: { ...mutation, at: 0 },
    });
    expect((atZero as { mutation?: { at: number } }).mutation?.at).toBe(0);
  });

  it('validates bounded strict goal wait leases', () => {
    const valid = { taskIds: ['task-1'], policy: 'any' as const };
    expect(goalWaitLeaseSchema.parse(valid)).toEqual(valid);
    expect(goalWaitLeaseSchema.safeParse({ taskIds: [], policy: 'any' }).success).toBe(false);
    expect(goalWaitLeaseSchema.safeParse({ taskIds: [''], policy: 'any' }).success).toBe(false);
    expect(
      goalWaitLeaseSchema.safeParse({
        taskIds: Array.from({ length: 33 }, (_, index) => `task-${index}`),
        policy: 'all',
      }).success,
    ).toBe(false);
    expect(goalWaitLeaseSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  it('rejects goal.updated mutations whose `at` leaves the valid Date range', () => {
    const base = {
      type: 'goal.updated',
      agentId: 'main',
      sessionId: 'sess_1',
      snapshot: null,
      mutation: { id: 'mutation-1', kind: 'update', goalId: 'g1' },
    };
    // Negative, beyond the Date epoch ceiling, and one past the exact ceiling
    // (8_640_000_000_000_000 is still a valid Date) all fail.
    for (const at of [-1, 1e30, GOAL_MUTATION_MAX_AT + 1]) {
      expect(
        eventSchema.safeParse({ ...base, mutation: { ...base.mutation, at } }).success,
      ).toBe(false);
    }
    // The exact ceiling still parses.
    expect(
      eventSchema.safeParse({
        ...base,
        mutation: { ...base.mutation, at: GOAL_MUTATION_MAX_AT },
      }).success,
    ).toBe(true);
  });

  it('exposes the goal mutation `at` ceiling in the JSON Schema output', () => {
    // The AsyncAPI/JSON-Schema surface must carry the bound explicitly, not
    // just the runtime refine.
    const json = z.toJSONSchema(goalMutationSchema, {
      target: 'draft-7',
      io: 'input',
      unrepresentable: 'any',
    }) as { properties?: Record<string, unknown> };
    expect(json.properties?.['at']).toMatchObject({ maximum: GOAL_MUTATION_MAX_AT });
  });

  it('validates prompt.submitted events', () => {
    const parsed = eventSchema.parse({
      type: 'prompt.submitted',
      agentId: 'main',
      sessionId: 'sess_1',
      promptId: 'prompt_1',
      userMessageId: 'msg_1',
      status: 'blocked',
      content: [{ type: 'text', text: 'hello' }],
      createdAt: '2026-06-11T00:00:00.000Z',
    });

    expect(parsed.type).toBe('prompt.submitted');
    expect((parsed as { promptId: string }).promptId).toBe('prompt_1');
    expect((parsed as { status: string }).status).toBe('blocked');
  });

  it('preserves detached on task events', () => {
    const parsed = eventSchema.parse({
      type: 'task.started',
      agentId: 'main',
      sessionId: 'sess_1',
      info: {
        kind: 'process',
        taskId: 'bash-deadbeef',
        description: 'Bash: sleep 10',
        status: 'running',
        detached: false,
        startedAt: 1,
        endedAt: null,
        command: 'sleep 10',
        pid: 123,
        exitCode: null,
      },
    });

    expect(parsed.type).toBe('task.started');
    expect((parsed as { info: { detached?: boolean } }).info.detached).toBe(false);
  });

  it('validates event.session.created events', () => {
    const parsed = eventSchema.parse({
      type: 'event.session.created',
      agentId: 'main',
      sessionId: 'sess_1',
      session: {
        id: 'sess_1',
        workspace_id: 'wd_project_123456abcdef',
        title: 'Created session',
        created_at: '2026-06-11T00:00:00.000Z',
        updated_at: '2026-06-11T00:00:00.000Z',
        busy: false,
        metadata: { cwd: '/tmp/project' },
        agent_config: { model: 'kimi-k2' },
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          total_cost_usd: 0,
          context_tokens: 0,
          context_limit: 0,
          turn_count: 0,
        },
        permission_rules: [],
        message_count: 0,
        last_seq: 0,
      },
    });

    expect(parsed.type).toBe('event.session.created');
    expect((parsed as { session: { id: string } }).session.id).toBe('sess_1');
  });

  it('validates workspace lifecycle events', () => {
    const workspace = {
      id: 'wd_project_123456abcdef',
      root: '/tmp/project',
      name: 'project',
      created_at: '2026-06-11T00:00:00.000Z',
      last_opened_at: '2026-06-11T00:00:00.000Z',
      session_count: 1,
    };

    const created = eventSchema.parse({
      type: 'event.workspace.created',
      agentId: 'main',
      sessionId: '__global__',
      workspace,
    });
    expect(created.type).toBe('event.workspace.created');

    const updated = eventSchema.parse({
      type: 'event.workspace.updated',
      agentId: 'main',
      sessionId: '__global__',
      workspace: { ...workspace, name: 'renamed' },
    });
    expect(updated.type).toBe('event.workspace.updated');

    const deleted = eventSchema.parse({
      type: 'event.workspace.deleted',
      agentId: 'main',
      sessionId: '__global__',
      workspace_id: workspace.id,
      root: workspace.root,
    });
    expect(deleted.type).toBe('event.workspace.deleted');
    expect((deleted as { root: string }).root).toBe('/tmp/project');
  });

  it('validates event.session.status_changed events', () => {
    const parsed = eventSchema.parse({
      type: 'event.session.status_changed',
      agentId: 'main',
      sessionId: 'sess_1',
      status: 'running',
      previous_status: 'idle',
      current_prompt_id: 'prompt_1',
    });

    expect(parsed.type).toBe('event.session.status_changed');
    expect((parsed as { status: string }).status).toBe('running');
    expect((parsed as { previous_status: string }).previous_status).toBe('idle');
    expect((parsed as { current_prompt_id: string }).current_prompt_id).toBe('prompt_1');
  });

  it('validates orthogonal session work facts for unsubscribed clients', () => {
    const parsed = eventSchema.parse({
      type: 'event.session.work_changed',
      agentId: 'main',
      sessionId: 'sess_1',
      busy: true,
      main_turn_active: false,
      pending_interaction: 'question',
      last_turn_reason: 'completed',
    });

    expect(parsed).toMatchObject({
      main_turn_active: false,
      pending_interaction: 'question',
    });
  });

  it('rejects event.session.status_changed with invalid status', () => {
    expect(
      eventSchema.safeParse({
        type: 'event.session.status_changed',
        agentId: 'main',
        sessionId: 'sess_1',
        status: 'unknown',
        previous_status: 'idle',
      }).success,
    ).toBe(false);
  });
});
