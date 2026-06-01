import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { ProviderManager } from '../../src/session/provider-manager';
import { testKaos } from '../fixtures/test-kaos';

const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('research action records', () => {
  it('records raw primitive tool escapes for later action and harness design', () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);

    agent.researchAction.recordRawToolEscape({
      reason: 'No semantic action exists yet for this narrow inspection.',
      primitiveToolName: 'Bash',
      primitiveToolCallId: 'tool_call_git_diff',
      followupActionId: 'code.inspect_git_history',
      evidenceRefs: ['git:diff:head-wing'],
    });

    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.raw_tool_escape',
        reason: 'No semantic action exists yet for this narrow inspection.',
        primitiveToolName: 'Bash',
        primitiveToolCallId: 'tool_call_git_diff',
        followupActionId: 'code.inspect_git_history',
        evidenceRefs: ['git:diff:head-wing'],
      }),
    );
  });
});

function makeAgent(records: AgentRecord[]): Agent {
  const agent = new Agent({
    kaos: testKaos,
    rpc: {
      emitEvent: vi.fn(),
      requestApproval: vi.fn(),
      requestQuestion: vi.fn(),
      toolCall: vi.fn(),
    },
    persistence: new InMemoryAgentRecordPersistence([], {
      onRecord: (record) => records.push(record),
    }),
    modelProvider: new ProviderManager({
      config: {
        providers: {
          test: {
            type: MOCK_PROVIDER.type,
            apiKey: MOCK_PROVIDER.apiKey,
          },
        },
        models: {
          [MOCK_PROVIDER.model]: {
            provider: 'test',
            model: MOCK_PROVIDER.model,
            maxContextSize: 1_000_000,
          },
        },
      },
    }),
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_PROVIDER.model,
  });
  return agent;
}
