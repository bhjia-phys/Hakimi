import type {
  AgentTranscriptSnapshot,
  TranscriptFrame,
  TranscriptOperation,
  TranscriptTask,
} from '@moonshot-ai/transcript';

import type { ApprovalRequest } from '../protocol/approval';
import { ErrorCode } from '../protocol/error-codes';
import type { Message, MessageContent } from '../protocol/message';
import { questionRequestSchema, type QuestionRequest } from '../protocol/question';
import type { PromptSubmission } from '../protocol/rest-prompt';
import type { SessionSnapshotResponse } from '../protocol/rest-snapshot';
import type { Session } from '../protocol/session';
import type { Task } from '../protocol/task';
import type { EventEnvelope } from '../transport/ws/v1/sessionEventJournal';

const REMOTE_OMITTED = '[details omitted]';
const REMOTE_MEDIA_OMITTED = '[media omitted]';
const OMIT = Symbol('remote-projection-omit');

/**
 * Keep remote error envelopes useful without exposing stack traces, provider
 * details, local paths, or route-specific opaque fields. Successful payloads
 * have their own typed projections and pass through unchanged.
 */
export function projectRemoteResponseEnvelope(payload: unknown): unknown {
  if (!isRecord(payload) || typeof payload['code'] !== 'number' || payload['code'] === 0) {
    return payload;
  }

  const data = projectRemoteStructuredValue(payload['data']);
  const message =
    payload['code'] === ErrorCode.INTERNAL_ERROR
      ? 'internal.error'
      : typeof payload['msg'] === 'string'
        ? redactRemoteErrorText(payload['msg'])
        : 'request.failed';
  return {
    code: payload['code'],
    msg: message,
    data: data ?? null,
    request_id: payload['request_id'],
  };
}

/** Remote prompt submissions carry user content only, never runtime overrides. */
export function projectRemotePromptSubmission(submission: PromptSubmission): PromptSubmission {
  return { content: submission.content };
}

const MEDIA_PART_TYPES = new Set([
  'image',
  'video',
  'file',
  'image_url',
  'video_url',
  'audio_url',
]);

const SENSITIVE_KEYS = new Set([
  'action',
  'after',
  'answers',
  'args',
  'attachment',
  'attachments',
  'attachmentid',
  'attachmentids',
  'audio',
  'audiourl',
  'base64',
  'before',
  'blob',
  'blobid',
  'blobref',
  'bloburl',
  'bytes',
  'chunk',
  'chunks',
  'command',
  'content',
  'cwd',
  'data',
  'detail',
  'details',
  'display',
  'error',
  'feedback',
  'file',
  'fileid',
  'files',
  'filepath',
  'fileurl',
  'image',
  'imageurl',
  'log',
  'logs',
  'media',
  'mediaurl',
  'newstring',
  'oldstring',
  'output',
  'outputbytes',
  'outputpreview',
  'outputtail',
  'path',
  'pid',
  'prompt',
  'resultsummary',
  'secret',
  'selectedlabel',
  'sourceurl',
  'stderr',
  'stdout',
  'token',
  'toolinput',
  'url',
  'video',
  'videourl',
]);

const DROPPED_REMOTE_EVENT_TYPES = new Set([
  'hook.result',
  'permission.approval.requested',
  'permission.approval.resolved',
  'shell.started',
  'shell.output',
  'shell.completed',
  'task.notified',
  'tool.call.delta',
  'tool.progress',
]);

const TASK_LIFECYCLE_EVENT_TYPES = new Set([
  'task.started',
  'task.terminated',
  'background.task.started',
  'background.task.terminated',
]);

const TOOL_EVENT_TYPES = new Set(['tool.call.started', 'tool.result']);

// Every remote WS frame must be explicitly admitted. These event producers
// have closed schemas and are projected again below; unknown/custom events are
// dropped rather than recursively guessing which fields may be sensitive.
const STRUCTURED_REMOTE_EVENT_TYPES = new Set([
  'turn.started',
  'turn.step.started',
  'turn.step.completed',
  'turn.step.retrying',
  'turn.step.interrupted',
  'turn.ended',
  'prompt.completed',
  'prompt.aborted',
  'agent.status.updated',
  'subagent.spawned',
  'subagent.started',
  'subagent.suspended',
  'subagent.completed',
  'subagent.failed',
  'error',
  'warning',
  'event.session.work_changed',
  'event.approval.resolved',
  'event.approval.expired',
  'event.question.answered',
  'event.question.dismissed',
]);

