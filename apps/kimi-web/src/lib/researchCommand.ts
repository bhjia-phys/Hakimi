import type {
  ResearchCommand,
  ResearchStatusSnapshot,
} from '../api/types';

export type ResearchComposerEntryState = 'hidden' | 'start' | 'manage';

export function researchComposerEntryState(
  researchEnabled: boolean,
  mode: ResearchStatusSnapshot['mode'] | null | undefined,
): ResearchComposerEntryState {
  if (!researchEnabled) return 'hidden';
  return mode === undefined || mode === null || mode === 'inactive' ? 'start' : 'manage';
}

export type ResearchEnterRejectedReason =
  | 'disabled'
  | 'busy'
  | 'plan_conflict'
  | 'snapshot_unavailable';

export type ResearchEnterResult =
  | { kind: 'entered'; snapshot: ResearchStatusSnapshot }
  | { kind: 'already-active'; snapshot: ResearchStatusSnapshot }
  | { kind: 'ignored'; reason: 'pending' | 'session_changed' }
  | {
      kind: 'rejected';
      reason: ResearchEnterRejectedReason;
      clientReported?: true;
    };

export interface ResearchEnterRuntimeState {
  researchEnabled: boolean;
  activeSessionId?: string;
  busy: boolean;
  planMode: boolean;
}

export interface RunResearchModeEnterOptions {
  sessionId?: string;
  lineSlug?: string;
  pending: Set<string>;
  getState: () => ResearchEnterRuntimeState;
  refreshResearch: (sessionId: string) => Promise<ResearchStatusSnapshot | null>;
  commandResearch: (
    sessionId: string,
    command: ResearchCommand,
  ) => Promise<ResearchStatusSnapshot | null>;
}

export async function runResearchModeEnter(
  options: RunResearchModeEnterOptions,
): Promise<ResearchEnterResult> {
  const sessionId = options.sessionId;
  if (sessionId === undefined) {
    return { kind: 'rejected', reason: 'snapshot_unavailable' };
  }

  let state = options.getState();
  if (state.activeSessionId !== sessionId) {
    return { kind: 'ignored', reason: 'session_changed' };
  }
  if (options.pending.has(sessionId)) {
    return { kind: 'ignored', reason: 'pending' };
  }
  if (!state.researchEnabled) return { kind: 'rejected', reason: 'disabled' };
  if (state.busy) return { kind: 'rejected', reason: 'busy' };
  if (state.planMode) return { kind: 'rejected', reason: 'plan_conflict' };

  options.pending.add(sessionId);
  try {
    const refreshed = await options.refreshResearch(sessionId);
    if (refreshed === null) {
      state = options.getState();
      if (state.activeSessionId !== sessionId) {
        return { kind: 'ignored', reason: 'session_changed' };
      }
      if (!state.researchEnabled) return { kind: 'rejected', reason: 'disabled' };
      if (state.busy) return { kind: 'rejected', reason: 'busy' };
      if (state.planMode) return { kind: 'rejected', reason: 'plan_conflict' };
      return { kind: 'rejected', reason: 'snapshot_unavailable' };
    }

    state = options.getState();
    if (state.activeSessionId !== sessionId) {
      return { kind: 'ignored', reason: 'session_changed' };
    }
    if (!state.researchEnabled) return { kind: 'rejected', reason: 'disabled' };
    if (state.busy) return { kind: 'rejected', reason: 'busy' };
    if (researchComposerEntryState(true, refreshed.mode) === 'manage') {
      return { kind: 'already-active', snapshot: refreshed };
    }
    if (state.planMode) return { kind: 'rejected', reason: 'plan_conflict' };

    const snapshot = await options.commandResearch(sessionId, {
      kind: 'enter_mode',
      actor: 'user',
      lineSlug: options.lineSlug,
    });
    return snapshot === null
      ? {
          kind: 'rejected',
          reason: 'snapshot_unavailable',
          clientReported: true,
        }
      : { kind: 'entered', snapshot };
  } finally {
    options.pending.delete(sessionId);
  }
}

export function planModeToggleResearchDecision(
  planMode: boolean,
  researchMode: ResearchStatusSnapshot['mode'] | null | undefined,
  researchPending: boolean,
): 'allow' | 'plan_conflict' {
  if (planMode) return 'allow';
  return researchPending
    || researchComposerEntryState(true, researchMode) === 'manage'
    ? 'plan_conflict'
    : 'allow';
}

