<!-- apps/kimi-web/src/components/dialogs/RemoteShareDialog.vue -->
<!-- Remote-control dialog: two modes sharing the dialog.
     Temporary — start a short-lived share of the current session, then scan
     the QR (or copy the link) to drive it from another browser.
     Persistent — manage the long-lived `hakimi remote` systemd user service
     (no TTL, fixed token): service/health state, current URL + QR, and
     start/stop.
     States: stopped / starting / running / error. The full URL is a bearer
     credential — it is only rendered and copyable here, never logged,
     persisted, or sent to telemetry. -->
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { copyTextToClipboard } from '../../lib/clipboard';
import { renderQrToCanvas } from '../../lib/remoteShareQr';
import {
  REMOTE_SHARE_DEFAULT_TTL_SECONDS,
  REMOTE_SHARE_TTL_PRESET_SECONDS,
  remoteShareRemainingParts,
  remoteShareRemainingSeconds,
} from '../../composables/useRemoteShare';
import type { AppRemotePersistentStatus, AppRemoteShareStatus } from '../../api/types';
import Dialog from '../ui/Dialog.vue';
import Button from '../ui/Button.vue';
import Banner from '../ui/Banner.vue';
import Badge from '../ui/Badge.vue';
import Field from '../ui/Field.vue';
import Select from '../ui/Select.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import Icon from '../ui/Icon.vue';

const { t, locale } = useI18n();

const props = defineProps<{
  status: AppRemoteShareStatus | null;
  refreshing: boolean;
  starting: boolean;
  stopping: boolean;
  /** Last start/stop/read failure message, or null when clean. */
  error: string | null;
  persistentStatus: AppRemotePersistentStatus | null;
  persistentRefreshing: boolean;
  persistentStarting: boolean;
  persistentStopping: boolean;
  persistentError: string | null;
}>();

const emit = defineEmits<{
  start: [ttlSeconds: number];
  stop: [];
  refresh: [];
  persistentStart: [];
  persistentStop: [];
  persistentRefresh: [];
  close: [];
}>();

// The parent mounts this dialog with `v-if`, so it is open whenever mounted.
// Dialog owns the focus trap, Esc/overlay close, and the close button.
const open = ref(true);

// ---------------------------------------------------------------------------
// Mode switch: temporary share vs. long-lived persistent service.
// ---------------------------------------------------------------------------
const mode = ref<'temporary' | 'persistent'>('temporary');
const modeOptions = computed(() => [
  { value: 'temporary', label: t('remoteShare.modeTemporary') },
  { value: 'persistent', label: t('remoteShare.modePersistent') },
]);

// ---------------------------------------------------------------------------
// Temporary share state (unchanged surface)
// ---------------------------------------------------------------------------
const isRunning = computed(() => props.status?.active === true);
const hasUrl = computed(() => props.status?.url !== null && props.status?.url !== undefined);

// TTL preset selection (seconds — the server validates the final value)
const ttlSeconds = ref<number>(REMOTE_SHARE_DEFAULT_TTL_SECONDS);

function ttlLabelKey(seconds: number): string {
  switch (seconds) {
    case 30 * 60:
      return 'remoteShare.ttl30m';
    case 60 * 60:
      return 'remoteShare.ttl1h';
    case 8 * 60 * 60:
      return 'remoteShare.ttl8h';
    case 24 * 60 * 60:
      return 'remoteShare.ttl24h';
    default:
      return '';
  }
}

function startShare(): void {
  emit('start', ttlSeconds.value);
}

// Running state: QR + URL + expiry countdown + stop
const qrCanvasRef = ref<HTMLCanvasElement | null>(null);
const qrFailed = ref(false);

watch(
  [() => props.status?.url, qrCanvasRef],
  async ([url, canvas]) => {
    qrFailed.value = false;
    if (!url || canvas === null) return;
    const ok = await renderQrToCanvas(canvas, url);
    if (!ok) qrFailed.value = true;
  },
  { immediate: true, flush: 'post' },
);

