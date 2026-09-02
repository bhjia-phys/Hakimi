import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectFilePathAliases,
  findFilePathLinks,
  parseFilePathLinkCandidate,
} from '../src/lib/filePathLinks';
import { parseDiff } from '../src/lib/parseDiff';
import { researchProgressSummaries } from '../src/lib/researchProgress';
import {
  buildResearchBoardCompactSlots,
  presentResearchAlertClassification,
  presentResearchWorkstreamBinding,
  selectResearchBoardExpandedRecord,
} from '../src/lib/researchBoardPresentation';
import { buildDiffLines } from '../src/lib/diffLines';
import { buildEditDiffLines } from '../src/lib/toolDiff';
import { createCoalescedAsyncRunner } from '../src/lib/snapshotSync';
import { mergeSnapshotMessages } from '../src/lib/snapshotMessages';
import { keepLiveSubagents, mergeSnapshotSubagents } from '../src/lib/taskMerge';
import { normalizeToolName, toolSummary } from '../src/lib/toolMeta';
import { collapsePrompt, humanizeCron } from '../src/lib/cronHumanize';
import {
  currentValidatedWorkspacePath,
  isWorkspacePathInput,
  joinWorkspacePathCandidate,
  parseWorkspacePathInput,
} from '../src/lib/workspacePathInput';
import {
  commitLevel,
  defaultThinkingLevelFor,
  effortLabel,
  modelThinkingAvailability,
  segmentsFor,
} from '../src/lib/modelThinking';
import type {
  AppMessage,
  AppModel,
  AppTask,
  ResearchStatusSnapshot,
} from '../src/api/types';
import { resolveToolRenderer } from '../src/components/chat/tool-calls/toolRegistry';
import AgentTool from '../src/components/chat/tool-calls/AgentTool.vue';
import BashTool from '../src/components/chat/tool-calls/BashTool.vue';
import EditTool from '../src/components/chat/tool-calls/EditTool.vue';
import GenericTool from '../src/components/chat/tool-calls/GenericTool.vue';
import type { ToolCall } from '../src/types';
import {
  clearTrace,
  installClientErrorCapture,
  sanitizeForTrace,
  sessionExportTraceToJsonl,
  traceEntries,
  traceKeyEvent,
  tracePaused,
  traceRestRequest,
  traceToJsonl,
  traceWsIn,
} from '../src/debug/trace';

// The trace tests exercise its exported recording/serialization contract:
// session exports receive only bounded, explicitly selected metadata.

describe('bounded Web trace', () => {
  beforeEach(() => {
    tracePaused.value = false;
    clearTrace();
  });

  afterEach(() => {
    clearTrace();
    vi.unstubAllGlobals();
  });

  it('copies only allowlisted key-path metadata into the independent export ring', () => {
    const secret = 'PROMPT_TEXT_MUST_NOT_BE_EXPORTED';
    const metadata = {
      sessionId: 'sess_1',
      contentCount: 2,
      mediaCount: 1,
      text: secret,
      apiKey: secret,
    };
    traceKeyEvent('prompt:start', metadata);

    metadata.sessionId = 'changed_after_recording';

    expect(traceEntries()).toHaveLength(1);
    expect(JSON.parse(sessionExportTraceToJsonl())).toEqual({
      ts: expect.any(Number),
      event: 'prompt:start',
      sessionId: 'sess_1',
      contentCount: 2,
      mediaCount: 1,
    });
    expect(sessionExportTraceToJsonl()).not.toContain(secret);
  });

  it('records export metadata even while the full debug panel is paused', () => {
    tracePaused.value = true;

    traceKeyEvent('ws:connection', { status: 'connected' });

    expect(traceEntries()).toHaveLength(0);
    expect(JSON.parse(sessionExportTraceToJsonl())).toMatchObject({
      event: 'ws:connection',
      status: 'connected',
    });
  });

  it('caps object keys and reports how many were omitted', () => {
    const input = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`key${index}`, index]));

    const result = sanitizeForTrace(input) as Record<string, unknown>;

    expect(result['_truncatedKeys']).toBe(10);
    expect(Object.keys(result)).toHaveLength(51);
  });

  it('keeps at most 500 of the newest export entries', () => {
    for (let index = 0; index < 501; index++) {
      traceKeyEvent('ws:connection', { status: String(index) });
    }

    const exported = sessionExportTraceToJsonl().split('\n').map((line) => JSON.parse(line));
    expect(exported).toHaveLength(500);
    expect(exported[0]).toMatchObject({ status: '1' });
    expect(exported.at(-1)).toMatchObject({ status: '500' });
  });

  it('keeps export JSONL within the 256 KiB UTF-8 budget including newlines', () => {
    for (let index = 0; index < 500; index++) {
      traceKeyEvent('export:failed', {
        sessionId: `sess-${index}-${'😀'.repeat(200)}`,
        status: '😀'.repeat(200),
        promptId: '😀'.repeat(200),
        errorName: '😀'.repeat(200),
        requestId: '😀'.repeat(200),
        phase: '😀'.repeat(200),
      });
    }

    const jsonl = sessionExportTraceToJsonl();
    expect(new TextEncoder().encode(jsonl).byteLength).toBeLessThanOrEqual(256 * 1024);
    expect(JSON.parse(jsonl.split('\n').at(-1)!)).toMatchObject({
      sessionId: expect.stringMatching(/^sess-499-/),
    });
  });

  it('never copies prompt, WebSocket, or console content from the full debug trace', () => {
    vi.stubGlobal('location', { search: '?debug=1' });
    const promptSecret = 'PROMPT_SECRET_9fdb1a';
    const wsSecret = 'WS_PAYLOAD_SECRET_b84c7e';
    const consoleSecret = 'CONSOLE_SECRET_a2d693';

    traceRestRequest({
      method: 'POST',
      path: '/sessions/sess_1/prompts',
      url: 'http://daemon.test/api/v1/sessions/sess_1/prompts',
      requestId: 'req_1',
      body: { prompt: promptSecret },
    });
    traceWsIn({
      type: 'event',
      session_id: 'sess_1',
      seq: 4,
      payload: { text: wsSecret },
    });

    const originalLog = console.log;
    console.log = vi.fn();
    const dispose = installClientErrorCapture();
    try {
      console.log(consoleSecret, { value: consoleSecret });
    } finally {
      dispose();
      console.log = originalLog;
    }

    traceKeyEvent('prompt:start', {
      sessionId: 'sess_1',
      contentCount: 1,
      mediaCount: 0,
      text: promptSecret,
    });

    const fullDebugTrace = traceToJsonl();
    expect(fullDebugTrace).toContain(promptSecret);
    expect(fullDebugTrace).toContain(wsSecret);
    expect(fullDebugTrace).toContain(consoleSecret);

    const sessionExportTrace = sessionExportTraceToJsonl();
    expect(sessionExportTrace).not.toContain(promptSecret);
    expect(sessionExportTrace).not.toContain(wsSecret);
    expect(sessionExportTrace).not.toContain(consoleSecret);
    expect(JSON.parse(sessionExportTrace)).toEqual({
      ts: expect.any(Number),
      event: 'prompt:start',
      sessionId: 'sess_1',
      contentCount: 1,
      mediaCount: 0,
    });
  });
});

