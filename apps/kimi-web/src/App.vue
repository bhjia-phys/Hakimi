<!-- apps/kimi-web/src/App.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Sidebar from './components/Sidebar.vue';
import ResizeHandle from './components/ResizeHandle.vue';
import ConversationPane from './components/chat/ConversationPane.vue';
import FilePreview from './components/FilePreview.vue';
import WebPreviewPanel from './components/WebPreviewPanel.vue';
import ThinkingPanel from './components/chat/ThinkingPanel.vue';
import AgentDetailPanel from './components/chat/AgentDetailPanel.vue';
import ToolDiffPanel from './components/chat/ToolDiffPanel.vue';
import SideChatPanel from './components/chat/SideChatPanel.vue';
import DiffView from './components/chat/DiffView.vue';
import ModelPicker from './components/settings/ModelPicker.vue';
import ProviderManager from './components/settings/ProviderManager.vue';
import LoginDialog from './components/dialogs/LoginDialog.vue';
import ResearchManagerDialog from './components/dialogs/ResearchManagerDialog.vue';
import SettingsDialog from './components/settings/SettingsDialog.vue';
import AddWorkspaceDialog from './components/dialogs/AddWorkspaceDialog.vue';
import RemoteShareDialog from './components/dialogs/RemoteShareDialog.vue';
import ConfirmDialogHost from './components/dialogs/ConfirmDialogHost.vue';
import StatusPanel from './components/chat/StatusPanel.vue';
import WarningToasts from './components/WarningToasts.vue';
import MobileTopBar from './components/mobile/MobileTopBar.vue';
import MobileSwitcherSheet from './components/mobile/MobileSwitcherSheet.vue';
import MobileSettingsSheet from './components/mobile/MobileSettingsSheet.vue';
import Onboarding from './components/settings/Onboarding.vue';
import GlobalLoading from './components/GlobalLoading.vue';
import DebugPanel from './debug/DebugPanel.vue';
import { isTraceEnabled } from './debug/trace';
import { useKimiWebClient } from './composables/useKimiWebClient';
import { useConfirmDialog } from './composables/useConfirmDialog';
import { useRemoteShare } from './composables/useRemoteShare';
import { useRemotePersistent } from './composables/useRemotePersistent';
import type { PromptAttachment } from './composables/useKimiWebClient';
import {
  createComposerCommandSubmission,
  restoreComposerCommandSubmission,
  type ComposerCommandEvent,
  type ComposerCommandSubmission,
} from './composables/useComposerDraft';
import type { TurnAttachment } from './types';
import { useAuthGate } from './composables/useAuthGate';
import { usePageTitle } from './composables/usePageTitle';
import { useSidebarLayout } from './composables/useSidebarLayout';
import { useFilePreview, type DetailTarget } from './composables/useFilePreview';
import { useDetailPanel } from './composables/useDetailPanel';
import { useIsMobile } from './composables/useIsMobile';
import { openDialogCount } from './composables/dialogStack';
import type { SwarmMember } from './composables/swarmGroups';
import ServerAuthDialog from './components/ServerAuthDialog.vue';
import { initServerAuth, onAuthRequired } from './api/daemon/serverAuth';
import type { AppConfig, ThinkingLevel } from './api/types';
import {
  researchManagerMutationAllowed,
  researchManagerSessionIsCurrent,
  type ResearchManagerCommandAck,
  type ResearchManagerCommandRequest,
} from './lib/researchManagerCommand';
import { commitLevel, effectiveThinkingLevel, segmentsFor } from './lib/modelThinking';
import {
  mainRouteForPreset,
  subagentPresetManualLock,
  subagentPresetResumeAutoPatch,
} from './lib/subagentPreset';
import {
  isResearchIdleOnlyBusy,
  parseResearchSlashCommand,
  planModeToggleResearchDecision,
  researchCommandFromSlash,
  researchCommandResolutionError,
  researchEnterSlashOutcome,
  researchSlashAllowedWhileBusy,
  researchSlashInputToRestore,
  researchSlashNeedsSnapshot,
  researchSlashSessionIsCurrent,
  runResearchModeEnter,
  submitResearchSlashCommand,
  type ResearchSlashExecutionOutcome,
} from './lib/researchCommand';
import { parseSlash, stripSkillPrefix } from './lib/slashCommands';
import Button from './components/ui/Button.vue';
import IconButton from './components/ui/IconButton.vue';
import Icon from './components/ui/Icon.vue';
import InternalBuildBanner from './components/InternalBuildBanner.vue';
import { isMacosDesktop } from './lib/desktopFlag';
import { readRemoteSessionIdFromLocation } from './lib/sessionRoute';

const remoteSessionId =
  typeof window === 'undefined' ? undefined : readRemoteSessionIdFromLocation(window.location);
const remoteMode = remoteSessionId !== undefined;

// Hydrate the server-transport credential (fragment token or localStorage)
// BEFORE the client connects, so the first REST/WS calls already carry it.
initServerAuth();
// Stays false until the server actually rejects us with 401/40101. Starting
// from "no credential ⇒ prompt" flashed the token dialog for a frame in
// `--dangerous-bypass-auth` mode, before /meta had advertised the bypass.
const authRequired = ref(false);
let offAuthRequired: (() => void) | null = null;

const client = useKimiWebClient();
// When the server runs with `--dangerous-bypass-auth`, `/meta` advertises it
// and we skip the token prompt entirely — there is no credential to enter.
const showServerAuth = computed(
  () => !client.dangerousBypassAuth.value && authRequired.value,
);
provide('resolveImage', client.resolveImageUrl);
// Live swarm member roster for the inline AgentSwarm tool card. Sourced from the
// AppTask store so the card shows each subagent's live phase; on refresh the
// tasks are gone and the card falls back to the parsed tool result. Includes
// single-member "swarms" (e.g. AgentSwarm with one resume_agent_ids entry),
// which buildSwarmGroups filters out for the badge counter.
provide(
  'resolveSwarmMembers',
  (toolCallId: string): SwarmMember[] => client.swarmMembersByToolCallId.value.get(toolCallId) ?? [],
);
const { t } = useI18n();
const { confirm } = useConfirmDialog();

// KAP/daemon debug panel — opt-in via ?debug=1 or localStorage kimi-web.debug=1.
const debugEnabled = isTraceEnabled();

// Narrow viewports (≤640px) render the single-column mobile shell; desktop is
// unchanged. Falls back to desktop when matchMedia is unavailable.
const isMobile = useIsMobile();

// Mobile sheet visibility
const showMobileSwitcher = ref(false);
const showMobileSettings = ref(false);

// Active session title for the mobile top bar.
const activeSessionTitle = computed<string>(() => {
  const id = client.activeSessionId.value;
  return client.sessions.value.find((s) => s.id === id)?.title ?? '';
});

// Changed-file count for the active session (mobile settings git row).
const activeSessionChangesCount = computed<number>(() =>
  client.gitInfo.value ? client.changes.value?.length ?? 0 : 0,
);

// running: true when activity is not idle
const running = computed(() => client.activity.value !== 'idle');

// Auth readiness gates the main app. Once the first load finishes and auth is
// still missing, show a full-page login entry instead of an in-app banner.
const authLogoRef = ref<SVGSVGElement | null>(null);
const { showAuthGate, blinkAuthLogo } = useAuthGate({
  client,
  authLogoRef,
});


// Static page title (app name only). The session title and workspace name are
// intentionally excluded so the tab title stays stable. Prefixes an animated
// spinner while the agent is running so activity is visible at a glance.
usePageTitle({ running, showAuthGate });

// The /thinking slash command has no popover anchor, so it steps to the next
// segment for the active model (effort models cycle through their declared
// levels; boolean models flip on/off; unsupported stays off).
function nextThinkingLevel(current: ThinkingLevel | undefined): ThinkingLevel {
  // Identity is the model id — display/model names can collide across providers.
  const model = client.models.value.find((m) => m.id === client.status.value.modelId);
  const segs = segmentsFor(model);
  // No stored preference means the model default is in effect — cycle from
  // there; a level the model doesn't declare (indexOf → -1) starts the cycle
  // at the first segment.
  const idx = segs.indexOf(effectiveThinkingLevel(model, current));
  const next = segs[(idx + 1) % segs.length] ?? segs[0] ?? 'off';
  return commitLevel(model, next);
}

// Status panel (/status) renders current client state only — show the
// effective thinking level so "no preference" reads as the model default that
// will actually run, not a blank.
const statusPanelThinking = computed<ThinkingLevel>(() => {
  const model = client.models.value.find((m) => m.id === client.status.value.modelId);
  return effectiveThinkingLevel(model, client.thinking.value);
});

