/**
 * `/research` slash command — parser + handler.
 *
 * Grammar mirrors `/goal`: reserved subcommands are only honored as the first
 * token; free text after `--`. On parse error the input is restored to the
 * editor so hand-typed text is not lost.
 *
 * Mutating commands carry the current snapshot or selected item `revision` as
 * `expectedRevision` for optimistic concurrency, and on success update the
 * board from the returned `ResearchCommandResponse`.
 */

import {
  type PermissionMode,
  type ResearchCommand,
  type ResearchCommandResponse,
  type ResearchStatusSnapshot,
} from '@bhjia-phys/hakimi-sdk';

import {
  ResearchEditDialogComponent,
  ResearchLineEditDialogComponent,
  ResearchManagerComponent,
  type ResearchEditResult,
  type ResearchLineEditResult,
  type ResearchManagerAction,
} from '../components/dialogs/research-manager';
import type { ResearchRequestToken } from '../controllers/research-controller';
import {
  StartPermissionPromptComponent,
  type StartPermissionChoice,
} from '../components/dialogs/start-permission-prompt';
import { StatusMessageComponent } from '../components/messages/status-message';
import { formatErrorMessage } from '../utils/event-payload';
import { canRestoreSubmittedInput } from './resolve';
import type { SlashCommandHost } from './dispatch';
const MAX_REASON_LENGTH = 2000;

type ResearchCommandHost = Pick<
  SlashCommandHost,
  | 'state'
  | 'session'
  | 'requireSession'
  | 'setAppState'
  | 'showError'
  | 'showStatus'
  | 'showNotice'
  | 'track'
  | 'mountEditorReplacement'
  | 'restoreEditor'
  | 'restoreInputText'
  | 'sendNormalUserInput'
  | 'researchController'
>;

export type ParsedResearchCommand =
  | { readonly kind: 'status' }
  | { readonly kind: 'on'; readonly lineSlug?: string }
  | { readonly kind: 'off' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'manage' }
  | {
      readonly kind: 'edit';
      readonly questionId: string;
      readonly wording: string;
    }
  | {
      readonly kind: 'focus';
      readonly questionId: string;
      readonly boundedAction: string;
    }
  | {
      readonly kind: 'defer';
      readonly questionId: string;
      readonly reason?: string;
    }
  | {
      readonly kind: 'block';
      readonly questionId: string;
      readonly reason?: string;
    }
  | {
      readonly kind: 'close';
      readonly questionId: string;
      readonly reason?: string;
    }
  | {
      readonly kind: 'reopen';
      readonly questionId: string;
      readonly reason?: string;
    }
  | { readonly kind: 'line'; readonly slug: string }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly severity?: 'error' | 'hint';
      readonly restoreInput?: boolean;
    };

const CONTROL_SUBCOMMANDS = new Set([
  'on',
  'off',
  'pause',
  'resume',
  'manage',
  'status',
]);

const QUESTION_ACTION_SUBCOMMANDS = new Set([
  'edit',
  'focus',
  'defer',
  'block',
  'close',
  'reopen',
]);

/**
 * Parses the deterministic `/research` command grammar.
 *
 * Reserved subcommands (`on`/`off`/`pause`/`resume`/`manage`/`status`/`edit`/
 * `focus`/`defer`/`block`/`close`/`reopen`/`line`) are only honored as the
 * first token. Free text after `--` separates the subcommand arguments from
 * the user's free-form input (wording, bounded action, reason).
 */