describe('workspace path input', () => {
  it('recognizes the supported absolute path forms', () => {
    expect(isWorkspacePathInput('/tmp/project')).toBe(true);
    expect(isWorkspacePathInput('~/project')).toBe(true);
    expect(isWorkspacePathInput('C:\\project')).toBe(true);
    expect(isWorkspacePathInput('C:/project')).toBe(true);
    expect(isWorkspacePathInput('\\\\server\\share')).toBe(true);
    expect(isWorkspacePathInput('project')).toBe(false);
  });

  it('normalizes separators without changing UNC roots or POSIX backslashes', () => {
    expect(parseWorkspacePathInput('/tmp//project/', '').target).toBe('/tmp/project');
    expect(parseWorkspacePathInput('//server//share/project/', '').target).toBe('//server/share/project');
    expect(parseWorkspacePathInput('///tmp//project/', '').target).toBe('/tmp/project');
    expect(parseWorkspacePathInput('/tmp/project\\', '').target).toBe('/tmp/project\\');
    expect(parseWorkspacePathInput('~/project', '/home/alice').target).toBe('/home/alice/project');
  });

  it('preserves Windows root separators in parent paths', () => {
    expect(parseWorkspacePathInput('C:\\Use', '')).toMatchObject({
      parent: 'C:\\',
      base: 'Use',
      separator: '\\',
    });
    expect(parseWorkspacePathInput('C:/Use', '')).toMatchObject({
      parent: 'C:/',
      base: 'Use',
      separator: '/',
    });
    expect(parseWorkspacePathInput('\\\\server\\share\\pro', '')).toMatchObject({
      parent: '\\\\server\\share',
      base: 'pro',
      separator: '\\',
    });
    expect(parseWorkspacePathInput('//server/share/pro', '')).toMatchObject({
      parent: '//server/share',
      base: 'pro',
      separator: '/',
    });
  });

  it('treats backslashes as literal characters in POSIX paths', () => {
    expect(parseWorkspacePathInput('/tmp/foo\\bar', '')).toMatchObject({
      parent: '/tmp',
      base: 'foo\\bar',
      separator: '/',
    });
  });

  it('builds completion paths from the lexical parent', () => {
    const parsed = parseWorkspacePathInput('/tmp/link/proje', '');
    expect(joinWorkspacePathCandidate(parsed.parent, 'project', parsed.separator)).toBe('/tmp/link/project');
  });

  it('only returns a validated path while it still matches the current input', () => {
    expect(currentValidatedWorkspacePath('/var', '', '/tmp')).toBeNull();
    expect(currentValidatedWorkspacePath('/tmp/', '', '/tmp')).toBe('/tmp');
  });
});

describe('parseDiff', () => {
  it('parses multiple files and keeps hunk line numbers', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,3 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 3;',
      '+const c = 4;',
      'diff --git a/src/comment.sql b/src/comment.sql',
      '@@ -5,1 +5,1 @@',
      '--- old comment',
      '+++ new comment',
    ].join('\n');

    expect(parseDiff(diff)).toEqual([
      { type: 'hunk', text: '@@ -1,2 +1,3 @@' },
      { type: 'context', text: 'const a = 1;', oldNo: 1, newNo: 1 },
      { type: 'del', text: 'const b = 2;', oldNo: 2 },
      { type: 'add', text: 'const b = 3;', newNo: 2 },
      { type: 'add', text: 'const c = 4;', newNo: 3 },
      { type: 'hunk', text: '@@ -5,1 +5,1 @@' },
      { type: 'del', text: '-- old comment', oldNo: 5 },
      { type: 'add', text: '++ new comment', newNo: 5 },
    ]);
  });
});

describe('buildDiffLines', () => {
  it('lines up context, deletions and additions with old/new line numbers', () => {
    const before = 'a\nb\nc';
    const after = 'a\nB\nc\nd';
    expect(buildDiffLines(before, after)).toEqual([
      { type: 'context', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'del', text: 'b', oldNo: 2 },
      { type: 'add', text: 'B', newNo: 2 },
      { type: 'context', text: 'c', oldNo: 3, newNo: 3 },
      { type: 'add', text: 'd', newNo: 4 },
    ]);
  });

  it('treats an empty before as an all-addition write', () => {
    expect(buildDiffLines('', 'x\ny')).toEqual([
      { type: 'add', text: 'x', newNo: 1 },
      { type: 'add', text: 'y', newNo: 2 },
    ]);
  });

  it('returns all context for identical texts and empty for two empties', () => {
    expect(buildDiffLines('a\nb', 'a\nb')).toEqual([
      { type: 'context', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'context', text: 'b', oldNo: 2, newNo: 2 },
    ]);
    expect(buildDiffLines('', '')).toEqual([]);
  });

  it('returns null when the LCS matrix would be too large', () => {
    const big = Array.from({ length: 2000 }, (_, i) => `line${i}`).join('\n');
    expect(buildDiffLines(big, `${big}\nextra`)).toBeNull();
  });

  it('returns null when one side is huge even though the matrix is small', () => {
    const huge = Array.from({ length: 6000 }, (_, i) => `line${i}`).join('\n');
    expect(buildDiffLines('one line', huge)).toBeNull();
  });
});

describe('buildEditDiffLines', () => {
  it('builds a diff for a single Edit', () => {
    const arg = JSON.stringify({ path: 'a.ts', old_string: 'a\nb', new_string: 'a\nB' });
    expect(buildEditDiffLines({ name: 'Edit', arg })).toEqual([
      { type: 'context', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'del', text: 'b', oldNo: 2 },
      { type: 'add', text: 'B', newNo: 2 },
    ]);
  });

  it('falls back to output for replace_all edits', () => {
    const arg = JSON.stringify({ path: 'a.ts', old_string: 'a', new_string: 'b', replace_all: true });
    expect(buildEditDiffLines({ name: 'Edit', arg })).toBeNull();
  });

  it('falls back to output for every Write (new file or overwrite)', () => {
    expect(buildEditDiffLines({ name: 'Write', arg: JSON.stringify({ path: 'a.ts', content: 'x' }) })).toBeNull();
    expect(
      buildEditDiffLines({ name: 'Write', arg: JSON.stringify({ path: 'a.ts', content: 'x', mode: 'append' }) }),
    ).toBeNull();
  });

  it('returns null for non-edit/write tools', () => {
    expect(buildEditDiffLines({ name: 'Bash', arg: JSON.stringify({ command: 'ls' }) })).toBeNull();
  });
});

describe('filePathLinks', () => {
  it('rejects URLs and bare unknown filenames', () => {
    expect(parseFilePathLinkCandidate('https://example.com/a.ts')).toBeNull();
    expect(parseFilePathLinkCandidate('e2e-success.png')).toBeNull();
  });

  it('finds path links with line numbers and resolves aliases', () => {
    const aliases = collectFilePathAliases('<img src="/assets/demo.png">');
    expect(aliases.get('demo.png')).toBe('/assets/demo.png');

    expect(
      findFilePathLinks('Open src/a.ts#L12 and demo.png.', { aliases }),
    ).toMatchObject([
      { path: 'src/a.ts', line: 12, text: 'src/a.ts#L12' },
      { path: '/assets/demo.png', text: 'demo.png' },
    ]);
  });
});

