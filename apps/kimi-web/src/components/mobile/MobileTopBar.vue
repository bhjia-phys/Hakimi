<!-- apps/kimi-web/src/components/mobile/MobileTopBar.vue -->
<!-- Mobile title bar (50px): an explicit session-list button plus a tappable -->
<!-- middle zone showing `workspace / session ⌄` with a status sub-line -->
<!-- containing only running/idle and connection state to stay readable at 320px. -->
<!-- Either list entry opens the switcher sheet; sliders opens settings. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConnectionState, WorkspaceView } from '../../types';
import Badge from '../ui/Badge.vue';
import IconButton from '../ui/IconButton.vue';
import Icon from '../ui/Icon.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    /** Active workspace name shown in the switcher trigger. */
    workspace: WorkspaceView | null;
    /** Active session title (the right, bold side of the mono path). */
    sessionTitle?: string;
    /** True when the active session is doing work (drives the status dot/text). */
    running?: boolean;
    connection?: ConnectionState;
    /** Whether local Web can start or manage a remote share. */
    remoteShareEnabled?: boolean;
    /** Whether a remote share is currently active. */
    remoteShareActive?: boolean;
  }>(),
  {
    workspace: null,
    sessionTitle: '',
    running: false,
    connection: 'disconnected',
    remoteShareEnabled: false,
    remoteShareActive: false,
  },
);

const emit = defineEmits<{
  openSwitcher: [];
  openSettings: [];
  openRemoteShare: [];
}>();

const wsName = computed<string>(() => props.workspace?.name ?? t('workspace.noWorkspace'));

const statusText = computed<string>(() =>
  props.running ? t('mobile.running') : t('mobile.idle'),
);
const connectionText = computed<string>(() => {
  if (props.connection === 'connected') return t('status.connectionConnected');
  if (props.connection === 'connecting') return t('status.connectionConnecting');
  return t('status.connectionDisconnected');
});
const connectionVariant = computed<'success' | 'warning' | 'danger'>(() => {
  if (props.connection === 'connected') return 'success';
  if (props.connection === 'connecting') return 'warning';
  return 'danger';
});
</script>

<template>
  <div class="topbar">
    <IconButton
      size="lg"
      :label="t('mobile.openSwitcher')"
      @click="emit('openSwitcher')"
    >
      <Icon name="list" size="lg" />
    </IconButton>

    <button
      type="button"
      class="tb-mid"
      :aria-label="t('mobile.openSwitcher')"
      @click="emit('openSwitcher')"
    >
      <span class="tb-path">
        <span class="ws">{{ wsName }}</span>
        <template v-if="sessionTitle">
          <span class="sl">/</span>
          <span class="se">{{ sessionTitle }}</span>
        </template>
        <span class="cv">⌄</span>
      </span>
      <span class="tb-sub" role="status" aria-live="polite">
        <span class="rd" :class="{ on: running }" />
        <span>{{ statusText }}</span>
        <Badge :variant="connectionVariant" size="sm" dot>{{ connectionText }}</Badge>
      </span>
    </button>

    <IconButton
      v-if="remoteShareEnabled"
      size="lg"
      :label="remoteShareActive ? t('remoteShare.badgeActiveTitle') : t('remoteShare.menuEntry')"
      @click="emit('openRemoteShare')"
    >
      <span class="remote-share-icon">
        <Icon name="globe" size="lg" />
        <span v-if="remoteShareActive" class="remote-share-dot" aria-hidden="true" />
      </span>
    </IconButton>

    <IconButton
      size="lg"
      :label="t('mobile.openSettings')"
      @click="emit('openSettings')"
    >
      <Icon name="sliders" size="lg" />
    </IconButton>
  </div>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  /* Grow the bar by the top inset so the 50px content row stays below the
     status bar / notch in standalone PWA mode and landscape. */
  height: calc(50px + var(--safe-top));
  flex: none;
  padding: var(--safe-top) max(12px, var(--safe-right)) 0 max(12px, var(--safe-left));
  border-bottom: 1px solid var(--color-line);
  background: var(--color-bg);
  font-family: var(--font-ui);
}

/* Middle tappable zone */
.tb-mid {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.tb-path {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--ui-font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-path .ws { color: var(--color-text); }
.tb-path .sl { color: var(--color-text-faint); }
.tb-path .se {
  color: var(--color-text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-path .cv { color: var(--color-text-faint); flex: none; }

.tb-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: max(9px, calc(var(--ui-font-size) - 3.5px));
  color: var(--color-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-sub .rd {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-text-faint);
}
.tb-sub .rd.on { background: var(--color-success); }
/* The connection badge never shrinks below its pill — let the preceding text
   clip first. */
.tb-sub :deep(.ui-badge) { flex: none; }

.remote-share-icon {
  position: relative;
  display: inline-flex;
}
.remote-share-dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 7px;
  height: 7px;
  border: 1px solid var(--color-bg);
  border-radius: var(--radius-full);
  background: var(--color-success);
}

.topbar .tb-path { font-family: var(--sans); }
</style>
