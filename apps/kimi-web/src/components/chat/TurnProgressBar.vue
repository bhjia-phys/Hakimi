<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TurnProgressSnapshot } from '../../lib/turnProgress';
import { formatTurnProgressElapsed } from '../../lib/turnProgress';

const props = defineProps<{
  progress: TurnProgressSnapshot;
}>();

const { t } = useI18n();
const fillStyle = computed(() => ({
  transform: `scaleX(${props.progress.visualPercent / 100})`,
}));
const elapsed = computed(() => formatTurnProgressElapsed(props.progress.elapsedSeconds));
const valueText = computed(() =>
  t('conversation.turnProgress.value', {
    percent: props.progress.percent,
    elapsed: elapsed.value,
    count: props.progress.toolCallCount,
  }),
);
</script>

<template>
  <div class="turn-progress">
    <div
      class="turn-progress-track"
      role="progressbar"
      :aria-label="t('conversation.turnProgress.label')"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progress.percent"
      :aria-valuetext="valueText"
    >
      <span class="turn-progress-fill" :style="fillStyle" />
    </div>
    <div class="turn-progress-meta">
      <span class="turn-progress-percent">≈{{ progress.percent }}%</span>
      <span>{{ t('conversation.turnProgress.elapsed', { elapsed }) }}</span>
      <span>{{ t('conversation.turnProgress.tools', { count: progress.toolCallCount }) }}</span>
    </div>
  </div>
</template>

<style scoped>
.turn-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) 0;
}

.turn-progress-track {
  height: var(--space-2);
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
}

.turn-progress-fill {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: left center;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  transition: transform var(--duration-slow) var(--ease-out);
}

.turn-progress-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-tight);
}

.turn-progress-percent {
  color: var(--color-text);
  font-weight: var(--weight-medium);
}

@media (max-width: 640px) {
  .turn-progress {
    gap: var(--space-1);
  }

  .turn-progress-fill {
    transition: none;
  }

  .turn-progress-meta {
    justify-content: space-between;
    gap: var(--space-2);
  }
}
</style>
