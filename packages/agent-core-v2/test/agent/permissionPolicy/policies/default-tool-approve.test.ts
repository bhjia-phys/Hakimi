import type { ToolCall } from '#/kosong/contract/message';
import { describe, expect, it } from 'vitest';

import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import { DefaultToolApprovePermissionPolicyService } from '#/agent/permissionPolicy/policies/default-tool-approve';
import { ToolAccesses } from '#/tool/toolContract';

const signal = new AbortController().signal;

function policyContext(toolName: string, args: unknown): ResolvedToolExecutionHookContext {
  return {
    turnId: '0',
    stepNumber: 1,
    signal,
    llm: {},
    args,
    toolCall: {
      type: 'function',
      id: `call_${toolName}`,
      name: toolName,
      arguments: JSON.stringify(args),
    } satisfies ToolCall,
    toolCalls: [
      {
        type: 'function',
        id: `call_${toolName}`,
        name: toolName,
        arguments: JSON.stringify(args),
      },
    ],
    execution: {
      accesses: ToolAccesses.none(),
      approvalRule: toolName,
      execute: async () => ({ output: '' }),
    },
  } as unknown as ResolvedToolExecutionHookContext;
}

describe('DefaultToolApprovePermissionPolicyService', () => {
  const policy = new DefaultToolApprovePermissionPolicyService();

  it.each([
    ['Read', { path: '/workspace/notes.md' }],
    ['Grep', { pattern: 'TODO', path: '/workspace' }],
    ['Glob', { pattern: '**/*.ts', path: '/workspace' }],
    ['ReadMediaFile', { path: '/workspace/image.png' }],
    ['aitp_enter', { workstream: 'gw' }],
    ['aitp_list', { workstream: 'gw' }],
    ['aitp_show', { id: 'entry-test' }],
    ['aitp_check', { workstream: 'gw' }],
    ['GetResearchStatus', { line_slug: 'example-line' }],
    ['ReadResearchCheckpointEvidence', { checkpoint_id: 'checkpoint-example', expected_revision: 1, path: 'results/example.json' }],
    ['SetTodoList', { items: [] }],
    ['TodoList', {}],
    ['TaskList', {}],
    ['TaskOutput', { task_id: 'task_1' }],
    ['CronList', {}],
    ['WebSearch', { query: 'kimi code' }],
    ['FetchURL', { url: 'https://example.com' }],
    ['Agent', { prompt: 'review this' }],
    [
      'AgentSwarm',
      {
        description: 'Check files',
        prompt_template: 'Check {{item}}',
        items: ['a.ts', 'b.ts'],
      },
    ],
    ['AskUserQuestion', { questions: [] }],
    ['Skill', { name: 'test-skill' }],
    ['EnterPlanMode', {}],
    ['ExitPlanMode', {}],
    ['CreateGoal', { title: 'ship it' }],
    ['GetGoal', {}],
    ['SetGoalBudget', { tokenBudget: 1000 }],
    ['UpdateGoal', { status: 'complete' }],
    ['GetProviderUsage', {}],
  ] as const)('approves %s', (toolName, args) => {
    expect(policy.evaluate(policyContext(toolName, args))).toEqual({ kind: 'approve' });
  });

  it.each([
    ['Bash', { command: 'printf first', timeout: 60 }],
    ['Write', { path: '/workspace/a.ts', content: 'x' }],
    ['Edit', { path: '/workspace/a.ts', old_string: 'a', new_string: 'b' }],
    ['Custom', { value: 1 }],
    ['aitp_record_prepare', {}],
    ['aitp_record_save', {}],
    ['aitp_note_prepare', {}],
    ['aitp_note_save', {}],
    ['aitp_backfill_workstreams', {}],
    ['BeginResearchAction', {}],
    ['ConcludeResearchAction', {}],
    ['CommitResearchCheckpoint', {}],
    ['mcp__unknown__aitp_show', {}],
    ['CronCreate', { cron: '*/5 * * * *', prompt: 'ping' }],
    ['CronDelete', { id: 'job_1' }],
    ['SetSubagentPreset', { preset: 'balanced' }],
  ] as const)('does not approve %s', (toolName, args) => {
    expect(
      policy.evaluate(policyContext(toolName, args)),
    ).toBeUndefined();
  });
});
