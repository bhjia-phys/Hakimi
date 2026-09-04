<!-- apps/kimi-web/src/components/chat/ChatHeader.vue -->
<!-- Thin context bar above the chat: workspace/session identity, direct remote
     control, manual Preset routing, Git summary, connection status, and a ⋮
     session-actions menu. -->
<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { copyTextToClipboard } from '../../lib/clipboard';
import { isMacosDesktop } from '../../lib/desktopFlag';
import type { AutoSubagentPresetCandidateScore, AutoSubagentPresetStatus } from '../../api/types';
import type { ConnectionState } from '../../types';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';
import Menu from '../ui/Menu.vue';
import MenuItem from '../ui/MenuItem.vue';
import Tooltip from '../ui/Tooltip.vue';
import Badge from '../ui/Badge.vue';
import GitSummaryCard from './GitSummaryCard.vue';
import {
  formatSubagentPresetScore,
  subagentPresetCandidateSummary,
  subagentPresetCurrentEvaluation,
  subagentPresetLabel,
  subagentPresetReasonLabel,
  subagentPresetRemainingLabel,
  type SubagentPresetT,
} from '../../lib/subagentPreset';

const { t, locale } = useI18n();

const props = defineProps<{
  sessionId?: string;
  workspaceName?: string;
  /** Absolute path to the active workspace root. */
  workspaceRoot?: string;
  sessionTitle?: string;
  /** Active subagent preset selector shown by the header routing button. */
  subagentPreset?: string;
  /** Sorted configured preset names offered by the routing menu. */
  subagentPresetNames?: string[];
  /** True while a preset/config write is in flight. */
  subagentPresetSaving?: boolean;
  /** `autoPreset.manualLock`: a manually activated preset paused automatic
   *  switching. Shown as a lock badge and a resume-auto menu action. */
  subagentPresetLocked?: boolean;
  /** Latest process-global automatic routing evaluation, when supported. */
  autoSubagentPresetStatus?: AutoSubagentPresetStatus;
  branch?: string;
  ahead?: number;
  behind?: number;
  changesCount?: number;
  /** Git diff line stats: additions / deletions. Zero/null values are hidden. */
  gitDiffStats?: { totalAdditions: number; totalDeletions: number } | null;
  isGitRepo?: boolean;
  /** GitHub PR for the current branch, when known (null/undefined = none). */
  pr?: { number: number; state: string; url: string } | null;
  /** True for ~2s after a successful copy-all, to flip the icon to a check. */
  copied?: boolean;
  connection?: ConnectionState;
  /** Remote-share control surface available (feature on + non-remote). */
  remoteShareEnabled?: boolean;
  /** An all-session Web share is active — shows the clickable badge. */
  remoteShareActive?: boolean;
  /** ISO expiry of the active share (badge title hint). */
  remoteShareExpiresAt?: string;
}>();

/** Localized button label for the active preset or base-routing fallback. */
const presetButtonLabel = computed<string>(() =>
  subagentPresetLabel(props.subagentPreset, t as unknown as SubagentPresetT),
);
const normalizedPreset = computed(() => props.subagentPreset?.trim() ?? '');
const presetNow = ref(Date.now());
let presetClockTimer: ReturnType<typeof setInterval> | undefined;
const presetDiagnosticsVisible = computed(
  () => !props.subagentPresetLocked && props.autoSubagentPresetStatus !== undefined,
);
const presetEvaluationReason = computed(() => {
  const status = props.autoSubagentPresetStatus;
  return status === undefined
    ? ''
    : subagentPresetReasonLabel(status.reasonCode, t as unknown as SubagentPresetT);
});
const presetEvaluationMeta = computed(() => {
  const status = props.autoSubagentPresetStatus;
  if (status === undefined) return '';
  const profile = status.profileName ?? status.route;
  return t('header.subagentPresetEvaluatedFor', {
    profile,
    time: new Date(status.evaluatedAt).toLocaleString(locale.value),
  });
});
const presetCurrentScore = computed(() => {
  const status = props.autoSubagentPresetStatus;
  const score =
    status === undefined
      ? undefined
      : subagentPresetCurrentEvaluation(status, props.subagentPreset).score;
  return formatSubagentPresetScore(score, t as unknown as SubagentPresetT);
});
const presetCooldown = computed(() =>
  subagentPresetRemainingLabel(
    props.autoSubagentPresetStatus?.switchCooldownUntil,
    presetNow.value,
    'cooldown',
    t as unknown as SubagentPresetT,
  ),
);

