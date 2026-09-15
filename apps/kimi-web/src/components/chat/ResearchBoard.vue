<!-- apps/kimi-web/src/components/chat/ResearchBoard.vue -->
<!-- Research memory-mode card: mode state, purpose, and the read-only history
     note. The legacy host Research executor (lines/questions/plans/loop) is
     retired — this board intentionally has no mutation actions. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ResearchModeSnapshot } from '../../api/types';
import Badge from '../ui/Badge.vue';
import Card from '../ui/Card.vue';
import Icon from '../ui/Icon.vue';

defineProps<{
  snapshot: ResearchModeSnapshot;
}>();
const { t } = useI18n();
</script>

<template>
  <Card class="research-board" role="region" :aria-label="t('research.title')">
    <template #head>
      <div class="research-head">
        <div class="research-identity">
          <Icon name="target" size="md" />
          <span class="research-title">{{ t('research.title') }}</span>
          <Badge variant="success">{{ t('research.modeOn') }}</Badge>
          <Badge :variant="snapshot.skillsAvailable ? 'neutral' : 'warning'">
            {{
              snapshot.skillsAvailable
                ? t('research.skillsAvailable')
                : t('research.skillsUnavailable')
            }}
          </Badge>
        </div>
        <div class="research-actions">
          <slot name="panel-actions" />
        </div>
      </div>
    </template>

    <div class="research-body">
      <p class="research-purpose">{{ t('research.purpose') }}</p>
      <ul class="research-guidance">
        <li>{{ t('research.guidanceKnowledge') }}</li>
        <li>{{ t('research.guidanceMemory') }}</li>
      </ul>
      <p class="research-history">{{ t('research.historyNote') }}</p>
    </div>
  </Card>
</template>

<style scoped>
.research-head {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.research-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.research-title {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  font-weight: var(--weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.research-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
}

.research-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.research-purpose {
  margin: 0;
  color: var(--color-text);
}

.research-guidance {
  margin: 0;
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.research-history {
  margin: 0;
  color: var(--color-text-faint);
}
</style>
