import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeSession,
  classifyReasoningCues,
  createHakimiAuditEnv,
  evaluateExpectations,
  parseCli,
  renderMarkdown,
} from '../../../../scripts/hakimi-real-session-audit.mjs';

describe('hakimi real session audit harness', () => {
  it('reconstructs redacted reasoning-led tool behavior from a session wire', async ({ task }) => {
    const root = join(process.cwd(), '.vitest-tmp', task.id);
    const home = join(root, 'home');
    const workdir = join(root, 'workdir');
    const sessionDir = join(home, 'sessions', 'wd_fixture', 'session_fixture');
    const agentDir = join(sessionDir, 'agents', 'main');
    await mkdir(agentDir, { recursive: true });
    await mkdir(join(workdir, '.hakimi', 'research-ledger', 'fixture-topic'), { recursive: true });
    await writeFile(join(sessionDir, 'state.json'), JSON.stringify({ workDir: workdir, title: 'fixture' }), 'utf8');
    await writeFile(
      join(agentDir, 'wire.jsonl'),
      [
        {
          type: 'context.append_loop_event',
          event: {
            type: 'content.part',
            uuid: 'think_1',
            turnId: '0',
            step: 1,
            part: {
              type: 'think',
              think: 'Need to open a WorkFrame, then compile a context pack and write to Research Ledger.',
            },
          },
        },
        {
          type: 'reasoning.audit',
          turnId: '0',
          step: 1,
          stepUuid: 'step_1',
          partUuid: 'think_1',
          chars: 83,
          cues: ['workframe', 'context_pack', 'research_ledger'],
          redacted: true,
        },
        {
          type: 'context.append_loop_event',
          event: {
            type: 'content.part',
            turnId: '0',
            step: 1,
            part: { type: 'text', text: 'I will open the research frame now.' },
          },
        },
        {
          type: 'context.append_loop_event',
          event: {
            type: 'tool.call',
            turnId: '0',
            step: 1,
            toolCallId: 'tool_1',
            name: 'ResearchAction',
            args: { action: 'open_work_frame', topic: 'fixture-topic', goal: 'audit fixture' },
          },
        },
        {
          type: 'context.append_loop_event',
          event: {
            type: 'tool.call',
            turnId: '0',
            step: 1,
            toolCallId: 'tool_2',
            name: 'ResearchAction',
            args: { action: 'compile_context_pack', work_frame_id: 'frame.fixture' },
          },
        },
        {
          type: 'tool_lifecycle.completed',
          turnId: 0,
          step: 1,
          toolCallId: 'tool_1',
          toolName: 'ResearchAction',
          status: 'passed',
          isError: false,
          argsSummary: JSON.stringify({ action: 'open_work_frame' }),
          outputSummary: '<work_frame id="frame.fixture" topic="fixture-topic" />',
        },
        {
          type: 'tool_lifecycle.completed',
          turnId: 0,
          step: 1,
          toolCallId: 'tool_2',
          toolName: 'ResearchAction',
          status: 'passed',
          isError: false,
          argsSummary: JSON.stringify({ action: 'compile_context_pack' }),
          outputSummary: '<context_pack id="context.fixture" work_frame_id="frame.fixture" />',
        },
        {
          type: 'context.append_loop_event',
          event: {
            type: 'content.part',
            uuid: 'think_2',
            turnId: '0',
            step: 2,
            part: {
              type: 'think',
              think: 'Now I can summarize the audit result.',
            },
          },
        },
        {
          type: 'reasoning.audit',
          turnId: '0',
          step: 2,
          stepUuid: 'step_2',
          partUuid: 'think_2',
          chars: 37,
          cues: [],
          redacted: true,
        },
      ].map((entry) => JSON.stringify(entry)).join('\n'),
      'utf8',
    );

    const audit: any = await analyzeSession({
      home,
      session: { sessionId: 'session_fixture', sessionDir, workDir: workdir },
      options: {
        expectPrivateReasoning: true,
        expectReasoningCues: ['workframe', 'context_pack', 'research_ledger'],
        expectReasoningLedTools: ['ResearchAction/open_work_frame', 'ResearchAction/compile_context_pack'],
        expectToolActions: ['ResearchAction/open_work_frame', 'ResearchAction/compile_context_pack'],
        expectLedgerTopic: 'fixture-topic',
        expectWorkframeOpened: true,
        expectContextPack: true,
      },
    });

    expect(audit.ok).toBe(true);
    expect(audit.privateReasoning.parts).toBe(2);
    expect(audit.reasoningBlocks[0]?.source).toBe('reasoning.audit');
    expect(audit.reasoningBlocks[0]?.cues).toEqual(expect.arrayContaining(['workframe', 'context_pack', 'research_ledger']));
    expect(audit.reasoningBehavior.ledToolCalls).toMatchObject([
      {
        toolName: 'ResearchAction',
        action: 'open_work_frame',
        resultError: false,
        visibleBridge: 'I will open the research frame now.',
      },
      {
        toolName: 'ResearchAction',
        action: 'compile_context_pack',
        resultError: false,
        visibleBridge: 'I will open the research frame now.',
      },
    ]);
    expect(renderMarkdown(audit)).toContain('Reasoning-led tools');
    expect(renderMarkdown(audit)).not.toContain('Need to open a WorkFrame');
  });

  it('supports reasoning behavior expectations and reports missing targets', () => {
    const audit = {
      reasoningBlocks: [{ cues: ['search'] }],
      reasoningBehavior: {
        ledToolCalls: [{ toolName: 'WebSearch', action: undefined }],
      },
      privateReasoning: { parts: 1 },
      toolSummary: {},
      autoCaptureSkipped: {},
      research: { workFrameOpened: false, contextPackCompiled: false, autoresearchEvents: [] },
      filesystem: { hakimiLedgerTopics: [], aitpTopics: [], aitpResearchRuns: [] },
      failures: [],
    };

    const expectations = evaluateExpectations(audit, {
      expectReasoningCues: ['search', 'workframe'],
      expectReasoningLedTools: ['WebSearch', 'ResearchAction/open_work_frame'],
    });

    expect(expectations).toContainEqual(expect.objectContaining({ name: 'reasoning-cue:search', pass: true }));
    expect(expectations).toContainEqual(expect.objectContaining({ name: 'reasoning-cue:workframe', pass: false }));
    expect(expectations).toContainEqual(expect.objectContaining({ name: 'reasoning-led-tool:WebSearch', pass: true }));
    expect(expectations).toContainEqual(expect.objectContaining({ name: 'reasoning-led-tool:ResearchAction/open_work_frame', pass: false }));
  });

  it('parses new reasoning CLI expectations and classifies coarse behavior cues', () => {
    const parsed = parseCli([
      'analyze',
      '--session',
      'session_fixture',
      '--expect-tool-action',
      'ResearchAction/compile_context_pack',
      '--expect-reasoning-cue',
      'failure',
      '--expect-reasoning-led-tool',
      'ResearchAction/compile_context_pack',
      '--expect-no-post-workframe-missing-workframe',
      '--expect-aitp-write-operation',
      'startResearchRun',
      '--expect-aitp-research-run-topic',
      'fixture-topic',
      '--expect-fresh-aitp-research-run-topic',
      'fixture-topic',
    ]);

    expect(parsed.options.expectToolActions).toEqual(['ResearchAction/compile_context_pack']);
    expect(parsed.options.expectReasoningCues).toEqual(['failure']);
    expect(parsed.options.expectReasoningLedTools).toEqual(['ResearchAction/compile_context_pack']);
    expect(parsed.options.expectNoPostWorkframeMissingWorkframe).toBe(true);
    expect(parsed.options.expectAitpWriteOperations).toEqual(['startResearchRun']);
    expect(parsed.options.expectAitpResearchRunTopics).toEqual(['fixture-topic']);
    expect(parsed.options.expectFreshAitpResearchRunTopics).toEqual(['fixture-topic']);
    expect(classifyReasoningCues('compile_context_pack failed because WorkFrame is missing')).toEqual(
      expect.arrayContaining(['context_pack', 'workframe', 'failure']),
    );
  });

  it('audits AITP bridge operations and topic-scoped research runs', async ({ task }) => {
    const root = join(process.cwd(), '.vitest-tmp', task.id);
    const home = join(root, 'home');
    const workdir = join(root, 'workdir');
    const sessionDir = join(home, 'sessions', 'wd_fixture', 'session_aitp');
    const agentDir = join(sessionDir, 'agents', 'main');
    const runDir = join(workdir, '.aitp', 'topics', 'fixture-topic', 'runtime', 'research_runs');
    await mkdir(agentDir, { recursive: true });
    await mkdir(runDir, { recursive: true });
    await writeFile(join(sessionDir, 'state.json'), JSON.stringify({ workDir: workdir, title: 'aitp fixture' }), 'utf8');
    await writeFile(
      join(runDir, 'research-run-fixture.json'),
      JSON.stringify({
        kind: 'research_run',
        topic_id: 'fixture-topic',
        run_id: 'research-run-fixture',
        objective: 'Audit fixture run',
      }),
      'utf8',
    );
    await writeFile(
      join(agentDir, 'wire.jsonl'),
      [
        {
          type: 'research_ledger.auto_capture_skipped',
          toolName: 'TodoList',
          toolCallId: 'todo_before_frame',
          reason: 'missing-workframe',
        },
        {
          type: 'tool_lifecycle.completed',
          turnId: 0,
          step: 1,
          toolCallId: 'tool_open',
          toolName: 'ResearchAction',
          status: 'passed',
          isError: false,
          argsSummary: JSON.stringify({ action: 'open_work_frame' }),
          outputSummary: '<work_frame id="frame.fixture" topic="fixture-topic" />',
        },
        {
          type: 'tool_lifecycle.completed',
          turnId: 0,
          step: 2,
          toolCallId: 'tool_event_failed',
          toolName: 'ResearchAction',
          status: 'failed',
          isError: true,
          argsSummary: JSON.stringify({
            action: 'execute_aitp_write_bridge',
            aitp_operation: 'recordResearchRunEvent',
            aitp_payload: { topicId: 'fixture-topic' },
          }),
          outputSummary: 'aitp_payload.runId is required.',
        },
        {
          type: 'tool_lifecycle.completed',
          turnId: 0,
          step: 3,
          toolCallId: 'tool_start_passed',
          toolName: 'ResearchAction',
          status: 'passed',
          isError: false,
          argsSummary: JSON.stringify({
            action: 'execute_aitp_write_bridge',
            aitp_operation: 'startResearchRun',
            aitp_payload: {
              topicId: 'fixture-topic',
              objective: 'Audit fixture run',
              researchQuestion: 'Can the harness see topic scoped AITP writes?',
            },
          }),
          outputSummary: '<aitp_write operation="startResearchRun" topic_id="fixture-topic" run_id="research-run-fixture" />',
        },
      ].map((entry) => JSON.stringify(entry)).join('\n'),
      'utf8',
    );

    const audit: any = await analyzeSession({
      home,
      session: { sessionId: 'session_aitp', sessionDir, workDir: workdir },
      options: {
        expectToolActions: ['ResearchAction/execute_aitp_write_bridge'],
        expectAitpWriteOperations: ['startResearchRun'],
        expectAitpResearchRunTopics: ['fixture-topic'],
        expectNoPostWorkframeMissingWorkframe: true,
        expectWorkframeOpened: true,
      },
    });

    expect(audit.ok).toBe(true);
    expect(audit.research.aitpWriteBridgeCalls).toMatchObject([
      { operation: 'recordResearchRunEvent', topicId: 'fixture-topic', ok: false },
      { operation: 'startResearchRun', topicId: 'fixture-topic', runId: 'research-run-fixture', ok: true },
    ]);
    expect(audit.filesystem.aitpResearchRunDetails).toContainEqual(expect.objectContaining({
      kind: 'research_run',
      topicId: 'fixture-topic',
      runId: 'research-run-fixture',
    }));

    const missingOperation = evaluateExpectations(audit, {
      expectAitpWriteOperations: ['recordResearchRunEvent'],
    });
    expect(missingOperation).toContainEqual(expect.objectContaining({
      name: 'aitp-write-operation:recordResearchRunEvent',
      pass: false,
    }));

    const detail = audit.filesystem.aitpResearchRunDetails.find((item: any) => item.topicId === 'fixture-topic');
    const freshAudit = {
      ...audit,
      run: {
        startedAt: new Date(detail.mtimeMs - 1000).toISOString(),
        finishedAt: new Date(detail.mtimeMs + 1000).toISOString(),
      },
    };
    const freshExpectations = evaluateExpectations(freshAudit, {
      expectFreshAitpResearchRunTopics: ['fixture-topic'],
    });
    expect(freshExpectations).toContainEqual(expect.objectContaining({
      name: 'fresh-aitp-research-run-topic:fixture-topic',
      pass: true,
    }));
  });

  it('enables reasoning audit only inside harness-run child environments', () => {
    const env = createHakimiAuditEnv('/tmp/hakimi-home', {
      HAKIMI_HOME: '/tmp/original-home',
      KIMI_CODE_EXPERIMENTAL_REASONING_AUDIT: '0',
    });

    expect(env.HAKIMI_HOME).toBe('/tmp/hakimi-home');
    expect(env.KIMI_CODE_EXPERIMENTAL_REASONING_AUDIT).toBe('1');
  });
});
