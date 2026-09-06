// Full production App + client + navigation; only daemon I/O is substituted.
import { createApp } from 'vue';
import { getKimiWebApi } from '../../../src/api';
import i18n, { setLocale } from '../../../src/i18n';
import '../../../src/style.css';

localStorage.setItem('kimi-web.onboarded', '1');
const calls = [];
const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
  cacheCreationTokens: 0, totalCostUsd: 0, contextTokens: 0, contextLimit: 100000, turnCount: 0 };
const sessions = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id: `session-${id}`, title: `Project ${id.toUpperCase()}`,
  research: { revision: 8, mode: 'ready', line: `Project ${id.toUpperCase()}` },
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  busy: false, archived: false, cwd: `/research/${id}`, workspaceId: `workspace-${id}`,
  model: 'fixture', usage, messageCount: 1, lastSeq: 0 }));
const snapshots = Object.fromEntries(sessions.map((session) => [session.id, {
  mode: 'ready', loopStatus: 'active', planningPolicy: 'collaborative', phase: 'idle', revision: 8,
  questions: [], currentLineSlug: 'test-line',
  lines: [{ slug: 'test-line', title: session.title, status: 'active', createdAt: 1, revision: 1 }],
  lineWorkstreamBindings: [], alerts: [], openQuestionCount: 0, activeQuestionCount: 0,
  blockedQuestionCount: 0, aitpHealth: { phase: 'ready' },
}]));
let failCommand = false;
let eventHandlers;
const api = getKimiWebApi();
Object.assign(api, {
  getAuth: async () => ({ ready: true, defaultModel: 'fixture' }),
  getHealth: async () => ({ status: 'ok' }),
  getMeta: async () => ({ serverVersion: 'fixture', backend: 'v2', openInApps: [], experimentalFlags: {}, dangerousBypassAuth: true }),
  getConfig: async () => ({ defaultModel: 'fixture', providers: {}, models: {}, agent: {}, loopControl: {} }),
  listModels: async () => [{ id: 'fixture', name: 'Fixture', providerId: 'fixture', contextLength: 100000 }],
  listProviders: async () => [], getProviderUsage: async () => [],
  listSkills: async () => [], listSkillsForWorkspace: async () => [],
  listWorkspaces: async () => sessions.map((session) => ({ id: session.workspaceId, root: session.cwd, name: session.title, sessionCount: 1 })),
  getFsHome: async () => ({ home: '/research', recentRoots: [] }),
  listSessions: async (options) => ({ items: structuredClone(sessions.filter(session => !options?.workspaceId || session.workspaceId === options.workspaceId)), hasMore: false }),
  getSession: async (id) => { calls.push({ overviewRead: id }); return structuredClone(sessions.find(session => session.id === id)); },
  getSessionSnapshot: async (id) => {
    calls.push({ snapshot: id });
    await new Promise(resolve => setTimeout(resolve, 120));
    return { asOfSeq: 0, epoch: 'fixture', session: sessions.find(session => session.id === id),
      messages: [{ id: `${id}-message`, sessionId: id, role: 'user', content: [{ type: 'text', text: `Conversation for ${id}` }], createdAt: '2026-09-01T00:00:00Z' }],
      hasMoreMessages: false, inFlightTurn: null, subagents: [], pendingApprovals: [], pendingQuestions: [] };
  },
  getSessionStatus: async () => ({ model: 'fixture', thinkingEffort: 'high', permission: 'auto', planMode: false,
    swarmMode: false, contextTokens: 0, maxContextTokens: 100000, contextUsage: 0 }),
  getSessionGoal: async () => null,
  getSessionResearch: async (id) => { calls.push({ researchRead: id }); return structuredClone(snapshots[id]); },
  commandSessionResearch: async (id, command) => {
    calls.push({ id, command });
    await new Promise(resolve => setTimeout(resolve, 150));
    if (failCommand) throw Error('Fixture command rejected');
    if (command.kind === 'enter_mode') snapshots[id].mode = 'ready';
    if (command.kind === 'exit_mode') snapshots[id].mode = 'inactive';
    snapshots[id].revision++;
    sessions.find(session => session.id === id).research = {
      revision: snapshots[id].revision, mode: snapshots[id].mode, line: sessions.find(session => session.id === id).title,
    };
    return structuredClone(snapshots[id]);
  },
  getSessionWarnings: async () => [], getGitStatus: async () => null,
  getAutoSubagentPresetStatus: async () => null,
  listTasks: async () => ({ items: [], hasMore: false }),
  connectEvents: (handlers) => {
    eventHandlers = handlers;
    queueMicrotask(() => handlers.onConnectionChange(true));
    return { subscribe() {}, unsubscribe() {}, close() {}, bindNextPromptId() {}, seedSnapshot() {}, seedSessionState() {}, clearSessionState() {}, health: () => ({ stale: false }), reconnect() {} };
  },
});
setLocale('en');
const { default: App } = await import('../../../src/App.vue');
const { useKimiWebClient } = await import('../../../src/composables/useKimiWebClient');
const client = useKimiWebClient();
client.setOnboarded(true);
Object.assign(window, { researchAppHarness: { calls, failCommand: (value) => { failCommand = value; },
  backgroundWork: () => {
    const session = sessions.find(s => s.id === 'session-f');
    session.research = { revision: 9, mode: 'degraded', line: 'Project F updated' };
    eventHandlers.onEvent({ type: 'sessionWorkChanged', sessionId: session.id, busy: true, mainTurnActive: true }, { sessionId: session.id, seq: 1 });
  },
  activeSession: () => client.activeSessionId.value, locale: setLocale,
  state: () => ({ loading: client.sessionLoading.value, mode: client.research.value?.mode }),
} });
createApp(App).use(i18n).mount('#app');
