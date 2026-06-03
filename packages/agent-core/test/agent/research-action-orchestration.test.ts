import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, type Writable } from 'node:stream';

import type { Kaos, KaosProcess } from '@moonshot-ai/kaos';
import type { ToolCall } from '@moonshot-ai/kosong';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { WorkflowRecipeRegistry, type WorkflowRecipe } from '../../src';
import { ResearchLedgerRegistry } from '../../src/research-ledger';
import { createFakeKaos } from '../tools/fixtures/fake-kaos';
import { testAgent } from './harness/agent';

const REGULAR_FILE_STAT = {
  stMode: 0o100_644,
  stIno: 1,
  stDev: 1,
  stNlink: 1,
  stUid: 1000,
  stGid: 1000,
  stSize: 0,
  stAtime: 0,
  stMtime: 0,
  stCtime: 0,
} satisfies Awaited<ReturnType<Kaos['stat']>>;

describe('ResearchAction native-tool orchestration', () => {
  it('runs a source-search action through native Kimi tools and records primitive call attribution', async () => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION', '1');
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER', '1');
    const search = vi.fn(async () => [
      {
        title: 'Flux insertion and Hall conductance',
        url: 'https://example.test/fqhe-flux',
        snippet: 'Flux insertion identifies the quantized Hall response.',
      },
    ]);
    const fetch = vi.fn(async () => ({
      content: 'The flux insertion argument relates adiabatic flux threading to Hall response.',
      kind: 'passthrough' as const,
    }));
    const ledger = await createLedgerRegistry();
    const workflowRecipes = new WorkflowRecipeRegistry();
    workflowRecipes.register(sourceSearchWorkflow());
    const ctx = testAgent({
      researchLedger: ledger.registry,
      workflowRecipes,
      runtime: {
        webSearcher: { search },
        urlFetcher: { fetch },
      },
    });
    ctx.configure();
    ctx.agent.config.update({ cwd: ledger.cwd });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    ctx.agent.workFrames.open(
      {
        id: 'frame.sources',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-literature',
        goal: 'Find source support for the FQHE flux insertion argument.',
      },
      { source: 'controller' },
    );

    ctx.mockNextResponse(
      { type: 'text', text: 'I will inspect the primitive plan.' },
      researchActionCall('call_plan_source', {
        action: 'plan_primitive_tools',
        action_id: 'source.search_literature',
      }),
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will start the semantic action.' },
      researchActionCall('call_start_source', {
        action: 'start_action_call',
        action_id: 'source.search_literature',
        call_id: 'call.source-search',
        action_input: { query: 'FQHE flux insertion source support' },
      }),
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will search source literature.' },
      {
        type: 'function',
        id: 'call_web_search_source',
        name: 'WebSearch',
        arguments: JSON.stringify({
          query: 'FQHE flux insertion source support',
          limit: 2,
          include_content: false,
        }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will fetch the strongest source.' },
      {
        type: 'function',
        id: 'call_fetch_source',
        name: 'FetchURL',
        arguments: JSON.stringify({
          url: 'https://example.test/fqhe-flux',
        }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will capture the source candidate in the ledger.' },
      {
        type: 'function',
        id: 'call_ledger_source',
        name: 'ResearchLedger',
        arguments: JSON.stringify({
          action: 'capture_event',
          capture_class: 'source_excerpt',
          topic: 'fqhe-literature',
          domain: 'topological-order/fqhe-cs',
          title: 'FQHE flux insertion source excerpt',
          body: 'The flux insertion argument relates adiabatic flux threading to Hall response.',
          source_refs: ['https://example.test/fqhe-flux'],
        }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will finish the semantic action with primitive call ids.' },
      researchActionCall('call_finish_source', {
        action: 'finish_action_call',
        action_id: 'source.search_literature',
        call_id: 'call.source-search',
        outcome: 'pass',
        action_output: {
          selected_sources: ['https://example.test/fqhe-flux'],
        },
        evidence_refs: [
          'source:https://example.test/fqhe-flux',
          'ledger:event.fqhe-literature.source_excerpt.FQHE-flux-insertion-source-excerpt',
        ],
        primitive_tool_call_ids: [
          'call_web_search_source',
          'call_fetch_source',
          'call_ledger_source',
        ],
        next_suggested_actions: ['source.capture_source_excerpt'],
      }),
    );
    ctx.mockNextResponse({
      type: 'text',
      text: 'The source-search action is recorded with WebSearch and FetchURL attribution.',
    });

    await ctx.rpc.prompt({
      input: [
        {
          type: 'text',
          text: 'Search the literature for source support on FQHE flux insertion.',
        },
      ],
    });
    await ctx.untilTurnEnd();

    const firstVisibleTools = ctx.llmCalls[0]?.tools.map((tool) => tool.name) ?? [];
    expect(firstVisibleTools).toEqual(
      expect.arrayContaining(['ResearchAction', 'ResearchLedger', 'WebSearch', 'FetchURL']),
    );
    expect(firstVisibleTools).not.toContain('Bash');
    expect(firstVisibleTools).not.toContain('Edit');
    expect(firstVisibleTools).not.toContain('Write');
    expect(search).toHaveBeenCalledWith(
      'FQHE flux insertion source support',
      expect.objectContaining({
        includeContent: false,
        limit: 2,
        toolCallId: 'call_web_search_source',
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/fqhe-flux',
      expect.objectContaining({
        toolCallId: 'call_fetch_source',
      }),
    );

    const reminder = researchContextReminderText(ctx.agent.context.history);
    expect(reminder).toContain('source.search_literature [tools: WebSearch');
    expect(reminder).toContain('ResearchAction.plan_primitive_tools');
    expect(wireEventArgs(ctx.allEvents, 'tool_lifecycle.completed')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCallId: 'call_web_search_source',
          toolName: 'WebSearch',
          workFrameId: 'frame.sources',
          actionCallId: 'call.source-search',
        }),
        expect.objectContaining({
          toolCallId: 'call_fetch_source',
          toolName: 'FetchURL',
          workFrameId: 'frame.sources',
          actionCallId: 'call.source-search',
        }),
        expect.objectContaining({
          toolCallId: 'call_ledger_source',
          toolName: 'ResearchLedger',
          workFrameId: 'frame.sources',
          actionCallId: 'call.source-search',
        }),
      ]),
    );
    expect(wireEventArgs(ctx.allEvents, 'research_ledger.event_written')).toContainEqual(
      expect.objectContaining({
        source: 'model-tool',
        eventId: 'event.fqhe-literature.source_excerpt.FQHE-flux-insertion-source-excerpt',
        topic: 'fqhe-literature',
        domain: 'topological-order/fqhe-cs',
        eventType: 'source_excerpt',
        status: 'captured',
        toolCallId: 'call_ledger_source',
      }),
    );
    expect(wireEventArgs(ctx.allEvents, 'research_action.call_finished')).toContainEqual(
      expect.objectContaining({
        source: 'model',
        actionId: 'source.search_literature',
        callId: 'call.source-search',
        workFrameId: 'frame.sources',
        evidenceRefs: [
          'source:https://example.test/fqhe-flux',
          'ledger:event.fqhe-literature.source_excerpt.FQHE-flux-insertion-source-excerpt',
        ],
        primitiveToolCallIds: [
          'call_web_search_source',
          'call_fetch_source',
          'call_ledger_source',
        ],
        nextSuggestedActions: ['source.capture_source_excerpt'],
        toolCallId: 'call_finish_source',
      }),
    );
    const sourceLedgerEvent = ledger.registry.requireEvent(
      'event.fqhe-literature.source_excerpt.FQHE-flux-insertion-source-excerpt',
    );
    expect(sourceLedgerEvent.body).toContain('adiabatic flux threading');
    expect(await readFile(sourceLedgerEvent.path, 'utf8')).toContain('source_excerpt');
    expect(ctx.agent.researchAction.recentEvidence(5, { workFrameId: 'frame.sources' })).toEqual([
      'source:https://example.test/fqhe-flux',
      'ledger:event.fqhe-literature.source_excerpt.FQHE-flux-insertion-source-excerpt',
    ]);
    await ctx.expectResumeMatches();
  });

  it('runs a code-patch action through native file tools without source-tool leakage', async () => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION', '1');
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER', '1');
    const ledger = await createLedgerRegistry();
    const kernelPath = `${ledger.cwd}/kernel.ts`;
    const researchKaos = createResearchKaos({
      cwd: ledger.cwd,
      files: {
        [kernelPath]: 'export const value = 1;\n',
      },
      stdoutForCommand: () => 'kernel.ts:1:export const value = 2;\n',
    });
    const workflowRecipes = new WorkflowRecipeRegistry();
    workflowRecipes.register(codePatchWorkflow());
    const ctx = testAgent({
      kaos: researchKaos.kaos,
      researchLedger: ledger.registry,
      workflowRecipes,
      runtime: inertWebRuntime(),
    });
    ctx.configure();
    ctx.agent.config.update({ cwd: ledger.cwd });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    ctx.agent.workFrames.open(
      {
        id: 'frame.patch',
        domain: 'librpa',
        topic: 'head-wing-patch',
        goal: 'Prepare a scoped code patch for a mapped intermediate observable.',
      },
      { source: 'controller' },
    );

    ctx.mockNextResponse(
      { type: 'text', text: 'I will inspect the patch primitive plan.' },
      researchActionCall('call_plan_patch', {
        action: 'plan_primitive_tools',
        action_id: 'code.prepare_patch',
      }),
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will start the code patch action.' },
      researchActionCall('call_start_patch', {
        action: 'start_action_call',
        action_id: 'code.prepare_patch',
        call_id: 'call.code-patch',
        action_input: { target: 'kernel.ts:value' },
      }),
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will read the target file.' },
      {
        type: 'function',
        id: 'call_read_patch',
        name: 'Read',
        arguments: JSON.stringify({ path: 'kernel.ts' }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will apply the scoped edit.' },
      {
        type: 'function',
        id: 'call_edit_patch',
        name: 'Edit',
        arguments: JSON.stringify({
          path: 'kernel.ts',
          old_string: 'export const value = 1;\n',
          new_string: 'export const value = 2;\n',
        }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will verify the changed symbol.' },
      {
        type: 'function',
        id: 'call_verify_patch',
        name: 'Bash',
        arguments: JSON.stringify({
          command: 'grep -n "value = 2" kernel.ts',
          timeout: 5,
        }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will capture the patch observation in the ledger.' },
      {
        type: 'function',
        id: 'call_ledger_patch',
        name: 'ResearchLedger',
        arguments: JSON.stringify({
          action: 'capture_event',
          capture_class: 'git_diff_observation',
          topic: 'head-wing-patch',
          domain: 'librpa',
          title: 'Head-wing patch diff observation',
          body: 'kernel.ts changes the mapped value from 1 to 2 and grep verifies value = 2.',
          source_refs: [`file:${kernelPath}`],
          artifact_refs: ['verification:grep-value-2'],
          related_objects: ['code:kernel.ts:value'],
        }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will finish the code patch action.' },
      researchActionCall('call_finish_patch', {
        action: 'finish_action_call',
        action_id: 'code.prepare_patch',
        call_id: 'call.code-patch',
        outcome: 'pass',
        action_output: {
          changed_files: ['kernel.ts'],
          verification: 'grep found value = 2',
        },
        evidence_refs: [
          `file:${kernelPath}`,
          'verification:grep-value-2',
          'ledger:event.head-wing-patch.git_diff_observation.Head-wing-patch-diff-observation',
        ],
        primitive_tool_call_ids: [
          'call_read_patch',
          'call_edit_patch',
          'call_verify_patch',
          'call_ledger_patch',
        ],
        next_suggested_actions: ['code.capture_git_diff_observation'],
      }),
    );
    ctx.mockNextResponse({
      type: 'text',
      text: 'The code patch action is recorded with native file-tool attribution.',
    });

    await ctx.rpc.prompt({
      input: [{ type: 'text', text: 'Prepare the mapped patch for the head-wing code path.' }],
    });
    await ctx.untilTurnEnd();

    const firstVisibleTools = ctx.llmCalls[0]?.tools.map((tool) => tool.name) ?? [];
    expect(firstVisibleTools).toEqual(
      expect.arrayContaining([
        'ResearchAction',
        'ResearchLedger',
        'Read',
        'Grep',
        'Edit',
        'Write',
        'Bash',
      ]),
    );
    expect(firstVisibleTools).not.toContain('WebSearch');
    expect(firstVisibleTools).not.toContain('FetchURL');
    expect(researchKaos.files.get(kernelPath)).toBe('export const value = 2;\n');
    expect(researchKaos.execWithEnv).toHaveBeenCalledTimes(1);

    const reminder = researchContextReminderText(ctx.agent.context.history);
    expect(reminder).toContain('code.prepare_patch [tools: Read');
    expect(wireEventArgs(ctx.allEvents, 'tool_lifecycle.completed')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCallId: 'call_read_patch',
          toolName: 'Read',
          workFrameId: 'frame.patch',
          actionCallId: 'call.code-patch',
        }),
        expect.objectContaining({
          toolCallId: 'call_edit_patch',
          toolName: 'Edit',
          workFrameId: 'frame.patch',
          actionCallId: 'call.code-patch',
        }),
        expect.objectContaining({
          toolCallId: 'call_verify_patch',
          toolName: 'Bash',
          workFrameId: 'frame.patch',
          actionCallId: 'call.code-patch',
        }),
        expect.objectContaining({
          toolCallId: 'call_ledger_patch',
          toolName: 'ResearchLedger',
          workFrameId: 'frame.patch',
          actionCallId: 'call.code-patch',
        }),
      ]),
    );
    expect(wireEventArgs(ctx.allEvents, 'research_ledger.event_written')).toContainEqual(
      expect.objectContaining({
        source: 'model-tool',
        eventId: 'event.head-wing-patch.git_diff_observation.Head-wing-patch-diff-observation',
        topic: 'head-wing-patch',
        domain: 'librpa',
        eventType: 'git_diff_observation',
        status: 'captured',
        toolCallId: 'call_ledger_patch',
      }),
    );
    expect(wireEventArgs(ctx.allEvents, 'research_action.call_finished')).toContainEqual(
      expect.objectContaining({
        source: 'model',
        actionId: 'code.prepare_patch',
        callId: 'call.code-patch',
        workFrameId: 'frame.patch',
        evidenceRefs: [
          `file:${kernelPath}`,
          'verification:grep-value-2',
          'ledger:event.head-wing-patch.git_diff_observation.Head-wing-patch-diff-observation',
        ],
        primitiveToolCallIds: [
          'call_read_patch',
          'call_edit_patch',
          'call_verify_patch',
          'call_ledger_patch',
        ],
        nextSuggestedActions: ['code.capture_git_diff_observation'],
        toolCallId: 'call_finish_patch',
      }),
    );
    const patchLedgerEvent = ledger.registry.requireEvent(
      'event.head-wing-patch.git_diff_observation.Head-wing-patch-diff-observation',
    );
    expect(patchLedgerEvent.body).toContain('grep verifies value = 2');
    expect(await readFile(patchLedgerEvent.path, 'utf8')).toContain('git_diff_observation');
    expect(ctx.agent.researchAction.recentEvidence(5, { workFrameId: 'frame.patch' })).toEqual([
      `file:${kernelPath}`,
      'verification:grep-value-2',
      'ledger:event.head-wing-patch.git_diff_observation.Head-wing-patch-diff-observation',
    ]);
    await ctx.expectResumeMatches();
  });

  it('runs an external benchmark submission through native Bash attribution only', async () => {
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION', '1');
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER', '1');
    const ledger = await createLedgerRegistry();
    const jobPath = `${ledger.cwd}/job.sh`;
    const researchKaos = createResearchKaos({
      cwd: ledger.cwd,
      files: {
        [jobPath]: '#!/usr/bin/env bash\nprintf benchmark\n',
      },
      stdoutForCommand: () => 'Submitted batch job 4242\n',
    });
    const workflowRecipes = new WorkflowRecipeRegistry();
    workflowRecipes.register(benchmarkSubmitWorkflow());
    const ctx = testAgent({
      kaos: researchKaos.kaos,
      researchLedger: ledger.registry,
      workflowRecipes,
      runtime: inertWebRuntime(),
    });
    ctx.configure();
    ctx.agent.config.update({ cwd: ledger.cwd });
    await ctx.rpc.setPermission({ mode: 'yolo' });
    ctx.agent.workFrames.open(
      {
        id: 'frame.submit',
        domain: 'librpa',
        topic: 'head-wing-submit',
        goal: 'Submit the minimal external benchmark job and record the scheduler id.',
      },
      { source: 'controller' },
    );

    ctx.mockNextResponse(
      { type: 'text', text: 'I will inspect the external-job primitive plan.' },
      researchActionCall('call_plan_submit', {
        action: 'plan_primitive_tools',
        action_id: 'benchmark.submit_external_job',
      }),
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will start the external submission action.' },
      researchActionCall('call_start_submit', {
        action: 'start_action_call',
        action_id: 'benchmark.submit_external_job',
        call_id: 'call.external-submit',
        action_input: { job_script: 'job.sh' },
      }),
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will inspect the job script.' },
      {
        type: 'function',
        id: 'call_read_job',
        name: 'Read',
        arguments: JSON.stringify({ path: 'job.sh' }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will submit the queued benchmark.' },
      {
        type: 'function',
        id: 'call_submit_job',
        name: 'Bash',
        arguments: JSON.stringify({
          command: 'submit_job job.sh',
          timeout: 5,
        }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will capture the submission observation in the ledger.' },
      {
        type: 'function',
        id: 'call_ledger_submit',
        name: 'ResearchLedger',
        arguments: JSON.stringify({
          action: 'capture_event',
          capture_class: 'benchmark_observation',
          topic: 'head-wing-submit',
          domain: 'librpa',
          title: 'External benchmark submission 4242',
          body: 'Scheduler returned: Submitted batch job 4242.',
          source_refs: ['job:4242'],
          artifact_refs: [`artifact:${jobPath}`],
          related_objects: ['benchmark:librpa/head-wing-submit'],
        }),
      },
    );
    ctx.mockNextResponse(
      { type: 'text', text: 'I will finish the external submission action.' },
      researchActionCall('call_finish_submit', {
        action: 'finish_action_call',
        action_id: 'benchmark.submit_external_job',
        call_id: 'call.external-submit',
        outcome: 'pass',
        action_output: {
          job_id: '4242',
          scheduler_output: 'Submitted batch job 4242',
        },
        evidence_refs: [
          'job:4242',
          `artifact:${jobPath}`,
          'ledger:event.head-wing-submit.benchmark_observation.External-benchmark-submission-4242',
        ],
        primitive_tool_call_ids: ['call_read_job', 'call_submit_job', 'call_ledger_submit'],
        next_suggested_actions: ['benchmark.run_minimal_case'],
      }),
    );
    ctx.mockNextResponse({
      type: 'text',
      text: 'The external submission action is recorded with native Bash attribution.',
    });

    await ctx.rpc.prompt({
      input: [{ type: 'text', text: 'Submit the external benchmark job for this topic.' }],
    });
    await ctx.untilTurnEnd();

    const firstVisibleTools = ctx.llmCalls[0]?.tools.map((tool) => tool.name) ?? [];
    expect(firstVisibleTools).toEqual(
      expect.arrayContaining(['ResearchAction', 'ResearchLedger', 'Read', 'Grep', 'Bash']),
    );
    expect(firstVisibleTools).not.toContain('WebSearch');
    expect(firstVisibleTools).not.toContain('FetchURL');
    expect(researchKaos.execWithEnv).toHaveBeenCalledTimes(1);

    const reminder = researchContextReminderText(ctx.agent.context.history);
    expect(reminder).toContain('benchmark.submit_external_job [tools: Read');
    expect(wireEventArgs(ctx.allEvents, 'tool_lifecycle.completed')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCallId: 'call_read_job',
          toolName: 'Read',
          workFrameId: 'frame.submit',
          actionCallId: 'call.external-submit',
        }),
        expect.objectContaining({
          toolCallId: 'call_submit_job',
          toolName: 'Bash',
          workFrameId: 'frame.submit',
          actionCallId: 'call.external-submit',
        }),
        expect.objectContaining({
          toolCallId: 'call_ledger_submit',
          toolName: 'ResearchLedger',
          workFrameId: 'frame.submit',
          actionCallId: 'call.external-submit',
        }),
      ]),
    );
    expect(wireEventArgs(ctx.allEvents, 'research_ledger.event_written')).toContainEqual(
      expect.objectContaining({
        source: 'model-tool',
        eventId: 'event.head-wing-submit.benchmark_observation.External-benchmark-submission-4242',
        topic: 'head-wing-submit',
        domain: 'librpa',
        eventType: 'benchmark_observation',
        status: 'captured',
        toolCallId: 'call_ledger_submit',
      }),
    );
    expect(wireEventArgs(ctx.allEvents, 'research_action.call_finished')).toContainEqual(
      expect.objectContaining({
        source: 'model',
        actionId: 'benchmark.submit_external_job',
        callId: 'call.external-submit',
        workFrameId: 'frame.submit',
        evidenceRefs: [
          'job:4242',
          `artifact:${jobPath}`,
          'ledger:event.head-wing-submit.benchmark_observation.External-benchmark-submission-4242',
        ],
        primitiveToolCallIds: ['call_read_job', 'call_submit_job', 'call_ledger_submit'],
        nextSuggestedActions: ['benchmark.run_minimal_case'],
        toolCallId: 'call_finish_submit',
      }),
    );
    const submitLedgerEvent = ledger.registry.requireEvent(
      'event.head-wing-submit.benchmark_observation.External-benchmark-submission-4242',
    );
    expect(submitLedgerEvent.body).toContain('Submitted batch job 4242');
    expect(await readFile(submitLedgerEvent.path, 'utf8')).toContain('benchmark_observation');
    expect(ctx.agent.researchAction.recentEvidence(5, { workFrameId: 'frame.submit' })).toEqual([
      'job:4242',
      `artifact:${jobPath}`,
      'ledger:event.head-wing-submit.benchmark_observation.External-benchmark-submission-4242',
    ]);
    await ctx.expectResumeMatches();
  });
});

function researchActionCall(id: string, input: Record<string, unknown>): ToolCall {
  return {
    type: 'function',
    id,
    name: 'ResearchAction',
    arguments: JSON.stringify(input),
  };
}

function wireEventArgs(
  events: readonly { readonly type: string; readonly event: string; readonly args: unknown }[],
  eventName: string,
): readonly unknown[] {
  return events
    .filter((event) => event.type === '[wire]' && event.event === eventName)
    .map((event) => event.args);
}

function researchContextReminderText(
  history: readonly {
    readonly origin?: { readonly kind?: string; readonly variant?: string } | undefined;
    readonly content: readonly { readonly type: string; readonly text?: string | undefined }[];
  }[],
): string {
  const message = history.find(
    (item) => item.origin?.kind === 'injection' && item.origin.variant === 'research_context',
  );
  return message?.content
    .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
    .join('') ?? '';
}

function sourceSearchWorkflow(): WorkflowRecipe {
  return {
    metadata: {
      id: 'workflow.fqhe.source-search',
      kind: 'workflow_recipe',
      title: 'FQHE source search',
      domain: 'topological-order/fqhe-cs',
      status: 'checked',
      sourceRefs: ['local:workflow'],
      actionBindings: [
        {
          id: 'binding.fqhe.source-search',
          actionId: 'source.search_literature',
          domainId: 'topological-order/fqhe-cs',
          workflowId: 'workflow.fqhe.source-search',
          priority: 'high',
        },
      ],
      requiredCapsules: [],
      requiredTools: [],
      failureModes: [],
    },
    path: 'workflow.md',
    body: 'Search source literature and record primitive tool call ids.',
    source: 'project',
  };
}

function codePatchWorkflow(): WorkflowRecipe {
  return {
    metadata: {
      id: 'workflow.librpa.code-patch',
      kind: 'workflow_recipe',
      title: 'LibRPA code patch',
      domain: 'librpa',
      status: 'checked',
      sourceRefs: ['local:workflow'],
      actionBindings: [
        {
          id: 'binding.librpa.code-patch',
          actionId: 'code.prepare_patch',
          domainId: 'librpa',
          workflowId: 'workflow.librpa.code-patch',
          priority: 'high',
        },
      ],
      requiredCapsules: [],
      requiredTools: [],
      failureModes: [],
    },
    path: 'workflow.md',
    body: 'Prepare a scoped code patch and record primitive tool call ids.',
    source: 'project',
  };
}

function benchmarkSubmitWorkflow(): WorkflowRecipe {
  return {
    metadata: {
      id: 'workflow.librpa.external-submit',
      kind: 'workflow_recipe',
      title: 'LibRPA external benchmark submission',
      domain: 'librpa',
      status: 'checked',
      sourceRefs: ['local:workflow'],
      actionBindings: [
        {
          id: 'binding.librpa.external-submit',
          actionId: 'benchmark.submit_external_job',
          domainId: 'librpa',
          workflowId: 'workflow.librpa.external-submit',
          priority: 'high',
        },
      ],
      requiredCapsules: [],
      requiredTools: [],
      failureModes: [],
    },
    path: 'workflow.md',
    body: 'Submit a queued benchmark through native execution and record the scheduler id.',
    source: 'project',
  };
}

function inertWebRuntime() {
  return {
    webSearcher: {
      search: vi.fn(async () => []),
    },
    urlFetcher: {
      fetch: vi.fn(async () => ({ content: 'unused', kind: 'passthrough' as const })),
    },
  };
}

async function createLedgerRegistry(): Promise<{
  readonly registry: ResearchLedgerRegistry;
  readonly cwd: string;
  readonly rootPath: string;
}> {
  const cwd = toPosixPath(await mkdtemp(join(tmpdir(), 'aitp-orchestration-project-')));
  const rootPath = `${cwd}/.aitp/research-ledger`;
  onTestFinished(async () => {
    await rm(cwd, { recursive: true, force: true });
  });
  const registry = new ResearchLedgerRegistry();
  registry.ensureRoot({ path: rootPath, source: 'project' });
  return { registry, cwd, rootPath };
}

function createResearchKaos(options: {
  readonly cwd: string;
  readonly files: Record<string, string>;
  readonly stdoutForCommand: (command: string) => string;
}): {
  readonly kaos: Kaos;
  readonly files: Map<string, string>;
  readonly execWithEnv: ReturnType<typeof vi.fn<Kaos['execWithEnv']>>;
} {
  const cwd = normalizeTestPath(options.cwd);
  const files = new Map(
    Object.entries(options.files).map(([path, content]) => [
      normalizeWorkspacePath(path, cwd),
      content,
    ]),
  );
  const readText = vi.fn<Kaos['readText']>(async (path) => {
    return requireFile(files, path, cwd);
  });
  const readBytes = vi.fn<Kaos['readBytes']>(async (path, n) => {
    const bytes = Buffer.from(requireFile(files, path, cwd), 'utf8');
    return n === undefined ? bytes : bytes.subarray(0, n);
  });
  const readLines = vi.fn<Kaos['readLines']>(async function* readLines(path) {
    for (const line of linesFromContent(requireFile(files, path, cwd))) {
      yield line;
    }
  });
  const writeText = vi.fn<Kaos['writeText']>(async (path, content) => {
    files.set(normalizeWorkspacePath(path, cwd), content);
    return content.length;
  });
  const stat = vi.fn<Kaos['stat']>(async (path) => {
    const content = requireFile(files, path, cwd);
    return { ...REGULAR_FILE_STAT, stSize: Buffer.byteLength(content, 'utf8') };
  });
  const execWithEnv = vi.fn<Kaos['execWithEnv']>(async (args) => {
    const command = args[2] ?? args.join(' ');
    return createProcess(options.stdoutForCommand(command));
  });

  return {
    files,
    execWithEnv,
    kaos: createFakeKaos({
      getcwd: () => cwd,
      stat,
      readBytes,
      readLines,
      readText,
      writeText,
      execWithEnv,
    }),
  };
}

function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function normalizeTestPath(path: string): string {
  return toPosixPath(path).replaceAll(/\/+$/g, '');
}

function normalizeWorkspacePath(path: string, cwd: string): string {
  const normalized = toPosixPath(path);
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return normalized;
  return `${cwd}/${normalized}`;
}

function requireFile(files: ReadonlyMap<string, string>, path: string, cwd: string): string {
  const content = files.get(normalizeWorkspacePath(path, cwd));
  if (content !== undefined) return content;
  const error = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  throw error;
}

function linesFromContent(content: string): string[] {
  if (content.length === 0) return [];
  const rawLines = content.split('\n');
  return rawLines.flatMap((line, index) => {
    if (index < rawLines.length - 1) return [`${line}\n`];
    return line.length === 0 ? [] : [line];
  });
}

function createProcess(stdout: string): KaosProcess {
  return {
    stdin: { write: vi.fn(), end: vi.fn() } as unknown as Writable,
    stdout: Readable.from([stdout]),
    stderr: Readable.from(['']),
    pid: 42,
    exitCode: 0,
    wait: vi.fn().mockResolvedValue(0),
    kill: vi.fn().mockResolvedValue(undefined),
  };
}
