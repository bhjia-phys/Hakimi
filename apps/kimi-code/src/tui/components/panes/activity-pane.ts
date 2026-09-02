import { Container, Spacer, Text, truncateToWidth, visibleWidth } from '@moonshot-ai/pi-tui';

import type { MoonLoader } from '#/tui/components/chrome/moon-loader';
import {
  ACTIVITY_PROGRESS_BAR_FRAMES,
  ACTIVITY_PROGRESS_BAR_MAX_WIDTH,
  ACTIVITY_PROGRESS_BAR_MIN_WIDTH,
} from '#/tui/constant/activity-progress';
import { ACTIVITY_DETAIL_INDENT } from '#/tui/constant/rendering';
import type { ActivityProgressSnapshot } from '#/tui/controllers/activity-progress';
import { currentTheme } from '#/tui/theme';

export type ActivityPaneMode = 'hidden' | 'waiting' | 'thinking' | 'composing' | 'tool';

export interface ActivityPaneOptions {
  readonly mode: ActivityPaneMode;
  readonly spinner?: MoonLoader;
  readonly tip?: string;
  /** Extra dim line rendered under the spinner (e.g. step retry error detail). */
  readonly detail?: string;
  /** Live foreground-turn progress; omitted while the dedicated AgentSwarm row is active. */
  readonly progress?: () => ActivityProgressSnapshot | undefined;
}

export function formatActivitySpinnerTip(tip: string | undefined): string {
  return tip === undefined || tip.length === 0 ? '' : ` · Tip: ${tip}`;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0
    ? `${String(minutes)}m`
    : `${String(minutes)}m ${String(remainder)}s`;
}

export function formatActivityProgress(
  snapshot: ActivityProgressSnapshot,
  width: number,
): string {
  const safeWidth = Math.max(1, width);
  const percentText = `≈${String(snapshot.percent)}%`;
  const percentWidth = visibleWidth(percentText);
  if (safeWidth < percentWidth) return '';
  const indent = safeWidth > percentWidth ? ' ' : '';
  const elapsedText = formatElapsed(snapshot.elapsedSeconds);
  const toolText = `${String(snapshot.toolCallCount)} tool${snapshot.toolCallCount === 1 ? '' : 's'}`;
  const fullSuffix = ` · ${elapsedText} · ${toolText}`;
  const elapsedSuffix = ` · ${elapsedText}`;
  const suffix =
    visibleWidth(`${indent}${percentText}${fullSuffix}`) <= safeWidth
      ? fullSuffix
      : visibleWidth(`${indent}${percentText}${elapsedSuffix}`) <= safeWidth
        ? elapsedSuffix
        : '';
  const metadata =
    currentTheme.fg('primary', percentText) + currentTheme.fg('textDim', suffix);
  const barBudget = safeWidth - visibleWidth(`${indent}${metadata}`) - 1;

  if (barBudget >= ACTIVITY_PROGRESS_BAR_MIN_WIDTH + 2) {
    const barWidth = Math.min(ACTIVITY_PROGRESS_BAR_MAX_WIDTH, barBudget - 2);
    const filledWidth = Math.min(
      barWidth - 1,
      Math.floor((snapshot.percent / 100) * barWidth),
    );
    const frame = ACTIVITY_PROGRESS_BAR_FRAMES[
      snapshot.animationFrame % ACTIVITY_PROGRESS_BAR_FRAMES.length
    ]!;
    const remainingWidth = barWidth - filledWidth - 1;
    const bar =
      currentTheme.fg('textMuted', '[') +
      currentTheme.fg('primary', `${'━'.repeat(filledWidth)}${frame}`) +
      currentTheme.fg('textMuted', `${'─'.repeat(remainingWidth)}]`);
    return `${indent}${bar} ${metadata}`;
  }

  return truncateToWidth(`${indent}${metadata}`, safeWidth, '');
}

export class ActivityPaneComponent extends Container {
  private spinnerRef?: MoonLoader;
  private progressSnapshot?: () => ActivityProgressSnapshot | undefined;

  constructor(options: ActivityPaneOptions) {
    super();
    this.spinnerRef = options.spinner;
    this.progressSnapshot = options.progress;

    if (
      (options.mode === 'waiting' || options.mode === 'tool' || options.mode === 'composing') &&
      options.spinner !== undefined
    ) {
      this.addChild(new Spacer(1));
      options.spinner.setTip(formatActivitySpinnerTip(options.tip));
      this.addChild(options.spinner);
      if (options.detail !== undefined && options.detail.length > 0) {
        this.addChild(new Text(currentTheme.fg('textDim', options.detail), ACTIVITY_DETAIL_INDENT, 0));
      }
    }
  }

  override render(width: number): string[] {
    if (this.spinnerRef && 'setAvailableWidth' in this.spinnerRef) {
      this.spinnerRef.setAvailableWidth(width);
    }
    const lines = super.render(width);
    const progress = this.progressSnapshot?.();
    if (progress !== undefined) {
      const progressLine = formatActivityProgress(progress, width);
      if (progressLine.length > 0) lines.push(progressLine);
    }
    return lines;
  }
}