// First-run onboarding (language + welcome greeting). Shown until the user
// finishes it once; re-openable from the settings popover.
const showOnboarding = ref(!client.onboarded.value);
function completeOnboarding(): void {
  client.setOnboarded(true);
  showOnboarding.value = false;
}
function openOnboarding(): void {
  showOnboarding.value = true;
}

// iOS Safari does not shrink `dvh` for the on-screen keyboard. Instead it pans
// the visual viewport (offsetTop > 0) to reveal the focused field, which a
// 100dvh in-flow shell cannot follow: the dock ends up behind the keyboard, or
// the page shows a blank band past the shell's bottom edge. Pin the shell to
// the VISUAL viewport instead: position:fixed + top/height mirrored from
// visualViewport (height shrinks with the keyboard, offsetTop tracks the pan).
// No-ops on desktop, where offsetTop is 0 and height equals innerHeight.
let appHeightRaf = 0;
function setAppHeight(): void {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  root.setProperty('--app-height', `${vv?.height ?? window.innerHeight}px`);
  root.setProperty('--app-top', `${vv?.offsetTop ?? 0}px`);
}
function syncAppHeight(): void {
  if (appHeightRaf) return;
  appHeightRaf = requestAnimationFrame(() => {
    appHeightRaf = 0;
    setAppHeight();
  });
}

onMounted(() => {
  // Register the 401 listener before the first requests go out, so a token
  // rejection during the initial load() can never be missed.
  offAuthRequired = onAuthRequired(() => {
    authRequired.value = true;
    // The server now demands a token, so any cached "bypass" state from a
    // previous mode is stale — drop it so the token prompt can show.
    client.clearDangerousBypassAuth();
  });
  void client.load(remoteSessionId === undefined ? undefined : { remoteSessionId });
  loadSidebarCollapsed();
  setAppHeight();
  window.visualViewport?.addEventListener('resize', syncAppHeight);
  window.visualViewport?.addEventListener('scroll', syncAppHeight);
  window.addEventListener('resize', syncAppHeight);
  // Capture-phase so Escape closes the side detail layer BEFORE the
  // conversation pane's bubble-phase handler interrupts a running prompt.
  document.addEventListener('keydown', onGlobalKeydown, true);
});

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown, true);
  window.visualViewport?.removeEventListener('resize', syncAppHeight);
  window.visualViewport?.removeEventListener('scroll', syncAppHeight);
  window.removeEventListener('resize', syncAppHeight);
  if (appHeightRaf) {
    cancelAnimationFrame(appHeightRaf);
    appHeightRaf = 0;
  }
  document.documentElement.style.removeProperty('--app-height');
  document.documentElement.style.removeProperty('--app-top');
  if (offAuthRequired !== null) {
    offAuthRequired();
    offAuthRequired = null;
  }
});

function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  // A modal dialog open on top of the side panel owns Escape — leave the event
  // alone so the dialog can close itself instead of the panel behind it.
  if (anyOverlayOpen.value) return;
  if (closeOpenSidePanel()) {
    e.stopPropagation();
    e.preventDefault();
  }
}

// ---------------------------------------------------------------------------
// Unified right-side detail layer. Only one detail is open at a time. The
// shared `detailTarget` ref lives here so the file-preview, web-preview and
// detail-panel composables can all claim the single right-side slot.
// ---------------------------------------------------------------------------
const detailTarget = ref<DetailTarget | null>(null);

// True for one frame while the active session changes: suppresses the right
// panel's width transition so a restored panel snaps to its width instead of
// animating open from zero.
const panelSwitching = ref(false);
watch(client.activeSessionId, () => {
  panelSwitching.value = true;
  void nextTick(() => { panelSwitching.value = false; });
});

const {
  previewTarget,
  previewFile,
  previewLoading,
  previewError,
  previewDownloadUrl,
  previewExternalActions,
  openFilePreview,
  openMediaPreview,
  closeFilePreview,
  openPreviewInEditor,
  revealPreviewFile,
} = useFilePreview({ client, detailTarget });

// True while the right-side slot is actually occupied, so the sidebar reserves
// room for it and the conversation can never be squeezed. Keyed off detailTarget
// (the real occupant) rather than previewTarget, which can stay set after the
// panel is hidden.
const previewOpen = computed(() => detailTarget.value !== null);

// ---------------------------------------------------------------------------
// Layout: resizable session column. ResizeHandle owns the column width (with
// localStorage persistence); we mirror it here to drive the App grid.
// ---------------------------------------------------------------------------
const {
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_DEFAULT,
  SIDEBAR_MIN,
  sidebarMax,
  sessionColWidth,
  sidebarCollapsed,
  sidebarDragging,
  sideWidth,
  loadSidebarCollapsed,
  toggleSidebarCollapse,
} = useSidebarLayout({ previewOpen });

// ---------------------------------------------------------------------------
// Unified right-side detail layer (thinking / compaction / agent / diff / web
// preview / side chat) plus the preview-panel width. Only one detail is open
// at a time.
// ---------------------------------------------------------------------------
const {
  PREVIEW_WIDTH_KEY,
  PREVIEW_MIN,
  previewDefaultWidth,
  previewMax,
  previewWidth,
  previewPanelWidth,
  thinkingPanelText,
  thinkingVisible,
  openThinkingPanel,
  closeThinkingPanel,
  compactionPanelText,
  compactionPanelVisible,
  openCompactionPanel,
  closeCompactionPanel,
  agentPanelMember,
  openAgentPanel,
  closeAgentPanel,
  toolDiffTarget,
  openToolDiff,
  closeToolDiff,
  detailDiffMode,
  detailDiffPath,
  openDiffDetail,
  closeDiffDetail,
  selectDiffFile,
  webPreviewTarget,
  webPreviewRefreshKey,
  openWebPreview,
  closeWebPreview,
  reloadWebPreview,
  openExternalWebPreview,
  btwVisible,
  openSideChatTab,
  closeSideChat,
  sidePanelVisible,
  panelDragging,
  closeOpenSidePanel,
} = useDetailPanel({ client, sideWidth, detailTarget, closeFilePreview });

// Reference to ConversationPane so we can imperatively switch tabs
const conversationPaneRef = ref<InstanceType<typeof ConversationPane> | null>(null);

// Dialog visibility refs
const showModelPicker = ref(false);
const showProviders = ref(false);

const showLogin = ref(false);
const showAddWorkspace = ref(false);
const showStatusPanel = ref(false);
const showSettings = ref(false);
const showResearchManager = ref(false);
const researchExpandSignal = ref(0);
const researchStartInFlight = new Set<string>();
const managerSessionId = ref<string | null>(null);
const researchManagerCommandAck = ref<ResearchManagerCommandAck | null>(null);
const researchIdleOnlyBusy = computed(() =>
  isResearchIdleOnlyBusy(
    client.working.value,
    client.compaction.value !== null,
  ),
);

function closeResearchManager(): void {
  showResearchManager.value = false;
  researchManagerCommandAck.value = null;
  managerSessionId.value = null;
}

watch(client.activeSessionId, closeResearchManager, { flush: 'sync' });
watch(showResearchManager, (isOpen) => {
  if (!isOpen) {
    researchManagerCommandAck.value = null;
    managerSessionId.value = null;
  }
}, { flush: 'sync' });
watch(
  () => [client.researchEnabled.value, researchIdleOnlyBusy.value] as const,
  ([enabled, busy]) => {
    if (!enabled || busy) closeResearchManager();
  },
);

// ---------------------------------------------------------------------------
// Remote control — default-on `remote_control` feature flag. Both remote
// surfaces (the temporary Web share and the long-lived `hakimi remote`
// systemd service) hang off the same gate and the same dialog. The gate
// excludes remote viewers so a share can never be shared again; the chat
// header and mobile top bar hide their entry when the flag is off.
// ---------------------------------------------------------------------------
const showRemoteShare = ref(false);
const remoteControlEnabled = computed(
  () =>
    !remoteMode &&
    !client.dangerousBypassAuth.value &&
    client.experimentalFlags.value['remote_control'] === true,
);
const remoteShare = useRemoteShare({
  enabled: () => remoteControlEnabled.value,
  getSessionId: () => client.activeSessionId.value,
  dialogOpen: () => showRemoteShare.value,
});
const remoteShareActive = computed(() => remoteShare.status.value?.active === true);
const remoteShareExpiresAt = computed(() => remoteShare.status.value?.expiresAt ?? undefined);
const remotePersistent = useRemotePersistent({
  enabled: () => remoteControlEnabled.value,
  dialogOpen: () => showRemoteShare.value,
});
// The selected session is only the share's initial landing point. Close the
// dialog on local session switches so an open start form never becomes stale.
watch(client.activeSessionId, () => {
  showRemoteShare.value = false;
});
function closeRemoteShare(): void {
  showRemoteShare.value = false;
  remoteShare.clearError();
  remotePersistent.clearError();
}

