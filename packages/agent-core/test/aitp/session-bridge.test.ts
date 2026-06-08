import { describe, expect, it } from 'vitest';

import {
  AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
  aitpRuntimePayloadProfileById,
  createDynamicAitpCliProcessGraphSliceProvider,
  createDynamicAitpCliRuntimePayloadProfilesProvider,
  createDynamicAitpCliWriteBridgeExecutor,
  createDynamicAitpMcpFirstProcessGraphSliceProvider,
  createDynamicAitpMcpFirstRuntimePayloadProfilesProvider,
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

  it('reads runtime payload profiles through dynamic CLI fallback', async () => {
    const calls: string[][] = [];
    const provider = createDynamicAitpCliRuntimePayloadProfilesProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(calls),
    });

    const catalog = await provider.getRuntimePayloadProfiles();

    expect(calls[0]).toEqual(['aitp-v5', 'adapter', 'payload-profiles']);
    expect(catalog.catalogVersion).toBe(AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION);
    expect(catalog.profileCount).toBe(2);
    expect(
      aitpRuntimePayloadProfileById(catalog, 'primitive_tool_lifecycle_to_tool_run')
        ?.capturePolicy.requiresToolCallId,
    ).toBe(true);
    expect(catalog.canUpdateClaimTrust).toBe(false);
  });

  it('uses MCP-first transport for runtime payload profile reads without scope args', async () => {
    const cliCalls: string[][] = [];
    const mcpCalls: Array<{ readonly toolName: string; readonly args: Readonly<Record<string, unknown>> }> = [];
    const provider = createDynamicAitpMcpFirstRuntimePayloadProfilesProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(cliCalls),
      mcpTransport: {
        async callTool(input) {
          mcpCalls.push({ toolName: input.toolName, args: input.args });
          return {
            ok: true,
            runtime_payload_profiles: fakeRuntimePayloadProfilesCatalog(),
          };
        },
      },
    });

    const catalog = await provider.getRuntimePayloadProfiles();

    expect(cliCalls).toEqual([]);
    expect(mcpCalls).toEqual([
      {
        toolName: 'aitp_v5_get_runtime_payload_profiles',
        args: {},
      },
    ]);
    expect(catalog.profileIndex).toEqual([
      'benchmark_adapter_run_to_tool_run',
      'primitive_tool_lifecycle_to_tool_run',
    ]);
  });

  it('falls back to CLI runtime payload profile reads when MCP fails', async () => {
    const cliCalls: string[][] = [];
    const provider = createDynamicAitpMcpFirstRuntimePayloadProfilesProvider({
      basePath: () => 'F:/project',
      runner: recordingRunner(cliCalls),
      mcpTransport: {
        async callTool() {
          throw new Error('MCP unavailable');
        },
      },
    });

    const catalog = await provider.getRuntimePayloadProfiles();

    expect(catalog.profileCount).toBe(2);
    expect(cliCalls[0]).toEqual(['aitp-v5', 'adapter', 'payload-profiles']);
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
      if (args.includes('payload-profiles')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            runtime_payload_profiles: fakeRuntimePayloadProfilesCatalog(),
          }),
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

function fakeRuntimePayloadProfilesCatalog(): any {
  const profiles = [
    {
      profile_id: 'benchmark_adapter_run_to_tool_run',
      host_event: 'benchmark_adapter_run',
      target_operation: 'recordToolRun',
      target_entrypoint: 'aitp_v5_record_tool_run',
      target_record_action: 'record_tool_run',
      target_surface: 'tool_run_record',
      required_host_fields: [
        'adapter_id',
        'case_id',
        'action_id',
        'outcome',
        'observation',
        'output',
        'topic_id',
        'claim_id',
      ],
      optional_host_fields: [
        'benchmark_payload',
        'check_results',
        'evidence_refs',
        'artifact_refs',
        'source_refs',
        'primitive_tool_call_ids',
      ],
      payload_key_case: 'camel_or_snake',
      capture_policy: {
        capture_mode: 'controlled_auto',
        host_trigger: 'ResearchAction.run_benchmark_adapter',
        requires_configured_bridge: true,
        requires_scoped_topic_and_claim: true,
        requires_tool_call_id: false,
        capture_granularity: 'one_tool_run_per_adapter_run',
        missing_scope_behavior: 'skip_with_reason',
        bulk_auto_capture: false,
        records_validation_result: false,
        claim_trust_mutation: 'none',
        summary_inputs_trusted: false,
        can_update_claim_trust: false,
      },
      payload_template: {
        recipe_id: 'benchmark_adapter:<adapter_id>:<case_id>',
        tool_family: 'benchmark_adapter',
        tool_name: '<adapter_id>',
        evidence_status: 'unreviewed',
      },
      result_semantics: {
        record_kind: 'tool_run',
        evidence_ref_prefix: 'aitp:tool_run',
        records_validation_result: false,
        claim_trust_mutation: 'none',
        can_update_claim_trust: false,
        summary_inputs_trusted: false,
      },
      strict_boundary:
        'benchmark adapter outcome is tool-run provenance only; validation remains explicit',
    },
    {
      profile_id: 'primitive_tool_lifecycle_to_tool_run',
      host_event: 'primitive_tool_lifecycle_completed',
      target_operation: 'recordToolRun',
      target_entrypoint: 'aitp_v5_record_tool_run',
      target_record_action: 'record_tool_run',
      target_surface: 'tool_run_record',
      required_host_fields: [
        'tool_call_id',
        'tool_name',
        'status',
        'output_summary',
        'topic_id',
        'claim_id',
      ],
      optional_host_fields: [
        'args_summary',
        'cwd',
        'turn_id',
        'step_uuid',
        'duration_ms',
        'artifact_refs',
        'source_refs',
        'workframe_id',
        'action_call_id',
      ],
      payload_key_case: 'camel_or_snake',
      capture_policy: {
        capture_mode: 'explicit_request',
        host_trigger: 'ResearchAction.capture_primitive_tool_run',
        requires_configured_bridge: true,
        requires_scoped_topic_and_claim: true,
        requires_tool_call_id: true,
        capture_granularity: 'one_tool_run_per_explicit_tool_call_id',
        missing_scope_behavior: 'skip_with_reason',
        bulk_auto_capture: false,
        records_validation_result: false,
        claim_trust_mutation: 'none',
        summary_inputs_trusted: false,
        can_update_claim_trust: false,
      },
      payload_template: {
        recipe_id: 'primitive_tool:<tool_name>:<tool_call_id>',
        tool_family: 'primitive_tool',
        tool_name: '<tool_name>',
        evidence_status: 'unreviewed',
      },
      result_semantics: {
        record_kind: 'tool_run',
        evidence_ref_prefix: 'aitp:tool_run',
        records_validation_result: false,
        claim_trust_mutation: 'none',
        can_update_claim_trust: false,
        summary_inputs_trusted: false,
      },
      strict_boundary:
        'primitive tool lifecycle output is tool-run provenance only; trust remains explicit',
    },
  ];
  return {
    kind: 'runtime_payload_profiles',
    catalog_version: AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
    truth_source: 'runtime_payload_profile_catalog',
    summary_inputs_trusted: false,
    can_update_claim_trust: false,
    profile_count: profiles.length,
    profile_index: profiles.map((profile) => profile.profile_id),
    profiles,
  };
}
