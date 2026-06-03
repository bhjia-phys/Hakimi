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
      workFrameId: 'frame.patch',
      followupActionId: 'code.inspect_git_history',
      evidenceRefs: ['git:diff:head-wing'],
    });

    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.raw_tool_escape',
        reason: 'No semantic action exists yet for this narrow inspection.',
        primitiveToolName: 'Bash',
        primitiveToolCallId: 'tool_call_git_diff',
        workFrameId: 'frame.patch',
        followupActionId: 'code.inspect_git_history',
        evidenceRefs: ['git:diff:head-wing'],
      }),
    );
  });

  it('restores evidence refs with their original WorkFrame scope', () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    agent.workFrames.open(
      {
        id: 'frame.sources',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Find source support for flux insertion.',
      },
      { source: 'controller' },
    );
    agent.researchAction.startActionCall(
      {
        actionId: 'source.search_literature',
        callId: 'call.source-search',
        input: { query: 'FQHE flux insertion' },
      },
      { source: 'controller' },
    );
    agent.researchAction.finishActionCall(
      {
        actionId: 'source.search_literature',
        callId: 'call.source-search',
        outcome: 'pass',
        evidenceRefs: ['source:paper.fqhe.flux-insertion'],
        primitiveToolCallIds: ['tool.web-search.fqhe', 'tool.fetch-url.fqhe'],
      },
      { source: 'controller' },
    );
    agent.workFrames.open(
      {
        id: 'frame.patch',
        domain: 'librpa',
        topic: 'head-wing-patch',
        goal: 'Prepare a patch for the LibRPA head-wing path.',
      },
      { source: 'controller' },
    );
    agent.researchAction.startActionCall(
      {
        actionId: 'code.prepare_patch',
        callId: 'call.prepare-patch',
        input: { file: 'src/head_wing.cpp' },
      },
      { source: 'controller' },
    );
    agent.researchAction.finishActionCall(
      {
        actionId: 'code.prepare_patch',
        callId: 'call.prepare-patch',
        outcome: 'pass',
        evidenceRefs: ['git:diff.head-wing-patch'],
        primitiveToolCallIds: ['tool.grep.head-wing', 'tool.edit.head-wing'],
      },
      { source: 'controller' },
    );

    const restored = makeAgent([]);
    for (const record of records) {
      restored.records.restore(record);
    }

    expect(restored.researchAction.activeActionCall).toBeUndefined();
    expect(restored.researchAction.recentEvidence(5, { workFrameId: 'frame.sources' })).toEqual([
      'source:paper.fqhe.flux-insertion',
    ]);
    expect(restored.researchAction.recentEvidence(5, { topic: 'fqhe-literature' })).toEqual([
      'source:paper.fqhe.flux-insertion',
    ]);
    expect(restored.researchAction.recentEvidence(5, { domain: 'librpa' })).toEqual([
      'git:diff.head-wing-patch',
    ]);
    expect(restored.researchAction.recentEvidence(5)).toEqual([
      'source:paper.fqhe.flux-insertion',
      'git:diff.head-wing-patch',
    ]);
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
