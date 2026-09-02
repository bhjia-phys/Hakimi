<!-- apps/kimi-web/src/components/settings/SettingsDialog.vue -->
<!-- The app's dedicated Settings page (modal). Consolidates what used to be
     scattered in the sidebar account popover: appearance, language, account,
     connection, plus notifications and the troubleshooting-log export. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useKimiWebClient } from '../../composables/useKimiWebClient';
import { useDialogFocus } from '../../composables/useDialogFocus';
import LanguageSwitcher from './LanguageSwitcher.vue';
import { serverEndpointLabel } from '../../api/config';
import { downloadTraceLog, isTraceEnabled } from '../../debug/trace';
import {
  autoSubagentPresetEnabled,
  autoSubagentPresetFlagOverridden,
  autoSubagentPresetPatch,
  autoSubagentPresetSupported,
  formatSubagentPresetDuration,
  formatSubagentPresetScore,
  mainRouteForPreset,
  subagentPresetAvailabilityLabel,
  subagentPresetCandidateBreakdown,
  subagentPresetCandidatesOrder,
  subagentPresetCurrentEvaluation,
  subagentPresetCandidatesPatch,
  subagentPresetEvidenceLabel,
  subagentPresetManualLock,
  subagentPresetReasonLabel,
  subagentPresetRemainingLabel,
  subagentPresetResumeAutoPatch,
  type SubagentPresetT,
} from '../../lib/subagentPreset';
import type { Accent, ColorScheme } from '../../composables/useKimiWebClient';
import type {
  AppConfig,
  AppModel,
  AppSession,
  AutoSubagentPresetCandidateScore,
  AutoSubagentPresetPolicySnapshot,
  AutoSubagentPresetStatus,
} from '../../api/types';
import Dialog from '../ui/Dialog.vue';
import Switch from '../ui/Switch.vue';
import Button from '../ui/Button.vue';
import Banner from '../ui/Banner.vue';
import Card from '../ui/Card.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import Select from '../ui/Select.vue';
import Tooltip from '../ui/Tooltip.vue';
import Badge from '../ui/Badge.vue';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';
import ProviderUsagePanel from './ProviderUsagePanel.vue';

const { t, locale } = useI18n();

const props = defineProps<{
  colorScheme: ColorScheme;
  accent: Accent;
  uiFontSize: number;
  authReady: boolean;
  accountModel?: string | null;
  /** Browser-notification-on-completion preference. */
  notify: boolean;
  /** Browser-notification-on-question (needs answer) preference. */
  notifyQuestion: boolean;
  /** Browser-notification-on-approval preference. */
  notifyApproval: boolean;
  /** OS permission state ('default' | 'granted' | 'denied') for the hint. */
  notifyPermission?: string;
  /** Play-a-sound-on-completion preference. */
  sound: boolean;
  /** Conversation outline (proportional bubbles, viewport indicator, hover tooltip). */
  conversationToc?: boolean;
  /** Global daemon config from GET /api/v1/config. Secrets are redacted server-side. */
  config?: AppConfig | null;
  /** Latest process-global automatic routing evaluation, when supported. */
  autoSubagentPresetStatus?: AutoSubagentPresetStatus;
  /** Models from the daemon catalog, used to label default-model choices. */
  models?: AppModel[];
  /** True while a config or preset activation request is saving. */
  configSaving?: boolean;
  /** Server version reported by GET /api/v1/meta. */
  serverVersion?: string;
  /** Effective experimental flags reported by GET /api/v1/meta. */
  experimentalFlags?: Record<string, boolean>;
  /** Backend engine generation from GET /api/v1/meta ('v1' legacy, 'v2' kap-server). */
  backend?: 'v1' | 'v2';
}>();

const emit = defineEmits<{
  setColorScheme: [colorScheme: ColorScheme];
  setAccent: [accent: Accent];
  setUiFontSize: [size: number];
  setNotify: [on: boolean];
  setNotifyQuestion: [on: boolean];
  setNotifyApproval: [on: boolean];
  setSound: [on: boolean];
  setConversationToc: [on: boolean];
  login: [];
  logout: [];
  openOnboarding: [];
  openProviders: [];
  updateConfig: [patch: Partial<AppConfig>];
  activatePreset: [preset: string];
  close: [];
}>();

type SettingsTab = 'general' | 'agent' | 'account' | 'advanced' | 'archived';

const activeTab = ref<SettingsTab>('general');

const tabs: { id: SettingsTab; labelKey: string }[] = [
  { id: 'general', labelKey: 'settings.tabs.general' },
  { id: 'agent', labelKey: 'settings.tabs.agent' },
  { id: 'account', labelKey: 'settings.tabs.account' },
  { id: 'advanced', labelKey: 'settings.tabs.advanced' },
  { id: 'archived', labelKey: 'settings.tabs.archived' },
];

const daemonEndpoint = serverEndpointLabel();
const backendLabel = computed(() =>
  props.backend === 'v2' ? 'v2 (kap-server)' : 'v1 (server)',
);
const permissionModes = ['manual', 'yolo', 'auto'] as const;
// Reuse the Composer's permission labels (status.permission*) so the
// default-permission names stay in sync with the toolbar.
const permissionLabelKey: Record<(typeof permissionModes)[number], string> = {
  manual: 'status.permissionManual',
  auto: 'status.permissionAuto',
  yolo: 'status.permissionYolo',
};

// Modal focus: move focus into the dialog on open, restore it to the opener on
// close (Escape-to-close is handled below).
const dialogRef = ref<HTMLElement | null>(null);
useDialogFocus(dialogRef);

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}
const schedulerNow = ref(Date.now());
let schedulerClock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  schedulerClock = setInterval(() => {
    schedulerNow.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  if (schedulerClock !== undefined) clearInterval(schedulerClock);
});

function exportLog(): void {
  downloadTraceLog();
}

type ModelOption = { id: string; label: string; provider: string };

const modelOptions = computed<ModelOption[]>(() => {
  const byId = new Map<string, ModelOption>();
  for (const model of props.models ?? []) {
    byId.set(model.id, {
      id: model.id,
      label: model.displayName ?? model.model ?? model.id,
      provider: model.provider,
    });
  }
  for (const [id, raw] of Object.entries(props.config?.models ?? {})) {
    if (byId.has(id)) continue;
    const provider = extractConfigModelProvider(raw);
    byId.set(id, {
      id,
      label: formatConfigModelLabel(id, raw, provider),
      provider: provider ?? id,
    });
  }
  return Array.from(byId.values());
});