const MAX_FREE_TEXT_LENGTH = 2000;
const CONTROL_SUBCOMMANDS = new Set([
  'on',
  'off',
  'status',
  'pause',
  'resume',
  'manage',
]);
const QUESTION_SUBCOMMANDS = new Set([
  'edit',
  'focus',
  'defer',
  'block',
  'close',
  'reopen',
]);

export type ResearchSlashErrorCode =
  | 'unknown_subcommand'
  | 'unexpected_arguments'
  | 'missing_line'
  | 'missing_question'
  | 'missing_separator'
  | 'missing_text'
  | 'text_too_long';

export type ParsedResearchSlashCommand =
  | { kind: 'status' }
  | { kind: 'on'; lineSlug?: string }
  | { kind: 'off' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'manage' }
  | { kind: 'line'; lineSlug: string }
  | { kind: 'edit'; questionId: string; wording: string }
  | { kind: 'focus'; questionId: string; boundedAction: string }
  | {
      kind: 'defer' | 'block' | 'close' | 'reopen';
      questionId: string;
      reason?: string;
    }
  | { kind: 'error'; code: ResearchSlashErrorCode };

export function isResearchIdleOnlyBusy(
  working: boolean,
  compactionActive: boolean,
): boolean {
  return working || compactionActive;
}

export function researchSlashAllowedWhileBusy(
  parsed: ParsedResearchSlashCommand,
): boolean {
  return parsed.kind === 'status' || parsed.kind === 'pause' || parsed.kind === 'resume';
}

export function parseResearchSlashCommand(rawArgs: string): ParsedResearchSlashCommand {
  const args = rawArgs.trim();
  if (args.length === 0 || args === 'status') return { kind: 'status' };

  const tokens = args.split(/\p{White_Space}+/u);
  const first = tokens[0];

  if (first !== undefined && CONTROL_SUBCOMMANDS.has(first) && tokens.length === 1) {
    return { kind: first as 'on' | 'off' | 'pause' | 'resume' | 'manage' };
  }

  if (first === 'on') {
    if (tokens[1] !== '--') return { kind: 'error', code: 'unexpected_arguments' };
    const lineSlug = tokens.slice(2).join(' ').trim();
    return lineSlug.length === 0 ? { kind: 'on' } : { kind: 'on', lineSlug };
  }

  if (first === 'line') {
    const lineSlug = tokens.slice(1).join(' ').trim();
    return lineSlug.length === 0
      ? { kind: 'error', code: 'missing_line' }
      : { kind: 'line', lineSlug };
  }

  if (first !== undefined && QUESTION_SUBCOMMANDS.has(first)) {
    return parseQuestionCommand(first, tokens);
  }

  return { kind: 'error', code: 'unknown_subcommand' };
}

function parseQuestionCommand(
  subcommand: string,
  tokens: readonly string[],
): ParsedResearchSlashCommand {
  const separatorIndex = tokens.indexOf('--');
  if (separatorIndex !== -1 && separatorIndex !== 2) {
    return { kind: 'error', code: 'unexpected_arguments' };
  }

  const questionId = tokens[1];
  if (questionId === undefined) {
    return { kind: 'error', code: 'missing_question' };
  }

  if (subcommand === 'edit' || subcommand === 'focus') {
    if (separatorIndex === -1) {
      return tokens.length === 2
        ? { kind: 'error', code: 'missing_separator' }
        : { kind: 'error', code: 'unexpected_arguments' };
    }
    const text = tokens.slice(separatorIndex + 1).join(' ').trim();
    if (text.length === 0) return { kind: 'error', code: 'missing_text' };
    if (text.length > MAX_FREE_TEXT_LENGTH) {
      return { kind: 'error', code: 'text_too_long' };
    }
    return subcommand === 'edit'
      ? { kind: 'edit', questionId, wording: text }
      : { kind: 'focus', questionId, boundedAction: text };
  }

  if (separatorIndex === -1 && tokens.length !== 2) {
    return { kind: 'error', code: 'unexpected_arguments' };
  }
  const reason = separatorIndex === -1
    ? undefined
    : tokens.slice(separatorIndex + 1).join(' ').trim() || undefined;
  if (reason !== undefined && reason.length > MAX_FREE_TEXT_LENGTH) {
    return { kind: 'error', code: 'text_too_long' };
  }
  return {
    kind: subcommand as 'defer' | 'block' | 'close' | 'reopen',
    questionId,
    reason,
  };
}

