/**
 * ResearchBoardComponent — compact research-loop status panel shown in the
 * Todo chrome slot.
 *
 * The board owns only a projection of Todo state. The TUI keeps that
 * projection synchronized while the board temporarily replaces TodoPanel in
 * the shared slot, so switching research mode never drops user-visible Todo
 * state.
 */

import type { Component } from '@moonshot-ai/pi-tui';
import { truncateToWidth, visibleWidth } from '@moonshot-ai/pi-tui';
import type { ResearchStatusSnapshot } from '@moonshot-ai/kimi-code-sdk';
import chalk from 'chalk';

import { CURRENT_MARK } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';
import type { ColorPalette } from '#/tui/theme/colors';
import type { TodoItem } from './todo-panel';

const MAX_COMPACT_ROWS = 14;
const MAX_EXPANDED_ROWS = 36;
const MAX_LINE_SUMMARIES = 4;
const MAX_ACTION_ROWS = 4;
const MAX_ALERT_ROWS = 2;
const MAX_PROGRESS_DETAIL_ROWS = 6;
const MAX_UNCERTAINTY_ROWS = 2;
const MAX_MAINTENANCE_CODES = 3;

/** Extract sub-types from the snapshot shape (the SDK only re-exports the snapshot). */
type ResearchQuestion = NonNullable<ResearchStatusSnapshot['currentQuestion']>;
type ResearchLine = ResearchStatusSnapshot['lines'][number];
type ResearchRunState = NonNullable<ResearchStatusSnapshot['currentRun']>;
type ResearchAlert = ResearchStatusSnapshot['alerts'][number];
type AitpMaintenanceReceipt = NonNullable<ResearchStatusSnapshot['aitpMaintenance']>;

/** Phase labels shown to the user, with human-friendly spacing. */
const PHASE_LABELS: Record<ResearchStatusSnapshot['phase'], string> = {
  idle: 'idle',
  orienting: 'orienting',
  gap_analysis: 'gap analysis',
  action_planned: 'action planned',
  action_executing: 'executing',
  evaluating: 'evaluating',
  state_updated: 'state updated',
  checkpoint_pending: 'checkpoint pending',
  awaiting_human: 'awaiting human',
};

export class ResearchBoardComponent implements Component {
  private snapshot: ResearchStatusSnapshot | null = null;
  private todos: readonly TodoItem[] = [];
  private expanded = false;

  setSnapshot(snapshot: ResearchStatusSnapshot | null): void {
    this.snapshot = snapshot;
  }

  getSnapshot(): ResearchStatusSnapshot | null {
    return this.snapshot;
  }

  getSnapshotRevision(): number | undefined {
    return this.snapshot?.mode === 'inactive' ? undefined : this.snapshot?.revision;
  }

  setTodos(todos: readonly TodoItem[]): void {
    this.todos = todos.map((todo) => ({
      title: todo.title,
      status: todo.status,
    }));
  }