const modelGroups = computed<Array<{ provider: string; options: ModelOption[] }>>(() => {
  const map = new Map<string, ModelOption[]>();
  for (const option of modelOptions.value) {
    const list = map.get(option.provider) ?? [];
    list.push(option);
    map.set(option.provider, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }
  return Array.from(map.entries())
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([provider, options]) => ({ provider, options }));
});

const subagentPresetNames = computed<string[]>(() =>
  Object.keys(props.config?.subagent?.presets ?? {}).toSorted((a, b) => a.localeCompare(b)),
);

const automaticPresetSwitchingSupported = ref(false);
let automaticPresetSupportServer = '';
watch(
  [() => props.backend, () => props.serverVersion, () => props.experimentalFlags],
  ([backend, serverVersion, experimentalFlags]) => {
    const server = `${backend ?? ''}:${serverVersion ?? ''}`;
    if (server !== automaticPresetSupportServer) {
      automaticPresetSwitchingSupported.value = false;
      automaticPresetSupportServer = server;
    }
    if (backend !== 'v2') {
      automaticPresetSwitchingSupported.value = false;
    } else if (autoSubagentPresetSupported(experimentalFlags ?? {})) {
      automaticPresetSwitchingSupported.value = true;
    }
  },
  { immediate: true },
);
const automaticPresetSwitching = computed(() =>
  autoSubagentPresetEnabled(props.config, props.experimentalFlags ?? {}),
);
const automaticPresetSwitchingOverridden = computed(() =>
  autoSubagentPresetFlagOverridden(props.config, props.experimentalFlags ?? {}),
);

/** `autoPreset.manualLock`: a manually activated preset paused automatic
 *  switching; the lock row offers the resume-auto action. */
const presetManualLocked = computed(() => subagentPresetManualLock(props.config));

/** Presets in the declaration order of `subagent.presets` — the order used as
 *  the automatic-switching candidate fallback when no subset is configured. */
const presetDeclarationOrder = computed<string[]>(() =>
  Object.keys(props.config?.subagent?.presets ?? {}),
);
/** Effective candidate priority: the configured subset as-is, or every preset
 *  in declaration order when none is configured. */
const presetCandidatesOrder = computed<string[]>(() =>
  subagentPresetCandidatesOrder(props.config, presetDeclarationOrder.value),
);
/** Declared presets not already in the priority list, offered by the add
 *  selector. When none is configured the fallback already covers all presets,
 *  so this is empty and there is nothing to add. */
const addablePresets = computed<string[]>(() =>
  presetDeclarationOrder.value.filter((name) => !presetCandidatesOrder.value.includes(name)),
);

const schedulerReason = computed(() => {
  const status = props.autoSubagentPresetStatus;
  return status === undefined
    ? ''
    : subagentPresetReasonLabel(status.reasonCode, t as unknown as SubagentPresetT);
});
const schedulerEvaluationContext = computed(() => {
  const status = props.autoSubagentPresetStatus;
  if (status === undefined) return '';
  return t('settings.smartRoutingEvaluationContext', {
    route: status.route,
    profile: status.profileName ?? t('header.subagentPresetNoData'),
    time: new Date(status.evaluatedAt).toLocaleString(locale.value),
  });
});
const schedulerCurrent = computed(() => {
  const status = props.autoSubagentPresetStatus;
  if (status === undefined) return '';
  const current = subagentPresetCurrentEvaluation(
    status,
    props.config?.subagent?.preset,
  );
  return t('settings.smartRoutingActiveSelection', {
    current: current.preset ?? t('header.subagentPresetNoData'),
    score: formatSubagentPresetScore(current.score, t as unknown as SubagentPresetT),
  });
});
const schedulerSelection = computed(() => {
  const status = props.autoSubagentPresetStatus;
  if (status === undefined) return '';
  return t('settings.smartRoutingCurrentSelection', {
    previous: status.currentPreset ?? t('header.subagentPresetNoData'),
    selected: status.selectedPreset ?? t('header.subagentPresetNoData'),
  });
});
const schedulerCooldown = computed(() =>
  subagentPresetRemainingLabel(
    props.autoSubagentPresetStatus?.switchCooldownUntil,
    schedulerNow.value,
    'cooldown',
    t as unknown as SubagentPresetT,
  ),
);

function schedulerCandidateScore(candidate: AutoSubagentPresetCandidateScore): string {
  return formatSubagentPresetScore(candidate.score, t as unknown as SubagentPresetT);
}

function schedulerCandidateStatus(candidate: AutoSubagentPresetCandidateScore): string {
  return (
    subagentPresetRemainingLabel(
      candidate.circuitBreakerOpenUntil,
      schedulerNow.value,
      'circuit',
      t as unknown as SubagentPresetT,
    ) ?? subagentPresetAvailabilityLabel(candidate.availability, t as unknown as SubagentPresetT)
  );
}

function schedulerCandidateStatusVariant(
  candidate: AutoSubagentPresetCandidateScore,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (candidate.availability === 'healthy') return 'success';
  if (candidate.availability === 'circuit_open') return 'danger';
  if (candidate.availability === 'quota_below_floor') return 'warning';
  return 'neutral';
}

function schedulerCandidateBreakdown(candidate: AutoSubagentPresetCandidateScore): string {
  return subagentPresetCandidateBreakdown(candidate, t as unknown as SubagentPresetT);
}

function schedulerCandidateEvidence(candidate: AutoSubagentPresetCandidateScore): string {
  return t('settings.smartRoutingEvidence', {
    evidence: subagentPresetEvidenceLabel(candidate, t as unknown as SubagentPresetT),
    failures: candidate.localEvidence.failureCount,
    tokens: candidate.localEvidence.tokenCount.toLocaleString(locale.value),
  });
}

const schedulerPolicy = computed<Partial<AutoSubagentPresetPolicySnapshot>>(() => {
  if (props.autoSubagentPresetStatus !== undefined) return props.autoSubagentPresetStatus.policy;
  const autoPreset = props.config?.subagent?.autoPreset;
  return {
    quotaFloorPercent: autoPreset?.quotaFloorPercent,
    switchMarginPercent: autoPreset?.switchMarginPercent,
    localUsageWindowMs: autoPreset?.localUsageWindowMs,
    localUsageWeightPercent: autoPreset?.localUsageWeightPercent,
    priorityWeightPercent: autoPreset?.priorityWeightPercent,
    reliabilityWeightPercent: autoPreset?.reliabilityWeightPercent,
    latencyWeightPercent: autoPreset?.latencyWeightPercent,
    switchCooldownMs: autoPreset?.switchCooldownMs,
    circuitBreakerFailureThreshold: autoPreset?.circuitBreakerFailureThreshold,
    circuitBreakerCooldownMs: autoPreset?.circuitBreakerCooldownMs,
  };
});
const schedulerPolicyKeys: Array<keyof AutoSubagentPresetPolicySnapshot> = [
  'quotaFloorPercent',
  'switchMarginPercent',
  'localUsageWindowMs',
  'localUsageWeightPercent',
  'priorityWeightPercent',
  'reliabilityWeightPercent',
  'latencyWeightPercent',
  'switchCooldownMs',
  'circuitBreakerFailureThreshold',
  'circuitBreakerCooldownMs',
];
const schedulerPolicyEntries = computed(() =>
  schedulerPolicyKeys.flatMap((key) => {
    const value = schedulerPolicy.value[key];
    return value === undefined ? [] : [{ key, value }];
  }),
);