type SubmitPayload = {
  text: string;
  attachments: PromptAttachment[];
};
const pendingWorkspaceSubmit = ref<SubmitPayload | null>(null);
// Inline error shown inside the add-workspace picker after the daemon rejects
// a path. Kept separate from the global toast so the feedback is visible above
// the picker's backdrop and persists until the user retries or closes.
const addWorkspaceError = ref<string | null>(null);

// Any of these modal/overlay layers, when open, owns Escape. The global
// capture-phase handler must NOT close a background side panel out from under an
// open dialog — otherwise Escape dismisses the panel behind the dialog and the
// dialog's own Escape handler never fires. New top-level dialogs go here too.
const anyOverlayOpen = computed<boolean>(
  () =>
    openDialogCount.value > 0 ||
    showModelPicker.value ||
    showProviders.value ||
    showLogin.value ||
    showAddWorkspace.value ||
    showStatusPanel.value ||
    showSettings.value ||
    showResearchManager.value ||
    showOnboarding.value ||
    showMobileSwitcher.value ||
    showMobileSettings.value,
);

// Loading state for model/provider fetches
const modelsLoading = ref(false);
const modelsUnavailable = ref(false);
const providersLoading = ref(false);
const providersUnavailable = ref(false);
const configSaving = ref(false);
const subagentPresetNames = computed(() =>
  Object.keys(client.config.value?.subagent?.presets ?? {}).toSorted((a, b) => a.localeCompare(b)),
);
/** `autoPreset.manualLock` — a manually activated preset paused automatic
 *  switching; drives the header lock badge and the settings lock row. */
const subagentPresetLocked = computed(() => subagentPresetManualLock(client.config.value));

async function openModelPicker(): Promise<void> {
  modelsLoading.value = true;
  modelsUnavailable.value = false;
  showModelPicker.value = true;
  try {
    // Full refresh first (every refreshable provider, not just OAuth), so the
    // list always reflects the live catalog — the WS model-catalog event that
    // used to keep the cache warm is no longer forwarded by the daemon.
    await client.refreshAllProviders();
  } catch {
    modelsUnavailable.value = true;
  } finally {
    modelsLoading.value = false;
  }
}

async function openProviders(): Promise<void> {
  providersLoading.value = true;
  providersUnavailable.value = false;
  showProviders.value = true;
  try {
    await client.loadProviders();
  } catch {
    providersUnavailable.value = true;
  } finally {
    providersLoading.value = false;
  }
}

function openLogin(): void {
  showLogin.value = true;
}

async function handleSelectModel(modelId: string): Promise<void> {
  showModelPicker.value = false;
  // Same semantics as the composer dropdown rows: the overlay is just the
  // "more models" continuation of the same flow, so it must also bump the
  // global default (see handleComposerSelectModel).
  await handleComposerSelectModel(modelId);
}

async function handleComposerSelectModel(modelId: string): Promise<void> {
  // Primary action: switch the active session's model via POST /sessions/{id}/profile
  // (same as the model picker overlay). Awaited so the model pill reflects the
  // result and failures surface. In the onboarding draft this just stores the
  // pick for the first session.
  const switched = await client.setModel(modelId);

  // Side effect: also bump the daemon-wide default model via POST /config so
  // new sessions inherit the choice. Fire-and-forget — it must not block the UI
  // or mask the session switch. Only after a confirmed switch (a stale/invalid
  // alias must not become the global default), and skip when it already
  // matches the default.
  if (switched && modelId !== client.defaultModel.value) {
    void client.updateConfig({ defaultModel: modelId });
  }
}

async function handleAddProvider(input: { type: string; apiKey?: string; baseUrl?: string; defaultModel?: string }): Promise<void> {
  await client.addProvider(input);
}

async function handleRefreshProvider(id: string): Promise<void> {
  await client.refreshProvider(id);
}

// Destructive session/workspace/provider actions confirm through the shared
// modal here (the menu components only emit the intent). Each passes its work
// as the dialog `action`, so the dialog stays open with a loading state until
// the operation settles. All three client calls toast their own errors and
// never reject.
async function confirmArchiveSession(id: string): Promise<void> {
  await confirm({
    title: t('sidebar.archive'),
    message: t('sidebar.archiveConfirm'),
    variant: 'danger',
    action: () => client.archiveSession(id),
  });
}

async function confirmDeleteWorkspace(id: string): Promise<void> {
  const name = client.workspacesView.value.find((w) => w.id === id)?.name ?? id;
  await confirm({
    title: t('sidebar.removeWorkspace'),
    message: t('workspace.removeWorkspaceConfirm', { name }),
    variant: 'danger',
    action: () => client.deleteWorkspace(id),
  });
}

async function confirmDeleteProvider(id: string): Promise<void> {
  await confirm({
    title: t('providers.delete'),
    message: t('providers.confirmDelete'),
    variant: 'danger',
    action: () => client.deleteProvider(id),
  });
}

async function handleUpdateConfig(patch: Partial<AppConfig>): Promise<boolean> {
  configSaving.value = true;
  try {
    const saved = await client.updateConfig(patch);
    if (saved) await client.checkAuth();
    return saved;
  } finally {
    configSaving.value = false;
  }
}

async function handleActivatePreset(preset: string): Promise<void> {
  const config = client.config.value;
  const currentPreset = config?.subagent?.preset?.trim() ?? '';
  if (
    !config ||
    configSaving.value ||
    (preset === currentPreset && subagentPresetLocked.value)
  ) {
    return;
  }
  const targetSessionId = client.activeSessionId.value ?? null;
  configSaving.value = true;
  try {
    if (!(await client.activateSubagentPreset(preset))) return;
    await client.checkAuth();
    const activeConfig = client.config.value;
    const main = activeConfig === null ? undefined : mainRouteForPreset(activeConfig, preset);
    if (main !== undefined) {
      await client.applyPresetMainRoute(main, targetSessionId);
    }
  } finally {
    configSaving.value = false;
  }
}

/** Resume automatic switching: minimal patch that clears only the manual lock —
 *  the active preset and the auto gates stay exactly as configured. */
async function handleResumeAutoPreset(): Promise<void> {
  if (configSaving.value) return;
  configSaving.value = true;
  try {
    await client.updateConfig(subagentPresetResumeAutoPatch());
  } finally {
    configSaving.value = false;
  }
}

// LoginDialog callbacks — delegates to composable
async function handleStartOAuthLogin() {
  return client.startOAuthLogin();
}

async function handlePollOAuthLogin() {
  return client.pollOAuthLogin();
}

async function handleCancelOAuthLogin() {
  return client.cancelOAuthLogin();
}

async function handleLoginSuccess(): Promise<void> {
  showLogin.value = false;
  // Re-check auth state and reload sessions now that we're authenticated
  await client.checkAuth();
  await client.load();
}

// Edit + resend the last user message: undo the latest exchange on the daemon,
// then drop that message's text back into the composer for editing.
async function handleEditMessage(payload: {
  text: string;
  attachments?: TurnAttachment[];
}): Promise<void> {
  await client.undo(1);
  await nextTick();
  conversationPaneRef.value?.loadComposerForEdit(payload.text, payload.attachments);
}

function reportResearchIssue(key: string): void {
  client.reportResearchIssue(t(`research.commandError.${key}`));
}

function enterResearchMode(sessionId: string | undefined, lineSlug?: string) {
  return runResearchModeEnter({
    sessionId,
    lineSlug,
    pending: researchStartInFlight,
    getState: () => ({
      researchEnabled: client.researchEnabled.value,
      activeSessionId: client.activeSessionId.value,
      busy: researchIdleOnlyBusy.value,
      planMode: client.planMode.value,
    }),
    refreshResearch: (id) => client.refreshResearchById(id),
    commandResearch: (id, command) => client.commandResearchById(id, command),
  });
}

function reportResearchEnterResult(
  result: Awaited<ReturnType<typeof enterResearchMode>>,
): void {
  if (result.kind === 'rejected' && result.clientReported !== true) {
    reportResearchIssue(result.reason);
  }
}

function handleTogglePlanMode(): void {
  const sessionId = client.activeSessionId.value;
  if (
    planModeToggleResearchDecision(
      client.planMode.value,
      client.research.value?.mode,
      sessionId !== undefined && researchStartInFlight.has(sessionId),
    ) === 'plan_conflict'
  ) {
    reportResearchIssue('plan_conflict');
    return;
  }
  client.togglePlanMode();
}

