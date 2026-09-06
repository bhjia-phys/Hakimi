import { computed, createApp, h, nextTick, ref } from 'vue';
import ConversationPane from '../../../src/components/chat/ConversationPane.vue';
import i18n, { setLocale } from '../../../src/i18n';
import { localConclusion } from '../../fixtures/local-conclusion';
import '../../../src/style.css';
import { useResearchAppearance } from '../../../src/composables/useResearchAppearance';
import { useSidebarLayout } from '../../../src/composables/useSidebarLayout';
import { useIsDark } from '../../../src/composables/useIsDark';
import { researchPolicyCommand } from '../../../src/lib/researchWorkspace';

const snapshot = ref({
  mode: 'ready', loopStatus: 'active', planningPolicy: 'collaborative',
  phase: 'state_updated', revision: 8, questions: [],
  lines: [{ slug: 'spin-check', title: 'Spin representation check', status: 'active', createdAt: 1, revision: 1 }],
  program: { topicId: 'spin-example', title: 'Spin-chain research', goalText: 'Check the representation',
    goalSource: '.aitp/topic/TOPIC.md', establishedAt: 1, observedRevision: 1 },
  lineWorkstreamBindings: [], alerts: [], openQuestionCount: 0,
  activeQuestionCount: 0, blockedQuestionCount: 0, aitpHealth: { phase: 'ready' },
  localConclusion: structuredClone(localConclusion),
  currentAction: structuredClone(localConclusion.action), latestProgress: structuredClone(localConclusion.progress),
});
const sessionId = ref('session-a');
const turns = ref([]);
const sessionLoading = ref(false);
const expandSignal = ref(0);
const previewOpen = ref(false);
const commands = [];
const policyPending = ref(false);
const policyBusy = ref(false);
let failPolicy = false;
let sidebar;
let dark;
const sessions = ref([
  { id: 'session-a', title: 'Spin-chain benchmark', workspace: '/research/spin', line: 'Spin representation check', mode: 'ready', busy: false },
  { id: 'session-b', title: 'QSGW verification', workspace: '/research/gw', line: 'Head-wing comparison', mode: 'ready', busy: true },
  { id: 'session-c', title: 'Unread candidate', workspace: '/research/unread', busy: false },
]);
const sessionSnapshots = new Map([['session-a', snapshot.value], ['session-b', {
  ...snapshot.value, currentLineSlug: 'head-wing', phase: 'gap_analysis',
  lines: [{ slug: 'head-wing', title: 'Head-wing comparison', status: 'active', revision: 1, createdAt: 1 }],
  localConclusion: undefined, currentAction: undefined, latestProgress: undefined,
  program: { ...snapshot.value.program, title: 'GW comparison', topicId: 'gw' },
}]]);
function selectSession(id) {
  commands.push({ select: id });
  sessionSnapshots.set(sessionId.value, snapshot.value);
  sessionId.value = id;
  turns.value = [];
  snapshot.value = sessionSnapshots.get(id) ?? { ...snapshot.value, mode: 'inactive' };
}
async function setPolicy(policy) {
  const command = researchPolicyCommand(snapshot.value, policy, policyBusy.value || policyPending.value);
  if (!command) return;
  const id = sessionId.value;
  commands.push({ id, command });
  policyPending.value = true;
  await new Promise(resolve => setTimeout(resolve, 80));
  if (!failPolicy && id === sessionId.value) {
    snapshot.value.planningPolicy = policy;
    snapshot.value.revision++;
  }
  policyPending.value = false;
}
setLocale('en');
createApp({ setup: () => {
  const active = computed(() => snapshot.value.mode !== 'inactive' && !sessionLoading.value);
  useResearchAppearance(active, () => snapshot.value.planningPolicy);
  sidebar = useSidebarLayout({ researchActive: active });
  sidebar.loadSidebarCollapsed();
  dark = useIsDark();
  return () => h('main', {
  style: 'display:flex;height:100dvh;width:100%;overflow:hidden;',
}, [
  h(ConversationPane, {
    style: 'flex:1;min-width:0;',
    turns: turns.value, sessionId: sessionId.value, sessionLoading: sessionLoading.value,
    research: snapshot.value, researchEnabled: true, researchExpandSignal: expandSignal.value,
    researchSessions: sessions.value, researchPolicyDisabled: policyPending.value || policyBusy.value || snapshot.value.mode !== 'ready',
    onSelectResearchSession: selectSession,
    onBrowseResearchSessions: () => commands.push('browse'),
    onSetResearchPolicy: setPolicy,
    tasks: [], running: true, workspaceName: 'Research fixture',
    status: { model: 'Fixture', modelId: 'fixture', ctxUsed: 0, ctxMax: 100000,
      permission: 'auto', branch: '', cwd: '/fixture', auto: true },
    onInterrupt: () => commands.push('interrupt'),
    onManageResearch: () => commands.push('manage'),
  }),
  previewOpen.value ? h('aside', { class: 'fixture-preview',
    style: 'width:320px;flex:none;background:var(--color-surface);',
  }, 'Existing file preview') : null,
]); } }).use(i18n).mount('#app');
Object.assign(window, { researchPanelHarness: {
  commands,
  sidebar: () => sidebar.sidebarCollapsed.value,
  toggleSidebar: () => sidebar.toggleSidebarCollapse(),
  isDark: () => dark.value,
  policyBusy: value => { policyBusy.value = value; },
  failPolicy: value => { failPolicy = value; },
  theme: (value) => { document.documentElement.dataset.colorScheme = value; },
  locale: setLocale,
  update: async () => {
    snapshot.value.revision++;
    snapshot.value.localConclusion.progress.headline = 'Updated primitive evidence';
    snapshot.value.latestProgress.headline = 'Updated primitive evidence';
    await nextTick();
  },
  conversation: async () => {
    turns.value = [{ id: 'prompt-1', role: 'user', no: 1, text: 'Check the spin representation.' }];
    await nextTick();
  },
  reading: async () => {
    turns.value = [
      { id: 'reading-user', role: 'user', no: 1, text: 'What is the smallest useful test of this candidate symmetry?' },
      { id: 'reading-assistant', role: 'assistant', no: 2, text: '### An explicit, discriminating check\n\nThis is an illustrative UI fixture, not a computed research result. Keep the Hamiltonian, candidate operator and conventions explicit. Start with a small system before assigning physical significance.\n\n$$[H,Q] = HQ - QH$$\n\nCompare the residual against a stated tolerance and a negative control. A vanishing residual in one finite system is not yet a general proof.\n\n```python\nresidual = H @ Q - Q @ H\n```' },
    ];
    await nextTick();
  },
  session: async (value) => { sessionId.value = value; await nextTick(); },
  loading: async (value) => { sessionLoading.value = value; await nextTick(); },
  mode: async (value) => { snapshot.value.mode = value; await nextTick(); },
  reveal: async () => { expandSignal.value++; await nextTick(); },
  preview: async () => { previewOpen.value = true; await nextTick(); },
} });