function schedulerPolicyValue(
  key: keyof AutoSubagentPresetPolicySnapshot,
  value: number,
): string {
  if (key.endsWith('Ms')) {
    return formatSubagentPresetDuration(value, t as unknown as SubagentPresetT);
  }
  if (key.endsWith('Percent')) return `${value}%`;
  return String(value);
}

const effectiveSubagentRoutes = computed(() => {
  const subagent = props.config?.subagent;
  const activePreset = subagent?.preset;
  const presetRoutes = activePreset ? subagent?.presets?.[activePreset] : undefined;
  return Object.entries({ ...subagent?.agents, ...presetRoutes }).toSorted(([a], [b]) =>
    a.localeCompare(b),
  );
});

const activeMainRoute = computed(() => {
  const config = props.config;
  if (!config) return undefined;
  return mainRouteForPreset(config, config.subagent?.preset ?? '');
});

const defaultPermissionMode = computed(() => {
  const mode = props.config?.defaultPermissionMode;
  return mode === 'auto' || mode === 'yolo' || mode === 'manual' ? mode : 'manual';
});

function extractConfigModelProvider(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const provider = typeof source['provider'] === 'string' ? source['provider'] : undefined;
  return provider;
}

function formatConfigModelLabel(id: string, raw: unknown, provider?: string): string {
  if (!raw || typeof raw !== 'object') return id;
  const source = raw as Record<string, unknown>;
  const model = typeof source['model'] === 'string' ? source['model'] : undefined;
  const resolvedProvider = provider ?? extractConfigModelProvider(raw);
  if (model && resolvedProvider) return `${id} (${resolvedProvider}/${model})`;
  if (model) return `${id} (${model})`;
  return id;
}

function configBool(value: boolean | undefined): boolean {
  return value === true;
}

function setDefaultModel(value: string): void {
  if (!value || value === props.config?.defaultModel) return;
  emit('updateConfig', { defaultModel: value });
}

function setDefaultPermissionMode(mode: 'manual' | 'auto' | 'yolo'): void {
  if (mode === defaultPermissionMode.value) return;
  emit('updateConfig', { defaultPermissionMode: mode });
}

function setSubagentPreset(preset: string): void {
  const config = props.config;
  if (!config || preset === (config.subagent?.preset ?? '')) return;
  emit('activatePreset', preset);
}

function setAutomaticPresetSwitching(enabled: boolean): void {
  if (enabled === automaticPresetSwitching.value) return;
  emit('updateConfig', autoSubagentPresetPatch(enabled));
}

/** Resume automatic switching: minimal patch clearing only the manual lock —
 *  the active preset and the auto gates stay exactly as configured. */
function resumeAutoPreset(): void {
  if (props.configSaving) return;
  emit('updateConfig', subagentPresetResumeAutoPatch());
}

/** Candidate-priority edits persist only `subagent.autoPreset.candidates`;
 *  every control is disabled while a config write is in flight. */
function addPresetCandidate(name: string): void {
  if (props.configSaving || !name) return;
  emit('updateConfig', subagentPresetCandidatesPatch([...presetCandidatesOrder.value, name]));
}

function removePresetCandidate(name: string): void {
  if (props.configSaving) return;
  emit(
    'updateConfig',
    subagentPresetCandidatesPatch(presetCandidatesOrder.value.filter((n) => n !== name)),
  );
}

function movePresetCandidate(name: string, direction: -1 | 1): void {
  if (props.configSaving) return;
  const list = [...presetCandidatesOrder.value];
  const index = list.indexOf(name);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return;
  [list[index]!, list[target]!] = [list[target]!, list[index]!];
  emit('updateConfig', subagentPresetCandidatesPatch(list));
}

function toggleConfigBoolean(key: 'defaultPlanMode' | 'mergeAllAvailableSkills'): void {
  const current = props.config?.[key];
  emit('updateConfig', { [key]: !configBool(current) } as Partial<AppConfig>);
}

// "Default thinking" lives at config.thinking.enabled on the daemon — the legacy
// top-level defaultThinking field was removed. Read/write it there so the toggle
// actually persists (the old field was silently stripped by the server).
//
// Mirror the core resolver: thinking is on unless explicitly disabled
// (enabled === false). An absent thinking section — or one with an effort but no
// enabled field — falls through to the model/default effort (on for
// thinking-capable models), so the toggle reflects that as on.
function thinkingEnabled(): boolean {
  const thinking = props.config?.thinking;
  if (!thinking || typeof thinking !== 'object') return true;
  return (thinking as { enabled?: boolean }).enabled !== false;
}

function toggleDefaultThinking(): void {
  emit('updateConfig', { thinking: { enabled: !thinkingEnabled() } } as Partial<AppConfig>);
}

// Telemetry is opt-out: undefined and `true` both mean enabled, only explicit
// `false` disables it. Toggle based on that effective state so an unset value
// (displayed as on) flips to `false` instead of writing a redundant `true`.
function toggleTelemetry(): void {
  const enabled = props.config?.telemetry !== false;
  emit('updateConfig', { telemetry: !enabled } as Partial<AppConfig>);
}

function setTab(tab: SettingsTab): void {
  activeTab.value = tab;
}

// ---------------------------------------------------------------------------
// Archived-sessions tab — its own list state (server-side `archived_only`
// filter), kept separate from the per-workspace active list. Search, workspace
// filter and sort all run client-side over the loaded pages. Restore goes
// through the composable so the sidebar list updates automatically.
// ---------------------------------------------------------------------------
const client = useKimiWebClient();

const archivedItems = ref<AppSession[]>([]);
const archivedLoading = ref(false);
const archivedLoaded = ref(false);
const archiveQuery = ref('');
const archiveWsFilter = ref<string>('all'); // 'all' | cwd
const archiveSort = ref<'archived-desc' | 'created-desc' | 'name-asc'>('archived-desc');

