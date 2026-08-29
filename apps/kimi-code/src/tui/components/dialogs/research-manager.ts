/**
 * Line-first Research Manager and the question / line edit dialogs used by
 * `/research manage` and `/research edit <questionId>`.
 *
 * The manager uses SearchableList for both levels: the first level selects a
 * research line, and Enter narrows the second level to that line's questions.
 * Letter actions are deliberately handled here so the dialog stays independent
 * from the SDK and the command layer remains the mutation owner.
 */

import {
  Container,
  Input,
  Key,
  matchesKey,
  CURSOR_MARKER,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@moonshot-ai/pi-tui';
import type { ResearchStatusSnapshot } from '@bhjia-phys/hakimi-sdk';
import chalk from 'chalk';

import { CURRENT_MARK, SELECT_POINTER } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';
import { isPrintableChar, printableChar } from '#/tui/utils/printable-key';
import { SearchableList } from '#/tui/utils/searchable-list';

const ELLIPSIS = '…';

function collapseSummary(value: string | undefined): string {
  return (value ?? '').replaceAll(/\s+/gu, ' ').trim();
}

function formatDialogError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

type ResearchQuestion = NonNullable<ResearchStatusSnapshot['currentQuestion']>;
type ResearchLine = ResearchStatusSnapshot['lines'][number];
type ResearchAlert = ResearchStatusSnapshot['alerts'][number];
type ResearchHumanGate = NonNullable<ResearchStatusSnapshot['humanGate']>;
type ResearchRecoveryPhase = Extract<
  ResearchStatusSnapshot['phase'],
  'idle' | 'gap_analysis' | 'action_planned' | 'action_executing' | 'evaluating'
>;

type LineStatus = 'active' | 'paused' | 'completed' | 'blocked';

const RESEARCH_RECOVERY_PHASES = [
  'idle',
  'gap_analysis',
  'action_planned',
  'action_executing',
  'evaluating',
] as const satisfies readonly ResearchRecoveryPhase[];

type ResearchAttentionItem =
  | { readonly kind: 'gate'; readonly gate: ResearchHumanGate }
  | { readonly kind: 'alert'; readonly alert: ResearchAlert };

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export type ResearchManagerAction =
  | { readonly kind: 'edit'; readonly questionId: string }
  | {
      readonly kind: 'focus';
      readonly questionId: string;
      readonly boundedAction?: string;
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
  | {
      readonly kind: 'resolve_human_decision';
      readonly gateId: string;
      readonly resolution: string;
      readonly nextPhase: ResearchRecoveryPhase;
    }
  | {
      readonly kind: 'acknowledge_alert';
      readonly fingerprint: string;
    }
  | {
      readonly kind: 'edit_line';
      readonly lineSlug: string;
    }
  | {
      readonly kind: 'switch_line';
      readonly lineSlug: string;
      readonly expectedRevision: number;
    }
  | {
      readonly kind: 'pause_loop' | 'resume_loop';
      readonly lineSlug: string;
      readonly expectedRevision: number;
    }
  | {
      readonly kind: 'update_line';
      readonly lineSlug: string;
      readonly expectedRevision: number;
      readonly status: LineStatus;
    };

export interface ResearchManagerOptions {
  readonly snapshot: ResearchStatusSnapshot;
  readonly selectedQuestionId?: string;
  readonly selectedLineSlug?: string;
  readonly initialView?: 'attention' | 'lines' | 'questions';
  readonly pageSize?: number;
  readonly onAction: (
    action: ResearchManagerAction,
  ) => ResearchStatusSnapshot | void | Promise<ResearchStatusSnapshot | void>;
  readonly onCancel: () => void;
}

export class ResearchManagerComponent extends Container implements Focusable {
  focused = false;

  private readonly opts: ResearchManagerOptions;
  private snapshot: ResearchStatusSnapshot;
  private view: 'attention' | 'lines' | 'questions' = 'lines';
  private attentionMode: 'list' | 'resolution' | 'phase' = 'list';
  private selectedLineSlug: string | undefined;
  private lineList: SearchableList<ResearchLine>;
  private questionList: SearchableList<ResearchQuestion>;
  private attentionList: SearchableList<ResearchAttentionItem>;
  private readonly phaseList: SearchableList<ResearchRecoveryPhase>;
  private readonly resolutionInput = new Input();
  private resolutionGateId: string | undefined;
  private resolutionError: string | undefined;
  private busy = false;

  constructor(opts: ResearchManagerOptions) {
    super();
    this.opts = opts;
    this.snapshot = opts.snapshot;
    this.view = opts.initialView ?? 'lines';
    this.selectedLineSlug = opts.selectedLineSlug ?? opts.snapshot.currentLineSlug;
    this.lineList = this.createLineList(this.selectedLineSlug);
    this.questionList = this.createQuestionList(
      this.selectedLineSlug,
      opts.selectedQuestionId,
    );
    this.attentionList = this.createAttentionList();
    this.phaseList = new SearchableList({
      items: [...RESEARCH_RECOVERY_PHASES],
      toSearchText: (phase) => phaseLabel(phase),
      pageSize: RESEARCH_RECOVERY_PHASES.length,
      searchable: false,
    });
    this.resolutionInput.onSubmit = (value) => this.submitResolution(value);
  }

  handleInput(data: string): void {
    if (this.busy) return;
    if (this.view === 'attention') {
      this.handleAttentionInput(data);
      return;
    }

    if (matchesKey(data, Key.escape)) {
      if (this.view === 'questions') {
        this.view = 'lines';
        this.lineList = this.createLineList(this.selectedLineSlug);
        this.invalidate();
      } else {
        this.opts.onCancel();
      }
      return;
    }

    if (this.view === 'lines') {
      this.handleLineInput(data);
      return;
    }
    this.handleQuestionInput(data);
  }

  private handleAttentionInput(data: string): void {
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl('c')) ||
      matchesKey(data, Key.ctrl('d'))
    ) {
      if (this.attentionMode === 'phase') {
        this.attentionMode = 'resolution';
        this.invalidate();
      } else if (this.attentionMode === 'resolution') {
        this.attentionMode = 'list';
        this.resolutionError = undefined;
        this.invalidate();
      } else {
        this.opts.onCancel();
      }
      return;
    }

    if (this.attentionMode === 'resolution') {
      this.resolutionInput.handleInput(data);
      this.resolutionError = undefined;
      this.invalidate();
      return;
    }

    if (this.attentionMode === 'phase') {
      if (matchesKey(data, Key.enter)) {
        const phase = this.phaseList.selected();
        const gate = this.unresolvedHumanGate();
        const resolution = this.resolutionInput.getValue().trim();
        if (
          gate !== undefined &&
          this.resolutionGateId !== undefined &&
          phase !== undefined &&
          resolution.length > 0
        ) {
          void this.applyAction({
            kind: 'resolve_human_decision',
            gateId: this.resolutionGateId,
            resolution,
            nextPhase: phase,
          });
        }
        return;
      }
      this.phaseList.handleKey(data);
      return;
    }

    const decoded = printableChar(data).toLowerCase();
    if (decoded === 'l') {
      this.view = 'lines';
      this.invalidate();
      return;
    }
    const selected = this.attentionList.selected();
    if (selected?.kind === 'gate' && decoded === 'r') {
      this.beginResolution();
      return;
    }
    if (selected?.kind === 'alert' && decoded === 'a') {
      void this.applyAction({
        kind: 'acknowledge_alert',
        fingerprint: selected.alert.fingerprint,
      });
      return;
    }
    this.attentionList.handleKey(data);
  }

  override render(width: number): string[] {
    const safeWidth = Math.max(0, width);
    if (this.view === 'attention') return this.renderAttention(safeWidth);

    const lines: string[] = [
      currentTheme.fg('primary', '─'.repeat(safeWidth)),
      currentTheme.boldFg(
        'primary',
        this.view === 'lines' ? ' Research lines' : this.questionTitle(),
      ),
      currentTheme.fg('textMuted', ` ${this.view === 'lines' ? lineHint() : questionHint()}`),
      '',
    ];

    const view = this.activeList().view();
    if (view.items.length === 0) {
      lines.push(
        currentTheme.fg(
          'textMuted',
          this.view === 'lines' ? '  No research lines.' : '  No questions for this line.',
        ),
      );
    } else {
      for (let i = view.page.start; i < view.page.end; i++) {
        const item = view.items[i];
        if (item === undefined) continue;
        lines.push(
          this.view === 'lines'
            ? this.renderLine(item as ResearchLine, i === view.selectedIndex, safeWidth)
            : this.renderQuestion(item as ResearchQuestion, i === view.selectedIndex, safeWidth),
        );
      }
      const below = view.items.length - view.page.end;
      if (below > 0) {
        lines.push('');
        lines.push(currentTheme.fg('textMuted', ` ▼ ${String(below)} more`));
      }
    }

    lines.push('');
    lines.push(currentTheme.fg('primary', '─'.repeat(safeWidth)));
    return lines.map((line) => truncateToWidth(line, safeWidth, ELLIPSIS));
  }

  private renderAttention(width: number): string[] {
    const lines: string[] = [
      currentTheme.fg('primary', '─'.repeat(width)),
      currentTheme.boldFg('primary', ' Research attention'),
      currentTheme.fg('textMuted', ` ${attentionHint(this.attentionMode)}`),
      '',
    ];

    if (this.attentionMode === 'list') {
      const view = this.attentionList.view();
      if (view.items.length === 0) {
        lines.push(currentTheme.fg('textMuted', '  No unresolved attention.'));
      } else {
        for (let i = view.page.start; i < view.page.end; i++) {
          const item = view.items[i];
          if (item === undefined) continue;
          lines.push(renderAttentionItem(item, i === view.selectedIndex));
        }
        const below = view.items.length - view.page.end;
        if (below > 0) {
          lines.push('');
          lines.push(currentTheme.fg('textMuted', ` ▼ ${String(below)} more`));
        }
      }
    } else if (this.attentionMode === 'resolution') {
      const gate = this.unresolvedHumanGate();
      if (gate !== undefined) {
        lines.push(
          `${currentTheme.fg('textDim', '  Decision needed:')} ${currentTheme.fg('text', collapseSummary(gate.prompt))}`,
        );
      }
      lines.push('');
      this.resolutionInput.focused = this.focused;
      const inputWidth = Math.max(1, width - 4);
      const inputLine = this.resolutionInput.render(inputWidth)[0] ?? '> ';
      lines.push(`${currentTheme.fg('textDim', '  Resolution:')} ${inputLine}`);
      if (this.resolutionError !== undefined) {
        lines.push(currentTheme.fg('error', `  ${this.resolutionError}`));
      }
    } else {
      lines.push(currentTheme.fg('textDim', '  Recovery phase:'));
      const view = this.phaseList.view();
      for (let i = view.page.start; i < view.page.end; i++) {
        const phase = view.items[i];
        if (phase === undefined) continue;
        const pointer = i === view.selectedIndex ? SELECT_POINTER : ' ';
        const prefix = currentTheme.fg(
          i === view.selectedIndex ? 'primary' : 'textDim',
          `  ${pointer} `,
        );
        const label = i === view.selectedIndex
          ? currentTheme.boldFg('primary', phaseLabel(phase))
          : currentTheme.fg('text', phaseLabel(phase));
        lines.push(prefix + label);
      }
    }

    lines.push('');
    lines.push(currentTheme.fg('primary', '─'.repeat(width)));
    return lines.map((line) => truncateToWidth(line, width, ELLIPSIS));
  }

  private beginResolution(): void {
    const selected = this.attentionList.selected();
    const gate = selected?.kind === 'gate' ? selected.gate : this.unresolvedHumanGate();
    if (gate === undefined) return;
    this.resolutionGateId = gate.gateId;
    this.resolutionInput.setValue('');
    this.resolutionError = undefined;
    this.attentionMode = 'resolution';
    this.invalidate();
  }

  private submitResolution(value: string): void {
    const resolution = value.trim();
    if (resolution.length === 0) {
      this.resolutionError = 'Resolution must not be empty.';
      this.invalidate();
      return;
    }
    if (this.resolutionGateId === undefined || this.unresolvedHumanGate() === undefined) {
      this.resolutionError = 'The human decision is no longer pending. Refresh the manager.';
      this.invalidate();
      return;
    }
    this.resolutionInput.setValue(resolution);
    this.resolutionError = undefined;
    this.attentionMode = 'phase';
    this.invalidate();
  }

  private unresolvedHumanGate(): ResearchHumanGate | undefined {
    const gate = this.snapshot.humanGate;
    return gate !== undefined && gate.resolvedAt === undefined ? gate : undefined;
  }

  private createAttentionList(): SearchableList<ResearchAttentionItem> {
    const items: ResearchAttentionItem[] = [];
    const gate = this.unresolvedHumanGate();
    if (gate !== undefined) items.push({ kind: 'gate', gate });
    for (const alert of this.snapshot.alerts) {
      if (alert.acknowledgedAt === undefined) items.push({ kind: 'alert', alert });
    }
    return new SearchableList({
      items,
      toSearchText: (item) => item.kind === 'gate' ? item.gate.prompt : item.alert.message,
      pageSize: this.opts.pageSize,
      searchable: false,
    });
  }

  private handleLineInput(data: string): void {
    const selected = this.selectedLine();
    if (matchesKey(data, Key.enter)) {
      if (selected === undefined) return;
      this.selectedLineSlug = selected.slug;
      this.view = 'questions';
      this.questionList = this.createQuestionList(selected.slug);
      this.invalidate();
      return;
    }
    if (selected === undefined) {
      this.lineList.handleKey(data);
      return;
    }

    const decoded = printableChar(data).toLowerCase();
    if (decoded === 'e') {
      this.invokeAction({ kind: 'edit_line', lineSlug: selected.slug });
      return;
    }
    if (decoded === 's') {
      void this.applyAction({
        kind: 'switch_line',
        lineSlug: selected.slug,
        expectedRevision: this.snapshot.revision,
      });
      return;
    }
    if (decoded === 'p') {
      void this.applyAction({
        kind: this.snapshot.loopStatus === 'paused' ? 'resume_loop' : 'pause_loop',
        lineSlug: selected.slug,
        expectedRevision: this.snapshot.revision,
      });
      return;
    }
    if (decoded === 'b' || decoded === 'c' || decoded === 'r') {
      const status: LineStatus = decoded === 'b'
        ? 'blocked'
        : decoded === 'c'
          ? 'completed'
          : 'active';
      void this.applyAction({
        kind: 'update_line',
        lineSlug: selected.slug,
        expectedRevision: selected.revision,
        status,
      });
      return;
    }

    if (this.lineList.handleKey(data)) return;
  }

  private handleQuestionInput(data: string): void {
    const selected = this.selectedQuestion();
    const decoded = printableChar(data).toLowerCase();

    if (selected !== undefined && decoded === 'e') {
      this.invokeAction({ kind: 'edit', questionId: selected.id });
      return;
    }
    if (selected !== undefined && decoded === 'f') {
      void this.applyAction({
        kind: 'focus',
        questionId: selected.id,
        boundedAction: selected.nextBoundedAction,
      });
      return;
    }
    if (selected !== undefined && decoded === 'd') {
      void this.applyAction({ kind: 'defer', questionId: selected.id });
      return;
    }
    if (selected !== undefined && decoded === 'b') {
      void this.applyAction({ kind: 'block', questionId: selected.id });
      return;
    }
    if (selected !== undefined && decoded === 'c') {
      void this.applyAction({ kind: 'close', questionId: selected.id });
      return;
    }
    if (selected !== undefined && decoded === 'r') {
      void this.applyAction({ kind: 'reopen', questionId: selected.id });
      return;
    }

    this.questionList.handleKey(data);
  }

  private activeList(): SearchableList<ResearchLine> | SearchableList<ResearchQuestion> {
    return this.view === 'lines' ? this.lineList : this.questionList;
  }

  private selectedLine(): ResearchLine | undefined {
    return this.lineList.selected();
  }

  private selectedQuestion(): ResearchQuestion | undefined {
    return this.questionList.selected();
  }

  private questionTitle(): string {
    const line = this.snapshot.lines.find((item) => item.slug === this.selectedLineSlug);
    return line === undefined ? ' Research questions' : ` Questions · ${line.title} (${line.slug})`;
  }

  private renderLine(line: ResearchLine, selected: boolean, width: number): string {
    const questions = this.snapshot.questions.filter((question) => question.lineSlug === line.slug);
    const open = questions.filter((question) => question.workflow === 'open').length;
    const active = questions.filter((question) => question.workflow === 'active').length;
    const blocked = questions.filter((question) => question.workflow === 'blocked').length;
    const pointer = selected ? `${SELECT_POINTER} ` : '  ';
    const prefix = currentTheme.fg(selected ? 'primary' : 'textDim', `  ${pointer}`);
    const main = `${collapseSummary(line.title)} · ${collapseSummary(line.slug)} · ${line.status}`;
    const counts = `questions ${String(questions.length)} (${String(open)} open · ${String(active)} active · ${String(blocked)} blocked)`;
    const assessment = line.assessment === undefined ? '' : ` · assessment: ${collapseSummary(line.assessment)}`;
    const text = selected
      ? currentTheme.boldFg('primary', main)
      : currentTheme.fg('text', main);
    const current = line.slug === this.snapshot.currentLineSlug
      ? chalk.hex(currentTheme.palette.success)(` ${CURRENT_MARK}`)
      : '';
    const body = `${prefix}${text} ${chalk.hex(currentTheme.palette.textMuted)(counts + assessment)}`;
    if (current.length === 0) return truncateToWidth(body, Math.max(1, width), ELLIPSIS);
    const bodyWidth = Math.max(1, width - visibleWidth(current));
    return truncateToWidth(body, bodyWidth, ELLIPSIS) + current;
  }

  private renderQuestion(q: ResearchQuestion, selected: boolean, width: number): string {
    const isCurrent = q.id === this.snapshot.currentFocus?.questionId;
    const pointer = selected ? `${SELECT_POINTER} ` : '  ';
    const prefix = currentTheme.fg(selected ? 'primary' : 'textDim', `  ${pointer}`);
    const tags = `${q.workflow}/${q.epistemic}/${q.persistence}`;
    const lineLabel = chalk.hex(currentTheme.palette.textMuted)(` · ${collapseSummary(q.lineSlug)}`);
    const tagsLabel = chalk.hex(currentTheme.palette.textMuted)(` [${tags}]`);
    const suffix = isCurrent
      ? chalk.hex(currentTheme.palette.success)(` ${CURRENT_MARK}`)
      : '';
    const fixedWidth = visibleWidth(prefix) + visibleWidth(lineLabel) + visibleWidth(tagsLabel);
    const wordingWidth = Math.max(1, width - fixedWidth - visibleWidth(suffix));
    const wording = truncateToWidth(collapseSummary(q.wording), wordingWidth, ELLIPSIS);
    const textStyle = selected
      ? (text: string) => currentTheme.boldFg('primary', text)
      : (text: string) => currentTheme.fg('text', text);
    return prefix + textStyle(wording) + tagsLabel + lineLabel + suffix;
  }

  private invokeAction(action: ResearchManagerAction): void {
    this.busy = true;
    let pending: ResearchManagerOptions['onAction'] extends (
      action: ResearchManagerAction,
    ) => infer Result ? Result : never;
    try {
      pending = this.opts.onAction(action);
    } catch {
      this.busy = false;
      this.invalidate();
      return;
    }
    if (!(pending instanceof Promise)) {
      this.busy = false;
      this.invalidate();
      return;
    }
    void pending.then(
      () => {
        this.busy = false;
        this.invalidate();
      },
      () => {
        this.busy = false;
        this.invalidate();
      },
    );
  }

  private async applyAction(action: ResearchManagerAction): Promise<void> {
    this.busy = true;
    const selectedLineSlug = this.selectedLineSlug;
    const selectedQuestionId = this.selectedQuestion()?.id;
    try {
      const result = await this.opts.onAction(action);
      if (result !== undefined) {
        this.snapshot = result;
        this.lineList = this.createLineList(selectedLineSlug);
        this.questionList = this.createQuestionList(selectedLineSlug, selectedQuestionId);
        this.attentionList = this.createAttentionList();
        if (this.view === 'attention') {
          this.attentionMode = 'list';
          this.resolutionGateId = undefined;
          this.resolutionError = undefined;
          if (this.attentionList.view().items.length === 0) this.view = 'lines';
        }
      }
    } finally {
      this.busy = false;
      this.invalidate();
    }
  }

  private createLineList(selectedLineSlug?: string): SearchableList<ResearchLine> {
    const initialIndex = this.snapshot.lines.findIndex((line) => line.slug === selectedLineSlug);
    return new SearchableList({
      items: [...this.snapshot.lines],
      toSearchText: (line) => `${line.title} ${line.slug} ${line.status} ${line.assessment ?? ''}`,
      pageSize: this.opts.pageSize,
      initialIndex: initialIndex === -1 ? 0 : initialIndex,
      searchable: false,
    });
  }

  private createQuestionList(
    lineSlug: string | undefined,
    selectedQuestionId?: string,
  ): SearchableList<ResearchQuestion> {
    const questions = this.snapshot.questions.filter((question) => question.lineSlug === lineSlug);
    const initialIndex = questions.findIndex((question) => question.id === selectedQuestionId);
    return new SearchableList({
      items: [...questions],
      toSearchText: (question) => `${question.wording} ${question.workflow} ${question.epistemic}`,
      pageSize: this.opts.pageSize,
      initialIndex: initialIndex === -1 ? 0 : initialIndex,
      searchable: false,
    });
  }
}

