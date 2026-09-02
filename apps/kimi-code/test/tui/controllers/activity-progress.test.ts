import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVITY_PROGRESS_MAX_PERCENT,
  ACTIVITY_PROGRESS_REVEAL_DELAY_MS,
} from '#/tui/constant/activity-progress';
import { ActivityProgressController } from '#/tui/controllers/activity-progress';

afterEach(() => {
  vi.useRealTimers();
});

describe('ActivityProgressController', () => {
  it('keeps progress hidden for eight seconds, then starts the animation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const requestRender = vi.fn();
    const controller = new ActivityProgressController(requestRender);

    controller.start(1);
    controller.noteStep(1);
    vi.advanceTimersByTime(ACTIVITY_PROGRESS_REVEAL_DELAY_MS - 1);

    expect(controller.snapshot()).toBeUndefined();
    expect(requestRender).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(controller.snapshot()).toMatchObject({
      elapsedSeconds: 8,
      toolCallCount: 0,
      animationFrame: 0,
    });
    expect(requestRender).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(250);
    expect(controller.snapshot()?.animationFrame).toBe(1);
    expect(requestRender).toHaveBeenCalledTimes(2);

    controller.dispose();
  });

  it('advances on step and tool events while counting unique real tool calls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const controller = new ActivityProgressController(vi.fn());
    controller.start(1);
    vi.advanceTimersByTime(ACTIVITY_PROGRESS_REVEAL_DELAY_MS);
    const initialPercent = controller.snapshot()!.percent;

    controller.noteStep(1);
    const afterStep = controller.snapshot()!.percent;
    controller.noteToolCall(1, 'call-1');
    controller.noteToolCall(1, 'call-1');
    const afterCall = controller.snapshot()!;
    controller.noteToolResult(1, 'call-1');
    controller.noteToolResult(1, 'call-1');
    const afterResult = controller.snapshot()!;

    expect(afterStep).toBeGreaterThan(initialPercent);
    expect(afterCall.percent).toBeGreaterThan(afterStep);
    expect(afterCall.toolCallCount).toBe(1);
    expect(afterResult.percent).toBeGreaterThan(afterCall.percent);
    expect(afterResult.toolCallCount).toBe(1);

    for (let index = 0; index < 100; index += 1) {
      const toolCallId = `call-${String(index + 2)}`;
      controller.noteToolCall(1, toolCallId);
      controller.noteToolResult(1, toolCallId);
    }
    expect(controller.snapshot()?.percent).toBe(ACTIVITY_PROGRESS_MAX_PERCENT);

    controller.dispose();
  });

  it('clears pending and active timers on reset and permanently stops on dispose', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const requestRender = vi.fn();
    const controller = new ActivityProgressController(requestRender);

    controller.start(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(ACTIVITY_PROGRESS_REVEAL_DELAY_MS);
    expect(vi.getTimerCount()).toBe(1);

    controller.reset();
    expect(controller.snapshot()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);

    controller.start(1);
    expect(vi.getTimerCount()).toBe(1);
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    controller.start(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores late events from a previous turn', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const controller = new ActivityProgressController(vi.fn());

    controller.start(1);
    vi.advanceTimersByTime(1_000);
    controller.start(2);
    vi.advanceTimersByTime(ACTIVITY_PROGRESS_REVEAL_DELAY_MS);
    const current = controller.snapshot()!;

    controller.start(1);
    controller.noteStep(1);
    controller.noteToolCall(1, 'stale-call');
    controller.noteToolResult(1, 'stale-call');
    controller.reset(1);

    expect(controller.snapshot()).toEqual(current);
    expect(vi.getTimerCount()).toBe(1);

    controller.reset(2);
    controller.start(1);
    expect(controller.snapshot()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);

    controller.reset();
    controller.start(1);
    expect(vi.getTimerCount()).toBe(1);
    controller.dispose();
  });

  it('stops animation renders while hidden and resumes without losing elapsed time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const requestRender = vi.fn();
    const controller = new ActivityProgressController(requestRender);

    controller.start(1);
    vi.advanceTimersByTime(ACTIVITY_PROGRESS_REVEAL_DELAY_MS);
    const visibleFrame = controller.snapshot()!.animationFrame;
    controller.setVisible(false);
    const rendersBeforePause = requestRender.mock.calls.length;

    vi.advanceTimersByTime(2_000);
    expect(controller.snapshot()!.elapsedSeconds).toBe(10);
    expect(controller.snapshot()!.animationFrame).toBe(visibleFrame);
    expect(requestRender).toHaveBeenCalledTimes(rendersBeforePause);
    expect(vi.getTimerCount()).toBe(0);

    controller.setVisible(true);
    expect(requestRender).toHaveBeenCalledTimes(rendersBeforePause + 1);
    expect(vi.getTimerCount()).toBe(1);
    controller.dispose();
  });
});