// Load every archived session once when the tab opens (no frontend pagination).
// Search, sort and the workspace filter then run client-side over the full set,
// so results are always global and there is no empty-page / cursor bookkeeping
// to get wrong. The user waits a moment on first open in exchange for simplicity.
const ARCHIVED_PAGE_SIZE = 100;

async function loadAllArchived(): Promise<void> {
  if (archivedLoading.value || archivedLoaded.value) return;
  archivedLoading.value = true;
  try {
    const all: AppSession[] = [];
    let beforeId: string | undefined;
    for (;;) {
      const page = await client.loadArchivedSessions({ beforeId, pageSize: ARCHIVED_PAGE_SIZE });
      all.push(...page.items);
      if (!page.hasMore || page.items.length === 0) break;
      const next = page.items.at(-1)?.id;
      if (next === undefined) break;
      beforeId = next;
    }
    archivedItems.value = all;
    archivedLoaded.value = true;
  } catch (err) {
    console.warn('loadAllArchived failed', err);
  } finally {
    archivedLoading.value = false;
  }
}

watch(activeTab, (tab) => {
  if (tab === 'archived' && !archivedLoaded.value) {
    void loadAllArchived();
  }
});

const archiveWorkspaces = computed<string[]>(() => {
  const set = new Set<string>();
  for (const s of archivedItems.value) set.add(s.cwd);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

const filteredArchived = computed<AppSession[]>(() => {
  const q = archiveQuery.value.trim().toLowerCase();
  // Defensive invariant: this panel must only ever render archived sessions,
  // even if an older server ignores `archived_only` and falls back to the
  // default (unarchived) list. Filter again on the client.
  let rows = archivedItems.value.filter((s) => s.archived === true);
  if (archiveWsFilter.value !== 'all') {
    rows = rows.filter((s) => s.cwd === archiveWsFilter.value);
  }
  if (q) rows = rows.filter((s) => s.title.toLowerCase().includes(q));
  rows = rows.slice();
  if (archiveSort.value === 'archived-desc') {
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } else if (archiveSort.value === 'created-desc') {
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
    rows.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  }
  return rows;
});

const groupedArchived = computed<{ cwd: string; items: AppSession[] }[]>(() => {
  const map = new Map<string, AppSession[]>();
  for (const s of filteredArchived.value) {
    const list = map.get(s.cwd) ?? [];
    list.push(s);
    map.set(s.cwd, list);
  }
  return Array.from(map.entries()).map(([cwd, items]) => ({ cwd, items }));
});

async function onRestore(id: string): Promise<void> {
  const ok = await client.restoreSession(id);
  if (ok) {
    archivedItems.value = archivedItems.value.filter((s) => s.id !== id);
  }
}

function archiveTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<template>
  <Dialog :open="true" :close-on-esc="false" :title="t('settings.title')" size="xl" height="fixed" :padded="false" @close="emit('close')">
    <div ref="dialogRef" class="sd">
      <nav class="settings-tabs" role="tablist" :aria-label="t('settings.title')">
        <button
          v-for="tb in tabs"
          :key="tb.id"
          type="button"
          class="tab"
          role="tab"
          :aria-selected="activeTab === tb.id"
          :class="{ on: activeTab === tb.id }"
          @click="setTab(tb.id)"
        >
          {{ t(tb.labelKey) }}
        </button>
      </nav>

      <div class="body">
        <!-- General: Appearance + Notifications -->
        <section v-show="activeTab === 'general'" class="panel">
          <section class="sec">
            <h3 class="sec-title">{{ t('settings.appearance') }}</h3>
            <div class="row">
              <span class="rlabel">{{ t('theme.colorSchemeLabel') }}</span>
              <SegmentedControl
                :model-value="colorScheme"
                :options="[
                  { value: 'light', label: t('theme.light') },
                  { value: 'dark', label: t('theme.dark') },
                  { value: 'system', label: t('theme.system') },
                ]"
                @update:model-value="emit('setColorScheme', $event as ColorScheme)"
              />
            </div>
            <div class="row">
              <span class="rlabel">{{ t('theme.accentLabel') }}</span>
              <SegmentedControl
                :model-value="accent"
                :options="[
                  { value: 'blue', label: t('theme.accentBlue') },
                  { value: 'mono', label: t('theme.accentBlack') },
                ]"
                @update:model-value="emit('setAccent', $event as Accent)"
              />
            </div>
            <div class="row">
              <span class="rlabel">{{ t('settings.uiFontSize') }}</span>
              <label class="num-field">
                <input
                  class="num-input"
                  type="number"
                  min="12"
                  max="20"
                  step="1"
                  :value="uiFontSize"
                  :aria-label="t('settings.uiFontSize')"
                  @input="emit('setUiFontSize', Number(($event.target as HTMLInputElement).value))"
                />
                <span class="num-unit">px</span>
              </label>
            </div>
            <div class="row">
              <span class="rlabel">{{ t('sidebar.language') }}</span>
              <LanguageSwitcher />
            </div>
            <div class="row">
              <span class="rlabel">
                {{ t('settings.conversationToc') }}
                <span class="hint">{{ t('settings.conversationTocHint') }}</span>
              </span>
              <Switch
                :model-value="conversationToc ?? true"
                :label="t('settings.conversationToc')"
                @update:model-value="emit('setConversationToc', $event)"
              />
            </div>
          </section>

          <section class="sec">
            <h3 class="sec-title">{{ t('settings.notifications') }}</h3>
            <div class="row">
              <span class="rlabel">
                {{ t('settings.notifyOnComplete') }}
                <span v-if="notifyPermission === 'denied'" class="hint">{{ t('settings.notifyDenied') }}</span>
              </span>
              <Switch
                :model-value="notify"
                :disabled="notifyPermission === 'denied'"
                :label="t('settings.notifyOnComplete')"
                @update:model-value="emit('setNotify', $event)"
              />
            </div>
            <div class="row">
              <span class="rlabel">
                {{ t('settings.notifyOnQuestion') }}
                <span v-if="notifyPermission === 'denied'" class="hint">{{ t('settings.notifyDenied') }}</span>
              </span>
              <Switch
                :model-value="notifyQuestion"
                :disabled="notifyPermission === 'denied'"
                :label="t('settings.notifyOnQuestion')"
                @update:model-value="emit('setNotifyQuestion', $event)"
              />
            </div>
            <div class="row">
              <span class="rlabel">
                {{ t('settings.notifyOnApproval') }}
                <span v-if="notifyPermission === 'denied'" class="hint">{{ t('settings.notifyDenied') }}</span>
              </span>
              <Switch
                :model-value="notifyApproval"
                :disabled="notifyPermission === 'denied'"
                :label="t('settings.notifyOnApproval')"
                @update:model-value="emit('setNotifyApproval', $event)"
              />
            </div>
            <div class="row">
              <span class="rlabel">{{ t('settings.soundOnComplete') }}</span>
              <Switch
                :model-value="sound"
                :label="t('settings.soundOnComplete')"
                @update:model-value="emit('setSound', $event)"
              />
            </div>
          </section>
        </section>

        <!-- Account -->
        <section v-show="activeTab === 'account'" class="panel">
          <section class="sec">
            <h3 class="sec-title">{{ t('settings.account') }}</h3>
            <div class="row">
              <span class="rlabel">{{ authReady ? 'managed:kimi-code' : t('sidebar.notSignedIn') }}</span>
              <Tooltip :text="accountModel">
                <span v-if="authReady && accountModel" class="rvalue">{{ accountModel }}</span>
              </Tooltip>
            </div>
            <div class="actions">
              <Button variant="secondary" size="sm" @click="emit('openOnboarding'); emit('close')">{{ t('onboarding.reopen') }}</Button>
              <Button v-if="authReady" variant="danger-soft" size="sm" @click="emit('logout')">{{ t('sidebar.signOut') }}</Button>
              <Button v-else variant="primary" size="sm" @click="emit('login')">{{ t('sidebar.signIn') }}</Button>
            </div>
            <ProviderUsagePanel v-if="activeTab === 'account'" />
          </section>
        </section>

        <!-- Agent defaults -->
        <section v-show="activeTab === 'agent'" class="panel">
          <section class="sec">
            <div class="sec-head">
              <h3 class="sec-title">{{ t('settings.agentDefaults') }}</h3>
              <span v-if="configSaving" class="saving">{{ t('settings.saving') }}</span>
            </div>

            <template v-if="config">
              <div class="row">
                <span class="rlabel">
                  {{ t('settings.defaultModel') }}
                  <span class="hint">{{ t('settings.defaultModelHint') }}</span>
                </span>
                <div v-if="modelGroups.length > 0" class="select-wrap">
                  <Select
                    :model-value="config.defaultModel ?? ''"
                    :disabled="configSaving"
                    :aria-label="t('settings.defaultModel')"
                    @update:model-value="setDefaultModel"
                  >
                    <option v-if="!config.defaultModel" value="" disabled>{{ t('settings.noDefaultModel') }}</option>
                    <optgroup v-for="group in modelGroups" :key="group.provider" :label="group.provider">
                      <option v-for="model in group.options" :key="model.id" :value="model.id">
                        {{ model.label }}
                      </option>
                    </optgroup>
                  </Select>
                </div>
                <span v-else class="rvalue mono">{{ config.defaultModel ?? t('settings.noDefaultModel') }}</span>
              </div>

              <div v-if="config.subagent" class="row">
                <span class="rlabel">
                  {{ t('settings.activePreset') }}
                  <span class="hint">{{ t('settings.activePresetHint') }}</span>
                </span>
                <div class="select-wrap">
                  <Select
                    :model-value="config.subagent.preset ?? ''"
                    :disabled="configSaving"
                    :aria-label="t('settings.activePreset')"
                    @update:model-value="setSubagentPreset"
                  >
                    <option value="">{{ t('settings.baseRouting') }}</option>
                    <option v-for="preset in subagentPresetNames" :key="preset" :value="preset">
                      {{ preset }}
                    </option>
                  </Select>
                </div>
              </div>

              <div v-if="automaticPresetSwitchingSupported" class="row">
                <span class="rlabel">
                  {{ t('settings.automaticPresetSwitching') }}
                  <span class="hint">
                    {{
                      t(
                        automaticPresetSwitchingOverridden
                          ? 'settings.automaticPresetSwitchingOverriddenHint'
                          : 'settings.automaticPresetSwitchingHint',
                      )
                    }}
                  </span>
                </span>
                <Switch
                  :model-value="automaticPresetSwitching"
                  :disabled="configSaving"
                  :label="t('settings.automaticPresetSwitching')"
                  @update:model-value="setAutomaticPresetSwitching"
                />
              </div>

              <div v-if="config.subagent && presetManualLocked" class="row">
                <span class="rlabel">
                  {{ t('settings.presetManualLock') }}
                  <span class="hint">{{ t('settings.presetManualLockHint') }}</span>
                </span>
                <span class="row-actions">
                  <Badge variant="warning" dot>
                    {{ t('settings.presetManualLocked') }}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="configSaving"
                    @click="resumeAutoPreset"
                  >
                    {{ t('settings.presetResumeAuto') }}
                  </Button>
                </span>
              </div>

              <div v-if="automaticPresetSwitchingSupported && config.subagent" class="row candidates-row">
                <span class="rlabel">
                  {{ t('settings.presetCandidates') }}
                  <span class="hint">{{ t('settings.presetCandidatesHint') }}</span>
                </span>
                <div class="candidate-editor">
                  <ol v-if="presetCandidatesOrder.length > 0" class="candidate-list">
                    <li
                      v-for="(name, index) in presetCandidatesOrder"
                      :key="name"
                      class="candidate-row"
                    >
                      <span class="candidate-index">{{ index + 1 }}</span>
                      <span class="candidate-name">{{ name }}</span>
                      <span class="candidate-actions">
                        <IconButton
                          size="sm"
                          :disabled="configSaving || index === 0"
                          :label="t('settings.presetCandidatesMoveUp')"
                          @click="movePresetCandidate(name, -1)"
                        >
                          <Icon name="arrow-up" size="md" />
                        </IconButton>
                        <IconButton
                          size="sm"
                          :disabled="configSaving || index === presetCandidatesOrder.length - 1"
                          :label="t('settings.presetCandidatesMoveDown')"
                          @click="movePresetCandidate(name, 1)"
                        >
                          <Icon name="arrow-down" size="md" />
                        </IconButton>
                        <IconButton
                          size="sm"
                          :disabled="configSaving"
                          :label="t('settings.presetCandidatesRemove')"
                          @click="removePresetCandidate(name)"
                        >
                          <Icon name="minus" size="md" />
                        </IconButton>
                      </span>
                    </li>
                  </ol>
                  <Select
                    v-if="addablePresets.length > 0"
                    size="sm"
                    :model-value="''"
                    :disabled="configSaving"
                    :aria-label="t('settings.presetCandidatesAdd')"
                    @update:model-value="addPresetCandidate($event as string)"
                  >
                    <option value="" disabled>
                      {{ t('settings.presetCandidatesAddPlaceholder') }}
                    </option>
                    <option v-for="name in addablePresets" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </Select>
                  <span v-else-if="presetCandidatesOrder.length === 0" class="candidate-empty">
                    {{ t('settings.presetCandidatesNone') }}
                  </span>
                </div>
              </div>

              <Card
                v-if="automaticPresetSwitchingSupported && config.subagent"
                class="scheduler-card"
              >
                <template #head>
                  <Icon name="sparkles" size="sm" />
                  <span>{{ t('settings.smartRoutingStatus') }}</span>
                  <Badge v-if="presetManualLocked" variant="warning" size="sm" dot>
                    {{ t('settings.presetManualLocked') }}
                  </Badge>
                </template>
                <p class="scheduler-hint">{{ t('settings.smartRoutingStatusHint') }}</p>

                <div class="scheduler-section">
                  <span class="scheduler-label">{{ t('settings.smartRoutingCandidateOrder') }}</span>
                  <div class="scheduler-order">
                    <Badge
                      v-for="(name, index) in presetCandidatesOrder"
                      :key="name"
                      size="sm"
                    >
                      {{ index + 1 }} · {{ name }}
                    </Badge>
                    <span v-if="presetCandidatesOrder.length === 0" class="candidate-empty">
                      {{ t('settings.smartRoutingCandidateOrderEmpty') }}
                    </span>
                  </div>
                </div>

                <Banner v-if="presetManualLocked" variant="warning">
                  {{ t('settings.smartRoutingManualLock') }}
                </Banner>
                <template v-else-if="autoSubagentPresetStatus">
                  <div class="scheduler-section scheduler-decision">
                    <span class="scheduler-label">{{ t('settings.smartRoutingLatestDecision') }}</span>
                    <strong>{{ schedulerReason }}</strong>
                    <span>{{ schedulerEvaluationContext }}</span>
                    <span>{{ schedulerCurrent }}</span>
                    <span>{{ schedulerSelection }}</span>
                    <Badge v-if="schedulerCooldown" variant="warning" size="sm">
                      {{ schedulerCooldown }}
                    </Badge>
                  </div>

                  <div class="scheduler-section">
                    <span class="scheduler-label">{{ t('settings.smartRoutingCandidates') }}</span>
                    <div class="scheduler-candidates">
                      <div
                        v-for="candidate in autoSubagentPresetStatus.candidates"
                        :key="candidate.preset"
                        class="scheduler-candidate"
                      >
                        <div class="scheduler-candidate-head">
                          <span class="scheduler-candidate-name">{{ candidate.preset }}</span>
                          <Badge size="sm">{{ schedulerCandidateScore(candidate) }}</Badge>
                          <Badge
                            :variant="schedulerCandidateStatusVariant(candidate)"
                            size="sm"
                            dot
                          >
                            {{ schedulerCandidateStatus(candidate) }}
                          </Badge>
                        </div>
                        <span v-if="candidate.provider" class="scheduler-meta">
                          {{ t('settings.smartRoutingProvider', { provider: candidate.provider }) }}
                        </span>
                        <span class="scheduler-breakdown">
                          {{ schedulerCandidateBreakdown(candidate) }}
                        </span>
                        <span class="scheduler-meta">
                          {{ schedulerCandidateEvidence(candidate) }}
                        </span>
                        <span
                          v-if="candidate.quotaRemainingPercent !== undefined"
                          class="scheduler-meta"
                        >
                          {{
                            t('settings.smartRoutingQuota', {
                              percent: candidate.quotaRemainingPercent.toFixed(1),
                            })
                          }}
                        </span>
                        <span
                          v-if="candidate.localEvidence.averageFirstTokenLatencyMs !== undefined"
                          class="scheduler-meta"
                        >
                          {{
                            t('settings.smartRoutingLatency', {
                              latency: candidate.localEvidence.averageFirstTokenLatencyMs.toFixed(0),
                            })
                          }}
                        </span>
                      </div>
                    </div>
                  </div>
                </template>
                <Banner v-else>
                  {{ t('settings.smartRoutingNoEvaluation') }}
                </Banner>

                <div class="scheduler-section">
                  <span class="scheduler-label">{{ t('settings.smartRoutingPolicy') }}</span>
                  <div v-if="schedulerPolicyEntries.length > 0" class="scheduler-policy">
                    <div
                      v-for="entry in schedulerPolicyEntries"
                      :key="entry.key"
                      class="scheduler-policy-row"
                    >
                      <span>{{ t(`settings.smartRoutingPolicyLabels.${entry.key}`) }}</span>
                      <code>{{ schedulerPolicyValue(entry.key, entry.value) }}</code>
                    </div>
                  </div>
                  <span v-else class="candidate-empty">
                    {{ t('settings.smartRoutingPolicyEmpty') }}
                  </span>
                </div>
              </Card>

              <div v-if="config.subagent" class="route-summary">
                <div class="route-summary-title">{{ t('settings.effectiveRoutes') }}</div>
                <div class="route-summary-row">
                  <span class="route-profile">main</span>
                  <span class="route-model">
                    {{ activeMainRoute?.model ?? config.defaultModel ?? t('settings.currentModel') }}
                    <small v-if="activeMainRoute?.thinkingEffort">
                      {{ activeMainRoute.thinkingEffort }}
                    </small>
                  </span>
                </div>
                <div
                  v-for="([profile, route]) in effectiveSubagentRoutes.filter(([name]) => name !== 'main')"
                  :key="profile"
                  class="route-summary-row"
                >
                  <span class="route-profile">{{ profile }}</span>
                  <span class="route-model">
                    {{ route.model ?? t('settings.presetInherit') }}
                    <small v-if="route.thinkingEffort">{{ route.thinkingEffort }}</small>
                  </span>
                </div>
              </div>

              <div class="row">
                <span class="rlabel">
                  {{ t('settings.defaultPermission') }}
                  <span class="hint">{{ t('settings.defaultPermissionHint') }}</span>
                </span>
                <SegmentedControl
                  :model-value="defaultPermissionMode"
                  :options="permissionModes.map((m) => ({ value: m, label: t(permissionLabelKey[m]) }))"
                  @update:model-value="setDefaultPermissionMode($event as 'manual' | 'auto' | 'yolo')"
                />
              </div>

              <div class="row">
                <span class="rlabel">
                  {{ t('settings.defaultThinking') }}
                  <span class="hint">{{ t('settings.defaultThinkingHint') }}</span>
                </span>
                <Switch
                  :model-value="thinkingEnabled()"
                  :disabled="configSaving"
                  :label="t('settings.defaultThinking')"
                  @update:model-value="toggleDefaultThinking()"
                />
              </div>

              <div class="row">
                <span class="rlabel">
                  {{ t('settings.defaultPlanMode') }}
                  <span class="hint">{{ t('settings.defaultPlanModeHint') }}</span>
                </span>
                <Switch
                  :model-value="configBool(config.defaultPlanMode)"
                  :disabled="configSaving"
                  :label="t('settings.defaultPlanMode')"
                  @update:model-value="toggleConfigBoolean('defaultPlanMode')"
                />
              </div>

              <div class="row">
                <span class="rlabel">
                  {{ t('settings.mergeSkills') }}
                  <span class="hint">{{ t('settings.mergeSkillsHint') }}</span>
                </span>
                <Switch
                  :model-value="configBool(config.mergeAllAvailableSkills)"
                  :disabled="configSaving"
                  :label="t('settings.mergeSkills')"
                  @update:model-value="toggleConfigBoolean('mergeAllAvailableSkills')"
                />
              </div>
            </template>

            <div v-else class="empty-config">
              {{ t('settings.configUnavailable') }}
            </div>
          </section>
        </section>

        <!-- Advanced: diagnostics + data/privacy -->
        <section v-show="activeTab === 'advanced'" class="panel">
          <section class="sec">
            <h3 class="sec-title">{{ t('settings.advanced') }}</h3>
            <div class="row">
              <span class="rlabel">{{ t('sidebar.daemon') }}</span>
              <span class="rvalue mono">{{ daemonEndpoint }}</span>
            </div>
            <div class="row">
              <span class="rlabel">{{ t('settings.backend') }}</span>
              <span class="rvalue mono">{{ backendLabel }}</span>
            </div>
            <div class="row">
              <span class="rlabel">{{ t('settings.serverVersion') }}</span>
              <span class="rvalue mono">{{ serverVersion || '-' }}</span>
            </div>
            <div v-if="config" class="row">
              <span class="rlabel">
                {{ t('settings.telemetry') }}
                <span class="hint">{{ t('settings.telemetryHint') }}</span>
                <span class="hint">{{ t('settings.telemetryRestartHint') }}</span>
              </span>
              <Switch
                :model-value="config.telemetry !== false"
                :disabled="configSaving"
                :label="t('settings.telemetry')"
                @update:model-value="toggleTelemetry()"
              />
            </div>
            <div class="row">
              <span class="rlabel">
                {{ t('settings.exportLog') }}
                <span v-if="!isTraceEnabled()" class="hint">{{ t('settings.logHint') }}</span>
              </span>
              <Button variant="secondary" size="sm" @click="exportLog">{{ t('settings.exportLogBtn') }}</Button>
            </div>
          </section>
        </section>

        <!-- Archived sessions -->
        <section v-show="activeTab === 'archived'" class="panel">
          <div class="panel-head">
            <div class="panel-kicker">Archived sessions</div>
            <h4 class="panel-title">{{ t('settings.archivedTitle') }}</h4>
            <p class="panel-desc">{{ t('settings.archivedDesc') }}</p>
          </div>

          <div class="archive-toolbar">
            <label class="archive-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input v-model="archiveQuery" :placeholder="t('settings.archivedSearch')" />
            </label>
            <Select
              :model-value="archiveWsFilter"
              size="sm"
              :aria-label="t('settings.archivedAllWorkspaces')"
              @update:model-value="archiveWsFilter = $event as string"
            >
              <option value="all">{{ t('settings.archivedAllWorkspaces') }}</option>
              <option v-for="ws in archiveWorkspaces" :key="ws" :value="ws">{{ ws }}</option>
            </Select>
            <SegmentedControl
              size="sm"
              :model-value="archiveSort"
              :options="[
                { value: 'archived-desc', label: t('settings.archivedSortArchived') },
                { value: 'created-desc', label: t('settings.archivedSortCreated') },
                { value: 'name-asc', label: t('settings.archivedSortName') },
              ]"
              @update:model-value="archiveSort = $event as 'archived-desc' | 'created-desc' | 'name-asc'"
            />
          </div>

          <div v-if="archivedLoading" class="archive-empty">
            {{ t('settings.archivedLoadingAll') }}
          </div>

          <template v-else>
            <div v-if="groupedArchived.length > 0" class="archive-list">
              <section v-for="g in groupedArchived" :key="g.cwd" class="archive-card">
                <div class="archive-workspace">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h6l2 2h10v9H3z" /><path d="M3 7V5h6l2 2" /></svg>
                  <span class="path">{{ g.cwd }}</span>
                  <span class="count">{{ t('settings.archivedSessionsCount', { count: g.items.length }) }}</span>
                </div>
                <div class="setting-card">
                  <div v-for="s in g.items" :key="s.id" class="archive-row">
                    <div class="archive-meta">
                      <div class="archive-name">{{ s.title }}</div>
                      <div class="archive-time">{{ t('settings.archivedAt', { time: archiveTime(s.updatedAt) }) }}</div>
                    </div>
                    <Button variant="secondary" size="sm" @click="onRestore(s.id)">{{ t('settings.archivedRestore') }}</Button>
                  </div>
                </div>
              </section>
            </div>
            <div v-else class="archive-empty">
              {{ archivedItems.length === 0 ? t('settings.archivedEmpty') : t('settings.archivedNoMatch') }}
            </div>
          </template>
        </section>

      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.sd { display: flex; flex-direction: row; min-height: 0; height: 100%; }