function lineHint(): string {
  return '↑↓ navigate · PgUp/PgDn page · Enter questions · S switch · P pause/resume · B block · C complete · R reopen · E edit · Esc cancel';
}

function questionHint(): string {
  return '↑↓ navigate · PgUp/PgDn page · E edit · F focus · D defer · B block · C close · R reopen · Esc cancel';
}

function phaseLabel(phase: ResearchRecoveryPhase): string {
  return {
    idle: 'Idle',
    gap_analysis: 'Gap analysis',
    action_planned: 'Action planned',
    action_executing: 'Action executing',
    evaluating: 'Evaluating',
  }[phase];
}

function attentionHint(mode: 'list' | 'resolution' | 'phase'): string {
  if (mode === 'resolution') return 'Type a resolution · Enter continue · Esc back';
  if (mode === 'phase') return '↑↓ choose recovery phase · Enter apply · Esc back';
  return '↑↓ navigate · R resolve decision · A acknowledge alert · L research lines · Esc cancel';
}

function renderAttentionItem(item: ResearchAttentionItem, selected: boolean): string {
  const pointer = selected ? `${SELECT_POINTER} ` : '  ';
  const prefix = currentTheme.fg(selected ? 'primary' : 'textDim', `  ${pointer}`);
  const label = item.kind === 'gate' ? '[decision]' : '[alert]';
  const text = item.kind === 'gate' ? item.gate.prompt : item.alert.message;
  const body = `${label} ${collapseSummary(text)}`;
  return prefix + (selected ? currentTheme.boldFg('primary', body) : currentTheme.fg('text', body));
}

