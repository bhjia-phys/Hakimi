#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_INLINE = 1200;
const EXIT_EXPECTATION_FAILED = 2;
const EXIT_TIMEOUT = 124;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const IS_CLI = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_CLI) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}

async function main() {
  const { command, options } = parseCli(process.argv.slice(2));
  if (options.help || command === undefined) {
    printHelp();
    return;
  }

  if (command === 'run') {
    const result = await runAndAnalyze(options);
    await emitResult(result, options);
    process.exitCode = result.ok ? 0 : result.timedOut ? EXIT_TIMEOUT : EXIT_EXPECTATION_FAILED;
    return;
  }

  if (command === 'analyze') {
    const result = await analyzeOnly(options);
    await emitResult(result, options);
    process.exitCode = result.ok ? 0 : EXIT_EXPECTATION_FAILED;
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseCli(args) {
  const result = {
    command: undefined,
    options: {
      expectTools: [],
      expectToolActions: [],
      expectVisibleTexts: [],
      expectReasoningCues: [],
      expectReasoningLedTools: [],
      expectAitpWriteOperations: [],
      expectAitpResearchRunTopics: [],
      expectFreshAitpResearchRunTopics: [],
      expectNoPostWorkframeMissingWorkframe: false,
    },
  };
  if (args.length > 0 && !args[0].startsWith('-')) {
    result.command = args.shift();
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') continue;
    switch (arg) {
      case '-h':
      case '--help':
        result.options.help = true;
        break;
      case '--home':
        result.options.home = requireValue(args, ++i, arg);
        break;
      case '--workdir':
        result.options.workdir = requireValue(args, ++i, arg);
        break;
      case '--session':
        result.options.session = requireValue(args, ++i, arg);
        break;
      case '--session-dir':
        result.options.sessionDir = requireValue(args, ++i, arg);
        break;
      case '--prompt':
        result.options.prompt = requireValue(args, ++i, arg);
        break;
      case '--prompt-file':
        result.options.promptFile = requireValue(args, ++i, arg);
        break;
      case '--hakimi-bin':
        result.options.hakimiBin = requireValue(args, ++i, arg);
        break;
      case '--model':
        result.options.model = requireValue(args, ++i, arg);
        break;
      case '--timeout-ms':
        result.options.timeoutMs = Number(requireValue(args, ++i, arg));
        break;
      case '--out':
        result.options.out = requireValue(args, ++i, arg);
        break;
      case '--json':
        result.options.json = true;
        break;
      case '--expect-tool':
        result.options.expectTools.push(requireValue(args, ++i, arg));
        break;
      case '--expect-tool-action':
        result.options.expectToolActions.push(requireValue(args, ++i, arg));
        break;
      case '--expect-visible-text':
        result.options.expectVisibleTexts.push(requireValue(args, ++i, arg));
        break;
      case '--expect-private-reasoning':
        result.options.expectPrivateReasoning = true;
        break;
      case '--expect-reasoning-cue':
        result.options.expectReasoningCues.push(requireValue(args, ++i, arg));
        break;
      case '--expect-reasoning-led-tool':
        result.options.expectReasoningLedTools.push(requireValue(args, ++i, arg));
        break;
      case '--expect-no-missing-workframe':
        result.options.expectNoMissingWorkframe = true;
        break;
      case '--expect-no-post-workframe-missing-workframe':
        result.options.expectNoPostWorkframeMissingWorkframe = true;
        break;
      case '--expect-workframe-opened':
        result.options.expectWorkframeOpened = true;
        break;
      case '--expect-context-pack':
        result.options.expectContextPack = true;
        break;
      case '--expect-ledger-topic':
        result.options.expectLedgerTopic = requireValue(args, ++i, arg);
        break;
      case '--expect-aitp-topic':
        result.options.expectAitpTopic = requireValue(args, ++i, arg);
        break;
      case '--expect-autoresearch-run':
        result.options.expectAutoresearchRun = true;
        break;
      case '--expect-aitp-write-operation':
        result.options.expectAitpWriteOperations.push(requireValue(args, ++i, arg));
        break;
      case '--expect-aitp-research-run-topic':
        result.options.expectAitpResearchRunTopics.push(requireValue(args, ++i, arg));
        break;
      case '--expect-fresh-aitp-research-run-topic':
        result.options.expectFreshAitpResearchRunTopics.push(requireValue(args, ++i, arg));
        break;
      case '--fail-on-tool-error':
        result.options.failOnToolError = true;
        break;
      case '--allow-run-failure':
        result.options.allowRunFailure = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return result;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printHelp() {
  console.log(`Hakimi real-session audit harness

Usage:
  node scripts/hakimi-real-session-audit.mjs run --workdir <dir> --prompt <text> [checks...]
  node scripts/hakimi-real-session-audit.mjs analyze --session <id> [--workdir <dir>] [checks...]
  node scripts/hakimi-real-session-audit.mjs analyze --session-dir <dir> [checks...]

Important boundary:
  The run command enables redacted reasoning.audit records only for its child
  Hakimi process. Ordinary Hakimi sessions do not write those records unless
  KIMI_CODE_EXPERIMENTAL_REASONING_AUDIT=1 is explicitly set. The analyzer
  falls back to raw think blocks for older sessions, but never prints their
  text. It reports tool calls, lifecycle records, visible outputs, failures,
  auto-capture skips, Hakimi ledger topics, and AITP topic/run state.

Run options:
  --hakimi-bin <cmd>             Hakimi executable, default: hakimi
  --home <dir>                   Hakimi home, default: HAKIMI_HOME or ~/.hakimi
  --workdir <dir>                Working directory for the real session
  --prompt <text>                Prompt for hakimi -p
  --prompt-file <file>           Read prompt from a file
  --model <model>                Optional model alias
  --timeout-ms <n>               Default: ${DEFAULT_TIMEOUT_MS}
  --allow-run-failure            Still analyze if hakimi exits non-zero

Analyze options:
  --session <id>                 Session id to locate in session_index.jsonl
  --session-dir <dir>            Direct session directory

Checks:
  --expect-tool <name>           Require at least one completed tool call
  --expect-tool-action <tool/action>
                                 Require at least one successful completed tool action
  --expect-visible-text <text>   Require visible assistant/tool output substring
  --expect-private-reasoning     Require at least one redacted reasoning/think part
  --expect-reasoning-cue <cue>   Require a redacted reasoning block with a behavior cue
  --expect-reasoning-led-tool <tool[/action]>
                                 Require a reasoning block followed by a tool call
  --expect-no-missing-workframe  Fail if auto-capture skipped missing WorkFrame
  --expect-no-post-workframe-missing-workframe
                                 Fail only if missing WorkFrame happened after open_work_frame
  --expect-workframe-opened      Require a successful ResearchAction open_work_frame
  --expect-context-pack          Require a successful context pack compile
  --expect-ledger-topic <topic>  Require .hakimi/research-ledger/<topic>
  --expect-aitp-topic <topic>    Require .aitp/topics/<topic>
  --expect-autoresearch-run      Require at least one AITP research_run record
  --expect-aitp-write-operation <operation>
                                 Require a successful execute_aitp_write_bridge operation
  --expect-aitp-research-run-topic <topic>
                                 Require an AITP research_run record for the topic
  --expect-fresh-aitp-research-run-topic <topic>
                                 Require a topic research_run modified during this harness run
  --fail-on-tool-error           Fail when any tool_lifecycle completed failed

Output:
  --out <file>                   Write report to file (.json for JSON, otherwise Markdown)
  --json                         Print JSON instead of Markdown
`);
}

async function runAndAnalyze(options) {
  const home = resolveHome(options.home);
  const workdir = resolveRequiredPath(options.workdir, '--workdir');
  const prompt = await resolvePrompt(options);
  const before = await readSessionIndexMap(home);
  const run = await runHakimiPrompt({
    hakimiBin: options.hakimiBin,
    home,
    workdir,
    prompt,
    model: options.model,
    timeoutMs: finitePositive(options.timeoutMs, DEFAULT_TIMEOUT_MS),
  });
  if (run.exitCode !== 0 && !options.allowRunFailure && !run.timedOut) {
    const partial = await analyzeFromBestEffortSession(home, workdir, before, run, options);
    partial.expectations.unshift(failExpectation('hakimi-exit-code', `hakimi exited ${run.exitCode}`));
    partial.ok = false;
    partial.run = runForReport(run);
    return partial;
  }
  const analysis = await analyzeFromBestEffortSession(home, workdir, before, run, options);
  analysis.run = runForReport(run);
  analysis.expectations = evaluateExpectations(analysis, options);
  analysis.ok = analysis.expectations.every((expectation) => expectation.pass);
  if (run.timedOut) {
    analysis.expectations.unshift(failExpectation('hakimi-timeout', `hakimi exceeded ${run.timeoutMs}ms`));
    analysis.ok = false;
    analysis.timedOut = true;
  } else if (run.exitCode !== 0 && !options.allowRunFailure) {
    analysis.expectations.unshift(failExpectation('hakimi-exit-code', `hakimi exited ${run.exitCode}`));
    analysis.ok = false;
  }
  return analysis;
}

async function analyzeOnly(options) {
  const home = resolveHome(options.home);
  const session = await resolveSessionLocation({ home, workdir: options.workdir, sessionId: options.session, sessionDir: options.sessionDir });
  return analyzeSession({ home, session, options });
}

async function analyzeFromBestEffortSession(home, workdir, beforeIndex, run, options) {
  const sessionIdFromOutput = parseResumeSessionId(`${run.stdout}\n${run.stderr}`);
  try {
    let session;
    if (sessionIdFromOutput !== undefined) {
      session = await resolveSessionLocation({ home, workdir, sessionId: sessionIdFromOutput });
    } else {
      session = await findNewOrUpdatedSession(home, workdir, beforeIndex);
    }
    return analyzeSession({ home, session, options });
  } catch (error) {
    return createRunOnlyAudit({
      home,
      workdir,
      reason: error instanceof Error ? error.message : String(error),
      options,
    });
  }
}

async function runHakimiPrompt(input) {
  const commandSpec = resolveHakimiCommand(input.hakimiBin);
  const args = [];
  if (input.model !== undefined) args.push('--model', input.model);
  args.push('--prompt', input.prompt, '--output-format', 'stream-json');
  const spawnArgs = [...commandSpec.prefixArgs, ...args];

  const env = createHakimiAuditEnv(input.home);
  const startedAt = new Date().toISOString();
  return new Promise((resolvePromise) => {
    const child = spawn(commandSpec.command, spawnArgs, {
      cwd: input.workdir,
      env,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 3000).unref();
    }, input.timeoutMs);
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolvePromise({
        startedAt,
        finishedAt: new Date().toISOString(),
        command: commandSpec.command,
        args: spawnArgs,
        exitCode: 1,
        signal: undefined,
        timedOut,
        timeoutMs: input.timeoutMs,
        stdout,
        stderr: `${stderr}\n${error.message}`,
      });
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolvePromise({
        startedAt,
        finishedAt: new Date().toISOString(),
        command: commandSpec.command,
        args: spawnArgs,
        exitCode: exitCode ?? (timedOut ? EXIT_TIMEOUT : 1),
        signal: signal ?? undefined,
        timedOut,
        timeoutMs: input.timeoutMs,
        stdout,
        stderr,
      });
    });
  });
}

async function analyzeSession({ home, session, options }) {
  const state = await readJsonIfExists(join(session.sessionDir, 'state.json'));
  const workdir = session.workDir ?? state?.workDir ?? options.workdir;
  const agentWires = await readAgentWires(session.sessionDir);
  const audit = createEmptyAudit({ home, session, state, workdir });

  for (const wire of agentWires) {
    audit.agents.push({ agentId: wire.agentId, wirePath: wire.path, records: wire.records.length, malformed: wire.malformed });
    for (const entry of wire.records) {
      scanWireEntry(audit, wire.agentId, entry);
    }
  }

  finalizeReasoningBehavior(audit);
  if (workdir !== undefined) {
    audit.filesystem = await scanResearchFilesystem(workdir);
  }
  audit.expectations = evaluateExpectations(audit, options);
  audit.ok = audit.expectations.every((expectation) => expectation.pass);
  delete audit._startedToolArgs;
  delete audit._reasoningAuditPartUuids;
  delete audit._sequence;
  return audit;
}

function createEmptyAudit({ home, session, state, workdir }) {
  return {
    ok: true,
    timedOut: false,
    home,
    session: {
      id: session.sessionId,
      dir: session.sessionDir,
      workDir: workdir,
      title: stringOrUndefined(state?.title),
      createdAt: stringOrUndefined(state?.createdAt),
      updatedAt: stringOrUndefined(state?.updatedAt),
    },
    agents: [],
    privateReasoning: {
      redacted: true,
      parts: 0,
      chars: 0,
      note: 'Private reasoning/thinking parts are counted but not printed.',
    },
    prompts: [],
    assistantTexts: [],
    visibleTranscript: [],
    reasoningBlocks: [],
    reasoningBehavior: {
      turnCount: 0,
      turns: [],
      ledToolCalls: [],
      repeatedAfterReasoningFailures: [],
    },
    timeline: [],
    activeTools: [],
    toolCalls: [],
    toolSummary: {},
    autoCaptureSkipped: {},
    research: {
      workFrameOpened: false,
      workFrameIds: [],
      contextPackCompiled: false,
      researchActionResults: [],
      ledgerWrites: [],
      aitpWriteBridgeCalls: [],
      autoresearchEvents: [],
    },
    failures: [],
    filesystem: {
      hakimiLedgerTopics: [],
      aitpTopics: [],
      aitpResearchRuns: [],
      aitpResearchRunDetails: [],
    },
    expectations: [],
    _startedToolArgs: new Map(),
    _reasoningAuditPartUuids: new Set(),
    _sequence: 0,
  };
}

function createRunOnlyAudit({ home, workdir, reason, options }) {
  const audit = createEmptyAudit({
    home,
    session: {
      sessionId: '(no-session-found)',
      sessionDir: '(no-session-found)',
    },
    state: {},
    workdir,
  });
  audit.failures.push({
    severity: 'error',
    kind: 'session_not_found',
    output: reason,
  });
  audit.expectations = evaluateExpectations(audit, options);
  audit.ok = false;
  delete audit._startedToolArgs;
  delete audit._reasoningAuditPartUuids;
  delete audit._sequence;
  return audit;
}

function scanWireEntry(audit, agentId, entry) {
  if (!entry || typeof entry !== 'object') return;
  if (entry.type === 'tools.set_active_tools' && Array.isArray(entry.names)) {
    audit.activeTools.push(...entry.names.filter((name) => typeof name === 'string'));
  }

  if (entry.type === 'turn.prompt') {
    audit.prompts.push(truncate(redactSecrets(JSON.stringify(entry.input ?? null))));
  }

  if (entry.type === 'research_ledger.auto_capture_skipped') {
    const reason = stringOrUndefined(entry.reason) ?? 'unknown';
    const toolName = stringOrUndefined(entry.toolName) ?? 'unknown';
    audit.autoCaptureSkipped[reason] ??= {};
    audit.autoCaptureSkipped[reason][toolName] = (audit.autoCaptureSkipped[reason][toolName] ?? 0) + 1;
    pushTimeline(audit, {
      kind: 'auto_capture_skipped',
      agentId,
      turnId: turnIdOrUndefined(entry.turnId),
      step: Number.isFinite(entry.step) ? entry.step : undefined,
      toolName,
      toolCallId: stringOrUndefined(entry.toolCallId),
      reason,
    });
    if (reason === 'missing-workframe') {
      audit.failures.push({
        severity: 'warning',
        kind: 'auto_capture_skipped',
        agentId,
        toolName,
        reason,
        lineHint: stringOrUndefined(entry.toolCallId),
      });
    }
  }

  if (entry.type === 'reasoning.audit') {
    scanReasoningAuditRecord(audit, agentId, entry);
  }

  if (entry.type === 'tool_lifecycle.started' || entry.type === 'tool_lifecycle.completed') {
    scanToolLifecycle(audit, agentId, entry);
  }

  if (entry.type === 'context.append_loop_event') {
    scanLoopEvent(audit, agentId, entry.event);
  }

  if (entry.type?.startsWith?.('autoresearch.')) {
    audit.research.autoresearchEvents.push({ type: entry.type, summary: truncate(redactSecrets(JSON.stringify(entry))) });
  }
}

function scanReasoningAuditRecord(audit, agentId, entry) {
  const chars = Number.isFinite(entry.chars) ? entry.chars : 0;
  const cues = Array.isArray(entry.cues) ? entry.cues.filter((cue) => typeof cue === 'string') : [];
  const partUuid = stringOrUndefined(entry.partUuid);
  if (partUuid !== undefined) removeFallbackReasoningBlock(audit, partUuid);
  if (partUuid !== undefined) audit._reasoningAuditPartUuids.add(partUuid);
  audit.privateReasoning.parts += 1;
  audit.privateReasoning.chars += chars;
  const block = {
    agentId: stringOrUndefined(entry.agentId) ?? agentId,
    turnId: turnIdOrUndefined(entry.turnId),
    step: Number.isFinite(entry.step) ? entry.step : undefined,
    partUuid,
    chars,
    redacted: true,
    cues,
    source: 'reasoning.audit',
  };
  audit.reasoningBlocks.push(block);
  pushTimeline(audit, {
    kind: 'reasoning',
    agentId: block.agentId,
    turnId: block.turnId,
    step: block.step,
    partUuid,
    chars,
    cues,
    redacted: true,
    source: 'reasoning.audit',
  });
}

function removeFallbackReasoningBlock(audit, partUuid) {
  const blockIndex = audit.reasoningBlocks.findIndex(
    (block) => block.partUuid === partUuid && block.source === 'content.part',
  );
  if (blockIndex >= 0) {
    const [removed] = audit.reasoningBlocks.splice(blockIndex, 1);
    audit.privateReasoning.parts = Math.max(0, audit.privateReasoning.parts - 1);
    audit.privateReasoning.chars = Math.max(0, audit.privateReasoning.chars - (removed?.chars ?? 0));
  }
  const timelineIndex = audit.timeline.findIndex(
    (event) => event.kind === 'reasoning' && event.partUuid === partUuid && event.source === 'content.part',
  );
  if (timelineIndex >= 0) audit.timeline.splice(timelineIndex, 1);
}

function scanToolLifecycle(audit, agentId, entry) {
  const toolName = stringOrUndefined(entry.toolName) ?? 'unknown';
  audit.toolSummary[toolName] ??= { started: 0, completed: 0, failed: 0 };
  if (entry.type === 'tool_lifecycle.started') audit.toolSummary[toolName].started += 1;
  if (entry.type === 'tool_lifecycle.completed') audit.toolSummary[toolName].completed += 1;
  const toolCallId = stringOrUndefined(entry.toolCallId);
  const parsedArgs = parseMaybeJson(entry.argsSummary);
  if (entry.type === 'tool_lifecycle.started' && toolCallId !== undefined) {
    audit._startedToolArgs.set(toolCallId, parsedArgs);
  }
  const args = parsedArgs ?? (toolCallId === undefined ? undefined : audit._startedToolArgs.get(toolCallId));
  const outputSummary = stringOrUndefined(entry.outputSummary);
  const aitpBridge = extractAitpBridgeMetadata(args, outputSummary);
  const record = {
    agentId,
    toolName,
    status: stringOrUndefined(entry.status),
    isError: entry.isError === true,
    toolCallId,
    action: typeof args?.action === 'string' ? args.action : undefined,
    aitpOperation: aitpBridge.operation,
    aitpTopic: aitpBridge.topicId,
    aitpRunId: aitpBridge.runId,
    argsSummary: truncate(redactSecrets(entry.argsSummary ?? '')),
    outputSummary: truncate(redactSecrets(outputSummary ?? '')),
  };
  audit.toolCalls.push(record);
  if (entry.type === 'tool_lifecycle.completed') {
    pushTimeline(audit, {
      kind: 'tool_lifecycle_completed',
      agentId,
      turnId: turnIdOrUndefined(entry.turnId),
      step: Number.isFinite(entry.step) ? entry.step : undefined,
      toolName,
      toolCallId,
      action: record.action,
      aitpOperation: record.aitpOperation,
      aitpTopic: record.aitpTopic,
      aitpRunId: record.aitpRunId,
      status: record.status,
      isError: record.isError,
      outputSummary: record.outputSummary,
    });
  }

  if (entry.type === 'tool_lifecycle.completed' && (entry.status === 'failed' || entry.isError === true)) {
    audit.toolSummary[toolName].failed += 1;
    audit.failures.push({
      severity: 'error',
      kind: 'tool_failed',
      agentId,
      toolName,
      action: record.action,
      output: record.outputSummary,
    });
  }

  if (toolName === 'ResearchAction' && entry.type === 'tool_lifecycle.completed') {
    scanResearchActionCompletion(audit, args, outputSummary, entry);
  }
  if (toolName === 'ResearchLedger' && entry.type === 'tool_lifecycle.completed') {
    scanResearchLedgerCompletion(audit, args, outputSummary, entry);
  }
}

function scanResearchActionCompletion(audit, args, outputSummary, entry) {
  const action = typeof args?.action === 'string' ? args.action : undefined;
  const ok = entry.status === 'passed' && entry.isError !== true;
  if (action === 'open_work_frame' && ok && outputSummary?.includes('<work_frame')) {
    audit.research.workFrameOpened = true;
    const id = matchXmlAttr(outputSummary, 'id');
    if (id !== undefined) audit.research.workFrameIds.push(id);
  }
  if (action === 'compile_context_pack' && ok && outputSummary?.includes('<context_pack')) {
    audit.research.contextPackCompiled = true;
  }
  if (action === 'record_action_result' && ok) {
    audit.research.researchActionResults.push({
      actionId: typeof args?.action_id === 'string' ? args.action_id : undefined,
      output: truncate(redactSecrets(outputSummary ?? '')),
    });
  }
  if (action === 'execute_aitp_write_bridge') {
    const bridge = extractAitpBridgeMetadata(args, outputSummary);
    audit.research.aitpWriteBridgeCalls.push({
      operation: bridge.operation,
      topicId: bridge.topicId,
      runId: bridge.runId,
      payloadFields: bridge.payloadFields,
      status: stringOrUndefined(entry.status),
      isError: entry.isError === true,
      ok,
      output: truncate(redactSecrets(outputSummary ?? '')),
    });
  }
}

function scanResearchLedgerCompletion(audit, args, outputSummary, entry) {
  const action = typeof args?.action === 'string' ? args.action : undefined;
  const hasWriteOutput = outputSummary?.includes('<research_ledger_write') === true;
  if (((action === 'write_event' || action === 'capture_event') || hasWriteOutput) && entry.status === 'passed') {
    audit.research.ledgerWrites.push({
      topic: typeof args?.topic === 'string' ? args.topic : matchXmlAttr(outputSummary ?? '', 'topic'),
      type: typeof args?.type === 'string' ? args.type : typeof args?.capture_class === 'string' ? args.capture_class : matchXmlAttr(outputSummary ?? '', 'type'),
      eventId: matchXmlAttr(outputSummary ?? '', 'event_id'),
      path: matchXmlTag(outputSummary ?? '', 'path'),
    });
  }
}

function scanLoopEvent(audit, agentId, event) {
  if (!event || typeof event !== 'object') return;
  const turnId = stringOrUndefined(event.turnId);
  const step = Number.isFinite(event.step) ? event.step : undefined;
  if (event.type === 'content.part') {
    const part = event.part;
    if (part?.type === 'think') {
      if (typeof event.uuid === 'string' && audit._reasoningAuditPartUuids.has(event.uuid)) {
        return;
      }
      const text = typeof part.think === 'string' ? part.think : typeof part.text === 'string' ? part.text : '';
      audit.privateReasoning.parts += 1;
      audit.privateReasoning.chars += text.length;
      const block = {
        agentId,
        turnId,
        step,
        partUuid: stringOrUndefined(event.uuid),
        chars: text.length,
        redacted: true,
        cues: classifyReasoningCues(text),
        source: 'content.part',
      };
      audit.reasoningBlocks.push(block);
      pushTimeline(audit, {
        kind: 'reasoning',
        agentId,
        turnId,
        step,
        partUuid: stringOrUndefined(event.uuid),
        chars: text.length,
        cues: block.cues,
        redacted: true,
        source: 'content.part',
      });
      return;
    }
    if (part?.type === 'text' && typeof part.text === 'string') {
      const text = truncate(redactSecrets(part.text));
      audit.assistantTexts.push(text);
      const item = {
        role: 'assistant',
        kind: 'text',
        agentId,
        turnId,
        step,
        text,
      };
      audit.visibleTranscript.push(item);
      pushTimeline(audit, {
        kind: 'assistant_text',
        agentId,
        turnId,
        step,
        text,
      });
    }
  }
  if (event.type === 'tool.call') {
    const argsSummary = truncate(redactSecrets(JSON.stringify(event.args ?? {})));
    const toolName = stringOrUndefined(event.name) ?? 'unknown';
    const toolCallId = stringOrUndefined(event.toolCallId);
    const action = typeof event.args?.action === 'string' ? event.args.action : undefined;
    audit.toolCalls.push({
      agentId,
      toolName,
      status: 'called',
      toolCallId,
      action,
      argsSummary,
      outputSummary: '',
    });
    const item = {
      role: 'tool_call',
      agentId,
      turnId,
      step,
      toolName,
      toolCallId,
      action,
      argsSummary,
    };
    audit.visibleTranscript.push(item);
    pushTimeline(audit, {
      kind: 'tool_call',
      agentId,
      turnId,
      step,
      toolName,
      toolCallId,
      action,
      argsSummary,
    });
  }
  if (event.type === 'tool.result') {
    const outputSummary = truncate(redactSecrets(JSON.stringify(event.result ?? {})));
    const toolCallId = stringOrUndefined(event.toolCallId);
    const isError = event.result?.isError === true;
    audit.toolCalls.push({
      agentId,
      toolName: 'tool.result',
      status: 'result',
      toolCallId,
      action: undefined,
      argsSummary: '',
      outputSummary,
    });
    const item = {
      role: 'tool_result',
      agentId,
      turnId,
      toolCallId,
      isError,
      outputSummary,
    };
    audit.visibleTranscript.push(item);
    pushTimeline(audit, {
      kind: 'tool_result',
      agentId,
      turnId,
      step,
      toolCallId,
      isError,
      outputSummary,
    });
  }
}

function pushTimeline(audit, event) {
  audit.timeline.push({
    sequence: audit._sequence,
    ...event,
  });
  audit._sequence += 1;
}

function finalizeReasoningBehavior(audit) {
  const turnMap = new Map();
  for (const block of audit.reasoningBlocks) {
    const key = `${block.agentId}:${block.turnId ?? 'unknown'}`;
    const turn = turnMap.get(key) ?? {
      agentId: block.agentId,
      turnId: block.turnId,
      parts: 0,
      chars: 0,
      cues: {},
    };
    turn.parts += 1;
    turn.chars += block.chars;
    for (const cue of block.cues ?? []) {
      turn.cues[cue] = (turn.cues[cue] ?? 0) + 1;
    }
    turnMap.set(key, turn);
  }

  audit.reasoningBehavior.turns = [...turnMap.values()]
    .map((turn) => ({
      ...turn,
      cues: Object.entries(turn.cues)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cue, count]) => ({ cue, count })),
    }))
    .sort(compareTurnLike);
  audit.reasoningBehavior.turnCount = audit.reasoningBehavior.turns.length;
  audit.reasoningBehavior.ledToolCalls = findReasoningLedToolCalls(audit.timeline);
  audit.reasoningBehavior.repeatedAfterReasoningFailures = summarizeRepeatedAfterReasoningFailures(audit.reasoningBehavior.ledToolCalls);
}