export type ResearchSlashResolutionError =
  | 'snapshot_unavailable'
  | 'question_not_found'
  | 'line_not_found';

export function researchSlashNeedsSnapshot(parsed: ParsedResearchSlashCommand): boolean {
  switch (parsed.kind) {
    case 'pause':
    case 'resume':
    case 'line':
    case 'edit':
    case 'focus':
    case 'defer':
    case 'block':
    case 'close':
    case 'reopen':
      return true;
    case 'error':
    case 'manage':
    case 'off':
    case 'on':
    case 'status':
      return false;
  }
}

export function researchCommandResolutionError(
  parsed: ParsedResearchSlashCommand,
  snapshot: ResearchStatusSnapshot | null,
): ResearchSlashResolutionError | null {
  if (!researchSlashNeedsSnapshot(parsed)) return null;
  if (snapshot === null) return 'snapshot_unavailable';

  if (parsed.kind === 'line') {
    return snapshot.lines.some((line) => line.slug === parsed.lineSlug) ? null : 'line_not_found';
  }
  if (
    parsed.kind === 'edit' ||
    parsed.kind === 'focus' ||
    parsed.kind === 'defer' ||
    parsed.kind === 'block' ||
    parsed.kind === 'close' ||
    parsed.kind === 'reopen'
  ) {
    return snapshot.questions.some((question) => question.id === parsed.questionId)
      ? null
      : 'question_not_found';
  }
  return null;
}

export type ResearchSlashExecutionOutcome = 'handled' | 'rejected';

export function researchEnterSlashOutcome(
  result: ResearchEnterResult,
): ResearchSlashExecutionOutcome {
  if (result.kind === 'rejected') return 'rejected';
  return result.kind === 'ignored' && result.reason === 'session_changed'
    ? 'rejected'
    : 'handled';
}

export function researchSlashSessionIsCurrent(
  submittedSessionId: string | undefined,
  activeSessionId: string | undefined,
): submittedSessionId is string {
  return submittedSessionId !== undefined && submittedSessionId === activeSessionId;
}

export async function submitResearchSlashCommand(
  submittedSessionId: string,
  activeSessionId: () => string | undefined,
  send: () => Promise<ResearchStatusSnapshot | null>,
): Promise<ResearchSlashExecutionOutcome> {
  // Guard only before issuing the POST. Once the server accepted the request, a
  // later UI session switch must not turn a successful response into a rejected
  // command and restore input that would repeat the mutation.
  if (!researchSlashSessionIsCurrent(submittedSessionId, activeSessionId())) {
    return 'rejected';
  }
  return (await send()) === null ? 'rejected' : 'handled';
}

export function researchSlashInputToRestore(
  originalInput: string,
  outcome: ResearchSlashExecutionOutcome,
): string | null {
  return outcome === 'rejected' ? originalInput : null;
}

export function researchCommandFromSlash(
  parsed: ParsedResearchSlashCommand,
  snapshot: ResearchStatusSnapshot | null,
): ResearchCommand | null {
  if (researchCommandResolutionError(parsed, snapshot) !== null) return null;

  switch (parsed.kind) {
    case 'error':
    case 'status':
    case 'manage':
      return null;
    case 'on':
      return { kind: 'enter_mode', actor: 'user', lineSlug: parsed.lineSlug };
    case 'off':
      return { kind: 'exit_mode' };
    case 'pause':
      return { kind: 'pause_loop', expectedRevision: snapshot!.revision };
    case 'resume':
      return { kind: 'resume_loop', expectedRevision: snapshot!.revision };
    case 'line':
      return {
        kind: 'switch_line',
        lineSlug: parsed.lineSlug,
        expectedRevision: snapshot!.revision,
      };
    case 'edit': {
      const question = snapshot!.questions.find((item) => item.id === parsed.questionId)!;
      return {
        kind: 'update_question',
        questionId: parsed.questionId,
        expectedRevision: question.revision,
        wording: parsed.wording,
      };
    }
    case 'focus':
      return {
        kind: 'set_focus',
        questionId: parsed.questionId,
        expectedRevision: snapshot!.revision,
        boundedAction: parsed.boundedAction,
      };
    case 'defer':
    case 'block':
    case 'close':
    case 'reopen':
      return {
        kind: `${parsed.kind}_question`,
        questionId: parsed.questionId,
        expectedRevision: snapshot!.revision,
        reason: parsed.reason,
      };
  }
}
