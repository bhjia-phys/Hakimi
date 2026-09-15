import { createApp, h, ref } from 'vue';

import { getKimiWebApi } from '../../../src/api';
import type { AppConfig, AppModel } from '../../../src/api/types';
import SettingsDialog from '../../../src/components/settings/SettingsDialog.vue';
import { i18n, setLocale } from '../../../src/i18n';
import '../../../src/style.css';

const catalog: AppModel[] = [
  {
    id: 'example/effort-model', provider: 'example', model: 'effort-model',
    maxContextSize: 128_000, capabilities: ['thinking'],
    supportEfforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'high',
  },
  {
    id: 'example/other-model', provider: 'example', model: 'other-model',
    maxContextSize: 128_000, capabilities: ['thinking'],
    supportEfforts: ['low', 'high', 'max'], defaultEffort: 'high',
  },
  {
    id: 'example/always-on', provider: 'example', model: 'always-on',
    maxContextSize: 128_000, capabilities: ['always_thinking'],
    supportEfforts: ['max'], defaultEffort: 'max',
  },
  {
    id: 'example/boolean-model', provider: 'example', model: 'boolean-model',
    maxContextSize: 128_000, capabilities: ['thinking'],
  },
  {
    id: 'example/no-thinking', provider: 'example', model: 'no-thinking',
    maxContextSize: 128_000, capabilities: [],
  },
];
const models = ref(catalog);
const api = getKimiWebApi();
const config = ref<AppConfig>();
const saving = ref(false);
const saveError = ref<string>();
const open = ref(true);

async function readConfig(): Promise<void> {
  config.value = await api.getConfig();
}

async function save(patch: Partial<AppConfig>): Promise<void> {
  saving.value = true;
  saveError.value = undefined;
  try {
    config.value = await api.setConfig(patch);
  } catch (error) {
    saveError.value = String(error);
  } finally {
    saving.value = false;
  }
}

Object.assign(window, {
  defaultThinkingHarness: {
    readConfig,
    get config() { return config.value; },
    get saving() { return saving.value; },
    get saveError() { return saveError.value; },
    reopen() { open.value = true; },
    modelsLoaded(loaded: boolean) { models.value = loaded ? catalog : []; },
    theme(value: 'light' | 'dark') { document.documentElement.dataset.colorScheme = value; },
    locale: setLocale,
  },
});

await readConfig();
createApp({
  render: () => open.value ? h(SettingsDialog, {
    colorScheme: 'light', accent: 'blue', uiFontSize: 14, authReady: true,
    notify: false, notifyQuestion: false, notifyApproval: false, sound: false,
    config: config.value, models: models.value, configSaving: saving.value,
    onUpdateConfig: save,
    onClose: () => { open.value = false; },
  }) : null,
}).use(i18n).mount('#app');
