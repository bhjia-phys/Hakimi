import {
  ACTIVITY_PROGRESS_BAR_FRAMES,
  ACTIVITY_PROGRESS_FRAME_INTERVAL_MS,
  ACTIVITY_PROGRESS_MAX_PERCENT,
  ACTIVITY_PROGRESS_REVEAL_DELAY_MS,
  ACTIVITY_PROGRESS_STEP_INCREMENT,
  ACTIVITY_PROGRESS_TIME_BASE_PERCENT,
  ACTIVITY_PROGRESS_TIME_CONSTANT_MS,
  ACTIVITY_PROGRESS_TIME_RANGE_PERCENT,
  ACTIVITY_PROGRESS_TOOL_CALL_INCREMENT,
  ACTIVITY_PROGRESS_TOOL_RESULT_INCREMENT,
} from '../constant/activity-progress';

export interface ActivityProgressSnapshot {
  readonly percent: number;
  readonly elapsedSeconds: number;
  readonly toolCallCount: number;
  readonly animationFrame: number;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();
}

export class ActivityProgressController {
  private activeTurnId: number | undefined;
  private latestTurnId: number | undefined;
  private startedAt: number | undefined;
  private stepCount = 0;
  private readonly toolCallIds = new Set<string>();
  private readonly completedToolCallIds = new Set<string>();
  private animationFrame = 0;
  private revealTimer: ReturnType<typeof setTimeout> | undefined;
  private animationTimer: ReturnType<typeof setInterval> | undefined;
  private visible = true;
  private disposed = false;

  constructor(private readonly requestRender: () => void) {}

  start(turnId: number): void {
    if (this.disposed || (this.latestTurnId !== undefined && turnId <= this.latestTurnId)) return;
    this.clear(false);
    this.activeTurnId = turnId;
    this.latestTurnId = turnId;
    this.startedAt = Date.now();
    this.revealTimer = setTimeout(() => {
      this.revealTimer = undefined;
      if (this.startedAt === undefined || this.disposed || !this.visible) return;
      this.requestRender();
      this.startAnimation();
    }, ACTIVITY_PROGRESS_REVEAL_DELAY_MS);
    unrefTimer(this.revealTimer);
  }

  noteStep(turnId: number): void {
    if (!this.isCurrentTurn(turnId)) return;
    this.stepCount += 1;
    this.requestRenderIfVisible();
  }

  noteToolCall(turnId: number, toolCallId: string): void {
    if (!this.isCurrentTurn(turnId)) return;
    const previousSize = this.toolCallIds.size;
    this.toolCallIds.add(toolCallId);
    if (this.toolCallIds.size !== previousSize) this.requestRenderIfVisible();
  }

  noteToolResult(turnId: number, toolCallId: string): void {
    if (!this.isCurrentTurn(turnId)) return;
    const previousCalls = this.toolCallIds.size;
    const previousCompleted = this.completedToolCallIds.size;
    this.toolCallIds.add(toolCallId);
    this.completedToolCallIds.add(toolCallId);
    if (
      this.toolCallIds.size !== previousCalls ||
      this.completedToolCallIds.size !== previousCompleted
    ) {
      this.requestRenderIfVisible();
    }
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (!visible) {
      this.stopAnimation();
      return;
    }
    if (this.snapshot() === undefined) return;
    this.requestRender();
    this.startAnimation();
  }

  snapshot(): ActivityProgressSnapshot | undefined {
    const startedAt = this.startedAt;
    if (startedAt === undefined) return undefined;
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    if (elapsedMs < ACTIVITY_PROGRESS_REVEAL_DELAY_MS) return undefined;

    const timePercent =
      ACTIVITY_PROGRESS_TIME_BASE_PERCENT +
      ACTIVITY_PROGRESS_TIME_RANGE_PERCENT *
        (1 - Math.exp(-elapsedMs / ACTIVITY_PROGRESS_TIME_CONSTANT_MS));
    const eventPercent =
      this.stepCount * ACTIVITY_PROGRESS_STEP_INCREMENT +
      this.toolCallIds.size * ACTIVITY_PROGRESS_TOOL_CALL_INCREMENT +
      this.completedToolCallIds.size * ACTIVITY_PROGRESS_TOOL_RESULT_INCREMENT;

    return {
      percent: Math.min(ACTIVITY_PROGRESS_MAX_PERCENT, Math.round(timePercent + eventPercent)),
      elapsedSeconds: Math.floor(elapsedMs / 1_000),
      toolCallCount: this.toolCallIds.size,
      animationFrame: this.animationFrame,
    };
  }

  reset(turnId?: number): void {
    if (turnId !== undefined && this.activeTurnId !== turnId) return;
    this.clear(this.snapshot() !== undefined && this.visible, turnId === undefined);
  }

  dispose(): void {
    this.clear(false, true);
    this.disposed = true;
  }

  private isCurrentTurn(turnId: number): boolean {
    return !this.disposed && this.activeTurnId === turnId;
  }

  private requestRenderIfVisible(): void {
    if (this.visible && this.snapshot() !== undefined) this.requestRender();
  }

  private startAnimation(): void {
    if (this.animationTimer !== undefined || !this.visible || this.startedAt === undefined) return;
    this.animationTimer = setInterval(() => {
      this.animationFrame =
        (this.animationFrame + 1) % ACTIVITY_PROGRESS_BAR_FRAMES.length;
      this.requestRender();
    }, ACTIVITY_PROGRESS_FRAME_INTERVAL_MS);
    unrefTimer(this.animationTimer);
  }

  private stopAnimation(): void {
    if (this.animationTimer === undefined) return;
    clearInterval(this.animationTimer);
    this.animationTimer = undefined;
  }

  private clear(requestRender: boolean, resetTurnSequence = false): void {
    if (this.revealTimer !== undefined) {
      clearTimeout(this.revealTimer);
      this.revealTimer = undefined;
    }
    this.stopAnimation();
    this.activeTurnId = undefined;
    if (resetTurnSequence) this.latestTurnId = undefined;
    this.startedAt = undefined;
    this.stepCount = 0;
    this.toolCallIds.clear();
    this.completedToolCallIds.clear();
    this.animationFrame = 0;
    if (requestRender) this.requestRender();
  }
}