/** Project one Session onto the remote-safe bootstrap view. */
export function projectRemoteSession(session: Session): Session {
  return {
    ...session,
    // Session metadata is an open-ended record. Preserve only the inert cwd
    // marker required by the legacy wire schema; unknown keys are not safe.
    metadata: { cwd: '.' },
    agent_config: projectRemoteStructuredValue(
      session.agent_config,
    ) as typeof session.agent_config,
    permission_rules: session.permission_rules.map(
      (rule) => projectRemoteStructuredValue(rule) as (typeof session.permission_rules)[number],
    ),
  };
}

/** Project one Task onto fields needed by the remote status/stop UI. */
export function projectRemoteTask(task: Task): Task {
  return {
    id: task.id,
    session_id: task.session_id,
    kind: task.kind,
    description: projectRemoteTaskDescription(task.kind, task.description),
    status: task.status,
    created_at: task.created_at,
    started_at: task.started_at,
    completed_at: task.completed_at,
    agent_id: task.agent_id,
    subagent_type: task.subagent_type,
    parent_tool_call_id: task.parent_tool_call_id,
    run_in_background: task.run_in_background,
  };
}

/**
 * Project one v1 message onto the remote-share wire view. Media entities are
 * removed because their schema requires a URL, file id, or inline bytes; opaque
 * tool payloads are omitted instead of attempting to classify arbitrary input.
 */
export function projectRemoteMessage(message: Message): Message {
  const content: MessageContent[] = [];
  for (const part of message.content) {
    const projected = projectMessageContent(part);
    if (projected !== undefined) content.push(projected);
  }

  const metadata = projectRemoteStructuredValue(message.metadata);
  return {
    ...message,
    content,
    metadata: isRecord(metadata) ? metadata : undefined,
  };
}

/** Keep approval identity while replacing action and opaque input with safe labels. */
export function projectRemoteApproval(approval: ApprovalRequest): ApprovalRequest {
  return {
    ...approval,
    action: projectRemoteApprovalAction(approval.tool_name),
    tool_input_display: REMOTE_OMITTED,
  };
}

/** Keep only the closed question schema needed by the remote interaction UI. */
export function projectRemoteQuestion(question: QuestionRequest): QuestionRequest {
  return {
    question_id: question.question_id,
    session_id: question.session_id,
    turn_id: question.turn_id,
    tool_call_id: question.tool_call_id,
    questions: question.questions.map((item) => ({
      id: item.id,
      question: item.question,
      header: item.header,
      body: item.body,
      options: item.options.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
      })),
      multi_select: item.multi_select,
      allow_other: item.allow_other,
      other_label: item.other_label,
      other_description: item.other_description,
    })),
    created_at: question.created_at,
  };
}

/**
 * Remote snapshot projection. Besides messages, the snapshot contains a
 * session cwd, in-flight tool payloads, task previews, and interaction display
 * objects, all of which are response-boundary data and must be projected too.
 */
export function projectRemoteSnapshot(snapshot: SessionSnapshotResponse): SessionSnapshotResponse {
  return {
    ...snapshot,
    session: projectRemoteSession(snapshot.session),
    messages: {
      ...snapshot.messages,
      items: snapshot.messages.items.map(projectRemoteMessage),
    },
    in_flight_turn:
      snapshot.in_flight_turn === null
        ? null
        : {
            ...snapshot.in_flight_turn,
            running_tools: snapshot.in_flight_turn.running_tools.map((tool) => ({
              tool_call_id: tool.tool_call_id,
              name: tool.name,
              args: undefined,
              description: undefined,
              display: undefined,
              last_progress:
                tool.last_progress === undefined
                  ? undefined
                  : {
                      kind: tool.last_progress.kind,
                      text: undefined,
                      percent: tool.last_progress.percent,
                    },
            })),
          },
    subagents: snapshot.subagents?.map((task) => ({
      ...task,
      description: projectRemoteTaskDescription(task.kind, task.description),
      command: undefined,
      output_preview: undefined,
      output_bytes: undefined,
    })),
    pending_approvals: snapshot.pending_approvals.map(projectRemoteApproval),
    pending_questions: snapshot.pending_questions.map(projectRemoteQuestion),
  };
}