function findReasoningLedToolCalls(timeline) {
  const result = [];
  for (let i = 0; i < timeline.length; i += 1) {
    const event = timeline[i];
    if (event?.kind !== 'reasoning') continue;
    const nextTools = findToolsBeforeNextReasoning(timeline, i);
    for (const next of nextTools) {
      const resultEvent = next.toolCallId === undefined
        ? undefined
        : findNextTimelineEvent(timeline, next.timelineIndex, (candidate) =>
            (candidate.kind === 'tool_lifecycle_completed' || candidate.kind === 'tool_result') && candidate.toolCallId === next.toolCallId
          );
      result.push({
        agentId: event.agentId,
        turnId: event.turnId,
        reasoningStep: event.step,
        reasoningChars: event.chars,
        reasoningCues: event.cues ?? [],
        toolName: next.toolName,
        action: next.action,
        toolCallId: next.toolCallId,
        visibleBridge: next.visibleBridge,
        argsSummary: next.argsSummary,
        resultError: resultEvent?.isError === true || resultEvent?.status === 'failed',
        resultSummary: resultEvent?.outputSummary,
      });
    }
  }
  return result;
}

function findToolsBeforeNextReasoning(timeline, startIndex) {
  const origin = timeline[startIndex];
  const result = [];
  let visibleBridge;
  for (let i = startIndex + 1; i < timeline.length; i += 1) {
    const candidate = timeline[i];
    if (candidate.agentId !== origin.agentId) continue;
    if (candidate.turnId !== origin.turnId) continue;
    if (candidate.kind === 'reasoning') return result;
    if (candidate.kind === 'assistant_text') {
      visibleBridge ??= singleLine(candidate.text ?? '').slice(0, 240);
      continue;
    }
    if (candidate.kind === 'tool_call') {
      result.push({ ...candidate, visibleBridge, timelineIndex: i });
    }
  }
  return result;
}