describe('toolMeta', () => {
  it('normalizes common tool aliases', () => {
    expect(normalizeToolName('WebFetch')).toBe('web_fetch');
    expect(normalizeToolName('MultiEdit')).toBe('multi_edit');
    expect(normalizeToolName('TodoWrite')).toBe('todo');
    expect(normalizeToolName('rg')).toBe('grep');
  });

  it('summarizes tool arguments for card headers', () => {
    expect(
      toolSummary('Read', JSON.stringify({ path: 'src/a.ts', offset: 10, limit: 5 })),
    ).toBe('src/a.ts:10-15');
    expect(toolSummary('Read', '{}')).toBe('');
    expect(toolSummary('Bash', JSON.stringify({ command: 'pnpm test' }))).toBe('pnpm test');
    expect(
      toolSummary('WebFetch', JSON.stringify({ url: 'https://example.com/path/to' })),
    ).toBe('example.com/path');
  });
});

describe('resolveToolRenderer', () => {
  // Minimal ToolCall factory — resolveToolRenderer only reads `name`, `status`
  // and `media`, so the rest is filled with placeholders.
  const tool = (name: string, status: ToolCall['status'] = 'running'): ToolCall => ({
    id: 't1',
    name,
    arg: '',
    status,
  });

  // Regression: normalizeToolName() folds `agent`/`subagent` into the canonical
  // `task` kind, so the renderer must match on `task`. If it matched on the raw
  // `agent` string these calls would fall through to GenericTool and lose the
  // inline "Open" button for the subagent detail panel.
  it('routes Agent / subagent calls to the Agent renderer', () => {
    expect(resolveToolRenderer(tool('agent'))).toBe(AgentTool);
    expect(resolveToolRenderer(tool('Agent'))).toBe(AgentTool);
    expect(resolveToolRenderer(tool('subagent'))).toBe(AgentTool);
    expect(resolveToolRenderer(tool('task'))).toBe(AgentTool);
  });

  it('routes edit-like calls to the Edit renderer', () => {
    expect(resolveToolRenderer(tool('edit'))).toBe(EditTool);
    expect(resolveToolRenderer(tool('write'))).toBe(EditTool);
    expect(resolveToolRenderer(tool('multi_edit'))).toBe(EditTool);
  });

  it('routes bash calls (incl. aliases) to the Bash renderer', () => {
    expect(resolveToolRenderer(tool('bash'))).toBe(BashTool);
    expect(resolveToolRenderer(tool('Bash'))).toBe(BashTool);
    expect(resolveToolRenderer(tool('shell'))).toBe(BashTool);
  });

  it('falls back to the Generic renderer for unknown tools', () => {
    expect(resolveToolRenderer(tool('read'))).toBe(GenericTool);
  });
});

describe('createCoalescedAsyncRunner', () => {
  it('reuses the in-flight promise for the same key', async () => {
    let runs = 0;
    let resolveRun!: () => void;
    const runner = createCoalescedAsyncRunner(async (_key: string) => {
      runs += 1;
      await new Promise<void>((resolve) => {
        resolveRun = resolve;
      });
      return runs;
    });

    const first = runner.run('session-a');
    const second = runner.run('session-a');

    expect(runs).toBe(1);
    resolveRun();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 1]);
    expect(runs).toBe(1);
  });

  it('queues at most one rerun requested while a run is in flight', async () => {
    let runs = 0;
    const resolvers: Array<() => void> = [];
    const runner = createCoalescedAsyncRunner(async (_key: string) => {
      runs += 1;
      await new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      return runs;
    });

    const first = runner.run('session-a');
    runner.request('session-a');
    runner.request('session-a');
    expect(runs).toBe(1);

    resolvers[0]!();
    await first;
    await Promise.resolve();

    expect(runs).toBe(2);
    resolvers[1]!();
    await Promise.resolve();
    expect(runs).toBe(2);
  });
});

describe('modelThinking', () => {
  const effortModel = (over: Partial<AppModel> = {}): AppModel => ({
    id: 'k',
    provider: 'p',
    model: 'k',
    maxContextSize: 1,
    capabilities: ['thinking'],
    supportEfforts: ['low', 'high', 'max'],
    defaultEffort: 'high',
    ...over,
  });
  const booleanModel = (capabilities: string[] = ['thinking']): AppModel => ({
    id: 'b',
    provider: 'p',
    model: 'b',
    maxContextSize: 1,
    capabilities,
  });
  const unsupportedModel = (): AppModel => ({
    id: 'u',
    provider: 'p',
    model: 'u',
    maxContextSize: 1,
    capabilities: [],
  });

  describe('modelThinkingAvailability', () => {
    it('toggle when model has thinking capability', () => {
      expect(modelThinkingAvailability(booleanModel())).toBe('toggle');
    });
    it('always-on when model has always_thinking', () => {
      expect(modelThinkingAvailability(booleanModel(['always_thinking']))).toBe('always-on');
    });
    it('unsupported when model lacks thinking capability', () => {
      expect(modelThinkingAvailability(unsupportedModel())).toBe('unsupported');
    });
    it('toggle when adaptiveThinking is set', () => {
      expect(modelThinkingAvailability({ ...unsupportedModel(), adaptiveThinking: true })).toBe('toggle');
    });
  });

  describe('defaultThinkingLevelFor', () => {
    it('effort model returns defaultEffort', () => {
      expect(defaultThinkingLevelFor(effortModel())).toBe('high');
    });
    it('effort model without defaultEffort returns middle effort', () => {
      expect(defaultThinkingLevelFor(effortModel({ defaultEffort: undefined }))).toBe('high');
    });
    it('boolean model returns on', () => {
      expect(defaultThinkingLevelFor(booleanModel())).toBe('on');
    });
    it('unsupported model returns off', () => {
      expect(defaultThinkingLevelFor(unsupportedModel())).toBe('off');
    });
  });

  describe('segmentsFor', () => {
    it('effort toggle → off + efforts (off left)', () => {
      expect(segmentsFor(effortModel())).toEqual(['off', 'low', 'high', 'max']);
    });
    it('effort always-on → efforts only (no off)', () => {
      expect(segmentsFor(effortModel({ capabilities: ['thinking', 'always_thinking'] }))).toEqual([
        'low',
        'high',
        'max',
      ]);
    });
    it('boolean toggle → on/off (on left)', () => {
      expect(segmentsFor(booleanModel())).toEqual(['on', 'off']);
    });
    it('boolean always-on → on', () => {
      expect(segmentsFor(booleanModel(['always_thinking']))).toEqual(['on']);
    });
    it('unsupported → off', () => {
      expect(segmentsFor(unsupportedModel())).toEqual(['off']);
    });
  });

  describe('commitLevel', () => {
    it('on normalizes to the model default', () => {
      expect(commitLevel(effortModel(), 'on')).toBe('high');
      expect(commitLevel(booleanModel(), 'on')).toBe('on');
    });
    it('off stays off', () => {
      expect(commitLevel(effortModel(), 'off')).toBe('off');
    });
    it('concrete effort passes through', () => {
      expect(commitLevel(effortModel(), 'max')).toBe('max');
    });
  });

  describe('effortLabel', () => {
    it('capitalizes the first letter', () => {
      expect(effortLabel('max')).toBe('Max');
      expect(effortLabel('off')).toBe('Off');
      expect(effortLabel('xhigh')).toBe('Xhigh');
    });
  });
});

