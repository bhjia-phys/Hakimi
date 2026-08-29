<!-- apps/kimi-web/src/components/chat/GitSummaryCard.vue -->
<!-- Compact desktop-header summary for the current Git worktree and pull request. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Card from '../ui/Card.vue';
import Icon from '../ui/Icon.vue';
import Tooltip from '../ui/Tooltip.vue';

const { t } = useI18n();

const props = defineProps<{
  branch?: string;
  ahead?: number;
  behind?: number;
  changesCount?: number;
  gitDiffStats?: { totalAdditions: number; totalDeletions: number } | null;
  pr?: { number: number; state: string; url: string } | null;
}>();

const emit = defineEmits<{
  openChanges: [];
  openPr: [url: string];
}>();

const ahead = computed(() => props.ahead ?? 0);
const behind = computed(() => props.behind ?? 0);
const additions = computed(() => props.gitDiffStats?.totalAdditions ?? 0);
const deletions = computed(() => props.gitDiffStats?.totalDeletions ?? 0);
const hasSyncStatus = computed(() => ahead.value > 0 || behind.value > 0);
const hasDiffStats = computed(() => additions.value > 0 || deletions.value > 0);
const branchLabel = computed(() => props.branch || t('header.detached'));
const gitTooltip = computed(() => `${branchLabel.value} · ${t('header.gitTooltip')}`);
const gitAriaLabel = computed(() => {
  const summary = [t('header.gitBranchAria', { branch: branchLabel.value })];
  if (props.changesCount !== undefined) {
    summary.push(t('header.gitChangedAria', { n: props.changesCount }));
  }
  if (ahead.value > 0) summary.push(t('header.gitAheadAria', { n: ahead.value }));
  if (behind.value > 0) summary.push(t('header.gitBehindAria', { n: behind.value }));
  if (additions.value > 0) summary.push(t('header.gitAdditionsAria', { n: additions.value }));
  if (deletions.value > 0) summary.push(t('header.gitDeletionsAria', { n: deletions.value }));
  return t('header.gitSummaryAria', {
    summary: summary.join(t('header.gitSummaryAriaSeparator')),
  });
});

const PR_STATE_LABEL_KEYS: Record<string, string> = {
  open: 'header.prStatusOpen',
  closed: 'header.prStatusClosed',
  merged: 'header.prStatusMerged',
  draft: 'header.prStatusDraft',
};

const normalizedPrState = computed(() =>
  props.pr?.state.trim().toLowerCase().replaceAll('_', '-') ?? 'unknown',
);
const prStateClass = computed(() =>
  PR_STATE_LABEL_KEYS[normalizedPrState.value] ? `pr-${normalizedPrState.value}` : 'pr-unknown',
);
const prStateLabel = computed(() =>
  t(PR_STATE_LABEL_KEYS[normalizedPrState.value] ?? 'header.prStatusUnknown'),
);
const prBadgeVariant = computed<'success' | 'danger' | 'neutral'>(() => {
  if (normalizedPrState.value === 'open') return 'success';
  if (normalizedPrState.value === 'closed') return 'danger';
  return 'neutral';
});
const prAriaLabel = computed(() =>
  props.pr
    ? t('header.prSummaryAria', {
        number: props.pr.number,
        state: prStateLabel.value,
      })
    : '',
);

function openPr(): void {
  if (props.pr) emit('openPr', props.pr.url);
}
</script>

