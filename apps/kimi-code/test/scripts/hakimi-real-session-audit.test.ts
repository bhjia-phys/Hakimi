import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeSession,
  classifyReasoningCues,
  createHakimiAuditEnv,
  evaluateExpectations,
  inspectHiddenEvalInput,
  parseCli,
  renderMarkdown,
  scoreResearchEvalCase,
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
      '--expect-context-pack-text',
      'binding.theoretical-physics.apply-object-discovery-lens',
      '--expect-reasoning-cue',
      'failure',
      '--expect-reasoning-led-tool',
      'ResearchAction/compile_context_pack',
      '--expect-no-post-workframe-missing-workframe',
      '--expect-aitp-write-operation',
      'startResearchRun',
      '--expect-aitp-mcp-operation',
      'startResearchRun',
      '--expect-aitp-research-run-topic',
      'fixture-topic',
      '--expect-fresh-aitp-research-run-topic',
      'fixture-topic',
    ]);

    expect(parsed.options.expectToolActions).toEqual(['ResearchAction/compile_context_pack']);
    expect(parsed.options.expectContextPackTexts).toEqual(['binding.theoretical-physics.apply-object-discovery-lens']);
    expect(parsed.options.expectReasoningCues).toEqual(['failure']);
    expect(parsed.options.expectReasoningLedTools).toEqual(['ResearchAction/compile_context_pack']);
    expect(parsed.options.expectNoPostWorkframeMissingWorkframe).toBe(true);
    expect(parsed.options.expectAitpWriteOperations).toEqual(['startResearchRun']);
    expect(parsed.options.expectAitpMcpOperations).toEqual(['startResearchRun']);
    expect(parsed.options.expectAitpResearchRunTopics).toEqual(['fixture-topic']);
    expect(parsed.options.expectFreshAitpResearchRunTopics).toEqual(['fixture-topic']);
    expect(classifyReasoningCues('compile_context_pack failed because WorkFrame is missing')).toEqual(
      expect.arrayContaining(['context_pack', 'workframe', 'failure']),
    );
  });

  it('checks ContextPack text from successful tool output before report truncation', async ({ task }) => {
    const root = join(process.cwd(), '.vitest-tmp', task.id);
    const home = join(root, 'home');
    const workdir = join(root, 'workdir');
    const sessionDir = join(home, 'sessions', 'wd_fixture', 'session_context_pack');
    const agentDir = join(sessionDir, 'agents', 'main');
    const marker = 'binding.theoretical-physics.apply-object-discovery-lens';
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(sessionDir, 'state.json'), JSON.stringify({ workDir: workdir, title: 'context pack fixture' }), 'utf8');
    await writeFile(
      join(agentDir, 'wire.jsonl'),
      [
        {
          type: 'tool_lifecycle.completed',
          turnId: 0,
          step: 1,
          toolCallId: 'tool_pack',
          toolName: 'ResearchAction',
          status: 'passed',
          isError: false,
          argsSummary: JSON.stringify({ action: 'compile_context_pack' }),
          outputSummary: `<context_pack id="context.fixture">${'x'.repeat(1300)}...[truncated]`,
        },
        {
          type: 'context.append_loop_event',
          event: {
            type: 'tool.result',
            toolCallId: 'tool_pack',
            result: {
              output: `<context_pack id="context.fixture">${'x'.repeat(1400)}${marker}</context_pack>`,
            },
          },
        },
      ].map((entry) => JSON.stringify(entry)).join('\n'),
      'utf8',
    );

    const audit: any = await analyzeSession({
      home,
      session: { sessionId: 'session_context_pack', sessionDir, workDir: workdir },
      options: {
        expectContextPack: true,
        expectVisibleTexts: [marker],
        expectContextPackTexts: [marker],
      },
    });

    expect(audit.expectations).toContainEqual(expect.objectContaining({
      name: `visible-text:${marker}`,
      pass: false,
    }));
    expect(audit.expectations).toContainEqual(expect.objectContaining({
      name: `context-pack-text:${marker}`,
      pass: true,
    }));
    expect(renderMarkdown(audit)).not.toContain(`${'x'.repeat(1200)}${marker}`);
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
        {
          type: 'tool_lifecycle.completed',
          turnId: 0,
          step: 4,
          toolCallId: 'tool_start_output_xml',
          toolName: 'ResearchAction',
          status: 'passed',
          isError: false,
          argsSummary: '',
          outputSummary: '<aitp_write_bridge operation="startResearchRun" kind="research_run" ok="true"><research_run run_id="research-run-output-xml" topic_id="fixture-topic" status="active" phase="planning" terminal_answer_state="" /></aitp_write_bridge>',
        },
        {
          type: 'tool_lifecycle.completed',
          turnId: 0,
          step: 5,
          toolCallId: 'tool_mcp_start',
          toolName: 'mcp__aitp__aitp_v5_start_research_run',
          status: 'passed',
          isError: false,
          argsSummary: JSON.stringify({
            topic_id: 'fixture-topic',
          }),
          outputSummary: JSON.stringify({
            ok: true,
            topic_id: 'fixture-topic',
            run_id: 'research-run-mcp-fixture',
          }),
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
        expectAitpMcpOperations: ['startResearchRun'],
        expectAitpResearchRunTopics: ['fixture-topic'],
        expectNoPostWorkframeMissingWorkframe: true,
        expectWorkframeOpened: true,
      },
    });

    expect(audit.ok).toBe(true);
    expect(audit.research.aitpWriteBridgeCalls).toMatchObject([
      { operation: 'recordResearchRunEvent', topicId: 'fixture-topic', ok: false },
      { operation: 'startResearchRun', topicId: 'fixture-topic', runId: 'research-run-fixture', ok: true },
      { operation: 'startResearchRun', topicId: 'fixture-topic', runId: 'research-run-output-xml', ok: true },
    ]);
    expect(audit.research.aitpMcpCalls).toContainEqual(expect.objectContaining({
      operation: 'startResearchRun',
      topicId: 'fixture-topic',
      runId: 'research-run-mcp-fixture',
      ok: true,
    }));
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

  it('scores the AdS massive-matter regression without exposing private reasoning', () => {
    const audit: any = {
      assistantTexts: [
        [
          'For finite energy massive timelike geodesic motion in global AdS, the particle does not reach the conformal boundary.',
          'So absorption should be modeled with a finite cutoff wall, a massive KG wavepacket tail with an absorbing boundary condition, or a kinetic distribution with a boundary sink.',
          'The random detector switching has off=reflecting and on=bath or measurement channel removing energy flux.',
          'The main observables are trajectory reflection map, survival probability, hitting-time distribution, particle number, and energy flux.',
          'Normal modes are only an auxiliary spectral diagnostic, not the main question.',
        ].join(' '),
      ],
      research: {
        aitpWriteBridgeCalls: [],
        aitpMcpCalls: [],
      },
      toolCalls: [
        passedAction('open_work_frame'),
        passedAction('compile_context_pack'),
        passedAction('inspect_aitp_runtime_payload_profiles'),
        passedAction('draft_aitp_write_bridge_call'),
      ],
      run: { streamJsonMessages: [] },
    };

    const result = scoreResearchEvalCase(audit, {
      id: 'eval.theoretical-physics.random-open-boundary-ads-massive-matter',
      title: 'Random open AdS boundary massive-matter regression',
      path: 'fixture',
      forbiddenClaims: ['massive particle automatically hits the AdS conformal boundary'],
      rubricItems: undefined,
    });

    expect(result.score).toBe(95);
    expect(result.items).toContainEqual(expect.objectContaining({
      id: 'hakimi-aitp-bridge-execute',
      awarded: 0,
      evidence: 'missing AITP write bridge operations: startResearchRun',
    }));
    expect(result.forbiddenMatches).toEqual([]);
  });

  it('scores full marks only when the AdS regression includes Hakimi AITP bridge execution', () => {
    const audit: any = {
      assistantTexts: [
        [
          'For finite energy massive timelike geodesic motion in global AdS, the particle does not reach the conformal boundary.',
          'So absorption should be modeled with a finite cutoff wall, a massive KG wavepacket tail with an absorbing boundary condition, or a kinetic distribution with a boundary sink.',
          'The random detector switching has off=reflecting and on=bath or measurement channel removing energy flux.',
          'The main observables are trajectory reflection map, survival probability, hitting-time distribution, particle number, and energy flux.',
          'Normal modes are only an auxiliary spectral diagnostic, not the main question.',
        ].join(' '),
      ],
      research: {
        aitpWriteBridgeCalls: [{ operation: 'startResearchRun', ok: true }],
        aitpMcpCalls: [],
      },
      toolCalls: [
        passedAction('open_work_frame'),
        passedAction('compile_context_pack'),
        passedAction('inspect_aitp_runtime_payload_profiles'),
        passedAction('draft_aitp_write_bridge_call'),
      ],
      run: { streamJsonMessages: [] },
    };

    const result = scoreResearchEvalCase(audit, {
      id: 'eval.theoretical-physics.random-open-boundary-ads-massive-matter',
      title: 'Random open AdS boundary massive-matter regression',
      path: 'fixture',
      forbiddenClaims: ['massive particle automatically hits the AdS conformal boundary'],
      rubricItems: undefined,
    });

    expect(result.score).toBe(100);
    expect(result.forbiddenMatches).toEqual([]);
  });

  it('scores AdS physics capability from the final answer, with tool artifacts reported separately', () => {
    const audit: any = {
      assistantTexts: ['The final answer only says random boundary reflecting absorbing.'],
      research: {
        aitpWriteBridgeCalls: [{ operation: 'startResearchRun', ok: true }],
        aitpMcpCalls: [],
      },
      toolCalls: [
        passedAction('open_work_frame'),
        passedAction('compile_context_pack'),
        passedAction('inspect_aitp_runtime_payload_profiles'),
        passedAction('draft_aitp_write_bridge_call'),
        {
          toolName: 'mcp__aitp__aitp_v5_record_sensemaking_report',
          status: 'passed',
          isError: false,
          argsSummary: [
            'For finite energy massive timelike geodesic motion in global AdS, the particle does not reach the conformal boundary.',
            'Use a finite cutoff wall, wavepacket tail, or kinetic distribution boundary sink.',
            'Observables include survival probability, hitting-time distribution, particle number, energy flux.',
            'Separate classical cutoff, Klein-Gordon wavepacket, kinetic ensemble; normal modes are auxiliary.',
          ].join(' '),
          outputSummary: '',
        },
      ],
      run: { streamJsonMessages: [] },
    };

    const result = scoreResearchEvalCase(audit, {
      id: 'eval.theoretical-physics.random-open-boundary-ads-massive-matter',
      title: 'Random open AdS boundary massive-matter regression',
      path: 'fixture',
      forbiddenClaims: [],
      rubricItems: undefined,
    });

    expect(result.scoringScope).toBe('final-answer');
    expect(result.score).toBe(30);
    expect(result.artifactScope.score).toBe(100);
    expect(result.items).toContainEqual(expect.objectContaining({
      id: 'massive-boundary-reachability',
      awarded: 0,
    }));
  });

  it('scores final answers from full assistant text instead of report previews', () => {
    const fullAnswer = [
      'Runtime status first.',
      'x'.repeat(1500),
      'For finite energy massive timelike geodesic motion in global AdS, the particle does not reach the conformal boundary.',
      'Use a finite cutoff wall, massive KG wavepacket tail, or kinetic distribution boundary sink.',
      'The boundary detector off state is reflecting, and the on state couples to a measurement bath and removes energy flux.',
      'Observables include particle trajectory/reflection map, survival probability, hitting-time distribution, particle number, and energy flux.',
      'Separate classical cutoff, massive Klein-Gordon wavepacket, and kinetic ensemble layers.',
      'Normal modes are only auxiliary diagnostics.',
    ].join(' ');
    const audit: any = {
      assistantTexts: [fullAnswer.slice(0, 1200)],
      assistantTextsFull: [fullAnswer],
      research: {
        aitpWriteBridgeCalls: [{ operation: 'startResearchRun', ok: true }],
        aitpMcpCalls: [],
      },
      toolCalls: [
        passedAction('open_work_frame'),
        passedAction('compile_context_pack'),
        passedAction('inspect_aitp_runtime_payload_profiles'),
        passedAction('draft_aitp_write_bridge_call'),
      ],
      run: { streamJsonMessages: [] },
    };

    const result = scoreResearchEvalCase(audit, {
      id: 'eval.theoretical-physics.random-open-boundary-ads-massive-matter',
      title: 'Random open AdS boundary massive-matter regression',
      path: 'fixture',
      forbiddenClaims: [],
      rubricItems: undefined,
    });

    expect(result.score).toBe(100);
  });

  it('audits hidden eval inputs without echoing rubric marker text', () => {
    const evalCase: any = {
      id: 'eval.hidden.fixture',
      path: join(process.cwd(), '.aitp', 'evals', 'hidden-case.md'),
      sourceRefs: ['rubric:secret-rubric-2026'],
      rubricRef: 'rubric:secret-rubric-2026',
      rubricItems: [
        { id: 'hidden-reachability-item', summary: 'Do not echo this summary' },
      ],
    };
    const audit: any = {
      ok: false,
      session: { id: 'session_hidden_fixture', dir: 'session-dir' },
      privateReasoning: { parts: 0, chars: 0 },
      expectations: [],
      evalCases: [],
      assistantTexts: ['I saw hidden-reachability-item.'],
      toolCalls: [
        {
          toolName: 'Read',
          status: 'passed',
          isError: false,
          argsSummary: JSON.stringify({ path: evalCase.path }),
          outputSummary: 'hidden file content',
        },
      ],
      visibleTranscript: [],
      toolSummary: {},
      research: {
        workFrameOpened: false,
        workFrameIds: [],
        contextPackCompiled: false,
        researchActionResults: [],
        ledgerWrites: [],
        aitpWriteBridgeCalls: [],
        aitpMcpCalls: [],
        autoresearchEvents: [],
      },
      filesystem: { hakimiLedgerTopics: [], aitpTopics: [], aitpResearchRuns: [], aitpResearchRunDetails: [] },
      reasoningBlocks: [],
      reasoningBehavior: { turnCount: 0, turns: [], ledToolCalls: [], repeatedAfterReasoningFailures: [] },
      autoCaptureSkipped: {},
      failures: [],
      run: { args: ['--prompt', '<prompt-redacted>'] },
    };

    audit.hiddenEvalInput = inspectHiddenEvalInput({
      prompt: 'normal blind prompt',
      evalCases: [evalCase],
      run: { args: ['--prompt', 'normal blind prompt'] },
      audit,
    });

    expect(audit.hiddenEvalInput.ok).toBe(false);
    expect(audit.hiddenEvalInput.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'session-read-eval-file', detail: 'hidden-case.md' }),
      expect.objectContaining({ kind: 'visible-marker-leak', detail: 'hidden-marker-4' }),
    ]));
    const rendered = renderMarkdown(audit);
    expect(rendered).toContain('hidden-marker-4');
    expect(rendered).not.toContain('hidden-reachability-item');
    expect(rendered).not.toContain('Do not echo this summary');
  });

  it('flags forbidden claims in the AdS massive-matter regression', () => {
    const audit: any = {
      assistantTexts: ['The massive particle automatically hits the AdS conformal boundary.'],
      toolCalls: [],
      run: { streamJsonMessages: [] },
    };

    const result = scoreResearchEvalCase(audit, {
      id: 'eval.theoretical-physics.random-open-boundary-ads-massive-matter',
      title: 'Random open AdS boundary massive-matter regression',
      path: 'fixture',
      forbiddenClaims: ['massive particle automatically hits the AdS conformal boundary'],
      rubricItems: undefined,
    });

    expect(result.forbiddenMatches).toEqual([
      { claim: 'massive particle automatically hits the AdS conformal boundary', matched: true },
    ]);
  });

  it('does not flag auxiliary normal modes when primary observables are motion observables', () => {
    const audit: any = {
      assistantTexts: [
        '## Primary observables (not normal modes)\nThe primary observables are survival probability, hitting-time distribution, trajectory, particle number, and energy flux. Normal modes are auxiliary diagnostics only.',
      ],
      research: {
        aitpWriteBridgeCalls: [{ operation: 'startResearchRun', ok: true }],
        aitpMcpCalls: [],
      },
      toolCalls: [
        passedAction('open_work_frame'),
        passedAction('compile_context_pack'),
        passedAction('inspect_aitp_runtime_payload_profiles'),
        passedAction('draft_aitp_write_bridge_call'),
      ],
      run: { streamJsonMessages: [] },
    };

    const result = scoreResearchEvalCase(audit, {
      id: 'eval.theoretical-physics.random-open-boundary-ads-massive-matter',
      title: 'Random open AdS boundary massive-matter regression',
      path: 'fixture',
      forbiddenClaims: ['normal modes are the primary object of the massive-matter problem'],
      rubricItems: undefined,
    });

    expect(result.forbiddenMatches).toEqual([]);
  });
});

function passedAction(action: string): any {
  return {
    toolName: 'ResearchAction',
    action,
    status: 'passed',
    isError: false,
    outputSummary: '',
  };
}