  getTodos(): readonly TodoItem[] {
    return this.todos;
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  clear(): void {
    this.snapshot = null;
  }

  /** The board is visible for every phase except `inactive`. */
  isVisible(): boolean {
    return this.snapshot !== null && this.snapshot.mode !== 'inactive';
  }

  isEmpty(): boolean {
    return !this.isVisible();
  }

  invalidate(): void {}

  render(width: number): string[] {
    const snap = this.snapshot;
    if (snap === null || !this.isVisible()) return [];

    const safeWidth = Math.max(0, width);
    const colors = currentTheme.palette;
    const lines: string[] = [
      chalk.hex(colors.border)('─'.repeat(safeWidth)),
      renderHeader(snap, colors, safeWidth),
    ];

    const contentRows = this.expanded
      ? buildExpandedRows(snap, this.todos, colors, safeWidth)
      : buildCompactRows(snap, this.todos, colors);
    const maxRows = this.expanded ? MAX_EXPANDED_ROWS : MAX_COMPACT_ROWS;
    // Reserve the border, header, hint, and (when needed) one overflow row
    // before selecting body content. This keeps the total height bounded even
    // when the snapshot contains many alerts, lines, or Todo actions.
    const bodyBudget = Math.max(0, maxRows - 3);
    const needsOverflow = contentRows.length > bodyBudget;
    const visibleBudget = needsOverflow ? Math.max(0, bodyBudget - 1) : bodyBudget;
    const visibleRows = contentRows.slice(0, visibleBudget);
    const overflow = contentRows.length - visibleRows.length;

    for (const row of visibleRows) {
      lines.push(truncateToWidth(row, safeWidth, '…'));
    }
    if (overflow > 0) {
      lines.push(
        truncateToWidth(`  … +${String(overflow)} more`, safeWidth, '…'),
      );
    }
    const hint = this.expanded ? '  ctrl+o to collapse' : '  ctrl+o to expand';
    lines.push(truncateToWidth(chalk.hex(colors.textMuted)(hint), safeWidth, '…'));
    return lines;
  }
}

function renderHeader(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
  width: number,
): string {
  const mode = formatModeLabel(snap.mode, snap.loopStatus, colors);
  const line = normalizeSummary(snap.currentLineSlug) || 'none';
  const health = formatHealthLabel(snap, colors);
  return truncateToWidth(
    `  ${chalk.hex(colors.primary).bold('Research')}  ${mode} · line: ${chalk.hex(colors.text)(line)} · AITP: ${health}`,
    width,
    '…',
  );
}

function formatModeLabel(
  mode: ResearchStatusSnapshot['mode'],
  loopStatus: ResearchStatusSnapshot['loopStatus'],
  colors: ColorPalette,
): string {
  const loopText = loopStatus === 'paused' ? ' paused' : '';
  const text = `${mode}${loopText}`;
  if (mode === 'degraded') return chalk.hex(colors.warning)(text);
  if (loopStatus === 'paused') return chalk.hex(colors.textMuted)(text);
  return chalk.hex(colors.success)(text);
}

function formatHealthLabel(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string {
  const phase = snap.aitpHealth.phase;
  if (phase === 'degraded') return chalk.hex(colors.warning)(phase);
  if (phase === 'ready') return chalk.hex(colors.success)(phase);
  return chalk.hex(colors.textMuted)(phase);
}

function normalizeSummary(value: string | undefined): string {
  return (value ?? '').replaceAll(/\s+/gu, ' ').trim();
}

function candidateQuestions(
  snap: ResearchStatusSnapshot,
): readonly ResearchQuestion[] {
  return snap.questions.filter(
    (question) =>
      question.epistemic === 'candidate' &&
      question.workflow !== 'closed' &&
      question.workflow !== 'cancelled',
  );
}

function alertClassification(
  alert: ResearchAlert,
): NonNullable<ResearchAlert['classification']> {
  return alert.classification ?? (alert.kind === 'blocked' ? 'active_blocker' : 'warning');
}

function orderedAlerts(
  alerts: readonly ResearchAlert[],
): readonly ResearchAlert[] {
  const rank = (alert: ResearchAlert): number => {
    switch (alertClassification(alert)) {
      case 'active_blocker': return 0;
      case 'historical_unresolved': return 1;
      case 'superseded_by_retry': return 2;
      case 'warning': return 3;
    }
  };
  return alerts
    .filter((alert) => alert.state !== 'acknowledged' && alert.state !== 'cleared' && alert.state !== 'superseded' && alert.acknowledgedAt === undefined)
    .toSorted((a, b) => rank(a) - rank(b));
}

function renderAttentionRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
  expanded = false,
): string[] {
  const rows: string[] = [];
  const alerts = orderedAlerts(snap.alerts);
  const alert = alerts[0];
  if (alert !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.warning)('Attention:')} ${chalk.hex(colors.textMuted)(formatAlertSummary(alerts, colors))} · ${chalk.hex(colors.text)(normalizeSummary(alert.message))}`,
    );
  }
  // Pending checkpoint is engineering audit info — only show in expanded view.
  if (expanded && snap.pendingCheckpoint !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.warning)('Pending checkpoint:')} ${chalk.hex(colors.text)(normalizeSummary(snap.pendingCheckpoint.checkpointId))}${formatCheckpointDetails(snap.pendingCheckpoint, colors)}`,
    );
  }
  return rows;
}

function renderCandidateSummary(
  candidates: readonly ResearchQuestion[],
  label: string,
  colors: ColorPalette,
): string {
  if (candidates.length === 0) {
    return `  ${chalk.hex(colors.textDim)(label + ':')} ${chalk.hex(colors.textMuted)('0')}`;
  }
  const preview = candidates
    .slice(0, 3)
    .map((question) => `${normalizeSummary(question.id)}: ${normalizeSummary(question.wording)}`)
    .join(' · ');
  const suffix = candidates.length > 3 ? ` · +${String(candidates.length - 3)} more` : '';
  return `  ${chalk.hex(colors.textStrong).bold(`${label} (${String(candidates.length)}):`)} ${chalk.hex(colors.text)(preview)}${chalk.hex(colors.textMuted)(suffix)}`;
}

function renderResearchCounts(
  snap: ResearchStatusSnapshot,
  otherCandidateCount: number,
  colors: ColorPalette,
): string {
  const other = otherCandidateCount > 0 ? ` · ${String(otherCandidateCount)} other candidates` : '';
  return `  ${chalk.hex(colors.textDim)('Research:')} ${chalk.hex(colors.textMuted)(`${String(snap.openQuestionCount)} open · ${String(snap.activeQuestionCount)} active · ${String(snap.blockedQuestionCount)} blocked${other}`)}`;
}

