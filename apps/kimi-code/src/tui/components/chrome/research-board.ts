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
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@moonshot-ai/pi-tui';
import type { ResearchStatusSnapshot } from '@bhjia-phys/hakimi-sdk';
import chalk from 'chalk';

import { CURRENT_MARK } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';
import type { ColorPalette } from '#/tui/theme/colors';
import type { TodoItem } from './todo-panel';

/** Extract sub-types from the snapshot shape (the SDK only re-exports the snapshot). */
type ResearchQuestion = NonNullable<ResearchStatusSnapshot['currentQuestion']>;
type ResearchLine = ResearchStatusSnapshot['lines'][number];
type ResearchPlan = NonNullable<ResearchStatusSnapshot['researchPlan']>;
type ResearchAlert = ResearchStatusSnapshot['alerts'][number];
type AitpMaintenanceReceipt = NonNullable<ResearchStatusSnapshot['aitpMaintenance']>;
type ResearchCheckpointReceipt = NonNullable<NonNullable<ResearchStatusSnapshot['pendingCheckpoint']>['receipt']>;
type ResearchCheckpointCheckReceipt = NonNullable<ResearchCheckpointReceipt['preSaveCheck']>;
type ResearchRunState = NonNullable<ResearchStatusSnapshot['currentRun']>;

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
    if (safeWidth === 0) return [''];
    if (safeWidth === 1) return [renderHeader(snap, colors, safeWidth)];
    const lines: string[] = [
      chalk.hex(colors.border)('─'.repeat(safeWidth)),
      renderHeader(snap, colors, safeWidth),
    ];

    const contentRows = this.expanded
      ? buildExpandedRows(snap, this.todos, colors)
      : buildCompactRows(snap, colors);
    if (this.expanded) {
      lines.push(...contentRows.flatMap((row) => row.length === 0 ? [''] : wrapBoardRow(row, safeWidth)));
    } else {
      // Collapsed is a glanceable status instrument: one physical line per
      // semantic slot. Full narratives remain available in expanded mode.
      lines.push(...contentRows.map((row) => truncateToWidth(row, safeWidth, '…')));
    }
    return lines;
  }
}

function renderHeader(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
  width: number,
): string {
  if (width <= 0) return '';
  const mode = formatModeLabel(snap.mode, snap.loopStatus, colors);
  const phase = renderPhase(snap.phase, colors);
  const line = normalizeSummary(snap.currentLineSlug) || 'none';
  const health = formatHealthLabel(snap, colors);
  const alerts = orderedAlerts(snap.alerts);
  const alertSummary = alerts.length === 0
    ? ''
    : ` · ${chalk.hex(colors.warning)(`${String(alerts.length)} alert${alerts.length === 1 ? '' : 's'}`)}`;
  const full = `  ${chalk.hex(colors.primary).bold('Research')}  ${mode} · ${phase} · ${chalk.hex(colors.text)(line)} · AITP ${health}${alertSummary}`;
  if (visibleWidth(full) <= width) return full;
  const compact = `  ${chalk.hex(colors.primary).bold('Research')}  ${mode} · ${phase}${alertSummary}`;
  if (visibleWidth(compact) <= width) return compact;
  const minimal = `  ${chalk.hex(colors.primary).bold('Research')} ${mode}`;
  if (visibleWidth(minimal) <= width) return minimal;
  return width >= 1 ? chalk.hex(colors.primary).bold('R') : '';
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

const ANSI_ESCAPE = /\u001B\[[0-?]*[ -/]*[@-~]/u;

function stripAnsi(value: string): string {
  return value.replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '');
}

/** Wrap one logical board row without repeating its label on continuation lines. */
function wrapBoardRow(row: string, width: number): string[] {
  if (width <= 0) return [];
  const plain = stripAnsi(row);
  const labelEnd = plain.indexOf(': ');
  if (labelEnd < 0) return wrapTextWithAnsi(row, width);
  const prefixWidth = visibleWidth(plain.slice(0, labelEnd + 2));
  if (prefixWidth >= width - 1) {
    const [prefix, value] = splitAnsiAtVisibleWidth(row, prefixWidth);
    return [...wrapTextWithAnsi(prefix.trimEnd(), width), ...wrapTextWithAnsi(value.trimStart(), width)];
  }
  const [prefix, value] = splitAnsiAtVisibleWidth(row, prefixWidth);
  const wrapped = wrapTextWithAnsi(value.trimStart(), Math.max(1, width - prefixWidth));
  if (wrapped.length === 0) return [prefix];
  const continuation = ' '.repeat(Math.min(prefixWidth, Math.max(0, width - 1)));
  return [prefix + wrapped[0]!, ...wrapped.slice(1).map((line) => continuation + line)];
}

function splitAnsiAtVisibleWidth(value: string, targetWidth: number): [string, string] {
  let visible = 0;
  let index = 0;
  const tokenPattern = /\u001B\[[0-?]*[ -/]*[@-~]|[\s\S]/gu;
  for (const match of value.matchAll(tokenPattern)) {
    const token = match[0];
    if (ANSI_ESCAPE.test(token)) {
      index += token.length;
      continue;
    }
    const tokenWidth = visibleWidth(token);
    if (visible + tokenWidth > targetWidth) break;
    visible += tokenWidth;
    index += token.length;
    if (visible >= targetWidth) break;
  }
  return [value.slice(0, index), value.slice(index)];
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
      case 'warning': return 1;
      case 'historical_unresolved': return 2;
      case 'superseded_by_retry': return 3;
    }
  };
  return alerts
    .filter((alert) => alert.state !== 'acknowledged' && alert.state !== 'cleared' && alert.state !== 'superseded' && alert.acknowledgedAt === undefined)
    .toSorted((a, b) => rank(a) - rank(b));
}

function renderResearchCounts(
  snap: ResearchStatusSnapshot,
  otherCandidateCount: number,
  colors: ColorPalette,
): string {
  const other = otherCandidateCount > 0 ? ` · ${String(otherCandidateCount)} other candidates` : '';
  return `  ${chalk.hex(colors.textDim)('Research:')} ${chalk.hex(colors.textMuted)(`${String(snap.openQuestionCount)} open · ${String(snap.activeQuestionCount)} active · ${String(snap.blockedQuestionCount)} blocked${other}`)}`;
}

function renderGoalRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
  expanded: boolean,
): string[] {
  const goal = snap.goalSummary;
  if (goal === undefined) return [];
  const rows = [
    `  ${chalk.hex(colors.primary)('◆')} ${chalk.hex(colors.textStrong).bold('Goal milestone:')} ${chalk.hex(colors.text)(normalizeSummary(goal.objective))}`,
    `    ${chalk.hex(colors.textDim)('Goal status:')} ${chalk.hex(colors.text)(goal.status)}${goal.remainingTurns === undefined ? '' : ` · ${chalk.hex(colors.textMuted)(`${String(goal.remainingTurns)} turns remaining`)}`}`,
  ];
  if (expanded) {
    if (goal.turnBudget !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Turn budget:')} ${chalk.hex(colors.textMuted)(String(goal.turnBudget))}`);
    }
    if (goal.completionCriterion !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Completion criterion:')} ${chalk.hex(colors.text)(normalizeSummary(goal.completionCriterion))}`);
    }
    if (goal.terminalReason !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Terminal reason:')} ${chalk.hex(colors.text)(normalizeSummary(goal.terminalReason))}`);
    }
    if (goal.waitingFor !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Waiting for:')} ${chalk.hex(colors.text)(`${goal.waitingFor.policy} of ${goal.waitingFor.taskIds.length} task${goal.waitingFor.taskIds.length === 1 ? '' : 's'}`)}`);
      rows.push(...renderNamedList('Waiting task IDs', goal.waitingFor.taskIds, colors, true));
    }
  }
  return rows;
}

function renderResearchGoalRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  if (snap.program !== undefined) {
    return [
      `  ${chalk.hex(colors.primary)('◎')} ${chalk.hex(colors.textStrong).bold('Research goal:')} ${chalk.hex(colors.text)(normalizeSummary(snap.program.goalText))}`,
    ];
  }
  return [
    `  ${chalk.hex(colors.primary)('◎')} ${chalk.hex(colors.textStrong).bold('Research goal:')} ${chalk.hex(colors.textMuted)('not established')}`,
  ];
}