function candidateForPreset(preset: string): AutoSubagentPresetCandidateScore | undefined {
  return props.autoSubagentPresetStatus?.candidates.find((candidate) => candidate.preset === preset);
}

function hasPresetCandidate(preset: string): boolean {
  return candidateForPreset(preset) !== undefined;
}

function presetCandidateSummaryFor(preset: string): string {
  const candidate = candidateForPreset(preset);
  return candidate === undefined
    ? t('header.subagentPresetNoData')
    : subagentPresetCandidateSummary(
        candidate,
        presetNow.value,
        t as unknown as SubagentPresetT,
      );
}

function presetCandidateScoreFor(preset: string): string {
  return formatSubagentPresetScore(
    candidateForPreset(preset)?.score,
    t as unknown as SubagentPresetT,
  );
}

function startPresetClock(): void {
  presetNow.value = Date.now();
  if (presetClockTimer !== undefined) return;
  presetClockTimer = setInterval(() => {
    presetNow.value = Date.now();
  }, 1000);
}

function stopPresetClock(): void {
  if (presetClockTimer === undefined) return;
  clearInterval(presetClockTimer);
  presetClockTimer = undefined;
}

/** Button a11y label: the routing state plus the lock badge when a manual
 *  activation paused automatic switching. */
const presetButtonAria = computed<string>(() => {
  const base = t('header.switchSubagentPreset', { preset: presetButtonLabel.value });
  return props.subagentPresetLocked
    ? `${base} · ${t('header.subagentPresetLocked')}`
    : base;
});
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

/** Badge tooltip for the active-share button: expiry time when known. */
const remoteShareExpiresTitle = computed<string>(() => {
  if (!props.remoteShareExpiresAt) return t('remoteShare.badgeActiveTitle');
  try {
    return `${t('remoteShare.badgeActiveTitle')} · ${new Date(props.remoteShareExpiresAt).toLocaleString(locale.value)}`;
  } catch {
    return t('remoteShare.badgeActiveTitle');
  }
});

const emit = defineEmits<{
  activatePreset: [preset: string];
  resumeAutoPreset: [];
  copyAll: [];
  copyFinalSummary: [];
  openChanges: [];
  openPr: [url: string];
  renameSession: [id: string, title: string];
  forkSession: [id: string];
  archiveSession: [id: string];
  exportSession: [id: string];
  openRemoteShare: [];
}>();

// ---------------------------------------------------------------------------
// Header menus — the Preset selector and kebab dropdown are mutually exclusive.
// ---------------------------------------------------------------------------
const menuOpen = ref(false);
const kebabRef = ref<InstanceType<typeof IconButton> | null>(null);
const menuRef = ref<InstanceType<typeof Menu> | null>(null);
const menuStyle = ref<Record<string, string>>({});
const presetMenuOpen = ref(false);
const presetMenuRef = ref<InstanceType<typeof Menu> | null>(null);
const presetMenuStyle = ref<Record<string, string>>({});
let presetButtonEl: HTMLButtonElement | null = null;
let presetFocusAfterSaveEl: HTMLButtonElement | null = null;

function onDocClick(e: MouseEvent): void {
  const target = e.target as Node;
  if (
    menuRef.value?.el?.contains(target) ||
    kebabRef.value?.el?.contains(target) ||
    presetMenuRef.value?.el?.contains(target) ||
    presetButtonEl?.contains(target)
  ) {
    return;
  }
  closeMenus();
}