/**
 * Final per-connection remote projection for v1 WS envelopes. Returning
 * `undefined` drops events whose purpose is transporting output/progress.
 */
export function projectRemoteWsEnvelope(envelope: EventEnvelope): EventEnvelope | undefined {
  if (shouldDropRemoteEvent(envelope.type)) return undefined;

  if (envelope.type === 'transcript.ops') {
    return projectTranscriptOpsEnvelope(envelope);
  }
  if (envelope.type === 'transcript.reset') {
    return projectTranscriptResetEnvelope(envelope);
  }
  if (TASK_LIFECYCLE_EVENT_TYPES.has(envelope.type)) {
    return projectTaskLifecycleEnvelope(envelope);
  }
  if (TOOL_EVENT_TYPES.has(envelope.type)) {
    return projectToolEnvelope(envelope);
  }
  if (envelope.type === 'event.approval.requested') {
    return {
      ...envelope,
      payload: projectRemoteApprovalPayload(envelope.payload) ?? {},
    };
  }
  if (envelope.type === 'event.question.requested') {
    return {
      ...envelope,
      payload: projectRemoteQuestionPayload(envelope.payload) ?? {},
    };
  }

  // Assistant/thinking text is the core shared-session experience. Keep these
  // payloads byte-for-byte intact. Every other event must appear in the closed
  // allowlist above; unknown/custom events fail closed.
  if (envelope.type === 'assistant.delta' || envelope.type === 'thinking.delta') {
    return envelope;
  }
  if (!STRUCTURED_REMOTE_EVENT_TYPES.has(envelope.type)) return undefined;

  const payload = projectRemoteStructuredValue(envelope.payload);
  return { ...envelope, payload: payload ?? {} };
}

function projectMessageContent(part: MessageContent): MessageContent | undefined {
  switch (part.type) {
    case 'image':
    case 'video':
    case 'file':
      return undefined;
    case 'text':
      // Audio has no dedicated v1 MessageContent variant and is flattened by
      // messageProjection into this exact marker. Remove only that generated
      // transport reference; ordinary transcript text stays byte-for-byte.
      return /^\[audio:.+\]$/.test(part.text)
        ? { ...part, text: REMOTE_MEDIA_OMITTED }
        : part;
    case 'thinking':
      return part;
    case 'tool_use':
      return { ...part, input: REMOTE_OMITTED };
    case 'tool_result':
      return { ...part, output: REMOTE_OMITTED };
  }
}

function shouldDropRemoteEvent(type: string): boolean {
  if (DROPPED_REMOTE_EVENT_TYPES.has(type)) return true;
  return /^(?:background\.)?task\.(?:output|progress|log|chunk)(?:\.|$)/.test(type);
}

function projectTaskLifecycleEnvelope(envelope: EventEnvelope): EventEnvelope {
  const payload = asRecord(envelope.payload);
  const info = asRecord(payload['info']);
  const kind = stringValue(info['kind']);
  const description = stringValue(info['description']);
  const projectedInfo = {
    taskId: stringValue(info['taskId']),
    kind,
    status: stringValue(info['status']),
    description: projectRemoteTaskDescription(kind, description),
    detached: booleanValue(info['detached']),
    agentId: stringValue(info['agentId']),
  };

  return {
    ...envelope,
    payload: {
      type: stringValue(payload['type']) ?? envelope.type,
      agentId: stringValue(payload['agentId']),
      sessionId: stringValue(payload['sessionId']),
      info: projectedInfo,
    },
  };
}

function projectToolEnvelope(envelope: EventEnvelope): EventEnvelope {
  const payload = asRecord(envelope.payload);
  return {
    ...envelope,
    payload: {
      type: stringValue(payload['type']) ?? envelope.type,
      agentId: stringValue(payload['agentId']),
      sessionId: stringValue(payload['sessionId']),
      turnId: numberValue(payload['turnId']),
      toolCallId: stringValue(payload['toolCallId']),
      name: stringValue(payload['name']),
      isError: booleanValue(payload['isError']),
    },
  };
}