async function handleResearchCommand(request: ResearchManagerCommandRequest): Promise<void> {
  const sessionId = managerSessionId.value;
  if (
    !showResearchManager.value
    || !researchManagerSessionIsCurrent(
      sessionId,
      managerSessionId.value,
      client.activeSessionId.value,
    )
  ) {
    return;
  }
  if (request.command.kind === 'enter_mode') {
    const result = await enterResearchMode(sessionId, request.command.lineSlug);
    reportResearchEnterResult(result);
    if (
      !showResearchManager.value
      || !researchManagerSessionIsCurrent(
        sessionId,
        managerSessionId.value,
        client.activeSessionId.value,
      )
    ) {
      return;
    }
    researchManagerCommandAck.value = {
      ...request,
      succeeded: result.kind === 'entered' || result.kind === 'already-active',
    };
    return;
  }
  if (!researchManagerMutationAllowed(researchIdleOnlyBusy.value)) {
    reportResearchIssue('busy');
    researchManagerCommandAck.value = { ...request, succeeded: false };
    return;
  }
  const snapshot = await client.commandResearchById(sessionId, request.command);
  if (
    !showResearchManager.value
    || !researchManagerSessionIsCurrent(
      sessionId,
      managerSessionId.value,
      client.activeSessionId.value,
    )
  ) {
    return;
  }
  researchManagerCommandAck.value = { ...request, succeeded: snapshot !== null };
}

async function openResearchManager(): Promise<boolean> {
  if (researchIdleOnlyBusy.value) {
    reportResearchIssue('busy');
    return false;
  }
  if (!client.researchEnabled.value) {
    reportResearchIssue('disabled');
    return false;
  }
  const sessionId = client.activeSessionId.value;
  if (sessionId === undefined) {
    reportResearchIssue('snapshot_unavailable');
    return false;
  }
  managerSessionId.value = sessionId;
  researchManagerCommandAck.value = null;
  if (!researchManagerSessionIsCurrent(
    sessionId,
    managerSessionId.value,
    client.activeSessionId.value,
  )) {
    return false;
  }
  const snapshot = await client.refreshResearchById(sessionId);
  if (!researchManagerSessionIsCurrent(
    sessionId,
    managerSessionId.value,
    client.activeSessionId.value,
  )) {
    return false;
  }
  if (researchIdleOnlyBusy.value) {
    reportResearchIssue('busy');
    closeResearchManager();
    return false;
  }
  if (!client.researchEnabled.value) {
    reportResearchIssue('disabled');
    closeResearchManager();
    return false;
  }
  if (snapshot === null) {
    reportResearchIssue('snapshot_unavailable');
    closeResearchManager();
    return false;
  }
  showResearchManager.value = true;
  return true;
}

async function handleStartResearch(): Promise<void> {
  const sessionId = client.activeSessionId.value;
  const result = await enterResearchMode(sessionId);
  reportResearchEnterResult(result);

  if (
    result.kind === 'entered'
    && researchSlashSessionIsCurrent(sessionId, client.activeSessionId.value)
  ) {
    researchExpandSignal.value++;
  } else if (
    result.kind === 'already-active'
    && researchSlashSessionIsCurrent(sessionId, client.activeSessionId.value)
  ) {
    await openResearchManager();
  }
}

async function handleResearchSlash(
  rawArgs: string,
  submission: ComposerCommandSubmission,
): Promise<ResearchSlashExecutionOutcome> {
  const sessionId = submission.sessionId;
  const parsed = parseResearchSlashCommand(rawArgs);
  if (parsed.kind === 'error') {
    reportResearchIssue(parsed.code);
    return 'rejected';
  }
  if (parsed.kind === 'on') {
    const result = await enterResearchMode(sessionId, parsed.lineSlug);
    reportResearchEnterResult(result);
    if (
      result.kind === 'already-active'
      && researchSlashSessionIsCurrent(sessionId, client.activeSessionId.value)
    ) {
      await openResearchManager();
    }
    return researchEnterSlashOutcome(result);
  }

  // Capture and validate the submitted session before any async work. A hand-
  // typed command in the no-session draft is rejected rather than redirected to
  // whichever session happens to become active later.
  if (sessionId === undefined) {
    reportResearchIssue('snapshot_unavailable');
    return 'rejected';
  }
  if (!researchSlashSessionIsCurrent(sessionId, client.activeSessionId.value)) {
    return 'rejected';
  }

  // The menu is hidden on unsupported backends, but a hand-typed command still
  // arrives here so it cannot leak into the model as an ordinary prompt.
  if (!client.researchEnabled.value) {
    reportResearchIssue('disabled');
    return 'rejected';
  }

  if (researchIdleOnlyBusy.value && !researchSlashAllowedWhileBusy(parsed)) {
    reportResearchIssue('busy');
    return 'rejected';
  }

  if (parsed.kind === 'manage') {
    return (await openResearchManager()) ? 'handled' : 'rejected';
  }

  if (parsed.kind === 'status') {
    const snapshot = await client.refreshResearchById(sessionId);
    if (!researchSlashSessionIsCurrent(sessionId, client.activeSessionId.value)) {
      return 'rejected';
    }
    if (!client.researchEnabled.value) {
      reportResearchIssue('disabled');
      return 'rejected';
    }
    if (researchIdleOnlyBusy.value && !researchSlashAllowedWhileBusy(parsed)) {
      reportResearchIssue('busy');
      return 'rejected';
    }
    if (snapshot === null) {
      reportResearchIssue('snapshot_unavailable');
      return 'rejected';
    }
    researchExpandSignal.value++;
    return 'handled';
  }

  // Revisioned commands resolve against a fresh authoritative snapshot for the
  // submitted session, not a potentially stale board for the current session.
  const needsSnapshot = researchSlashNeedsSnapshot(parsed);
  const snapshot = needsSnapshot
    ? await client.refreshResearchById(sessionId)
    : null;
  if (
    needsSnapshot &&
    !researchSlashSessionIsCurrent(sessionId, client.activeSessionId.value)
  ) {
    return 'rejected';
  }
  if (!client.researchEnabled.value) {
    reportResearchIssue('disabled');
    return 'rejected';
  }
  if (researchIdleOnlyBusy.value && !researchSlashAllowedWhileBusy(parsed)) {
    reportResearchIssue('busy');
    return 'rejected';
  }

  const resolutionError = researchCommandResolutionError(parsed, snapshot);
  if (resolutionError !== null) {
    reportResearchIssue(resolutionError);
    return 'rejected';
  }
  const command = researchCommandFromSlash(parsed, snapshot);
  if (command === null) {
    reportResearchIssue('unresolved');
    return 'rejected';
  }
  return submitResearchSlashCommand(
    sessionId,
    () => client.activeSessionId.value,
    () => client.commandResearchById(sessionId, command),
  );
}

function restoreResearchSlashInput(
  submission: ComposerCommandSubmission,
  outcome: ResearchSlashExecutionOutcome,
): void {
  const input = researchSlashInputToRestore(submission.input, outcome);
  if (input === null) return;
  restoreComposerCommandSubmission(
    submission,
    client.activeSessionId.value,
    (value) => conversationPaneRef.value?.loadComposerForEdit(value) ?? false,
  );
}

