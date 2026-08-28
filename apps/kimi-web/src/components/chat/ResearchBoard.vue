<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  ResearchModePhase,
  ResearchStatusSnapshot,
} from '../../api/types';
import Badge from '../ui/Badge.vue';
import Banner from '../ui/Banner.vue';
import Button from '../ui/Button.vue';
import Card from '../ui/Card.vue';
import Icon from '../ui/Icon.vue';

const props = defineProps<{
  snapshot: ResearchStatusSnapshot;
  forceExpanded?: number;
}>();
const emit = defineEmits<{ manage: [] }>();
const { t } = useI18n();
const expanded = ref(false);

watch(
  () => props.forceExpanded,
  () => {
    expanded.value = true;
  },
);

const phaseVariant = computed<'neutral' | 'info' | 'success' | 'warning'>(() => {
  const phase: ResearchModePhase = props.snapshot.mode;
  if (phase === 'ready') return 'success';
  if (phase === 'degraded') return 'warning';
  if (phase === 'probing') return 'info';
  return 'neutral';
});

const currentLine = computed(() =>
  props.snapshot.lines.find((line) => line.slug === props.snapshot.currentLineSlug),
);
const focusedQuestion = computed(() => {
  const id = props.snapshot.currentFocus?.questionId;
  if (id === undefined) return props.snapshot.currentQuestion;
  return props.snapshot.questions.find((question) => question.id === id)
    ?? props.snapshot.currentQuestion;
});
const nextAction = computed(
  () => focusedQuestion.value?.nextBoundedAction ?? props.snapshot.currentFocus?.boundedAction,
);
</script>