function buildCompactRows(
  snap: ResearchStatusSnapshot,
  todos: readonly TodoItem[],
  colors: ColorPalette,
): string[] {
  const rows: string[] = [];
  const question = snap.currentFocus === undefined ? undefined : snap.currentQuestion;
  const currentLine = findCurrentLine(snap);

  // Human gate / blocked / stale takes top priority — most actionable info.
  const gateRow = renderHumanGateRow(snap, colors);
  if (gateRow !== undefined) rows.push(gateRow);

  if (question !== undefined) {
    rows.push(renderFocus(question, colors));
    rows.push(renderAssessment(snap, question, colors));
  } else if (snap.currentFocus !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.primary)('◉')} ${chalk.hex(colors.textDim)('Focus: no active question')}`,
    );
  } else if (currentLine?.assessment !== undefined) {
    rows.push(renderAssessment(snap, undefined, colors));
  }

  rows.push(...renderAttentionRows(snap, colors));

  // Scientific progress summary (phase, headline, impact).
  rows.push(...renderCompactScientificRows(snap, colors));
  if (snap.currentRun !== undefined) {
    rows.push(renderCompactRunRow(snap.currentRun, colors));
  }
  const effectiveNextStep = renderEffectiveNextStep(snap, colors);
  if (effectiveNextStep !== undefined) rows.push(effectiveNextStep);

  const candidates = candidateQuestions(snap);
  const currentCandidates = snap.currentLineSlug === undefined
    ? []
    : candidates.filter((candidate) => candidate.lineSlug === snap.currentLineSlug);
  const otherCandidateCount = candidates.length - currentCandidates.length;
  if (currentCandidates.length > 0) {
    rows.push(renderCandidateSummary(currentCandidates, 'Candidates (current line)', colors));
  } else if (question === undefined) {
    rows.push(renderCandidateSummary(candidates, 'Candidates', colors));
  }
  rows.push(renderResearchCounts(snap, otherCandidateCount, colors));

  const action = selectTodoAction(todos);
  if (action !== undefined) {
    rows.push(renderTodoAction(action, colors, '  ', 'Todo:'));
  } else {
    rows.push(`  ${chalk.hex(colors.textDim)('Todo:')} ${chalk.hex(colors.textMuted)('none recorded')}`);
  }
  rows.push(renderTodoProgress(todos, colors));
  // Checkpoint engineering IDs moved to expanded view only — compact stays
  // focused on scientific progress, not audit plumbing.

  if (snap.aitpHealth.lastError !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.warning)('AITP error:')} ${chalk.hex(colors.textMuted)(normalizeSummary(snap.aitpHealth.lastError))}`,
    );
  }
  return rows;
}

function orderedLines(snap: ResearchStatusSnapshot): readonly ResearchLine[] {
  const current = findCurrentLine(snap);
  if (current === undefined) return snap.lines;
  return [current, ...snap.lines.filter((line) => line.slug !== current.slug)];
}

