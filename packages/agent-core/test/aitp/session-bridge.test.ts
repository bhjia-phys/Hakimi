import { describe, expect, it } from 'vitest';

import {
  createDynamicAitpCliProcessGraphSliceProvider,
  createDynamicAitpCliWriteBridgeExecutor,
  createDynamicAitpMcpFirstProcessGraphSliceProvider,
  createDynamicAitpMcpFirstWriteBridgeExecutor,
  mcpArgsForAitpProcessGraphSliceRead,
  type AitpCommandRunner,
} from '../../src/aitp';
import type { WorkFrame } from '../../src/research-action';

describe('AITP dynamic session bridge', () => {
  it('does not call AITP when a WorkFrame has no explicit AITP scope', async () => {
    const calls: string[][] = [];
    const provider = createDynamicAitpCliProcessGraphSliceProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(calls),
    });

    await expect(
      provider.getProcessGraphSlice({
        workFrame: workFrame({ sourceRefs: [] }),
        prompt: [],
      }),
    ).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it('uses the latest base path for graph reads and write-bridge calls', async () => {
    const calls: string[][] = [];
    let basePath = 'F:/project-a';
    const runner = recordingRunner(calls);
    const provider = createDynamicAitpCliProcessGraphSliceProvider({
      basePath: () => basePath,
      runner,
      limit: 5,
    });
    const writeBridge = createDynamicAitpCliWriteBridgeExecutor({
      basePath: () => basePath,
      runner,
    });

    const compiled = await provider.getProcessGraphSlice({
      workFrame: workFrame({
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
      }),
      prompt: [{ type: 'text', text: 'Trace source dependency.' }],
    });
    basePath = 'F:/project-b';
    const result = await writeBridge.executeWrite({
      operation: 'requestHumanCheckpoint',
      payload: {
        topicId: 'qg',
        claimId: 'claim-mipt',
        reason: 'Trust boundary before using the traced source as support.',
        requestedBy: 'hakimi',
        options: ['keep provisional'],
      },
    });

    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(result).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-qg',
    });
    expect(calls[0]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project-a',
      'graph',
      'slice',
      'session-qg',
      '--limit',
      '5',
      '--claim',
      'claim-mipt',
    ]);
    expect(calls[1]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project-b',
      'checkpoint',
      'request',
      '--topic',
      'qg',
      '--claim',
      'claim-mipt',
      '--reason',
      'Trust boundary before using the traced source as support.',
      '--requested-by',
      'hakimi',
      '--option',
      'keep provisional',
    ]);
  });

  it('uses the latest base path for MCP-first write-bridge calls', async () => {
    const calls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    let basePath = 'F:/project-a';
    const writeBridge = createDynamicAitpMcpFirstWriteBridgeExecutor({
      basePath: () => basePath,
      runner: recordingRunner([]),
      mcpTransport: {
        async callTool(input) {
          calls.push({ toolName: input.toolName, args: input.args });
          return {
            ok: true,
            kind: 'human_checkpoint',
            checkpoint_id: 'checkpoint-qg-mcp',
            topic_id: 'qg',
            claim_id: 'claim-mipt',
            status: 'requested',
          };
        },
      },
    });

    basePath = 'F:/project-b';
    const result = await writeBridge.executeWrite({
      operation: 'requestHumanCheckpoint',
      payload: {
        topicId: 'qg',
        claimId: 'claim-mipt',
        reason: 'Trust boundary before using the traced source as support.',
        requestedBy: 'hakimi',
        options: ['keep provisional'],
      },
    });

    expect(result).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-qg-mcp',
    });
    expect(calls).toEqual([
      {
        toolName: 'aitp_v5_request_human_checkpoint',
        args: {
          base: 'F:/project-b',
          topic_id: 'qg',
          claim_id: 'claim-mipt',
          reason: 'Trust boundary before using the traced source as support.',
          requested_by: 'hakimi',
          options: ['keep provisional'],
        },
      },
    ]);
  });

  it('uses MCP-first transport for process graph reads', async () => {
    const cliCalls: string[][] = [];
    const mcpCalls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    let basePath = 'F:/project-a';
    const provider = createDynamicAitpMcpFirstProcessGraphSliceProvider({
      basePath: () => basePath,
      runner: recordingRunner(cliCalls),
      limit: 7,
      mcpTransport: {
        async callTool(input) {
          mcpCalls.push({ toolName: input.toolName, args: input.args });
          return fakeSlicePayload();
        },
      },
    });

    basePath = 'F:/project-b';
    const compiled = await provider.getProcessGraphSlice({
      workFrame: workFrame({
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
      }),
      prompt: [{ type: 'text', text: 'Trace source dependency.' }],
    });

    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(cliCalls).toEqual([]);
    expect(mcpCalls).toEqual([
      {
        toolName: 'aitp_v5_get_process_graph_slice',
        args: {
          base: 'F:/project-b',
          session_id: 'session-qg',
          claim_id: 'claim-mipt',
          limit: 7,
        },
      },
    ]);
  });

  it('falls back to CLI process graph reads when MCP fails', async () => {
    const cliCalls: string[][] = [];
    const provider = createDynamicAitpMcpFirstProcessGraphSliceProvider({
      basePath: () => 'F:/project-cli',
      runner: recordingRunner(cliCalls),
      limit: 3,
      mcpTransport: {
        async callTool() {
          throw new Error('MCP unavailable');
        },
      },
    });

    const compiled = await provider.getProcessGraphSlice({
      workFrame: workFrame({
        sourceRefs: ['aitp:session:session-qg', 'aitp:claim:claim-mipt'],
      }),
      prompt: [{ type: 'text', text: 'Trace source dependency.' }],
    });

    expect(compiled?.contextLines.join('\n')).toContain('Source gaps: claim-mipt');
    expect(cliCalls[0]).toEqual([
      'aitp-v5',
      '--base',
      'F:/project-cli',
      'graph',
      'slice',
      'session-qg',
      '--limit',
      '3',
      '--claim',
      'claim-mipt',
    ]);
  });

  it('builds process graph read MCP args from AITP scope', () => {
    expect(
      mcpArgsForAitpProcessGraphSliceRead(
        'F:/project',
        { sessionId: 'session-qg', claimId: 'claim-mipt' },
        11,
      ),
    ).toEqual({
      base: 'F:/project',
      session_id: 'session-qg',
      claim_id: 'claim-mipt',
      limit: 11,
    });
  });
});