function renderCompactGoalMilestone(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string | undefined {
  const goal = snap.goalSummary;
  if (goal === undefined) return undefined;
  const remaining = goal.remainingTurns === undefined
    ? ''
    : ` · ${String(goal.remainingTurns)} turn${goal.remainingTurns === 1 ? '' : 's'} left`;
  return `  ${chalk.hex(colors.primary)('◆')} ${chalk.hex(colors.textDim)('Milestone:')} ${chalk.hex(goal.status === 'blocked' ? colors.warning : colors.textMuted)(`${goal.status}${remaining}`)} · ${chalk.hex(colors.text)(normalizeSummary(goal.objective))}`;
}

function renderCompactAttention(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string | undefined {
  const alerts = orderedAlerts(snap.alerts);
  const hasMaintenanceIssue = snap.aitpMaintenance?.degradedReason !== undefined;
  const hasAdapterError = snap.aitpHealth.lastError !== undefined;
  const moreSuffix = (count: number): string =>
    count > 0 ? ` · +${String(count)} more` : '';
  const gate = snap.humanGate;
  if (gate !== undefined && gate.resolvedAt === undefined) {
    const label = gate.kind === 'approval'
      ? 'Approval needed'
      : gate.kind === 'review'
        ? 'Review needed'
        : 'Decision needed';
    const additional = alerts.length + Number(hasMaintenanceIssue) + Number(hasAdapterError);
    return `  ${chalk.hex(colors.warning).bold('! Attention:')} ${chalk.hex(colors.warning)(label)} · ${chalk.hex(colors.text)(normalizeSummary(gate.prompt))}${chalk.hex(colors.textMuted)(moreSuffix(additional))}`;
  }

  const blocker = alerts.find((alert) => alertClassification(alert) === 'active_blocker');
  if (blocker !== undefined) {
    const suffix = moreSuffix(alerts.length - 1 + Number(hasMaintenanceIssue) + Number(hasAdapterError));
    return `  ${chalk.hex(colors.warning).bold('! Attention:')} ${chalk.hex(colors.text)(normalizeSummary(blocker.message))}${chalk.hex(colors.textMuted)(suffix)}`;
  }

  if (snap.aitpMaintenance?.degradedReason !== undefined) {
    const suffix = moreSuffix(alerts.length + Number(hasAdapterError));
    return `  ${chalk.hex(colors.warning).bold('! Attention:')} ${chalk.hex(colors.text)(`AITP maintenance degraded: ${snap.aitpMaintenance.degradedReason.replaceAll('_', ' ')}`)}${chalk.hex(colors.textMuted)(suffix)}`;
  }
  const alert = alerts[0];
  if (alert !== undefined) {
    const suffix = moreSuffix(alerts.length - 1 + Number(hasAdapterError));
    return `  ${chalk.hex(colors.warning).bold('! Attention:')} ${chalk.hex(colors.text)(normalizeSummary(alert.message))}${chalk.hex(colors.textMuted)(suffix)}`;
  }
  if (snap.aitpHealth.lastError !== undefined) {
    return `  ${chalk.hex(colors.warning).bold('! Attention:')} ${chalk.hex(colors.text)(normalizeSummary(snap.aitpHealth.lastError))}`;
  }
  return undefined;
}

function renderCompactNow(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string {
  const run = snap.currentRun;
  let summary: string | undefined;
  if (run !== undefined && (run.schedulerState === 'pending' || run.schedulerState === 'running')) {
    summary = `job ${normalizeSummary(run.jobId)} · ${run.schedulerState} / ${run.stage}`;
  }
  const action = snap.currentAction;
  if (summary === undefined && action !== undefined && (action.status === 'planned' || action.status === 'in_progress')) {
    summary = `${normalizeSummary(action.purpose)} · ${action.status.replaceAll('_', ' ')}`;
  }
  summary ??= normalizeSummary(snap.latestProgress?.headline) || undefined;
  summary ??= normalizeSummary(snap.currentQuestion?.wording) || undefined;
  summary ??= normalizeSummary(snap.recentStateChange?.summary) || undefined;
  const line = findCurrentLine(snap);
  summary ??= normalizeSummary(line?.assessment ?? line?.objective ?? line?.title) || undefined;
  summary ??= 'no current work recorded';
  return `  ${chalk.hex(colors.primary)('●')} ${chalk.hex(colors.textDim)('Now:')} ${renderPhase(snap.phase, colors)} · ${chalk.hex(colors.text)(summary)}`;
}

function selectNextAction(snap: ResearchStatusSnapshot): string | undefined {
  return normalizeSummary(snap.effectiveNextStep?.text)
    || normalizeSummary(snap.latestProgress?.nextAction)
    || normalizeSummary(snap.currentQuestion?.nextBoundedAction)
    || normalizeSummary(snap.currentFocus?.boundedAction)
    || undefined;
}

function renderCompactNext(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string {
  const next = selectNextAction(snap);
  const warning = snap.effectiveNextStep?.freshness === 'blocked'
    || snap.effectiveNextStep?.freshness === 'stale';
  return `  ${chalk.hex(warning ? colors.warning : colors.primary)('→')} ${chalk.hex(colors.textDim)('Next:')} ${chalk.hex(warning ? colors.warning : next === undefined ? colors.textMuted : colors.text)(next ?? 'not recorded')}`;
}

function buildCompactRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const rows = renderResearchGoalRows(snap, colors);
  const milestone = renderCompactGoalMilestone(snap, colors);
  if (milestone !== undefined) rows.push(milestone);
  const attention = renderCompactAttention(snap, colors);
  if (attention !== undefined) rows.push(attention);
  rows.push(renderCompactNow(snap, colors), renderCompactNext(snap, colors));
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
): string[] {
  const current = snap.currentQuestion;
  const currentLine = findCurrentLine(snap);
  const rows: string[] = [
    renderSectionHeading('Direction', colors),
    `  ${chalk.hex(colors.textDim)('Snapshot revision:')} ${chalk.hex(colors.textMuted)(String(snap.revision))}`,
    ...renderResearchGoalRows(snap, colors),
    ...renderGoalRows(snap, colors, true),
  ];
  if (snap.program !== undefined) {
    rows.push(
      `    ${chalk.hex(colors.textDim)('Program:')} ${chalk.hex(colors.text)(normalizeSummary(snap.program.title))} · ${chalk.hex(colors.textMuted)(`source ${normalizeSummary(snap.program.goalSource)}`)}`,
      `    ${chalk.hex(colors.textDim)('Program provenance:')} ${chalk.hex(colors.textMuted)(`topic ${normalizeSummary(snap.program.topicId)} · established ${formatRunTimestamp(snap.program.establishedAt)}`)}`,
    );
  }
  if (snap.period !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.textDim)('Research period:')} ${chalk.hex(colors.text)(normalizeSummary(snap.period.id))} · ${chalk.hex(colors.textMuted)(`${normalizeSummary(snap.period.lineSlug)} · ${String(snap.period.loopCount)} loops${snap.period.endedAt === undefined ? ' · active' : ' · ended'}`)}`,
      `    ${chalk.hex(colors.textDim)('Period timing:')} ${chalk.hex(colors.textMuted)(`${formatRunTimestamp(snap.period.startedAt)}${snap.period.endedAt === undefined ? '' : ` → ${formatRunTimestamp(snap.period.endedAt)}`}`)}`,
    );
    if (snap.period.currentQuestionId !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Period question:')} ${chalk.hex(colors.textMuted)(normalizeSummary(snap.period.currentQuestionId))}`);
    }
    if (snap.period.summary !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Period summary:')} ${chalk.hex(colors.text)(normalizeSummary(snap.period.summary))}`);
    }
  }
  rows.push(
    `  ${chalk.hex(colors.textDim)('Current line:')} ${chalk.hex(colors.text)(normalizeSummary(currentLine?.title ?? snap.currentLineSlug) || 'none')}${snap.currentLineSlug === undefined ? '' : ` · ${chalk.hex(colors.textMuted)(normalizeSummary(snap.currentLineSlug))}`}`,
    `  ${chalk.hex(colors.textStrong).bold('Current question:')} ${chalk.hex(colors.text)(normalizeSummary(current?.wording ?? snap.currentFocus?.questionId ?? 'none'))}`,
  );
  rows.push(renderAssessment(snap, current, colors));
  if (snap.currentFocus !== undefined) {
    rows.push(`  ${chalk.hex(colors.textDim)('Focus provenance:')} ${chalk.hex(colors.textMuted)(`question ${normalizeSummary(snap.currentFocus.questionId)} · revision ${String(snap.currentFocus.revision)}${snap.currentFocus.boundedAction === undefined ? '' : ` · bounded action ${normalizeSummary(snap.currentFocus.boundedAction)}`}`)}`);
  }
  rows.push(...renderExpandedNext(snap, currentLine, colors));
  if (snap.status !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.textDim)('Research status:')} ${chalk.hex(snap.status.health === 'ok' ? colors.success : snap.status.health === 'blocked' ? colors.error : colors.warning)(snap.status.health)} · ${renderPhase(snap.status.phase, colors)} · ${chalk.hex(colors.textMuted)(`revision ${String(snap.revision)}`)}`,
    );
    const statusRefs = [
      snap.status.currentLineSlug === undefined ? undefined : `line ${normalizeSummary(snap.status.currentLineSlug)}`,
      snap.status.currentQuestionId === undefined ? undefined : `question ${normalizeSummary(snap.status.currentQuestionId)}`,
      snap.status.currentActionId === undefined ? undefined : `action ${normalizeSummary(snap.status.currentActionId)}`,
    ].filter((value): value is string => value !== undefined);
    if (statusRefs.length > 0) {
      rows.push(`    ${chalk.hex(colors.textDim)('Status references:')} ${chalk.hex(colors.textMuted)(statusRefs.join(' · '))}`);
    }
    if (snap.status.nextStep !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Status next:')} ${chalk.hex(colors.text)(normalizeSummary(snap.status.nextStep))}`);
    }
  }

  rows.push('', renderSectionHeading('Current work', colors));
  rows.push(...renderExpandedScientificRows(snap, colors));
  if (snap.researchPlan !== undefined) {
    rows.push(...renderExpandedPlanRows(snap.researchPlan, colors));
  }

  rows.push('', renderSectionHeading('Research map', colors));
  rows.push(renderResearchCounts(
    snap,
    Math.max(0, candidateQuestions(snap).length - candidateQuestions(snap).filter((q) => q.lineSlug === snap.currentLineSlug).length),
    colors,
  ));
  rows.push(`  ${chalk.hex(colors.textStrong).bold('Lines')} ${chalk.hex(colors.textMuted)(`(${String(snap.lines.length)})`)}`);
  const lines = orderedLines(snap);
  if (lines.length === 0) {
    rows.push(`    ${chalk.hex(colors.textMuted)('No research lines.')}`);
  } else {
    for (const line of lines) rows.push(...renderExpandedLineRows(line, snap, colors));
  }
  rows.push(`  ${chalk.hex(colors.textStrong).bold('Questions')} ${chalk.hex(colors.textMuted)(`(${String(snap.questions.length)})`)}`);
  if (snap.questions.length === 0) {
    rows.push(`    ${chalk.hex(colors.textMuted)('No research questions.')}`);
  } else {
    for (const question of orderedQuestions(snap)) {
      rows.push(...renderExpandedQuestionRows(question, snap, colors));
    }
  }

  rows.push('', renderSectionHeading('Evidence & uncertainty', colors));
  rows.push(...renderExpandedEvidenceRows(snap, colors));

  rows.push('', renderSectionHeading('Operations & provenance', colors));
  rows.push(...renderExpandedAttentionRows(snap, colors));
  const progress = formatTodoProgress(todos);
  rows.push(
    `  ${chalk.hex(colors.textStrong).bold('External Todo actions')} ${chalk.hex(colors.textMuted)(`(${progress})`)}`,
  );
  if (todos.length === 0) {
    rows.push(`    ${chalk.hex(colors.textMuted)('No Todo actions.')}`);
  } else {
    for (const todo of todos) rows.push(renderTodoAction(todo, colors, '    ', 'Todo:'));
  }
  rows.push(...renderExpandedCheckpointRows(snap, colors));
  rows.push(...renderExpandedAdapterHealthRows(snap, colors));
  rows.push(...renderExpandedMaintenanceRows(snap, colors));
  return rows;
}