// Handler for slash commands emitted by Composer (via ConversationPane).
// Parsing once here keeps every command on the same Unicode-whitespace path.
function handleCommand(event: ComposerCommandEvent): void {
  const submission =
    typeof event === 'string'
      ? createComposerCommandSubmission(event, client.activeSessionId.value)
      : event;
  const cmd = submission.input;
  const parsedCommand = parseSlash(cmd);
  const commandName = parsedCommand?.cmd ?? cmd;
  const arg = parsedCommand?.arg.trim() ?? '';

  if (commandName === '/research') {
    void handleResearchSlash(arg, submission).then((outcome) => {
      restoreResearchSlashInput(submission, outcome);
    });
    return;
  }
  // `/compact <text>` carries an optional free-text instruction steering what
  // the summary should focus on (TUI parity).
  if (commandName === '/compact') {
    client.compact(arg || undefined);
    return;
  }
  // `/swarm` toggles swarm mode; `/swarm on|off` sets it; `/swarm <task>` enables
  // swarm and runs the task right away (TUI parity).
  if (commandName === '/swarm') {
    if (arg === 'on') client.setSwarmMode(true);
    else if (arg === 'off') client.setSwarmMode(false);
    else if (arg) { client.setSwarmMode(true); void client.sendPrompt(arg); }
    else void client.toggleSwarmMode();
    return;
  }
  // `/goal <objective>` creates a goal (and submits it); `/goal pause|resume|cancel`
  // controls the active one; bare `/goal` toggles goal mode for the next message.
  if (commandName === '/goal') {
    if (arg === 'pause' || arg === 'resume' || arg === 'cancel') client.controlGoal(arg);
    else if (arg) void client.createGoal(arg);
    else client.toggleGoalMode();
    return;
  }
  // `/btw <question>` opens (creating if needed) the side chat and asks it; bare
  // `/btw` toggles the side-chat tab for the active session.
  if (commandName === '/btw') {
    if (!arg && client.sideChatVisible.value) {
      // Use the detail-layer close so detailTarget is cleared too; the bare
      // client.closeSideChat() only hides the panel and leaves detailTarget set.
      closeSideChat();
    } else {
      void openSideChatTab(arg || undefined);
    }
    return;
  }
  switch (commandName) {
    // `/new` and `/clear` are aliases: both open the onboarding composer. The
    // session is only created when the user sends the first message.
    case '/new':
    case '/clear':
      handleCreateSession();
      break;
    case '/fork':
      void client.forkSession();
      break;
    case '/export':
      void client.exportSession();
      break;
    case '/undo':
      void client.undo();
      break;
    case '/plan':
      handleTogglePlanMode();
      break;
    case '/auto':
      client.setPermission('auto');
      break;
    case '/yolo':
      client.setPermission('yolo');
      break;
    case '/thinking':
      // No popover anchor from a slash command — step to the next level.
      client.setThinking(nextThinkingLevel(client.thinking.value));
      break;
    case '/status':
      showStatusPanel.value = true;
      break;
    case '/login':
      openLogin();
      break;
    default: {
      // Not a built-in command → treat it as a session skill activation. The
      // structured parser keeps tabs/newlines in `arg` instead of folding them
      // into the skill name or letting the command become a model prompt.
      const name = stripSkillPrefix(commandName.slice(1));
      const args = arg || undefined;
      if (!name) break;
      if (!client.activeSessionId.value && client.activeWorkspaceId.value) {
        void client.startSessionAndActivateSkill(client.activeWorkspaceId.value, name, args);
      } else {
        void client.activateSkill(name, args);
      }
      break;
    }
  }
}

function handleUnqueue(index: number): void {
  client.unqueue(index);
}

// Editing a queued message: the Composer already loaded the text into its
// textarea; here we just remove it from the queue so it isn't sent twice.
function handleEditQueued(index: number): void {
  client.unqueue(index);
}

function handleReorderQueue(payload: { from: number; to: number }): void {
  client.reorderQueue(payload.from, payload.to);
}

async function handleSubmit(payload: SubmitPayload): Promise<void> {
  const wsId = client.activeWorkspaceId.value;
  if (!client.activeSessionId.value && wsId) {
    await client.startSessionAndSendPrompt(wsId, payload.text, payload.attachments);
    return;
  }
  if (!client.activeSessionId.value && !wsId) {
    pendingWorkspaceSubmit.value = payload;
    showAddWorkspace.value = true;
    return;
  }
  void client.sendPrompt(payload.text, payload.attachments);
}

async function handleAddWorkspace(root: string): Promise<void> {
  addWorkspaceError.value = null;
  const added = await client.addWorkspaceByPath(root);
  // Keep the picker open (and the pending submission intact) when the daemon
  // rejects the path so the user can retry with a valid one. The error is shown
  // inline in the picker. Closing via Escape goes through handleCloseAddWorkspace,
  // which drops the pending prompt.
  if (!added) {
    addWorkspaceError.value = t('workspace.addFailed');
    return;
  }
  showAddWorkspace.value = false;
  const pending = pendingWorkspaceSubmit.value;
  pendingWorkspaceSubmit.value = null;
  const wsId = client.activeWorkspaceId.value;
  if (pending && wsId) {
    await client.startSessionAndSendPrompt(wsId, pending.text, pending.attachments);
  }
}

function handleCloseAddWorkspace(): void {
  pendingWorkspaceSubmit.value = null;
  addWorkspaceError.value = null;
  showAddWorkspace.value = false;
}

function focusComposerAfterDraft(): void {
  void nextTick(() => {
    conversationPaneRef.value?.focusComposer();
  });
}

// Primary "+ New": enter the draft state in the current workspace so the
// right pane shows the onboarding composer. The session is only created when
// the user sends the first message.
function handleCreateSession(): void {
  const wsId = client.activeWorkspaceId.value;
  if (wsId) {
    client.openWorkspaceDraft(wsId);
  } else {
    client.clearActiveSession();
  }
  focusComposerAfterDraft();
}

// Workspace-level "+ New" (sidebar group or mobile switcher): enter the draft
// state in the chosen workspace. No backend session is created until the user
// actually sends a message.
function handleCreateSessionInWorkspace(workspaceId: string): void {
  client.openWorkspaceDraft(workspaceId);
  focusComposerAfterDraft();
}

// Chat header: open a GitHub PR in a new tab.
function openPr(url: string): void {
  if (url) window.open(url, '_blank', 'noopener');
}
</script>