<template>
  <Card class="research-board">
    <template #head>
      <div class="research-head">
        <Icon name="target" size="md" />
        <span>{{ t('research.title') }}</span>
        <Badge :variant="phaseVariant" size="sm" dot>
          {{ t(`research.phase.${snapshot.mode}`) }}
        </Badge>
        <Badge :variant="snapshot.loopStatus === 'paused' ? 'warning' : 'neutral'" size="sm">
          {{ t(`research.loop.${snapshot.loopStatus}`) }}
        </Badge>
        <span class="research-spacer" />
        <Button variant="ghost" size="sm" @click="expanded = !expanded">
          {{ expanded ? t('research.collapse') : t('research.expand') }}
        </Button>
        <Button variant="secondary" size="sm" @click="emit('manage')">
          {{ t('research.manage') }}
        </Button>
      </div>
    </template>

    <div class="research-summary">
      <div class="research-summary-row">
        <span class="research-label">{{ t('research.currentLine') }}</span>
        <strong>{{ currentLine?.title ?? snapshot.currentLineSlug ?? t('research.none') }}</strong>
        <code v-if="snapshot.currentLineSlug">{{ snapshot.currentLineSlug }}</code>
      </div>
      <div class="research-summary-row">
        <span class="research-label">{{ t('research.focus') }}</span>
        <span>{{ focusedQuestion?.wording ?? t('research.none') }}</span>
      </div>
      <div v-if="nextAction" class="research-summary-row">
        <span class="research-label">{{ t('research.nextAction') }}</span>
        <span>{{ nextAction }}</span>
      </div>
      <div class="research-counts">
        <Badge size="sm">{{ t('research.counts.open', { count: snapshot.openQuestionCount }) }}</Badge>
        <Badge size="sm" variant="info">{{ t('research.counts.active', { count: snapshot.activeQuestionCount }) }}</Badge>
        <Badge size="sm" :variant="snapshot.blockedQuestionCount > 0 ? 'warning' : 'neutral'">
          {{ t('research.counts.blocked', { count: snapshot.blockedQuestionCount }) }}
        </Badge>
        <Badge v-if="snapshot.alerts.length > 0" size="sm" variant="warning">
          {{ t('research.counts.alerts', { count: snapshot.alerts.length }) }}
        </Badge>
      </div>
    </div>

    <div v-if="expanded" class="research-details">
      <section>
        <h4>{{ t('research.lines') }}</h4>
        <div v-if="snapshot.lines.length === 0" class="research-empty">{{ t('research.noLines') }}</div>
        <div
          v-for="line in snapshot.lines"
          v-else
          :key="line.slug"
          class="research-item"
          :class="{ current: line.slug === snapshot.currentLineSlug }"
        >
          <div class="research-item-head">
            <strong>{{ line.title }}</strong>
            <code>{{ line.slug }}</code>
            <Badge size="sm" :variant="line.status === 'blocked' ? 'warning' : 'neutral'">
              {{ t(`research.lineStatus.${line.status}`) }}
            </Badge>
          </div>
          <p v-if="line.objective">{{ line.objective }}</p>
          <p v-if="line.assessment" class="research-muted">{{ line.assessment }}</p>
        </div>
      </section>

      <section>
        <h4>{{ t('research.questions') }}</h4>
        <div v-if="snapshot.questions.length === 0" class="research-empty">{{ t('research.noQuestions') }}</div>
        <div
          v-for="question in snapshot.questions"
          v-else
          :key="question.id"
          class="research-item"
          :class="{ current: question.id === snapshot.currentFocus?.questionId }"
        >
          <div class="research-item-head">
            <strong>{{ question.wording }}</strong>
            <code>{{ question.id }}</code>
          </div>
          <div class="research-tags">
            <Badge size="sm">{{ t(`research.workflow.${question.workflow}`) }}</Badge>
            <Badge size="sm" variant="info">{{ t(`research.epistemic.${question.epistemic}`) }}</Badge>
            <Badge size="sm">{{ t(`research.persistence.${question.persistence}`) }}</Badge>
          </div>
          <p v-if="question.assessment" class="research-muted">{{ question.assessment }}</p>
        </div>
      </section>

      <section v-if="snapshot.alerts.length > 0">
        <h4>{{ t('research.alerts') }}</h4>
        <Banner
          v-for="(alert, index) in snapshot.alerts"
          :key="`${alert.kind}-${index}`"
          variant="warning"
        >
          <strong>{{ t(`research.alertKind.${alert.kind}`) }}</strong>
          <span>{{ alert.message }}</span>
        </Banner>
      </section>

      <section>
        <h4>{{ t('research.checkpoints') }}</h4>
        <div class="research-checkpoints">
          <div>
            <span class="research-label">{{ t('research.pendingCheckpoint') }}</span>
            <code>{{ snapshot.pendingCheckpoint?.checkpointId ?? t('research.none') }}</code>
          </div>
          <div>
            <span class="research-label">{{ t('research.committedCheckpoint') }}</span>
            <code>{{ snapshot.latestCommittedCheckpoint?.entryId ?? snapshot.latestCommittedCheckpoint?.checkpointId ?? t('research.none') }}</code>
          </div>
        </div>
      </section>

      <section>
        <h4>{{ t('research.adapterHealth') }}</h4>
        <div class="research-health">
          <Badge :variant="snapshot.aitpHealth.phase === 'ready' ? 'success' : snapshot.aitpHealth.phase === 'degraded' ? 'warning' : 'info'" dot>
            {{ t(`research.phase.${snapshot.aitpHealth.phase}`) }}
          </Badge>
          <span v-if="snapshot.aitpHealth.contractVersion">{{ t('research.contractVersion') }} {{ snapshot.aitpHealth.contractVersion }}</span>
          <span v-if="snapshot.aitpHealth.pluginVersion">{{ t('research.pluginVersion') }} {{ snapshot.aitpHealth.pluginVersion }}</span>
          <span v-if="snapshot.aitpHealth.pythonVersion">Python {{ snapshot.aitpHealth.pythonVersion }}</span>
        </div>
        <Banner v-if="snapshot.aitpHealth.lastError" variant="warning">
          {{ snapshot.aitpHealth.lastError }}
        </Banner>
      </section>
    </div>
  </Card>
</template>

<style scoped>
.research-board {
  margin: var(--space-2) var(--dock-inline-right) var(--space-1) var(--dock-inline-left);
}
.research-head {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.research-spacer { flex: 1; }
.research-summary { display: grid; gap: var(--space-2); }
.research-summary-row {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  color: var(--color-text);
  font-size: var(--text-sm);
}
.research-summary-row > :not(.research-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.research-label {
  flex: none;
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
}
code {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.research-counts,
.research-tags,
.research-health {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.research-details {
  max-height: 320px;
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-line);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  overflow: auto;
}
section { min-width: 0; display: grid; align-content: start; gap: var(--space-2); }
h4 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.research-item {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
}
.research-item.current { border-color: var(--color-accent-bd); background: var(--color-accent-soft); }
.research-item-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.research-item p { margin: var(--space-1) 0 0; font-size: var(--text-sm); line-height: var(--leading-normal); }
.research-muted,
.research-empty { color: var(--color-text-faint); font-size: var(--text-sm); }
.research-checkpoints { display: grid; gap: var(--space-2); }
.research-checkpoints > div { display: flex; align-items: center; gap: var(--space-2); }
.research-health { color: var(--color-text-muted); font-size: var(--text-sm); }

@media (max-width: 640px) {
  .research-head { flex-wrap: wrap; }
  .research-spacer { display: none; }
  .research-details { grid-template-columns: 1fr; }
}
</style>