.settings-tabs {
  display: flex;
  flex-direction: column;
  flex: none;
  width: 148px;
  padding: var(--space-2);
  gap: 2px;
  overflow-y: auto;
}
.tab {
  text-align: left;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.tab:hover { background: var(--color-surface-sunken); color: var(--color-text); }
.tab.on { background: var(--color-accent-soft); color: var(--color-accent); font-weight: var(--weight-medium); }
.tab:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }

.body { display: flex; flex-direction: column; overflow-y: auto; padding: var(--space-2) var(--space-5) var(--space-5) var(--space-6); flex: 1; min-width: 0; }
.panel { display: block; }
.sec { padding: var(--space-4) 0; border-bottom: 1px solid var(--color-line); }
.sec:last-child { border-bottom: none; }
.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.sec-title {
  margin: 0 0 var(--space-3);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.sec-head .sec-title { margin-bottom: 0; }
.saving {
  flex: none;
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 38px;
  padding: var(--space-1) 0;
}
.rlabel {
  font-family: var(--font-ui);
  font-size: var(--text-base);
  color: var(--color-text);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.rvalue {
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rvalue.mono { font-family: var(--font-mono); font-size: var(--text-xs); }
.hint { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--color-text-faint); }

.num-field {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  padding: 0 var(--space-3);
  height: 38px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
.num-field:hover { border-color: var(--color-line-strong); }
.num-field:focus-within { border-color: var(--color-accent); box-shadow: var(--p-focus-ring); }
.num-input {
  width: 48px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: var(--text-base);
  text-align: right;
}
.num-unit {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.select-wrap { min-width: 220px; max-width: min(320px, 50vw); flex: none; }

/* Lock row + candidate-priority editor (Agent tab, automatic preset area). */
.row-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}
.candidates-row { align-items: flex-start; }
.candidate-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: none;
  width: min(340px, 50vw);
}
.candidate-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.candidate-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 34px;
  padding: 2px var(--space-2) 2px var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
}
.candidate-index {
  flex: none;
  min-width: 18px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-faint);
  text-align: right;
}
.candidate-name {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text);
}
.candidate-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
.candidate-empty {
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  color: var(--color-text-faint);
}