function projectTranscriptOpsEnvelope(envelope: EventEnvelope): EventEnvelope | undefined {
  const payload = asRecord(envelope.payload);
  const rawOps = payload['ops'];
  if (!Array.isArray(rawOps)) return undefined;

  const ops: TranscriptOperation[] = [];
  for (const candidate of rawOps) {
    const projected = projectTranscriptOperation(candidate as TranscriptOperation);
    if (projected !== undefined) ops.push(projected);
  }
  if (ops.length === 0) return undefined;

  return {
    ...envelope,
    payload: {
      type: 'transcript.ops',
      agent_id: stringValue(payload['agent_id']),
      seq: numberValue(payload['seq']),
      ops,
    },
  };
}

function projectTranscriptResetEnvelope(envelope: EventEnvelope): EventEnvelope | undefined {
  const payload = asRecord(envelope.payload);
  const snapshot = payload['snapshot'];
  if (!isRecord(snapshot)) return undefined;

  return {
    ...envelope,
    payload: {
      type: 'transcript.reset',
      agent_id: stringValue(payload['agent_id']),
      seq: numberValue(payload['seq']),
      has_more_older: booleanValue(payload['has_more_older']),
      snapshot: projectTranscriptSnapshot(snapshot as unknown as AgentTranscriptSnapshot),
    },
  };
}

function projectTranscriptOperation(op: TranscriptOperation): TranscriptOperation | undefined {
  switch (op.op) {
    case 'reset':
      return { ...op, snapshot: projectTranscriptSnapshot(op.snapshot) };
    case 'append':
    case 'attachment.upsert':
    case 'turn.upsert':
    case 'step.upsert':
    case 'marker.upsert':
    case 'todo.upsert':
    case 'meta.merge':
    case 'interaction.upsert':
      return undefined;
    case 'task.upsert':
      return { ...op, task: projectTranscriptTask(op.task) };
    case 'frame.upsert': {
      const frame = projectTranscriptFrame(op.frame);
      return frame === undefined ? undefined : { ...op, frame };
    }
    case 'prompt.upsert':
      return {
        ...op,
        prompt: {
          ...op.prompt,
          content: projectRemoteTranscriptValue(op.prompt.content),
        },
      };
    case 'taskref.upsert':
    case 'items.remove':
      return op;
  }
}

function projectTranscriptSnapshot(snapshot: AgentTranscriptSnapshot): AgentTranscriptSnapshot {
  return {
    items: [],
    tasks: snapshot.tasks.map(projectTranscriptTask),
    interactions: [],
    attachments: [],
    todos: [],
    prompts: snapshot.prompts.map((prompt) => ({
      ...prompt,
      content: projectRemoteTranscriptValue(prompt.content),
    })),
    meta: {} as AgentTranscriptSnapshot['meta'],
    hasMoreOlder: snapshot.hasMoreOlder,
  };
}

function projectRemoteApprovalPayload(value: unknown): unknown {
  if (!isRecord(value)) return undefined;

  const projected: Record<string, unknown> = {};
  for (const key of [
    'type',
    'approval_id',
    'session_id',
    'turn_id',
    'tool_call_id',
    'tool_name',
    'created_at',
    'expires_at',
    'toolCallId',
    'toolName',
  ]) {
    if (key in value) projected[key] = value[key];
  }
  if ('action' in value) projected['action'] = projectRemoteApprovalAction();
  if ('display' in value) projected['display'] = REMOTE_OMITTED;
  if ('tool_input_display' in value) projected['tool_input_display'] = REMOTE_OMITTED;
  return projected;
}

function projectRemoteQuestionPayload(value: unknown): unknown {
  const parsed = questionRequestSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return {
    type: isRecord(value) ? stringValue(value['type']) : undefined,
    ...projectRemoteQuestion(parsed.data),
  };
}

function projectTranscriptFrame(frame: TranscriptFrame): TranscriptFrame | undefined {
  switch (frame.kind) {
    case 'text':
      if (frame.taskId !== undefined) return undefined;
      return { ...frame, attachmentIds: undefined };
    case 'thinking':
      return frame;
    case 'tool':
      return {
        kind: 'tool',
        frameId: frame.frameId,
        toolCallId: frame.toolCallId,
        name: frame.name,
        view: frame.view,
        state: frame.state,
        taskId: frame.taskId,
        approvalId: frame.approvalId,
        todoId: frame.todoId,
        agentRefs: frame.agentRefs,
      };
    case 'notice':
      return { ...frame, detail: undefined };
  }
}