function renderSectionHeading(label: string, colors: ColorPalette): string {
  return `  ${chalk.hex(colors.primary)('▸')} ${chalk.hex(colors.textStrong).bold(label)}`;
}

function renderExpandedNext(
  snap: ResearchStatusSnapshot,
  currentLine: ResearchLine | undefined,
  colors: ColorPalette,
): string[] {
  const next = selectNextAction(snap) ?? (normalizeSummary(currentLine?.objective) || 'not recorded');
  const source = snap.effectiveNextStep === undefined
    ? ''
    : ` · ${snap.effectiveNextStep.source.replaceAll('_', ' ')} / ${snap.effectiveNextStep.freshness}`;
  const color = snap.effectiveNextStep?.freshness === 'blocked' || snap.effectiveNextStep?.freshness === 'stale'
    ? colors.warning
    : colors.text;
  const rows = [`  ${chalk.hex(colors.textDim)('Next:')} ${chalk.hex(color)(next)}${chalk.hex(colors.textMuted)(source)}`];
  const effective = snap.effectiveNextStep;
  if (effective !== undefined) {
    const derived = [
      effective.derivedFrom.actionId === undefined ? undefined : `action ${normalizeSummary(effective.derivedFrom.actionId)}`,
      effective.derivedFrom.entryId === undefined ? undefined : `entry ${normalizeSummary(effective.derivedFrom.entryId)}`,
      effective.derivedFrom.questionId === undefined ? undefined : `question ${normalizeSummary(effective.derivedFrom.questionId)}`,
      effective.derivedFrom.lineSlug === undefined ? undefined : `line ${normalizeSummary(effective.derivedFrom.lineSlug)}`,
    ].filter((value): value is string => value !== undefined);
    rows.push(`    ${chalk.hex(colors.textDim)('Next provenance:')} ${chalk.hex(colors.textMuted)(`${formatRunTimestamp(effective.observedAt)}${derived.length === 0 ? '' : ` · ${derived.join(' · ')}`}`)}`);
  }
  return rows;
}

function renderExpandedLineRows(
  line: ResearchLine,
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const rows = [renderLineSummary(line, snap, colors)];
  if (line.objective !== undefined) {
    rows.push(`      ${chalk.hex(colors.textDim)('Objective:')} ${chalk.hex(colors.text)(normalizeSummary(line.objective))}`);
  }
  if (line.assessment !== undefined) {
    rows.push(`      ${chalk.hex(colors.textDim)('Assessment:')} ${chalk.hex(colors.text)(normalizeSummary(line.assessment))}`);
  }
  rows.push(`      ${chalk.hex(colors.textDim)('Provenance:')} ${chalk.hex(colors.textMuted)(`revision ${String(line.revision)} · created ${formatRunTimestamp(line.createdAt)}`)}`);
  return rows;
}

function orderedQuestions(snap: ResearchStatusSnapshot): readonly ResearchQuestion[] {
  const currentId = snap.currentFocus?.questionId ?? snap.currentQuestion?.id;
  if (currentId === undefined) return snap.questions;
  const current = snap.questions.find((question) => question.id === currentId);
  if (current === undefined) return snap.questions;
  return [current, ...snap.questions.filter((question) => question.id !== currentId)];
}

function renderExpandedQuestionRows(
  question: ResearchQuestion,
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const current = question.id === (snap.currentFocus?.questionId ?? snap.currentQuestion?.id);
  const marker = current ? chalk.hex(colors.primary)('●') : chalk.hex(colors.textDim)('○');
  const rows = [
    `    ${marker} ${chalk.hex(current ? colors.textStrong : colors.text)(normalizeSummary(question.wording))} ${chalk.hex(colors.textMuted)(`(${normalizeSummary(question.id)}) · ${question.workflow}/${question.epistemic}/${question.persistence} · priority ${String(question.priority)}`)}`,
  ];
  if (question.assessment !== undefined) {
    rows.push(`      ${chalk.hex(colors.textDim)('Assessment:')} ${chalk.hex(colors.text)(normalizeSummary(question.assessment))}`);
  }
  if (question.neededEvidence.length > 0) {
    rows.push(`      ${chalk.hex(colors.textDim)('Needed evidence:')} ${chalk.hex(colors.text)(question.neededEvidence.map(normalizeSummary).join(' · '))}`);
  }
  if (question.evidenceRefs.length > 0) {
    rows.push(`      ${chalk.hex(colors.textDim)('Evidence refs:')} ${chalk.hex(colors.textMuted)(question.evidenceRefs.map(normalizeSummary).join(' · '))}`);
  }
  if (question.falsifierRefs.length > 0) {
    rows.push(`      ${chalk.hex(colors.textDim)('Falsifier refs:')} ${chalk.hex(colors.textMuted)(question.falsifierRefs.map(normalizeSummary).join(' · '))}`);
  }
  if (question.nextBoundedAction !== undefined) {
    rows.push(`      ${chalk.hex(colors.textDim)('Bounded next action:')} ${chalk.hex(colors.text)(normalizeSummary(question.nextBoundedAction))}`);
  }
  rows.push(`      ${chalk.hex(colors.textDim)('Provenance:')} ${chalk.hex(colors.textMuted)(`line ${normalizeSummary(question.lineSlug)} · revision ${String(question.revision)}`)}`);
  return rows;
}

function renderExpandedEvidenceRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const rows: string[] = [];
  const current = snap.currentQuestion;
  if (current === undefined) {
    rows.push(`  ${chalk.hex(colors.textDim)('Focused-question evidence:')} ${chalk.hex(colors.textMuted)('none selected')}`);
  } else {
    rows.push(
      `  ${chalk.hex(colors.textStrong).bold('Focused-question evidence')} ${chalk.hex(colors.textMuted)(`${String(current.neededEvidence.length)} needed · ${String(current.evidenceRefs.length)} found · ${String(current.falsifierRefs.length)} falsifiers`)}`,
    );
    rows.push(...renderNamedList('Needed evidence', current.neededEvidence, colors));
    rows.push(...renderNamedList('Evidence refs', current.evidenceRefs, colors, true));
    rows.push(...renderNamedList('Falsifier refs', current.falsifierRefs, colors, true));
  }

  const progress = snap.latestProgress;
  if (progress === undefined) {
    rows.push(`  ${chalk.hex(colors.textDim)('Progress evidence:')} ${chalk.hex(colors.textMuted)('No progress recorded for this cycle.')}`);
    return rows;
  }
  rows.push(`  ${chalk.hex(colors.textStrong).bold('Progress evidence')}`);
  rows.push(...renderNamedList('Uncertainties', progress.uncertainties, colors, false, colors.warning));
  const detail = progress.detail;
  if (detail === undefined) {
    rows.push(`    ${chalk.hex(colors.textMuted)('No detailed evidence packet recorded.')}`);
    return rows;
  }
  rows.push(...renderNamedList('Assumptions', detail.assumptions ?? [], colors));
  if (detail.derivation !== undefined) {
    rows.push(`    ${chalk.hex(colors.textDim)('Derivation:')} ${chalk.hex(colors.text)(normalizeSummary(detail.derivation))}`);
  }
  rows.push(...renderNamedList('Tests', detail.tests ?? [], colors));
  rows.push(...renderNamedList('Observations', detail.observations ?? [], colors));
  rows.push(...renderNamedList('Sources', detail.sources ?? [], colors, true));
  rows.push(...renderNamedList('Limitations', detail.limitations ?? [], colors, false, colors.warning));
  rows.push(...renderNamedList('Artifacts', detail.artifactRefs ?? [], colors, true));
  if (detail.detailHint !== undefined) {
    rows.push(`    ${chalk.hex(colors.textDim)('Detail hint:')} ${chalk.hex(colors.textMuted)(normalizeSummary(detail.detailHint))}`);
  }
  return rows;
}

function renderNamedList(
  label: string,
  values: readonly string[],
  colors: ColorPalette,
  muted = false,
  valueColor?: string,
): string[] {
  const normalized = values.map(normalizeSummary).filter((value) => value.length > 0);
  if (normalized.length === 0) return [];
  const color = valueColor ?? (muted ? colors.textMuted : colors.text);
  return [
    `    ${chalk.hex(colors.textDim)(`${label}:`)} ${chalk.hex(color)(normalized.join(' · '))}`,
  ];
}

function renderExpandedAttentionRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const rows: string[] = [];
  const gate = snap.humanGate;
  if (gate !== undefined) {
    const state = gate.resolvedAt === undefined ? 'open' : 'resolved';
    rows.push(
      `  ${chalk.hex(gate.resolvedAt === undefined ? colors.warning : colors.success).bold('Human gate:')} ${chalk.hex(colors.text)(normalizeSummary(gate.prompt))} · ${chalk.hex(colors.textMuted)(`${gate.kind} / ${state}`)}`,
    );
    if (gate.resolution !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Resolution:')} ${chalk.hex(colors.text)(normalizeSummary(gate.resolution))}`);
    }
    const gateRefs = [
      `gate ${normalizeSummary(gate.gateId)}`,
      gate.actionId === undefined ? undefined : `action ${normalizeSummary(gate.actionId)}`,
      gate.questionId === undefined ? undefined : `question ${normalizeSummary(gate.questionId)}`,
      `created ${formatRunTimestamp(gate.createdAt)}`,
      gate.resolvedAt === undefined ? undefined : `resolved ${formatRunTimestamp(gate.resolvedAt)}`,
    ].filter((value): value is string => value !== undefined);
    rows.push(`    ${chalk.hex(colors.textDim)('Gate provenance:')} ${chalk.hex(colors.textMuted)(gateRefs.join(' · '))}`);
  }
  if (snap.status?.attention !== undefined) {
    rows.push(...renderNamedList('Derived attention', snap.status.attention, colors, false, colors.warning));
  }

  const alerts = snap.alerts.toSorted((a, b) => {
    const aActive = a.state === undefined || a.state === 'active';
    const bActive = b.state === undefined || b.state === 'active';
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
  rows.push(`  ${chalk.hex(colors.textStrong).bold('Alerts')} ${chalk.hex(colors.textMuted)(`(${String(alerts.length)})`)}`);
  if (alerts.length === 0) {
    rows.push(`    ${chalk.hex(colors.textMuted)('No alerts.')}`);
  }
  for (const alert of alerts) {
    const classification = alertClassification(alert);
    const state = alert.state ?? (alert.acknowledgedAt === undefined ? 'active' : 'acknowledged');
    const label = classification === 'active_blocker'
      ? 'active blocker'
      : classification.replaceAll('_', ' ');
    const color = classification === 'active_blocker' && state === 'active' ? colors.error : colors.warning;
    rows.push(
      `    ${chalk.hex(color)(classification === 'active_blocker' ? '!' : '◇')} ${chalk.hex(color)(label)} · ${chalk.hex(colors.text)(normalizeSummary(alert.message))} · ${chalk.hex(colors.textMuted)(state)}`,
    );
    const association = [
      `fingerprint ${normalizeSummary(alert.fingerprint)}`,
      `kind ${alert.kind}`,
      alert.source === undefined ? undefined : `source ${alert.source}`,
      alert.reason === undefined ? undefined : `reason ${normalizeSummary(alert.reason)}`,
      alert.questionId === undefined ? undefined : `question ${normalizeSummary(alert.questionId)}`,
      alert.lineSlug === undefined ? undefined : `line ${normalizeSummary(alert.lineSlug)}`,
      alert.relatedEntryId === undefined ? undefined : `entry ${normalizeSummary(alert.relatedEntryId)}`,
      alert.workstream === undefined ? undefined : `workstream ${normalizeSummary(alert.workstream)}`,
      alert.retryOfEntryId === undefined ? undefined : `retry of ${normalizeSummary(alert.retryOfEntryId)}`,
      `created ${formatRunTimestamp(alert.createdAt)}`,
      alert.acknowledgedAt === undefined ? undefined : `acknowledged ${formatRunTimestamp(alert.acknowledgedAt)}`,
    ].filter((value): value is string => value !== undefined).join(' · ');
    if (association.length > 0) rows.push(`      ${chalk.hex(colors.textMuted)(association)}`);
  }
  return rows;
}

function renderCheckpointCheckReceiptRows(
  label: string,
  check: ResearchCheckpointCheckReceipt | undefined,
  colors: ColorPalette,
  indent: string,
): string[] {
  if (check === undefined) return [];
  const rows = [
    `${indent}${chalk.hex(colors.textDim)(`${label}:`)} ${chalk.hex(check.status === 'clean' ? colors.success : colors.warning)(`${check.status} · errors ${String(check.errors)} · warnings ${String(check.warnings)} · ${formatRunTimestamp(check.checkedAt)}`)}`,
  ];
  const append = (name: string, values: readonly string[] | undefined): void => {
    if (values === undefined || values.length === 0) return;
    rows.push(`${indent}  ${chalk.hex(colors.textDim)(`${name}:`)} ${chalk.hex(colors.textMuted)(values.map(normalizeSummary).join(' · '))}`);
  };
  append('Finding fingerprints', check.findingFingerprints);
  append('Error fingerprints', check.errorFindingFingerprints);
  append('New error fingerprints', check.newErrorFindingFingerprints);
  append('Pre-existing error fingerprints', check.preExistingErrorFindingFingerprints);
  return rows;
}

function renderCheckpointReceiptRows(
  receipt: ResearchCheckpointReceipt | undefined,
  colors: ColorPalette,
  indent = '      ',
): string[] {
  if (receipt === undefined) return [];
  const rows: string[] = [];
  const prepare = receipt.prepare;
  if (prepare !== undefined) {
    rows.push(`${indent}${chalk.hex(colors.textDim)('Prepare receipt:')} ${chalk.hex(colors.text)(prepare.status)} · ${chalk.hex(colors.textMuted)(`path ${normalizeSummary(prepare.path)}`)}`);
    const prepareRefs = [
      prepare.id === undefined ? undefined : `id ${normalizeSummary(prepare.id)}`,
      prepare.idempotencyKey === undefined ? undefined : `idempotency ${normalizeSummary(prepare.idempotencyKey)}`,
      prepare.workstreams === undefined || prepare.workstreams.length === 0
        ? undefined
        : `workstreams ${prepare.workstreams.map(normalizeSummary).join(' · ')}`,
    ].filter((value): value is string => value !== undefined);
    if (prepareRefs.length > 0) rows.push(`${indent}  ${chalk.hex(colors.textMuted)(prepareRefs.join(' · '))}`);
  }
  const save = receipt.save;
  if (save !== undefined) {
    rows.push(`${indent}${chalk.hex(colors.textDim)('Save receipt:')} ${chalk.hex(colors.text)(save.status)} · ${chalk.hex(colors.textMuted)(`draft ${normalizeSummary(save.draftPath)} · path ${normalizeSummary(save.path)}${save.source === undefined ? '' : ` · source ${save.source}`}`)}`);
  }
  rows.push(
    ...renderCheckpointCheckReceiptRows('Pre-save check', receipt.preSaveCheck, colors, indent),
    ...renderCheckpointCheckReceiptRows('Post-save check', receipt.postSaveCheck, colors, indent),
  );
  return rows;
}

function renderExpandedCheckpointRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const rows = [`  ${chalk.hex(colors.textStrong).bold('Checkpoints')}`];
  const pending = snap.pendingCheckpoint;
  if (pending !== undefined) {
    rows.push(`    ${chalk.hex(colors.warning)('Pending:')} ${chalk.hex(colors.text)(normalizeSummary(pending.checkpointId))} · ${chalk.hex(colors.textMuted)(pending.persistence)}`);
    const refs = [
      pending.committedEntryId === undefined ? undefined : `committed entry ${normalizeSummary(pending.committedEntryId)}`,
      pending.questionId === undefined ? undefined : `question ${normalizeSummary(pending.questionId)}`,
      pending.questionRevision === undefined ? undefined : `question revision ${String(pending.questionRevision)}`,
      pending.lineSlug === undefined ? undefined : `line ${normalizeSummary(pending.lineSlug)}`,
    ].filter((value): value is string => value !== undefined);
    if (refs.length > 0) rows.push(`      ${chalk.hex(colors.textDim)('References:')} ${chalk.hex(colors.textMuted)(refs.join(' · '))}`);
    if (pending.assessment !== undefined) {
      rows.push(`      ${chalk.hex(colors.textDim)('Assessment:')} ${chalk.hex(colors.text)(normalizeSummary(pending.assessment))}`);
    }
    if (pending.nextAction !== undefined) {
      rows.push(`      ${chalk.hex(colors.textDim)('Next:')} ${chalk.hex(colors.text)(normalizeSummary(pending.nextAction))}`);
    }
    rows.push(
      `      ${chalk.hex(colors.textDim)('Idempotency key:')} ${chalk.hex(colors.textMuted)(normalizeSummary(pending.idempotencyKey))}`,
      `      ${chalk.hex(colors.textDim)('Created:')} ${chalk.hex(colors.textMuted)(formatRunTimestamp(pending.createdAt))}`,
      ...renderCheckpointReceiptRows(pending.receipt, colors),
    );
  }
  const committed = snap.latestCommittedCheckpoint;
  if (committed !== undefined) {
    rows.push(`    ${chalk.hex(colors.success)('✓ Latest committed:')} ${chalk.hex(colors.text)(normalizeSummary(committed.checkpointId))}${committed.entryId === undefined ? '' : ` · ${chalk.hex(colors.textMuted)(`entry ${normalizeSummary(committed.entryId)}`)}`} · ${chalk.hex(colors.textMuted)(formatRunTimestamp(committed.committedAt))}`);
    rows.push(...renderCheckpointReceiptRows(committed.receipt, colors));
  }
  const history = snap.committedCheckpointHistory ?? [];
  if (history.length > 0) {
    rows.push(`    ${chalk.hex(colors.textDim)('Committed history:')}`);
    for (const checkpoint of history) {
      const entry = checkpoint.entryId === undefined
        ? ''
        : ` · ${chalk.hex(colors.textMuted)(`entry ${normalizeSummary(checkpoint.entryId)}`)}`;
      rows.push(`      ${chalk.hex(colors.text)(normalizeSummary(checkpoint.checkpointId))}${entry} · ${chalk.hex(colors.textMuted)(formatRunTimestamp(checkpoint.committedAt))}`);
      rows.push(...renderCheckpointReceiptRows(checkpoint.receipt, colors, '        '));
    }
  }
  if (pending === undefined && committed === undefined && history.length === 0) {
    rows.push(`    ${chalk.hex(colors.textMuted)('No checkpoints.')}`);
  }
  return rows;
}

function renderExpandedAdapterHealthRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const health = snap.aitpHealth;
  const rows = [
    `  ${chalk.hex(colors.textStrong).bold('AITP adapter')} · ${formatHealthLabel(snap, colors)}`,
  ];
  const versions = [
    health.contractVersion === undefined ? undefined : `contract ${normalizeSummary(health.contractVersion)}`,
    health.pluginVersion === undefined ? undefined : `plugin ${normalizeSummary(health.pluginVersion)}`,
    health.pythonVersion === undefined ? undefined : `Python ${normalizeSummary(health.pythonVersion)}`,
  ].filter((value): value is string => value !== undefined);
  if (versions.length > 0) rows.push(`    ${chalk.hex(colors.textDim)('Versions:')} ${chalk.hex(colors.textMuted)(versions.join(' · '))}`);
  if (health.notInitialized === true) rows.push(`    ${chalk.hex(colors.warning)('Adapter is not initialized.')}`);
  if (health.lastCheckAt !== undefined) rows.push(`    ${chalk.hex(colors.textDim)('Last check:')} ${chalk.hex(colors.textMuted)(formatRunTimestamp(health.lastCheckAt))}`);
  if (health.lastError !== undefined) rows.push(`    ${chalk.hex(colors.warning)('Last error:')} ${chalk.hex(colors.text)(normalizeSummary(health.lastError))}`);
  return rows;
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
  return `    ${title} ${details}${marker}`;
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

