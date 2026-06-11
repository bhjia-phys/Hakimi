import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeSession,
  classifyReasoningCues,
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
      ].map((entry) => JSON.stringify(entry)).join('\n'),
      'utf8',
    );

    const audit: any = await analyzeSession({
      home,
      session: { sessionId: 'session_fixture', sessionDir, workDir: workdir },
      options: {
        expectPrivateReasoning: true,
        expectReasoningCues: ['workframe', 'context_pack', 'research_ledger'],
        expectReasoningLedTools: ['ResearchAction/open_work_frame'],
        expectLedgerTopic: 'fixture-topic',
        expectWorkframeOpened: true,
      },
    });

    expect(audit.ok).toBe(true);
    expect(audit.privateReasoning.parts).toBe(1);
    expect(audit.reasoningBlocks[0]?.source).toBe('reasoning.audit');
    expect(audit.reasoningBlocks[0]?.cues).toEqual(expect.arrayContaining(['workframe', 'context_pack', 'research_ledger']));
    expect(audit.reasoningBehavior.ledToolCalls).toMatchObject([
      {
        toolName: 'ResearchAction',
        action: 'open_work_frame',
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
      '--expect-reasoning-cue',
      'failure',
      '--expect-reasoning-led-tool',
      'ResearchAction/compile_context_pack',
    ]);

    expect(parsed.options.expectReasoningCues).toEqual(['failure']);
    expect(parsed.options.expectReasoningLedTools).toEqual(['ResearchAction/compile_context_pack']);
    expect(classifyReasoningCues('compile_context_pack failed because WorkFrame is missing')).toEqual(
      expect.arrayContaining(['context_pack', 'workframe', 'failure']),
    );
  });
});