describe('humanizeCron', () => {
  const dict: Record<string, string> = {
    'conversation.cron.everyMinute': 'Every minute',
    'conversation.cron.everyNMinutes': 'Every {n} minutes',
    'conversation.cron.everyHour': 'Every hour',
    'conversation.cron.everyNHours': 'Every {n} hours',
    'conversation.cron.dailyAt': 'Daily at {time}',
    'conversation.cron.weekdaysAt': 'Weekdays at {time}',
  };
  const t = (key: string, params?: Record<string, unknown>): string => {
    let s = dict[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  it('labels the common cadences', () => {
    expect(humanizeCron('* * * * *', t)).toBe('Every minute');
    expect(humanizeCron('*/5 * * * *', t)).toBe('Every 5 minutes');
    expect(humanizeCron('*/1 * * * *', t)).toBe('Every minute');
    expect(humanizeCron('0 * * * *', t)).toBe('Every hour');
    expect(humanizeCron('0 */2 * * *', t)).toBe('Every 2 hours');
  });

  it('labels fixed daily and weekday times', () => {
    expect(humanizeCron('5 9 * * *', t)).toBe('Daily at 9:05');
    expect(humanizeCron('0 9 * * 1-5', t)).toBe('Weekdays at 9:00');
  });

  it('falls back to the raw expression for unrecognized shapes', () => {
    expect(humanizeCron('0 9 1 * *', t)).toBe('0 9 1 * *');
    expect(humanizeCron('bad', t)).toBe('bad');
  });
});

describe('collapsePrompt', () => {
  it('keeps a short single-line prompt intact with no expand toggle', () => {
    expect(collapsePrompt('Check the deploy status')).toEqual({
      text: 'Check the deploy status',
      hasMore: false,
    });
  });

  it('truncates a long one-line prompt with an ellipsis and reports hasMore', () => {
    const long = 'a'.repeat(150);
    const result = collapsePrompt(long, 120);
    expect(result.hasMore).toBe(true);
    expect(result.text.length).toBeLessThan(long.length);
    expect(result.text.endsWith('…')).toBe(true);
  });

  it('shows only the first line for a multi-line prompt', () => {
    expect(collapsePrompt('first line\nsecond line\nthird line')).toEqual({
      text: 'first line',
      hasMore: true,
    });
  });
});

describe('mergeSnapshotMessages', () => {
  function msg(id: string, createdAt: string): AppMessage {
    return { id, sessionId: 's1', role: 'assistant', content: [], createdAt };
  }

  it('keeps loaded messages older than the snapshot window', () => {
    const loaded = [
      msg('old-1', '2026-01-01T00:00:00.000Z'),
      msg('old-2', '2026-01-02T00:00:00.000Z'),
      msg('recent-live', '2026-01-03T00:00:00.000Z'),
    ];
    const snapshot = [
      msg('m0', '2026-01-03T00:00:00.000Z'),
      msg('m1', '2026-01-04T00:00:00.000Z'),
    ];
    expect(mergeSnapshotMessages(loaded, snapshot).map((m) => m.id)).toEqual([
      'old-1',
      'old-2',
      'm0',
      'm1',
    ]);
  });

  it('returns the snapshot when there is no older loaded prefix', () => {
    const loaded = [msg('recent-live', '2026-01-03T00:00:00.000Z')];
    const snapshot = [
      msg('m0', '2026-01-03T00:00:00.000Z'),
      msg('m1', '2026-01-04T00:00:00.000Z'),
    ];
    expect(mergeSnapshotMessages(loaded, snapshot)).toBe(snapshot);
  });

  it('returns the snapshot when either side is empty', () => {
    const snapshot = [msg('m0', '2026-01-03T00:00:00.000Z')];
    expect(mergeSnapshotMessages([], snapshot)).toBe(snapshot);
    expect(mergeSnapshotMessages(snapshot, [])).toEqual([]);
  });

  function optimisticUser(id: string, createdAt: string, text: string, promptId: string): AppMessage {
    return {
      id,
      sessionId: 's1',
      role: 'user',
      content: [{ type: 'text', text }],
      createdAt,
      promptId,
      metadata: { 'kimiWeb.optimisticUserMessage': true },
    };
  }

  function realUser(id: string, createdAt: string, text: string): AppMessage {
    return {
      id,
      sessionId: 's1',
      role: 'user',
      content: [{ type: 'text', text }],
      createdAt,
    };
  }

  it('drops an optimistic user message when its promptId is the snapshot message id', () => {
    const loaded = [optimisticUser('msg_opt_1', '2026-01-02T23:59:59.000Z', 'hello', 'msg_9')];
    const snapshot = [realUser('msg_9', '2026-01-03T00:00:00.000Z', 'hello')];
    expect(mergeSnapshotMessages(loaded, snapshot).map((m) => m.id)).toEqual(['msg_9']);
  });

  it('keeps an optimistic user message when a different snapshot message repeats its content', () => {
    const loaded = [optimisticUser('msg_opt_1', '2026-01-02T23:59:59.000Z', 'hello', 'msg_8')];
    const snapshot = [realUser('msg_9', '2026-01-03T00:00:00.000Z', 'hello')];
    expect(mergeSnapshotMessages(loaded, snapshot).map((m) => m.id)).toEqual(['msg_opt_1', 'msg_9']);
  });
});

describe('mergeSnapshotSubagents', () => {
  function subagent(id: string, overrides: Partial<AppTask> = {}): AppTask {
    return {
      id,
      sessionId: 's1',
      kind: 'subagent',
      description: `task ${id}`,
      busy: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('seeds an empty store from the roster', () => {
    const roster = [
      subagent('a1', { subagentPhase: 'working', swarmIndex: 0, parentToolCallId: 'call-1' }),
      subagent('a2', { subagentPhase: 'queued', swarmIndex: 1, parentToolCallId: 'call-1' }),
    ];
    expect(mergeSnapshotSubagents(roster, [])).toEqual(roster);
  });

  it('keeps reducer-owned accumulated output from an already-live task', () => {
    const live = subagent('a1', {
      subagentPhase: 'queued',
      outputLines: ['line 1'],
      text: 'partial answer',
    });
    const roster = [subagent('a1', { subagentPhase: 'working' })];
    const [merged] = mergeSnapshotSubagents(roster, [live]);
    // Roster is authoritative for identity/status/phase…
    expect(merged?.subagentPhase).toBe('working');
    // …but the accumulated output survives the seed.
    expect(merged?.outputLines).toEqual(['line 1']);
    expect(merged?.text).toBe('partial answer');
  });

  it('keeps tasks the roster does not know about', () => {
    const background: AppTask = {
      id: 'bash-1',
      sessionId: 's1',
      kind: 'bash',
      description: 'npm test',
      busy: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const roster = [subagent('a1')];
    const merged = mergeSnapshotSubagents(roster, [background, subagent('a1')]);
    expect(merged.map((t) => t.id)).toEqual(['a1', 'bash-1']);
  });

  it('returns the existing list untouched when the roster is empty', () => {
    const existing = [subagent('a1')];
    expect(mergeSnapshotSubagents([], existing)).toBe(existing);
  });
});


describe('keepLiveSubagents', () => {
  function subagent(id: string, overrides: Partial<AppTask> = {}): AppTask {
    return {
      id,
      sessionId: 's1',
      kind: 'subagent',
      description: `task ${id}`,
      status: 'running',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('returns the REST list untouched when no live-only subagent exists', () => {
    const rest = [subagent('a1')];
    expect(keepLiveSubagents(rest, [subagent('a1')])).toBe(rest);
  });

  it('keeps WS-only swarm subagents that REST omits', () => {
    const rest: AppTask[] = [];
    const merged = keepLiveSubagents(rest, [subagent('a1')]);
    expect(merged.map((t) => t.id)).toEqual(['a1']);
  });

  it('folds a REST background-subagent row into the WS row keyed by agent id', () => {
    // The same background subagent: WS keys it by agent id, REST by task id.
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      outputLines: ['step 1'],
      text: 'partial',
    });
    const rest = [subagent('task-9', { runInBackground: true })];
    const merged = keepLiveSubagents(rest, [live]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('agent-1');
    expect(merged[0]?.outputLines).toEqual(['step 1']);
    expect(merged[0]?.text).toBe('partial');
    expect(merged[0]?.backgroundTaskId).toBe('task-9');
  });

  it('lets REST complete a live row whose finish event was missed', () => {
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      subagentPhase: 'working',
    });
    const rest = [
      subagent('task-9', {
        runInBackground: true,
        status: 'completed',
        completedAt: '2026-01-01T00:01:00.000Z',
        outputPreview: 'done',
      }),
    ];
    const [merged] = keepLiveSubagents(rest, [live]);
    expect(merged?.status).toBe('completed');
    // The detail panel prefers subagentPhase over status — it must follow too.
    expect(merged?.subagentPhase).toBe('completed');
    expect(merged?.completedAt).toBe('2026-01-01T00:01:00.000Z');
    expect(merged?.outputPreview).toBe('done');
  });

  it('maps a REST-cancelled row to the failed phase (the enum has no cancelled)', () => {
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      subagentPhase: 'working',
    });
    const rest = [subagent('task-9', { runInBackground: true, status: 'cancelled' })];
    const [merged] = keepLiveSubagents(rest, [live]);
    expect(merged?.status).toBe('cancelled');
    expect(merged?.subagentPhase).toBe('failed');
  });

  it('never lets a lagging poll flip a finished row back to running', () => {
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      status: 'completed',
      completedAt: '2026-01-01T00:01:00.000Z',
    });
    const rest = [subagent('task-9', { runInBackground: true, status: 'running' })];
    const [merged] = keepLiveSubagents(rest, [live]);
    expect(merged?.status).toBe('completed');
  });

  it('keeps newer REST output flowing into an already-folded row', () => {
    // The live row carries a preview folded in by an earlier poll; the fresh
    // REST row has the final persisted output and must win.
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      outputPreview: 'stale tail',
      outputBytes: 100,
    });
    const rest = [
      subagent('task-9', {
        runInBackground: true,
        status: 'completed',
        outputPreview: 'final result',
        outputBytes: 200,
      }),
    ];
    const [merged] = keepLiveSubagents(rest, [live]);
    expect(merged?.outputPreview).toBe('final result');
    expect(merged?.outputBytes).toBe(200);
  });
});