<template>
  <div class="app-shell">
    <ServerAuthDialog v-if="showServerAuth" />
    <section v-if="showAuthGate" class="auth-page">
      <div class="auth-page-inner">
        <svg ref="authLogoRef" class="auth-page-logo ch-logo" viewBox="0 0 32 22" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hakimi" @mousedown.prevent @click="blinkAuthLogo">
          <defs>
            <mask id="authKimiEyes" maskUnits="userSpaceOnUse">
              <rect x="0" y="0" width="32" height="22" fill="#fff" />
              <g class="ch-eyes" fill="#000">
                <path class="ch-eye" d="M13.2 7.5C14.6 9.1 14.8 13.7 13.2 16.5C11.6 13.7 11.8 9.1 13.2 7.5Z" />
                <path class="ch-eye" d="M18.8 7.5C20.2 9.1 20.4 13.7 18.8 16.5C17.2 13.7 17.4 9.1 18.8 7.5Z" />
              </g>
            </mask>
          </defs>
          <path d="M2 8L4 2L10 5C12 4 20 4 22 5L28 2L30 8V15C30 19 26 21 16 21C6 21 2 19 2 15V8Z" fill="var(--logo)" mask="url(#authKimiEyes)" />
        </svg>
        <div class="auth-page-copy">
          <h1>{{ t('app.authPageTitle') }}</h1>
          <p>{{ t('app.authPageMessage') }}</p>
        </div>
        <Button class="auth-page-btn" variant="primary" @click="openLogin">
          <Icon name="log-in" size="md" />
          <span>{{ t('app.authPageLogin') }}</span>
        </Button>
      </div>
    </section>
    <div
      v-else
      class="app"
      :class="{
        mobile: isMobile,
        'sidebar-collapsed': sidebarCollapsed && !isMobile,
        'macos-desktop': isMacosDesktop,
      }"
      :style="{ '--preview-w': previewPanelWidth + 'px' }"
    >
    <!-- Desktop navigation: workspace rail + resizable session column. -->
    <template v-if="!isMobile">
      <Sidebar
        :collapsed="sidebarCollapsed"
        :dragging="sidebarDragging"
        :col-width="sideWidth"
        :active-workspace="client.visibleWorkspace.value"
        :active-workspace-id="client.activeWorkspaceId.value"
        :sessions="client.sessionsForView.value"
        :groups="client.workspaceGroups.value"
        :active-id="client.activeSessionId.value"
        :attention-by-session="client.attentionBySession.value"
        :pending-by-session="client.pendingBySession.value"
        :unread-by-session="client.unreadBySession.value"
        :workspace-sort-mode="client.workspaceSortMode.value"
        :backend="client.backend.value"
        @select="client.selectSession($event)"
        @create="handleCreateSession"
        @create-in-workspace="handleCreateSessionInWorkspace($event)"
        @select-workspace="client.openWorkspace($event)"
        @add-workspace="showAddWorkspace = true"
        @rename="(id, title) => client.renameSession(id, title)"
        @archive="confirmArchiveSession($event)"
        @fork="(id) => client.forkSession(id)"
        @export="(id) => client.exportSession(id)"
        @rename-workspace="(id, name) => client.renameWorkspace(id, name)"
        @delete-workspace="confirmDeleteWorkspace($event)"
        @reorder-workspaces="client.reorderWorkspaces($event)"
        @set-workspace-sort-mode="client.setWorkspaceSortMode($event)"
        @load-more-sessions="(id) => void client.loadMoreSessions(id)"
        @load-all-sessions="void client.loadAllSessions()"
        @open-settings="showSettings = true"
        @collapse="toggleSidebarCollapse"
      />
      <ResizeHandle
        v-show="!sidebarCollapsed"
        class="side-handle"
        :storage-key="SIDEBAR_WIDTH_KEY"
        :default-width="SIDEBAR_DEFAULT"
        :min="SIDEBAR_MIN"
        :max="sidebarMax"
        @update:width="sessionColWidth = $event"
        @update:dragging="sidebarDragging = $event"
      />
    </template>

    <!-- Mobile navigation: slim top bar (switcher + settings sheets). -->
    <MobileTopBar
      v-if="isMobile"
      :workspace="client.visibleWorkspace.value"
      :session-title="activeSessionTitle"
      :running="running"
      :connection="client.connection.value"
      :remote-share-enabled="remoteControlEnabled"
      :remote-share-active="remoteShareActive"
      @open-switcher="showMobileSwitcher = true"
      @open-settings="showMobileSettings = true"
      @open-remote-share="showRemoteShare = true"
    />

    <ConversationPane
      ref="conversationPaneRef"
      :mobile="isMobile"
      :connection="client.connection.value"
      :turns="client.turns.value"
      :session-id="client.activeSessionId.value"
      :approvals="client.pendingApprovals.value"
      :changes="client.changes.value"
      :git-info="client.gitInfo.value"
      :tasks="client.tasks.value"
      :todos="client.todos.value"
      :goal="client.goal.value"
      :research="client.research.value"
      :research-enabled="client.researchEnabled.value"
      :research-expand-signal="researchExpandSignal"
      :activation-badges="client.activationBadges.value"
      :status="client.status.value"
      :thinking="client.thinking.value"
      :plan-mode="client.planMode.value"
      :swarm-mode="client.swarmMode.value"
      :goal-mode="client.goalMode.value"
      :models="client.models.value"
      :starred-ids="client.starredModelIds.value"
      :skills="client.skills.value"
      :questions="client.questions.value"
      :pending-question-actions="client.pendingQuestionActions"
      :pending-approval-actions="client.pendingApprovalActions"
      :running="running"
      :turn-active="client.turnActive.value"
      :turn-progress="client.turnProgress.value"
      :queued="client.queued.value"
      :search-files="client.searchFiles"
      :upload-image="client.uploadImage"
      :working="client.working.value"
      :starting="client.isStartingFirstPrompt.value"
      :fast-moon="client.fastMoon.value"
      :file-reload-key="client.activeSessionId.value"
      :session-loading="client.sessionLoading.value"
      :compaction="client.compaction.value"
      :has-more-messages="client.hasMoreMessages.value"
      :loading-more="client.loadingMoreMessages.value"
      :loading-more-error="client.loadMoreMessagesError.value"
      :load-older-messages="client.loadOlderMessages"
      :workspace-name="client.visibleWorkspace.value?.name"
      :workspace-root="client.visibleWorkspace.value?.root ?? client.status.value.cwd"
      :git-diff-stats="client.gitDiffStats.value"
      :subagent-preset="client.config.value?.subagent?.preset"
      :subagent-preset-names="subagentPresetNames"
      :subagent-preset-saving="configSaving"
      :subagent-preset-locked="subagentPresetLocked"
      :auto-subagent-preset-status="client.autoSubagentPresetStatus.value"
      :workspaces="client.workspacesView.value"
      :active-workspace-id="client.activeWorkspaceId.value"
      :session-title="activeSessionTitle"
      :pr="client.activePullRequest.value"
      :conversation-toc="client.conversationToc.value"
      :remote-share-enabled="remoteControlEnabled"
      :remote-share-active="remoteShareActive"
      :remote-share-expires-at="remoteShareExpiresAt"
      @activate-preset="handleActivatePreset($event)"
      @resume-auto-preset="handleResumeAutoPreset"
      @open-changes="openDiffDetail()"
      @select-workspace="handleCreateSessionInWorkspace($event)"
      @add-workspace="showAddWorkspace = true"
      @open-pr="openPr"
      @open-remote-share="showRemoteShare = true"
      @submit="handleSubmit($event)"
      @steer="client.steerPrompt($event.text, $event.attachments)"
      @approval="(approvalId, response) => client.respondApproval(approvalId, response)"
      @cancel-task="client.cancelTask($event)"
      @answer="(questionId, response) => client.respondQuestion(questionId, response)"
      @dismiss="(questionId) => client.dismissQuestion(questionId)"
      @command="handleCommand"
      @interrupt="client.abortCurrentPrompt()"
      @unqueue="handleUnqueue"
      @edit-queued="handleEditQueued"
      @reorder-queue="handleReorderQueue"
      @set-permission="client.setPermission($event)"
      @set-thinking="client.setThinking($event)"
      @toggle-plan="handleTogglePlanMode"
      @toggle-swarm="client.toggleSwarmMode()"
      @toggle-goal="client.toggleGoalMode()"
      @create-goal="client.createGoal($event)"
      @control-goal="client.controlGoal($event)"
      @start-research="handleStartResearch"
      @manage-research="openResearchManager"
      @refresh-git-status="client.activeSessionId.value && client.loadGitStatus(client.activeSessionId.value)"
      @rename-session="(id, title) => client.renameSession(id, title)"
      @fork-session="(id) => client.forkSession(id)"
      @archive-session="confirmArchiveSession($event)"
      @export-session="(id) => client.exportSession(id)"
      @compact="client.compact()"
      @pick-model="openModelPicker()"
      @select-model="handleComposerSelectModel($event)"
      @open-file="openFilePreview($event)"
      @open-media="openMediaPreview($event)"
      @open-thinking="openThinkingPanel($event)"
      @open-compaction="openCompactionPanel($event)"
      @open-agent="openAgentPanel($event)"
      @open-tool-diff="openToolDiff($event)"
      @open-preview="openWebPreview($event)"
      @edit-message="handleEditMessage"
    />

    <!-- Sidebar toggle — floating only when the in-header control can't serve:
         on macOS desktop it's RESIDENT (always rendered beside the traffic
         lights, the sidebar slides underneath and only the glyph swaps, so it
         never moves or flashes); on Windows/web the collapse button lives
         inside the sidebar header, so this floating button only appears while
         COLLAPSED (to re-expand the sidebar). It must come AFTER
         ConversationPane in the DOM: Electron computes the window-drag region
         in tree order (drag rects union, no-drag rects subtract), so a no-drag
         element placed before the ChatHeader drag region would have its hole
         painted back over — making the button an inert drag area. -->
    <IconButton
      v-if="!isMobile && (isMacosDesktop || sidebarCollapsed)"
      class="sidebar-toggle-btn"
      size="sm"
      :label="sidebarCollapsed ? t('sidebar.expandSidebar') : t('sidebar.collapseSidebar')"
      @click="toggleSidebarCollapse"
    >
      <Icon :name="sidebarCollapsed ? 'panel-expand' : 'panel-collapse'" />
    </IconButton>

    <ResizeHandle
      v-if="sidePanelVisible && !isMobile"
      class="preview-handle"
      :storage-key="PREVIEW_WIDTH_KEY"
      :default-width="previewDefaultWidth"
      :min="PREVIEW_MIN"
      :max="previewMax"
      reverse
      :aria-label="t('layout.resizePreviewAria')"
      @update:width="previewWidth = $event"
      @update:dragging="panelDragging = $event"
    />

    <!-- Desktop: the aside is a PERMANENT grid column whose width transitions
         0 ↔ var(--preview-w) — opening genuinely squeezes the chat column over
         (one animation, no slide-over hacks). Mobile mounts only when open
         (full-screen overlay). Content stays v-if'd, so a closed panel is a
         zero-width empty shell. -->
    <aside
      v-if="!isMobile || sidePanelVisible"
      class="global-preview"
      :class="{ open: sidePanelVisible, mobile: isMobile, 'no-anim': panelDragging || panelSwitching }"
      role="complementary"
      :aria-label="t('layout.detailPanelAria')"
      :aria-hidden="!sidePanelVisible"
    >
      <ThinkingPanel
        v-if="detailTarget === 'thinking' && thinkingVisible"
        :text="thinkingPanelText ?? ''"
        @close="closeThinkingPanel"
      />
      <ThinkingPanel
        v-else-if="detailTarget === 'compaction' && compactionPanelVisible"
        :text="compactionPanelText ?? ''"
        :subtitle="t('conversation.summaryTitle')"
        @close="closeCompactionPanel"
      />
      <AgentDetailPanel
        v-else-if="detailTarget === 'agent' && agentPanelMember"
        :member="agentPanelMember"
        @close="closeAgentPanel"
      />
      <SideChatPanel
        v-else-if="detailTarget === 'btw' && btwVisible"
        :turns="client.sideChatTurns.value"
        :running="client.sideChatRunning.value"
        :sending="client.sideChatSending.value"
        @send="client.sendSideChatPrompt($event)"
        @close="closeSideChat"
      />
      <DiffView
        v-else-if="detailTarget === 'diff'"
        :mode="detailDiffMode"
        :changes="client.changes.value"
        :git-info="client.gitInfo.value"
        :file-diff="client.fileDiff.value"
        :selected-diff-path="client.selectedDiffPath.value"
        :file-diff-loading="client.fileDiffLoading.value"
        closable
        @open="selectDiffFile"
        @back="detailDiffMode = 'list'; detailDiffPath = null; client.clearFileDiff()"
        @close="closeDiffDetail"
      />
      <ToolDiffPanel
        v-else-if="detailTarget === 'toolDiff' && toolDiffTarget"
        :target="toolDiffTarget"
        @close="closeToolDiff"
      />
      <WebPreviewPanel
        v-else-if="detailTarget === 'preview' && webPreviewTarget"
        :target="webPreviewTarget"
        :refresh-key="webPreviewRefreshKey"
        @close="closeWebPreview"
        @reload="reloadWebPreview"
        @external="openExternalWebPreview"
      />
      <FilePreview
        v-else-if="detailTarget === 'file'"
        :file="previewFile"
        :loading="previewLoading"
        :error="previewError"
        :line="previewTarget?.line"
        :download-url="previewDownloadUrl"
        closable
        :external-actions="previewExternalActions"
        :open-file="openFilePreview"
        @close="closeFilePreview"
        @open-external="openPreviewInEditor"
        @reveal="revealPreviewFile"
      />
    </aside>

    <!-- Internal-build tag — pinned to the app's bottom-right corner, above
         whatever pane happens to be there. Purely informational: pointer
         events pass through so it never blocks clicks. -->
    <InternalBuildBanner class="internal-build-fab" />

    <!-- Model Picker overlay -->
    <ModelPicker
      v-if="showModelPicker"
      :models="client.models.value"
      :current="client.status.value.modelId"
      :starred-ids="client.starredModelIds.value"
      :loading="modelsLoading"
      :unavailable="modelsUnavailable"
      @select="handleSelectModel($event)"
      @toggle-star="client.toggleStarModel($event)"
      @close="showModelPicker = false"
    />

    <!-- Settings page (modal) -->
    <SettingsDialog
      v-if="showSettings"
      :color-scheme="client.colorScheme.value"
      :accent="client.accent.value"
      :ui-font-size="client.uiFontSize.value"
      :auth-ready="client.authReady.value"
      :account-model="client.defaultModel.value"
      :notify="client.notifyOnComplete.value"
      :notify-question="client.notifyOnQuestion.value"
      :notify-approval="client.notifyOnApproval.value"
      :notify-permission="client.notifyPermission.value"
      :sound="client.soundOnComplete.value"
      :conversation-toc="client.conversationToc.value"
      :config="client.config.value"
      :auto-subagent-preset-status="client.autoSubagentPresetStatus.value"
      :models="client.models.value"
      :config-saving="configSaving"
      :server-version="client.serverVersion.value"
      :experimental-flags="client.experimentalFlags.value"
      :backend="client.backend.value"
      @set-color-scheme="client.setColorScheme($event)"
      @set-accent="client.setAccent($event)"
      @set-ui-font-size="client.setUiFontSize($event)"
      @set-notify="client.setNotifyOnComplete($event)"
      @set-notify-question="client.setNotifyOnQuestion($event)"
      @set-notify-approval="client.setNotifyOnApproval($event)"
      @set-sound="client.setSoundOnComplete($event)"
      @set-conversation-toc="client.setConversationToc($event)"
      @update-config="handleUpdateConfig($event)"
      @activate-preset="handleActivatePreset($event)"
      @login="() => { showSettings = false; openLogin(); }"
      @logout="client.logout"
      @open-onboarding="() => { showSettings = false; openOnboarding(); }"
      @open-providers="() => { showSettings = false; openProviders(); }"
      @close="showSettings = false"
    />

    <!-- Provider Manager overlay -->
    <ProviderManager
      v-if="showProviders"
      :providers="client.providers.value"
      :loading="providersLoading"
      :unavailable="providersUnavailable"
      @add="handleAddProvider($event)"
      @refresh="handleRefreshProvider($event)"
      @delete="confirmDeleteProvider($event)"
      @open-login="() => { showProviders = false; openLogin(); }"
      @close="showProviders = false"
    />

    <!-- Status panel overlay (/status) — renders current client state, no daemon call -->
    <StatusPanel
      v-if="showStatusPanel"
      :status="client.status.value"
      :thinking="statusPanelThinking"
      :plan-mode="client.planMode.value"
      :swarm-mode="client.swarmMode.value"
      :cost-usd="client.sessionCost.value"
      @close="showStatusPanel = false"
    />

    <ResearchManagerDialog
      v-if="client.researchEnabled.value && managerSessionId !== null"
      :key="managerSessionId"
      v-model:open="showResearchManager"
      :snapshot="client.research.value"
      :command-ack="researchManagerCommandAck"
      @command="handleResearchCommand"
    />

    <!-- Add Workspace overlay (daemon folder browser + paste-path fallback) -->
    <AddWorkspaceDialog
      v-if="showAddWorkspace"
      :browse-fs="client.browseFs"
      :get-fs-home="client.getFsHome"
      :default-path="client.visibleWorkspace.value?.root ?? client.status.value.cwd"
      :error="addWorkspaceError"
      @add="handleAddWorkspace($event)"
      @close="handleCloseAddWorkspace"
    />

    <!-- Remote-control overlay (experimental `remote_control` flag): both the
         temporary share and the long-lived persistent service share this
         dialog. The composables poll while this is open or a service is
         active. -->
    <RemoteShareDialog
      v-if="remoteControlEnabled && showRemoteShare"
      :status="remoteShare.status.value"
      :refreshing="remoteShare.refreshing.value"
      :starting="remoteShare.starting.value"
      :stopping="remoteShare.stopping.value"
      :error="remoteShare.error.value"
      :persistent-status="remotePersistent.status.value"
      :persistent-refreshing="remotePersistent.refreshing.value"
      :persistent-starting="remotePersistent.starting.value"
      :persistent-stopping="remotePersistent.stopping.value"
      :persistent-error="remotePersistent.error.value"
      @start="(ttlSeconds) => void remoteShare.start(ttlSeconds)"
      @stop="() => void remoteShare.stop()"
      @refresh="() => void remoteShare.refresh()"
      @persistent-start="() => void remotePersistent.start()"
      @persistent-stop="() => void remotePersistent.stop()"
      @persistent-refresh="() => void remotePersistent.refresh()"
      @close="closeRemoteShare"
    />

    <!-- Global connecting splash on first load (until the daemon round-trips) -->
    <Transition name="gload-fade">
      <GlobalLoading v-if="!client.initialized.value" :issue="client.connectIssue.value" />
    </Transition>

    <!-- First-run onboarding overlay (language + welcome greeting). Held back
         until the first load settled so it can't cover the connecting splash
         (it teleports to <body> and would float above the retry error). -->
    <Onboarding
      v-if="client.initialized.value && showOnboarding && !showAuthGate"
      @complete="completeOnboarding"
      @skip="completeOnboarding"
    />

    <!-- Floating warnings / agent errors (e.g. a 403 from the model provider) -->
    <WarningToasts :warnings="client.warnings.value" @dismiss="client.dismissWarning" />

    <!-- KAP/daemon debug panel (opt-in, ?debug=1) -->
    <DebugPanel v-if="debugEnabled" />

    <!-- Global modal-confirmation host (driven by useConfirmDialog) -->
    <ConfirmDialogHost />

    <!-- Mobile switcher bottom-sheet: workspace groups + sessions (mirrors the
         desktop sidebar) -->
    <MobileSwitcherSheet
      v-if="isMobile"
      v-model="showMobileSwitcher"
      :groups="client.workspaceGroups.value"
      :active-workspace-id="client.activeWorkspaceId.value"
      :active-id="client.activeSessionId.value"
      :attention-by-session="client.attentionBySession.value"
      :attention-by-workspace="client.attentionByWorkspace.value"
      @select="client.selectSession($event)"
      @create="handleCreateSession"
      @create-in-workspace="handleCreateSessionInWorkspace($event)"
      @add-workspace="showAddWorkspace = true"
      @rename="(id, title) => client.renameSession(id, title)"
      @archive="confirmArchiveSession($event)"
      @delete-workspace="confirmDeleteWorkspace($event)"
      @load-more="(id) => void client.loadMoreSessions(id)"
    />

    <!-- Mobile settings bottom-sheet: session controls + app prefs + auth -->
    <MobileSettingsSheet
      v-if="isMobile"
      v-model="showMobileSettings"
      :status="client.status.value"
      :thinking="client.thinking.value"
      :models="client.models.value"
      :plan-mode="client.planMode.value"
      :swarm-mode="client.swarmMode.value"
      :color-scheme="client.colorScheme.value"
      :ui-font-size="client.uiFontSize.value"
      :auth-ready="client.authReady.value"
      :conversation-toc="client.conversationToc.value"
      :server-version="client.serverVersion.value"
      :session-id="client.activeSessionId.value"
      :git-info="client.gitInfo.value"
      :changes-count="activeSessionChangesCount"
      :pr="client.activePullRequest.value"
      :subagent-preset="client.config.value?.subagent?.preset"
      :subagent-preset-names="subagentPresetNames"
      :subagent-preset-saving="configSaving"
      :subagent-preset-locked="subagentPresetLocked"
      @pick-model="openModelPicker()"
      @set-thinking="client.setThinking($event)"
      @toggle-plan="handleTogglePlanMode"
      @toggle-swarm="client.toggleSwarmMode()"
      @set-permission="client.setPermission($event)"
      @set-color-scheme="client.setColorScheme($event)"
      @set-ui-font-size="client.setUiFontSize($event)"
      @set-conversation-toc="client.setConversationToc($event)"
      @copy-all="conversationPaneRef?.copyConversation()"
      @copy-final-summary="conversationPaneRef?.copyFinalSummary()"
      @fork-session="(id) => client.forkSession(id)"
      @export-session="(id) => client.exportSession(id)"
      @activate-preset="handleActivatePreset($event)"
      @resume-auto-preset="handleResumeAutoPreset"
      @open-changes="openDiffDetail()"
      @open-pr="openPr"
      @login="() => { showMobileSettings = false; openLogin(); }"
      @logout="client.logout"
    />
    </div>
    <!-- Login Dialog overlay. It is outside `.app` so `/login` can open it too. -->
    <LoginDialog
      v-if="showLogin"
      :on-start-o-auth-login="handleStartOAuthLogin"
      :on-poll-o-auth-login="handlePollOAuthLogin"
      :on-cancel-o-auth-login="handleCancelOAuthLogin"
      @success="handleLoginSuccess"
      @close="showLogin = false"
    />
  </div>
