// apps/kimi-web/test/index-html.test.ts
// CSP regression guard: kap-server serves the built bundle with
// `Content-Security-Policy: default-src 'self'; …` (see securityHeaders.ts),
// which forbids inline scripts and inline event handlers. index.html must
// therefore stay free of both, and the anti-FOUC color-scheme bootstrap must
// load from the external /boot.js.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  assertCanonicalViteEnvironment,
  CANONICAL_VITE_ENVIRONMENT,
  canonicalViteEnvDir,
} from '../vite.config';

const indexHtml = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf-8');
const bootJsPath = fileURLToPath(new URL('../public/boot.js', import.meta.url));
const chatHeader = readFileSync(
  fileURLToPath(new URL('../src/components/chat/ChatHeader.vue', import.meta.url)),
  'utf-8',
);
const settingsDialog = readFileSync(
  fileURLToPath(new URL('../src/components/settings/SettingsDialog.vue', import.meta.url)),
  'utf-8',
);
const appView = readFileSync(
  fileURLToPath(new URL('../src/App.vue', import.meta.url)),
  'utf-8',
);
const conversationPane = readFileSync(
  fileURLToPath(new URL('../src/components/chat/ConversationPane.vue', import.meta.url)),
  'utf-8',
);
const webClient = readFileSync(
  fileURLToPath(new URL('../src/composables/useKimiWebClient.ts', import.meta.url)),
  'utf-8',
);

describe('index.html CSP hygiene', () => {
  it('has no <script> tag without a src attribute', () => {
    const scriptTags = indexHtml.match(/<script\b[^>]*>/gi) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) {
      expect(tag).toMatch(/\bsrc\s*=/);
    }
  });

  it('has no inline event-handler attributes', () => {
    expect(indexHtml).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('loads the anti-FOUC bootstrap from the external /boot.js', () => {
    expect(indexHtml).toContain('<script src="/boot.js"></script>');
    expect(existsSync(bootJsPath)).toBe(true);
  });
});

describe('canonical Vite environment', () => {
  const canonicalEnv = {
    KIMI_WEB_CANONICAL_BUILD: '1',
    ...CANONICAL_VITE_ENVIRONMENT,
  };

  it('disables workspace env files and accepts only fixed canonical values', () => {
    expect(assertCanonicalViteEnvironment(canonicalEnv)).toBe(true);
    expect(canonicalViteEnvDir(canonicalEnv)).toBe(false);
    expect(canonicalViteEnvDir({})).toBeUndefined();
  });

  it('rejects extra VITE variables and overridden canonical values', () => {
    expect(() =>
      assertCanonicalViteEnvironment({ ...canonicalEnv, VITE_POISONED: 'leak' }),
    ).toThrow(/unexpected environment variable VITE_POISONED/);
    expect(() =>
      assertCanonicalViteEnvironment({ ...canonicalEnv, KIMI_WEB_DESKTOP: '1' }),
    ).toThrow(/requires KIMI_WEB_DESKTOP="0"/);
  });
});

describe('ChatHeader Git summary container', () => {
  it('uses the remaining Git region as the summary card container', () => {
    expect(chatHeader).toMatch(
      /<div class="ch-git-region">[\s\S]*?<GitSummaryCard[\s\S]*?\/>\s*<\/div>/,
    );
    expect(chatHeader).not.toContain('ch-spacer');

    const regionStyle = /\.ch-git-region\s*\{([^}]*)\}/.exec(chatHeader)?.[1];
    expect(regionStyle).toContain('flex: 1 1 0;');
    expect(regionStyle).toContain('min-width: 0;');
    expect(regionStyle).toContain('justify-content: flex-end;');
    expect(regionStyle).toContain('container-type: inline-size;');
  });
});

describe('ChatHeader Preset selector', () => {
  it('uses the design-system button and menu for manual routing changes', () => {
    expect(chatHeader).toContain('class="ch-preset-button"');
    expect(chatHeader).toContain('aria-haspopup="menu"');
    expect(chatHeader).toContain('class="ch-preset-menu"');
    expect(chatHeader).toContain('@click="choosePreset(\'\')"');
    expect(chatHeader).toContain('v-for="preset in subagentPresetNames"');
    expect(chatHeader).toContain('role="menuitemradio"');
    expect(chatHeader).toContain('@keydown="onPresetMenuKeydown"');
    expect(chatHeader).toContain("document.addEventListener('keydown', onMenuEscape, true)");
    expect(chatHeader).toContain('max-height: calc(100vh - (2 * var(--space-4)));');
    expect(chatHeader).toContain("emit('activatePreset', preset)");
    expect(chatHeader).toContain('v-if="subagentPresetLocked" class="ch-preset-diagnostics is-locked"');
    expect(chatHeader).toContain('v-else-if="presetDiagnosticsVisible"');
    expect(chatHeader).toContain('presetCandidateSummaryFor(preset)');
    // Streaming auto-scroll must not dismiss an open Preset menu; only the
    // menu's own scroll region and a viewport resize may.
    expect(chatHeader).toContain("if (e.type === 'scroll') return;");
    expect(chatHeader).not.toContain('ch-preset-badge');
  });

  it('receives the latest status through App and ConversationPane', () => {
    expect(appView).toContain(':auto-subagent-preset-status="client.autoSubagentPresetStatus.value"');
    expect(conversationPane).toContain(':auto-subagent-preset-status="autoSubagentPresetStatus"');
    expect(chatHeader).toContain('autoSubagentPresetStatus?: AutoSubagentPresetStatus');
  });
});

describe('Settings Agent automatic Preset switch', () => {
  it('uses one design-system switch for both runtime gates', () => {
    expect(settingsDialog).toContain('v-if="automaticPresetSwitchingSupported"');
    expect(settingsDialog).toContain(':model-value="automaticPresetSwitching"');
    expect(settingsDialog).toContain(':disabled="configSaving"');
    expect(settingsDialog).toContain('@update:model-value="setAutomaticPresetSwitching"');
    expect(settingsDialog).toContain("emit('updateConfig', autoSubagentPresetPatch(enabled))");
  });

  it('uses design-system primitives for read-only scheduler diagnostics', () => {
    expect(settingsDialog).toContain('<Card');
    expect(settingsDialog).toContain("t('settings.smartRoutingStatus')");
    expect(settingsDialog).toContain('<Banner v-if="presetManualLocked" variant="warning">');
    expect(settingsDialog).toContain('v-for="candidate in autoSubagentPresetStatus.candidates"');
    expect(settingsDialog).toContain('schedulerPolicyEntries');
  });
});

describe('automatic Preset status reconciliation', () => {
  it('re-reads the process-global snapshot after every successful connection', () => {
    expect(webClient).toContain('async function refreshAutoSubagentPresetStatus()');
    expect(webClient).toMatch(
      /if \(connected\)[\s\S]*?void refreshAutoSubagentPresetStatus\(\)/,
    );
  });
});