// 30s countdown clock while a share is active (the composable's 15s poll keeps
// the status itself fresh; this only keeps the "x h y m left" label moving).
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

const remainingSeconds = computed(() =>
  remoteShareRemainingSeconds(props.status?.expiresAt ?? null, nowTick.value),
);
const remainingParts = computed(() => {
  const secs = remainingSeconds.value;
  return secs === null ? null : remoteShareRemainingParts(secs);
});
const remainingText = computed(() => {
  const parts = remainingParts.value;
  if (parts === null) return '';
  if (parts.hours === 0 && parts.minutes === 0) return t('remoteShare.expired');
  return t('remoteShare.expiresIn', { hours: parts.hours, minutes: parts.minutes });
});
const expiresTimeText = computed(() => {
  const at = props.status?.expiresAt;
  if (!at) return '';
  try {
    return new Date(at).toLocaleString(locale.value);
  } catch {
    return new Date(at).toString();
  }
});

watch(
  isRunning,
  (running) => {
    if (running && tickTimer === null) {
      nowTick.value = Date.now();
      tickTimer = setInterval(() => {
        nowTick.value = Date.now();
      }, 30_000);
    } else if (!running && tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  },
  { immediate: true },
);

// ---------------------------------------------------------------------------
// Persistent state: QR + service/health badges + start/stop.
// ---------------------------------------------------------------------------
const persistentActive = computed(() => props.persistentStatus?.active === true);
const persistentHasUrl = computed(
  () => props.persistentStatus?.url !== null && props.persistentStatus?.url !== undefined,
);

const persistentQrCanvasRef = ref<HTMLCanvasElement | null>(null);
const persistentQrFailed = ref(false);

watch(
  [() => props.persistentStatus?.url, persistentQrCanvasRef],
  async ([url, canvas]) => {
    persistentQrFailed.value = false;
    if (!url || canvas === null) return;
    const ok = await renderQrToCanvas(canvas, url);
    if (!ok) persistentQrFailed.value = true;
  },
  { immediate: true, flush: 'post' },
);

const persistentStateKey = computed(() => {
  switch (props.persistentStatus?.state) {
    case 'active':
      return 'remoteShare.persistentStateActive';
    case 'inactive':
      return 'remoteShare.persistentStateInactive';
    case 'failed':
      return 'remoteShare.persistentStateFailed';
    case 'activating':
      return 'remoteShare.persistentStateActivating';
    case 'deactivating':
      return 'remoteShare.persistentStateDeactivating';
    case 'unsupported':
      return 'remoteShare.persistentStateUnsupported';
    default:
      return 'remoteShare.persistentStateUnknown';
  }
});
const persistentStateLabel = computed(() => t(persistentStateKey.value));

const persistentHealthKey = computed(() => {
  switch (props.persistentStatus?.health) {
    case 'ok':
      return 'remoteShare.persistentHealthOk';
    case 'down':
      return 'remoteShare.persistentHealthDown';
    case 'stale':
      return 'remoteShare.persistentHealthStale';
    default:
      return 'remoteShare.persistentHealthUnknown';
  }
});
const persistentHealthLabel = computed(() => t(persistentHealthKey.value));
const persistentHealthVariant = computed(() => {
  switch (props.persistentStatus?.health) {
    case 'ok':
      return 'success' as const;
    case 'down':
      return 'danger' as const;
    case 'stale':
      return 'warning' as const;
    default:
      return 'neutral' as const;
  }
});

const persistentMessageVariant = computed<'info' | 'warning' | 'danger'>(() => {
  const state = props.persistentStatus?.state;
  if (state === 'activating' || state === 'deactivating') return 'info';
  if (state === 'failed') return 'danger';
  return 'warning';
});

const persistentStartedText = computed(() => {
  const at = props.persistentStatus?.startedAt;
  if (!at) return '';
  try {
    return new Date(at).toLocaleString(locale.value);
  } catch {
    return at;
  }
});

// ---------------------------------------------------------------------------
// Copy link (user-initiated clipboard write); shared by both modes.
// ---------------------------------------------------------------------------
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function copyUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const ok = await copyTextToClipboard(url);
  if (!ok) return;
  copied.value = true;
  if (copyTimer !== null) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
    copyTimer = null;
  }, 1200);
}