function projectTranscriptTask(task: TranscriptTask): TranscriptTask {
  return {
    taskId: task.taskId,
    kind: task.kind,
    state: task.state,
    detached: task.detached,
    description: projectRemoteTaskDescription(task.kind, task.description),
    agentId: task.agentId,
    outputTail: '',
    startedAt: task.startedAt,
    endedAt: task.endedAt,
  };
}

function projectRemoteTaskDescription(
  kind: string | undefined,
  description: string | undefined,
): string {
  return kind === 'bash' || kind === 'process' || kind === 'shell'
    ? 'Running shell task'
    : (description ?? 'Running task');
}

function projectRemoteApprovalAction(_toolName?: unknown): string {
  return 'Review tool request';
}

type RemoteTextProjection = 'structured' | 'transcript';

/** Remove structured local/media fields and textual media transport references. */
function projectRemoteStructuredValue(value: unknown): unknown {
  const projected = projectRemoteValueInner(value, 'structured');
  return projected === OMIT ? undefined : projected;
}

/** Remove structured fields while keeping user-visible transcript strings exact. */
function projectRemoteTranscriptValue(value: unknown): unknown {
  const projected = projectRemoteValueInner(value, 'transcript');
  return projected === OMIT ? undefined : projected;
}

function projectRemoteValueInner(value: unknown, textProjection: RemoteTextProjection): unknown {
  if (typeof value === 'string') {
    return textProjection === 'transcript' ? value : redactRemoteMediaText(value);
  }
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const projected = projectRemoteValueInner(item, textProjection);
      if (projected !== OMIT) out.push(projected);
    }
    return out;
  }

  if (!isRecord(value)) return OMIT;
  if (isMediaReferenceRecord(value)) return OMIT;

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    const projected = projectRemoteValueInner(entry, textProjection);
    if (projected !== OMIT) out[key] = projected;
  }
  return out;
}

function isMediaReferenceRecord(value: Readonly<Record<string, unknown>>): boolean {
  if (typeof value['type'] === 'string' && MEDIA_PART_TYPES.has(value['type'])) return true;
  const kind = value['kind'];
  return (
    (kind === 'url' || kind === 'file' || kind === 'base64') &&
    ('url' in value || 'file_id' in value || 'fileId' in value || 'data' in value)
  );
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, '');
  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.endsWith('args') ||
    normalized.endsWith('path') ||
    normalized.endsWith('cwd') ||
    normalized.endsWith('url') ||
    normalized.endsWith('fileid') ||
    normalized.endsWith('attachmentid') ||
    normalized.endsWith('blobid') ||
    normalized === 'directory' ||
    normalized === 'homedir' ||
    normalized === 'root' ||
    normalized === 'tempdir' ||
    normalized === 'workdir' ||
    normalized === 'workingdirectory' ||
    normalized === 'workspaceroot'
  );
}

/** Redact paths and URLs from error text before it crosses the remote edge. */
function redactRemoteErrorText(text: string): string {
  let redacted = redactRemoteMediaText(text);
  redacted = redacted.replaceAll(/\bhttps?:\/\/[^\s"'<>)}\]]+/gi, REMOTE_OMITTED);
  redacted = redacted.replaceAll(/(?:[A-Za-z]:\\|\\\\)[^\r\n"'<>)}\]]+/g, REMOTE_OMITTED);
  return redacted.replaceAll(/(?:~\/|\/)[^\r\n"'<>)}\]]+/g, REMOTE_OMITTED);
}

/** Redact media transport references from non-transcript structured text. */
function redactRemoteMediaText(text: string): string {
  let redacted = text.replaceAll(
    /\b(?:data|blobref|kimi-file|file):[^\s"'<>)}\]]+/gi,
    REMOTE_MEDIA_OMITTED,
  );
  redacted = redacted.replaceAll(
    /\bhttps?:\/\/[^\s"'<>)}\]]*(?:\/api\/v1\/files\/[^\s"'<>)}\]]+|\.(?:avif|bmp|gif|jpe?g|png|svg|webp|mp3|wav|ogg|mp4|mov|mpe?g|webm)(?:\?[^\s"'<>)}\]]*)?)/gi,
    REMOTE_MEDIA_OMITTED,
  );
  return redacted.replaceAll(
    /\b(?:file|f)_[A-Za-z0-9][A-Za-z0-9_-]{3,}\b/g,
    REMOTE_MEDIA_OMITTED,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