describe('researchProgressSummaries', () => {
  const progress = {
    headline: 'Experiment completed',
    motivation: 'Test the candidate explanation',
    workPerformed: 'Ran the bounded experiment',
    result: 'The candidate matched the observation',
    mainlineImpact: 'Promotes the candidate to the main line',
    uncertainties: ['Finite-size effects remain', 'Independent replication pending'],
    recordedAt: 1,
  };

  it('surfaces work, mainline impact, and joined uncertainties', () => {
    expect(researchProgressSummaries(progress)).toEqual([
      { kind: 'workPerformed', text: 'Ran the bounded experiment' },
      { kind: 'mainlineImpact', text: 'Promotes the candidate to the main line' },
      {
        kind: 'uncertainties',
        text: 'Finite-size effects remain · Independent replication pending',
      },
    ]);
  });

  it('omits an empty uncertainties summary', () => {
    expect(researchProgressSummaries({ ...progress, uncertainties: [' ', ''] }))
      .not.toContainEqual(expect.objectContaining({ kind: 'uncertainties' }));
  });
});

describe('research board compact presentation', () => {
  type ResearchQuestion = ResearchStatusSnapshot['questions'][number];
  type ResearchAction = NonNullable<ResearchStatusSnapshot['currentAction']>;
  type ResearchRun = NonNullable<ResearchStatusSnapshot['currentRun']>;
  type ResearchProgress = NonNullable<ResearchStatusSnapshot['latestProgress']>;
  type AitpMaintenance = NonNullable<ResearchStatusSnapshot['aitpMaintenance']>;

  function snapshot(
    overrides: Partial<ResearchStatusSnapshot> = {},
  ): ResearchStatusSnapshot {
    return {
      mode: 'ready',
      loopStatus: 'active',
      planningPolicy: 'collaborative',
      lineWorkstreamBindings: [],
      questions: [],
      lines: [],
      openQuestionCount: 0,
      activeQuestionCount: 0,
      blockedQuestionCount: 0,
      alerts: [],
      aitpHealth: { phase: 'ready' },
      phase: 'idle',
      revision: 1,
      ...overrides,
    };
  }

  function question(overrides: Partial<ResearchQuestion> = {}): ResearchQuestion {
    return {
      id: 'question_1',
      lineSlug: 'main',
      wording: 'Resolve the main uncertainty',
      priority: 1,
      neededEvidence: [],
      evidenceRefs: [],
      falsifierRefs: [],
      workflow: 'active',
      epistemic: 'candidate',
      persistence: 'working',
      revision: 1,
      ...overrides,
    };
  }

  function action(overrides: Partial<ResearchAction> = {}): ResearchAction {
    return {
      actionId: 'action_1',
      kind: 'experiment',
      purpose: 'Run the bounded experiment',
      expectedEvidence: [],
      stopCondition: 'The bounded result is available',
      allowedToolKinds: [],
      status: 'in_progress',
      createdAt: 1,
      requiresHumanApproval: false,
      ...overrides,
    };
  }

  function run(overrides: Partial<ResearchRun> = {}): ResearchRun {
    return {
      actionId: 'action_1',
      campaign: 'campaign_1',
      jobId: 'job_1',
      stage: 'running',
      schedulerState: 'running',
      lastObservedAt: 1,
      artifactRefs: [],
      ...overrides,
    };
  }

  function progress(overrides: Partial<ResearchProgress> = {}): ResearchProgress {
    return {
      headline: 'The experiment is being evaluated',
      motivation: 'Resolve the main uncertainty',
      workPerformed: 'Ran the bounded experiment',
      result: 'The result is available',
      mainlineImpact: 'The main line can advance',
      uncertainties: [],
      recordedAt: 1,
      ...overrides,
    };
  }

  function degradedMaintenance(
    degradedReason: NonNullable<AitpMaintenance['degradedReason']>,
  ): AitpMaintenance {
    return {
      status: 'degraded',
      refreshedAt: 1,
      memoryStatus: 'available',
      activeNewerThanWorkingNote: false,
      unresolvedFailureCount: 0,
      unresolvedFailures: [],
      warningSummaries: [],
      check: {
        status: 'findings',
        findingCodes: [],
      },
      degradedReason,
    };
  }

  it.each([
    ['unbound', 'neutral'],
    ['unavailable', 'neutral'],
    ['bound', 'success'],
    ['stale', 'warning'],
    ['conflict', 'danger'],
  ] as const)('presents a %s current Line/workstream alignment without inference', (status, variant) => {
    const binding = status === 'bound' || status === 'stale' || status === 'conflict'
      ? {
          confirmationId: 'confirmation-main-1',
          lineSlug: 'main',
          workstream: 'verified-workstream',
          topicId: 'topic_1',
          observedRevision: 2,
          confirmedBy: 'user' as const,
          confirmedAt: 3,
        }
      : undefined;
    expect(presentResearchWorkstreamBinding({
      lineSlug: 'main',
      status,
      reason: `server:${status}`,
      binding,
    })).toEqual({
      lineSlug: 'main',
      status,
      reason: `server:${status}`,
      workstream: binding?.workstream,
      topicId: binding?.topicId,
      observedRevision: binding?.observedRevision,
      confirmedBy: binding?.confirmedBy,
      confirmedAt: binding?.confirmedAt,
      variant,
    });
  });

  it('does not synthesize a current binding when the server omitted alignment state', () => {
    expect(presentResearchWorkstreamBinding(undefined)).toBeUndefined();
  });

  it('keeps the compact projection within its six fixed semantic slots when every slot is available', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      program: {
        topicId: 'topic_1',
        title: 'Example research',
        goalText: 'Establish the durable result',
        goalSource: 'research-plan',
        establishedAt: 1,
      },
      humanGate: {
        gateId: 'gate_1',
        kind: 'approval',
        prompt: 'Approve the bounded experiment',
        createdAt: 1,
      },
      latestProgress: progress({ nextAction: 'Evaluate the result' }),
    }));

    expect(slots.map((slot) => slot.kind)).toEqual([
      'goal',
      'project',
      'loop',
      'attention',
      'now',
      'next',
    ]);
  });

  it('projects the Goal, current Plan milestone, Line, Question, loop, and AITP state', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      goalSummary: {
        goalId: 'goal_1',
        objective: 'Validate the bounded result',
        status: 'active',
      },
      researchPlanV2: {
        schema: 'hakimi/research-plan-0.2',
        planId: 'plan_1',
        revision: 2,
        goalId: 'goal_1',
        programId: 'topic_1',
        programObservedRevision: 1,
        goalRelation: 'goal_milestone_in_program',
        objective: 'Run the multi-loop validation',
        milestones: [{
          milestoneId: 'm1',
          title: 'Validate the first bounded comparison',
          objective: 'Compare the fixed cases',
          completionCriterion: 'The comparison is checked',
          evidenceRequirements: [],
        }],
        evidenceRequirements: [],
        decisionPoints: [],
        assumptions: [],
        currentMilestoneId: 'm1',
        stopConditions: [],
        replanConditions: [],
        status: 'active',
        createdAt: 1,
        updatedAt: 2,
      },
      currentLineSlug: 'main',
      lines: [{
        slug: 'main', title: 'Main line', status: 'active', createdAt: 1, revision: 1,
      }],
      currentQuestion: question({ wording: 'Does the first comparison pass?' }),
      period: {
        id: 'period_1', lineSlug: 'main', startedAt: 1, loopCount: 6,
      },
      currentWorkstreamBinding: {
        lineSlug: 'main', status: 'unbound', reason: 'Explicit confirmation is required.',
      },
    }));

    expect(slots.find((slot) => slot.kind === 'project')).toMatchObject({
      kind: 'project',
      goalText: 'Validate the bounded result',
      goalStatus: 'active',
      planStatus: 'active',
      milestone: 'Validate the first bounded comparison',
      line: 'Main line',
      question: 'Does the first comparison pass?',
      questionWorkflow: 'active',
      questionEpistemic: 'candidate',
    });
    expect(slots.find((slot) => slot.kind === 'loop')).toEqual({
      kind: 'loop',
      phase: 'idle',
      loopCount: 6,
      actionStatus: undefined,
      aitpState: 'blocked',
    });
  });

  it('omits the goal slot when only a Goal milestone exists', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      goalSummary: {
        objective: 'Finish the current milestone',
        status: 'active',
      },
    }));

    expect(slots).not.toContainEqual(expect.objectContaining({ kind: 'goal' }));
  });

  it('uses the research program goal text for the goal slot', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      program: {
        topicId: 'topic_1',
        title: 'Example research',
        goalText: 'Establish the durable result',
        goalSource: 'research-plan',
        establishedAt: 1,
      },
      goalSummary: {
        objective: 'Finish a different milestone',
        status: 'active',
      },
    }));

    expect(slots.find((slot) => slot.kind === 'goal')).toEqual({
      kind: 'goal',
      text: 'Establish the durable result',
    });
  });

  it('uses the unresolved human gate as primary attention when every source is present', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      humanGate: {
        gateId: 'gate_1',
        kind: 'approval',
        prompt: 'Approve the bounded experiment',
        createdAt: 1,
      },
      aitpMaintenance: degradedMaintenance('adapter_degraded'),
      alerts: [{
        fingerprint: 'alert_1',
        kind: 'blocked',
        state: 'active',
        message: 'The evidence is blocked',
        createdAt: 1,
      }],
      aitpHealth: { phase: 'degraded', lastError: 'Adapter unavailable' },
    }));

    expect(slots.find((slot) => slot.kind === 'attention')).toEqual({
      kind: 'attention',
      source: 'human_gate',
      text: 'Approve the bounded experiment',
      additionalCount: 3,
    });
  });

  it('uses degraded maintenance as attention when the human gate is resolved', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      humanGate: {
        gateId: 'gate_1',
        kind: 'approval',
        prompt: 'Historical decision',
        createdAt: 1,
        resolvedAt: 2,
        resolution: 'approved',
      },
      aitpMaintenance: degradedMaintenance('check_unavailable'),
    }));

    expect(slots.find((slot) => slot.kind === 'attention')).toEqual({
      kind: 'attention',
      source: 'maintenance',
      text: 'check_unavailable',
      additionalCount: 0,
    });
  });

  it('prioritizes an active Goal alignment blocker over gates and alerts', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      goalSummary: {
        goalId: 'goal_1',
        objective: 'Finish the milestone',
        status: 'active',
      },
      goalAlignment: {
        status: 'confirmation_required',
        reason: 'Confirm the Goal and observed Research Program relationship.',
      },
      humanGate: {
        gateId: 'gate_1',
        kind: 'approval',
        prompt: 'Approve the bounded experiment',
        createdAt: 1,
      },
      alerts: [{
        fingerprint: 'alert_1',
        kind: 'blocked',
        state: 'active',
        message: 'The evidence is blocked',
        createdAt: 1,
      }],
    }));

    expect(slots.find((slot) => slot.kind === 'attention')).toEqual({
      kind: 'attention',
      source: 'alignment',
      text: 'Confirm the Goal and observed Research Program relationship.',
      additionalCount: 2,
    });
  });

  it('uses the first active alert when higher-priority attention is absent', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      alerts: [
        {
          fingerprint: 'alert_old',
          kind: 'stale',
          state: 'acknowledged',
          message: 'Historical warning',
          createdAt: 1,
        },
        {
          fingerprint: 'alert_active',
          kind: 'blocked',
          state: 'active',
          message: 'The current question is blocked',
          createdAt: 2,
        },
      ],
      aitpHealth: { phase: 'degraded', lastError: 'Adapter unavailable' },
    }));

    expect(slots.find((slot) => slot.kind === 'attention')).toEqual({
      kind: 'attention',
      source: 'alert',
      alertKind: 'blocked',
      text: 'The current question is blocked',
      additionalCount: 1,
    });
  });

  it('prioritizes a current warning over a historical unresolved alert', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      alerts: [{
        fingerprint: 'alert_historical',
        kind: 'blocked',
        classification: 'historical_unresolved',
        state: 'active',
        message: 'An earlier attempt remains unresolved',
        createdAt: 1,
      }, {
        fingerprint: 'alert_warning',
        kind: 'contradiction',
        classification: 'warning',
        state: 'active',
        message: 'The current evidence needs review',
        createdAt: 2,
      }],
    }));

    expect(slots.find((slot) => slot.kind === 'attention')).toEqual({
      kind: 'attention',
      source: 'alert',
      alertKind: 'contradiction',
      text: 'The current evidence needs review',
      additionalCount: 1,
    });
  });

  it('treats a legacy unclassified blocked alert as current attention', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      aitpMaintenance: degradedMaintenance('adapter_degraded'),
      alerts: [
        {
          fingerprint: 'alert_historical',
          kind: 'blocked',
          classification: 'historical_unresolved',
          state: 'active',
          message: 'An earlier failure remains unresolved',
          createdAt: 1,
        },
        {
          fingerprint: 'alert_current',
          kind: 'blocked',
          state: 'active',
          message: 'The current experiment is blocked',
          createdAt: 2,
        },
      ],
    }));

    expect(slots.find((slot) => slot.kind === 'attention')).toEqual({
      kind: 'attention',
      source: 'alert',
      alertKind: 'blocked',
      text: 'The current experiment is blocked',
      additionalCount: 2,
    });
  });

  it('presents legacy blocked alerts as active blockers in every board view', () => {
    expect(presentResearchAlertClassification({
      fingerprint: 'alert_legacy_blocked',
      kind: 'blocked',
      message: 'The current experiment is blocked',
      createdAt: 1,
    })).toBe('active_blocker');
    expect(presentResearchAlertClassification({
      fingerprint: 'alert_legacy_warning',
      kind: 'stale',
      message: 'The state may be stale',
      createdAt: 1,
    })).toBe('warning');
  });

  it('does not count a legacy acknowledged alert as compact attention', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      alerts: [{
        fingerprint: 'alert_acknowledged',
        kind: 'stale',
        message: 'The stale alert was already acknowledged',
        createdAt: 1,
        acknowledgedAt: 2,
      }],
    }));

    expect(slots).not.toContainEqual(expect.objectContaining({ kind: 'attention' }));
  });

  it('uses the adapter error when no higher-priority attention is active', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      aitpHealth: { phase: 'degraded', lastError: 'Adapter unavailable' },
    }));

    expect(slots.find((slot) => slot.kind === 'attention')).toEqual({
      kind: 'attention',
      source: 'adapter',
      text: 'Adapter unavailable',
      additionalCount: 0,
    });
  });

  it('surfaces an unavailable distillation handoff and preserves its expanded receipt', () => {
    const distillationAttention = {
      schema: 'hakimi/research-distillation-attention-0.1' as const,
      status: 'handoff_unavailable' as const,
      checkpointId: 'cp-distill',
      entryId: 'entry-distill',
      reason: 'The external Skill is hidden.',
      recordedAt: 1000,
    };
    const input = snapshot({ distillationAttention });
    expect(buildResearchBoardCompactSlots(input).find((slot) => slot.kind === 'attention'))
      .toEqual({
        kind: 'attention',
        source: 'distillation',
        text: 'Entry entry-distill: The external Skill is hidden.',
        additionalCount: 0,
      });
    expect(selectResearchBoardExpandedRecord(input).distillationAttention)
      .toEqual(distillationAttention);
  });

  it('uses an active run for now when lower-priority current state exists', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      phase: 'action_executing',
      currentRun: run({
        campaign: 'spectrum_scan',
        jobId: 'job_42',
        stage: 'queued',
        schedulerState: 'pending',
      }),
      currentAction: action({ status: 'in_progress' }),
      latestProgress: progress(),
    }));

    expect(slots.find((slot) => slot.kind === 'now')).toEqual({
      kind: 'now',
      source: 'run',
      text: 'spectrum_scan / job_42',
      stage: 'queued',
      schedulerState: 'pending',
    });
  });

  it('uses the current action for now when the current run is terminal', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      phase: 'action_planned',
      currentRun: run({
        stage: 'completed',
        schedulerState: 'completed',
        terminalState: 'completed',
      }),
      currentAction: action({
        purpose: 'Analyze the completed spectrum',
        status: 'planned',
      }),
      latestProgress: progress(),
    }));

    expect(slots.find((slot) => slot.kind === 'now')).toEqual({
      kind: 'now',
      source: 'action',
      text: 'Analyze the completed spectrum',
      status: 'planned',
    });
  });

  it('uses the latest progress headline for now when execution is inactive', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      currentAction: action({ status: 'completed' }),
      latestProgress: progress({ headline: 'The candidate survived the test' }),
    }));

    expect(slots.find((slot) => slot.kind === 'now')).toEqual({
      kind: 'now',
      source: 'progress',
      text: 'The candidate survived the test',
    });
  });

  it('surfaces and bypasses a stale live action whose phase already moved on', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      phase: 'gap_analysis',
      currentAction: action({
        actionId: 'action_stale',
        purpose: 'Commit an obsolete file set',
        status: 'in_progress',
        createdAt: 10,
      }),
      latestProgress: progress({
        headline: 'The newer reciprocal-space cause is localized',
        recordedAt: 20,
      }),
    }));

    expect(slots.find((slot) => slot.kind === 'loop')).toMatchObject({
      kind: 'loop',
      phase: 'gap_analysis',
      actionStatus: 'recovery_required',
    });
    expect(slots.find((slot) => slot.kind === 'attention')).toEqual({
      kind: 'attention',
      source: 'action_recovery',
      text: expect.stringContaining('action_stale is in_progress while the Research phase is gap_analysis'),
      additionalCount: 0,
    });
    expect(slots.find((slot) => slot.kind === 'now')).toEqual({
      kind: 'now',
      source: 'progress',
      text: 'The newer reciprocal-space cause is localized',
    });
    expect(slots.find((slot) => slot.kind === 'next')).toEqual({
      kind: 'next',
      source: 'action_recovery',
      text: 'Conclude or abandon action action_stale before starting another action.',
      freshness: 'blocked',
    });
  });

  it('uses the focused question for now when higher-priority current state is absent', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      currentFocus: { questionId: 'question_focus', revision: 1 },
      currentQuestion: question({
        id: 'question_fallback',
        wording: 'Fallback question',
      }),
      questions: [question({
        id: 'question_focus',
        wording: 'Focused research question',
      })],
    }));

    expect(slots.find((slot) => slot.kind === 'now')).toEqual({
      kind: 'now',
      source: 'question',
      text: 'Focused research question',
    });
  });

  it('uses the recent state change before the current line for now', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      currentLineSlug: 'main',
      lines: [{
        slug: 'main',
        title: 'Main research line',
        status: 'active',
        createdAt: 1,
        revision: 1,
      }],
      recentStateChange: {
        beforePhase: 'evaluating',
        afterPhase: 'state_updated',
        summary: 'The evidence changed the research state',
        changedAt: 2,
      },
    }));

    expect(slots.find((slot) => slot.kind === 'now')).toEqual({
      kind: 'now',
      source: 'state_change',
      text: 'The evidence changed the research state',
    });
  });

  it('uses the current line title as the final now fallback', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      currentLineSlug: 'main',
      lines: [{
        slug: 'main',
        title: 'Main research line',
        status: 'active',
        createdAt: 1,
        revision: 1,
      }],
    }));

    expect(slots.find((slot) => slot.kind === 'now')).toEqual({
      kind: 'now',
      source: 'line',
      text: 'Main research line',
    });
  });

  it('uses the effective next step when every next-action fallback exists', () => {
    const focused = question({
      id: 'question_focus',
      nextBoundedAction: 'Question fallback',
    });
    const slots = buildResearchBoardCompactSlots(snapshot({
      effectiveNextStep: {
        text: 'Current effective action',
        source: 'research_run',
        freshness: 'current',
        observedAt: 1,
        derivedFrom: {},
      },
      latestProgress: progress({ nextAction: 'Progress fallback' }),
      currentFocus: {
        questionId: 'question_focus',
        boundedAction: 'Focus fallback',
        revision: 1,
      },
      questions: [focused],
    }));

    expect(slots.find((slot) => slot.kind === 'next')).toEqual({
      kind: 'next',
      source: 'research_run',
      text: 'Current effective action',
      freshness: 'current',
    });
  });

  it('uses the progress next action when no effective next step exists', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      latestProgress: progress({ nextAction: 'Evaluate the bounded result' }),
    }));

    expect(slots.find((slot) => slot.kind === 'next')).toEqual({
      kind: 'next',
      source: 'progress',
      text: 'Evaluate the bounded result',
    });
  });

  it('uses the focused question action when progress has no next action', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      latestProgress: progress(),
      currentFocus: { questionId: 'question_focus', revision: 1 },
      questions: [question({
        id: 'question_focus',
        nextBoundedAction: 'Run the falsification check',
      })],
    }));

    expect(slots.find((slot) => slot.kind === 'next')).toEqual({
      kind: 'next',
      source: 'question',
      text: 'Run the falsification check',
    });
  });

  it('uses the focus bounded action as the final next fallback', () => {
    const slots = buildResearchBoardCompactSlots(snapshot({
      currentFocus: {
        questionId: 'missing_question',
        boundedAction: 'Recover the focused question',
        revision: 1,
      },
    }));

    expect(slots.find((slot) => slot.kind === 'next')).toEqual({
      kind: 'next',
      source: 'focus',
      text: 'Recover the focused question',
    });
  });

  it('preserves the complete period, both plan layers, and status for the expanded board', () => {
    const input = snapshot({
      period: {
        id: 'period_1',
        lineSlug: 'main',
        startedAt: 1,
        endedAt: 2,
        loopCount: 3,
        currentQuestionId: 'question_1',
        summary: 'The bounded cycle is complete',
      },
      researchPlan: {
        planId: 'plan_1',
        researchRevision: 4,
        programId: 'program_1',
        periodId: 'period_1',
        lineSlug: 'main',
        questionId: 'question_1',
        lineRevision: 5,
        questionRevision: 6,
        objective: 'Resolve the bounded uncertainty',
        steps: ['Collect evidence', 'Evaluate the result', 'Record the conclusion'],
        expectedEvidence: ['Primary observation', 'Independent check'],
        stopCondition: 'The conclusion meets the stated criterion',
        status: 'finalized',
        resolution: {
          planId: 'plan_1',
          planRevision: 2,
          outcome: 'approved',
          selectedLabel: 'Preferred route',
        },
      },
      actionPlan: {
        planId: 'plan_1',
        researchRevision: 4,
        objective: 'Resolve the bounded uncertainty',
        steps: ['Collect evidence', 'Evaluate the result', 'Record the conclusion'],
        expectedEvidence: ['Primary observation', 'Independent check'],
        stopCondition: 'The conclusion meets the stated criterion',
        status: 'finalized',
      },
      researchPlanV2: {
        schema: 'hakimi/research-plan-0.2',
        planId: 'research_plan_1',
        revision: 2,
        goalId: 'goal_1',
        programId: 'program_1',
        programObservedRevision: 1,
        goalRelation: 'goal_milestone_in_program',
        objective: 'Validate the current milestone',
        completionCriterion: 'The evidence passes validation',
        milestones: [{
          milestoneId: 'milestone_1',
          title: 'Validate evidence',
          objective: 'Run one bounded check',
          completionCriterion: 'The check passes',
          evidenceRequirements: ['Primary observation'],
        }],
        evidenceRequirements: ['Reproducible result'],
        decisionPoints: [],
        assumptions: [],
        currentMilestoneId: 'milestone_1',
        stopConditions: ['Stop on failed validation'],
        replanConditions: ['Replan on Program drift'],
        status: 'active',
        createdAt: 1,
        updatedAt: 2,
      },
      status: {
        currentLineSlug: 'main',
        currentQuestionId: 'question_1',
        currentActionId: 'action_1',
        phase: 'evaluating',
        nextStep: 'Record the conclusion',
        health: 'attention',
        attention: ['Check the uncertainty bound', 'Confirm the provenance'],
      },
    });

    const record = selectResearchBoardExpandedRecord(input);

    expect(record).toEqual({
      planningPolicy: input.planningPolicy,
      period: input.period,
      plan: input.researchPlan,
      actionPlan: input.actionPlan,
      researchPlanV2: input.researchPlanV2,
      status: input.status,
    });
    expect(record.plan?.steps).toHaveLength(3);
    expect(record.plan?.expectedEvidence).toHaveLength(2);
    expect(record.researchPlanV2?.milestones).toHaveLength(1);
    expect(record.planningPolicy).toBe('collaborative');
    expect(record.status?.attention).toHaveLength(2);
  });
});
