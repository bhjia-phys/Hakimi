import type {
  ResearchCommand,
  ResearchModeSnapshot,
} from '../api/types';

/**
 * `/research` slash grammar — minimal memory-mode toggle.
 *
 * Only `on` / `off` / `status` (and the bare toggle) remain. The legacy host
 * Research executor subcommands (pause/resume/manage/align/line/question
 * actions/checkpoints) parse to `unsupported` so the caller can explain the
 * retirement instead of posting a command the server rejects with
 * `research.retired`. Historical records stay read-only and never resume.
 */

export type ResearchComposerEntryState = 'hidden' | 'start' | 'stop';

export function researchComposerEntryState(
  researchEnabled: boolean,
  enabled: boolean | null | undefined,
): ResearchComposerEntryState {
  if (!researchEnabled) return 'hidden';
  return enabled === true ? 'stop' : 'start';
}

export type ResearchEnterRejectedReason =
  | 'disabled'
  | 'snapshot_unavailable';

export type ResearchEnterResult =
  | { kind: 'entered'; snapshot: ResearchModeSnapshot }
  | { kind: 'already-active'; snapshot: ResearchModeSnapshot }
  | { kind: 'ignored'; reason: 'pending' | 'session_changed' }
  | {
      kind: 'rejected';
      reason: ResearchEnterRejectedReason;
      clientReported?: true;
    };

export interface ResearchEnterRuntimeState {
  researchEnabled: boolean;
  activeSessionId?: string;
}

export interface RunResearchModeEnterOptions {
  sessionId?: string;
  pending: Set<string>;
  getState: () => ResearchEnterRuntimeState;
  refreshResearch: (sessionId: string) => Promise<ResearchModeSnapshot | null>;
  commandResearch: (
    sessionId: string,
    command: ResearchCommand,
  ) => Promise<ResearchModeSnapshot | null>;
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

  options.pending.add(sessionId);
  try {
    const refreshed = await options.refreshResearch(sessionId);
    if (refreshed === null) {
      state = options.getState();
      if (state.activeSessionId !== sessionId) {
        return { kind: 'ignored', reason: 'session_changed' };
      }
      if (!state.researchEnabled) return { kind: 'rejected', reason: 'disabled' };
      return { kind: 'rejected', reason: 'snapshot_unavailable' };
    }

    state = options.getState();
    if (state.activeSessionId !== sessionId) {
      return { kind: 'ignored', reason: 'session_changed' };
    }
    if (!state.researchEnabled) return { kind: 'rejected', reason: 'disabled' };
    if (refreshed.enabled) {
      return { kind: 'already-active', snapshot: refreshed };
    }

    const snapshot = await options.commandResearch(sessionId, {
      kind: 'enter_mode',
      actor: 'user',
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

/** Legacy executor subcommands: recognized, but explicitly unsupported. */
const RETIRED_SUBCOMMANDS = new Set([
  'pause',
  'resume',
  'manage',
  'align',
  'line',
  'edit',
  'focus',
  'defer',
  'block',
  'close',
  'reopen',
  'discard-checkpoint',
  'adopt-conclusion',
]);

const SUPPORTED_SUBCOMMANDS = new Set(['on', 'off', 'status']);

export type ResearchSlashErrorCode =
  | 'unknown_subcommand'
  | 'unexpected_arguments';

export type ParsedResearchSlashCommand =
  | { kind: 'toggle' }
  | { kind: 'status' }
  | { kind: 'on' }
  | { kind: 'off' }
  | { kind: 'unsupported'; subcommand: string }
  | { kind: 'error'; code: ResearchSlashErrorCode };

export function parseResearchSlashCommand(rawArgs: string): ParsedResearchSlashCommand {
  const args = rawArgs.trim();
  if (args.length === 0) return { kind: 'toggle' };

  const tokens = args.split(/\p{White_Space}+/u);
  const first = tokens[0] ?? '';

  if (SUPPORTED_SUBCOMMANDS.has(first)) {
    if (tokens.length === 1) return { kind: first as 'on' | 'off' | 'status' };
    return { kind: 'error', code: 'unexpected_arguments' };
  }

  if (RETIRED_SUBCOMMANDS.has(first)) {
    return { kind: 'unsupported', subcommand: first };
  }

  return { kind: 'error', code: 'unknown_subcommand' };
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
  send: () => Promise<ResearchModeSnapshot | null>,
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
