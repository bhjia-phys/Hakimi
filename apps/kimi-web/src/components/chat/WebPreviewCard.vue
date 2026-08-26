<!-- apps/kimi-web/src/components/chat/WebPreviewCard.vue -->
<!-- Standalone web-preview card appended to the END of an assistant reply whose
     tool output printed a local dev-server URL (e.g. `vite` / `npm run dev`
     printing `Local: http://localhost:5173/`). A clearly visible, explicit entry
     point to the running app — the counterpart of the right-side WebPreviewPanel
     — instead of a small hidden icon button inside the tool row. The URL
     was already validated to the loopback interface with an explicit port by
     lib/devServerUrl.ts before it ever reaches this card.

     Attention-tier card on the shared Card primitive (see DesignSystemView §03
     "Card / Surface"): accent border + soft accent head band, so it stands out
     from the tool rows while keeping the one-shell card skeleton. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { WebPreviewTarget } from '../../types';
import Card from '../ui/Card.vue';
import Icon from '../ui/Icon.vue';
import Button from '../ui/Button.vue';

defineProps<{
  target: WebPreviewTarget;
}>();

const emit = defineEmits<{
  /** Open the URL in the right-side web preview panel. */
  openPreview: [target: WebPreviewTarget];
}>();

const { t } = useI18n();
</script>

<template>
  <Card class="wpc">
    <template #head>
      <span class="wpc-head">
        <Icon name="globe" size="md" class="wpc-ic" />
        <span class="wpc-title">{{ t('webPreview.cardTitle') }}</span>
      </span>
    </template>
    <p class="wpc-ready">{{ t('webPreview.cardReady') }}</p>
    <p class="wpc-url" :title="target.url">{{ target.url }}</p>
    <template #foot>
      <Button
        size="sm"
        variant="primary"
        :aria-label="t('webPreview.open', { url: target.url })"
        @click="emit('openPreview', target)"
      >
        <Icon name="external-link" size="sm" />
        {{ t('webPreview.cardOpen') }}
      </Button>
    </template>
  </Card>
</template>

<style scoped>
/* Attention-tier card: accent border + soft accent head band layered on top of
   the shared flat Card shell (Card supplies the border, radius and surface).
   ChatPane owns the inter-block rhythm; this only adds the gap below the turn's
   content blocks (the footer below brings its own). */
.wpc.ui-card { border-color: var(--color-accent-bd); }
.wpc { margin-top: var(--chat-block-gap); }
.wpc :deep(.ui-card__head) {
  background: var(--color-accent-soft);
  border-bottom-color: var(--color-accent-bd);
}

/* Header — content row (Card provides the band padding/border). */
.wpc-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  font: var(--text-sm)/var(--leading-normal) var(--font-ui);
}
.wpc-ic { flex: none; color: var(--color-accent); }
.wpc-title {
  color: var(--color-accent-hover);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}

/* Body — readiness line + the URL. */
.wpc-ready {
  margin: 0 0 var(--space-1);
  font: var(--text-base)/var(--leading-normal) var(--font-ui);
  color: var(--color-text);
  font-weight: var(--weight-medium);
}
.wpc-url {
  margin: 0;
  font: var(--text-sm)/var(--leading-normal) var(--font-mono);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Footer — Card right-aligns the foot; the single primary action stands out. */
</style>