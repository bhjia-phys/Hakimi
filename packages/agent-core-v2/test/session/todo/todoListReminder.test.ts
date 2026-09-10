import { describe, expect, it } from 'vitest';

import type { ContextMessage } from '#/agent/contextMemory/types';
import { wrapSystemReminder } from '#/agent/systemReminder/systemReminder';
import { type TodoItem } from '#/session/todo/todoItem';
import { todoListStaleReminder } from '#/session/todo/todoListReminder';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { IAgentPromptService } from '#/agent/prompt/prompt';
import { createTestAgent } from '../../harness';

function assistantMessage(): ContextMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'working' }],
    toolCalls: [],
  };
}

function todoListWrite(todos: readonly TodoItem[]): ContextMessage {
  return {
    role: 'assistant',
    content: [],
    toolCalls: [
      {
        type: 'function',
        id: 'call_todo_write',
        name: 'TodoList',
        arguments: JSON.stringify({ todos }),
      },
    ],
  };
}

function todoListQuery(): ContextMessage {
  return {
    role: 'assistant',
    content: [],
    toolCalls: [
      {
        type: 'function',
        id: 'call_todo_query',
        name: 'TodoList',
        arguments: JSON.stringify({}),
      },
    ],
  };
}

function priorTodoReminder(): ContextMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text: '<system-reminder>\nPrior todo reminder\n</system-reminder>' }],
    toolCalls: [],
    origin: { kind: 'injection', variant: 'todo_list_reminder' },
  };
}

describe('todoListStaleReminder', () => {
  it('keeps one stale-list reminder in actual requests and restores it after compaction', async () => {
    const ctx = createTestAgent();
    const todos: TodoItem[] = [{ title: 'UNIQUE_TODO_RESIDUAL_CHECK', status: 'pending' }];
    const registration = ctx.get(IAgentContextInjectorService).register('todo_list_reminder', () =>
      todoListStaleReminder({ active: true, todos, history: ctx.context.get() }));
    const advance = () => {
      for (let i = 0; i < 10; i++) ctx.appendAssistantTurn(ctx.context.get().length, 'Still investigating.');
    };
    const ask = async () => {
      ctx.mockNextResponse({ type: 'text', text: 'The candidate remains unverified.' });
      const handle = await ctx.get(IAgentPromptService).enqueue({ message: {
        role: 'user', content: [{ type: 'text', text: 'Explain the remaining uncertainty.' }],
        toolCalls: [], origin: { kind: 'user' },
      } });
      expect((await handle.completion).state).toBe('completed');
      return JSON.stringify(ctx.llmCalls.at(-1));
    };
    try {
      advance();
      expect((await ask()).match(/UNIQUE_TODO_RESIDUAL_CHECK/g)).toHaveLength(1);
      advance();
      expect((await ask()).match(/UNIQUE_TODO_RESIDUAL_CHECK/g)).toHaveLength(1);
      ctx.context.applyCompaction({ summary: 'Unresolved candidate.',
        compactedCount: ctx.context.get().length, tokensBefore: 3000, tokensAfter: 20,
        keptUserMessageCount: 0, keptHeadUserMessageCount: 0 });
      advance();
      expect((await ask()).match(/UNIQUE_TODO_RESIDUAL_CHECK/g)).toHaveLength(1);
    } finally {
      registration.dispose();
      await ctx.dispose();
    }
  });
  it('does not remind for an empty or completed list', () => {
    const history = Array.from({ length: 20 }, assistantMessage);
    expect(todoListStaleReminder({ history, todos: [], active: true })).toBeUndefined();
    expect(todoListStaleReminder({ history, todos: [{ title: 'Finished', status: 'done' }], active: true })).toBeUndefined();
  });

  it('does not resend the same list, but can remind after a change or context loss', () => {
    const todos: TodoItem[] = [{ title: 'Check residual', status: 'pending' }];
    const oldHistory = Array.from({ length: 10 }, assistantMessage);
    const text = todoListStaleReminder({ history: oldHistory, todos, active: true });
    expect(text).toBeDefined();
    const reminder: ContextMessage = { ...priorTodoReminder(), content: [{ type: 'text', text: wrapSystemReminder(text!) }] };
    const history = [...oldHistory, reminder, ...Array.from({ length: 20 }, assistantMessage)];
    expect(todoListStaleReminder({ history, todos, active: true })).toBeUndefined();
    expect(todoListStaleReminder({ history, todos: [{ title: 'New check', status: 'pending' }], active: true })).toContain('New check');
    expect(todoListStaleReminder({ history: oldHistory, todos, active: true })).toBe(text);
  });
  it('skips reminder injection when TodoList is not active', async () => {
    const history = Array.from({ length: 10 }, () => assistantMessage());
    const result = todoListStaleReminder({
      history,
      todos: [{ title: 'Investigate todo reminder', status: 'in_progress' }],
      active: false,
    });

    expect(result).toBeUndefined();
  });

  it('injects a reminder after enough assistant turns since the last TodoList write', async () => {
    const todos: TodoItem[] = [
      { title: 'Read current TodoList implementation', status: 'in_progress' },
      { title: 'Add reminder injector tests', status: 'pending' },
    ];
    const history = [todoListWrite(todos), ...Array.from({ length: 10 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toContain('The TodoList tool has not been updated recently');
    expect(result).toContain('NEVER mention this reminder to the user');
    expect(result).toContain('Current todo list:');
    expect(result).toContain('1. [in_progress] Read current TodoList implementation');
    expect(result).toContain('2. [pending] Add reminder injector tests');
  });

  it('does not inject before the assistant-turn threshold', async () => {
    const todos: TodoItem[] = [{ title: 'Read code', status: 'in_progress' }];
    const history = [todoListWrite(todos), ...Array.from({ length: 9 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toBeUndefined();
  });

  it('does not inject another reminder before the reminder spacing threshold', async () => {
    const todos: TodoItem[] = [{ title: 'Read code', status: 'in_progress' }];
    const history = [
      todoListWrite(todos),
      ...Array.from({ length: 10 }, () => assistantMessage()),
      priorTodoReminder(),
      ...Array.from({ length: 9 }, () => assistantMessage()),
    ];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toBeUndefined();
  });

  it('does not treat TodoList query mode as a write', async () => {
    const todos: TodoItem[] = [{ title: 'Read code', status: 'in_progress' }];
    const history = [
      todoListWrite(todos),
      ...Array.from({ length: 5 }, () => assistantMessage()),
      todoListQuery(),
      ...Array.from({ length: 4 }, () => assistantMessage()),
    ];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toContain('The TodoList tool has not been updated recently');
  });
});