function recordingRunner(calls: string[][]): AitpCommandRunner {
  return {
    async run(command, args) {
      calls.push([command, ...args]);
      if (args.includes('graph')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(fakeSlicePayload()),
          stderr: '',
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          kind: 'human_checkpoint',
          checkpoint_id: 'checkpoint-qg',
          topic_id: 'qg',
          claim_id: 'claim-mipt',
          status: 'requested',
        }),
        stderr: '',
      };
    },
  };
}

function workFrame(input: { readonly sourceRefs: readonly string[] }): WorkFrame {
  return {
    id: 'frame.qg',
    domain: 'theoretical-physics/general',
    topic: 'qg',
    goal: 'Trace QG/MIPT relation.',
    activeObjectIds: [],
    assumptionIds: [],
    conventionIds: [],
    sourceRefs: input.sourceRefs,
    openObligationIds: [],
    trustState: 'exploratory',
  };
}

function fakeSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [
      {
        id: 'claim:claim-mipt',
        type: 'claim',
        record: {
          statement: 'MIPT observer role may be represented by an algebraic split.',
          status: 'hypothesis',
        },
      },
    ],
    edges: [],
    open_obligations: [],
    source_backtrace: [
      {
        claim_id: 'claim-mipt',
        complete: false,
        missing_components: ['source theorem'],
      },
    ],
    relation_neighborhood: [],
    exploratory_records: [],
    trust_boundary_reasons: ['source_support'],
    recommended_moments: [],
  };
}