function onScrollOrResize(e: Event): void {
  const target = e.target;
  if (target instanceof Node) {
    const el = target instanceof Element ? target : target.parentElement;
    // A scrolling ancestor (the streaming transcript, app shell, window, …)
    // must not dismiss an open menu; only genuine user interaction with the
    // menu's own scrollable area or a viewport resize may.
    if (el?.closest('.ch-preset-menu') !== null) return;
    if (e.type === 'scroll') return;
  }
  closeMenus();
}

function onMenuEscape(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || (!menuOpen.value && !presetMenuOpen.value)) return;
  const trigger = presetMenuOpen.value ? presetButtonEl : kebabRef.value?.el;
  e.preventDefault();
  e.stopPropagation();
  closeMenus();
  trigger?.focus();
}

function bindMenuListeners(): void {
  document.addEventListener('mousedown', onDocClick);
  document.addEventListener('keydown', onMenuEscape, true);
  window.addEventListener('resize', onScrollOrResize);
  window.addEventListener('scroll', onScrollOrResize, true);
}

function closeMenus(): void {
  menuOpen.value = false;
  presetMenuOpen.value = false;
  presetButtonEl = null;
  stopPresetClock();
  document.removeEventListener('mousedown', onDocClick);
  document.removeEventListener('keydown', onMenuEscape, true);
  window.removeEventListener('resize', onScrollOrResize);
  window.removeEventListener('scroll', onScrollOrResize, true);
}

function floatingMenuStyle(
  button: HTMLElement,
  menu: HTMLElement,
  align: 'start' | 'end',
): Record<string, string> {
  const r = button.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const menuW = menu.offsetWidth;
  const menuH = menu.offsetHeight;
  let top = r.bottom + gap;
  if (top + menuH > window.innerHeight - margin) {
    top = Math.max(margin, r.top - menuH - gap);
  }
  let left = align === 'end' ? r.right - menuW : r.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - menuW - margin));
  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  };
}

function presetMenuItems(): HTMLButtonElement[] {
  return Array.from(
    presetMenuRef.value?.el?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitemradio"]:not(:disabled), [role="menuitem"]:not(:disabled)',
    ) ?? [],
  );
}

function focusPresetMenuItem(item: HTMLButtonElement | undefined): void {
  item?.focus();
  item?.scrollIntoView({ block: 'nearest' });
}

function onPresetMenuKeydown(e: KeyboardEvent): void {
  const items = presetMenuItems();
  if (items.length === 0) return;
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  let next: HTMLButtonElement | undefined;
  if (e.key === 'ArrowDown') next = items[(current + 1) % items.length];
  else if (e.key === 'ArrowUp') next = items[(current <= 0 ? items.length : current) - 1];
  else if (e.key === 'Home') next = items[0];
  else if (e.key === 'End') next = items.at(-1);
  else if (e.key === 'Tab') {
    closeMenus();
    return;
  } else {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  focusPresetMenuItem(next);
}

async function toggleMenu(e: Event): Promise<void> {
  e.stopPropagation();
  if (menuOpen.value) {
    closeMenus();
    return;
  }
  closeMenus();
  menuOpen.value = true;
  bindMenuListeners();
  await nextTick();
  const button = kebabRef.value?.el;
  const menu = menuRef.value?.el;
  if (button && menu) menuStyle.value = floatingMenuStyle(button, menu, 'start');
}

async function togglePresetMenu(e: MouseEvent): Promise<void> {
  e.stopPropagation();
  if (presetMenuOpen.value) {
    closeMenus();
    return;
  }
  closeMenus();
  presetButtonEl = e.currentTarget as HTMLButtonElement;
  presetMenuOpen.value = true;
  startPresetClock();
  bindMenuListeners();
  await nextTick();
  const menu = presetMenuRef.value?.el;
  if (presetButtonEl && menu) {
    presetMenuStyle.value = floatingMenuStyle(presetButtonEl, menu, 'end');
  }
  const items = presetMenuItems();
  focusPresetMenuItem(
    items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0],
  );
}

