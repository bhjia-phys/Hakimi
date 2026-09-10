/**
 * Scenario: runtime validation at Klient wire-contract boundaries.
 *
 * Exercises the session-creation, plugin-manifest, and Research checkpoint
 * schemas directly with no external collaborators. Run with
 * `pnpm --filter @moonshot-ai/klient exec vitest run test/contract.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { agentResearchContract } from '../src/contract/agent/research.js';
import { agentTaskInfoSchema } from '../src/contract/agent/schemas.js';
import { pluginManifestSchema } from '../src/contract/global/plugins.js';
import { createSessionOptionsSchema } from '../src/contract/session/lifecycle.js';

type McpTimeoutField = 'startupTimeoutMs' | 'toolTimeoutMs';

describe('agent task ownership wire contract', () => {
  const task = { kind: 'agent', taskId: 'task-a', agentId: 'agent-a',
    description: 'Review one result', status: 'completed', startedAt: 1, endedAt: 2 };
  it('retains parent and scope across a JSON wire roundtrip', () => {
    const owned = { ...task, parentAgentId: 'coordinator', taskScope: 'research-line:algebra' };
    expect(agentTaskInfoSchema.parse(JSON.parse(JSON.stringify(owned)))).toEqual(owned);
  });
  it('does not invent ownership for legacy tasks', () => {
    expect(agentTaskInfoSchema.parse(task)).toEqual(task);
  });
  it('rejects malformed ownership instead of silently dropping it', () => {
    expect(agentTaskInfoSchema.safeParse({ ...task, parentAgentId: 1 }).success).toBe(false);
    expect(agentTaskInfoSchema.safeParse({ ...task, taskScope: [] }).success).toBe(false);
  });
});

const timeoutCases = [
  {
    surface: 'plugin manifests',
    parse: (field: McpTimeoutField, value: number) =>
      pluginManifestSchema.safeParse({
        name: 'example',
        mcpServers: {
          example: { transport: 'stdio', command: 'node', [field]: value },
        },
      }),
  },
].flatMap(({ surface, parse }) => [
  { surface, field: 'startupTimeoutMs' as const, parse },
  { surface, field: 'toolTimeoutMs' as const, parse },
]);

describe('MCP timeout contract validation', () => {
  it.each(timeoutCases)('accepts the maximum $field for $surface', ({ field, parse }) => {
    expect(parse(field, 2_147_483_647).success).toBe(true);
  });

  it.each(timeoutCases)('rejects an above-maximum $field for $surface', ({ field, parse }) => {
    expect(parse(field, 2_147_483_648).success).toBe(false);
  });

  it('session creation options accept ephemeral mcpServers', () => {
    const parsed = createSessionOptionsSchema.safeParse({
      workDir: '/tmp/example',
      mcpServers: {
        stdioExample: { transport: 'stdio', command: 'node', args: ['server.mjs'] },
        httpExample: { transport: 'http', url: 'https://example.com/mcp', headers: { a: 'b' } },
        sseExample: { transport: 'sse', url: 'https://example.com/sse' },
      },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.mcpServers?.['stdioExample']).toEqual({
      transport: 'stdio',
      command: 'node',
      args: ['server.mjs'],
    });
  });

  it('session creation options reject malformed mcpServers entries', () => {
    const parsed = createSessionOptionsSchema.safeParse({
      workDir: '/tmp/example',
      mcpServers: {
        example: { transport: 'http', url: 'not-a-url' },
      },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('Research checkpoint contract validation', () => {
  it('preserves explicit user ownership adoption and rejects an invented confirmer', () => {
    const input = {
      expectedRevision: 8, localConclusionId: 'primitive-audit', confirmedBy: 'user',
      lineSlug: 'spin-audit', questionId: 'spin-question',
    };
    expect(agentResearchContract.proposeCheckpoint.input.parse([input])).toEqual([input]);
    expect(agentResearchContract.proposeCheckpoint.input.safeParse([
      { ...input, confirmedBy: 'main_agent' },
    ]).success).toBe(false);
    expect(agentResearchContract.proposeCheckpoint.input.safeParse([
      { ...input, localConclusionId: '' },
    ]).success).toBe(false);
  });

  it('rejects a checkpoint proposal without expectedRevision', () => {
    expect(agentResearchContract.proposeCheckpoint.input.safeParse([{}]).success).toBe(false);
  });

  it('accepts zero as the checkpoint revision sentinel', () => {
    expect(agentResearchContract.proposeCheckpoint.input.safeParse([{ expectedRevision: 0 }]).success).toBe(true);
  });
});
