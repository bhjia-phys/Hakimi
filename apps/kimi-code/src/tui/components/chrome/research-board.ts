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

const MAX_COMPACT_ROWS = 12;
const MAX_EXPANDED_ROWS = 24;
const MAX_LINE_SUMMARIES = 4;
const MAX_ACTION_ROWS = 4;
const MAX_ALERT_ROWS = 2;

/** Extract sub-types from the snapshot shape (the SDK only re-exports the snapshot). */
type ResearchQuestion = NonNullable<ResearchStatusSnapshot['currentQuestion']>;
type ResearchLine = ResearchStatusSnapshot['lines'][number];
type ResearchAlert = ResearchStatusSnapshot['alerts'][number];

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

function orderedAlerts(
  alerts: readonly ResearchAlert[],
): readonly ResearchAlert[] {
  const rank = (alert: ResearchAlert): number => {
    switch (alert.kind) {
      case 'blocked': return 0;
      case 'contradiction': return 1;
      case 'reopened': return 2;
      case 'commit_failed': return 3;
      case 'degraded': return 4;
      case 'stale': return 5;
    }
  };
  return [...alerts].toSorted((a, b) => rank(a) - rank(b));
}

function renderAttentionRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const rows: string[] = [];
  const alerts = orderedAlerts(snap.alerts);
  const alert = alerts[0];
  if (alert !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.warning)('Attention:')} ${chalk.hex(colors.textMuted)(formatAlertSummary(snap.alerts, colors))} · ${chalk.hex(colors.text)(normalizeSummary(alert.message))}`,
    );
  }
  if (snap.pendingCheckpoint !== undefined) {
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

  const nextAction = nextBoundedAction(question, snap.currentFocus);
  if (nextAction !== undefined) {
    rows.push(`  ${chalk.hex(colors.textDim)('next:')} ${chalk.hex(colors.text)(nextAction)}`);
  }

  rows.push(...renderAttentionRows(snap, colors));

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
  const checkpoint = formatCompactCheckpoint(snap, colors);
  if (checkpoint !== undefined) rows.push(checkpoint);

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

  const nextAction = nextBoundedAction(current, snap.currentFocus);
  rows.push(
    `  ${chalk.hex(colors.textDim)('Next:')} ${chalk.hex(colors.text)(nextAction ?? (normalizeSummary(currentLine?.objective) || 'none'))}`,
  );
  rows.push(...renderAttentionRows(snap, colors));
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

  const committed = snap.latestCommittedCheckpoint;
  if (committed !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.success)('Committed checkpoint:')} ${chalk.hex(colors.text)(normalizeSummary(committed.entryId ?? committed.checkpointId))}`,
    );
  }

  if (snap.alerts.length === 0) {
    rows.push(`  ${chalk.hex(colors.textDim)('Alerts:')} ${chalk.hex(colors.textMuted)('none')}`);
  } else {
    rows.push(`  ${chalk.hex(colors.warning)('Alerts:')} ${formatAlertSummary(snap.alerts, colors)}`);
    for (const alert of orderedAlerts(snap.alerts).slice(0, MAX_ALERT_ROWS)) {
      rows.push(`    ${chalk.hex(colors.warning)('⚠')} ${chalk.hex(colors.textMuted)(normalizeSummary(alert.message))}`);
    }
    if (snap.alerts.length > MAX_ALERT_ROWS) {
      rows.push(
        `    ${chalk.hex(colors.textMuted)(`… +${String(snap.alerts.length - MAX_ALERT_ROWS)} more alerts`)}`,
      );
    }
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

function nextBoundedAction(
  question: ResearchQuestion | undefined,
  focus: ResearchStatusSnapshot['currentFocus'],
): string | undefined {
  const action = normalizeSummary(question?.nextBoundedAction ?? focus?.boundedAction);
  return action.length === 0 ? undefined : action;
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