function choosePreset(preset: string): void {
  const trigger = presetButtonEl;
  closeMenus();
  trigger?.focus();
  if (
    props.subagentPresetSaving ||
    (preset === normalizedPreset.value && props.subagentPresetLocked)
  ) return;
  presetFocusAfterSaveEl = trigger;
  emit('activatePreset', preset);
}

/** Resume-automatic action guarded like a preset switch: only a minimal
 *  `manualLock: false` patch; the active preset and the auto gates stay. */
function resumeAutoPreset(): void {
  const trigger = presetButtonEl;
  closeMenus();
  trigger?.focus();
  if (props.subagentPresetSaving) return;
  emit('resumeAutoPreset');
}

watch(
  () => props.subagentPresetSaving,
  async (saving, wasSaving) => {
    if (saving || !wasSaving || !presetFocusAfterSaveEl) return;
    const trigger = presetFocusAfterSaveEl;
    presetFocusAfterSaveEl = null;
    await nextTick();
    const activeElement = document.activeElement;
    if (
      trigger.isConnected &&
      (activeElement === null || activeElement === document.body || activeElement === trigger)
    ) {
      trigger.focus();
    }
  },
);

onUnmounted(closeMenus);

function onCopyAll(): void {
  emit('copyAll');
  closeMenus();
}

function onCopyFinalSummary(): void {
  emit('copyFinalSummary');
  closeMenus();
}

// ---------------------------------------------------------------------------
// Copy session ID
// ---------------------------------------------------------------------------
const copiedId = ref(false);
function copySessionId(): void {
  if (!props.sessionId) return;
  void copyTextToClipboard(props.sessionId).then((ok) => {
    if (!ok) return;
    copiedId.value = true;
    setTimeout(() => {
      copiedId.value = false;
    }, 1200);
  });
}

// ---------------------------------------------------------------------------
// Inline rename (mirrors SessionRow)
// ---------------------------------------------------------------------------
const renaming = ref(false);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

async function startRename(): Promise<void> {
  closeMenus();
  if (!props.sessionId) return;
  renaming.value = true;
  renameValue.value = props.sessionTitle ?? '';
  await nextTick();
  try {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  } catch {
    // jsdom may not implement focus/select
  }
}

function commitRename(): void {
  const newTitle = renameValue.value.trim();
  if (newTitle && props.sessionId && newTitle !== (props.sessionTitle ?? '').trim()) {
    emit('renameSession', props.sessionId, newTitle);
  }
  renaming.value = false;
}

function cancelRename(): void {
  renaming.value = false;
}

