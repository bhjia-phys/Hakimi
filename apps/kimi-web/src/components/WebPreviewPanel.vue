<!-- apps/kimi-web/src/components/WebPreviewPanel.vue -->
<!-- Right-side web preview panel: embeds a LOCAL dev-server URL (detected in a
     bash tool call's output) in a sandboxed iframe. The URL was already
     validated to the loopback interface with an explicit port by
     lib/devServerUrl.ts before it ever reaches this panel.

     The `refreshKey` prop keys the IFRAME (not this panel): reload bumps the
     key, which makes Vue recreate just the frame, so a reload is a fresh
     navigation while the panel shell (header, resize state) stays put.

     KNOWN LIMITATIONS (pure-frontend local MVP — deliberately not "solved"
     server-side, and not faked):
     - A cross-origin frame does not bubble keydown to the parent document, so
       Escape pressed while focus is INSIDE the preview cannot close the panel
       (the global App Escape handler only sees keys outside the frame).
     - Whether the target serves its page for embedding is the target's call: a
       restrictive Content-Security-Policy (e.g. `frame-ancestors 'none'`) or
       a refused connection leaves an undetectable blank/broken frame — no
       cross-origin load events are observable, so there is deliberately NO
       fake "loaded"/"failed" status. Refresh / open-in-new-tab are the
       honest recovery paths. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { WebPreviewTarget } from '../types';
import PanelHeader from './ui/PanelHeader.vue';
import IconButton from './ui/IconButton.vue';
import Icon from './ui/Icon.vue';

defineProps<{
  target: WebPreviewTarget;
  /** Bumped on every open/reload; keys the iframe so it remounts. */
  refreshKey: number;
}>();

const emit = defineEmits<{
  close: [];
  reload: [];
  external: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="wp">
    <PanelHeader
      :title="t('webPreview.title')"
      :subtitle="target.url"
      :close-label="t('webPreview.close')"
      @close="emit('close')"
    >
      <IconButton size="sm" :label="t('webPreview.reload')" @click="emit('reload')">
        <Icon name="refresh" size="md" />
      </IconButton>
      <IconButton size="sm" :label="t('webPreview.openExternal')" @click="emit('external')">
        <Icon name="external-link" size="md" />
      </IconButton>
    </PanelHeader>
    <div class="wp-body">
      <iframe
        :key="refreshKey"
        class="wp-frame"
        :src="target.url"
        :title="t('webPreview.frameTitle', { url: target.url })"
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-same-origin"
      />
    </div>
  </div>
</template>

<style scoped>
.wp {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg);
}
.wp-body {
  flex: 1;
  min-height: 0;
  position: relative;
}
.wp-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--color-surface-raised);
}
</style>