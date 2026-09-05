<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ResearchGoalAlignmentRelation, ResearchStatusSnapshot } from '../../api/types';
import ResearchBoard from './ResearchBoard.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';

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
        @click="expand"
      >
        <Icon name="target" size="md" />
        {{ t('research.panelTitle') }}
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

.research-floating-board {
  width: 100%;
  min-height: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.research-floating-board :deep(.ui-card__head) {
  flex: none;
}

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