// ---------------------------------------------------------------------------
// Fork
// ---------------------------------------------------------------------------
function forkSession(): void {
  if (!props.sessionId) return;
  closeMenus();
  emit('forkSession', props.sessionId);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function exportSession(): void {
  if (!props.sessionId) return;
  closeMenus();
  emit('exportSession', props.sessionId);
}

// ---------------------------------------------------------------------------
// Archive — the modal confirm and the async work live in App.vue
// (confirmArchiveSession); the header only emits the intent.
// ---------------------------------------------------------------------------
function startArchive(): void {
  if (!props.sessionId) return;
  closeMenus();
  emit('archiveSession', props.sessionId);
}

// ---------------------------------------------------------------------------
// Remote share — the dialog lives in App.vue; the header only emits the intent.
// ---------------------------------------------------------------------------
function openRemoteShare(): void {
  closeMenus();
  emit('openRemoteShare');
}
</script>

<template>
  <header class="chat-header" :class="{ 'macos-desktop': isMacosDesktop }">
    <!-- Workspace / session breadcrumb -->
    <div class="ch-id">
      <span v-if="workspaceName" class="ch-ws">{{ workspaceName }}</span>
      <span v-if="workspaceName && sessionTitle" class="ch-sep">/</span>
      <input
        v-if="renaming"
        ref="renameInputRef"
        v-model="renameValue"
        class="ch-rename"
        type="text"
        @keydown.enter.stop="commitRename"
        @keydown.esc.stop="cancelRename"
        @blur="commitRename"
        @click.stop
      />
      <Tooltip v-else-if="sessionTitle" :text="sessionTitle">
        <span class="ch-ses">{{ sessionTitle }}</span>
      </Tooltip>
    </div>

    <!-- More menu trigger: copy-all + session actions -->
    <IconButton
      ref="kebabRef"
      class="ch-act-more"
      :class="{ open: menuOpen }"
      :label="t('header.options')"
      :aria-expanded="menuOpen"
      aria-haspopup="menu"
      @click.stop="toggleMenu($event)"
    >
      <Icon name="dots-horizontal" size="md" />
    </IconButton>

    <!-- Fixed more menu -->
    <Menu
      v-if="menuOpen"
      ref="menuRef"
      class="ch-menu"
      :style="menuStyle"
      @click.stop
    >
      <MenuItem @click="onCopyAll">
        <Icon :name="copied ? 'check' : 'copy'" size="sm" />
        {{ copied ? t('header.copied') : t('header.copyAll') }}
      </MenuItem>
      <MenuItem @click="onCopyFinalSummary">
        <Icon name="file-text" size="sm" />
        {{ t('header.copyFinalSummary') }}
      </MenuItem>
      <template v-if="sessionId">
        <MenuItem separator />
        <MenuItem @click="copySessionId">
          <Icon :name="copiedId ? 'check' : 'copy'" size="sm" />
          {{ copiedId ? t('header.copied') : t('header.copySessionId') }}
        </MenuItem>
        <MenuItem @click="startRename">
          <Icon name="pencil" size="sm" />
          {{ t('header.renameSession') }}
        </MenuItem>
        <MenuItem @click="forkSession">
          <Icon name="git-fork" size="sm" />
          {{ t('header.forkSession') }}
        </MenuItem>
        <MenuItem @click="exportSession">
          <Icon name="download" size="sm" />
          {{ t('header.exportSession') }}
        </MenuItem>
        <MenuItem danger @click="startArchive">
          <Icon name="archive" size="sm" />
          {{ t('header.archiveSession') }}
        </MenuItem>
      </template>
    </Menu>

    <div class="ch-git-region">
      <!-- Connection status — always visible; a disconnected server stands out
           next to the session identity. -->
      <div class="ch-remote-status" role="status" aria-live="polite">
        <Badge :variant="connectionVariant" size="sm" dot>{{ connectionText }}</Badge>
      </div>
      <!-- Direct remote-control entry. The same button starts a share and
           reopens an active one; it stays hidden inside a remote view, because a
           share cannot be shared again (App gates remoteShareEnabled on
           non-remote mode). -->
      <Button
        v-if="remoteShareEnabled"
        class="ch-remote-share"
        :class="{ active: remoteShareActive }"
        variant="secondary"
        size="sm"
        :aria-label="remoteShareActive ? t('remoteShare.badgeActiveTitle') : t('remoteShare.menuEntry')"
        :title="remoteShareActive ? remoteShareExpiresTitle : t('remoteShare.menuEntry')"
        @click.stop="openRemoteShare"
      >
        <span v-if="remoteShareActive" class="ch-remote-dot" aria-hidden="true" />
        <Icon v-else name="globe" size="sm" />
        <span class="ch-remote-label">
          {{ remoteShareActive ? t('remoteShare.badgeActive') : t('remoteShare.menuEntry') }}
        </span>
      </Button>
      <!-- Persistent subagent-routing control. It always shows either the active
           preset or base routing, and opens a direct manual-switch menu. -->
      <Button
        class="ch-preset-button"
        :class="{ open: presetMenuOpen }"
        variant="secondary"
        size="sm"
        :loading="subagentPresetSaving"
        :aria-label="presetButtonAria"
        :aria-expanded="presetMenuOpen"
        aria-haspopup="menu"
        @click.stop="togglePresetMenu"
      >
        <span class="ch-preset-label">{{ presetButtonLabel }}</span>
        <Badge
          v-if="subagentPresetLocked"
          class="ch-preset-lock"
          variant="warning"
          size="sm"
          dot
        >
          {{ t('header.subagentPresetLocked') }}
        </Badge>
        <Icon
          class="ch-preset-chevron"
          :class="{ open: presetMenuOpen }"
          name="chevron-down"
          size="sm"
        />
      </Button>
      <Menu
        v-if="presetMenuOpen"
        ref="presetMenuRef"
        class="ch-preset-menu"
        :style="presetMenuStyle"
        :aria-label="t('header.switchSubagentPreset', { preset: presetButtonLabel })"
        @click.stop
        @keydown="onPresetMenuKeydown"
      >
        <div v-if="subagentPresetLocked" class="ch-preset-diagnostics is-locked" role="status">
          <Badge variant="warning" size="sm" dot>
            {{ t('header.subagentPresetLocked') }}
          </Badge>
          <span>{{ t('header.subagentPresetLockDiagnosticsHidden') }}</span>
        </div>
        <div v-else-if="presetDiagnosticsVisible" class="ch-preset-diagnostics" role="status">
          <div class="ch-preset-diagnostics-head">
            <span>{{ t('header.subagentPresetLatestEvaluation') }}</span>
            <Badge size="sm">{{ presetCurrentScore }}</Badge>
          </div>
          <strong>{{ presetEvaluationReason }}</strong>
          <span>{{ presetEvaluationMeta }}</span>
          <Badge v-if="presetCooldown" variant="warning" size="sm">
            {{ presetCooldown }}
          </Badge>
        </div>
        <MenuItem v-if="subagentPresetLocked || presetDiagnosticsVisible" separator />
        <MenuItem
          role="menuitemradio"
          :aria-checked="normalizedPreset === ''"
          :active="normalizedPreset === ''"
          :disabled="subagentPresetSaving"
          @click="choosePreset('')"
        >
          <span class="ch-preset-check">
            <Icon v-if="normalizedPreset === ''" name="check" size="sm" />
          </span>
          <span class="ch-preset-name">{{ t('header.subagentPresetBaseOption') }}</span>
        </MenuItem>
        <MenuItem
          v-for="preset in subagentPresetNames"
          :key="preset"
          role="menuitemradio"
          :aria-checked="normalizedPreset === preset"
          :active="normalizedPreset === preset"
          :disabled="subagentPresetSaving"
          @click="choosePreset(preset)"
        >
          <span class="ch-preset-check">
            <Icon v-if="normalizedPreset === preset" name="check" size="sm" />
          </span>
          <span class="ch-preset-option">
            <span class="ch-preset-name">{{ preset }}</span>
            <small v-if="presetDiagnosticsVisible && hasPresetCandidate(preset)">
              {{ presetCandidateSummaryFor(preset) }}
            </small>
          </span>
          <span
            v-if="presetDiagnosticsVisible && hasPresetCandidate(preset)"
            class="ch-preset-score"
          >
            {{ presetCandidateScoreFor(preset) }}
          </span>
        </MenuItem>
        <MenuItem v-if="subagentPresetLocked" separator />
        <MenuItem
          v-if="subagentPresetLocked"
          :disabled="subagentPresetSaving"
          @click="resumeAutoPreset"
        >
          <Icon name="refresh" size="sm" />
          {{ t('header.subagentPresetResumeAuto') }}
        </MenuItem>
      </Menu>
      <!-- Compact Git summary. Detached HEAD remains visible; non-repositories do not. -->
      <GitSummaryCard
        v-if="isGitRepo"
        :branch="branch"
        :ahead="ahead"
        :behind="behind"
        :changes-count="changesCount"
        :git-diff-stats="gitDiffStats"
        :pr="pr"
        @open-changes="emit('openChanges')"
        @open-pr="emit('openPr', $event)"
      />
    </div>

  </header>
</template>

<style scoped>
.chat-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-line);
  background: var(--color-bg);
  font-family: var(--font-ui);
  min-width: 0;
}
/* macOS desktop: the window has a hidden title bar, so the conversation header
   doubles as a window-drag region. Interactive controls opt out with no-drag. */