export function parseResearchCommand(rawArgs: string): ParsedResearchCommand {
  const args = rawArgs.trim();
  if (args.length === 0 || args === 'status') return { kind: 'status' };

  const tokens = args.split(/\s+/);
  const first = tokens[0];

  if (first !== undefined && CONTROL_SUBCOMMANDS.has(first) && tokens.length === 1) {
    return { kind: first as 'on' | 'off' | 'pause' | 'resume' | 'manage' };
  }

  // `on` with optional `-- <line slug>`
  if (first === 'on') {
    let index = 1;
    let lineSlug: string | undefined;
    if (tokens[index] === '--') {
      index += 1;
      lineSlug = tokens.slice(index).join(' ').trim() || undefined;
    } else if (tokens.length > 1) {
      // `/research on garbage` — anything other than `--` after `on` is invalid.
      return {
        kind: 'error',
        restoreInput: true,
        message:
          'Unexpected arguments after `/research on`. Use `/research on` or `/research on -- <line slug>`.',
      };
    }
    return { kind: 'on', lineSlug };
  }

  // `line <slug>`
  if (first === 'line') {
    const slug = tokens.slice(1).join(' ').trim();
    if (slug.length === 0) {
      return {
        kind: 'error',
        severity: 'hint',
        message: 'Provide a line slug, e.g. `/research line my-line`.',
      };
    }
    return { kind: 'line', slug };
  }

  // Question-action subcommands: `<subcommand> <questionId> [-- <free text>]`
  if (first !== undefined && QUESTION_ACTION_SUBCOMMANDS.has(first)) {
    return parseQuestionAction(first, tokens);
  }

  // Unknown subcommand → error
  return {
    kind: 'error',
    restoreInput: true,
    message: `Unknown /research subcommand: ${first ?? ''}. Use \`/research status\`, \`/research on\`, \`/research off\`, \`/research pause\`, \`/research resume\`, \`/research manage\`, or \`/research <edit|focus|defer|block|close|reopen> <questionId> -- <text>\`.`,
  };
}

