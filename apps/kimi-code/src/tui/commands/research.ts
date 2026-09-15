/**
 * `/research` slash command — parser + handler.
 *
 * Research Mode is now only a lightweight toggle: it makes the official AITP
 * Skills visible and points at the local knowledge conventions (plain files
 * for knowledge, official AITP Skills + CLI for long-term memory). The legacy
 * host Research executor (lines, questions, plans, checkpoints, Goal
 * alignment, loop pause/resume) is retired: those subcommands parse to an
 * explicit `unsupported` result and are never sent to the server. Historical
 * records stay read-only and are never resurrected as live state.
 *
 * Grammar mirrors `/goal`: reserved subcommands are only honored as the first
 * token. On parse error the input is restored to the editor so hand-typed
 * text is not lost.
 */

import type {
  ResearchCommandResponse,
  ResearchModeSnapshot,
} from '@bhjia-phys/hakimi-sdk';

import type { ResearchRequestToken } from '../controllers/research-controller';
import { StatusMessageComponent } from '../components/messages/status-message';
import { formatErrorMessage } from '../utils/event-payload';
import { canRestoreSubmittedInput } from './resolve';
import type { SlashCommandHost } from './dispatch';

type ResearchCommandHost = Pick<
  SlashCommandHost,
  | 'state'
  | 'session'
  | 'requireSession'
  | 'showError'
  | 'showStatus'
  | 'track'
  | 'restoreInputText'
  | 'researchController'
>;

export type ParsedResearchCommand =
  | { readonly kind: 'toggle' }
  | { readonly kind: 'status' }
  | { readonly kind: 'on' }
  | { readonly kind: 'off' }
  | { readonly kind: 'unsupported'; readonly subcommand: string }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly severity?: 'error' | 'hint';
      readonly restoreInput?: boolean;
    };

const SUPPORTED_SUBCOMMANDS = new Set(['on', 'off', 'status']);

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

const USAGE =
  'Use `/research` (toggle), `/research on`, `/research off`, or `/research status`.';

/**
 * Parses the deterministic `/research` command grammar. Only `on` / `off` /
 * `status` (and the bare toggle) remain. Legacy executor subcommands parse to
 * `unsupported` so the handler can explain the retirement instead of sending
 * a mutation the server would reject with `research.retired`.
 */
export function parseResearchCommand(rawArgs: string): ParsedResearchCommand {
  const args = rawArgs.trim();
  if (args.length === 0) return { kind: 'toggle' };

  const tokens = args.split(/\s+/);
  const first = tokens[0] ?? '';

  if (SUPPORTED_SUBCOMMANDS.has(first)) {
    if (tokens.length === 1) return { kind: first as 'on' | 'off' | 'status' };
    return {
      kind: 'error',
      restoreInput: true,
      message: `Unexpected arguments after \`/research ${first}\`. ${USAGE}`,
    };
  }

  if (RETIRED_SUBCOMMANDS.has(first)) {
    return { kind: 'unsupported', subcommand: first };
  }

  return {
    kind: 'error',
    restoreInput: true,
    message: `Unknown /research subcommand: ${first}. ${USAGE}`,
  };
}

export async function handleResearchCommand(
  host: SlashCommandHost,
  args: string,
): Promise<void> {
  const parsed = parseResearchCommand(args);
  switch (parsed.kind) {
    case 'error':
      if (parsed.severity === 'hint') host.showStatus(parsed.message);
      else host.showError(parsed.message);
      if (parsed.restoreInput === true && canRestoreSubmittedInput(host))
        host.restoreInputText(`/research ${args}`);
      return;
    case 'unsupported':
      host.showStatus(
        `\`/research ${parsed.subcommand}\` is no longer supported: the host Research executor is retired. ` +
          'Historical records are preserved read-only and do not resume. ' +
          'Keep project knowledge in plain files; the official AITP Skills and their CLI maintain long-term research memory.',
      );
      if (canRestoreSubmittedInput(host)) host.restoreInputText(`/research ${args}`);
      return;
    case 'toggle':
      await toggleResearchMode(host);
      return;
    case 'status':
      await showResearchStatus(host);
      return;
    case 'on':
      await setResearchMode(host, true);
      return;
    case 'off':
      await setResearchMode(host, false);
      return;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function toggleResearchMode(host: SlashCommandHost): Promise<void> {
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  let snapshot: ResearchModeSnapshot;
  try {
    snapshot = await session.getResearch();
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(`Failed to read research status: ${formatErrorMessage(error)}`);
    return;
  }
  if (!host.researchController.applySnapshot(token, snapshot)) return;
  await setResearchMode(host, !snapshot.enabled);
}

async function showResearchStatus(host: SlashCommandHost): Promise<void> {
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  let snapshot: ResearchModeSnapshot;
  try {
    snapshot = await session.getResearch();
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(`Failed to read research status: ${formatErrorMessage(error)}`);
    return;
  }
  if (!host.researchController.applySnapshot(token, snapshot)) return;
  host.track('research_status', { enabled: snapshot.enabled });

  const lines = [
    `Research memory mode: ${snapshot.enabled ? 'on' : 'off'} · official AITP Skills: ${snapshot.skillsAvailable ? 'available' : 'unavailable'}`,
    'Knowledge lives in plain project files; long-term research memory is maintained by the official AITP Skills and their CLI.',
    'Legacy Research records (lines/questions/checkpoints) are preserved read-only; they are not live state and never resume automatically.',
  ];
  host.state.transcriptContainer.addChild(new StatusMessageComponent(lines.join('\n')));
  host.state.ui.requestRender();
}

async function setResearchMode(host: SlashCommandHost, enabled: boolean): Promise<void> {
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  try {
    const response = await session.commandResearch(
      enabled ? { kind: 'enter_mode', actor: 'user' } : { kind: 'exit_mode' },
    );
    if (!applyResearchResponse(host, token, response)) return;
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track(enabled ? 'research_on' : 'research_off');
  host.showStatus(
    enabled
      ? 'Research memory mode on — official AITP Skills are visible; knowledge stays in plain files.'
      : 'Research memory mode off.',
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isResearchRequestCurrent(
  host: ResearchCommandHost,
  token: ResearchRequestToken | undefined,
): boolean {
  if (token === undefined) return false;
  if (host.session !== undefined && host.session !== token.session) return false;
  const controller = host.researchController as {
    isCurrentRequest?: (request: ResearchRequestToken) => boolean;
  };
  return controller.isCurrentRequest?.(token) ?? true;
}

function beginResearchRequest(
  host: ResearchCommandHost,
  session: ReturnType<ResearchCommandHost['requireSession']>,
): ResearchRequestToken | undefined {
  return host.researchController.beginRequest(session);
}

function applyResearchResponse(
  host: ResearchCommandHost,
  token: ResearchRequestToken | undefined,
  response: ResearchCommandResponse,
): boolean {
  if (token === undefined) return false;
  // Delegate all snapshot state management (board, AppState, Todo slot)
  // to the controller so the state machine lives in one place.
  return host.researchController.applySnapshot(token, response.snapshot);
}
