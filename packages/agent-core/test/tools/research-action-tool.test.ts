import { describe, expect, it, vi } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { ProviderManager } from '../../src/session/provider-manager';
import { ResearchActionTool } from '../../src/tools/builtin/collaboration/research-action-tool';
import { testKaos } from '../fixtures/test-kaos';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;
const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('ResearchActionTool', () => {
  it('lists default actions and recommends next actions from obligations', async () => {
    const tool = new ResearchActionTool();

    const actions = await execute(tool, {
      action: 'list_actions',
      category: 'physics',
      exposure: 'direct',
    });
    const recommendations = await execute(tool, {
      action: 'recommend_next_actions',
      obligations: [
        {
          id: 'obl.convention',
          kind: 'convention_check',
          domain: 'topological-order',
          topic: 'fqhe-cs-effective-theory',
          targetObjectId: 'formula.fqhe.flux-quantization',
          severity: 'blocking',
          reason: 'Flux convention affects CS normalization.',
          requiredActionId: 'validate.check_convention',
          status: 'open',
        },
      ],
    });

    expect(actions.output).toContain('validate.check_convention');
    expect(actions.output).toContain('primitive_tool_policy="none"');
    expect(recommendations.output).toContain('action_id="validate.check_convention"');
    expect(recommendations.output).toContain('obl.convention');
  });

  it('records model-reported action results through AgentRecords', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    const result = await execute(tool, {
      action: 'record_action_result',
      action_id: 'validate.check_convention',
      call_id: 'research_action_call_1',
      outcome: 'pass',
      evidence_refs: ['ledger:event.fqhe.convention-check'],
      generated_obligation_ids: ['obl.known-limit'],
      primitive_tool_call_ids: ['tool_call_primitive_1'],
      next_suggested_actions: ['validate.check_known_limit'],
    });

    expect(result.output).toContain('research_action_recorded');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_action.result_recorded',
        source: 'model',
        actionId: 'validate.check_convention',
        callId: 'research_action_call_1',
        outcome: 'pass',
        evidenceRefs: ['ledger:event.fqhe.convention-check'],
        generatedObligationIds: ['obl.known-limit'],
        primitiveToolCallIds: ['tool_call_primitive_1'],
        nextSuggestedActions: ['validate.check_known_limit'],
        toolCallId: 'call_research_action',
      }),
    );
  });

  it('opens, lists, switches, and closes WorkFrames through the session manager', async () => {
    const records: AgentRecord[] = [];
    const agent = makeAgent(records);
    const tool = new ResearchActionTool(agent.researchAction);

    const openedFqhe = await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.fqhe',
      domain: 'topological-order',
      topic: 'fqhe-cs',
      goal: 'Relate Laughlin wavefunction and CS response.',
      active_object_ids: ['formula:ab-phase'],
      source_refs: ['ledger:event.fqhe.source'],
    });
    await execute(tool, {
      action: 'open_work_frame',
      frame_id: 'frame.librpa',
      domain: 'librpa',
      topic: 'head-wing',
      goal: 'Check head-wing code impact.',
    });
    const switched = await execute(tool, {
      action: 'switch_work_frame',
      frame_id: 'frame.fqhe',
    });
    const listed = await execute(tool, { action: 'list_work_frames' });
    const closed = await execute(tool, {
      action: 'close_work_frame',
      frame_id: 'frame.librpa',
    });

    expect(openedFqhe.output).toContain('active="true"');
    expect(switched.output).toContain('frame.fqhe');
    expect(listed.output).toContain('active_id="frame.fqhe"');
    expect(listed.output).toContain('frame.librpa');
    expect(closed.output).toContain('work_frame_closed');
    expect(agent.workFrames.active?.id).toBe('frame.fqhe');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.opened',
        source: 'model-tool',
        toolCallId: 'call_research_action',
        frame: expect.objectContaining({
          id: 'frame.fqhe',
          activeObjectIds: ['formula:ab-phase'],
          sourceRefs: ['ledger:event.fqhe.source'],
        }),
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.switched',
        frameId: 'frame.fqhe',
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.closed',
        frameId: 'frame.librpa',
      }),
    );
  });

  it('returns a tool error when record_action_result is missing required ids', async () => {
    const tool = new ResearchActionTool();

    const result = await execute(tool, {
      action: 'record_action_result',
      call_id: 'call',
      outcome: 'pass',
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('action_id');
  });
});

describe('ToolManager ResearchAction registration', () => {
  it('keeps ResearchAction hidden unless the feature flag is enabled', () => {
    const oldFlag = process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'];
    try {
      delete process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'];
      const hidden = makeAgent();
      expect(hidden.tools.data().find((tool) => tool.name === 'ResearchAction')).toBeUndefined();

      process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'] = '1';
      const visible = makeAgent();
      visible.tools.setActiveTools(['ResearchAction']);
      expect(visible.tools.data().find((tool) => tool.name === 'ResearchAction')).toMatchObject({
        name: 'ResearchAction',
        active: true,
        source: 'builtin',
      });
      expect(visible.tools.loopTools.find((tool) => tool.name === 'ResearchAction')).toBeInstanceOf(
        ResearchActionTool,
      );
    } finally {
      if (oldFlag === undefined) {
        delete process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'];
      } else {
        process.env['KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION'] = oldFlag;
      }
    }
  });
});

function execute(tool: ResearchActionTool, args: Parameters<typeof tool.resolveExecution>[0]) {
  return executeTool(tool, {
    turnId: '0',
    toolCallId: 'call_research_action',
    args,
    signal,
  });
}

function makeAgent(records?: AgentRecord[]): Agent {
  const agent = new Agent({
    kaos: testKaos,
    rpc: {
      emitEvent: vi.fn(),
      requestApproval: vi.fn(),
      requestQuestion: vi.fn(),
      toolCall: vi.fn(),
    },
    persistence:
      records === undefined
        ? undefined
        : new InMemoryAgentRecordPersistence([], {
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
  agent.tools.initializeBuiltinTools();
  return agent;
}