function parseQuestionAction(
  subcommand: string,
  tokens: readonly string[],
): ParsedResearchCommand {
  if (tokens.length < 2 || tokens[1] === '--') {
    return {
      kind: 'error',
      severity: 'hint',
      restoreInput: true,
      message: `Provide a question ID, e.g. \`/research ${subcommand} <questionId>\`.`,
    };
  }

  const questionId = tokens[1]!;
  const separatorIndex = tokens.indexOf('--', 2);
  if (separatorIndex !== -1 && separatorIndex !== 2) {
    return {
      kind: 'error',
      restoreInput: true,
      message: `Put \`--\` immediately after the question ID: \`/research ${subcommand} ${questionId} -- <text>\`.`,
    };
  }

  // For edit/focus: `--` and free text are required
  if (subcommand === 'edit' || subcommand === 'focus') {
    if (separatorIndex === -1) {
      return {
        kind: 'error',
        restoreInput: true,
        message: `Use \`/research ${subcommand} ${questionId} -- <text>\` to provide the ${subcommand === 'edit' ? 'new wording' : 'bounded action'}.`,
      };
    }
    const freeText = tokens.slice(separatorIndex + 1).join(' ').trim();
    if (freeText.length === 0) {
      return {
        kind: 'error',
        restoreInput: true,
        message: `Provide text after \`--\`, e.g. \`/research ${subcommand} ${questionId} -- <text>\`.`,
      };
    }
    if (freeText.length > MAX_REASON_LENGTH) {
      return {
        kind: 'error',
        restoreInput: true,
        message: `Text is too long (max ${MAX_REASON_LENGTH} characters). Put long content in a file and reference the file path.`,
      };
    }
    if (subcommand === 'edit') {
      return { kind: 'edit', questionId, wording: freeText };
    }
    return { kind: 'focus', questionId, boundedAction: freeText };
  }

  // For defer/block/close/reopen: reason is optional, but without `--` the
  // command must stop after the question ID.
  if (separatorIndex === -1 && tokens.length !== 2) {
    return {
      kind: 'error',
      restoreInput: true,
      message: `Use \`/research ${subcommand} ${questionId} -- <reason>\` for a reason, or omit the reason entirely.`,
    };
  }

  let reason: string | undefined;
  if (separatorIndex !== -1) {
    reason = tokens.slice(separatorIndex + 1).join(' ').trim() || undefined;
    if (reason !== undefined && reason.length > MAX_REASON_LENGTH) {
      return {
        kind: 'error',
        restoreInput: true,
        message: `Reason is too long (max ${MAX_REASON_LENGTH} characters).`,
      };
    }
  }

  return {
    kind: subcommand as 'defer' | 'block' | 'close' | 'reopen',
    questionId,
    reason,
  } as ParsedResearchCommand;
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
    case 'status':
      await showResearchStatus(host);
      return;
    case 'on':
      await enterResearchMode(host, parsed.lineSlug);
      return;
    case 'off':
      await exitResearchMode(host);
      return;
    case 'pause':
      await pauseResearchLoop(host);
      return;
    case 'resume':
      await resumeResearchLoop(host);
      return;
    case 'manage':
      await showResearchManager(host);
      return;
    case 'edit':
      await showResearchEditDialog(host, parsed.questionId, parsed.wording);
      return;
    case 'focus':
      await focusResearchQuestion(host, parsed.questionId, parsed.boundedAction);
      return;
    case 'defer':
      await steerQuestion(host, 'defer_question', parsed.questionId, parsed.reason);
      return;
    case 'block':
      await steerQuestion(host, 'block_question', parsed.questionId, parsed.reason);
      return;
    case 'close':
      await steerQuestion(host, 'close_question', parsed.questionId, parsed.reason);
      return;
    case 'reopen':
      await steerQuestion(host, 'reopen_question', parsed.questionId, parsed.reason);
      return;
    case 'line':
      await switchResearchLine(host, parsed.slug);
      return;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function showResearchStatus(host: SlashCommandHost): Promise<void> {
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  let snapshot: ResearchStatusSnapshot;
  try {
    snapshot = await session.getResearch();
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(`Failed to read research status: ${formatErrorMessage(error)}`);
    return;
  }
  if (!host.researchController.applySnapshot(token, snapshot)) return;
  host.track('research_status', { mode: snapshot.mode });

  const modeLabel = snapshot.mode;
  const loopLabel = snapshot.loopStatus;
  const lineLabel = snapshot.currentLineSlug ?? 'none';
  const qLabel = snapshot.currentQuestion?.wording ?? 'none';
  host.state.transcriptContainer.addChild(
    new StatusMessageComponent(
      `Research mode: ${modeLabel} · loop: ${loopLabel} · line: ${lineLabel} · focus: ${qLabel}`,
    ),
  );
  host.state.ui.requestRender();
}

async function enterResearchMode(
  host: SlashCommandHost,
  lineSlug?: string,
): Promise<void> {
  if (
    host.state.appState.permissionMode === 'manual' ||
    host.state.appState.permissionMode === 'yolo'
  ) {
    showResearchStartPermissionPrompt(host, lineSlug);
    return;
  }
  await startResearchMode(host, lineSlug);
}

function showResearchStartPermissionPrompt(
  host: SlashCommandHost,
  lineSlug?: string,
): void {
  const commandText = lineSlug !== undefined
    ? `/research on -- ${lineSlug}`
    : '/research on';
  const cancelStart = (): void => {
    host.restoreInputText(commandText);
    host.showStatus('Research mode not started.');
  };
  host.mountEditorReplacement(
    new StartPermissionPromptComponent({
      title: 'Start Research Mode with approvals on?',
      noticeLines: [
        'Research Mode activates the research board for this session.',
        'Subsequent research turns project structured status — focus, questions, and evidence — to the board in real time.',
        'Manual mode asks before risky actions, so a research turn may stop and wait.',
        'You can go back without losing your command.',
      ],
      options: [
        {
          value: 'auto',
          label: 'Switch to Auto and start',
          description:
            'Tools are approved automatically and questions are skipped — best for unattended research.',
        },
        {
          value: 'yolo',
          label: 'Switch to YOLO and start',
          description:
            'Tools and plan changes are approved automatically. Questions may still be asked.',
        },
        {
          value: 'manual',
          label: 'Start in Manual',
          description:
            'Keep approvals on. A research turn may stop and wait for your approval.',
        },
        {
          value: 'cancel',
          label: 'Do not start',
          description: 'Return to the input box with your research command.',
        },
      ],
      onSelect: (choice: StartPermissionChoice) => {
        if (choice === 'cancel') {
          cancelStart();
          return;
        }
        host.restoreEditor();
        void startResearchModeWithPermission(host, lineSlug, choice);
      },
      onCancel: cancelStart,
    }),
  );
}

async function startResearchModeWithPermission(
  host: SlashCommandHost,
  lineSlug: string | undefined,
  choice: StartPermissionChoice,
): Promise<void> {
  const previousMode = host.state.appState.permissionMode;
  const switched =
    choice !== previousMode && (choice === 'auto' || choice === 'yolo');
  if (switched) {
    if (!(await setPermissionForResearch(host, choice))) return;
  }
  const started = await startResearchMode(host, lineSlug);
  if (!started && switched) {
    await setPermissionForResearch(host, previousMode);
  }
}

async function setPermissionForResearch(
  host: ResearchCommandHost,
  mode: PermissionMode,
): Promise<boolean> {
  try {
    await host.requireSession().setPermission(mode);
  } catch (error) {
    host.showError(`Failed to set permission mode: ${formatErrorMessage(error)}`);
    return false;
  }
  host.setAppState({ permissionMode: mode });
  return true;
}

async function startResearchMode(
  host: ResearchCommandHost,
  lineSlug?: string,
): Promise<boolean> {
  const command: ResearchCommand = {
    kind: 'enter_mode',
    actor: 'user',
    ...(lineSlug !== undefined ? { lineSlug } : {}),
  };
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return false;
  try {
    const response = await session.commandResearch(command);
    if (!applyResearchResponse(host, token, response)) return false;
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return false;
    host.showError(formatErrorMessage(error));
    return false;
  }
  host.track('research_on');
  host.showStatus('Research mode started.');
  return true;
}

async function exitResearchMode(host: SlashCommandHost): Promise<void> {
  if (getExpectedRevision(host) === undefined) {
    host.showStatus('No active research mode to stop.');
    return;
  }
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  try {
    const response = await session.commandResearch({
      kind: 'exit_mode',
    });
    if (!applyResearchResponse(host, token, response)) return;
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track('research_off');
  host.showStatus('Research mode stopped.');
}

async function pauseResearchLoop(host: SlashCommandHost): Promise<void> {
  const revision = getExpectedRevision(host);
  if (revision === undefined) {
    host.showStatus('No active research loop to pause.');
    return;
  }
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  try {
    const response = await session.commandResearch({
      kind: 'pause_loop',
      expectedRevision: revision,
    });
    if (!applyResearchResponse(host, token, response)) return;
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    if (hasResearchErrorCode(error, 'research_not_active', 'aitp.mode_inactive')) {
      host.showStatus('No active research loop to pause.');
      return;
    }
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track('research_pause');
  host.showStatus('Research loop paused. Use `/research resume` to continue.');
}

async function resumeResearchLoop(host: SlashCommandHost): Promise<void> {
  const revision = getExpectedRevision(host);
  if (revision === undefined) {
    host.showStatus('No research loop to resume.');
    return;
  }
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  try {
    const response = await session.commandResearch({
      kind: 'resume_loop',
      expectedRevision: revision,
    });
    if (!applyResearchResponse(host, token, response)) return;
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    if (hasResearchErrorCode(error, 'research_not_active', 'aitp.mode_inactive')) {
      host.showStatus('No research loop to resume.');
      return;
    }
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track('research_resume');
  host.showStatus('Research loop resumed.');
}

async function switchResearchLine(host: SlashCommandHost, slug: string): Promise<void> {
  const revision = getExpectedRevision(host);
  if (revision === undefined) {
    host.showStatus('No active research mode. Use `/research on` first.');
    return;
  }
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  try {
    const response = await session.commandResearch({
      kind: 'switch_line',
      lineSlug: slug,
      expectedRevision: revision,
    });
    if (!applyResearchResponse(host, token, response)) return;
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track('research_line', { slug });
  host.showStatus(`Switched to research line: ${slug}`);
}

async function focusResearchQuestion(
  host: SlashCommandHost,
  questionId: string,
  boundedAction: string,
): Promise<void> {
  const revision = getExpectedRevision(host);
  if (revision === undefined) {
    host.showStatus('No active research mode. Use `/research on` first.');
    return;
  }
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  try {
    const response = await session.commandResearch({
      kind: 'set_focus',
      questionId,
      expectedRevision: revision,
      boundedAction,
    });
    if (!applyResearchResponse(host, token, response)) return;
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track('research_focus', { questionId });
}

async function steerQuestion(
  host: SlashCommandHost,
  kind: 'defer_question' | 'block_question' | 'close_question' | 'reopen_question',
  questionId: string,
  reason?: string,
): Promise<void> {
  const revision = getExpectedRevision(host);
  if (revision === undefined) {
    host.showStatus('No active research mode. Use `/research on` first.');
    return;
  }
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  try {
    const response = await session.commandResearch({
      kind,
      questionId,
      expectedRevision: revision,
      ...(reason !== undefined ? { reason } : {}),
    });
    if (!applyResearchResponse(host, token, response)) return;
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track(`research_${kind}`, { questionId });
}

export function hasUnresolvedResearchAttention(snapshot: ResearchStatusSnapshot): boolean {
  return (
    (snapshot.humanGate !== undefined && snapshot.humanGate.resolvedAt === undefined) ||
    snapshot.alerts.some((alert) => alert.acknowledgedAt === undefined)
  );
}

interface ResearchManagerView {
  readonly selectedLineSlug?: string;
  readonly selectedQuestionId?: string;
  readonly initialView?: 'attention' | 'lines' | 'questions';
}

async function showResearchManager(
  host: SlashCommandHost,
  view: ResearchManagerView = {},
): Promise<void> {
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  let snapshot: ResearchStatusSnapshot;
  try {
    snapshot = await session.getResearch();
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(`Failed to load research state: ${formatErrorMessage(error)}`);
    return;
  }

  // Keep the board's revision and visibility aligned with the manager's initial
  // snapshot before any optimistic-concurrency action is emitted.
  if (!host.researchController.applySnapshot(token, snapshot)) return;
  if (snapshot.mode === 'inactive') {
    host.showStatus('Research mode is inactive. Use `/research on` first.');
    return;
  }
  host.track('research_manage');
  host.mountEditorReplacement(
    new ResearchManagerComponent({
      snapshot,
      selectedLineSlug: view.selectedLineSlug,
      selectedQuestionId: view.selectedQuestionId,
      initialView: view.initialView ?? (hasUnresolvedResearchAttention(snapshot) ? 'attention' : undefined),
      onAction: async (action) => {
        try {
          return await handleResearchManagerAction(host, action);
        } catch (error) {
          host.showError(`Failed to update research: ${formatErrorMessage(error)}`);
          return undefined;
        }
      },
      onCancel: () => {
        host.restoreEditor();
      },
    }),
  );
}

async function handleResearchManagerAction(
  host: SlashCommandHost,
  action: ResearchManagerAction,
): Promise<ResearchStatusSnapshot | void> {
  const session = host.requireSession();
  try {
    return await handleResearchManagerActionCore(host, action);
  } catch (error) {
    if (host.session !== undefined && host.session !== session) return;
    if (!isResearchStale(error)) throw error;
    host.showStatus('Research state changed by the agent. Refreshing — please retry.');
    await showResearchManager(host, managerViewForAction(host, action));
    return;
  }
}

function managerViewForAction(
  host: ResearchCommandHost,
  action: ResearchManagerAction,
): ResearchManagerView {
  if (action.kind === 'resolve_human_decision' || action.kind === 'acknowledge_alert') {
    return { initialView: 'attention' };
  }
  if ('questionId' in action) {
    const question = host.state.researchBoard.getSnapshot()?.questions.find(
      (item) => item.id === action.questionId,
    );
    return {
      selectedLineSlug: question?.lineSlug,
      selectedQuestionId: action.questionId,
      initialView: 'questions',
    };
  }
  if ('lineSlug' in action) {
    return { selectedLineSlug: action.lineSlug, initialView: 'lines' };
  }
  return {};
}

async function handleResearchManagerActionCore(
  host: SlashCommandHost,
  action: ResearchManagerAction,
): Promise<ResearchStatusSnapshot | void> {
  const session = host.requireSession();
  const revision = getExpectedRevision(host);
  if (revision === undefined) {
    host.showStatus('No active research mode. Use `/research on` first.');
    return;
  }

  switch (action.kind) {
    case 'edit':
      await showResearchEditDialog(host, action.questionId);
      return;
    case 'edit_line':
      await showResearchLineEditDialog(host, action.lineSlug);
      return;
    case 'resolve_human_decision': {
      const token = beginResearchRequest(host, session);
      if (token === undefined) return;
      const response = await session.commandResearch({
        kind: 'resolve_decision',
        gateId: action.gateId,
        resolution: action.resolution,
        nextPhase: action.nextPhase,
      });
      if (!applyResearchResponse(host, token, response)) return;
      return response.snapshot;
    }
    case 'acknowledge_alert': {
      const token = beginResearchRequest(host, session);
      if (token === undefined) return;
      const response = await session.commandResearch({
        kind: 'acknowledge_alert',
        fingerprint: action.fingerprint,
      });
      if (!applyResearchResponse(host, token, response)) return;
      return response.snapshot;
    }
    case 'switch_line': {
      const token = beginResearchRequest(host, session);
      if (token === undefined) return;
      const response = await session.commandResearch({
        kind: 'switch_line',
        lineSlug: action.lineSlug,
        expectedRevision: action.expectedRevision,
      });
      if (!applyResearchResponse(host, token, response)) return;
      return response.snapshot;
    }
    case 'pause_loop':
    case 'resume_loop': {
      const token = beginResearchRequest(host, session);
      if (token === undefined) return;
      const response = await session.commandResearch({
        kind: action.kind,
        expectedRevision: action.expectedRevision,
      });
      if (!applyResearchResponse(host, token, response)) return;
      return response.snapshot;
    }
    case 'update_line': {
      const token = beginResearchRequest(host, session);
      if (token === undefined) return;
      const response = await session.commandResearch({
        kind: 'update_line',
        lineSlug: action.lineSlug,
        expectedRevision: action.expectedRevision,
        title: undefined,
        objective: undefined,
        status: action.status,
        assessment: undefined,
        reason: undefined,
      });
      if (!applyResearchResponse(host, token, response)) return;
      return response.snapshot;
    }
    case 'focus': {
      const token = beginResearchRequest(host, session);
      if (token === undefined) return;
      const response = await session.commandResearch({
        kind: 'set_focus',
        questionId: action.questionId,
        expectedRevision: revision,
        boundedAction: action.boundedAction,
      });
      if (!applyResearchResponse(host, token, response)) return;
      return response.snapshot;
    }
    case 'defer':
      return sendQuestionManagerCommand(host, 'defer_question', action.questionId, action.reason);
    case 'block':
      return sendQuestionManagerCommand(host, 'block_question', action.questionId, action.reason);
    case 'close':
      return sendQuestionManagerCommand(host, 'close_question', action.questionId, action.reason);
    case 'reopen':
      return sendQuestionManagerCommand(host, 'reopen_question', action.questionId, action.reason);
  }
}

type QuestionManagerCommandKind =
  | 'defer_question'
  | 'block_question'
  | 'close_question'
  | 'reopen_question';

async function sendQuestionManagerCommand(
  host: SlashCommandHost,
  kind: QuestionManagerCommandKind,
  questionId: string,
  reason: string | undefined,
): Promise<ResearchStatusSnapshot | void> {
  const revision = getExpectedRevision(host);
  if (revision === undefined) {
    host.showStatus('No active research mode. Use `/research on` first.');
    return;
  }
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  let response: ResearchCommandResponse;
  switch (kind) {
    case 'defer_question':
      response = await session.commandResearch({
        kind,
        questionId,
        expectedRevision: revision,
        reason,
      });
      break;
    case 'block_question':
      response = await session.commandResearch({
        kind,
        questionId,
        expectedRevision: revision,
        reason,
      });
      break;
    case 'close_question':
      response = await session.commandResearch({
        kind,
        questionId,
        expectedRevision: revision,
        reason,
      });
      break;
    case 'reopen_question':
      response = await session.commandResearch({
        kind,
        questionId,
        expectedRevision: revision,
        reason,
      });
      break;
  }
  if (!applyResearchResponse(host, token, response)) return;
  return response.snapshot;
}

async function showResearchEditDialog(
  host: SlashCommandHost,
  questionId: string,
  initialWording?: string,
): Promise<void> {
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  let snapshot: ResearchStatusSnapshot;
  try {
    snapshot = await session.getResearch();
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(`Failed to load research state: ${formatErrorMessage(error)}`);
    return;
  }
  if (!host.researchController.applySnapshot(token, snapshot)) return;
  if (snapshot.mode === 'inactive') {
    host.showStatus('No active research mode. Use `/research on` first.');
    return;
  }

  const question = snapshot.questions.find((q) => q.id === questionId);
  if (question === undefined) {
    host.showStatus(`Question ${questionId} not found.`);
    await showResearchManager(host);
    return;
  }

  if (initialWording !== undefined) {
    const commandToken = beginResearchRequest(host, session);
    if (commandToken === undefined) return;
    try {
      const response = await session.commandResearch({
        kind: 'update_question',
        questionId,
        expectedRevision: question.revision,
        wording: initialWording,
      });
      if (!applyResearchResponse(host, commandToken, response)) return;
      host.track('research_question_edit');
      host.showStatus(`Question ${questionId} updated.`);
    } catch (error) {
      if (!isResearchRequestCurrent(host, commandToken)) return;
      host.showError(`Failed to update question: ${formatErrorMessage(error)}`);
    }
    return;
  }

  host.mountEditorReplacement(
    new ResearchEditDialogComponent({
      question,
      onDone: (result) => handleResearchEditResult(host, result),
    }),
  );
}

async function handleResearchEditResult(
  host: SlashCommandHost,
  result: ResearchEditResult,
): Promise<void> {
  const view: ResearchManagerView = {
    selectedLineSlug: result.lineSlug,
    selectedQuestionId: result.questionId,
    initialView: 'questions',
  };
  if (result.kind === 'cancel') {
    await showResearchManager(host, view);
    return;
  }

  if (getExpectedRevision(host) === undefined) {
    host.showStatus('No active research mode. Use `/research on` first.');
    return;
  }
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  try {
    const response = await session.commandResearch({
      kind: 'update_question',
      questionId: result.questionId,
      expectedRevision: result.expectedRevision,
      wording: result.wording,
      assessment: result.assessment,
      priority: result.priority,
      nextBoundedAction: result.nextBoundedAction,
    });
    if (!applyResearchResponse(host, token, response)) {
      if (!isResearchRequestCurrent(host, token)) return;
      host.showStatus('Research state changed. Refreshing — please retry.');
      await showResearchManager(host, view);
      return;
    }
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    if (isResearchStale(error)) {
      host.showStatus('Question was modified by the agent. Refreshing — please retry.');
      await showResearchManager(host, view);
      return;
    }
    throw error;
  }
  host.track('research_edit', { questionId: result.questionId });
  await showResearchManager(host, view);
}

async function showResearchLineEditDialog(
  host: SlashCommandHost,
  lineSlug: string,
): Promise<void> {
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  let snapshot: ResearchStatusSnapshot;
  try {
    snapshot = await session.getResearch();
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    host.showError(`Failed to load research state: ${formatErrorMessage(error)}`);
    return;
  }
  if (!host.researchController.applySnapshot(token, snapshot)) return;
  if (snapshot.mode === 'inactive') {
    host.showStatus('No active research mode. Use `/research on` first.');
    return;
  }
  const line = snapshot.lines.find((item) => item.slug === lineSlug);
  if (line === undefined) {
    host.showStatus(`Research line ${lineSlug} not found.`);
    await showResearchManager(host);
    return;
  }
  host.mountEditorReplacement(
    new ResearchLineEditDialogComponent({
      line,
      onDone: (result) => handleResearchLineEditResult(host, result),
    }),
  );
}

async function handleResearchLineEditResult(
  host: SlashCommandHost,
  result: ResearchLineEditResult,
): Promise<void> {
  const view: ResearchManagerView = {
    selectedLineSlug: result.lineSlug,
    initialView: 'lines',
  };
  if (result.kind === 'cancel') {
    await showResearchManager(host, view);
    return;
  }
  if (getExpectedRevision(host) === undefined) {
    host.showStatus('No active research mode. Use `/research on` first.');
    return;
  }
  const session = host.requireSession();
  const token = beginResearchRequest(host, session);
  if (token === undefined) return;
  try {
    const response = await session.commandResearch({
      kind: 'update_line',
      lineSlug: result.lineSlug,
      expectedRevision: result.expectedRevision,
      title: result.title,
      objective: result.objective,
      status: undefined,
      assessment: result.assessment,
      reason: undefined,
    });
    if (!applyResearchResponse(host, token, response)) {
      if (!isResearchRequestCurrent(host, token)) return;
      host.showStatus('Research state changed. Refreshing — please retry.');
      await showResearchManager(host, view);
      return;
    }
  } catch (error) {
    if (!isResearchRequestCurrent(host, token)) return;
    if (isResearchStale(error)) {
      host.showStatus('Research line was modified by the agent. Refreshing — please retry.');
      await showResearchManager(host, view);
      return;
    }
    throw error;
  }
  host.track('research_line_edit', { lineSlug: result.lineSlug });
  await showResearchManager(host, view);
}

function researchErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function hasResearchErrorCode(error: unknown, ...codes: readonly string[]): boolean {
  const code = researchErrorCode(error);
  return code !== undefined && codes.includes(code);
}

function isResearchStale(error: unknown): boolean {
  return hasResearchErrorCode(error, 'research.revision_stale', 'research_stale_revision');
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

function getExpectedRevision(host: ResearchCommandHost): number | undefined {
  return host.state.researchBoard.getSnapshotRevision();
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
