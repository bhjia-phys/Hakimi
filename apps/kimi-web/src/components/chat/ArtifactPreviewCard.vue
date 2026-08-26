<!-- apps/kimi-web/src/components/chat/ArtifactPreviewCard.vue -->
<!-- Standalone artifact-preview card appended to the END of an assistant reply
     whose tools produced a previewable artifact: a Write/Edit of a whitelisted
     file (md/mdx/html/htm/pdf/svg/png/jpg/jpeg/webp), or image/video media. The
     turn-level pick (at most one target, artifacts before the web fallback)
     lives in lib/turnWebPreview.ts; this card only renders and dispatches.

     Attention-tier card on the shared Card primitive (see DesignSystemView §03
     "Card / Surface"): accent border + soft accent head band — the sibling of
     WebPreviewCard, so both preview attach-points read as one family. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ArtifactPreviewTarget, FilePreviewRequest, ToolMedia } from '../../types';
import { basename } from '../../lib/pathBasename';
import type { IconName } from '../../lib/icons';
import Card from '../ui/Card.vue';
import Icon from '../ui/Icon.vue';
import Button from '../ui/Button.vue';

const props = defineProps<{
  target: ArtifactPreviewTarget;
}>();

const emit = defineEmits<{
  /** Open the artifact file in the right-side file preview panel. */
  openFile: [target: FilePreviewRequest];
  /** Open the artifact media in the right-side media preview. */
  openMedia: [media: ToolMedia];
}>();

const { t } = useI18n();

const headIcon = computed<IconName>(() => {
  if (props.target.kind === 'artifact-media') {
    return props.target.media.kind === 'video' ? 'play' : 'image';
  }
  return 'file-text';
});

/** Display path: the editable file path, or the media's path / served URL. */
const displayPath = computed<string>(() =>
  props.target.kind === 'artifact-file'
    ? props.target.path
    : (props.target.media.path ?? props.target.media.url),
);

/** Last path segment — the file name the user can scan at a glance. */
const displayName = computed<string>(() => basename(displayPath.value));

function onOpen(): void {
  if (props.target.kind === 'artifact-file') {
    emit('openFile', { path: props.target.path });
  } else {
    emit('openMedia', props.target.media);
  }
}
</script>

<template>
  <Card class="apc">
    <template #head>
      <span class="apc-head">
        <Icon :name="headIcon" size="md" class="apc-ic" />
        <span class="apc-title">{{ t('artifactPreview.cardReady') }}</span>
      </span>
    </template>
    <p class="apc-name" :title="displayName">{{ displayName }}</p>
    <p class="apc-path" :title="displayPath">{{ displayPath }}</p>
    <template #foot>
      <Button
        size="sm"
        variant="primary"
        :aria-label="t('artifactPreview.open', { name: displayName })"
        @click="onOpen"
      >
        <Icon name="external-link" size="sm" />
        {{ t('artifactPreview.cardOpen') }}
      </Button>
    </template>
  </Card>
</template>

<style scoped>
/* Attention-tier card: accent border + soft accent head band layered on top of
   the shared flat Card shell (Card supplies the border, radius and surface).
   ChatPane owns the inter-block rhythm; this only adds the gap below the turn's
   content blocks (the footer below brings its own). Mirrors WebPreviewCard. */
.apc.ui-card { border-color: var(--color-accent-bd); }
.apc { margin-top: var(--chat-block-gap); }
.apc :deep(.ui-card__head) {
  background: var(--color-accent-soft);
  border-bottom-color: var(--color-accent-bd);
}

/* Header — content row (Card provides the band padding/border). */
.apc-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  font: var(--text-sm)/var(--leading-normal) var(--font-ui);
}
.apc-ic { flex: none; color: var(--color-accent); }
.apc-title {
  color: var(--color-accent-hover);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}

/* Body — file name + full path, both clipped to one line. */
.apc-name {
  margin: 0 0 var(--space-1);
  font: var(--text-base)/var(--leading-normal) var(--font-ui);
  color: var(--color-text);
  font-weight: var(--weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.apc-path {
  margin: 0;
  font: var(--text-sm)/var(--leading-normal) var(--font-mono);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Footer — Card right-aligns the foot; the single primary action stands out. */
</style>