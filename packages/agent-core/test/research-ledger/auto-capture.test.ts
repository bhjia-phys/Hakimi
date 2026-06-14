import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, onTestFinished } from 'vitest';

import { Agent, type AgentRecord } from '../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import { ResearchLedgerRegistry } from '../../src/research-ledger';
import { ProviderManager } from '../../src/session/provider-manager';
import { testKaos } from '../fixtures/test-kaos';

const MOCK_PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

describe('tool lifecycle auto capture', () => {
  it('auto-opens a WorkFrame and ContextPack for AITP recovery relation maps', async () => {
    const cwd = await tempDir('aitp-auto-capture-');
    const records: AgentRecord[] = [];
    const agent = makeAgent(cwd, records);

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_relation_map',
      toolName: 'mcp__aitp__aitp_v5_get_claim_relation_map',
      args: { base: cwd, session_id: 'session-ads' },
      cwd,
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_relation_map',
      result: {
        output: JSON.stringify(aitpClaimRelationMapPayload()),
      },
    });

    const frame = agent.workFrames.active;
    expect(frame?.topic).toBe('ads-random-boundary-matter-20260612');
    expect(frame?.sourceRefs).toEqual(
      expect.arrayContaining([
        'aitp:session:session-ads',
        'aitp:claim:claim-ads',
        'claim:claim-ads',
      ]),
    );
    expect(agent.toolLifecycle.listRecent()[0]?.completed.workFrameId).toBe(frame?.id);
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.opened',
        source: 'controller',
        toolCallId: 'call_relation_map',
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_context.context_compiled',
        source: 'controller',
        workFrameId: frame?.id,
        toolCallId: 'call_relation_map',
      }),
    );
    const contextPackId = frame?.contextPackId;
    expect(contextPackId).toBeTruthy();
    expect(agent.researchContext.requirePack(contextPackId ?? '').aitp?.claimRelationMap?.claimId).toBe(
      'claim-ads',
    );
  });

  it('updates an existing AITP recovery WorkFrame when the relation map arrives after the brief', async () => {
    const cwd = await tempDir('aitp-auto-capture-');
    const records: AgentRecord[] = [];
    const agent = makeAgent(cwd, records);

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_brief',
      toolName: 'mcp__aitp__aitp_v5_get_execution_brief',
      args: { base: cwd, session_id: 'session-ads' },
      cwd,
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_brief',
      result: {
        output: JSON.stringify(aitpExecutionBriefPayload()),
      },
    });

    const frameAfterBrief = agent.workFrames.active;
    expect(frameAfterBrief?.topic).toBe('ads-random-boundary-matter-20260612');
    expect(frameAfterBrief?.contextPackId).toBeTruthy();
    expect(
      agent.researchContext.requirePack(frameAfterBrief?.contextPackId ?? '').aitp?.claimRelationMap,
    ).toBeUndefined();

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 2,
      stepUuid: 'step-2',
      toolCallId: 'call_relation_map',
      toolName: 'mcp__aitp__aitp_v5_get_claim_relation_map',
      args: { base: cwd, session_id: 'session-ads' },
      cwd,
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_relation_map',
      result: {
        output: JSON.stringify(aitpClaimRelationMapPayload()),
      },
    });

    const frameAfterRelationMap = agent.workFrames.active;
    expect(frameAfterRelationMap?.id).toBe(frameAfterBrief?.id);
    expect(agent.toolLifecycle.listRecent().at(-1)?.completed.workFrameId).toBe(frameAfterBrief?.id);
    expect(
      agent.researchContext.requirePack(frameAfterRelationMap?.contextPackId ?? '').aitp?.claimRelationMap?.claimId,
    ).toBe('claim-ads');
    expect(records.filter((record) => record.type === 'research_context.context_compiled')).toHaveLength(2);
  });

  it('auto-opens a WorkFrame for AITP legacy semantic review packets using current recovery focus', async () => {
    const cwd = await tempDir('aitp-auto-capture-');
    const records: AgentRecord[] = [];
    const agent = makeAgent(cwd, records);

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_legacy_packet',
      toolName: 'mcp__aitp__aitp_v5_build_legacy_semantic_review_packet',
      args: { base: cwd, topic: 'qsgw-ac-error-molecules' },
      cwd,
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_legacy_packet',
      result: {
        output: JSON.stringify(aitpLegacySemanticReviewPacketPayload()),
      },
    });

    const frame = agent.workFrames.active;
    expect(frame?.topic).toBe('qsgw-ac-error-molecules');
    expect(frame?.sourceRefs).toEqual(
      expect.arrayContaining([
        'aitp:session:codex-20260611-si-g0w0-pade-test',
        'aitp:claim:claim-live',
        'claim:claim-live',
      ]),
    );
    expect(agent.toolLifecycle.listRecent()[0]?.completed.workFrameId).toBe(frame?.id);
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'workframe.opened',
        source: 'controller',
        toolCallId: 'call_legacy_packet',
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_context.context_compiled',
        source: 'controller',
        workFrameId: frame?.id,
        toolCallId: 'call_legacy_packet',
      }),
    );
  });

  it('captures a git diff observation into the research ledger', async () => {
    const cwd = await tempDir('aitp-auto-capture-');
    const records: AgentRecord[] = [];
    const agent = makeAgent(cwd, records);
    const manager = agent.researchLedger;
    if (manager === null) throw new Error('Expected research ledger manager');

    agent.workFrames.open(
      {
        id: 'frame.librpa',
        domain: 'librpa',
        topic: 'librpa-head-wing',
        goal: 'Inspect head-wing diff',
        sourceRefs: ['local:head-wing-plan'],
        activeObjectIds: ['code:librpa/head-wing'],
      },
      { source: 'controller' },
    );
    agent.researchAction.startActionCall(
      {
        actionId: 'code.capture_git_diff_observation',
        callId: 'call.capture-diff',
      },
      { source: 'controller' },
    );

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_git_diff',
      toolName: 'Bash',
      args: { command: 'git diff -- src/head_wing.cpp' },
      cwd,
      workFrameId: 'frame.librpa',
      actionCallId: 'call.capture-diff',
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_git_diff',
      result: {
        output: 'diff --git a/src/head_wing.cpp b/src/head_wing.cpp\n+ changed normalization',
      },
      artifactRefs: ['artifact:git-diff.patch'],
      workFrameId: 'frame.librpa',
      actionCallId: 'call.capture-diff',
    });

    const event = manager.registry.listEvents({ type: 'git_diff_observation' })[0];
    expect(event?.metadata.topic).toBe('librpa-head-wing');
    expect(event?.metadata.domain).toBe('librpa');
    expect(event?.metadata.sourceRefs).toEqual(
      expect.arrayContaining([
        'local:head-wing-plan',
        'tool:Bash',
        'git:tool-call:call_git_diff',
        'artifact:git-diff.patch',
      ]),
    );
    expect(event?.body).toContain('## Args Summary');
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_ledger.event_written',
        source: 'controller',
        eventType: 'git_diff_observation',
        toolCallId: 'call_git_diff',
      }),
    );
  });

  it('captures blocking failures and preserves artifact refs', async () => {
    const cwd = await tempDir('aitp-auto-capture-');
    const agent = makeAgent(cwd);
    const manager = agent.researchLedger;
    if (manager === null) throw new Error('Expected research ledger manager');

    agent.workFrames.open(
      {
        id: 'frame.fqhe',
        domain: 'topological-order',
        topic: 'fqhe-cs',
        goal: 'Check a risky derivation step',
        sourceRefs: ['arxiv:cond-mat/0101029'],
      },
      { source: 'controller' },
    );

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_fail',
      toolName: 'Bash',
      args: { command: 'run-check --step flux-quantization' },
      cwd,
      workFrameId: 'frame.fqhe',
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_fail',
      result: {
        output: 'check failed: flux quantization mismatch',
        isError: true,
      },
      artifactRefs: ['artifact:flux-check.log'],
      workFrameId: 'frame.fqhe',
    });

    const event = manager.registry.listEvents({ type: 'failure_observation' })[0];
    expect(event?.metadata.sourceRefs).toEqual(
      expect.arrayContaining(['failure:tool-call:call_fail', 'artifact:flux-check.log']),
    );
    expect(event?.body).toContain('Failure Status');
  });

  it('skips low-value tool noise and records the skip reason', async () => {
    const cwd = await tempDir('aitp-auto-capture-');
    const records: AgentRecord[] = [];
    const agent = makeAgent(cwd, records);

    agent.workFrames.open(
      {
        id: 'frame.misc',
        domain: 'librpa',
        topic: 'misc-topic',
        goal: 'Avoid noisy capture',
      },
      { source: 'controller' },
    );

    agent.toolLifecycle.recordStarted({
      source: 'controller',
      turnId: 0,
      step: 1,
      stepUuid: 'step-1',
      toolCallId: 'call_ls',
      toolName: 'LS',
      args: { path: '.' },
      cwd,
      workFrameId: 'frame.misc',
    });
    await agent.toolLifecycle.recordCompleted({
      source: 'controller',
      turnId: 0,
      toolCallId: 'call_ls',
      result: {
        output: 'src\npackage.json\nREADME.md',
      },
      workFrameId: 'frame.misc',
    });

    expect(
      records.some(
        (record) =>
          record.type === 'research_ledger.event_written' &&
          record.toolCallId === 'call_ls',
      ),
    ).toBe(false);
    expect(records).toContainEqual(
      expect.objectContaining({
        type: 'research_ledger.auto_capture_skipped',
        toolCallId: 'call_ls',
        reason: 'low-value-tool-output',
      }),
    );
  });
});