function buildExpandedRows(
  snap: ResearchStatusSnapshot,
  todos: readonly TodoItem[],
  colors: ColorPalette,
  width: number,
): string[] {
  const rows: string[] = [
    `  ${chalk.hex(colors.textStrong).bold('Lines')} ${chalk.hex(colors.textMuted)(`(${String(snap.lines.length)})`)}`,
  ];
  const lines = orderedLines(snap);
  for (const line of lines.slice(0, MAX_LINE_SUMMARIES)) {
    rows.push(renderLineSummary(line, snap, colors, width));
  }
  if (lines.length > MAX_LINE_SUMMARIES) {
    rows.push(
      `    ${chalk.hex(colors.textMuted)(`… +${String(lines.length - MAX_LINE_SUMMARIES)} more lines`)}`,
    );
  }

  const current = snap.currentQuestion;
  const currentLine = findCurrentLine(snap);
  rows.push(
    `  ${chalk.hex(colors.textStrong).bold('Current:')} ${chalk.hex(colors.text)(normalizeSummary(current?.wording ?? snap.currentFocus?.questionId ?? 'none'))}`,
  );
  rows.push(renderAssessment(snap, current, colors));

  const effectiveNextStep = renderEffectiveNextStep(snap, colors);
  rows.push(
    effectiveNextStep ?? `  ${chalk.hex(colors.textDim)('Next:')} ${chalk.hex(colors.text)(normalizeSummary(currentLine?.objective) || 'none')}`,
  );
  rows.push(...renderAttentionRows(snap, colors, true));

  // Scientific progress detail: phase, progress report, current action, gate.
  rows.push(...renderExpandedScientificRows(snap, colors));
  rows.push(...renderExpandedMaintenanceRows(snap, colors));

  rows.push(renderResearchCounts(
    snap,
    Math.max(0, candidateQuestions(snap).length - candidateQuestions(snap).filter((q) => q.lineSlug === snap.currentLineSlug).length),
    colors,
  ));

  const progress = formatTodoProgress(todos);
  rows.push(
    `  ${chalk.hex(colors.textStrong).bold('Todo actions')} ${chalk.hex(colors.textMuted)(`(${progress})`)}`,
  );
  if (todos.length === 0) {
    rows.push(`    ${chalk.hex(colors.textMuted)('No Todo actions.')}`);
  } else {
    for (const todo of todos.slice(0, MAX_ACTION_ROWS)) {
      rows.push(renderTodoAction(todo, colors, '    ', 'Todo:'));
    }
    if (todos.length > MAX_ACTION_ROWS) {
      rows.push(
        `    ${chalk.hex(colors.textMuted)(`… +${String(todos.length - MAX_ACTION_ROWS)} more Todo actions`)}`,
      );
    }
  }

  if (current !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.textDim)('Evidence:')} ${chalk.hex(colors.textMuted)(`${String(current.neededEvidence.length)} needed · ${String(current.evidenceRefs.length)} found · ${String(current.falsifierRefs.length)} falsifiers`)}`,
    );
  } else {
    rows.push(`  ${chalk.hex(colors.textDim)('Evidence:')} ${chalk.hex(colors.textMuted)('none selected')}`);
  }

  // Checkpoint details live in expanded view only (engineering audit info).
  const checkpoint = formatCompactCheckpoint(snap, colors);
  if (checkpoint !== undefined) rows.push(checkpoint);

  const alerts = orderedAlerts(snap.alerts);
  if (alerts.length === 0) {
    rows.push(`  ${chalk.hex(colors.textDim)('Alerts:')} ${chalk.hex(colors.textMuted)('none')}`);
  } else {
    rows.push(`  ${chalk.hex(colors.warning)('Alerts:')} ${formatAlertSummary(alerts, colors)}`);
    for (const alert of alerts.slice(0, MAX_ALERT_ROWS)) {
      const classification = alertClassification(alert);
      const label = classification === 'active_blocker'
        ? 'active blocker'
        : classification.replaceAll('_', ' ');
      const color = classification === 'active_blocker' ? colors.error : colors.warning;
      rows.push(
        `    ${chalk.hex(color)(classification === 'active_blocker' ? '!' : '◇')} ${chalk.hex(color)(label)} · ${chalk.hex(colors.textMuted)(normalizeSummary(alert.message))}`,
      );
      const association = [
        alert.relatedEntryId === undefined ? undefined : `entry ${alert.relatedEntryId}`,
        alert.workstream === undefined ? undefined : `workstream ${alert.workstream}`,
        alert.retryOfEntryId === undefined ? undefined : `retry of ${alert.retryOfEntryId}`,
      ].filter((value) => value !== undefined).join(' · ');
      if (association.length > 0) {
        rows.push(`      ${chalk.hex(colors.textMuted)(association)}`);
      }
    }
    if (alerts.length > MAX_ALERT_ROWS) {
      rows.push(
        `    ${chalk.hex(colors.textMuted)(`… +${String(alerts.length - MAX_ALERT_ROWS)} more alerts`)}`,
      );
    }
  }
  const acknowledgedCount = snap.alerts.filter(
    (alert) => alert.state === 'acknowledged' || alert.acknowledgedAt !== undefined,
  ).length;
  if (acknowledgedCount > 0) {
    rows.push(
      `  ${chalk.hex(colors.textDim)('acknowledged alerts:')} ${chalk.hex(colors.textMuted)(String(acknowledgedCount))}`,
    );
  }
  return rows;
}

function renderFocus(question: ResearchQuestion, colors: ColorPalette): string {
  const tags = chalk.hex(colors.textMuted)(
    ` [${question.workflow}/${question.epistemic}/${question.persistence}]`,
  );
  return `  ${chalk.hex(colors.primary)('◉')} ${chalk.hex(colors.textStrong).bold('Focus:')} ${chalk.hex(colors.text)(normalizeSummary(question.wording))}${tags}`;
}

function renderAssessment(
  snap: ResearchStatusSnapshot,
  question: ResearchQuestion | undefined,
  colors: ColorPalette,
): string {
  const line = findCurrentLine(snap);
  const rawAssessment = question?.assessment ?? line?.assessment;
  const assessment = normalizeSummary(rawAssessment);
  return `  ${chalk.hex(colors.textDim)('Assessment:')} ${chalk.hex(assessment.length === 0 ? colors.textMuted : colors.text)(assessment || 'not recorded')}`;
}

function findCurrentLine(snap: ResearchStatusSnapshot): ResearchLine | undefined {
  if (snap.currentLineSlug === undefined) return undefined;
  return snap.lines.find((line) => line.slug === snap.currentLineSlug);
}

function renderLineSummary(
  line: ResearchLine,
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
  width: number,
): string {
  const questions = snap.questions.filter((question) => question.lineSlug === line.slug);
  const open = questions.filter((question) => question.workflow === 'open').length;
  const active = questions.filter((question) => question.workflow === 'active').length;
  const blocked = questions.filter((question) => question.workflow === 'blocked').length;
  const current = line.slug === snap.currentLineSlug;
  const marker = current ? chalk.hex(colors.success)(` ${CURRENT_MARK}`) : '';
  const title = current
    ? chalk.hex(colors.primary).bold(normalizeSummary(line.title))
    : chalk.hex(colors.text)(normalizeSummary(line.title));
  const details = chalk.hex(colors.textMuted)(
    `(${normalizeSummary(line.slug)}) · ${line.status} · ${String(questions.length)} questions: ${String(open)} open/${String(active)} active/${String(blocked)} blocked`,
  );
  const body = `    ${title} ${details}`;
  if (marker.length === 0) return truncateToWidth(body, width, '…');
  const markerBudget = visibleWidth(marker);
  const bodyBudget = Math.max(1, width - markerBudget);
  return truncateToWidth(body, bodyBudget, '…') + marker;
}

function selectTodoAction(todos: readonly TodoItem[]): TodoItem | undefined {
  return todos.find((todo) => todo.status === 'in_progress') ??
    todos.find((todo) => todo.status === 'pending');
}

function renderTodoAction(
  todo: TodoItem,
  colors: ColorPalette,
  indent = '  ',
  label = 'Todo:',
): string {
  const marker =
    todo.status === 'in_progress'
      ? chalk.hex(colors.primary).bold('●')
      : todo.status === 'done'
        ? chalk.hex(colors.success)('✓')
        : chalk.hex(colors.textDim)('○');
  return `${indent}${chalk.hex(colors.textDim)(label)} ${marker} ${chalk.hex(todo.status === 'in_progress' ? colors.textStrong : colors.text)(normalizeSummary(todo.title))}`;
}

function formatTodoProgress(todos: readonly TodoItem[]): string {
  const done = todos.filter((todo) => todo.status === 'done').length;
  return `${String(done)}/${String(todos.length)} done`;
}

function renderTodoProgress(todos: readonly TodoItem[], colors: ColorPalette): string {
  return `  ${chalk.hex(colors.textDim)('Todo progress:')} ${chalk.hex(colors.textMuted)(formatTodoProgress(todos))}`;
}

function formatCompactCheckpoint(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string | undefined {
  const parts: string[] = [];
  if (snap.pendingCheckpoint !== undefined) {
    parts.push(
      `${chalk.hex(colors.warning)('pending')} ${chalk.hex(colors.text)(normalizeSummary(snap.pendingCheckpoint.checkpointId))}`,
    );
  }
  if (snap.latestCommittedCheckpoint !== undefined) {
    const checkpoint = snap.latestCommittedCheckpoint;
    parts.push(
      `${chalk.hex(colors.success)('✓ committed')} ${chalk.hex(colors.text)(normalizeSummary(checkpoint.entryId ?? checkpoint.checkpointId))}`,
    );
  }
  return parts.length === 0 ? undefined : `  ${chalk.hex(colors.textDim)('checkpoint:')} ${parts.join(' · ')}`;
}

function formatCheckpointDetails(
  checkpoint: ResearchStatusSnapshot['pendingCheckpoint'],
  colors: ColorPalette,
): string {
  if (checkpoint === undefined) return '';
  const details = [checkpoint.assessment, checkpoint.nextAction]
    .map((value) => normalizeSummary(value))
    .filter((value) => value.length > 0);
  return details.length === 0
    ? ''
    : ` · ${chalk.hex(colors.textMuted)(details.join(' · '))}`;
}

export function formatAlertSummary(
  alerts: readonly ResearchAlert[],
  colors: ColorPalette,
): string {
  if (alerts.length === 0) return '';
  return chalk.hex(colors.warning)(
    `${alerts.length} alert${alerts.length === 1 ? '' : 's'}`,
  );
}

// ── Scientific progress formatters ──────────────────────────────────────────

/** Human-readable phase label with a color matching its semantic. */
function renderPhase(
  phase: ResearchStatusSnapshot['phase'],
  colors: ColorPalette,
): string {
  const label = PHASE_LABELS[phase] ?? phase;
  if (phase === 'awaiting_human') return chalk.hex(colors.warning)(label);
  if (phase === 'idle') return chalk.hex(colors.textMuted)(label);
  if (phase === 'action_executing' || phase === 'evaluating')
    return chalk.hex(colors.primary)(label);
  return chalk.hex(colors.text)(label);
}

/**
 * Compact scientific summary: phase, progress headline (or "本轮没有记录进展"),
 * and one-line mainline impact. The effective next step is rendered separately
 * so competing question/progress/AITP handoffs cannot appear as three commands.
 */
function renderCompactScientificRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const rows: string[] = [
    `  ${chalk.hex(colors.textDim)('Phase:')} ${renderPhase(snap.phase, colors)}`,
  ];

  const progress = snap.latestProgress;
  const headline = progress !== undefined ? normalizeSummary(progress.headline) : '';
  rows.push(
    `  ${chalk.hex(colors.textDim)('Progress:')} ${chalk.hex(headline.length === 0 ? colors.textMuted : colors.text)(headline || '本轮没有记录进展')}`,
  );

  if (progress !== undefined) {
    const impact = normalizeSummary(progress.mainlineImpact);
    if (impact.length > 0) {
      rows.push(
        `  ${chalk.hex(colors.textDim)('Impact:')} ${chalk.hex(colors.text)(impact)}`,
      );
    }
  }

  return rows;
}

function renderCompactRunRow(
  run: ResearchRunState,
  colors: ColorPalette,
): string {
  const nextCheck = run.nextCheckAt === undefined
    ? ''
    : ` · next check ${formatRunTimestamp(run.nextCheckAt)}`;
  const stateColor = run.schedulerState === 'failed' || run.schedulerState === 'cancelled'
    ? colors.warning
    : run.schedulerState === 'completed'
      ? colors.success
      : colors.text;
  return `  ${chalk.hex(colors.textDim)('Run:')} ${chalk.hex(colors.text)(`job ${normalizeSummary(run.jobId)}`)} · ${chalk.hex(stateColor)(`${run.schedulerState} / ${run.stage}`)}${chalk.hex(colors.textMuted)(nextCheck)}`;
}

function formatRunTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return 'unknown';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString();
}

/** Render the single derived next step after scientific progress. */
function renderEffectiveNextStep(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string | undefined {
  const next = snap.effectiveNextStep;
  if (next === undefined) return undefined;
  const label = next.freshness === 'blocked' ? 'Blocked' : 'Next';
  const color = next.freshness === 'blocked' || next.freshness === 'stale'
    ? colors.warning
    : colors.text;
  return `  ${chalk.hex(colors.textDim)(`${label}:`)} ${chalk.hex(color)(normalizeSummary(next.text))}`;
}

function renderHumanGateRow(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string | undefined {
  const gate = snap.humanGate;
  if (gate === undefined || gate.resolvedAt !== undefined) return undefined;
  const kindLabel = gate.kind === 'approval'
    ? 'Approval needed'
    : gate.kind === 'review'
      ? 'Review needed'
      : 'Decision needed';
  return `  ${chalk.hex(colors.warning).bold('⏸ ' + kindLabel + ':')} ${chalk.hex(colors.text)(normalizeSummary(gate.prompt))}`;
}

/**
 * Expanded scientific detail: full progress report fields (motivation,
 * workPerformed, result, mainlineImpact, uncertainties, phaseChange),
 * current action spec (purpose, expected evidence, stop condition), and
 * the human gate prompt.
 */
function renderExpandedScientificRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const rows: string[] = [
    `  ${chalk.hex(colors.textDim)('Phase:')} ${renderPhase(snap.phase, colors)}`,
  ];

  // ── Progress detail ──
  const progress = snap.latestProgress;
  if (progress !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.textStrong).bold('Latest progress')}`,
    );
    const fields: Array<[string, string]> = [
      ['Headline', normalizeSummary(progress.headline)],
      ['Motivation', normalizeSummary(progress.motivation)],
      ['Work', normalizeSummary(progress.workPerformed)],
      ['Result', normalizeSummary(progress.result)],
      ['Impact', normalizeSummary(progress.mainlineImpact)],
    ];
    let added = 0;
    for (const [label, value] of fields) {
      if (value.length === 0 || added >= MAX_PROGRESS_DETAIL_ROWS) break;
      rows.push(
        `    ${chalk.hex(colors.textDim)(label + ':')} ${chalk.hex(colors.text)(value)}`,
      );
      added++;
    }
    if (progress.uncertainties.length > 0) {
      const shown = progress.uncertainties.slice(0, MAX_UNCERTAINTY_ROWS);
      const joined = shown.map((u) => normalizeSummary(u)).join(' · ');
      const suffix = progress.uncertainties.length > MAX_UNCERTAINTY_ROWS
        ? ` · +${String(progress.uncertainties.length - MAX_UNCERTAINTY_ROWS)} more`
        : '';
      rows.push(
        `    ${chalk.hex(colors.textDim)('Uncertainties:')} ${chalk.hex(colors.warning)(joined)}${chalk.hex(colors.textMuted)(suffix)}`,
      );
    }
    if (progress.phaseChange !== undefined) {
      const from = PHASE_LABELS[progress.phaseChange.from] ?? progress.phaseChange.from;
      const to = PHASE_LABELS[progress.phaseChange.to] ?? progress.phaseChange.to;
      rows.push(
        `    ${chalk.hex(colors.textDim)('Phase change:')} ${chalk.hex(colors.textMuted)(from)} → ${chalk.hex(colors.text)(to)}`,
      );
    }
    const nextAction = normalizeSummary(progress.nextAction);
    if (nextAction.length > 0) {
      rows.push(
        `    ${chalk.hex(colors.textDim)('Next:')} ${chalk.hex(colors.text)(nextAction)}`,
      );
    }
  } else {
    rows.push(
      `  ${chalk.hex(colors.textDim)('Progress:')} ${chalk.hex(colors.textMuted)('本轮没有记录进展')}`,
    );
  }

  // ── Current action detail ──
  const action = snap.currentAction;
  if (action !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.textStrong).bold('Current action')}`,
    );
    rows.push(
      `    ${chalk.hex(colors.textDim)('Kind:')} ${chalk.hex(colors.text)(action.kind)} · ${chalk.hex(colors.textMuted)(action.status)}`,
    );
    const purpose = normalizeSummary(action.purpose);
    if (purpose.length > 0) {
      rows.push(
        `    ${chalk.hex(colors.textDim)('Purpose:')} ${chalk.hex(colors.text)(purpose)}`,
      );
    }
    if (action.expectedEvidence.length > 0) {
      const joined = action.expectedEvidence.map((e) => normalizeSummary(e)).join(' · ');
      rows.push(
        `    ${chalk.hex(colors.textDim)('Expected evidence:')} ${chalk.hex(colors.text)(joined)}`,
      );
    }
    const stop = normalizeSummary(action.stopCondition);
    if (stop.length > 0) {
      rows.push(
        `    ${chalk.hex(colors.textDim)('Stop condition:')} ${chalk.hex(colors.text)(stop)}`,
      );
    }
  }

  // ── Current scheduler observation ──
  const run = snap.currentRun;
  if (run !== undefined) {
    rows.push(`  ${chalk.hex(colors.textStrong).bold('Current run')}`);
    rows.push(
      `    ${chalk.hex(colors.textDim)('Campaign:')} ${chalk.hex(colors.text)(normalizeSummary(run.campaign))} · ${chalk.hex(colors.textDim)('Job:')} ${chalk.hex(colors.text)(normalizeSummary(run.jobId))}`,
    );
    rows.push(
      `    ${chalk.hex(colors.textDim)('Scheduler:')} ${chalk.hex(colors.text)(run.schedulerState)} · ${chalk.hex(colors.textDim)('Stage:')} ${chalk.hex(colors.text)(run.stage)}`,
    );
    rows.push(
      `    ${chalk.hex(colors.textDim)('Last observed:')} ${chalk.hex(colors.textMuted)(formatRunTimestamp(run.lastObservedAt))}${run.nextCheckAt === undefined ? '' : ` · ${chalk.hex(colors.textDim)('Next check:')} ${chalk.hex(colors.textMuted)(formatRunTimestamp(run.nextCheckAt))}`}`,
    );
    if (run.terminalState !== undefined) {
      rows.push(
        `    ${chalk.hex(colors.textDim)('Terminal:')} ${chalk.hex(colors.text)(run.terminalState)}`,
      );
    }
    if (run.sourcePin !== undefined || run.binaryPin !== undefined) {
      rows.push(
        `    ${chalk.hex(colors.textDim)('Pins:')} ${chalk.hex(colors.textMuted)([run.sourcePin, run.binaryPin].filter((pin): pin is string => pin !== undefined).join(' · '))}`,
      );
    }
    if (run.artifactRefs.length > 0) {
      rows.push(
        `    ${chalk.hex(colors.textDim)('Artifacts:')} ${chalk.hex(colors.textMuted)(run.artifactRefs.map(normalizeSummary).join(' · '))}`,
      );
    }
  }

  // ── Human gate ──
  const gate = snap.humanGate;
  if (gate !== undefined && gate.resolvedAt === undefined) {
    const kindLabel = gate.kind === 'approval'
      ? 'Approval needed'
      : gate.kind === 'review'
        ? 'Review needed'
        : 'Decision needed';
    rows.push(
      `  ${chalk.hex(colors.warning).bold('⏸ ' + kindLabel + ':')} ${chalk.hex(colors.text)(normalizeSummary(gate.prompt))}`,
    );
    if (gate.resolution !== undefined) {
      const resolution = normalizeSummary(gate.resolution);
      if (resolution.length > 0) {
        rows.push(
          `    ${chalk.hex(colors.textDim)('Resolution:')} ${chalk.hex(colors.textMuted)(resolution)}`,
        );
      }
    }
  }

  return rows;
}

// ── AITP maintenance formatters ─────────────────────────────────────────────

function renderExpandedMaintenanceRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const maintenance = snap.aitpMaintenance;
  if (maintenance === undefined) return [];

  const rows: string[] = [
    `  ${chalk.hex(colors.textStrong).bold('AITP maintenance handoff')}`,
    `    ${chalk.hex(colors.textMuted)('Structural consistency only; not a physical conclusion and does not resolve historical failures.')}`,
    `    ${chalk.hex(colors.textDim)('Status:')} ${renderMaintenanceStatus(maintenance.status, colors)}`,
    `    ${chalk.hex(colors.textDim)('Memory:')} ${chalk.hex(colors.text)(formatMaintenanceMemoryStatus(maintenance.memoryStatus))}`,
    `    ${chalk.hex(colors.textDim)('Working Note:')} ${renderWorkingNoteFreshness(maintenance, colors)}`,
    `    ${chalk.hex(colors.textDim)('Historical unresolved failures:')} ${chalk.hex(maintenance.unresolvedFailureCount > 0 ? colors.warning : colors.text)(String(maintenance.unresolvedFailureCount))}`,
    `    ${chalk.hex(colors.textDim)('Recorded handoff next:')} ${chalk.hex(colors.text)(normalizeSummary(maintenance.nextAction) || 'none recorded')}`,
    `    ${chalk.hex(colors.textDim)('Structural check:')} ${renderMaintenanceCheck(maintenance.check, colors)}`,
  ];

  for (const failure of maintenance.unresolvedFailures.slice(0, MAX_MAINTENANCE_CODES)) {
    const workstream = normalizeSummary(failure.workstream);
    const scope = workstream.length === 0 ? '' : ` · workstream ${workstream}`;
    rows.push(
      `      ${chalk.hex(colors.warning)('◇')} ${chalk.hex(colors.text)(failure.entryId)}${chalk.hex(colors.textMuted)(scope)} — ${chalk.hex(colors.textMuted)(normalizeSummary(failure.summary))}`,
    );
  }
  if (maintenance.unresolvedFailures.length > MAX_MAINTENANCE_CODES) {
    rows.push(
      `      ${chalk.hex(colors.textMuted)(`… +${String(maintenance.unresolvedFailures.length - MAX_MAINTENANCE_CODES)} more historical failures`)}`,
    );
  }

  const warningCodes = formatMaintenanceCodes(
    maintenance.warningSummaries.map((warning) => warning.code),
  );
  if (warningCodes !== undefined) {
    rows.push(
      `    ${chalk.hex(colors.textDim)('Warnings:')} ${chalk.hex(colors.warning)(warningCodes)}`,
    );
  }

  const findingCodes = formatMaintenanceCodes(maintenance.check.findingCodes);
  if (findingCodes !== undefined) {
    rows.push(
      `    ${chalk.hex(colors.textDim)('Finding codes:')} ${chalk.hex(colors.warning)(findingCodes)}`,
    );
  }

  return rows;
}

function renderMaintenanceStatus(
  status: AitpMaintenanceReceipt['status'],
  colors: ColorPalette,
): string {
  return chalk.hex(status === 'degraded' ? colors.warning : colors.success)(status);
}

function formatMaintenanceMemoryStatus(
  status: AitpMaintenanceReceipt['memoryStatus'],
): string {
  return status.replaceAll('_', ' ');
}

function renderWorkingNoteFreshness(
  maintenance: AitpMaintenanceReceipt,
  colors: ColorPalette,
): string {
  const date = maintenance.latestWorkingNoteAt === undefined
    ? undefined
    : formatMaintenanceDate(maintenance.latestWorkingNoteAt);
  const suffix = date === undefined ? '' : ` · latest ${date}`;

  if (maintenance.activeNewerThanWorkingNote === true) {
    return chalk.hex(colors.warning)(`stale — active entries are newer${suffix}`);
  }
  if (maintenance.latestWorkingNoteAt === undefined) {
    return chalk.hex(colors.textMuted)('not established');
  }
  if (maintenance.activeNewerThanWorkingNote === false) {
    return chalk.hex(colors.success)(`current${suffix}`);
  }
  return chalk.hex(colors.textMuted)(`freshness unknown${suffix}`);
}

function formatMaintenanceDate(timestamp: number): string | undefined {
  if (!Number.isFinite(timestamp)) return undefined;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function renderMaintenanceCheck(
  check: AitpMaintenanceReceipt['check'],
  colors: ColorPalette,
): string {
  const counts = check.counts;
  const summary = counts === undefined
    ? check.status
    : `${check.status} · errors ${String(counts.errors)} · warnings ${String(counts.warnings)}`;
  return chalk.hex(check.status === 'clean' ? colors.success : colors.warning)(summary);
}

function formatMaintenanceCodes(codes: readonly string[]): string | undefined {
  const normalized = codes.map(normalizeSummary).filter((code) => code.length > 0);
  if (normalized.length === 0) return undefined;
  const shown = normalized.slice(0, MAX_MAINTENANCE_CODES).join(', ');
  const suffix = normalized.length > MAX_MAINTENANCE_CODES
    ? ` · +${String(normalized.length - MAX_MAINTENANCE_CODES)} more`
    : '';
  return `${shown}${suffix}`;
}