function renderExpandedPlanRows(
  plan: ResearchPlan,
  colors: ColorPalette,
): string[] {
  const rows = [
    `  ${chalk.hex(colors.textStrong).bold('Research plan')} · ${chalk.hex(colors.textMuted)(plan.status)}`,
    `    ${chalk.hex(colors.textDim)('Plan provenance:')} ${chalk.hex(colors.textMuted)(`${normalizeSummary(plan.planId)} · research revision ${String(plan.researchRevision)}`)}`,
    `    ${chalk.hex(colors.textDim)('Objective:')} ${chalk.hex(colors.text)(normalizeSummary(plan.objective))}`,
    `    ${chalk.hex(colors.textDim)('Stop condition:')} ${chalk.hex(colors.text)(normalizeSummary(plan.stopCondition))}`,
  ];
  const refs = [
    plan.programId === undefined ? undefined : `program ${normalizeSummary(plan.programId)}`,
    plan.periodId === undefined ? undefined : `period ${normalizeSummary(plan.periodId)}`,
    plan.lineSlug === undefined ? undefined : `line ${normalizeSummary(plan.lineSlug)}`,
    plan.questionId === undefined ? undefined : `question ${normalizeSummary(plan.questionId)}`,
    plan.lineRevision === undefined ? undefined : `line revision ${String(plan.lineRevision)}`,
    plan.questionRevision === undefined ? undefined : `question revision ${String(plan.questionRevision)}`,
  ].filter((value): value is string => value !== undefined);
  if (refs.length > 0) {
    rows.push(`    ${chalk.hex(colors.textDim)('Plan references:')} ${chalk.hex(colors.textMuted)(refs.join(' · '))}`);
  }
  for (const [index, step] of plan.steps.entries()) {
    rows.push(`    ${chalk.hex(colors.textDim)(`${String(index + 1)}.`)} ${chalk.hex(colors.text)(normalizeSummary(step))}`);
  }
  if (plan.expectedEvidence.length > 0) {
    rows.push(`    ${chalk.hex(colors.textDim)('Expected evidence:')} ${chalk.hex(colors.text)(plan.expectedEvidence.map(normalizeSummary).join(' · '))}`);
  }
  if (plan.resolution !== undefined) {
    rows.push(
      `    ${chalk.hex(colors.textDim)('Resolution:')} ${chalk.hex(colors.text)(plan.resolution.outcome)} · ${chalk.hex(colors.textMuted)(`${normalizeSummary(plan.resolution.planId)} revision ${String(plan.resolution.planRevision)}${plan.resolution.selectedLabel === undefined ? '' : ` · ${normalizeSummary(plan.resolution.selectedLabel)}`}`)}`,
    );
  }
  return rows;
}

function formatRunTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return 'unknown';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString();
}