function makeAgent(cwd: string, records?: AgentRecord[]): Agent {
  const agent = new Agent({
    kaos: testKaos,
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
    researchLedger: new ResearchLedgerRegistry(),
  });
  agent.config.update({
    cwd,
    modelAlias: MOCK_PROVIDER.model,
  });
  return agent;
}

function aitpClaimRelationMapPayload() {
  return {
    kind: 'claim_relation_map',
    topic_id: 'ads-random-boundary-matter-20260612',
    session_id: 'session-ads',
    claim_id: 'claim-ads',
    claim_statement: 'Massive matter dynamics in a random open AdS boundary need a model-layer split.',
    confidence_state: 'exploratory',
    evidence_profile: 'theory_orientation',
    latest_claim_status: {},
    supported_by: [],
    limited_by: [],
    contradicted_by: [],
    not_tested_by: [],
    object_relations: [],
    current_conclusion: {
      can_say: ['active claim remains exploratory'],
      cannot_say: ['cannot promote claim trust from the relation map alone'],
    },
    current_blockers: [],
    next_valid_actions: ['derive the finite-cutoff hitting-time model'],
    source_records: {},
    derived_from: ['claim_status_records'],
    truth_source: false,
    orientation_only: true,
    summary_inputs_trusted: false,
    can_update_kernel_state: false,
    can_update_claim_trust: false,
    trust_update_allowed: false,
  };
}

function aitpExecutionBriefPayload() {
  return {
    session: {
      session_id: 'session-ads',
      topic_id: 'ads-random-boundary-matter-20260612',
      active_claim: 'claim-ads',
    },
    current_focus: {
      confidence_state: 'exploratory',
    },
  };
}

function aitpLegacySemanticReviewPacketPayload() {
  return {
    ok: true,
    kind: 'legacy_semantic_review_packet',
    topic: 'qsgw-ac-error-molecules',
    active_claim_id: 'claim-migration',
    current_recovery_focus: {
      kind: 'legacy_current_recovery_focus',
      topic: 'qsgw-ac-error-molecules',
      session_id: 'codex-20260611-si-g0w0-pade-test',
      active_claim_id: 'claim-live',
      migration_active_claim_id: 'claim-migration',
      active_claim_divergence: true,
    },
    file_review_scope: {
      scope_status: 'ready',
      required_review_refs: ['old_store:qsgw-ac-error-molecules:state.md'],
    },
  };
}

async function tempDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  onTestFinished(async () => {
    await rm(path, { recursive: true, force: true });
  });
  return path;
}