</template>

<style scoped>
/* Global connecting splash fade-out (only the leave matters; it mounts instantly). */
.gload-fade-leave-active { transition: opacity 0.28s ease; }
.gload-fade-leave-to { opacity: 0; }

.app-shell {
  /* Pinned to the visual viewport (see setAppHeight): --app-top tracks iOS's
     keyboard pan and --app-height shrinks with the keyboard, so the shell
     always covers exactly the visible area. Fixed positioning keeps it out of
     the document flow that iOS pans. */
  position: fixed;
  top: var(--app-top, 0px);
  left: 0;
  right: 0;
  height: 100vh;
  height: 100dvh;
  height: var(--app-height, 100dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.auth-page {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: var(--bg);
  color: var(--color-text);
  box-sizing: border-box;
}
.auth-page-inner {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
}
.auth-page-logo {
  width: 64px;
  height: 44px;
  flex: none;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.18s ease;
}
.auth-page-logo:hover {
  transform: scale(1.06);
}
.auth-page-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.auth-page-copy h1 {
  margin: 0;
  font-family: var(--sans);
  font-size: 30px;
  line-height: 1.15;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--color-text);
}
.auth-page-copy p {
  margin: 0;
  font-family: var(--sans);
  font-size: var(--ui-font-size-lg);
  line-height: 1.55;
  color: var(--dim);
}
.app {
  --preview-w: 460px;
  flex: 1;
  min-height: 0;
  position: relative;
  display: grid;
  /* sidebar | 0-width handle | conversation | 0-width handle | right panel.
     The 4px ResizeHandles overflow their zero-width tracks via negative margins
     so the whole strip is grabbable without consuming layout space. */
  /* Both side tracks are PERMANENT (auto = follows the aside's width, 0 when
     closed/collapsed) — opening or collapsing animates the aside's width, so
     the conversation column is squeezed over smoothly instead of snapping to a
     new template. Every column is pinned explicitly (grid-column 1–5) so a
     display:none handle can't shift auto-placement. */
  grid-template-columns: auto 0 minmax(0, 1fr) 0 auto;
  background: var(--bg);
  color: var(--color-text);
  overflow: hidden;
  box-sizing: border-box;
}
/* Grid children must be allowed to shrink below content height so that only
   the inner scroll containers (.panes / .sessions) scroll — otherwise the
   whole .app overflows and the page (incl. sidebar) scrolls together. */
.app > * {
  min-height: 0;
  min-width: 0;
}

/* Pin every desktop grid child to its track so auto-placement can never
   reshuffle columns when a handle is display:none (v-show/v-if). */
.app > .side { grid-column: 1; }
.side-handle { grid-column: 2; }
.app:not(.mobile) > .con { grid-column: 3; }
.preview-handle { grid-column: 4; }

/* Sidebar toggle — floating button pinned to the top-left corner. On macOS
   desktop it is resident (rendered in both states beside the traffic lights);
   on Windows/web it only appears while the sidebar is collapsed (the collapse
   button lives inside the sidebar header). While collapsed the conversation
   header pads left so its content clears the button (global block below). */
.sidebar-toggle-btn {
  position: absolute;
  /* Vertically centered in the 48px conversation header. */
  top: 11px;
  left: 16px;
  z-index: var(--z-sticky);
  /* Fade in on appearance (Windows/web: only rendered while collapsed, so
     this plays as the sidebar finishes sliding away). macOS disables it. */
  animation: sidebar-toggle-btn-in 0.18s var(--ease-out) 0.12s backwards;
  /* Floats over the macOS-desktop window-drag header; keep it clickable. */
  -webkit-app-region: no-drag;
}
/* macOS desktop (hidden title bar): resident beside the floating traffic
   lights (green light's right edge ≈ 68px; 72 keeps a gap that matches the
   lights' own 8px rhythm); no entrance animation since it never appears. */
.app.macos-desktop .sidebar-toggle-btn {
  left: 72px;
  animation: none;
}
@keyframes sidebar-toggle-btn-in {
  from { opacity: 0; }
}

/* Internal-build tag pinned to the app's bottom-right corner (desktop app
   only — the component renders nothing elsewhere). Informational: never
   intercepts pointer input. */
.internal-build-fab {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-3);
  z-index: var(--z-sticky);
  pointer-events: none;
}

