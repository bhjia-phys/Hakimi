<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ResearchGoalAlignmentRelation, ResearchStatusSnapshot } from '../../api/types';
import ResearchBoard from './ResearchBoard.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';
import { buildResearchBoardCompactSlots } from '../../lib/researchBoardPresentation';
import ResearchOrbitMark from './ResearchOrbitMark.vue';

const props = defineProps<{
  snapshot: ResearchStatusSnapshot;
  forceExpanded?: number;
}>();
const emit = defineEmits<{
  manage: [];
  align: [relation: ResearchGoalAlignmentRelation];
  clearAlignment: [];
}>();
const { t } = useI18n();
const open = ref(false);
const panelId = useId() + '-research-panel';
const trigger = ref<HTMLElement>();
const closeButton = ref<InstanceType<typeof IconButton>>();
const currentCycle = computed(() => buildResearchBoardCompactSlots(props.snapshot)
  .find((slot) => slot.kind === 'cycle'));

async function expand(): Promise<void> {
  open.value = true;
  await nextTick();
  closeButton.value?.el?.focus();
}

async function collapse(): Promise<void> {
  open.value = false;
  await nextTick();
  trigger.value?.querySelector('button')?.focus();
}

// Only an explicit navigation request opens the panel; snapshot updates do not.
watch(() => props.forceExpanded, () => { void expand(); });
</script>

<template>
  <div class="research-floating" @keydown.esc.stop.prevent="collapse">
    <div v-show="!open" ref="trigger" class="research-floating-trigger">
      <Button
        variant="secondary"
        size="lg"
        :aria-expanded="open"
        :aria-controls="panelId"
        :aria-label="t('research.panelTitle')"
        @click="expand"
      >
        <ResearchOrbitMark :dreaming="snapshot.planningPolicy === 'dreaming'" />
        <span class="research-launcher-copy">
          <span>{{ t('research.panelTitle') }}</span>
          <span v-if="currentCycle" class="research-launcher-stage">{{ t('research.cycleStage.' + currentCycle.stage) }}</span>
        </span>
      </Button>
    </div>
    <ResearchBoard
      v-show="open"
      :id="panelId"
      class="research-floating-board"
      :snapshot="snapshot"
      :force-expanded="forceExpanded"
      @manage="emit('manage')"
      @align="emit('align', $event)"
      @clear-alignment="emit('clearAlignment')"
    >
      <template #panel-actions>
        <IconButton ref="closeButton" size="lg" :label="t('research.hidePanel')" @click="collapse">
          <Icon name="chevron-right" size="md" />
        </IconButton>
      </template>
    </ResearchBoard>
  </div>
</template>

<style scoped>
.research-floating {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  z-index: var(--z-dropdown);
  width: min(460px, calc(100% - var(--space-3) * 2));
  max-height: calc(100% - var(--research-dock-height, 0px) - var(--space-3) * 2);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
}

.research-floating-trigger,
.research-floating-board {
  pointer-events: auto;
}

.research-floating-trigger :deep(button) { height: auto; min-height: 44px; padding: var(--space-2) var(--space-4) var(--space-2) var(--space-2); border-radius: var(--radius-xs) var(--radius-lg) var(--radius-xs) var(--radius-lg); }
.research-launcher-copy { display: grid; gap: var(--space-1); text-align: left; max-width: 240px; white-space: normal; }
.research-launcher-stage { font-size: var(--text-xs); color: var(--color-text-muted); line-height: var(--leading-normal); }

.research-floating-board {
  position: relative;
  width: 100%;
  min-height: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-xs) var(--radius-lg) var(--radius-xs) var(--radius-lg);
}
.research-floating-board::before, .research-floating-board::after { content: ''; position: absolute; width: 20px; height: 20px; border-color: var(--color-accent); border-style: solid; pointer-events: none; z-index: 1; }
.research-floating-board::before { top: 0; left: 0; border-width: 2px 0 0 2px; }
.research-floating-board::after { bottom: 0; right: 0; border-width: 0 2px 2px 0; }

.research-floating-board :deep(.ui-card__head) {
  flex: none;
  background: var(--color-surface-sunken);
  border-bottom-color: var(--color-accent-bd);
}
.research-floating-board :deep(.research-identity > .kw-icon) { color: var(--color-accent); }
.research-floating-board :deep(.research-title) { font-family: var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; }
.research-floating-board :deep(.research-slot-label) { color: var(--color-accent); }
.research-floating-board :deep(.research-compact-row:first-child) { background: var(--color-surface-sunken); }

.research-floating-board :deep(.ui-card__body) {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.research-floating-board :deep(.research-expanded) {
  max-height: none;
  overflow: visible;
}
</style>