<template>
  <Card class="git-summary-card" :class="{ 'has-pr': pr }">
    <Tooltip :text="gitTooltip" placement="bottom">
      <Button
        class="gsc-main"
        variant="ghost"
        size="sm"
        :aria-label="gitAriaLabel"
        @click="emit('openChanges')"
      >
        <Icon class="gsc-branch-icon" name="git-fork" size="sm" />
        <span class="gsc-branch" :class="{ 'is-detached': !branch }">{{ branchLabel }}</span>
        <span v-if="changesCount !== undefined" class="gsc-metric gsc-changed">
          {{ t('header.changed', { n: changesCount }) }}
        </span>
        <span v-if="hasSyncStatus" class="gsc-metric gsc-pair gsc-sync">
          <span v-if="ahead > 0" class="gsc-ahead">
            {{ t('header.ahead', { n: ahead }) }}
          </span>
          <span v-if="behind > 0" class="gsc-behind">
            {{ t('header.behind', { n: behind }) }}
          </span>
        </span>
        <span v-if="hasDiffStats" class="gsc-metric gsc-pair gsc-diff">
          <span v-if="additions > 0" class="gsc-add">+{{ additions }}</span>
          <span v-if="deletions > 0" class="gsc-delete">-{{ deletions }}</span>
        </span>
      </Button>
    </Tooltip>

    <Tooltip v-if="pr" :text="t('header.openPr')" placement="bottom">
      <Button
        class="gsc-pr"
        variant="ghost"
        size="sm"
        :aria-label="prAriaLabel"
        @click.stop="openPr"
      >
        <Badge
          class="gsc-pr-badge"
          :class="prStateClass"
          :variant="prBadgeVariant"
          size="md"
        >
          <Icon name="git-pull-request" size="sm" />
          <span class="gsc-pr-number">PR #{{ pr.number }}</span>
          <span class="gsc-pr-state">· {{ prStateLabel }}</span>
        </Badge>
      </Button>
    </Tooltip>
  </Card>
</template>

<style scoped>
.git-summary-card.ui-card {
  --gsc-control-height: var(--space-8);
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.git-summary-card :deep(.ui-card__body) {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0;
  overflow: hidden;
}
/* ChatHeader's scoped no-drag selector cannot reach buttons inside this component. */
.gsc-main,
.gsc-pr {
  min-height: var(--gsc-control-height);
  -webkit-app-region: no-drag;
}
.gsc-main {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  padding-inline: var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--ui-font-size-xs);
}
.git-summary-card.has-pr .gsc-main {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}
.gsc-main :deep(.ui-button__content) {
  min-width: 0;
  max-width: 100%;
  gap: var(--space-2);
  overflow: hidden;
}
.gsc-branch-icon {
  flex: none;
  color: var(--color-text-faint);
}
.gsc-branch {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 24ch;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gsc-branch.is-detached {
  color: var(--color-text-muted);
  font-style: italic;
}
.gsc-metric {
  flex: none;
  padding-left: var(--space-2);
  border-left: 1px solid var(--color-line);
  white-space: nowrap;
}
.gsc-pair {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
.gsc-pair > span {
  display: inline-flex;
  align-items: center;
}
.gsc-ahead { color: var(--color-warning); }
.gsc-behind { color: var(--color-accent-hover); }
.gsc-add { color: var(--color-success); }
.gsc-delete { color: var(--color-danger); }
.gsc-pr {
  flex: none;
  padding-inline: var(--space-1);
  border-left-color: var(--color-line);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: var(--ui-font-size-xs);
}
.gsc-pr :deep(.ui-button__content) { gap: 0; }
.gsc-pr :deep(.ui-badge) { font-size: inherit; }
.gsc-pr-badge.pr-merged {
  border-color: var(--color-done-bd);
  background: var(--color-done-soft);
  color: var(--color-done);
}
/* Keep keyboard focus inside the clipped card instead of painting over siblings. */
.git-summary-card .gsc-main:focus-visible,
.git-summary-card .gsc-pr:focus-visible {
  outline: none;
  background: var(--color-accent-soft);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

/* Priority: branch + PR/diff action, then line stats, sync status, changed wording. */
@container (max-width: 760px) {
  .gsc-changed { display: none; }
}
@container (max-width: 620px) {
  .gsc-sync { display: none; }
}
@container (max-width: 480px) {
  .gsc-main { padding-inline: var(--space-1); }
  .gsc-main :deep(.ui-button__content) { gap: var(--space-1); }
  .gsc-branch-icon,
  .gsc-pr-state { display: none; }
}
@container (max-width: 380px) {
  .git-summary-card.has-pr .gsc-diff { display: none; }
}
</style>
