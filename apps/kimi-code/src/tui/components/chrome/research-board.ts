/**
 * ResearchBoardComponent — compact Research memory-mode panel shown in the
 * Todo chrome slot.
 *
 * Research Mode is now only a visibility toggle for the official AITP Skills
 * plus local knowledge conventions; the legacy host Research executor (lines,
 * questions, plans, checkpoints, loop) is retired. The board therefore renders
 * only the mode state, a short purpose hint, and the read-only history note.
 *
 * The board retains a synchronized projection of Todo state but does not
 * render Todo rows. The TUI mounts the ordinary TodoPanel alongside the board
 * in the shared slot, keeping Todo rows visible regardless of research mode.
 */

import type { Component } from '@moonshot-ai/pi-tui';
import { truncateToWidth, wrapTextWithAnsi } from '@moonshot-ai/pi-tui';
import type { ResearchModeSnapshot } from '@bhjia-phys/hakimi-sdk';
import chalk from 'chalk';

import { CURRENT_MARK } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';
import type { ColorPalette } from '#/tui/theme/colors';
import type { TodoItem } from './todo-panel';

export class ResearchBoardComponent implements Component {
  private snapshot: ResearchModeSnapshot | null = null;
  private todos: readonly TodoItem[] = [];
  private expanded = false;

  setSnapshot(snapshot: ResearchModeSnapshot | null): void {
    this.snapshot = snapshot;
  }

  getSnapshot(): ResearchModeSnapshot | null {
    return this.snapshot;
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

  /** The board is visible only while Research memory mode is enabled. */
  isVisible(): boolean {
    return this.snapshot?.enabled === true;
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
    if (safeWidth === 1) return [truncateToWidth(renderHeader(snap, colors), safeWidth, '…')];
    const lines: string[] = [
      chalk.hex(colors.border)('─'.repeat(safeWidth)),
      truncateToWidth(renderHeader(snap, colors), safeWidth, '…'),
    ];

    if (this.expanded) {
      lines.push(...buildDetailRows(colors).flatMap((row) => wrapTextWithAnsi(row, safeWidth)));
    } else {
      lines.push(truncateToWidth(buildCompactHint(colors), safeWidth, '…'));
    }
    return lines;
  }
}

function renderHeader(snap: ResearchModeSnapshot, colors: ColorPalette): string {
  const skills = snap.skillsAvailable
    ? chalk.hex(colors.textMuted)('AITP Skills visible')
    : chalk.hex(colors.warning)('AITP Skills unavailable');
  return `  ${chalk.hex(colors.primary).bold('Research')} ${chalk.hex(colors.success)(CURRENT_MARK)} ${chalk.hex(colors.text)('on')} · ${skills}`;
}

function buildCompactHint(colors: ColorPalette): string {
  return `  ${chalk.hex(colors.textDim)('Knowledge in plain files · memory via official AITP Skills/CLI')}`;
}

function buildDetailRows(colors: ColorPalette): string[] {
  return [
    `  ${chalk.hex(colors.textDim)('Purpose:')} ${chalk.hex(colors.text)('local project knowledge + long-term research memory; no host research loop runs.')}`,
    `  ${chalk.hex(colors.textDim)('Knowledge:')} ${chalk.hex(colors.text)('read and write plain project files with the ordinary file tools.')}`,
    `  ${chalk.hex(colors.textDim)('Memory:')} ${chalk.hex(colors.text)('the official AITP Skills (and their CLI) record meaningful deltas.')}`,
    `  ${chalk.hex(colors.textDim)('History:')} ${chalk.hex(colors.textMuted)('legacy Research records are preserved read-only; they are not live state and never resume automatically.')}`,
  ];
}