/** Expanded scientific detail without the disclosure caps used by compact mode. */
function renderExpandedScientificRows(
  snap: ResearchStatusSnapshot,
  colors: ColorPalette,
): string[] {
  const rows: string[] = [
    `  ${chalk.hex(colors.textDim)('Phase:')} ${renderPhase(snap.phase, colors)}`,
  ];
  const change = snap.recentStateChange;
  if (change !== undefined) {
    rows.push(
      `  ${chalk.hex(colors.textDim)('Recent change:')} ${chalk.hex(colors.text)(normalizeSummary(change.summary))} · ${chalk.hex(colors.textMuted)(`${PHASE_LABELS[change.beforePhase]} → ${PHASE_LABELS[change.afterPhase]} · ${formatRunTimestamp(change.changedAt)}`)}`,
    );
    if (change.actionId !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Change action:')} ${chalk.hex(colors.textMuted)(normalizeSummary(change.actionId))}`);
    }
  }

  const progress = snap.latestProgress;
  if (progress !== undefined) {
    rows.push(`  ${chalk.hex(colors.textStrong).bold('Latest progress')}`);
    const fields: Array<[string, string]> = [
      ['Headline', normalizeSummary(progress.headline)],
      ['Question', normalizeSummary(progress.question)],
      ['Motivation', normalizeSummary(progress.motivation)],
      ['Work', normalizeSummary(progress.workPerformed)],
      ['Result', normalizeSummary(progress.result)],
      ['Impact', normalizeSummary(progress.mainlineImpact)],
    ];
    for (const [label, value] of fields) {
      if (value.length === 0) continue;
      rows.push(
        `    ${chalk.hex(colors.textDim)(label + ':')} ${chalk.hex(colors.text)(value)}`,
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
    if (progress.humanDecision !== undefined) {
      rows.push(
        `    ${chalk.hex(colors.textDim)('Human decision:')} ${chalk.hex(colors.text)(normalizeSummary(progress.humanDecision))}`,
      );
    }
    rows.push(
      `    ${chalk.hex(colors.textDim)('Recorded:')} ${chalk.hex(colors.textMuted)(formatRunTimestamp(progress.recordedAt))}`,
    );
  } else {
    rows.push(
      `  ${chalk.hex(colors.textDim)('Progress:')} ${chalk.hex(colors.textMuted)('No progress recorded for this cycle.')}`,
    );
  }

  const action = snap.currentAction;
  if (action !== undefined) {
    rows.push(`  ${chalk.hex(colors.textStrong).bold('Current action')}`);
    rows.push(
      `    ${chalk.hex(colors.textDim)('Action:')} ${chalk.hex(colors.text)(normalizeSummary(action.actionId))} · ${chalk.hex(colors.textMuted)(`${action.kind} / ${action.status}`)}`,
    );
    rows.push(`    ${chalk.hex(colors.textDim)('Purpose:')} ${chalk.hex(colors.text)(normalizeSummary(action.purpose))}`);
    const actionRefs = [
      action.questionId === undefined ? undefined : `question ${normalizeSummary(action.questionId)}`,
      action.lineSlug === undefined ? undefined : `line ${normalizeSummary(action.lineSlug)}`,
    ].filter((value): value is string => value !== undefined);
    if (actionRefs.length > 0) {
      rows.push(`    ${chalk.hex(colors.textDim)('Action references:')} ${chalk.hex(colors.textMuted)(actionRefs.join(' · '))}`);
    }
    rows.push(...renderNamedList('Expected evidence', action.expectedEvidence, colors));
    rows.push(`    ${chalk.hex(colors.textDim)('Stop condition:')} ${chalk.hex(colors.text)(normalizeSummary(action.stopCondition))}`);
    rows.push(...renderNamedList('Allowed tools', action.allowedToolKinds, colors, true));
    rows.push(
      `    ${chalk.hex(colors.textDim)('Human approval:')} ${chalk.hex(action.requiresHumanApproval ? colors.warning : colors.textMuted)(action.requiresHumanApproval ? 'required' : 'not required')}`,
    );
    if (action.retryOfEntryId !== undefined) {
      rows.push(`    ${chalk.hex(colors.textDim)('Retry of:')} ${chalk.hex(colors.textMuted)(normalizeSummary(action.retryOfEntryId))}`);
    }
    rows.push(
      `    ${chalk.hex(colors.textDim)('Created:')} ${chalk.hex(colors.textMuted)(formatRunTimestamp(action.createdAt))}${action.completedAt === undefined ? '' : ` · ${chalk.hex(colors.textDim)('Completed:')} ${chalk.hex(colors.textMuted)(formatRunTimestamp(action.completedAt))}`}`,
    );
  }

  const runs = [snap.currentRun, action?.run]
    .filter((run): run is ResearchRunState => run !== undefined)
    .filter((run, index, all) => all.findIndex((candidate) =>
      candidate.actionId === run.actionId
      && candidate.campaign === run.campaign
      && candidate.jobId === run.jobId) === index);
  for (const run of runs) {
    rows.push(`  ${chalk.hex(colors.textStrong).bold('Current run')}`);
    rows.push(
      `    ${chalk.hex(colors.textDim)('Campaign:')} ${chalk.hex(colors.text)(normalizeSummary(run.campaign))} · ${chalk.hex(colors.textDim)('Job:')} ${chalk.hex(colors.text)(normalizeSummary(run.jobId))}`,
      `    ${chalk.hex(colors.textDim)('Action ID:')} ${chalk.hex(colors.textMuted)(normalizeSummary(run.actionId))}`,
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
    if (run.sourcePin !== undefined) rows.push(`    ${chalk.hex(colors.textDim)('Source pin:')} ${chalk.hex(colors.textMuted)(normalizeSummary(run.sourcePin))}`);
    if (run.binaryPin !== undefined) rows.push(`    ${chalk.hex(colors.textDim)('Binary pin:')} ${chalk.hex(colors.textMuted)(normalizeSummary(run.binaryPin))}`);
    if (run.artifactRefs.length > 0) {
      rows.push(
        `    ${chalk.hex(colors.textDim)('Artifacts:')} ${chalk.hex(colors.textMuted)(run.artifactRefs.map(normalizeSummary).join(' · '))}`,
      );
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
    ...(maintenance.degradedReason === undefined
      ? []
      : [`    ${chalk.hex(colors.textDim)('Degraded reason:')} ${chalk.hex(colors.warning)(maintenance.degradedReason.replaceAll('_', ' '))}`]),
    `    ${chalk.hex(colors.textDim)('Memory:')} ${chalk.hex(colors.text)(formatMaintenanceMemoryStatus(maintenance.memoryStatus))}`,
    `    ${chalk.hex(colors.textDim)('Refreshed:')} ${chalk.hex(colors.textMuted)(formatRunTimestamp(maintenance.refreshedAt))}`,
    `    ${chalk.hex(colors.textDim)('Working Note:')} ${renderWorkingNoteFreshness(maintenance, colors)}`,
    `    ${chalk.hex(colors.textDim)('Historical unresolved failures:')} ${chalk.hex(maintenance.unresolvedFailureCount > 0 ? colors.warning : colors.text)(String(maintenance.unresolvedFailureCount))}`,
    `    ${chalk.hex(colors.textDim)('Recorded handoff next:')} ${chalk.hex(colors.text)(normalizeSummary(maintenance.nextAction) || 'none recorded')}`,
    `    ${chalk.hex(colors.textDim)('Structural check:')} ${renderMaintenanceCheck(maintenance.check, colors)}`,
  ];

  if (maintenance.workstream !== undefined) {
    rows.push(`    ${chalk.hex(colors.textDim)('Workstream:')} ${chalk.hex(colors.textMuted)(normalizeSummary(maintenance.workstream))}`);
  }
  if (maintenance.topic !== undefined) {
    rows.push(
      `    ${chalk.hex(colors.textDim)('Topic:')} ${chalk.hex(colors.text)(normalizeSummary(maintenance.topic.title))} · ${chalk.hex(colors.textMuted)(`${normalizeSummary(maintenance.topic.id)} · ${normalizeSummary(maintenance.topic.goalText)} · source ${normalizeSummary(maintenance.topic.goalSource)}`)}`,
    );
  }
  if (maintenance.nextActionDetails !== undefined) {
    const details = maintenance.nextActionDetails;
    rows.push(
      `    ${chalk.hex(colors.textDim)('Next-action provenance:')} ${chalk.hex(colors.text)(normalizeSummary(details.text))} · ${chalk.hex(colors.textMuted)(`${normalizeSummary(details.entryId)} · ${details.authority} · ${normalizeSummary(details.source)}${details.createdAt === undefined ? '' : ` · ${formatRunTimestamp(details.createdAt)}`}`)}`,
    );
  }

  for (const failure of maintenance.unresolvedFailures) {
    const workstream = normalizeSummary(failure.workstream);
    const scope = workstream.length === 0 ? '' : ` · workstream ${workstream}`;
    rows.push(
      `      ${chalk.hex(colors.warning)('◇')} ${chalk.hex(colors.text)(failure.entryId)}${chalk.hex(colors.textMuted)(scope)} — ${chalk.hex(colors.textMuted)(normalizeSummary(failure.summary))}`,
      `        ${chalk.hex(colors.textDim)('Failure provenance:')} ${chalk.hex(colors.textMuted)(`${failure.kind} · ${failure.authority} · ${normalizeSummary(failure.source)}${failure.createdAt === undefined ? '' : ` · ${formatRunTimestamp(failure.createdAt)}`}`)}`,
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
    : formatRunTimestamp(maintenance.latestWorkingNoteAt);
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

function renderMaintenanceCheck(
  check: AitpMaintenanceReceipt['check'],
  colors: ColorPalette,
): string {
  const counts = check.counts;
  const summary = counts === undefined
    ? check.status
    : `${check.status} · entries ${String(counts.entries)} · notes ${String(counts.notes)} · errors ${String(counts.errors)} · warnings ${String(counts.warnings)}`;
  return chalk.hex(check.status === 'clean' ? colors.success : colors.warning)(summary);
}

function formatMaintenanceCodes(codes: readonly string[]): string | undefined {
  const normalized = codes.map(normalizeSummary).filter((code) => code.length > 0);
  if (normalized.length === 0) return undefined;
  return normalized.join(', ');
}