.chat-header.macos-desktop {
  -webkit-app-region: drag;
}
.chat-header.macos-desktop button,
.chat-header.macos-desktop input {
  -webkit-app-region: no-drag;
}
.ch-id { display: flex; align-items: center; gap: 6px; min-width: 0; flex: none; max-width: 46%; }
.ch-ws { color: var(--color-text-muted); font-size: var(--text-base); font-weight: var(--weight-medium); flex: none; }
.ch-sep { color: var(--color-text-faint); flex: none; }
.ch-ses {
  color: var(--color-text);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ch-rename {
  flex: 1;
  min-width: 0;
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-xs);
  padding: 2px 5px;
  outline: none;
}

.ch-git-region {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-2);
  container-type: inline-size;
}
.ch-remote-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
/* Direct remote-share button: globe while idle, success dot while active. */
.ch-remote-share {
  flex: none;
}
.ch-remote-share.active {
  border-color: var(--color-success);
}
.ch-remote-share .ch-remote-label {
  font-size: var(--text-sm);
}
.ch-remote-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--color-success);
  flex: none;
}
/* Preset control stays compact and never squeezes the Git summary card. */
.ch-preset-button {
  flex: none;
  min-width: 0;
  max-width: 40%;
}
.ch-preset-button.open { background: var(--color-surface-sunken); }
.ch-preset-button :deep(.ui-button__content) { min-width: 0; }
.ch-preset-label,
.ch-preset-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ch-preset-chevron {
  transition: transform var(--duration-base) var(--ease-out);
}
.ch-preset-chevron.open { transform: rotate(180deg); }
.ch-preset-check {
  width: var(--p-ic-sm);
  height: var(--p-ic-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
/* Lock badge in the preset button: flex-none so the truncated label takes the
   overflow, never the badge itself. */
.ch-preset-lock {
  flex: none;
  max-width: 45%;
}
.ch-preset-lock :deep(.ui-badge__dot) { flex: none; }

/* Overflow "…" trigger — IconButton (md). The "open" state keeps the
   sunken highlight while the menu is showing. */
.ch-act-more.open { background: var(--color-surface-sunken); color: var(--color-text); }

/* Fixed header menus. Surface / items come from the Menu + MenuItem primitives;
   only positioning and the Preset menu's viewport bounds stay here. */
.ch-menu,
.ch-preset-menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--z-dropdown);
}
.ch-preset-menu {
  width: min(380px, calc(100vw - (2 * var(--space-4))));
  max-height: calc(100vh - (2 * var(--space-4)));
  overflow-y: auto;
}
.ch-preset-menu :deep(.ui-menu-item) { min-width: 0; }
.ch-preset-diagnostics {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
}
.ch-preset-diagnostics.is-locked {
  flex-direction: row;
  align-items: center;
  gap: var(--space-2);
}
.ch-preset-diagnostics-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--color-text-faint);
}
.ch-preset-diagnostics strong {
  color: var(--color-text);
  font-weight: var(--weight-medium);
}
.ch-preset-option {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.ch-preset-option small {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ch-preset-score {
  flex: none;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

/* The conversation column can be much narrower than the viewport when side
   panels are open, so container width drives desktop-header degradation. */
@container (max-width: 640px) {
  .chat-header {
    gap: var(--space-2);
    padding-inline: var(--space-3);
  }
  .ch-id { max-width: 34%; }
}
@container (max-width: 480px) {
  .chat-header { padding-inline: var(--space-2); }
  .ch-id { display: none; }
}

/* On a narrow viewport, the action labels collapse to icons. */
@media (max-width: 980px) {
  .ch-act-label { display: none; }
}
@media (max-width: 640px) {
  .chat-header { display: none; }
}
</style>