.scheduler-card {
  margin: var(--space-3) 0;
}
.scheduler-hint {
  margin: 0 0 var(--space-3);
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
}
.scheduler-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.scheduler-label {
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.scheduler-order {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.scheduler-decision {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
.scheduler-decision strong {
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.scheduler-candidates {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.scheduler-candidate {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
}
.scheduler-candidate-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.scheduler-candidate-name {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scheduler-breakdown {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-relaxed);
  overflow-wrap: anywhere;
}
.scheduler-meta {
  color: var(--color-text-faint);
  font-size: var(--text-xs);
}
.scheduler-policy {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-1) var(--space-3);
}
.scheduler-policy-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  padding-block: var(--space-1);
  border-bottom: 1px solid var(--color-line);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
.scheduler-policy-row code {
  color: var(--color-text);
  font-family: var(--font-mono);
}

.route-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: var(--space-2) 0 var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
}
.route-summary-title {
  margin-bottom: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.route-summary-row {
  display: grid;
  grid-template-columns: minmax(90px, 0.35fr) minmax(0, 1fr);
  gap: var(--space-3);
  align-items: baseline;
  min-height: 24px;
}
.route-profile, .route-model { font-family: var(--font-mono); font-size: var(--text-xs); }
.route-profile { color: var(--color-text); }
.route-model { color: var(--color-text-muted); overflow-wrap: anywhere; }
.route-model small { margin-left: var(--space-2); color: var(--color-text-faint); }

.empty-config {
  font-family: var(--font-ui);
  font-size: var(--text-base);
  color: var(--color-text-muted);
  padding: var(--space-1) 0;
}

.actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }

@media (max-width: 640px) {
  .sd { flex-direction: column; }
  .settings-tabs {
    flex-direction: row;
    width: auto;
    padding: var(--space-2) var(--space-3);
    gap: var(--space-1);
    overflow-x: auto;
  }
  .tab { white-space: nowrap; flex: none; }
  .row {
    align-items: flex-start;
    flex-direction: column;
  }
  .select-wrap {
    width: 100%;
    max-width: none;
  }
  .candidate-editor {
    width: 100%;
    max-width: none;
  }
}
/* Archived-sessions tab */
.setting-card { border: 1px solid var(--color-line); border-radius: var(--radius-xl); overflow: hidden; background: var(--color-bg); }
.panel-head { margin-bottom: var(--space-4); }
.panel-kicker { font-size: var(--text-xs); letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-faint); margin-bottom: var(--space-1); }
.panel-title { margin: 0 0 var(--space-2); font-family: var(--font-ui); font-size: var(--text-2xl); font-weight: var(--weight-semibold); letter-spacing: -0.01em; color: var(--color-text); }
.panel-desc { margin: 0; font-family: var(--font-ui); font-size: var(--text-sm); line-height: var(--leading-normal); color: var(--color-text-muted); max-width: 560px; }
.archive-toolbar { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); flex-wrap: wrap; }
.archive-search { flex: 1; min-width: 200px; height: 36px; display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-line); color: var(--color-text-faint); font-size: var(--text-sm); background: var(--color-surface-raised); transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out); }
.archive-search:focus-within { border-color: var(--color-accent); box-shadow: var(--p-focus-ring); color: var(--color-text-muted); }
.archive-search svg { width: 15px; height: 15px; flex: none; }
.archive-search input { width: 100%; border: none; outline: none; background: transparent; font: inherit; color: var(--color-text); }
.archive-list { display: flex; flex-direction: column; gap: var(--space-4); }
.archive-card .setting-card { margin-bottom: 0; }
.archive-workspace { display: flex; align-items: center; gap: var(--space-2); margin: 0 2px var(--space-2); color: var(--color-text-muted); font-size: var(--text-sm); font-weight: var(--weight-medium); }
.archive-workspace svg { width: 16px; height: 16px; color: var(--color-text-faint); flex: none; }
.archive-workspace .path { font-family: var(--font-mono); font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.archive-workspace .count { margin-left: auto; color: var(--color-text-faint); font-weight: var(--weight-regular); font-size: var(--text-xs); flex: none; }
.archive-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-3); align-items: center; padding: var(--space-3) var(--space-4); border-top: 1px solid var(--color-line); }
.archive-row:first-child { border-top: none; }
.archive-row:hover { background: var(--color-surface-sunken); }
.archive-meta { min-width: 0; }
.archive-name { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.archive-time { margin-top: 2px; font-size: var(--text-xs); color: var(--color-text-faint); font-family: var(--font-mono); }
.archive-draining { margin-bottom: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--color-accent-soft); color: var(--color-accent-hover); font-size: var(--text-sm); }
.archive-empty { padding: var(--space-6) var(--space-4); border: 1px solid var(--color-line); border-radius: var(--radius-xl); color: var(--color-text-faint); font-size: var(--text-sm); text-align: center; background: var(--color-bg); }
@media (max-width: 640px) {
  .archive-toolbar { flex-direction: column; align-items: stretch; }
  .archive-search { min-width: 0; }
}
/* Enlarge the settings frame a bit (Dialog `xl` = 760px wide, fixed-height
   680px). Scoped to this dialog only. */
:deep(.ui-dialog) { width: min(980px, 96vw); }
:deep(.ui-dialog--fixed-height) { height: min(780px, calc(100vh - var(--space-8) * 2)); }
</style>