/* Mobile single-column shell: slim top bar (auto) over the full-width
   conversation pane (1fr). No rail, no session column, no resize handle. */
.app.mobile {
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr;
}

/* The right-side panel column: a permanent grid item whose width animates
   0 ↔ var(--preview-w). The CONTENT keeps a fixed width (and carries the
   left hairline) so it clips during the transition instead of reflowing. */
.global-preview {
  grid-column: 5;
  min-width: 0;
  min-height: 0;
  width: 0;
  background: var(--bg);
  overflow: hidden;
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.global-preview.open {
  width: var(--preview-w);
}
/* While dragging the resize handle, follow the pointer 1:1. */
.global-preview.no-anim {
  transition: none;
}
.global-preview:not(.mobile) > * {
  width: var(--preview-w);
  height: 100%;
  box-sizing: border-box;
  border-left: 1px solid var(--line);
}
.global-preview.mobile {
  position: fixed;
  inset: 0;
  z-index: var(--z-sticky);
  width: auto;
  transition: none;
  border-top: 2px solid var(--color-text);
}

@media (max-width: 640px) {
  .auth-page {
    align-items: flex-start;
    padding:
      max(48px, var(--safe-top))
      max(20px, var(--safe-right))
      max(24px, var(--safe-bottom))
      max(20px, var(--safe-left));
  }
  .auth-page-copy h1 {
    font-size: 26px;
  }
  .auth-page-btn {
    width: 100%;
  }
}
</style>

<style>
:root {
  /* Right-side panel headers (ThinkingPanel / FilePreview / DiffView / SideChatPanel)
     share the same 48px height as the conversation header so the hairline reads as
     one continuous line across the layout. */
  --panel-head-h: 48px;
}

/* Sidebar collapsed (desktop): the conversation header pads left so its
   content clears the floating sidebar toggle (.sidebar-toggle-btn) — and the
   macOS traffic lights on desktop builds. Animated in step with the sidebar
   width transition. Cross-component rule (ChatHeader renders the header), so
   it lives in this global block. */
.app:not(.mobile) .chat-header {
  transition: padding-left 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.app.sidebar-collapsed .chat-header {
  padding-left: 52px;
}
.app.sidebar-collapsed.macos-desktop .chat-header {
  padding-left: 108px;
}
</style>
