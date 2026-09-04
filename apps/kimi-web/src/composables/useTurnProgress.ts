import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue';
import type { AppTurnProgress } from '../api/types';
import {
  calculateTurnProgress,
  TURN_PROGRESS_FRAME_INTERVAL_MS,
} from '../lib/turnProgress';

/** Animate one active turn's heuristic snapshot. `paused` stops the frame
 *  timer and hides generic progress while the foreground AgentSwarm card owns
 *  presentation; elapsed time still follows the complete main turn. */
export function useTurnProgress(
  source: MaybeRefOrGetter<AppTurnProgress | null | undefined>,
  paused: MaybeRefOrGetter<boolean>,
) {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;

  function stopTimer(): void {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
  }

  function startTimer(): void {
    if (timer !== undefined) return;
    timer = setInterval(() => {
      now.value = Date.now();
    }, TURN_PROGRESS_FRAME_INTERVAL_MS);
  }

  watch(
    () => [toValue(source), toValue(paused)] as const,
    ([progress, shouldPause]) => {
      now.value = Date.now();
      if (
        progress === null ||
        progress === undefined ||
        !progress.active ||
        shouldPause
      ) {
        stopTimer();
        return;
      }
      startTimer();
    },
    { immediate: true, flush: 'sync' },
  );

  onScopeDispose(stopTimer);

  return computed(() => {
    const progress = toValue(source);
    if (
      progress === null ||
      progress === undefined ||
      !progress.active ||
      toValue(paused)
    ) {
      return null;
    }
    return calculateTurnProgress(progress, Math.max(0, now.value - progress.startedAt));
  });
}