function findNextTimelineEvent(timeline, startIndex, predicate) {
  const origin = timeline[startIndex];
  for (let i = startIndex + 1; i < timeline.length; i += 1) {
    const candidate = timeline[i];
    if (candidate.agentId !== origin.agentId) continue;
    if (candidate.turnId !== origin.turnId) continue;
    if (predicate(candidate)) return candidate;
  }
  return undefined;
}

function summarizeRepeatedAfterReasoningFailures(ledToolCalls) {
  const counts = new Map();
  for (const call of ledToolCalls) {
    if (!call.resultError) continue;
    const key = `${call.toolName}${call.action ? `/${call.action}` : ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count || a.target.localeCompare(b.target));
}

function classifyReasoningCues(text) {
  const lower = text.toLowerCase();
  const cues = [];
  const checks = [
    ['workframe', /workframe|work frame|工作框架/i],
    ['context_pack', /context\s*pack|compile_context_pack|上下文包/i],
    ['research_action', /researchaction|research action|科研动作|动作/i],
    ['research_ledger', /researchledger|research ledger|ledger|账本|记录/i],
    ['aitp', /aitp/i],
    ['search', /websearch|search|搜索|检索|文献/i],
    ['source', /source|arxiv|paper|论文|来源|文献/i],
    ['code', /code|python|script|simulation|代码|数值|模拟/i],
    ['validation', /validate|verify|check|test|验证|检查|核对/i],
    ['failure', /fail|failed|error|bug|missing|失败|错误|缺少|没有成功|返回空/i],
  ];
  for (const [cue, pattern] of checks) {
    if (pattern.test(lower)) cues.push(cue);
  }
  return cues;
}

function compareTurnLike(a, b) {
  const agentCompare = String(a.agentId ?? '').localeCompare(String(b.agentId ?? ''));
  if (agentCompare !== 0) return agentCompare;
  const aTurn = numericOrString(a.turnId);
  const bTurn = numericOrString(b.turnId);
  if (typeof aTurn === 'number' && typeof bTurn === 'number') return aTurn - bTurn;
  return String(a.turnId ?? '').localeCompare(String(b.turnId ?? ''));
}

function numericOrString(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  if (Number.isFinite(value)) return value;
  return String(value ?? '');
}

async function scanResearchFilesystem(workdir) {
  const hakimiLedgerRoot = join(workdir, '.hakimi', 'research-ledger');
  const aitpTopicsRoot = join(workdir, '.aitp', 'topics');
  const aitpRegistryRunsRoot = join(workdir, '.aitp', 'registry', 'research_runs');
  const result = {
    hakimiLedgerTopics: await listChildDirectories(hakimiLedgerRoot),
    aitpTopics: await listChildDirectories(aitpTopicsRoot),
    aitpResearchRuns: [],
    aitpResearchRunDetails: [],
  };
  const registryRuns = await scanAitpResearchRunFiles(aitpRegistryRunsRoot, {
    sourceRoot: 'registry/research_runs',
  });
  result.aitpResearchRuns.push(...registryRuns.paths);
  result.aitpResearchRunDetails.push(...registryRuns.details);
  for (const topic of result.aitpTopics) {
    const topicRuns = await scanAitpResearchRunFiles(join(aitpTopicsRoot, topic, 'runtime', 'research_runs'), {
      sourceRoot: `topics/${topic}/runtime/research_runs`,
      topicId: topic,
    });
    result.aitpResearchRuns.push(...topicRuns.paths);
    result.aitpResearchRunDetails.push(...topicRuns.details);
  }
  result.aitpResearchRuns = [...new Set(result.aitpResearchRuns)].sort();
  result.aitpResearchRunDetails.sort((a, b) =>
    String(a.topicId ?? '').localeCompare(String(b.topicId ?? '')) ||
    String(a.runId ?? '').localeCompare(String(b.runId ?? '')) ||
    a.path.localeCompare(b.path)
  );
  return result;
}

function evaluateExpectations(audit, options) {
  const expectations = [];
  for (const toolName of options.expectTools ?? []) {
    const completed = audit.toolSummary[toolName]?.completed ?? 0;
    expectations.push({
      name: `tool:${toolName}`,
      pass: completed > 0,
      detail: completed > 0 ? `${completed} completed call(s)` : 'no completed call found',
    });
  }
  for (const target of options.expectToolActions ?? []) {
    const successful = audit.toolCalls.filter((call) => isSuccessfulToolCall(call) && matchesToolTarget(call, target));
    expectations.push({
      name: `tool-action:${target}`,
      pass: successful.length > 0,
      detail: successful.length > 0
        ? `${successful.length} successful completed action(s)`
        : `successful actions found: ${audit.toolCalls.filter(isSuccessfulToolCall).map(formatToolTarget).join(', ') || '(none)'}`,
    });
  }
  for (const expectedText of options.expectVisibleTexts ?? []) {
    const haystack = visibleTextHaystack(audit).toLowerCase();
    const needle = expectedText.toLowerCase();
    const found = needle.length > 0 && haystack.includes(needle);
    expectations.push({
      name: `visible-text:${expectedText}`,
      pass: found,
      detail: found ? 'substring found in visible assistant/tool output' : 'substring not found',
    });
  }
  if (options.expectPrivateReasoning) {
    expectations.push({
      name: 'private-reasoning-present',
      pass: audit.privateReasoning.parts > 0,
      detail: audit.privateReasoning.parts > 0
        ? `${audit.privateReasoning.parts} redacted reasoning/think part(s)`
        : 'no reasoning/think part found in wire',
    });
  }
  for (const cue of options.expectReasoningCues ?? []) {
    const count = audit.reasoningBlocks.filter((block) => block.cues?.includes(cue)).length;
    expectations.push({
      name: `reasoning-cue:${cue}`,
      pass: count > 0,
      detail: count > 0 ? `${count} redacted reasoning block(s) with cue` : `available cues: ${availableReasoningCues(audit).join(', ') || '(none)'}`,
    });
  }
  for (const target of options.expectReasoningLedTools ?? []) {
    const found = audit.reasoningBehavior.ledToolCalls.filter((call) => matchesToolTarget(call, target));
    expectations.push({
      name: `reasoning-led-tool:${target}`,
      pass: found.length > 0,
      detail: found.length > 0
        ? `${found.length} reasoning-led call(s)`
        : `found: ${audit.reasoningBehavior.ledToolCalls.map(formatToolTarget).join(', ') || '(none)'}`,
    });
  }
  if (options.expectNoMissingWorkframe) {
    const count = Object.values(audit.autoCaptureSkipped['missing-workframe'] ?? {}).reduce((sum, n) => sum + n, 0);
    expectations.push({
      name: 'no-missing-workframe',
      pass: count === 0,
      detail: count === 0 ? 'no missing-workframe skips' : `${count} missing-workframe skip(s)`,
    });
  }
  if (options.expectNoPostWorkframeMissingWorkframe) {
    const skipped = findPostWorkframeMissingWorkframeSkips(audit);
    expectations.push({
      name: 'no-post-workframe-missing-workframe',
      pass: skipped.length === 0,
      detail: skipped.length === 0
        ? 'no missing-workframe skips after successful open_work_frame'
        : `${skipped.length} post-WorkFrame missing-workframe skip(s): ${skipped.map((item) => item.toolName ?? 'unknown').join(', ')}`,
    });
  }
  if (options.expectWorkframeOpened) {
    expectations.push({
      name: 'workframe-opened',
      pass: audit.research.workFrameOpened,
      detail: audit.research.workFrameOpened ? audit.research.workFrameIds.join(', ') : 'no successful open_work_frame lifecycle result',
    });
  }
  if (options.expectContextPack) {
    expectations.push({
      name: 'context-pack',
      pass: audit.research.contextPackCompiled,
      detail: audit.research.contextPackCompiled ? 'context pack compiled' : 'no successful compile_context_pack result',
    });
  }
  if (options.expectLedgerTopic !== undefined) {
    const found = audit.filesystem.hakimiLedgerTopics.includes(options.expectLedgerTopic);
    expectations.push({
      name: `ledger-topic:${options.expectLedgerTopic}`,
      pass: found,
      detail: found ? 'topic directory exists' : `found: ${audit.filesystem.hakimiLedgerTopics.join(', ') || '(none)'}`,
    });
  }
  if (options.expectAitpTopic !== undefined) {
    const found = audit.filesystem.aitpTopics.includes(options.expectAitpTopic);
    expectations.push({
      name: `aitp-topic:${options.expectAitpTopic}`,
      pass: found,
      detail: found ? 'AITP topic exists' : `found: ${audit.filesystem.aitpTopics.join(', ') || '(none)'}`,
    });
  }
  if (options.expectAutoresearchRun) {
    expectations.push({
      name: 'aitp-research-run',
      pass: audit.filesystem.aitpResearchRuns.length > 0 || audit.research.autoresearchEvents.length > 0,
      detail: audit.filesystem.aitpResearchRuns.length > 0
        ? `${audit.filesystem.aitpResearchRuns.length} research run file(s)`
        : `${audit.research.autoresearchEvents.length} autoresearch wire event(s)`,
    });
  }
  for (const operation of options.expectAitpWriteOperations ?? []) {
    const successful = audit.research.aitpWriteBridgeCalls.filter((call) => call.ok && call.operation === operation);
    expectations.push({
      name: `aitp-write-operation:${operation}`,
      pass: successful.length > 0,
      detail: successful.length > 0
        ? `${successful.length} successful bridge call(s)`
        : `bridge calls found: ${audit.research.aitpWriteBridgeCalls.map(formatAitpBridgeCall).join(', ') || '(none)'}`,
    });
  }
  for (const topic of options.expectAitpResearchRunTopics ?? []) {
    const matching = aitpResearchRunDetailsForTopic(audit, topic);
    expectations.push({
      name: `aitp-research-run-topic:${topic}`,
      pass: matching.length > 0,
      detail: matching.length > 0
        ? `${matching.length} research_run record(s) for topic`
        : `research_run topics found: ${formatTopicCounts(summarizeAitpResearchRunTopics(audit)) || '(none)'}`,
    });
  }
  for (const topic of options.expectFreshAitpResearchRunTopics ?? []) {
    const runWindow = parseRunWindow(audit.run);
    if (runWindow === undefined) {
      expectations.push({
        name: `fresh-aitp-research-run-topic:${topic}`,
        pass: false,
        detail: 'freshness requires harness run startedAt/finishedAt metadata',
      });
      continue;
    }
    const matching = aitpResearchRunDetailsForTopic(audit, topic).filter((detail) => isFreshDetail(detail, runWindow));
    expectations.push({
      name: `fresh-aitp-research-run-topic:${topic}`,
      pass: matching.length > 0,
      detail: matching.length > 0
        ? `${matching.length} fresh research_run record(s) for topic`
        : `no topic research_run mtime in ${new Date(runWindow.startedMs).toISOString()}..${new Date(runWindow.finishedMs).toISOString()}`,
    });
  }
  if (options.failOnToolError) {
    const failed = audit.failures.filter((failure) => failure.kind === 'tool_failed');
    expectations.push({
      name: 'no-tool-errors',
      pass: failed.length === 0,
      detail: failed.length === 0 ? 'no failed tool lifecycle records' : `${failed.length} failed tool lifecycle record(s)`,
    });
  }
  return expectations;
}

function availableReasoningCues(audit) {
  return [...new Set(audit.reasoningBlocks.flatMap((block) => block.cues ?? []))].sort();
}

function matchesToolTarget(call, target) {
  const [toolName, action] = String(target).split('/', 2);
  if (toolName !== call.toolName) return false;
  return action === undefined || action === '' || action === call.action;
}

function formatToolTarget(call) {
  return `${call.toolName}${call.action ? `/${call.action}` : ''}`;
}

function isSuccessfulToolCall(call) {
  return call.status === 'passed' && call.isError !== true;
}

function findPostWorkframeMissingWorkframeSkips(audit) {
  const firstOpen = audit.timeline.find((event) =>
    event.kind === 'tool_lifecycle_completed' &&
    event.toolName === 'ResearchAction' &&
    event.action === 'open_work_frame' &&
    event.status === 'passed' &&
    event.isError !== true
  );
  if (firstOpen === undefined) return [];
  return audit.timeline.filter((event) =>
    event.kind === 'auto_capture_skipped' &&
    event.reason === 'missing-workframe' &&
    event.sequence > firstOpen.sequence
  );
}

function formatAitpBridgeCall(call) {
  const target = `${call.operation ?? 'unknown'}${call.topicId ? `:${call.topicId}` : ''}`;
  return `${target} status=${call.status ?? 'unknown'}${call.isError ? ' error=true' : ''}`;
}

function aitpResearchRunDetailsForTopic(audit, topic) {
  return (audit.filesystem.aitpResearchRunDetails ?? [])
    .filter(isAitpResearchRunDetail)
    .filter((detail) => detail.topicId === topic);
}

function isAitpResearchRunDetail(detail) {
  if (detail.kind === 'research_run') return true;
  if (detail.runId === undefined || detail.eventId !== undefined) return false;
  return !String(detail.path ?? '').toLowerCase().includes('research_run_events');
}

function summarizeAitpResearchRunTopics(audit) {
  const counts = new Map();
  for (const detail of audit.filesystem.aitpResearchRunDetails ?? []) {
    if (!isAitpResearchRunDetail(detail)) continue;
    const topic = detail.topicId ?? '(unknown)';
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return counts;
}

function formatTopicCounts(counts) {
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topic, count]) => `${topic}=${count}`)
    .join(', ');
}

function parseRunWindow(run) {
  const startedMs = Date.parse(run?.startedAt ?? '');
  const finishedMs = Date.parse(run?.finishedAt ?? '');
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs)) return undefined;
  const toleranceMs = 5000;
  return {
    startedMs: startedMs - toleranceMs,
    finishedMs: finishedMs + toleranceMs,
  };
}

function isFreshDetail(detail, runWindow) {
  return Number.isFinite(detail.mtimeMs) && detail.mtimeMs >= runWindow.startedMs && detail.mtimeMs <= runWindow.finishedMs;
}

async function emitResult(result, options) {
  const json = JSON.stringify(result, null, 2);
  const markdown = renderMarkdown(result);
  const body = options.json ? json : markdown;
  if (options.out !== undefined) {
    const out = resolve(options.out);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, out.endsWith('.json') ? json : body, 'utf8');
  }
  console.log(body);
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push(`# Hakimi Real Session Audit`);
  lines.push('');
  lines.push(`- Status: ${audit.ok ? 'PASS' : 'FAIL'}`);
  lines.push(`- Session: \`${audit.session.id}\``);
  lines.push(`- Session dir: \`${audit.session.dir}\``);
  if (audit.session.workDir !== undefined) lines.push(`- Workdir: \`${audit.session.workDir}\``);
  if (audit.run !== undefined) {
    lines.push(`- Command: \`${audit.run.command} ${audit.run.args.join(' ')}\``);
    lines.push(`- Exit: \`${audit.run.exitCode}\`${audit.run.timedOut ? ' (timeout)' : ''}`);
  }
  lines.push(`- Private reasoning: ${audit.privateReasoning.parts} part(s), ${audit.privateReasoning.chars} char(s), redacted`);
  lines.push('');

  if (audit.run !== undefined) {
    lines.push(`## Terminal Stream Preview`);
    if (audit.run.streamJsonMessages?.length > 0) {
      for (const message of audit.run.streamJsonMessages.slice(-20)) {
        if (message.role === 'assistant') {
          lines.push(`- assistant${message.toolCalls?.length ? ` tool_calls=${message.toolCalls.map((tool) => tool.name).join(',')}` : ''}`);
          if (message.content) lines.push(`  ${singleLine(message.content).slice(0, 320)}`);
        } else if (message.role === 'tool') {
          lines.push(`- tool result id=${message.toolCallId ?? ''}: ${singleLine(message.content ?? '').slice(0, 320)}`);
        } else if (message.role === 'meta') {
          lines.push(`- meta ${message.type ?? ''}: ${singleLine(message.content ?? '').slice(0, 320)}`);
        }
      }
    }
    if (audit.run.stdoutPreview) {
      lines.push('- stdout preview:');
      appendCodeBlock(lines, audit.run.stdoutPreview);
    }
    if (audit.run.stderrPreview) {
      lines.push('- stderr preview:');
      appendCodeBlock(lines, audit.run.stderrPreview);
    }
    lines.push('');
  }

  if (audit.expectations.length > 0) {
    lines.push(`## Expectations`);
    for (const expectation of audit.expectations) {
      lines.push(`- ${expectation.pass ? 'PASS' : 'FAIL'} \`${expectation.name}\`: ${expectation.detail}`);
    }
    lines.push('');
  }

  lines.push(`## Tool Summary`);
  const tools = Object.entries(audit.toolSummary).sort(([a], [b]) => a.localeCompare(b));
  if (tools.length === 0) {
    lines.push('- No tool lifecycle records found.');
  } else {
    for (const [toolName, summary] of tools) {
      lines.push(`- \`${toolName}\`: started ${summary.started}, completed ${summary.completed}, failed ${summary.failed}`);
    }
  }
  lines.push('');

  lines.push(`## Research State`);
  lines.push(`- WorkFrame opened: ${audit.research.workFrameOpened ? 'yes' : 'no'}`);
  if (audit.research.workFrameIds.length > 0) lines.push(`- WorkFrame ids: ${audit.research.workFrameIds.map((id) => `\`${id}\``).join(', ')}`);
  lines.push(`- ContextPack compiled: ${audit.research.contextPackCompiled ? 'yes' : 'no'}`);
  lines.push(`- ResearchAction recorded results: ${audit.research.researchActionResults.length}`);
  lines.push(`- ResearchLedger writes: ${audit.research.ledgerWrites.length}`);
  const aitpBridgePassed = audit.research.aitpWriteBridgeCalls.filter((call) => call.ok).length;
  const aitpBridgeFailed = audit.research.aitpWriteBridgeCalls.filter((call) => !call.ok).length;
  lines.push(`- AITP write bridge calls: ${audit.research.aitpWriteBridgeCalls.length} (passed ${aitpBridgePassed}, failed ${aitpBridgeFailed})`);
  lines.push(`- Hakimi ledger topics: ${audit.filesystem.hakimiLedgerTopics.map((topic) => `\`${topic}\``).join(', ') || '(none)'}`);
  lines.push(`- AITP topics: ${audit.filesystem.aitpTopics.map((topic) => `\`${topic}\``).join(', ') || '(none)'}`);
  lines.push(`- AITP research run files: ${audit.filesystem.aitpResearchRuns.length}`);
  lines.push(`- AITP research run topics: ${formatTopicCounts(summarizeAitpResearchRunTopics(audit)) || '(none)'}`);
  lines.push('');

  lines.push(`## AITP Write Bridge`);
  if (audit.research.aitpWriteBridgeCalls.length === 0) {
    lines.push('- No execute_aitp_write_bridge completions found.');
  } else {
    for (const call of audit.research.aitpWriteBridgeCalls.slice(-20)) {
      lines.push(`- \`${call.operation ?? 'unknown'}\`${call.topicId ? ` topic=\`${call.topicId}\`` : ''}${call.runId ? ` run=\`${call.runId}\`` : ''} status=${call.status ?? 'unknown'}${call.isError ? ' error=true' : ''}`);
      if (call.payloadFields?.length > 0) lines.push(`  payload fields: ${call.payloadFields.join(', ')}`);
      if (call.output) lines.push(`  output: ${singleLine(call.output).slice(0, 320)}`);
    }
  }
  lines.push('');

  lines.push(`## Visible Transcript`);
  if (audit.visibleTranscript.length === 0) {
    lines.push('- No reconstructed visible transcript events found.');
  } else {
    for (const item of audit.visibleTranscript.slice(-30)) {
      if (item.role === 'assistant') {
        lines.push(`- assistant${item.turnId !== undefined ? ` turn=${item.turnId}` : ''}${item.step !== undefined ? ` step=${item.step}` : ''}: ${singleLine(item.text ?? '').slice(0, 420)}`);
      } else if (item.role === 'tool_call') {
        lines.push(`- tool call \`${item.toolName}\`${item.action ? `/${item.action}` : ''} id=${item.toolCallId ?? ''}`);
        if (item.argsSummary) lines.push(`  args: ${singleLine(item.argsSummary).slice(0, 420)}`);
      } else if (item.role === 'tool_result') {
        lines.push(`- tool result id=${item.toolCallId ?? ''}${item.isError ? ' error=true' : ''}: ${singleLine(item.outputSummary ?? '').slice(0, 420)}`);
      }
    }
    if (audit.visibleTranscript.length > 30) lines.push(`- ... ${audit.visibleTranscript.length - 30} earlier transcript event(s) omitted`);
  }
  lines.push('');

  lines.push(`## Reasoning Trace`);
  if (audit.reasoningBlocks.length === 0) {
    lines.push('- No reasoning/think blocks found.');
  } else {
    for (const block of audit.reasoningBlocks.slice(-20)) {
      const cues = block.cues?.length ? ` cues=${block.cues.join(',')}` : '';
      lines.push(`- agent=${block.agentId}${block.turnId !== undefined ? ` turn=${block.turnId}` : ''}${block.step !== undefined ? ` step=${block.step}` : ''}: ${block.chars} char(s), redacted${cues}`);
    }
    if (audit.reasoningBlocks.length > 20) lines.push(`- ... ${audit.reasoningBlocks.length - 20} earlier reasoning block(s) omitted`);
  }
  lines.push('');

  lines.push(`## Reasoning Behavior`);
  lines.push(`- Reasoning turns: ${audit.reasoningBehavior.turnCount}`);
  lines.push(`- Reasoning-led tool calls: ${audit.reasoningBehavior.ledToolCalls.length}`);
  if (audit.reasoningBehavior.turns.length > 0) {
    lines.push('- Turn cue summary:');
    for (const turn of audit.reasoningBehavior.turns.slice(-12)) {
      const cues = turn.cues.map((item) => `${item.cue}=${item.count}`).join(', ') || '(none)';
      lines.push(`  - agent=${turn.agentId}${turn.turnId !== undefined ? ` turn=${turn.turnId}` : ''}: parts=${turn.parts}, chars=${turn.chars}, cues=${cues}`);
    }
  }
  if (audit.reasoningBehavior.ledToolCalls.length > 0) {
    lines.push('- Reasoning-led tools:');
    for (const call of audit.reasoningBehavior.ledToolCalls.slice(-20)) {
      const cues = call.reasoningCues.length ? ` cues=${call.reasoningCues.join(',')}` : '';
      lines.push(`  - turn=${call.turnId ?? ''} step=${call.reasoningStep ?? ''}: ${call.reasoningChars} char(s) -> \`${call.toolName}\`${call.action ? `/${call.action}` : ''}${call.resultError ? ' error=true' : ''}${cues}`);
      if (call.visibleBridge) lines.push(`    visible: ${call.visibleBridge}`);
      if (call.resultSummary) lines.push(`    result: ${singleLine(call.resultSummary).slice(0, 240)}`);
    }
  }
  if (audit.reasoningBehavior.repeatedAfterReasoningFailures.length > 0) {
    lines.push('- Repeated after-reasoning failures:');
    for (const item of audit.reasoningBehavior.repeatedAfterReasoningFailures) {
      lines.push(`  - \`${item.target}\`: ${item.count}`);
    }
  }
  lines.push('');

  lines.push(`## Auto-Capture Skips`);
  const skipReasons = Object.entries(audit.autoCaptureSkipped);
  if (skipReasons.length === 0) {
    lines.push('- None.');
  } else {
    for (const [reason, toolsByName] of skipReasons) {
      const details = Object.entries(toolsByName).map(([tool, count]) => `${tool}=${count}`).join(', ');
      lines.push(`- \`${reason}\`: ${details}`);
    }
  }
  lines.push('');

  lines.push(`## Failures`);
  if (audit.failures.length === 0) {
    lines.push('- None.');
  } else {
    for (const failure of audit.failures.slice(0, 30)) {
      lines.push(`- ${failure.severity} \`${failure.kind}\`${failure.toolName ? ` ${failure.toolName}` : ''}${failure.action ? `/${failure.action}` : ''}: ${failure.reason ?? failure.output ?? ''}`);
    }
    if (audit.failures.length > 30) lines.push(`- ... ${audit.failures.length - 30} more`);
  }
  lines.push('');

  lines.push(`## Recent Tool Calls`);
  for (const call of audit.toolCalls.filter((call) => call.status !== undefined && call.status !== 'called' && call.status !== 'result').slice(-20)) {
    const aitp = call.aitpOperation ? ` aitp=${call.aitpOperation}${call.aitpTopic ? `:${call.aitpTopic}` : ''}` : '';
    lines.push(`- \`${call.toolName}\`${call.action ? `/${call.action}` : ''} status=${call.status ?? 'unknown'} id=${call.toolCallId ?? ''}${aitp}`);
    if (call.outputSummary) lines.push(`  output: ${call.outputSummary.replace(/\r?\n/g, ' ').slice(0, 240)}`);
  }
  return `${lines.join('\n')}\n`;
}

async function resolvePrompt(options) {
  if (options.prompt !== undefined && options.promptFile !== undefined) {
    throw new Error('Use either --prompt or --prompt-file, not both');
  }
  if (options.prompt !== undefined) return options.prompt;
  if (options.promptFile !== undefined) return readFile(resolve(options.promptFile), 'utf8');
  throw new Error('run requires --prompt or --prompt-file');
}

function resolveHome(home) {
  return resolve(home ?? process.env.HAKIMI_HOME ?? join(homedir(), '.hakimi'));
}

function createHakimiAuditEnv(home, parentEnv = process.env) {
  return {
    ...parentEnv,
    HAKIMI_HOME: home,
    KIMI_CODE_EXPERIMENTAL_REASONING_AUDIT: '1',
  };
}

function defaultHakimiBin() {
  return process.platform === 'win32' ? 'hakimi.cmd' : 'hakimi';
}

function resolveHakimiCommand(hakimiBin) {
  if (hakimiBin !== undefined) {
    return { command: hakimiBin, prefixArgs: [] };
  }
  const localDist = resolve(SCRIPT_DIR, '..', 'apps', 'kimi-code', 'dist', 'main.mjs');
  if (existsSync(localDist)) {
    return { command: process.execPath, prefixArgs: [localDist] };
  }
  const globalDist = process.platform === 'win32'
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', '@bhjia-phys', 'hakimi', 'dist', 'main.mjs')
    : join(homedir(), '.npm-global', 'lib', 'node_modules', '@bhjia-phys', 'hakimi', 'dist', 'main.mjs');
  if (existsSync(globalDist)) {
    return { command: process.execPath, prefixArgs: [globalDist] };
  }
  return { command: defaultHakimiBin(), prefixArgs: [] };
}

function resolveRequiredPath(value, flag) {
  if (value === undefined) throw new Error(`${flag} is required`);
  return resolve(value);
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function resolveSessionLocation({ home, workdir, sessionId, sessionDir }) {
  if (sessionDir !== undefined) {
    const dir = resolve(sessionDir);
    const id = sessionId ?? dir.split(/[\\/]/).pop();
    const state = await readJsonIfExists(join(dir, 'state.json'));
    return { sessionId: id, sessionDir: dir, workDir: workdir ?? state?.workDir };
  }
  if (sessionId === undefined) {
    throw new Error('analyze requires --session or --session-dir');
  }
  const index = await readSessionIndexMap(home);
  const indexed = index.get(sessionId);
  if (indexed !== undefined) {
    if (workdir === undefined || resolve(indexed.workDir).toLowerCase() === resolve(workdir).toLowerCase()) {
      return indexed;
    }
  }
  const found = await scanForSessionDir(join(home, 'sessions'), sessionId);
  if (found !== undefined) {
    const state = await readJsonIfExists(join(found, 'state.json'));
    return { sessionId, sessionDir: found, workDir: workdir ?? state?.workDir };
  }
  throw new Error(`Session not found: ${sessionId}`);
}

async function findNewOrUpdatedSession(home, workdir, beforeIndex) {
  const after = await readSessionIndexMap(home);
  const workdirResolved = resolve(workdir).toLowerCase();
  const candidates = [...after.values()].filter((entry) => resolve(entry.workDir).toLowerCase() === workdirResolved);
  candidates.sort((a, b) => {
    const aNew = beforeIndex.has(a.sessionId) ? 0 : 1;
    const bNew = beforeIndex.has(b.sessionId) ? 0 : 1;
    if (aNew !== bNew) return bNew - aNew;
    return (b.updatedMs ?? 0) - (a.updatedMs ?? 0);
  });
  const candidate = candidates[0];
  if (candidate === undefined) throw new Error(`No Hakimi session found for ${workdir}`);
  return candidate;
}

async function readSessionIndexMap(home) {
  const path = join(home, 'session_index.jsonl');
  const sessionsDir = resolve(join(home, 'sessions'));
  const map = new Map();
  let raw = '';
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return map;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    try {
      const entry = JSON.parse(line);
      if (typeof entry.sessionId !== 'string' || typeof entry.sessionDir !== 'string' || typeof entry.workDir !== 'string') continue;
      if (!isAbsolute(entry.sessionDir) || !isAbsolute(entry.workDir)) continue;
      const sessionDir = resolve(entry.sessionDir);
      if (!isInside(sessionsDir, sessionDir)) continue;
      let updatedMs = 0;
      try {
        updatedMs = (await stat(sessionDir)).mtimeMs;
      } catch {
        // ignore
      }
      map.set(entry.sessionId, {
        sessionId: entry.sessionId,
        sessionDir,
        workDir: resolve(entry.workDir),
        updatedMs,
      });
    } catch {
      // ignore malformed index lines
    }
  }
  return map;
}

async function scanForSessionDir(root, sessionId) {
  let buckets;
  try {
    buckets = await readdir(root, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const candidate = join(root, bucket.name, sessionId);
    if (existsSync(join(candidate, 'state.json'))) return candidate;
  }
  return undefined;
}

async function readAgentWires(sessionDir) {
  const agentsDir = join(sessionDir, 'agents');
  let agents = [];
  try {
    agents = await readdir(agentsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const wires = [];
  for (const agent of agents) {
    if (!agent.isDirectory()) continue;
    const path = join(agentsDir, agent.name, 'wire.jsonl');
    const parsed = await readJsonl(path);
    wires.push({ agentId: agent.name, path, ...parsed });
  }
  return wires;
}

async function readJsonl(path) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return { records: [], malformed: 0 };
  }
  const records = [];
  let malformed = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      malformed += 1;
    }
  }
  return { records, malformed };
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
}

async function listChildDirectories(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function listMarkdownOrJsonFiles(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.(md|json|jsonl)$/i.test(entry.name))
      .map((entry) => join(path, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function scanAitpResearchRunFiles(path, context = {}) {
  const paths = await listMarkdownOrJsonFiles(path);
  const details = [];
  for (const filePath of paths) {
    details.push(...(await readAitpResearchRunDetails(filePath, context)));
  }
  return { paths, details };
}

async function readAitpResearchRunDetails(path, context = {}) {
  let fileStat;
  let raw;
  try {
    fileStat = await stat(path);
    raw = await readFile(path, 'utf8');
  } catch {
    return [];
  }

  const base = {
    path,
    sourceRoot: context.sourceRoot,
    mtimeMs: fileStat.mtimeMs,
    mtime: new Date(fileStat.mtimeMs).toISOString(),
  };
  const fallbackTopicId = context.topicId;
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('.jsonl')) {
    const details = [];
    let lineNumber = 0;
    for (const line of raw.split(/\r?\n/)) {
      lineNumber += 1;
      if (line.trim() === '') continue;
      try {
        const record = JSON.parse(line);
        details.push(detailFromAitpRecord(record, { ...base, lineNumber }, fallbackTopicId));
      } catch {
        // Ignore malformed JSONL rows; the file path still remains in aitpResearchRuns.
      }
    }
    return details;
  }
  if (lowerPath.endsWith('.json')) {
    const record = parseMaybeJson(raw);
    return record === undefined ? [] : [detailFromAitpRecord(record, base, fallbackTopicId)];
  }
  if (lowerPath.endsWith('.md')) {
    const record = parseMarkdownFrontMatterScalars(raw);
    return [detailFromAitpRecord(record, base, fallbackTopicId)];
  }
  return [];
}

function detailFromAitpRecord(record, base, fallbackTopicId) {
  const topicId = firstString(record?.topic_id, record?.topicId, fallbackTopicId);
  const runId = firstString(record?.run_id, record?.runId);
  const eventId = firstString(record?.event_id, record?.eventId);
  const kind = firstString(record?.kind);
  return {
    ...base,
    kind,
    topicId,
    runId,
    eventId,
  };
}

function parseMarkdownFrontMatterScalars(text) {
  const clean = String(text ?? '').replace(/^\uFEFF/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (match === null) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const lineMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (lineMatch === null) continue;
    const key = lineMatch[1];
    let value = lineMatch[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function parseResumeSessionId(output) {
  const match = output.match(/hakimi\s+--session\s+([A-Za-z0-9_.:-]+)/);
  return match?.[1];
}

function parseMaybeJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function matchXmlAttr(text, attr) {
  const pattern = new RegExp(`${escapeRegExp(attr)}="([^"]+)"`);
  return text.match(pattern)?.[1];
}

function matchXmlTag(text, tag) {
  const pattern = new RegExp(`<${escapeRegExp(tag)}>([^<]+)</${escapeRegExp(tag)}>`);
  return text.match(pattern)?.[1];
}

function extractAitpBridgeMetadata(args, outputSummary) {
  const payload = args?.aitp_payload && typeof args.aitp_payload === 'object' ? args.aitp_payload : undefined;
  return {
    operation: firstString(
      args?.aitp_operation,
      args?.aitpOperation,
      matchXmlAttr(outputSummary ?? '', 'operation'),
    ),
    topicId: firstString(
      payload?.topic_id,
      payload?.topicId,
      args?.topic_id,
      args?.topicId,
      matchXmlAttr(outputSummary ?? '', 'topic_id'),
      matchXmlAttr(outputSummary ?? '', 'topicId'),
      matchXmlTag(outputSummary ?? '', 'topic_id'),
    ),
    runId: firstString(
      payload?.run_id,
      payload?.runId,
      args?.run_id,
      args?.runId,
      matchXmlAttr(outputSummary ?? '', 'run_id'),
      matchXmlAttr(outputSummary ?? '', 'runId'),
      matchXmlTag(outputSummary ?? '', 'run_id'),
    ),
    payloadFields: payload === undefined ? [] : Object.keys(payload).sort(),
  };
}

function failExpectation(name, detail) {
  return { name, pass: false, detail };
}

function runForReport(run) {
  const promptIndex = run.args.indexOf('--prompt');
  return {
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    command: run.command,
    args: run.args.map((arg, index) => (promptIndex >= 0 && index === promptIndex + 1 ? '<prompt-redacted>' : arg)),
    exitCode: run.exitCode,
    signal: run.signal,
    timedOut: run.timedOut,
    timeoutMs: run.timeoutMs,
    streamJsonMessages: parsePromptStreamJson(run.stdout),
    stdoutPreview: truncate(redactSecrets(run.stdout)),
    stderrPreview: truncate(redactSecrets(run.stderr)),
  };
}

function visibleTextHaystack(audit) {
  return [
    ...audit.assistantTexts,
    ...audit.toolCalls.flatMap((call) => [call.argsSummary, call.outputSummary]),
    ...audit.visibleTranscript.flatMap((item) => [item.text, item.argsSummary, item.outputSummary]),
  ].filter((value) => typeof value === 'string').join('\n');
}

function parsePromptStreamJson(stdout) {
  const messages = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    try {
      const parsed = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object') continue;
      if (parsed.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: typeof parsed.content === 'string' ? truncate(redactSecrets(parsed.content)) : undefined,
          toolCalls: Array.isArray(parsed.tool_calls)
            ? parsed.tool_calls.map((toolCall) => ({
                id: stringOrUndefined(toolCall?.id),
                name: stringOrUndefined(toolCall?.function?.name) ?? 'unknown',
                arguments: truncate(redactSecrets(String(toolCall?.function?.arguments ?? ''))),
              }))
            : undefined,
        });
      } else if (parsed.role === 'tool') {
        messages.push({
          role: 'tool',
          toolCallId: stringOrUndefined(parsed.tool_call_id),
          content: typeof parsed.content === 'string' ? truncate(redactSecrets(parsed.content)) : undefined,
        });
      } else if (parsed.role === 'meta') {
        messages.push({
          role: 'meta',
          type: stringOrUndefined(parsed.type),
          content: typeof parsed.content === 'string' ? truncate(redactSecrets(parsed.content)) : undefined,
        });
      }
    } catch {
      // Non-JSON lines are covered by stdoutPreview.
    }
  }
  return messages;
}

function appendCodeBlock(lines, text) {
  lines.push('```text');
  lines.push(String(text).replace(/```/g, '` ` `'));
  lines.push('```');
}

function singleLine(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function truncate(text) {
  if (typeof text !== 'string') return '';
  const clean = text.replace(/\u001b\[[0-9;]*m/g, '');
  return clean.length <= MAX_INLINE ? clean : `${clean.slice(0, MAX_INLINE)}...[truncated ${clean.length - MAX_INLINE} chars]`;
}

function redactSecrets(text) {
  return text
    .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"',\s)]+/gi, '$1=[redacted]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-[redacted]');
}

function stringOrUndefined(value) {
  return typeof value === 'string' ? value : undefined;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return undefined;
}

function turnIdOrUndefined(value) {
  if (typeof value === 'string') return value;
  if (Number.isFinite(value)) return String(value);
  return undefined;
}

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export {
  analyzeOnly,
  analyzeSession,
  classifyReasoningCues,
  createHakimiAuditEnv,
  evaluateExpectations,
  parseCli,
  parsePromptStreamJson,
  renderMarkdown,
  runAndAnalyze,
};