// ---------------------------------------------------------------------------
// Question edit dialog
// ---------------------------------------------------------------------------

export type ResearchEditResult =
  | {
      readonly kind: 'save';
      readonly questionId: string;
      readonly lineSlug: string;
      readonly expectedRevision: number;
      readonly wording?: string;
      readonly assessment?: string;
      readonly priority?: number;
      readonly nextBoundedAction?: string;
    }
  | {
      readonly kind: 'cancel';
      readonly questionId: string;
      readonly lineSlug: string;
    };

export interface ResearchEditDialogOptions {
  readonly question: ResearchQuestion;
  readonly onDone: (result: ResearchEditResult) => void | Promise<void>;
}

const EDIT_FIELDS = ['wording', 'assessment', 'priority', 'next action'] as const;
type EditField = (typeof EDIT_FIELDS)[number];

export class ResearchEditDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly opts: ResearchEditDialogOptions;
  private values: Record<EditField, string> = {
    wording: '',
    assessment: '',
    priority: '',
    'next action': '',
  };
  private fieldIndex = 0;
  private busy = false;
  private completed = false;
  private error: string | undefined;

  constructor(opts: ResearchEditDialogOptions) {
    super();
    this.opts = opts;
    this.values.wording = opts.question.wording;
    this.values.assessment = opts.question.assessment ?? '';
    this.values.priority = String(opts.question.priority);
    this.values['next action'] = opts.question.nextBoundedAction ?? '';
  }

  handleInput(data: string): void {
    if (this.busy || this.completed) return;
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl('c')) ||
      matchesKey(data, Key.ctrl('d'))
    ) {
      this.run({
        kind: 'cancel',
        questionId: this.opts.question.id,
        lineSlug: this.opts.question.lineSlug,
      });
      return;
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.down)) {
      this.fieldIndex = (this.fieldIndex + 1) % EDIT_FIELDS.length;
      return;
    }
    if (matchesKey(data, Key.shift('tab')) || matchesKey(data, Key.up)) {
      this.fieldIndex = (this.fieldIndex - 1 + EDIT_FIELDS.length) % EDIT_FIELDS.length;
      return;
    }
    if (matchesKey(data, Key.enter)) {
      if (this.fieldIndex < EDIT_FIELDS.length - 1) {
        this.fieldIndex += 1;
        return;
      }
      this.submit();
      return;
    }
    if (matchesKey(data, Key.backspace)) {
      const field = EDIT_FIELDS[this.fieldIndex]!;
      this.values[field] = this.values[field].slice(0, -1);
      this.error = undefined;
      return;
    }

    const decoded = printableChar(data);
    if (isPrintableChar(decoded)) {
      const field = EDIT_FIELDS[this.fieldIndex]!;
      this.values[field] += decoded;
      this.error = undefined;
    }
  }

  override render(width: number): string[] {
    const fields = EDIT_FIELDS.map((field, index) =>
      renderField(field, this.values[field], index === this.fieldIndex, this.focused),
    );
    const footer = this.busy
      ? 'Saving…'
      : this.fieldIndex < EDIT_FIELDS.length - 1
        ? 'Enter next · Tab/↑↓ switch field · Esc cancel'
        : 'Enter submit · Tab/↑↓ switch field · Esc cancel';
    return renderInputDialog(
      width,
      `Edit question ${this.opts.question.id}`,
      this.error ?? (this.busy ? 'Saving…' : 'Update wording, assessment, priority, or next action.'),
      this.error !== undefined,
      fields,
      footer,
    );
  }

  private run(result: ResearchEditResult): void {
    this.busy = true;
    this.error = undefined;
    let pending: void | Promise<void>;
    try {
      pending = this.opts.onDone(result);
    } catch (error) {
      this.busy = false;
      this.error = formatDialogError(error);
      this.invalidate();
      return;
    }
    if (pending === undefined) {
      this.busy = false;
      this.completed = true;
      this.invalidate();
      return;
    }
    void Promise.resolve(pending).then(
      () => {
        this.busy = false;
        this.completed = true;
        this.invalidate();
      },
      (error: unknown) => {
        this.busy = false;
        this.error = formatDialogError(error);
        this.invalidate();
      },
    );
  }

  private submit(): void {
    const wording = this.values.wording.trim();
    const assessment = this.values.assessment.trim();
    const priorityRaw = this.values.priority.trim();
    const nextAction = this.values['next action'].trim();

    if (wording.length === 0) {
      this.error = 'Wording must not be empty.';
      return;
    }

    let priority: number | undefined;
    if (priorityRaw.length > 0) {
      const parsed = Number(priorityRaw);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        this.error = 'Priority must be a finite integer.';
        return;
      }
      if (parsed !== this.opts.question.priority) priority = parsed;
    }

    this.run({
      kind: 'save',
      questionId: this.opts.question.id,
      lineSlug: this.opts.question.lineSlug,
      expectedRevision: this.opts.question.revision,
      wording: wording !== this.opts.question.wording ? wording : undefined,
      assessment: assessment !== (this.opts.question.assessment ?? '') ? assessment : undefined,
      priority,
      nextBoundedAction:
        nextAction !== (this.opts.question.nextBoundedAction ?? '') ? nextAction : undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// Line edit dialog
// ---------------------------------------------------------------------------

export type ResearchLineEditResult =
  | {
      readonly kind: 'save';
      readonly lineSlug: string;
      readonly expectedRevision: number;
      readonly title?: string;
      readonly objective?: string;
      readonly assessment?: string;
    }
  | { readonly kind: 'cancel'; readonly lineSlug: string };

export interface ResearchLineEditDialogOptions {
  readonly line: ResearchLine;
  readonly onDone: (result: ResearchLineEditResult) => void | Promise<void>;
}

const LINE_EDIT_FIELDS = ['title', 'objective', 'assessment'] as const;
type LineEditField = (typeof LINE_EDIT_FIELDS)[number];

export class ResearchLineEditDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly opts: ResearchLineEditDialogOptions;
  private values: Record<LineEditField, string> = {
    title: '',
    objective: '',
    assessment: '',
  };
  private fieldIndex = 0;
  private busy = false;
  private completed = false;
  private error: string | undefined;

  constructor(opts: ResearchLineEditDialogOptions) {
    super();
    this.opts = opts;
    this.values.title = opts.line.title;
    this.values.objective = opts.line.objective ?? '';
    this.values.assessment = opts.line.assessment ?? '';
  }

  handleInput(data: string): void {
    if (this.busy || this.completed) return;
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl('c')) ||
      matchesKey(data, Key.ctrl('d'))
    ) {
      this.run({ kind: 'cancel', lineSlug: this.opts.line.slug });
      return;
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.down)) {
      this.fieldIndex = (this.fieldIndex + 1) % LINE_EDIT_FIELDS.length;
      return;
    }
    if (matchesKey(data, Key.shift('tab')) || matchesKey(data, Key.up)) {
      this.fieldIndex = (this.fieldIndex - 1 + LINE_EDIT_FIELDS.length) % LINE_EDIT_FIELDS.length;
      return;
    }
    if (matchesKey(data, Key.enter)) {
      if (this.fieldIndex < LINE_EDIT_FIELDS.length - 1) {
        this.fieldIndex += 1;
        return;
      }
      this.submit();
      return;
    }
    if (matchesKey(data, Key.backspace)) {
      const field = LINE_EDIT_FIELDS[this.fieldIndex]!;
      this.values[field] = this.values[field].slice(0, -1);
      this.error = undefined;
      return;
    }

    const decoded = printableChar(data);
    if (isPrintableChar(decoded)) {
      const field = LINE_EDIT_FIELDS[this.fieldIndex]!;
      this.values[field] += decoded;
      this.error = undefined;
    }
  }

  override render(width: number): string[] {
    const fields = LINE_EDIT_FIELDS.map((field, index) =>
      renderField(field, this.values[field], index === this.fieldIndex, this.focused),
    );
    const footer = this.busy
      ? 'Saving…'
      : this.fieldIndex < LINE_EDIT_FIELDS.length - 1
        ? 'Enter next · Tab/↑↓ switch field · Esc cancel'
        : 'Enter submit · Tab/↑↓ switch field · Esc cancel';
    return renderInputDialog(
      width,
      `Edit line ${this.opts.line.slug}`,
      this.error ?? (this.busy ? 'Saving…' : 'Update title, objective, or assessment.'),
      this.error !== undefined,
      fields,
      footer,
    );
  }

  private run(result: ResearchLineEditResult): void {
    this.busy = true;
    this.error = undefined;
    let pending: void | Promise<void>;
    try {
      pending = this.opts.onDone(result);
    } catch (error) {
      this.busy = false;
      this.error = formatDialogError(error);
      this.invalidate();
      return;
    }
    if (pending === undefined) {
      this.busy = false;
      this.completed = true;
      this.invalidate();
      return;
    }
    void Promise.resolve(pending).then(
      () => {
        this.busy = false;
        this.completed = true;
        this.invalidate();
      },
      (error: unknown) => {
        this.busy = false;
        this.error = formatDialogError(error);
        this.invalidate();
      },
    );
  }

  private submit(): void {
    const title = this.values.title.trim();
    if (title.length === 0) {
      this.error = 'Title must not be empty.';
      return;
    }
    const objective = this.values.objective.trim();
    const assessment = this.values.assessment.trim();
    this.run({
      kind: 'save',
      lineSlug: this.opts.line.slug,
      expectedRevision: this.opts.line.revision,
      title: title !== this.opts.line.title ? title : undefined,
      objective: objective !== (this.opts.line.objective ?? '') ? objective : undefined,
      assessment: assessment !== (this.opts.line.assessment ?? '') ? assessment : undefined,
    });
  }
}

