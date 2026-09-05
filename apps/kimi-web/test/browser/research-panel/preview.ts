import { createApp, h, nextTick, ref } from 'vue';
import ConversationPane from '../../../src/components/chat/ConversationPane.vue';
import i18n, { setLocale } from '../../../src/i18n';
import { localConclusion } from '../../fixtures/local-conclusion';
import '../../../src/style.css';

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
setLocale('en');
createApp({ setup: () => () => h('main', {
  style: 'display:flex;height:100dvh;width:100%;overflow:hidden;',
}, [
  h(ConversationPane, {
    style: 'flex:1;min-width:0;',
    turns: turns.value, sessionId: sessionId.value, sessionLoading: sessionLoading.value,
    research: snapshot.value, researchEnabled: true, researchExpandSignal: expandSignal.value,
    tasks: [], running: true, workspaceName: 'Research fixture',
    status: { model: 'Fixture', modelId: 'fixture', ctxUsed: 0, ctxMax: 100000,
      permission: 'auto', branch: '', cwd: '/fixture', auto: true },
    onInterrupt: () => commands.push('interrupt'),
    onManageResearch: () => commands.push('manage'),
  }),
  previewOpen.value ? h('aside', { class: 'fixture-preview',
    style: 'width:320px;flex:none;background:var(--color-surface);',
  }, 'Existing file preview') : null,
]) }).use(i18n).mount('#app');
Object.assign(window, { researchPanelHarness: {
  commands,
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
  session: async (value) => { sessionId.value = value; await nextTick(); },
  loading: async (value) => { sessionLoading.value = value; await nextTick(); },
  mode: async (value) => { snapshot.value.mode = value; await nextTick(); },
  reveal: async () => { expandSignal.value++; await nextTick(); },
  preview: async () => { previewOpen.value = true; await nextTick(); },
} });