// ---------------------------------------------------------------------------
// Error state: retry re-attempts the failed action (start when nothing is
// running, otherwise a status refresh).
// ---------------------------------------------------------------------------
function onRetry(): void {
  if (props.status?.active === true) {
    emit('refresh');
  } else {
    emit('start', ttlSeconds.value);
  }
}

onUnmounted(() => {
  if (tickTimer !== null) clearInterval(tickTimer);
  if (copyTimer !== null) clearTimeout(copyTimer);
});
</script>

<template>
  <Dialog
    v-model:open="open"
    size="md"
    :title="t('remoteShare.title')"
    @close="emit('close')"
  >
    <div class="rs">
      <!-- Temporary / persistent mode switch -->
      <SegmentedControl v-model="mode" :options="modeOptions" size="sm" class="rs-mode" />

      <!-- ====================== TEMPORARY MODE ====================== -->
      <template v-if="mode === 'temporary'">
        <!-- Shared failure banner (start / stop / first read). -->
        <div v-if="error" class="rs-error">
          <Banner variant="danger">{{ error }}</Banner>
          <div class="rs-error-actions">
            <Button variant="secondary" size="sm" @click="onRetry">
              <Icon name="refresh" size="sm" />
              {{ t('remoteShare.retry') }}
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')">
              {{ t('remoteShare.close') }}
            </Button>
          </div>
        </div>

        <!-- Running: QR + control link + expiry + stop. -->
        <div v-if="isRunning && hasUrl" class="rs-running">
          <p class="rs-intro">{{ t('remoteShare.runningIntro') }}</p>
          <div class="rs-qr-wrap">
            <canvas
              ref="qrCanvasRef"
              class="rs-qr"
              width="200"
              height="200"
              role="img"
              :aria-label="t('remoteShare.qrLabel')"
            />
            <span v-if="qrFailed" class="rs-qr-fallback">{{ t('remoteShare.retry') }}</span>
          </div>
          <div class="rs-url-block">
            <span class="rs-url-label">{{ t('remoteShare.urlLabel') }}</span>
            <code class="rs-url">{{ status?.url }}</code>
            <Button variant="secondary" size="sm" class="rs-copy" @click="copyUrl(status?.url)">
              <Icon :name="copied ? 'check' : 'copy'" size="sm" />
              {{ copied ? t('remoteShare.copied') : t('remoteShare.copyUrl') }}
            </Button>
          </div>
          <p v-if="remainingText || expiresTimeText" class="rs-meta">
            <span v-if="remainingText" class="rs-remaining">
              <Icon name="clock" size="sm" />
              {{ remainingText }}
            </span>
            <span v-if="expiresTimeText" class="rs-expires">
              <Icon name="calendar-schedule" size="sm" />
              {{ t('remoteShare.expiresLabel') }} · {{ expiresTimeText }}
            </span>
          </p>
          <div class="rs-warnings">
            <Banner variant="warning">{{ t('remoteShare.warningPassword') }}</Banner>
            <Banner variant="info">{{ t('remoteShare.warningNoSla') }}</Banner>
          </div>
          <div class="rs-actions">
            <Button
              variant="danger-soft"
              :loading="stopping"
              :disabled="starting || refreshing"
              @click="emit('stop')"
            >
              <Icon name="stop" size="sm" />
              {{ stopping ? t('remoteShare.stopping') : t('remoteShare.stopButton') }}
            </Button>
          </div>
        </div>

        <!-- Running but the control URL is not ready yet (edge up, tunnel pending). -->
        <div v-else-if="isRunning" class="rs-running">
          <p class="rs-intro">{{ t('remoteShare.noTunnelUrl') }}</p>
          <code v-if="status?.host && status?.port" class="rs-local">
            {{ status.host }}:{{ status.port }}
          </code>
          <div class="rs-actions">
            <Button
              variant="danger-soft"
              :loading="stopping"
              :disabled="starting || refreshing"
              @click="emit('stop')"
            >
              <Icon name="stop" size="sm" />
              {{ stopping ? t('remoteShare.stopping') : t('remoteShare.stopButton') }}
            </Button>
          </div>
        </div>

        <!-- Stopped: pick a duration and start. -->
        <div v-else class="rs-stopped">
          <p class="rs-intro">{{ t('remoteShare.description') }}</p>
          <Field :label="t('remoteShare.ttlLabel')" control-id="rs-ttl">
            <Select
              id="rs-ttl"
              :model-value="ttlSeconds"
              :disabled="starting"
              @update:model-value="ttlSeconds = Number($event)"
            >
              <option
                v-for="seconds in REMOTE_SHARE_TTL_PRESET_SECONDS"
                :key="seconds"
                :value="seconds"
              >
                {{ t(ttlLabelKey(seconds)) }}
              </option>
            </Select>
          </Field>
          <Button
            variant="primary"
            :loading="starting"
            :disabled="refreshing"
            class="rs-start"
            @click="startShare"
          >
            <Icon name="globe" size="sm" />
            {{ starting ? t('remoteShare.starting') : t('remoteShare.startButton') }}
          </Button>
        </div>
      </template>

      <!-- ====================== PERSISTENT MODE ====================== -->
      <template v-else>
        <div v-if="persistentError" class="rs-error">
          <Banner variant="danger">{{ persistentError }}</Banner>
          <div class="rs-error-actions">
            <Button
              variant="secondary"
              size="sm"
              :loading="persistentRefreshing"
              @click="emit('persistentRefresh')"
            >
              <Icon name="refresh" size="sm" />
              {{ t('remoteShare.persistentRefresh') }}
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')">
              {{ t('remoteShare.close') }}
            </Button>
          </div>
        </div>

        <template v-else>
          <p class="rs-intro">{{ t('remoteShare.persistentIntro') }}</p>

          <!-- Service + health summary -->
          <div class="rs-persist-summary">
            <Badge :dot="persistentActive" :variant="persistentActive ? 'success' : 'neutral'">
              {{ t('remoteShare.persistentState', { state: persistentStateLabel }) }}
            </Badge>
            <Badge :variant="persistentHealthVariant">
              {{ t('remoteShare.persistentHealth', { health: persistentHealthLabel }) }}
            </Badge>
          </div>

          <!-- Unsupported host: the whole mode is informational. -->
          <Banner v-if="persistentStatus?.systemdAvailable === false" variant="warning">
            {{ persistentStatus?.message ?? t('remoteShare.persistentIntro') }}
          </Banner>

          <!-- Running: service URL + QR + started + stop. -->
          <div v-if="persistentActive && persistentHasUrl" class="rs-running">
            <p class="rs-intro">{{ t('remoteShare.persistentActiveIntro') }}</p>
            <div class="rs-qr-wrap">
              <canvas
                ref="persistentQrCanvasRef"
                class="rs-qr"
                width="200"
                height="200"
                role="img"
                :aria-label="t('remoteShare.qrLabel')"
              />
              <span v-if="persistentQrFailed" class="rs-qr-fallback">
                {{ t('remoteShare.retry') }}
              </span>
            </div>
            <div class="rs-url-block">
              <span class="rs-url-label">{{ t('remoteShare.urlLabel') }}</span>
              <code class="rs-url">{{ persistentStatus?.url }}</code>
              <Button
                variant="secondary"
                size="sm"
                class="rs-copy"
                @click="copyUrl(persistentStatus?.url)"
              >
                <Icon :name="copied ? 'check' : 'copy'" size="sm" />
                {{ copied ? t('remoteShare.copied') : t('remoteShare.copyUrl') }}
              </Button>
            </div>
            <p v-if="persistentStartedText" class="rs-meta">
              <span class="rs-expires">
                <Icon name="clock" size="sm" />
                {{ t('remoteShare.persistentStartedLabel') }} · {{ persistentStartedText }}
              </span>
            </p>
            <Banner v-if="persistentStatus?.message" :variant="persistentMessageVariant">
              {{ persistentStatus.message }}
            </Banner>
            <div class="rs-warnings">
              <Banner variant="warning">{{ t('remoteShare.warningPassword') }}</Banner>
              <Banner variant="info">{{ t('remoteShare.warningNoSla') }}</Banner>
            </div>
            <div class="rs-actions">
              <Button
                variant="danger-soft"
                :loading="persistentStopping"
                :disabled="persistentStarting || persistentRefreshing"
                @click="emit('persistentStop')"
              >
                <Icon name="stop" size="sm" />
                {{ persistentStopping ? t('remoteShare.persistentStopping') : t('remoteShare.persistentStopButton') }}
              </Button>
              <Button
                variant="ghost"
                :loading="persistentRefreshing"
                :disabled="persistentStarting || persistentStopping"
                class="rs-refresh"
                @click="emit('persistentRefresh')"
              >
                <Icon name="refresh" size="sm" />
                {{ t('remoteShare.persistentRefresh') }}
              </Button>
            </div>
          </div>

          <!-- Active but no tunnel URL yet (service starting). -->
          <div v-else-if="persistentActive" class="rs-running">
            <p class="rs-intro">{{ t('remoteShare.persistentIntro') }}</p>
            <Banner v-if="persistentStatus?.message" :variant="persistentMessageVariant">
              {{ persistentStatus.message }}
            </Banner>
            <div class="rs-actions">
              <Button
                :loading="persistentRefreshing"
                :disabled="persistentStarting || persistentStopping"
                class="rs-refresh"
                @click="emit('persistentRefresh')"
              >
                <Icon name="refresh" size="sm" />
                {{ t('remoteShare.persistentRefresh') }}
              </Button>
            </div>
          </div>

          <!-- Stopped / not installed: start. -->
          <div v-else class="rs-stopped">
            <p class="rs-intro">{{ t('remoteShare.persistentStoppedIntro') }}</p>
            <Banner v-if="persistentStatus?.message" :variant="persistentMessageVariant">
              {{ persistentStatus.message }}
            </Banner>
            <div class="rs-actions">
              <Button
                variant="primary"
                :loading="persistentStarting"
                :disabled="persistentRefreshing || persistentStopping || persistentStatus?.systemdAvailable === false"
                @click="emit('persistentStart')"
              >
                <Icon name="play" size="sm" />
                {{ persistentStarting ? t('remoteShare.persistentStarting') : t('remoteShare.persistentStartButton') }}
              </Button>
              <Button
                variant="ghost"
                :loading="persistentRefreshing"
                :disabled="persistentStarting || persistentStopping"
                class="rs-refresh"
                @click="emit('persistentRefresh')"
              >
                <Icon name="refresh" size="sm" />
                {{ t('remoteShare.persistentRefresh') }}
              </Button>
            </div>
          </div>
        </template>
      </template>
    </div>
  </Dialog>
</template>

<style scoped>
.rs {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.rs-mode {
  align-self: flex-start;
}
.rs-intro {
  margin: 0;
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--color-text-muted);
}
.rs-persist-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.rs-qr-wrap {
  position: relative;
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.rs-qr {
  width: 200px;
  max-width: 100%;
  height: auto;
  image-rendering: pixelated;
}
.rs-qr-fallback {
  position: absolute;
  font-size: var(--text-sm);
  color: var(--color-text-faint);
}
.rs-url-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.rs-url-label {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.rs-url {
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-text);
  word-break: break-all;
  user-select: all;
}
.rs-copy {
  align-self: flex-start;
}
.rs-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.rs-remaining,
.rs-expires {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
.rs-warnings {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rs-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.rs-stopped {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.rs-start {
  align-self: flex-start;
}
.rs-refresh {
  align-self: flex-end;
}
.rs-local {
  align-self: flex-start;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text);
}
.rs-error {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rs-error-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