function renderField(
  field: string,
  value: string,
  selected: boolean,
  focused: boolean,
): string {
  const label = chalk.hex(currentTheme.palette.textDim)(`${field}: `);
  if (!selected || !focused) return label + chalk.hex(currentTheme.palette.text)(value || ' ');
  const cursorText = value.length === 0 ? ' ' : value.slice(-1);
  const before = value.slice(0, -1);
  return label +
    chalk.hex(currentTheme.palette.text)(before) +
    (value.length === 0 ? CURSOR_MARKER : '') +
    chalk.inverse(cursorText);
}

function renderInputDialog(
  width: number,
  titleText: string,
  subtitleText: string,
  subtitleWarning: boolean,
  fieldLines: readonly string[],
  footerText: string,
): string[] {
  const safeWidth = Math.max(0, width);
  if (safeWidth <= 0) return [''];
  const innerWidth = Math.max(1, safeWidth - 4);
  const c = currentTheme.palette;
  const border = (text: string): string => chalk.hex(c.primary)(text);
  const title = truncateToWidth(
    currentTheme.boldFg('textStrong', titleText),
    innerWidth,
    ELLIPSIS,
  );
  const subtitle = truncateToWidth(
    currentTheme.fg(subtitleWarning ? 'warning' : 'textDim', subtitleText),
    innerWidth,
    ELLIPSIS,
  );
  const footer = truncateToWidth(
    currentTheme.fg('textDim', footerText),
    innerWidth,
    ELLIPSIS,
  );
  const contentLines = [title, '', subtitle, '', ...fieldLines, '', footer];
  if (safeWidth < 4) {
    return ['', ...contentLines.map((line) => truncateToWidth(line, safeWidth, ELLIPSIS))];
  }

  const pad = '  ';
  const lines = [
    '',
    border('╭' + '─'.repeat(safeWidth - 2) + '╮'),
    border('│') + ' '.repeat(safeWidth - 2) + border('│'),
  ];
  for (const content of contentLines) {
    const rightPad = Math.max(0, innerWidth - visibleWidth(content));
    lines.push(border('│') + pad + content + ' '.repeat(rightPad) + border('│'));
  }
  lines.push(border('│') + ' '.repeat(safeWidth - 2) + border('│'));
  lines.push(border('╰' + '─'.repeat(safeWidth - 2) + '╯'));
  lines.push('');
  return lines.map((line) => truncateToWidth(line, safeWidth, ELLIPSIS));
}
